import { logger } from './logger'
import { cachedOpenRouteClient } from './cachedOpenroute'
import type { TravelMode, TravelTimeMatrix, HypothesisPoint, Location } from 'types/graphql'
import type { Coordinate } from './geometry'

/**
 * Result from batched matrix evaluation for multi-phase hypothesis generation
 */
export interface BatchedMatrixResult {
  /** Combined matrix containing all Phase 0+1 results */
  combinedMatrix: TravelTimeMatrix
  /** Phase-specific breakdown of results */
  phaseResults: PhaseMatrixResult[]
  /** All hypothesis points in order */
  totalHypothesisPoints: HypothesisPoint[]
  /** Number of Matrix API calls made */
  apiCallCount: number
}

/**
 * Result from individual phase matrix evaluation
 */
export interface PhaseMatrixResult {
  /** Phase identifier */
  phase: 'PHASE_0' | 'PHASE_1' | 'PHASE_2'
  /** Matrix for this specific phase */
  matrix: TravelTimeMatrix
  /** Hypothesis points for this phase */
  hypothesisPoints: HypothesisPoint[]
  /** Starting index in the combined matrix */
  startIndex: number
  /** Ending index in the combined matrix */
  endIndex: number
}

/**
 * Service for batched matrix evaluation supporting multi-phase hypothesis generation
 * Implements cost-controlled API usage with single call for Phase 1 and separate calls for Phase 2
 */
export class BatchedMatrixService {
  private apiCallCount = 0

  /**
   * Reset API call counter
   */
  resetApiCallCount(): void {
    this.apiCallCount = 0
  }

  /**
   * Get current API call count for cost monitoring
   */
  getApiCallCount(): number {
    return this.apiCallCount
  }

