import type { TravelMode, HypothesisPoint, Location } from 'types/graphql'

import { cachedOpenRouteClient } from '../cachedOpenroute'
import type { Coordinate } from '../geometry'
import { logger } from '../logger'

// Define TravelTimeMatrix interface locally since it's not in GraphQL schema
interface TravelTimeMatrix {
  origins: Location[]
  destinations: HypothesisPoint[]
  travelTimes: number[][]
  travelMode: TravelMode
}

/**
 * Result from single matrix evaluation for two-phase algorithm
 */
export interface SingleMatrixResult {
  /** Combined matrix containing all hypothesis points */
  matrix: TravelTimeMatrix
  /** All hypothesis points in evaluation order */
  hypothesisPoints: HypothesisPoint[]
  /** Number of Matrix API calls made (should always be 1) */
  apiCallCount: number
  /** Total number of hypothesis points evaluated */
  totalHypothesisPoints: number
}

/**
 * Validation result for matrix evaluation
 */
interface MatrixValidationResult {
  isValid: boolean
  unreachableDestinations: number[]
  unreachabilityReasons?: Map<number, Set<string>>
  error?: string
}

/**
 * Result from filtering unreachable points
 */
interface FilteringResult {
  filteredMatrix: TravelTimeMatrix
  filteredHypothesisPoints: HypothesisPoint[]
  filteredCount: number
}

/**
 * Service for single matrix evaluation supporting simplified two-phase algorithm
 * Implements cost-controlled API usage with exactly one Matrix API call for all hypothesis points
 * Requirements: 1.2, 1.4 - Single Matrix API call for hypothesis evaluation
 */
export class SingleMatrixService {
  private apiCallCount = 0

  /**
   * Reset API call counter
   */
  resetApiCallCount(): void {
    this.apiCallCount = 0
  }

  /**
   * Get current API call count for cost monitoring
   * @returns Number of Matrix API calls made
   */
  getApiCallCount(): number {
    return this.apiCallCount
  }

