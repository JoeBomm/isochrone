import { geometryService } from './geometry'
import { matrixService } from './matrix'

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
          type: 'COARSE_GRID_CELL',
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
        type: 'COARSE_GRID_CELL',
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
})
