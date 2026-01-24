import type { HypothesisPoint } from 'types/graphql'

import { createAnchorGenerationError } from '../errors'
import { geometryService, type Location, type Coordinate } from '../geometry'
import { logger } from '../logger'

/**
 * AnchorGenerator class for generating baseline hypothesis points (Phase 0)
 * Implements existing logic: geographic centroid, median coordinates, participant locations, pairwise midpoints
 * Anchor points are always included in calculations regardless of UI toggles
 */
export class AnchorGenerator {
  /**
   * Generate all anchor point types for a set of locations
   * @param locations Array of participant locations
   * @returns Array of anchor hypothesis points
   * @throws Error if insufficient locations provided or coordinate validation fails
   */
  generateAnchors(locations: Location[]): HypothesisPoint[] {
    if (!locations || locations.length === 0) {
      throw createAnchorGenerationError(
        'No locations provided for anchor point generation'
      )
    }

    try {
      const anchorPoints: HypothesisPoint[] = []

      // 1. Add geographic centroid
      try {
        const geographicCentroid =
          geometryService.calculateGeographicCentroid(locations)
        anchorPoints.push({
          id: 'anchor_geographic_centroid',
          coordinate: geographicCentroid,
          type: 'GEOGRAPHIC_CENTROID',
          metadata: null,
        })
      } catch (centroidError) {
        logger.warn(
          'Failed to calculate geographic centroid, skipping:',
          centroidError
        )
        // Continue without geographic centroid - not critical for algorithm
      }

      // 2. Add median coordinate
      try {
        const medianCoordinate =
          geometryService.calculateMedianCoordinate(locations)
        anchorPoints.push({
          id: 'anchor_median_coordinate',
          coordinate: medianCoordinate,
          type: 'MEDIAN_COORDINATE',
          metadata: null,
        })
      } catch (medianError) {
        logger.warn(
          'Failed to calculate median coordinate, skipping:',
          medianError
        )
        // Continue without median coordinate - not critical for algorithm
      }

      // 3. Add participant locations (critical - must succeed)
      try {
        locations.forEach((location, index) => {
          // Validate participant coordinates
          if (!geometryService.validateCoordinateBounds(location.coordinate)) {
            throw new Error(
              `Invalid coordinates for participant location ${location.name}: ${location.coordinate.latitude}, ${location.coordinate.longitude}`
            )
          }

          anchorPoints.push({
            id: `anchor_participant_${index}`,
            coordinate: location.coordinate,
            type: 'PARTICIPANT_LOCATION',
            metadata: {
              participantId: location.id,
              pairIds: null,
            },
          })
        })
      } catch (participantError) {
        throw createAnchorGenerationError(
          `Failed to process participant locations: ${participantError.message}`,
          participantError
        )
      }

      // 4. Add pairwise midpoints (only if we have at least 2 locations)
      if (locations.length >= 2) {
        try {
          const pairwiseMidpoints =
            geometryService.calculatePairwiseMidpoints(locations)

          let pairIndex = 0
          for (let i = 0; i < locations.length; i++) {
            for (let j = i + 1; j < locations.length; j++) {
              if (pairIndex < pairwiseMidpoints.length) {
                anchorPoints.push({
                  id: `anchor_pairwise_${i}_${j}`,
                  coordinate: pairwiseMidpoints[pairIndex],
                  type: 'PAIRWISE_MIDPOINT',
                  metadata: {
                    participantId: null,
                    pairIds: [locations[i].id, locations[j].id],
                  },
                })
                pairIndex++
              }
            }
          }
        } catch (pairwiseError) {
          logger.warn(
            'Failed to calculate pairwise midpoints, skipping:',
            pairwiseError
          )
          // Continue without pairwise midpoints - not critical for algorithm
        }
      }

      // Validate all generated anchor points
      const invalidPoints = anchorPoints.filter(
        (point) => !geometryService.validateCoordinateBounds(point.coordinate)
      )
      if (invalidPoints.length > 0) {
        throw createAnchorGenerationError(
          `Generated invalid anchor points: ${invalidPoints.map((p) => p.id).join(', ')}`
        )
      }

      // Ensure we have at least participant locations (minimum requirement)
      const participantPoints = anchorPoints.filter(
        (point) => point.type === 'PARTICIPANT_LOCATION'
      )
      if (participantPoints.length === 0) {
        throw createAnchorGenerationError(
          'No valid participant location anchor points generated'
        )
      }

      logger.info(
        `Generated ${anchorPoints.length} anchor points: ${anchorPoints.map((p) => p.type).join(', ')}`
      )
      return anchorPoints
    } catch (error) {
      if (error.code === 'ANCHOR_GENERATION_FAILED') {
        throw error // Re-throw structured errors
      }
      throw createAnchorGenerationError(
        `Anchor point generation failed: ${error.message}`,
        error
      )
    }
  }

  /**
   * Get the count of anchor points that would be generated for a given number of locations
   * Useful for UI display and validation
   * @param locationCount Number of participant locations
   * @returns Expected number of anchor points
   */
  getExpectedAnchorCount(locationCount: number): number {
    if (locationCount < 1) {
      return 0
    }

    // Geographic centroid (1) + Median coordinate (1) + Participant locations (locationCount)
    let count = 2 + locationCount

    // Add pairwise midpoints if we have at least 2 locations
    if (locationCount >= 2) {
      // Number of unique pairs: C(n,2) = n*(n-1)/2
      const pairwiseCount = (locationCount * (locationCount - 1)) / 2
      count += pairwiseCount
    }

    return count
  }

  /**
   * Validate that anchor points are visually identifiable
   * Ensures anchor points have proper IDs and types for map visualization
   * @param anchorPoints Array of anchor hypothesis points
   * @returns True if all anchor points are properly formatted for visualization
   */
  validateVisualizationReadiness(anchorPoints: HypothesisPoint[]): boolean {
    if (!anchorPoints || anchorPoints.length === 0) {
      return false
    }

    // Check that all anchor points have proper IDs starting with 'anchor_'
    const hasProperIds = anchorPoints.every(
      (point) => point.id && point.id.startsWith('anchor_')
    )

    // Check that all anchor points have valid types
    const validTypes = [
      'GEOGRAPHIC_CENTROID',
      'MEDIAN_COORDINATE',
      'PARTICIPANT_LOCATION',
      'PAIRWISE_MIDPOINT',
    ]
    const hasValidTypes = anchorPoints.every((point) =>
      validTypes.includes(point.type)
    )

    // Check that all coordinates are valid
    const hasValidCoordinates = anchorPoints.every((point) =>
      geometryService.validateCoordinateBounds(point.coordinate)
    )

    return hasProperIds && hasValidTypes && hasValidCoordinates
  }
}

// Export singleton instance
export const anchorGenerator = new AnchorGenerator()
