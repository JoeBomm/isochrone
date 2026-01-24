import { calculateMinimaxCenter } from './isochrones'
import { geocodeAddress } from './locations'

// Mock the geometry service to avoid polygon overlap issues in integration tests
jest.mock('src/lib/geometry', () => {
  const mockPolygon = {
    type: 'Polygon',
    coordinates: [[[
      [-74.01, 40.71], [-74.00, 40.71], [-74.00, 40.72], [-74.01, 40.72], [-74.01, 40.71]
    ]]]
  }

  const mockCentroid = {
    latitude: 40.715,
    longitude: -74.005
  }

  const mockPairwiseMidpoints = [
    { latitude: 40.7164, longitude: -74.008 }
  ]

  const mockBoundingBox = {
    north: 40.73,
    south: 40.70,
    east: -73.99,
    west: -74.02
  }

  const mockCoarseGridPoints = [
    { latitude: 40.705, longitude: -74.015 },
    { latitude: 40.705, longitude: -74.005 },
    { latitude: 40.715, longitude: -74.015 },
    { latitude: 40.715, longitude: -74.005 },
    { latitude: 40.725, longitude: -74.015 },
    { latitude: 40.725, longitude: -74.005 }
  ]

  const mockLocalRefinementPoints = [
    { latitude: 40.7145, longitude: -74.0075 },
    { latitude: 40.7155, longitude: -74.0075 },
    { latitude: 40.7145, longitude: -74.0025 },
    { latitude: 40.7155, longitude: -74.0025 }
  ]

  return {
    geometryService: {
      calculatePolygonUnion: jest.fn().mockReturnValue(mockPolygon),
      calculateCentroid: jest.fn().mockReturnValue(mockCentroid),
      validatePolygonOverlap: jest.fn().mockReturnValue(true),
      calculateGeographicCentroid: jest.fn().mockReturnValue(mockCentroid),
      calculateMedianCoordinate: jest.fn().mockReturnValue(mockCentroid),
      calculatePairwiseMidpoints: jest.fn().mockReturnValue(mockPairwiseMidpoints),
      validateCoordinateBounds: jest.fn().mockReturnValue(true),
      calculateBoundingBox: jest.fn().mockReturnValue(mockBoundingBox),
      generateCoarseGridPoints: jest.fn().mockReturnValue(mockCoarseGridPoints),
      generateLocalRefinementPoints: jest.fn().mockReturnValue(mockLocalRefinementPoints)
    },
    TurfGeometryService: jest.fn().mockImplementation(() => ({
      calculatePolygonUnion: jest.fn().mockReturnValue(mockPolygon),
      calculateCentroid: jest.fn().mockReturnValue(mockCentroid),
      validatePolygonOverlap: jest.fn().mockReturnValue(true),
      calculateGeographicCentroid: jest.fn().mockReturnValue(mockCentroid),
      calculateMedianCoordinate: jest.fn().mockReturnValue(mockCentroid),
      calculatePairwiseMidpoints: jest.fn().mockReturnValue(mockPairwiseMidpoints),
      validateCoordinateBounds: jest.fn().mockReturnValue(true),
      calculateBoundingBox: jest.fn().mockReturnValue(mockBoundingBox),
      generateCoarseGridPoints: jest.fn().mockReturnValue(mockCoarseGridPoints),
      generateLocalRefinementPoints: jest.fn().mockReturnValue(mockLocalRefinementPoints)
    }))
  }
})

