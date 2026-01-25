/**
 * Modular scoring service for hypothesis point evaluation
 *
 * This module provides swappable optimization goals for scoring hypothesis points:
 * - Minimize average travel time: Optimizes for overall efficiency
 * - Minimize variance: Optimizes for fairness/equity in travel times
 * - Minimize total travel time: Optimizes for collective efficiency
 *
 * The service uses a new PerPersonTravelTime data structure with outbound field
 * to support future expansion for round-trip calculations.
 */

import type { HypothesisPoint } from 'types/graphql'

import { logger } from '../logger'

/**
 * Travel time data structure for a single person to a hypothesis point
 */
export interface PerPersonTravelTime {
  /** Outbound travel time in minutes */
  outbound: number
  // Future expansion: return?: number for round-trip calculations
}

/**
 * Travel time metrics calculated for a hypothesis point
 */
export interface TravelTimeMetrics {
  /** Maximum travel time among all participants */
  maxTravelTime: number
  /** Average travel time across all participants */
  averageTravelTime: number
  /** Total travel time for all participants */
  totalTravelTime: number
  /** Variance in travel times (for fairness optimization) */
  variance?: number
}

/**
 * Hypothesis point with calculated travel time metrics and score
 */
export interface ScoredHypothesisPoint extends HypothesisPoint {
  /** Travel time metrics for this hypothesis point */
  travelTimeMetrics: TravelTimeMetrics
  /** Score based on selected optimization goal (lower is better) */
  score: number
}

/**
 * Available optimization goals for scoring hypothesis points
 */
export enum OptimizationGoal {
  /** Minimax: Minimize the maximum travel time to N for any location in S */
  MINIMAX = 'MINIMAX',
  /** Minimize Variance: Find location N such that travel times for all S are as equal as possible (minimize variance) */
  MINIMIZE_VARIANCE = 'MINIMIZE_VARIANCE',
  /** Minimize Total: Find location N such that the total sum of travel times for all S locations is minimized */
  MINIMIZE_TOTAL = 'MINIMIZE_TOTAL',
}

/**
 * Configuration for scoring service
 */
export interface ScoringConfig {
  /** Selected optimization goal */
  optimizationGoal: OptimizationGoal
  /** Whether to include variance calculation (required for MINIMIZE_VARIANCE) */
  includeVariance?: boolean
}

/**
 * Interface for scoring service implementations
 */
export interface ScoringService {
  /**
   * Score hypothesis points based on travel time data and optimization goal
   * @param points Array of hypothesis points to score
   * @param travelTimeData Travel time data for each point (points[i] corresponds to travelTimeData[i])
   * @param config Scoring configuration with optimization goal
   * @returns Array of scored hypothesis points sorted by score (best first)
   */
  scorePoints(
    points: HypothesisPoint[],
    travelTimeData: PerPersonTravelTime[][],
    config: ScoringConfig
  ): ScoredHypothesisPoint[]

  /**
   * Calculate travel time metrics for a single hypothesis point
   * @param travelTimes Array of travel times from all participants to this point
   * @param includeVariance Whether to calculate variance metric
   * @returns Travel time metrics object
   */
  calculateTravelTimeMetrics(
    travelTimes: PerPersonTravelTime[],
    includeVariance?: boolean
  ): TravelTimeMetrics

  /**
   * Calculate score for a hypothesis point based on optimization goal
   * @param metrics Travel time metrics for the point
   * @param goal Optimization goal to use for scoring
   * @returns Score value (lower is better)
   */
  calculateScore(metrics: TravelTimeMetrics, goal: OptimizationGoal): number
}

/**
 * Default implementation of the scoring service with swappable optimization goals
 */
