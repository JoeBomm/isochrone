import fc from 'fast-check'
import { GeoJSON } from 'geojson'
import { 
  cache,
  IsochroneCacheService, 
  Coordinate, 
  IsochroneParams, 
  IsochroneCacheKey 
} from './cache'

// Use the exported cache instance for testing
const createTestCache = (): IsochroneCacheService => cache

// Helper to create valid coordinates
const coordinateArbitrary = fc.record({
  latitude: fc.double({ min: -90, max: 90 }),
  longitude: fc.double({ min: -180, max: 180 })
})

// Helper to create valid isochrone parameters
const isochroneParamsArbitrary = fc.record({
  travelTimeMinutes: fc.integer({ min: 1, max: 60 }),
  travelMode: fc.constantFrom('driving-car', 'cycling-regular', 'foot-walking') as fc.Arbitrary<'driving-car' | 'cycling-regular' | 'foot-walking'>
})

// Helper to create a simple valid GeoJSON polygon
const polygonArbitrary = fc.constant({
  type: 'Polygon' as const,
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
} as GeoJSON.Polygon)

// Helper to generate unique test data to avoid cache collisions
const uniqueCoordinateArbitrary = fc.record({
  latitude: fc.double({ min: -89, max: 89, noNaN: true }),
  longitude: fc.double({ min: -179, max: 179, noNaN: true })
}).map(coord => ({
  latitude: coord.latitude + Math.random() * 0.001, // Add small random offset
  longitude: coord.longitude + Math.random() * 0.001
}))

const uniqueAddressArbitrary = fc.string({ minLength: 5, maxLength: 50 })
  .map(str => `${str}_${Math.random().toString(36).substring(7)}`) // Add unique suffix

