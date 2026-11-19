import { describe, expect, it } from "vitest";
import { generateCandidates } from "./candidates";

const P = [
  { lat: 51.5, lng: -0.1 },
  { lat: 51.6, lng: -0.2 },
  { lat: 51.55, lng: 0.0 },
];

describe("generateCandidates", () => {
  it("emits anchors first, then grid", () => {
    const cs = generateCandidates(P, 4);
    // centroid + median + 3 participants + 3 midpoints = 8 anchors
    expect(cs.filter((c) => c.kind === "ANCHOR")).toHaveLength(8);
    expect(cs.filter((c) => c.kind === "GRID")).toHaveLength(16);
    expect(cs.slice(0, 8).every((c) => c.kind === "ANCHOR")).toBe(true);
    expect(cs[2].coordinate).toEqual(P[0]);
  });
  it("has unique, stable ids even with coincident points", () => {
    const same = [P[0], P[0]];
    const a = generateCandidates(same, 3);
    const b = generateCandidates(same, 3);
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });
  it("throws a clear error on empty participants", () => {
    expect(() => generateCandidates([], 5)).toThrow(/participant/i);
  });
  it("works for a single participant", () => {
    const cs = generateCandidates([P[0]], 3);
    expect(cs.every((c) => Number.isFinite(c.coordinate.lat))).toBe(true);
  });
});
