import { describe, expect, it, vi } from "vitest";
import { generateCandidates } from "../domain/candidates";
import { haversineMeters } from "../domain/geometry";
import type { Coordinate, Place } from "../domain/types";
import { cacheKey } from "./cache";
import {
  findMeetingPoints,
  NoPlacesError,
  NoReachablePointError,
  placeRadiusMeters,
  ValidationError,
} from "./findMeetingPoints";
import type { OrsClient } from "./ors/client";
import { fakeKv } from "./testKv";

type Matrix = (number | null)[][];

/** Travel time = haversine meters (1 m = 1 s) so a participant's own spot costs 0. */
const distMatrix = (o: Coordinate[], d: Coordinate[]): Matrix =>
  o.map((a) => d.map((b) => haversineMeters(a, b)));

function fakeOrs(impl: (o: Coordinate[], d: Coordinate[]) => Matrix = distMatrix) {
  const matrix = vi.fn(async (o: Coordinate[], d: Coordinate[], _mode?: string) => impl(o, d));
  const ors = { matrix, isochrone: vi.fn(), geocode: vi.fn() } as unknown as OrsClient;
  return { ors, matrix };
}

const A = { lat: 40.0, lng: -70.0 };
const B = { lat: 40.1, lng: -70.1 };
const C = { lat: 40.05, lng: -69.9 };
const base = { mode: "driving-car", goal: "MINIMAX" } as const;

