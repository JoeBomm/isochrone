import { geometryService, type Coordinate } from '../geometry'
import { logger } from '../logger'
import type { HypothesisPoint } from 'types/graphql'

/**
 * Interface for candidate points with travel time information
 */
export interface CandidatePoint {
  coordinate: Coordinate
  maxTravelTime: number
  id?: string
}

/**
 * LocalRefinementGenerator class for generating local refinement hypothesis points (Phase 2)
 * Creates local grid generation around top M points from combined anchor + coarse grid set
 * Applies proximity deduplication to top M points before generating local grids
 * Generates finer grids centered on each deduplicated point
 */
export class LocalRefinementGenerator {
  /**
   * Generate local refinement hypothesis points around top candidates
   * @param candidates Array of candidate points with travel time information
   * @param topM Number of top candidates to select for local refinement
   * @param deduplicationThreshold Distance threshold in meters for proximity deduplication
   * @param refinementRadiusKm Radius in kilometers for local refinement grids
   * @param fineGridResolution Grid resolution for fine grids (default: 3x3)
   * @returns Array of local refinement hypothesis points
   * @throws Error if invalid parameters or calculation fails
   */
  generateLocalRefinement(
    candidates: CandidatePoint[],
    topM: number = 5,
    deduplicationThreshold: number = 100.0,
    refinementRadiusKm: number = 2.0,
    fineGridResolution: number = 3
  ): HypothesisPoint[] {
    if (!candidates || candidates.length === 0) {
      throw new Error('No candidates provided for local refinement generation')
    }

    if (topM < 1 || topM > 20) {
      throw new Error(`Invalid topM value: ${topM}. Must be between 1 and 20`)
    }

    if (deduplicationThreshold < 10 || deduplicationThreshold > 10000) {
      throw new Error(`Invalid deduplication threshold: ${deduplicationThreshold}m. Must be between 10 and 10000`)
    }

    if (refinementRadiusKm < 0.1 || refinementRadiusKm > 10) {
      throw new Error(`Invalid refinement radius: ${refinementRadiusKm}km. Must be between 0.1 and 10`)
    }

    if (fineGridResolution < 2 || fineGridResolution > 10) {
      throw new Error(`Invalid fine grid resolution: ${fineGridResolution}. Must be between 2 and 10`)
    }

    try {
      // Step 1: Select top M candidates based on travel time
      const topCandidates = this.selectTopCandidates(candidates, topM)
      logger.info(`Selected ${topCandidates.length} top candidates for local refinement`)

      // Step 2: Apply proximity deduplication to top M points
      const deduplicatedCandidates = this.applyProximityDeduplication(topCandidates, deduplicationThreshold)
      logger.info(`After deduplication: ${deduplicatedCandidates.length} candidates remaining`)

      // Step 3: Generate local grids around each deduplicated point
      const localRefinementPoints: HypothesisPoint[] = []

      deduplicatedCandidates.forEach((candidate, candidateIndex) => {
        try {
          const localGridPoints = this.generateLocalGrid(
            candidate.coordinate,
            refinementRadiusKm,
            fineGridResolution,
            candidateIndex
          )
          localRefinementPoints.push(...localGridPoints)
        } catch (error) {
          logger.warn(`Failed to generate local grid for candidate ${candidateIndex}: ${error.message}`)
          // Continue with other candidates
        }
      })

      // Validate all generated local refinement points
      const invalidPoints = localRefinementPoints.filter(point =>
        !geometryService.validateCoordinateBounds(point.coordinate)
      )
      if (invalidPoints.length > 0) {
        throw new Error(`Generated invalid local refinement points: ${invalidPoints.map(p => p.id).join(', ')}`)
      }

      logger.info(`Generated ${localRefinementPoints.length} local refinement hypothesis points from ${deduplicatedCandidates.length} deduplicated candidates`)
      return localRefinementPoints

    } catch (error) {
      throw new Error(`Local refinement generation failed: ${error.message}`)
    }
  }

