import { matrixService } from './matrix'
import type { TravelTimeMatrix, HypothesisPoint } from 'types/graphql'
import type { Coordinate } from './geometry'
import type { BatchedMatrixResult, PhaseMatrixResult } from './matrix'

// Mock logger to avoid console output during tests
jest.mock('./logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}))

describe('TravelTimeMatrixService', () => {
  describe('findMinimaxOptimal', () => {
    it('should find the optimal point with minimum maximum travel time', () => {
      const mockMatrix: TravelTimeMatrix = {
        origins: [
          { id: 'origin1', name: 'Origin 1', latitude: 0, longitude: 0 },
          { id: 'origin2', name: 'Origin 2', latitude: 1, longitude: 1 }
        ],
        destinations: [
          { id: 'dest1', coordinate: { latitude: 0.5, longitude: 0.5 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
          { id: 'dest2', coordinate: { latitude: 2, longitude: 2 }, type: 'PARTICIPANT_LOCATION', metadata: null }
        ],
        travelTimes: [
          [10, 30], // From origin1: 10min to dest1, 30min to dest2
          [15, 5]   // From origin2: 15min to dest1, 5min to dest2
        ],
        travelMode: 'DRIVING_CAR'
      }

      const result = matrixService.findMinimaxOptimal(mockMatrix)

      // dest1: max(10, 15) = 15min
      // dest2: max(30, 5) = 30min
      // dest1 is optimal with max time of 15min
      expect(result.optimalIndex).toBe(0)
      expect(result.maxTravelTime).toBe(15)
      expect(result.averageTravelTime).toBe(12.5) // (10 + 15) / 2
    })

    it('should handle unreachable routes (Infinity values)', () => {
      const mockMatrix: TravelTimeMatrix = {
        origins: [
          { id: 'origin1', name: 'Origin 1', latitude: 0, longitude: 0 },
          { id: 'origin2', name: 'Origin 2', latitude: 1, longitude: 1 }
        ],
        destinations: [
          { id: 'dest1', coordinate: { latitude: 0.5, longitude: 0.5 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
          { id: 'dest2', coordinate: { latitude: 2, longitude: 2 }, type: 'PARTICIPANT_LOCATION', metadata: null }
        ],
        travelTimes: [
          [10, Infinity], // From origin1: 10min to dest1, unreachable to dest2
          [15, 20]        // From origin2: 15min to dest1, 20min to dest2
        ],
        travelMode: 'DRIVING_CAR'
      }

      const result = matrixService.findMinimaxOptimal(mockMatrix)

      // dest1: max(10, 15) = 15min (both reachable)
      // dest2: unreachable from origin1, so skip this destination
      // dest1 is the only valid option
      expect(result.optimalIndex).toBe(0)
      expect(result.maxTravelTime).toBe(15)
    })

    it('should throw error when no valid destinations exist', () => {
      const mockMatrix: TravelTimeMatrix = {
        origins: [
          { id: 'origin1', name: 'Origin 1', latitude: 0, longitude: 0 }
        ],
        destinations: [
          { id: 'dest1', coordinate: { latitude: 0.5, longitude: 0.5 }, type: 'GEOGRAPHIC_CENTROID', metadata: null }
        ],
        travelTimes: [
          [Infinity] // Unreachable from all origins
        ],
        travelMode: 'DRIVING_CAR'
      }

      expect(() => matrixService.findMinimaxOptimal(mockMatrix))
        .toThrow('No valid hypothesis points found')
    })
  })

  describe('applyTieBreakingRules', () => {
    const mockHypothesisPoints: HypothesisPoint[] = [
      { id: 'h1', coordinate: { latitude: 0, longitude: 0 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
      { id: 'h2', coordinate: { latitude: 1, longitude: 1 }, type: 'PARTICIPANT_LOCATION', metadata: null },
      { id: 'h3', coordinate: { latitude: 0.5, longitude: 0.5 }, type: 'MEDIAN_COORDINATE', metadata: null }
    ]

    const geographicCentroid = { latitude: 0.25, longitude: 0.25 }

    it('should select candidate with lowest average travel time', () => {
      const candidates = [
        { index: 0, maxTime: 20, avgTime: 15 },
        { index: 1, maxTime: 20, avgTime: 18 },
        { index: 2, maxTime: 20, avgTime: 12 }
      ]

      const result = matrixService.applyTieBreakingRules(
        candidates,
        mockHypothesisPoints,
        geographicCentroid
      )

      expect(result).toBe(2) // Index 2 has lowest average time (12)
    })

    it('should use distance to centroid when average times are equal', () => {
      const candidates = [
        { index: 0, maxTime: 20, avgTime: 15 }, // Distance to (0.25, 0.25): sqrt((0-0.25)^2 + (0-0.25)^2) ≈ 0.35
        { index: 2, maxTime: 20, avgTime: 15 }  // Distance to (0.25, 0.25): sqrt((0.5-0.25)^2 + (0.5-0.25)^2) ≈ 0.35
      ]

      const result = matrixService.applyTieBreakingRules(
        candidates,
        mockHypothesisPoints,
        geographicCentroid
      )

      // Both have same distance, should return the first one (index 0)
      expect(result).toBe(0)
    })

    it('should return single candidate without processing', () => {
      const candidates = [
        { index: 1, maxTime: 20, avgTime: 15 }
      ]

      const result = matrixService.applyTieBreakingRules(
        candidates,
        mockHypothesisPoints,
        geographicCentroid
      )

      expect(result).toBe(1)
    })
  })

  describe('Multi-phase matrix evaluation', () => {
    const mockOrigins: Coordinate[] = [
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 }
    ]

    const mockPhase0Points: HypothesisPoint[] = [
      { id: 'p0_1', coordinate: { latitude: 0.5, longitude: 0.5 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
      { id: 'p0_2', coordinate: { latitude: 0.3, longitude: 0.3 }, type: 'MEDIAN_COORDINATE', metadata: null }
    ]

    const mockPhase1Points: HypothesisPoint[] = [
      { id: 'p1_1', coordinate: { latitude: 0.2, longitude: 0.2 }, type: 'COARSE_GRID_CELL', metadata: null },
      { id: 'p1_2', coordinate: { latitude: 0.8, longitude: 0.8 }, type: 'COARSE_GRID_CELL', metadata: null }
    ]

    const mockMatrixEvaluator = jest.fn()

    beforeEach(() => {
      mockMatrixEvaluator.mockClear()
    })

    describe('evaluateBatchedMatrix', () => {
      it('should combine Phase 0+1 points and evaluate in single API call', async () => {
        const mockCombinedMatrix: TravelTimeMatrix = {
          origins: [
            { id: 'origin1', name: 'Origin 1', latitude: 0, longitude: 0 },
            { id: 'origin2', name: 'Origin 2', latitude: 1, longitude: 1 }
          ],
          destinations: [
            { id: 'dest1', coordinate: { latitude: 0.5, longitude: 0.5 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'dest2', coordinate: { latitude: 0.3, longitude: 0.3 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'dest3', coordinate: { latitude: 0.2, longitude: 0.2 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'dest4', coordinate: { latitude: 0.8, longitude: 0.8 }, type: 'PARTICIPANT_LOCATION', metadata: null }
          ],
          travelTimes: [
            [10, 12, 15, 25],
            [15, 18, 20, 5]
          ],
          travelMode: 'DRIVING_CAR'
        }

        // Mock the batchedMatrixService
        const { batchedMatrixService } = require('src/lib/batchedMatrix')
        jest.spyOn(batchedMatrixService, 'evaluateCoarseGridBatched').mockResolvedValue({
          combinedMatrix: mockCombinedMatrix,
          phaseResults: [
            {
              phase: 'PHASE_0',
              matrix: {
                origins: mockCombinedMatrix.origins,
                destinations: mockPhase0Points,
                travelTimes: [[10, 12], [15, 18]],
                travelMode: 'DRIVING_CAR'
              },
              hypothesisPoints: mockPhase0Points,
              startIndex: 0,
              endIndex: 2
            },
            {
              phase: 'PHASE_1',
              matrix: {
                origins: mockCombinedMatrix.origins,
                destinations: mockPhase1Points,
                travelTimes: [[15, 25], [20, 5]],
                travelMode: 'DRIVING_CAR'
              },
              hypothesisPoints: mockPhase1Points,
              startIndex: 2,
              endIndex: 4
            }
          ],
          totalHypothesisPoints: [...mockPhase0Points, ...mockPhase1Points],
          apiCallCount: 1
        })

        const result = await matrixService.evaluateBatchedMatrix(
          mockOrigins,
          mockPhase0Points,
          mockPhase1Points,
          'DRIVING_CAR'
        )

        // Verify batchedMatrixService was called correctly
        expect(batchedMatrixService.evaluateCoarseGridBatched).toHaveBeenCalledTimes(1)
        expect(batchedMatrixService.evaluateCoarseGridBatched).toHaveBeenCalledWith(
          mockOrigins,
          mockPhase0Points,
          mockPhase1Points,
          'DRIVING_CAR'
        )

        // Verify result structure
        expect(result.combinedMatrix).toBe(mockCombinedMatrix)
        expect(result.phaseResults).toHaveLength(2)
        expect(result.totalHypothesisPoints).toHaveLength(4)

        // Verify Phase 0 result
        const phase0Result = result.phaseResults.find(pr => pr.phase === 'PHASE_0')
        expect(phase0Result).toBeDefined()
        expect(phase0Result!.startIndex).toBe(0)
        expect(phase0Result!.endIndex).toBe(2)
        expect(phase0Result!.hypothesisPoints).toEqual(mockPhase0Points)

        // Verify Phase 1 result
        const phase1Result = result.phaseResults.find(pr => pr.phase === 'PHASE_1')
        expect(phase1Result).toBeDefined()
        expect(phase1Result!.startIndex).toBe(2)
        expect(phase1Result!.endIndex).toBe(4)
        expect(phase1Result!.hypothesisPoints).toEqual(mockPhase1Points)
      })

      it('should handle Phase 0 only when no Phase 1 points provided', async () => {
        const mockPhase0Matrix: TravelTimeMatrix = {
          origins: [
            { id: 'origin1', name: 'Origin 1', latitude: 0, longitude: 0 },
            { id: 'origin2', name: 'Origin 2', latitude: 1, longitude: 1 }
          ],
          destinations: [
            { id: 'dest1', coordinate: { latitude: 0.5, longitude: 0.5 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'dest2', coordinate: { latitude: 0.3, longitude: 0.3 }, type: 'PARTICIPANT_LOCATION', metadata: null }
          ],
          travelTimes: [
            [10, 12],
            [15, 18]
          ],
          travelMode: 'DRIVING_CAR'
        }

        // Mock the batchedMatrixService for Phase 0 only
        const { batchedMatrixService } = require('src/lib/batchedMatrix')
        jest.spyOn(batchedMatrixService, 'evaluateCoarseGridBatched').mockResolvedValue({
          combinedMatrix: mockPhase0Matrix,
          phaseResults: [
            {
              phase: 'PHASE_0',
              matrix: mockPhase0Matrix,
              hypothesisPoints: mockPhase0Points,
              startIndex: 0,
              endIndex: 2
            }
          ],
          totalHypothesisPoints: mockPhase0Points,
          apiCallCount: 1
        })

        const result = await matrixService.evaluateBatchedMatrix(
          mockOrigins,
          mockPhase0Points,
          [], // No Phase 1 points
          'DRIVING_CAR'
        )

        expect(result.phaseResults).toHaveLength(1)
        expect(result.phaseResults[0].phase).toBe('PHASE_0')
        expect(result.totalHypothesisPoints).toHaveLength(2)
      })
    })

    describe('evaluateLocalGridsSeparately', () => {
      it('should evaluate local grids using separate Matrix API calls', async () => {
        const mockLocalGrid1: HypothesisPoint[] = [
          { id: 'p2_1', coordinate: { latitude: 0.45, longitude: 0.45 }, type: 'LOCAL_REFINEMENT', metadata: null }
        ]

        const mockLocalGrid2: HypothesisPoint[] = [
          { id: 'p2_2', coordinate: { latitude: 0.55, longitude: 0.55 }, type: 'LOCAL_REFINEMENT', metadata: null }
        ]

        const mockLocalGridResults = [
          {
            phase: 'PHASE_2' as const,
            matrix: {
              origins: [
                { id: 'origin1', name: 'Origin 1', latitude: 0, longitude: 0 },
                { id: 'origin2', name: 'Origin 2', latitude: 1, longitude: 1 }
              ],
              destinations: mockLocalGrid1,
              travelTimes: [[8], [12]],
              travelMode: 'DRIVING_CAR'
            },
            hypothesisPoints: mockLocalGrid1,
            startIndex: 0,
            endIndex: 1
          },
          {
            phase: 'PHASE_2' as const,
            matrix: {
              origins: [
                { id: 'origin1', name: 'Origin 1', latitude: 0, longitude: 0 },
                { id: 'origin2', name: 'Origin 2', latitude: 1, longitude: 1 }
              ],
              destinations: mockLocalGrid2,
              travelTimes: [[12], [8]],
              travelMode: 'DRIVING_CAR'
            },
            hypothesisPoints: mockLocalGrid2,
            startIndex: 0,
            endIndex: 1
          }
        ]

        // Mock the batchedMatrixService
        const { batchedMatrixService } = require('src/lib/batchedMatrix')
        jest.spyOn(batchedMatrixService, 'evaluateLocalGridsSeparately').mockResolvedValue(mockLocalGridResults)

        const result = await matrixService.evaluateLocalGridsSeparately(
          mockOrigins,
          [mockLocalGrid1, mockLocalGrid2],
          'DRIVING_CAR'
        )

        // Verify batchedMatrixService was called correctly
        expect(batchedMatrixService.evaluateLocalGridsSeparately).toHaveBeenCalledTimes(1)
        expect(batchedMatrixService.evaluateLocalGridsSeparately).toHaveBeenCalledWith(
          mockOrigins,
          [mockLocalGrid1, mockLocalGrid2],
          'DRIVING_CAR'
        )

        expect(result).toEqual(mockLocalGridResults)
        expect(result).toHaveLength(2)
        expect(result[0].phase).toBe('PHASE_2')
        expect(result[1].phase).toBe('PHASE_2')
      })
    })

    describe('mergeMatrixResults', () => {
      it('should merge batched and Phase 2 results', () => {
        const batchedResult: BatchedMatrixResult = {
          combinedMatrix: {
            origins: [
              { id: 'origin1', name: 'Origin 1', latitude: 0, longitude: 0 },
              { id: 'origin2', name: 'Origin 2', latitude: 1, longitude: 1 }
            ],
            destinations: [
              { id: 'dest1', coordinate: { latitude: 0.5, longitude: 0.5 }, type: 'PARTICIPANT_LOCATION', metadata: null },
              { id: 'dest2', coordinate: { latitude: 0.3, longitude: 0.3 }, type: 'PARTICIPANT_LOCATION', metadata: null }
            ],
            travelTimes: [
              [10, 12],
              [15, 18]
            ],
            travelMode: 'DRIVING_CAR'
          },
          phaseResults: [],
          totalHypothesisPoints: []
        }

        const phase2Result: PhaseMatrixResult = {
          phase: 'PHASE_2',
          matrix: {
            origins: [
              { id: 'origin1', name: 'Origin 1', latitude: 0, longitude: 0 },
              { id: 'origin2', name: 'Origin 2', latitude: 1, longitude: 1 }
            ],
            destinations: [
              { id: 'dest3', coordinate: { latitude: 0.45, longitude: 0.45 }, type: 'PARTICIPANT_LOCATION', metadata: null }
            ],
            travelTimes: [
              [8],
              [12]
            ],
            travelMode: 'DRIVING_CAR'
          },
          hypothesisPoints: [],
          startIndex: 0,
          endIndex: 1
        }

        const result = matrixService.mergeMatrixResults(batchedResult, phase2Result)

        expect(result.destinations).toHaveLength(3)
        expect(result.travelTimes).toEqual([
          [10, 12, 8],
          [15, 18, 12]
        ])
      })

      it('should return batched result when no Phase 2 provided', () => {
        const batchedResult: BatchedMatrixResult = {
          combinedMatrix: {
            origins: [
              { id: 'origin1', name: 'Origin 1', latitude: 0, longitude: 0 }
            ],
            destinations: [
              { id: 'dest1', coordinate: { latitude: 0.5, longitude: 0.5 }, type: 'PARTICIPANT_LOCATION', metadata: null }
            ],
            travelTimes: [[10]],
            travelMode: 'DRIVING_CAR'
          },
          phaseResults: [],
          totalHypothesisPoints: []
        }

        const result = matrixService.mergeMatrixResults(batchedResult)

        expect(result).toBe(batchedResult.combinedMatrix)
      })
    })

    describe('validateEpsilonOptimalityImprovement', () => {
      it('should detect significant improvement', () => {
        const baselineResult = {
          optimalIndex: 0,
          maxTravelTime: 30,
          averageTravelTime: 25
        }

        const multiPhaseResult = {
          optimalIndex: 1,
          maxTravelTime: 25,
          averageTravelTime: 22,
          optimalPhase: 'PHASE_1'
        }

        const result = matrixService.validateEpsilonOptimalityImprovement(
          baselineResult,
          multiPhaseResult,
          2 // 2-minute threshold
        )

        expect(result.hasImprovement).toBe(true)
        expect(result.improvementMinutes).toBe(5)
        expect(result.improvementPercentage).toBeCloseTo(16.67, 1)
        expect(result.isSignificant).toBe(true)
      })

      it('should detect improvement below significance threshold', () => {
        const baselineResult = {
          optimalIndex: 0,
          maxTravelTime: 30,
          averageTravelTime: 25
        }

        const multiPhaseResult = {
          optimalIndex: 1,
          maxTravelTime: 29,
          averageTravelTime: 24,
          optimalPhase: 'PHASE_1'
        }

        const result = matrixService.validateEpsilonOptimalityImprovement(
          baselineResult,
          multiPhaseResult,
          2 // 2-minute threshold
        )

        expect(result.hasImprovement).toBe(true)
        expect(result.improvementMinutes).toBe(1)
        expect(result.isSignificant).toBe(false)
      })

      it('should detect no improvement', () => {
        const baselineResult = {
          optimalIndex: 0,
          maxTravelTime: 25,
          averageTravelTime: 22
        }

        const multiPhaseResult = {
          optimalIndex: 1,
          maxTravelTime: 30,
          averageTravelTime: 25,
          optimalPhase: 'PHASE_1'
        }

        const result = matrixService.validateEpsilonOptimalityImprovement(
          baselineResult,
          multiPhaseResult
        )

        expect(result.hasImprovement).toBe(false)
        expect(result.improvementMinutes).toBe(-5)
        expect(result.isSignificant).toBe(false)
      })
    })

    describe('applyMultiPhaseTieBreakingRules', () => {
      const allHypothesisPoints: HypothesisPoint[] = [
        { id: 'hp1', coordinate: { latitude: 0, longitude: 0 }, type: 'PARTICIPANT_LOCATION', metadata: null },
        { id: 'hp2', coordinate: { latitude: 1, longitude: 1 }, type: 'COARSE_GRID_CELL', metadata: null },
        { id: 'hp3', coordinate: { latitude: 0.5, longitude: 0.5 }, type: 'LOCAL_REFINEMENT_CELL', metadata: null }
      ]

      const geographicCentroid: Coordinate = { latitude: 0.5, longitude: 0.5 }

      it('should prefer Phase 0 candidates', () => {
        const candidates = [
          { index: 0, maxTime: 20, avgTime: 15, phase: 'PHASE_0' as const },
          { index: 1, maxTime: 20, avgTime: 15, phase: 'PHASE_1' as const },
          { index: 2, maxTime: 20, avgTime: 15, phase: 'PHASE_2' as const }
        ]

        const result = matrixService.applyMultiPhaseTieBreakingRules(
          candidates,
          allHypothesisPoints,
          geographicCentroid
        )

        expect(result).toBe(0) // Phase 0 candidate preferred
      })

      it('should prefer Phase 1 over Phase 2 when no Phase 0', () => {
        const candidates = [
          { index: 1, maxTime: 20, avgTime: 15, phase: 'PHASE_1' as const },
          { index: 2, maxTime: 20, avgTime: 15, phase: 'PHASE_2' as const }
        ]

        const result = matrixService.applyMultiPhaseTieBreakingRules(
          candidates,
          allHypothesisPoints,
          geographicCentroid
        )

        expect(result).toBe(1) // Phase 1 candidate preferred over Phase 2
      })

      it('should fall back to Phase 2 when no other phases available', () => {
        const candidates = [
          { index: 2, maxTime: 20, avgTime: 15, phase: 'PHASE_2' as const }
        ]

        const result = matrixService.applyMultiPhaseTieBreakingRules(
          candidates,
          allHypothesisPoints,
          geographicCentroid
        )

        expect(result).toBe(2) // Only Phase 2 candidate available
      })
    })
  })
})