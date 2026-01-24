import * as fc from 'fast-check'
import { calculateMinimaxCenter } from './isochrones'

// Mock the cached OpenRoute client
jest.mock('src/lib/cachedOpenroute', () => ({
  cachedOpenRouteClient: {
    calculateIsochrone: jest.fn(),
    calculateTravelTimeMatrix: jest.fn(),
  }
}))

// Mock the matrix service
jest.mock('src/lib/matrix', () => ({
  matrixService: {
    findMinimaxOptimal: jest.fn(),
    evaluateBatchedMatrix: jest.fn(),
    evaluatePhase2Matrix: jest.fn(),
    findMultiPhaseMinimaxOptimal: jest.fn(),
  }
}))

// Mock the geometry service
jest.mock('src/lib/geometry', () => ({
  geometryService: {
    validatePolygonOverlap: jest.fn(),
    calculatePolygonUnion: jest.fn(),
    calculateCentroid: jest.fn(),
    calculateGeographicCentroid: jest.fn(),
    calculateMedianCoordinate: jest.fn(),
    calculatePairwiseMidpoints: jest.fn(),
    validateCoordinateBounds: jest.fn(),
  }
}))

import { cachedOpenRouteClient } from 'src/lib/cachedOpenroute'
import { geometryService } from 'src/lib/geometry'
import { matrixService } from 'src/lib/matrix'

const mockCachedOpenRouteClient = cachedOpenRouteClient as jest.Mocked<typeof cachedOpenRouteClient>
const mockGeometryService = geometryService as jest.Mocked<typeof geometryService>
const mockMatrixService = matrixService as jest.Mocked<typeof matrixService>

/**
 * Property-based tests for minimax center validation
 * Feature: isochrone-center-point, Property 5: Minimax Center Validation
 * Validates: Requirements 5.1
 */

// Generator for valid location inputs with unique coordinates
const locationArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  latitude: fc.float({ min: -80, max: 80, noNaN: true }).filter(lat => Math.abs(lat) > 0.1), // Avoid poles and origin
  longitude: fc.float({ min: -170, max: 170, noNaN: true }).filter(lng => Math.abs(lng) > 0.1) // Avoid antimeridian and origin
})

