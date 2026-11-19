'use server'

import { getRequestInfo } from '@redwoodjs/sdk/worker'

import type { AppContext } from '../../worker'
import { deduplicationService } from '../lib/algorithms/deduplication'
import { singleMatrixService } from '../lib/algorithms/singleMatrix'
import { cachedOpenRouteClient } from '../lib/cachedOpenroute'
import {
  DEFAULT_TOP_M,
  DEFAULT_GRID_SIZE,
  DEFAULT_DEDUPLICATION_THRESHOLD,
  VALIDATION_LIMITS,
} from '../lib/constants'
import { db } from '../lib/database'
import {
  createInsufficientLocationsError,
  createTooManyLocationsError,
  createBufferTimeError,
  createTravelModeError,
  handleResolverError,
  createErrorResponse,
} from '../lib/errors'
import type { Coordinate, Location } from '../lib/geometry'
import { geometryService } from '../lib/geometry'
import type {
  LocationInput,
  OptimalLocationResult,
  TravelMode,
  OptimizationGoal,
  GeoJSONPolygon,
  HypothesisPoint,
  IsochroneResult,
} from '../lib/types'

/**
 * Validate that a numeric value is finite and non-negative
 */
const assertFinite = (value: number, context: string): number => {
  if (!Number.isFinite(value)) {
    console.warn(`Invalid numeric value in ${context}: ${value} (not finite)`)
    throw new Error(
      `Invalid numeric value in ${context}: ${value} (not finite)`
    )
  }

  if (value < 0) {
    console.warn(`Invalid numeric value in ${context}: ${value} (negative)`)
    throw new Error(`Invalid numeric value in ${context}: ${value} (negative)`)
  }

  return value
}

/**
 * Filter invalid travel time values from an array
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
 */
const safeDivide = (
  numerator: number,
  denominator: number,
  fallback: number = 0
): number => {
  // Check if inputs are finite numbers
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    console.warn(
      `Safe divide: invalid inputs - numerator: ${numerator}, denominator: ${denominator}`
    )
    return fallback
  }

  // Guard against zero denominator
  if (denominator === 0) {
    console.warn(`Safe divide: division by zero - numerator: ${numerator}`)
    return fallback
  }

  // Perform division
  const result = numerator / denominator

  // Validate result is finite
  if (!Number.isFinite(result)) {
    console.warn(
      `Safe divide: invalid result - numerator: ${numerator}, denominator: ${denominator}, result: ${result}`
    )
    return fallback
  }

  return result
}

/**
 * Calculate safe average with empty array protection
 */
const safeAverage = (values: number[], fallback: number = 0): number => {
  // Handle empty array
  if (!values || values.length === 0) {
    console.warn('Safe average: empty array provided')
    return fallback
  }

  // Filter out invalid values
  const validValues = values.filter((value) => Number.isFinite(value))

  // Check if we have any valid values left
  if (validValues.length === 0) {
    console.warn('Safe average: no valid values after filtering')
    return fallback
  }

  // Calculate sum
  const sum = validValues.reduce((acc, value) => acc + value, 0)

  // Use safeDivide to perform the division
  return safeDivide(sum, validValues.length, fallback)
}

/**
 * Generate fallback score for each optimization goal when no valid travel times remain
 */
const getFallbackScore = (
  goal: OptimizationGoal,
  validTravelTimes: number[]
): number => {
  // If no valid travel times remain, use penalty scores for completely unreachable points
  if (!validTravelTimes || validTravelTimes.length === 0) {
    console.warn(
      `No valid travel times for fallback scoring with goal: ${goal}`
    )
    return 999999 // High penalty score for unreachable points
  }

  // Provide goal-specific fallback logic when we have some valid travel times
  switch (goal) {
    case 'MINIMAX': {
      // For MINIMAX, use the maximum travel time from available valid times
      const maxTime = Math.max(...validTravelTimes)
      console.debug(`MINIMAX fallback score: ${maxTime}`)
      return maxTime
    }

    case 'MINIMIZE_VARIANCE':
      // For MINIMIZE_VARIANCE (variance-based), return 0 when we can't calculate variance properly
      // This represents no variance, which is optimal for the MINIMIZE_VARIANCE goal
      console.debug('MINIMIZE_VARIANCE fallback score: 0 (no variance)')
      return 0

    case 'MINIMIZE_TOTAL': {
      // For MINIMIZE_TOTAL (total travel time), sum all available valid travel times
      const totalTime = validTravelTimes.reduce((sum, time) => sum + time, 0)
      console.debug(`MINIMIZE_TOTAL fallback score: ${totalTime}`)
      return totalTime
    }

    default:
      // Default fallback to high penalty score for unknown goals
      console.warn(
        `Unknown optimization goal for fallback: ${goal}, using penalty score`
      )
      return 999999
  }
}