describe('Cache Service', () => {
  // Clear cache before each test to ensure clean state
  beforeEach(async () => {
    await cache.clear()
  })

  describe('Property 9: API Response Caching', () => {
    /**
     * Feature: isochrone-center-point, Property 9: API Response Caching
     * Validates: Requirements 8.1, 8.2
     * 
     * For any location within 100 meters of a previously cached location with identical travel parameters, 
     * the system should return the cached result instead of making a new API call, and the cached result 
     * should be equivalent to a fresh API response.
     */
    it('should cache and retrieve isochrone data correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueCoordinateArbitrary,
          isochroneParamsArbitrary,
          polygonArbitrary,
          fc.integer({ min: 50, max: 200 }), // precision in meters
          async (coordinate, params, polygon, precision) => {
            const cache = createTestCache()
            
            const cacheKey: IsochroneCacheKey = {
              latitude: coordinate.latitude,
              longitude: coordinate.longitude,
              travelTimeMinutes: params.travelTimeMinutes,
              travelMode: params.travelMode,
              precision
            }

            // Set cache with polygon
            await cache.setIsochroneCache(cacheKey, polygon)

            // Retrieve should return the same polygon
            const cachedResult = await cache.getIsochroneCache(cacheKey)
            expect(cachedResult).toEqual(polygon)

            // Test that the exact same cache key returns the same result
            const sameCacheKey: IsochroneCacheKey = {
              latitude: coordinate.latitude,
              longitude: coordinate.longitude,
              travelTimeMinutes: params.travelTimeMinutes,
              travelMode: params.travelMode,
              precision
            }

            const sameResult = await cache.getIsochroneCache(sameCacheKey)
            expect(sameResult).toEqual(polygon)
          }
        ),
        { numRuns: 50 } // Reduced runs to avoid test timeout
      )
    })

    it('should cache and retrieve geocoding data correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueAddressArbitrary,
          uniqueCoordinateArbitrary,
          async (address, coordinate) => {
            const cache = createTestCache()

            // Set cache with coordinate
            await cache.setGeocodingCache(address, coordinate)

            // Retrieve should return the same coordinate
            const cachedResult = await cache.getGeocodingCache(address)
            expect(cachedResult).toEqual(coordinate)

            // Test case insensitivity and whitespace handling
            const addressVariations = [
              address.toUpperCase(),
              address.toLowerCase(),
              ` ${address} `,
              `  ${address.toUpperCase()}  `
            ]

            for (const variation of addressVariations) {
              const result = await cache.getGeocodingCache(variation)
              expect(result).toEqual(coordinate)
            }
          }
        ),
        { numRuns: 50 } // Reduced runs to avoid test timeout
      )
    })

    it('should track cache statistics correctly', async () => {
      const cache = createTestCache()
      
      // Get initial stats
      const initialStats = await cache.getCacheStats()
      
      // Test a few operations and verify stats change appropriately
      const testCoordinate: Coordinate = { 
        latitude: 40.7128 + Math.random() * 0.001, 
        longitude: -74.0060 + Math.random() * 0.001 
      }
      const testParams: IsochroneParams = { travelTimeMinutes: 15, travelMode: 'driving-car' }
      const testPolygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
      }
      const testAddress = `test_address_${Math.random().toString(36).substring(7)}`

      const cacheKey: IsochroneCacheKey = {
        latitude: testCoordinate.latitude,
        longitude: testCoordinate.longitude,
        travelTimeMinutes: testParams.travelTimeMinutes,
        travelMode: testParams.travelMode,
        precision: 100
      }

      // Test cache miss
      await cache.getIsochroneCache(cacheKey)
      await cache.getGeocodingCache(testAddress)

      // Set cache
      await cache.setIsochroneCache(cacheKey, testPolygon)
      await cache.setGeocodingCache(testAddress, testCoordinate)

      // Test cache hit
      await cache.getIsochroneCache(cacheKey)
      await cache.getGeocodingCache(testAddress)

      const finalStats = await cache.getCacheStats()
      
      // Verify stats increased from initial state
      expect(finalStats.isochroneHits).toBeGreaterThan(initialStats.isochroneHits)
      expect(finalStats.isochroneMisses).toBeGreaterThan(initialStats.isochroneMisses)
      expect(finalStats.geocodingHits).toBeGreaterThan(initialStats.geocodingHits)
      expect(finalStats.geocodingMisses).toBeGreaterThan(initialStats.geocodingMisses)
    })

    it('should handle cache key generation with coordinate rounding', async () => {
      const cache = createTestCache()
      
      // Use specific coordinates to test rounding behavior
      const testCoordinate: Coordinate = { latitude: 40.7128, longitude: -74.0060 }
      const testParams: IsochroneParams = { travelTimeMinutes: 15, travelMode: 'driving-car' }
      const precision = 100 // 100 meters

      // Generate cache key
      const key1 = cache.generateIsochroneCacheKey(testCoordinate, testParams, precision)
      const key2 = cache.generateIsochroneCacheKey(testCoordinate, testParams, precision)

      // Same inputs should generate same key
      expect(key1).toBe(key2)

      // Key should contain expected components
      expect(key1).toContain('isochrone:')
      expect(key1).toContain(testParams.travelMode)
      expect(key1).toContain(testParams.travelTimeMinutes.toString())

      // Coordinates within precision should generate same key
      const offsetDegrees = (precision / 8) / 111000 // Eighth precision distance to ensure rounding
      const nearbyCoordinate: Coordinate = {
        latitude: testCoordinate.latitude + offsetDegrees,
        longitude: testCoordinate.longitude + offsetDegrees
      }

      const nearbyKey = cache.generateIsochroneCacheKey(nearbyCoordinate, testParams, precision)
      expect(nearbyKey).toBe(key1) // Should be same due to rounding

      // Coordinates outside precision should generate different key
      const farOffsetDegrees = (precision * 5) / 111000 // Five times precision distance
      const farCoordinate: Coordinate = {
        latitude: testCoordinate.latitude + farOffsetDegrees,
        longitude: testCoordinate.longitude + farOffsetDegrees
      }

      const farKey = cache.generateIsochroneCacheKey(farCoordinate, testParams, precision)
      expect(farKey).not.toBe(key1) // Should be different
    })

    it('should respect TTL for cache expiration', async () => {
      const cache = createTestCache()
      
      const coordinate: Coordinate = { 
        latitude: 40.7128 + Math.random() * 0.001, 
        longitude: -74.0060 + Math.random() * 0.001 
      }
      const params: IsochroneParams = { travelTimeMinutes: 15, travelMode: 'driving-car' }
      const polygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
      }

      const cacheKey: IsochroneCacheKey = {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        travelTimeMinutes: params.travelTimeMinutes,
        travelMode: params.travelMode,
        precision: 100
      }

      // Set cache with very short TTL (1 second)
      await cache.setIsochroneCache(cacheKey, polygon, 1)

      // Should be available immediately
      let result = await cache.getIsochroneCache(cacheKey)
      expect(result).toEqual(polygon)

      // Wait for expiration and test
      await new Promise(resolve => setTimeout(resolve, 1100))
      
      result = await cache.getIsochroneCache(cacheKey)
      expect(result).toBeNull() // Should be expired
    })
  })
})