import * as fc from 'fast-check'
import { calculateIsochronicCenter } from './isochrones'

// Mock the cached OpenRoute client
jest.mock('src/lib/cachedOpenroute', () => ({
  cachedOpenRouteClient: {
    calculateIsochrone: jest.fn(),
  }
}))

// Mock the geometry service
jest.mock('src/lib/geometry', () => ({
  geometryService: {
    validatePolygonOverlap: jest.fn(),
    calculatePolygonUnion: jest.fn(),
    calculateCentroid: jest.fn(),
  }
}))

import { cachedOpenRouteClient } from 'src/lib/cachedOpenroute'
import { geometryService } from 'src/lib/geometry'

const mockCachedOpenRouteClient = cachedOpenRouteClient as jest.Mocked<typeof cachedOpenRouteClient>
const mockGeometryService = geometryService as jest.Mocked<typeof geometryService>

/**
 * Property-based tests for isochronic center validation
 * Feature: isochrone-center-point, Property 5: Isochronic Center Validation
 * Validates: Requirements 5.1
 */

// Generator for valid location inputs
const locationArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }),
  latitude: fc.integer({ min: -90, max: 90 }),
  longitude: fc.integer({ min: -180, max: 180 })
})

// Generator for valid travel modes
const travelModeArbitrary = fc.constantFrom('DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING')

// Mock polygon for testing
const mockPolygon = {
  type: 'Polygon' as const,
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
}

describe('Isochrone Service Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Set up default mock implementations
    mockCachedOpenRouteClient.calculateIsochrone.mockResolvedValue(mockPolygon)
    mockGeometryService.validatePolygonOverlap.mockReturnValue(true)
    mockGeometryService.calculatePolygonUnion.mockReturnValue(mockPolygon)
    mockGeometryService.calculateCentroid.mockReturnValue({ latitude: 0.5, longitude: 0.5 })
  })

  describe('Property 5: Isochronic Center Validation', () => {
    it('should validate minimum location requirements consistently', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(locationArbitrary, { minLength: 0, maxLength: 1 }),
        fc.integer({ min: 1, max: 60 }),
        travelModeArbitrary,
        fc.integer({ min: 5, max: 60 }),
        async (locations, travelTimeMinutes, travelMode, bufferTimeMinutes) => {
          // For locations with less than 2 items, should always throw validation error
          await expect(calculateIsochronicCenter({
            locations,
            travelTimeMinutes,
            travelMode: travelMode as any,
            bufferTimeMinutes
          })).rejects.toThrow(/at least 2 locations/i)

          // Should not call any external services for validation errors
          expect(mockCachedOpenRouteClient.calculateIsochrone).not.toHaveBeenCalled()
        }
      ), { numRuns: 50 })
    })

    it('should validate maximum location limits consistently', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(locationArbitrary, { minLength: 13, maxLength: 20 }),
        fc.integer({ min: 1, max: 60 }),
        travelModeArbitrary,
        fc.integer({ min: 5, max: 60 }),
        async (locations, travelTimeMinutes, travelMode, bufferTimeMinutes) => {
          // For locations with more than 12 items, should always throw validation error
          await expect(calculateIsochronicCenter({
            locations,
            travelTimeMinutes,
            travelMode: travelMode as any,
            bufferTimeMinutes
          })).rejects.toThrow(/Maximum of 12 locations supported/i)

          // Should not call any external services for validation errors
          expect(mockCachedOpenRouteClient.calculateIsochrone).not.toHaveBeenCalled()
        }
      ), { numRuns: 50 })
    })

    it('should validate buffer time boundaries consistently', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(locationArbitrary, { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 1, max: 60 }),
        travelModeArbitrary,
        fc.oneof(
          fc.integer({ min: -10, max: 4 }), // Invalid: too low
          fc.integer({ min: 61, max: 100 }) // Invalid: too high
        ),
        async (locations, travelTimeMinutes, travelMode, bufferTimeMinutes) => {
          // For invalid buffer times, should always throw validation error
          await expect(calculateIsochronicCenter({
            locations,
            travelTimeMinutes,
            travelMode: travelMode as any,
            bufferTimeMinutes
          })).rejects.toThrow(/buffer time must be between 5 and 60/i)

          // Should not call any external services for validation errors
          expect(mockCachedOpenRouteClient.calculateIsochrone).not.toHaveBeenCalled()
        }
      ), { numRuns: 50 })
    })

    it('should handle travel mode validation consistently', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(locationArbitrary, { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 1, max: 60 }),
        fc.string({ minLength: 1 }).filter(s => !['DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'].includes(s)),
        fc.integer({ min: 5, max: 60 }),
        async (locations, travelTimeMinutes, invalidTravelMode, bufferTimeMinutes) => {
          // For invalid travel modes, should always throw specific validation error
          await expect(calculateIsochronicCenter({
            locations,
            travelTimeMinutes,
            travelMode: invalidTravelMode as any,
            bufferTimeMinutes
          })).rejects.toThrow(/Invalid travel mode selected/i)

          // Should not call geometry services for early validation errors
          expect(mockGeometryService.validatePolygonOverlap).not.toHaveBeenCalled()
        }
      ), { numRuns: 50 })
    })

    it('should successfully calculate center for valid inputs', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(locationArbitrary, { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 1, max: 60 }),
        travelModeArbitrary,
        fc.integer({ min: 5, max: 60 }),
        async (locations, travelTimeMinutes, travelMode, bufferTimeMinutes) => {
          const result = await calculateIsochronicCenter({
            locations,
            travelTimeMinutes,
            travelMode: travelMode as any,
            bufferTimeMinutes
          })

          // Should return valid result structure
          expect(result).toHaveProperty('centerPoint')
          expect(result).toHaveProperty('fairMeetingArea')
          expect(result).toHaveProperty('individualIsochrones')

          expect(result.centerPoint).toHaveProperty('latitude')
          expect(result.centerPoint).toHaveProperty('longitude')
          expect(Array.isArray(result.individualIsochrones)).toBe(true)

          // Should call all required services
          expect(mockCachedOpenRouteClient.calculateIsochrone).toHaveBeenCalled()
          expect(mockGeometryService.validatePolygonOverlap).toHaveBeenCalled()
          expect(mockGeometryService.calculatePolygonUnion).toHaveBeenCalled()
          expect(mockGeometryService.calculateCentroid).toHaveBeenCalled()
        }
      ), { numRuns: 20 })
    })

    it('should handle polygon overlap validation failure', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(locationArbitrary, { minLength: 2, maxLength: 3 }),
        fc.integer({ min: 1, max: 60 }),
        travelModeArbitrary,
        fc.integer({ min: 5, max: 60 }),
        async (locations, travelTimeMinutes, travelMode, bufferTimeMinutes) => {
          // Mock no overlap scenario
          mockGeometryService.validatePolygonOverlap.mockReturnValue(false)

          await expect(calculateIsochronicCenter({
            locations,
            travelTimeMinutes,
            travelMode: travelMode as any,
            bufferTimeMinutes
          })).rejects.toThrow(/too far apart.*no overlapping/i)

          // Should have called validation but not proceeded to union/centroid
          expect(mockGeometryService.validatePolygonOverlap).toHaveBeenCalled()
          expect(mockGeometryService.calculatePolygonUnion).not.toHaveBeenCalled()
          expect(mockGeometryService.calculateCentroid).not.toHaveBeenCalled()
        }
      ), { numRuns: 20 })
    })
  })
})