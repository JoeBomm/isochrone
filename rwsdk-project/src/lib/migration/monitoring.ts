/**
 * Migration Monitoring and Metrics
 *
 * This module provides comprehensive monitoring for the migration process,
 * including performance metrics, error tracking, and health checks.
 *
 * Requirements: 8.2 - Monitor migration progress and performance
 */

import type { MigrationMetrics } from './adapters'

// Health check status
export interface HealthStatus {
  service: 'redwoodjs' | 'redwoodsdk'
  status: 'healthy' | 'degraded' | 'unhealthy'
  responseTime: number
  lastCheck: string
  error?: string
}

// Migration dashboard data
export interface MigrationDashboard {
  timestamp: string
  rolloutPercentage: number
  totalRequests: number
  redwoodjsRequests: number
  redwoodsdkRequests: number
  successRates: {
    redwoodjs: number
    redwoodsdk: number
  }
  averageResponseTimes: {
    redwoodjs: number
    redwoodsdk: number
  }
  errorRates: {
    redwoodjs: number
    redwoodsdk: number
  }
  healthStatus: {
    redwoodjs: HealthStatus
    redwoodsdk: HealthStatus
  }
  recentErrors: Array<{
    timestamp: string
    service: 'redwoodjs' | 'redwoodsdk'
    endpoint: string
    error: string
  }>
}

// Alert configuration
export interface AlertConfig {
  errorRateThreshold: number // Percentage
  responseTimeThreshold: number // Milliseconds
  successRateThreshold: number // Percentage
  enabled: boolean
}

// Default alert configuration
export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  errorRateThreshold: 5, // Alert if error rate > 5%
  responseTimeThreshold: 5000, // Alert if response time > 5s
  successRateThreshold: 95, // Alert if success rate < 95%
  enabled: true,
}

// Migration monitoring service
export class MigrationMonitor {
  private metrics: MigrationMetrics[] = []
  private healthChecks: Map<string, HealthStatus> = new Map()
  private alertConfig: AlertConfig
  private alertCallbacks: Array<(alert: MigrationAlert) => void> = []

  constructor(alertConfig: Partial<AlertConfig> = {}) {
    this.alertConfig = { ...DEFAULT_ALERT_CONFIG, ...alertConfig }
  }

  /**
   * Record a migration metric
   */
  recordMetric(metric: MigrationMetrics): void {
    this.metrics.push(metric)

    // Keep only last 10,000 metrics to prevent memory leaks
    if (this.metrics.length > 10000) {
      this.metrics = this.metrics.slice(-10000)
    }

    // Check for alerts
    this.checkAlerts(metric)
  }

  /**
   * Record health check result
   */
  recordHealthCheck(service: 'redwoodjs' | 'redwoodsdk', status: HealthStatus): void {
    this.healthChecks.set(service, status)
  }

  /**
   * Get current dashboard data
   */
  getDashboard(timeWindowMinutes: number = 60): MigrationDashboard {
    const cutoffTime = Date.now() - (timeWindowMinutes * 60 * 1000)
    const recentMetrics = this.metrics.filter(m => m.startTime >= cutoffTime)

    const redwoodjsMetrics = recentMetrics.filter(m => m.implementation === 'redwoodjs')
    const redwoodsdkMetrics = recentMetrics.filter(m => m.implementation === 'redwoodsdk')

    const redwoodjsSuccessful = redwoodjsMetrics.filter(m => m.success)
    const redwoodsdkSuccessful = redwoodsdkMetrics.filter(m => m.success)

    const recentErrors = recentMetrics
      .filter(m => !m.success)
      .slice(-10) // Last 10 errors
      .map(m => ({
        timestamp: new Date(m.startTime).toISOString(),
        service: m.implementation,
        endpoint: m.endpoint,
        error: m.error || 'Unknown error',
      }))

    return {
      timestamp: new Date().toISOString(),
      rolloutPercentage: 0, // Will be set by caller
      totalRequests: recentMetrics.length,
      redwoodjsRequests: redwoodjsMetrics.length,
      redwoodsdkRequests: redwoodsdkMetrics.length,
      successRates: {
        redwoodjs: redwoodjsMetrics.length > 0
          ? (redwoodjsSuccessful.length / redwoodjsMetrics.length) * 100
          : 100,
        redwoodsdk: redwoodsdkMetrics.length > 0
          ? (redwoodsdkSuccessful.length / redwoodsdkMetrics.length) * 100
          : 100,
      },
      averageResponseTimes: {
        redwoodjs: redwoodjsMetrics.length > 0
          ? redwoodjsMetrics.reduce((sum, m) => sum + m.duration, 0) / redwoodjsMetrics.length
          : 0,
        redwoodsdk: redwoodsdkMetrics.length > 0
          ? redwoodsdkMetrics.reduce((sum, m) => sum + m.duration, 0) / redwoodsdkMetrics.length
          : 0,
      },
      errorRates: {
        redwoodjs: redwoodjsMetrics.length > 0
          ? ((redwoodjsMetrics.length - redwoodjsSuccessful.length) / redwoodjsMetrics.length) * 100
          : 0,
        redwoodsdk: redwoodsdkMetrics.length > 0
          ? ((redwoodsdkMetrics.length - redwoodsdkSuccessful.length) / redwoodsdkMetrics.length) * 100
          : 0,
      },
      healthStatus: {
        redwoodjs: this.healthChecks.get('redwoodjs') || {
          service: 'redwoodjs',
          status: 'unhealthy',
          responseTime: 0,
          lastCheck: new Date().toISOString(),
          error: 'No health check data',
        },
        redwoodsdk: this.healthChecks.get('redwoodsdk') || {
          service: 'redwoodsdk',
          status: 'unhealthy',
          responseTime: 0,
          lastCheck: new Date().toISOString(),
          error: 'No health check data',
        },
      },
      recentErrors,
    }
  }

