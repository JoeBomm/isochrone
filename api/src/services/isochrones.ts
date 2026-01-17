import type { MutationResolvers } from 'types/graphql'
import { cachedOpenRouteClient } from 'src/lib/cachedOpenroute'
import { geometryService } from 'src/lib/geometry'
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

export const calculateIsochronicCenter: MutationResolvers['calculateIsochronicCenter'] = async ({
  locations,
  travelTimeMinutes,
  travelMode,
  bufferTimeMinutes,
}) => {
  try {
    logger.info(`Starting isochronic center calculation for ${locations.length} locations`)

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

    const isochroneParams = {
      travelTimeMinutes,
      travelMode
    }

    // Step 1: Calculate individual isochrones for each location (Requirements 4.1)
    logger.info('Step 1: Calculating individual isochrones')

    // Use fail-fast approach to avoid wasting API requests
    const individualIsochrones: GeoJSON.Polygon[] = []

    for (let i = 0; i < locations.length; i++) {
      const location = locations[i]
      const coordinate = {
        latitude: location.latitude,
        longitude: location.longitude
      }

      logger.info(`Calculating isochrone for ${location.name} at ${coordinate.latitude}, ${coordinate.longitude}`)
      const isochrone = await cachedOpenRouteClient.calculateIsochrone(coordinate, isochroneParams)
      individualIsochrones.push(isochrone)
    }

    logger.info(`Successfully calculated ${individualIsochrones.length} individual isochrones`)

    // Step 2: Validate that isochrones have overlapping or adjacent areas (Requirements 4.5)
    logger.info('Step 2: Validating polygon overlap')
    const hasOverlap = geometryService.validatePolygonOverlap(individualIsochrones)
    if (!hasOverlap) {
      throw createNoOverlapError()
    }

    // Step 3: Calculate geometric union of all isochrone polygons (Requirements 4.2)
    logger.info('Step 3: Calculating polygon union')
    const unionPolygon = geometryService.calculatePolygonUnion(individualIsochrones)
    logger.info(`Union calculation complete, result type: ${unionPolygon.type}`)

    // Step 4: Calculate centroid of the combined accessible area (Requirements 4.3)
    logger.info('Step 4: Calculating centroid of union')
    const centerPoint = geometryService.calculateCentroid(unionPolygon)
    logger.info(`Centroid calculated: ${centerPoint.latitude}, ${centerPoint.longitude}`)

    // Step 5: Generate final fair meeting area isochrone from calculated center (Requirements 5.1)
    logger.info('Step 5: Generating fair meeting area isochrone')
    const fairMeetingAreaParams = {
      travelTimeMinutes: bufferTimeMinutes,
      travelMode
    }

    const fairMeetingArea = await cachedOpenRouteClient.calculateIsochrone(
      centerPoint,
      fairMeetingAreaParams
    )
    logger.info('Fair meeting area isochrone calculated successfully')

    // Return the complete result
    const result = {
      centerPoint,
      fairMeetingArea,
      individualIsochrones
    }

    logger.info('Isochronic center calculation completed successfully')
    return result

  } catch (error) {
    handleResolverError(error, 'calculateIsochronicCenter')
  }
}