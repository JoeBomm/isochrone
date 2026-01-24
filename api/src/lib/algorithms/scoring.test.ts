import type { HypothesisPoint } from 'types/graphql'

import {
  TravelTimeScoringService,
  scoringService,
  OptimizationGoal,
  extractTravelTimesForDestination,
  convertTravelTimeMatrix,
  type PerPersonTravelTime,
  type TravelTimeMetrics,
  type ScoringConfig,
} from './scoring'

describe('TravelTimeScoringService', () => {
  let service: TravelTimeScoringService

  beforeEach(() => {
    service = new TravelTimeScoringService()
  })

  describe('calculateTravelTimeMetrics', () => {
    it('should calculate correct metrics for valid travel times', () => {
      const travelTimes: PerPersonTravelTime[] = [
        { outbound: 10 },
        { outbound: 20 },
        { outbound: 30 },
      ]

      const metrics = service.calculateTravelTimeMetrics(travelTimes, true)

      expect(metrics.maxTravelTime).toBe(30)
      expect(metrics.averageTravelTime).toBe(20)
      expect(metrics.totalTravelTime).toBe(60)
      expect(metrics.variance).toBeCloseTo(66.67, 1) // ((10-20)² + (20-20)² + (30-20)²) / 3
    })

    it('should calculate metrics without variance when not requested', () => {
      const travelTimes: PerPersonTravelTime[] = [
        { outbound: 15 },
        { outbound: 25 },
      ]

      const metrics = service.calculateTravelTimeMetrics(travelTimes, false)

      expect(metrics.maxTravelTime).toBe(25)
      expect(metrics.averageTravelTime).toBe(20)
      expect(metrics.totalTravelTime).toBe(40)
      expect(metrics.variance).toBeUndefined()
    })

    it('should handle single travel time correctly', () => {
      const travelTimes: PerPersonTravelTime[] = [{ outbound: 42 }]

      const metrics = service.calculateTravelTimeMetrics(travelTimes, true)

      expect(metrics.maxTravelTime).toBe(42)
      expect(metrics.averageTravelTime).toBe(42)
      expect(metrics.totalTravelTime).toBe(42)
      expect(metrics.variance).toBe(0) // No variance with single value
    })

    it('should throw error for empty travel times', () => {
      expect(() => {
        service.calculateTravelTimeMetrics([], false)
      }).toThrow('No travel times provided for metrics calculation')
    })

    it('should throw error for invalid travel times', () => {
      const invalidTravelTimes: PerPersonTravelTime[] = [
        { outbound: 10 },
        { outbound: -5 }, // Invalid negative time
        { outbound: Infinity }, // Invalid infinite time
      ]

      expect(() => {
        service.calculateTravelTimeMetrics(invalidTravelTimes, false)
      }).toThrow('Invalid travel times found')
    })
  })

  describe('calculateScore', () => {
    const sampleMetrics: TravelTimeMetrics = {
      maxTravelTime: 30,
      averageTravelTime: 20,
      totalTravelTime: 60,
      variance: 50,
    }

    it('should calculate score for MINIMAX goal', () => {
      const score = service.calculateScore(
        sampleMetrics,
        OptimizationGoal.MINIMAX
      )
      expect(score).toBe(30) // Should return max travel time
    })

    it('should calculate score for MEAN goal', () => {
      const score = service.calculateScore(sampleMetrics, OptimizationGoal.MEAN)
      expect(score).toBe(50) // Should return variance
    })

    it('should calculate score for MIN goal', () => {
      const score = service.calculateScore(sampleMetrics, OptimizationGoal.MIN)
      expect(score).toBe(60) // Should return total travel time
    })

    it('should throw error for MEAN goal without variance', () => {
      const metricsWithoutVariance: TravelTimeMetrics = {
        maxTravelTime: 30,
        averageTravelTime: 20,
        totalTravelTime: 60,
        // variance is undefined
      }

      expect(() => {
        service.calculateScore(metricsWithoutVariance, OptimizationGoal.MEAN)
      }).toThrow('Variance not calculated for MEAN goal')
    })

    it('should throw error for invalid metrics', () => {
      const invalidMetrics = {
        maxTravelTime: NaN,
        averageTravelTime: 20,
        totalTravelTime: 60,
      } as TravelTimeMetrics

      expect(() => {
        service.calculateScore(invalidMetrics, OptimizationGoal.MINIMAX)
      }).toThrow('Invalid maxTravelTime in metrics')
    })
  })

  describe('scorePoints', () => {
    const samplePoints: HypothesisPoint[] = [
      {
        id: 'point1',
        coordinate: { latitude: 45.5, longitude: -122.7 },
        type: 'GEOGRAPHIC_CENTROID',
        metadata: null,
      },
      {
        id: 'point2',
        coordinate: { latitude: 45.6, longitude: -122.6 },
        type: 'MEDIAN_COORDINATE',
        metadata: null,
      },
      {
        id: 'point3',
        coordinate: { latitude: 45.7, longitude: -122.5 },
        type: 'PARTICIPANT_LOCATION',
        metadata: null,
      },
    ]

    const sampleTravelTimeData: PerPersonTravelTime[][] = [
      [{ outbound: 10 }, { outbound: 20 }, { outbound: 30 }], // Point 1: avg=20, total=60
      [{ outbound: 15 }, { outbound: 15 }, { outbound: 15 }], // Point 2: avg=15, total=45
      [{ outbound: 25 }, { outbound: 5 }, { outbound: 30 }], // Point 3: avg=20, total=60
    ]

    it('should produce different rankings for different optimization goals', () => {
      // Test MINIMAX
      const minimaxConfig: ScoringConfig = {
        optimizationGoal: OptimizationGoal.MINIMAX,
      }
      const minimaxResults = service.scorePoints(
        samplePoints,
        sampleTravelTimeData,
        minimaxConfig
      )

      // Point 2 should be best (lowest max: 15)
      expect(minimaxResults[0].id).toBe('point2')
      expect(minimaxResults[0].score).toBe(15)

      // Test MIN
      const minConfig: ScoringConfig = {
        optimizationGoal: OptimizationGoal.MIN,
      }
      const minResults = service.scorePoints(
        samplePoints,
        sampleTravelTimeData,
        minConfig
      )

      // Point 2 should be best (lowest total: 45)
      expect(minResults[0].id).toBe('point2')
      expect(minResults[0].score).toBe(45)

      // Test MEAN
      const meanConfig: ScoringConfig = {
        optimizationGoal: OptimizationGoal.MEAN,
      }
      const meanResults = service.scorePoints(
        samplePoints,
        sampleTravelTimeData,
        meanConfig
      )

      // Point 2 should be best (zero variance: all times are 15)
      expect(meanResults[0].id).toBe('point2')
      expect(meanResults[0].score).toBe(0)
    })

    it('should calculate travel time metrics correctly with new data structure', () => {
      const config: ScoringConfig = {
        optimizationGoal: OptimizationGoal.MINIMAX,
      }
      const results = service.scorePoints(
        samplePoints,
        sampleTravelTimeData,
        config
      )

      // Check that metrics are calculated correctly for each point
      const point1Result = results.find((r) => r.id === 'point1')
      expect(point1Result?.travelTimeMetrics.averageTravelTime).toBe(20)
      expect(point1Result?.travelTimeMetrics.maxTravelTime).toBe(30)
      expect(point1Result?.travelTimeMetrics.totalTravelTime).toBe(60)

      const point2Result = results.find((r) => r.id === 'point2')
      expect(point2Result?.travelTimeMetrics.averageTravelTime).toBe(15)
      expect(point2Result?.travelTimeMetrics.maxTravelTime).toBe(15)
      expect(point2Result?.travelTimeMetrics.totalTravelTime).toBe(45)
    })

    it('should sort results by score (lower is better)', () => {
      const config: ScoringConfig = {
        optimizationGoal: OptimizationGoal.MINIMAX,
      }
      const results = service.scorePoints(
        samplePoints,
        sampleTravelTimeData,
        config
      )

      // Results should be sorted by score in ascending order
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i - 1].score)
      }
    })

    it('should handle empty points array', () => {
      const config: ScoringConfig = {
        optimizationGoal: OptimizationGoal.MINIMAX,
      }

      expect(() => {
        service.scorePoints([], [], config)
      }).toThrow('No hypothesis points provided for scoring')
    })

    it('should handle mismatched array lengths', () => {
      const config: ScoringConfig = {
        optimizationGoal: OptimizationGoal.MINIMAX,
      }

      expect(() => {
        service.scorePoints(samplePoints, [sampleTravelTimeData[0]], config) // Only 1 travel time data for 3 points
      }).toThrow('Mismatch between points (3) and travel time data (1)')
    })

    it('should handle invalid optimization goal', () => {
      const config = { optimizationGoal: 'INVALID_GOAL' as OptimizationGoal }

      expect(() => {
        service.scorePoints(samplePoints, sampleTravelTimeData, config)
      }).toThrow('Invalid optimization goal: INVALID_GOAL')
    })

    it('should skip points with invalid travel time data', () => {
      const pointsWithInvalidData = [...samplePoints]
      const travelTimeDataWithInvalid = [
        ...sampleTravelTimeData,
        [], // Empty travel time data for additional point
      ]
      pointsWithInvalidData.push({
        id: 'invalid_point',
        coordinate: { latitude: 45.8, longitude: -122.4 },
        type: 'COARSE_GRID_CELL',
        metadata: null,
      })

      const config: ScoringConfig = {
        optimizationGoal: OptimizationGoal.MINIMAX,
      }
      const results = service.scorePoints(
        pointsWithInvalidData,
        travelTimeDataWithInvalid,
        config
      )

      // Should only return results for valid points (original 3)
      expect(results).toHaveLength(3)
      expect(results.find((r) => r.id === 'invalid_point')).toBeUndefined()
    })
  })

  describe('utility functions', () => {
    describe('extractTravelTimesForDestination', () => {
      const sampleMatrix = [
        [10, 20, 30], // Origin 0 to destinations 0, 1, 2
        [15, 25, 35], // Origin 1 to destinations 0, 1, 2
        [12, 22, 32], // Origin 2 to destinations 0, 1, 2
      ]

      it('should extract travel times for specific destination', () => {
        const result = extractTravelTimesForDestination(sampleMatrix, 1)

        expect(result).toHaveLength(3)
        expect(result[0].outbound).toBe(20) // Origin 0 to destination 1
        expect(result[1].outbound).toBe(25) // Origin 1 to destination 1
        expect(result[2].outbound).toBe(22) // Origin 2 to destination 1
      })

      it('should throw error for invalid destination index', () => {
        expect(() => {
          extractTravelTimesForDestination(sampleMatrix, 5) // Index out of bounds
        }).toThrow('Invalid destination index 5 for origin 0')
      })

      it('should throw error for negative destination index', () => {
        expect(() => {
          extractTravelTimesForDestination(sampleMatrix, -1)
        }).toThrow('Destination index must be non-negative')
      })
    })

    describe('convertTravelTimeMatrix', () => {
      const sampleMatrix = [
        [10, 20],
        [15, 25],
        [12, 22],
      ]

      it('should convert entire matrix to PerPersonTravelTime format', () => {
        const result = convertTravelTimeMatrix(sampleMatrix)

        expect(result).toHaveLength(2) // 2 destinations

        // Destination 0
        expect(result[0]).toHaveLength(3) // 3 origins
        expect(result[0][0].outbound).toBe(10)
        expect(result[0][1].outbound).toBe(15)
        expect(result[0][2].outbound).toBe(12)

        // Destination 1
        expect(result[1]).toHaveLength(3) // 3 origins
        expect(result[1][0].outbound).toBe(20)
        expect(result[1][1].outbound).toBe(25)
        expect(result[1][2].outbound).toBe(22)
      })

      it('should throw error for empty matrix', () => {
        expect(() => {
          convertTravelTimeMatrix([])
        }).toThrow('No travel time matrix provided')
      })

      it('should throw error for matrix with no destinations', () => {
        expect(() => {
          convertTravelTimeMatrix([[]])
        }).toThrow('Travel time matrix has no destinations')
      })
    })
  })

  describe('singleton instance', () => {
    it('should export a singleton scoring service instance', () => {
      expect(scoringService).toBeInstanceOf(TravelTimeScoringService)
      expect(scoringService).toBe(scoringService) // Same instance
    })
  })

  describe('OptimizationGoal enum', () => {
    it('should have all expected optimization goals', () => {
      expect(OptimizationGoal.MINIMAX).toBe('MINIMAX')
      expect(OptimizationGoal.MEAN).toBe('MEAN')
      expect(OptimizationGoal.MIN).toBe('MIN')
    })

    it('should have exactly 3 optimization goals', () => {
      const goalValues = Object.values(OptimizationGoal)
      expect(goalValues).toHaveLength(3)
    })
  })
})
