import { calculateMinimaxCenter } from './isochrones'
import { cachedOpenRouteClient } from 'src/lib/cachedOpenroute'
import { matrixService } from 'src/lib/matrix'
import { geometryService } from 'src/lib/geometry'

// Mock logger to avoid console output during tests
jest.mock('src/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}))

// Mock the geometry service for performance tests
jest.mock('src/lib/geometry', () => {
  const mockCentroid = { latitude: 40.715, longitude: -74.005 }
  const mockPairwiseMidpoints = Array.from({ length: 10 }, (_, i) => ({
    latitude: 40.7164 + i * 0.001,
    longitude: -74.008 + i * 0.001
  }))
  const mockBoundingBox = {
    north: 40.73,
    south: 40.70,
    east: -73.99,
    west: -74.02
  }

  return {
    geometryService: {
      calculateGeographicCentroid: jest.fn().mockReturnValue(mockCentroid),
      calculateMedianCoordinate: jest.fn().mockReturnValue(mockCentroid),
      calculatePairwiseMidpoints: jest.fn().mockReturnValue(mockPairwiseMidpoints),
      validateCoordinateBounds: jest.fn().mockReturnValue(true),
      calculateBoundingBox: jest.fn().mockReturnValue(mockBoundingBox),
      generateCoarseGridPoints: jest.fn().mockImplementation((boundingBox, gridResolution) =>
        Array.from({ length: gridResolution * gridResolution }, (_, i) => ({
          latitude: 40.705 + (Math.floor(i / gridResolution) * 0.005),
          longitude: -74.015 + ((i % gridResolution) * 0.0025)
        }))
      ),
      generateLocalRefinementPoints: jest.fn().mockImplementation((candidates, topK, radiusKm, fineGridResolution) =>
        Array.from({ length: Math.min(topK, candidates.length) * fineGridResolution * fineGridResolution }, (_, i) => ({
          latitude: 40.7145 + (Math.floor(i / (fineGridResolution * fineGridResolution)) * 0.001) + (Math.floor((i % (fineGridResolution * fineGridResolution)) / fineGridResolution) * 0.0001),
          longitude: -74.0075 + ((i % fineGridResolution) * 0.0001)
        }))
      )
    }
  }
})

// Mock the OpenRoute service for performance tests
jest.mock('src/lib/cachedOpenroute', () => ({
  cachedOpenRouteClient: {
    calculateIsochrone: jest.fn().mockResolvedValue({
      type: 'Polygon',
      coordinates: [[[
        [-74.01, 40.71], [-74.00, 40.71], [-74.00, 40.72], [-74.01, 40.72], [-74.01, 40.71]
      ]]]
    }),
    calculateTravelTimeMatrix: jest.fn().mockImplementation(async (origins, destinations, travelMode) => {
      // Simulate realistic API response time
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200))

      // Generate realistic travel times based on distance
      const travelTimes = origins.map(origin =>
        destinations.map(dest => {
          const distance = Math.sqrt(
            Math.pow(origin.latitude - dest.coordinate.latitude, 2) +
            Math.pow(origin.longitude - dest.coordinate.longitude, 2)
          )
          return Math.max(5, Math.floor(distance * 1000 + Math.random() * 10))
        })
      )

      return {
        origins: origins.map((origin, i) => ({
          id: `origin_${i}`,
          name: origin.name || `Origin ${i + 1}`,
          latitude: origin.latitude,
          longitude: origin.longitude
        })),
        destinations: destinations.map((dest, i) => ({
          id: `dest_${i}`,
          coordinate: dest.coordinate,
          type: dest.type || 'UNKNOWN',
          metadata: dest.metadata || null
        })),
        travelTimes,
        travelMode
      }
    })
  }
}))

