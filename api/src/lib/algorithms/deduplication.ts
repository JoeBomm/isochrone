import type { HypothesisPoint } from 'types/graphql'

import { VALIDATION_LIMITS } from '../constants'
import { createDeduplicationError } from '../errors'
import { geometryService, type Coordinate } from '../geometry'
import { logger } from '../logger'

/**
 * DeduplicationService class for proximity-based point merging
 * Implements configurable distance threshold for point merging
 * Replaces N1 with average of N1 and N2 when closer than threshold
 * Discards N2 and recalculates rankings deterministically
 */
export class DeduplicationService {
  /**
   * Apply proximity deduplication to a set of hypothesis points
   * @param points Array of hypothesis points to deduplicate
   * @param thresholdMeters Distance threshold in meters for point merging
   * @returns Array of deduplicated hypothesis points with recalculated rankings
   * @throws Error if invalid parameters or calculation fails
   */
  deduplicate(
    points: HypothesisPoint[],
    thresholdMeters: number
  ): HypothesisPoint[] {
    if (!points || points.length === 0) {
      return []
    }

    if (
      thresholdMeters < 0 ||
      thresholdMeters > VALIDATION_LIMITS.MAX_DEDUPLICATION_SERVICE_THRESHOLD
    ) {
      throw createDeduplicationError(
        `Invalid distance threshold: ${thresholdMeters}m. Must be between 0 and ${VALIDATION_LIMITS.MAX_DEDUPLICATION_SERVICE_THRESHOLD}`
      )
    }

    try {
      // Create a working copy to avoid mutating the original array
      const workingPoints = [...points]
      let mergeOccurred = true
      let iterationCount = 0
      const maxIterations = points.length // Prevent infinite loops

      logger.info(
        `Starting deduplication with ${points.length} points, threshold: ${thresholdMeters}m`
      )

      // Continue merging until no more merges occur
      while (mergeOccurred && iterationCount < maxIterations) {
        mergeOccurred = false
        iterationCount++

        // Check all pairs for proximity
        for (let i = 0; i < workingPoints.length && !mergeOccurred; i++) {
          for (let j = i + 1; j < workingPoints.length && !mergeOccurred; j++) {
            const point1 = workingPoints[i]
            const point2 = workingPoints[j]

            let distance: number
            try {
              distance = this.calculateDistance(
                point1.coordinate,
                point2.coordinate
              )
            } catch (distanceError) {
              logger.warn(
                `Failed to calculate distance between points ${point1.id} and ${point2.id}, skipping:`,
                distanceError
              )
              continue // Skip this pair and continue with others
            }

            if (distance <= thresholdMeters) {
              // Merge points: replace point1 with average, remove point2
              let mergedPoint: HypothesisPoint
              try {
                mergedPoint = this.mergePoints(point1, point2)
              } catch (mergeError) {
                logger.warn(
                  `Failed to merge points ${point1.id} and ${point2.id}, skipping:`,
                  mergeError
                )
                continue // Skip this merge and continue with others
              }

              // Replace point1 with merged point and remove point2
              workingPoints[i] = mergedPoint
              workingPoints.splice(j, 1)

              mergeOccurred = true
              logger.debug(
                `Merged points ${point1.id} and ${point2.id} (distance: ${distance.toFixed(1)}m)`
              )
            }
          }
        }
      }

      if (iterationCount >= maxIterations) {
        logger.warn(
          `Deduplication stopped after ${maxIterations} iterations to prevent infinite loop`
        )
      }

      // Recalculate rankings deterministically
      let deduplicatedPoints: HypothesisPoint[]
      try {
        deduplicatedPoints = this.recalculateRankings(workingPoints)
      } catch (rankingError) {
        logger.warn(
          'Failed to recalculate rankings, using original order:',
          rankingError
        )
        deduplicatedPoints = workingPoints // Fallback to unranked points
      }

      logger.info(
        `Deduplication complete: ${points.length} → ${deduplicatedPoints.length} points (${points.length - deduplicatedPoints.length} merged)`
      )

      return deduplicatedPoints
    } catch (error) {
      if (error.code === 'DEDUPLICATION_FAILED') {
        throw error // Re-throw structured errors
      }
      throw createDeduplicationError(
        `Deduplication failed: ${error.message}`,
        error
      )
    }
  }