// Generator for arrays of unique locations (no duplicates)
const uniqueLocationsArbitrary = (minLength: number, maxLength: number) =>
  fc.array(locationArbitrary, { minLength, maxLength })
    .map(locations => {
      // Remove duplicates by coordinate with minimum distance requirement
      const seen = new Set<string>()
      const filtered = locations.filter(loc => {
        // Round coordinates to avoid floating point precision issues
        const roundedLat = Math.round(loc.latitude * 1000) / 1000
        const roundedLng = Math.round(loc.longitude * 1000) / 1000
        const key = `${roundedLat},${roundedLng}`

        if (seen.has(key)) return false

        // Check minimum distance from existing locations (at least 1 degree apart)
        for (const existingKey of seen) {
          const [existingLat, existingLng] = existingKey.split(',').map(Number)
          const distance = Math.sqrt(
            Math.pow(roundedLat - existingLat, 2) + Math.pow(roundedLng - existingLng, 2)
          )
          if (distance < 1.0) return false // Require at least 1 degree separation
        }

        seen.add(key)
        return true
      })
      return filtered
    })
    .filter(locations => locations.length >= minLength) // Ensure we still have enough after deduplication

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

    // Mock geometry service methods
    mockGeometryService.calculateGeographicCentroid.mockReturnValue({ latitude: 40.7128, longitude: -74.0060 })
    mockGeometryService.calculateMedianCoordinate.mockReturnValue({ latitude: 40.7128, longitude: -74.0060 })
    mockGeometryService.calculatePairwiseMidpoints.mockReturnValue([{ latitude: 40.7128, longitude: -74.0060 }])
    mockGeometryService.validateCoordinateBounds.mockReturnValue(true)

    // Set up default mock implementations
    mockCachedOpenRouteClient.calculateIsochrone.mockResolvedValue(mockPolygon)

    // Mock travel time matrix with valid data
    mockCachedOpenRouteClient.calculateTravelTimeMatrix.mockResolvedValue({
      origins: [
        { id: '1', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
        { id: '2', name: 'Origin 2', latitude: 40.7589, longitude: -73.9851 }
      ],
      destinations: [
        { id: '1', coordinate: {latitude: 40.7359, longitude: -73.9906 }, phase: 'ANCHOR', type: 'MEDIAN_COORDINATE'},
        { id: '2', coordinate: {latitude: 40.7505, longitude: -73.9934 }, phase: 'ANCHOR', type: 'MEDIAN_COORDINATE'},
        { id: '3', coordinate: {latitude: 40.7128, longitude: -74.0060 }, phase: 'ANCHOR', type: 'MEDIAN_COORDINATE'},
        { id: '4', coordinate: {latitude: 40.7589, longitude: -73.9851 }, phase: 'ANCHOR', type: 'MEDIAN_COORDINATE'},
        { id: '5', coordinate: {latitude: 40.7439, longitude: -73.9928 }, phase: 'ANCHOR', type: 'MEDIAN_COORDINATE'}
      ],
      travelTimes: [
        [15, 12, 0, 8, 10],  // From origin 0 to all destinations
        [18, 10, 8, 0, 5]    // From origin 1 to all destinations
      ],
      travelMode: 'DRIVING_CAR'
    })

    // Mock matrix service methods
    mockMatrixService.findMinimaxOptimal.mockReturnValue({
      optimalIndex: 0,
      maxTravelTime: 15,
      averageTravelTime: 12.5
    })

    mockMatrixService.evaluateBatchedMatrix.mockResolvedValue({
      combinedMatrix: {
        origins: [
          { id: '1', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: '2', name: 'Origin 2', latitude: 40.7589, longitude: -73.9851 }
        ],
        destinations: [
          { id: '1', coordinate: {latitude: 40.7128, longitude: -74.0060 }, phase: 'ANCHOR', type: 'MEDIAN_COORDINATE'}
        ],
        travelTimes: [[10], [15]],
        travelMode: 'DRIVING_CAR'
      },
      phaseResults: [
        {
          phase: 'PHASE_0',
          matrix: {
            origins: [
              { id: '1', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
              { id: '2', name: 'Origin 2', latitude: 40.7589, longitude: -73.9851 }
            ],
            destinations: [
              { id: '1', coordinate: { latitude: 40.7128, longitude: -74.0060}, phase: 'ANCHOR', type: 'MEDIAN_COORDINATE' }
            ],
            travelTimes: [[10], [15]],
            travelMode: 'DRIVING_CAR'
          },
          hypothesisPoints: [{
            id: 'test',
            coordinate: { latitude: 40.7128, longitude: -74.0060 },
            type: 'GEOGRAPHIC_CENTROID',
            metadata: null,
            phase: 'ANCHOR'
          }],
          startIndex: 0,
          endIndex: 1
        }
      ],
      totalHypothesisPoints: [{
        id: 'test',
        coordinate: { latitude: 40.7128, longitude: -74.0060 },
        type: 'GEOGRAPHIC_CENTROID',
        metadata: null,
        phase: 'ANCHOR'
      }],
      apiCallCount: 1,
    })

    mockMatrixService.findMultiPhaseMinimaxOptimal.mockReturnValue({
      optimalIndex: 0,
      maxTravelTime: 15,
      averageTravelTime: 12.5,
      optimalPhase: 'PHASE_0',
      optimalHypothesisPoint: {
        id: 'test',
        coordinate: { latitude: 40.7128, longitude: -74.0060 },
        type: 'GEOGRAPHIC_CENTROID',
        metadata: null,
        phase: 'ANCHOR'
      }
    })

    mockGeometryService.validatePolygonOverlap.mockReturnValue(true)
    mockGeometryService.calculatePolygonUnion.mockReturnValue(mockPolygon)
    mockGeometryService.calculateCentroid.mockReturnValue({ latitude: 0.5, longitude: 0.5 })

    // Mock hypothesis point generation methods
    mockGeometryService.calculateGeographicCentroid.mockReturnValue({ latitude: 40.7359, longitude: -73.9906 })
    mockGeometryService.calculateMedianCoordinate.mockReturnValue({ latitude: 40.7505, longitude: -73.9934 })
    mockGeometryService.calculatePairwiseMidpoints.mockReturnValue([{ latitude: 40.7439, longitude: -73.9928 }])
    mockGeometryService.validateCoordinateBounds.mockReturnValue(true)
  })

  describe('Property 5: Minimax Center Validation', () => {
    it('should validate minimum location requirements consistently', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(locationArbitrary, { minLength: 0, maxLength: 1 }),
        travelModeArbitrary,
        fc.integer({ min: 5, max: 60 }),
        async (locations, travelMode, bufferTimeMinutes) => {
          // For locations with less than 2 items, should always throw validation error
          await expect(calculateMinimaxCenter({
            locations,
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
        travelModeArbitrary,
        fc.integer({ min: 5, max: 60 }),
        async (locations, travelMode, bufferTimeMinutes) => {
          // For locations with more than 12 items, should always throw validation error
          await expect(calculateMinimaxCenter({
            locations,
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
        travelModeArbitrary,
        fc.oneof(
          fc.integer({ min: -10, max: 4 }), // Invalid: too low
          fc.integer({ min: 61, max: 100 }) // Invalid: too high
        ),
        async (locations, travelMode, bufferTimeMinutes) => {
          // For invalid buffer times, should always throw validation error
          await expect(calculateMinimaxCenter({
            locations,
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
        fc.string({ minLength: 1 }).filter(s => !['DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'].includes(s)),
        fc.integer({ min: 5, max: 60 }),
        async (locations, invalidTravelMode, bufferTimeMinutes) => {
          // For invalid travel modes, should always throw specific validation error
          await expect(calculateMinimaxCenter({
            locations,
            travelMode: invalidTravelMode as any,
            bufferTimeMinutes
          })).rejects.toThrow(/Invalid travel mode selected/i)

          // Should not call matrix services for early validation errors
          expect(mockCachedOpenRouteClient.calculateTravelTimeMatrix).not.toHaveBeenCalled()
        }
      ), { numRuns: 50 })
    })

    it('should successfully calculate center for valid inputs with fallback', async () => {
      await fc.assert(fc.asyncProperty(
        uniqueLocationsArbitrary(2, 5),
        travelModeArbitrary,
        fc.integer({ min: 5, max: 60 }),
        async (locations, travelMode, bufferTimeMinutes) => {
          // Skip if we don't have enough unique locations after deduplication
          if (locations.length < 2) return

          const result = await calculateMinimaxCenter({
            locations,
            travelMode: travelMode as any,
            bufferTimeMinutes,
            optimizationConfig: null
          })

          // Should return valid result structure
          expect(result).toHaveProperty('centerPoint')
          expect(result).toHaveProperty('fairMeetingArea')
          expect(result).toHaveProperty('individualIsochrones')

          expect(result.centerPoint).toHaveProperty('latitude')
          expect(result.centerPoint).toHaveProperty('longitude')
          expect(Array.isArray(result.individualIsochrones)).toBe(true)
        }
      ), { numRuns: 20 })
    })
  })
})