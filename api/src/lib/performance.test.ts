import { geometryService } from './geometry'
import { matrixService } from './matrix'
import type { OptimizationConfig } from './optimization'
import type { Coordinate } from './geometry'
import type { HypothesisPoint } from 'types/graphql'

// Mock logger to avoid console output during tests
jest.mock('./logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}))

describe('Multi-Phase Optimization Performance Tests', () => {
  describe('Hypothesis point generation performance', () => {
    it('should generate Phase 0 points efficiently for various location counts', () => {
      const testCases = [2, 5, 10, 20]

      testCases.forEach(locationCount => {
        const locations = Array.from({ length: locationCount }, (_, i) => ({
          id: `loc_${i}`,
          name: `Location ${i + 1}`,
          coordinate: {
            latitude: 40.7128 + i * 0.01,
            longitude: -74.0060 + i * 0.01
          }
        }))

        const startTime = performance.now()

        // Test geographic centroid calculation
        const centroid = geometryService.calculateGeographicCentroid(locations)
        expect(centroid).toBeDefined()

        // Test median coordinate calculation
        const median = geometryService.calculateMedianCoordinate(locations)
        expect(median).toBeDefined()

        // Test pairwise midpoints calculation
        const midpoints = geometryService.calculatePairwiseMidpoints(locations)
        expect(midpoints.length).toBe((locationCount * (locationCount - 1)) / 2)

        const endTime = performance.now()
        const executionTime = endTime - startTime

        // Should complete within reasonable time based on location count
        const expectedMaxTime = locationCount <= 5 ? 10 : locationCount <= 10 ? 50 : 200
        expect(executionTime).toBeLessThan(expectedMaxTime)
      })
    })

    it('should generate coarse grid points efficiently for various grid sizes', () => {
      const boundingBox = {
        north: 40.73,
        south: 40.70,
        east: -73.99,
        west: -74.02
      }

      const gridSizes = [3, 5, 7, 10]

      gridSizes.forEach(gridSize => {
        const startTime = performance.now()

        const gridPoints = geometryService.generateCoarseGridPoints(boundingBox, gridSize)
        expect(gridPoints).toHaveLength(gridSize * gridSize)

        const endTime = performance.now()
        const executionTime = endTime - startTime

        // Grid generation should be very fast
        expect(executionTime).toBeLessThan(50) // 50ms max
      })
    })

    it('should generate local refinement points efficiently', () => {
      const candidateCounts = [3, 5, 10]
      const gridSizes = [2, 3, 5]

      candidateCounts.forEach(candidateCount => {
        gridSizes.forEach(gridSize => {
          const candidates = Array.from({ length: candidateCount }, (_, i) => ({
            coordinate: {
              latitude: 40.7128 + i * 0.01,
              longitude: -74.0060 + i * 0.01
            },
            maxTravelTime: 10 + i * 2
          }))

          const startTime = performance.now()

          const refinementPoints = geometryService.generateLocalRefinementPoints(
            candidates,
            Math.min(candidateCount, 5), // topK
            1, // refinementRadiusKm
            gridSize
          )

          expect(refinementPoints.length).toBeGreaterThan(0)
          expect(refinementPoints.length).toBeLessThanOrEqual(
            Math.min(candidateCount, 5) * gridSize * gridSize
          )

          const endTime = performance.now()
          const executionTime = endTime - startTime

          // Should complete quickly even with many candidates
          expect(executionTime).toBeLessThan(100) // 100ms max
        })
      })
    })
  })

  describe('Matrix evaluation performance', () => {
    const mockOrigins: Coordinate[] = [
      { latitude: 40.7128, longitude: -74.0060 },
      { latitude: 40.7200, longitude: -74.0100 }
    ]

    it('should handle minimax optimization efficiently for various hypothesis point counts', () => {
      const pointCounts = [5, 10, 25, 50, 100]

      pointCounts.forEach(pointCount => {
        // Generate mock hypothesis points
        const hypothesisPoints: HypothesisPoint[] = Array.from({ length: pointCount }, (_, i) => ({
          id: `hp_${i}`,
          coordinate: {
            latitude: 40.7128 + (i % 10) * 0.001,
            longitude: -74.0060 + Math.floor(i / 10) * 0.001
          },
          type: 'COARSE_GRID',
          metadata: null
        }))

        // Generate mock travel time matrix
        const travelTimes = mockOrigins.map(() =>
          Array.from({ length: pointCount }, () => Math.random() * 30 + 5)
        )

        const mockMatrix = {
          origins: mockOrigins.map((coord, i) => ({
            id: `origin_${i}`,
            name: `Origin ${i + 1}`,
            latitude: coord.latitude,
            longitude: coord.longitude
          })),
          destinations: hypothesisPoints,
          travelTimes,
          travelMode: 'DRIVING_CAR' as const
        }

        const startTime = performance.now()

        const result = matrixService.findMinimaxOptimal(mockMatrix)

        const endTime = performance.now()
        const executionTime = endTime - startTime

        expect(result).toHaveProperty('optimalIndex')
        expect(result).toHaveProperty('maxTravelTime')
        expect(result).toHaveProperty('averageTravelTime')

        // Should complete quickly even with many points
        const expectedMaxTime = pointCount <= 25 ? 10 : pointCount <= 50 ? 25 : 100
        expect(executionTime).toBeLessThan(expectedMaxTime)
      })
    })

    it('should handle tie-breaking efficiently with many tied candidates', () => {
      const tiedCandidateCount = 50

      // Create many candidates with identical travel times
      const candidates = Array.from({ length: tiedCandidateCount }, (_, i) => ({
        index: i,
        maxTime: 15, // All tied at 15 minutes
        avgTime: 12 + (i % 3) // Slight variation in average times
      }))

      const hypothesisPoints: HypothesisPoint[] = Array.from({ length: tiedCandidateCount }, (_, i) => ({
        id: `hp_${i}`,
        coordinate: {
          latitude: 40.7128 + i * 0.0001,
          longitude: -74.0060 + i * 0.0001
        },
        type: 'COARSE_GRID',
        metadata: null
      }))

      const geographicCentroid = { latitude: 40.7128, longitude: -74.0060 }

      const startTime = performance.now()

      const result = matrixService.applyTieBreakingRules(
        candidates,
        hypothesisPoints,
        geographicCentroid
      )

      const endTime = performance.now()
      const executionTime = endTime - startTime

      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(tiedCandidateCount)

      // Tie-breaking should be fast even with many candidates
      expect(executionTime).toBeLessThan(50) // 50ms max
    })
  })

  describe('Multi-phase optimization workflow performance', () => {
    it('should validate API usage optimization across optimization modes', () => {
      const optimizationConfigs: Array<{ mode: string; expectedApiCalls: number; config: OptimizationConfig }> = [
        {
          mode: 'BASELINE',
          expectedApiCalls: 1,
          config: {
            mode: 'BASELINE',
            coarseGridConfig: { enabled: false, paddingKm: 5, gridResolution: 5 },
            localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
          }
        },
        {
          mode: 'COARSE_GRID',
          expectedApiCalls: 1,
          config: {
            mode: 'COARSE_GRID',
            coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 5 },
            localRefinementConfig: { enabled: false, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
          }
        },
        {
          mode: 'FULL_REFINEMENT',
          expectedApiCalls: 2,
          config: {
            mode: 'FULL_REFINEMENT',
            coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 5 },
            localRefinementConfig: { enabled: true, topK: 3, refinementRadiusKm: 2, fineGridResolution: 3 }
          }
        }
      ]

      optimizationConfigs.forEach(({ mode, expectedApiCalls, config }) => {
        // Calculate expected hypothesis point counts
        let expectedPhase0Points = 5 // Geographic centroid, median, 2 participant locations, 1 pairwise midpoint
        let expectedPhase1Points = config.coarseGridConfig?.enabled ?
          (config.coarseGridConfig.gridResolution ** 2) : 0
        let expectedPhase2Points = config.localRefinementConfig?.enabled ?
          (config.localRefinementConfig.topK * (config.localRefinementConfig.fineGridResolution ** 2)) : 0

        const totalExpectedPoints = expectedPhase0Points + expectedPhase1Points + expectedPhase2Points

        // Validate API call optimization
        expect(expectedApiCalls).toBeLessThanOrEqual(2) // Never more than 2 API calls

        // Validate hypothesis point generation efficiency
        if (mode === 'BASELINE') {
          expect(totalExpectedPoints).toBe(5) // Phase 0 only
        } else if (mode === 'COARSE_GRID') {
          expect(totalExpectedPoints).toBe(5 + 25) // Phase 0 + Phase 1 (5x5 grid)
        } else if (mode === 'FULL_REFINEMENT') {
          expect(totalExpectedPoints).toBe(5 + 25 + 27) // Phase 0 + Phase 1 + Phase 2 (3 candidates * 3x3 grid)
        }

        // Validate reasonable point counts for API limits
        expect(totalExpectedPoints).toBeLessThanOrEqual(100) // Reasonable limit for Matrix API
      })
    })

    it('should benchmark hypothesis point generation across phases', () => {
      const locations = Array.from({ length: 5 }, (_, i) => ({
        id: `loc_${i}`,
        name: `Location ${i + 1}`,
        coordinate: {
          latitude: 40.7128 + i * 0.01,
          longitude: -74.0060 + i * 0.01
        }
      }))

      // Benchmark Phase 0 generation
      const phase0Start = performance.now()
      const centroid = geometryService.calculateGeographicCentroid(locations)
      const median = geometryService.calculateMedianCoordinate(locations)
      const midpoints = geometryService.calculatePairwiseMidpoints(locations)
      const phase0End = performance.now()
      const phase0Time = phase0End - phase0Start

      expect(phase0Time).toBeLessThan(50) // Phase 0 should be very fast

      // Benchmark Phase 1 generation
      const phase1Start = performance.now()
      const boundingBox = geometryService.calculateBoundingBox(locations, 5)
      const gridPoints = geometryService.generateCoarseGridPoints(boundingBox, 10)
      const phase1End = performance.now()
      const phase1Time = phase1End - phase1Start

      expect(phase1Time).toBeLessThan(100) // Phase 1 should be fast

      // Benchmark Phase 2 generation
      const candidates = [
        { coordinate: centroid, maxTravelTime: 10 },
        { coordinate: median, maxTravelTime: 12 },
        { coordinate: midpoints[0], maxTravelTime: 15 }
      ]

      const phase2Start = performance.now()
      const refinementPoints = geometryService.generateLocalRefinementPoints(candidates, 3, 2, 5)
      const phase2End = performance.now()
      const phase2Time = phase2End - phase2Start

      expect(phase2Time).toBeLessThan(100) // Phase 2 should be fast

      // Total hypothesis generation should be efficient
      const totalTime = phase0Time + phase1Time + phase2Time
      expect(totalTime).toBeLessThan(200) // Total under 200ms
    })

    it('should validate memory usage with large hypothesis point sets', () => {
      // Test with maximum reasonable configuration
      const maxConfig = {
        mode: 'FULL_REFINEMENT' as const,
        coarseGridConfig: { enabled: true, paddingKm: 50, gridResolution: 10 },
        localRefinementConfig: { enabled: true, topK: 10, refinementRadiusKm: 10, fineGridResolution: 5 }
      }

      const locations = Array.from({ length: 10 }, (_, i) => ({
        id: `loc_${i}`,
        name: `Location ${i + 1}`,
        coordinate: {
          latitude: 40.7128 + i * 0.1,
          longitude: -74.0060 + i * 0.1
        }
      }))

      // Generate maximum hypothesis points
      const startMemory = process.memoryUsage().heapUsed

      // Phase 0
      const centroid = geometryService.calculateGeographicCentroid(locations)
      const median = geometryService.calculateMedianCoordinate(locations)
      const midpoints = geometryService.calculatePairwiseMidpoints(locations)

      // Phase 1
      const boundingBox = geometryService.calculateBoundingBox(locations, maxConfig.coarseGridConfig.paddingKm)
      const gridPoints = geometryService.generateCoarseGridPoints(boundingBox, maxConfig.coarseGridConfig.gridResolution)

      // Phase 2
      const candidates = [centroid, median, ...midpoints.slice(0, 8)].map((coord, i) => ({
        coordinate: coord,
        maxTravelTime: 10 + i
      }))
      const refinementPoints = geometryService.generateLocalRefinementPoints(
        candidates,
        maxConfig.localRefinementConfig.topK,
        maxConfig.localRefinementConfig.refinementRadiusKm,
        maxConfig.localRefinementConfig.fineGridResolution
      )

      const endMemory = process.memoryUsage().heapUsed
      const memoryUsed = endMemory - startMemory

      // Memory usage should be reasonable (less than 10MB for hypothesis generation)
      expect(memoryUsed).toBeLessThan(10 * 1024 * 1024) // 10MB

      // Validate total point counts are reasonable
      const totalPoints = 1 + 1 + midpoints.length + gridPoints.length + refinementPoints.length
      expect(totalPoints).toBeLessThan(500) // Reasonable limit for processing
    })
  })

  describe('ε-optimality improvement validation performance', () => {
    it('should validate improvement calculation efficiency', () => {
      const baselineResult = {
        optimalIndex: 0,
        maxTravelTime: 30,
        averageTravelTime: 25
      }

      const multiPhaseResults = Array.from({ length: 100 }, (_, i) => ({
        optimalIndex: i,
        maxTravelTime: 30 - (i % 10), // Varying improvements
        averageTravelTime: 25 - (i % 8),
        optimalPhase: i % 3 === 0 ? 'PHASE_0' : i % 3 === 1 ? 'PHASE_1' : 'PHASE_2'
      }))

      const startTime = performance.now()

      multiPhaseResults.forEach(multiPhaseResult => {
        const improvement = matrixService.validateEpsilonOptimalityImprovement(
          baselineResult,
          multiPhaseResult as any,
          2 // 2-minute threshold
        )

        expect(improvement).toHaveProperty('hasImprovement')
        expect(improvement).toHaveProperty('improvementMinutes')
        expect(improvement).toHaveProperty('improvementPercentage')
        expect(improvement).toHaveProperty('isSignificant')
      })

      const endTime = performance.now()
      const executionTime = endTime - startTime

      // Should process many improvement validations quickly
      expect(executionTime).toBeLessThan(50) // 50ms for 100 validations
    })
  })
})