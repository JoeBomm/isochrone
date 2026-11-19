// Persistent cache service that uses database storage instead of Redis/in-memory
// This provides a migration path from Redis to D1 database caching

import { GeoJSON } from 'geojson'
import type { TravelMode } from 'types/graphql'

import { databaseService } from './database'
import { logger } from './logger'

export interface Coordinate {
  latitude: number
  longitude: number
}

export interface IsochroneParams {
  travelTimeMinutes: number
  travelMode: 'driving-car' | 'cycling-regular' | 'foot-walking'
}

export interface TravelTimeMatrix {
  origins: Array<{ latitude: number; longitude: number }>
  destinations: Array<{ latitude: number; longitude: number }>
  travelTimes: number[][]
  travelMode: TravelMode
}

export interface CacheStats {
  isochroneHits: number
  isochroneMisses: number
  matrixHits: number
  matrixMisses: number
  geocodingHits: number
  geocodingMisses: number
  totalEntries: number
}

// Persistent cache service using database storage
export class PersistentCacheService {
  private stats: CacheStats = {
    isochroneHits: 0,
    isochroneMisses: 0,
    matrixHits: 0,
    matrixMisses: 0,
    geocodingHits: 0,
    geocodingMisses: 0,
    totalEntries: 0,
  }

  // Convert GraphQL travel mode to OpenRoute travel mode
  private convertTravelMode(
    mode: TravelMode
  ): 'driving-car' | 'cycling-regular' | 'foot-walking' {
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

  // Generate cache key for isochrones
  generateIsochroneCacheKey(
    coordinate: Coordinate,
    params: IsochroneParams,
    precision: number = 100
  ): string {
    // Round coordinates to precision for cache matching
    const latRounded =
      Math.round(coordinate.latitude * (111000 / precision)) /
      (111000 / precision)
    const lngRounded =
      Math.round(coordinate.longitude * (111000 / precision)) /
      (111000 / precision)

    return `${latRounded}:${lngRounded}:${params.travelTimeMinutes}:${params.travelMode}`
  }

  // Isochrone cache operations
  async getIsochroneCache(
    coordinate: Coordinate,
    params: IsochroneParams,
    precision: number = 100
  ): Promise<GeoJSON.Polygon | null> {
    try {
      const pointId = this.generateIsochroneCacheKey(
        coordinate,
        params,
        precision
      )
      const result = await databaseService.getCachedIsochrone(
        pointId,
        params.travelTimeMinutes,
        params.travelMode
      )

      if (result) {
        this.stats.isochroneHits++
        logger.info(`Isochrone cache hit for ${pointId}`)
        return result as GeoJSON.Polygon
      } else {
        this.stats.isochroneMisses++
        logger.info(`Isochrone cache miss for ${pointId}`)
        return null
      }
    } catch (error) {
      logger.error('Error getting isochrone from cache:', error)
      this.stats.isochroneMisses++
      return null
    }
  }

  async setIsochroneCache(
    coordinate: Coordinate,
    params: IsochroneParams,
    polygon: GeoJSON.Polygon,
    ttlHours: number = 24,
    precision: number = 100
  ): Promise<void> {
    try {
      const pointId = this.generateIsochroneCacheKey(
        coordinate,
        params,
        precision
      )
      await databaseService.setCachedIsochrone(
        pointId,
        params.travelTimeMinutes,
        params.travelMode,
        polygon,
        ttlHours
      )
      logger.info(`Isochrone cached for ${pointId}`)
    } catch (error) {
      logger.error('Error setting isochrone cache:', error)
      // Don't throw - caching failures should not break the application
    }
  }

  // Matrix cache operations
  async getMatrixCache(
    origins: Coordinate[],
    destinations: Coordinate[],
    travelMode: TravelMode
  ): Promise<TravelTimeMatrix | null> {
    try {
      const originsHash = databaseService.generateCoordinateHash(origins)
      const destinationsHash =
        databaseService.generateCoordinateHash(destinations)
      const convertedTravelMode = this.convertTravelMode(travelMode)

      const result = await databaseService.getCachedMatrix(
        originsHash,
        destinationsHash,
        convertedTravelMode
      )

      if (result) {
        this.stats.matrixHits++
        logger.info(
          `Matrix cache hit for ${originsHash}:${destinationsHash}:${convertedTravelMode}`
        )
        return result as TravelTimeMatrix
      } else {
        this.stats.matrixMisses++
        logger.info(
          `Matrix cache miss for ${originsHash}:${destinationsHash}:${convertedTravelMode}`
        )
        return null
      }
    } catch (error) {
      logger.error('Error getting matrix from cache:', error)
      this.stats.matrixMisses++
      return null
    }
  }

  async setMatrixCache(
    origins: Coordinate[],
    destinations: Coordinate[],
    travelMode: TravelMode,
    matrix: TravelTimeMatrix,
    ttlHours: number = 24
  ): Promise<void> {
    try {
      const originsHash = databaseService.generateCoordinateHash(origins)
      const destinationsHash =
        databaseService.generateCoordinateHash(destinations)
      const convertedTravelMode = this.convertTravelMode(travelMode)

      await databaseService.setCachedMatrix(
        originsHash,
        destinationsHash,
        convertedTravelMode,
        matrix,
        ttlHours
      )
      logger.info(
        `Matrix cached for ${originsHash}:${destinationsHash}:${convertedTravelMode}`
      )
    } catch (error) {
      logger.error('Error setting matrix cache:', error)
      // Don't throw - caching failures should not break the application
    }
  }

  // Geocoding cache operations
  async getGeocodingCache(address: string): Promise<Coordinate | null> {
    try {
      const result = await databaseService.getCachedGeocode(address)

      if (result) {
        this.stats.geocodingHits++
        logger.info(`Geocoding cache hit for ${address}`)
        return {
          latitude: result.latitude,
          longitude: result.longitude,
        }
      } else {
        this.stats.geocodingMisses++
        logger.info(`Geocoding cache miss for ${address}`)
        return null
      }
    } catch (error) {
      logger.error('Error getting geocoding from cache:', error)
      this.stats.geocodingMisses++
      return null
    }
  }

  async setGeocodingCache(
    address: string,
    coordinate: Coordinate,
    ttlHours: number = 168 // 7 days
  ): Promise<void> {
    try {
      await databaseService.setCachedGeocode(
        address,
        coordinate.latitude,
        coordinate.longitude,
        ttlHours
      )
      logger.info(`Geocoding cached for ${address}`)
    } catch (error) {
      logger.error('Error setting geocoding cache:', error)
      // Don't throw - caching failures should not break the application
    }
  }

  // Cache management
  async getCacheStats(): Promise<CacheStats> {
    try {
      const dbStats = await databaseService.getCacheStats()
      return {
        ...this.stats,
        totalEntries:
          dbStats.isochroneCount + dbStats.matrixCount + dbStats.geocodingCount,
      }
    } catch (error) {
      logger.error('Error getting cache stats:', error)
      return this.stats
    }
  }

  async clear(): Promise<void> {
    try {
      await databaseService.clearAllCache()
      this.stats = {
        isochroneHits: 0,
        isochroneMisses: 0,
        matrixHits: 0,
        matrixMisses: 0,
        geocodingHits: 0,
        geocodingMisses: 0,
        totalEntries: 0,
      }
      logger.info('Cache cleared')
    } catch (error) {
      logger.error('Error clearing cache:', error)
      throw error
    }
  }

  async cleanupExpired(): Promise<void> {
    try {
      await databaseService.cleanupExpiredCache()
      logger.info('Expired cache entries cleaned up')
    } catch (error) {
      logger.error('Error cleaning up expired cache:', error)
      // Don't throw - cleanup failures should not break the application
    }
  }

  // Compatibility methods for existing cache interface
  async get(key: string): Promise<string | null> {
    // This method is for compatibility with the existing cache interface
    // In practice, use the specific cache methods above
    logger.warn(
      'Generic cache.get() called - use specific cache methods instead'
    )
    return null
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    // This method is for compatibility with the existing cache interface
    // In practice, use the specific cache methods above
    logger.warn(
      'Generic cache.set() called - use specific cache methods instead'
    )
  }

  async del(key: string): Promise<void> {
    // This method is for compatibility with the existing cache interface
    logger.warn(
      'Generic cache.del() called - use specific cache methods instead'
    )
  }
}

// Export singleton instance
export const persistentCache = new PersistentCacheService()
