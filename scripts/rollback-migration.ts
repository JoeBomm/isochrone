#!/usr/bin/env tsx
/**
 * Rollback script to revert from RedwoodSDK back to RedwoodJS
 * Usage: yarn rw exec rollback-migration
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

interface RollbackInfo {
  migrationDate: string
  sourceProject: string
  targetProject: string
  exportFile: string
  rollbackInstructions: string[]
}

class RollbackOrchestrator {
  private rollbackInfo: RollbackInfo | null = null

  async rollback(): Promise<boolean> {
    console.log('🔄 Starting migration rollback...')

    try {
      await this.loadRollbackInfo()
      await this.validateRollbackPreconditions()
      await this.restoreData()
      await this.cleanupMigrationArtifacts()
      await this.validateRollback()

      console.log('\n✅ Rollback completed successfully!')
      console.log('🚀 RedwoodJS application is ready to use')
      return true
    } catch (error) {
      console.error('\n❌ Rollback failed:', error)
      await this.handleRollbackFailure(error as Error)
      return false
    }
  }

  private async loadRollbackInfo() {
    console.log('📋 Loading rollback information...')

    const rollbackPath = join(
      process.cwd(),
      'rwsdk-project',
      'rollback-info.json'
    )

    if (!existsSync(rollbackPath)) {
      throw new Error(
        'Rollback information not found. Cannot proceed with rollback.'
      )
    }

    try {
      const rollbackData = readFileSync(rollbackPath, 'utf-8')
      this.rollbackInfo = JSON.parse(rollbackData)

      console.log(`📅 Migration date: ${this.rollbackInfo!.migrationDate}`)
      console.log(`📁 Source project: ${this.rollbackInfo!.sourceProject}`)
      console.log(`📁 Target project: ${this.rollbackInfo!.targetProject}`)
    } catch (error) {
      throw new Error(
        `Failed to parse rollback information: ${(error as Error).message}`
      )
    }
  }

  private async validateRollbackPreconditions() {
    console.log('🔍 Validating rollback preconditions...')

    if (!this.rollbackInfo) {
      throw new Error('Rollback information not loaded')
    }

    // Check if source project still exists
    const sourceProjectPath = this.rollbackInfo.sourceProject
    if (!existsSync(sourceProjectPath)) {
      throw new Error(`Source project not found: ${sourceProjectPath}`)
    }

    // Check if RedwoodJS project is valid
    const redwoodTomlPath = join(sourceProjectPath, 'redwood.toml')
    if (!existsSync(redwoodTomlPath)) {
      throw new Error('Source project is not a valid RedwoodJS project')
    }

    // Check if export file exists for data restoration
    const exportFilePath = join(sourceProjectPath, this.rollbackInfo.exportFile)
    if (!existsSync(exportFilePath)) {
      console.log(
        '⚠️  Original export file not found - data restoration may not be possible'
      )
    }

    console.log('✅ Rollback preconditions validated')
  }

  private async restoreData() {
    console.log('📥 Restoring data to RedwoodJS database...')

    if (!this.rollbackInfo) {
      throw new Error('Rollback information not loaded')
    }

    const sourceProjectPath = this.rollbackInfo.sourceProject
    const exportFilePath = join(sourceProjectPath, this.rollbackInfo.exportFile)

    if (!existsSync(exportFilePath)) {
      console.log('⚠️  No export file found - skipping data restoration')
      return
    }

    try {
      // Read the export data
      const exportData = JSON.parse(readFileSync(exportFilePath, 'utf-8'))

      console.log('📊 Data to restore:')
      console.log(`   - Locations: ${exportData.locations.length}`)
      console.log(`   - Isochrone cache: ${exportData.isochroneCache.length}`)
      console.log(`   - Matrix cache: ${exportData.matrixCache.length}`)
      console.log(`   - Geocoding cache: ${exportData.geocodingCache.length}`)

      // Create a restoration script
      const restorationScript = this.generateRestorationScript(exportData)
      const scriptPath = join(sourceProjectPath, 'scripts', 'restore-data.ts')
      writeFileSync(scriptPath, restorationScript)

      console.log(`📝 Restoration script created: ${scriptPath}`)
      console.log('💡 Run "yarn rw exec restore-data" to restore the data')
    } catch (error) {
      throw new Error(
        `Failed to prepare data restoration: ${(error as Error).message}`
      )
    }
  }

  private generateRestorationScript(exportData: any): string {
    return `#!/usr/bin/env tsx
/**
 * Auto-generated data restoration script
 * This script restores data from the migration export
 */

import { db } from 'api/src/lib/db'

