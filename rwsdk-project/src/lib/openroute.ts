import { getRequestInfo } from '@redwoodjs/sdk/worker'

import type { AppContext } from '../../worker'
import type { TravelMode, GeoJSONPolygon, Coordinate } from '../types'

import {
  createApiKeyError,
  createRateLimitError,
  createTimeoutError,
  createGeocodingError,
  createInvalidCoordinatesError,
  createMatrixCalculationError,
  AppError,
  ErrorCode,
} from './errors'

export interface IsochroneParams {
  travelTimeMinutes: number
  travelMode: TravelMode
}

export interface TravelTimeMatrix {
  origins: Array<{
    id: string
    name: string
    latitude: number
    longitude: number
  }>
  destinations: Array<{
    id: string
    coordinate: Coordinate
    type: string
    metadata: any
  }>
  travelTimes: number[][]
  travelMode: TravelMode
}

// OpenRouteService client for RedwoodSDK using native fetch
export class OpenRouteService {
  private baseUrl = 'https://api.openrouteservice.org'
  private isochroneTimeout = 30000 // 30 seconds
  private matrixTimeout = 45000 // 45 seconds
  private geocodingTimeout = 10000 // 10 seconds

  // API usage tracking
  private apiCallCount = 0
  private lastResetTime = Date.now()
  private readonly USAGE_RESET_INTERVAL = 60 * 60 * 1000 // 1 hour
  private readonly HIGH_USAGE_THRESHOLD = 100

  private get apiKey() {
    const { ctx } = getRequestInfo<AppContext>()
    const key = ctx.env.OPENROUTE_SERVICE_API_KEY

    if (!key) {
      throw new AppError({
        code: ErrorCode.MISSING_API_KEY,
        message: 'OPENROUTE_SERVICE_API_KEY environment variable is required',
        userMessage:
          'Configuration error: Missing API key for mapping service. Please configure your API key.',
      })
    }

    if (!this.isValidApiKeyFormat(key)) {
      throw createApiKeyError('Invalid API key format')
    }

    return key
  }

  private isValidApiKeyFormat(key: string): boolean {
    if (typeof key !== 'string' || key.length < 20) {
      return false
    }
    const base64Regex = /^[A-Za-z0-9+/=]+$/
    return base64Regex.test(key)
  }

  private trackApiUsage(): void {
    const now = Date.now()
    if (now - this.lastResetTime > this.USAGE_RESET_INTERVAL) {
      this.apiCallCount = 0
      this.lastResetTime = now
    }
    this.apiCallCount++

    if (this.apiCallCount >= this.HIGH_USAGE_THRESHOLD) {
      console.warn(
        `High API usage detected: ${this.apiCallCount} calls in the last hour`
      )
    }
  }

  getApiUsageStats(): {
    callCount: number
    timeWindow: string
    isHighUsage: boolean
  } {
    const now = Date.now()
    const timeWindow = `${Math.floor((now - this.lastResetTime) / (60 * 1000))} minutes`

    return {
      callCount: this.apiCallCount,
      timeWindow,
      isHighUsage: this.apiCallCount >= this.HIGH_USAGE_THRESHOLD,
    }
  }

  // Generate isochrone polygon
  async generateIsochrone(
    coordinate: [number, number],
    travelTimeMinutes: number,
    travelMode: TravelMode
  ): Promise<GeoJSONPolygon> {
    this.trackApiUsage()

    const profile = this.getTravelProfile(travelMode)
    const url = `${this.baseUrl}/v2/isochrones/${profile}`

    const requestBody = {
      locations: [coordinate],
      range: [travelTimeMinutes * 60], // Convert to seconds
      range_type: 'time',
      attributes: ['area', 'reachfactor'],
      smoothing: 0.9,
      area_units: 'km',
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/geo+json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.isochroneTimeout),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          `OpenRouteService isochrone API error: ${response.status} - ${errorText}`
        )

