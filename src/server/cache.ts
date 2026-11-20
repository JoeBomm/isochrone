import { KV_MIN_TTL_SECONDS } from "../domain/constants";
import type { Coordinate } from "../domain/types";

export type KeyPart = string | number | Coordinate | Coordinate[];

const round3 = (n: number): number => {
  if (!Number.isFinite(n)) throw new Error("cacheKey: non-finite number");
  return Math.round(n * 1000) / 1000 + 0; // "+ 0" turns -0 into 0
};

const isCoord = (p: unknown): p is Coordinate =>
  typeof p === "object" && p !== null && !Array.isArray(p) && "lat" in p && "lng" in p;

// Every part is tagged with its kind, so "1" / 1 / coordinate / list never collide,
// and JSON.stringify delimits/escapes strings so ["a","b"] != ["ab"].
function normalize(part: KeyPart): unknown {
  if (typeof part === "string") return ["s", part];
  if (typeof part === "number") {
    if (!Number.isFinite(part)) throw new Error("cacheKey: non-finite number");
    return ["n", part + 0];
  }
  if (Array.isArray(part)) return ["l", part.map((c) => [round3(c.lat), round3(c.lng)])];
  if (isCoord(part)) return ["c", round3(part.lat), round3(part.lng)];
  throw new Error("cacheKey: unsupported part");
}

/** `${namespace}:${full sha256 hex}` of an unambiguous canonical encoding. Coordinates are rounded to 3 decimals (~100m). */
export async function cacheKey(namespace: string, parts: KeyPart[]): Promise<string> {
  const canonical = JSON.stringify([namespace, parts.map(normalize)]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${namespace}:${hex}`;
}

/**
 * Read-through KV cache. Values are stored as `{"v": value}` so a cached
 * null/0/false/"" is a hit (distinguishable from a missing key). An `undefined`
 * result can't be represented in JSON and is returned without caching.
 * KV get/put failures, corrupt JSON and hits failing `isValid` all fall back to
 * `load`; errors thrown by `load` propagate and are never cached.
 */
export async function cached<T>(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
  isValid?: (v: unknown) => v is T,
): Promise<T> {
  try {
    const raw = await kv.get(key);
    if (raw !== null) {
      const env: unknown = JSON.parse(raw);
      if (typeof env === "object" && env !== null && "v" in env) {
        const v = (env as { v: unknown }).v;
        if (!isValid || isValid(v)) return v as T;
      }
    }
  } catch {
    // get failure or corrupt JSON: treat as a miss
  }
  const value = await load();
  if (value !== undefined) {
    try {
      await kv.put(key, JSON.stringify({ v: value }), {
        expirationTtl: Math.max(KV_MIN_TTL_SECONDS, Math.ceil(ttlSeconds)),
      });
    } catch {
      // put failure: still return the loaded value
    }
  }
  return value;
}
