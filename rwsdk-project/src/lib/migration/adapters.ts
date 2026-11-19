/**
 * Migration Adapters for RedwoodJS to RedwoodSDK Migration
 *
 * This module provides compatibility layers that allow gradual migration
 * from RedwoodJS GraphQL API to RedwoodSDK server functions.
 *
 * Requirements: 8.2 - Build compatibility layers for gradual migration
 */

import type {
  LocationInput,
  TravelMode,
  OptimizationGoal,
  OptimalLocationResult,
  GeoJSONPolygon,
  IsochroneResult
} from '../types'

// Feature flags for progressive rollout
export interface MigrationFeatureFlags {
  useRedwoodSDK: boolean
  enableGraphQLFallback: boolean
  enablePerformanceComparison: boolean
  logMigrationMetrics: boolean
  rolloutPercentage: number // 0-100
}

// Default feature flags - conservative rollout
export const DEFAULT_FEATURE_FLAGS: MigrationFeatureFlags = {
  useRedwoodSDK: false,
  enableGraphQLFallback: true,
  enablePerformanceComparison: true,
  logMigrationMetrics: true,
  rolloutPercentage: 0, // Start with 0% rollout
}

// Migration metrics for monitoring
export interface MigrationMetrics {
  requestId: string
  endpoint: string
  implementation: 'redwoodjs' | 'redwoodsdk'
  startTime: number
  endTime: number
  duration: number
  success: boolean
  error?: string
  responseSize?: number
}

// Migration adapter class
export class MigrationAdapter {
  private featureFlags: MigrationFeatureFlags
  private metrics: MigrationMetrics[] = []

  constructor(featureFlags: Partial<MigrationFeatureFlags> = {}) {
    this.featureFlags = { ...DEFAULT_FEATURE_FLAGS, ...featureFlags }
  }

  /**
   * Update feature flags at runtime
   */
  updateFeatureFlags(flags: Partial<MigrationFeatureFlags>): void {
    this.featureFlags = { ...this.featureFlags, ...flags }
    console.log('Migration feature flags updated:', this.featureFlags)
  }

  /**
   * Get current feature flags
   */
  getFeatureFlags(): MigrationFeatureFlags {
    return { ...this.featureFlags }
  }

  /**
   * Determine if request should use RedwoodSDK based on rollout percentage
   */
  shouldUseRedwoodSDK(requestId?: string): boolean {
    if (!this.featureFlags.useRedwoodSDK) {
      return false
    }

    // Use deterministic rollout based on request ID hash
    if (requestId && this.featureFlags.rolloutPercentage > 0) {
      const hash = this.hashString(requestId)
      const percentage = hash % 100
      return percentage < this.featureFlags.rolloutPercentage
    }

    return this.featureFlags.rolloutPercentage >= 100
  }

  /**
   * Simple hash function for deterministic rollout
   */
  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Log migration metrics
   */
  private logMetrics(metrics: MigrationMetrics): void {
    if (this.featureFlags.logMigrationMetrics) {
      this.metrics.push(metrics)
      console.log('Migration metrics:', {
        requestId: metrics.requestId,
        endpoint: metrics.endpoint,
        implementation: metrics.implementation,
        duration: metrics.duration,
        success: metrics.success,
        error: metrics.error,
      })

      // Keep only last 1000 metrics to prevent memory leaks
      if (this.metrics.length > 1000) {
        this.metrics = this.metrics.slice(-1000)
      }
    }
  }

  /**
   * Get aggregated metrics for monitoring
   */
  getMetrics(): {
    total: number
    redwoodjs: number
    redwoodsdk: number
    averageDuration: { redwoodjs: number; redwoodsdk: number }
    successRate: { redwoodjs: number; redwoodsdk: number }
  } {
    const redwoodjsMetrics = this.metrics.filter(m => m.implementation === 'redwoodjs')
    const redwoodsdkMetrics = this.metrics.filter(m => m.implementation === 'redwoodsdk')

    return {
      total: this.metrics.length,
      redwoodjs: redwoodjsMetrics.length,
      redwoodsdk: redwoodsdkMetrics.length,
      averageDuration: {
        redwoodjs: redwoodjsMetrics.length > 0
          ? redwoodjsMetrics.reduce((sum, m) => sum + m.duration, 0) / redwoodjsMetrics.length
          : 0,
        redwoodsdk: redwoodsdkMetrics.length > 0
          ? redwoodsdkMetrics.reduce((sum, m) => sum + m.duration, 0) / redwoodsdkMetrics.length
          : 0,
      },
      successRate: {
        redwoodjs: redwoodjsMetrics.length > 0
          ? redwoodjsMetrics.filter(m => m.success).length / redwoodjsMetrics.length
          : 0,
        redwoodsdk: redwoodsdkMetrics.length > 0
          ? redwoodsdkMetrics.filter(m => m.success).length / redwoodsdkMetrics.length
          : 0,
      },
    }
  }