  /**
   * Evaluate all hypothesis points using single Matrix API call
   * Combines anchor points and grid points into one API call for maximum efficiency
   * @param origins Array of participant locations
   * @param anchorPoints Anchor hypothesis points (geographic centroid, median, participants, pairwise midpoints)
   * @param gridPoints Grid hypothesis points (bounding box grid cell centers)
   * @param travelMode Travel mode for matrix calculation
   * @returns SingleMatrixResult containing matrix and metadata
   * @throws Error if matrix evaluation fails or invalid parameters
   */
  async evaluateAllHypothesisPoints(
    origins: Coordinate[],
    anchorPoints: HypothesisPoint[],
    gridPoints: HypothesisPoint[],
    travelMode: TravelMode
  ): Promise<SingleMatrixResult> {
    // Reset API call counter for this request
    this.resetApiCallCount()

    if (!origins || origins.length === 0) {
      throw new Error('No origins provided for single matrix evaluation')
    }

    if (!anchorPoints || anchorPoints.length === 0) {
      throw new Error('No anchor points provided for single matrix evaluation')
    }

    // Grid points are optional - can be empty array
    const actualGridPoints = gridPoints || []

    try {
      // Combine all hypothesis points for single API call (Requirements 1.4)
      const allHypothesisPoints = [...anchorPoints, ...actualGridPoints]
      const allDestinations = allHypothesisPoints.map((hp) => hp.coordinate)

      logger.info(
        `Single matrix evaluation: ${origins.length} origins × ${allDestinations.length} destinations (anchors: ${anchorPoints.length}, grid: ${actualGridPoints.length})`
      )

      // Validate coordinate bounds before API call
      this.validateCoordinates(origins, 'origins')
      this.validateCoordinates(allDestinations, 'destinations')

      // Single matrix API call for all hypothesis points (Requirements 1.4 - exactly one Matrix API call)
      let matrix: TravelTimeMatrix
      try {
        matrix = await cachedOpenRouteClient.calculateTravelTimeMatrix(
          origins,
          allDestinations,
          travelMode
        )
        this.apiCallCount += 1 // Track API call for cost monitoring
        logger.info(
          `Single matrix API call successful: ${matrix.travelTimes.length}×${matrix.travelTimes[0]?.length || 0} (API calls: ${this.apiCallCount})`
        )
      } catch (apiError) {
        this.apiCallCount += 1 // Track failed API call for cost monitoring
        logger.error('Single matrix API call failed:', apiError)

        // Enhanced error handling with retry logic
        if (this.shouldRetryApiCall(apiError)) {
          logger.info('Retrying single matrix API call due to transient error')
          try {
            matrix = await cachedOpenRouteClient.calculateTravelTimeMatrix(
              origins,
              allDestinations,
              travelMode
            )
            this.apiCallCount += 1 // Track retry API call
            logger.info(
              `Single matrix API retry successful: ${matrix.travelTimes.length}×${matrix.travelTimes[0]?.length || 0} (API calls: ${this.apiCallCount})`
            )
          } catch (retryError) {
            this.apiCallCount += 1 // Track failed retry
            logger.error('Single matrix API retry also failed:', retryError)
            throw this.createMatrixApiError(retryError)
          }
        } else {
          throw this.createMatrixApiError(apiError)
        }
      }

      // Validate matrix dimensions and detect unreachable points
      const validationResult = this.validateMatrixResult(
        matrix,
        origins.length,
        allDestinations.length
      )

      if (!validationResult.isValid) {
        throw new Error(validationResult.error || 'Matrix validation failed')
      }

      // Filter unreachable points if any were detected (Requirements 3.1, 3.2, 3.3, 3.4, 3.5)
      let finalMatrix = matrix
      let finalHypothesisPoints = allHypothesisPoints

      if (validationResult.unreachableDestinations.length > 0) {
        // Enhanced error handling for complete unreachability scenarios (Requirements 4.1, 4.2, 4.3, 4.4, 4.5)
        const gracefulDegradationResult = this.handleUnreachabilityScenarios(
          matrix,
          allHypothesisPoints,
          anchorPoints,
          actualGridPoints,
          validationResult.unreachableDestinations,
          validationResult.unreachabilityReasons
        )

        finalMatrix = gracefulDegradationResult.filteredMatrix
        finalHypothesisPoints =
          gracefulDegradationResult.filteredHypothesisPoints

        logger.info(
          `Filtering applied: removed ${gracefulDegradationResult.filteredCount} unreachable points from ${allHypothesisPoints.length} total points, ${finalHypothesisPoints.length} points remaining for processing`
        )
      }

      const result: SingleMatrixResult = {
        matrix: finalMatrix,
        hypothesisPoints: finalHypothesisPoints,
        apiCallCount: this.apiCallCount,
        totalHypothesisPoints: allHypothesisPoints.length, // Original count before filtering
      }

      logger.info(
        `Single matrix evaluation complete: ${allHypothesisPoints.length} hypothesis points evaluated with ${this.apiCallCount} API call(s)`
      )
      return result
    } catch (error) {
      logger.error('Single matrix evaluation failed:', error)

      // Enhanced error handling for different failure types
      if (error.message.includes('API call failed')) {
        throw new Error(`Matrix API evaluation failed: ${error.message}`)
      } else if (
        error.message.includes('dimension mismatch') ||
        error.message.includes('validation failed')
      ) {
        throw new Error(`Matrix data validation failed: ${error.message}`)
      } else if (error.message.includes('coordinate')) {
        throw new Error(`Invalid coordinates provided: ${error.message}`)
      } else {
        throw new Error(`Single matrix evaluation failed: ${error.message}`)
      }
    }
  }