        if (response.status === 401) {
          throw createApiKeyError('Authentication failed with OpenRouteService')
        } else if (response.status === 429) {
          throw createRateLimitError()
        } else if (response.status === 403) {
          throw createApiKeyError(
            'API key does not have permission for isochrone service'
          )
        } else if (response.status >= 500) {
          throw new AppError({
            code: ErrorCode.API_UNAVAILABLE,
            message: `OpenRouteService server error: ${response.status}`,
            userMessage:
              'Mapping service is temporarily unavailable. Please try again later.',
            details: { status: response.status, errorText },
          })
        } else {
          throw new AppError({
            code: ErrorCode.ISOCHRONE_CALCULATION_FAILED,
            message: `OpenRouteService API error: ${response.status} - ${errorText}`,
            userMessage:
              'Failed to calculate travel areas. Please check your locations and try again.',
            details: { status: response.status, errorText },
          })
        }
      }

      const data = await response.json()

      if (!data.features || data.features.length === 0) {
        throw new AppError({
          code: ErrorCode.ISOCHRONE_CALCULATION_FAILED,
          message: 'No isochrone data returned from OpenRouteService',
          userMessage:
            'Unable to calculate travel area for this location. Please try a different location or travel time.',
          details: { coordinate, travelTimeMinutes, travelMode },
        })
      }

      const polygon = data.features[0].geometry
      if (polygon.type !== 'Polygon') {
        throw new AppError({
          code: ErrorCode.INVALID_POLYGON_DATA,
          message: 'Invalid polygon data returned from OpenRouteService',
          userMessage: 'Received invalid travel area data. Please try again.',
          details: { polygonType: polygon.type },
        })
      }

      return polygon as GeoJSONPolygon
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      if (error.name === 'TimeoutError') {
        console.error('OpenRouteService isochrone request timed out')
        throw createTimeoutError('Isochrone calculation')
      }

      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error('Network error during isochrone calculation:', error)
        throw new AppError({
          code: ErrorCode.NETWORK_ERROR,
          message: 'Network error during isochrone calculation',
          userMessage:
            'Network connection failed. Please check your internet connection and try again.',
          originalError: error,
        })
      }

      console.error('Unexpected error calculating isochrone:', error)
      throw new AppError({
        code: ErrorCode.ISOCHRONE_CALCULATION_FAILED,
        message: 'Unexpected error during isochrone calculation',
        userMessage: 'Failed to calculate travel area. Please try again.',
        originalError: error,
      })
    }
  }

  // Calculate travel time matrix
  async calculateMatrix(
    sources: [number, number][],
    destinations: [number, number][],
    travelMode: TravelMode
  ): Promise<number[][]> {
    this.trackApiUsage()

    const profile = this.getTravelProfile(travelMode)
    const url = `${this.baseUrl}/v2/matrix/${profile}`

    const requestBody = {
      locations: [...sources, ...destinations],
      sources: sources.map((_, index) => index),
      destinations: destinations.map((_, index) => sources.length + index),
      metrics: ['duration'],
      units: 'm',
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.matrixTimeout),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          `OpenRouteService matrix API error: ${response.status} - ${errorText}`
        )

        if (response.status === 401) {
          throw createApiKeyError('Authentication failed with OpenRouteService')
        } else if (response.status === 429) {
          throw createRateLimitError()
        } else if (response.status >= 500) {
          throw new AppError({
            code: ErrorCode.API_UNAVAILABLE,
            message: `OpenRouteService server error: ${response.status}`,
            userMessage:
              'Mapping service is temporarily unavailable. Please try again later.',
            details: { status: response.status, errorText },
          })
        } else {
          throw createMatrixCalculationError(
            `API error: ${response.status} - ${errorText}`
          )
        }
      }

      const data = await response.json()

      if (!data.durations || !Array.isArray(data.durations)) {
        throw createMatrixCalculationError(
          'Invalid matrix response: missing durations array'
        )
      }

      // Convert from seconds to minutes and validate
      const travelTimes: number[][] = data.durations.map((row: number[]) => {
        if (!Array.isArray(row) || row.length !== destinations.length) {
          throw createMatrixCalculationError(
            `Invalid matrix dimensions: expected ${destinations.length} destinations per row`
          )
        }
        return row.map((duration: number) => {
          if (duration === null || duration === undefined || duration < 0) {
            return Infinity // Unreachable route
          }
          return Math.round(duration / 60) // Convert to minutes
        })
      })

      if (travelTimes.length !== sources.length) {
        throw createMatrixCalculationError(
          `Invalid matrix dimensions: expected ${sources.length} source rows`
        )
      }

      return travelTimes
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      if (error.name === 'TimeoutError') {
        console.error('OpenRouteService matrix request timed out')
        throw createTimeoutError('Travel time matrix calculation')
      }

      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error('Network error during matrix calculation:', error)
        throw new AppError({
          code: ErrorCode.NETWORK_ERROR,
          message: 'Network error during matrix calculation',
          userMessage:
            'Network connection failed. Please check your internet connection and try again.',
          originalError: error,
        })
      }

      console.error('Unexpected error calculating travel time matrix:', error)
      throw createMatrixCalculationError(
        'Unexpected error during matrix calculation',
        error
      )
    }
  }

  // Calculate travel time matrix with full result structure
  async calculateTravelTimeMatrix(
    origins: Coordinate[],
    destinations: Coordinate[],
    travelMode: TravelMode
  ): Promise<TravelTimeMatrix> {
    // Convert coordinates to OpenRouteService format [lng, lat]
    const originCoords = origins.map(
      (coord) => [coord.longitude, coord.latitude] as [number, number]
    )
    const destinationCoords = destinations.map(
      (coord) => [coord.longitude, coord.latitude] as [number, number]
    )

    const travelTimes = await this.calculateMatrix(
      originCoords,
      destinationCoords,
      travelMode
    )

    // Convert back to Location and HypothesisPoint objects
    const locationOrigins = origins.map((coord, index) => ({
      id: `origin_${index}`,
      name: `Origin ${index + 1}`,
      latitude: coord.latitude,
      longitude: coord.longitude,
    }))

    const hypothesisDestinations = destinations.map((coord, index) => ({
      id: `destination_${index}`,
      coordinate: coord,
      type: 'PARTICIPANT_LOCATION',
      metadata: null,
    }))

    return {
      origins: locationOrigins,
      destinations: hypothesisDestinations,
      travelTimes,
      travelMode,
    }
  }

  // Geocode an address
  async geocode(address: string): Promise<
    {
      coordinates: [number, number]
      label: string
      confidence: number
    }[]
  > {
    this.trackApiUsage()

    const url = `${this.baseUrl}/geocode/search`
    const params = new URLSearchParams({
      api_key: this.apiKey,
      text: address,
      size: '5', // Return top 5 matches
      layers: 'address,venue,street',
    })

    try {
      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(this.geocodingTimeout),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          `OpenRouteService geocoding API error: ${response.status} - ${errorText}`
        )

        if (response.status === 401) {
          throw createApiKeyError('Authentication failed with OpenRouteService')
        } else if (response.status === 429) {
          throw createRateLimitError()
        } else if (response.status === 403) {
          throw createApiKeyError(
            'API key does not have permission for geocoding service'
          )
        } else if (response.status >= 500) {
          throw new AppError({
            code: ErrorCode.API_UNAVAILABLE,
            message: `OpenRouteService server error: ${response.status}`,
            userMessage:
              'Geocoding service is temporarily unavailable. Please try again later.',
            details: { status: response.status, errorText },
          })
        } else {
          throw createGeocodingError(
            address,
            new Error(`API error: ${response.status}`)
          )
        }
      }

      const data = await response.json()

      if (!data.features || data.features.length === 0) {
        return []
      }

      return data.features
        .map((feature: any) => {
          const [longitude, latitude] = feature.geometry.coordinates

          // Validate coordinate ranges
          if (
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
          ) {
            console.warn(
              `Invalid coordinates from geocoding: ${latitude}, ${longitude}`
            )
            return null
          }

          return {
            coordinates: [longitude, latitude] as [number, number],
            label:
              feature.properties.label || feature.properties.name || address,
            confidence: feature.properties.confidence || 0,
          }
        })
        .filter(Boolean)
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      if (error.name === 'TimeoutError') {
        console.error('OpenRouteService geocoding request timed out')
        throw createTimeoutError('Geocoding')
      }

      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error('Network error during geocoding:', error)
        throw new AppError({
          code: ErrorCode.NETWORK_ERROR,
          message: 'Network error during geocoding',
          userMessage:
            'Network connection failed. Please check your internet connection and try again.',
          originalError: error,
        })
      }

      console.error('Unexpected error geocoding address:', error)
      throw createGeocodingError(address, error)
    }
  }

  // Geocode address and return single best result
  async geocodeAddress(address: string): Promise<Coordinate> {
    const results = await this.geocode(address)

    if (results.length === 0) {
      throw createGeocodingError(address)
    }

    const [longitude, latitude] = results[0].coordinates
    return { latitude, longitude }
  }

  // Convert travel mode to OpenRouteService profile
  private getTravelProfile(mode: TravelMode): string {
    switch (mode) {
      case 'DRIVING_CAR':
        return 'driving-car'
      case 'CYCLING_REGULAR':
        return 'cycling-regular'
      case 'FOOT_WALKING':
        return 'foot-walking'
      default:
        return 'driving-car'
    }
  }
}

// Export a singleton instance
export const openRouteService = new OpenRouteService()