/**
 * Generate hypothesis points for minimax center calculation (Phase 0 - baseline)
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

    console.log(
      `Generated ${hypothesisPoints.length} hypothesis points: ${hypothesisPoints.map((p) => p.type).join(', ')}`
    )
    return hypothesisPoints
  } catch (error) {
    throw new Error(`Hypothesis point generation failed: ${error.message}`)
  }
}

/**
 * Generate bounding box grid points for simplified algorithm
 */
const generateBoundingBoxGridPoints = (
  locations: Location[],
  gridSize: number
): HypothesisPoint[] => {
  try {
    // Calculate bounding box containing all locations
    const boundingBox = geometryService.calculateBoundingBox(locations, 0) // No padding for simplified approach

    // Generate grid coordinates
    const gridCoordinates = geometryService.generateCoarseGridPoints(
      boundingBox,
      gridSize
    )

    // Convert to hypothesis points
    const gridPoints: HypothesisPoint[] = gridCoordinates.map(
      (coordinate, index) => ({
        id: `grid_${index}`,
        coordinate,
        type: 'COARSE_GRID_CELL',
        phase: 'COARSE_GRID',
        metadata: null,
      })
    )

    console.log(
      `Generated ${gridPoints.length} bounding box grid points (${gridSize}x${gridSize})`
    )
    return gridPoints
  } catch (error) {
    throw new Error(`Bounding box grid generation failed: ${error.message}`)
  }
}

/**
 * Score hypothesis points for simplified algorithm
 */
