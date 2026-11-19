#!/usr/bin/env tsx
/**
 * Export data from RedwoodJS SQLite database for migration to D1
 * Usage: yarn rw exec export-data
 */

import { writeFileSync } from 'fs'
import { join } from 'path'

import { db } from 'api/src/lib/db'

interface ExportedData {
  locations: any[]
  isochroneCache: any[]
  matrixCache: any[]
  geocodingCache: any[]
  exportedAt: string
  version: string
}

async function exportData() {
  console.log('🚀 Starting data export from RedwoodJS SQLite database...')

  try {
    // Check if tables exist and have data
    const locations = await db.location
      .findMany({
        orderBy: { createdAt: 'asc' },
      })
      .catch(() => {
        console.log('⚠️  Locations table not found or empty')
        return []
      })

    const isochroneCache = await db.isochroneCache
      .findMany({
        orderBy: { createdAt: 'asc' },
      })
      .catch(() => {
        console.log('⚠️  Isochrone cache table not found or empty')
        return []
      })

    const matrixCache = await db.matrixCache
      .findMany({
        orderBy: { createdAt: 'asc' },
      })
      .catch(() => {
        console.log('⚠️  Matrix cache table not found or empty')
        return []
      })

    const geocodingCache = await db.geocodingCache
      .findMany({
        orderBy: { createdAt: 'asc' },
      })
      .catch(() => {
        console.log('⚠️  Geocoding cache table not found or empty')
        return []
      })

    const exportData: ExportedData = {
      locations,
      isochroneCache,
      matrixCache,
      geocodingCache,
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
    }

    // Write to JSON file
    const exportPath = join(process.cwd(), 'data-export.json')
    writeFileSync(exportPath, JSON.stringify(exportData, null, 2))

    console.log('✅ Data export completed successfully!')
    console.log(`📊 Export summary:`)
    console.log(`   - Locations: ${locations.length}`)
    console.log(`   - Isochrone cache entries: ${isochroneCache.length}`)
    console.log(`   - Matrix cache entries: ${matrixCache.length}`)
    console.log(`   - Geocoding cache entries: ${geocodingCache.length}`)
    console.log(`📁 Exported to: ${exportPath}`)

    // Also create SQL dump for manual inspection
    const sqlDumpPath = join(process.cwd(), 'data-export.sql')
    let sqlDump = `-- Data export from RedwoodJS SQLite database\n-- Generated at: ${new Date().toISOString()}\n\n`

    if (locations.length > 0) {
      sqlDump += `-- Locations (${locations.length} records)\n`
      for (const location of locations) {
        sqlDump += `INSERT INTO locations (id, name, address, latitude, longitude, created_at, updated_at) VALUES (\n`
        sqlDump += `  '${location.id}',\n`
        sqlDump += `  '${location.name.replace(/'/g, "''")}',\n`
        sqlDump += `  '${location.address.replace(/'/g, "''")}',\n`
        sqlDump += `  ${location.latitude},\n`
        sqlDump += `  ${location.longitude},\n`
        sqlDump += `  '${location.createdAt.toISOString()}',\n`
        sqlDump += `  '${location.updatedAt.toISOString()}'\n`
        sqlDump += `);\n`
      }
      sqlDump += `\n`
    }

    if (isochroneCache.length > 0) {
      sqlDump += `-- Isochrone cache (${isochroneCache.length} records)\n`
      for (const cache of isochroneCache) {
        sqlDump += `INSERT INTO isochrone_cache (id, point_id, travel_time_minutes, travel_mode, geojson, created_at, expires_at) VALUES (\n`
        sqlDump += `  '${cache.id}',\n`
        sqlDump += `  '${cache.pointId}',\n`
        sqlDump += `  ${cache.travelTimeMinutes},\n`
        sqlDump += `  '${cache.travelMode}',\n`
        sqlDump += `  '${cache.geojson.replace(/'/g, "''")}',\n`
        sqlDump += `  '${cache.createdAt.toISOString()}',\n`
        sqlDump += `  '${cache.expiresAt.toISOString()}'\n`
        sqlDump += `);\n`
      }
      sqlDump += `\n`
    }

    if (matrixCache.length > 0) {
      sqlDump += `-- Matrix cache (${matrixCache.length} records)\n`
      for (const cache of matrixCache) {
        sqlDump += `INSERT INTO matrix_cache (id, origins_hash, destinations_hash, travel_mode, matrix_data, created_at, expires_at) VALUES (\n`
        sqlDump += `  '${cache.id}',\n`
        sqlDump += `  '${cache.originsHash}',\n`
        sqlDump += `  '${cache.destinationsHash}',\n`
        sqlDump += `  '${cache.travelMode}',\n`
        sqlDump += `  '${cache.matrixData.replace(/'/g, "''")}',\n`
        sqlDump += `  '${cache.createdAt.toISOString()}',\n`
        sqlDump += `  '${cache.expiresAt.toISOString()}'\n`
        sqlDump += `);\n`
      }
      sqlDump += `\n`
    }

    if (geocodingCache.length > 0) {
      sqlDump += `-- Geocoding cache (${geocodingCache.length} records)\n`
      for (const cache of geocodingCache) {
        sqlDump += `INSERT INTO geocoding_cache (id, address, latitude, longitude, created_at, expires_at) VALUES (\n`
        sqlDump += `  '${cache.id}',\n`
        sqlDump += `  '${cache.address.replace(/'/g, "''")}',\n`
        sqlDump += `  ${cache.latitude},\n`
        sqlDump += `  ${cache.longitude},\n`
        sqlDump += `  '${cache.createdAt.toISOString()}',\n`
        sqlDump += `  '${cache.expiresAt.toISOString()}'\n`
        sqlDump += `);\n`
      }
    }

    writeFileSync(sqlDumpPath, sqlDump)
    console.log(`📁 SQL dump created: ${sqlDumpPath}`)
  } catch (error) {
    console.error('❌ Error during data export:', error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

// Run the export
exportData().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
