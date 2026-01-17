import { logger } from './logger'
import { GeoJSON } from 'geojson'
import {
  createApiKeyError,
  createRateLimitError,
  createTimeoutError,
  createGeocodingError,
  createInvalidCoordinatesError,
  createMatrixCalculationError,
  AppError,
  ErrorCode
} from './errors'
import type { TravelMode, Location, HypothesisPoint, TravelTimeMatrix } from 'types/graphql'

export interface Coordinate {
  latitude: number
  longitude: number
}

export interface IsochroneParams {
  travelTimeMinutes: number
  travelMode: 'DRIVING_CAR' | 'CYCLING_REGULAR' | 'FOOT_WALKING'
}

// Convert GraphQL enum values to OpenRoute API values
function convertTravelMode(mode: 'DRIVING_CAR' | 'CYCLING_REGULAR' | 'FOOT_WALKING'): 'driving-car' | 'cycling-regular' | 'foot-walking' {
  const modeMap = {
    'DRIVING_CAR': 'driving-car' as const,
    'CYCLING_REGULAR': 'cycling-regular' as const,
    'FOOT_WALKING': 'foot-walking' as const
  }
  return modeMap[mode]
}

export interface OpenRouteClient {
  calculateTravelTimeMatrix(
    origins: Coordinate[],
    destinations: Coordinate[],
    travelMode: TravelMode
  ): Promise<TravelTimeMatrix>
  calculateIsochrone(coordinate: Coordinate, params: IsochroneParams): Promise<GeoJSON.Polygon>
  geocodeAddress(address: string): Promise<Coordinate>
}

class OpenRouteServiceClient implements OpenRouteClient {
  private apiKey: string
  private baseUrl = 'https://api.openrouteservice.org'
  private isochroneTimeout = 30000 // 30 seconds for isochrone
  private matrixTimeout = 45000 // 45 seconds for matrix calculations
  private geocodingTimeout = 10000 // 10 seconds for geocoding

  constructor() {
    this.apiKey = process.env.OPENROUTE_SERVICE_API_KEY
    if (!this.apiKey) {
      throw new AppError({
        code: ErrorCode.MISSING_API_KEY,
        message: 'OPENROUTE_SERVICE_API_KEY environment variable is required',
        userMessage: 'Configuration error: Missing API key for mapping service. Please configure your API key.'
      })
    }

    // Validate API key format (basic check)
    if (!this.isValidApiKeyFormat(this.apiKey)) {
      throw createApiKeyError('Invalid API key format')
    }
  }

  private isValidApiKeyFormat(key: string): boolean {
    // OpenRouteService API keys are typically base64-encoded strings
    // They should be non-empty strings with reasonable length (typically 50+ chars)
    // and contain only valid base64 characters
    if (typeof key !== 'string' || key.length < 20) {
      return false
    }

    // Check if it's a valid base64-like string (letters, numbers, +, /, =)
    const base64Regex = /^[A-Za-z0-9+/=]+$/
    return base64Regex.test(key)
  }

  async calculateTravelTimeMatrix(
    origins: Coordinate[],
    destinations: Coordinate[],
    travelMode: TravelMode
  ): Promise<TravelTimeMatrix> {
    const apiTravelMode = convertTravelMode(travelMode)
    const url = `${this.baseUrl}/v2/matrix/${apiTravelMode}`

    // Convert coordinates to OpenRouteService format [lng, lat]
    const originCoords = origins.map(coord => [coord.longitude, coord.latitude])
    const destinationCoords = destinations.map(coord => [coord.longitude, coord.latitude])

    const requestBody = {
      locations: [...originCoords, ...destinationCoords],
      sources: Array.from({ length: origins.length }, (_, i) => i), // Indices for origins
      destinations: Array.from({ length: destinations.length }, (_, i) => origins.length + i), // Indices for destinations
      metrics: ['duration'], // We only need travel time
      units: 'm' // Duration in seconds
    }

    try {
      logger.info(`Calculating travel time matrix: ${origins.length} origins to ${destinations.length} destinations`)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.matrixTimeout)
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`OpenRouteService matrix API error: ${response.status} - ${errorText}`)

