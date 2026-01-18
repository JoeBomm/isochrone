import fc from 'fast-check'
import {
  calculateMinimaxCenter,
  generateHypothesisPoints,
  generateMultiPhaseHypothesisPoints,
  generateLocalRefinementHypothesisPoints,
  DEFAULT_OPTIMIZATION_CONFIG,
  type HypothesisPoint,
  type OptimizationConfig
} from './isochrones'
import type { Location } from 'src/lib/geometry'

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
    calculateBoundingBox: jest.fn(),
    generateCoarseGridPoints: jest.fn(),
    generateLocalRefinementPoints: jest.fn(),
  }
}))

import { cachedOpenRouteClient } from 'src/lib/cachedOpenroute'
import { geometryService } from 'src/lib/geometry'
import { matrixService } from 'src/lib/matrix'

const mockCachedOpenRouteClient = cachedOpenRouteClient as jest.Mocked<typeof cachedOpenRouteClient>
const mockGeometryService = geometryService as jest.Mocked<typeof geometryService>
const mockMatrixService = matrixService as jest.Mocked<typeof matrixService>

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
    mockCachedOpenRouteClient.calculateTravelTimeMatrix.mockResolvedValue({
      origins: [{ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 }],
      destinations: [{ latitude: 0.5, longitude: 0.5 }],
      travelTimes: [[10], [15]],
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
        origins: [{ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 }],
        destinations: [{ latitude: 0.5, longitude: 0.5 }],
        travelTimes: [[10], [15]],
        travelMode: 'DRIVING_CAR'
      },
      phaseResults: [{
        phase: 'PHASE_0',
        matrix: {
          origins: [{ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 }],
          destinations: [{ latitude: 0.5, longitude: 0.5 }],
          travelTimes: [[10], [15]],
          travelMode: 'DRIVING_CAR'
        },
        hypothesisPoints: [{
          id: 'test',
          coordinate: { latitude: 0.5, longitude: 0.5 },
          type: 'GEOGRAPHIC_CENTROID',
          metadata: null
        }],
        startIndex: 0,
        endIndex: 1
      }],
      totalHypothesisPoints: [{
        id: 'test',
        coordinate: { latitude: 0.5, longitude: 0.5 },
        type: 'GEOGRAPHIC_CENTROID',
        metadata: null
      }]
    })

    mockMatrixService.findMultiPhaseMinimaxOptimal.mockReturnValue({
      optimalIndex: 0,
      maxTravelTime: 15,
      averageTravelTime: 12.5,
      optimalPhase: 'PHASE_0',
      optimalHypothesisPoint: {
        id: 'test',
        coordinate: { latitude: 0.5, longitude: 0.5 },
        type: 'GEOGRAPHIC_CENTROID',
        metadata: null
      }
    })

    mockGeometryService.validatePolygonOverlap.mockReturnValue(true)
    mockGeometryService.calculatePolygonUnion.mockReturnValue(mockPolygon)
    mockGeometryService.calculateCentroid.mockReturnValue({ latitude: 0.5, longitude: 0.5 })
    mockGeometryService.calculateGeographicCentroid.mockReturnValue({ latitude: 1, longitude: 1 })
    mockGeometryService.calculateMedianCoordinate.mockReturnValue({ latitude: 1.1, longitude: 1.1 })
    mockGeometryService.calculatePairwiseMidpoints.mockReturnValue([{ latitude: 1.5, longitude: 1.5 }])
    mockGeometryService.validateCoordinateBounds.mockReturnValue(true)
    mockGeometryService.calculateBoundingBox.mockReturnValue({
      north: 2, south: 0, east: 2, west: 0
    })
    mockGeometryService.generateCoarseGridPoints.mockReturnValue([
      { latitude: 0.5, longitude: 0.5 },
      { latitude: 0.5, longitude: 1.5 },
      { latitude: 1.5, longitude: 0.5 },
      { latitude: 1.5, longitude: 1.5 },
      { latitude: 2.5, longitude: 2.5 } // Add one more to get 5 coarse grid points
    ])
    mockGeometryService.generateLocalRefinementPoints.mockReturnValue([
      { latitude: 1.1, longitude: 1.1 },
      { latitude: 1.2, longitude: 1.2 }
    ])
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

  describe('generateMultiPhaseHypothesisPoints', () => {
    it('should generate baseline points with BASELINE mode', () => {
      const locations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 2, longitude: 2 } }
      ]

      const config: OptimizationConfig = {
        mode: 'BASELINE',
        coarseGridConfig: { enabled: false, paddingKm: 5, gridResolution: 5 },
        localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
      }

      const result = generateMultiPhaseHypothesisPoints(locations, config)

      // Should only generate baseline points (5 for 2 locations)
      expect(result).toHaveLength(5)
      expect(mockGeometryService.calculateBoundingBox).not.toHaveBeenCalled()
      expect(mockGeometryService.generateCoarseGridPoints).not.toHaveBeenCalled()
    })

    it('should generate baseline + coarse grid points with COARSE_GRID mode', () => {
      const locations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 2, longitude: 2 } }
      ]

      const config: OptimizationConfig = {
        mode: 'COARSE_GRID',
        coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 2 },
        localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
      }

      const result = generateMultiPhaseHypothesisPoints(locations, config)

      // Should generate baseline (5) + coarse grid (4) = 9 points
      expect(result).toHaveLength(9)
      expect(mockGeometryService.calculateBoundingBox).toHaveBeenCalledWith(locations, 5)
      expect(mockGeometryService.generateCoarseGridPoints).toHaveBeenCalled()
    })

    it('should use default configuration when none provided', () => {
      const locations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 2, longitude: 2 } }
      ]

      const result = generateMultiPhaseHypothesisPoints(locations)

      // Should use DEFAULT_OPTIMIZATION_CONFIG (BASELINE mode)
      expect(result).toHaveLength(5)
      expect(mockGeometryService.calculateBoundingBox).not.toHaveBeenCalled()
    })

    it('should remove duplicate points', () => {
      const locations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 2, longitude: 2 } }
      ]

      // Mock duplicate coordinates in coarse grid
      mockGeometryService.generateCoarseGridPoints.mockReturnValue([
        { latitude: 1, longitude: 1 }, // Same as geographic centroid
        { latitude: 0.5, longitude: 0.5 }
      ])

      const config: OptimizationConfig = {
        mode: 'COARSE_GRID',
        coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 2 },
        localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
      }

      const result = generateMultiPhaseHypothesisPoints(locations, config)

      // Should have fewer points due to duplicate removal
      expect(result.length).toBeLessThan(7) // Less than baseline (5) + coarse grid (2)
    })

    it('should filter out invalid coordinates', () => {
      const locations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } }
      ]

      // Mock only 2 coarse grid points for this test
      mockGeometryService.generateCoarseGridPoints.mockReturnValueOnce([
        { latitude: 0.5, longitude: 0.5 },
        { latitude: 1.5, longitude: 1.5 }
      ])

      // Mock coordinates as valid during baseline generation, then filter some out in multi-phase filtering
      mockGeometryService.validateCoordinateBounds
        .mockReturnValueOnce(true)  // participant location validation in generateHypothesisPoints - valid
        .mockReturnValueOnce(true)  // geographic centroid in baseline final validation - valid
        .mockReturnValueOnce(true)  // median coordinate in baseline final validation - valid
        .mockReturnValueOnce(true)  // participant location in baseline final validation - valid
        .mockReturnValueOnce(false) // geographic centroid in multi-phase final filter - invalid
        .mockReturnValueOnce(true)  // median coordinate in multi-phase final filter - valid
        .mockReturnValueOnce(true)  // participant location in multi-phase final filter - valid
        .mockReturnValueOnce(true)  // coarse grid point 1 in multi-phase final filter - valid
        .mockReturnValueOnce(false) // coarse grid point 2 in multi-phase final filter - invalid

      const config: OptimizationConfig = {
        mode: 'COARSE_GRID',
        coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 2 },
        localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
      }

      const result = generateMultiPhaseHypothesisPoints(locations, config)

      // Should only include valid points (baseline: 2 valid, coarse grid: 1 valid = 3 total)
      expect(result.length).toBe(3)
    })

    it('should throw error when no locations provided', () => {
      expect(() => generateMultiPhaseHypothesisPoints([])).toThrow('No locations provided for multi-phase hypothesis point generation')
      expect(() => generateMultiPhaseHypothesisPoints(null as any)).toThrow('No locations provided for multi-phase hypothesis point generation')
    })

    it('should throw error when no valid points generated', () => {
      const locations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } }
      ]

      // Mock coordinates as valid during baseline generation but all invalid during multi-phase filtering
      mockGeometryService.validateCoordinateBounds
        .mockReturnValueOnce(true)  // participant location validation in generateHypothesisPoints
        .mockReturnValueOnce(true)  // geographic centroid in baseline final validation
        .mockReturnValueOnce(true)  // median coordinate in baseline final validation
        .mockReturnValueOnce(true)  // participant location in baseline final validation
        .mockReturnValueOnce(false) // geographic centroid in multi-phase final filter - invalid
        .mockReturnValueOnce(false) // median coordinate in multi-phase final filter - invalid
        .mockReturnValueOnce(false) // participant location in multi-phase final filter - invalid

      expect(() => generateMultiPhaseHypothesisPoints(locations)).toThrow('No valid hypothesis points generated from multi-phase generation')
    })
  })

  describe('generateLocalRefinementHypothesisPoints', () => {
    it('should generate refinement points from candidates', () => {
      const candidates = [
        { coordinate: { latitude: 45.5, longitude: -122.7 }, maxTravelTime: 10 },
        { coordinate: { latitude: 45.6, longitude: -122.6 }, maxTravelTime: 15 }
      ]

      const config = {
        topK: 2,
        refinementRadiusKm: 2,
        fineGridResolution: 3
      }

      const result = generateLocalRefinementHypothesisPoints(candidates, config)

      expect(result).toHaveLength(2) // Mocked to return 2 points
      expect(result[0].type).toBe('LOCAL_REFINEMENT')
      expect(result[0].id).toMatch(/^local_refinement_/)
      expect(mockGeometryService.generateLocalRefinementPoints).toHaveBeenCalledWith(
        candidates, 2, 2, 3
      )
    })

    it('should assign unique IDs to refinement points', () => {
      const candidates = [
        { coordinate: { latitude: 45.5, longitude: -122.7 }, maxTravelTime: 10 }
      ]

      const config = {
        topK: 1,
        refinementRadiusKm: 1,
        fineGridResolution: 2
      }

      const result = generateLocalRefinementHypothesisPoints(candidates, config)

      const ids = result.map(p => p.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length) // All IDs should be unique
    })

    it('should throw error when candidates array is empty', () => {
      const config = {
        topK: 1,
        refinementRadiusKm: 1,
        fineGridResolution: 2
      }

      // Mock the geometry service to throw an error for empty candidates
      mockGeometryService.generateLocalRefinementPoints.mockImplementationOnce(() => {
        throw new Error('No candidates provided for local refinement')
      })

      expect(() => generateLocalRefinementHypothesisPoints([], config)).toThrow('Local refinement hypothesis generation failed')
    })
  })

  describe('DEFAULT_OPTIMIZATION_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_OPTIMIZATION_CONFIG.mode).toBe('BASELINE')
      expect(DEFAULT_OPTIMIZATION_CONFIG.coarseGridConfig?.enabled).toBe(false)
      expect(DEFAULT_OPTIMIZATION_CONFIG.coarseGridConfig?.paddingKm).toBe(5)
      expect(DEFAULT_OPTIMIZATION_CONFIG.coarseGridConfig?.gridResolution).toBe(5)
      expect(DEFAULT_OPTIMIZATION_CONFIG.localRefinementConfig?.enabled).toBe(false)
      expect(DEFAULT_OPTIMIZATION_CONFIG.localRefinementConfig?.topK).toBe(3)
      expect(DEFAULT_OPTIMIZATION_CONFIG.localRefinementConfig?.refinementRadiusKm).toBe(2)
      expect(DEFAULT_OPTIMIZATION_CONFIG.localRefinementConfig?.fineGridResolution).toBe(3)
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