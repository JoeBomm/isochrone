import { logger } from './logger'
import { geometryService, type Coordinate } from './geometry'
import type { TravelTimeMatrix, HypothesisPoint } from 'types/graphql'

// Multi-phase matrix evaluation types
export interface PhaseMatrixResult {
  phase: 'PHASE_0' | 'PHASE_1' | 'PHASE_2'
  matrix: TravelTimeMatrix
  hypothesisPoints: HypothesisPoint[]
  startIndex: number // Starting index in the combined matrix
  endIndex: number   // Ending index in the combined matrix
}

export interface BatchedMatrixResult {
  combinedMatrix: TravelTimeMatrix
  phaseResults: PhaseMatrixResult[]
  totalHypothesisPoints: HypothesisPoint[]
}

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
  // Multi-phase matrix evaluation methods
  evaluateBatchedMatrix(
    origins: Coordinate[],
    phase0Points: HypothesisPoint[],
    phase1Points: HypothesisPoint[],
    travelMode: string,
    matrixEvaluator: (origins: Coordinate[], destinations: Coordinate[], travelMode: string) => Promise<TravelTimeMatrix>
  ): Promise<BatchedMatrixResult>
  evaluatePhase2Matrix(
    origins: Coordinate[],
    phase2Points: HypothesisPoint[],
    travelMode: string,
    matrixEvaluator: (origins: Coordinate[], destinations: Coordinate[], travelMode: string) => Promise<TravelTimeMatrix>
  ): Promise<PhaseMatrixResult>
  mergeMatrixResults(
    batchedResult: BatchedMatrixResult,
    phase2Result?: PhaseMatrixResult
  ): TravelTimeMatrix
  findMultiPhaseMinimaxOptimal(
    batchedResult: BatchedMatrixResult,
    phase2Result?: PhaseMatrixResult
  ): {
    optimalIndex: number
    maxTravelTime: number
    averageTravelTime: number
    optimalPhase: 'PHASE_0' | 'PHASE_1' | 'PHASE_2'
    optimalHypothesisPoint: HypothesisPoint
  }
  // ε-optimality improvement validation
  validateEpsilonOptimalityImprovement(
    baselineResult: { optimalIndex: number; maxTravelTime: number; averageTravelTime: number },
    multiPhaseResult: { optimalIndex: number; maxTravelTime: number; averageTravelTime: number; optimalPhase: string },
    epsilonThresholdMinutes?: number
  ): {
    hasImprovement: boolean
    improvementMinutes: number
    improvementPercentage: number
    isSignificant: boolean
  }
  // Enhanced tie-breaking for multi-phase results
  applyMultiPhaseTieBreakingRules(
    candidates: Array<{index: number, maxTime: number, avgTime: number, phase: 'PHASE_0' | 'PHASE_1' | 'PHASE_2'}>,
    allHypothesisPoints: HypothesisPoint[],
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

  /**
   * Evaluate batched matrix for Phase 0+1 combined (baseline + coarse grid)
   * @param origins Array of participant locations
   * @param phase0Points Phase 0 hypothesis points (baseline)
   * @param phase1Points Phase 1 hypothesis points (coarse grid)
   * @param travelMode Travel mode for matrix calculation
   * @param matrixEvaluator Function to evaluate travel time matrix
   * @returns BatchedMatrixResult containing combined matrix and phase breakdown
   * @throws Error if matrix evaluation fails or invalid parameters
   */
  async evaluateBatchedMatrix(
    origins: Coordinate[],
    phase0Points: HypothesisPoint[],
    phase1Points: HypothesisPoint[],
    travelMode: string,
    matrixEvaluator: (origins: Coordinate[], destinations: Coordinate[], travelMode: string) => Promise<TravelTimeMatrix>
  ): Promise<BatchedMatrixResult> {
    if (!origins || origins.length === 0) {
      throw new Error('No origins provided for batched matrix evaluation')
    }

    if (!phase0Points || phase0Points.length === 0) {
      throw new Error('No Phase 0 hypothesis points provided for batched matrix evaluation')
    }

    if (!matrixEvaluator) {
      throw new Error('No matrix evaluator function provided')
    }

    try {
      // Combine all hypothesis points for single API call (API call optimization - Requirements 4.2.1)
      const allHypothesisPoints = [...phase0Points, ...phase1Points]
      const allDestinations = allHypothesisPoints.map(hp => hp.coordinate)

      logger.info(`Evaluating batched matrix: ${origins.length} origins × ${allDestinations.length} destinations (Phase 0: ${phase0Points.length}, Phase 1: ${phase1Points.length})`)

      // Single matrix API call for Phase 0+1 (Requirements 7.1 - API call optimization)
      let combinedMatrix: TravelTimeMatrix
      try {
        combinedMatrix = await matrixEvaluator(origins, allDestinations, travelMode)
        logger.info(`Batched matrix API call successful: ${combinedMatrix.travelTimes.length}×${combinedMatrix.travelTimes[0]?.length || 0}`)
      } catch (apiError) {
        logger.error('Batched matrix API call failed:', apiError)

        // Graceful degradation: try Phase 0 only if combined call fails
        if (phase1Points.length > 0) {
          logger.warn('Attempting graceful degradation to Phase 0 only due to batched matrix failure')
          try {
            const phase0Destinations = phase0Points.map(hp => hp.coordinate)
            combinedMatrix = await matrixEvaluator(origins, phase0Destinations, travelMode)
            logger.info(`Phase 0 fallback successful: ${combinedMatrix.travelTimes.length}×${combinedMatrix.travelTimes[0]?.length || 0}`)

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
              totalHypothesisPoints: phase0Points
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
      if (combinedMatrix.travelTimes.length !== origins.length) {
        throw new Error(`Matrix dimension mismatch: expected ${origins.length} origin rows, got ${combinedMatrix.travelTimes.length}`)
      }

      if (combinedMatrix.travelTimes[0]?.length !== allDestinations.length) {
        throw new Error(`Matrix dimension mismatch: expected ${allDestinations.length} destination columns, got ${combinedMatrix.travelTimes[0]?.length || 0}`)
      }

      // Validate matrix data integrity
      for (let i = 0; i < combinedMatrix.travelTimes.length; i++) {
        if (!Array.isArray(combinedMatrix.travelTimes[i])) {
          throw new Error(`Invalid matrix row ${i}: not an array`)
        }
        if (combinedMatrix.travelTimes[i].length !== allDestinations.length) {
          throw new Error(`Matrix row ${i} dimension mismatch: expected ${allDestinations.length} columns, got ${combinedMatrix.travelTimes[i].length}`)
        }
      }

      // Create phase results with index ranges
      const phaseResults: PhaseMatrixResult[] = []

      // Phase 0 result
      const phase0StartIndex = 0
      const phase0EndIndex = phase0Points.length
      const phase0Matrix = this.extractPhaseMatrix(combinedMatrix, phase0StartIndex, phase0EndIndex)

      phaseResults.push({
        phase: 'PHASE_0',
        matrix: phase0Matrix,
        hypothesisPoints: phase0Points,
        startIndex: phase0StartIndex,
        endIndex: phase0EndIndex
      })

      // Phase 1 result (if phase1Points exist)
      if (phase1Points.length > 0) {
        const phase1StartIndex = phase0Points.length
        const phase1EndIndex = phase0Points.length + phase1Points.length
        const phase1Matrix = this.extractPhaseMatrix(combinedMatrix, phase1StartIndex, phase1EndIndex)

        phaseResults.push({
          phase: 'PHASE_1',
          matrix: phase1Matrix,
          hypothesisPoints: phase1Points,
          startIndex: phase1StartIndex,
          endIndex: phase1EndIndex
        })
      }

      const batchedResult: BatchedMatrixResult = {
        combinedMatrix,
        phaseResults,
        totalHypothesisPoints: allHypothesisPoints
      }

      logger.info(`Batched matrix evaluation complete: ${phaseResults.length} phases evaluated successfully`)
      return batchedResult

    } catch (error) {
      logger.error('Batched matrix evaluation failed:', error)

      // Enhanced error handling for multi-phase failures (Requirements 4.2.1, 4.2.2)
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
   * Evaluate Phase 2 matrix separately for local refinement points
   * @param origins Array of participant locations
   * @param phase2Points Phase 2 hypothesis points (local refinement)
   * @param travelMode Travel mode for matrix calculation
   * @param matrixEvaluator Function to evaluate travel time matrix
   * @returns PhaseMatrixResult for Phase 2
   * @throws Error if matrix evaluation fails or invalid parameters
   */
  async evaluatePhase2Matrix(
    origins: Coordinate[],
    phase2Points: HypothesisPoint[],
    travelMode: string,
    matrixEvaluator: (origins: Coordinate[], destinations: Coordinate[], travelMode: string) => Promise<TravelTimeMatrix>
  ): Promise<PhaseMatrixResult> {
    if (!origins || origins.length === 0) {
      throw new Error('No origins provided for Phase 2 matrix evaluation')
    }

    if (!phase2Points || phase2Points.length === 0) {
      throw new Error('No Phase 2 hypothesis points provided')
    }

    if (!matrixEvaluator) {
      throw new Error('No matrix evaluator function provided')
    }

    try {
      const phase2Destinations = phase2Points.map(hp => hp.coordinate)

      logger.info(`Evaluating Phase 2 matrix: ${origins.length} origins × ${phase2Destinations.length} destinations`)

      // Separate matrix API call for Phase 2 (Requirements 4.2.2 - separate evaluation)
      let phase2Matrix: TravelTimeMatrix
      try {
        phase2Matrix = await matrixEvaluator(origins, phase2Destinations, travelMode)
        logger.info(`Phase 2 matrix API call successful: ${phase2Matrix.travelTimes.length}×${phase2Matrix.travelTimes[0]?.length || 0}`)
      } catch (apiError) {
        logger.error('Phase 2 matrix API call failed:', apiError)

        // For Phase 2 failures, we can gracefully degrade by not including Phase 2 results
        // The caller should handle this by checking if Phase 2 result is undefined
        throw new Error(`Local refinement matrix API call failed: ${apiError.message}`)
      }

      // Validate matrix dimensions
      if (phase2Matrix.travelTimes.length !== origins.length) {
        throw new Error(`Phase 2 matrix dimension mismatch: expected ${origins.length} origin rows, got ${phase2Matrix.travelTimes.length}`)
      }

      if (phase2Matrix.travelTimes[0]?.length !== phase2Destinations.length) {
        throw new Error(`Phase 2 matrix dimension mismatch: expected ${phase2Destinations.length} destination columns, got ${phase2Matrix.travelTimes[0]?.length || 0}`)
      }

      // Validate matrix data integrity
      for (let i = 0; i < phase2Matrix.travelTimes.length; i++) {
        if (!Array.isArray(phase2Matrix.travelTimes[i])) {
          throw new Error(`Invalid Phase 2 matrix row ${i}: not an array`)
        }
        if (phase2Matrix.travelTimes[i].length !== phase2Destinations.length) {
          throw new Error(`Phase 2 matrix row ${i} dimension mismatch: expected ${phase2Destinations.length} columns, got ${phase2Matrix.travelTimes[i].length}`)
        }
      }

      const phase2Result: PhaseMatrixResult = {
        phase: 'PHASE_2',
        matrix: phase2Matrix,
        hypothesisPoints: phase2Points,
        startIndex: 0, // Phase 2 has its own indexing
        endIndex: phase2Points.length
      }

      logger.info('Phase 2 matrix evaluation complete successfully')
      return phase2Result

    } catch (error) {
      logger.error('Phase 2 matrix evaluation failed:', error)

      // Enhanced error handling for Phase 2 failures (Requirements 4.2.2)
      if (error.message.includes('API call failed')) {
        throw new Error(`Local refinement matrix evaluation failed due to API error: ${error.message}`)
      } else if (error.message.includes('dimension mismatch')) {
        throw new Error(`Local refinement matrix evaluation failed due to data integrity error: ${error.message}`)
      } else {
        throw new Error(`Local refinement matrix evaluation failed: ${error.message}`)
      }
    }
  }

  /**
   * Merge matrix results from batched evaluation and optional Phase 2
   * @param batchedResult Result from Phase 0+1 batched evaluation
   * @param phase2Result Optional result from Phase 2 evaluation
   * @returns Combined TravelTimeMatrix with all phases
   * @throws Error if merging fails or invalid parameters
   */
  mergeMatrixResults(
    batchedResult: BatchedMatrixResult,
    phase2Result?: PhaseMatrixResult
  ): TravelTimeMatrix {
    if (!batchedResult || !batchedResult.combinedMatrix) {
      throw new Error('No batched result provided for matrix merging')
    }

    try {
      // If no Phase 2 result, return the batched result as-is
      if (!phase2Result) {
        logger.info('No Phase 2 result to merge, returning batched matrix')
        return batchedResult.combinedMatrix
      }

      // Merge Phase 0+1 matrix with Phase 2 matrix
      const combinedMatrix = batchedResult.combinedMatrix
      const phase2Matrix = phase2Result.matrix

      // Validate that origins match
      if (combinedMatrix.origins.length !== phase2Matrix.origins.length) {
        throw new Error('Origin count mismatch between batched and Phase 2 matrices')
      }

      // Merge destinations
      const mergedDestinations = [
        ...combinedMatrix.destinations,
        ...phase2Matrix.destinations
      ]

      // Merge travel times by concatenating columns
      const mergedTravelTimes: number[][] = []
      for (let originIndex = 0; originIndex < combinedMatrix.origins.length; originIndex++) {
        const batchedRow = combinedMatrix.travelTimes[originIndex]
        const phase2Row = phase2Matrix.travelTimes[originIndex]

        if (!batchedRow || !phase2Row) {
          throw new Error(`Missing travel time row for origin ${originIndex}`)
        }

        mergedTravelTimes.push([...batchedRow, ...phase2Row])
      }

      const mergedMatrix: TravelTimeMatrix = {
        origins: combinedMatrix.origins,
        destinations: mergedDestinations,
        travelTimes: mergedTravelTimes,
        travelMode: combinedMatrix.travelMode
      }

      logger.info(`Matrix merging complete: ${mergedDestinations.length} total destinations (${combinedMatrix.destinations.length} from batched + ${phase2Matrix.destinations.length} from Phase 2)`)
      return mergedMatrix

    } catch (error) {
      logger.error('Matrix merging failed:', error)
      throw new Error(`Matrix merging failed: ${error.message}`)
    }
  }

  /**
   * Find minimax optimal point across all phases
   * @param batchedResult Result from Phase 0+1 batched evaluation
   * @param phase2Result Optional result from Phase 2 evaluation
   * @returns Extended optimal result with phase information
   * @throws Error if optimization fails or invalid parameters
   */
  findMultiPhaseMinimaxOptimal(
    batchedResult: BatchedMatrixResult,
    phase2Result?: PhaseMatrixResult
  ): {
    optimalIndex: number
    maxTravelTime: number
    averageTravelTime: number
    optimalPhase: 'PHASE_0' | 'PHASE_1' | 'PHASE_2'
    optimalHypothesisPoint: HypothesisPoint
  } {
    if (!batchedResult || !batchedResult.combinedMatrix) {
      throw new Error('No batched result provided for multi-phase optimization')
    }

    try {
      // Merge all matrices for unified optimization
      const mergedMatrix = this.mergeMatrixResults(batchedResult, phase2Result)

      // Find optimal point using existing minimax algorithm
      const optimalResult = this.findMinimaxOptimal(mergedMatrix)

      // Determine which phase the optimal point belongs to
      let optimalPhase: 'PHASE_0' | 'PHASE_1' | 'PHASE_2'
      let optimalHypothesisPoint: HypothesisPoint

      const optimalIndex = optimalResult.optimalIndex

      // Check Phase 0
      const phase0Result = batchedResult.phaseResults.find(pr => pr.phase === 'PHASE_0')
      if (phase0Result && optimalIndex >= phase0Result.startIndex && optimalIndex < phase0Result.endIndex) {
        optimalPhase = 'PHASE_0'
        optimalHypothesisPoint = phase0Result.hypothesisPoints[optimalIndex - phase0Result.startIndex]
      }
      // Check Phase 1
      else {
        const phase1Result = batchedResult.phaseResults.find(pr => pr.phase === 'PHASE_1')
        if (phase1Result && optimalIndex >= phase1Result.startIndex && optimalIndex < phase1Result.endIndex) {
          optimalPhase = 'PHASE_1'
          optimalHypothesisPoint = phase1Result.hypothesisPoints[optimalIndex - phase1Result.startIndex]
        }
        // Check Phase 2
        else if (phase2Result && optimalIndex >= batchedResult.totalHypothesisPoints.length) {
          optimalPhase = 'PHASE_2'
          const phase2Index = optimalIndex - batchedResult.totalHypothesisPoints.length
          optimalHypothesisPoint = phase2Result.hypothesisPoints[phase2Index]
        }
        else {
          throw new Error(`Unable to determine optimal phase for index ${optimalIndex}`)
        }
      }

      logger.info(`Multi-phase optimization complete: optimal point from ${optimalPhase} at index ${optimalIndex}`)

      return {
        optimalIndex,
        maxTravelTime: optimalResult.maxTravelTime,
        averageTravelTime: optimalResult.averageTravelTime,
        optimalPhase,
        optimalHypothesisPoint
      }

    } catch (error) {
      logger.error('Multi-phase minimax optimization failed:', error)
      throw new Error(`Multi-phase minimax optimization failed: ${error.message}`)
    }
  }

  /**
   * Extract a subset of the matrix for a specific phase
   * @param matrix Full travel time matrix
   * @param startIndex Starting column index for the phase
   * @param endIndex Ending column index for the phase
   * @returns TravelTimeMatrix for the specific phase
   * @private
   */
  private extractPhaseMatrix(
    matrix: TravelTimeMatrix,
    startIndex: number,
    endIndex: number
  ): TravelTimeMatrix {
    // Extract columns for the phase
    const phaseTravelTimes = matrix.travelTimes.map(row =>
      row.slice(startIndex, endIndex)
    )

    // Extract corresponding destinations
    const phaseDestinations = matrix.destinations.slice(startIndex, endIndex)

    return {
      origins: matrix.origins,
      destinations: phaseDestinations,
      travelTimes: phaseTravelTimes,
      travelMode: matrix.travelMode
    }
  }

  /**
   * Validate ε-optimality improvement from multi-phase optimization
   * @param baselineResult Result from Phase 0 (baseline) optimization
   * @param multiPhaseResult Result from multi-phase optimization
   * @param epsilonThresholdMinutes Minimum improvement threshold in minutes (default: 1 minute)
   * @returns Improvement analysis with significance assessment
   */
  validateEpsilonOptimalityImprovement(
    baselineResult: { optimalIndex: number; maxTravelTime: number; averageTravelTime: number },
    multiPhaseResult: { optimalIndex: number; maxTravelTime: number; averageTravelTime: number; optimalPhase: string },
    epsilonThresholdMinutes: number = 1
  ): {
    hasImprovement: boolean
    improvementMinutes: number
    improvementPercentage: number
    isSignificant: boolean
  } {
    if (!baselineResult || !multiPhaseResult) {
      throw new Error('Both baseline and multi-phase results required for ε-optimality validation')
    }

    if (epsilonThresholdMinutes < 0) {
      throw new Error('Epsilon threshold must be non-negative')
    }

    try {
      // Calculate improvement in maximum travel time (primary metric for minimax)
      const improvementMinutes = baselineResult.maxTravelTime - multiPhaseResult.maxTravelTime
      const improvementPercentage = baselineResult.maxTravelTime > 0
        ? (improvementMinutes / baselineResult.maxTravelTime) * 100
        : 0

      // Determine if there's any improvement
      const hasImprovement = improvementMinutes > 0

      // Determine if improvement is significant (exceeds epsilon threshold)
      const isSignificant = improvementMinutes >= epsilonThresholdMinutes

      logger.info(`ε-optimality validation: improvement=${improvementMinutes.toFixed(2)}min (${improvementPercentage.toFixed(1)}%), significant=${isSignificant} (threshold=${epsilonThresholdMinutes}min)`)

      return {
        hasImprovement,
        improvementMinutes,
        improvementPercentage,
        isSignificant
      }

    } catch (error) {
      logger.error('ε-optimality validation failed:', error)
      throw new Error(`ε-optimality validation failed: ${error.message}`)
    }
  }

  /**
   * Apply enhanced tie-breaking rules for multi-phase results
   * Prioritizes Phase 0 (baseline) points when travel times are equal
   * @param candidates Array of candidate hypothesis points with equal max travel time
   * @param allHypothesisPoints Array of all hypothesis points for distance calculation
   * @param geographicCentroid Geographic centroid for distance tie-breaking
   * @returns Index of the selected hypothesis point after enhanced tie-breaking
   * @throws Error if no candidates provided or tie-breaking fails
   */
  applyMultiPhaseTieBreakingRules(
    candidates: Array<{index: number, maxTime: number, avgTime: number, phase: 'PHASE_0' | 'PHASE_1' | 'PHASE_2'}>,
    allHypothesisPoints: HypothesisPoint[],
    geographicCentroid: Coordinate
  ): number {
    if (!candidates || candidates.length === 0) {
      throw new Error('No candidates provided for multi-phase tie-breaking')
    }

    if (candidates.length === 1) {
      return candidates[0].index
    }

    if (!allHypothesisPoints || allHypothesisPoints.length === 0) {
      throw new Error('No hypothesis points provided for multi-phase tie-breaking')
    }

    if (!geographicCentroid) {
      throw new Error('No geographic centroid provided for multi-phase tie-breaking')
    }

    logger.info(`Applying multi-phase tie-breaking rules for ${candidates.length} candidates`)

    // Rule 1: Prefer Phase 0 (baseline) points when travel times are equal
    const phase0Candidates = candidates.filter(c => c.phase === 'PHASE_0')
    if (phase0Candidates.length > 0) {
      logger.debug(`Phase 0 preference: ${phase0Candidates.length} baseline candidates found`)

      if (phase0Candidates.length === 1) {
        logger.info(`Multi-phase tie-breaking: selected Phase 0 candidate at index ${phase0Candidates[0].index}`)
        return phase0Candidates[0].index
      }

      // If multiple Phase 0 candidates, continue with standard tie-breaking on Phase 0 subset
      return this.applyStandardTieBreaking(phase0Candidates, allHypothesisPoints, geographicCentroid)
    }

    // Rule 2: If no Phase 0 candidates, prefer Phase 1 over Phase 2
    const phase1Candidates = candidates.filter(c => c.phase === 'PHASE_1')
    if (phase1Candidates.length > 0) {
      logger.debug(`Phase 1 preference: ${phase1Candidates.length} coarse grid candidates found`)

      if (phase1Candidates.length === 1) {
        logger.info(`Multi-phase tie-breaking: selected Phase 1 candidate at index ${phase1Candidates[0].index}`)
        return phase1Candidates[0].index
      }

      // If multiple Phase 1 candidates, continue with standard tie-breaking on Phase 1 subset
      return this.applyStandardTieBreaking(phase1Candidates, allHypothesisPoints, geographicCentroid)
    }

    // Rule 3: Fall back to Phase 2 candidates with standard tie-breaking
    const phase2Candidates = candidates.filter(c => c.phase === 'PHASE_2')
    if (phase2Candidates.length > 0) {
      logger.debug(`Phase 2 fallback: ${phase2Candidates.length} local refinement candidates found`)
      return this.applyStandardTieBreaking(phase2Candidates, allHypothesisPoints, geographicCentroid)
    }

    // Should not reach here if candidates are properly classified
    throw new Error('No valid phase candidates found during multi-phase tie-breaking')
  }

  /**
   * Apply standard tie-breaking rules (average time, then distance to centroid)
   * @param candidates Array of candidates from the same phase
   * @param allHypothesisPoints Array of all hypothesis points
   * @param geographicCentroid Geographic centroid for distance calculation
   * @returns Index of selected candidate
   * @private
   */
  private applyStandardTieBreaking(
    candidates: Array<{index: number, maxTime: number, avgTime: number}>,
    allHypothesisPoints: HypothesisPoint[],
    geographicCentroid: Coordinate
  ): number {
    // Rule: Select candidates with lowest average travel time
    const minAvgTime = Math.min(...candidates.map(c => c.avgTime))
    const avgTimeCandidates = candidates.filter(c => Math.abs(c.avgTime - minAvgTime) < 0.01)

    logger.debug(`After average time tie-breaking: ${avgTimeCandidates.length} candidates (min avg: ${minAvgTime.toFixed(1)}min)`)

    if (avgTimeCandidates.length === 1) {
      return avgTimeCandidates[0].index
    }

    // Rule: Select candidate closest to geographic centroid
    let closestIndex = -1
    let minDistance = Infinity

    for (const candidate of avgTimeCandidates) {
      const hypothesisPoint = allHypothesisPoints[candidate.index]
      if (!hypothesisPoint || !hypothesisPoint.coordinate) {
        logger.warn(`Invalid hypothesis point at index ${candidate.index}`)
        continue
      }

      const distance = this.calculateDistance(hypothesisPoint.coordinate, geographicCentroid)
      logger.debug(`Candidate ${candidate.index}: distance to centroid = ${distance.toFixed(6)}`)

      if (distance < minDistance) {
        minDistance = distance
        closestIndex = candidate.index
      }
    }

    if (closestIndex === -1) {
      throw new Error('Standard tie-breaking failed: no valid candidates found')
    }

    logger.info(`Standard tie-breaking complete: selected index ${closestIndex} (closest to centroid: ${minDistance.toFixed(6)})`)
    return closestIndex
  }
}

// Export singleton instance
export const matrixService = new TravelTimeMatrixService()