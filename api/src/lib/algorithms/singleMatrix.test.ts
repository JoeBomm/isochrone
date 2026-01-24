// Mock logger to avoid console output during tests
jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

// Mock cachedOpenRouteClient
jest.mock('../cachedOpenroute', () => ({
  cachedOpenRouteClient: {
    calculateTravelTimeMatrix: jest.fn(),
  },
}))

import type { TravelMode, HypothesisPoint, Location } from 'types/graphql'

import { cachedOpenRouteClient } from '../cachedOpenroute'
import type { Coordinate } from '../geometry'

import { singleMatrixService } from './singleMatrix'

// Define TravelTimeMatrix interface locally since it's not in GraphQL schema
interface TravelTimeMatrix {
  origins: Location[]
  destinations: HypothesisPoint[]
  travelTimes: number[][]
  travelMode: TravelMode
}

const mockCalculateTravelTimeMatrix =
  cachedOpenRouteClient.calculateTravelTimeMatrix as jest.MockedFunction<
    typeof cachedOpenRouteClient.calculateTravelTimeMatrix
  >

describe('SingleMatrixService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    singleMatrixService.resetApiCallCount()
  })

  describe('evaluateAllHypothesisPoints', () => {
    const mockOrigins: Coordinate[] = [
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 },
    ]

    const mockAnchorPoints: HypothesisPoint[] = [
      {
        id: 'anchor_1',
        coordinate: { latitude: 0.5, longitude: 0.5 },
        type: 'GEOGRAPHIC_CENTROID',
        phase: 'ANCHOR',
        metadata: null,
      },
      {
        id: 'anchor_2',
        coordinate: { latitude: 0.3, longitude: 0.3 },
        type: 'MEDIAN_COORDINATE',
        phase: 'ANCHOR',
        metadata: null,
      },
    ]

    const mockGridPoints: HypothesisPoint[] = [
      {
        id: 'grid_1',
        coordinate: { latitude: 0.2, longitude: 0.2 },
        type: 'COARSE_GRID_CELL',
        phase: 'COARSE_GRID',
        metadata: null,
      },
      {
        id: 'grid_2',
        coordinate: { latitude: 0.8, longitude: 0.8 },
        type: 'COARSE_GRID_CELL',
        phase: 'COARSE_GRID',
        metadata: null,
      },
    ]

    const mockMatrix: TravelTimeMatrix = {
      origins: [
        { id: 'origin1', name: 'Origin 1', latitude: 0, longitude: 0 },
        { id: 'origin2', name: 'Origin 2', latitude: 1, longitude: 1 },
      ],
      destinations: [
        {
          id: 'dest1',
          coordinate: { latitude: 0.5, longitude: 0.5 },
          type: 'PARTICIPANT_LOCATION',
          metadata: null,
        },
        {
          id: 'dest2',
          coordinate: { latitude: 0.3, longitude: 0.3 },
          type: 'PARTICIPANT_LOCATION',
          metadata: null,
        },
        {
          id: 'dest3',
          coordinate: { latitude: 0.2, longitude: 0.2 },
          type: 'PARTICIPANT_LOCATION',
          metadata: null,
        },
        {
          id: 'dest4',
          coordinate: { latitude: 0.8, longitude: 0.8 },
          type: 'PARTICIPANT_LOCATION',
          metadata: null,
        },
      ],
      travelTimes: [
        [10, 12, 15, 25], // From origin1 to all destinations
        [15, 18, 20, 5], // From origin2 to all destinations
      ],
      travelMode: 'DRIVING_CAR',
    }

    it('should evaluate all hypothesis points with single Matrix API call', async () => {
      mockCalculateTravelTimeMatrix.mockResolvedValue(mockMatrix)

      const result = await singleMatrixService.evaluateAllHypothesisPoints(
        mockOrigins,
        mockAnchorPoints,
        mockGridPoints,
        'DRIVING_CAR'
      )

      // Verify API call count is exactly 1 (Requirements 8.1)
      expect(singleMatrixService.getApiCallCount()).toBe(1)
      expect(result.apiCallCount).toBe(1)

      // Verify Matrix API was called once with combined points
      expect(mockCalculateTravelTimeMatrix).toHaveBeenCalledTimes(1)
      expect(mockCalculateTravelTimeMatrix).toHaveBeenCalledWith(
        mockOrigins,
        [
          { latitude: 0.5, longitude: 0.5 }, // anchor_1
          { latitude: 0.3, longitude: 0.3 }, // anchor_2
          { latitude: 0.2, longitude: 0.2 }, // grid_1
          { latitude: 0.8, longitude: 0.8 }, // grid_2
        ],
        'DRIVING_CAR'
      )

      // Verify matrix result structure and validation (Requirements 8.1)
      expect(result.matrix).toBe(mockMatrix)
      expect(result.hypothesisPoints).toHaveLength(4)
      expect(result.totalHypothesisPoints).toBe(4)

      // Verify hypothesis points are in correct order (anchors first, then grid)
      expect(result.hypothesisPoints[0]).toBe(mockAnchorPoints[0])
      expect(result.hypothesisPoints[1]).toBe(mockAnchorPoints[1])
      expect(result.hypothesisPoints[2]).toBe(mockGridPoints[0])
      expect(result.hypothesisPoints[3]).toBe(mockGridPoints[1])
    })

    it('should handle empty grid points array', async () => {
      const anchorOnlyMatrix: TravelTimeMatrix = {
        origins: mockMatrix.origins,
        destinations: [
          {
            id: 'dest1',
            coordinate: { latitude: 0.5, longitude: 0.5 },
            type: 'PARTICIPANT_LOCATION',
            metadata: null,
          },
          {
            id: 'dest2',
            coordinate: { latitude: 0.3, longitude: 0.3 },
            type: 'PARTICIPANT_LOCATION',
            metadata: null,
          },
        ],
        travelTimes: [
          [10, 12], // From origin1 to anchor points only
          [15, 18], // From origin2 to anchor points only
        ],
        travelMode: 'DRIVING_CAR',
      }

      mockCalculateTravelTimeMatrix.mockResolvedValue(anchorOnlyMatrix)

      const result = await singleMatrixService.evaluateAllHypothesisPoints(
        mockOrigins,
        mockAnchorPoints,
        [], // Empty grid points
        'DRIVING_CAR'
      )

      expect(singleMatrixService.getApiCallCount()).toBe(1)
      expect(result.hypothesisPoints).toHaveLength(2) // Only anchor points
      expect(result.totalHypothesisPoints).toBe(2)

      // Verify API was called with anchor points only
      expect(mockCalculateTravelTimeMatrix).toHaveBeenCalledWith(
        mockOrigins,
        [
          { latitude: 0.5, longitude: 0.5 }, // anchor_1
          { latitude: 0.3, longitude: 0.3 }, // anchor_2
        ],
        'DRIVING_CAR'
      )
    })

    it('should throw error when no origins provided', async () => {
      await expect(
        singleMatrixService.evaluateAllHypothesisPoints(
          [],
          mockAnchorPoints,
          mockGridPoints,
          'DRIVING_CAR'
        )
      ).rejects.toThrow('No origins provided for single matrix evaluation')

      expect(singleMatrixService.getApiCallCount()).toBe(0)
    })

    it('should throw error when no anchor points provided', async () => {
      await expect(
        singleMatrixService.evaluateAllHypothesisPoints(
          mockOrigins,
          [],
          mockGridPoints,
          'DRIVING_CAR'
        )
      ).rejects.toThrow(
        'No anchor points provided for single matrix evaluation'
      )

      expect(singleMatrixService.getApiCallCount()).toBe(0)
    })

    it('should validate coordinate bounds before API call', async () => {
      const invalidOrigins: Coordinate[] = [
        { latitude: 91, longitude: 0 }, // Invalid latitude > 90
      ]

      await expect(
        singleMatrixService.evaluateAllHypothesisPoints(
          invalidOrigins,
          mockAnchorPoints,
          mockGridPoints,
          'DRIVING_CAR'
        )
      ).rejects.toThrow('Invalid origins latitude at index 0: 91')

      // Should not make any API calls due to validation failure
      expect(singleMatrixService.getApiCallCount()).toBe(0)
      expect(mockCalculateTravelTimeMatrix).not.toHaveBeenCalled()
    })

    it('should validate matrix result dimensions', async () => {
      const invalidMatrix: TravelTimeMatrix = {
        origins: mockMatrix.origins,
        destinations: mockMatrix.destinations,
        travelTimes: [
          [10, 12], // Missing columns - should have 4 columns for 4 destinations
          [15, 18],
        ],
        travelMode: 'DRIVING_CAR',
      }

      mockCalculateTravelTimeMatrix.mockResolvedValue(invalidMatrix)

      await expect(
        singleMatrixService.evaluateAllHypothesisPoints(
          mockOrigins,
          mockAnchorPoints,
          mockGridPoints,
          'DRIVING_CAR'
        )
      ).rejects.toThrow(
        'Matrix dimension mismatch: expected 4 destination columns, got 2'
      )

      expect(singleMatrixService.getApiCallCount()).toBe(1)
    })

    it('should detect and filter unreachable points with null travel times', async () => {
      const matrixWithUnreachablePoints: TravelTimeMatrix = {
        origins: mockMatrix.origins,
        destinations: mockMatrix.destinations,
        travelTimes: [
          [10, null, 15, 25], // destination 1 (index 1) is unreachable from origin 0
          [15, 18, null, 5], // destination 2 (index 2) is unreachable from origin 1
        ],
        travelMode: 'DRIVING_CAR',
      }

      mockCalculateTravelTimeMatrix.mockResolvedValue(
        matrixWithUnreachablePoints
      )

      const result = await singleMatrixService.evaluateAllHypothesisPoints(
        mockOrigins,
        mockAnchorPoints,
        mockGridPoints,
        'DRIVING_CAR'
      )

      // After filtering, only reachable destinations should remain (indices 0 and 3)
      expect(result.matrix.destinations).toHaveLength(2)
      expect(result.matrix.destinations[0]).toEqual(mockMatrix.destinations[0]) // dest1 (index 0)
      expect(result.matrix.destinations[1]).toEqual(mockMatrix.destinations[3]) // dest4 (index 3)
      expect(result.matrix.travelTimes).toEqual([
        [10, 25], // Only columns 0 and 3 from original matrix
        [15, 5], // Only columns 0 and 3 from original matrix
      ])
      expect(result.hypothesisPoints).toHaveLength(2) // Only reachable points
      expect(result.totalHypothesisPoints).toBe(4) // Original count before filtering
      expect(singleMatrixService.getApiCallCount()).toBe(1)
    })

    it('should detect and filter unreachable points with undefined and Infinity travel times', async () => {
      const matrixWithUnreachablePoints: TravelTimeMatrix = {
        origins: mockMatrix.origins,
        destinations: mockMatrix.destinations,
        travelTimes: [
          [10, undefined, 15, Infinity], // destinations 1 and 3 are unreachable from origin 0
          [15, 18, 20, 5], // all reachable from origin 1
        ],
        travelMode: 'DRIVING_CAR',
      }

      mockCalculateTravelTimeMatrix.mockResolvedValue(
        matrixWithUnreachablePoints
      )

      const result = await singleMatrixService.evaluateAllHypothesisPoints(
        mockOrigins,
        mockAnchorPoints,
        mockGridPoints,
        'DRIVING_CAR'
      )

      // After filtering, only reachable destinations should remain (indices 0 and 2)
      expect(result.matrix.destinations).toHaveLength(2)
      expect(result.matrix.destinations[0]).toEqual(mockMatrix.destinations[0]) // dest1 (index 0)
      expect(result.matrix.destinations[1]).toEqual(mockMatrix.destinations[2]) // dest3 (index 2)
      expect(result.matrix.travelTimes).toEqual([
        [10, 15], // Only columns 0 and 2 from original matrix
        [15, 20], // Only columns 0 and 2 from original matrix
      ])
      expect(result.hypothesisPoints).toHaveLength(2) // Only reachable points
      expect(result.totalHypothesisPoints).toBe(4) // Original count before filtering
      expect(singleMatrixService.getApiCallCount()).toBe(1)
    })
  })

  describe('API call counting', () => {
    it('should track API calls correctly', () => {
      expect(singleMatrixService.getApiCallCount()).toBe(0)

      singleMatrixService.resetApiCallCount()
      expect(singleMatrixService.getApiCallCount()).toBe(0)
    })

    it('should increment API call count on successful calls', async () => {
      const mockMatrix: TravelTimeMatrix = {
        origins: [
          { id: 'origin1', name: 'Origin 1', latitude: 0, longitude: 0 },
        ],
        destinations: [
          {
            id: 'dest1',
            coordinate: { latitude: 0.5, longitude: 0.5 },
            type: 'PARTICIPANT_LOCATION',
            metadata: null,
          },
        ],
        travelTimes: [[10]],
        travelMode: 'DRIVING_CAR',
      }

      mockCalculateTravelTimeMatrix.mockResolvedValue(mockMatrix)

      await singleMatrixService.evaluateAllHypothesisPoints(
        [{ latitude: 0, longitude: 0 }],
        [
          {
            id: 'anchor_1',
            coordinate: { latitude: 0.5, longitude: 0.5 },
            type: 'GEOGRAPHIC_CENTROID',
            phase: 'ANCHOR',
            metadata: null,
          },
        ],
        [],
        'DRIVING_CAR'
      )

      expect(singleMatrixService.getApiCallCount()).toBe(1)
    })

    it('should increment API call count on failed calls', async () => {
      mockCalculateTravelTimeMatrix.mockRejectedValue(new Error('API error'))

      await expect(
        singleMatrixService.evaluateAllHypothesisPoints(
          [{ latitude: 0, longitude: 0 }],
          [
            {
              id: 'anchor_1',
              coordinate: { latitude: 0.5, longitude: 0.5 },
              type: 'GEOGRAPHIC_CENTROID',
              phase: 'ANCHOR',
              metadata: null,
            },
          ],
          [],
          'DRIVING_CAR'
        )
      ).rejects.toThrow()

      expect(singleMatrixService.getApiCallCount()).toBe(1)
    })
  })

  describe('filterUnreachablePoints', () => {
    const mockOrigins: Location[] = [
      { id: 'origin1', name: 'Origin 1', latitude: 0, longitude: 0 },
      { id: 'origin2', name: 'Origin 2', latitude: 1, longitude: 1 },
    ]

    const mockHypothesisPoints: HypothesisPoint[] = [
      {
        id: 'point_1',
        coordinate: { latitude: 0.5, longitude: 0.5 },
        type: 'GEOGRAPHIC_CENTROID',
        phase: 'ANCHOR',
        metadata: null,
      },
      {
        id: 'point_2',
        coordinate: { latitude: 0.3, longitude: 0.3 },
        type: 'MEDIAN_COORDINATE',
        phase: 'ANCHOR',
        metadata: null,
      },
      {
        id: 'point_3',
        coordinate: { latitude: 0.2, longitude: 0.2 },
        type: 'COARSE_GRID_CELL',
        phase: 'COARSE_GRID',
        metadata: null,
      },
      {
        id: 'point_4',
        coordinate: { latitude: 0.8, longitude: 0.8 },
        type: 'COARSE_GRID_CELL',
        phase: 'COARSE_GRID',
        metadata: null,
      },
    ]

    const mockDestinations: HypothesisPoint[] = [
      {
        id: 'dest1',
        coordinate: { latitude: 0.5, longitude: 0.5 },
        type: 'PARTICIPANT_LOCATION',
        metadata: null,
      },
      {
        id: 'dest2',
        coordinate: { latitude: 0.3, longitude: 0.3 },
        type: 'PARTICIPANT_LOCATION',
        metadata: null,
      },
      {
        id: 'dest3',
        coordinate: { latitude: 0.2, longitude: 0.2 },
        type: 'PARTICIPANT_LOCATION',
        metadata: null,
      },
      {
        id: 'dest4',
        coordinate: { latitude: 0.8, longitude: 0.8 },
        type: 'PARTICIPANT_LOCATION',
        metadata: null,
      },
    ]

    it('should filter unreachable points correctly', async () => {
      const matrixWithUnreachablePoints: TravelTimeMatrix = {
        origins: mockOrigins,
        destinations: mockDestinations,
        travelTimes: [
          [10, null, 15, 25], // destination 1 (index 1) is unreachable from origin 0
          [15, 18, null, 5], // destination 2 (index 2) is unreachable from origin 1
        ],
        travelMode: 'DRIVING_CAR',
      }

      mockCalculateTravelTimeMatrix.mockResolvedValue(
        matrixWithUnreachablePoints
      )

      const result = await singleMatrixService.evaluateAllHypothesisPoints(
        [
          { latitude: 0, longitude: 0 },
          { latitude: 1, longitude: 1 },
        ],
        [mockHypothesisPoints[0], mockHypothesisPoints[1]], // anchor points
        [mockHypothesisPoints[2], mockHypothesisPoints[3]], // grid points
        'DRIVING_CAR'
      )

      // After filtering, unreachable points should be removed
      expect(result.matrix.destinations).toHaveLength(2) // Only reachable destinations
      expect(result.matrix.destinations[0]).toEqual(mockDestinations[0]) // dest1 (index 0)
      expect(result.matrix.destinations[1]).toEqual(mockDestinations[3]) // dest4 (index 3)
      expect(result.matrix.travelTimes).toEqual([
        [10, 25], // Only columns 0 and 3 from original matrix
        [15, 5], // Only columns 0 and 3 from original matrix
      ])
      expect(result.hypothesisPoints).toHaveLength(2) // Only reachable points
      expect(result.totalHypothesisPoints).toBe(4) // Original count before filtering
      expect(singleMatrixService.getApiCallCount()).toBe(1)
    })

    it('should handle matrix with no unreachable points', async () => {
      const matrixWithAllReachablePoints: TravelTimeMatrix = {
        origins: mockOrigins,
        destinations: mockDestinations,
        travelTimes: [
          [10, 12, 15, 25], // all destinations reachable from origin 0
          [15, 18, 20, 5], // all destinations reachable from origin 1
        ],
        travelMode: 'DRIVING_CAR',
      }

      mockCalculateTravelTimeMatrix.mockResolvedValue(
        matrixWithAllReachablePoints
      )

      const result = await singleMatrixService.evaluateAllHypothesisPoints(
        [
          { latitude: 0, longitude: 0 },
          { latitude: 1, longitude: 1 },
        ],
        [mockHypothesisPoints[0], mockHypothesisPoints[1]], // anchor points
        [mockHypothesisPoints[2], mockHypothesisPoints[3]], // grid points
        'DRIVING_CAR'
      )

      expect(result.matrix).toBe(matrixWithAllReachablePoints)
      expect(result.hypothesisPoints).toHaveLength(4)
      expect(singleMatrixService.getApiCallCount()).toBe(1)
    })

    it('should throw error when all hypothesis points are unreachable', async () => {
      const matrixWithAllUnreachablePoints: TravelTimeMatrix = {
        origins: mockOrigins,
        destinations: mockDestinations,
        travelTimes: [
          [null, null, null, null], // all destinations unreachable from origin 0
          [null, null, null, null], // all destinations unreachable from origin 1
        ],
        travelMode: 'DRIVING_CAR',
      }

      mockCalculateTravelTimeMatrix.mockResolvedValue(
        matrixWithAllUnreachablePoints
      )

      await expect(
        singleMatrixService.evaluateAllHypothesisPoints(
          [
            { latitude: 0, longitude: 0 },
            { latitude: 1, longitude: 1 },
          ],
          [mockHypothesisPoints[0], mockHypothesisPoints[1]], // anchor points
          [mockHypothesisPoints[2], mockHypothesisPoints[3]], // grid points
          'DRIVING_CAR'
        )
      ).rejects.toThrow(
        'All hypothesis points are unreachable from one or more origins. Please try different locations or travel modes.'
      )

      expect(singleMatrixService.getApiCallCount()).toBe(1)
    })

    it('should continue with grid points when all anchor points are unreachable (Requirements 4.2)', async () => {
      const matrixWithUnreachableAnchors: TravelTimeMatrix = {
        origins: mockOrigins,
        destinations: mockDestinations,
        travelTimes: [
          [null, null, 15, 25], // anchor points (indices 0,1) unreachable, grid points (indices 2,3) reachable
          [null, null, 20, 5], // anchor points (indices 0,1) unreachable, grid points (indices 2,3) reachable
        ],
        travelMode: 'DRIVING_CAR',
      }

      mockCalculateTravelTimeMatrix.mockResolvedValue(
        matrixWithUnreachableAnchors
      )

      const result = await singleMatrixService.evaluateAllHypothesisPoints(
        [
          { latitude: 0, longitude: 0 },
          { latitude: 1, longitude: 1 },
        ],
        [mockHypothesisPoints[0], mockHypothesisPoints[1]], // anchor points (will be filtered out)
        [mockHypothesisPoints[2], mockHypothesisPoints[3]], // grid points (will remain)
        'DRIVING_CAR'
      )

      // Should continue with only grid points
      expect(result.matrix.destinations).toHaveLength(2) // Only grid destinations remain
      expect(result.matrix.destinations[0]).toEqual(mockDestinations[2]) // dest3 (grid point 1)
      expect(result.matrix.destinations[1]).toEqual(mockDestinations[3]) // dest4 (grid point 2)
      expect(result.matrix.travelTimes).toEqual([
        [15, 25], // Only grid columns from original matrix
        [20, 5], // Only grid columns from original matrix
      ])
      expect(result.hypothesisPoints).toHaveLength(2) // Only grid points
      expect(result.totalHypothesisPoints).toBe(4) // Original count before filtering
      expect(singleMatrixService.getApiCallCount()).toBe(1)
    })

    it('should continue with anchor points when all grid points are unreachable (Requirements 4.3)', async () => {
      const matrixWithUnreachableGrid: TravelTimeMatrix = {
        origins: mockOrigins,
        destinations: mockDestinations,
        travelTimes: [
          [10, 12, null, null], // anchor points (indices 0,1) reachable, grid points (indices 2,3) unreachable
          [15, 18, null, null], // anchor points (indices 0,1) reachable, grid points (indices 2,3) unreachable
        ],
        travelMode: 'DRIVING_CAR',
      }

      mockCalculateTravelTimeMatrix.mockResolvedValue(matrixWithUnreachableGrid)

      const result = await singleMatrixService.evaluateAllHypothesisPoints(
        [
          { latitude: 0, longitude: 0 },
          { latitude: 1, longitude: 1 },
        ],
        [mockHypothesisPoints[0], mockHypothesisPoints[1]], // anchor points (will remain)
        [mockHypothesisPoints[2], mockHypothesisPoints[3]], // grid points (will be filtered out)
        'DRIVING_CAR'
      )

      // Should continue with only anchor points
      expect(result.matrix.destinations).toHaveLength(2) // Only anchor destinations remain
      expect(result.matrix.destinations[0]).toEqual(mockDestinations[0]) // dest1 (anchor point 1)
      expect(result.matrix.destinations[1]).toEqual(mockDestinations[1]) // dest2 (anchor point 2)
      expect(result.matrix.travelTimes).toEqual([
        [10, 12], // Only anchor columns from original matrix
        [15, 18], // Only anchor columns from original matrix
      ])
      expect(result.hypothesisPoints).toHaveLength(2) // Only anchor points
      expect(result.totalHypothesisPoints).toBe(4) // Original count before filtering
      expect(singleMatrixService.getApiCallCount()).toBe(1)
    })

    it('should continue processing when some points are unreachable (Requirements 4.1)', async () => {
      const matrixWithMixedReachability: TravelTimeMatrix = {
        origins: mockOrigins,
        destinations: mockDestinations,
        travelTimes: [
          [10, null, 15, null], // mixed reachability: indices 0,2 reachable, indices 1,3 unreachable
          [15, null, 20, null], // mixed reachability: indices 0,2 reachable, indices 1,3 unreachable
        ],
        travelMode: 'DRIVING_CAR',
      }

      mockCalculateTravelTimeMatrix.mockResolvedValue(
        matrixWithMixedReachability
      )

      const result = await singleMatrixService.evaluateAllHypothesisPoints(
        [
          { latitude: 0, longitude: 0 },
          { latitude: 1, longitude: 1 },
        ],
        [mockHypothesisPoints[0], mockHypothesisPoints[1]], // anchor points: first reachable, second unreachable
        [mockHypothesisPoints[2], mockHypothesisPoints[3]], // grid points: first reachable, second unreachable
        'DRIVING_CAR'
      )

      // Should continue with mixed points (one anchor, one grid)
      expect(result.matrix.destinations).toHaveLength(2) // Only reachable destinations remain
      expect(result.matrix.destinations[0]).toEqual(mockDestinations[0]) // dest1 (anchor point 1)
      expect(result.matrix.destinations[1]).toEqual(mockDestinations[2]) // dest3 (grid point 1)
      expect(result.matrix.travelTimes).toEqual([
        [10, 15], // Only reachable columns from original matrix
        [15, 20], // Only reachable columns from original matrix
      ])
      expect(result.hypothesisPoints).toHaveLength(2) // Mixed points
      expect(result.totalHypothesisPoints).toBe(4) // Original count before filtering
      expect(singleMatrixService.getApiCallCount()).toBe(1)
    })
  })
})
