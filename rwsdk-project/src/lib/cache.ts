import { getRequestInfo } from '@redwoodjs/sdk/worker'

import type { AppContext } from '../../worker'
import type { TravelMode, Coordinate } from '../types'

export interface IsochroneCacheKey {
  latitude: number
  longitude: number
  travelTimeMinutes: number
  travelMode: TravelMode
  precision: number
}

export interface MatrixCacheKey {
  origins: Coordinate[]
  destinations: Coordinate[]
  travelMode: TravelMode
  precision: number
}

export interface CacheStats {
  isochroneHits: number
  isochroneMisses: number
  matrixHits: number
  matrixMisses: number
  geocodingHits: number
  geocodingMisses: number
}

// Cache service using Cloudflare Cache API and KV
export class CacheService {
  private static CACHE_NAME = 'isochrone-cache'

  // Default TTLs in seconds
  private readonly ISOCHRONE_TTL = 24 * 60 * 60 // 24 hours
  private readonly MATRIX_TTL = 24 * 60 * 60 // 24 hours
  private readonly GEOCODING_TTL = 7 * 24 * 60 * 60 // 7 days
  private readonly LOCATION_PRECISION = 100 // meters

  // Cache API methods (for HTTP responses)
  async get<T>(key: string): Promise<T | null> {
    try {
      const cache = await caches.open(CacheService.CACHE_NAME)
      const response = await cache.match(key)

      if (!response) return null

      const data = await response.json()

      // Check if expired
      if (data.expiresAt && Date.now() > data.expiresAt) {
        await cache.delete(key)
        return null
      }

      return data.value
    } catch (error) {
      console.error('Cache get error:', error)
      return null
    }
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number = 3600
  ): Promise<void> {
    try {
      const cache = await caches.open(CacheService.CACHE_NAME)
      const expiresAt = Date.now() + ttlSeconds * 1000

      const response = new Response(
        JSON.stringify({
          value,
          expiresAt,
        }),
        {
          headers: {
            'Cache-Control': `max-age=${ttlSeconds}`,
            'Content-Type': 'application/json',
          },
        }
      )

      await cache.put(key, response)
    } catch (error) {
      console.error('Cache set error:', error)
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const cache = await caches.open(CacheService.CACHE_NAME)
      await cache.delete(key)
    } catch (error) {
      console.error('Cache delete error:', error)
    }
  }

  // Clear all cache entries
  async clear(): Promise<void> {
    try {
      const cache = await caches.open(CacheService.CACHE_NAME)
      const keys = await cache.keys()
      await Promise.all(keys.map((key) => cache.delete(key)))
    } catch (error) {
      console.error('Cache clear error:', error)
    }
  }

  // KV methods (for persistent data)
  async getFromKV<T>(key: string): Promise<T | null> {
    try {
      const { ctx } = getRequestInfo<AppContext>()
      if (!ctx.env.CACHE) {
        console.warn('KV namespace not available, falling back to Cache API')
        return await this.get(key)
      }

      const value = await ctx.env.CACHE.get(key)
      if (!value) return null

      const data = JSON.parse(value)
      // Check if expired
      if (data.expiresAt && Date.now() > data.expiresAt) {
        await ctx.env.CACHE.delete(key)
        return null
      }

      return data.value
    } catch (error) {
      console.error('KV get error:', error)
      // Fallback to Cache API
      return await this.get(key)
    }
  }

  async setInKV<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const { ctx } = getRequestInfo<AppContext>()
      if (!ctx.env.CACHE) {
        console.warn('KV namespace not available, falling back to Cache API')
        await this.set(key, value, ttlSeconds)
        return
      }

      const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined
      const data = { value, expiresAt }

      const options: any = {}
      if (ttlSeconds) {
        options.expirationTtl = ttlSeconds
      }

