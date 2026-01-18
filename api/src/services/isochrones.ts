import type { MutationResolvers } from 'types/graphql'
import { cachedOpenRouteClient } from 'src/lib/cachedOpenroute'
import { geometryService, type Location, type Coordinate, type BoundingBox } from 'src/lib/geometry'
import { matrixService } from 'src/lib/matrix'
import { logger } from 'src/lib/logger'
import {
  handleResolverError,
  createInsufficientLocationsError,
  createTooManyLocationsError,
  createBufferTimeError,
  createTravelModeError,
  createNoOverlapError,
  AppError
} from 'src/lib/errors'
import {
  type OptimizationConfig,
  type OptimizationMode,
  DEFAULT_OPTIMIZATION_CONFIG,
  validateOptimizationConfig,
  validateGeographicConstraints
} from 'src/lib/optimization'
import type { GeoJSON } from 'geojson'
import type { HypothesisPoint, TravelTimeMatrix, HypothesisPointType } from 'types/graphql'

// Re-export optimization types for backward compatibility
export type { OptimizationConfig, OptimizationMode } from 'src/lib/optimization'
export { DEFAULT_OPTIMIZATION_CONFIG } from 'src/lib/optimization'

/**
 * Generate hypothesis points for minimax center calculation (Phase 0 - baseline)
 * @param locations Array of participant locations
 * @returns Array of hypothesis points including geographic centroid, median coordinates, participant locations, and pairwise midpoints
 * @throws Error if insufficient locations provided or coordinate validation fails
 */