  /**
   * Calculate distance between two coordinates in meters
   * Uses Haversine formula for accurate geodesic distance calculation
   * @param coord1 First coordinate
   * @param coord2 Second coordinate
   * @returns Distance in meters
   */
  calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
    if (!coord1 || !coord2) {
      throw new Error('Invalid coordinates provided for distance calculation')
    }

    // Validate coordinates
    if (
      !geometryService.validateCoordinateBounds(coord1) ||
      !geometryService.validateCoordinateBounds(coord2)
    ) {
      throw new Error('Coordinates are outside valid bounds')
    }

    // Haversine formula for geodesic distance
    const R = 6371000 // Earth's radius in meters
    const lat1Rad = (coord1.latitude * Math.PI) / 180
    const lat2Rad = (coord2.latitude * Math.PI) / 180
    const deltaLatRad = ((coord2.latitude - coord1.latitude) * Math.PI) / 180
    const deltaLngRad = ((coord2.longitude - coord1.longitude) * Math.PI) / 180

    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(deltaLngRad / 2) *
        Math.sin(deltaLngRad / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const distance = R * c

    return distance
  }

  /**
   * Merge two hypothesis points by averaging their coordinates
   * @param point1 First hypothesis point (will be replaced with merged result)
   * @param point2 Second hypothesis point (will be discarded)
   * @returns New hypothesis point with averaged coordinates and combined metadata
   */
  mergePoints(
    point1: HypothesisPoint,
    point2: HypothesisPoint
  ): HypothesisPoint {
    if (!point1 || !point2) {
      throw new Error('Invalid points provided for merging')
    }

    try {
      // Calculate average coordinates
      const averageCoordinate: Coordinate = {
        latitude: (point1.coordinate.latitude + point2.coordinate.latitude) / 2,
        longitude:
          (point1.coordinate.longitude + point2.coordinate.longitude) / 2,
      }

      // Validate the averaged coordinate
      if (!geometryService.validateCoordinateBounds(averageCoordinate)) {
        throw new Error('Merged coordinate is outside valid bounds')
      }

      // Create merged point with combined metadata
      const mergedPoint: HypothesisPoint = {
        id: `merged_${point1.id}_${point2.id}`,
        coordinate: averageCoordinate,
        type: point1.type, // Keep the type of the first point
        phase: point1.phase, // Keep the phase of the first point
        score: point1.score, // Keep the score of the first point (better score since points are pre-sorted)
        travelTimeMetrics: point1.travelTimeMetrics, // Keep the travel time metrics of the first point
        metadata: this.combineMetadata(point1.metadata, point2.metadata),
      }

      return mergedPoint
    } catch (error) {
      throw new Error(`Point merging failed: ${error.message}`)
    }
  }

