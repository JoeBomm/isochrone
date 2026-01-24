import { calculateMinimaxCenter } from './isochrones'

// Mock the geometry service for multi-phase tests
jest.mock('src/lib/geometry', () => {
  const mockCentroid = { latitude: 40.715, longitude: -74.005 }
  const mockPairwiseMidpoints = [
    { latitude: 40.7164, longitude: -74.008 },
    { latitude: 40.7214, longitude: -74.013 },
    { latitude: 40.7250, longitude: -74.015 }
  ]
  const mockBoundingBox = {
    north: 40.73,
    south: 40.70,
    east: -73.99,
    west: -74.02
  }
  const mockCoarseGridPoints = Array.from({ length: 25 }, (_, i) => ({
    latitude: 40.705 + (Math.floor(i / 5) * 0.005),
    longitude: -74.015 + ((i % 5) * 0.0025)
  }))
  const mockLocalRefinementPoints = Array.from({ length: 27 }, (_, i) => ({
    latitude: 40.7145 + (Math.floor(i / 9) * 0.001),
    longitude: -74.0075 + ((i % 9) * 0.0005)
  }))

  return {
    geometryService: {
      calculateGeographicCentroid: jest.fn().mockReturnValue(mockCentroid),
      calculateMedianCoordinate: jest.fn().mockReturnValue(mockCentroid),
      calculatePairwiseMidpoints: jest.fn().mockReturnValue(mockPairwiseMidpoints),
      validateCoordinateBounds: jest.fn().mockReturnValue(true),
      calculateBoundingBox: jest.fn().mockReturnValue(mockBoundingBox),
      generateCoarseGridPoints: jest.fn().mockReturnValue(mockCoarseGridPoints),
      generateLocalRefinementPoints: jest.fn().mockReturnValue(mockLocalRefinementPoints)
    }
  }
})