export const generateHypothesisPoints = (locations: Location[]): HypothesisPoint[] => {
  if (!locations || locations.length === 0) {
    throw new Error('No locations provided for hypothesis point generation')
  }

  try {
    const hypothesisPoints: HypothesisPoint[] = []

    // 1. Add geographic centroid
    const geographicCentroid = geometryService.calculateGeographicCentroid(locations)
    hypothesisPoints.push({
      id: 'geographic_centroid',
      coordinate: geographicCentroid,
      type: 'GEOGRAPHIC_CENTROID',
      metadata: null
    })

    // 2. Add median coordinate
    const medianCoordinate = geometryService.calculateMedianCoordinate(locations)
    hypothesisPoints.push({
      id: 'median_coordinate',
      coordinate: medianCoordinate,
      type: 'MEDIAN_COORDINATE',
      metadata: null
    })

    // 3. Add participant locations
    locations.forEach((location, index) => {
      // Validate participant coordinates
      if (!geometryService.validateCoordinateBounds(location.coordinate)) {
        throw new Error(`Invalid coordinates for participant location ${location.name}: ${location.coordinate.latitude}, ${location.coordinate.longitude}`)
      }

      hypothesisPoints.push({
        id: `participant_${index}`,
        coordinate: location.coordinate,
        type: 'PARTICIPANT_LOCATION',
        metadata: {
          participantId: location.id,
          pairIds: null
        }
      })
    })

    // 4. Add pairwise midpoints (only if we have at least 2 locations)
    if (locations.length >= 2) {
      const pairwiseMidpoints = geometryService.calculatePairwiseMidpoints(locations)

      let pairIndex = 0
      for (let i = 0; i < locations.length; i++) {
        for (let j = i + 1; j < locations.length; j++) {
          if (pairIndex < pairwiseMidpoints.length) {
            hypothesisPoints.push({
              id: `pairwise_${i}_${j}`,
              coordinate: pairwiseMidpoints[pairIndex],
              type: 'PAIRWISE_MIDPOINT',
              metadata: {
                participantId: null,
                pairIds: [locations[i].id, locations[j].id]
              }
            })
            pairIndex++
          }
        }
      }
    }

    // Validate all generated hypothesis points
    const invalidPoints = hypothesisPoints.filter(point => !geometryService.validateCoordinateBounds(point.coordinate))
    if (invalidPoints.length > 0) {
      throw new Error(`Generated invalid hypothesis points: ${invalidPoints.map(p => p.id).join(', ')}`)
    }

    logger.info(`Generated ${hypothesisPoints.length} hypothesis points: ${hypothesisPoints.map(p => p.type).join(', ')}`)
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
    throw new Error('No locations provided for multi-phase hypothesis point generation')
  }

  try {
    let allHypothesisPoints: HypothesisPoint[] = []

    // Phase 0: Always generate baseline hypothesis points
    logger.info('Phase 0: Generating baseline hypothesis points')
    const baselinePoints = generateHypothesisPoints(locations)
    allHypothesisPoints.push(...baselinePoints)

    // Phase 1: Coarse grid generation (if enabled)
    if (config.coarseGridConfig?.enabled && config.mode !== 'BASELINE') {
      logger.info('Phase 1: Generating coarse grid hypothesis points')
      const coarseGridPoints = generateCoarseGridHypothesisPoints(locations, config.coarseGridConfig)
      allHypothesisPoints.push(...coarseGridPoints)
    }

    // Phase 2: Local refinement (if enabled and we have candidates)
    if (config.localRefinementConfig?.enabled && config.mode === 'FULL_REFINEMENT') {
      logger.info('Phase 2: Local refinement will be performed after initial matrix evaluation')
      // Note: Local refinement requires matrix evaluation results, so it's handled separately
    }

    // Remove duplicates and validate all points
    const uniquePoints = removeDuplicateHypothesisPoints(allHypothesisPoints)
    const validPoints = uniquePoints.filter(point => geometryService.validateCoordinateBounds(point.coordinate))

    if (validPoints.length === 0) {
      throw new Error('No valid hypothesis points generated from multi-phase generation')
    }

    logger.info(`Multi-phase generation complete: ${validPoints.length} unique valid hypothesis points`)
    return validPoints

  } catch (error) {
    throw new Error(`Multi-phase hypothesis point generation failed: ${error.message}`)
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
    const boundingBox = geometryService.calculateBoundingBox(locations, config.paddingKm)

    // Generate coarse grid points
    const gridCoordinates = geometryService.generateCoarseGridPoints(boundingBox, config.gridResolution)

    // Convert to hypothesis points
    const coarseGridPoints: HypothesisPoint[] = gridCoordinates.map((coordinate, index) => ({
      id: `coarse_grid_${index}`,
      coordinate,
      type: 'COARSE_GRID' as HypothesisPointType,
      metadata: null
    }))

    logger.info(`Generated ${coarseGridPoints.length} coarse grid hypothesis points`)
    return coarseGridPoints

  } catch (error) {
    throw new Error(`Coarse grid hypothesis generation failed: ${error.message}`)
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
  config: { topK: number; refinementRadiusKm: number; fineGridResolution: number }
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
    const refinementPoints: HypothesisPoint[] = refinementCoordinates.map((coordinate, index) => ({
      id: `local_refinement_${index}`,
      coordinate,
      type: 'LOCAL_REFINEMENT' as HypothesisPointType,
      metadata: null
    }))

    logger.info(`Generated ${refinementPoints.length} local refinement hypothesis points`)
    return refinementPoints

  } catch (error) {
    throw new Error(`Local refinement hypothesis generation failed: ${error.message}`)
  }
}

/**
 * Remove duplicate hypothesis points that are very close to each other
 * @param points Array of hypothesis points
 * @returns Array of unique hypothesis points
 * @private
 */
