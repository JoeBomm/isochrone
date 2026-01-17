import { createClient } from 'redis'
import { GeoJSON } from 'geojson'
import type { TravelMode, TravelTimeMatrix } from 'types/graphql'

export interface Coordinate {
  latitude: number
  longitude: number
}

export interface IsochroneParams {
  travelTimeMinutes: number
  travelMode: 'driving-car' | 'cycling-regular' | 'foot-walking'
}

export interface IsochroneCacheKey {
  latitude: number
  longitude: number
  travelTimeMinutes: number
  travelMode: 'driving-car' | 'cycling-regular' | 'foot-walking'
  precision: number // meters for location matching
}

export interface MatrixCacheKey {
  origins: Coordinate[]
  destinations: Coordinate[]
  travelMode: TravelMode
  precision: number // meters for location matching
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

export interface CacheService {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl?: number): Promise<void>
  del(key: string): Promise<void>
  clear(): Promise<void>
}

export interface IsochroneCacheService extends CacheService {
  getIsochroneCache(key: IsochroneCacheKey): Promise<GeoJSON.Polygon | null>
  setIsochroneCache(key: IsochroneCacheKey, polygon: GeoJSON.Polygon, ttl?: number): Promise<void>
  getMatrixCache(key: MatrixCacheKey): Promise<TravelTimeMatrix | null>
  setMatrixCache(key: MatrixCacheKey, matrix: TravelTimeMatrix, ttl?: number): Promise<void>
  getGeocodingCache(address: string): Promise<Coordinate | null>
  setGeocodingCache(address: string, coordinate: Coordinate, ttl?: number): Promise<void>
  getCacheStats(): Promise<CacheStats>
  generateIsochroneCacheKey(coordinate: Coordinate, params: IsochroneParams, precision?: number): string
  generateMatrixCacheKey(origins: Coordinate[], destinations: Coordinate[], travelMode: TravelMode, precision?: number): string
}

class InMemoryCache implements IsochroneCacheService {
  private cache = new Map<string, { value: string; expires?: number }>()
  private stats: CacheStats = {
    isochroneHits: 0,
    isochroneMisses: 0,
    matrixHits: 0,
    matrixMisses: 0,
    geocodingHits: 0,
    geocodingMisses: 0,
    totalEntries: 0
  }

  async get(key: string): Promise<string | null> {
    const item = this.cache.get(key)
    if (!item) return null

    if (item.expires && Date.now() > item.expires) {
      this.cache.delete(key)
      this.stats.totalEntries = Math.max(0, this.stats.totalEntries - 1)
      return null
    }

    return item.value
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const expires = ttl ? Date.now() + ttl * 1000 : undefined
    const isNewKey = !this.cache.has(key)
    this.cache.set(key, { value, expires })

    if (isNewKey) {
      this.stats.totalEntries++
    }
  }

  async del(key: string): Promise<void> {
    if (this.cache.delete(key)) {
      this.stats.totalEntries = Math.max(0, this.stats.totalEntries - 1)
    }
  }

  async clear(): Promise<void> {
    this.cache.clear()
    this.stats = {
      isochroneHits: 0,
      isochroneMisses: 0,
      matrixHits: 0,
      matrixMisses: 0,
      geocodingHits: 0,
      geocodingMisses: 0,
      totalEntries: 0
    }
  }

  generateIsochroneCacheKey(coordinate: Coordinate, params: IsochroneParams, precision: number = 100): string {
    // Round coordinates to precision for cache matching
    // 111000 meters per degree latitude (approximate)
    const latRounded = Math.round(coordinate.latitude * (111000 / precision)) / (111000 / precision)
    const lngRounded = Math.round(coordinate.longitude * (111000 / precision)) / (111000 / precision)

    return `isochrone:${latRounded}:${lngRounded}:${params.travelTimeMinutes}:${params.travelMode}`
  }

  async getIsochroneCache(key: IsochroneCacheKey): Promise<GeoJSON.Polygon | null> {
    const cacheKey = this.generateIsochroneCacheKey(
      { latitude: key.latitude, longitude: key.longitude },
      { travelTimeMinutes: key.travelTimeMinutes, travelMode: key.travelMode },
      key.precision
    )

    const result = await this.get(cacheKey)
    if (result) {
      this.stats.isochroneHits++
      return JSON.parse(result) as GeoJSON.Polygon
    } else {
      this.stats.isochroneMisses++
      return null
    }
  }