export class TravelTimeScoringService implements ScoringService {
  /**
   * Score hypothesis points based on travel time data and optimization goal
   * @param points Array of hypothesis points to score
   * @param travelTimeData Travel time data for each point (points[i] corresponds to travelTimeData[i])
   * @param config Scoring configuration with optimization goal
   * @returns Array of scored hypothesis points sorted by score (best first)
   * @throws Error if input validation fails or scoring encounters errors
   */
  scorePoints(
    points: HypothesisPoint[],
    travelTimeData: PerPersonTravelTime[][],
    config: ScoringConfig
  ): ScoredHypothesisPoint[] {
    // Input validation
    if (!points || points.length === 0) {
      throw new Error('No hypothesis points provided for scoring')
    }

    if (!travelTimeData || travelTimeData.length === 0) {
      throw new Error('No travel time data provided for scoring')
    }

    if (points.length !== travelTimeData.length) {
      throw new Error(
        `Mismatch between points (${points.length}) and travel time data (${travelTimeData.length})`
      )
    }

    if (!config || !config.optimizationGoal) {
      throw new Error('No optimization goal specified in scoring configuration')
    }

    // Validate optimization goal
    if (!Object.values(OptimizationGoal).includes(config.optimizationGoal)) {
      throw new Error(`Invalid optimization goal: ${config.optimizationGoal}`)
    }

    try {
      logger.info(
        `Scoring ${points.length} hypothesis points with goal: ${config.optimizationGoal}`
      )

      const scoredPoints: ScoredHypothesisPoint[] = []

      // Score each hypothesis point
      for (let i = 0; i < points.length; i++) {
        const point = points[i]
        const travelTimes = travelTimeData[i]

        // Validate travel time data for this point
        if (!travelTimes || travelTimes.length === 0) {
          logger.warn(
            `No travel time data for hypothesis point ${point.id}, skipping`
          )
          continue
        }

        // Validate that all travel times are valid
        const validTravelTimes = travelTimes.filter(
          (tt) =>
            tt &&
            typeof tt.outbound === 'number' &&
            Number.isFinite(tt.outbound) &&
            tt.outbound >= 0
        )

        if (validTravelTimes.length === 0) {
          logger.warn(
            `No valid travel times for hypothesis point ${point.id}, skipping`
          )
          continue
        }

        if (validTravelTimes.length < travelTimes.length) {
          logger.warn(
            `Some invalid travel times for hypothesis point ${point.id} (${validTravelTimes.length}/${travelTimes.length} valid)`
          )
        }

        try {
          // Calculate travel time metrics
          const includeVariance =
            config.includeVariance ||
            config.optimizationGoal === OptimizationGoal.MINIMIZE_VARIANCE
          const metrics = this.calculateTravelTimeMetrics(
            validTravelTimes,
            includeVariance
          )

          // Calculate score based on optimization goal
          const score = this.calculateScore(metrics, config.optimizationGoal)

          // Create scored hypothesis point
          const scoredPoint: ScoredHypothesisPoint = {
            ...point,
            travelTimeMetrics: metrics,
            score,
          }

          scoredPoints.push(scoredPoint)

          logger.debug(
            `Scored point ${point.id}: score=${score.toFixed(2)}, max=${metrics.maxTravelTime.toFixed(1)}min, avg=${metrics.averageTravelTime.toFixed(1)}min`
          )
        } catch (pointError) {
          logger.error(
            `Failed to score hypothesis point ${point.id}:`,
            pointError
          )
          // Continue with other points rather than failing completely
        }
      }

      if (scoredPoints.length === 0) {
        throw new Error('No hypothesis points could be scored successfully')
      }

      // Sort by score (lower is better)
      scoredPoints.sort((a, b) => a.score - b.score)

      logger.info(
        `Scoring complete: ${scoredPoints.length} points scored, best score: ${scoredPoints[0].score.toFixed(2)}`
      )

      return scoredPoints
    } catch (error) {
      logger.error('Hypothesis point scoring failed:', error)
      throw new Error(`Hypothesis point scoring failed: ${error.message}`)
    }
  }

  /**
   * Calculate travel time metrics for a single hypothesis point
   * @param travelTimes Array of travel times from all participants to this point
   * @param includeVariance Whether to calculate variance metric
   * @returns Travel time metrics object
   * @throws Error if travel times are invalid
   */
  calculateTravelTimeMetrics(
    travelTimes: PerPersonTravelTime[],
    includeVariance: boolean = false
  ): TravelTimeMetrics {
    if (!travelTimes || travelTimes.length === 0) {
      throw new Error('No travel times provided for metrics calculation')
    }

    // Extract outbound travel times
    const outboundTimes = travelTimes.map((tt) => tt.outbound)

    // Validate all travel times are valid numbers
    const invalidTimes = outboundTimes.filter(
      (time) => typeof time !== 'number' || !Number.isFinite(time) || time < 0
    )

    if (invalidTimes.length > 0) {
      throw new Error(
        `Invalid travel times found: ${invalidTimes.length} out of ${outboundTimes.length}`
      )
    }

    try {
      // Calculate basic metrics
      const maxTravelTime = Math.max(...outboundTimes)
      const totalTravelTime = outboundTimes.reduce((sum, time) => sum + time, 0)
      const averageTravelTime = totalTravelTime / outboundTimes.length

      // Calculate variance if requested
      let variance: number | undefined
      if (includeVariance) {
        const squaredDifferences = outboundTimes.map((time) =>
          Math.pow(time - averageTravelTime, 2)
        )
        variance =
          squaredDifferences.reduce((sum, diff) => sum + diff, 0) /
          outboundTimes.length
      }

      const metrics: TravelTimeMetrics = {
        maxTravelTime,
        averageTravelTime,
        totalTravelTime,
        variance,
      }

      return metrics
    } catch (error) {
      throw new Error(
        `Travel time metrics calculation failed: ${error.message}`
      )
    }
  }