const removeDuplicateHypothesisPoints = (points: HypothesisPoint[]): HypothesisPoint[] => {
  const uniquePoints: HypothesisPoint[] = []
  const thresholdDegrees = 0.001 // ~100m threshold

  for (const point of points) {
    let isDuplicate = false

    for (const existingPoint of uniquePoints) {
      const latDiff = Math.abs(point.coordinate.latitude - existingPoint.coordinate.latitude)
      const lngDiff = Math.abs(point.coordinate.longitude - existingPoint.coordinate.longitude)

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
 * Calculate minimax center using multi-phase optimization pipeline
 * Integrates hypothesis generation, batched matrix evaluation, and optimization
 * @param locations Array of participant locations
 * @param travelMode Travel mode for matrix calculations
 * @param bufferTimeMinutes Buffer time for visualization isochrone
 * @param config Optimization configuration
 * @returns IsochroneResult with optimal center point and fair meeting area
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
    const phase0Points = generateHypothesisPoints(locations)
    logger.info(`Generated ${phase0Points.length} Phase 0 hypothesis points`)

    // Step 2: Generate Phase 1 (coarse grid) hypothesis points if enabled (Requirements 4.1.2)
    let phase1Points: HypothesisPoint[] = []
    if (config.coarseGridConfig?.enabled && config.mode !== 'BASELINE') {
      logger.info('Step 2: Generating Phase 1 (coarse grid) hypothesis points')
      phase1Points = generateCoarseGridHypothesisPoints(locations, config.coarseGridConfig)
      logger.info(`Generated ${phase1Points.length} Phase 1 hypothesis points`)
    } else {
      logger.info('Step 2: Skipping Phase 1 (coarse grid disabled or BASELINE mode)')
    }

    // Step 3: Evaluate batched matrix for Phase 0+1 (Requirements 4.2.1)
    logger.info('Step 3: Evaluating batched matrix for Phase 0+1')
    const origins = locations.map(loc => loc.coordinate)

    const batchedResult = await matrixService.evaluateBatchedMatrix(
      origins,
      phase0Points,
      phase1Points,
      travelMode,
      cachedOpenRouteClient.calculateTravelTimeMatrix.bind(cachedOpenRouteClient)
    )
    logger.info(`Batched matrix evaluation complete: ${batchedResult.totalHypothesisPoints.length} total points evaluated`)

    // Step 4: Generate Phase 2 (local refinement) points if enabled (Requirements 4.1.3)
    let phase2Result: any = undefined
    if (config.localRefinementConfig?.enabled && config.mode === 'FULL_REFINEMENT') {
      logger.info('Step 4: Generating Phase 2 (local refinement) hypothesis points')

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
            logger.info(`Generated ${phase2Points.length} Phase 2 hypothesis points`)

            // Evaluate Phase 2 matrix separately (Requirements 4.2.2)
            try {
              phase2Result = await matrixService.evaluatePhase2Matrix(
                origins,
                phase2Points,
                travelMode,
                cachedOpenRouteClient.calculateTravelTimeMatrix.bind(cachedOpenRouteClient)
              )
              logger.info('Phase 2 matrix evaluation complete')
            } catch (phase2Error) {
              logger.warn('Phase 2 matrix evaluation failed, continuing without local refinement:', phase2Error)
              // Graceful degradation: continue without Phase 2 results
              phase2Result = undefined
            }
          } else {
            logger.info('No Phase 2 points generated, skipping Phase 2 matrix evaluation')
          }
        } else {
          logger.info('No top candidates found for refinement, skipping Phase 2')
        }
      } catch (phase2GenerationError) {
        logger.warn('Phase 2 hypothesis generation failed, continuing without local refinement:', phase2GenerationError)
        // Graceful degradation: continue without Phase 2 results
        phase2Result = undefined
      }
    } else {
      logger.info('Step 4: Skipping Phase 2 (local refinement disabled or not FULL_REFINEMENT mode)')
    }

    // Step 5: Find multi-phase minimax optimal point (Requirements 4.3)
    logger.info('Step 5: Finding multi-phase minimax optimal point')
    let optimalResult
    let allHypothesisPoints: HypothesisPoint[]

    try {
      const multiPhaseResult = matrixService.findMultiPhaseMinimaxOptimal(batchedResult, phase2Result)

      // Combine all hypothesis points for indexing
      allHypothesisPoints = [...batchedResult.totalHypothesisPoints]
      if (phase2Result) {
        allHypothesisPoints.push(...phase2Result.hypothesisPoints)
      }

      optimalResult = {
        optimalIndex: multiPhaseResult.optimalIndex,
        maxTravelTime: multiPhaseResult.maxTravelTime,
        averageTravelTime: multiPhaseResult.averageTravelTime
      }

      logger.info(`Multi-phase optimal point found: index ${optimalResult.optimalIndex}, max time ${optimalResult.maxTravelTime}min, phase ${multiPhaseResult.optimalPhase}`)

    } catch (error) {
      logger.error('Multi-phase minimax optimization failed:', error)

      // Fallback to geographic centroid with error handling (Requirements 4.5, 9.1, 9.2)
      return await handleOptimizationFallback(locations, travelMode, bufferTimeMinutes, error)
    }

    // Get the optimal hypothesis point
    const optimalHypothesisPoint = allHypothesisPoints[optimalResult.optimalIndex]
    if (!optimalHypothesisPoint) {
      throw new Error(`Invalid optimal index: ${optimalResult.optimalIndex}`)
    }

    const centerPoint = optimalHypothesisPoint.coordinate
    logger.info(`Selected optimal meeting point: ${centerPoint.latitude}, ${centerPoint.longitude} (${optimalHypothesisPoint.type})`)

    // Step 6: Generate fair meeting area isochrone from optimal center point (Requirements 5.1)
    logger.info('Step 6: Generating fair meeting area isochrone')
    const fairMeetingAreaParams = {
      travelTimeMinutes: bufferTimeMinutes,
      travelMode: travelMode as 'DRIVING_CAR' | 'CYCLING_REGULAR' | 'FOOT_WALKING'
    }

    let fairMeetingArea: GeoJSON.Polygon
    try {
      fairMeetingArea = await cachedOpenRouteClient.calculateIsochrone(
        centerPoint,
        fairMeetingAreaParams
      )
      logger.info('Fair meeting area isochrone calculated successfully')
    } catch (error) {
      logger.error('Fair meeting area calculation failed:', error)
      throw new AppError({
        code: 'ISOCHRONE_CALCULATION_FAILED' as any,
        message: 'Failed to calculate fair meeting area',
        userMessage: 'Unable to calculate the meeting area. The optimal point may be in an unreachable location.',
        originalError: error
      })
    }

    // Return the result (minimax approach doesn't use individual isochrones)
    const result = {
      centerPoint,
      fairMeetingArea,
      individualIsochrones: [] // Minimax approach doesn't use individual isochrones
    }

    logger.info(`Multi-phase minimax center calculation completed successfully: max travel time ${optimalResult.maxTravelTime}min, avg travel time ${optimalResult.averageTravelTime.toFixed(1)}min`)
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
  batchedResult: any,
  topK: number
): Array<{ coordinate: Coordinate; maxTravelTime: number }> => {
  try {
    const matrix = batchedResult.combinedMatrix
    const candidates: Array<{ coordinate: Coordinate; maxTravelTime: number; index: number }> = []

    // Calculate max travel time for each hypothesis point
    for (let destIndex = 0; destIndex < matrix.destinations.length; destIndex++) {
      const travelTimesToDest: number[] = []
      let hasValidRoute = false

      // Collect travel times from all origins to this destination
      for (let originIndex = 0; originIndex < matrix.origins.length; originIndex++) {
        const travelTime = matrix.travelTimes[originIndex][destIndex]

        // Skip unreachable routes
        if (travelTime !== Infinity && travelTime >= 0 && Number.isFinite(travelTime)) {
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
          index: destIndex
        })
      }
    }

    // Sort by max travel time (ascending) and select top K
    candidates.sort((a, b) => a.maxTravelTime - b.maxTravelTime)
    const topCandidates = candidates.slice(0, Math.min(topK, candidates.length))

    logger.info(`Selected ${topCandidates.length} top candidates for local refinement (max times: ${topCandidates.map(c => c.maxTravelTime.toFixed(1)).join(', ')}min)`)

    return topCandidates.map(c => ({ coordinate: c.coordinate, maxTravelTime: c.maxTravelTime }))

  } catch (error) {
    logger.error('Failed to find top candidates for refinement:', error)
    return []
  }
}

