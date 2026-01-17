import { logger } from './logger'
import { geometryService, type Coordinate } from './geometry'
import type { TravelTimeMatrix, HypothesisPoint } from 'types/graphql'

export interface MatrixService {
  findMinimaxOptimal(matrix: TravelTimeMatrix): {
    optimalIndex: number
    maxTravelTime: number
    averageTravelTime: number
  }
  applyTieBreakingRules(
    candidates: Array<{index: number, maxTime: number, avgTime: number}>,
    hypothesisPoints: HypothesisPoint[],
    geographicCentroid: Coordinate
  ): number
}

/**
 * Service for minimax optimization of travel time matrices
 * Implements the core algorithm for finding optimal meeting points
 */
export class TravelTimeMatrixService implements MatrixService {
  /**
   * Find the hypothesis point that minimizes the maximum travel time
   * @param matrix Travel time matrix with origins (participants) and destinations (hypothesis points)
   * @returns Object containing optimal index, max travel time, and average travel time
   * @throws Error if matrix is invalid or no valid hypothesis points exist
   */
  findMinimaxOptimal(matrix: TravelTimeMatrix): {
    optimalIndex: number
    maxTravelTime: number
    averageTravelTime: number
  } {
    if (!matrix || !matrix.travelTimes || matrix.travelTimes.length === 0) {
      throw new Error('Invalid travel time matrix: no travel times provided')
    }

    if (!matrix.destinations || matrix.destinations.length === 0) {
      throw new Error('Invalid travel time matrix: no destinations provided')
    }

    if (!matrix.origins || matrix.origins.length === 0) {
      throw new Error('Invalid travel time matrix: no origins provided')
    }

    // Validate matrix dimensions
    const numOrigins = matrix.origins.length
    const numDestinations = matrix.destinations.length

    if (matrix.travelTimes.length !== numOrigins) {
      throw new Error(`Matrix dimension mismatch: expected ${numOrigins} origin rows, got ${matrix.travelTimes.length}`)
    }

    for (let i = 0; i < matrix.travelTimes.length; i++) {
      if (!Array.isArray(matrix.travelTimes[i]) || matrix.travelTimes[i].length !== numDestinations) {
        throw new Error(`Matrix dimension mismatch: row ${i} has ${matrix.travelTimes[i]?.length || 0} columns, expected ${numDestinations}`)
      }
    }

    logger.info(`Analyzing travel time matrix: ${numOrigins} origins × ${numDestinations} destinations`)

    let optimalIndex = -1
    let minMaxTime = Infinity
    let optimalAvgTime = Infinity

    // For each destination (hypothesis point), calculate the maximum travel time from all origins
    for (let destIndex = 0; destIndex < numDestinations; destIndex++) {
      const travelTimesToDest: number[] = []
      let hasValidRoute = false

      // Collect travel times from all origins to this destination
      for (let originIndex = 0; originIndex < numOrigins; originIndex++) {
        const travelTime = matrix.travelTimes[originIndex][destIndex]

        // Skip unreachable routes (Infinity or negative values)
        if (travelTime !== Infinity && travelTime >= 0 && Number.isFinite(travelTime)) {
          travelTimesToDest.push(travelTime)
          hasValidRoute = true
        }
      }

      // Skip hypothesis points that are unreachable from any origin
      if (!hasValidRoute || travelTimesToDest.length === 0) {
        logger.debug(`Skipping hypothesis point ${destIndex}: no valid routes`)
        continue
      }

      // Skip hypothesis points that are unreachable from all origins
      if (travelTimesToDest.length < numOrigins) {
        logger.debug(`Skipping hypothesis point ${destIndex}: unreachable from ${numOrigins - travelTimesToDest.length} origins`)
        continue
      }

      // Calculate max and average travel time for this hypothesis point
      const maxTime = Math.max(...travelTimesToDest)
      const avgTime = travelTimesToDest.reduce((sum, time) => sum + time, 0) / travelTimesToDest.length

      logger.debug(`Hypothesis point ${destIndex}: max=${maxTime}min, avg=${avgTime.toFixed(1)}min`)

      // Check if this is better than current optimal (lower max time)
      if (maxTime < minMaxTime) {
        optimalIndex = destIndex
        minMaxTime = maxTime
        optimalAvgTime = avgTime
        logger.debug(`New optimal point: index ${destIndex} with max time ${maxTime}min`)
      }
    }

    // Ensure we found at least one valid hypothesis point
    if (optimalIndex === -1) {
      throw new Error('No valid hypothesis points found: all destinations are unreachable from one or more origins')
    }

    logger.info(`Minimax optimization complete: optimal index ${optimalIndex}, max time ${minMaxTime}min, avg time ${optimalAvgTime.toFixed(1)}min`)

    return {
      optimalIndex,
      maxTravelTime: minMaxTime,
      averageTravelTime: optimalAvgTime
    }
  }

