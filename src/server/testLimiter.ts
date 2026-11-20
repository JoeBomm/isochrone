import type { RateLimiterLike } from "./rateLimit";

/**
 * Deterministic stand-in for the Workers Rate Limiting binding for tests: a
 * fixed window that never resets. Mirrors the documented semantics: success
 * while the count is below the limit, and denied calls do not add to the count.
 */
export function fakeLimiter(limit: number) {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  const limiter: RateLimiterLike = {
    async limit({ key }) {
      keys.push(key);
      const n = counts.get(key) ?? 0;
      if (n >= limit) return { success: false };
      counts.set(key, n + 1);
      return { success: true };
    },
  };
  return { limiter, keys };
}