  /**
   * Evaluate coarse grid using single Matrix API call (Phase 1)
   * Combines Phase 0 (anchors) and Phase 1 (coarse grid) into one API call for efficiency
   * @param origins Array of participant locations
   * @param phase0Points Phase 0 hypothesis points (anchors)
   * @param phase1Points Phase 1 hypothesis points (coarse grid)
   * @param travelMode Travel mode for matrix calculation
   * @returns BatchedMatrixResult containing combined matrix and phase breakdown
   * @throws Error if matrix evaluation fails or invalid parameters
   */
  async evaluateCoarseGridBatched(
    origins: Coordinate[],
    phase0Points: HypothesisPoint[],
    phase1Points: HypothesisPoint[],
    travelMode: TravelMode
  ): Promise<BatchedMatrixResult> {
    if (!origins || origins.length === 0) {
      throw new Error('No origins provided for batched matrix evaluation')
    }

    if (!phase0Points || phase0Points.length === 0) {
      throw new Error('No Phase 0 hypothesis points provided for batched matrix evaluation')
    }

    // Phase 1 points are optional - can be empty array
    const actualPhase1Points = phase1Points || []

    try {
      // Combine all hypothesis points for single API call (Requirements 1.4)
      const allHypothesisPoints = [...phase0Points, ...actualPhase1Points]
      const allDestinations = allHypothesisPoints.map(hp => hp.coordinate)

      logger.info(`Evaluating coarse grid batched: ${origins.length} origins × ${allDestinations.length} destinations (Phase 0: ${phase0Points.length}, Phase 1: ${actualPhase1Points.length})`)

      // Single matrix API call for Phase 0+1 (Requirements 1.4 - single Matrix API call)
      let combinedMatrix: TravelTimeMatrix
      try {
        combinedMatrix = await cachedOpenRouteClient.calculateTravelTimeMatrix(origins, allDestinations, travelMode)
        this.apiCallCount += 1 // Track API call for cost monitoring
        logger.info(`Coarse grid batched API call successful: ${combinedMatrix.travelTimes.length}×${combinedMatrix.travelTimes[0]?.length || 0} (API calls: ${this.apiCallCount})`)
      } catch (apiError) {
        this.apiCallCount += 1 // Track failed API call for cost monitoring
        logger.error('Coarse grid batched API call failed:', apiError)

        // Graceful degradation: try Phase 0 only if combined call fails
        if (actualPhase1Points.length > 0) {
          logger.warn('Attempting graceful degradation to Phase 0 only due to batched matrix failure')
          try {
            const phase0Destinations = phase0Points.map(hp => hp.coordinate)
            combinedMatrix = await cachedOpenRouteClient.calculateTravelTimeMatrix(origins, phase0Destinations, travelMode)
            this.apiCallCount += 1 // Track fallback API call
            logger.info(`Phase 0 fallback successful: ${combinedMatrix.travelTimes.length}×${combinedMatrix.travelTimes[0]?.length || 0} (API calls: ${this.apiCallCount})`)

            // Return Phase 0 only result
            const phase0Matrix = combinedMatrix
            const phaseResults: PhaseMatrixResult[] = [{
              phase: 'PHASE_0',
              matrix: phase0Matrix,
              hypothesisPoints: phase0Points,
              startIndex: 0,
              endIndex: phase0Points.length
            }]

            return {
              combinedMatrix: phase0Matrix,
              phaseResults,
              totalHypothesisPoints: phase0Points,
              apiCallCount: this.apiCallCount
            }
          } catch (fallbackError) {
            logger.error('Phase 0 fallback also failed:', fallbackError)
            throw new Error(`Coarse grid matrix evaluation failed and Phase 0 fallback failed: ${fallbackError.message}`)
          }
        } else {
          throw new Error(`Matrix API call failed: ${apiError.message}`)
        }
      }

      // Validate matrix dimensions
      this.validateMatrixDimensions(combinedMatrix, origins.length, allDestinations.length)

      // Create phase results with index ranges
      const phaseResults: PhaseMatrixResult[] = []

      // Phase 0 result
      const phase0StartIndex = 0
      const phase0EndIndex = phase0Points.length
      const phase0Matrix = this.extractPhaseMatrix(combinedMatrix, phase0StartIndex, phase0EndIndex, phase0Points)

      phaseResults.push({
        phase: 'PHASE_0',
        matrix: phase0Matrix,
        hypothesisPoints: phase0Points,
        startIndex: phase0StartIndex,
        endIndex: phase0EndIndex
      })

      // Phase 1 result (if phase1Points exist)
      if (actualPhase1Points.length > 0) {
        const phase1StartIndex = phase0Points.length
        const phase1EndIndex = phase0Points.length + actualPhase1Points.length
        const phase1Matrix = this.extractPhaseMatrix(combinedMatrix, phase1StartIndex, phase1EndIndex, actualPhase1Points)

        phaseResults.push({
          phase: 'PHASE_1',
          matrix: phase1Matrix,
          hypothesisPoints: actualPhase1Points,
          startIndex: phase1StartIndex,
          endIndex: phase1EndIndex
        })
      }

      const batchedResult: BatchedMatrixResult = {
        combinedMatrix,
        phaseResults,
        totalHypothesisPoints: allHypothesisPoints,
        apiCallCount: this.apiCallCount
      }

      logger.info(`Coarse grid batched evaluation complete: ${phaseResults.length} phases evaluated successfully (API calls: ${this.apiCallCount})`)
      return batchedResult

    } catch (error) {
      logger.error('Coarse grid batched evaluation failed:', error)

      // Enhanced error handling for multi-phase failures
      if (error.message.includes('API call failed')) {
        throw new Error(`Coarse grid matrix evaluation failed due to API error: ${error.message}`)
      } else if (error.message.includes('dimension mismatch')) {
        throw new Error(`Coarse grid matrix evaluation failed due to data integrity error: ${error.message}`)
      } else if (error.message.includes('fallback failed')) {
        throw new Error(`Multi-phase matrix evaluation failed: ${error.message}`)
      } else {
        throw new Error(`Coarse grid matrix evaluation failed: ${error.message}`)
      }
    }
  }

