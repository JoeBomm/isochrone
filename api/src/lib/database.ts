// Database service that provides Prisma-compatible interface for future D1 migration
// This service can be used to gradually replace direct Prisma calls

import type {
  Location,
  IsochroneCache,
  MatrixCache,
  GeocodingCache,
} from '@prisma/client'

import { db } from './db'

// Types that match the Prisma models
export interface LocationInput {
  name: string
  address: string
  latitude: number
  longitude: number
}

export interface LocationCreateInput extends LocationInput {}

export interface LocationUpdateInput extends Partial<LocationInput> {}

export interface IsochroneCacheCreateInput {
  pointId: string
  travelTimeMinutes: number
  travelMode: string
  geojson: string
  expiresAt: Date
}

export interface MatrixCacheCreateInput {
  originsHash: string
  destinationsHash: string
  travelMode: string
  matrixData: string
  expiresAt: Date
}

export interface GeocodingCacheCreateInput {
  address: string
  latitude: number
  longitude: number
  expiresAt: Date
}

// Database service that provides both Prisma and D1-compatible methods
export class DatabaseService {
  // Location operations (Prisma-compatible)
  async createLocation(data: LocationCreateInput): Promise<Location> {
    const location = await db.location.create({
      data: {
        name: data.name,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
      },
    })
    return location
  }

  async findLocationById(id: string): Promise<Location | null> {
    return await db.location.findUnique({
      where: { id },
    })
  }

  async findManyLocations(): Promise<Location[]> {
    return await db.location.findMany({
      orderBy: { createdAt: 'desc' },
    })
  }

  async updateLocation(
    id: string,
    data: LocationUpdateInput
  ): Promise<Location> {
    return await db.location.update({
      where: { id },
      data,
    })
  }

  async deleteLocation(id: string): Promise<Location> {
    return await db.location.delete({
      where: { id },
    })
  }

  // Isochrone cache operations
  async createIsochroneCache(
    data: IsochroneCacheCreateInput
  ): Promise<IsochroneCache> {
    return await db.isochroneCache.create({
      data: {
        pointId: data.pointId,
        travelTimeMinutes: data.travelTimeMinutes,
        travelMode: data.travelMode,
        geojson: data.geojson,
        expiresAt: data.expiresAt,
      },
    })
  }

  async findIsochroneCache(
    pointId: string,
    travelTimeMinutes: number,
    travelMode: string
  ): Promise<IsochroneCache | null> {
    return await db.isochroneCache.findFirst({
      where: {
        pointId,
        travelTimeMinutes,
        travelMode,
        expiresAt: {
          gt: new Date(),
        },
      },
    })
  }

  async findManyIsochroneCache(pointId?: string): Promise<IsochroneCache[]> {
    return await db.isochroneCache.findMany({
      where: pointId ? { pointId } : undefined,
      orderBy: { createdAt: 'desc' },
    })
  }

  // Matrix cache operations
  async createMatrixCache(data: MatrixCacheCreateInput): Promise<MatrixCache> {
    return await db.matrixCache.create({
      data: {
        originsHash: data.originsHash,
        destinationsHash: data.destinationsHash,
        travelMode: data.travelMode,
        matrixData: data.matrixData,
        expiresAt: data.expiresAt,
      },
    })
  }

  async findMatrixCache(
    originsHash: string,
    destinationsHash: string,
    travelMode: string
  ): Promise<MatrixCache | null> {
    return await db.matrixCache.findFirst({
      where: {
        originsHash,
        destinationsHash,
        travelMode,
        expiresAt: {
          gt: new Date(),
        },
      },
    })
  }

  // Geocoding cache operations
  async createGeocodingCache(
    data: GeocodingCacheCreateInput
  ): Promise<GeocodingCache> {
    return await db.geocodingCache.upsert({
      where: { address: data.address },
      update: {
        latitude: data.latitude,
        longitude: data.longitude,
        expiresAt: data.expiresAt,
      },
      create: {
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        expiresAt: data.expiresAt,
      },
    })
  }

  async findGeocodingCache(address: string): Promise<GeocodingCache | null> {
    return await db.geocodingCache.findFirst({
      where: {
        address: address.toLowerCase().trim(),
        expiresAt: {
          gt: new Date(),
        },
      },
    })
  }

