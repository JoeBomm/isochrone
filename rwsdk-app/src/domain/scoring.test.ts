import { describe, expect, it } from "vitest";
import { scoreCandidates } from "./scoring";
import type { Candidate } from "./types";

const cand = (id: string): Candidate => ({ id, coordinate: { lat: 0, lng: 0 }, kind: "GRID" });
const cs = [cand("a"), cand("b"), cand("c")];
// times[person][candidate]; a: 10,10 | b: 5,20 | c: 12,8
const times = [
  [10, 5, 12],
  [10, 20, 8],
];

describe("scoreCandidates", () => {
  it("MINIMAX picks lowest max", () => {
    const r = scoreCandidates(times, cs, "MINIMAX");
    expect(r.map((x) => x.id)).toEqual(["a", "c", "b"]);
    expect(r[0].score).toBe(10);
    expect(r[0].perPersonSeconds).toEqual([10, 10]);
  });
  it("MINIMIZE_TOTAL picks lowest sum", () => {
    const r = scoreCandidates(times, cs, "MINIMIZE_TOTAL");
    expect(r[0].score).toBe(20);
    expect(r.map((x) => x.id)).toEqual(["a", "c", "b"]);
    expect(r[0].total).toBe(20);
    expect(r[0].mean).toBe(10);
  });
  it("MINIMIZE_VARIANCE uses population variance", () => {
    const r = scoreCandidates(times, cs, "MINIMIZE_VARIANCE");
    expect(r[0].id).toBe("a");
    expect(r[0].score).toBe(0);
    const b = r.find((x) => x.id === "b")!;
    expect(b.variance).toBe(56.25);
    expect(b.score).toBe(56.25);
  });
  it("breaks ties by max then total", () => {
    // both variance 0; max 10 vs 8
    const t = [
      [10, 8],
      [10, 8],
    ];
    const r = scoreCandidates(t, [cand("x"), cand("y")], "MINIMIZE_VARIANCE");
    expect(r.map((x) => x.id)).toEqual(["y", "x"]);
    // equal max=10, totals 20 vs 15
    const t2 = [
      [10, 10],
      [10, 5],
    ];
    const r2 = scoreCandidates(t2, [cand("x"), cand("y")], "MINIMAX");
    expect(r2.map((x) => x.id)).toEqual(["y", "x"]);
  });
  it("drops candidates with any null", () => {
    const r = scoreCandidates([[10, null, 12], [10, 5, 8]], cs, "MINIMAX");
    expect(r.map((x) => x.id)).toEqual(["a", "c"]);
  });
  it("returns [] when all null or no candidates", () => {
    expect(scoreCandidates([[null, null, null]], cs, "MINIMAX")).toEqual([]);
    expect(scoreCandidates([], [], "MINIMAX")).toEqual([]);
  });
});
