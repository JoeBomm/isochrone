/**
 * Local OpenRouteService stub for the e2e suite. It is a real HTTP server: the
 * dev Worker reaches it through `ORS_BASE_URL`, so the app's own ORS client
 * (src/server/ors/client.ts), caching and error mapping all run unchanged.
 *
 * Endpoints (request and response shapes as the client sends and parses them):
 *   POST /v2/matrix/{profile}      { locations: [lng, lat][], sources, destinations, metrics: ["duration"] }
 *                                  -> { durations: (seconds | null)[sources][destinations] }
 *   POST /v2/isochrones/{profile}  { locations: [[lng, lat]], range: [seconds], range_type: "time", smoothing }
 *                                  -> GeoJSON FeatureCollection, features[0].geometry is a Polygon
 *   GET  /geocode/search?text=&size=&layers=
 *                                  -> GeoJSON FeatureCollection of Points with properties.label
 *
 * Key-in-header guard: every ORS request must carry `Authorization: <key>`
 * (the bare key, as the client sends it) and must NOT carry an `api_key`
 * query parameter. Anything else is answered with 401 and recorded as a
 * violation. A 401 reaches the UI as the "configuration problem" error, so the
 * happy-path tests fail too; the spec also asserts that no violation was
 * recorded. Malformed request bodies get 400 and are recorded the same way,
 * including a [lat, lng] swap (every matrix source must be a known place in
 * [lng, lat] order).
 *
 * Scenarios are chosen by the places the test picks, not by shared mutable
 * state, so parallel tests can't interfere and a cached matrix in the Worker's
 * KV still means the same thing:
 *   - "normal" places -> durations from distance and a per-mode speed.
 *   - "quota" places  -> matrix answers 429 with Retry-After (the app maps an
 *                        ORS 429 to its 'quota' error).
 *   - "island" places -> matrix answers 200 with every duration null (the app's
 *                        'no_reachable_point' error).
 * A matrix request uses the scenario of its first non-normal source.
 *
 * Control endpoint (not part of ORS): GET /__stats -> request counts and the
 * list of violations.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export type Scenario = "normal" | "quota" | "island";

export interface StubPlace {
  label: string;
  lat: number;
  lng: number;
  scenario: Scenario;
}

/** Everything the stub geocoder knows. Queries match by case-insensitive substring. */
export const PLACES: readonly StubPlace[] = [
  { label: "Carrow Road, Norwich, England", lat: 52.622, lng: 1.309, scenario: "normal" },
  { label: "Mill Lane, Cambridge, England", lat: 52.2, lng: 0.12, scenario: "normal" },
  { label: "Station Road, Ipswich, England", lat: 52.051, lng: 1.144, scenario: "normal" },
  { label: "Market Place, Thetford, England", lat: 52.413, lng: 0.749, scenario: "normal" },
  // Far from the normal places (and each other), so their matrices never share cache keys.
  { label: "Quota Quay, Limitford", lat: 51.0, lng: -30.0, scenario: "quota" },
  { label: "Quota Row, Limitford", lat: 51.03, lng: -30.06, scenario: "quota" },
  { label: "Lighthouse Rock, Isle of Nowhere", lat: 49.0, lng: -40.0, scenario: "island" },
  { label: "Harbour Steps, Isle of Elsewhere", lat: 49.4, lng: -39.2, scenario: "island" },
];

export const QUOTA_RETRY_AFTER_SECONDS = 3600;

const SPEED_KMH: Record<string, number> = {
  "driving-car": 55,
  "cycling-regular": 16,
  "foot-walking": 5,
};
const MAX_ROUTES = 3500;

export interface StubStats {
  matrix: number;
  isochrone: number;
  geocode: number;
  violations: string[];
}

export interface OrsStub {
  url: string;
  stats: StubStats;
  close(): Promise<void>;
}

type LngLat = [number, number];

const isLngLat = (v: unknown): v is LngLat =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));

const isIndexList = (v: unknown, max: number): v is number[] =>
  Array.isArray(v) && v.length > 0 && v.every((n) => Number.isInteger(n) && n >= 0 && n < max);

function km([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Deterministic "road factor" per pair, so rankings are not just straight-line distance. */
const roadFactor = (a: LngLat, b: LngLat) => 1.25 + Math.abs(Math.sin(a[0] * 913 + b[1] * 377 + a[1] * 71)) * 0.35;

/** The place at exactly this [lng, lat] (as the geocoder returned it), if any. */
const placeAt = ([lng, lat]: LngLat) =>
  PLACES.find((p) => Math.abs(p.lng - lng) < 1e-9 && Math.abs(p.lat - lat) < 1e-9);

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : undefined);
      } catch {
        resolve(undefined);
      }
    });
  });
}

