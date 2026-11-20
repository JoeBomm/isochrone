import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  clientIdFromHeaders,
  FALLBACK_CLIENT_ID,
  RATE_LIMIT_PERIOD_SECONDS,
  RATE_LIMITS,
  type RateLimiterLike,
} from "./rateLimit";
import { fakeLimiter } from "./testLimiter";

afterEach(() => vi.restoreAllMocks());

describe("wrangler.jsonc ratelimits", () => {
  // One binding per line: { "name": ..., "namespace_id": ..., "simple": { "limit": N, "period": P } }
  const config = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  const all = [
    ...config.matchAll(/"name":\s*"(\w+_RATE_LIMITER)",\s*"namespace_id":\s*"(\d+)".*?"limit":\s*(\d+),\s*"period":\s*(\d+)/g),
  ].map((m) => ({ name: m[1], namespaceId: m[2], limit: Number(m[3]), period: Number(m[4]) }));
  const expected = {
    FIND_RATE_LIMITER: { limit: RATE_LIMITS.find, period: RATE_LIMIT_PERIOD_SECONDS },
    ISOCHRONE_RATE_LIMITER: { limit: RATE_LIMITS.isochrone, period: RATE_LIMIT_PERIOD_SECONDS },
    GEOCODE_RATE_LIMITER: { limit: RATE_LIMITS.geocode, period: RATE_LIMIT_PERIOD_SECONDS },
  } as const;

  it("declares all three limiters in the top level, staging and production", () => {
    expect(all).toHaveLength(9);
  });

  it("every binding in every environment matches RATE_LIMITS and RATE_LIMIT_PERIOD_SECONDS", () => {
    for (const { name, limit, period } of all) {
      expect({ limit, period }).toEqual(expected[name as keyof typeof expected]);
    }
  });

  it("uses a unique namespace_id per binding (they are account-wide)", () => {
    const ids = all.map((b) => b.namespaceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keep each per-client limit below the ORS Standard plan's per-minute quota", () => {
    // ORS Standard plan (checked 2026-11-19): matrix 40/min, isochrones 20/min, geocode 100/min.
    expect(RATE_LIMITS.find).toBeLessThan(40);
    expect(RATE_LIMITS.isochrone).toBeLessThan(20);
    expect(RATE_LIMITS.geocode).toBeLessThan(100);
  });
});

describe("checkRateLimit", () => {
  it("allows N requests in the window and denies the (N+1)th with retryAfterSeconds", async () => {
    const { limiter } = fakeLimiter(3);
    for (let i = 0; i < 3; i++) {
      expect(await checkRateLimit(limiter, "1.2.3.4")).toEqual({ allowed: true });
    }
    const denied = await checkRateLimit(limiter, "1.2.3.4");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(60);
  });

  it("reports the configured period as retryAfterSeconds", async () => {
    const { limiter } = fakeLimiter(0);
    expect(await checkRateLimit(limiter, "x", 10)).toEqual({ allowed: false, retryAfterSeconds: 10 });
  });

  it("keeps separate buckets per client", async () => {
    const { limiter } = fakeLimiter(1);
    expect((await checkRateLimit(limiter, "a")).allowed).toBe(true);
    expect((await checkRateLimit(limiter, "a")).allowed).toBe(false);
    expect((await checkRateLimit(limiter, "b")).allowed).toBe(true);
  });

  it("fails closed (denies) when the limiter is missing or throws, without throwing itself", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: RateLimiterLike = {
      limit: async () => {
        throw new Error("binding down");
      },
    };
    expect(await checkRateLimit(broken, "a")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(await checkRateLimit(undefined, "a")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(err).toHaveBeenCalled();
  });
});

describe("clientIdFromHeaders", () => {
  const h = (ip?: string) => new Headers(ip === undefined ? {} : { "CF-Connecting-IP": ip });

  it("uses CF-Connecting-IP for IPv4", () => {
    expect(clientIdFromHeaders(h("203.0.113.7"))).toBe("203.0.113.7");
  });

  it("falls back to one shared bucket when the header is missing or empty", () => {
    expect(clientIdFromHeaders(h())).toBe(FALLBACK_CLIENT_ID);
    expect(clientIdFromHeaders(h("   "))).toBe(FALLBACK_CLIENT_ID);
  });

  it("buckets IPv6 clients by /64 so rotating the interface id does not evade the limit", () => {
    const a = clientIdFromHeaders(h("2001:db8:1:2:aaaa:bbbb:cccc:dddd"));
    const b = clientIdFromHeaders(h("2001:0db8:0001:0002::1"));
    const other = clientIdFromHeaders(h("2001:db8:1:3::1"));
    expect(a).toBe("2001:db8:1:2::/64");
    expect(b).toBe(a);
    expect(other).not.toBe(a);
    expect(clientIdFromHeaders(h("::1"))).toBe("0:0:0:0::/64");
    expect(clientIdFromHeaders(h("2001:DB8::"))).toBe("2001:db8:0:0::/64");
  });

  it("uses an unparseable value as-is rather than crashing", () => {
    expect(clientIdFromHeaders(h("not-an-ip"))).toBe("not-an-ip");
  });
});