  /**
   * Select top M candidates based on travel time (ascending order - best first)
   * @param candidates Array of candidate points
   * @param topM Number of top candidates to select
   * @returns Array of top M candidates sorted by travel time
   * @private
   */
  private selectTopCandidates(candidates: CandidatePoint[], topM: number): CandidatePoint[] {
    // Sort by maximum travel time (ascending - best first)
    const sortedCandidates = [...candidates].sort((a, b) => a.maxTravelTime - b.maxTravelTime)

    // Select top M candidates
    return sortedCandidates.slice(0, Math.min(topM, sortedCandidates.length))
  }

  /**
   * Apply proximity deduplication to candidate points
   * When two points are closer than threshold, replace first with average and discard second
   * @param candidates Array of candidate points
   * @param thresholdMeters Distance threshold in meters
   * @returns Array of deduplicated candidate points
   * @private
   */
  private applyProximityDeduplication(candidates: CandidatePoint[], thresholdMeters: number): CandidatePoint[] {
    if (candidates.length <= 1) {
      return candidates
    }

    const deduplicatedCandidates: CandidatePoint[] = []
    const thresholdDegrees = thresholdMeters / 111000 // Approximate conversion to degrees

    for (const candidate of candidates) {
      let merged = false

      // Check if this candidate is close to any existing deduplicated candidate
      for (let i = 0; i < deduplicatedCandidates.length; i++) {
        const existingCandidate = deduplicatedCandidates[i]
        const distance = this.calculateDistance(candidate.coordinate, existingCandidate.coordinate)

        if (distance < thresholdDegrees) {
          // Merge candidates: replace existing with average
          const mergedCandidate: CandidatePoint = {
            coordinate: {
              latitude: (candidate.coordinate.latitude + existingCandidate.coordinate.latitude) / 2,
              longitude: (candidate.coordinate.longitude + existingCandidate.coordinate.longitude) / 2
            },
            maxTravelTime: Math.min(candidate.maxTravelTime, existingCandidate.maxTravelTime), // Keep better travel time
            id: existingCandidate.id // Keep original ID
          }

          deduplicatedCandidates[i] = mergedCandidate
          merged = true
          break
        }
      }

      // If not merged with existing candidate, add as new candidate
      if (!merged) {
        deduplicatedCandidates.push(candidate)
      }
    }

    return deduplicatedCandidates
  }

