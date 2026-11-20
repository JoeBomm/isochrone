import type { ScoredCandidate } from "@/domain/scoring";
import type { Coordinate } from "@/domain/types";
import type { ActionError } from "@/server/actionHandlers";
import type { FindMeetingPointsResult } from "@/server/findMeetingPoints";
import type { GeoMultiPolygon, GeoPolygon } from "@/server/ors/client";
import type { SheetSnap } from "./shell/BottomSheet";

/**
 * Pure helpers for the results view and the map (Task 9). No React, no
 * Leaflet, so they run in node tests. Server modules are imported for their
 * types only (erased at build time; nothing server-side reaches the client).
 */

export type { ActionError, FindMeetingPointsResult, ScoredCandidate };
export type IsochroneGeometry = GeoPolygon | GeoMultiPolygon;

/** What the results area is showing. */
export type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: FindMeetingPointsResult }
  | { status: "error"; error: ActionError };

/** Isochrone state for the selected row. */
export interface IsochroneView {
  pointId: string;
  status: "loading" | "ready" | "error";
  minutes: number;
  /** "car" / "bike" / "foot", used in "... by car". */
  modeLabel: string;
  message?: string;
  onRetry: () => void;
}

// Fairness strip -----------------------------------------------------------

/** Width given to a zero-length trip so the bar is still visible. */
export const MIN_STRIP_PERCENT = 2;

/**
 * Seconds that a full-width strip represents: the longest single trip in ANY
 * result, so bars are comparable across results, not only within one.
 */
export function timeScale(results: readonly Pick<ScoredCandidate, "perPersonSeconds">[]): number {
  let max = 0;
  for (const r of results) for (const t of r.perPersonSeconds) if (Number.isFinite(t) && t > max) max = t;
  return Math.max(1, max);
}

export function stripPercent(seconds: number, scale: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0 || !(scale > 0)) return MIN_STRIP_PERCENT;
  return Math.max(MIN_STRIP_PERCENT, Math.min(100, (seconds / scale) * 100));
}

/** Whole minutes as text; "<1" for a short non-zero trip. */
export function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m === 0 && seconds > 0 ? "<1" : String(m);
}

/** Indexes of every person tied for the longest trip (the MINIMAX value). */
export function longestIndexes(seconds: readonly number[]): number[] {
  if (seconds.length === 0) return [];
  const max = Math.max(...seconds);
  return seconds.flatMap((t, i) => (t === max ? [i] : []));
}

export const MODE_LABEL: Record<string, string> = {
  "driving-car": "car",
  "cycling-regular": "bike",
  "foot-walking": "foot",
};

// Debug flag -----------------------------------------------------------------

/** `?debug=1` (exactly "1") turns on the hypothesis-point layer. */
export function isDebugSearch(search: string): boolean {
  return new URLSearchParams(search).get("debug") === "1";
}

// Errors -----------------------------------------------------------------------

export const RATE_LIMIT_FALLBACK_SECONDS = 10;

export function retrySeconds(retryAfterSeconds: number | undefined): number {
  if (retryAfterSeconds === undefined || !Number.isFinite(retryAfterSeconds)) {
    return RATE_LIMIT_FALLBACK_SECONDS;
  }
  return Math.max(1, Math.ceil(retryAfterSeconds));
}

export function secondsLabel(n: number): string {
  return n === 1 ? "1 second" : `${n} seconds`;
}

export const COPY = {
  noReachable:
    "No place is reachable for everyone by this travel mode. Try another mode or move a start point.",
  quota: "The route service has reached its daily limit. Try again later.",
  generic: "Something went wrong on our side. Try again.",
  rateLimited: (n: number) => `You're searching too fast. Try again in ${secondsLabel(n)}.`,
  canRetry: "You can search again now.",
} as const;

/**
 * User-facing copy for a failed request (UX direction "States"). `retry` says
 * whether a Retry button makes sense (only for the generic failure).
 * Validation messages come from our own server validation and are already
 * human-readable, so they are shown as is.
 */
export function errorCopy(error: ActionError, secondsLeft?: number): { message: string; retry: boolean } {
  switch (error.code) {
    case "no_reachable_point":
      return { message: COPY.noReachable, retry: false };
    case "quota":
      return { message: COPY.quota, retry: false };
    case "rate_limited":
      return { message: COPY.rateLimited(secondsLeft ?? retrySeconds(error.retryAfterSeconds)), retry: false };
    case "validation":
      return { message: error.message, retry: false };
    default:
      return { message: COPY.generic, retry: true };
  }
}

/** A thrown server-function call (network, 5xx) as an ActionError. */
export const THROWN_ERROR: ActionError = { code: "upstream", message: COPY.generic };

// Map geometry ----------------------------------------------------------------

export type LatLngBounds = [[south: number, west: number], [north: number, east: number]];

export function boundsOf(coords: readonly Coordinate[]): LatLngBounds | null {
  let s = Infinity;
  let w = Infinity;
  let n = -Infinity;
  let e = -Infinity;
  for (const c of coords) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    s = Math.min(s, c.lat);
    n = Math.max(n, c.lat);
    w = Math.min(w, c.lng);
    e = Math.max(e, c.lng);
  }
  return Number.isFinite(s) ? [[s, w], [n, e]] : null;
}

/** Every vertex of a GeoJSON Polygon/MultiPolygon as {lat,lng}. */
export function geometryCoordinates(geometry: IsochroneGeometry): Coordinate[] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const out: Coordinate[] = [];
  for (const rings of polygons) for (const ring of rings) for (const [lng, lat] of ring) out.push({ lat, lng });
  return out;
}

/** Desktop breakpoint, matching shell.css. */
export const DESKTOP_MIN_WIDTH = 960;
const PEEK_REM = 9.5; // --sheet-peek (results.test.ts keeps them in step)

/**
 * Pixels of the map hidden under the mobile bottom sheet, so fit-to-bounds can
 * keep points in the visible part. "full" hides the map, so it keeps the half
 * framing for when the sheet comes back down.
 */
export function sheetInsetPx(
  snap: SheetSnap,
  viewport: { width: number; height: number; rem: number },
): number {
  if (viewport.width >= DESKTOP_MIN_WIDTH) return 0;
  if (snap === "peek") return Math.round(PEEK_REM * viewport.rem);
  return Math.round(viewport.height / 2);
}