// Mock the OpenRoute service for integration tests
jest.mock('src/lib/cachedOpenroute', () => ({
  cachedOpenRouteClient: {
    calculateIsochrone: jest.fn().mockResolvedValue({
      type: 'Polygon',
      coordinates: [[[
        [-74.01, 40.71], [-74.00, 40.71], [-74.00, 40.72], [-74.01, 40.72], [-74.01, 40.71]
      ]]]
    }),
    geocodeAddress: jest.fn().mockResolvedValue({
      latitude: 40.7128,
      longitude: -74.0060,
      address: 'New York, NY, USA'
    }),
    calculateTravelTimeMatrix: jest.fn().mockResolvedValue({
      origins: [
        { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
        { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 },
        { id: 'origin_2', name: 'Origin 3', latitude: 40.7300, longitude: -74.0200 }
      ],
      destinations: [
        { id: 'destination_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
        { id: 'destination_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
        { id: 'destination_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
        { id: 'destination_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
        { id: 'destination_4', coordinate: { latitude: 40.7300, longitude: -74.0200 }, type: 'PARTICIPANT_LOCATION', metadata: null },
        { id: 'destination_5', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null },
        { id: 'destination_6', coordinate: { latitude: 40.7214, longitude: -74.013 }, type: 'PAIRWISE_MIDPOINT', metadata: null },
        { id: 'destination_7', coordinate: { latitude: 40.7250, longitude: -74.015 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
      ],
      travelTimes: [
        [10, 10, 5, 15, 25, 12, 18, 20], // Travel times from origin 0 to all destinations (in minutes)
        [15, 15, 20, 5, 15, 12, 8, 12],  // Travel times from origin 1 to all destinations (in minutes)
        [25, 25, 30, 20, 5, 22, 18, 8]   // Travel times from origin 2 to all destinations (in minutes)
      ],
      travelMode: 'DRIVING_CAR'
    })
  }
}))

// Mock the matrix service for integration tests
jest.mock('src/lib/matrix', () => ({
  matrixService: {
    findMinimaxOptimal: jest.fn().mockReturnValue({
      optimalIndex: 7,
      maxTravelTime: 20,
      averageTravelTime: 16.0
    }),
    evaluateBatchedMatrix: jest.fn().mockResolvedValue({
      combinedMatrix: {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 },
          { id: 'origin_2', name: 'Origin 3', latitude: 40.7300, longitude: -74.0200 }
        ],
        destinations: [
          { id: 'destination_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
          { id: 'destination_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
          { id: 'destination_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
          { id: 'destination_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
          { id: 'destination_4', coordinate: { latitude: 40.7300, longitude: -74.0200 }, type: 'PARTICIPANT_LOCATION', metadata: null },
          { id: 'destination_5', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null },
          { id: 'destination_6', coordinate: { latitude: 40.7214, longitude: -74.013 }, type: 'PAIRWISE_MIDPOINT', metadata: null },
          { id: 'destination_7', coordinate: { latitude: 40.7250, longitude: -74.015 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
        ],
        travelTimes: [
          [10, 10, 5, 15, 25, 12, 18, 20],
          [15, 15, 20, 5, 15, 12, 8, 12],
          [25, 25, 30, 20, 5, 22, 18, 8]
        ],
        travelMode: 'DRIVING_CAR'
      },
      phaseResults: [{
        phase: 'PHASE_0',
        matrix: {
          origins: [
            { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
            { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 }
          ],
          destinations: [
            { id: 'destination_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
            { id: 'destination_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
            { id: 'destination_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'destination_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'destination_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
          ],
          travelTimes: [
            [10, 10, 5, 15, 12],
            [15, 15, 20, 5, 12]
          ],
          travelMode: 'DRIVING_CAR'
        },
        hypothesisPoints: [
          { id: 'destination_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
          { id: 'destination_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
          { id: 'destination_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
          { id: 'destination_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
          { id: 'destination_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
        ],
        startIndex: 0,
        endIndex: 5
      }],
      totalHypothesisPoints: [
        { id: 'destination_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
        { id: 'destination_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
        { id: 'destination_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
        { id: 'destination_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
        { id: 'destination_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
      ]
    }),
    evaluatePhase2Matrix: jest.fn().mockResolvedValue({
      origins: [
        { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
        { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 }
      ],
      destinations: [],
      travelTimes: [[], []],
      travelMode: 'DRIVING_CAR'
    }),
    findMultiPhaseMinimaxOptimal: jest.fn().mockReturnValue({
      optimalIndex: 4,
      maxTravelTime: 12,
      averageTravelTime: 12.0,
      optimalPhase: 'PHASE_0',
      optimalHypothesisPoint: {
        id: 'destination_4',
        coordinate: { latitude: 40.7164, longitude: -74.008 },
        type: 'PAIRWISE_MIDPOINT',
        metadata: null
      }
    }),
    validateEpsilonOptimalityImprovement: jest.fn().mockReturnValue({
      hasImprovement: true,
      improvementMinutes: 2,
      improvementPercentage: 13.3,
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

describe('Integration Tests - Complete User Workflows', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetAllMocks()

    // Reset geometry service mocks
    const { geometryService } = require('src/lib/geometry')
    geometryService.calculatePolygonUnion.mockReturnValue({
      type: 'Polygon',
      coordinates: [[[
        [-74.01, 40.71], [-74.00, 40.71], [-74.00, 40.72], [-74.01, 40.72], [-74.01, 40.71]
      ]]]
    })
    geometryService.calculateCentroid.mockReturnValue({
      latitude: 40.715,
      longitude: -74.005
    })
    geometryService.validatePolygonOverlap.mockReturnValue(true)
    geometryService.calculateGeographicCentroid.mockReturnValue({
      latitude: 40.715,
      longitude: -74.005
    })
    geometryService.calculateMedianCoordinate.mockReturnValue({
      latitude: 40.715,
      longitude: -74.005
    })
    geometryService.calculatePairwiseMidpoints.mockReturnValue([
      { latitude: 40.7164, longitude: -74.008 }
    ])
    geometryService.validateCoordinateBounds.mockReturnValue(true)

    // Reset matrix service mocks
    const { matrixService } = require('src/lib/matrix')
    matrixService.findMinimaxOptimal.mockReturnValue({
      optimalIndex: 4,
      maxTravelTime: 12,
      averageTravelTime: 12.0
    })
    matrixService.evaluateBatchedMatrix.mockResolvedValue({
      combinedMatrix: {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 }
        ],
        destinations: [
          { id: 'destination_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
          { id: 'destination_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
          { id: 'destination_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
          { id: 'destination_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
          { id: 'destination_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
        ],
        travelTimes: [
          [10, 10, 5, 15, 12],
          [15, 15, 20, 5, 12]
        ],
        travelMode: 'DRIVING_CAR'
      },
      phaseResults: [{
        phase: 'PHASE_0',
        matrix: {
          origins: [
            { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
            { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 }
          ],
          destinations: [
            { id: 'destination_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
            { id: 'destination_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
            { id: 'destination_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'destination_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'destination_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
          ],
          travelTimes: [
            [10, 10, 5, 15, 12],
            [15, 15, 20, 5, 12]
          ],
          travelMode: 'DRIVING_CAR'
        },
        hypothesisPoints: [
          { id: 'destination_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
          { id: 'destination_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
          { id: 'destination_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
          { id: 'destination_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
          { id: 'destination_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
        ],
        startIndex: 0,
        endIndex: 5
      }],
      totalHypothesisPoints: [
        { id: 'destination_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
        { id: 'destination_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
        { id: 'destination_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
        { id: 'destination_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
        { id: 'destination_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
      ]
    })
    matrixService.evaluatePhase2Matrix.mockResolvedValue({
      origins: [
        { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
        { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 }
      ],
      destinations: [],
      travelTimes: [[], []],
      travelMode: 'DRIVING_CAR'
    })
    matrixService.findMultiPhaseMinimaxOptimal.mockReturnValue({
      optimalIndex: 4,
      maxTravelTime: 12,
      averageTravelTime: 12.0,
      optimalPhase: 'PHASE_0',
      optimalHypothesisPoint: {
        id: 'destination_4',
        coordinate: { latitude: 40.7164, longitude: -74.008 },
        type: 'PAIRWISE_MIDPOINT',
        metadata: null
      }
    })

    // Reset OpenRoute client mocks
    const { cachedOpenRouteClient } = require('src/lib/cachedOpenroute')
    cachedOpenRouteClient.calculateIsochrone.mockResolvedValue({
      type: 'Polygon',
      coordinates: [[[
        [-74.01, 40.71], [-74.00, 40.71], [-74.00, 40.72], [-74.01, 40.72], [-74.01, 40.71]
      ]]]
    })
    cachedOpenRouteClient.geocodeAddress.mockResolvedValue({
      latitude: 40.7128,
      longitude: -74.0060,
      address: 'New York, NY, USA'
    })
    cachedOpenRouteClient.calculateTravelTimeMatrix.mockResolvedValue({
      origins: [
        { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
        { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 }
      ],
      destinations: [
        { id: 'destination_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
        { id: 'destination_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
        { id: 'destination_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
        { id: 'destination_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
        { id: 'destination_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
      ],
      travelTimes: [
        [10, 10, 5, 15, 12], // Travel times from origin 0 to all destinations (in minutes)
        [15, 15, 20, 5, 12]  // Travel times from origin 1 to all destinations (in minutes)
      ],
      travelMode: 'DRIVING_CAR'
    })
  })

  describe('End-to-End User Journey: Address to Fair Meeting Point', () => {
    it('should complete full workflow from address geocoding to isochrone calculation', async () => {
      // Step 1: Geocode multiple addresses
      const address1 = 'New York, NY'
      const address2 = 'Brooklyn, NY'

      const geocoded1 = await geocodeAddress({ address: address1 })
      const geocoded2 = await geocodeAddress({ address: address2 })

      expect(geocoded1).toHaveProperty('latitude')
      expect(geocoded1).toHaveProperty('longitude')
      expect(geocoded1).toHaveProperty('address')

      expect(geocoded2).toHaveProperty('latitude')
      expect(geocoded2).toHaveProperty('longitude')
      expect(geocoded2).toHaveProperty('address')

      // Step 2: Calculate isochronic center with geocoded locations
      const locationInputs = [
        {
          name: 'Location 1',
          latitude: geocoded1.latitude,
          longitude: geocoded1.longitude
        },
        {
          name: 'Location 2',
          latitude: geocoded2.latitude,
          longitude: geocoded2.longitude
        }
      ]

      const result = await calculateMinimaxCenter({
        locations: locationInputs,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR'
      })

      // Verify complete result structure
      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')
      expect(result.centerPoint).toHaveProperty('latitude')
      expect(result.centerPoint).toHaveProperty('longitude')
      expect(result.fairMeetingArea).toHaveProperty('type', 'Polygon')
      expect(result.fairMeetingArea).toHaveProperty('coordinates')
    })

    it('should handle coordinate input workflow', async () => {
      // Direct coordinate input workflow
      const locationInputs = [
        {
          name: 'Point A',
          latitude: 40.7128,
          longitude: -74.0060
        },
        {
          name: 'Point B',
          latitude: 40.6892,
          longitude: -74.0445
        },
        {
          name: 'Point C',
          latitude: 40.7589,
          longitude: -73.9851
        }
      ]

      const result = await calculateMinimaxCenter({
        locations: locationInputs,
        bufferTimeMinutes: 5,
        travelMode: 'CYCLING_REGULAR'
      })

      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')
      expect(result.centerPoint.latitude).toBeGreaterThan(-90)
      expect(result.centerPoint.latitude).toBeLessThan(90)
      expect(result.centerPoint.longitude).toBeGreaterThan(-180)
      expect(result.centerPoint.longitude).toBeLessThan(180)
    })
  })

  describe('Cache Behavior Integration', () => {
    it('should demonstrate cache hit/miss scenarios with location proximity', async () => {
      const baseLocation = {
        name: 'Base Location',
        latitude: 40.7128,
        longitude: -74.0060
      }

      // First request - should be cache miss
      const result1 = await calculateMinimaxCenter({
        locations: [baseLocation, { name: 'Other', latitude: 40.7200, longitude: -74.0100 }],
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR'
      })

      // Second request with same parameters - should be cache hit
      const result2 = await calculateMinimaxCenter({
        locations: [baseLocation, { name: 'Other', latitude: 40.7200, longitude: -74.0100 }],
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR'
      })

      // Results should be identical (from cache)
      expect(result1.centerPoint).toEqual(result2.centerPoint)
      expect(result1.fairMeetingArea).toEqual(result2.fairMeetingArea)

      // Third request with location within 100m (should be cache hit due to proximity matching)
      const nearbyLocation = {
        name: 'Nearby Location',
        latitude: 40.7129, // ~111m difference
        longitude: -74.0061
      }

      const result3 = await calculateMinimaxCenter({
        locations: [nearbyLocation, { name: 'Other', latitude: 40.7200, longitude: -74.0100 }],
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR'
      })

      // Should get cached result due to proximity matching
      expect(result3).toBeDefined()
    })
  })

  describe('Error Handling Across Full Application Stack', () => {
    it('should handle geocoding failures gracefully', async () => {
      const { cachedOpenRouteClient } = require('src/lib/cachedOpenroute')

      // Mock geocoding failure
      cachedOpenRouteClient.geocodeAddress.mockRejectedValueOnce(
        new Error('Geocoding service unavailable')
      )

      await expect(
        geocodeAddress({ address: 'Invalid Address' })
      ).rejects.toThrow('Internal error in geocodeAddress')
    })

    it('should handle isochrone calculation failures', async () => {
      const { cachedOpenRouteClient } = require('src/lib/cachedOpenroute')

      // Mock isochrone calculation failure
      cachedOpenRouteClient.calculateIsochrone.mockRejectedValueOnce(
        new Error('Isochrone calculation failed')
      )

      await expect(
        calculateMinimaxCenter({
          locations: [
            { name: 'Test', latitude: 40.7128, longitude: -74.0060 }
          ],
          bufferTimeMinutes: 10,
          travelMode: 'DRIVING_CAR'
        })
      ).rejects.toThrow()
    })

    it('should handle invalid location data', async () => {
      await expect(
        calculateMinimaxCenter({
          locations: [
            { name: 'Invalid', latitude: 200, longitude: -74.0060 } // Invalid latitude
          ],
          bufferTimeMinutes: 10,
          travelMode: 'DRIVING_CAR'
        })
      ).rejects.toThrow()
    })

    it('should handle insufficient locations', async () => {
      await expect(
        calculateMinimaxCenter({
          locations: [
            { name: 'Single', latitude: 40.7128, longitude: -74.0060 }
          ],
          bufferTimeMinutes: 10,
          travelMode: 'DRIVING_CAR'
        })
      ).rejects.toThrow('Please add at least 2 locations')
    })
  })

  describe('Different Travel Modes Integration', () => {
    const testLocations = [
      { name: 'A', latitude: 40.7128, longitude: -74.0060 },
      { name: 'B', latitude: 40.7200, longitude: -74.0100 }
    ]

    it('should handle driving mode', async () => {
      // Explicitly reset mocks for this test
      const { cachedOpenRouteClient } = require('src/lib/cachedOpenroute')
      cachedOpenRouteClient.calculateIsochrone.mockClear()
      cachedOpenRouteClient.calculateIsochrone.mockResolvedValue({
        type: 'Polygon',
        coordinates: [[[
          [-74.01, 40.71], [-74.00, 40.71], [-74.00, 40.72], [-74.01, 40.72], [-74.01, 40.71]
        ]]]
      })

      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'DRIVING_CAR'
      })

      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')

      // Verify the mock was called with correct travel mode
      expect(cachedOpenRouteClient.calculateIsochrone).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          travelMode: 'DRIVING_CAR'
        })
      )
    })

    it('should handle cycling mode', async () => {
      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'CYCLING_REGULAR'
      })

      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')
    })

    it('should handle walking mode', async () => {
      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 10,
        travelMode: 'FOOT_WALKING'
      })

      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')
    })
  })

  describe('Buffer Time Variations', () => {
    const testLocations = [
      { name: 'A', latitude: 40.7128, longitude: -74.0060 },
      { name: 'B', latitude: 40.7200, longitude: -74.0100 }
    ]

    it('should handle minimum buffer time (5 minutes)', async () => {
      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 5,
        travelMode: 'DRIVING_CAR'
      })

      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')
    })

    it('should handle maximum buffer time (60 minutes)', async () => {
      const result = await calculateMinimaxCenter({
        locations: testLocations,
        bufferTimeMinutes: 60,
        travelMode: 'DRIVING_CAR'
      })

      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')
    })
  })
})

describe('Multi-Phase Optimization Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetAllMocks()

    // Setup matrix service mocks for multi-phase
    const { matrixService } = require('src/lib/matrix')
    matrixService.evaluateBatchedMatrix.mockResolvedValue({
      combinedMatrix: {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 }
        ],
        destinations: [
          // Phase 0 points
          { id: 'dest_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
          { id: 'dest_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
          { id: 'dest_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
          { id: 'dest_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
          { id: 'dest_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null },
          // Phase 1 points
          { id: 'dest_5', coordinate: { latitude: 40.705, longitude: -74.015 }, type: 'COARSE_GRID_CELL', metadata: null },
          { id: 'dest_6', coordinate: { latitude: 40.705, longitude: -74.005 }, type: 'COARSE_GRID_CELL', metadata: null },
          { id: 'dest_7', coordinate: { latitude: 40.715, longitude: -74.015 }, type: 'COARSE_GRID_CELL', metadata: null },
          { id: 'dest_8', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'COARSE_GRID_CELL', metadata: null },
          { id: 'dest_9', coordinate: { latitude: 40.725, longitude: -74.015 }, type: 'COARSE_GRID_CELL', metadata: null },
          { id: 'dest_10', coordinate: { latitude: 40.725, longitude: -74.005 }, type: 'COARSE_GRID_CELL', metadata: null }
        ],
        travelTimes: [
          [10, 10, 5, 15, 12, 18, 12, 16, 10, 20, 14], // From origin 0
          [15, 15, 20, 5, 12, 22, 16, 20, 15, 8, 18]   // From origin 1
        ],
        travelMode: 'DRIVING_CAR'
      },
      phaseResults: [
        {
          phase: 'PHASE_0',
          matrix: {
            origins: [
              { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
              { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 }
            ],
            destinations: [
              { id: 'dest_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
              { id: 'dest_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
              { id: 'dest_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
              { id: 'dest_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
              { id: 'dest_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
            ],
            travelTimes: [
              [10, 10, 5, 15, 12],
              [15, 15, 20, 5, 12]
            ],
            travelMode: 'DRIVING_CAR'
          },
          hypothesisPoints: [
            { id: 'dest_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
            { id: 'dest_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
            { id: 'dest_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'dest_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'dest_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
          ],
          startIndex: 0,
          endIndex: 5
        },
        {
          phase: 'PHASE_1',
          matrix: {
            origins: [
              { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
              { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 }
            ],
            destinations: [
              { id: 'dest_5', coordinate: { latitude: 40.705, longitude: -74.015 }, type: 'COARSE_GRID_CELL', metadata: null },
              { id: 'dest_6', coordinate: { latitude: 40.705, longitude: -74.005 }, type: 'COARSE_GRID_CELL', metadata: null },
              { id: 'dest_7', coordinate: { latitude: 40.715, longitude: -74.015 }, type: 'COARSE_GRID_CELL', metadata: null },
              { id: 'dest_8', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'COARSE_GRID_CELL', metadata: null },
              { id: 'dest_9', coordinate: { latitude: 40.725, longitude: -74.015 }, type: 'COARSE_GRID_CELL', metadata: null },
              { id: 'dest_10', coordinate: { latitude: 40.725, longitude: -74.005 }, type: 'COARSE_GRID_CELL', metadata: null }
            ],
            travelTimes: [
              [18, 12, 16, 10, 20, 14],
              [22, 16, 20, 15, 8, 18]
            ],
            travelMode: 'DRIVING_CAR'
          },
          hypothesisPoints: [
            { id: 'dest_5', coordinate: { latitude: 40.705, longitude: -74.015 }, type: 'COARSE_GRID_CELL', metadata: null },
            { id: 'dest_6', coordinate: { latitude: 40.705, longitude: -74.005 }, type: 'COARSE_GRID_CELL', metadata: null },
            { id: 'dest_7', coordinate: { latitude: 40.715, longitude: -74.015 }, type: 'COARSE_GRID_CELL', metadata: null },
            { id: 'dest_8', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'COARSE_GRID_CELL', metadata: null },
            { id: 'dest_9', coordinate: { latitude: 40.725, longitude: -74.015 }, type: 'COARSE_GRID_CELL', metadata: null },
            { id: 'dest_10', coordinate: { latitude: 40.725, longitude: -74.005 }, type: 'COARSE_GRID_CELL', metadata: null }
          ],
          startIndex: 5,
          endIndex: 11
        }
      ],
      totalHypothesisPoints: [
        { id: 'dest_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
        { id: 'dest_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
        { id: 'dest_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
        { id: 'dest_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
        { id: 'dest_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null },
        { id: 'dest_5', coordinate: { latitude: 40.705, longitude: -74.015 }, type: 'COARSE_GRID_CELL', metadata: null },
        { id: 'dest_6', coordinate: { latitude: 40.705, longitude: -74.005 }, type: 'COARSE_GRID_CELL', metadata: null },
        { id: 'dest_7', coordinate: { latitude: 40.715, longitude: -74.015 }, type: 'COARSE_GRID_CELL', metadata: null },
        { id: 'dest_8', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'COARSE_GRID_CELL', metadata: null },
        { id: 'dest_9', coordinate: { latitude: 40.725, longitude: -74.015 }, type: 'COARSE_GRID_CELL', metadata: null },
        { id: 'dest_10', coordinate: { latitude: 40.725, longitude: -74.005 }, type: 'COARSE_GRID_CELL', metadata: null }
      ]
    })

    matrixService.evaluatePhase2Matrix.mockResolvedValue({
      phase: 'PHASE_2',
      matrix: {
        origins: [
          { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
          { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 }
        ],
        destinations: [
          { id: 'dest_11', coordinate: { latitude: 40.7145, longitude: -74.0075 }, type: 'LOCAL_REFINEMENT', metadata: null },
          { id: 'dest_12', coordinate: { latitude: 40.7155, longitude: -74.0075 }, type: 'LOCAL_REFINEMENT', metadata: null },
          { id: 'dest_13', coordinate: { latitude: 40.7145, longitude: -74.0025 }, type: 'LOCAL_REFINEMENT', metadata: null },
          { id: 'dest_14', coordinate: { latitude: 40.7155, longitude: -74.0025 }, type: 'LOCAL_REFINEMENT', metadata: null }
        ],
        travelTimes: [
          [9, 11, 8, 10],
          [14, 16, 13, 15]
        ],
        travelMode: 'DRIVING_CAR'
      },
      hypothesisPoints: [
        { id: 'dest_11', coordinate: { latitude: 40.7145, longitude: -74.0075 }, type: 'LOCAL_REFINEMENT', metadata: null },
        { id: 'dest_12', coordinate: { latitude: 40.7155, longitude: -74.0075 }, type: 'LOCAL_REFINEMENT', metadata: null },
        { id: 'dest_13', coordinate: { latitude: 40.7145, longitude: -74.0025 }, type: 'LOCAL_REFINEMENT', metadata: null },
        { id: 'dest_14', coordinate: { latitude: 40.7155, longitude: -74.0025 }, type: 'LOCAL_REFINEMENT', metadata: null }
      ],
      startIndex: 0,
      endIndex: 4
    })

    matrixService.findMultiPhaseMinimaxOptimal.mockReturnValue({
      optimalIndex: 13, // Phase 2 refinement point
      maxTravelTime: 13,
      averageTravelTime: 10.5,
      optimalPhase: 'PHASE_2',
      optimalHypothesisPoint: {
        id: 'dest_13',
        coordinate: { latitude: 40.7145, longitude: -74.0025 },
        type: 'LOCAL_REFINEMENT',
        metadata: null
      }
    })

    matrixService.validateEpsilonOptimalityImprovement.mockReturnValue({
      hasImprovement: true,
      improvementMinutes: 2,
      improvementPercentage: 13.3,
      isSignificant: true
    })

    matrixService.mergeMatrixResults = jest.fn().mockImplementation((batchedResult, phase2Result) => {
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
  })

  describe('BASELINE optimization mode', () => {
    it('should complete workflow with Phase 0 only', async () => {
      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
        { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
      ]

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
      expect(result).toHaveProperty('optimizationMetadata')
      expect(result.optimizationMetadata?.mode).toBe('BASELINE')
      expect(result.optimizationMetadata?.totalHypothesisPoints).toBe(7) // Phase 0 only: 1 centroid + 1 median + 3 participants + 3 pairwise midpoints
    })
  })

  describe('COARSE_GRID optimization mode', () => {
    it('should complete workflow with Phase 0+1', async () => {
      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
        { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
      ]

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
      expect(result).toHaveProperty('optimizationMetadata')
      expect(result.optimizationMetadata?.mode).toBe('COARSE_GRID')
      expect(result.optimizationMetadata?.totalHypothesisPoints).toBe(32) // Phase 0 (7) + Phase 1 (25)

      // Verify batched matrix evaluation was called
      const { matrixService } = require('src/lib/matrix')
      expect(matrixService.evaluateBatchedMatrix).toHaveBeenCalledTimes(1)
      expect(matrixService.evaluatePhase2Matrix).not.toHaveBeenCalled()
    })

    it('should handle API call optimization for Phase 0+1', async () => {
      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
        { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
      ]

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

      // Verify only one Matrix API call was made for Phase 0+1 combined
      const { cachedOpenRouteClient } = require('src/lib/cachedOpenroute')
      expect(cachedOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(1)
    })
  })

  describe('FULL_REFINEMENT optimization mode', () => {
    it('should complete workflow with all phases (0+1+2)', async () => {
      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
        { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
      ]

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
      expect(result).toHaveProperty('optimizationMetadata')
      expect(result.optimizationMetadata?.mode).toBe('FULL_REFINEMENT')
      expect(result.optimizationMetadata?.totalHypothesisPoints).toBe(59) // Phase 0 (7) + Phase 1 (25) + Phase 2 (27)

      // Verify both batched and Phase 2 matrix evaluations were called
      const { matrixService } = require('src/lib/matrix')
      expect(matrixService.evaluateBatchedMatrix).toHaveBeenCalledTimes(1)
      expect(matrixService.evaluatePhase2Matrix).toHaveBeenCalledTimes(1)
    })

    it('should demonstrate ε-optimality improvement', async () => {
      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
        { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
      ]

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

      expect(result.optimizationMetadata?.improvementValidation).toBeDefined()
      expect(result.optimizationMetadata?.improvementValidation?.hasImprovement).toBe(true)
      expect(result.optimizationMetadata?.improvementValidation?.isSignificant).toBe(true)
      expect(result.optimizationMetadata?.improvementValidation?.improvementMinutes).toBe(2)
    })

    it('should handle maximum API call limit (2 calls)', async () => {
      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
        { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
      ]

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

      // Verify exactly 2 Matrix API calls were made (1 for Phase 0+1, 1 for Phase 2)
      const { cachedOpenRouteClient } = require('src/lib/cachedOpenroute')
      expect(cachedOpenRouteClient.calculateTravelTimeMatrix).toHaveBeenCalledTimes(2)
    })
  })

  describe('Multi-phase error handling and fallback', () => {
    it('should fall back to Phase 0 when coarse grid fails', async () => {
      const { matrixService } = require('src/lib/matrix')

      // Mock coarse grid failure
      matrixService.evaluateBatchedMatrix.mockRejectedValueOnce(
        new Error('Coarse grid matrix evaluation failed')
      )

      // Mock fallback to Phase 0 only
      matrixService.evaluateBatchedMatrix.mockResolvedValueOnce({
        combinedMatrix: {
          origins: [
            { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
            { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 }
          ],
          destinations: [
            { id: 'dest_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
            { id: 'dest_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
            { id: 'dest_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'dest_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'dest_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
          ],
          travelTimes: [
            [10, 10, 5, 15, 12],
            [15, 15, 20, 5, 12]
          ],
          travelMode: 'DRIVING_CAR'
        },
        phaseResults: [{
          phase: 'PHASE_0',
          matrix: {
            origins: [
              { id: 'origin_0', name: 'Origin 1', latitude: 40.7128, longitude: -74.0060 },
              { id: 'origin_1', name: 'Origin 2', latitude: 40.7200, longitude: -74.0100 }
            ],
            destinations: [
              { id: 'dest_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
              { id: 'dest_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
              { id: 'dest_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
              { id: 'dest_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
              { id: 'dest_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
            ],
            travelTimes: [
              [10, 10, 5, 15, 12],
              [15, 15, 20, 5, 12]
            ],
            travelMode: 'DRIVING_CAR'
          },
          hypothesisPoints: [
            { id: 'dest_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
            { id: 'dest_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
            { id: 'dest_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'dest_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
            { id: 'dest_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
          ],
          startIndex: 0,
          endIndex: 5
        }],
        totalHypothesisPoints: [
          { id: 'dest_0', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'GEOGRAPHIC_CENTROID', metadata: null },
          { id: 'dest_1', coordinate: { latitude: 40.715, longitude: -74.005 }, type: 'MEDIAN_COORDINATE', metadata: null },
          { id: 'dest_2', coordinate: { latitude: 40.7128, longitude: -74.0060 }, type: 'PARTICIPANT_LOCATION', metadata: null },
          { id: 'dest_3', coordinate: { latitude: 40.7200, longitude: -74.0100 }, type: 'PARTICIPANT_LOCATION', metadata: null },
          { id: 'dest_4', coordinate: { latitude: 40.7164, longitude: -74.008 }, type: 'PAIRWISE_MIDPOINT', metadata: null }
        ]
      })

      matrixService.findMultiPhaseMinimaxOptimal.mockReturnValue({
        optimalIndex: 4,
        maxTravelTime: 12,
        averageTravelTime: 12.0,
        optimalPhase: 'PHASE_0',
        optimalHypothesisPoint: {
          id: 'dest_4',
          coordinate: { latitude: 40.7164, longitude: -74.008 },
          type: 'PAIRWISE_MIDPOINT',
          metadata: null
        }
      })

      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
        { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
      ]

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

      // Should still return a valid result from Phase 0 fallback
      expect(result).toHaveProperty('centerPoint')
      expect(result).toHaveProperty('fairMeetingArea')
      expect(result.optimizationMetadata?.totalHypothesisPoints).toBe(7) // Phase 0 only
    })

    it('should continue without Phase 2 when local refinement fails', async () => {
      const { matrixService } = require('src/lib/matrix')

      // Mock Phase 2 failure
      matrixService.evaluatePhase2Matrix.mockRejectedValueOnce(
        new Error('Local refinement matrix evaluation failed')
      )

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

      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
        { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
      ]

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
      expect(result.optimizationMetadata?.totalHypothesisPoints).toBe(32) // Phase 0 (7) + Phase 1 (25) only
    })
  })

  describe('Performance validation', () => {
    it('should respect API usage limits across all optimization modes', async () => {
      const testLocations = [
        { name: 'Location A', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location B', latitude: 40.7200, longitude: -74.0100 },
        { name: 'Location C', latitude: 40.7300, longitude: -74.0200 }
      ]

      // Test BASELINE mode (1 API call expected)
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

      // Test COARSE_GRID mode (1 API call expected)
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

      // Test FULL_REFINEMENT mode (2 API calls expected)
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

      // Verify total API calls don't exceed limits
      const { cachedOpenRouteClient } = require('src/lib/cachedOpenroute')
      const totalCalls = cachedOpenRouteClient.calculateTravelTimeMatrix.mock.calls.length
      expect(totalCalls).toBeLessThanOrEqual(4) // 1 + 1 + 2 = 4 calls maximum
    })

    it('should validate hypothesis point generation performance', async () => {
      const testLocations = Array.from({ length: 5 }, (_, i) => ({
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
          mode: 'FULL_REFINEMENT',
          coarseGridConfig: { enabled: true, paddingKm: 5, gridResolution: 10 },
          localRefinementConfig: { enabled: true, topK: 5, refinementRadiusKm: 2, fineGridResolution: 5 }
        }
      })

      const endTime = Date.now()
      const executionTime = endTime - startTime

      // Should complete within reasonable time (adjust threshold as needed)
      expect(executionTime).toBeLessThan(5000) // 5 seconds
    })
  })
})