// Mock the matrix service for performance tests
jest.mock('src/lib/matrix', () => ({
  matrixService: {
    evaluateBatchedMatrix: jest.fn().mockImplementation(async (origins, phase0Points, phase1Points, travelMode, matrixCalculationFn) => {
      const allDestinations = [...phase0Points, ...phase1Points]
      const mockMatrix = await matrixCalculationFn(origins, allDestinations, travelMode)

      return {
        combinedMatrix: mockMatrix,
        phaseResults: [
          {
            phase: 'PHASE_0',
            matrix: {
              ...mockMatrix,
              destinations: phase0Points,
              travelTimes: mockMatrix.travelTimes.map(row => row.slice(0, phase0Points.length))
            },
            hypothesisPoints: phase0Points,
            startIndex: 0,
            endIndex: phase0Points.length
          },
          ...(phase1Points.length > 0 ? [{
            phase: 'PHASE_1',
            matrix: {
              ...mockMatrix,
              destinations: phase1Points,
              travelTimes: mockMatrix.travelTimes.map(row => row.slice(phase0Points.length))
            },
            hypothesisPoints: phase1Points,
            startIndex: phase0Points.length,
            endIndex: phase0Points.length + phase1Points.length
          }] : [])
        ],
        totalHypothesisPoints: allDestinations
      }
    }),
    evaluatePhase2Matrix: jest.fn().mockImplementation(async (origins, phase2Points, travelMode, matrixCalculationFn) => {
      const mockMatrix = await matrixCalculationFn(origins, phase2Points, travelMode)

      return {
        phase: 'PHASE_2',
        matrix: mockMatrix,
        hypothesisPoints: phase2Points,
        startIndex: 0,
        endIndex: phase2Points.length
      }
    }),
    findMultiPhaseMinimaxOptimal: jest.fn().mockImplementation((batchedResult, phase2Result) => {
      const allDestinations = [...batchedResult.combinedMatrix.destinations]
      if (phase2Result) {
        allDestinations.push(...phase2Result.matrix.destinations)
      }

      // Simulate minimax optimization time
      const startTime = performance.now()
      const optimalIndex = Math.floor(Math.random() * allDestinations.length)
      const endTime = performance.now()

      return {
        optimalIndex,
        maxTravelTime: 15 + Math.random() * 10,
        averageTravelTime: 12 + Math.random() * 8,
        optimalPhase: optimalIndex < batchedResult.phaseResults[0].endIndex ? 'PHASE_0' :
                     phase2Result && optimalIndex >= batchedResult.combinedMatrix.destinations.length ? 'PHASE_2' : 'PHASE_1',
        optimalHypothesisPoint: allDestinations[optimalIndex],
        optimizationTimeMs: endTime - startTime
      }
    }),
    validateEpsilonOptimalityImprovement: jest.fn().mockReturnValue({
      hasImprovement: true,
      improvementMinutes: 2 + Math.random() * 3,
      improvementPercentage: 10 + Math.random() * 15,
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

describe('Performance Validation Tests - Requirements 7.1, 7.2, 7.3', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('API usage limits validation (Requirement 7.1)', () => {
    it('should respect API usage limits for BASELINE optimization mode', async () => {
      const testLocations = Array.from({ length: 5 }, (_, i) => ({
        name: `Location ${i + 1}`,
        latitude: 40.7128 + i * 0.01,
        longitude: -74.0060 + i * 0.01
      }))

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

      // BASELINE should use exactly 1 Matrix API call
      expect(cachedOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(1)
    })

    it('should respect API usage limits for COARSE_GRID optimization mode', async () => {
      const testLocations = Array.from({ length: 5 }, (_, i) => ({
        name: `Location ${i + 1}`,
        latitude: 40.7128 + i * 0.01,
        longitude: -74.0060 + i * 0.01
      }))

      await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'COARSE_GRID',
          coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 7 },
          localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })

      // COARSE_GRID should use exactly 1 Matrix API call (Phase 0+1 combined)
      expect(cachedOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(1)
    })

    it('should respect API usage limits for FULL_REFINEMENT optimization mode', async () => {
      const testLocations = Array.from({ length: 5 }, (_, i) => ({
        name: `Location ${i + 1}`,
        latitude: 40.7128 + i * 0.01,
        longitude: -74.0060 + i * 0.01
      }))

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

      // FULL_REFINEMENT should use at most 2 Matrix API calls (Phase 0+1 combined, Phase 2 separate)
      expect(cachedOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(2)
    })

    it('should validate API usage across multiple optimization runs', async () => {
      const testLocations = Array.from({ length: 3 }, (_, i) => ({
        name: `Location ${i + 1}`,
        latitude: 40.7128 + i * 0.01,
        longitude: -74.0060 + i * 0.01
      }))

      // Run multiple optimizations to test cumulative API usage
      const optimizationConfigs = [
        { mode: 'BASELINE' as const, expectedCalls: 1 },
        { mode: 'COARSE_GRID' as const, expectedCalls: 1 },
        { mode: 'FULL_REFINEMENT' as const, expectedCalls: 2 }
      ]

      let totalExpectedCalls = 0

      for (const { mode, expectedCalls } of optimizationConfigs) {
        await calculateMinimaxCenter({
          locations: testLocations,
          bufferTimeMinutes: 10,
          travelMode: 'DRIVING_CAR',
          optimizationConfig: {
            mode,
            coarseGridConfig: { enabled: mode !== 'BASELINE', paddingKm: 5, gridResolution: 5 },
            localRefinementConfig: { enabled: mode === 'FULL_REFINEMENT', topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
          }
        })

        totalExpectedCalls += expectedCalls
      }

      // Validate total API usage doesn't exceed expected limits
      expect(cachedOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(totalExpectedCalls)
      expect(totalExpectedCalls).toBe(4) // 1 + 1 + 2 = 4 total calls
    })

    it('should validate hypothesis point counts stay within reasonable API limits', async () => {
      const testLocations = Array.from({ length: 8 }, (_, i) => ({
        name: `Location ${i + 1}`,
        latitude: 40.7128 + i * 0.01,
        longitude: -74.0060 + i * 0.01
      }))

      // Test with maximum reasonable configuration
      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'FULL_REFINEMENT',
          coarseGridConfig: { enabled: true, paddingKm: 10, gridResolution: 10 },
          localRefinementConfig: { enabled: true, topK: 5, refinementRadiusKm: 3, fineGridResolution: 5 }
        }
      })

      // Validate hypothesis point counts are reasonable for API limits
      const totalPoints = result.optimizationMetadata?.totalHypothesisPoints || 0
      expect(totalPoints).toBeLessThan(200) // Reasonable limit for Matrix API

      // Validate phase breakdown
      const breakdown = result.optimizationMetadata?.hypothesisPointBreakdown
      expect(breakdown?.phase0Points).toBeLessThan(50) // Phase 0 should be reasonable
      expect(breakdown?.phase1Points).toBeLessThan(100) // Phase 1 should be reasonable (10x10 = 100 max)
      expect(breakdown?.phase2Points).toBeLessThan(125) // Phase 2 should be reasonable (5 candidates * 5x5 = 125 max)
    })
  })

  describe('Response time validation (Requirement 7.2)', () => {
    it('should complete BASELINE optimization within acceptable time limits', async () => {
      const testLocations = Array.from({ length: 5 }, (_, i) => ({
        name: `Location ${i + 1}`,
        latitude: 40.7128 + i * 0.01,
        longitude: -74.0060 + i * 0.01
      }))

      const startTime = Date.now()

      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'BASELINE',
          coarseGridConfig: { enabled: false, paddingKm: 5, gridResolution: 5 },
          localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })

      const endTime = Date.now()
      const executionTime = endTime - startTime

      // BASELINE should complete quickly (under 2 seconds)
      expect(executionTime).toBeLessThan(2000)
      expect(result).toHaveProperty('centerPoint')
      expect(result.optimizationMetadata?.performanceMetrics?.totalExecutionTimeMs).toBeLessThan(2000)
    })

    it('should complete COARSE_GRID optimization within acceptable time limits', async () => {
      const testLocations = Array.from({ length: 5 }, (_, i) => ({
        name: `Location ${i + 1}`,
        latitude: 40.7128 + i * 0.01,
        longitude: -74.0060 + i * 0.01
      }))

      const startTime = Date.now()

      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'COARSE_GRID',
          coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 7 },
          localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })

      const endTime = Date.now()
      const executionTime = endTime - startTime

      // COARSE_GRID should complete within reasonable time (under 3 seconds)
      expect(executionTime).toBeLessThan(3000)
      expect(result).toHaveProperty('centerPoint')
      expect(result.optimizationMetadata?.performanceMetrics?.totalExecutionTimeMs).toBeLessThan(3000)
    })

    it('should complete FULL_REFINEMENT optimization within acceptable time limits', async () => {
      const testLocations = Array.from({ length: 5 }, (_, i) => ({
        name: `Location ${i + 1}`,
        latitude: 40.7128 + i * 0.01,
        longitude: -74.0060 + i * 0.01
      }))

      const startTime = Date.now()

      const result = await calculateMinimaxCenter({
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

      // FULL_REFINEMENT should complete within reasonable time (under 5 seconds)
      expect(executionTime).toBeLessThan(5000)
      expect(result).toHaveProperty('centerPoint')
      expect(result.optimizationMetadata?.performanceMetrics?.totalExecutionTimeMs).toBeLessThan(5000)
    })

    it('should validate response times scale reasonably with location count', async () => {
      const locationCounts = [2, 5, 8, 10]
      const responseTimeResults: Array<{ locationCount: number; executionTime: number }> = []

      for (const locationCount of locationCounts) {
        const testLocations = Array.from({ length: locationCount }, (_, i) => ({
          name: `Location ${i + 1}`,
          latitude: 40.7128 + i * 0.01,
          longitude: -74.0060 + i * 0.01
        }))

        const startTime = Date.now()

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

        const endTime = Date.now()
        const executionTime = endTime - startTime

        responseTimeResults.push({ locationCount, executionTime })

        // Each configuration should complete within reasonable time
        expect(executionTime).toBeLessThan(5000) // 5 seconds max
      }

      // Validate that response times don't grow exponentially
      for (let i = 1; i < responseTimeResults.length; i++) {
        const current = responseTimeResults[i]
        const previous = responseTimeResults[i - 1]

        // Response time shouldn't more than double with each increase in location count
        expect(current.executionTime).toBeLessThan(previous.executionTime * 2.5)
      }
    })

    it('should validate response times for different grid resolutions', async () => {
      const testLocations = Array.from({ length: 3 }, (_, i) => ({
        name: `Location ${i + 1}`,
        latitude: 40.7128 + i * 0.01,
        longitude: -74.0060 + i * 0.01
      }))

      const gridResolutions = [3, 5, 7, 10]
      const responseTimeResults: Array<{ gridResolution: number; executionTime: number }> = []

      for (const gridResolution of gridResolutions) {
        const startTime = Date.now()

        await calculateMinimaxCenter({
          locations: testLocations,
          bufferTimeMinutes: 10,
          travelMode: 'DRIVING_CAR',
          optimizationConfig: {
            mode: 'COARSE_GRID',
            coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution },
            localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
          }
        })

        const endTime = Date.now()
        const executionTime = endTime - startTime

        responseTimeResults.push({ gridResolution, executionTime })

        // Each grid resolution should complete within reasonable time
        expect(executionTime).toBeLessThan(4000) // 4 seconds max
      }

      // Validate that response times scale reasonably with grid size
      const maxTime = Math.max(...responseTimeResults.map(r => r.executionTime))
      const minTime = Math.min(...responseTimeResults.map(r => r.executionTime))

      // Max time shouldn't be more than 3x min time for reasonable grid sizes
      expect(maxTime).toBeLessThan(minTime * 3)
    })
  })

  describe('Caching effectiveness validation (Requirement 7.3)', () => {
    it('should demonstrate cache effectiveness for repeated requests', async () => {
      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
        { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
      ]

      // First request - should populate cache
      const startTime1 = Date.now()
      const result1 = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'COARSE_GRID',
          coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 5 },
          localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })
      const endTime1 = Date.now()
      const executionTime1 = endTime1 - startTime1

      // Second request - should benefit from cache
      const startTime2 = Date.now()
      const result2 = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'COARSE_GRID',
          coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 5 },
          localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })
      const endTime2 = Date.now()
      const executionTime2 = endTime2 - startTime2

      // Validate both requests succeeded
      expect(result1).toHaveProperty('centerPoint')
      expect(result2).toHaveProperty('centerPoint')

      // Results should be identical (from cache)
      expect(result1.centerPoint).toEqual(result2.centerPoint)
      expect(result1.fairMeetingArea).toEqual(result2.fairMeetingArea)

      // Second request should be faster due to caching (or at least not significantly slower)
      expect(executionTime2).toBeLessThanOrEqual(executionTime1 * 1.2) // Allow 20% variance
    })

    it('should validate cache effectiveness with location proximity matching', async () => {
      const baseLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 }
      ]

      // First request
      await calculateMinimaxCenter({
        locations: baseLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'BASELINE',
          coarseGridConfig: { enabled: false, paddingKm: 5, gridResolution: 5 },
          localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })

      // Second request with locations within 100m (should hit cache due to proximity matching)
      const nearbyLocations = [
        { name: 'Location A Nearby', latitude: 40.7129, longitude: -74.0061 }, // ~111m away
        { name: 'Location B Nearby', latitude: 40.7201, longitude: -74.0101 }  // ~111m away
      ]

      const startTime = Date.now()
      const result = await calculateMinimaxCenter({
        locations: nearbyLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'BASELINE',
          coarseGridConfig: { enabled: false, paddingKm: 5, gridResolution: 5 },
          localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })
      const endTime = Date.now()
      const executionTime = endTime - startTime

      // Should complete quickly due to cache hit
      expect(result).toHaveProperty('centerPoint')
      expect(executionTime).toBeLessThan(1000) // Should be fast due to caching
    })

    it('should validate cache effectiveness across different optimization phases', async () => {
      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
        { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
      ]

      // Run BASELINE first (should cache Phase 0 results)
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

      // Run COARSE_GRID (should benefit from cached Phase 0 results)
      const startTime = Date.now()
      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'COARSE_GRID',
          coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 5 },
          localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })
      const endTime = Date.now()
      const executionTime = endTime - startTime

      // Should complete efficiently due to partial cache hits
      expect(result).toHaveProperty('centerPoint')
      expect(result.optimizationMetadata?.mode).toBe('COARSE_GRID')
      expect(executionTime).toBeLessThan(4000) // Should be reasonably fast
    })

    it('should validate cache statistics and hit rates', async () => {
      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 }
      ]

      // Multiple requests to build up cache statistics
      for (let i = 0; i < 3; i++) {
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
      }

      // Validate that cache was utilized (fewer API calls than requests)
      const totalApiCalls = cachedOpenRouteClient.calculateTravelTimeMatrix.mock.calls.length
      expect(totalApiCalls).toBeLessThan(3) // Should be fewer calls due to caching
    })
  })

  describe('System stability under load (Requirement 7.3)', () => {
    it('should maintain stability with concurrent optimization requests', async () => {
      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
        { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
      ]

      // Run multiple concurrent optimizations
      const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
        calculateMinimaxCenter({
          locations: testLocations.map(loc => ({
            ...loc,
            latitude: loc.latitude + i * 0.001 // Slight variation to avoid identical cache hits
          })),
          bufferTimeMinutes: 10,
          travelMode: 'DRIVING_CAR',
          optimizationConfig: {
            mode: 'COARSE_GRID',
            coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 5 },
            localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
          }
        })
      )

      const startTime = Date.now()
      const results = await Promise.all(concurrentRequests)
      const endTime = Date.now()
      const totalExecutionTime = endTime - startTime

      // All requests should succeed
      expect(results).toHaveLength(5)
      results.forEach(result => {
        expect(result).toHaveProperty('centerPoint')
        expect(result).toHaveProperty('fairMeetingArea')
        expect(result.optimizationMetadata?.mode).toBe('COARSE_GRID')
      })

      // Concurrent execution should be reasonably efficient
      expect(totalExecutionTime).toBeLessThan(10000) // 10 seconds for 5 concurrent requests
    })

    it('should handle memory usage efficiently with large configurations', async () => {
      const testLocations = Array.from({ length: 10 }, (_, i) => ({
        name: `Location ${i + 1}`,
        latitude: 40.7128 + i * 0.01,
        longitude: -74.0060 + i * 0.01
      }))

      const initialMemory = process.memoryUsage().heapUsed

      // Run optimization with large configuration
      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'FULL_REFINEMENT',
          coarseGridConfig: { enabled: true, paddingKm: 10, gridResolution: 8 },
          localRefinementConfig: { enabled: true, topK: 5, refinementRadiusKm: 3, fineGridResolution: 4 }
        }
      })

      const finalMemory = process.memoryUsage().heapUsed
      const memoryUsed = finalMemory - initialMemory

      // Should complete successfully
      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')

      // Memory usage should be reasonable (less than 50MB for large configuration)
      expect(memoryUsed).toBeLessThan(50 * 1024 * 1024) // 50MB
    })

    it('should validate error recovery and system stability', async () => {
      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 }
      ]

      // Mock a temporary API failure
      cachedOpenRouteClient.calculateTravelTimeMatrix
        .mockRejectedValueOnce(new Error('Temporary API failure'))
        .mockResolvedValueOnce({
          origins: testLocations.map((loc, i) => ({
            id: `origin_${i}`,
            name: loc.name,
            latitude: loc.latitude,
            longitude: loc.longitude
          })),
          destinations: [],
          travelTimes: [[], []],
          travelMode: 'DRIVING_CAR'
        })

      // First request should fail
      await expect(calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'BASELINE',
          coarseGridConfig: { enabled: false, paddingKm: 5, gridResolution: 5 },
          localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })).rejects.toThrow()

      // System should recover and handle subsequent requests
      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR',
        optimizationConfig: {
          mode: 'BASELINE',
          coarseGridConfig: { enabled: false, paddingKm: 5, gridResolution: 5 },
          localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
        }
      })

      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')
    })

    it('should validate performance consistency across multiple runs', async () => {
      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
        { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
      ]

      const executionTimes: number[] = []

      // Run multiple optimizations to test consistency
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now()

        const result = await calculateMinimaxCenter({
          locations: testLocations.map(loc => ({
            ...loc,
            latitude: loc.latitude + i * 0.0001 // Slight variation to avoid cache hits
          })),
          bufferTimeMinutes: 10,
          travelMode: 'DRIVING_CAR',
          optimizationConfig: {
            mode: 'COARSE_GRID',
            coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 5 },
            localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
          }
        })

        const endTime = Date.now()
        const executionTime = endTime - startTime
        executionTimes.push(executionTime)

        expect(result).toHaveProperty('centerPoint')
        expect(result).toHaveProperty('fairMeetingArea')
      }

      // Validate performance consistency
      const avgExecutionTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
      const maxExecutionTime = Math.max(...executionTimes)
      const minExecutionTime = Math.min(...executionTimes)

      // Performance should be consistent (max shouldn't be more than 2x min)
      expect(maxExecutionTime).toBeLessThan(minExecutionTime * 2)
      expect(avgExecutionTime).toBeLessThan(5000) // Average should be under 5 seconds
    })
  })
})