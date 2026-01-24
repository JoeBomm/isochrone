// Export all algorithm modules for modular architecture
export { AnchorGenerator, anchorGenerator } from './anchors'
export { GridGenerator, gridGenerator } from './coarseGrid'
export { LocalRefinementGenerator, localRefinementGenerator, type CandidatePoint } from './localRefinement'
export { DeduplicationService, deduplicationService } from './deduplication'
export {
  TravelTimeScoringService,
  scoringService,
  OptimizationGoal,
  extractTravelTimesForDestination,
  convertTravelTimeMatrix,
  type ScoringService,
  type PerPersonTravelTime,
  type TravelTimeMetrics,
  type ScoredHypothesisPoint,
  type ScoringConfig
} from './scoring'

// Re-export common types for convenience
export type { HypothesisPoint } from 'types/graphql'
export type { Location, Coordinate, BoundingBox } from '../geometry'