  /**
   * Handle unreachability scenarios with graceful degradation
   * @param matrix Travel time matrix to filter
   * @param allHypothesisPoints All hypothesis points (anchors + grid)
   * @param anchorPoints Original anchor points array
   * @param gridPoints Original grid points array
   * @param unreachableIndices Array of destination indices that are unreachable
   * @param unreachabilityReasons Map of destination indices to their unreachability reasons
   * @returns Filtered matrix and hypothesis points with graceful degradation
   * @private
   */
  private handleUnreachabilityScenarios(
    matrix: TravelTimeMatrix,
    allHypothesisPoints: HypothesisPoint[],
    anchorPoints: HypothesisPoint[],
    gridPoints: HypothesisPoint[],
    unreachableIndices: number[],
    unreachabilityReasons?: Map<number, Set<string>>
  ): FilteringResult {
    // Check for complete unreachability scenario (Requirements 4.4, 4.5)
    if (unreachableIndices.length === allHypothesisPoints.length) {
      throw new Error(
        'All hypothesis points are unreachable from one or more origins. Please try different locations or travel modes.'
      )
    }

    // Determine which point types are affected by unreachability
    const anchorStartIndex = 0
    const anchorEndIndex = anchorPoints.length - 1
    const gridStartIndex = anchorPoints.length
    const gridEndIndex = allHypothesisPoints.length - 1

    // Check if all anchor points are unreachable (Requirements 4.2)
    const unreachableAnchorIndices = unreachableIndices.filter(
      (index) => index >= anchorStartIndex && index <= anchorEndIndex
    )
    const allAnchorsUnreachable =
      unreachableAnchorIndices.length === anchorPoints.length

    // Check if all grid points are unreachable (Requirements 4.3)
    const unreachableGridIndices = unreachableIndices.filter(
      (index) => index >= gridStartIndex && index <= gridEndIndex
    )
    const allGridUnreachable =
      gridPoints.length > 0 &&
      unreachableGridIndices.length === gridPoints.length

    // Log graceful degradation scenarios
    if (allAnchorsUnreachable && gridPoints.length > 0) {
      logger.warn(
        `All ${anchorPoints.length} anchor points are unreachable, continuing with ${gridPoints.length - unreachableGridIndices.length} reachable grid points`
      )
    }

    if (allGridUnreachable && anchorPoints.length > 0) {
      logger.warn(
        `All ${gridPoints.length} grid points are unreachable, continuing with ${anchorPoints.length - unreachableAnchorIndices.length} reachable anchor points`
      )
    }

    // Requirements 4.1: Continue processing with remaining points when some are unreachable
    // Requirements 4.2: Continue with grid points if all anchor points are unreachable
    // Requirements 4.3: Continue with anchor points if all grid points are unreachable
    // Apply filtering to remove unreachable points
    const filteringResult = this.filterUnreachablePoints(
      matrix,
      allHypothesisPoints,
      unreachableIndices,
      unreachabilityReasons
    )

    // Ensure we have at least one reachable point (Requirements 4.5)
    if (filteringResult.filteredHypothesisPoints.length === 0) {
      throw new Error(
        'No reachable hypothesis points remain after filtering. Please try different locations or travel modes.'
      )
    }

    return filteringResult
  }

  /**
   * Validate coordinate arrays for API call
   * @param coordinates Array of coordinates to validate
   * @param type Type description for error messages
   * @throws Error if coordinates are invalid
   * @private
   */
  private validateCoordinates(coordinates: Coordinate[], type: string): void {
    if (!coordinates || coordinates.length === 0) {
      throw new Error(`No ${type} coordinates provided`)
    }

    for (let i = 0; i < coordinates.length; i++) {
      const coord = coordinates[i]
      if (
        !coord ||
        typeof coord.latitude !== 'number' ||
        typeof coord.longitude !== 'number'
      ) {
        throw new Error(
          `Invalid ${type} coordinate at index ${i}: missing or invalid latitude/longitude`
        )
      }

      // Validate coordinate bounds
      if (coord.latitude < -90 || coord.latitude > 90) {
        throw new Error(
          `Invalid ${type} latitude at index ${i}: ${coord.latitude} (must be between -90 and 90)`
        )
      }

      if (coord.longitude < -180 || coord.longitude > 180) {
        throw new Error(
          `Invalid ${type} longitude at index ${i}: ${coord.longitude} (must be between -180 and 180)`
        )
      }
    }
  }

