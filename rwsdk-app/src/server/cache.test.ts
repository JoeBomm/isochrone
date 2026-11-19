import { describe, expect, it, vi } from "vitest";
import { cached, cacheKey } from "./cache";
import { fakeKv } from "./testKv";

const P = (i: number) => ({ lat: 40 + i, lng: -70 - i });

describe("cacheKey", () => {
  it("is namespace:64-hex", async () => {
    expect(await cacheKey("matrix", [P(1)])).toMatch(/^matrix:[0-9a-f]{64}$/);
  });
  it("coordinates ~30m apart share a key; ~1km apart do not", async () => {
    const a = await cacheKey("g", [{ lat: 40.0001, lng: -70.0001 }]);
    const b = await cacheKey("g", [{ lat: 40.0003, lng: -70.0003 }]);
    const c = await cacheKey("g", [{ lat: 40.01, lng: -70.01 }]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("lists sharing a long prefix but differing later differ", async () => {
    const base = Array.from({ length: 12 }, (_, i) => P(i));
    const k1 = await cacheKey("m", [base]);
    const k2 = await cacheKey("m", [[...base, P(20)]]);
    const k3 = await cacheKey("m", [[...base.slice(0, 11), P(30)]]);
    expect(new Set([k1, k2, k3]).size).toBe(3);
  });
  it("order of coordinates matters", async () => {
    expect(await cacheKey("m", [[P(1), P(2)]])).not.toBe(await cacheKey("m", [[P(2), P(1)]]));
  });
  it("is unambiguous across part shapes", async () => {
    const keys = await Promise.all([
      cacheKey("n", ["a", "b"]),
      cacheKey("n", ["ab"]),
      cacheKey("n", ["1"]),
      cacheKey("n", [1]),
      cacheKey("n", [P(1)]),
      cacheKey("n", [[P(1)]]),
      cacheKey("n", [[]]),
      cacheKey("n", []),
      cacheKey("o", ["1"]),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("lat/lng swap differs", async () => {
    expect(await cacheKey("n", [{ lat: 1, lng: 2 }])).not.toBe(await cacheKey("n", [{ lat: 2, lng: 1 }]));
  });
  it("-0 after rounding equals 0", async () => {
    expect(await cacheKey("n", [{ lat: -0.0001, lng: 0 }])).toBe(await cacheKey("n", [{ lat: 0, lng: -0 }]));
  });
  it("rejects non-finite numbers", async () => {
    await expect(cacheKey("n", [NaN])).rejects.toThrow();
    await expect(cacheKey("n", [{ lat: Infinity, lng: 0 }])).rejects.toThrow();
  });
});

describe("cached", () => {
  it("second call within TTL does not call load", async () => {
    const { kv, puts } = fakeKv();
    const load = vi.fn(async () => ({ x: 1 }));
    expect(await cached(kv, "k", 300, load)).toEqual({ x: 1 });
    expect(await cached(kv, "k", 300, load)).toEqual({ x: 1 });
    expect(load).toHaveBeenCalledTimes(1);
    expect(puts[0].ttl).toBe(300);
  });
  it("clamps TTL to KV minimum of 60", async () => {
    const { kv, puts } = fakeKv();
    await cached(kv, "k", 5, async () => 1);
    expect(puts[0].ttl).toBe(60);
  });
  it("hit failing isValid is reloaded and overwritten", async () => {
    const { kv, store } = fakeKv();
    store.set("k", JSON.stringify({ v: [[0, 1]] }));
    const isValid = (v: unknown): v is number[][] => Array.isArray(v) && v.length === 3;
    const load = vi.fn(async () => [[0], [0], [0]]);
    expect(await cached(kv, "k", 300, load, isValid)).toEqual([[0], [0], [0]]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get("k")!)).toEqual({ v: [[0], [0], [0]] });
  });
  it("throwing load propagates and is not cached", async () => {
    const { kv, store } = fakeKv();
    await expect(cached(kv, "k", 300, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(store.size).toBe(0);
    const load = vi.fn(async () => 7);
    expect(await cached(kv, "k", 300, load)).toBe(7);
  });
  it("kv.get failure falls through to load", async () => {
    const { kv } = fakeKv({ failGet: true });
    expect(await cached(kv, "k", 300, async () => 5)).toBe(5);
  });
  it("kv.put failure still returns loaded value", async () => {
    const { kv } = fakeKv({ failPut: true });
    expect(await cached(kv, "k", 300, async () => 5)).toBe(5);
  });
  it("corrupt JSON or wrong envelope is a miss", async () => {
    const { kv, store } = fakeKv();
    store.set("k", "{not json");
    expect(await cached(kv, "k", 300, async () => 1)).toBe(1);
    store.set("k2", JSON.stringify(42));
    expect(await cached(kv, "k2", 300, async () => 2)).toBe(2);
  });
  it("cached falsy values (null, 0, false, '') are hits", async () => {
    for (const v of [null, 0, false, ""]) {
      const { kv } = fakeKv();
      const load = vi.fn(async () => v);
      expect(await cached(kv, "k", 300, load)).toBe(v);
      expect(await cached(kv, "k", 300, load)).toBe(v);
      expect(load).toHaveBeenCalledTimes(1);
    }
  });
  it("undefined result is returned but not cached", async () => {
    const { kv, store } = fakeKv();
    expect(await cached(kv, "k", 300, async () => undefined)).toBeUndefined();
    expect(store.size).toBe(0);
  });
});