  /**
   * Recalculate rankings for deduplicated points deterministically
   * Sorts points by score (if available) or falls back to geographic sorting
   * @param points Array of deduplicated hypothesis points
   * @returns Array of points with consistent ranking
   */
  recalculateRankings(points: HypothesisPoint[]): HypothesisPoint[] {
    if (!points || points.length === 0) {
      return []
    }

    try {
      // Sort points by score if available, otherwise fall back to geographic sorting
      const sortedPoints = [...points].sort((a, b) => {
        // Primary sort: by score (lower scores are better)
        if (a.score !== undefined && b.score !== undefined) {
          return a.score - b.score
        }

        // If only one has a score, prioritize the one with a score
        if (a.score !== undefined && b.score === undefined) {
          return -1
        }
        if (a.score === undefined && b.score !== undefined) {
          return 1
        }

        // Fallback sorting for points without scores:
        // 1. By type (to group similar point types together)
        if (a.type !== b.type) {
          return a.type.localeCompare(b.type)
        }

        // 2. By latitude (for geographic consistency)
        if (
          Math.abs(a.coordinate.latitude - b.coordinate.latitude) > 0.000001
        ) {
          return a.coordinate.latitude - b.coordinate.latitude
        }

        // 3. By longitude (for geographic consistency)
        if (
          Math.abs(a.coordinate.longitude - b.coordinate.longitude) > 0.000001
        ) {
          return a.coordinate.longitude - b.coordinate.longitude
        }

        // 4. By ID (for absolute determinism)
        return a.id.localeCompare(b.id)
      })

      return sortedPoints
    } catch (error) {
      throw new Error(`Ranking recalculation failed: ${error.message}`)
    }
  }

  /**
   * Combine metadata from two points during merging
   * @param metadata1 Metadata from first point
   * @param metadata2 Metadata from second point
   * @returns Combined metadata object
   * @private
   */
  private combineMetadata(metadata1: any, metadata2: any): any {
    // If both metadata are null, return null
    if (!metadata1 && !metadata2) {
      return null
    }

    // If one is null, return the other
    if (!metadata1) return metadata2
    if (!metadata2) return metadata1

    // Combine metadata objects
    const combined: any = { ...metadata1 }

    // Handle specific metadata fields
    if (metadata1.participantId && metadata2.participantId) {
      // If both have participant IDs, create an array
      combined.participantId = [
        metadata1.participantId,
        metadata2.participantId,
      ]
    } else if (metadata2.participantId) {
      combined.participantId = metadata2.participantId
    }

    if (metadata1.pairIds && metadata2.pairIds) {
      // If both have pair IDs, combine them
      combined.pairIds = [
        ...(metadata1.pairIds || []),
        ...(metadata2.pairIds || []),
      ]
    } else if (metadata2.pairIds) {
      combined.pairIds = metadata2.pairIds
    }

    // Add merge information
    combined.mergedFrom = [
      metadata1.mergedFrom || [],
      metadata2.mergedFrom || [],
    ].flat()

    return combined
  }

  /**
   * Validate deduplication parameters
   * @param points Array of hypothesis points
   * @param thresholdMeters Distance threshold in meters
   * @returns True if parameters are valid for deduplication
   */
  validateDeduplicationParameters(
    points: HypothesisPoint[],
    thresholdMeters: number
  ): boolean {
    if (!points || !Array.isArray(points)) {
      return false
    }

    if (
      typeof thresholdMeters !== 'number' ||
      thresholdMeters < 0 ||
      thresholdMeters > 10000
    ) {
      return false
    }

    // Validate that all points have valid coordinates
    return points.every(
      (point) =>
        point &&
        point.coordinate &&
        geometryService.validateCoordinateBounds(point.coordinate)
    )
  }

  /**
   * Get statistics about deduplication results
   * @param originalPoints Original points before deduplication
   * @param deduplicatedPoints Points after deduplication
   * @returns Statistics object with merge information
   */
  getDeduplicationStats(
    originalPoints: HypothesisPoint[],
    deduplicatedPoints: HypothesisPoint[]
  ): {
    originalCount: number
    finalCount: number
    mergedCount: number
    reductionPercentage: number
  } {
    const originalCount = originalPoints?.length || 0
    const finalCount = deduplicatedPoints?.length || 0
    const mergedCount = originalCount - finalCount
    const reductionPercentage =
      originalCount > 0 ? (mergedCount / originalCount) * 100 : 0

    return {
      originalCount,
      finalCount,
      mergedCount,
      reductionPercentage: Math.round(reductionPercentage * 100) / 100,
    }
  }
}

// Export singleton instance
export const deduplicationService = new DeduplicationService()