  /**
   * Validate matrix result dimensions and detect unreachable points
   * @param matrix Travel time matrix to validate
   * @param expectedOrigins Expected number of origins
   * @param expectedDestinations Expected number of destinations
   * @returns Validation result with unreachable destination indices
   * @private
   */
  private validateMatrixResult(
    matrix: TravelTimeMatrix,
    expectedOrigins: number,
    expectedDestinations: number
  ): MatrixValidationResult {
    // Check for missing matrix data
    if (!matrix || !matrix.travelTimes) {
      return {
        isValid: false,
        unreachableDestinations: [],
        error: 'Matrix validation failed: missing travel times data',
      }
    }

    // Check matrix dimensions
    if (matrix.travelTimes.length !== expectedOrigins) {
      return {
        isValid: false,
        unreachableDestinations: [],
        error: `Matrix dimension mismatch: expected ${expectedOrigins} origin rows, got ${matrix.travelTimes.length}`,
      }
    }

    if (matrix.travelTimes[0]?.length !== expectedDestinations) {
      return {
        isValid: false,
        unreachableDestinations: [],
        error: `Matrix dimension mismatch: expected ${expectedDestinations} destination columns, got ${matrix.travelTimes[0]?.length || 0}`,
      }
    }

    // Validate origins and destinations arrays
    if (!matrix.origins || matrix.origins.length !== expectedOrigins) {
      return {
        isValid: false,
        unreachableDestinations: [],
        error: `Matrix validation failed: origins array length mismatch (expected ${expectedOrigins}, got ${matrix.origins?.length || 0})`,
      }
    }

    if (
      !matrix.destinations ||
      matrix.destinations.length !== expectedDestinations
    ) {
      return {
        isValid: false,
        unreachableDestinations: [],
        error: `Matrix validation failed: destinations array length mismatch (expected ${expectedDestinations}, got ${matrix.destinations?.length || 0})`,
      }
    }

    // Track unreachable destinations with detailed reasons
    const unreachableDestinations: number[] = []
    const unreachabilityReasons: Map<number, Set<string>> = new Map()

    // Helper function to record unreachability reason
    const recordUnreachabilityReason = (destIndex: number, reason: string) => {
      if (!unreachableDestinations.includes(destIndex)) {
        unreachableDestinations.push(destIndex)
      }
      if (!unreachabilityReasons.has(destIndex)) {
        unreachabilityReasons.set(destIndex, new Set())
      }
      unreachabilityReasons.get(destIndex)!.add(reason)
    }

    // Validate matrix data integrity and detect unreachable points
    for (let i = 0; i < matrix.travelTimes.length; i++) {
      if (!Array.isArray(matrix.travelTimes[i])) {
        return {
          isValid: false,
          unreachableDestinations: [],
          error: `Matrix validation failed: row ${i} is not an array`,
        }
      }
      if (matrix.travelTimes[i].length !== expectedDestinations) {
        return {
          isValid: false,
          unreachableDestinations: [],
          error: `Matrix row ${i} dimension mismatch: expected ${expectedDestinations} columns, got ${matrix.travelTimes[i].length}`,
        }
      }

      // Check each destination column for unreachable points
      for (let j = 0; j < matrix.travelTimes[i].length; j++) {
        const travelTime = matrix.travelTimes[i][j]

        // Detect unreachable points (Requirements 1.1, 1.2, 1.3)
        if (travelTime === null) {
          recordUnreachabilityReason(j, 'null_travel_time')
        } else if (travelTime === undefined) {
          recordUnreachabilityReason(j, 'undefined_travel_time')
        } else if (travelTime === Infinity) {
          recordUnreachabilityReason(j, 'infinity_travel_time')
        } else if (typeof travelTime !== 'number') {
          recordUnreachabilityReason(j, 'invalid_travel_time_type')
        } else if (typeof travelTime === 'number' && travelTime < 0) {
          recordUnreachabilityReason(j, 'negative_travel_time')
        }
      }
    }

    // Requirements 1.4, 1.5: Check all origin rows for each destination column
    // If any origin cannot reach a destination, mark it as unreachable
    for (let j = 0; j < expectedDestinations; j++) {
      for (let i = 0; i < matrix.travelTimes.length; i++) {
        const travelTime = matrix.travelTimes[i][j]
        if (travelTime === null) {
          recordUnreachabilityReason(j, 'null_travel_time')
        } else if (travelTime === undefined) {
          recordUnreachabilityReason(j, 'undefined_travel_time')
        } else if (travelTime === Infinity) {
          recordUnreachabilityReason(j, 'infinity_travel_time')
        } else if (typeof travelTime !== 'number') {
          recordUnreachabilityReason(j, 'invalid_travel_time_type')
        } else if (typeof travelTime === 'number' && travelTime < 0) {
          recordUnreachabilityReason(j, 'negative_travel_time')
        }
      }
    }

    // Sort unreachable destinations for consistent ordering
    unreachableDestinations.sort((a, b) => a - b)

    return {
      isValid: true,
      unreachableDestinations,
      unreachabilityReasons,
    }
  }

