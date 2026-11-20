import { describe, expect, it } from "vitest";
import { createOrsClient } from "./client";
import { OrsError } from "./errors";

const KEY = "SECRET-KEY-abc123";

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(respond: () => Response) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  return { fetchFn, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const A = { lat: 10, lng: 20 };
const B = { lat: 11, lng: 21 };
const C = { lat: 12, lng: 22 };

function headerOf(call: Call, name: string): string | undefined {
  const h = call.init.headers as Record<string, string>;
  return h[name];
}

function expectKeyOnlyInHeader(call: Call) {
  expect(call.url).not.toContain("api_key");
  expect(call.url).not.toContain(KEY);
  expect(headerOf(call, "Authorization")).toBe(KEY);
  expect(String(call.init.body ?? "")).not.toContain(KEY);
}

describe("matrix", () => {
  it("posts [lng,lat] with sources/destinations indexes and maps null", async () => {
    const { fetchFn, calls } = fakeFetch(() =>
      json({ durations: [[60, null], [120, 30]] }),
    );
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
    const out = await client.matrix([A, B], [B, C], "driving-car");
    expect(out).toEqual([[60, null], [120, 30]]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.heigit.org/openrouteservice/v2/matrix/driving-car");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      locations: [[20, 10], [21, 11], [21, 11], [22, 12]],
      sources: [0, 1],
      destinations: [2, 3],
      metrics: ["duration"],
    });
    expectKeyOnlyInHeader(calls[0]);
  });

  it("rejects over the documented 3500-route limit without sending", async () => {
    const { fetchFn, calls } = fakeFetch(() => json({}));
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
    const many = Array.from({ length: 60 }, (_, i) => ({ lat: i / 10, lng: i / 10 }));
    await expect(client.matrix(many, many, "foot-walking")).rejects.toMatchObject({
      kind: "bad_request",
    });
    expect(calls).toHaveLength(0);
  });

  it("allows exactly 3500 routes", async () => {
    const { fetchFn, calls } = fakeFetch(() => json({ durations: [] }));
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
    const o = Array.from({ length: 35 }, () => A);
    const d = Array.from({ length: 100 }, () => B);
    await client.matrix(o, d, "driving-car").catch(() => {});
    expect(calls).toHaveLength(1);
  });

  it("honours baseUrl", async () => {
    const { fetchFn, calls } = fakeFetch(() => json({ durations: [[1]] }));
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn, baseUrl: "http://stub.local:9" });
    await client.matrix([A], [B], "cycling-regular");
    expect(calls[0].url).toBe("http://stub.local:9/openrouteservice/v2/matrix/cycling-regular");
  });

  it("maps 429 to rate_limited with retryAfterSeconds", async () => {
    const { fetchFn } = fakeFetch(() => json({}, 429, { "retry-after": "17" }));
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
    const err = await client.matrix([A], [B], "driving-car").catch((e) => e);
    expect(err).toBeInstanceOf(OrsError);
    expect(err.kind).toBe("rate_limited");
    expect(err.retryAfterSeconds).toBe(17);
  });

  it.each([401, 403])("maps %i to unauthorized", async (status) => {
    const { fetchFn } = fakeFetch(() => json({}, status));
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
    const err = await client.matrix([A], [B], "driving-car").catch((e) => e);
    expect(err.kind).toBe("unauthorized");
  });

  it("maps 5xx to upstream and 400 to bad_request, 404 to not_found", async () => {
    for (const [status, kind] of [[500, "upstream"], [503, "upstream"], [400, "bad_request"], [404, "not_found"]] as const) {
      const { fetchFn } = fakeFetch(() => json({}, status));
      const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
      const err = await client.matrix([A], [B], "driving-car").catch((e) => e);
      expect(err.kind).toBe(kind);
    }
  });

  it("never leaks the key in error messages, even if upstream echoes it", async () => {
    const { fetchFn } = fakeFetch(() => json({ error: `bad key ${KEY}` }, 400));
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
    const err = await client.matrix([A], [B], "driving-car").catch((e) => e);
    expect(err.message).not.toContain(KEY);
    expect(JSON.stringify(err)).not.toContain(KEY);
  });

  it("wraps network failure as upstream without the key", async () => {
    const fetchFn = (async () => {
      throw new TypeError(`fetch failed for ${KEY}`);
    }) as typeof fetch;
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
    const err = await client.matrix([A], [B], "driving-car").catch((e) => e);
    expect(err.kind).toBe("upstream");
    expect(err.message).not.toContain(KEY);
  });
});

