import { cachedOpenRouteClient } from './cachedOpenroute'
import { cache } from './cache'
import { openRouteClient } from './openroute'
import type { TravelTimeMatrix } from 'types/graphql'

// Mock the openRouteClient
jest.mock('./openroute', () => ({
  openRouteClient: {
    calculateTravelTimeMatrix: jest.fn()
  }
}))

const mockOpenRouteClient = openRouteClient as jest.Mocked<typeof openRouteClient>

describe('CachedOpenRouteClient Matrix Caching', () => {
  beforeEach(async () => {
    await cache.clear()
    jest.clearAllMocks()
  })

  describe('Matrix Caching Integration', () => {
    it('should cache matrix results and return cached data on subsequent calls', async () => {
      const origins = [
        { latitude: 40.7128, longitude: -74.0060 },
        { latitude: 40.7200, longitude: -74.0100 }
      ]
      const destinations = [
        { latitude: 40.715, longitude: -74.005 },
        { latitude: 40.7164, longitude: -74.008 }
      ]
      const travelMode = 'DRIVING_CAR' as const

      const mockMatrix: TravelTimeMatrix = {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 }
        ],
        destinations: [
          { id: 'destination_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
          { id: 'destination_1', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
        ],
        travelTimes: [
          [10, 12],
          [15, 8]
        ],
        travelMode: 'DRIVING_CAR'
      }

      mockOpenRouteClient.calculateTravelTimeMatrix.mockResolvedValue(mockMatrix)

      // First call - should hit API and cache result
      const result1 = await cachedOpenRouteClient.calculateTravelTimeMatrix(origins, destinations, travelMode)
      expect(result1).toEqual(mockMatrix)
      expect(mockOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(1)

      // Second call - should return cached result without hitting API
      const result2 = await cachedOpenRouteClient.calculateTravelTimeMatrix(origins, destinations, travelMode)
      expect(result2).toEqual(mockMatrix)
      expect(mockOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(1) // Still only called once

      // Verify cache stats
      const stats = await cachedOpenRouteClient.getCacheStats()
      expect(stats.matrixHits).toBe(1)
      expect(stats.matrixMisses).toBe(1)
    })

    it('should handle cache failures gracefully by falling back to API', async () => {
      const origins = [{ latitude: 40.7128, longitude: -74.0060 }]
      const destinations = [{ latitude: 40.715, longitude: -74.005 }]
      const travelMode = 'DRIVING_CAR' as const

      const mockMatrix: TravelTimeMatrix = {
        origins: [{ id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 }],
        destinations: [{ id: 'destination_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null }],
        travelTimes: [[10]],
        travelMode: 'DRIVING_CAR'
      }

      mockOpenRouteClient.calculateTravelTimeMatrix.mockResolvedValue(mockMatrix)

      // Mock cache to throw a cache-related error
      const originalGetMatrixCache = cache.getMatrixCache
      cache.getMatrixCache = jest.fn().mockRejectedValue(new Error('Redis cache unavailable'))

      // Should still work by falling back to API
      const result = await cachedOpenRouteClient.calculateTravelTimeMatrix(origins, destinations, travelMode)
      expect(result).toEqual(mockMatrix)
      expect(mockOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(1)

      // Restore original method
      cache.getMatrixCache = originalGetMatrixCache
    })

    it('should use 100-meter precision for coordinate matching', async () => {
      const baseOrigin = { latitude: 40.7128, longitude: -74.0060 }
      const baseDestination = { latitude: 40.715, longitude: -74.005 }

      // Test the actual precision calculation
      // 111000 meters per degree, 100m precision = 111000/100 = 1110 units per degree
      // Rounding: Math.round(coord * 1110) / 1110
      // For coordinates to match, they need to round to the same value

      // Let's use coordinates that will definitely round to the same value
      // Base: 40.7128 -> Math.round(40.7128 * 1110) / 1110 = Math.round(45210.048) / 1110 = 45210 / 1110 = 40.712613...
      // We need nearby coordinates that round to the same value
      const nearbyOrigin = {
        latitude: 40.7126, // Should round to same value as 40.7128
        longitude: -74.0060
      }
      const nearbyDestination = {
        latitude: 40.715,
        longitude: -74.005
      }

      const travelMode = 'DRIVING_CAR' as const

      const mockMatrix: TravelTimeMatrix = {
        origins: [{ id: 'origin_0', name: 'Origin 1', latitude: baseOrigin.latitude, longitude: baseOrigin.longitude }],
        destinations: [{ id: 'destination_0', coordinate: baseDestination, type: 'GEOGRAPHIC_CENTROID', metadata: null }],
        travelTimes: [[15]],
        travelMode: 'DRIVING_CAR'
      }

      mockOpenRouteClient.calculateTravelTimeMatrix.mockResolvedValue(mockMatrix)

      // First call with base coordinates
      await cachedOpenRouteClient.calculateTravelTimeMatrix([baseOrigin], [baseDestination], travelMode)
      expect(mockOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(1)

      // Second call with nearby coordinates (within precision) - should use cache
      await cachedOpenRouteClient.calculateTravelTimeMatrix([nearbyOrigin], [nearbyDestination], travelMode)
      expect(mockOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(1) // Still only called once

      // Verify cache hit
      const stats = await cachedOpenRouteClient.getCacheStats()
      expect(stats.matrixHits).toBe(1)
      expect(stats.matrixMisses).toBe(1)
    })
  })
})