  /**
   * Filter unreachable points from matrix and hypothesis points
   * @param matrix Travel time matrix to filter
   * @param hypothesisPoints Hypothesis points array to filter
   * @param unreachableIndices Array of destination indices that are unreachable
   * @param unreachabilityReasons Map of destination indices to their unreachability reasons
   * @returns Filtered matrix, hypothesis points, and count of filtered points
   * @private
   */
  private filterUnreachablePoints(
    matrix: TravelTimeMatrix,
    hypothesisPoints: HypothesisPoint[],
    unreachableIndices: number[],
    unreachabilityReasons?: Map<number, Set<string>>
  ): FilteringResult {
    // If no unreachable points, return original data
    if (unreachableIndices.length === 0) {
      return {
        filteredMatrix: matrix,
        filteredHypothesisPoints: hypothesisPoints,
        filteredCount: 0,
      }
    }

    // Sort unreachable indices in descending order for safe removal
    const sortedUnreachableIndices = [...unreachableIndices].sort(
      (a, b) => b - a
    )

    // Filter hypothesis points (Requirements 2.1)
    const filteredHypothesisPoints = hypothesisPoints.filter(
      (_, index) => !unreachableIndices.includes(index)
    )

    // Filter destinations array (Requirements 2.3)
    const filteredDestinations = matrix.destinations.filter(
      (_, index) => !unreachableIndices.includes(index)
    )

    // Filter travel times matrix columns (Requirements 2.2)
    const filteredTravelTimes = matrix.travelTimes.map((row) =>
      row.filter((_, colIndex) => !unreachableIndices.includes(colIndex))
    )

    // Create filtered matrix maintaining structure consistency (Requirements 2.4)
    const filteredMatrix: TravelTimeMatrix = {
      origins: matrix.origins, // Origins remain unchanged
      destinations: filteredDestinations,
      travelTimes: filteredTravelTimes,
      travelMode: matrix.travelMode,
    }

    // Log filtered points with coordinates and reasons (Requirements 2.5)
    const filteredPoints = sortedUnreachableIndices.map((index) => {
      const point = hypothesisPoints[index]
      const reasons = unreachabilityReasons?.get(index)
        ? Array.from(unreachabilityReasons.get(index)!)
        : ['unknown_reason']

      return {
        id: point.id,
        coordinate: point.coordinate,
        type: point.type,
        phase: point.phase,
        reasons: reasons,
      }
    })

    // Log each filtered point individually with detailed information
    filteredPoints.forEach((point, idx) => {
      logger.info(
        `Filtered unreachable hypothesis point ${idx + 1}/${filteredPoints.length}: ${point.id} at (${point.coordinate.latitude}, ${point.coordinate.longitude})`,
        {
          pointDetails: {
            id: point.id,
            coordinate: point.coordinate,
            type: point.type,
            phase: point.phase,
          },
          unreachabilityReasons: point.reasons,
        }
      )
    })

    // Log summary of filtering operation
    logger.info(
      `Filtering summary: removed ${unreachableIndices.length} unreachable hypothesis points from ${hypothesisPoints.length} total points`,
      {
        filteredCount: unreachableIndices.length,
        originalCount: hypothesisPoints.length,
        remainingCount: filteredHypothesisPoints.length,
        reasonsSummary: this.summarizeUnreachabilityReasons(
          unreachabilityReasons,
          unreachableIndices
        ),
      }
    )

    return {
      filteredMatrix,
      filteredHypothesisPoints,
      filteredCount: unreachableIndices.length,
    }
  }

