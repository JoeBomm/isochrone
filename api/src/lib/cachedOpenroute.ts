import { openRouteClient, Coordinate, IsochroneParams } from './openroute'
import { cache, IsochroneCacheKey, CacheStats } from './cache'
import { logger } from './logger'
import { GeoJSON } from 'geojson'

class CachedOpenRouteClient {
  // Default TTLs in seconds
  private readonly ISOCHRONE_TTL = 24 * 60 * 60 // 24 hours
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
}

// Export singleton instance
export const cachedOpenRouteClient = new CachedOpenRouteClient()