  async setIsochroneCache(key: IsochroneCacheKey, polygon: GeoJSON.Polygon, ttl: number = 24 * 60 * 60): Promise<void> {
    const cacheKey = this.generateIsochroneCacheKey(
      { latitude: key.latitude, longitude: key.longitude },
      { travelTimeMinutes: key.travelTimeMinutes, travelMode: key.travelMode },
      key.precision
    )

    await this.set(cacheKey, JSON.stringify(polygon), ttl)
  }

  async getGeocodingCache(address: string): Promise<Coordinate | null> {
    const cacheKey = `geocoding:${address.toLowerCase().trim()}`
    const result = await this.get(cacheKey)

    if (result) {
      this.stats.geocodingHits++
      return JSON.parse(result) as Coordinate
    } else {
      this.stats.geocodingMisses++
      return null
    }
  }

  async setGeocodingCache(address: string, coordinate: Coordinate, ttl: number = 7 * 24 * 60 * 60): Promise<void> {
    const cacheKey = `geocoding:${address.toLowerCase().trim()}`
    await this.set(cacheKey, JSON.stringify(coordinate), ttl)
  }

  async getCacheStats(): Promise<CacheStats> {
    return { ...this.stats }
  }

  generateMatrixCacheKey(origins: Coordinate[], destinations: Coordinate[], travelMode: TravelMode, precision: number = 100): string {
    const roundCoordinate = (coord: Coordinate) => ({
      lat: Math.round(coord.latitude * (111000 / precision)) / (111000 / precision),
      lng: Math.round(coord.longitude * (111000 / precision)) / (111000 / precision)
    })

    const originsKey = origins.map(roundCoordinate).sort((a, b) => a.lat - b.lat || a.lng - b.lng).map(c => `${c.lat}:${c.lng}`).join(',')
    const destinationsKey = destinations.map(roundCoordinate).sort((a, b) => a.lat - b.lat || a.lng - b.lng).map(c => `${c.lat}:${c.lng}`).join(',')

    return `matrix:${originsKey}:${destinationsKey}:${travelMode}`
  }

  async getMatrixCache(key: MatrixCacheKey): Promise<TravelTimeMatrix | null> {
    const cacheKey = this.generateMatrixCacheKey(key.origins, key.destinations, key.travelMode, key.precision)
    const result = await this.get(cacheKey)

    if (result) {
      this.stats.matrixHits++
      return JSON.parse(result) as TravelTimeMatrix
    } else {
      this.stats.matrixMisses++
      return null
    }
  }

  async setMatrixCache(key: MatrixCacheKey, matrix: TravelTimeMatrix, ttl: number = 24 * 60 * 60): Promise<void> {
    const cacheKey = this.generateMatrixCacheKey(key.origins, key.destinations, key.travelMode, key.precision)
    await this.set(cacheKey, JSON.stringify(matrix), ttl)
  }
}

class RedisCache implements IsochroneCacheService {
  private client: ReturnType<typeof createClient>
  private stats: CacheStats = {
    isochroneHits: 0,
    isochroneMisses: 0,
    matrixHits: 0,
    matrixMisses: 0,
    geocodingHits: 0,
    geocodingMisses: 0,
    totalEntries: 0
  }