  /**
   * Calculate score for a hypothesis point based on optimization goal
   * @param metrics Travel time metrics for the point
   * @param goal Optimization goal to use for scoring
   * @returns Score value (lower is better)
   * @throws Error if metrics are invalid or goal is unsupported
   */
  calculateScore(metrics: TravelTimeMetrics, goal: OptimizationGoal): number {
    if (!metrics) {
      throw new Error('No travel time metrics provided for score calculation')
    }

    // Validate required metrics
    if (
      typeof metrics.maxTravelTime !== 'number' ||
      !Number.isFinite(metrics.maxTravelTime)
    ) {
      throw new Error('Invalid maxTravelTime in metrics')
    }

    if (
      typeof metrics.averageTravelTime !== 'number' ||
      !Number.isFinite(metrics.averageTravelTime)
    ) {
      throw new Error('Invalid averageTravelTime in metrics')
    }

    if (
      typeof metrics.totalTravelTime !== 'number' ||
      !Number.isFinite(metrics.totalTravelTime)
    ) {
      throw new Error('Invalid totalTravelTime in metrics')
    }

    try {
      switch (goal) {
        case OptimizationGoal.MINIMAX:
          // Score based on maximum travel time (Minimax goal)
          return metrics.maxTravelTime

        case OptimizationGoal.MINIMIZE_VARIANCE:
          // Score based on variance (fairness optimization)
          if (
            typeof metrics.variance !== 'number' ||
            !Number.isFinite(metrics.variance)
          ) {
            throw new Error(
              'Variance not calculated for MINIMIZE_VARIANCE goal'
            )
          }
          return metrics.variance

        case OptimizationGoal.MINIMIZE_TOTAL:
          // Score based on total travel time
          return metrics.totalTravelTime

        default:
          throw new Error(`Unsupported optimization goal: ${goal}`)
      }
    } catch (error) {
      throw new Error(
        `Score calculation failed for goal ${goal}: ${error.message}`
      )
    }
  }
}

/**
 * Utility function to convert travel time matrix to PerPersonTravelTime format
 * @param travelTimeMatrix 2D array where travelTimeMatrix[originIndex][destIndex] = travel time
 * @param destinationIndex Index of the destination (hypothesis point) to extract
 * @returns Array of PerPersonTravelTime objects for the specified destination
 */
export function extractTravelTimesForDestination(
  travelTimeMatrix: number[][],
  destinationIndex: number
): PerPersonTravelTime[] {
  if (!travelTimeMatrix || travelTimeMatrix.length === 0) {
    throw new Error('No travel time matrix provided')
  }

  if (destinationIndex < 0) {
    throw new Error('Destination index must be non-negative')
  }

  const travelTimes: PerPersonTravelTime[] = []

  for (
    let originIndex = 0;
    originIndex < travelTimeMatrix.length;
    originIndex++
  ) {
    const row = travelTimeMatrix[originIndex]

    if (!row || destinationIndex >= row.length) {
      throw new Error(
        `Invalid destination index ${destinationIndex} for origin ${originIndex}`
      )
    }

    const outbound = row[destinationIndex]

    travelTimes.push({ outbound })
  }

  return travelTimes
}

/**
 * Utility function to convert entire travel time matrix to PerPersonTravelTime format
 * @param travelTimeMatrix 2D array where travelTimeMatrix[originIndex][destIndex] = travel time
 * @returns Array of PerPersonTravelTime arrays, one for each destination
 */
export function convertTravelTimeMatrix(
  travelTimeMatrix: number[][]
): PerPersonTravelTime[][] {
  if (!travelTimeMatrix || travelTimeMatrix.length === 0) {
    throw new Error('No travel time matrix provided')
  }

  const numDestinations = travelTimeMatrix[0]?.length || 0
  if (numDestinations === 0) {
    throw new Error('Travel time matrix has no destinations')
  }

  const result: PerPersonTravelTime[][] = []

  for (let destIndex = 0; destIndex < numDestinations; destIndex++) {
    const travelTimesForDest = extractTravelTimesForDestination(
      travelTimeMatrix,
      destIndex
    )
    result.push(travelTimesForDest)
  }

  return result
}

// Export singleton instance
export const scoringService = new TravelTimeScoringService()
