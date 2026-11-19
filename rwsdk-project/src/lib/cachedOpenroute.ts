import type { TravelMode, GeoJSONPolygon, Coordinate } from '../types'

import { cache, IsochroneCacheKey, MatrixCacheKey, CacheStats } from './cache'
import {
  OpenRouteService,
  IsochroneParams,
  TravelTimeMatrix,
} from './openroute'

class CachedOpenRouteClient {
  private openRouteService = new OpenRouteService()

  // Default TTLs in seconds
  private readonly ISOCHRONE_TTL = 24 * 60 * 60 // 24 hours
  private readonly MATRIX_TTL = 24 * 60 * 60 // 24 hours
  private readonly GEOCODING_TTL = 7 * 24 * 60 * 60 // 7 days
  private readonly LOCATION_PRECISION = 100 // meters

  async calculateIsochrone(
    coordinate: Coordinate,
    params: IsochroneParams
  ): Promise<GeoJSONPolygon> {
    const cacheKey: IsochroneCacheKey = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      travelTimeMinutes: params.travelTimeMinutes,
      travelMode: params.travelMode,
      precision: this.LOCATION_PRECISION,
    }

    try {
      // Try to get from cache first
      const cachedResult = await cache.getIsochroneCache(cacheKey)
      if (cachedResult) {
        console.info(
          `Cache hit for isochrone: ${coordinate.latitude}, ${coordinate.longitude}`
        )
        return cachedResult
      }

      // Cache miss - fetch from API
      console.info(
        `Cache miss for isochrone: ${coordinate.latitude}, ${coordinate.longitude}`
      )

      const result = await this.openRouteService.generateIsochrone(
        [coordinate.longitude, coordinate.latitude],
        params.travelTimeMinutes,
        params.travelMode
      )

      // Store in cache
      try {
        await cache.setIsochroneCache(cacheKey, result, this.ISOCHRONE_TTL)
      } catch (cacheStoreError) {
        console.warn(
          'Failed to store isochrone in cache, continuing without caching:',
          cacheStoreError
        )
        // Continue execution - caching failure is not critical
      }

      return result
    } catch (error) {
      console.error(`Error in cached isochrone calculation: ${error.message}`)

      // If cache fails, try direct API call as fallback
      if (error.message.includes('cache')) {
        console.warn('Cache unavailable, falling back to direct API call')
        try {
          return await this.openRouteService.generateIsochrone(
            [coordinate.longitude, coordinate.latitude],
            params.travelTimeMinutes,
            params.travelMode
          )
        } catch (fallbackError) {
          console.error('Direct API fallback also failed:', fallbackError)
          throw fallbackError // Re-throw the API error, not the cache error
        }
      }

      throw error
    }
  }

  async geocodeAddress(address: string): Promise<Coordinate> {
    try {
      // Try to get from cache first
      const cachedResult = await cache.getGeocodingCache(address)
      if (cachedResult) {
        console.info(`Cache hit for geocoding: ${address}`)
        return cachedResult
      }

      // Cache miss - fetch from API
      console.info(`Cache miss for geocoding: ${address}`)

      const result = await this.openRouteService.geocodeAddress(address)

      // Store in cache
      await cache.setGeocodingCache(address, result, this.GEOCODING_TTL)

      return result
    } catch (error) {
      console.error(`Error in cached geocoding: ${error.message}`)

      // If cache fails, try direct API call as fallback
      if (error.message.includes('cache')) {
        console.warn('Cache unavailable, falling back to direct API call')
        return await this.openRouteService.geocodeAddress(address)
      }

      throw error
    }
  }

  async calculateTravelTimeMatrix(
    origins: Coordinate[],
    destinations: Coordinate[],
    travelMode: TravelMode
  ): Promise<TravelTimeMatrix> {
    const cacheKey: MatrixCacheKey = {
      origins,
      destinations,
      travelMode,
      precision: this.LOCATION_PRECISION,
    }

    try {
      // Try to get from cache first
      const cachedResult = await cache.getMatrixCache(cacheKey)
      if (cachedResult) {
        console.info(
          `Cache hit for matrix: ${origins.length} origins to ${destinations.length} destinations`
        )
        return cachedResult
      }

      // Cache miss - fetch from API
      console.info(
        `Cache miss for matrix: ${origins.length} origins to ${destinations.length} destinations`
      )

      let result: TravelTimeMatrix
      try {
        result = await this.openRouteService.calculateTravelTimeMatrix(
          origins,
          destinations,
          travelMode
        )
        console.info(
          `Matrix API call successful: ${result.travelTimes.length}×${result.travelTimes[0]?.length || 0}`
        )
      } catch (apiError) {
        console.error(`Matrix API call failed: ${apiError.message}`)

        // Enhanced error handling for matrix failures
        if (
          apiError.message.includes('rate limit') ||
          apiError.message.includes('quota')
        ) {
          throw new Error(`Matrix API rate limit exceeded: ${apiError.message}`)
        } else if (
          apiError.message.includes('network') ||
          apiError.message.includes('timeout')
        ) {
          throw new Error(`Matrix API network error: ${apiError.message}`)
        } else {
          throw new Error(`Matrix API error: ${apiError.message}`)
        }
      }

      // Validate result before caching
      if (
        !result ||
        !result.travelTimes ||
        !Array.isArray(result.travelTimes)
      ) {
        throw new Error(
          'Invalid matrix result: missing or invalid travel times'
        )
      }

      if (result.travelTimes.length !== origins.length) {
        throw new Error(
          `Invalid matrix result: expected ${origins.length} origin rows, got ${result.travelTimes.length}`
        )
      }

      if (result.travelTimes[0]?.length !== destinations.length) {
        throw new Error(
          `Invalid matrix result: expected ${destinations.length} destination columns, got ${result.travelTimes[0]?.length || 0}`
        )
      }

      // Store in cache
      try {
        await cache.setMatrixCache(cacheKey, result, this.MATRIX_TTL)
        console.info(
          `Matrix result cached successfully: ${origins.length}×${destinations.length}`
        )
      } catch (cacheError) {
        console.warn(`Failed to cache matrix result: ${cacheError.message}`)
        // Continue execution even if caching fails
      }

      return result
    } catch (error) {
      console.error(`Error in cached matrix calculation: ${error.message}`)

      // If cache fails, try direct API call as fallback
      if (error.message.includes('cache')) {
        console.warn('Cache unavailable, falling back to direct API call')
        try {
          return await this.openRouteService.calculateTravelTimeMatrix(
            origins,
            destinations,
            travelMode
          )
        } catch (fallbackError) {
          console.error(
            `Fallback API call also failed: ${fallbackError.message}`
          )
          throw new Error(
            `Both cached and direct matrix calculation failed: ${fallbackError.message}`
          )
        }
      }

      throw error
    }
  }

  async clearCache(): Promise<void> {
    await cache.clear()
    console.info('Cache cleared')
  }

  async getCacheStats(): Promise<CacheStats> {
    return await cache.getCacheStats()
  }

  // Method to check if a location is within cache precision of another
  async isLocationCached(
    coordinate: Coordinate,
    params: IsochroneParams
  ): Promise<boolean> {
    const cacheKey: IsochroneCacheKey = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      travelTimeMinutes: params.travelTimeMinutes,
      travelMode: params.travelMode,
      precision: this.LOCATION_PRECISION,
    }

    const result = await cache.getIsochroneCache(cacheKey)
    return result !== null
  }

  // Method to warm cache with common locations
  async warmCache(
    locations: Array<{ coordinate: Coordinate; params: IsochroneParams }>
  ): Promise<void> {
    console.info(`Warming cache with ${locations.length} locations`)

    const promises = locations.map(async ({ coordinate, params }) => {
      try {
        // Only warm if not already cached
        const isCached = await this.isLocationCached(coordinate, params)
        if (!isCached) {
          await this.calculateIsochrone(coordinate, params)
        }
      } catch (error) {
        console.warn(
          `Failed to warm cache for ${coordinate.latitude}, ${coordinate.longitude}: ${error.message}`
        )
      }
    })

    await Promise.allSettled(promises)
    console.info('Cache warming completed')
  }

  // Method to check if a matrix calculation would benefit from cache lookup
  async isMatrixCached(
    origins: Coordinate[],
    destinations: Coordinate[],
    travelMode: TravelMode
  ): Promise<boolean> {
    const cacheKey: MatrixCacheKey = {
      origins,
      destinations,
      travelMode,
      precision: this.LOCATION_PRECISION,
    }

    try {
      const result = await cache.getMatrixCache(cacheKey)
      return result !== null
    } catch (error) {
      console.warn(`Failed to check matrix cache: ${error.message}`)
      return false
    }
  }

  // Warm cache with matrix results
  async warmMatrixCache(
    matrixRequests: Array<{
      origins: Coordinate[]
      destinations: Coordinate[]
      travelMode: TravelMode
    }>
  ): Promise<void> {
    console.info(`Warming matrix cache with ${matrixRequests.length} requests`)

    const promises = matrixRequests.map(async (request) => {
      try {
        // Only warm if not already cached
        const isCached = await this.isMatrixCached(
          request.origins,
          request.destinations,
          request.travelMode
        )
        if (!isCached) {
          await this.calculateTravelTimeMatrix(
            request.origins,
            request.destinations,
            request.travelMode
          )
        }
      } catch (error) {
        console.warn(
          `Failed to warm matrix cache for ${request.origins.length}×${request.destinations.length}: ${error.message}`
        )
      }
    })

    await Promise.allSettled(promises)
    console.info('Matrix cache warming completed')
  }

  // Get cache statistics with extended breakdown
  async getExtendedCacheStats(): Promise<
    CacheStats & { multiPhaseHits: number; multiPhaseMisses: number }
  > {
    const baseStats = await this.getCacheStats()

    // For now, multi-phase stats are included in matrix stats
    // Could be extended to track phase-specific cache performance
    return {
      ...baseStats,
      multiPhaseHits: baseStats.matrixHits,
      multiPhaseMisses: baseStats.matrixMisses,
    }
  }

  // Get API usage statistics
  getApiUsageStats(): {
    callCount: number
    timeWindow: string
    isHighUsage: boolean
  } {
    return this.openRouteService.getApiUsageStats()
  }
}

// Export singleton instance
export const cachedOpenRouteClient = new CachedOpenRouteClient()