  /**
   * Evaluate each local grid using separate Matrix API calls (Phase 2)
   * Each local grid gets its own API call for granular control and error handling
   * @param origins Array of participant locations
   * @param localGridGroups Array of local grid groups, each containing hypothesis points for one local grid
   * @param travelMode Travel mode for matrix calculation
   * @returns Array of PhaseMatrixResult, one for each local grid
   * @throws Error if any local grid evaluation fails
   */
  async evaluateLocalGridsSeparately(
    origins: Coordinate[],
    localGridGroups: HypothesisPoint[][],
    travelMode: TravelMode
  ): Promise<PhaseMatrixResult[]> {
    if (!origins || origins.length === 0) {
      throw new Error('No origins provided for local grid evaluation')
    }

    if (!localGridGroups || localGridGroups.length === 0) {
      throw new Error('No local grid groups provided for evaluation')
    }

    try {
      const localGridResults: PhaseMatrixResult[] = []
      let globalStartIndex = 0

      logger.info(`Evaluating ${localGridGroups.length} local grids separately using individual Matrix API calls`)

      // Process each local grid with separate API call (Requirements 1.5)
      for (let gridIndex = 0; gridIndex < localGridGroups.length; gridIndex++) {
        const localGridPoints = localGridGroups[gridIndex]

        if (!localGridPoints || localGridPoints.length === 0) {
          logger.warn(`Skipping empty local grid ${gridIndex}`)
          continue
        }

        try {
          const localDestinations = localGridPoints.map(hp => hp.coordinate)

          logger.info(`Evaluating local grid ${gridIndex}: ${origins.length} origins × ${localDestinations.length} destinations`)

          // Separate Matrix API call for this local grid (Requirements 1.5)
          const localMatrix = await cachedOpenRouteClient.calculateTravelTimeMatrix(origins, localDestinations, travelMode)
          this.apiCallCount += 1 // Track API call for cost monitoring

          logger.info(`Local grid ${gridIndex} API call successful: ${localMatrix.travelTimes.length}×${localMatrix.travelTimes[0]?.length || 0} (API calls: ${this.apiCallCount})`)

          // Validate matrix dimensions
          this.validateMatrixDimensions(localMatrix, origins.length, localDestinations.length)

          // Create phase result for this local grid
          const localGridResult: PhaseMatrixResult = {
            phase: 'PHASE_2',
            matrix: localMatrix,
            hypothesisPoints: localGridPoints,
            startIndex: globalStartIndex,
            endIndex: globalStartIndex + localGridPoints.length
          }

          localGridResults.push(localGridResult)
          globalStartIndex += localGridPoints.length

        } catch (localGridError) {
          this.apiCallCount += 1 // Track failed API call for cost monitoring
          logger.error(`Local grid ${gridIndex} evaluation failed:`, localGridError)

          // For local grid failures, we can continue with other grids (graceful degradation)
          // This allows partial results rather than complete failure
          logger.warn(`Skipping local grid ${gridIndex} due to evaluation failure, continuing with remaining grids`)
          continue
        }
      }

      if (localGridResults.length === 0) {
        throw new Error('All local grid evaluations failed - no results available')
      }

      logger.info(`Local grid evaluation complete: ${localGridResults.length}/${localGridGroups.length} grids evaluated successfully (API calls: ${this.apiCallCount})`)
      return localGridResults

    } catch (error) {
      logger.error('Local grid evaluation failed:', error)

      // Enhanced error handling for Phase 2 failures
      if (error.message.includes('All local grid evaluations failed')) {
        throw new Error(`Local refinement matrix evaluation failed: ${error.message}`)
      } else {
        throw new Error(`Local refinement matrix evaluation failed: ${error.message}`)
      }
    }
  }

