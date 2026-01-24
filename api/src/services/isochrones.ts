import type { GeoJSON } from 'geojson'
import type { MutationResolvers } from 'types/graphql'
import type {
  HypothesisPoint,
  HypothesisPointType,
  AlgorithmPhase,
  OptimizationGoal,
  TravelMode,
} from 'types/graphql'

// Define TravelTimeMatrix interface locally since it's not in GraphQL schema
interface TravelTimeMatrix {
  origins: Location[]
  destinations: HypothesisPoint[]
  travelTimes: number[][]
  travelMode: TravelMode
}

import { deduplicationService } from 'src/lib/algorithms/deduplication'
import { singleMatrixService } from 'src/lib/algorithms/singleMatrix'
import { cachedOpenRouteClient } from 'src/lib/cachedOpenroute'
import {
  DEFAULT_DEDUPLICATION_THRESHOLD,
  DEFAULT_TOP_M,
  DEFAULT_GRID_SIZE,
  VALIDATION_LIMITS,
} from 'src/lib/constants'
import {
  handleResolverError,
  createInsufficientLocationsError,
  createTooManyLocationsError,
  createBufferTimeError,
  createTravelModeError,
  AppError,
  ErrorCode,
} from 'src/lib/errors'
import {
  geometryService,
  type Coordinate,
  type Location,
} from 'src/lib/geometry'
import { logger } from 'src/lib/logger'
import { matrixService } from 'src/lib/matrix'
import {
  DEFAULT_OPTIMIZATION_CONFIG,
  OptimizationConfig,
  validateOptimizationConfig,
  validateGeographicConstraints,
} from 'src/lib/optimization'

// Re-export optimization types for backward compatibility
export type { OptimizationConfig, OptimizationMode } from 'src/lib/optimization'
export { DEFAULT_OPTIMIZATION_CONFIG } from 'src/lib/optimization'

/**
 * Validate that a numeric value is finite and non-negative
 * @param value The numeric value to validate
 * @param context Descriptive context for error messages
 * @returns The validated value if valid
 * @throws Error if value is not finite or is negative
 */
const assertFinite = (value: number, context: string): number => {
  if (!Number.isFinite(value)) {
    logger.warn(`Invalid numeric value in ${context}: ${value} (not finite)`)
    throw new Error(
      `Invalid numeric value in ${context}: ${value} (not finite)`
    )
  }

  if (value < 0) {
    logger.warn(`Invalid numeric value in ${context}: ${value} (negative)`)
    throw new Error(`Invalid numeric value in ${context}: ${value} (negative)`)
  }

  return value
}

/**
 * Filter invalid travel time values from an array
 * @param travelTimes Array of travel time values to sanitize
 * @returns Array containing only valid finite travel times
 */
const sanitizeTravelTimes = (travelTimes: number[]): number[] => {
  const maxTravelTimeSeconds = 24 * 60 * 60 // 24 hours in seconds

  const validTravelTimes = travelTimes.filter((time) => {
    // Filter out NaN, Infinity, negative values, and unreasonably large values
    if (!Number.isFinite(time)) {
      return false
    }

    if (time < 0) {
      return false
    }

    if (time > maxTravelTimeSeconds) {
      return false
    }

    return true
  })

  return validTravelTimes
}

/**
 * Perform safe division with fallback values
 * @param numerator The numerator value
 * @param denominator The denominator value
 * @param fallback The fallback value to return if division would produce invalid results
 * @returns The division result if valid, otherwise the fallback value
 */
const safeDivide = (
  numerator: number,
  denominator: number,
  fallback: number = 0
): number => {
  // Check if inputs are finite numbers
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    logger.warn(
      `Safe divide: invalid inputs - numerator: ${numerator}, denominator: ${denominator}`
    )
    return fallback
  }

  // Guard against zero denominator
  if (denominator === 0) {
    logger.warn(`Safe divide: division by zero - numerator: ${numerator}`)
    return fallback
  }

  // Perform division
  const result = numerator / denominator

  // Validate result is finite
  if (!Number.isFinite(result)) {
    logger.warn(
      `Safe divide: invalid result - numerator: ${numerator}, denominator: ${denominator}, result: ${result}`
    )
    return fallback
  }

  return result
}

/**
 * Calculate safe average with empty array protection
 * @param values Array of numeric values to average
 * @param fallback The fallback value to return if averaging would produce invalid results
 * @returns The average if valid, otherwise the fallback value
 */
const safeAverage = (values: number[], fallback: number = 0): number => {
  // Handle empty array
  if (!values || values.length === 0) {
    logger.warn('Safe average: empty array provided')
    return fallback
  }

  // Filter out invalid values
  const validValues = values.filter((value) => Number.isFinite(value))

  // Check if we have any valid values left
  if (validValues.length === 0) {
    logger.warn('Safe average: no valid values after filtering')
    return fallback
  }

  // Calculate sum
  const sum = validValues.reduce((acc, value) => acc + value, 0)

  // Use safeDivide to perform the division
  return safeDivide(sum, validValues.length, fallback)
}

/**
 * Generate fallback score for each optimization goal when no valid travel times remain
 * @param goal The optimization goal (MINIMAX, MEAN, MIN)
 * @param validTravelTimes Array of valid travel times (may be empty)
 * @returns Appropriate fallback score based on the optimization goal
 */
const getFallbackScore = (
  goal: OptimizationGoal,
  validTravelTimes: number[]
): number => {
  // If no valid travel times remain, use penalty scores for completely unreachable points
  if (!validTravelTimes || validTravelTimes.length === 0) {
    logger.warn(`No valid travel times for fallback scoring with goal: ${goal}`)
    return 999999 // High penalty score for unreachable points
  }

  // Provide goal-specific fallback logic when we have some valid travel times
  switch (goal) {
    case 'MINIMAX':
      // For MINIMAX, use the maximum travel time from available valid times
      const maxTime = Math.max(...validTravelTimes)
      logger.debug(`MINIMAX fallback score: ${maxTime}`)
      return maxTime

    case 'MEAN':
      // For MEAN (variance-based), return 0 when we can't calculate variance properly
      // This represents no variance, which is optimal for the MEAN goal
      logger.debug('MEAN fallback score: 0 (no variance)')
      return 0

    case 'MIN':
      // For MIN (total travel time), sum all available valid travel times
      const totalTime = validTravelTimes.reduce((sum, time) => sum + time, 0)
      logger.debug(`MIN fallback score: ${totalTime}`)
      return totalTime

    default:
      // Default fallback to high penalty score for unknown goals
      logger.warn(
        `Unknown optimization goal for fallback: ${goal}, using penalty score`
      )
      return 999999
  }
}

/**
 * Generate hypothesis points for minimax center calculation (Phase 0 - baseline)
 * @param locations Array of participant locations
 * @returns Array of hypothesis points including geographic centroid, median coordinates, participant locations, and pairwise midpoints
 * @throws Error if insufficient locations provided or coordinate validation fails
 */
export const generateBaselineHypothesisPoints = (
  locations: Location[]
): HypothesisPoint[] => {
  if (!locations || locations.length === 0) {
    throw new Error('No locations provided for hypothesis point generation')
  }

  try {
    const hypothesisPoints: HypothesisPoint[] = []

    // 1. Add geographic centroid
    const geographicCentroid =
      geometryService.calculateGeographicCentroid(locations)
    hypothesisPoints.push({
      id: 'geographic_centroid',
      coordinate: geographicCentroid,
      type: 'GEOGRAPHIC_CENTROID',
      phase: 'ANCHOR',
      metadata: null,
    })

    // 2. Add median coordinate
    const medianCoordinate =
      geometryService.calculateMedianCoordinate(locations)
    hypothesisPoints.push({
      id: 'median_coordinate',
      coordinate: medianCoordinate,
      type: 'MEDIAN_COORDINATE',
      phase: 'ANCHOR',
      metadata: null,
    })

    // 3. Add participant locations
    locations.forEach((location, index) => {
      // Validate participant coordinates
      if (!geometryService.validateCoordinateBounds(location.coordinate)) {
        throw new Error(
          `Invalid coordinates for participant location ${location.name}: ${location.coordinate.latitude}, ${location.coordinate.longitude}`
        )
      }

      hypothesisPoints.push({
        id: `participant_${index}`,
        coordinate: location.coordinate,
        type: 'PARTICIPANT_LOCATION',
        phase: 'ANCHOR',
        metadata: {
          participantId: location.id,
          pairIds: null,
        },
      })
    })

    // 4. Add pairwise midpoints (only if we have at least 2 locations)
    if (locations.length >= 2) {
      const pairwiseMidpoints =
        geometryService.calculatePairwiseMidpoints(locations)

      let pairIndex = 0
      for (let i = 0; i < locations.length; i++) {
        for (let j = i + 1; j < locations.length; j++) {
          if (pairIndex < pairwiseMidpoints.length) {
            hypothesisPoints.push({
              id: `pairwise_${i}_${j}`,
              coordinate: pairwiseMidpoints[pairIndex],
              type: 'PAIRWISE_MIDPOINT',
              phase: 'ANCHOR',
              metadata: {
                participantId: null,
                pairIds: [locations[i].id, locations[j].id],
              },
            })
            pairIndex++
          }
        }
      }
    }

    // Validate all generated hypothesis points
    const invalidPoints = hypothesisPoints.filter(
      (point) => !geometryService.validateCoordinateBounds(point.coordinate)
    )
    if (invalidPoints.length > 0) {
      throw new Error(
        `Generated invalid hypothesis points: ${invalidPoints.map((p) => p.id).join(', ')}`
      )
    }

    logger.info(
      `Generated ${hypothesisPoints.length} hypothesis points: ${hypothesisPoints.map((p) => p.type).join(', ')}`
    )
    return hypothesisPoints
  } catch (error) {
    throw new Error(`Hypothesis point generation failed: ${error.message}`)
  }
}

