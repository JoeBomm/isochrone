import { matrixService } from './matrix'
import type { TravelTimeMatrix, HypothesisPoint } from 'types/graphql'

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
})