  /**
   * Calculate simple distance between two coordinates (not geodesic, but sufficient for small distances)
   * @param coord1 First coordinate
   * @param coord2 Second coordinate
   * @returns Distance in degrees
   * @private
   */
  private calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
    const latDiff = coord1.latitude - coord2.latitude
    const lngDiff = coord1.longitude - coord2.longitude
    return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff)
  }

  /**
   * Generate local grid around a center point
   * @param centerPoint Center coordinate for local grid
   * @param radiusKm Radius in kilometers for local grid
   * @param gridResolution Grid resolution (number of cells per side)
   * @param candidateIndex Index of the candidate (for unique IDs)
   * @returns Array of local grid hypothesis points
   * @private
   */
  private generateLocalGrid(
    centerPoint: Coordinate,
    radiusKm: number,
    gridResolution: number,
    candidateIndex: number
  ): HypothesisPoint[] {
    try {
      // Calculate local bounding box around center point
      const localBoundingBox = this.calculateLocalBoundingBox(centerPoint, radiusKm)

      // Generate fine grid points within local bounding box
      const localGridCoordinates = geometryService.generateCoarseGridPoints(localBoundingBox, gridResolution)

      // Convert to hypothesis points with unique IDs
      const localGridPoints: HypothesisPoint[] = localGridCoordinates.map((coordinate, gridIndex) => ({
        id: `local_refinement_${candidateIndex}_${gridIndex}`,
        coordinate,
        type: 'LOCAL_REFINEMENT',
        metadata: null
      }))

      return localGridPoints

    } catch (error) {
      throw new Error(`Local grid generation failed for candidate ${candidateIndex}: ${error.message}`)
    }
  }

  /**
   * Calculate local bounding box around a center point
   * @param center Center coordinate
   * @param radiusKm Radius in kilometers
   * @returns BoundingBox around the center point
   * @private
   */
  private calculateLocalBoundingBox(center: Coordinate, radiusKm: number) {
    // Convert radius from kilometers to degrees (approximate)
    const latPadding = radiusKm / 111
    const lngPadding = radiusKm / (111 * Math.cos(center.latitude * Math.PI / 180))

    const boundingBox = {
      north: center.latitude + latPadding,
      south: center.latitude - latPadding,
      east: center.longitude + lngPadding,
      west: center.longitude - lngPadding
    }

    // Validate bounding box coordinates
    if (boundingBox.south < -90) boundingBox.south = -90
    if (boundingBox.north > 90) boundingBox.north = 90
    if (boundingBox.west < -180) boundingBox.west = -180
    if (boundingBox.east > 180) boundingBox.east = 180

    return boundingBox
  }

  /**
   * Get expected number of local refinement points for given parameters
   * @param topM Number of top candidates
   * @param fineGridResolution Grid resolution per candidate
   * @param estimatedDeduplicationReduction Estimated reduction factor from deduplication (0.0-1.0)
   * @returns Estimated number of local refinement points
   */
  getExpectedLocalRefinementCount(
    topM: number,
    fineGridResolution: number,
    estimatedDeduplicationReduction: number = 0.2
  ): number {
    if (topM < 1 || fineGridResolution < 1) {
      return 0
    }

    // Estimate candidates after deduplication
    const estimatedCandidatesAfterDeduplication = Math.max(1, Math.floor(topM * (1 - estimatedDeduplicationReduction)))

    // Each candidate generates gridResolution^2 points
    return estimatedCandidatesAfterDeduplication * (fineGridResolution * fineGridResolution)
  }

  /**
   * Validate local refinement parameters
   * @param topM Number of top candidates
   * @param deduplicationThreshold Deduplication threshold in meters
   * @param refinementRadiusKm Refinement radius in kilometers
   * @param fineGridResolution Fine grid resolution
   * @returns True if all parameters are valid
   */
  validateLocalRefinementParameters(
    topM: number,
    deduplicationThreshold: number,
    refinementRadiusKm: number,
    fineGridResolution: number
  ): boolean {
    return (
      topM >= 1 && topM <= 20 &&
      deduplicationThreshold >= 10 && deduplicationThreshold <= 10000 &&
      refinementRadiusKm >= 0.1 && refinementRadiusKm <= 10 &&
      fineGridResolution >= 2 && fineGridResolution <= 10
    )
  }

  /**
   * Validate that local refinement points are visually identifiable
   * Ensures points have proper IDs and types for map visualization
   * @param localRefinementPoints Array of local refinement hypothesis points
   * @returns True if all points are properly formatted for visualization
   */
  validateVisualizationReadiness(localRefinementPoints: HypothesisPoint[]): boolean {
    if (!localRefinementPoints || localRefinementPoints.length === 0) {
      return false
    }

    // Check that all points have proper IDs starting with 'local_refinement_'
    const hasProperIds = localRefinementPoints.every(point =>
      point.id && point.id.startsWith('local_refinement_')
    )

    // Check that all points have LOCAL_REFINEMENT type
    const hasValidTypes = localRefinementPoints.every(point =>
      point.type === 'LOCAL_REFINEMENT'
    )

    // Check that all coordinates are valid
    const hasValidCoordinates = localRefinementPoints.every(point =>
      geometryService.validateCoordinateBounds(point.coordinate)
    )

    return hasProperIds && hasValidTypes && hasValidCoordinates
  }
}

// Export singleton instance
export const localRefinementGenerator = new LocalRefinementGenerator()