/**
 * Generate multi-phase hypothesis points based on optimization configuration
 * @param locations Array of participant locations
 * @param config Optimization configuration
 * @returns Array of hypothesis points from all enabled phases
 * @throws Error if hypothesis generation fails
 */
export const generateMultiPhaseHypothesisPoints = (
  locations: Location[],
  config: OptimizationConfig = DEFAULT_OPTIMIZATION_CONFIG
): HypothesisPoint[] => {
  if (!locations || locations.length === 0) {
    throw new Error(
      'No locations provided for multi-phase hypothesis point generation'
    )
  }

  try {
    const allHypothesisPoints: HypothesisPoint[] = []

    // Phase 0: Always generate baseline hypothesis points
    logger.info('Phase 0: Generating baseline hypothesis points')
    const baselinePoints = generateBaselineHypothesisPoints(locations)
    allHypothesisPoints.push(...baselinePoints)

    // Phase 1: Coarse grid generation (if enabled)
    if (config.coarseGridConfig?.enabled && config.mode !== 'BASELINE') {
      logger.info('Phase 1: Generating coarse grid hypothesis points')
      const coarseGridPoints = generateCoarseGridHypothesisPoints(
        locations,
        config.coarseGridConfig
      )
      allHypothesisPoints.push(...coarseGridPoints)
    }

    // Phase 2: Local refinement (if enabled and we have candidates)
    if (
      config.localRefinementConfig?.enabled &&
      config.mode === 'FULL_REFINEMENT'
    ) {
      logger.info(
        'Phase 2: Local refinement will be performed after initial matrix evaluation'
      )
      // Note: Local refinement requires matrix evaluation results, so it's handled separately
    }

    // Remove duplicates and validate all points
    const uniquePoints = removeDuplicateHypothesisPoints(allHypothesisPoints)
    const validPoints = uniquePoints.filter((point) =>
      geometryService.validateCoordinateBounds(point.coordinate)
    )

    if (validPoints.length === 0) {
      throw new Error(
        'No valid hypothesis points generated from multi-phase generation'
      )
    }

    logger.info(
      `Multi-phase generation complete: ${validPoints.length} unique valid hypothesis points`
    )
    return validPoints
  } catch (error) {
    throw new Error(
      `Multi-phase hypothesis point generation failed: ${error.message}`
    )
  }
}

/**
 * Generate coarse grid hypothesis points (Phase 1)
 * @param locations Array of participant locations
 * @param config Coarse grid configuration
 * @returns Array of coarse grid hypothesis points
 * @private
 */
const generateCoarseGridHypothesisPoints = (
  locations: Location[],
  config: { paddingKm: number; gridResolution: number }
): HypothesisPoint[] => {
  try {
    // Calculate bounding box with padding
    const boundingBox = geometryService.calculateBoundingBox(
      locations,
      config.paddingKm
    )

    // Generate coarse grid points
    const gridCoordinates = geometryService.generateCoarseGridPoints(
      boundingBox,
      config.gridResolution
    )

    // Convert to hypothesis points
    const coarseGridPoints: HypothesisPoint[] = gridCoordinates.map(
      (coordinate, index) => ({
        id: `coarse_grid_${index}`,
        coordinate,
        type: 'COARSE_GRID_CELL' as HypothesisPointType,
        phase: 'COARSE_GRID' as AlgorithmPhase,
        metadata: null,
      })
    )

    logger.info(
      `Generated ${coarseGridPoints.length} coarse grid hypothesis points`
    )
    return coarseGridPoints
  } catch (error) {
    throw new Error(
      `Coarse grid hypothesis generation failed: ${error.message}`
    )
  }
}

/**
 * Generate local refinement hypothesis points (Phase 2)
 * @param candidates Array of candidate points with travel time results
 * @param config Local refinement configuration
 * @returns Array of local refinement hypothesis points
 */
export const generateLocalRefinementHypothesisPoints = (
  candidates: Array<{ coordinate: Coordinate; maxTravelTime: number }>,
  config: {
    topK: number
    refinementRadiusKm: number
    fineGridResolution: number
  }
): HypothesisPoint[] => {
  try {
    // Generate local refinement coordinates
    const refinementCoordinates = geometryService.generateLocalRefinementPoints(
      candidates,
      config.topK,
      config.refinementRadiusKm,
      config.fineGridResolution
    )

    // Convert to hypothesis points
    const refinementPoints: HypothesisPoint[] = refinementCoordinates.map(
      (coordinate, index) => ({
        id: `local_refinement_${index}`,
        coordinate,
        type: 'LOCAL_REFINEMENT_CELL' as HypothesisPointType,
        phase: 'LOCAL_REFINEMENT' as AlgorithmPhase,
        metadata: null,
      })
    )

    logger.info(
      `Generated ${refinementPoints.length} local refinement hypothesis points`
    )
    return refinementPoints
  } catch (error) {
    throw new Error(
      `Local refinement hypothesis generation failed: ${error.message}`
    )
  }
}

/**
 * Remove duplicate hypothesis points that are very close to each other
 * @param points Array of hypothesis points
 * @returns Array of unique hypothesis points
 * @private
 */
const removeDuplicateHypothesisPoints = (
  points: HypothesisPoint[]
): HypothesisPoint[] => {
  const uniquePoints: HypothesisPoint[] = []
  const thresholdDegrees = 0.001 // ~100m threshold

  for (const point of points) {
    let isDuplicate = false

    for (const existingPoint of uniquePoints) {
      const latDiff = Math.abs(
        point.coordinate.latitude - existingPoint.coordinate.latitude
      )
      const lngDiff = Math.abs(
        point.coordinate.longitude - existingPoint.coordinate.longitude
      )

      if (latDiff < thresholdDegrees && lngDiff < thresholdDegrees) {
        isDuplicate = true
        break
      }
    }

    if (!isDuplicate) {
      uniquePoints.push(point)
    }
  }

  return uniquePoints
}

/**
 * Calculate optimal meeting points using simplified two-phase algorithm (Cost-controlled - no automatic isochrones)
 * Phase 1: Generate hypothesis points (anchors + grid)
 * Phase 2: Evaluate all points with single Matrix API call and select optimal points
 * Requirements: 1.2, 1.4 - Single Matrix API call for hypothesis evaluation
 * @param locations Array of participant locations
 * @param travelMode Travel mode for matrix calculations
 * @param optimizationGoal Optimization goal (MINIMAX, MEAN, MIN)
 * @param topM Number of top optimal points to return
 * @param gridSize Grid dimensions for bounding box grid (default 5x5)
 * @param deduplicationThreshold Distance threshold in meters for point merging
 * @returns OptimalLocationResult with optimal points but no automatic isochrones
 * @throws Error if calculation fails at any phase
 */