  /**
   * Combine local grid results into a single Phase 2 matrix result
   * @param localGridResults Array of individual local grid results
   * @returns Combined PhaseMatrixResult for all local grids
   */
  combineLocalGridResults(localGridResults: PhaseMatrixResult[]): PhaseMatrixResult {
    if (!localGridResults || localGridResults.length === 0) {
      throw new Error('No local grid results provided for combination')
    }

    try {
      // Combine all hypothesis points
      const allLocalPoints: HypothesisPoint[] = []
      const allLocalMatrices: TravelTimeMatrix[] = []

      for (const result of localGridResults) {
        allLocalPoints.push(...result.hypothesisPoints)
        allLocalMatrices.push(result.matrix)
      }

      // Use the first matrix as template for origins and travel mode
      const templateMatrix = allLocalMatrices[0]
      const combinedDestinations = allLocalPoints

      // Combine travel times by concatenating columns from each local grid
      const combinedTravelTimes: number[][] = []
      for (let originIndex = 0; originIndex < templateMatrix.origins.length; originIndex++) {
        const combinedRow: number[] = []

        for (const localMatrix of allLocalMatrices) {
          const localRow = localMatrix.travelTimes[originIndex]
          if (localRow) {
            combinedRow.push(...localRow)
          }
        }

        combinedTravelTimes.push(combinedRow)
      }

      // Create combined matrix
      const combinedMatrix: TravelTimeMatrix = {
        origins: templateMatrix.origins,
        destinations: combinedDestinations,
        travelTimes: combinedTravelTimes,
        travelMode: templateMatrix.travelMode
      }

      // Create combined phase result
      const combinedResult: PhaseMatrixResult = {
        phase: 'PHASE_2',
        matrix: combinedMatrix,
        hypothesisPoints: allLocalPoints,
        startIndex: 0,
        endIndex: allLocalPoints.length
      }

      logger.info(`Local grid combination complete: ${allLocalPoints.length} total local refinement points from ${localGridResults.length} grids`)
      return combinedResult

    } catch (error) {
      logger.error('Local grid combination failed:', error)
      throw new Error(`Local grid combination failed: ${error.message}`)
    }
  }

  /**
   * Validate matrix dimensions and data integrity
   * @param matrix Travel time matrix to validate
   * @param expectedOrigins Expected number of origins
   * @param expectedDestinations Expected number of destinations
   * @throws Error if validation fails
   * @private
   */
  private validateMatrixDimensions(matrix: TravelTimeMatrix, expectedOrigins: number, expectedDestinations: number): void {
    if (matrix.travelTimes.length !== expectedOrigins) {
      throw new Error(`Matrix dimension mismatch: expected ${expectedOrigins} origin rows, got ${matrix.travelTimes.length}`)
    }

    if (matrix.travelTimes[0]?.length !== expectedDestinations) {
      throw new Error(`Matrix dimension mismatch: expected ${expectedDestinations} destination columns, got ${matrix.travelTimes[0]?.length || 0}`)
    }

    // Validate matrix data integrity
    for (let i = 0; i < matrix.travelTimes.length; i++) {
      if (!Array.isArray(matrix.travelTimes[i])) {
        throw new Error(`Invalid matrix row ${i}: not an array`)
      }
      if (matrix.travelTimes[i].length !== expectedDestinations) {
        throw new Error(`Matrix row ${i} dimension mismatch: expected ${expectedDestinations} columns, got ${matrix.travelTimes[i].length}`)
      }
    }
  }

  /**
   * Extract a subset of the matrix for a specific phase
   * @param matrix Full travel time matrix
   * @param startIndex Starting column index for the phase
   * @param endIndex Ending column index for the phase
   * @param phasePoints Hypothesis points for this phase
   * @returns TravelTimeMatrix for the specific phase
   * @private
   */
  private extractPhaseMatrix(
    matrix: TravelTimeMatrix,
    startIndex: number,
    endIndex: number,
    phasePoints: HypothesisPoint[]
  ): TravelTimeMatrix {
    // Extract columns for the phase
    const phaseTravelTimes = matrix.travelTimes.map(row =>
      row.slice(startIndex, endIndex)
    )

    // Use the provided phase points as destinations (maintains proper typing)
    return {
      origins: matrix.origins,
      destinations: phasePoints,
      travelTimes: phaseTravelTimes,
      travelMode: matrix.travelMode
    }
  }
}

// Export singleton instance
export const batchedMatrixService = new BatchedMatrixService()