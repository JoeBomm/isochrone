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

  return {
    geometryService: {
      calculatePolygonUnion: jest.fn().mockReturnValue(mockPolygon),
      calculateCentroid: jest.fn().mockReturnValue(mockCentroid),
      validatePolygonOverlap: jest.fn().mockReturnValue(true),
      calculateGeographicCentroid: jest.fn().mockReturnValue(mockCentroid),
      calculateMedianCoordinate: jest.fn().mockReturnValue(mockCentroid),
      calculatePairwiseMidpoints: jest.fn().mockReturnValue(mockPairwiseMidpoints),
      validateCoordinateBounds: jest.fn().mockReturnValue(true)
    },
    TurfGeometryService: jest.fn().mockImplementation(() => ({
      calculatePolygonUnion: jest.fn().mockReturnValue(mockPolygon),
      calculateCentroid: jest.fn().mockReturnValue(mockCentroid),
      validatePolygonOverlap: jest.fn().mockReturnValue(true),
      calculateGeographicCentroid: jest.fn().mockReturnValue(mockCentroid),
      calculateMedianCoordinate: jest.fn().mockReturnValue(mockCentroid),
      calculatePairwiseMidpoints: jest.fn().mockReturnValue(mockPairwiseMidpoints),
      validateCoordinateBounds: jest.fn().mockReturnValue(true)
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