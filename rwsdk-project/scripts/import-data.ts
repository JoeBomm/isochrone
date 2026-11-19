#!/usr/bin/env tsx
/**
 * Import data from RedwoodJS export to D1 database
 * Usage: npm run import-data
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

interface ExportedData {
  locations: Array<{
    id: string
    name: string
    address: string
    latitude: number
    longitude: number
    createdAt: string
    updatedAt: string
  }>
  isochroneCache: Array<{
    id: string
    pointId: string
    travelTimeMinutes: number
    travelMode: string
    geojson: string
    createdAt: string
    expiresAt: string
  }>
  matrixCache: Array<{
    id: string
    originsHash: string
    destinationsHash: string
    travelMode: string
    matrixData: string
    createdAt: string
    expiresAt: string
  }>
  geocodingCache: Array<{
    id: string
    address: string
    latitude: number
    longitude: number
    createdAt: string
    expiresAt: string
  }>
  exportedAt: string
  version: string
}

// Mock D1 database interface for development
interface D1Database {
  prepare(query: string): {
    bind(...values: any[]): {
      run(): Promise<{ success: boolean; meta: { changes: number } }>
      first(): Promise<any>
      all(): Promise<{ results: any[] }>
    }
  }
}

// This would be replaced with actual D1 database in production
const mockDb: D1Database = {
  prepare(query: string) {
    return {
      bind(...values: any[]) {
        return {
          async run() {
            console.log(`🔄 Executing: ${query}`)
            console.log(`   Values: ${JSON.stringify(values)}`)
            return { success: true, meta: { changes: 1 } }
          },
          async first() {
            console.log(`🔍 Query: ${query}`)
            console.log(`   Values: ${JSON.stringify(values)}`)
            return null
          },
          async all() {
            console.log(`📋 Query: ${query}`)
            console.log(`   Values: ${JSON.stringify(values)}`)
            return { results: [] }
          },
        }
      },
    }
  },
}

async function importData(db: D1Database) {
  console.log('🚀 Starting data import to D1 database...')

  // Look for export file
  const exportPath = join(process.cwd(), '..', 'data-export.json')

  if (!existsSync(exportPath)) {
    console.error(`❌ Export file not found: ${exportPath}`)
    console.log(
      '💡 Please run "yarn rw exec export-data" in the RedwoodJS project first'
    )
    process.exit(1)
  }

  try {
    const exportDataRaw = readFileSync(exportPath, 'utf-8')
    const exportData: ExportedData = JSON.parse(exportDataRaw)

    console.log(`📊 Import data summary:`)
    console.log(`   - Export version: ${exportData.version}`)
    console.log(`   - Exported at: ${exportData.exportedAt}`)
    console.log(`   - Locations: ${exportData.locations.length}`)
    console.log(
      `   - Isochrone cache entries: ${exportData.isochroneCache.length}`
    )
    console.log(`   - Matrix cache entries: ${exportData.matrixCache.length}`)
    console.log(
      `   - Geocoding cache entries: ${exportData.geocodingCache.length}`
    )

    let totalImported = 0

    // Import locations
    if (exportData.locations.length > 0) {
      console.log(`\n📍 Importing ${exportData.locations.length} locations...`)
      for (const location of exportData.locations) {
        await db
          .prepare(
            `
          INSERT INTO locations (id, name, address, latitude, longitude, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
          )
          .bind(
            location.id,
            location.name,
            location.address,
            location.latitude,
            location.longitude,
            location.createdAt,
            location.updatedAt
          )
          .run()
        totalImported++
      }
      console.log(`✅ Imported ${exportData.locations.length} locations`)
    }

    // Import isochrone cache (only non-expired entries)
    const validIsochroneCache = exportData.isochroneCache.filter(
      (cache) => new Date(cache.expiresAt) > new Date()
    )

    if (validIsochroneCache.length > 0) {
      console.log(
        `\n🗺️  Importing ${validIsochroneCache.length} valid isochrone cache entries...`
      )
      for (const cache of validIsochroneCache) {
        await db
          .prepare(
            `
          INSERT INTO isochrone_cache (id, point_id, travel_time_minutes, travel_mode, geojson, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
          )
          .bind(
            cache.id,
            cache.pointId,
            cache.travelTimeMinutes,
            cache.travelMode,
            cache.geojson,
            cache.createdAt,
            cache.expiresAt
          )
          .run()
        totalImported++
      }
      console.log(
        `✅ Imported ${validIsochroneCache.length} isochrone cache entries`
      )

      const expiredCount =
        exportData.isochroneCache.length - validIsochroneCache.length
      if (expiredCount > 0) {
        console.log(
          `⚠️  Skipped ${expiredCount} expired isochrone cache entries`
        )
      }
    }

    // Import matrix cache (only non-expired entries)
    const validMatrixCache = exportData.matrixCache.filter(
      (cache) => new Date(cache.expiresAt) > new Date()
    )

    if (validMatrixCache.length > 0) {
      console.log(
        `\n🔢 Importing ${validMatrixCache.length} valid matrix cache entries...`
      )
      for (const cache of validMatrixCache) {
        await db
          .prepare(
            `
          INSERT INTO matrix_cache (id, origins_hash, destinations_hash, travel_mode, matrix_data, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
          )
          .bind(
            cache.id,
            cache.originsHash,
            cache.destinationsHash,
            cache.travelMode,
            cache.matrixData,
            cache.createdAt,
            cache.expiresAt
          )
          .run()
        totalImported++
      }
      console.log(`✅ Imported ${validMatrixCache.length} matrix cache entries`)

      const expiredCount =
        exportData.matrixCache.length - validMatrixCache.length
      if (expiredCount > 0) {
        console.log(`⚠️  Skipped ${expiredCount} expired matrix cache entries`)
      }
    }

    // Import geocoding cache (only non-expired entries)
    const validGeocodingCache = exportData.geocodingCache.filter(
      (cache) => new Date(cache.expiresAt) > new Date()
    )

    if (validGeocodingCache.length > 0) {
      console.log(
        `\n🌍 Importing ${validGeocodingCache.length} valid geocoding cache entries...`
      )
      for (const cache of validGeocodingCache) {
        await db
          .prepare(
            `
          INSERT INTO geocoding_cache (id, address, latitude, longitude, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `
          )
          .bind(
            cache.id,
            cache.address,
            cache.latitude,
            cache.longitude,
            cache.createdAt,
            cache.expiresAt
          )
          .run()
        totalImported++
      }
      console.log(
        `✅ Imported ${validGeocodingCache.length} geocoding cache entries`
      )

      const expiredCount =
        exportData.geocodingCache.length - validGeocodingCache.length
      if (expiredCount > 0) {
        console.log(
          `⚠️  Skipped ${expiredCount} expired geocoding cache entries`
        )
      }
    }

    console.log(`\n🎉 Data import completed successfully!`)
    console.log(`📊 Total records imported: ${totalImported}`)
  } catch (error) {
    console.error('❌ Error during data import:', error)
    process.exit(1)
  }
}

// Validation function to check data integrity
async function validateImport(db: D1Database) {
  console.log('\n🔍 Validating imported data...')

  try {
    const locationCount = await db
      .prepare('SELECT COUNT(*) as count FROM locations')
      .bind()
      .first()
    const isochroneCount = await db
      .prepare(
        'SELECT COUNT(*) as count FROM isochrone_cache WHERE expires_at > datetime("now")'
      )
      .bind()
      .first()
    const matrixCount = await db
      .prepare(
        'SELECT COUNT(*) as count FROM matrix_cache WHERE expires_at > datetime("now")'
      )
      .bind()
      .first()
    const geocodingCount = await db
      .prepare(
        'SELECT COUNT(*) as count FROM geocoding_cache WHERE expires_at > datetime("now")'
      )
      .bind()
      .first()

    console.log('📊 Validation results:')
    console.log(`   - Locations: ${locationCount?.count || 0}`)
    console.log(`   - Active isochrone cache: ${isochroneCount?.count || 0}`)
    console.log(`   - Active matrix cache: ${matrixCount?.count || 0}`)
    console.log(`   - Active geocoding cache: ${geocodingCount?.count || 0}`)

    console.log('✅ Data validation completed')
  } catch (error) {
    console.error('❌ Error during validation:', error)
  }
}

// Main execution
async function main() {
  // In production, this would be the actual D1 database instance
  // For now, using mock for demonstration
  const db = mockDb

  await importData(db)
  await validateImport(db)
}

// Run the import
main().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
