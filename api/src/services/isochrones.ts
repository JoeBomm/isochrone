import type { MutationResolvers } from 'types/graphql'
import { cachedOpenRouteClient } from 'src/lib/cachedOpenroute'
import { geometryService, type Location, type Coordinate } from 'src/lib/geometry'
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
import type { GeoJSON } from 'geojson'
import type { HypothesisPoint, TravelTimeMatrix } from 'types/graphql'

// Hypothesis point generation types
export interface HypothesisPoint {
  id: string
  coordinate: Coordinate
  type: 'geographic_centroid' | 'median_coordinate' | 'participant_location' | 'pairwise_midpoint'
  metadata?: {
    participantId?: string
    pairIds?: [string, string]
  }
}

/**
 * Generate hypothesis points for minimax center calculation
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

export const calculateMinimaxCenter: MutationResolvers['calculateMinimaxCenter'] = async ({
  locations,
  travelMode,
  bufferTimeMinutes,
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

    // Step 1: Generate hypothesis points (Requirements 4.1)
    logger.info('Step 1: Generating hypothesis points')
    const hypothesisPoints = generateHypothesisPoints(participantLocations)
    logger.info(`Generated ${hypothesisPoints.length} hypothesis points`)

    // Step 2: Evaluate travel time matrix (Requirements 4.2)
    logger.info('Step 2: Evaluating travel time matrix')
    const origins = participantLocations.map(loc => loc.coordinate)
    const destinations = hypothesisPoints.map(hp => hp.coordinate)

    let travelTimeMatrix: TravelTimeMatrix
    try {
      travelTimeMatrix = await cachedOpenRouteClient.calculateTravelTimeMatrix(
        origins,
        destinations,
        travelMode
      )
      logger.info(`Travel time matrix calculated: ${travelTimeMatrix.origins.length}×${travelTimeMatrix.destinations.length}`)
    } catch (error) {
      logger.error('Matrix calculation failed:', error)
      throw new AppError({
        code: 'MATRIX_CALCULATION_FAILED',
        message: 'Failed to calculate travel time matrix',
        userMessage: 'Unable to calculate travel times. Please check your locations and try again.',
        originalError: error
      })
    }

    // Step 3: Find minimax optimal point (Requirements 4.3, 4.4, 4.5)
    logger.info('Step 3: Finding minimax optimal point')
    let optimalResult
    try {
      optimalResult = matrixService.findMinimaxOptimal(travelTimeMatrix)
      logger.info(`Optimal point found: index ${optimalResult.optimalIndex}, max time ${optimalResult.maxTravelTime}min`)
    } catch (error) {
      logger.error('Minimax optimization failed:', error)

      // Fallback to geographic centroid if all hypothesis points are invalid
      logger.info('Falling back to geographic centroid')
      const geographicCentroid = geometryService.calculateGeographicCentroid(participantLocations)

      // Generate fair meeting area from geographic centroid
      const fairMeetingAreaParams = {
        travelTimeMinutes: bufferTimeMinutes,
        travelMode
      }

      const fairMeetingArea = await cachedOpenRouteClient.calculateIsochrone(
        geographicCentroid,
        fairMeetingAreaParams
      )

      return {
        centerPoint: geographicCentroid,
        fairMeetingArea,
        individualIsochrones: []
      }
    }

    // Get the optimal hypothesis point
    const optimalHypothesisPoint = hypothesisPoints[optimalResult.optimalIndex]
    if (!optimalHypothesisPoint) {
      throw new Error(`Invalid optimal index: ${optimalResult.optimalIndex}`)
    }

    const centerPoint = optimalHypothesisPoint.coordinate
    logger.info(`Selected optimal meeting point: ${centerPoint.latitude}, ${centerPoint.longitude} (${optimalHypothesisPoint.type})`)

    // Step 4: Generate fair meeting area isochrone from optimal center point (Requirements 5.1)
    logger.info('Step 4: Generating fair meeting area isochrone')
    const fairMeetingAreaParams = {
      travelTimeMinutes: bufferTimeMinutes,
      travelMode
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
        code: 'ISOCHRONE_CALCULATION_FAILED',
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

    logger.info(`Minimax center calculation completed successfully: max travel time ${optimalResult.maxTravelTime}min, avg travel time ${optimalResult.averageTravelTime.toFixed(1)}min`)
    return result

  } catch (error) {
    handleResolverError(error, 'calculateMinimaxCenter')
  }
}