describe("isochrone", () => {
  const poly = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

  it("posts lng,lat and range in seconds, returns first geometry", async () => {
    const { fetchFn, calls } = fakeFetch(() =>
      json({ features: [{ geometry: poly }] }),
    );
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
    const out = await client.isochrone(A, 15, "foot-walking");
    expect(out).toEqual(poly);
    expect(calls[0].url).toBe("https://api.heigit.org/openrouteservice/v2/isochrones/foot-walking");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.locations).toEqual([[20, 10]]);
    expect(body.range).toEqual([900]);
    expect(body.range_type).toBe("time");
    expectKeyOnlyInHeader(calls[0]);
  });

  it("accepts MultiPolygon", async () => {
    const mp = { type: "MultiPolygon", coordinates: [poly.coordinates] };
    const { fetchFn } = fakeFetch(() => json({ features: [{ geometry: mp }] }));
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
    expect(await client.isochrone(A, 5, "driving-car")).toEqual(mp);
  });

  it("errors on missing features / non-polygon", async () => {
    const { fetchFn } = fakeFetch(() => json({ features: [] }));
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
    await expect(client.isochrone(A, 5, "driving-car")).rejects.toMatchObject({ kind: "upstream" });
  });

  it("maps 429 and 401 and does not leak key", async () => {
    const { fetchFn } = fakeFetch(() => json({}, 429, { "Retry-After": "3" }));
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
    const err = await client.isochrone(A, 5, "driving-car").catch((e) => e);
    expect(err.kind).toBe("rate_limited");
    expect(err.retryAfterSeconds).toBe(3);
    expect(err.message).not.toContain(KEY);
    const f2 = fakeFetch(() => json({}, 401));
    const e2 = await createOrsClient({ apiKey: KEY, fetch: f2.fetchFn }).isochrone(A, 5, "driving-car").catch((e) => e);
    expect(e2.kind).toBe("unauthorized");
    expect(e2.message).not.toContain(KEY);
  });
});

describe("geocode", () => {
  it("GETs with text in query, key only in header, maps features", async () => {
    const { fetchFn, calls } = fakeFetch(() =>
      json({
        features: [
          { geometry: { coordinates: [13.4, 52.5] }, properties: { label: "Berlin, Germany" } },
        ],
      }),
    );
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
    const out = await client.geocode("Berlin & more");
    expect(out).toEqual([{ coordinate: { lat: 52.5, lng: 13.4 }, label: "Berlin, Germany" }]);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/pelias/v1/search");
    expect(url.searchParams.get("text")).toBe("Berlin & more");
    expect(calls[0].init.method).toBe("GET");
    expectKeyOnlyInHeader(calls[0]);
  });

  it("returns [] for empty features", async () => {
    const { fetchFn } = fakeFetch(() => json({ features: [] }));
    const client = createOrsClient({ apiKey: KEY, fetch: fetchFn });
    expect(await client.geocode("zzzz")).toEqual([]);
  });

  it("maps errors without leaking key", async () => {
    for (const [status, kind] of [[429, "rate_limited"], [403, "unauthorized"], [502, "upstream"]] as const) {
      const { fetchFn } = fakeFetch(() => json({ error: KEY }, status));
      const err = await createOrsClient({ apiKey: KEY, fetch: fetchFn }).geocode("x").catch((e) => e);
      expect(err.kind).toBe(kind);
      expect(err.message).not.toContain(KEY);
    }
  });
});
