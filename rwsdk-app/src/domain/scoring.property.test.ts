import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dedupe } from "./dedupe";
import { haversineMeters } from "./geometry";
import { scoreCandidates } from "./scoring";
import type { Candidate, OptimizationGoal } from "./types";

const goals: OptimizationGoal[] = ["MINIMAX", "MINIMIZE_TOTAL", "MINIMIZE_VARIANCE"];

const matrix = fc
  .tuple(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 0, max: 12 }))
  .chain(([p, c]) =>
    fc.array(
      fc.array(fc.option(fc.integer({ min: 0, max: 7200 }), { nil: null }), { minLength: c, maxLength: c }),
      { minLength: p, maxLength: p },
    ),
  );

const mkCands = (n: number): Candidate[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, coordinate: { lat: 0, lng: 0 }, kind: "GRID" as const }));

describe("scoreCandidates properties", () => {
  it("output is sorted ascending by score and has no nulls", () => {
    fc.assert(
      fc.property(matrix, fc.constantFrom(...goals), (m, goal) => {
        const r = scoreCandidates(m, mkCands(m[0].length), goal);
        for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeLessThanOrEqual(r[i].score);
        for (const s of r) expect(s.perPersonSeconds.every((x) => Number.isFinite(x))).toBe(true);
        const expected = m[0].map((_, j) => m.every((row) => row[j] !== null)).filter(Boolean).length;
        expect(r).toHaveLength(expected);
      }),
    );
  });
});

describe("dedupe properties", () => {
  it("no pair of survivors is closer than the threshold, and the best is kept", () => {
    const pt = fc.record({ lat: fc.double({ min: 50, max: 50.3, noNaN: true }), lng: fc.double({ min: 0, max: 0.3, noNaN: true }) });
    fc.assert(
      fc.property(fc.array(pt, { minLength: 1, maxLength: 25 }), fc.integer({ min: 0, max: 8000 }), (pts, thr) => {
        const cands = mkCands(pts.length).map((c, i) => ({ ...c, coordinate: pts[i] }));
        const scored = scoreCandidates([pts.map((_, i) => i + 1)], cands, "MINIMAX");
        const out = dedupe(scored, thr);
        expect(out[0].id).toBe(scored[0].id);
        for (let i = 0; i < out.length; i++)
          for (let j = i + 1; j < out.length; j++)
            expect(haversineMeters(out[i].coordinate, out[j].coordinate)).toBeGreaterThanOrEqual(thr);
      }),
    );
  });
});