function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function isochroneRing(center: LngLat, seconds: number, kmh: number): LngLat[] {
  const [lng, lat] = center;
  const radiusKm = (kmh * (seconds / 3600)) / 1.35;
  const ring: LngLat[] = [];
  for (let i = 0; i < 28; i += 1) {
    const t = (i / 28) * 2 * Math.PI;
    const wobble = 0.65 + 0.35 * Math.abs(Math.sin(t * 3 + lat)) + 0.15 * Math.cos(t * 5 + lng);
    const rk = radiusKm * wobble;
    ring.push([
      lng + (rk / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(t),
      lat + (rk / 110.57) * Math.sin(t),
    ]);
  }
  ring.push(ring[0]);
  return ring;
}

export async function startOrsStub(opts: { apiKey: string; port: number; host?: string }): Promise<OrsStub> {
  const stats: StubStats = { matrix: 0, isochrone: 0, geocode: 0, violations: [] };
  const reject = (res: http.ServerResponse, status: number, why: string) => {
    stats.violations.push(why);
    console.error(`[ors-stub] ${status}: ${why}`);
    send(res, status, { error: { code: status, message: why } });
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://stub.invalid");

    if (url.pathname === "/__stats" && req.method === "GET") return send(res, 200, stats);

    // Key-in-header rule. Never echo the received values (they'd be the key).
    if (url.searchParams.has("api_key")) {
      return reject(res, 401, `${req.method} ${url.pathname}: api_key query parameter used`);
    }
    const auth = req.headers.authorization;
    if (auth === undefined) return reject(res, 401, `${req.method} ${url.pathname}: Authorization header missing`);
    if (auth !== opts.apiKey) {
      return reject(res, 401, `${req.method} ${url.pathname}: Authorization header is not the bare test key`);
    }

    const ors = /^\/v2\/(matrix|isochrones)\/([a-z-]+)$/.exec(url.pathname);
    if (ors && req.method === "POST") {
      const [, kind, profile] = ors;
      const kmh = SPEED_KMH[profile];
      if (!kmh) return reject(res, 400, `${kind}: unknown profile ${profile}`);
      const body = (await readJson(req)) as Record<string, unknown> | undefined;

      if (kind === "matrix") {
        stats.matrix += 1;
        const locations = body?.locations;
        if (!Array.isArray(locations) || !locations.every(isLngLat)) {
          return reject(res, 400, "matrix: locations must be [lng, lat] pairs");
        }
        const { sources, destinations, metrics } = body as Record<string, unknown>;
        if (!isIndexList(sources, locations.length) || !isIndexList(destinations, locations.length)) {
          return reject(res, 400, "matrix: sources/destinations must be index lists into locations");
        }
        if (JSON.stringify(metrics) !== JSON.stringify(["duration"])) {
          return reject(res, 400, 'matrix: metrics must be ["duration"]');
        }
        if (sources.length * destinations.length > MAX_ROUTES) {
          return reject(res, 400, `matrix: more than ${MAX_ROUTES} routes`);
        }
        const sourcePlaces = sources.map((i) => placeAt(locations[i]));
        if (sourcePlaces.some((p) => p === undefined)) {
          return reject(res, 400, "matrix: a source is not a geocoded place in [lng, lat] order");
        }
        const scenario = sourcePlaces.find((p) => p!.scenario !== "normal")?.scenario ?? "normal";
        if (scenario === "quota") {
          return send(
            res,
            429,
            { error: { code: 6099, message: "Quota exceeded" } },
            { "retry-after": String(QUOTA_RETRY_AFTER_SECONDS) },
          );
        }
        const durations = sources.map((si) =>
          destinations.map((di) => {
            if (scenario === "island") return null;
            const a = locations[si];
            const d = locations[di];
            return Math.round(((km(a, d) * roadFactor(a, d)) / kmh) * 3600 + 120);
          }),
        );
        return send(res, 200, { durations, metadata: { service: "matrix", stub: true } });
      }

      stats.isochrone += 1;
      const { locations, range, range_type: rangeType } = body ?? {};
      if (!Array.isArray(locations) || locations.length !== 1 || !isLngLat(locations[0])) {
        return reject(res, 400, "isochrones: locations must be one [lng, lat] pair");
      }
      if (!Array.isArray(range) || range.length !== 1 || typeof range[0] !== "number" || range[0] <= 0) {
        return reject(res, 400, "isochrones: range must be [seconds]");
      }
      if (rangeType !== "time") return reject(res, 400, 'isochrones: range_type must be "time"');
      return send(res, 200, {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { group_index: 0, value: range[0] },
            geometry: { type: "Polygon", coordinates: [isochroneRing(locations[0], range[0], kmh)] },
          },
        ],
      });
    }

    if (url.pathname === "/geocode/search" && req.method === "GET") {
      stats.geocode += 1;
      const text = url.searchParams.get("text")?.trim().toLowerCase();
      if (!text) return reject(res, 400, "geocode: text is required");
      const size = Number(url.searchParams.get("size") ?? 10);
      const features = PLACES.filter((p) => p.label.toLowerCase().includes(text))
        .slice(0, size)
        .map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          properties: { label: p.label },
        }));
      return send(res, 200, { type: "FeatureCollection", features });
    }

    return reject(res, 404, `unexpected request ${req.method} ${url.pathname}`);
  });

  const host = opts.host ?? "127.0.0.1";
  await new Promise<void>((resolve, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(opts.port, host, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://${host}:${port}`,
    stats,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
