import { openRouteClient, Coordinate, IsochroneParams } from './openroute'
import { cache, IsochroneCacheKey, MatrixCacheKey, CacheStats } from './cache'
import { logger } from './logger'
import { GeoJSON } from 'geojson'
import type { TravelMode, TravelTimeMatrix } from 'types/graphql'

class CachedOpenRouteClient {
  // Default TTLs in seconds
  private readonly ISOCHRONE_TTL = 24 * 60 * 60 // 24 hours
  private readonly MATRIX_TTL = 24 * 60 * 60 // 24 hours
  private readonly GEOCODING_TTL = 7 * 24 * 60 * 60 // 7 days
  private readonly LOCATION_PRECISION = 100 // meters

  async calculateIsochrone(coordinate: Coordinate, params: IsochroneParams): Promise<GeoJSON.Polygon> {
    const cacheKey: IsochroneCacheKey = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      travelTimeMinutes: params.travelTimeMinutes,
      travelMode: params.travelMode,
      precision: this.LOCATION_PRECISION
    }

    try {
      // Try to get from cache first
      const cachedResult = await cache.getIsochroneCache(cacheKey)
      if (cachedResult) {
        logger.info(`Cache hit for isochrone: ${coordinate.latitude}, ${coordinate.longitude}`)
        return cachedResult
      }

      // Cache miss - fetch from API
      logger.info(`Cache miss for isochrone: ${coordinate.latitude}, ${coordinate.longitude}`)

      const result = await openRouteClient.calculateIsochrone(coordinate, params)

      // Store in cache
      await cache.setIsochroneCache(cacheKey, result, this.ISOCHRONE_TTL)

      return result
    } catch (error) {
      logger.error(`Error in cached isochrone calculation: ${error.message}`)

      // If cache fails, try direct API call as fallback
      if (error.message.includes('cache') || error.message.includes('redis')) {
        logger.warn('Cache unavailable, falling back to direct API call')
        return await openRouteClient.calculateIsochrone(coordinate, params)
      }

      throw error
    }
  }

  async geocodeAddress(address: string): Promise<Coordinate> {
    try {
      // Try to get from cache first
      const cachedResult = await cache.getGeocodingCache(address)
      if (cachedResult) {
        logger.info(`Cache hit for geocoding: ${address}`)
        return cachedResult
      }

      // Cache miss - fetch from API
      logger.info(`Cache miss for geocoding: ${address}`)

      const result = await openRouteClient.geocodeAddress(address)

      // Store in cache
      await cache.setGeocodingCache(address, result, this.GEOCODING_TTL)

      return result
    } catch (error) {
      logger.error(`Error in cached geocoding: ${error.message}`)

      // If cache fails, try direct API call as fallback
      if (error.message.includes('cache') || error.message.includes('redis')) {
        logger.warn('Cache unavailable, falling back to direct API call')
        return await openRouteClient.geocodeAddress(address)
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
      precision: this.LOCATION_PRECISION
    }

    try {
      // Try to get from cache first (Requirements 7.1 - caching support for multi-phase)
      const cachedResult = await cache.getMatrixCache(cacheKey)
      if (cachedResult) {
        logger.info(`Cache hit for matrix: ${origins.length} origins to ${destinations.length} destinations`)
        return cachedResult
      }

      // Cache miss - fetch from API
      logger.info(`Cache miss for matrix: ${origins.length} origins to ${destinations.length} destinations`)

      let result: TravelTimeMatrix
      try {
        result = await openRouteClient.calculateTravelTimeMatrix(origins, destinations, travelMode)
        logger.info(`Matrix API call successful: ${result.travelTimes.length}×${result.travelTimes[0]?.length || 0}`)
      } catch (apiError) {
        logger.error(`Matrix API call failed: ${apiError.message}`)

        // Enhanced error handling for multi-phase matrix failures
        if (apiError.message.includes('rate limit') || apiError.message.includes('quota')) {
          throw new Error(`Matrix API rate limit exceeded: ${apiError.message}`)
        } else if (apiError.message.includes('network') || apiError.message.includes('timeout')) {
          throw new Error(`Matrix API network error: ${apiError.message}`)
        } else {
          throw new Error(`Matrix API error: ${apiError.message}`)
        }
      }

      // Validate result before caching
      if (!result || !result.travelTimes || !Array.isArray(result.travelTimes)) {
        throw new Error('Invalid matrix result: missing or invalid travel times')
      }

      if (result.travelTimes.length !== origins.length) {
        throw new Error(`Invalid matrix result: expected ${origins.length} origin rows, got ${result.travelTimes.length}`)
      }

      if (result.travelTimes[0]?.length !== destinations.length) {
        throw new Error(`Invalid matrix result: expected ${destinations.length} destination columns, got ${result.travelTimes[0]?.length || 0}`)
      }

      // Store in cache (Requirements 8.1, 8.2 - multi-phase caching support)
      try {
        await cache.setMatrixCache(cacheKey, result, this.MATRIX_TTL)
        logger.info(`Matrix result cached successfully: ${origins.length}×${destinations.length}`)
      } catch (cacheError) {
        logger.warn(`Failed to cache matrix result: ${cacheError.message}`)
        // Continue execution even if caching fails
      }

      return result

    } catch (error) {
      logger.error(`Error in cached matrix calculation: ${error.message}`)

      // If cache fails, try direct API call as fallback (graceful fallback - Requirements 8.3)
      if (error.message.includes('cache') || error.message.includes('redis')) {
        logger.warn('Cache unavailable, falling back to direct API call')
        try {
          return await openRouteClient.calculateTravelTimeMatrix(origins, destinations, travelMode)
        } catch (fallbackError) {
          logger.error(`Fallback API call also failed: ${fallbackError.message}`)
          throw new Error(`Both cached and direct matrix calculation failed: ${fallbackError.message}`)
        }
      }

      throw error
    }
  }

  async clearCache(): Promise<void> {
    await cache.clear()
    logger.info('Cache cleared')
  }

  async getCacheStats(): Promise<CacheStats> {
    return await cache.getCacheStats()
  }

  // Method to check if a location is within cache precision of another
  async isLocationCached(coordinate: Coordinate, params: IsochroneParams): Promise<boolean> {
    const cacheKey: IsochroneCacheKey = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      travelTimeMinutes: params.travelTimeMinutes,
      travelMode: params.travelMode,
      precision: this.LOCATION_PRECISION
    }

    const result = await cache.getIsochroneCache(cacheKey)
    return result !== null
  }

  // Method to warm cache with common locations
  async warmCache(locations: Array<{ coordinate: Coordinate; params: IsochroneParams }>): Promise<void> {
    logger.info(`Warming cache with ${locations.length} locations`)

    const promises = locations.map(async ({ coordinate, params }) => {
      try {
        // Only warm if not already cached
        const isCached = await this.isLocationCached(coordinate, params)
        if (!isCached) {
          await this.calculateIsochrone(coordinate, params)
        }
      } catch (error) {
        logger.warn(`Failed to warm cache for ${coordinate.latitude}, ${coordinate.longitude}: ${error.message}`)
      }
    })

    await Promise.allSettled(promises)
    logger.info('Cache warming completed')
  }

  // Method to implement cache eviction policy (LRU-like behavior)
  async evictExpiredEntries(): Promise<void> {
    // This is handled automatically by TTL in both Redis and InMemoryCache
    // But we could implement more sophisticated eviction policies here if needed
    logger.info('Cache eviction check completed (TTL-based)')
  }

  // Multi-phase caching support methods

  /**
   * Check if a matrix calculation would benefit from cache lookup
   * @param origins Array of origin coordinates
   * @param destinations Array of destination coordinates
   * @param travelMode Travel mode
   * @returns Promise<boolean> indicating if result is likely cached
   */
  async isMatrixCached(
    origins: Coordinate[],
    destinations: Coordinate[],
    travelMode: TravelMode
  ): Promise<boolean> {
    const cacheKey: MatrixCacheKey = {
      origins,
      destinations,
      travelMode,
      precision: this.LOCATION_PRECISION
    }

    try {
      const result = await cache.getMatrixCache(cacheKey)
      return result !== null
    } catch (error) {
      logger.warn(`Failed to check matrix cache: ${error.message}`)
      return false
    }
  }

  /**
   * Warm cache with multi-phase matrix results
   * @param matrixRequests Array of matrix calculation requests to pre-cache
   * @returns Promise<void>
   */
  async warmMatrixCache(
    matrixRequests: Array<{
      origins: Coordinate[]
      destinations: Coordinate[]
      travelMode: TravelMode
    }>
  ): Promise<void> {
    logger.info(`Warming matrix cache with ${matrixRequests.length} requests`)

    const promises = matrixRequests.map(async (request) => {
      try {
        // Only warm if not already cached
        const isCached = await this.isMatrixCached(request.origins, request.destinations, request.travelMode)
        if (!isCached) {
          await this.calculateTravelTimeMatrix(request.origins, request.destinations, request.travelMode)
        }
      } catch (error) {
        logger.warn(`Failed to warm matrix cache for ${request.origins.length}×${request.destinations.length}: ${error.message}`)
      }
    })

    await Promise.allSettled(promises)
    logger.info('Matrix cache warming completed')
  }

  /**
   * Get cache statistics with multi-phase breakdown
   * @returns Promise<CacheStats & { multiPhaseHits: number; multiPhaseMisses: number }>
   */
  async getExtendedCacheStats(): Promise<CacheStats & { multiPhaseHits: number; multiPhaseMisses: number }> {
    const baseStats = await this.getCacheStats()

    // For now, multi-phase stats are included in matrix stats
    // Could be extended to track phase-specific cache performance
    return {
      ...baseStats,
      multiPhaseHits: baseStats.matrixHits,
      multiPhaseMisses: baseStats.matrixMisses
    }
  }
}

// Export singleton instance
export const cachedOpenRouteClient = new CachedOpenRouteClient()