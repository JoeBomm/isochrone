import { haversineMeters } from "./geometry";
import type { ScoredCandidate } from "./scoring";

/**
 * Greedy: walk best-first, keep a point only if it is at least `thresholdMeters`
 * from every already-kept point. (Old code averaged merged points; the rewrite
 * keeps the better-ranked point instead.)
 */
export function dedupe(sorted: ScoredCandidate[], thresholdMeters: number): ScoredCandidate[] {
  const kept: ScoredCandidate[] = [];
  for (const c of sorted) {
    if (kept.every((k) => haversineMeters(k.coordinate, c.coordinate) >= thresholdMeters)) kept.push(c);
  }
  return kept;
}