const calculateOptimalLocationsSimplified = async (
  locations: Location[],
  travelMode: TravelMode,
  optimizationGoal: OptimizationGoal,
  topM: number = DEFAULT_TOP_M,
  gridSize: number = DEFAULT_GRID_SIZE,
  deduplicationThreshold: number = DEFAULT_DEDUPLICATION_THRESHOLD
): Promise<{
  optimalPoints: Array<{
    id: string
    coordinate: Coordinate
    travelTimeMetrics: {
      maxTravelTime: number
      averageTravelTime: number
      totalTravelTime: number
      variance: number
    }
    rank: number
  }>
  debugPoints: Array<{
    id: string
    coordinate: Coordinate
    type: 'ANCHOR' | 'GRID'
  }>
  matrixApiCalls: number
  totalHypothesisPoints: number
}> => {
  try {
    // Phase 1: Generate hypothesis points
    logger.info(
      'Phase 1: Generating hypothesis points for simplified two-phase algorithm'
    )

    // Step 1.1: Generate anchor points (Requirements 1.1)
    const anchorPoints = generateBaselineHypothesisPoints(locations)
    logger.info(`Generated ${anchorPoints.length} anchor points`)

    // Step 1.2: Generate bounding box grid points (Requirements 1.1)
    const gridPoints = generateBoundingBoxGridPoints(locations, gridSize)
    logger.info(`Generated ${gridPoints.length} grid points`)

    // Phase 2: Single matrix evaluation (Requirements 1.2, 1.4)
    logger.info(
      'Phase 2: Evaluating all hypothesis points with single Matrix API call'
    )

    const origins = locations.map((loc) => loc.coordinate)
    let matrixResult
    try {
      matrixResult = await singleMatrixService.evaluateAllHypothesisPoints(
        origins,
        anchorPoints,
        gridPoints,
        travelMode
      )
    } catch (matrixError) {
      logger.error('Single matrix evaluation failed:', {
        message: matrixError?.message,
        stack: matrixError?.stack,
        originsCount: origins.length,
        anchorPointsCount: anchorPoints.length,
        gridPointsCount: gridPoints.length,
        travelMode,
        optimizationGoal,
        fullError: matrixError,
        apiCallCount: singleMatrixService.getApiCallCount(),
      })
      throw new Error(
        `Single matrix evaluation failed: ${matrixError?.message || 'Unknown error'}`
      )
    }

    logger.info(
      `Single matrix evaluation complete: ${matrixResult.totalHypothesisPoints} points evaluated with ${matrixResult.apiCallCount} API call(s)`
    )

    // Step 2.1: Score and rank all hypothesis points
    logger.info(
      `Scoring ${matrixResult.hypothesisPoints.length} hypothesis points with goal: ${optimizationGoal}`
    )
    const scoredPoints = scoreHypothesisPointsSimplified(
      matrixResult.hypothesisPoints,
      matrixResult.matrix,
      optimizationGoal
    )
    logger.info(`Scoring complete: ${scoredPoints.length} valid scored points`)

    // Step 2.2: Apply deduplication (Requirements 6.1, 6.2)
    const deduplicatedPoints = deduplicationService.deduplicate(
      scoredPoints,
      deduplicationThreshold
    )

    // Step 2.3: Select top M optimal points
    const optimalPoints = deduplicatedPoints
      .slice(0, Math.min(topM, deduplicatedPoints.length))
      .map((point, index) => ({
        id: point.id,
        coordinate: point.coordinate,
        travelTimeMetrics: point.travelTimeMetrics || {
          maxTravelTime: 0,
          averageTravelTime: 0,
          totalTravelTime: 0,
          variance: 0,
        },
        rank: index + 1,
      }))

    // Create debug points for visualization
    const debugPoints = [
      ...anchorPoints.map((point) => ({
        id: point.id,
        coordinate: point.coordinate,
        type: 'ANCHOR' as const,
      })),
      ...gridPoints.map((point) => ({
        id: point.id,
        coordinate: point.coordinate,
        type: 'GRID' as const,
      })),
    ]

    const result = {
      optimalPoints,
      debugPoints,
      matrixApiCalls: matrixResult.apiCallCount,
      totalHypothesisPoints: matrixResult.totalHypothesisPoints,
    }

    logger.info(
      `Simplified two-phase algorithm complete: ${optimalPoints.length} optimal points, ${matrixResult.apiCallCount} Matrix API calls, 0 Isochrone API calls`
    )
    return result
  } catch (error) {
    // Log detailed error information for debugging
    logger.error('Simplified two-phase algorithm failed:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      phase: 'unknown',
      fullError: error,
      locations: locations?.length,
      travelMode,
      optimizationGoal,
      topM,
      gridSize,
      deduplicationThreshold,
      apiCallCount: singleMatrixService.getApiCallCount(),
    })

    // Reset shared state to prevent corruption of subsequent requests
    try {
      singleMatrixService.resetApiCallCount()
      logger.info('Reset singleMatrixService state after algorithm failure')
    } catch (resetError) {
      logger.error('Failed to reset singleMatrixService state:', resetError)
    }

    throw error
  }
}

/**
 * Generate bounding box grid points for simplified algorithm
 * @param locations Array of participant locations
 * @param gridSize Grid dimensions (e.g., 5 for 5x5 grid)
 * @returns Array of grid hypothesis points
 * @private
 */
const generateBoundingBoxGridPoints = (
  locations: Location[],
  gridSize: number
): HypothesisPoint[] => {
  try {
    // Calculate bounding box containing all locations
    const boundingBox = geometryService.calculateBoundingBox(locations, 0) // No padding for simplified approach

    // Generate grid coordinates
    const gridCoordinates: Coordinate[] = []

    const latStep = (boundingBox.north - boundingBox.south) / gridSize
    const lngStep = (boundingBox.east - boundingBox.west) / gridSize

    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        // Use grid cell centers
        const latitude = boundingBox.south + (i + 0.5) * latStep
        const longitude = boundingBox.west + (j + 0.5) * lngStep

        gridCoordinates.push({ latitude, longitude })
      }
    }

    // Convert to hypothesis points
    const gridPoints: HypothesisPoint[] = gridCoordinates.map(
      (coordinate, index) => ({
        id: `grid_${index}`,
        coordinate,
        type: 'COARSE_GRID_CELL' as HypothesisPointType,
        phase: 'COARSE_GRID' as AlgorithmPhase,
        metadata: null,
      })
    )

    logger.info(
      `Generated ${gridPoints.length} bounding box grid points (${gridSize}x${gridSize})`
    )
    return gridPoints
  } catch (error) {
    throw new Error(`Bounding box grid generation failed: ${error.message}`)
  }
}

/**
 * Score hypothesis points for simplified algorithm
 * @param points Array of hypothesis points
 * @param matrix Travel time matrix
 * @param goal Optimization goal
 * @returns Array of scored hypothesis points
 * @private
 */