  /**
   * Apply tie-breaking rules when multiple hypothesis points have equal maximum travel time
   * Rules: 1) Lowest average travel time, 2) Closest to geographic centroid
   * @param candidates Array of candidate hypothesis points with equal max travel time
   * @param hypothesisPoints Array of all hypothesis points for distance calculation
   * @param geographicCentroid Geographic centroid for distance tie-breaking
   * @returns Index of the selected hypothesis point after tie-breaking
   * @throws Error if no candidates provided or tie-breaking fails
   */
  applyTieBreakingRules(
    candidates: Array<{index: number, maxTime: number, avgTime: number}>,
    hypothesisPoints: HypothesisPoint[],
    geographicCentroid: Coordinate
  ): number {
    if (!candidates || candidates.length === 0) {
      throw new Error('No candidates provided for tie-breaking')
    }

    if (candidates.length === 1) {
      return candidates[0].index
    }

    if (!hypothesisPoints || hypothesisPoints.length === 0) {
      throw new Error('No hypothesis points provided for tie-breaking')
    }

    if (!geographicCentroid) {
      throw new Error('No geographic centroid provided for tie-breaking')
    }

    logger.info(`Applying tie-breaking rules for ${candidates.length} candidates with equal max travel time`)

    // Rule 1: Select candidates with lowest average travel time
    const minAvgTime = Math.min(...candidates.map(c => c.avgTime))
    const avgTimeCandidates = candidates.filter(c => Math.abs(c.avgTime - minAvgTime) < 0.01) // Allow small floating point differences

    logger.debug(`After average time tie-breaking: ${avgTimeCandidates.length} candidates (min avg: ${minAvgTime.toFixed(1)}min)`)

    if (avgTimeCandidates.length === 1) {
      return avgTimeCandidates[0].index
    }

    // Rule 2: Select candidate closest to geographic centroid
    let closestIndex = -1
    let minDistance = Infinity

    for (const candidate of avgTimeCandidates) {
      const hypothesisPoint = hypothesisPoints[candidate.index]
      if (!hypothesisPoint || !hypothesisPoint.coordinate) {
        logger.warn(`Invalid hypothesis point at index ${candidate.index}`)
        continue
      }

      // Calculate Euclidean distance to geographic centroid
      const distance = this.calculateDistance(hypothesisPoint.coordinate, geographicCentroid)

      logger.debug(`Candidate ${candidate.index}: distance to centroid = ${distance.toFixed(6)}`)

      if (distance < minDistance) {
        minDistance = distance
        closestIndex = candidate.index
      }
    }

    if (closestIndex === -1) {
      throw new Error('Tie-breaking failed: no valid candidates found')
    }

    logger.info(`Tie-breaking complete: selected index ${closestIndex} (closest to centroid: ${minDistance.toFixed(6)})`)
    return closestIndex
  }

  /**
   * Calculate Euclidean distance between two coordinates
   * @param coord1 First coordinate
   * @param coord2 Second coordinate
   * @returns Distance in degrees (for tie-breaking purposes)
   */
  private calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
    const latDiff = coord1.latitude - coord2.latitude
    const lngDiff = coord1.longitude - coord2.longitude
    return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff)
  }
}

// Export singleton instance
export const matrixService = new TravelTimeMatrixService()