export interface Coordinate {
  lat: number;
  lng: number;
}

export type TravelMode = "driving-car" | "cycling-regular" | "foot-walking";

export type OptimizationGoal = "MINIMAX" | "MINIMIZE_TOTAL" | "MINIMIZE_VARIANCE";

export interface Candidate {
  id: string;
  coordinate: Coordinate;
  kind: "ANCHOR" | "GRID";
}

export const PLACE_TYPES = [
  "accommodation",
  "bar",
  "cafe",
  "cinema",
  "gym",
  "library",
  "museum",
  "park",
  "playground",
  "restaurant",
  "shop",
] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];

export interface Place {
  /** OSM element id, stable across requests. */
  id: string;
  name: string;
  type: PlaceType;
  coordinate: Coordinate;
  /** Only present when OSM has address tags for the place. */
  address?: string;
}
