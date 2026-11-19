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
 * - Limits are approximate and per Cloudflare location (not global). A strict
 *   global limit (e.g. a daily budget per ORS key) needs a Durable Object;
 *   the binding cannot express one.
 * - Cloudflare advises against IP keys where a user id exists. This app has
 *   no accounts, so the client IP is the only stable identifier available.
 */

/**
 * Per-client limits, requests per RATE_LIMIT_PERIOD_SECONDS. Mirror of
 * `ratelimits[].simple.limit` in wrangler.jsonc, which is what the Worker
 * actually enforces; rateLimit.test.ts fails if the two drift apart.
 *
 * ORS Standard (free) plan quotas, checked 2026-11-19 at
 * https://account.heigit.org/info/plans (the page openrouteservice.org/plans/
 * redirects to): matrix 500/day and 40/min, isochrones 500/day and 20/min,
 * geocode search 1000/day and 100/min. One uncached action costs one ORS
 * request (find: one matrix call; isochrone: one isochrones call; geocode:
 * one /geocode/search call). These are the quotas on api.heigit.org. ORS
 * announced (2026-08-27, ask.openrouteservice.org/t/8013) that the
 * deprecated api.openrouteservice.org host, which ors/client.ts still uses,
 * only gets 10% of them and will be shut down; at 10% every drain time
 * below is divided by 10.
 *
 * | action    | limit | one IP drains the daily quota in | IPs to hit the ORS per-minute quota |
 * | --------- | ----- | -------------------------------- | ----------------------------------- |
 * | find      | 5/min | 500 / 5  = 100 min               | ceil(40 / 5)  = 8                   |
 * | isochrone | 6/min | 500 / 6  ≈ 83 min                | ceil(20 / 6)  = 4                   |
 * | geocode   | 30/min | 1000 / 30 ≈ 33 min              | ceil(100 / 30) = 4                  |
 *
 * (Before: find 10 and isochrone 10, i.e. 50 min each and 4 / 2 IPs.)
 *
 * Why these values for honest use:
 * - find 5: a person runs a search, changes mode, goal or people, and runs it
 *   again; more than 5 in one minute is not normal use.
 * - isochrone 6: isochrones are only fetched when a result is selected, at
 *   most TOP_M (3) distinct ones per search (the page caches them), so 6
 *   covers browsing every result of two searches in a minute.
 * - geocode 30 (unchanged): the address field searches 300 ms after the last
 *   keystroke once 3+ characters are typed, so one address costs about 1-6
 *   requests, more for slow typists, and a form has up to 12 people. Lower
 *   values would make normal typing hit the limit, and a refusal costs the
 *   user up to a 60 s wait.
 *
 * Residual risk (accepted for now; a global budget needs a Durable Object):
 * these are per-minute caps, not a daily budget. A client that varies its
 * inputs gets no cache hits (cache hits cost no ORS quota but do count
 * against these limits), so every allowed request reaches ORS. N clients
 * (distinct IPs or IPv6 /64s, or one client seen at N Cloudflare locations)
 * at the limit send N x limit x 1440 requests a day against the daily quota:
 * one IP alone drains matrix in 100 min, isochrones in 83 min, geocode in
 * 33 min; with N IPs divide by N. After that every user gets the 'quota'
 * error until the ORS quota renews. Limits are approximate, so the real
 * figures can be somewhat worse.
 */
export const RATE_LIMITS = {
  find: 5,
  isochrone: 6,
  geocode: 30,
} as const;

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