const scoreHypothesisPointsSimplified = (
  points: HypothesisPoint[],
  matrix: TravelTimeMatrix,
  goal: OptimizationGoal
): (HypothesisPoint & {
  score?: number
  travelTimeMetrics?: {
    maxTravelTime: number
    averageTravelTime: number
    totalTravelTime: number
    variance: number
  }
})[] => {
  try {
    const scoredPoints = points
      .map((point, index) => {
        try {
          const rawTravelTimes: number[] = []

          // Collect travel times from all origins to this point
          for (
            let originIndex = 0;
            originIndex < matrix.origins.length;
            originIndex++
          ) {
            const travelTime = matrix.travelTimes[originIndex][index]
            rawTravelTimes.push(travelTime)
          }

          // Apply travel time sanitization before metric calculations
          const sanitizedTravelTimes = sanitizeTravelTimes(rawTravelTimes)

          // Check if we have any valid travel times after sanitization
          if (sanitizedTravelTimes.length === 0) {
            logger.warn(
              `No valid travel times for point ${point.id} after sanitization, using fallback score`
            )

            // Use fallback scoring when no valid travel times remain
            const fallbackScore = getFallbackScore(goal, [])

            return {
              ...point,
              score: fallbackScore,
              travelTimeMetrics: {
                maxTravelTime: 999999,
                averageTravelTime: 999999,
                totalTravelTime: 999999,
                variance: 0,
              },
            }
          }

          // Use safe mathematical operations for all calculations
          const maxTravelTime = Math.max(...sanitizedTravelTimes)
          const averageTravelTime = safeAverage(sanitizedTravelTimes, 0)
          const totalTravelTime = sanitizedTravelTimes.reduce(
            (sum, time) => sum + time,
            0
          )

          // Calculate variance using safe operations
          const varianceSum = sanitizedTravelTimes.reduce(
            (sum, time) => sum + Math.pow(time - averageTravelTime, 2),
            0
          )
          const variance = safeDivide(
            varianceSum,
            sanitizedTravelTimes.length,
            0
          )

          // Validate all calculated metrics using assertFinite
          try {
            assertFinite(maxTravelTime, `maxTravelTime for point ${point.id}`)
            assertFinite(
              averageTravelTime,
              `averageTravelTime for point ${point.id}`
            )
            assertFinite(
              totalTravelTime,
              `totalTravelTime for point ${point.id}`
            )
            assertFinite(variance, `variance for point ${point.id}`)
          } catch (validationError) {
            logger.warn(
              `Validation failed for point ${point.id}: ${validationError.message}, using fallback score`
            )

            // Implement fallback scoring when primary calculations fail
            const fallbackScore = getFallbackScore(goal, sanitizedTravelTimes)

            return {
              ...point,
              score: fallbackScore,
              travelTimeMetrics: {
                maxTravelTime: Math.max(...sanitizedTravelTimes),
                averageTravelTime: safeAverage(sanitizedTravelTimes, 0),
                totalTravelTime: sanitizedTravelTimes.reduce(
                  (sum, time) => sum + time,
                  0
                ),
                variance: 0, // Safe fallback for variance
              },
            }
          }

          // Calculate score based on optimization goal using validated metrics
          let score: number
          switch (goal) {
            case 'MINIMAX':
              score = maxTravelTime
              break
            case 'MEAN':
              score = variance
              // Special handling for single travel time (variance should be 0)
              if (sanitizedTravelTimes.length === 1) {
                score = 0
              }
              break
            case 'MIN':
              score = totalTravelTime
              break
            default:
              logger.warn(
                `Unknown optimization goal: ${goal}, defaulting to MINIMAX`
              )
              score = maxTravelTime
          }

          // Ensure all returned values are validated before GraphQL serialization
          try {
            assertFinite(
              score,
              `final score for point ${point.id} with goal ${goal}`
            )
          } catch (scoreValidationError) {
            logger.error(
              `Final score validation failed for point ${point.id}: ${scoreValidationError.message}, using fallback`
            )

            // Use fallback scoring as last resort
            score = getFallbackScore(goal, sanitizedTravelTimes)
          }

          return {
            ...point,
            score,
            travelTimeMetrics: {
              maxTravelTime,
              averageTravelTime,
              totalTravelTime,
              variance,
            },
          }
        } catch (pointError) {
          logger.error(`Error scoring point ${point.id}:`, pointError)

          // Return fallback result for completely failed points
          const fallbackScore = getFallbackScore(goal, [])
          return {
            ...point,
            score: fallbackScore,
            travelTimeMetrics: {
              maxTravelTime: 999999,
              averageTravelTime: 999999,
              totalTravelTime: 999999,
              variance: 0,
            },
          }
        }
      })
      .filter((point): point is NonNullable<typeof point> => point !== null) // Filter out null values

    // Validate we have some valid points
    if (scoredPoints.length === 0) {
      throw new Error('No valid scored points after filtering')
    }

    return scoredPoints.sort((a, b) => (a.score || 0) - (b.score || 0))
  } catch (error) {
    logger.error('Scoring failed:', error)
    throw new Error(`Hypothesis point scoring failed: ${error.message}`)
  }
}

/**
 * Calculate minimax center using multi-phase optimization pipeline (Cost-controlled - no automatic isochrones)
 * Integrates hypothesis generation, batched matrix evaluation, and optimization
 * Requirements: 3.1 - NO automatic Isochrone API calls during hypothesis generation
 * @param locations Array of participant locations
 * @param travelMode Travel mode for matrix calculations
 * @param bufferTimeMinutes Buffer time for potential isochrone visualization (not automatically calculated)
 * @param config Optimization configuration
 * @returns IsochroneResult with optimal center point but no automatic fairMeetingArea
 * @throws Error if calculation fails at any phase
 */
const calculateMultiPhaseMinimaxCenter = async (
  locations: Location[],
  travelMode: string,
  bufferTimeMinutes: number,
  config: OptimizationConfig
): Promise<{
  centerPoint: Coordinate
  fairMeetingArea: GeoJSON.Polygon
  individualIsochrones: GeoJSON.Polygon[]
}> => {
  try {
    // Step 1: Generate Phase 0 (baseline) hypothesis points (Requirements 4.1.1)
    logger.info('Step 1: Generating Phase 0 (baseline) hypothesis points')
    const phase0Points = generateBaselineHypothesisPoints(locations)
    logger.info(`Generated ${phase0Points.length} Phase 0 hypothesis points`)

    // Step 2: Generate Phase 1 (coarse grid) hypothesis points if enabled (Requirements 4.1.2)
    let phase1Points: HypothesisPoint[] = []
    if (config.coarseGridConfig?.enabled && config.mode !== 'BASELINE') {
      logger.info('Step 2: Generating Phase 1 (coarse grid) hypothesis points')
      phase1Points = generateCoarseGridHypothesisPoints(
        locations,
        config.coarseGridConfig
      )
      logger.info(`Generated ${phase1Points.length} Phase 1 hypothesis points`)
    } else {
      logger.info(
        'Step 2: Skipping Phase 1 (coarse grid disabled or BASELINE mode)'
      )
    }

    // Step 3: Evaluate batched matrix for Phase 0+1 (Requirements 4.2.1)
    logger.info('Step 3: Evaluating batched matrix for Phase 0+1')
    const origins = locations.map((loc) => loc.coordinate)

    const batchedResult = await matrixService.evaluateBatchedMatrix(
      origins,
      phase0Points,
      phase1Points,
      travelMode as TravelMode
    )
    logger.info(
      `Batched matrix evaluation complete: ${batchedResult.totalHypothesisPoints.length} total points evaluated, ${batchedResult.apiCallCount} API calls`
    )

    // Step 4: Generate Phase 2 (local refinement) points if enabled (Requirements 4.1.3)
    let phase2Result:
      | { hypothesisPoints: HypothesisPoint[]; matrix: TravelTimeMatrix }
      | undefined = undefined
    if (
      config.localRefinementConfig?.enabled &&
      config.mode === 'FULL_REFINEMENT'
    ) {
      logger.info(
        'Step 4: Generating Phase 2 (local refinement) hypothesis points'
      )

      try {
        // Find top candidates from Phase 0+1 results for refinement
        const topCandidates = findTopCandidatesForRefinement(
          batchedResult,
          config.localRefinementConfig.topK
        )

        if (topCandidates.length > 0) {
          // Generate local refinement points around top candidates
          const phase2Points = generateLocalRefinementHypothesisPoints(
            topCandidates,
            config.localRefinementConfig
          )

          if (phase2Points.length > 0) {
            logger.info(
              `Generated ${phase2Points.length} Phase 2 hypothesis points`
            )

            // For now, treat all Phase 2 points as a single local grid group
            // Future enhancement: support multiple local grids based on spatial clustering
            const localGridGroups = [phase2Points]

            // Evaluate Phase 2 matrix separately (Requirements 1.5)
            try {
              const localGridResults =
                await matrixService.evaluateLocalGridsSeparately(
                  origins,
                  localGridGroups,
                  travelMode as TravelMode
                )

              if (localGridResults.length > 0) {
                // Combine local grid results into single Phase 2 result
                phase2Result =
                  matrixService.combineLocalGridResults(localGridResults)
                logger.info(
                  `Phase 2 matrix evaluation complete: ${phase2Result.hypothesisPoints.length} points, ${matrixService.getApiCallCount()} total API calls`
                )
              } else {
                logger.warn(
                  'No local grid results returned, continuing without Phase 2'
                )
                phase2Result = undefined
              }
            } catch (phase2Error) {
              logger.warn(
                'Phase 2 matrix evaluation failed, continuing without local refinement:',
                phase2Error
              )
              // Graceful degradation: continue without Phase 2 results
              phase2Result = undefined
            }
          } else {
            logger.info(
              'No Phase 2 points generated, skipping Phase 2 matrix evaluation'
            )
          }
        } else {
          logger.info(
            'No top candidates found for refinement, skipping Phase 2'
          )
        }
      } catch (phase2GenerationError) {
        logger.warn(
          'Phase 2 hypothesis generation failed, continuing without local refinement:',
          phase2GenerationError
        )
        // Graceful degradation: continue without Phase 2 results
        phase2Result = undefined
      }
    } else {
      logger.info(
        'Step 4: Skipping Phase 2 (local refinement disabled or not FULL_REFINEMENT mode)'
      )
    }

    // Step 5: Find multi-phase minimax optimal point (Requirements 4.3)
    logger.info('Step 5: Finding multi-phase minimax optimal point')
    let optimalResult
    let allHypothesisPoints: HypothesisPoint[]

    try {
      const multiPhaseResult = matrixService.findMultiPhaseMinimaxOptimal(
        batchedResult,
        phase2Result
      )

      // Combine all hypothesis points for indexing
      allHypothesisPoints = [...batchedResult.totalHypothesisPoints]
      if (phase2Result) {
        allHypothesisPoints.push(...phase2Result.hypothesisPoints)
      }

      optimalResult = {
        optimalIndex: multiPhaseResult.optimalIndex,
        maxTravelTime: multiPhaseResult.maxTravelTime,
        averageTravelTime: multiPhaseResult.averageTravelTime,
      }

      logger.info(
        `Multi-phase optimal point found: index ${optimalResult.optimalIndex}, max time ${optimalResult.maxTravelTime}min, phase ${multiPhaseResult.optimalPhase}`
      )
    } catch (error) {
      logger.error('Multi-phase minimax optimization failed:', error)

      // Fallback to geographic centroid with error handling (Requirements 4.5, 9.1, 9.2)
      return await handleOptimizationFallback(
        locations,
        travelMode,
        bufferTimeMinutes,
        error
      )
    }

    // Get the optimal hypothesis point
    const optimalHypothesisPoint =
      allHypothesisPoints[optimalResult.optimalIndex]
    if (!optimalHypothesisPoint) {
      throw new Error(`Invalid optimal index: ${optimalResult.optimalIndex}`)
    }

    const centerPoint = optimalHypothesisPoint.coordinate
    logger.info(
      `Selected optimal meeting point: ${centerPoint.latitude}, ${centerPoint.longitude} (${optimalHypothesisPoint.type})`
    )

    // COST-CONTROLLED: Do NOT generate fairMeetingArea automatically (Requirements 3.1)
    // Return placeholder polygon that can be calculated on-demand
    logger.info(
      'Cost-controlled mode: Skipping automatic fair meeting area isochrone generation'
    )
    const placeholderFairMeetingArea: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [centerPoint.longitude, centerPoint.latitude],
          [centerPoint.longitude, centerPoint.latitude],
          [centerPoint.longitude, centerPoint.latitude],
          [centerPoint.longitude, centerPoint.latitude],
        ],
      ],
    }

    // Return the result without automatic isochrone calculation
    const result = {
      centerPoint,
      fairMeetingArea: placeholderFairMeetingArea,
      individualIsochrones: [], // Minimax approach doesn't use individual isochrones
    }

    logger.info(
      `Multi-phase minimax center calculation completed successfully (cost-controlled): max travel time ${optimalResult.maxTravelTime}min, avg travel time ${optimalResult.averageTravelTime.toFixed(1)}min, 0 Isochrone API calls`
    )
    return result
  } catch (error) {
    logger.error('Multi-phase minimax center calculation failed:', error)
    throw error
  }
}