  /**
   * Get performance comparison
   */
  getPerformanceComparison(timeWindowMinutes: number = 60): {
    redwoodjs: { avgResponseTime: number; successRate: number; requestCount: number }
    redwoodsdk: { avgResponseTime: number; successRate: number; requestCount: number }
    improvement: { responseTime: number; successRate: number } // Positive = RedwoodSDK better
  } {
    const cutoffTime = Date.now() - (timeWindowMinutes * 60 * 1000)
    const recentMetrics = this.metrics.filter(m => m.startTime >= cutoffTime)

    const redwoodjsMetrics = recentMetrics.filter(m => m.implementation === 'redwoodjs')
    const redwoodsdkMetrics = recentMetrics.filter(m => m.implementation === 'redwoodsdk')

    const redwoodjsStats = {
      avgResponseTime: redwoodjsMetrics.length > 0
        ? redwoodjsMetrics.reduce((sum, m) => sum + m.duration, 0) / redwoodjsMetrics.length
        : 0,
      successRate: redwoodjsMetrics.length > 0
        ? (redwoodjsMetrics.filter(m => m.success).length / redwoodjsMetrics.length) * 100
        : 100,
      requestCount: redwoodjsMetrics.length,
    }

    const redwoodsdkStats = {
      avgResponseTime: redwoodsdkMetrics.length > 0
        ? redwoodsdkMetrics.reduce((sum, m) => sum + m.duration, 0) / redwoodsdkMetrics.length
        : 0,
      successRate: redwoodsdkMetrics.length > 0
        ? (redwoodsdkMetrics.filter(m => m.success).length / redwoodsdkMetrics.length) * 100
        : 100,
      requestCount: redwoodsdkMetrics.length,
    }

    return {
      redwoodjs: redwoodjsStats,
      redwoodsdk: redwoodsdkStats,
      improvement: {
        responseTime: redwoodjsStats.avgResponseTime - redwoodsdkStats.avgResponseTime,
        successRate: redwoodsdkStats.successRate - redwoodjsStats.successRate,
      },
    }
  }

