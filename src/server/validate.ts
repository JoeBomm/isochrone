import {
  DEDUP_THRESHOLD_METERS,
  GEOCODE_QUERY_MAX_LENGTH,
  GRID_SIZE,
  ISOCHRONE_MINUTES,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  TOP_M,
  VALIDATION_LIMITS as L,
} from "../domain/constants";
import { PLACE_TYPES, type Coordinate, type OptimizationGoal, type PlaceType, type TravelMode } from "../domain/types";
import { ValidationError } from "./findMeetingPoints";
import { MATRIX_MAX_ROUTES } from "./ors/client";

/**
 * Boundary validation for server-function input. Inputs arrive from the
 * network as `unknown`; every parser builds a fresh object containing only
 * known keys (unknown keys are dropped) or throws ValidationError with a
 * human-readable message.
 */

const TRAVEL_MODES: readonly TravelMode[] = ["driving-car", "cycling-regular", "foot-walking"];
const GOALS: readonly OptimizationGoal[] = ["MINIMAX", "MINIMIZE_TOTAL", "MINIMIZE_VARIANCE"];
const DEFAULT_MODE: TravelMode = "driving-car";
const DEFAULT_GOAL: OptimizationGoal = "MINIMAX";
const DEFAULT_PLACE_MINUTES = 15;

export interface ParsedFindInput {
  participants: Coordinate[];
  mode: TravelMode;
  goal: OptimizationGoal;
  topM: number;
  gridSize: number;
  dedupeMeters: number;
  /** Absent = no place search; the request behaves exactly as before. */
  placeType?: PlaceType;
  /** Travel time the place-search radius is derived from. Only used with placeType. */
  minutes?: number;
}

export interface ParsedIsochroneInput {
  center: Coordinate;
  minutes: number;
  mode: TravelMode;
}

function record(x: unknown, what: string): Record<string, unknown> {
  if (typeof x !== "object" || x === null || Array.isArray(x)) {
    throw new ValidationError(`${what} must be an object`);
  }
  return x as Record<string, unknown>;
}

function coordinate(x: unknown, what: string): Coordinate {
  const o = typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
  const lat = o?.lat;
  const lng = o?.lng;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new ValidationError(
      `${what} must have a latitude between -90 and 90 and a longitude between -180 and 180`,
    );
  }
  return { lat, lng };
}

function oneOf<T extends string>(x: unknown, allowed: readonly T[], fallback: T, what: string): T {
  if (x === undefined) return fallback;
  if (typeof x !== "string" || !(allowed as readonly string[]).includes(x)) {
    throw new ValidationError(`${what} must be one of: ${allowed.join(", ")}`);
  }
  return x as T;
}

function integer(x: unknown, fallback: number | undefined, min: number, max: number, what: string): number {
  if (x === undefined && fallback !== undefined) return fallback;
  if (typeof x !== "number" || !Number.isInteger(x) || x < min || x > max) {
    throw new ValidationError(`${what} must be a whole number between ${min} and ${max}`);
  }
  return x;
}

function finite(x: unknown, fallback: number, min: number, max: number, what: string): number {
  if (x === undefined) return fallback;
  if (typeof x !== "number" || !Number.isFinite(x) || x < min || x > max) {
    throw new ValidationError(`${what} must be a number between ${min} and ${max}`);
  }
  return x;
}

/**
 * Upper bound on ORS matrix routes for one findMeetingPoints request:
 * participants x candidates, where candidates = centroid + median +
 * n participants + n(n-1)/2 pairwise midpoints + gridSize^2 grid points
 * (see domain/candidates.ts).
 */
export function matrixRoutes(participants: number, gridSize: number): number {
  const n = participants;
  return n * (2 + n + (n * (n - 1)) / 2 + gridSize * gridSize);
}

