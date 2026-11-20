import { CACHE_TTL } from "../domain/constants";
import { cached, cacheKey } from "./cache";
import {
  findMeetingPoints,
  NoReachablePointError,
  ValidationError,
  type FindMeetingPointsResult,
} from "./findMeetingPoints";
import {
  createOrsClient,
  type GeoMultiPolygon,
  type GeoPolygon,
  type OrsClient,
  type OrsClientOptions,
} from "./ors/client";
import { OrsError } from "./ors/errors";
import { checkRateLimit, clientIdFromHeaders, type RateLimiterLike } from "./rateLimit";
import { parseFindInput, parseGeocodeQuery, parseIsochroneInput } from "./validate";

/**
 * Logic behind the "use server" functions in actions.ts, with every
 * dependency injected so it can be tested without the rwsdk request context.
 *
 * Order for every action: validate (cheap, pure) -> rate limit -> API key ->
 * construct ORS client -> cache / ORS. Nothing touches KV or ORS before the
 * rate check passes. Errors are returned as values, never thrown.
 */

export type ActionErrorCode =
  | "validation"
  | "rate_limited"
  | "no_reachable_point"
  | "quota"
  | "upstream"
  | "not_found";

export interface ActionError {
  code: ActionErrorCode;
  message: string;
  retryAfterSeconds?: number;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

/** The server-side Worker env this module reads. ORS_API_KEY is a secret, never a var. */
export interface ServerEnv {
  CACHE: KVNamespace;
  ORS_API_KEY?: string;
  /** Optional, non-secret override of the ORS base URL (e2e / local mocks). */
  ORS_BASE_URL?: string;
  FIND_RATE_LIMITER?: RateLimiterLike;
  ISOCHRONE_RATE_LIMITER?: RateLimiterLike;
  GEOCODE_RATE_LIMITER?: RateLimiterLike;
}

export interface ActionDeps {
  env: ServerEnv;
  headers: Headers;
  createOrs?: (opts: OrsClientOptions) => OrsClient;
}

export interface GeocodeResult {
  coordinate: { lat: number; lng: number };
  label: string;
}

const MESSAGES = {
  rate_limited: "Too many requests. Please wait a moment and try again.",
  quota: "The routing service's usage quota is used up for now. Please try again later.",
  config: "The routing service is unavailable right now because of a server configuration problem.",
  rejected: "The routing service could not process this request.",
  outage: "The routing service is unavailable right now. Please try again in a moment.",
  not_found: "No matching places found. Try a more specific address.",
  unexpected: "Something went wrong while contacting the routing service. Please try again.",
} as const;

class GeocodeNotFound extends Error {}

function redact(text: string, secret: string | undefined): string {
  return secret ? text.split(secret).join("[redacted]") : text;
}

function logError(context: string, e: unknown, secret: string | undefined): void {
  const detail = e instanceof Error ? `${e.name}: ${e.message}` : `non-Error thrown (${typeof e})`;
  console.error(`[actions] ${context}: ${redact(detail, secret)}`);
}

/**
 * Map any thrown value to a human-readable, non-leaky ActionError. Only our
 * own ValidationError / NoReachablePointError messages reach the client;
 * upstream and unknown errors get fixed messages and are logged server-side
 * (with `secret` redacted, never request headers).
 */
export function toActionError(e: unknown, secret?: string): ActionError {
  if (e instanceof ValidationError) return { code: "validation", message: e.message };
  if (e instanceof NoReachablePointError) return { code: "no_reachable_point", message: e.message };
  if (e instanceof GeocodeNotFound) return { code: "not_found", message: MESSAGES.not_found };
  if (e instanceof OrsError) {
    switch (e.kind) {
      case "rate_limited":
        return e.retryAfterSeconds !== undefined
          ? { code: "quota", message: MESSAGES.quota, retryAfterSeconds: e.retryAfterSeconds }
          : { code: "quota", message: MESSAGES.quota };
      case "unauthorized":
        logError("ORS rejected the API key (check the ORS_API_KEY secret)", e, secret);
        return { code: "upstream", message: MESSAGES.config };
      case "bad_request":
        logError("ORS rejected the request", e, secret);
        return { code: "upstream", message: MESSAGES.rejected };
      case "not_found":
        return { code: "not_found", message: MESSAGES.not_found };
      case "upstream":
        logError("ORS upstream failure", e, secret);
        return { code: "upstream", message: MESSAGES.outage };
    }
  }
  logError("unexpected error", e, secret);
  return { code: "upstream", message: MESSAGES.unexpected };
}

async function run<T>(
  deps: ActionDeps,
  limiter: RateLimiterLike | undefined,
  parse: () => void,
  body: (ors: OrsClient) => Promise<T>,
): Promise<ActionResult<T>> {
  const secret = deps.env.ORS_API_KEY;
  try {
    parse();
    const rl = await checkRateLimit(limiter, clientIdFromHeaders(deps.headers));
    if (!rl.allowed) {
      return {
        ok: false,
        error: { code: "rate_limited", message: MESSAGES.rate_limited, retryAfterSeconds: rl.retryAfterSeconds },
      };
    }
    if (!secret) {
      console.error("[actions] ORS_API_KEY secret is not configured for this Worker");
      return { ok: false, error: { code: "upstream", message: MESSAGES.config } };
    }
    const create = deps.createOrs ?? createOrsClient;
    const baseUrl = deps.env.ORS_BASE_URL;
    const ors = create(baseUrl ? { apiKey: secret, baseUrl } : { apiKey: secret });
    return { ok: true, data: await body(ors) };
  } catch (e) {
    return { ok: false, error: toActionError(e, secret) };
  }
}

const isGeometry = (v: unknown): v is GeoPolygon | GeoMultiPolygon =>
  typeof v === "object" &&
  v !== null &&
  ((v as { type?: unknown }).type === "Polygon" || (v as { type?: unknown }).type === "MultiPolygon") &&
  Array.isArray((v as { coordinates?: unknown }).coordinates);

const isGeocodeResults = (v: unknown): v is GeocodeResult[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every(
    (r) =>
      typeof r?.label === "string" &&
      Number.isFinite(r?.coordinate?.lat) &&
      Number.isFinite(r?.coordinate?.lng),
  );

export function handleFindMeetingPoints(
  input: unknown,
  deps: ActionDeps,
): Promise<ActionResult<FindMeetingPointsResult>> {
  let parsed!: ReturnType<typeof parseFindInput>;
  return run(
    deps,
    deps.env.FIND_RATE_LIMITER,
    () => {
      parsed = parseFindInput(input);
    },
    (ors) => findMeetingPoints(parsed, { ors, kv: deps.env.CACHE }),
  );
}

export function handleIsochrone(
  input: unknown,
  deps: ActionDeps,
): Promise<ActionResult<{ geometry: GeoPolygon | GeoMultiPolygon }>> {
  let p!: ReturnType<typeof parseIsochroneInput>;
  return run(
    deps,
    deps.env.ISOCHRONE_RATE_LIMITER,
    () => {
      p = parseIsochroneInput(input);
    },
    async (ors) => {
      const key = await cacheKey("isochrone", [p.center, p.minutes, p.mode]);
      const geometry = await cached(
        deps.env.CACHE,
        key,
        CACHE_TTL.ISOCHRONE_SECONDS,
        () => ors.isochrone(p.center, p.minutes, p.mode),
        isGeometry,
      );
      return { geometry };
    },
  );
}

export function handleGeocode(
  query: unknown,
  deps: ActionDeps,
): Promise<ActionResult<{ results: GeocodeResult[] }>> {
  let q!: string;
  return run(
    deps,
    deps.env.GEOCODE_RATE_LIMITER,
    () => {
      q = parseGeocodeQuery(query);
    },
    async (ors) => {
      // Geocoding is case-insensitive, so the cache key folds case; ORS gets
      // the trimmed, whitespace-collapsed query.
      const key = await cacheKey("geocode", [q.toLowerCase()]);
      const results = await cached(
        deps.env.CACHE,
        key,
        CACHE_TTL.GEOCODE_SECONDS,
        async () => {
          const r = await ors.geocode(q);
          // Throwing keeps "no results" out of the cache (only successes are cached).
          if (r.length === 0) throw new GeocodeNotFound();
          return r;
        },
        isGeocodeResults,
      );
      return { results };
    },
  );
}