const scoreHypothesisPointsSimplified = (
  points: HypothesisPoint[],
  matrix: any,
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
            console.warn(
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
            console.warn(
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
            case 'MINIMIZE_VARIANCE':
              score = variance
              // Special handling for single travel time (variance should be 0)
              if (sanitizedTravelTimes.length === 1) {
                score = 0
              }
              break
            case 'MINIMIZE_TOTAL':
              score = totalTravelTime
              break
            default:
              console.warn(
                `Unknown optimization goal: ${goal}, defaulting to MINIMAX`
              )
              score = maxTravelTime
          }

          // Ensure all returned values are validated before serialization
          try {
            assertFinite(
              score,
              `final score for point ${point.id} with goal ${goal}`
            )
          } catch (scoreValidationError) {
            console.error(
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
          console.error(`Error scoring point ${point.id}:`, pointError)

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
    console.error('Scoring failed:', error)
    throw new Error(`Hypothesis point scoring failed: ${error.message}`)
  }
}

/**
 * Calculate optimal meeting points using simplified two-phase algorithm
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
    console.log(
      'Phase 1: Generating hypothesis points for simplified two-phase algorithm'
    )

    // Step 1.1: Generate anchor points
    const anchorPoints = generateBaselineHypothesisPoints(locations)
    console.log(`Generated ${anchorPoints.length} anchor points`)

    // Step 1.2: Generate bounding box grid points
    const gridPoints = generateBoundingBoxGridPoints(locations, gridSize)
    console.log(`Generated ${gridPoints.length} grid points`)

    // Phase 2: Single matrix evaluation
    console.log(
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
      console.error('Single matrix evaluation failed:', {
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

    console.log(
      `Single matrix evaluation complete: ${matrixResult.totalHypothesisPoints} points evaluated with ${matrixResult.apiCallCount} API call(s)`
    )

    // Step 2.1: Score and rank all hypothesis points
    console.log(
      `Scoring ${matrixResult.hypothesisPoints.length} hypothesis points with goal: ${optimizationGoal}`
    )
    const scoredPoints = scoreHypothesisPointsSimplified(
      matrixResult.hypothesisPoints,
      matrixResult.matrix,
      optimizationGoal
    )
    console.log(`Scoring complete: ${scoredPoints.length} valid scored points`)

    // Step 2.2: Apply deduplication
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

    console.log(
      `Simplified two-phase algorithm complete: ${optimalPoints.length} optimal points, ${matrixResult.apiCallCount} Matrix API calls, 0 Isochrone API calls`
    )
    return result
  } catch (error) {
    // Log detailed error information for debugging
    console.error('Simplified two-phase algorithm failed:', {
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
      console.log('Reset singleMatrixService state after algorithm failure')
    } catch (resetError) {
      console.error('Failed to reset singleMatrixService state:', resetError)
    }

    throw error
  }
}

// Server function for finding optimal locations
export async function findOptimalLocations(
  locations: LocationInput[],
  travelMode: TravelMode,
  optimizationGoal: OptimizationGoal = 'MINIMAX',
  topM: number = DEFAULT_TOP_M,
  gridSize: number = DEFAULT_GRID_SIZE,
  deduplicationThreshold: number = DEFAULT_DEDUPLICATION_THRESHOLD
): Promise<OptimalLocationResult> {
  try {
    console.log(
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
    if (
      !['MINIMAX', 'MINIMIZE_VARIANCE', 'MINIMIZE_TOTAL'].includes(
        optimizationGoal
      )
    ) {
      throw new Error(
        `Invalid optimization goal: ${optimizationGoal}. Must be MINIMAX, MINIMIZE_VARIANCE, or MINIMIZE_TOTAL.`
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
      deduplicationThreshold < VALIDATION_LIMITS.MIN_DEDUPLICATION_THRESHOLD ||
      deduplicationThreshold > VALIDATION_LIMITS.MAX_DEDUPLICATION_THRESHOLD
    ) {
      throw new Error(
        `deduplicationThreshold must be between ${VALIDATION_LIMITS.MIN_DEDUPLICATION_THRESHOLD} and ${VALIDATION_LIMITS.MAX_DEDUPLICATION_THRESHOLD} meters`
      )
    }

    // Convert input to Location objects with validation
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
        name: loc.address || `Location ${index + 1}`,
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
      console.error(
        'No valid optimal points generated - all hypothesis points may be unreachable'
      )
      throw new Error(
        'No valid meeting points found. All generated locations may be unreachable by the selected travel mode.'
      )
    }

    // Warn about high API usage (though should always be 1 for simplified algorithm)
    if (result.matrixApiCalls > 1) {
      console.warn(
        `Unexpected Matrix API usage: ${result.matrixApiCalls} calls made (expected 1)`
      )
    }

    console.log(
      `Simplified optimal location calculation complete: ${result.optimalPoints.length} optimal points, ${result.matrixApiCalls} Matrix API calls, 0 Isochrone API calls`
    )

    return result
  } catch (error) {
    // Log the original error with full details before it gets wrapped
    console.error('findOptimalLocations original error:', {
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

    // Reset any shared state that might be corrupted
    try {
      singleMatrixService.resetApiCallCount()
      console.log('Reset singleMatrixService API call counter after error')
    } catch (resetError) {
      console.error('Failed to reset singleMatrixService state:', resetError)
    }

    handleResolverError(error, 'findOptimalLocations')
  }
}

// Server function for generating isochrones
export async function generateIsochrone(
  pointId: string,
  travelTimeMinutes: number,
  travelMode: TravelMode
): Promise<GeoJSONPolygon> {
  try {
    console.log(`Generating on-demand isochrone for point ${pointId}`)

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

    // Check cache first
    const cachedIsochrone = await db.getCachedIsochrone(
      pointId,
      travelTimeMinutes,
      travelMode
    )

    if (cachedIsochrone) {
      console.log(`Returning cached isochrone for point ${pointId}`)
      return cachedIsochrone
    }

    // Calculate isochrone using cached OpenRouteService
    try {
      const pointCoordinate: Coordinate = { latitude, longitude }
      const isochroneParams = { travelTimeMinutes, travelMode }

      const isochrone = await cachedOpenRouteClient.calculateIsochrone(
        pointCoordinate,
        isochroneParams
      )

      // Cache the result
      await db.setCachedIsochrone(
        pointId,
        travelTimeMinutes,
        travelMode,
        isochrone,
        24 // 24 hour TTL
      )

      console.log(
        `On-demand isochrone generated successfully for point ${pointId}`
      )
      return isochrone
    } catch (apiError) {
      // Handle specific API errors with user-friendly messages
      if (
        apiError.message?.includes('rate limit') ||
        apiError.message?.includes('quota')
      ) {
        console.warn(`Isochrone API rate limit reached for point ${pointId}`)
        throw new Error(
          'API rate limit reached. Please wait a moment before requesting more isochrones.'
        )
      }

      if (
        apiError.message?.includes('unreachable') ||
        apiError.message?.includes('no route')
      ) {
        console.warn(
          `No routes found for isochrone calculation at point ${pointId}`
        )
        throw new Error(
          'No routes found for this location with the selected travel mode. The location may be unreachable or isolated.'
        )
      }

      if (apiError.message?.includes('timeout')) {
        console.warn(`Isochrone calculation timeout for point ${pointId}`)
        throw new Error(
          'Isochrone calculation timed out. Please try again or select a different location.'
        )
      }

      // Generic API error
      console.error(`Isochrone API error for point ${pointId}:`, apiError)
      throw new Error(
        'Unable to calculate isochrone. Please check your internet connection and try again.'
      )
    }
  } catch (error) {
    console.error(
      `On-demand isochrone generation failed for point ${pointId}:`,
      error
    )
    handleResolverError(error, 'generateIsochrone')
  }
}

// Server function for calculating minimax center
export async function calculateMinimaxCenter(
  locations: LocationInput[],
  travelMode: TravelMode,
  bufferTimeMinutes: number
): Promise<IsochroneResult> {
  try {
    console.log(
      `Starting minimax center calculation for ${locations.length} locations`
    )

    // Validate buffer time boundaries
    if (bufferTimeMinutes < 5 || bufferTimeMinutes > 60) {
      throw createBufferTimeError(bufferTimeMinutes)
    }

    // Validate minimum locations
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

    // Convert input to Location objects
    const participantLocations: Location[] = locations.map((loc, index) => ({
      id: `location_${index}`,
      name: loc.address || `Location ${index + 1}`,
      coordinate: {
        latitude: loc.latitude,
        longitude: loc.longitude,
      },
    }))

    // Use simplified algorithm to find optimal location
    const result = await calculateOptimalLocationsSimplified(
      participantLocations,
      travelMode,
      'MINIMAX', // Use MINIMAX optimization goal for minimax center
      1 // Return only the top optimal point
    )

    if (result.optimalPoints.length === 0) {
      throw new Error('No optimal meeting point found')
    }

    const centerPoint = result.optimalPoints[0].coordinate

    // Create placeholder polygon for fair meeting area (not automatically calculated)
    const placeholderFairMeetingArea: any = {
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

    console.log(`Minimax center calculation completed successfully`)
    return {
      centerPoint,
      fairMeetingArea: placeholderFairMeetingArea,
      individualIsochrones: [], // Minimax approach doesn't use individual isochrones
    }
  } catch (error) {
    handleResolverError(error, 'calculateMinimaxCenter')
  }
}

// Export handlers for route registration
export const isochroneHandler = {
  findOptimalLocations: async (request: Request): Promise<Response> => {
    try {
      const body = await request.json()
      const {
        locations,
        travelMode,
        optimizationGoal = 'MINIMAX',
        topM = DEFAULT_TOP_M,
        gridSize = DEFAULT_GRID_SIZE,
        deduplicationThreshold = DEFAULT_DEDUPLICATION_THRESHOLD,
      } = body

      // Validate required fields
      if (!locations || !Array.isArray(locations)) {
        return new Response(
          JSON.stringify({
            error: 'Locations array is required',
            statusCode: 400,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      if (!travelMode) {
        return new Response(
          JSON.stringify({
            error: 'Travel mode is required',
            statusCode: 400,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      const result = await findOptimalLocations(
        locations,
        travelMode,
        optimizationGoal,
        topM,
        gridSize,
        deduplicationThreshold
      )

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('findOptimalLocations handler error:', error)
      return createErrorResponse(error)
    }
  },

  generateIsochrone: async (request: Request): Promise<Response> => {
    try {
      const body = await request.json()
      const { pointId, travelTimeMinutes, travelMode } = body

      // Validate required fields
      if (!pointId) {
        return new Response(
          JSON.stringify({
            error: 'Point ID is required',
            statusCode: 400,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      if (!travelTimeMinutes || typeof travelTimeMinutes !== 'number') {
        return new Response(
          JSON.stringify({
            error: 'Travel time in minutes is required and must be a number',
            statusCode: 400,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      if (!travelMode) {
        return new Response(
          JSON.stringify({
            error: 'Travel mode is required',
            statusCode: 400,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      const result = await generateIsochrone(
        pointId,
        travelTimeMinutes,
        travelMode
      )

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('generateIsochrone handler error:', error)
      return createErrorResponse(error)
    }
  },

  calculateMinimaxCenter: async (request: Request): Promise<Response> => {
    try {
      const body = await request.json()
      const { locations, travelMode, bufferTimeMinutes } = body

      // Validate required fields
      if (!locations || !Array.isArray(locations)) {
        return new Response(
          JSON.stringify({
            error: 'Locations array is required',
            statusCode: 400,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      if (!travelMode) {
        return new Response(
          JSON.stringify({
            error: 'Travel mode is required',
            statusCode: 400,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      if (!bufferTimeMinutes || typeof bufferTimeMinutes !== 'number') {
        return new Response(
          JSON.stringify({
            error: 'Buffer time in minutes is required and must be a number',
            statusCode: 400,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      const result = await calculateMinimaxCenter(
        locations,
        travelMode,
        bufferTimeMinutes
      )

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('calculateMinimaxCenter handler error:', error)
      return createErrorResponse(error)
    }
  },
}
