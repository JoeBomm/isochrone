/**
 * Feature Flag Management for Migration
 *
 * This module provides runtime configuration for migration feature flags,
 * allowing safe progressive rollout of RedwoodSDK features.
 *
 * Requirements: 8.2 - Implement feature flags for progressive rollout
 */

import type { MigrationFeatureFlags } from './adapters'

// Environment-based feature flag configuration
export interface EnvironmentConfig {
  development: MigrationFeatureFlags
  staging: MigrationFeatureFlags
  production: MigrationFeatureFlags
}

// Default configurations per environment
export const ENVIRONMENT_CONFIGS: EnvironmentConfig = {
  development: {
    useRedwoodSDK: true,
    enableGraphQLFallback: true,
    enablePerformanceComparison: true,
    logMigrationMetrics: true,
    rolloutPercentage: 100, // Full rollout in development
  },
  staging: {
    useRedwoodSDK: true,
    enableGraphQLFallback: true,
    enablePerformanceComparison: true,
    logMigrationMetrics: true,
    rolloutPercentage: 50, // 50% rollout in staging
  },
  production: {
    useRedwoodSDK: false,
    enableGraphQLFallback: true,
    enablePerformanceComparison: false, // Disable in prod to reduce overhead
    logMigrationMetrics: true,
    rolloutPercentage: 0, // Start with 0% in production
  },
}

// Feature flag manager with runtime updates
export class FeatureFlagManager {
  private currentFlags: MigrationFeatureFlags
  private environment: string
  private listeners: Array<(flags: MigrationFeatureFlags) => void> = []

  constructor(environment: string = 'development') {
    this.environment = environment
    this.currentFlags = this.getEnvironmentConfig(environment)
  }

  /**
   * Get configuration for specific environment
   */
  private getEnvironmentConfig(env: string): MigrationFeatureFlags {
    const config = ENVIRONMENT_CONFIGS[env as keyof EnvironmentConfig]
    if (!config) {
      console.warn(`Unknown environment: ${env}, using development config`)
      return ENVIRONMENT_CONFIGS.development
    }
    return { ...config }
  }

  /**
   * Get current feature flags
   */
  getFlags(): MigrationFeatureFlags {
    return { ...this.currentFlags }
  }

  /**
   * Update specific feature flags
   */
  updateFlags(updates: Partial<MigrationFeatureFlags>): void {
    const previousFlags = { ...this.currentFlags }
    this.currentFlags = { ...this.currentFlags, ...updates }

    console.log('Feature flags updated:', {
      environment: this.environment,
      previous: previousFlags,
      current: this.currentFlags,
      changes: updates,
    })

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(this.currentFlags)
      } catch (error) {
        console.error('Error in feature flag listener:', error)
      }
    })
  }

  /**
   * Reset to environment defaults
   */
  resetToDefaults(): void {
    const defaults = this.getEnvironmentConfig(this.environment)
    this.updateFlags(defaults)
  }

  /**
   * Subscribe to flag changes
   */
  subscribe(listener: (flags: MigrationFeatureFlags) => void): () => void {
    this.listeners.push(listener)

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  /**
   * Gradual rollout helpers
   */
  enableGradualRollout(targetPercentage: number, stepSize: number = 10, intervalMs: number = 60000): void {
    if (targetPercentage < 0 || targetPercentage > 100) {
      throw new Error('Target percentage must be between 0 and 100')
    }

    if (stepSize <= 0 || stepSize > 100) {
      throw new Error('Step size must be between 1 and 100')
    }

    const currentPercentage = this.currentFlags.rolloutPercentage

    if (currentPercentage >= targetPercentage) {
      console.log(`Already at or above target rollout: ${currentPercentage}% >= ${targetPercentage}%`)
      return
    }

    console.log(`Starting gradual rollout from ${currentPercentage}% to ${targetPercentage}% in ${stepSize}% steps every ${intervalMs}ms`)

    const rolloutInterval = setInterval(() => {
      const current = this.currentFlags.rolloutPercentage
      const next = Math.min(current + stepSize, targetPercentage)

      this.updateFlags({ rolloutPercentage: next })

      if (next >= targetPercentage) {
        clearInterval(rolloutInterval)
        console.log(`Gradual rollout completed at ${next}%`)
      }
    }, intervalMs)
  }

  /**
   * Emergency rollback - immediately disable RedwoodSDK
   */
  emergencyRollback(): void {
    console.warn('EMERGENCY ROLLBACK: Disabling RedwoodSDK immediately')
    this.updateFlags({
      useRedwoodSDK: false,
      rolloutPercentage: 0,
    })
  }

  /**
   * Safe rollout presets
   */
  applyRolloutPreset(preset: 'canary' | 'beta' | 'stable' | 'full'): void {
    const presets = {
      canary: {
        useRedwoodSDK: true,
        enableGraphQLFallback: true,
        enablePerformanceComparison: true,
        rolloutPercentage: 1, // 1% rollout
      },
      beta: {
        useRedwoodSDK: true,
        enableGraphQLFallback: true,
        enablePerformanceComparison: true,
        rolloutPercentage: 10, // 10% rollout
      },
      stable: {
        useRedwoodSDK: true,
        enableGraphQLFallback: true,
        enablePerformanceComparison: false,
        rolloutPercentage: 50, // 50% rollout
      },
      full: {
        useRedwoodSDK: true,
        enableGraphQLFallback: false, // No fallback at full rollout
        enablePerformanceComparison: false,
        rolloutPercentage: 100, // 100% rollout
      },
    }

    const config = presets[preset]
    console.log(`Applying ${preset} rollout preset:`, config)
    this.updateFlags(config)
  }

  /**
   * Get rollout status
   */
  getRolloutStatus(): {
    environment: string
    enabled: boolean
    percentage: number
    fallbackEnabled: boolean
    metricsEnabled: boolean
  } {
    return {
      environment: this.environment,
      enabled: this.currentFlags.useRedwoodSDK,
      percentage: this.currentFlags.rolloutPercentage,
      fallbackEnabled: this.currentFlags.enableGraphQLFallback,
      metricsEnabled: this.currentFlags.logMigrationMetrics,
    }
  }
}

