import type { Coordinate } from './geometry'

export type TravelMode = 'DRIVING_CAR' | 'CYCLING_REGULAR' | 'FOOT_WALKING'
export type OptimizationGoal =
  | 'MINIMAX'
  | 'MINIMIZE_VARIANCE'
  | 'MINIMIZE_TOTAL'
export type GeoJSONPolygon = any // TODO: Define proper GeoJSON type

export type HypothesisPointType =
  | 'GEOGRAPHIC_CENTROID'
  | 'MEDIAN_COORDINATE'
  | 'PARTICIPANT_LOCATION'
  | 'PAIRWISE_MIDPOINT'
  | 'COARSE_GRID_CELL'
  | 'LOCAL_REFINEMENT_CELL'

export type AlgorithmPhase = 'ANCHOR' | 'COARSE_GRID' | 'LOCAL_REFINEMENT'

export interface HypothesisPoint {
  id: string
  coordinate: Coordinate
  type: HypothesisPointType
  phase: AlgorithmPhase
  score?: number
  travelTimeMetrics?: TravelTimeMetrics
  metadata?: HypothesisPointMetadata | null
}

export interface HypothesisPointMetadata {
  participantId?: string | null
  pairIds?: string[] | null
  mergedFrom?: any[]
}

export interface TravelTimeMetrics {
  maxTravelTime: number
  averageTravelTime: number
  variance: number
  totalTravelTime: number
}

export interface LocationInput {
  address: string
  latitude: number
  longitude: number
}

export interface OptimalLocationResult {
  optimalPoints: OptimalPoint[]
  debugPoints: DebugPoint[]
  matrixApiCalls: number
  totalHypothesisPoints: number
}

export interface OptimalPoint {
  id: string
  coordinate: Coordinate
  travelTimeMetrics: TravelTimeMetrics
  rank: number
}

export interface DebugPoint {
  id: string
  coordinate: Coordinate
  type: string
}

export interface IsochroneResult {
  centerPoint: Coordinate
  fairMeetingArea: GeoJSONPolygon
  individualIsochrones: GeoJSONPolygon[]
}