// Mock the OpenRoute service
jest.mock('src/lib/cachedOpenroute', () => ({
  cachedOpenRouteClient: {
    calculateIsochrone: jest.fn().mockResolvedValue({
      type: 'Polygon',
      coordinates: [[[
        [-74.01, 40.71], [-74.00, 40.71], [-74.00, 40.72], [-74.01, 40.72], [-74.01, 40.71]
      ]]]
    }),
    calculateTravelTimeMatrix: jest.fn().mockResolvedValue({
      origins: [
        { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
        { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 },
        { id: 'origin_2', name: 'Origin 3', latitude: 40.7300, longitude: -74.0200 }
      ],
      destinations: [], // Will be populated by the service
      travelTimes: [], // Will be populated by the service
      travelMode: 'DRIVING_CAR'
    })
  }
}))

// Mock the matrix service
jest.mock('src/lib/matrix', () => ({
  matrixService: {
    evaluateBatchedMatrix: jest.fn().mockResolvedValue({
      combinedMatrix: {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 },
          { id: 'origin_2', name: 'Origin 3', latitude: 40.7300, longitude: -74.0200 }
        ],
        destinations: Array.from({ length: 32 }, (_, i) => ({
          id: `dest_${i}`,
          coordinate: { latitude: 40.715 + (i * 0.001), longitude: -74.005 + (i * 0.001) },
          type: i < 8 ? 'GEOGRAPHIC_CENTROID' : 'COARSE_GRID_CELL',
          metadata: null
        })),
        travelTimes: [
          Array.from({ length: 32 }, () => Math.floor(Math.random() * 20) + 10),
          Array.from({ length: 32 }, () => Math.floor(Math.random() * 20) + 10),
          Array.from({ length: 32 }, () => Math.floor(Math.random() * 20) + 10)
        ],
        travelMode: 'DRIVING_CAR'
      },
      phaseResults: [
        {
          phase: 'PHASE_0',
          matrix: {
            origins: [
              { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
              { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 },
              { id: 'origin_2', name: 'Origin 3', latitude: 40.7300, longitude: -74.0200 }
            ],
            destinations: Array.from({ length: 8 }, (_, i) => ({
              id: `dest_${i}`,
              coordinate: { latitude: 40.715 + (i * 0.001), longitude: -74.005 + (i * 0.001) },
              type: 'PHASE_0',
              metadata: null
            })),
            travelTimes: [
              Array.from({ length: 8 }, () => Math.floor(Math.random() * 15) + 10),
              Array.from({ length: 8 }, () => Math.floor(Math.random() * 15) + 10),
              Array.from({ length: 8 }, () => Math.floor(Math.random() * 15) + 10)
            ],
            travelMode: 'DRIVING_CAR'
          },
          hypothesisPoints: Array.from({ length: 8 }, (_, i) => ({
            id: `dest_${i}`,
            coordinate: { latitude: 40.715 + (i * 0.001), longitude: -74.005 + (i * 0.001) },
            type: 'PHASE_0',
            metadata: null
          })),
          startIndex: 0,
          endIndex: 8
        }
      ],
      totalHypothesisPoints: Array.from({ length: 32 }, (_, i) => ({
        id: `dest_${i}`,
        coordinate: { latitude: 40.715 + (i * 0.001), longitude: -74.005 + (i * 0.001) },
        type: i < 8 ? 'GEOGRAPHIC_CENTROID' : 'COARSE_GRID_CELL',
        metadata: null
      }))
    }),
    evaluatePhase2Matrix: jest.fn().mockResolvedValue({
      phase: 'PHASE_2',
      matrix: {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 },
          { id: 'origin_2', name: 'Origin 3', latitude: 40.7300, longitude: -74.0200 }
        ],
        destinations: Array.from({ length: 27 }, (_, i) => ({
          id: `dest_phase2_${i}`,
          coordinate: { latitude: 40.7145 + (i * 0.0001), longitude: -74.0075 + (i * 0.0001) },
          type: 'LOCAL_REFINEMENT',
          metadata: null
        })),
        travelTimes: [
          Array.from({ length: 27 }, () => Math.floor(Math.random() * 12) + 8),
          Array.from({ length: 27 }, () => Math.floor(Math.random() * 12) + 8),
          Array.from({ length: 27 }, () => Math.floor(Math.random() * 12) + 8)
        ],
        travelMode: 'DRIVING_CAR'
      },
      hypothesisPoints: Array.from({ length: 27 }, (_, i) => ({
        id: `dest_phase2_${i}`,
        coordinate: { latitude: 40.7145 + (i * 0.0001), longitude: -74.0075 + (i * 0.0001) },
        type: 'LOCAL_REFINEMENT',
        metadata: null
      })),
      startIndex: 0,
      endIndex: 27
    }),
    findMultiPhaseMinimaxOptimal: jest.fn().mockReturnValue({
      optimalIndex: 5,
      maxTravelTime: 15,
      averageTravelTime: 12.5,
      optimalPhase: 'PHASE_1',
      optimalHypothesisPoint: {
        id: 'dest_5',
        coordinate: { latitude: 40.715, longitude: -74.005 },
        type: 'COARSE_GRID_CELL',
        metadata: null
      }
    }),
    validateEpsilonOptimalityImprovement: jest.fn().mockReturnValue({
      hasImprovement: true,
      improvementMinutes: 3,
      improvementPercentage: 16.7,
      isSignificant: true
    }),
    mergeMatrixResults: jest.fn().mockImplementation((batchedResult, phase2Result) => {
      if (phase2Result) {
        return {
          ...batchedResult.combinedMatrix,
          destinations: [...batchedResult.combinedMatrix.destinations, ...phase2Result.matrix.destinations],
          travelTimes: batchedResult.combinedMatrix.travelTimes.map((row, i) =>
            [...row, ...phase2Result.matrix.travelTimes[i]]
          )
        }
      }
      return batchedResult.combinedMatrix
    })
  }
}))

