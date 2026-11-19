/**
 * Per-client rate limiting with the Workers Rate Limiting binding.
 *
 * Docs checked 2026-11-19 (https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/):
 * - Configured via `ratelimits` in wrangler config: `name`, `namespace_id`
 *   (a positive integer as a string, unique per account) and
 *   `simple: { limit, period }` where period must be 10 or 60 seconds.
 * - `await env.X.limit({ key })` resolves to `{ success }`. A denied call does
 *   not add to the count. No reset time is returned, so retryAfterSeconds is
 *   reported as the full period (an upper bound).
 * - Limits are approximate and per Cloudflare location (not global). That is
 *   adequate abuse protection in front of the shared ORS key; a strict global
 *   quota would need a Durable Object.
 * - Cloudflare advises against IP keys where a user id exists. This app has
 *   no accounts, so the client IP is the only stable identifier available.
 */

export interface RateLimiterLike {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/** Must match `simple.period` of every ratelimits binding in wrangler.jsonc. */
export const RATE_LIMIT_PERIOD_SECONDS = 60;

/**
 * Bucket for requests without CF-Connecting-IP (local dev, or a request that
 * did not come through Cloudflare's edge). All such requests share one
 * bucket: fail-safe, since a missing header can't be used to get a fresh
 * allowance per request.
 */
export const FALLBACK_CLIENT_ID = "unknown-client";

/**
 * Fails closed: if the binding is missing or throws, the request is denied.
 * The limiter protects a shared, quota-limited upstream key, so a broken
 * limiter must not turn into unlimited ORS traffic.
 */
export async function checkRateLimit(
  limiter: RateLimiterLike | undefined,
  clientId: string,
  periodSeconds: number = RATE_LIMIT_PERIOD_SECONDS,
): Promise<RateLimitDecision> {
  try {
    if (!limiter) throw new Error("rate limiter binding is not configured");
    const { success } = await limiter.limit({ key: clientId });
    return success ? { allowed: true } : { allowed: false, retryAfterSeconds: periodSeconds };
  } catch (e) {
    console.error("[rateLimit] limiter unavailable; denying request:", e instanceof Error ? e.message : String(e));
    return { allowed: false, retryAfterSeconds: periodSeconds };
  }
}

/** Expand an IPv6 address to 8 hextets, or null if it doesn't parse. */
function ipv6Hextets(ip: string): string[] | null {
  if (!/^[0-9a-fA-F:]+$/.test(ip)) return null; // excludes zone ids and IPv4-mapped forms
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (all.some((h) => h.length === 0 || h.length > 4)) return null;
  return all.map((h) => parseInt(h, 16).toString(16));
}

/**
 * Rate-limit key for the caller, from CF-Connecting-IP (set by Cloudflare's
 * edge, not client-controllable there). IPv6 clients are keyed by their /64,
 * since a single subscriber usually controls a whole /64.
 */
export function clientIdFromHeaders(headers: Headers): string {
  const ip = headers.get("CF-Connecting-IP")?.trim();
  if (!ip) return FALLBACK_CLIENT_ID;
  if (ip.includes(":")) {
    const h = ipv6Hextets(ip);
    if (h) return `${h.slice(0, 4).join(":")}::/64`;
  }
  return ip;
}