      await ctx.env.CACHE.put(key, JSON.stringify(data), options)
    } catch (error) {
      console.error('KV set error:', error)
      // Fallback to Cache API
      await this.set(key, value, ttlSeconds)
    }
  }

  async deleteFromKV(key: string): Promise<void> {
    try {
      const { ctx } = getRequestInfo<AppContext>()
      if (!ctx.env.CACHE) {
        await this.delete(key)
        return
      }

      await ctx.env.CACHE.delete(key)
    } catch (error) {
      console.error('KV delete error:', error)
      await this.delete(key)
    }
  }

  // Isochrone-specific cache methods with hybrid storage
  async getIsochroneCache(cacheKey: IsochroneCacheKey): Promise<any | null> {
    const key = this.generateIsochroneKey(
      `${cacheKey.latitude}_${cacheKey.longitude}`,
      cacheKey.travelTimeMinutes,
      cacheKey.travelMode
    )
    return await this.getHybrid(key)
  }

  async setIsochroneCache(
    cacheKey: IsochroneCacheKey,
    value: any,
    ttlSeconds: number = this.ISOCHRONE_TTL
  ): Promise<void> {
    const key = this.generateIsochroneKey(
      `${cacheKey.latitude}_${cacheKey.longitude}`,
      cacheKey.travelTimeMinutes,
      cacheKey.travelMode
    )
    await this.setHybrid(key, value, ttlSeconds)
  }

  // Matrix-specific cache methods with hybrid storage
  async getMatrixCache(cacheKey: MatrixCacheKey): Promise<any | null> {
    const key = this.generateMatrixKey(cacheKey)
    return await this.getHybrid(key)
  }

  async setMatrixCache(
    cacheKey: MatrixCacheKey,
    value: any,
    ttlSeconds: number = this.MATRIX_TTL
  ): Promise<void> {
    const key = this.generateMatrixKey(cacheKey)
    await this.setHybrid(key, value, ttlSeconds)
  }

  // Geocoding-specific cache methods with hybrid storage
  async getGeocodingCache(address: string): Promise<Coordinate | null> {
    const key = this.generateGeocodingKey(address)
    return await this.getHybrid(key)
  }

  async setGeocodingCache(
    address: string,
    coordinate: Coordinate,
    ttlSeconds: number = this.GEOCODING_TTL
  ): Promise<void> {
    const key = this.generateGeocodingKey(address)
    await this.setHybrid(key, coordinate, ttlSeconds)
  }

  // Cache statistics (placeholder - would need persistent storage for real stats)
  async getCacheStats(): Promise<CacheStats> {
    // In a real implementation, these would be tracked in KV or another persistent store
    return {
      isochroneHits: 0,
      isochroneMisses: 0,
      matrixHits: 0,
      matrixMisses: 0,
      geocodingHits: 0,
      geocodingMisses: 0,
    }
  }

  // Utility methods for generating cache keys
  static generateIsochroneKey(
    pointId: string,
    travelTimeMinutes: number,
    travelMode: string
  ): string {
    return `isochrone:${pointId}:${travelTimeMinutes}:${travelMode}`
  }

  private generateIsochroneKey(
    pointId: string,
    travelTimeMinutes: number,
    travelMode: string
  ): string {
    return CacheService.generateIsochroneKey(
      pointId,
      travelTimeMinutes,
      travelMode
    )
  }

  static generateGeocodingKey(address: string): string {
    return `geocoding:${encodeURIComponent(address.toLowerCase())}`
  }

  private generateGeocodingKey(address: string): string {
    return CacheService.generateGeocodingKey(address)
  }

  static generateOptimalLocationKey(
    locations: any[],
    travelMode: string,
    optimizationGoal: string
  ): string {
    const locationHash = btoa(JSON.stringify(locations)).slice(0, 16)
    return `optimal:${locationHash}:${travelMode}:${optimizationGoal}`
  }

  private generateMatrixKey(cacheKey: MatrixCacheKey): string {
    // Create a deterministic hash of the matrix request
    const originHash = btoa(
      JSON.stringify(cacheKey.origins.map((o) => [o.latitude, o.longitude]))
    ).slice(0, 8)
    const destHash = btoa(
      JSON.stringify(
        cacheKey.destinations.map((d) => [d.latitude, d.longitude])
      )
    ).slice(0, 8)
    return `matrix:${originHash}:${destHash}:${cacheKey.travelMode}:${cacheKey.precision}`
  }

  // Hybrid caching methods - use both Cache API and KV for optimal performance
  async getHybrid<T>(key: string): Promise<T | null> {
    // Try Cache API first (faster)
    const cacheResult = await this.get<T>(key)
    if (cacheResult !== null) {
      return cacheResult
    }

    // Fallback to KV (persistent)
    const kvResult = await this.getFromKV<T>(key)
    if (kvResult !== null) {
      // Populate Cache API for future requests
      await this.set(key, kvResult, 3600) // 1 hour cache
      return kvResult
    }

    return null
  }

  async setHybrid<T>(
    key: string,
    value: T,
    ttlSeconds: number = 3600
  ): Promise<void> {
    // Set in both Cache API (fast) and KV (persistent)
    await Promise.all([
      this.set(key, value, ttlSeconds),
      this.setInKV(key, value, ttlSeconds),
    ])
  }

  async deleteHybrid(key: string): Promise<void> {
    // Delete from both Cache API and KV
    await Promise.all([this.delete(key), this.deleteFromKV(key)])
  }
  private roundToPrecision(coordinate: number, precision: number): number {
    // Round coordinate to specified precision in meters
    // This is a simplified implementation - real precision would use proper geographic calculations
    const factor = precision / 111000 // Rough conversion: 1 degree ≈ 111km
    return Math.round(coordinate / factor) * factor
  }

  // Check if two coordinates are within precision threshold
  private isWithinPrecision(
    coord1: Coordinate,
    coord2: Coordinate,
    precision: number
  ): boolean {
    const latDiff = Math.abs(coord1.latitude - coord2.latitude)
    const lngDiff = Math.abs(coord1.longitude - coord2.longitude)
    const factor = precision / 111000 // Rough conversion
    return latDiff <= factor && lngDiff <= factor
  }

  // Location precision helpers
  private roundToPrecision(coordinate: number, precision: number): number {
    // Round coordinate to specified precision in meters
    // This is a simplified implementation - real precision would use proper geographic calculations
    const factor = precision / 111000 // Rough conversion: 1 degree ≈ 111km
    return Math.round(coordinate / factor) * factor
  }

  // Check if two coordinates are within precision threshold
  private isWithinPrecision(
    coord1: Coordinate,
    coord2: Coordinate,
    precision: number
  ): boolean {
    const latDiff = Math.abs(coord1.latitude - coord2.latitude)
    const lngDiff = Math.abs(coord1.longitude - coord2.longitude)
    const factor = precision / 111000 // Rough conversion
    return latDiff <= factor && lngDiff <= factor
  }
}

// Export a singleton instance
export const cache = new CacheService()