/**
 * Handle optimization fallback when multi-phase optimization fails
 * @param locations Array of participant locations
 * @param travelMode Travel mode for isochrone calculation
 * @param bufferTimeMinutes Buffer time for visualization
 * @param originalError Original optimization error
 * @returns Fallback result using geographic centroid
 * @private
 */
const handleOptimizationFallback = async (
  locations: Location[],
  travelMode: string,
  bufferTimeMinutes: number,
  originalError: any
): Promise<{
  centerPoint: Coordinate
  fairMeetingArea: GeoJSON.Polygon
  individualIsochrones: GeoJSON.Polygon[]
}> => {
  logger.info('Falling back to geographic centroid due to optimization failure')

  try {
    const geographicCentroid = geometryService.calculateGeographicCentroid(locations)

    // Generate fair meeting area from geographic centroid
    const fairMeetingAreaParams = {
      travelTimeMinutes: bufferTimeMinutes,
      travelMode: travelMode as 'DRIVING_CAR' | 'CYCLING_REGULAR' | 'FOOT_WALKING'
    }

    const fairMeetingArea = await cachedOpenRouteClient.calculateIsochrone(
      geographicCentroid,
      fairMeetingAreaParams
    )

    logger.info('Fallback to geographic centroid completed successfully')

    return {
      centerPoint: geographicCentroid,
      fairMeetingArea,
      individualIsochrones: []
    }

  } catch (fallbackError) {
    logger.error('Fallback to geographic centroid also failed:', fallbackError)
    throw new AppError({
      code: 'OPTIMIZATION_FALLBACK_FAILED' as any,
      message: 'Both multi-phase optimization and fallback failed',
      userMessage: 'Unable to calculate optimal meeting point. Please check your locations and try again.',
      originalError: originalError
    })
  }
}