/**
 * Find top candidates from batched matrix results for local refinement
 * @param batchedResult Result from Phase 0+1 batched evaluation
 * @param topK Number of top candidates to select
 * @returns Array of top candidates with coordinates and travel times
 * @private
 */
const findTopCandidatesForRefinement = (
  batchedResult: {
    combinedMatrix: TravelTimeMatrix
    totalHypothesisPoints: HypothesisPoint[]
    apiCallCount: number
  },
  topK: number
): Array<{ coordinate: Coordinate; maxTravelTime: number }> => {
  try {
    const matrix = batchedResult.combinedMatrix
    const candidates: Array<{
      coordinate: Coordinate
      maxTravelTime: number
      index: number
    }> = []

    // Calculate max travel time for each hypothesis point
    for (
      let destIndex = 0;
      destIndex < matrix.destinations.length;
      destIndex++
    ) {
      const travelTimesToDest: number[] = []
      let hasValidRoute = false

      // Collect travel times from all origins to this destination
      for (
        let originIndex = 0;
        originIndex < matrix.origins.length;
        originIndex++
      ) {
        const travelTime = matrix.travelTimes[originIndex][destIndex]

        // Skip unreachable routes
        if (
          travelTime !== Infinity &&
          travelTime >= 0 &&
          Number.isFinite(travelTime)
        ) {
          travelTimesToDest.push(travelTime)
          hasValidRoute = true
        }
      }

      // Skip hypothesis points that are unreachable
      if (hasValidRoute && travelTimesToDest.length === matrix.origins.length) {
        const maxTime = Math.max(...travelTimesToDest)
        candidates.push({
          coordinate: matrix.destinations[destIndex],
          maxTravelTime: maxTime,
          index: destIndex,
        })
      }
    }

    // Sort by max travel time (ascending) and select top K
    candidates.sort((a, b) => a.maxTravelTime - b.maxTravelTime)
    const topCandidates = candidates.slice(0, Math.min(topK, candidates.length))

    logger.info(
      `Selected ${topCandidates.length} top candidates for local refinement (max times: ${topCandidates.map((c) => c.maxTravelTime.toFixed(1)).join(', ')}min)`
    )

    return topCandidates.map((c) => ({
      coordinate: c.coordinate,
      maxTravelTime: c.maxTravelTime,
    }))
  } catch (error) {
    logger.error('Failed to find top candidates for refinement:', error)
    return []
  }
}

/**
 * Handle optimization fallback when multi-phase optimization fails (Cost-controlled - no automatic isochrones)
 * @param locations Array of participant locations
 * @param travelMode Travel mode for isochrone calculation
 * @param bufferTimeMinutes Buffer time for visualization (not automatically calculated)
 * @param originalError Original optimization error
 * @returns Fallback result using geographic centroid without automatic isochrone
 * @private
 */
const handleOptimizationFallback = async (
  locations: Location[],
  travelMode: string,
  bufferTimeMinutes: number,
  originalError: Error | unknown
): Promise<{
  centerPoint: Coordinate
  fairMeetingArea: GeoJSON.Polygon
  individualIsochrones: GeoJSON.Polygon[]
}> => {
  logger.info(
    'Falling back to geographic centroid due to optimization failure (cost-controlled mode)'
  )

  try {
    const geographicCentroid =
      geometryService.calculateGeographicCentroid(locations)

    // COST-CONTROLLED: Do NOT generate fairMeetingArea automatically (Requirements 3.1)
    // Return placeholder polygon that can be calculated on-demand
    const placeholderFairMeetingArea: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [geographicCentroid.longitude, geographicCentroid.latitude],
          [geographicCentroid.longitude, geographicCentroid.latitude],
          [geographicCentroid.longitude, geographicCentroid.latitude],
          [geographicCentroid.longitude, geographicCentroid.latitude],
        ],
      ],
    }

    logger.info(
      'Fallback to geographic centroid completed successfully (cost-controlled mode)'
    )

    return {
      centerPoint: geographicCentroid,
      fairMeetingArea: placeholderFairMeetingArea,
      individualIsochrones: [],
    }
  } catch (fallbackError) {
    logger.error('Fallback to geographic centroid also failed:', fallbackError)
    throw new AppError({
      code: ErrorCode.OPTIMIZATION_FALLBACK_FAILED,
      message: 'Both multi-phase optimization and fallback failed',
      userMessage:
        'Unable to calculate optimal meeting point. Please check your locations and try again.',
      originalError: originalError,
    })
  }
}

/**
 * Generate multi-phase hypothesis points without automatic isochrone generation (Cost-controlled approach)
 * Requirements: 3.1, 3.3, 3.4 - No automatic isochrone API calls, display top N points immediately
 */
