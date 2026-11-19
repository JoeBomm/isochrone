import { generateCandidates } from "../domain/candidates";
import {
  CACHE_TTL,
  DEDUP_THRESHOLD_METERS,
  GRID_SIZE,
  TOP_M,
  VALIDATION_LIMITS,
} from "../domain/constants";
import { dedupe } from "../domain/dedupe";
import { scoreCandidates, type ScoredCandidate } from "../domain/scoring";
import type { Candidate, Coordinate, OptimizationGoal, TravelMode } from "../domain/types";
import { cached, cacheKey } from "./cache";
import type { OrsClient } from "./ors/client";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NoReachablePointError extends Error {
  constructor(message = "No reachable meeting point: no candidate location can be reached by every participant.") {
    super(message);
    this.name = "NoReachablePointError";
  }
}

export interface FindMeetingPointsInput {
  participants: Coordinate[];
  mode: TravelMode;
  goal: OptimizationGoal;
  topM?: number;
  gridSize?: number;
  dedupeMeters?: number;
}

export interface FindMeetingPointsResult {
  points: ScoredCandidate[];
  candidatesEvaluated: number;
  matrixCalls: 1;
  debugCandidates: Candidate[];
}

const L = VALIDATION_LIMITS;

function intInRange(name: string, v: number, min: number, max: number): void {
  if (!Number.isInteger(v) || v < min || v > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
}

function validate(input: FindMeetingPointsInput) {
  const { participants } = input;
  if (!Array.isArray(participants) || participants.length < 2) {
    throw new ValidationError("At least 2 participants are required");
  }
  for (const p of participants) {
    if (
      !p ||
      typeof p.lat !== "number" ||
      typeof p.lng !== "number" ||
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lng) ||
      Math.abs(p.lat) > 90 ||
      Math.abs(p.lng) > 180
    ) {
      throw new ValidationError("Participant coordinates must be finite and within valid lat/lng ranges");
    }
  }
  const topM = input.topM ?? TOP_M;
  const gridSize = input.gridSize ?? GRID_SIZE;
  const dedupeMeters = input.dedupeMeters ?? DEDUP_THRESHOLD_METERS;
  intInRange("topM", topM, L.MIN_TOP_M, L.MAX_TOP_M);
  intInRange("gridSize", gridSize, L.MIN_GRID_SIZE, L.MAX_GRID_SIZE);
  if (
    typeof dedupeMeters !== "number" ||
    !Number.isFinite(dedupeMeters) ||
    dedupeMeters < L.MIN_DEDUPLICATION_THRESHOLD ||
    dedupeMeters > L.MAX_DEDUPLICATION_THRESHOLD
  ) {
    throw new ValidationError(
      `dedupeMeters must be between ${L.MIN_DEDUPLICATION_THRESHOLD} and ${L.MAX_DEDUPLICATION_THRESHOLD}`,
    );
  }
  return { topM, gridSize, dedupeMeters };
}

function isMatrixOf(rows: number, cols: number) {
  return (v: unknown): v is (number | null)[][] =>
    Array.isArray(v) &&
    v.length === rows &&
    v.every(
      (row) =>
        Array.isArray(row) &&
        row.length === cols &&
        row.every((t) => t === null || (typeof t === "number" && !Number.isNaN(t))),
    );
}

export async function findMeetingPoints(
  input: FindMeetingPointsInput,
  deps: { ors: OrsClient; kv: KVNamespace },
): Promise<FindMeetingPointsResult> {
  const { topM, gridSize, dedupeMeters } = validate(input);
  const { participants, mode, goal } = input;

  const candidates = generateCandidates(participants, gridSize);
  const coords = candidates.map((c) => c.coordinate);
  if (!coords.every((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))) {
    throw new ValidationError("Could not generate valid candidate locations for these participants");
  }

  const key = await cacheKey("matrix", [participants, coords, mode]);
  const times = await cached(
    deps.kv,
    key,
    CACHE_TTL.MATRIX_SECONDS,
    () => deps.ors.matrix(participants, coords, mode),
    isMatrixOf(participants.length, coords.length),
  );

  const scored = scoreCandidates(times, candidates, goal);
  if (scored.length === 0) throw new NoReachablePointError();

  return {
    points: dedupe(scored, dedupeMeters).slice(0, topM),
    candidatesEvaluated: candidates.length,
    matrixCalls: 1,
    debugCandidates: candidates,
  };
}
