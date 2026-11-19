import { getRequestInfo } from '@redwoodjs/sdk/worker'

import type { AppContext } from '../../worker'
import type { LocationInput } from '../server/isochrones'

// Types for database operations
export interface Location {
  id: string
  name: string
  address: string
  latitude: number
  longitude: number
  createdAt: string
  updatedAt: string
}

export interface IsochroneCache {
  id: string
  pointId: string
  travelTimeMinutes: number
  travelMode: string
  geojson: string
  createdAt: string
  expiresAt: string
}

export interface MatrixCache {
  id: string
  originsHash: string
  destinationsHash: string
  travelMode: string
  matrixData: string
  createdAt: string
  expiresAt: string
}

export interface GeocodingCache {
  id: string
  address: string
  latitude: number
  longitude: number
  createdAt: string
  expiresAt: string
}

// Database service for D1 operations
export class DatabaseService {
  private get db() {
    const { ctx } = getRequestInfo<AppContext>()
    return ctx.env.DB
  }

  // Location operations
  async saveLocation(
    location: LocationInput & { name?: string }
  ): Promise<string> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await this.db
      .prepare(
        `
      INSERT INTO locations (id, name, address, latitude, longitude, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        id,
        location.name || location.address,
        location.address,
        location.latitude,
        location.longitude,
        now,
        now
      )
      .run()

    return id
  }

  async getLocation(id: string): Promise<Location | null> {
    const result = await this.db
      .prepare(
        `
      SELECT id, name, address, latitude, longitude, created_at, updated_at
      FROM locations WHERE id = ?
    `
      )
      .bind(id)
      .first()

    if (!result) return null

    return {
      id: result.id as string,
      name: result.name as string,
      address: result.address as string,
      latitude: result.latitude as number,
      longitude: result.longitude as number,
      createdAt: result.created_at as string,
      updatedAt: result.updated_at as string,
    }
  }

  async getAllLocations(): Promise<Location[]> {
    const results = await this.db
      .prepare(
        `
      SELECT id, name, address, latitude, longitude, created_at, updated_at
      FROM locations
      ORDER BY created_at DESC
    `
      )
      .all()

    return results.results.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      address: row.address as string,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }))
  }

  async updateLocation(
    id: string,
    updates: Partial<LocationInput & { name?: string }>
  ): Promise<void> {
    const now = new Date().toISOString()
    const setParts: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      setParts.push('name = ?')
      values.push(updates.name)
    }
    if (updates.address !== undefined) {
      setParts.push('address = ?')
      values.push(updates.address)
    }
    if (updates.latitude !== undefined) {
      setParts.push('latitude = ?')
      values.push(updates.latitude)
    }
    if (updates.longitude !== undefined) {
      setParts.push('longitude = ?')
      values.push(updates.longitude)
    }

    setParts.push('updated_at = ?')
    values.push(now)
    values.push(id)

    await this.db
      .prepare(`UPDATE locations SET ${setParts.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run()
  }

  async deleteLocation(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM locations WHERE id = ?').bind(id).run()
  }

  // Isochrone cache operations
  async getCachedIsochrone(
    pointId: string,
    travelTimeMinutes: number,
    travelMode: string
  ): Promise<any | null> {
    const result = await this.db
      .prepare(
        `
      SELECT geojson FROM isochrone_cache
      WHERE point_id = ? AND travel_time_minutes = ? AND travel_mode = ?
      AND expires_at > datetime('now')
    `
      )
      .bind(pointId, travelTimeMinutes, travelMode)
      .first()

    return result ? JSON.parse(result.geojson as string) : null
  }

  async setCachedIsochrone(
    pointId: string,
    travelTimeMinutes: number,
    travelMode: string,
    geojson: any,
    ttlHours: number = 24
  ): Promise<void> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const expiresAt = new Date(
      Date.now() + ttlHours * 60 * 60 * 1000
    ).toISOString()

    await this.db
      .prepare(
        `
      INSERT INTO isochrone_cache (id, point_id, travel_time_minutes, travel_mode, geojson, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        id,
        pointId,
        travelTimeMinutes,
        travelMode,
        JSON.stringify(geojson),
        now,
        expiresAt
      )
      .run()
  }

  async getAllCachedIsochrones(pointId?: string): Promise<IsochroneCache[]> {
    const query = pointId
      ? 'SELECT * FROM isochrone_cache WHERE point_id = ? ORDER BY created_at DESC'
      : 'SELECT * FROM isochrone_cache ORDER BY created_at DESC'

    const results = pointId
      ? await this.db.prepare(query).bind(pointId).all()
      : await this.db.prepare(query).all()

    return results.results.map((row) => ({
      id: row.id as string,
      pointId: row.point_id as string,
      travelTimeMinutes: row.travel_time_minutes as number,
      travelMode: row.travel_mode as string,
      geojson: row.geojson as string,
      createdAt: row.created_at as string,
      expiresAt: row.expires_at as string,
    }))
  }

  // Matrix cache operations
  async getCachedMatrix(
    originsHash: string,
    destinationsHash: string,
    travelMode: string
  ): Promise<any | null> {
    const result = await this.db
      .prepare(
        `
      SELECT matrix_data FROM matrix_cache
      WHERE origins_hash = ? AND destinations_hash = ? AND travel_mode = ?
      AND expires_at > datetime('now')
    `
      )
      .bind(originsHash, destinationsHash, travelMode)
      .first()

    return result ? JSON.parse(result.matrix_data as string) : null
  }

  async setCachedMatrix(
    originsHash: string,
    destinationsHash: string,
    travelMode: string,
    matrixData: any,
    ttlHours: number = 24
  ): Promise<void> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const expiresAt = new Date(
      Date.now() + ttlHours * 60 * 60 * 1000
    ).toISOString()

    await this.db
      .prepare(
        `
      INSERT INTO matrix_cache (id, origins_hash, destinations_hash, travel_mode, matrix_data, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        id,
        originsHash,
        destinationsHash,
        travelMode,
        JSON.stringify(matrixData),
        now,
        expiresAt
      )
      .run()
  }

  // Geocoding cache operations
  async getCachedGeocode(
    address: string
  ): Promise<{ latitude: number; longitude: number } | null> {
    const result = await this.db
      .prepare(
        `
      SELECT latitude, longitude FROM geocoding_cache
      WHERE address = ? AND expires_at > datetime('now')
    `
      )
      .bind(address.toLowerCase().trim())
      .first()

    return result
      ? {
          latitude: result.latitude as number,
          longitude: result.longitude as number,
        }
      : null
  }

  async setCachedGeocode(
    address: string,
    latitude: number,
    longitude: number,
    ttlHours: number = 168 // 7 days
  ): Promise<void> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const expiresAt = new Date(
      Date.now() + ttlHours * 60 * 60 * 1000
    ).toISOString()

    await this.db
      .prepare(
        `
      INSERT OR REPLACE INTO geocoding_cache (id, address, latitude, longitude, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        id,
        address.toLowerCase().trim(),
        latitude,
        longitude,
        now,
        expiresAt
      )
      .run()
  }

  // Cache management operations
  async cleanupExpiredCache(): Promise<void> {
    const now = new Date().toISOString()

    // Clean up expired isochrone cache
    await this.db
      .prepare('DELETE FROM isochrone_cache WHERE expires_at <= ?')
      .bind(now)
      .run()

    // Clean up expired matrix cache
    await this.db
      .prepare('DELETE FROM matrix_cache WHERE expires_at <= ?')
      .bind(now)
      .run()

    // Clean up expired geocoding cache
    await this.db
      .prepare('DELETE FROM geocoding_cache WHERE expires_at <= ?')
      .bind(now)
      .run()
  }

  async getCacheStats(): Promise<{
    isochroneCount: number
    matrixCount: number
    geocodingCount: number
    locationCount: number
  }> {
    const [isochroneResult, matrixResult, geocodingResult, locationResult] =
      await Promise.all([
        this.db
          .prepare(
            'SELECT COUNT(*) as count FROM isochrone_cache WHERE expires_at > datetime("now")'
          )
          .first(),
        this.db
          .prepare(
            'SELECT COUNT(*) as count FROM matrix_cache WHERE expires_at > datetime("now")'
          )
          .first(),
        this.db
          .prepare(
            'SELECT COUNT(*) as count FROM geocoding_cache WHERE expires_at > datetime("now")'
          )
          .first(),
        this.db.prepare('SELECT COUNT(*) as count FROM locations').first(),
      ])

    return {
      isochroneCount: (isochroneResult?.count as number) || 0,
      matrixCount: (matrixResult?.count as number) || 0,
      geocodingCount: (geocodingResult?.count as number) || 0,
      locationCount: (locationResult?.count as number) || 0,
    }
  }

  async clearAllCache(): Promise<void> {
    await Promise.all([
      this.db.prepare('DELETE FROM isochrone_cache').run(),
      this.db.prepare('DELETE FROM matrix_cache').run(),
      this.db.prepare('DELETE FROM geocoding_cache').run(),
    ])
  }

  // Utility methods for hash generation
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
}

// Export a singleton instance
export const db = new DatabaseService()
