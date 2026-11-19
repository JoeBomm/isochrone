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