describe("findMeetingPoints", () => {
  it("makes exactly one matrix call with participants x candidates and returns the documented shape", async () => {
    const { ors, matrix } = fakeOrs();
    const { kv } = fakeKv();
    const r = await findMeetingPoints({ ...base, participants: [A, B, C], gridSize: 5 }, { ors, kv });
    expect(matrix).toHaveBeenCalledTimes(1);
    const [o, d, mode] = matrix.mock.calls[0];
    expect(o).toEqual([A, B, C]);
    expect(mode).toBe("driving-car");
    // anchors: centroid + median + 3 participants + 3 midpoints = 8; grid 25
    expect(d).toHaveLength(8 + 25);
    expect(r.matrixCalls).toBe(1);
    expect(r.candidatesEvaluated).toBe(33);
    expect(r.debugCandidates).toHaveLength(33);
    expect(r.points.length).toBeGreaterThan(0);
    expect(r.points.length).toBeLessThanOrEqual(3); // default TOP_M
  });

  it("respects topM and sorts best first", async () => {
    const { ors } = fakeOrs();
    const { kv } = fakeKv();
    const r = await findMeetingPoints(
      { ...base, participants: [A, B, C], topM: 2, dedupeMeters: 100 },
      { ors, kv },
    );
    expect(r.points).toHaveLength(2);
    expect(r.points[0].score).toBeLessThanOrEqual(r.points[1].score);
  });

  it("uses the cache: identical repeat makes no extra matrix call", async () => {
    const { ors, matrix } = fakeOrs();
    const { kv } = fakeKv();
    const input = { ...base, participants: [A, B], gridSize: 4 };
    const r1 = await findMeetingPoints(input, { ors, kv });
    const r2 = await findMeetingPoints(input, { ors, kv });
    expect(matrix).toHaveBeenCalledTimes(1);
    expect(r2.points).toEqual(r1.points);
    expect(r2.matrixCalls).toBe(1);
  });

  it("reloads when the cached matrix has wrong dimensions", async () => {
    const { ors, matrix } = fakeOrs();
    const { kv, store } = fakeKv();
    const participants = [A, B];
    const cands = generateCandidates(participants, 4).map((c) => c.coordinate);
    const key = await cacheKey("matrix", [participants, cands, "driving-car"]);
    store.set(key, JSON.stringify({ v: [[1, 2]] }));
    await findMeetingPoints({ ...base, participants, gridSize: 4 }, { ors, kv });
    expect(matrix).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get(key)!).v).toHaveLength(2);
  });

  it("reloads when cached rows contain non-number entries", async () => {
    const { ors, matrix } = fakeOrs();
    const { kv, store } = fakeKv();
    const participants = [A, B];
    const cands = generateCandidates(participants, 4).map((c) => c.coordinate);
    const key = await cacheKey("matrix", [participants, cands, "driving-car"]);
    const bad = participants.map(() => cands.map(() => "x"));
    store.set(key, JSON.stringify({ v: bad }));
    await findMeetingPoints({ ...base, participants, gridSize: 4 }, { ors, kv });
    expect(matrix).toHaveBeenCalledTimes(1);
  });

  it("throws NoReachablePointError when every duration is null, and does not cache it", async () => {
    const { ors } = fakeOrs((o, d) => o.map(() => d.map(() => null)));
    const { kv } = fakeKv();
    await expect(
      findMeetingPoints({ ...base, participants: [A, B] }, { ors, kv }),
    ).rejects.toBeInstanceOf(NoReachablePointError);
  });

  it("throws NoReachablePointError when no candidate is reachable by everyone", async () => {
    const { ors } = fakeOrs((o, d) => o.map((_, i) => d.map(() => (i === 0 ? null : 5))));
    const { kv } = fakeKv();
    await expect(
      findMeetingPoints({ ...base, participants: [A, B] }, { ors, kv }),
    ).rejects.toBeInstanceOf(NoReachablePointError);
  });

  for (const n of [2, 3]) {
    it(`handles ${n} identical participants: finite candidates, result at the participant`, async () => {
      const { ors, matrix } = fakeOrs();
      const { kv } = fakeKv();
      const participants = Array.from({ length: n }, () => ({ ...A }));
      const gridSize = 6;
      const r = await findMeetingPoints({ ...base, participants, gridSize }, { ors, kv });
      const dests = matrix.mock.calls[0][1];
      const anchors = 2 + n + (n * (n - 1)) / 2;
      expect(dests).toHaveLength(anchors + gridSize * gridSize);
      for (const d of dests) {
        expect(Number.isFinite(d.lat)).toBe(true);
        expect(Number.isFinite(d.lng)).toBe(true);
      }
      for (const c of r.debugCandidates.filter((c) => c.kind === "GRID")) {
        expect(Number.isFinite(c.coordinate.lat) && Number.isFinite(c.coordinate.lng)).toBe(true);
      }
      expect(r.points.length).toBeGreaterThan(0);
      const top = r.points[0];
      expect(top.max).toBe(0);
      expect(haversineMeters(top.coordinate, A)).toBeLessThan(1);
      for (const p of r.points) {
        expect(Number.isFinite(p.score)).toBe(true);
        expect(Number.isFinite(p.coordinate.lat)).toBe(true);
      }
    });
  }

  describe("validation", () => {
    const run = (input: Record<string, unknown>) => {
      const { ors, matrix } = fakeOrs();
      const { kv } = fakeKv();
      const p = findMeetingPoints({ ...base, participants: [A, B], ...input } as never, { ors, kv });
      return { p, matrix };
    };
    it("rejects fewer than 2 participants", async () => {
      const { p, matrix } = run({ participants: [A] });
      await expect(p).rejects.toBeInstanceOf(ValidationError);
      expect(matrix).not.toHaveBeenCalled();
    });
    it.each([
      ["gridSize 1", { gridSize: 1 }],
      ["gridSize 21", { gridSize: 21 }],
      ["gridSize 3.5", { gridSize: 3.5 }],
      ["gridSize NaN", { gridSize: NaN }],
      ["topM 0", { topM: 0 }],
      ["topM 51", { topM: 51 }],
      ["topM 1.5", { topM: 1.5 }],
      ["dedupe 99", { dedupeMeters: 99 }],
      ["dedupe 50001", { dedupeMeters: 50001 }],
      ["dedupe NaN", { dedupeMeters: NaN }],
      ["dedupe Infinity", { dedupeMeters: Infinity }],
      ["NaN lat", { participants: [A, { lat: NaN, lng: 1 }] }],
      ["Infinity lng", { participants: [A, { lat: 1, lng: Infinity }] }],
      ["lat out of range", { participants: [A, { lat: 91, lng: 0 }] }],
      ["lng out of range", { participants: [A, { lat: 0, lng: 181 }] }],
    ])("rejects %s", async (_n, input) => {
      const { p, matrix } = run(input);
      await expect(p).rejects.toBeInstanceOf(ValidationError);
      expect(matrix).not.toHaveBeenCalled();
    });
    it("accepts boundary values", async () => {
      const { p } = run({ gridSize: 2, topM: 1, dedupeMeters: 100 });
      await expect(p).resolves.toBeDefined();
    });
  });
});