export const generateHypothesisPointsResolver: MutationResolvers['generateHypothesisPoints'] =
  async ({
    locations,
    travelMode,
    enableLocalRefinement,
    optimizationGoal,
    topM = 5,
    topN = 5,
    deduplicationThreshold = 100.0,
  }) => {
    try {
      logger.info(
        `Starting cost-controlled hypothesis generation for ${locations.length} locations`
      )

      // Validate minimum locations
      if (locations.length < 2) {
        throw createInsufficientLocationsError()
      }

      // Validate maximum locations for performance
      if (locations.length > 12) {
        throw createTooManyLocationsError()
      }

      // Validate travel mode
      if (
        !['DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'].includes(travelMode)
      ) {
        throw createTravelModeError(travelMode)
      }

      // Convert GraphQL input to Location objects with validation
      const participantLocations: Location[] = locations.map((loc, index) => {
        const coordinate = {
          latitude: loc.latitude,
          longitude: loc.longitude,
        }

        // Validate input coordinates
        if (!geometryService.validateCoordinateBounds(coordinate)) {
          throw new Error(
            `Invalid coordinates for location ${index + 1}: ${coordinate.latitude}, ${coordinate.longitude}. Coordinates must be within valid geographic bounds.`
          )
        }

        return {
          id: `location_${index}`,
          name: loc.name || `Location ${index + 1}`,
          coordinate,
        }
      })

      // Phase 0: Generate anchor points (always enabled)
      logger.info('Phase 0: Generating anchor points')
      const anchorPoints =
        generateBaselineHypothesisPoints(participantLocations)
      // Validate all generated anchor points
      const invalidPoints = anchorPoints.filter(
        (point) => !geometryService.validateCoordinateBounds(point.coordinate)
      )
      if (invalidPoints.length > 0) {
        logger.error(
          `Generated invalid anchor points: ${invalidPoints.map((p) => `${p.id}: ${p.coordinate.latitude}, ${p.coordinate.longitude}`).join(', ')}`
        )
        throw new Error(
          `Generated invalid anchor points: ${invalidPoints.map((p) => p.id).join(', ')}`
        )
      }

      logger.info(`Generated ${anchorPoints.length} anchor points`)

      // Phase 1: Generate coarse grid points (always enabled for multi-phase)
      logger.info('Phase 1: Generating coarse grid points')
      const coarseGridPoints = generateCoarseGridHypothesisPoints(
        participantLocations,
        {
          paddingKm: 5.0,
          gridResolution: 10,
        }
      )

      // Validate all generated coarse grid points
      const invalidGridPoints = coarseGridPoints.filter(
        (point) => !geometryService.validateCoordinateBounds(point.coordinate)
      )
      if (invalidGridPoints.length > 0) {
        logger.error(
          `Generated invalid coarse grid points: ${invalidGridPoints.map((p) => `${p.id}: ${p.coordinate.latitude}, ${p.coordinate.longitude}`).join(', ')}`
        )
        throw new Error(
          `Generated invalid coarse grid points: ${invalidGridPoints.map((p) => p.id).join(', ')}`
        )
      }

      logger.info(`Generated ${coarseGridPoints.length} coarse grid points`)

      // Combine Phase 0 + 1 points for matrix evaluation
      // const phase01Points = [...anchorPoints, ...coarseGridPoints] // Not used directly

      // Evaluate Phase 0+1 using Matrix API (single batched call)
      logger.info('Evaluating Phase 0+1 points using Matrix API')
      const origins = participantLocations.map((loc) => loc.coordinate)

      let batchedResult
      try {
        batchedResult = await matrixService.evaluateBatchedMatrix(
          origins,
          anchorPoints,
          coarseGridPoints,
          travelMode
        )
        logger.info(
          `Phase 0+1 matrix evaluation complete: ${batchedResult.apiCallCount} API calls`
        )
      } catch (matrixError) {
        // Handle Matrix API errors with user-friendly messages
        if (
          matrixError.message?.includes('rate limit') ||
          matrixError.message?.includes('quota')
        ) {
          logger.error(
            'Matrix API rate limit reached during hypothesis evaluation'
          )
          throw new Error(
            'API rate limit reached. Please wait a moment before generating new hypothesis points.'
          )
        }

        if (matrixError.message?.includes('timeout')) {
          logger.error('Matrix API timeout during hypothesis evaluation')
          throw new Error(
            'Matrix calculation timed out. Please try again with fewer locations or a different travel mode.'
          )
        }

        logger.error('Matrix API evaluation failed:', matrixError)
        throw new Error(
          'Unable to evaluate travel times. Please check your locations and try again.'
        )
      }

      // Score and rank Phase 0+1 points
      const scoredPhase01Points = scoreHypothesisPoints(
        batchedResult.totalHypothesisPoints,
        batchedResult.combinedMatrix,
        optimizationGoal
      )

      let localRefinementPoints: HypothesisPoint[] = []
      let finalPoints = scoredPhase01Points
      let totalApiCalls = batchedResult.apiCallCount

      // Phase 2: Local refinement (if enabled)
      if (enableLocalRefinement) {
        logger.info('Phase 2: Generating local refinement points')

        // Select top M points for refinement with deduplication
        const topCandidates = selectTopCandidatesWithDeduplication(
          scoredPhase01Points,
          topM,
          deduplicationThreshold
        )

        if (topCandidates.length > 0) {
          // Generate local refinement points around top candidates
          localRefinementPoints = generateLocalRefinementHypothesisPoints(
            topCandidates.map((p) => ({
              coordinate: p.coordinate,
              maxTravelTime: p.travelTimeMetrics?.maxTravelTime || 0,
            })),
            {
              topK: topCandidates.length,
              refinementRadiusKm: 2.0,
              fineGridResolution: 5,
            }
          )

          if (localRefinementPoints.length > 0) {
            logger.info(
              `Generated ${localRefinementPoints.length} local refinement points`
            )

            // Evaluate local refinement points using separate Matrix API calls
            const localGridGroups = [localRefinementPoints] // Treat as single group for now
            const localGridResults =
              await matrixService.evaluateLocalGridsSeparately(
                origins,
                localGridGroups,
                travelMode
              )

            if (localGridResults.length > 0) {
              const phase2Result =
                matrixService.combineLocalGridResults(localGridResults)
              const scoredLocalPoints = scoreHypothesisPoints(
                phase2Result.hypothesisPoints,
                phase2Result.matrix,
                optimizationGoal
              )

              // Combine all phases for final selection
              finalPoints = [...scoredPhase01Points, ...scoredLocalPoints]
              totalApiCalls += localGridResults.length // One API call per local grid
              logger.info(
                `Phase 2 complete: ${localGridResults.length} additional API calls`
              )
            }
          }
        } else {
          logger.info(
            'No candidates selected for local refinement after deduplication'
          )
        }
      }

      // Apply final deduplication and select top N points of interest
      const pointsOfInterest = selectPointsOfInterestWithDeduplication(
        finalPoints,
        topN,
        deduplicationThreshold
      )

      // Ensure we have at least some points to return
      if (pointsOfInterest.length === 0) {
        logger.error(
          'No valid points of interest generated - all hypothesis points may be unreachable'
        )
        throw new Error(
          'No valid meeting points found. All generated locations may be unreachable by the selected travel mode.'
        )
      }

      // Warn about high API usage
      if (totalApiCalls > 10) {
        logger.warn(
          `High Matrix API usage: ${totalApiCalls} calls made during hypothesis generation`
        )
      }

      logger.info(
        `Cost-controlled hypothesis generation complete: ${pointsOfInterest.length} points of interest, ${totalApiCalls} Matrix API calls, 0 Isochrone API calls`
      )

      return {
        anchorPoints,
        coarseGridPoints,
        localRefinementPoints,
        finalPoints,
        pointsOfInterest,
        matrixApiCalls: totalApiCalls,
        totalHypothesisPoints: finalPoints.length,
      }
    } catch (error) {
      handleResolverError(error, 'generateHypothesisPoints')
    }
  }

/**
 * Calculate isochrone for a specific hypothesis point on-demand (Cost-controlled approach)
 * Requirements: 3.2, 3.5 - Generate isochrones only on user click, cache responses
 */
export const calculateIsochroneResolver: MutationResolvers['calculateIsochrone'] =
  async ({ pointId, coordinate, travelTimeMinutes, travelMode }) => {
    try {
      logger.info(`Calculating on-demand isochrone for point ${pointId}`)

      // Validate travel mode
      if (
        !['DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'].includes(travelMode)
      ) {
        throw createTravelModeError(travelMode)
      }

      // Validate travel time
      if (travelTimeMinutes < 5 || travelTimeMinutes > 60) {
        throw createBufferTimeError(travelTimeMinutes)
      }

      // Validate coordinate input
      const pointCoordinate: Coordinate = {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      }

      if (!geometryService.validateCoordinateBounds(pointCoordinate)) {
        throw new Error(
          `Invalid coordinates for isochrone calculation: ${pointCoordinate.latitude}, ${pointCoordinate.longitude}. Coordinates must be within valid geographic bounds.`
        )
      }

      // Calculate isochrone using cached client (automatic caching)
      const isochroneParams = {
        travelTimeMinutes,
        travelMode: travelMode as TravelMode,
      }

      try {
        const isochrone = await cachedOpenRouteClient.calculateIsochrone(
          pointCoordinate,
          isochroneParams
        )

        logger.info(
          `On-demand isochrone calculated successfully for point ${pointId}`
        )
        return isochrone
      } catch (apiError) {
        // Handle specific API errors with user-friendly messages
        if (
          apiError.message?.includes('rate limit') ||
          apiError.message?.includes('quota')
        ) {
          logger.warn(`Isochrone API rate limit reached for point ${pointId}`)
          throw new Error(
            'API rate limit reached. Please wait a moment before requesting more isochrones.'
          )
        }

        if (
          apiError.message?.includes('unreachable') ||
          apiError.message?.includes('no route')
        ) {
          logger.warn(
            `No routes found for isochrone calculation at point ${pointId}`
          )
          throw new Error(
            'No routes found for this location with the selected travel mode. The location may be unreachable or isolated.'
          )
        }

        if (apiError.message?.includes('timeout')) {
          logger.warn(`Isochrone calculation timeout for point ${pointId}`)
          throw new Error(
            'Isochrone calculation timed out. Please try again or select a different location.'
          )
        }

        // Generic API error
        logger.error(`Isochrone API error for point ${pointId}:`, apiError)
        throw new Error(
          'Unable to calculate isochrone. Please check your internet connection and try again.'
        )
      }
    } catch (error) {
      logger.error(
        `On-demand isochrone calculation failed for point ${pointId}:`,
        error
      )
      handleResolverError(error, 'calculateIsochrone')
    }
  }