describe('Multi-Phase Optimization Integration Tests', () => {
  const testLocations = [
    { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
    { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
    { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('BASELINE optimization mode', () => {
    it('should complete workflow with Phase 0 only', async () => {
      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'BASELINE',
          coarseGridConfig: {
            enabled: false,
            paddingKm: 5,
            gridResolution: 5
          },
          localRefinementConfig: {
            enabled: false,
            topK: 3,
            refinementRadiusKm: 2,
            fineGridResolution: 3
          }
        }
      })

      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')
      expect(result).toHaveProperty('individualIsochrones')
      expect(result.centerPoint.latitude).toBeGreaterThan(-90)
      expect(result.centerPoint.latitude).toBeLessThan(90)
      expect(result.centerPoint.longitude).toBeGreaterThan(-180)
      expect(result.centerPoint.longitude).toBeLessThan(180)
      expect(result.fairMeetingArea.type).toBe('Polygon')
      expect(Array.isArray(result.individualIsochrones)).toBe(true)

      // Verify only Phase 0 hypothesis generation was used
      const { geometryService } = require('src/lib/geometry')
      expect(geometryService.calculateGeographicCentroid).toHaveBeenCalled()
      expect(geometryService.calculateMedianCoordinate).toHaveBeenCalled()
      expect(geometryService.calculatePairwiseMidpoints).toHaveBeenCalled()
      expect(geometryService.generateCoarseGridPoints).not.toHaveBeenCalled()
      expect(geometryService.generateLocalRefinementPoints).not.toHaveBeenCalled()
    })
  })

  describe('COARSE_GRID optimization mode', () => {
    it('should complete workflow with Phase 0+1', async () => {
      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'COARSE_GRID',
          coarseGridConfig: {
            enabled: true,
            paddingKm: 5,
            gridResolution: 5
          },
          localRefinementConfig: {
            enabled: false,
            topK: 3,
            refinementRadiusKm: 2,
            fineGridResolution: 3
          }
        }
      })

      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')
      expect(result).toHaveProperty('individualIsochrones')
      expect(result.centerPoint.latitude).toBeGreaterThan(-90)
      expect(result.centerPoint.latitude).toBeLessThan(90)
      expect(result.centerPoint.longitude).toBeGreaterThan(-180)
      expect(result.centerPoint.longitude).toBeLessThan(180)
      expect(result.fairMeetingArea.type).toBe('Polygon')

      // Verify both Phase 0 and Phase 1 hypothesis generation was used
      const { geometryService } = require('src/lib/geometry')
      expect(geometryService.calculateGeographicCentroid).toHaveBeenCalled()
      expect(geometryService.calculateMedianCoordinate).toHaveBeenCalled()
      expect(geometryService.calculatePairwiseMidpoints).toHaveBeenCalled()
      expect(geometryService.calculateBoundingBox).toHaveBeenCalled()
      expect(geometryService.generateCoarseGridPoints).toHaveBeenCalled()
      expect(geometryService.generateLocalRefinementPoints).not.toHaveBeenCalled()

      // Verify batched matrix evaluation was called
      const { matrixService } = require('src/lib/matrix')
      expect(matrixService.evaluateBatchedMatrix).toHaveBeenCalledTimes(1)
      expect(matrixService.evaluatePhase2Matrix).not.toHaveBeenCalled()
    })

    it('should handle API call optimization for Phase 0+1', async () => {
      await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'COARSE_GRID',
          coarseGridConfig: {
            enabled: true,
            paddingKm: 5,
            gridResolution: 5
          },
          localRefinementConfig: {
            enabled: false,
            topK: 3,
            refinementRadiusKm: 2,
            fineGridResolution: 3
          }
        }
      })

      // Verify matrix service was called for batched evaluation
      const { matrixService } = require('src/lib/matrix')
      expect(matrixService.evaluateBatchedMatrix).toHaveBeenCalledTimes(1)

      // Verify the batched evaluation includes both Phase 0 and Phase 1 points
      const batchedCall = matrixService.evaluateBatchedMatrix.mock.calls[0]
      expect(batchedCall[1]).toBeDefined() // phase0Points
      expect(batchedCall[2]).toBeDefined() // phase1Points
      expect(Array.isArray(batchedCall[1])).toBe(true)
      expect(Array.isArray(batchedCall[2])).toBe(true)
    })
  })

  describe('FULL_REFINEMENT optimization mode', () => {
    it('should complete workflow with all phases (0+1+2)', async () => {
      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'FULL_REFINEMENT',
          coarseGridConfig: {
            enabled: true,
            paddingKm: 5,
            gridResolution: 5
          },
          localRefinementConfig: {
            enabled: true,
            topK: 3,
            refinementRadiusKm: 2,
            fineGridResolution: 3
          }
        }
      })

      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')
      expect(result).toHaveProperty('individualIsochrones')
      expect(result.centerPoint.latitude).toBeGreaterThan(-90)
      expect(result.centerPoint.latitude).toBeLessThan(90)
      expect(result.centerPoint.longitude).toBeGreaterThan(-180)
      expect(result.centerPoint.longitude).toBeLessThan(180)
      expect(result.fairMeetingArea.type).toBe('Polygon')

      // Verify all phases of hypothesis generation were used
      const { geometryService } = require('src/lib/geometry')
      expect(geometryService.calculateGeographicCentroid).toHaveBeenCalled()
      expect(geometryService.calculateMedianCoordinate).toHaveBeenCalled()
      expect(geometryService.calculatePairwiseMidpoints).toHaveBeenCalled()
      expect(geometryService.calculateBoundingBox).toHaveBeenCalled()
      expect(geometryService.generateCoarseGridPoints).toHaveBeenCalled()
      expect(geometryService.generateLocalRefinementPoints).toHaveBeenCalled()

      // Verify both batched and Phase 2 matrix evaluations were called
      const { matrixService } = require('src/lib/matrix')
      expect(matrixService.evaluateBatchedMatrix).toHaveBeenCalledTimes(1)
      expect(matrixService.evaluatePhase2Matrix).toHaveBeenCalledTimes(1)
      expect(matrixService.findMultiPhaseMinimaxOptimal).toHaveBeenCalledTimes(1)
    })

    it('should demonstrate multi-phase optimization workflow', async () => {
      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'FULL_REFINEMENT',
          coarseGridConfig: {
            enabled: true,
            paddingKm: 5,
            gridResolution: 5
          },
          localRefinementConfig: {
            enabled: true,
            topK: 3,
            refinementRadiusKm: 2,
            fineGridResolution: 3
          }
        }
      })

      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')

      // Verify the multi-phase optimization workflow was executed
      const { matrixService } = require('src/lib/matrix')

      // Check that batched matrix evaluation was called with proper parameters
      expect(matrixService.evaluateBatchedMatrix).toHaveBeenCalledWith(
        expect.any(Array), // origins
        expect.any(Array), // phase0Points
        expect.any(Array), // phase1Points
        'DRIVING_CAR',
        expect.any(Function) // matrix calculation function
      )

      // Check that Phase 2 matrix evaluation was called
      expect(matrixService.evaluatePhase2Matrix).toHaveBeenCalledWith(
        expect.any(Array), // origins
        expect.any(Array), // phase2Points
        'DRIVING_CAR',
        expect.any(Function) // matrix calculation function
      )

      // Check that multi-phase minimax optimization was called
      expect(matrixService.findMultiPhaseMinimaxOptimal).toHaveBeenCalledWith(
        expect.any(Object), // batchedResult
        expect.any(Object)  // phase2Result
      )
    })

    it('should handle API call optimization (maximum 2 calls)', async () => {
      await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'FULL_REFINEMENT',
          coarseGridConfig: {
            enabled: true,
            paddingKm: 5,
            gridResolution: 5
          },
          localRefinementConfig: {
            enabled: true,
            topK: 3,
            refinementRadiusKm: 2,
            fineGridResolution: 3
          }
        }
      })

      // Verify that matrix service methods were called appropriately
      const { matrixService } = require('src/lib/matrix')
      expect(matrixService.evaluateBatchedMatrix).toHaveBeenCalledTimes(1) // Phase 0+1 combined
      expect(matrixService.evaluatePhase2Matrix).toHaveBeenCalledTimes(1)  // Phase 2 separate

      // This demonstrates API call optimization: 1 call for Phase 0+1, 1 call for Phase 2
      // Total: 2 API calls maximum as per requirements 7.1, 7.2
    })
  })

  describe('Multi-phase error handling and fallback', () => {
    it('should handle coarse grid failures appropriately', async () => {
      const { matrixService } = require('src/lib/matrix')

      // Mock coarse grid failure
      matrixService.evaluateBatchedMatrix.mockRejectedValueOnce(
        new Error('Coarse grid matrix evaluation failed')
      )

      // The service should throw an appropriate error when coarse grid fails
      await expect(calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'COARSE_GRID',
          coarseGridConfig: {
            enabled: true,
            paddingKm: 5,
            gridResolution: 5
          },
          localRefinementConfig: {
            enabled: false,
            topK: 3,
            refinementRadiusKm: 2,
            fineGridResolution: 3
          }
        }
      })).rejects.toThrow('Coarse grid matrix calculation failed')

      // Verify the error handling was triggered
      expect(matrixService.evaluateBatchedMatrix).toHaveBeenCalledTimes(1)
    })

    it('should handle Phase 2 failures gracefully', async () => {
      const { matrixService } = require('src/lib/matrix')

      // Mock Phase 2 failure - the service should continue without Phase 2
      matrixService.evaluatePhase2Matrix.mockRejectedValueOnce(
        new Error('Local refinement matrix evaluation failed')
      )

      // Reset the multi-phase optimal mock to return a valid result from Phase 0+1
      matrixService.findMultiPhaseMinimaxOptimal.mockReturnValue({
        optimalIndex: 8, // Phase 1 result
        maxTravelTime: 15,
        averageTravelTime: 13.5,
        optimalPhase: 'PHASE_1',
        optimalHypothesisPoint: {
          id: 'dest_8',
          coordinate: { latitude: 40.715, longitude: -74.005 },
          type: 'COARSE_GRID_CELL',
          metadata: null
        }
      })

      // This should succeed despite Phase 2 failure
      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'FULL_REFINEMENT',
          coarseGridConfig: {
            enabled: true,
            paddingKm: 5,
            gridResolution: 5
          },
          localRefinementConfig: {
            enabled: true,
            topK: 3,
            refinementRadiusKm: 2,
            fineGridResolution: 3
          }
        }
      })

      // Should return result from Phase 0+1 without Phase 2
      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')
      expect(result.centerPoint.latitude).toBeGreaterThan(-90)
      expect(result.centerPoint.latitude).toBeLessThan(90)

      // Verify Phase 2 was attempted but failed gracefully
      expect(matrixService.evaluatePhase2Matrix).toHaveBeenCalledTimes(1)
      expect(matrixService.findMultiPhaseMinimaxOptimal).toHaveBeenCalledWith(
        expect.any(Object), // batchedResult
        undefined // phase2Result should be undefined due to failure
      )
    })
  })

  describe('Performance validation', () => {
    it('should respect API usage limits across all optimization modes', async () => {
      // Test BASELINE mode
      await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'BASELINE',
          coarseGridConfig: { enabled: false, paddingKm: 5, gridResolution: 5 },
          localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })

      // Test COARSE_GRID mode
      await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'COARSE_GRID',
          coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 5 },
          localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })

      // Test FULL_REFINEMENT mode
      await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'FULL_REFINEMENT',
          coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 5 },
          localRefinementConfig: { enabled: true, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })

      // Verify matrix service calls follow API optimization patterns
      const { matrixService } = require('src/lib/matrix')

      // BASELINE: 1 batched call, no Phase 2
      // COARSE_GRID: 1 batched call, no Phase 2
      // FULL_REFINEMENT: 1 batched call, 1 Phase 2 call
      // Total: 4 batched calls, 1 Phase 2 call
      expect(matrixService.evaluateBatchedMatrix).toHaveBeenCalledTimes(3)
      expect(matrixService.evaluatePhase2Matrix).toHaveBeenCalledTimes(1)

      // This demonstrates API call optimization: never more than 2 calls per optimization
    })

    it('should validate hypothesis point generation performance', async () => {
      const startTime = Date.now()

      await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'FULL_REFINEMENT',
          coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 5 },
          localRefinementConfig: { enabled: true, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })

      const endTime = Date.now()
      const executionTime = endTime - startTime

      // Should complete within reasonable time
      expect(executionTime).toBeLessThan(5000) // 5 seconds

      // Verify all hypothesis generation methods were called efficiently
      const { geometryService } = require('src/lib/geometry')
      expect(geometryService.calculateGeographicCentroid).toHaveBeenCalledTimes(1)
      expect(geometryService.calculateMedianCoordinate).toHaveBeenCalledTimes(1)
      expect(geometryService.calculatePairwiseMidpoints).toHaveBeenCalledTimes(1)
      expect(geometryService.calculateBoundingBox).toHaveBeenCalledTimes(1)
      expect(geometryService.generateCoarseGridPoints).toHaveBeenCalledTimes(1)
      expect(geometryService.generateLocalRefinementPoints).toHaveBeenCalledTimes(1)
    })

    it('should validate matrix evaluation performance with reasonable point counts', async () => {
      await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'FULL_REFINEMENT',
          coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 5 },
          localRefinementConfig: { enabled: true, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })

      const { matrixService } = require('src/lib/matrix')

      // Verify batched matrix was called with reasonable point counts
      const batchedCall = matrixService.evaluateBatchedMatrix.mock.calls[0]
      const origins = batchedCall[0]
      const phase0Points = batchedCall[1]
      const phase1Points = batchedCall[2]

      expect(origins.length).toBe(3) // 3 test locations
      expect(phase0Points.length).toBeGreaterThan(0)
      expect(phase0Points.length).toBeLessThan(20) // Reasonable Phase 0 count
      expect(phase1Points.length).toBeGreaterThan(0)
      expect(phase1Points.length).toBeLessThan(50) // Reasonable Phase 1 count

      // Verify Phase 2 matrix was called with reasonable point counts
      const phase2Call = matrixService.evaluatePhase2Matrix.mock.calls[0]
      const phase2Origins = phase2Call[0]
      const phase2Points = phase2Call[1]

      expect(phase2Origins.length).toBe(3) // Same origins
      expect(phase2Points.length).toBeGreaterThan(0)
      expect(phase2Points.length).toBeLessThan(50) // Reasonable Phase 2 count
    })
  })
})