  /**
   * Clear metrics (for testing or memory management)
   */
  clearMetrics(): void {
    this.metrics = []
  }
}

// GraphQL to Server Function adapter interface
export interface GraphQLAdapter {
  findOptimalLocations(
    locations: LocationInput[],
    travelMode: TravelMode,
    optimizationGoal?: OptimizationGoal,
    topM?: number,
    gridSize?: number,
    deduplicationThreshold?: number
  ): Promise<OptimalLocationResult>

  generateIsochrone(
    pointId: string,
    travelTimeMinutes: number,
    travelMode: TravelMode
  ): Promise<GeoJSONPolygon>

  calculateMinimaxCenter(
    locations: LocationInput[],
    travelMode: TravelMode,
    bufferTimeMinutes: number
  ): Promise<IsochroneResult>

  geocodeAddress(address: string): Promise<{ latitude: number; longitude: number }>
}

// RedwoodJS GraphQL client adapter
export class RedwoodJSGraphQLAdapter implements GraphQLAdapter {
  private baseUrl: string

  constructor(baseUrl: string = 'http://localhost:8911/graphql') {
    this.baseUrl = baseUrl
  }

  async findOptimalLocations(
    locations: LocationInput[],
    travelMode: TravelMode,
    optimizationGoal: OptimizationGoal = 'MINIMAX',
    topM: number = 5,
    gridSize: number = 5,
    deduplicationThreshold: number = 5000.0
  ): Promise<OptimalLocationResult> {
    const query = `
      mutation FindOptimalLocations(
        $locations: [LocationInput!]!
        $travelMode: TravelMode!
        $optimizationGoal: OptimizationGoal
        $topM: Int
        $gridSize: Int
        $deduplicationThreshold: Float
      ) {
        findOptimalLocations(
          locations: $locations
          travelMode: $travelMode
          optimizationGoal: $optimizationGoal
          topM: $topM
          gridSize: $gridSize
          deduplicationThreshold: $deduplicationThreshold
        ) {
          optimalPoints {
            id
            coordinate {
              latitude
              longitude
            }
            travelTimeMetrics {
              maxTravelTime
              averageTravelTime
              totalTravelTime
              variance
            }
            rank
          }
          debugPoints {
            id
            coordinate {
              latitude
              longitude
            }
            type
          }
          matrixApiCalls
          totalHypothesisPoints
        }
      }
    `

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          locations,
          travelMode,
          optimizationGoal,
          topM,
          gridSize,
          deduplicationThreshold,
        },
      }),
    })

    const result = await response.json()

    if (result.errors) {
      throw new Error(`GraphQL error: ${result.errors[0].message}`)
    }

    return result.data.findOptimalLocations
  }

  async generateIsochrone(
    pointId: string,
    travelTimeMinutes: number,
    travelMode: TravelMode
  ): Promise<GeoJSONPolygon> {
    const query = `
      mutation GenerateIsochrone(
        $pointId: ID!
        $travelTimeMinutes: Int!
        $travelMode: TravelMode!
      ) {
        generateIsochrone(
          pointId: $pointId
          travelTimeMinutes: $travelTimeMinutes
          travelMode: $travelMode
        )
      }
    `

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          pointId,
          travelTimeMinutes,
          travelMode,
        },
      }),
    })

    const result = await response.json()

    if (result.errors) {
      throw new Error(`GraphQL error: ${result.errors[0].message}`)
    }

    return result.data.generateIsochrone
  }

  async calculateMinimaxCenter(
    locations: LocationInput[],
    travelMode: TravelMode,
    bufferTimeMinutes: number
  ): Promise<IsochroneResult> {
    const query = `
      mutation CalculateMinimaxCenter(
        $locations: [LocationInput!]!
        $travelMode: TravelMode!
        $bufferTimeMinutes: Int!
      ) {
        calculateMinimaxCenter(
          locations: $locations
          travelMode: $travelMode
          bufferTimeMinutes: $bufferTimeMinutes
        ) {
          centerPoint {
            latitude
            longitude
          }
          fairMeetingArea
          individualIsochrones
        }
      }
    `

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          locations,
          travelMode,
          bufferTimeMinutes,
        },
      }),
    })

    const result = await response.json()

    if (result.errors) {
      throw new Error(`GraphQL error: ${result.errors[0].message}`)
    }

    return result.data.calculateMinimaxCenter
  }

  async geocodeAddress(address: string): Promise<{ latitude: number; longitude: number }> {
    const query = `
      query GeocodeAddress($address: String!) {
        geocodeAddress(address: $address) {
          latitude
          longitude
        }
      }
    `

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { address },
      }),
    })

    const result = await response.json()

    if (result.errors) {
      throw new Error(`GraphQL error: ${result.errors[0].message}`)
    }

    return result.data.geocodeAddress
  }
}

