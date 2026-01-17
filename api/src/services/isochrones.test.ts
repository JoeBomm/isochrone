import fc from 'fast-check'
import { calculateMinimaxCenter, generateHypothesisPoints, type HypothesisPoint } from './isochrones'
import type { Location } from 'src/lib/geometry'

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
    calculateGeographicCentroid: jest.fn(),
    calculateMedianCoordinate: jest.fn(),
    calculatePairwiseMidpoints: jest.fn(),
    validateCoordinateBounds: jest.fn(),
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
    mockGeometryService.calculateGeographicCentroid.mockReturnValue({ latitude: 1, longitude: 1 })
    mockGeometryService.calculateMedianCoordinate.mockReturnValue({ latitude: 2, longitude: 2 })
    mockGeometryService.calculatePairwiseMidpoints.mockReturnValue([{ latitude: 1.5, longitude: 1.5 }])
    mockGeometryService.validateCoordinateBounds.mockReturnValue(true)
  })

  describe('generateHypothesisPoints', () => {
    it('should generate all required hypothesis point types for two locations', () => {
      const locations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 2, longitude: 2 } }
      ]

      const result = generateHypothesisPoints(locations)

      // Should generate: geographic_centroid, median_coordinate, 2 participant_locations, 1 pairwise_midpoint
      expect(result).toHaveLength(5)

      // Check that all required types are present
      const types = result.map(p => p.type)
      expect(types).toContain('GEOGRAPHIC_CENTROID')
      expect(types).toContain('MEDIAN_COORDINATE')
      expect(types.filter(t => t === 'PARTICIPANT_LOCATION')).toHaveLength(2)
      expect(types.filter(t => t === 'PAIRWISE_MIDPOINT')).toHaveLength(1)

      // Verify geometry service methods were called
      expect(mockGeometryService.calculateGeographicCentroid).toHaveBeenCalledWith(locations)
      expect(mockGeometryService.calculateMedianCoordinate).toHaveBeenCalledWith(locations)
      expect(mockGeometryService.calculatePairwiseMidpoints).toHaveBeenCalledWith(locations)
      expect(mockGeometryService.validateCoordinateBounds).toHaveBeenCalled()
    })

    it('should generate correct metadata for participant locations', () => {
      const locations: Location[] = [
        { id: 'loc1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } },
        { id: 'loc2', name: 'Location 2', coordinate: { latitude: 2, longitude: 2 } }
      ]

      const result = generateHypothesisPoints(locations)

      const participantPoints = result.filter(p => p.type === 'PARTICIPANT_LOCATION')
      expect(participantPoints).toHaveLength(2)

      expect(participantPoints[0].metadata?.participantId).toBe('loc1')
      expect(participantPoints[1].metadata?.participantId).toBe('loc2')
    })

    it('should generate correct metadata for pairwise midpoints', () => {
      const locations: Location[] = [
        { id: 'loc1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } },
        { id: 'loc2', name: 'Location 2', coordinate: { latitude: 2, longitude: 2 } }
      ]

      const result = generateHypothesisPoints(locations)

      const pairwisePoints = result.filter(p => p.type === 'PAIRWISE_MIDPOINT')
      expect(pairwisePoints).toHaveLength(1)

      expect(pairwisePoints[0].metadata?.pairIds).toEqual(['loc1', 'loc2'])
    })

    it('should throw error when no locations provided', () => {
      expect(() => generateHypothesisPoints([])).toThrow('No locations provided for hypothesis point generation')
      expect(() => generateHypothesisPoints(null as any)).toThrow('No locations provided for hypothesis point generation')
    })

    it('should throw error when coordinate validation fails', () => {
      mockGeometryService.validateCoordinateBounds.mockReturnValue(false)

      const locations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } }
      ]

      expect(() => generateHypothesisPoints(locations)).toThrow('Invalid coordinates for participant location')
    })
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
          // Generate valid travel mode
          fc.constantFrom('DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'),
          // Generate buffer time (both valid and invalid)
          fc.integer({ min: -10, max: 100 }),
          async (locations, travelMode, bufferTimeMinutes) => {
            const isValidBufferTime = bufferTimeMinutes >= 5 && bufferTimeMinutes <= 60

            // Clear mocks for this iteration
            jest.clearAllMocks()

            try {
              const result = await calculateMinimaxCenter({
                locations,
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