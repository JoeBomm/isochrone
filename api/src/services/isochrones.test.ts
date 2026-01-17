import fc from 'fast-check'
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

// Mock polygon for testing
const mockPolygon = {
  type: 'Polygon' as const,
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
}

describe('isochrones service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Set up default mock implementations
    mockCachedOpenRouteClient.calculateIsochrone.mockResolvedValue(mockPolygon)
    mockGeometryService.validatePolygonOverlap.mockReturnValue(true)
    mockGeometryService.calculatePolygonUnion.mockReturnValue(mockPolygon)
    mockGeometryService.calculateCentroid.mockReturnValue({ latitude: 0.5, longitude: 0.5 })
  })

  describe('Property 7: Input Validation Boundaries', () => {
    /**
     * Feature: isochrone-center-point, Property 7: Input Validation Boundaries
     * Validates: Requirements 5.3
     * 
     * For any buffer time input, the system should accept values between 5 and 60 minutes 
     * and reject values outside this range with appropriate error messages.
     */
    it('should validate buffer time boundaries correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate valid locations (at least 2)
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1 }),
              latitude: fc.integer({ min: -90, max: 90 }),
              longitude: fc.integer({ min: -180, max: 180 }),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          // Generate valid travel time
          fc.integer({ min: 1, max: 60 }),
          // Generate valid travel mode
          fc.constantFrom('DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'),
          // Generate buffer time (both valid and invalid)
          fc.integer({ min: -10, max: 100 }),
          async (locations, travelTimeMinutes, travelMode, bufferTimeMinutes) => {
            const isValidBufferTime = bufferTimeMinutes >= 5 && bufferTimeMinutes <= 60

            // Clear mocks for this iteration
            jest.clearAllMocks()

            try {
              const result = await calculateIsochronicCenter({
                locations,
                travelTimeMinutes,
                travelMode: travelMode as any,
                bufferTimeMinutes,
              })

              // If we reach here without error, buffer time should be valid
              expect(isValidBufferTime).toBe(true)
              
              // Should return valid result structure
              expect(result).toHaveProperty('centerPoint')
              expect(result).toHaveProperty('fairMeetingArea')
              expect(result).toHaveProperty('individualIsochrones')
            } catch (error) {
              if (!isValidBufferTime) {
                // Should throw error for invalid buffer time
                expect(error.message).toMatch(/buffer.*time/i)
                
                // Should not call external services for validation errors
                expect(mockCachedOpenRouteClient.calculateIsochrone).not.toHaveBeenCalled()
              } else {
                // If buffer time is valid but still throws, it should be for other reasons
                // (like validation failures), not buffer time validation
                expect(error.message).not.toMatch(/buffer.*time/i)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})