// RedwoodSDK Server Function adapter
export class RedwoodSDKServerFunctionAdapter implements GraphQLAdapter {
  private baseUrl: string

  constructor(baseUrl: string = 'http://localhost:8787') {
    this.baseUrl = baseUrl
  }

  async findOptimalLocations(
    locations: LocationInput[],
    travelMode: TravelMode,
    optimizationGoal: OptimizationGoal = 'MINIMAX',
    topM: number = 5,
    gridSize: number = 5,
    deduplicationThreshold: number = 5000.0
  ): Promise<OptimalLocationResult> {
    const response = await fetch(`${this.baseUrl}/api/isochrones/find-optimal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locations,
        travelMode,
        optimizationGoal,
        topM,
        gridSize,
        deduplicationThreshold,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Server function error: ${error.error || response.statusText}`)
    }

    return await response.json()
  }

  async generateIsochrone(
    pointId: string,
    travelTimeMinutes: number,
    travelMode: TravelMode
  ): Promise<GeoJSONPolygon> {
    const response = await fetch(`${this.baseUrl}/api/isochrones/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pointId,
        travelTimeMinutes,
        travelMode,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Server function error: ${error.error || response.statusText}`)
    }

    return await response.json()
  }

  async calculateMinimaxCenter(
    locations: LocationInput[],
    travelMode: TravelMode,
    bufferTimeMinutes: number
  ): Promise<IsochroneResult> {
    const response = await fetch(`${this.baseUrl}/api/isochrones/minimax`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locations,
        travelMode,
        bufferTimeMinutes,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Server function error: ${error.error || response.statusText}`)
    }

    return await response.json()
  }

  async geocodeAddress(address: string): Promise<{ latitude: number; longitude: number }> {
    const response = await fetch(`${this.baseUrl}/api/locations/geocode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Server function error: ${error.error || response.statusText}`)
    }

    return await response.json()
  }
}

// Unified migration adapter that routes requests based on feature flags
export class UnifiedMigrationAdapter implements GraphQLAdapter {
  private migrationAdapter: MigrationAdapter
  private redwoodjsAdapter: RedwoodJSGraphQLAdapter
  private redwoodsdkAdapter: RedwoodSDKServerFunctionAdapter

  constructor(
    featureFlags: Partial<MigrationFeatureFlags> = {},
    redwoodjsBaseUrl?: string,
    redwoodsdkBaseUrl?: string
  ) {
    this.migrationAdapter = new MigrationAdapter(featureFlags)
    this.redwoodjsAdapter = new RedwoodJSGraphQLAdapter(redwoodjsBaseUrl)
    this.redwoodsdkAdapter = new RedwoodSDKServerFunctionAdapter(redwoodsdkBaseUrl)
  }

  /**
   * Update feature flags
   */
  updateFeatureFlags(flags: Partial<MigrationFeatureFlags>): void {
    this.migrationAdapter.updateFeatureFlags(flags)
  }

  /**
   * Get migration metrics
   */
  getMetrics() {
    return this.migrationAdapter.getMetrics()
  }

  /**
   * Execute request with fallback and performance comparison
   */
  private async executeWithFallback<T>(
    requestId: string,
    endpoint: string,
    redwoodsdkFn: () => Promise<T>,
    redwoodjsFn: () => Promise<T>
  ): Promise<T> {
    const flags = this.migrationAdapter.getFeatureFlags()
    const useRedwoodSDK = this.migrationAdapter.shouldUseRedwoodSDK(requestId)

    if (useRedwoodSDK) {
      // Try RedwoodSDK first
      const startTime = Date.now()
      try {
        const result = await redwoodsdkFn()
        const endTime = Date.now()

        this.migrationAdapter['logMetrics']({
          requestId,
          endpoint,
          implementation: 'redwoodsdk',
          startTime,
          endTime,
          duration: endTime - startTime,
          success: true,
          responseSize: JSON.stringify(result).length,
        })

        // Run performance comparison if enabled
        if (flags.enablePerformanceComparison) {
          this.runPerformanceComparison(requestId, endpoint, redwoodjsFn)
        }

        return result
      } catch (error) {
        const endTime = Date.now()

        this.migrationAdapter['logMetrics']({
          requestId,
          endpoint,
          implementation: 'redwoodsdk',
          startTime,
          endTime,
          duration: endTime - startTime,
          success: false,
          error: error.message,
        })

        // Fallback to RedwoodJS if enabled
        if (flags.enableGraphQLFallback) {
          console.warn(`RedwoodSDK failed for ${endpoint}, falling back to RedwoodJS:`, error.message)
          return this.executeRedwoodJS(requestId, endpoint, redwoodjsFn)
        }

        throw error
      }
    } else {
      // Use RedwoodJS
      return this.executeRedwoodJS(requestId, endpoint, redwoodjsFn)
    }
  }

  /**
   * Execute RedwoodJS request
   */
  private async executeRedwoodJS<T>(
    requestId: string,
    endpoint: string,
    redwoodjsFn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now()
    try {
      const result = await redwoodjsFn()
      const endTime = Date.now()

      this.migrationAdapter['logMetrics']({
        requestId,
        endpoint,
        implementation: 'redwoodjs',
        startTime,
        endTime,
        duration: endTime - startTime,
        success: true,
        responseSize: JSON.stringify(result).length,
      })

      return result
    } catch (error) {
      const endTime = Date.now()

      this.migrationAdapter['logMetrics']({
        requestId,
        endpoint,
        implementation: 'redwoodjs',
        startTime,
        endTime,
        duration: endTime - startTime,
        success: false,
        error: error.message,
      })

      throw error
    }
  }

  /**
   * Run performance comparison in background (fire and forget)
   */
  private runPerformanceComparison<T>(
    requestId: string,
    endpoint: string,
    redwoodjsFn: () => Promise<T>
  ): void {
    // Run comparison asynchronously without blocking the main request
    setTimeout(async () => {
      try {
        await this.executeRedwoodJS(`${requestId}-comparison`, `${endpoint}-comparison`, redwoodjsFn)
      } catch (error) {
        // Ignore comparison errors
        console.debug(`Performance comparison failed for ${endpoint}:`, error.message)
      }
    }, 0)
  }

  // Implement GraphQLAdapter interface
  async findOptimalLocations(
    locations: LocationInput[],
    travelMode: TravelMode,
    optimizationGoal?: OptimizationGoal,
    topM?: number,
    gridSize?: number,
    deduplicationThreshold?: number
  ): Promise<OptimalLocationResult> {
    const requestId = crypto.randomUUID()

    return this.executeWithFallback(
      requestId,
      'findOptimalLocations',
      () => this.redwoodsdkAdapter.findOptimalLocations(
        locations, travelMode, optimizationGoal, topM, gridSize, deduplicationThreshold
      ),
      () => this.redwoodjsAdapter.findOptimalLocations(
        locations, travelMode, optimizationGoal, topM, gridSize, deduplicationThreshold
      )
    )
  }

  async generateIsochrone(
    pointId: string,
    travelTimeMinutes: number,
    travelMode: TravelMode
  ): Promise<GeoJSONPolygon> {
    const requestId = crypto.randomUUID()

    return this.executeWithFallback(
      requestId,
      'generateIsochrone',
      () => this.redwoodsdkAdapter.generateIsochrone(pointId, travelTimeMinutes, travelMode),
      () => this.redwoodjsAdapter.generateIsochrone(pointId, travelTimeMinutes, travelMode)
    )
  }

  async calculateMinimaxCenter(
    locations: LocationInput[],
    travelMode: TravelMode,
    bufferTimeMinutes: number
  ): Promise<IsochroneResult> {
    const requestId = crypto.randomUUID()

    return this.executeWithFallback(
      requestId,
      'calculateMinimaxCenter',
      () => this.redwoodsdkAdapter.calculateMinimaxCenter(locations, travelMode, bufferTimeMinutes),
      () => this.redwoodjsAdapter.calculateMinimaxCenter(locations, travelMode, bufferTimeMinutes)
    )
  }

  async geocodeAddress(address: string): Promise<{ latitude: number; longitude: number }> {
    const requestId = crypto.randomUUID()

    return this.executeWithFallback(
      requestId,
      'geocodeAddress',
      () => this.redwoodsdkAdapter.geocodeAddress(address),
      () => this.redwoodjsAdapter.geocodeAddress(address)
    )
  }
}

// Export singleton instance for easy use
export const migrationAdapter = new UnifiedMigrationAdapter()
