import type { Candidate, OptimizationGoal } from "./types";

export type ScoredCandidate = Candidate & {
  perPersonSeconds: number[];
  max: number;
  mean: number;
  total: number;
  variance: number;
  score: number;
};

/** times[participantIdx][candidateIdx] in seconds; null = unreachable. */
export function scoreCandidates(
  times: (number | null)[][],
  candidates: Candidate[],
  goal: OptimizationGoal,
): ScoredCandidate[] {
  const out: ScoredCandidate[] = [];
  candidates.forEach((candidate, j) => {
    const perPersonSeconds: number[] = [];
    for (const row of times) {
      const t = row[j];
      if (t === null || t === undefined || !Number.isFinite(t)) return;
      perPersonSeconds.push(t);
    }
    if (perPersonSeconds.length === 0) return;
    const n = perPersonSeconds.length;
    const total = perPersonSeconds.reduce((s, t) => s + t, 0);
    const mean = total / n;
    const max = Math.max(...perPersonSeconds);
    const variance = perPersonSeconds.reduce((s, t) => s + (t - mean) ** 2, 0) / n;
    const score = goal === "MINIMAX" ? max : goal === "MINIMIZE_TOTAL" ? total : variance;
    out.push({ ...candidate, perPersonSeconds, max, mean, total, variance, score });
  });
  // Array.prototype.sort is stable, so remaining ties keep candidate order.
  return out.sort((a, b) => a.score - b.score || a.max - b.max || a.total - b.total);
}