  /**
   * Perform health checks
   */
  async performHealthChecks(
    redwoodjsUrl: string = 'http://localhost:8911',
    redwoodsdkUrl: string = 'http://localhost:8787'
  ): Promise<void> {
    // Check RedwoodJS health
    try {
      const startTime = Date.now()
      const response = await fetch(`${redwoodjsUrl}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: '{ __typename }',
        }),
      })
      const endTime = Date.now()

      this.recordHealthCheck('redwoodjs', {
        service: 'redwoodjs',
        status: response.ok ? 'healthy' : 'degraded',
        responseTime: endTime - startTime,
        lastCheck: new Date().toISOString(),
        error: response.ok ? undefined : `HTTP ${response.status}`,
      })
    } catch (error) {
      this.recordHealthCheck('redwoodjs', {
        service: 'redwoodjs',
        status: 'unhealthy',
        responseTime: 0,
        lastCheck: new Date().toISOString(),
        error: error.message,
      })
    }

    // Check RedwoodSDK health
    try {
      const startTime = Date.now()
      const response = await fetch(`${redwoodsdkUrl}/health`)
      const endTime = Date.now()

      this.recordHealthCheck('redwoodsdk', {
        service: 'redwoodsdk',
        status: response.ok ? 'healthy' : 'degraded',
        responseTime: endTime - startTime,
        lastCheck: new Date().toISOString(),
        error: response.ok ? undefined : `HTTP ${response.status}`,
      })
    } catch (error) {
      this.recordHealthCheck('redwoodsdk', {
        service: 'redwoodsdk',
        status: 'unhealthy',
        responseTime: 0,
        lastCheck: new Date().toISOString(),
        error: error.message,
      })
    }
  }

  /**
   * Check for alert conditions
   */
  private checkAlerts(metric: MigrationMetrics): void {
    if (!this.alertConfig.enabled) return

    const alerts: MigrationAlert[] = []

    // Check response time threshold
    if (metric.duration > this.alertConfig.responseTimeThreshold) {
      alerts.push({
        type: 'high_response_time',
        severity: 'warning',
        service: metric.implementation,
        endpoint: metric.endpoint,
        message: `High response time: ${metric.duration}ms (threshold: ${this.alertConfig.responseTimeThreshold}ms)`,
        timestamp: new Date().toISOString(),
        metric,
      })
    }

    // Check for errors
    if (!metric.success) {
      alerts.push({
        type: 'request_error',
        severity: 'error',
        service: metric.implementation,
        endpoint: metric.endpoint,
        message: `Request failed: ${metric.error}`,
        timestamp: new Date().toISOString(),
        metric,
      })
    }

    // Check error rate (last 100 requests for this service)
    const recentMetrics = this.metrics
      .filter(m => m.implementation === metric.implementation)
      .slice(-100)

    if (recentMetrics.length >= 10) {
      const errorRate = (recentMetrics.filter(m => !m.success).length / recentMetrics.length) * 100

      if (errorRate > this.alertConfig.errorRateThreshold) {
        alerts.push({
          type: 'high_error_rate',
          severity: 'critical',
          service: metric.implementation,
          endpoint: 'all',
          message: `High error rate: ${errorRate.toFixed(1)}% (threshold: ${this.alertConfig.errorRateThreshold}%)`,
          timestamp: new Date().toISOString(),
          metric,
        })
      }
    }

    // Trigger alerts
    alerts.forEach(alert => {
      this.alertCallbacks.forEach(callback => {
        try {
          callback(alert)
        } catch (error) {
          console.error('Error in alert callback:', error)
        }
      })
    })
  }

  /**
   * Subscribe to alerts
   */
  onAlert(callback: (alert: MigrationAlert) => void): () => void {
    this.alertCallbacks.push(callback)

    return () => {
      const index = this.alertCallbacks.indexOf(callback)
      if (index > -1) {
        this.alertCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Update alert configuration
   */
  updateAlertConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config }
  }

  /**
   * Clear metrics (for testing or memory management)
   */
  clearMetrics(): void {
    this.metrics = []
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = 'requestId,endpoint,implementation,startTime,endTime,duration,success,error,responseSize'
      const rows = this.metrics.map(m =>
        `${m.requestId},${m.endpoint},${m.implementation},${m.startTime},${m.endTime},${m.duration},${m.success},${m.error || ''},${m.responseSize || ''}`
      )
      return [headers, ...rows].join('\n')
    }

    return JSON.stringify(this.metrics, null, 2)
  }
}

// Alert types
export interface MigrationAlert {
  type: 'high_response_time' | 'request_error' | 'high_error_rate' | 'service_unhealthy'
  severity: 'info' | 'warning' | 'error' | 'critical'
  service: 'redwoodjs' | 'redwoodsdk'
  endpoint: string
  message: string
  timestamp: string
  metric?: MigrationMetrics
}

// Console alert handler
export function consoleAlertHandler(alert: MigrationAlert): void {
  const prefix = `[MIGRATION ALERT - ${alert.severity.toUpperCase()}]`
  const message = `${prefix} ${alert.service}/${alert.endpoint}: ${alert.message}`

  switch (alert.severity) {
    case 'critical':
    case 'error':
      console.error(message)
      break
    case 'warning':
      console.warn(message)
      break
    default:
      console.log(message)
  }
}

// Webhook alert handler
export function createWebhookAlertHandler(webhookUrl: string) {
  return async (alert: MigrationAlert): Promise<void> => {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: `Migration Alert: ${alert.message}`,
          alert,
        }),
      })
    } catch (error) {
      console.error('Failed to send webhook alert:', error)
    }
  }
}

// Global monitor instance
let globalMonitor: MigrationMonitor | null = null

/**
 * Get or create global migration monitor
 */
export function getMigrationMonitor(alertConfig?: Partial<AlertConfig>): MigrationMonitor {
  if (!globalMonitor) {
    globalMonitor = new MigrationMonitor(alertConfig)

    // Set up default console alert handler
    globalMonitor.onAlert(consoleAlertHandler)
  }

  return globalMonitor
}

/**
 * Reset global monitor (for testing)
 */
export function resetMigrationMonitor(): void {
  globalMonitor = null
}

// Export convenience functions
export const monitor = {
  record: (metric: MigrationMetrics) => getMigrationMonitor().recordMetric(metric),
  dashboard: (timeWindow?: number) => getMigrationMonitor().getDashboard(timeWindow),
  comparison: (timeWindow?: number) => getMigrationMonitor().getPerformanceComparison(timeWindow),
  health: (redwoodjsUrl?: string, redwoodsdkUrl?: string) => getMigrationMonitor().performHealthChecks(redwoodjsUrl, redwoodsdkUrl),
  export: (format?: 'json' | 'csv') => getMigrationMonitor().exportMetrics(format),
}
