import {
  GEOCODE_FOCUS_DECIMALS,
  ISOCHRONE_MINUTES,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
} from "@/domain/constants";
import { centroid, roundCoordinate } from "@/domain/geometry";
import type { Coordinate, OptimizationGoal, TravelMode } from "@/domain/types";

/**
 * Form model for the meeting-point form (Task 8). Pure helpers, no React, so
 * they can be shared by the form components and by Task 9's results view.
 */

export { MAX_PARTICIPANTS, MIN_PARTICIPANTS };

/**
 * What the form submits to the server: exactly the fields
 * `parseFindInput` (src/server/validate.ts) reads that the form controls.
 * topM / gridSize / dedupeMeters are left to the server defaults.
 */
export interface FindInput {
  participants: Coordinate[];
  mode: TravelMode;
  goal: OptimizationGoal;
}

/** A participant the user has resolved to a geocoded place. */
export interface ResolvedPlace {
  coordinate: Coordinate;
  label: string;
}

/** Display data for one submitted participant, in the same order as `input.participants`. */
export interface PersonSummary {
  /** Stable colour/number slot, 0-based. */
  slot: number;
  /** Name shown to the user ("Ana", or "Person 1" when no name was typed). */
  name: string;
  /** Badge text: the first letter of the typed name, or the person number. */
  initial: string;
  /** The geocoded place label. */
  label: string;
}

/**
 * Form output. `input` goes to `findMeetingPointsAction` as is;
 * `isochroneMinutes` is for the later `getIsochroneAction` call (it is not a
 * findMeetingPoints field); `people` lets the results view show names and
 * colours for each participant.
 */
export interface MeetingFormValues {
  input: FindInput;
  isochroneMinutes: number;
  people: PersonSummary[];
}

/** One row of the participant list while editing. */
export interface ParticipantDraft {
  id: string;
  slot: number;
  name: string;
  /** Text in the address field. */
  query: string;
  /** Set when a suggestion is chosen; cleared as soon as the text is edited. */
  place: ResolvedPlace | null;
}

/** Participant colours from the UX direction, in slot order (tokens --person-1..6). */
export const PERSON_COLOUR_COUNT = 6;

export const TRAVEL_MODES: ReadonlyArray<{ value: TravelMode; label: string }> = [
  { value: "driving-car", label: "Car" },
  { value: "cycling-regular", label: "Bike" },
  { value: "foot-walking", label: "Walk" },
];

export const GOALS: ReadonlyArray<{ value: OptimizationGoal; label: string }> = [
  { value: "MINIMAX", label: "Fairest for everyone" },
  { value: "MINIMIZE_TOTAL", label: "Least total travel" },
  { value: "MINIMIZE_VARIANCE", label: "Most similar times" },
];

/** Isochrone minute choices, limited to the server's accepted range. */
export const ISOCHRONE_MINUTE_OPTIONS: readonly number[] = [5, 10, 15, 20, 30, 45, 60].filter(
  (m) => m >= ISOCHRONE_MINUTES.MIN && m <= ISOCHRONE_MINUTES.MAX,
);
export const DEFAULT_ISOCHRONE_MINUTES = 10;

/** Minimum trimmed query length before the address search runs. */
export const MIN_QUERY_LENGTH = 3;

/** CSS custom property for a slot's colour; 7+ reuse the six colours. */
export function personColourIndex(slot: number): number {
  return (slot % PERSON_COLOUR_COUNT) + 1;
}

/** People 7+ get a square badge so they differ from 1-6 by shape, not only by text. */
export function personShape(slot: number): "round" | "square" {
  return slot >= PERSON_COLOUR_COUNT ? "square" : "round";
}

/**
 * Point to bias address search toward for row `id`: the centroid of the other
 * rows' resolved places, rounded like the server does (so equal focus = equal
 * cache entry). Undefined when no other row is resolved; the server then
 * falls back to the caller's IP location.
 */
export function searchFocus(
  rows: Pick<ParticipantDraft, "id" | "place">[],
  id: string,
): Coordinate | undefined {
  const others = rows.flatMap((r) => (r.id !== id && r.place ? [r.place.coordinate] : []));
  return others.length > 0 ? roundCoordinate(centroid(others), GEOCODE_FOCUS_DECIMALS) : undefined;
}

export function displayName(draft: Pick<ParticipantDraft, "name" | "slot">): string {
  const name = draft.name.trim();
  return name || `Person ${draft.slot + 1}`;
}

export function initialFor(draft: Pick<ParticipantDraft, "name" | "slot">): string {
  const name = draft.name.trim();
  return name ? Array.from(name)[0].toLocaleUpperCase() : String(draft.slot + 1);
}

/** Lowest slot not used by `rows` (keeps colours stable when rows are removed). */
export function freeSlot(rows: ReadonlyArray<Pick<ParticipantDraft, "slot">>): number {
  const used = new Set(rows.map((r) => r.slot));
  let slot = 0;
  while (used.has(slot)) slot += 1;
  return slot;
}

/**
 * A new empty row. `id` must be unique within the form; the caller owns the
 * counter (no module state, so server render and hydration agree).
 */
export function newDraft(
  rows: ReadonlyArray<Pick<ParticipantDraft, "slot">>,
  id: string,
): ParticipantDraft {
  return { id, slot: freeSlot(rows), name: "", query: "", place: null };
}

/** The first MIN_PARTICIPANTS rows, with deterministic ids p1, p2, ... */
export function initialDrafts(): ParticipantDraft[] {
  const rows: ParticipantDraft[] = [];
  for (let i = 1; i <= MIN_PARTICIPANTS; i += 1) rows.push(newDraft(rows, `p${i}`));
  return rows;
}

/** Rows with text in the address field that has not been resolved to a place. */
export function unresolvedRows(rows: readonly ParticipantDraft[]): ParticipantDraft[] {
  return rows.filter((r) => r.place === null && r.query.trim() !== "");
}

export function resolvedRows(rows: readonly ParticipantDraft[]): ParticipantDraft[] {
  return rows.filter((r) => r.place !== null);
}