  constructor(url: string) {
    this.client = createClient({ url })
    this.client.on('error', (err) => console.error('Redis Client Error', err))
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect()
    }
  }

  async get(key: string): Promise<string | null> {
    await this.connect()
    return await this.client.get(key)
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    await this.connect()
    if (ttl) {
      await this.client.setEx(key, ttl, value)
    } else {
      await this.client.set(key, value)
    }
  }

  async del(key: string): Promise<void> {
    await this.connect()
    await this.client.del(key)
  }

  async clear(): Promise<void> {
    await this.connect()
    await this.client.flushAll()
    this.stats = {
      isochroneHits: 0,
      isochroneMisses: 0,
      matrixHits: 0,
      matrixMisses: 0,
      geocodingHits: 0,
      geocodingMisses: 0,
      totalEntries: 0
    }
  }

  generateIsochroneCacheKey(coordinate: Coordinate, params: IsochroneParams, precision: number = 100): string {
    // Round coordinates to precision for cache matching
    // 111000 meters per degree latitude (approximate)
    const latRounded = Math.round(coordinate.latitude * (111000 / precision)) / (111000 / precision)
    const lngRounded = Math.round(coordinate.longitude * (111000 / precision)) / (111000 / precision)

    return `isochrone:${latRounded}:${lngRounded}:${params.travelTimeMinutes}:${params.travelMode}`
  }

  async getIsochroneCache(key: IsochroneCacheKey): Promise<GeoJSON.Polygon | null> {
    const cacheKey = this.generateIsochroneCacheKey(
      { latitude: key.latitude, longitude: key.longitude },
      { travelTimeMinutes: key.travelTimeMinutes, travelMode: key.travelMode },
      key.precision
    )

    const result = await this.get(cacheKey)
    if (result) {
      this.stats.isochroneHits++
      return JSON.parse(result) as GeoJSON.Polygon
    } else {
      this.stats.isochroneMisses++
      return null
    }
  }

  async setIsochroneCache(key: IsochroneCacheKey, polygon: GeoJSON.Polygon, ttl: number = 24 * 60 * 60): Promise<void> {
    const cacheKey = this.generateIsochroneCacheKey(
      { latitude: key.latitude, longitude: key.longitude },
      { travelTimeMinutes: key.travelTimeMinutes, travelMode: key.travelMode },
      key.precision
    )

    await this.set(cacheKey, JSON.stringify(polygon), ttl)
  }

  async getGeocodingCache(address: string): Promise<Coordinate | null> {
    const cacheKey = `geocoding:${address.toLowerCase().trim()}`
    const result = await this.get(cacheKey)

    if (result) {
      this.stats.geocodingHits++
      return JSON.parse(result) as Coordinate
    } else {
      this.stats.geocodingMisses++
      return null
    }
  }

  async setGeocodingCache(address: string, coordinate: Coordinate, ttl: number = 7 * 24 * 60 * 60): Promise<void> {
    const cacheKey = `geocoding:${address.toLowerCase().trim()}`
    await this.set(cacheKey, JSON.stringify(coordinate), ttl)
  }

  generateMatrixCacheKey(origins: Coordinate[], destinations: Coordinate[], travelMode: TravelMode, precision: number = 100): string {
    const roundCoordinate = (coord: Coordinate) => ({
      lat: Math.round(coord.latitude * (111000 / precision)) / (111000 / precision),
      lng: Math.round(coord.longitude * (111000 / precision)) / (111000 / precision)
    })

    const originsKey = origins.map(roundCoordinate).sort((a, b) => a.lat - b.lat || a.lng - b.lng).map(c => `${c.lat}:${c.lng}`).join(',')
    const destinationsKey = destinations.map(roundCoordinate).sort((a, b) => a.lat - b.lat || a.lng - b.lng).map(c => `${c.lat}:${c.lng}`).join(',')

    return `matrix:${originsKey}:${destinationsKey}:${travelMode}`
  }

  async getMatrixCache(key: MatrixCacheKey): Promise<TravelTimeMatrix | null> {
    const cacheKey = this.generateMatrixCacheKey(key.origins, key.destinations, key.travelMode, key.precision)
    const result = await this.get(cacheKey)

    if (result) {
      this.stats.matrixHits++
      return JSON.parse(result) as TravelTimeMatrix
    } else {
      this.stats.matrixMisses++
      return null
    }
  }

  async setMatrixCache(key: MatrixCacheKey, matrix: TravelTimeMatrix, ttl: number = 24 * 60 * 60): Promise<void> {
    const cacheKey = this.generateMatrixCacheKey(key.origins, key.destinations, key.travelMode, key.precision)
    await this.set(cacheKey, JSON.stringify(matrix), ttl)
  }

  async getCacheStats(): Promise<CacheStats> {
    return { ...this.stats }
  }
}

// Create cache instance based on environment
export const cache: IsochroneCacheService = process.env.REDIS_URL
  ? new RedisCache(process.env.REDIS_URL)
  : new InMemoryCache()