/**
 * Score hypothesis points based on optimization goal
 * @private
 */
const scoreHypothesisPoints = (
  points: HypothesisPoint[],
  matrix: TravelTimeMatrix,
  goal: OptimizationGoal
): HypothesisPoint[] => {
  const scoredPoints = points
    .map((point, index) => {
      const travelTimes: number[] = []

      // Collect travel times from all origins to this point
      for (
        let originIndex = 0;
        originIndex < matrix.origins.length;
        originIndex++
      ) {
        const travelTime = matrix.travelTimes[originIndex][index]
        if (
          travelTime !== Infinity &&
          travelTime >= 0 &&
          Number.isFinite(travelTime)
        ) {
          travelTimes.push(travelTime)
        }
      }

      if (travelTimes.length === 0) {
        // Skip points with no valid travel times instead of returning Infinity
        // GraphQL cannot serialize Infinity values
        logger.warn(
          `Skipping hypothesis point ${point.id}: no valid travel times`
        )
        return null
      }

      // Calculate metrics
      const maxTravelTime = Math.max(...travelTimes)
      const averageTravelTime =
        travelTimes.reduce((sum, time) => sum + time, 0) / travelTimes.length
      const totalTravelTime = travelTimes.reduce((sum, time) => sum + time, 0)
      const variance =
        travelTimes.reduce(
          (sum, time) => sum + Math.pow(time - averageTravelTime, 2),
          0
        ) / travelTimes.length

      // Calculate score based on optimization goal
      let score: number
      switch (goal) {
        case 'MINIMAX':
          score = maxTravelTime
          break
        case 'MEAN':
          score = variance
          break
        case 'MIN':
          score = totalTravelTime
          break
        default:
          score = maxTravelTime // Default to minimax
      }

      return {
        ...point,
        score,
        travelTimeMetrics: {
          maxTravelTime,
          averageTravelTime,
          totalTravelTime,
          variance,
        },
      }
    })
    .filter((point): point is NonNullable<typeof point> => point !== null) // Filter out null values

  return scoredPoints.sort((a, b) => (a.score || 0) - (b.score || 0))
}

/**
 * Select top candidates with proximity deduplication
 * @private
 */
/**
 * Select top candidates with proximity deduplication using DeduplicationService
 * @param points Array of hypothesis points to select from
 * @param topM Number of top candidates to select
 * @param thresholdMeters Distance threshold in meters for point merging
 * @returns Array of selected candidates with deduplication applied
 * @private
 */
const selectTopCandidatesWithDeduplication = (
  points: HypothesisPoint[],
  topM: number,
  thresholdMeters: number
): HypothesisPoint[] => {
  if (!points || points.length === 0) {
    logger.warn('No points provided for candidate selection')
    return []
  }

  try {
    // First, apply deduplication to all points
    const deduplicatedPoints = deduplicationService.deduplicate(
      points,
      thresholdMeters
    )

    // Then select top M from deduplicated results
    const topCandidates = deduplicatedPoints.slice(
      0,
      Math.min(topM, deduplicatedPoints.length)
    )

    logger.info(
      `Selected ${topCandidates.length} candidates from ${points.length} points after deduplication (requested ${topM})`
    )
    return topCandidates
  } catch (error) {
    logger.error('Candidate selection with deduplication failed:', error)

    // Fallback to simple selection without deduplication
    logger.warn('Falling back to selection without deduplication')
    const fallbackCandidates = points.slice(0, Math.min(topM, points.length))
    return fallbackCandidates
  }
}

/**
 * Select points of interest with final deduplication using DeduplicationService
 * @param points Array of hypothesis points to select from
 * @param topN Number of top points of interest to select
 * @param thresholdMeters Distance threshold in meters for point merging
 * @returns Array of points of interest with deduplication applied
 * @private
 */
const selectPointsOfInterestWithDeduplication = (
  points: HypothesisPoint[],
  topN: number,
  thresholdMeters: number
): HypothesisPoint[] => {
  if (!points || points.length === 0) {
    logger.warn('No points provided for points of interest selection')
    return []
  }

  try {
    // Sort by score first (lower scores are better)
    const sortedPoints = [...points].sort(
      (a, b) => (a.score || 0) - (b.score || 0)
    )

    // Apply deduplication using DeduplicationService
    const deduplicatedPoints = deduplicationService.deduplicate(
      sortedPoints,
      thresholdMeters
    )

    // Select top N from deduplicated results
    const selectedPoints = deduplicatedPoints.slice(
      0,
      Math.min(topN, deduplicatedPoints.length)
    )

    // Mark as final output phase
    const finalPoints = selectedPoints.map((point) => ({
      ...point,
      phase: 'FINAL_OUTPUT' as AlgorithmPhase,
    }))

    logger.info(
      `Selected ${finalPoints.length} points of interest from ${points.length} total points after deduplication`
    )
    return finalPoints
  } catch (error) {
    logger.error(
      'Points of interest selection with deduplication failed:',
      error
    )

    // Fallback to simple selection without deduplication
    logger.warn('Falling back to selection without deduplication')
    const sortedPoints = [...points].sort(
      (a, b) => (a.score || 0) - (b.score || 0)
    )
    const fallbackPoints = sortedPoints
      .slice(0, Math.min(topN, sortedPoints.length))
      .map((point) => ({
        ...point,
        phase: 'FINAL_OUTPUT' as AlgorithmPhase,
      }))

    return fallbackPoints
  }
}

export const calculateMinimaxCenter: MutationResolvers['calculateMinimaxCenter'] =
  async ({ locations, travelMode, bufferTimeMinutes, optimizationConfig }) => {
    try {
      logger.info(
        `Starting minimax center calculation for ${locations.length} locations`
      )

      // Validate buffer time boundaries (Requirements 5.3)
      if (bufferTimeMinutes < 5 || bufferTimeMinutes > 60) {
        throw createBufferTimeError(bufferTimeMinutes)
      }

      // Validate minimum locations (Requirements 4.5)
      if (locations.length < 2) {
        throw createInsufficientLocationsError()
      }

      // Validate maximum locations for performance
      if (locations.length > 12) {
        throw createTooManyLocationsError()
      }

      // Validate travel mode early to preserve specific error message
      if (
        !['DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'].includes(travelMode)
      ) {
        throw createTravelModeError(travelMode)
      }

      // Convert GraphQL input to Location objects
      const participantLocations: Location[] = locations.map((loc, index) => ({
        id: `location_${index}`,
        name: loc.name || `Location ${index + 1}`,
        coordinate: {
          latitude: loc.latitude,
          longitude: loc.longitude,
        },
      }))

      // Process optimization configuration with defaults and validation
      let finalOptimizationConfig: OptimizationConfig
      if (optimizationConfig) {
        // Convert GraphQL input to internal types
        finalOptimizationConfig = {
          mode: optimizationConfig.mode,
          coarseGridConfig: optimizationConfig.coarseGridConfig
            ? {
                enabled: optimizationConfig.coarseGridConfig.enabled,
                paddingKm: optimizationConfig.coarseGridConfig.paddingKm,
                gridResolution:
                  optimizationConfig.coarseGridConfig.gridResolution,
              }
            : undefined,
          localRefinementConfig: optimizationConfig.localRefinementConfig
            ? {
                enabled: optimizationConfig.localRefinementConfig.enabled,
                topK: optimizationConfig.localRefinementConfig.topK,
                refinementRadiusKm:
                  optimizationConfig.localRefinementConfig.refinementRadiusKm,
                fineGridResolution:
                  optimizationConfig.localRefinementConfig.fineGridResolution,
              }
            : undefined,
        }

        // Validate the configuration
        try {
          validateOptimizationConfig(finalOptimizationConfig)
          validateGeographicConstraints(
            finalOptimizationConfig,
            participantLocations.length
          )
          logger.info(
            `Using optimization mode: ${finalOptimizationConfig.mode}`
          )
        } catch (configError) {
          logger.error(
            'Optimization configuration validation failed:',
            configError
          )
          throw new AppError({
            code: ErrorCode.INVALID_OPTIMIZATION_CONFIG,
            message: `Invalid optimization configuration: ${configError.message}`,
            userMessage:
              configError.message ||
              'Invalid optimization settings. Please check your configuration and try again.',
            originalError: configError,
          })
        }
      } else {
        // Use default configuration for backward compatibility
        finalOptimizationConfig = DEFAULT_OPTIMIZATION_CONFIG
        logger.info('Using default optimization configuration (BASELINE mode)')
      }

      // Use multi-phase optimization pipeline based on configuration
      const result = await calculateMultiPhaseMinimaxCenter(
        participantLocations,
        travelMode,
        bufferTimeMinutes,
        finalOptimizationConfig
      )

      logger.info(`Minimax center calculation completed successfully`)
      return result
    } catch (error) {
      handleResolverError(error, 'calculateMinimaxCenter')
    }
  }

