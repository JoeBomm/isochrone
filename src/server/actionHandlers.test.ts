import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CACHE_TTL } from "../domain/constants";
import { haversineMeters } from "../domain/geometry";
import type { Coordinate } from "../domain/types";
import {
  GEOCODE_CACHE_NAMESPACE,
  handleFindMeetingPoints,
  handleGeocode,
  handleIsochrone,
  toActionError,
  type ActionDeps,
  type ServerEnv,
} from "./actionHandlers";
import { cacheKey } from "./cache";
import { NoReachablePointError, ValidationError } from "./findMeetingPoints";
import type { OrsClient, OrsClientOptions } from "./ors/client";
import { OrsError } from "./ors/errors";
import { fakeKv } from "./testKv";
import { fakeLimiter } from "./testLimiter";

const SECRET = "sk-test-ors-key-0123456789";
const A = { lat: 40.0, lng: -70.0 };
const B = { lat: 40.1, lng: -70.1 };
const POLY = { type: "Polygon" as const, coordinates: [[[-70, 40], [-70.1, 40], [-70, 40.1], [-70, 40]]] };

function fakeOrs() {
  const matrix = vi.fn(async (o: Coordinate[], d: Coordinate[]) =>
    o.map((a) => d.map((b) => haversineMeters(a, b))),
  );
  const isochrone = vi.fn(async () => POLY);
  const geocode = vi.fn(async (_q: string) => [{ coordinate: A, label: "Somewhere" }]);
  const ors = { matrix, isochrone, geocode } as unknown as OrsClient;
  return { ors, matrix, isochrone, geocode };
}

function setup(opts: { limit?: number; apiKey?: string | null; ip?: string | null } = {}) {
  const fake = fakeOrs();
  const kv = fakeKv();
  const getSpy = vi.spyOn(kv.kv, "get");
  const find = fakeLimiter(opts.limit ?? 100);
  const iso = fakeLimiter(opts.limit ?? 100);
  const geo = fakeLimiter(opts.limit ?? 100);
  const env: ServerEnv = {
    CACHE: kv.kv,
    FIND_RATE_LIMITER: find.limiter,
    ISOCHRONE_RATE_LIMITER: iso.limiter,
    GEOCODE_RATE_LIMITER: geo.limiter,
    ...(opts.apiKey === null ? {} : { ORS_API_KEY: opts.apiKey ?? SECRET }),
  };
  const createOrs = vi.fn((_o: OrsClientOptions) => fake.ors);
  const ip = opts.ip === undefined ? "198.51.100.9" : opts.ip;
  const headers = new Headers(ip === null ? {} : { "CF-Connecting-IP": ip });
  const deps: ActionDeps = { env, headers, createOrs };
  return { ...fake, kv, getSpy, env, deps, createOrs, limiters: { find, iso, geo } };
}

const findInput = { participants: [A, B], mode: "driving-car", goal: "MINIMAX" };