        if (response.status === 401) {
          throw createApiKeyError('Authentication failed with OpenRouteService')
        } else if (response.status === 429) {
          throw createRateLimitError()
        } else if (response.status === 403) {
          throw createApiKeyError('API key does not have permission for matrix service')
        } else if (response.status >= 500) {
          throw new AppError({
            code: ErrorCode.API_UNAVAILABLE,
            message: `OpenRouteService server error: ${response.status}`,
            userMessage: 'Mapping service is temporarily unavailable. Please try again later.',
            details: { status: response.status, errorText }
          })
        } else {
          throw createMatrixCalculationError(`API error: ${response.status} - ${errorText}`)
        }
      }

      const data = await response.json()

      // Validate response structure
      if (!data.durations || !Array.isArray(data.durations)) {
        throw createMatrixCalculationError('Invalid matrix response: missing durations array')
      }

      // Convert durations from seconds to minutes and validate dimensions
      const travelTimes: number[][] = data.durations.map((row: number[]) => {
        if (!Array.isArray(row) || row.length !== destinations.length) {
          throw createMatrixCalculationError(`Invalid matrix dimensions: expected ${destinations.length} destinations per row`)
        }
        return row.map((duration: number) => {
          // Convert seconds to minutes, handle null/unreachable routes
          if (duration === null || duration === undefined || duration < 0) {
            return Infinity // Unreachable route
          }
          return Math.round(duration / 60) // Convert to minutes
        })
      })

      if (travelTimes.length !== origins.length) {
        throw createMatrixCalculationError(`Invalid matrix dimensions: expected ${origins.length} origin rows`)
      }

      // Convert coordinates back to Location and HypothesisPoint objects
      const locationOrigins: Location[] = origins.map((coord, index) => ({
        id: `origin_${index}`,
        name: `Origin ${index + 1}`,
        latitude: coord.latitude,
        longitude: coord.longitude
      }))

      const hypothesisDestinations: HypothesisPoint[] = destinations.map((coord, index) => ({
        id: `destination_${index}`,
        coordinate: coord,
        type: 'PARTICIPANT_LOCATION' as const, // Default type for matrix calculations
        metadata: null
      }))

      return {
        origins: locationOrigins,
        destinations: hypothesisDestinations,
        travelTimes,
        travelMode
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      if (error.name === 'TimeoutError') {
        logger.error('OpenRouteService matrix request timed out')
        throw createTimeoutError('Travel time matrix calculation')
      }

      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        logger.error('Network error during matrix calculation:', error)
        throw new AppError({
          code: ErrorCode.NETWORK_ERROR,
          message: 'Network error during matrix calculation',
          userMessage: 'Network connection failed. Please check your internet connection and try again.',
          originalError: error
        })
      }

      logger.error('Unexpected error calculating travel time matrix:', error)
      throw createMatrixCalculationError('Unexpected error during matrix calculation', error)
    }
  }

  async calculateIsochrone(coordinate: Coordinate, params: IsochroneParams): Promise<GeoJSON.Polygon> {
    const apiTravelMode = convertTravelMode(params.travelMode)
    const url = `${this.baseUrl}/v2/isochrones/${apiTravelMode}`

    const requestBody = {
      locations: [[coordinate.longitude, coordinate.latitude]], // ORS expects [lng, lat]
      range: [params.travelTimeMinutes * 60], // Convert minutes to seconds
      range_type: 'time',
      attributes: ['area', 'reachfactor'],
      smoothing: 0.9,
      area_units: 'km'
    }

    try {
      logger.info(`Calculating isochrone for ${coordinate.latitude}, ${coordinate.longitude}`)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/geo+json'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.isochroneTimeout)
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`OpenRouteService isochrone API error: ${response.status} - ${errorText}`)

        if (response.status === 401) {
          throw createApiKeyError('Authentication failed with OpenRouteService')
        } else if (response.status === 429) {
          throw createRateLimitError()
        } else if (response.status === 403) {
          throw createApiKeyError('API key does not have permission for isochrone service')
        } else if (response.status >= 500) {
          throw new AppError({
            code: ErrorCode.API_UNAVAILABLE,
            message: `OpenRouteService server error: ${response.status}`,
            userMessage: 'Mapping service is temporarily unavailable. Please try again later.',
            details: { status: response.status, errorText }
          })
        } else {
          throw new AppError({
            code: ErrorCode.ISOCHRONE_CALCULATION_FAILED,
            message: `OpenRouteService API error: ${response.status} - ${errorText}`,
            userMessage: 'Failed to calculate travel areas. Please check your locations and try again.',
            details: { status: response.status, errorText }
          })
        }
      }

      const data = await response.json()

      // Extract the polygon from the response
      if (!data.features || data.features.length === 0) {
        throw new AppError({
          code: ErrorCode.ISOCHRONE_CALCULATION_FAILED,
          message: 'No isochrone data returned from OpenRouteService',
          userMessage: 'Unable to calculate travel area for this location. Please try a different location or travel time.',
          details: { coordinate, params }
        })
      }

      const polygon = data.features[0].geometry
      if (polygon.type !== 'Polygon') {
        throw new AppError({
          code: ErrorCode.INVALID_POLYGON_DATA,
          message: 'Invalid polygon data returned from OpenRouteService',
          userMessage: 'Received invalid travel area data. Please try again.',
          details: { polygonType: polygon.type }
        })
      }

      return polygon as GeoJSON.Polygon
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      if (error.name === 'TimeoutError') {
        logger.error('OpenRouteService isochrone request timed out')
        throw createTimeoutError('Isochrone calculation')
      }

      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        logger.error('Network error during isochrone calculation:', error)
        throw new AppError({
          code: ErrorCode.NETWORK_ERROR,
          message: 'Network error during isochrone calculation',
          userMessage: 'Network connection failed. Please check your internet connection and try again.',
          originalError: error
        })
      }

      logger.error('Unexpected error calculating isochrone:', error)
      throw new AppError({
        code: ErrorCode.ISOCHRONE_CALCULATION_FAILED,
        message: 'Unexpected error during isochrone calculation',
        userMessage: 'Failed to calculate travel area. Please try again.',
        originalError: error
      })
    }
  }

  async geocodeAddress(address: string): Promise<Coordinate> {
    const url = `${this.baseUrl}/geocode/search`
    const params = new URLSearchParams({
      api_key: this.apiKey,
      text: address,
      size: '1', // Only return the best match
      layers: 'address,venue,street' // Focus on specific location types
    })

    try {
      logger.info(`Geocoding address: ${address}`)

      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(this.geocodingTimeout) // 10 second timeout for geocoding
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`OpenRouteService geocoding API error: ${response.status} - ${errorText}`)

        if (response.status === 401) {
          throw createApiKeyError('Authentication failed with OpenRouteService')
        } else if (response.status === 429) {
          throw createRateLimitError()
        } else if (response.status === 403) {
          throw createApiKeyError('API key does not have permission for geocoding service')
        } else if (response.status >= 500) {
          throw new AppError({
            code: ErrorCode.API_UNAVAILABLE,
            message: `OpenRouteService server error: ${response.status}`,
            userMessage: 'Geocoding service is temporarily unavailable. Please try again later.',
            details: { status: response.status, errorText }
          })
        } else {
          throw createGeocodingError(address, new Error(`API error: ${response.status}`))
        }
      }

      const data = await response.json()

      if (!data.features || data.features.length === 0) {
        throw createGeocodingError(address)
      }

      const feature = data.features[0]
      const [longitude, latitude] = feature.geometry.coordinates

      // Validate coordinate ranges
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw createInvalidCoordinatesError({ latitude, longitude })
      }

      return {
        latitude,
        longitude
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      if (error.name === 'TimeoutError') {
        logger.error('OpenRouteService geocoding request timed out')
        throw createTimeoutError('Geocoding')
      }

      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        logger.error('Network error during geocoding:', error)
        throw new AppError({
          code: ErrorCode.NETWORK_ERROR,
          message: 'Network error during geocoding',
          userMessage: 'Network connection failed. Please check your internet connection and try again.',
          originalError: error
        })
      }

      logger.error('Unexpected error geocoding address:', error)
      throw createGeocodingError(address, error)
    }
  }
}

// Export singleton instance
export const openRouteClient = new OpenRouteServiceClient()