  /**
   * Summarize unreachability reasons for logging
   * @param unreachabilityReasons Map of destination indices to their unreachability reasons
   * @param unreachableIndices Array of unreachable destination indices
   * @returns Summary object with reason counts
   * @private
   */
  private summarizeUnreachabilityReasons(
    unreachabilityReasons?: Map<number, Set<string>>,
    unreachableIndices: number[]
  ): Record<string, number> {
    const reasonCounts: Record<string, number> = {}

    if (!unreachabilityReasons) {
      reasonCounts['unknown_reason'] = unreachableIndices.length
      return reasonCounts
    }

    unreachableIndices.forEach((index) => {
      const reasons = unreachabilityReasons.get(index)
      if (reasons) {
        reasons.forEach((reason) => {
          reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
        })
      } else {
        reasonCounts['unknown_reason'] =
          (reasonCounts['unknown_reason'] || 0) + 1
      }
    })

    return reasonCounts
  }

  /**
   * Determine if API call should be retried based on error type
   * @param error Error from API call
   * @returns True if retry should be attempted
   * @private
   */
  private shouldRetryApiCall(error: Error | unknown): boolean {
    if (!error) {
      return false
    }

    const errorMessage =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase()

    // Retry on transient network errors
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('econnreset') ||
      errorMessage.includes('enotfound')
    ) {
      return true
    }

    // Retry on server errors (5xx)
    if (
      errorMessage.includes('server error') ||
      errorMessage.includes('503') ||
      errorMessage.includes('502') ||
      errorMessage.includes('500')
    ) {
      return true
    }

    // Do not retry on client errors (4xx) or rate limits
    if (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('401') ||
      errorMessage.includes('403') ||
      errorMessage.includes('400')
    ) {
      return false
    }

    return false
  }

  /**
   * Create appropriate error for Matrix API failures
   * @param apiError Original API error
   * @returns Formatted error with user-friendly message
   * @private
   */
  private createMatrixApiError(apiError: Error | unknown): Error {
    if (!apiError) {
      return new Error('Matrix API call failed with unknown error')
    }

    const errorMessage =
      apiError instanceof Error
        ? apiError.message.toLowerCase()
        : String(apiError).toLowerCase()

    if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
      return new Error(
        'Matrix API rate limit exceeded. Please wait before trying again.'
      )
    }

    if (errorMessage.includes('timeout')) {
      return new Error(
        'Matrix API request timed out. Please try again or reduce the number of locations.'
      )
    }

    if (
      errorMessage.includes('network') ||
      errorMessage.includes('connection')
    ) {
      return new Error(
        'Network error during matrix calculation. Please check your internet connection and try again.'
      )
    }

    if (errorMessage.includes('401') || errorMessage.includes('403')) {
      return new Error(
        'Matrix API authentication failed. Please check your API key configuration.'
      )
    }

    if (errorMessage.includes('400')) {
      return new Error(
        'Invalid request to Matrix API. Please check your location coordinates.'
      )
    }

    if (
      errorMessage.includes('500') ||
      errorMessage.includes('502') ||
      errorMessage.includes('503')
    ) {
      return new Error(
        'Matrix API server error. The service may be temporarily unavailable.'
      )
    }

    // Generic error
    const originalMessage =
      apiError instanceof Error ? apiError.message : String(apiError)
    return new Error(`Matrix API call failed: ${originalMessage}`)
  }
}

// Export singleton instance
export const singleMatrixService = new SingleMatrixService()