let errSpy: { mock: { calls: unknown[][] } };
beforeEach(() => {
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const loggedText = () => JSON.stringify(errSpy.mock.calls.map((c) => c.map(String)));

describe("toActionError", () => {
  it.each([
    [new ValidationError("At least 2 participants are required"), "validation"],
    [new NoReachablePointError(), "no_reachable_point"],
    [new OrsError("rate_limited", "429", 30), "quota"],
    [new OrsError("unauthorized", "401"), "upstream"],
    [new OrsError("bad_request", "400"), "upstream"],
    [new OrsError("not_found", "404"), "not_found"],
    [new OrsError("upstream", "503"), "upstream"],
    [new TypeError("Cannot read properties of undefined (reading 'coordinates')"), "upstream"],
    ["a string was thrown", "upstream"],
    [undefined, "upstream"],
  ])("maps %s to %s", (e, code) => {
    const r = toActionError(e);
    expect(r.code).toBe(code);
    expect(typeof r.message).toBe("string");
    expect(r.message.length).toBeGreaterThan(0);
  });

  it("passes our own validation / no-reachable messages through", () => {
    expect(toActionError(new ValidationError("gridSize bad")).message).toBe("gridSize bad");
    expect(toActionError(new NoReachablePointError()).message).toMatch(/no reachable meeting point/i);
  });

  it("gives quota errors a retryAfterSeconds when ORS supplied one", () => {
    expect(toActionError(new OrsError("rate_limited", "429", 30))).toMatchObject({
      code: "quota",
      retryAfterSeconds: 30,
    });
    expect(toActionError(new OrsError("rate_limited", "429"))).not.toHaveProperty("retryAfterSeconds");
  });

  it("does not expose upstream details (status text, ORS wording) for auth/bad-request/unknown", () => {
    for (const e of [
      new OrsError("unauthorized", "OpenRouteService rejected credentials (HTTP 401)"),
      new OrsError("bad_request", "OpenRouteService rejected the request (HTTP 400)"),
      new TypeError(`boom ${SECRET}`),
    ]) {
      const m = toActionError(e, SECRET).message;
      expect(m).not.toMatch(/401|400|credential|OpenRouteService|boom/);
      expect(m).not.toContain(SECRET);
    }
  });

  it("distinguishes 429 quota, 401 config and 5xx outage messages", () => {
    const msgs = new Set(
      [
        new OrsError("rate_limited", "x"),
        new OrsError("unauthorized", "x"),
        new OrsError("upstream", "x"),
      ].map((e) => toActionError(e).message),
    );
    expect(msgs.size).toBe(3);
  });

  it("logs unexpected errors via console.error with the secret redacted", () => {
    toActionError(new TypeError(`bad payload near ${SECRET}`), SECRET);
    expect(errSpy).toHaveBeenCalled();
    expect(loggedText()).not.toContain(SECRET);
    expect(loggedText()).toContain("[redacted]");
  });
});

describe("handleFindMeetingPoints", () => {
  it("returns ok data from one matrix call, building the ORS client from the server env", async () => {
    const s = setup();
    s.env.ORS_BASE_URL = "http://localhost:9999";
    const r = await handleFindMeetingPoints(findInput, s.deps);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.matrixCalls).toBe(1);
    expect(r.data.points.length).toBeGreaterThan(0);
    expect(s.matrix).toHaveBeenCalledTimes(1);
    expect(s.createOrs).toHaveBeenCalledWith({ apiKey: SECRET, baseUrl: "http://localhost:9999" });
  });

  it("omits baseUrl when ORS_BASE_URL is unset (client default applies)", async () => {
    const s = setup();
    await handleFindMeetingPoints(findInput, s.deps);
    expect(s.createOrs).toHaveBeenCalledWith({ apiKey: SECRET });
  });

  it("keys the limiter on CF-Connecting-IP", async () => {
    const s = setup({ ip: "203.0.113.5" });
    await handleFindMeetingPoints(findInput, s.deps);
    expect(s.limiters.find.keys).toEqual(["203.0.113.5"]);
    expect(s.limiters.geo.keys).toEqual([]);
  });

  it("denies the (N+1)th request with rate_limited before any cache read or ORS client construction", async () => {
    const s = setup({ limit: 2 });
    expect((await handleFindMeetingPoints(findInput, s.deps)).ok).toBe(true);
    expect((await handleFindMeetingPoints(findInput, s.deps)).ok).toBe(true);
    const ors = s.createOrs.mock.calls.length;
    const reads = s.getSpy.mock.calls.length;
    const r = await handleFindMeetingPoints(findInput, s.deps);
    expect(r).toEqual({
      ok: false,
      error: { code: "rate_limited", message: expect.any(String), retryAfterSeconds: 60 },
    });
    expect(s.createOrs.mock.calls.length).toBe(ors);
    expect(s.getSpy.mock.calls.length).toBe(reads);
    expect(s.matrix).toHaveBeenCalledTimes(1); // 2nd call was a cache hit
  });

  it("shares one fallback bucket when CF-Connecting-IP is missing", async () => {
    const s = setup({ limit: 1, ip: null });
    expect((await handleFindMeetingPoints(findInput, s.deps)).ok).toBe(true);
    const r = await handleFindMeetingPoints(findInput, s.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("rate_limited");
  });

  it("rejects invalid input with a validation error without consuming rate limit or touching ORS", async () => {
    const s = setup();
    for (const bad of [
      { participants: [A] },
      { participants: [{ lat: 91, lng: 0 }, B] },
      { participants: [A, B], mode: "rocket" },
      null,
    ]) {
      const r = await handleFindMeetingPoints(bad, s.deps);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    }
    expect(s.limiters.find.keys).toEqual([]);
    expect(s.createOrs).not.toHaveBeenCalled();
  });

  it("returns a generic upstream error when ORS_API_KEY is missing, without constructing a client", async () => {
    const s = setup({ apiKey: null });
    const r = await handleFindMeetingPoints(findInput, s.deps);
    expect(r).toEqual({ ok: false, error: { code: "upstream", message: expect.any(String) } });
    expect(s.createOrs).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    expect(loggedText()).toMatch(/ORS_API_KEY/);
  });

  it("maps ORS 429 to quota with retryAfterSeconds and does not cache the failure", async () => {
    const s = setup();
    s.matrix.mockRejectedValueOnce(new OrsError("rate_limited", "429", 42));
    const r1 = await handleFindMeetingPoints(findInput, s.deps);
    expect(r1).toEqual({
      ok: false,
      error: { code: "quota", message: expect.any(String), retryAfterSeconds: 42 },
    });
    expect(s.kv.store.size).toBe(0);
    const r2 = await handleFindMeetingPoints(findInput, s.deps);
    expect(r2.ok).toBe(true);
    expect(s.matrix).toHaveBeenCalledTimes(2);
  });

  it("maps ORS 401 to upstream with a non-leaky message, logging without the key", async () => {
    const s = setup();
    s.matrix.mockRejectedValueOnce(new OrsError("unauthorized", "OpenRouteService rejected credentials (HTTP 401)"));
    const r = await handleFindMeetingPoints(findInput, s.deps);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("upstream");
    expect(r.error.message).not.toContain(SECRET);
    expect(errSpy).toHaveBeenCalled();
    expect(loggedText()).not.toContain(SECRET);
  });

  it("maps an unexpected TypeError (malformed ORS payload) to upstream without leaking its text", async () => {
    const s = setup();
    s.matrix.mockRejectedValueOnce(new TypeError(`x is undefined; key=${SECRET}`));
    const r = await handleFindMeetingPoints(findInput, s.deps);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("upstream");
    expect(r.error.message).not.toMatch(/undefined|key=/);
    expect(loggedText()).not.toContain(SECRET);
    expect(s.kv.store.size).toBe(0);
  });

  it("maps all-unreachable to no_reachable_point", async () => {
    const s = setup();
    s.matrix.mockImplementationOnce(async (o: Coordinate[], d: Coordinate[]) => o.map(() => d.map(() => null)) as never);
    const r = await handleFindMeetingPoints(findInput, s.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("no_reachable_point");
  });
});

describe("handleIsochrone", () => {
  const input = { center: A, minutes: 15, mode: "driving-car" };

  it("returns the polygon and caches it under cacheKey('isochrone', [center, minutes, mode])", async () => {
    const s = setup();
    const r = await handleIsochrone(input, s.deps);
    expect(r).toEqual({ ok: true, data: { geometry: POLY } });
    expect(s.isochrone).toHaveBeenCalledWith(A, 15, "driving-car");
    const key = await cacheKey("isochrone", [A, 15, "driving-car"]);
    expect(s.kv.store.has(key)).toBe(true);
    expect(s.kv.puts[0]).toEqual({ key, ttl: CACHE_TTL.ISOCHRONE_SECONDS });
    await handleIsochrone(input, s.deps);
    expect(s.isochrone).toHaveBeenCalledTimes(1);
  });

  it("rejects minutes:0 and out-of-range centers as validation errors", async () => {
    const s = setup();
    for (const bad of [{ ...input, minutes: 0 }, { ...input, center: { lat: 0, lng: 200 } }]) {
      const r = await handleIsochrone(bad, s.deps);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    }
    expect(s.createOrs).not.toHaveBeenCalled();
  });

  it("rate-limits before any ORS work, on its own limiter", async () => {
    const s = setup({ limit: 0 });
    const r = await handleIsochrone(input, s.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: "rate_limited", retryAfterSeconds: 60 });
    expect(s.limiters.iso.keys).toHaveLength(1);
    expect(s.createOrs).not.toHaveBeenCalled();
    expect(s.getSpy).not.toHaveBeenCalled();
  });

  it("does not cache failures", async () => {
    const s = setup();
    s.isochrone.mockRejectedValueOnce(new OrsError("upstream", "503"));
    const r = await handleIsochrone(input, s.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("upstream");
    expect(s.kv.store.size).toBe(0);
    expect((await handleIsochrone(input, s.deps)).ok).toBe(true);
  });
});

describe("handleGeocode", () => {
  it("returns results and caches by normalized (trimmed, collapsed, lowercased) query", async () => {
    const s = setup();
    const r = await handleGeocode("  Berlin   Hbf ", s.deps);
    expect(r).toEqual({ ok: true, data: { results: [{ coordinate: A, label: "Somewhere" }] } });
    expect(s.geocode).toHaveBeenCalledWith("Berlin Hbf");
    const key = await cacheKey(GEOCODE_CACHE_NAMESPACE, ["berlin hbf"]);
    expect(s.kv.puts[0]).toEqual({ key, ttl: CACHE_TTL.GEOCODE_SECONDS });
    const r2 = await handleGeocode("berlin HBF", s.deps);
    expect(r2.ok).toBe(true);
    expect(s.geocode).toHaveBeenCalledTimes(1);
  });

  it("maps zero results to not_found and does not cache it", async () => {
    const s = setup();
    s.geocode.mockResolvedValueOnce([]);
    const r = await handleGeocode("xyzzy nowhere", s.deps);
    expect(r).toEqual({ ok: false, error: { code: "not_found", message: expect.any(String) } });
    expect(s.kv.store.size).toBe(0);
  });

  it("rejects empty and 500-character queries before rate limiting or ORS", async () => {
    const s = setup();
    for (const q of ["", "   ", "a".repeat(500)]) {
      const r = await handleGeocode(q, s.deps);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    }
    expect(s.limiters.geo.keys).toEqual([]);
    expect(s.createOrs).not.toHaveBeenCalled();
  });

  it("rate-limits before any ORS work", async () => {
    const s = setup({ limit: 0 });
    const r = await handleGeocode("Berlin", s.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("rate_limited");
    expect(s.createOrs).not.toHaveBeenCalled();
  });

  it("maps ORS errors and never throws", async () => {
    const s = setup();
    s.geocode.mockRejectedValueOnce(new OrsError("not_found", "404"));
    const r = await handleGeocode("Berlin", s.deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_found");
  });
});
