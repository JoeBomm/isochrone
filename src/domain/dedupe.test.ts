import { describe, expect, it } from "vitest";
import { dedupe } from "./dedupe";
import type { ScoredCandidate } from "./scoring";

const sc = (id: string, lat: number, lng: number, score: number): ScoredCandidate => ({
  id,
  coordinate: { lat, lng },
  kind: "GRID",
  perPersonSeconds: [score],
  max: score,
  mean: score,
  total: score,
  variance: 0,
  score,
});

describe("dedupe", () => {
  it("returns [] for empty input", () => {
    expect(dedupe([], 1000)).toEqual([]);
  });
  it("drops the worse of two points closer than the threshold", () => {
    const r = dedupe([sc("a", 51, 0, 1), sc("b", 51.001, 0, 2)], 500); // ~111 m
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });
  it("keeps points farther than the threshold, preserving order", () => {
    const r = dedupe([sc("a", 51, 0, 1), sc("b", 51.1, 0, 2)], 2500);
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("compares against survivors only (chain)", () => {
    // a-b 1.1km, b-c 1.1km, a-c 2.2km; threshold 1.5km: b dropped by a, c kept
    const r = dedupe([sc("a", 51, 0, 1), sc("b", 51.01, 0, 2), sc("c", 51.02, 0, 3)], 1500);
    expect(r.map((x) => x.id)).toEqual(["a", "c"]);
  });
  it("does not mutate input", () => {
    const input = [sc("a", 51, 0, 1), sc("b", 51, 0, 2)];
    dedupe(input, 100);
    expect(input).toHaveLength(2);
  });
});