// Environment variable configuration loader
export function loadFeatureFlagsFromEnv(): Partial<MigrationFeatureFlags> {
  const flags: Partial<MigrationFeatureFlags> = {}

  // Check for environment variables
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.MIGRATION_USE_REDWOOD_SDK !== undefined) {
      flags.useRedwoodSDK = process.env.MIGRATION_USE_REDWOOD_SDK === 'true'
    }

    if (process.env.MIGRATION_ENABLE_FALLBACK !== undefined) {
      flags.enableGraphQLFallback = process.env.MIGRATION_ENABLE_FALLBACK === 'true'
    }

    if (process.env.MIGRATION_ENABLE_COMPARISON !== undefined) {
      flags.enablePerformanceComparison = process.env.MIGRATION_ENABLE_COMPARISON === 'true'
    }

    if (process.env.MIGRATION_LOG_METRICS !== undefined) {
      flags.logMigrationMetrics = process.env.MIGRATION_LOG_METRICS === 'true'
    }

    if (process.env.MIGRATION_ROLLOUT_PERCENTAGE !== undefined) {
      const percentage = parseInt(process.env.MIGRATION_ROLLOUT_PERCENTAGE, 10)
      if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
        flags.rolloutPercentage = percentage
      }
    }
  }

  return flags
}

// Cloudflare Workers environment variable loader
export function loadFeatureFlagsFromCloudflare(env: any): Partial<MigrationFeatureFlags> {
  const flags: Partial<MigrationFeatureFlags> = {}

  if (env.MIGRATION_USE_REDWOOD_SDK !== undefined) {
    flags.useRedwoodSDK = env.MIGRATION_USE_REDWOOD_SDK === 'true'
  }

  if (env.MIGRATION_ENABLE_FALLBACK !== undefined) {
    flags.enableGraphQLFallback = env.MIGRATION_ENABLE_FALLBACK === 'true'
  }

  if (env.MIGRATION_ENABLE_COMPARISON !== undefined) {
    flags.enablePerformanceComparison = env.MIGRATION_ENABLE_COMPARISON === 'true'
  }

  if (env.MIGRATION_LOG_METRICS !== undefined) {
    flags.logMigrationMetrics = env.MIGRATION_LOG_METRICS === 'true'
  }

  if (env.MIGRATION_ROLLOUT_PERCENTAGE !== undefined) {
    const percentage = parseInt(env.MIGRATION_ROLLOUT_PERCENTAGE, 10)
    if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
      flags.rolloutPercentage = percentage
    }
  }

  return flags
}

// Global feature flag manager instance
let globalFeatureFlagManager: FeatureFlagManager | null = null

/**
 * Get or create global feature flag manager
 */
export function getFeatureFlagManager(environment?: string): FeatureFlagManager {
  if (!globalFeatureFlagManager) {
    const env = environment || process.env.NODE_ENV || 'development'
    globalFeatureFlagManager = new FeatureFlagManager(env)

    // Load environment overrides
    const envFlags = loadFeatureFlagsFromEnv()
    if (Object.keys(envFlags).length > 0) {
      globalFeatureFlagManager.updateFlags(envFlags)
    }
  }

  return globalFeatureFlagManager
}

/**
 * Reset global feature flag manager (for testing)
 */
export function resetFeatureFlagManager(): void {
  globalFeatureFlagManager = null
}

// Export convenience functions
export const featureFlags = {
  get: () => getFeatureFlagManager().getFlags(),
  update: (flags: Partial<MigrationFeatureFlags>) => getFeatureFlagManager().updateFlags(flags),
  reset: () => getFeatureFlagManager().resetToDefaults(),
  rollout: (preset: 'canary' | 'beta' | 'stable' | 'full') => getFeatureFlagManager().applyRolloutPreset(preset),
  emergency: () => getFeatureFlagManager().emergencyRollback(),
  status: () => getFeatureFlagManager().getRolloutStatus(),
}
