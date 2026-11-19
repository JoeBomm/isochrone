import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import type { Coordinate } from "../domain/types";
import {
  handleFindMeetingPoints,
  handleGeocode,
  handleIsochrone,
  type ActionDeps,
  type ServerEnv,
} from "./actionHandlers";
import { cacheKey } from "./cache";
import type { OrsClient } from "./ors/client";
import { OrsError } from "./ors/errors";
import { checkRateLimit, RATE_LIMIT_PERIOD_SECONDS, RATE_LIMITS } from "./rateLimit";

// Runs in workerd against the built worker's wrangler config: real KV
// namespace and real (Miniflare-simulated) Rate Limiting bindings. ORS is
// always a fake; no network calls.

const A = { lat: 52.52, lng: 13.405 };
const B = { lat: 52.5, lng: 13.3 };
const POLY = { type: "Polygon" as const, coordinates: [[[13.4, 52.5], [13.5, 52.5], [13.4, 52.6], [13.4, 52.5]]] };
// Mirrors of wrangler.jsonc's simple.limit (rateLimit.test.ts checks they match).
const FIND_LIMIT = RATE_LIMITS.find;
const ISOCHRONE_LIMIT = RATE_LIMITS.isochrone;
const GEOCODE_LIMIT = RATE_LIMITS.geocode;

function fakeOrs() {
  const matrix = vi.fn(async (o: Coordinate[], d: Coordinate[]) => o.map((_, i) => d.map((_, j) => 60 * (i + j + 1))));
  const isochrone = vi.fn(async () => POLY);
  const geocode = vi.fn(async () => [{ coordinate: A, label: "Berlin" }]);
  return { ors: { matrix, isochrone, geocode } as unknown as OrsClient, matrix, isochrone, geocode };
}

function deps(ip: string, withKey = true) {
  const f = fakeOrs();
  const serverEnv: ServerEnv = {
    CACHE: env.CACHE,
    FIND_RATE_LIMITER: env.FIND_RATE_LIMITER,
    ISOCHRONE_RATE_LIMITER: env.ISOCHRONE_RATE_LIMITER,
    GEOCODE_RATE_LIMITER: env.GEOCODE_RATE_LIMITER,
    ORS_API_KEY: withKey ? "test-key" : undefined,
  };
  const createOrs = vi.fn(() => f.ors);
  const d: ActionDeps = { env: serverEnv, headers: new Headers({ "CF-Connecting-IP": ip }), createOrs };
  return { ...f, d, createOrs };
}

describe("Rate Limiting bindings (workerd)", () => {
  it("are bound from wrangler.jsonc", () => {
    expect(typeof env.FIND_RATE_LIMITER.limit).toBe("function");
    expect(typeof env.ISOCHRONE_RATE_LIMITER.limit).toBe("function");
    expect(typeof env.GEOCODE_RATE_LIMITER.limit).toBe("function");
  });

  it.each([
    ["FIND_RATE_LIMITER", FIND_LIMIT],
    ["ISOCHRONE_RATE_LIMITER", ISOCHRONE_LIMIT],
    ["GEOCODE_RATE_LIMITER", GEOCODE_LIMIT],
  ] as const)("%s denies the (N+1)th request in the window (N = %i) with retryAfterSeconds, per client", async (name, n) => {
    const limiter = env[name];
    for (let i = 0; i < n; i++) {
      expect(await checkRateLimit(limiter, `rl-${name}-1`)).toEqual({ allowed: true });
    }
    expect(await checkRateLimit(limiter, `rl-${name}-1`)).toEqual({
      allowed: false,
      retryAfterSeconds: RATE_LIMIT_PERIOD_SECONDS,
    });
    expect(await checkRateLimit(limiter, `rl-${name}-2`)).toEqual({ allowed: true });
  });
});

describe("handlers with real bindings", () => {
  it("findMeetingPoints: once the real limiter is exhausted, no ORS client is constructed", async () => {
    const s = deps("192.0.2.10");
    for (let i = 0; i < FIND_LIMIT; i++) {
      expect((await handleFindMeetingPoints({ participants: [A, B] }, s.d)).ok).toBe(true);
    }
    expect(s.matrix).toHaveBeenCalledTimes(1); // the rest were real-KV cache hits
    const constructed = s.createOrs.mock.calls.length;
    const r = await handleFindMeetingPoints({ participants: [A, B] }, s.d);
    expect(r).toEqual({
      ok: false,
      error: { code: "rate_limited", message: expect.any(String), retryAfterSeconds: RATE_LIMIT_PERIOD_SECONDS },
    });
    expect(s.createOrs.mock.calls.length).toBe(constructed);
  });

  it("isochrone: caches successes in real KV, never failures", async () => {
    const s = deps("192.0.2.20");
    const input = { center: A, minutes: 20, mode: "cycling-regular" };
    const key = await cacheKey("isochrone", [A, 20, "cycling-regular"]);

    s.isochrone.mockRejectedValueOnce(new OrsError("rate_limited", "429", 5));
    const failed = await handleIsochrone(input, s.d);
    expect(failed).toEqual({
      ok: false,
      error: { code: "quota", message: expect.any(String), retryAfterSeconds: 5 },
    });
    expect(await env.CACHE.get(key)).toBeNull();

    expect(await handleIsochrone(input, s.d)).toEqual({ ok: true, data: { geometry: POLY } });
    expect(JSON.parse((await env.CACHE.get(key))!)).toEqual({ v: POLY });
    await handleIsochrone(input, s.d);
    expect(s.isochrone).toHaveBeenCalledTimes(2);
  });

  it("geocode: caches by normalized query in real KV; zero results are not cached", async () => {
    const s = deps("192.0.2.30");
    s.geocode.mockResolvedValueOnce([]);
    const miss = await handleGeocode("Nowhere Town", s.d);
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.error.code).toBe("not_found");
    expect(await env.CACHE.get(await cacheKey("geocode", ["nowhere town"]))).toBeNull();

    expect((await handleGeocode(" Berlin ", s.d)).ok).toBe(true);
    expect((await handleGeocode("BERLIN", s.d)).ok).toBe(true);
    expect(s.geocode).toHaveBeenCalledTimes(2);
    expect(await env.CACHE.get(await cacheKey("geocode", ["berlin"]))).not.toBeNull();
  });

  it("missing ORS_API_KEY yields a generic upstream error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = deps("192.0.2.40", false);
    const r = await handleGeocode("Berlin", s.d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("upstream");
    expect(s.createOrs).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