export const calculateMinimaxCenter: MutationResolvers['calculateMinimaxCenter'] = async ({
  locations,
  travelMode,
  bufferTimeMinutes,
  optimizationConfig,
}) => {
  try {
    logger.info(`Starting minimax center calculation for ${locations.length} locations`)

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
    if (!['DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'].includes(travelMode)) {
      throw createTravelModeError(travelMode)
    }

    // Convert GraphQL input to Location objects
    const participantLocations: Location[] = locations.map((loc, index) => ({
      id: `location_${index}`,
      name: loc.name || `Location ${index + 1}`,
      coordinate: {
        latitude: loc.latitude,
        longitude: loc.longitude
      }
    }))

    // Process optimization configuration with defaults and validation
    let finalOptimizationConfig: OptimizationConfig
    if (optimizationConfig) {
      // Convert GraphQL input to internal types
      finalOptimizationConfig = {
        mode: optimizationConfig.mode,
        coarseGridConfig: optimizationConfig.coarseGridConfig ? {
          enabled: optimizationConfig.coarseGridConfig.enabled,
          paddingKm: optimizationConfig.coarseGridConfig.paddingKm,
          gridResolution: optimizationConfig.coarseGridConfig.gridResolution
        } : undefined,
        localRefinementConfig: optimizationConfig.localRefinementConfig ? {
          enabled: optimizationConfig.localRefinementConfig.enabled,
          topK: optimizationConfig.localRefinementConfig.topK,
          refinementRadiusKm: optimizationConfig.localRefinementConfig.refinementRadiusKm,
          fineGridResolution: optimizationConfig.localRefinementConfig.fineGridResolution
        } : undefined
      }

      // Validate the configuration
      try {
        validateOptimizationConfig(finalOptimizationConfig)
        validateGeographicConstraints(finalOptimizationConfig, participantLocations.length)
        logger.info(`Using optimization mode: ${finalOptimizationConfig.mode}`)
      } catch (configError) {
        logger.error('Optimization configuration validation failed:', configError)
        throw new AppError({
          code: 'INVALID_OPTIMIZATION_CONFIG' as any,
          message: `Invalid optimization configuration: ${configError.message}`,
          userMessage: configError.message || 'Invalid optimization settings. Please check your configuration and try again.',
          originalError: configError
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