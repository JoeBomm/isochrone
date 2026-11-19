/**
 * Migration Adapters and Utilities
 *
 * This module provides a complete migration system for transitioning
 * from RedwoodJS GraphQL API to RedwoodSDK server functions.
 *
 * Requirements: 8.2 - Build compatibility layers for gradual migration
 */

// Core adapter classes and interfaces
export {
  MigrationAdapter,
  UnifiedMigrationAdapter,
  RedwoodJSGraphQLAdapter,
  RedwoodSDKServerFunctionAdapter,
  migrationAdapter,
  type GraphQLAdapter,
  type MigrationFeatureFlags,
  type MigrationMetrics,
  DEFAULT_FEATURE_FLAGS,
} from './adapters'

// Feature flag management
export {
  FeatureFlagManager,
  getFeatureFlagManager,
  resetFeatureFlagManager,
  featureFlags,
  loadFeatureFlagsFromEnv,
  loadFeatureFlagsFromCloudflare,
  ENVIRONMENT_CONFIGS,
  type EnvironmentConfig,
} from './featureFlags'

// Monitoring and metrics
export {
  MigrationMonitor,
  getMigrationMonitor,
  resetMigrationMonitor,
  monitor,
  consoleAlertHandler,
  createWebhookAlertHandler,
  type MigrationDashboard,
  type HealthStatus,
  type AlertConfig,
  type MigrationAlert,
  DEFAULT_ALERT_CONFIG,
} from './monitoring'

// Convenience function to set up complete migration system
export function setupMigrationSystem(options: {
  environment?: string
  featureFlags?: Partial<MigrationFeatureFlags>
  alertConfig?: Partial<AlertConfig>
  redwoodjsUrl?: string
  redwoodsdkUrl?: string
  webhookUrl?: string
} = {}) {
  const {
    environment = 'development',
    featureFlags: flagOverrides = {},
    alertConfig = {},
    redwoodjsUrl,
    redwoodsdkUrl,
    webhookUrl,
  } = options

  // Initialize feature flag manager
  const flagManager = getFeatureFlagManager(environment)
  if (Object.keys(flagOverrides).length > 0) {
    flagManager.updateFlags(flagOverrides)
  }

  // Initialize monitoring
  const monitor = getMigrationMonitor(alertConfig)

  // Set up webhook alerts if provided
  if (webhookUrl) {
    monitor.onAlert(createWebhookAlertHandler(webhookUrl))
  }

  // Initialize unified adapter
  const adapter = new UnifiedMigrationAdapter(
    flagManager.getFlags(),
    redwoodjsUrl,
    redwoodsdkUrl
  )

  // Sync feature flags with adapter
  flagManager.subscribe((flags) => {
    adapter.updateFeatureFlags(flags)
  })

  // Start health checks (every 5 minutes)
  const healthCheckInterval = setInterval(() => {
    monitor.performHealthChecks(redwoodjsUrl, redwoodsdkUrl)
  }, 5 * 60 * 1000)

  // Initial health check
  monitor.performHealthChecks(redwoodjsUrl, redwoodsdkUrl)

  return {
    adapter,
    flagManager,
    monitor,
    cleanup: () => {
      clearInterval(healthCheckInterval)
    },
  }
}

// Migration status checker
export function getMigrationStatus() {
  const flagManager = getFeatureFlagManager()
  const monitor = getMigrationMonitor()

  return {
    featureFlags: flagManager.getRolloutStatus(),
    dashboard: monitor.getDashboard(),
    performance: monitor.getPerformanceComparison(),
  }
}

// Emergency controls
export const emergencyControls = {
  rollback: () => {
    console.warn('EMERGENCY ROLLBACK INITIATED')
    getFeatureFlagManager().emergencyRollback()
  },

  enableCanary: () => {
    console.log('Enabling canary rollout (1%)')
    getFeatureFlagManager().applyRolloutPreset('canary')
  },

  enableBeta: () => {
    console.log('Enabling beta rollout (10%)')
    getFeatureFlagManager().applyRolloutPreset('beta')
  },

  enableStable: () => {
    console.log('Enabling stable rollout (50%)')
    getFeatureFlagManager().applyRolloutPreset('stable')
  },

  enableFull: () => {
    console.log('Enabling full rollout (100%)')
    getFeatureFlagManager().applyRolloutPreset('full')
  },
}

// Export types for external use
export type {
  LocationInput,
  TravelMode,
  OptimizationGoal,
  OptimalLocationResult,
  GeoJSONPolygon,
  IsochroneResult,
} from '../types'