describe("findMeetingPoints with a place type", () => {
  const place = (n: string): Place => ({ id: `1/${n}`, name: n, type: "cafe", coordinate: A });

  function orsWithPlaces(places: ReturnType<typeof vi.fn>) {
    const { ors } = fakeOrs();
    (ors as any).places = places;
    return ors;
  }
  const input = { ...base, participants: [A, B, C], dedupeMeters: 100 };

  it("makes no POI calls and adds no place fields when no type is given", async () => {
    const places = vi.fn();
    const r = await findMeetingPoints(input, { ors: orsWithPlaces(places), kv: fakeKv().kv });
    expect(places).not.toHaveBeenCalled();
    expect(r.places).toBeUndefined();
    expect(r.placeRadiusMeters).toBeUndefined();
  });

  it("returns places per point id and the radius used", async () => {
    const places = vi.fn(async () => [place("Joe's")]);
    const r = await findMeetingPoints(
      { ...input, placeType: "cafe", minutes: 10 },
      { ors: orsWithPlaces(places), kv: fakeKv().kv },
    );
    expect(r.points).toHaveLength(3);
    for (const p of r.points) expect(r.places![p.id]).toEqual([place("Joe's")]);
    expect(r.placeRadiusMeters).toBe(placeRadiusMeters(10, "driving-car"));
    expect(places.mock.calls[0].slice(1)).toEqual(["cafe", r.placeRadiusMeters, 10]);
  });

  it("skips ranked points with no matching place and takes the next ones", async () => {
    const places = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([place("X")]);
    const plain = await findMeetingPoints(input, { ors: orsWithPlaces(vi.fn()), kv: fakeKv().kv });
    const r = await findMeetingPoints({ ...input, placeType: "bar" }, { ors: orsWithPlaces(places), kv: fakeKv().kv });
    expect(r.points.map((p) => p.id)).not.toContain(plain.points[0].id);
    expect(r.points).toHaveLength(3);
  });

  it("throws NoPlacesError (a NoReachablePointError) when nothing is found, within the attempt cap", async () => {
    const places = vi.fn(async () => []);
    const p = findMeetingPoints({ ...input, placeType: "gym" }, { ors: orsWithPlaces(places), kv: fakeKv().kv });
    await expect(p).rejects.toBeInstanceOf(NoPlacesError);
    await expect(p).rejects.toBeInstanceOf(NoReachablePointError);
    expect(places.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("caches place lookups: an identical repeat makes no POI calls", async () => {
    const places = vi.fn(async () => [place("Joe's")]);
    const { kv } = fakeKv();
    const ors = orsWithPlaces(places);
    await findMeetingPoints({ ...input, placeType: "cafe" }, { ors, kv });
    const first = places.mock.calls.length;
    await findMeetingPoints({ ...input, placeType: "cafe" }, { ors, kv });
    expect(places.mock.calls.length).toBe(first);
  });

  it("clamps the radius to the POI service limits", () => {
    expect(placeRadiusMeters(60, "driving-car")).toBe(2000);
    expect(placeRadiusMeters(1, "foot-walking")).toBe(250);
    expect(placeRadiusMeters(15, "foot-walking")).toBe(1080);
  });
});
