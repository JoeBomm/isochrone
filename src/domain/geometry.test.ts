import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  centroid,
  medianPoint,
  pairwiseMidpoints,
  boundingBox,
  gridInBox,
  roundCoordinate,
} from "./geometry";

const finite = (c: { lat: number; lng: number }) =>
  Number.isFinite(c.lat) && Number.isFinite(c.lng);

describe("geometry", () => {
  it("haversine: 1 degree of longitude at the equator", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    expect(Math.abs(d - 111195) / 111195).toBeLessThan(0.01);
  });

  it("centroid of a unit square is its center", () => {
    const c = centroid([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 0 },
      { lat: 1, lng: 1 },
    ]);
    expect(c.lat).toBeCloseTo(0.5);
    expect(c.lng).toBeCloseTo(0.5);
  });

  it("medianPoint takes per-axis medians", () => {
    const m = medianPoint([
      { lat: 0, lng: 10 },
      { lat: 1, lng: 0 },
      { lat: 5, lng: 4 },
    ]);
    expect(m).toEqual({ lat: 1, lng: 4 });
  });

  it("pairwiseMidpoints of 3 points has length 3", () => {
    const mids = pairwiseMidpoints([
      { lat: 0, lng: 0 },
      { lat: 2, lng: 0 },
      { lat: 0, lng: 2 },
    ]);
    expect(mids).toHaveLength(3);
    expect(mids[0]).toEqual({ lat: 1, lng: 0 });
  });

  it("boundingBox pads by ratio", () => {
    const b = boundingBox(
      [
        { lat: 0, lng: 0 },
        { lat: 10, lng: 20 },
      ],
      0.1,
    );
    expect(b.south).toBeCloseTo(-1);
    expect(b.north).toBeCloseTo(11);
    expect(b.west).toBeCloseTo(-2);
    expect(b.east).toBeCloseTo(22);
  });

  it("gridInBox(box, 5) has 25 points including edges", () => {
    const box = { south: 0, west: 0, north: 4, east: 8 };
    const g = gridInBox(box, 5);
    expect(g).toHaveLength(25);
    expect(g[0]).toEqual({ lat: 0, lng: 0 });
    expect(g[24]).toEqual({ lat: 4, lng: 8 });
  });

  it("coincident points give a minimum-span box and finite grid", () => {
    const p = { lat: 45, lng: 9 };
    const b = boundingBox([p, p]);
    expect(b.north).toBeGreaterThan(b.south);
    expect(b.east).toBeGreaterThan(b.west);
    const g = gridInBox(b, 5);
    expect(g).toHaveLength(25);
    expect(g.every(finite)).toBe(true);
  });

  it("gridInBox size 1 is finite (box center)", () => {
    const g = gridInBox({ south: 0, west: 0, north: 2, east: 2 }, 1);
    expect(g).toEqual([{ lat: 1, lng: 1 }]);
  });

  it("roundCoordinate rounds both axes and never returns -0", () => {
    expect(roundCoordinate({ lat: 42.4614, lng: -83.1827 }, 1)).toEqual({ lat: 42.5, lng: -83.2 });
    expect(Object.is(roundCoordinate({ lat: -0.01, lng: 0 }, 1).lat, 0)).toBe(true);
  });
});