  // Cache management operations
  async cleanupExpiredCache(): Promise<void> {
    const now = new Date()

    await Promise.all([
      db.isochroneCache.deleteMany({
        where: {
          expiresAt: {
            lte: now,
          },
        },
      }),
      db.matrixCache.deleteMany({
        where: {
          expiresAt: {
            lte: now,
          },
        },
      }),
      db.geocodingCache.deleteMany({
        where: {
          expiresAt: {
            lte: now,
          },
        },
      }),
    ])
  }

  async getCacheStats(): Promise<{
    isochroneCount: number
    matrixCount: number
    geocodingCount: number
    locationCount: number
  }> {
    const now = new Date()

    const [isochroneCount, matrixCount, geocodingCount, locationCount] =
      await Promise.all([
        db.isochroneCache.count({
          where: {
            expiresAt: {
              gt: now,
            },
          },
        }),
        db.matrixCache.count({
          where: {
            expiresAt: {
              gt: now,
            },
          },
        }),
        db.geocodingCache.count({
          where: {
            expiresAt: {
              gt: now,
            },
          },
        }),
        db.location.count(),
      ])

    return {
      isochroneCount,
      matrixCount,
      geocodingCount,
      locationCount,
    }
  }

  async clearAllCache(): Promise<void> {
    await Promise.all([
      db.isochroneCache.deleteMany(),
      db.matrixCache.deleteMany(),
      db.geocodingCache.deleteMany(),
    ])
  }

  // Utility methods for hash generation (compatible with D1 version)
  generateCoordinateHash(
    coordinates: Array<{ latitude: number; longitude: number }>
  ): string {
    const sortedCoords = coordinates
      .map(
        (coord) => `${coord.latitude.toFixed(6)},${coord.longitude.toFixed(6)}`
      )
      .sort()
      .join('|')

    // Simple hash function for coordinate arrays
    let hash = 0
    for (let i = 0; i < sortedCoords.length; i++) {
      const char = sortedCoords.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(36)
  }

  // D1-compatible methods for future migration
  async saveLocation(location: LocationInput): Promise<string> {
    const result = await this.createLocation(location)
    return result.id
  }

  async getLocation(id: string): Promise<LocationInput | null> {
    const location = await this.findLocationById(id)
    if (!location) return null

    return {
      name: location.name,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
    }
  }

  async getAllLocations(): Promise<(LocationInput & { id: string })[]> {
    const locations = await this.findManyLocations()
    return locations.map((location) => ({
      id: location.id,
      name: location.name,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
    }))
  }

  async getCachedIsochrone(
    pointId: string,
    travelTimeMinutes: number,
    travelMode: string
  ): Promise<any | null> {
    const cache = await this.findIsochroneCache(
      pointId,
      travelTimeMinutes,
      travelMode
    )
    return cache ? JSON.parse(cache.geojson) : null
  }

  async setCachedIsochrone(
    pointId: string,
    travelTimeMinutes: number,
    travelMode: string,
    geojson: any,
    ttlHours: number = 24
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)

    await this.createIsochroneCache({
      pointId,
      travelTimeMinutes,
      travelMode,
      geojson: JSON.stringify(geojson),
      expiresAt,
    })
  }

  async getCachedMatrix(
    originsHash: string,
    destinationsHash: string,
    travelMode: string
  ): Promise<any | null> {
    const cache = await this.findMatrixCache(
      originsHash,
      destinationsHash,
      travelMode
    )
    return cache ? JSON.parse(cache.matrixData) : null
  }

  async setCachedMatrix(
    originsHash: string,
    destinationsHash: string,
    travelMode: string,
    matrixData: any,
    ttlHours: number = 24
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)

    await this.createMatrixCache({
      originsHash,
      destinationsHash,
      travelMode,
      matrixData: JSON.stringify(matrixData),
      expiresAt,
    })
  }

  async getCachedGeocode(
    address: string
  ): Promise<{ latitude: number; longitude: number } | null> {
    const cache = await this.findGeocodingCache(address)
    return cache
      ? {
          latitude: cache.latitude,
          longitude: cache.longitude,
        }
      : null
  }

  async setCachedGeocode(
    address: string,
    latitude: number,
    longitude: number,
    ttlHours: number = 168 // 7 days
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)

    await this.createGeocodingCache({
      address: address.toLowerCase().trim(),
      latitude,
      longitude,
      expiresAt,
    })
  }
}

// Export a singleton instance
export const databaseService = new DatabaseService()
