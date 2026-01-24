import { BatchedMatrixService, PhaseMatrixResult } from './batchedMatrix'
import { cachedOpenRouteClient } from './cachedOpenroute'
import type { TravelMode, HypothesisPoint, TravelTimeMatrix } from 'types/graphql'
import type { Coordinate } from './geometry'

// Mock the cachedOpenRouteClient
jest.mock('./cachedOpenroute', () => ({
  cachedOpenRouteClient: {
    calculateTravelTimeMatrix: jest.fn()
  }
}))

// Mock the logger
jest.mock('./logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}))

const mockCachedOpenRouteClient = cachedOpenRouteClient as jest.Mocked<typeof cachedOpenRouteClient>

describe('BatchedMatrixService', () => {
  let service: BatchedMatrixService

  beforeEach(() => {
    service = new BatchedMatrixService()
    service.resetApiCallCount()
    jest.clearAllMocks()
  })

  const mockOrigins: Coordinate[] = [
    { latitude: 40.7128, longitude: -74.0060 }, // New York
    { latitude: 34.0522, longitude: -118.2437 }  // Los Angeles
  ]

  const mockPhase0Points: HypothesisPoint[] = [
    {
      id: 'anchor_geographic_centroid',
      coordinate: { latitude: 37.3826, longitude: -96.1231 },
      type: 'GEOGRAPHIC_CENTROID',
      metadata: null,
      phase: 'ANCHOR',
    },
    {
      id: 'anchor_participant_0',
      coordinate: { latitude: 40.7128, longitude: -74.0060 },
      type: 'PARTICIPANT_LOCATION',
      metadata: { participantId: 'participant_0', pairIds: null },
      phase: 'ANCHOR'
    }
  ]

  const mockPhase1Points: HypothesisPoint[] = [
    {
      id: 'coarse_grid_0',
      coordinate: { latitude: 38.0, longitude: -95.0 },
      type: 'COARSE_GRID_CELL',
      metadata: null,
      phase: 'COARSE_GRID'
    },
    {
      id: 'coarse_grid_1',
      coordinate: { latitude: 39.0, longitude: -96.0 },
      type: 'COARSE_GRID_CELL',
      metadata: null,
      phase: 'COARSE_GRID'
    }
  ]

  const mockTravelMode: TravelMode = 'DRIVING_CAR'

  describe('evaluateCoarseGridBatched', () => {
    it('should evaluate coarse grid using single Matrix API call', async () => {
      // Mock successful matrix API response
      const mockMatrix: TravelTimeMatrix = {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: 'origin_1', name: 'Origin 2', latitude: 34.0522, longitude: -118.2437 }
        ],
        destinations: [...mockPhase0Points, ...mockPhase1Points],
        travelTimes: [
          [30, 45, 60, 75], // Travel times from origin 0 to all destinations
          [90, 105, 120, 135] // Travel times from origin 1 to all destinations
        ],
        travelMode: mockTravelMode
      }

      mockCachedOpenRouteClient.calculateTravelTimeMatrix.mockResolvedValue(mockMatrix)

      // Execute batched evaluation
      const result = await service.evaluateCoarseGridBatched(
        mockOrigins,
        mockPhase0Points,
        mockPhase1Points,
        mockTravelMode
      )

      // Verify single API call was made (Requirements 1.4)
      expect(mockCachedOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(1)
      expect(mockCachedOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledWith(
        mockOrigins,
        [...mockPhase0Points, ...mockPhase1Points].map(hp => hp.coordinate),
        mockTravelMode
      )

      // Verify API call count tracking
      expect(result.apiCallCount).toBe(1)
      expect(service.getApiCallCount()).toBe(1)

      // Verify result structure
      expect(result.combinedMatrix).toBeDefined()
      expect(result.phaseResults).toHaveLength(2) // Phase 0 and Phase 1
      expect(result.totalHypothesisPoints).toHaveLength(4) // 2 Phase 0 + 2 Phase 1

      // Verify Phase 0 result
      const phase0Result = result.phaseResults.find(pr => pr.phase === 'PHASE_0')
      expect(phase0Result).toBeDefined()
      expect(phase0Result!.hypothesisPoints).toEqual(mockPhase0Points)
      expect(phase0Result!.startIndex).toBe(0)
      expect(phase0Result!.endIndex).toBe(2)

      // Verify Phase 1 result
      const phase1Result = result.phaseResults.find(pr => pr.phase === 'PHASE_1')
      expect(phase1Result).toBeDefined()
      expect(phase1Result!.hypothesisPoints).toEqual(mockPhase1Points)
      expect(phase1Result!.startIndex).toBe(2)
      expect(phase1Result!.endIndex).toBe(4)
    })

    it('should handle graceful degradation when Phase 1 fails', async () => {
      // Mock API failure for combined call, success for Phase 0 fallback
      const mockPhase0Matrix: TravelTimeMatrix = {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: 'origin_1', name: 'Origin 2', latitude: 34.0522, longitude: -118.2437 }
        ],
        destinations: mockPhase0Points,
        travelTimes: [
          [30, 45], // Travel times from origin 0 to Phase 0 destinations
          [90, 105] // Travel times from origin 1 to Phase 0 destinations
        ],
        travelMode: mockTravelMode
      }

      mockCachedOpenRouteClient.calculateTravelTimeMatrix
        .mockRejectedValueOnce(new Error('Combined API call failed'))
        .mockResolvedValueOnce(mockPhase0Matrix)

      // Execute batched evaluation
      const result = await service.evaluateCoarseGridBatched(
        mockOrigins,
        mockPhase0Points,
        mockPhase1Points,
        mockTravelMode
      )

      // Verify fallback behavior: 2 API calls (failed combined + successful Phase 0)
      expect(mockCachedOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(2)
      expect(result.apiCallCount).toBe(2)

      // Verify Phase 0 only result
      expect(result.phaseResults).toHaveLength(1) // Only Phase 0
      expect(result.totalHypothesisPoints).toEqual(mockPhase0Points)

      const phase0Result = result.phaseResults[0]
      expect(phase0Result.phase).toBe('PHASE_0')
      expect(phase0Result.hypothesisPoints).toEqual(mockPhase0Points)
    })

    it('should work with empty Phase 1 points', async () => {
      // Mock successful matrix API response for Phase 0 only
      const mockMatrix: TravelTimeMatrix = {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: 'origin_1', name: 'Origin 2', latitude: 34.0522, longitude: -118.2437 }
        ],
        destinations: mockPhase0Points,
        travelTimes: [
          [30, 45], // Travel times from origin 0 to Phase 0 destinations
          [90, 105] // Travel times from origin 1 to Phase 0 destinations
        ],
        travelMode: mockTravelMode
      }

      mockCachedOpenRouteClient.calculateTravelTimeMatrix.mockResolvedValue(mockMatrix)

      // Execute batched evaluation with empty Phase 1
      const result = await service.evaluateCoarseGridBatched(
        mockOrigins,
        mockPhase0Points,
        [], // Empty Phase 1 points
        mockTravelMode
      )

      // Verify single API call was made
      expect(mockCachedOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(1)
      expect(result.apiCallCount).toBe(1)

      // Verify Phase 0 only result
      expect(result.phaseResults).toHaveLength(1) // Only Phase 0
      expect(result.totalHypothesisPoints).toEqual(mockPhase0Points)
    })

    it('should validate matrix dimensions', async () => {
      // Mock matrix with invalid dimensions
      const mockInvalidMatrix: TravelTimeMatrix = {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 }
        ],
        destinations: [...mockPhase0Points, ...mockPhase1Points],
        travelTimes: [
          [30, 45] // Wrong number of columns (should be 4, not 2)
        ],
        travelMode: mockTravelMode
      }

      mockCachedOpenRouteClient.calculateTravelTimeMatrix.mockResolvedValue(mockInvalidMatrix)

      // Execute batched evaluation and expect validation error
      await expect(service.evaluateCoarseGridBatched(
        mockOrigins,
        mockPhase0Points,
        mockPhase1Points,
        mockTravelMode
      )).rejects.toThrow('Matrix dimension mismatch')
    })
  })

  describe('evaluateLocalGridsSeparately', () => {
    const mockLocalGrid1: HypothesisPoint[] = [
      {
        id: 'local_refinement_0',
        coordinate: { latitude: 37.5, longitude: -95.5 },
        type: 'LOCAL_REFINEMENT_CELL',
        metadata: null,
        phase: 'LOCAL_REFINEMENT'
      }
    ]

    const mockLocalGrid2: HypothesisPoint[] = [
      {
        id: 'local_refinement_1',
        coordinate: { latitude: 38.5, longitude: -96.5 },
        type: 'LOCAL_REFINEMENT_CELL',
        metadata: null,
        phase: 'LOCAL_REFINEMENT'
      }
    ]

    it('should evaluate each local grid using separate Matrix API calls', async () => {
      // Mock successful matrix API responses for each local grid
      const mockMatrix1: TravelTimeMatrix = {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: 'origin_1', name: 'Origin 2', latitude: 34.0522, longitude: -118.2437 }
        ],
        destinations: mockLocalGrid1,
        travelTimes: [[25], [85]], // Travel times to local grid 1
        travelMode: mockTravelMode
      }

      const mockMatrix2: TravelTimeMatrix = {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: 'origin_1', name: 'Origin 2', latitude: 34.0522, longitude: -118.2437 }
        ],
        destinations: mockLocalGrid2,
        travelTimes: [[35], [95]], // Travel times to local grid 2
        travelMode: mockTravelMode
      }

      mockCachedOpenRouteClient.calculateTravelTimeMatrix
        .mockResolvedValueOnce(mockMatrix1)
        .mockResolvedValueOnce(mockMatrix2)

      // Execute local grid evaluation
      const results = await service.evaluateLocalGridsSeparately(
        mockOrigins,
        [mockLocalGrid1, mockLocalGrid2],
        mockTravelMode
      )

      // Verify separate API calls were made (Requirements 1.5)
      expect(mockCachedOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(2)
      expect(service.getApiCallCount()).toBe(2)

      // Verify results structure
      expect(results).toHaveLength(2)

      // Verify first local grid result
      expect(results[0].phase).toBe('PHASE_2')
      expect(results[0].hypothesisPoints).toEqual(mockLocalGrid1)
      expect(results[0].matrix.travelTimes).toEqual([[25], [85]])

      // Verify second local grid result
      expect(results[1].phase).toBe('PHASE_2')
      expect(results[1].hypothesisPoints).toEqual(mockLocalGrid2)
      expect(results[1].matrix.travelTimes).toEqual([[35], [95]])
    })

    it('should handle graceful degradation when some local grids fail', async () => {
      // Mock first grid success, second grid failure
      const mockMatrix1: TravelTimeMatrix = {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: 'origin_1', name: 'Origin 2', latitude: 34.0522, longitude: -118.2437 }
        ],
        destinations: mockLocalGrid1,
        travelTimes: [[25], [85]],
        travelMode: mockTravelMode
      }

      mockCachedOpenRouteClient.calculateTravelTimeMatrix
        .mockResolvedValueOnce(mockMatrix1)
        .mockRejectedValueOnce(new Error('Local grid 2 API call failed'))

      // Execute local grid evaluation
      const results = await service.evaluateLocalGridsSeparately(
        mockOrigins,
        [mockLocalGrid1, mockLocalGrid2],
        mockTravelMode
      )

      // Verify partial success: 1 successful result out of 2 grids
      expect(results).toHaveLength(1)
      expect(results[0].hypothesisPoints).toEqual(mockLocalGrid1)
      expect(service.getApiCallCount()).toBe(2) // Both calls were attempted
    })
  })

  describe('combineLocalGridResults', () => {
    it('should combine multiple local grid results into single Phase 2 result', async () => {
      // Create mock local grid results
      const mockLocalGrid1Result: PhaseMatrixResult = {
        phase: 'PHASE_2' as const,
        matrix: {
          origins: [
            { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
            { id: 'origin_1', name: 'Origin 2', latitude: 34.0522, longitude: -118.2437 }
          ],
          destinations: [{
            id: 'local_refinement_0',
            coordinate: { latitude: 37.5, longitude: -95.5 },
            type: 'LOCAL_REFINEMENT_CELL',
            metadata: null,
            phase: 'LOCAL_REFINEMENT'
          }],
          travelTimes: [[25], [85]],
          travelMode: mockTravelMode
        },
        hypothesisPoints: [{
          id: 'local_refinement_0',
          coordinate: { latitude: 37.5, longitude: -95.5 },
          type: 'LOCAL_REFINEMENT_CELL',
          metadata: null,
          phase: 'LOCAL_REFINEMENT'
        }],
        startIndex: 0,
        endIndex: 1
      }

      const mockLocalGrid2Result: PhaseMatrixResult = {
        phase: 'PHASE_2' as const,
        matrix: {
          origins: [
            { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
            { id: 'origin_1', name: 'Origin 2', latitude: 34.0522, longitude: -118.2437 }
          ],
          destinations: [{
            id: 'local_refinement_1',
            coordinate: { latitude: 38.5, longitude: -96.5 },
            type: 'LOCAL_REFINEMENT_CELL',
            metadata: null,
            phase: 'LOCAL_REFINEMENT'
          }],
          travelTimes: [[35], [95]],
          travelMode: mockTravelMode
        },
        hypothesisPoints: [{
          id: 'local_refinement_1',
          coordinate: { latitude: 38.5, longitude: -96.5 },
          type: 'LOCAL_REFINEMENT_CELL',
          metadata: null,
          phase: 'LOCAL_REFINEMENT'
        }],
        startIndex: 0,
        endIndex: 1
      }

      // Combine local grid results
      const combinedResult = service.combineLocalGridResults([
        mockLocalGrid1Result,
        mockLocalGrid2Result
      ])

      // Verify combined result structure
      expect(combinedResult.phase).toBe('PHASE_2')
      expect(combinedResult.hypothesisPoints).toHaveLength(2)
      expect(combinedResult.matrix.travelTimes).toEqual([
        [25, 35], // Combined travel times from origin 0
        [85, 95]  // Combined travel times from origin 1
      ])

      // Verify hypothesis points are combined
      expect(combinedResult.hypothesisPoints[0].id).toBe('local_refinement_0')
      expect(combinedResult.hypothesisPoints[1].id).toBe('local_refinement_1')
    })
  })

  describe('API call tracking', () => {
    it('should track API call count correctly', () => {
      expect(service.getApiCallCount()).toBe(0)

      service.resetApiCallCount()
      expect(service.getApiCallCount()).toBe(0)
    })
  })
})