/**
 * Find optimal locations using simplified two-phase algorithm (Cost-controlled approach)
 * Requirements: 1.2, 1.4 - Single Matrix API call for hypothesis evaluation
 * Requirements: 4.1, 4.3 - No automatic isochrone generation, display top M points immediately
 */
export const findOptimalLocationsResolver: MutationResolvers['findOptimalLocations'] =
  async ({
    locations,
    travelMode,
    optimizationGoal = 'MINIMAX',
    topM = DEFAULT_TOP_M,
    gridSize = DEFAULT_GRID_SIZE,
    deduplicationThreshold = DEFAULT_DEDUPLICATION_THRESHOLD,
  }) => {
    try {
      logger.info(
        `Starting simplified optimal location calculation for ${locations.length} locations`
      )

      // Validate minimum locations
      if (locations.length < 2) {
        throw createInsufficientLocationsError()
      }

      // Validate maximum locations for performance
      if (locations.length > 12) {
        throw createTooManyLocationsError()
      }

      // Validate travel mode
      if (
        !['DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'].includes(travelMode)
      ) {
        throw createTravelModeError(travelMode)
      }

      // Validate optimization goal
      if (!['MINIMAX', 'MEAN', 'MIN'].includes(optimizationGoal)) {
        throw new Error(
          `Invalid optimization goal: ${optimizationGoal}. Must be MINIMAX, MEAN, or MIN.`
        )
      }

      // Validate parameters
      if (topM < 1 || topM > 20) {
        throw new Error('topM must be between 1 and 20')
      }

      if (gridSize < 3 || gridSize > 10) {
        throw new Error('gridSize must be between 3 and 10')
      }

      if (
        deduplicationThreshold <
          VALIDATION_LIMITS.MIN_DEDUPLICATION_THRESHOLD ||
        deduplicationThreshold > VALIDATION_LIMITS.MAX_DEDUPLICATION_THRESHOLD
      ) {
        throw new Error(
          `deduplicationThreshold must be between ${VALIDATION_LIMITS.MIN_DEDUPLICATION_THRESHOLD} and ${VALIDATION_LIMITS.MAX_DEDUPLICATION_THRESHOLD} meters`
        )
      }

      // Convert GraphQL input to Location objects with validation
      const participantLocations: Location[] = locations.map((loc, index) => {
        const coordinate = {
          latitude: loc.latitude,
          longitude: loc.longitude,
        }

        // Validate input coordinates
        if (!geometryService.validateCoordinateBounds(coordinate)) {
          throw new Error(
            `Invalid coordinates for location ${index + 1}: ${coordinate.latitude}, ${coordinate.longitude}. Coordinates must be within valid geographic bounds.`
          )
        }

        return {
          id: `location_${index}`,
          name: loc.name || `Location ${index + 1}`,
          coordinate,
        }
      })

      // Execute simplified two-phase algorithm
      const result = await calculateOptimalLocationsSimplified(
        participantLocations,
        travelMode,
        optimizationGoal,
        topM,
        gridSize,
        deduplicationThreshold
      )

      // Ensure we have at least some optimal points to return
      if (result.optimalPoints.length === 0) {
        logger.error(
          'No valid optimal points generated - all hypothesis points may be unreachable'
        )
        throw new Error(
          'No valid meeting points found. All generated locations may be unreachable by the selected travel mode.'
        )
      }

      // Warn about high API usage (though should always be 1 for simplified algorithm)
      if (result.matrixApiCalls > 1) {
        logger.warn(
          `Unexpected Matrix API usage: ${result.matrixApiCalls} calls made (expected 1)`
        )
      }

      logger.info(
        `Simplified optimal location calculation complete: ${result.optimalPoints.length} optimal points, ${result.matrixApiCalls} Matrix API calls, 0 Isochrone API calls`
      )

      return result
    } catch (error) {
      // Log the original error with full details before it gets wrapped
      logger.error('findOptimalLocations original error:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        cause: error?.cause,
        fullError: error,
        locations: locations?.length,
        travelMode,
        optimizationGoal,
        topM,
        gridSize,
        deduplicationThreshold,
      })

      // Log specific error details for debugging state corruption
      if (error?.message?.includes('Single matrix evaluation failed')) {
        logger.error('Matrix evaluation failure details:', {
          errorMessage: error.message,
          errorStack: error.stack,
          singleMatrixApiCount: singleMatrixService.getApiCallCount(),
        })
      }

      // Reset any shared state that might be corrupted
      try {
        singleMatrixService.resetApiCallCount()
        logger.info('Reset singleMatrixService API call counter after error')
      } catch (resetError) {
        logger.error('Failed to reset singleMatrixService state:', resetError)
      }

      handleResolverError(error, 'findOptimalLocations')
    }
  }

/**
 * Generate isochrone for a specific optimal point on-demand (Cost-controlled approach)
 * Requirements: 4.2, 4.5 - Generate isochrones only on user click, cache responses
 */
export const generateIsochroneResolver: MutationResolvers['generateIsochrone'] =
  async ({ pointId, travelTimeMinutes, travelMode }) => {
    try {
      logger.info(`Generating on-demand isochrone for point ${pointId}`)

      // Validate travel mode
      if (
        !['DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'].includes(travelMode)
      ) {
        throw createTravelModeError(travelMode)
      }

      // Validate travel time
      if (travelTimeMinutes < 5 || travelTimeMinutes > 60) {
        throw createBufferTimeError(travelTimeMinutes)
      }

      // Extract coordinate from pointId (assuming format "lat,lng")
      const coordParts = pointId.split(',')
      if (coordParts.length !== 2) {
        throw new Error('Invalid pointId format. Expected "latitude,longitude"')
      }

      const latitude = parseFloat(coordParts[0])
      const longitude = parseFloat(coordParts[1])

      if (isNaN(latitude) || isNaN(longitude)) {
        throw new Error('Invalid coordinates in pointId')
      }

      const pointCoordinate: Coordinate = { latitude, longitude }

      if (!geometryService.validateCoordinateBounds(pointCoordinate)) {
        throw new Error(
          `Invalid coordinates for isochrone calculation: ${pointCoordinate.latitude}, ${pointCoordinate.longitude}. Coordinates must be within valid geographic bounds.`
        )
      }

      // Calculate isochrone using cached client (automatic caching)
      const isochroneParams = {
        travelTimeMinutes,
        travelMode: travelMode as TravelMode,
      }

      try {
        const isochrone = await cachedOpenRouteClient.calculateIsochrone(
          pointCoordinate,
          isochroneParams
        )

        logger.info(
          `On-demand isochrone generated successfully for point ${pointId}`
        )
        return isochrone
      } catch (apiError) {
        // Handle specific API errors with user-friendly messages
        if (
          apiError.message?.includes('rate limit') ||
          apiError.message?.includes('quota')
        ) {
          logger.warn(`Isochrone API rate limit reached for point ${pointId}`)
          throw new Error(
            'API rate limit reached. Please wait a moment before requesting more isochrones.'
          )
        }

        if (
          apiError.message?.includes('unreachable') ||
          apiError.message?.includes('no route')
        ) {
          logger.warn(
            `No routes found for isochrone calculation at point ${pointId}`
          )
          throw new Error(
            'No routes found for this location with the selected travel mode. The location may be unreachable or isolated.'
          )
        }

        if (apiError.message?.includes('timeout')) {
          logger.warn(`Isochrone calculation timeout for point ${pointId}`)
          throw new Error(
            'Isochrone calculation timed out. Please try again or select a different location.'
          )
        }

        // Generic API error
        logger.error(`Isochrone API error for point ${pointId}:`, apiError)
        throw new Error(
          'Unable to calculate isochrone. Please check your internet connection and try again.'
        )
      }
    } catch (error) {
      logger.error(
        `On-demand isochrone generation failed for point ${pointId}:`,
        error
      )
      handleResolverError(error, 'generateIsochrone')
    }
  }

// Export the new simplified resolver
export { findOptimalLocationsResolver as findOptimalLocations }
export { generateIsochroneResolver as generateIsochrone }