export function parseFindInput(x: unknown): ParsedFindInput {
  const o = record(x, "Request");
  if (!Array.isArray(o.participants)) {
    throw new ValidationError("participants must be a list of locations");
  }
  const n = o.participants.length;
  if (n < MIN_PARTICIPANTS || n > MAX_PARTICIPANTS) {
    throw new ValidationError(
      `Between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS} participants are required (got ${n})`,
    );
  }
  const participants = o.participants.map((p, i) => coordinate(p, `Participant ${i + 1}`));
  const mode = oneOf(o.mode, TRAVEL_MODES, DEFAULT_MODE, "mode");
  const goal = oneOf(o.goal, GOALS, DEFAULT_GOAL, "goal");
  const topM = integer(o.topM, TOP_M, L.MIN_TOP_M, L.MAX_TOP_M, "topM");
  const gridSize = integer(o.gridSize, GRID_SIZE, L.MIN_GRID_SIZE, L.MAX_GRID_SIZE, "gridSize");
  const dedupeMeters = finite(
    o.dedupeMeters,
    DEDUP_THRESHOLD_METERS,
    L.MIN_DEDUPLICATION_THRESHOLD,
    L.MAX_DEDUPLICATION_THRESHOLD,
    "dedupeMeters",
  );
  const routes = matrixRoutes(n, gridSize);
  if (routes > MATRIX_MAX_ROUTES) {
    throw new ValidationError(
      `This request is too large for the routing service (${routes} routes, limit ${MATRIX_MAX_ROUTES}). ` +
        `Use fewer participants or a smaller grid size.`,
    );
  }
  const base = { participants, mode, goal, topM, gridSize, dedupeMeters };
  if (o.placeType === undefined || o.placeType === null) return base;
  const placeType = oneOf(o.placeType, PLACE_TYPES, PLACE_TYPES[0], "placeType");
  const minutes = integer(o.minutes, DEFAULT_PLACE_MINUTES, ISOCHRONE_MINUTES.MIN, ISOCHRONE_MINUTES.MAX, "minutes");
  return { ...base, placeType, minutes };
}

export function parseIsochroneInput(x: unknown): ParsedIsochroneInput {
  const o = record(x, "Request");
  const center = coordinate(o.center, "center");
  const minutes = integer(o.minutes, undefined, ISOCHRONE_MINUTES.MIN, ISOCHRONE_MINUTES.MAX, "minutes");
  const mode = oneOf(o.mode, TRAVEL_MODES, DEFAULT_MODE, "mode");
  return { center, minutes, mode };
}

export interface ParsedGeocodeInput {
  text: string;
  focus?: Coordinate;
}

/**
 * Geocode input: a bare query string, or `{ text, focus? }` where `focus` is
 * a point to bias results toward (e.g. the other participants' centroid).
 */
export function parseGeocodeInput(x: unknown): ParsedGeocodeInput {
  if (typeof x === "string") return { text: parseGeocodeQuery(x) };
  const o = record(x, "Search input");
  const text = parseGeocodeQuery(o.text);
  if (o.focus === undefined || o.focus === null) return { text };
  return { text, focus: coordinate(o.focus, "Search focus") };
}

/** Trimmed, whitespace-collapsed query; rejects empty and over-long input. */
export function parseGeocodeQuery(x: unknown): string {
  if (typeof x !== "string") throw new ValidationError("Search text must be a string");
  // Check the raw length first so a huge payload is rejected before any regex work.
  if (x.length > GEOCODE_QUERY_MAX_LENGTH * 4) {
    throw new ValidationError(`Search text must be at most ${GEOCODE_QUERY_MAX_LENGTH} characters`);
  }
  const q = x.trim().replace(/\s+/g, " ");
  if (q.length === 0) throw new ValidationError("Enter an address or place to search for");
  if (q.length > GEOCODE_QUERY_MAX_LENGTH) {
    throw new ValidationError(`Search text must be at most ${GEOCODE_QUERY_MAX_LENGTH} characters`);
  }
  return q;
}
