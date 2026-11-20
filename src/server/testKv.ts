/** In-memory fake KVNamespace for tests (get/put only). */
export function fakeKv(opts: { failGet?: boolean; failPut?: boolean } = {}) {
  const store = new Map<string, string>();
  const puts: { key: string; ttl?: number }[] = [];
  const kv = {
    async get(key: string) {
      if (opts.failGet) throw new Error("kv get down");
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, o?: { expirationTtl?: number }) {
      if (opts.failPut) throw new Error("kv put down");
      puts.push({ key, ttl: o?.expirationTtl });
      store.set(key, value);
    },
  } as unknown as KVNamespace;
  return { kv, store, puts };
}