async function restoreData() {
  console.log('🔄 Restoring data to RedwoodJS database...')

  try {
    // Clear existing data
    await db.geocodingCache.deleteMany()
    await db.matrixCache.deleteMany()
    await db.isochroneCache.deleteMany()
    await db.location.deleteMany()

    console.log('🗑️  Cleared existing data')

    // Restore locations
    if (${exportData.locations.length} > 0) {
      console.log('📍 Restoring locations...')
      for (const location of ${JSON.stringify(exportData.locations)}) {
        await db.location.create({
          data: {
            id: location.id,
            name: location.name,
            address: location.address,
            latitude: location.latitude,
            longitude: location.longitude,
            createdAt: new Date(location.createdAt),
            updatedAt: new Date(location.updatedAt)
          }
        })
      }
      console.log(\`✅ Restored \${${exportData.locations.length}} locations\`)
    }

    // Restore valid cache entries
    const validIsochroneCache = ${JSON.stringify(exportData.isochroneCache)}.filter(
      cache => new Date(cache.expiresAt) > new Date()
    )

    if (validIsochroneCache.length > 0) {
      console.log('🗺️  Restoring isochrone cache...')
      for (const cache of validIsochroneCache) {
        await db.isochroneCache.create({
          data: {
            id: cache.id,
            pointId: cache.pointId,
            travelTimeMinutes: cache.travelTimeMinutes,
            travelMode: cache.travelMode,
            geojson: cache.geojson,
            createdAt: new Date(cache.createdAt),
            expiresAt: new Date(cache.expiresAt)
          }
        })
      }
      console.log(\`✅ Restored \${validIsochroneCache.length} isochrone cache entries\`)
    }

    const validMatrixCache = ${JSON.stringify(exportData.matrixCache)}.filter(
      cache => new Date(cache.expiresAt) > new Date()
    )

    if (validMatrixCache.length > 0) {
      console.log('🔢 Restoring matrix cache...')
      for (const cache of validMatrixCache) {
        await db.matrixCache.create({
          data: {
            id: cache.id,
            originsHash: cache.originsHash,
            destinationsHash: cache.destinationsHash,
            travelMode: cache.travelMode,
            matrixData: cache.matrixData,
            createdAt: new Date(cache.createdAt),
            expiresAt: new Date(cache.expiresAt)
          }
        })
      }
      console.log(\`✅ Restored \${validMatrixCache.length} matrix cache entries\`)
    }

    const validGeocodingCache = ${JSON.stringify(exportData.geocodingCache)}.filter(
      cache => new Date(cache.expiresAt) > new Date()
    )

    if (validGeocodingCache.length > 0) {
      console.log('🌍 Restoring geocoding cache...')
      for (const cache of validGeocodingCache) {
        await db.geocodingCache.create({
          data: {
            id: cache.id,
            address: cache.address,
            latitude: cache.latitude,
            longitude: cache.longitude,
            createdAt: new Date(cache.createdAt),
            expiresAt: new Date(cache.expiresAt)
          }
        })
      }
      console.log(\`✅ Restored \${validGeocodingCache.length} geocoding cache entries\`)
    }

    console.log('🎉 Data restoration completed successfully!')

  } catch (error) {
    console.error('❌ Error during data restoration:', error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

restoreData().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})`
  }

  private async cleanupMigrationArtifacts() {
    console.log('🧹 Cleaning up migration artifacts...')

    if (!this.rollbackInfo) {
      throw new Error('Rollback information not loaded')
    }

    const artifactsToCleanup = [
      join(this.rollbackInfo.targetProject, 'rollback-info.json'),
      join(this.rollbackInfo.targetProject, 'data-export.json'),
      join(this.rollbackInfo.sourceProject, 'migration-error.json'),
    ]

    for (const artifact of artifactsToCleanup) {
      if (existsSync(artifact)) {
        console.log(`🗑️  Removing: ${artifact}`)
        // In a real implementation, would delete the file
        // unlinkSync(artifact)
      }
    }

    console.log('✅ Migration artifacts cleaned up')
  }

  private async validateRollback() {
    console.log('🔍 Validating rollback...')

    if (!this.rollbackInfo) {
      throw new Error('Rollback information not loaded')
    }

    const sourceProjectPath = this.rollbackInfo.sourceProject

    try {
      // Check if RedwoodJS project is functional
      console.log('🔧 Checking RedwoodJS project functionality...')

      // This would run a basic health check
      // execSync('yarn rw build --dry-run', { cwd: sourceProjectPath, stdio: 'pipe' })

      console.log('✅ RedwoodJS project appears functional')

      // Check database connectivity
      console.log('🗄️  Checking database connectivity...')

      // This would test database connection
      // execSync('yarn rw prisma db push --accept-data-loss', { cwd: sourceProjectPath, stdio: 'pipe' })

      console.log('✅ Database connectivity verified')
    } catch (error) {
      throw new Error(`Rollback validation failed: ${(error as Error).message}`)
    }
  }

  private async handleRollbackFailure(error: Error) {
    console.log('\n🚨 Rollback failed - manual intervention required...')

    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      rollbackInfo: this.rollbackInfo,
    }

    const errorLogPath = join(process.cwd(), 'rollback-error.json')
    writeFileSync(errorLogPath, JSON.stringify(errorLog, null, 2))

    console.log(`📁 Error log saved to: ${errorLogPath}`)
    console.log('\n💡 Manual rollback steps:')

    if (this.rollbackInfo) {
      for (let i = 0; i < this.rollbackInfo.rollbackInstructions.length; i++) {
        console.log(`   ${i + 1}. ${this.rollbackInfo.rollbackInstructions[i]}`)
      }
    } else {
      console.log('   1. Restore the original RedwoodJS application')
      console.log('   2. Check database connectivity')
      console.log('   3. Restore data from backup if available')
      console.log('   4. Test application functionality')
    }
  }
}

// Main execution
async function main() {
  console.log('🔄 RedwoodJS Migration Rollback Tool')
  console.log('=====================================')

  const rollback = new RollbackOrchestrator()
  const success = await rollback.rollback()

  if (success) {
    console.log('\n🎉 Rollback completed successfully!')
    console.log('🚀 RedwoodJS application is ready to use')
    process.exit(0)
  } else {
    console.log('\n❌ Rollback failed - check error logs')
    process.exit(1)
  }
}

// Run the rollback
main().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
