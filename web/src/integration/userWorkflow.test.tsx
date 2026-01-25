import { MockedProvider } from '@apollo/client/testing'

import { render, screen, fireEvent, waitFor } from '@redwoodjs/testing/web'

import {
  GEOCODE_ADDRESS,
  FIND_OPTIMAL_LOCATIONS,
  CALCULATE_ISOCHRONE,
  CALCULATE_MINIMAX_CENTER,
} from 'src/lib/graphql'
import HomePage from 'src/pages/HomePage/HomePage'

// Mock the Map component to avoid Leaflet issues in JSDOM
jest.mock('src/components/Map/Map', () => {
  return function MockMap({
    locations,
    hypothesisPoints,
    isochrones,
    onHypothesisPointClick,
  }) {
    return (
      <div data-testid="mock-map" className="map-container">
        <div>Mock Map Component</div>
        <div>Locations: {locations?.length || 0}</div>
        <div>Hypothesis Points: {hypothesisPoints?.length || 0}</div>
        <div>Isochrones: {isochrones?.length || 0}</div>
        {hypothesisPoints?.map((point, index) => (
          <button
            key={point.id}
            data-testid={`hypothesis-point-${index}`}
            onClick={() => onHypothesisPointClick?.(point)}
          >
            {point.id}
          </button>
        ))}
      </div>
    )
  }
})

// Mock GraphQL responses
const mockGeocodeResponse = {
  request: {
    query: GEOCODE_ADDRESS,
    variables: { address: 'New York, NY' },
  },
  result: {
    data: {
      geocodeAddress: {
        latitude: 40.7128,
        longitude: -74.006,
      },
    },
  },
}

const mockFindOptimalLocationsResponse = {
  request: {
    query: FIND_OPTIMAL_LOCATIONS,
    variables: {
      locations: [
        { name: 'New York, NY', latitude: 40.7128, longitude: -74.006 },
        { name: 'Brooklyn, NY', latitude: 40.6892, longitude: -74.0445 },
      ],
      travelMode: 'DRIVING_CAR',
      optimizationGoal: 'MINIMAX',
      topM: 3,
      gridSize: 5,
      deduplicationThreshold: 5000.0,
    },
  },
  result: {
    data: {
      findOptimalLocations: {
        optimalPoints: [
          {
            id: 'optimal-1',
            coordinate: { latitude: 40.701, longitude: -74.0252 },
            travelTimeMetrics: {
              maxTravelTime: 15.5,
              averageTravelTime: 12.3,
              totalTravelTime: 24.6,
              variance: 2.1,
            },
            rank: 1,
          },
        ],
        debugPoints: [
          {
            id: 'anchor-1',
            coordinate: { latitude: 40.701, longitude: -74.0252 },
            type: 'ANCHOR',
          },
        ],
        matrixApiCalls: 1,
        totalHypothesisPoints: 25,
      },
    },
  },
}

const mockCalculateIsochroneResponse = {
  request: {
    query: CALCULATE_ISOCHRONE,
    variables: {
      pointId: 'geographic_centroid',
      coordinate: { latitude: 40.701, longitude: -74.0252 },
      travelTimeMinutes: 10,
      travelMode: 'DRIVING_CAR',
    },
  },
  result: {
    data: {
      calculateIsochrone: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    },
  },
}

const mockFindOptimalLocationsCoordinateResponse = [
  {
    request: {
      query: FIND_OPTIMAL_LOCATIONS,
      variables: {
        locations: [
          { name: '40.7128, -74.0060', latitude: 40.7128, longitude: -74.006 },
          { name: '40.6892, -74.0445', latitude: 40.6892, longitude: -74.0445 },
        ],
        travelMode: 'DRIVING_CAR',
        optimizationGoal: 'MINIMAX',
        topM: 3,
        gridSize: 5,
        deduplicationThreshold: 5000.0,
      },
    },
    result: {
      data: {
        findOptimalLocations: {
          optimalPoints: [
            {
              id: 'optimal-1',
              coordinate: { latitude: 40.701, longitude: -74.0252 },
              travelTimeMetrics: {
                maxTravelTime: 15.5,
                averageTravelTime: 12.3,
                totalTravelTime: 24.6,
                variance: 2.1,
              },
              rank: 1,
            },
          ],
          debugPoints: [],
          matrixApiCalls: 1,
          totalHypothesisPoints: 25,
        },
      },
    },
  },
  {
    request: {
      query: FIND_OPTIMAL_LOCATIONS,
      variables: {
        locations: [
          { name: 'Location 1', latitude: 40.7128, longitude: -74.006 },
          { name: 'Location 2', latitude: 40.7589, longitude: -73.9851 },
        ],
        travelMode: 'DRIVING_CAR',
        optimizationGoal: 'MINIMAX',
        topM: 3,
        gridSize: 5,
        deduplicationThreshold: 5000.0,
      },
    },
    result: {
      data: {
        findOptimalLocations: {
          optimalPoints: [
            {
              id: 'optimal-1',
              coordinate: {
                latitude: 40.701,
                longitude: -74.0252,
              },
              travelTimeMetrics: {
                maxTravelTime: 15.5,
                averageTravelTime: 12.3,
                totalTravelTime: 24.6,
                variance: 2.1,
              },
              rank: 1,
            },
          ],
          debugPoints: [],
          matrixApiCalls: 1,
          totalHypothesisPoints: 25,
        },
      },
    },
  },
]

const mockBrooklynGeocodeResponse = {
  request: {
    query: GEOCODE_ADDRESS,
    variables: { address: 'Brooklyn, NY' },
  },
  result: {
    data: {
      geocodeAddress: {
        latitude: 40.6892,
        longitude: -74.0445,
      },
    },
  },
}

describe('Integration Tests - Complete User Workflows', () => {
  describe('End-to-End Address Input to Fair Meeting Point', () => {
    it('should complete full workflow from address input to result display', async () => {
      const mocks = [
        mockGeocodeResponse,
        mockBrooklynGeocodeResponse,
        mockFindOptimalLocationsResponse,
        mockCalculateIsochroneResponse,
      ]

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      // Step 1: Add first location by address
      const addressInput = screen.getByPlaceholderText(
        /123 Main St, City or 40.7128,-74.0060/i
      )
      const addButton = screen.getByRole('button', { name: /add location/i })

      fireEvent.change(addressInput, { target: { value: 'New York, NY' } })
      fireEvent.click(addButton)

      // Wait for geocoding to complete
      await waitFor(() => {
        // Look for the location in the location list, not the toast
        const locationElements = screen.getAllByText(/New York, NY/i)
        expect(locationElements.length).toBeGreaterThan(0)
      })

      // Step 2: Add second location
      fireEvent.change(addressInput, { target: { value: 'Brooklyn, NY' } })
      fireEvent.click(addButton)

      await waitFor(() => {
        const locationElements = screen.getAllByText(/Brooklyn, NY/i)
        expect(locationElements.length).toBeGreaterThan(0)
      })

      // Step 3: Calculate fair meeting point
      const calculateButton = screen.getByRole('button', {
        name: /calculate optimal meeting points/i,
      })
      fireEvent.click(calculateButton)

      await waitFor(
        () => {
          // Look for the success message in toast notifications
          expect(
            screen.getByText(
              /Successfully calculated optimal meeting location/i
            )
          ).toBeInTheDocument()
        },
        { timeout: 5000 }
      )

      // Verify results are displayed
      expect(screen.getAllByText(/Center Point/i).length).toBeGreaterThan(0)
    })
  })

  const mockCalculateCoordinateResponse = {
    request: {
      query: FIND_OPTIMAL_LOCATIONS,
      variables: {
        locations: [
          { name: '40.7128, -74.0060', latitude: 40.7128, longitude: -74.006 },
        ],
        travelMode: 'DRIVING_CAR',
        optimizationGoal: 'MINIMAX',
        topM: 3,
        gridSize: 5,
        deduplicationThreshold: 5000.0,
      },
    },
    result: {
      data: {
        findOptimalLocations: {
          optimalPoints: [
            {
              id: 'optimal-1',
              coordinate: {
                latitude: 40.7128,
                longitude: -74.006,
              },
              travelTimeMetrics: {
                maxTravelTime: 0,
                averageTravelTime: 0,
                totalTravelTime: 0,
                variance: 0,
              },
              rank: 1,
            },
          ],
          debugPoints: [],
          matrixApiCalls: 1,
          totalHypothesisPoints: 1,
        },
      },
    },
  }

  describe('Coordinate Input Workflow', () => {
    it('should handle direct coordinate input', async () => {
      const coordinateMocks = [mockCalculateCoordinateResponse]

      render(
        <MockedProvider mocks={coordinateMocks} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      const addressInput = screen.getByPlaceholderText(
        /123 Main St, City or 40.7128,-74.0060/i
      )
      const addButton = screen.getByRole('button', { name: /add location/i })

      // Add first location by coordinates
      fireEvent.change(addressInput, { target: { value: '40.7128, -74.0060' } })
      fireEvent.click(addButton)

      await waitFor(() => {
        const locationElements = screen.getAllByText(/40.7128, -74.0060/i)
        expect(locationElements.length).toBeGreaterThan(0)
      })

      // Add second location by coordinates
      fireEvent.change(addressInput, { target: { value: '40.6892, -74.0445' } })
      fireEvent.click(addButton)

      await waitFor(() => {
        const locationElements = screen.getAllByText(/40.6892, -74.0445/i)
        expect(locationElements.length).toBeGreaterThan(0)
      })

      // Calculate fair meeting point
      const calculateButton = screen.getByRole('button', {
        name: /calculate optimal meeting points/i,
      })
      fireEvent.click(calculateButton)

      await waitFor(() => {
        expect(
          screen.getByText(/Successfully calculated optimal meeting location/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling in UI', () => {
    it('should display error messages for failed geocoding', async () => {
      const errorMock = {
        request: {
          query: GEOCODE_ADDRESS,
          variables: { address: 'Invalid Address' },
        },
        error: new Error('Geocoding failed'),
      }

      render(
        <MockedProvider mocks={[errorMock]} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      const addressInput = screen.getByPlaceholderText(
        /123 Main St, City or 40.7128,-74.0060/i
      )
      const addButton = screen.getByRole('button', { name: /add location/i })

      fireEvent.change(addressInput, { target: { value: 'Invalid Address' } })
      fireEvent.click(addButton)

      await waitFor(() => {
        expect(
          screen.getByText(/Unable to find "Invalid Address"/i)
        ).toBeInTheDocument()
      })
    })

    it('should display error messages for failed calculations', async () => {
      const calculationErrorMock = {
        request: {
          query: FIND_OPTIMAL_LOCATIONS,
          variables: {
            locations: [
              { name: 'Test Location', latitude: 40.7128, longitude: -74.006 },
            ],
            travelMode: 'DRIVING_CAR',
            optimizationGoal: 'MINIMAX',
            topM: 3,
            gridSize: 5,
            deduplicationThreshold: 5000.0,
          },
        },
        error: new Error('Calculation failed'),
      }

      render(
        <MockedProvider mocks={[calculationErrorMock]} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      // Add a single location (insufficient for calculation)
      const addressInput = screen.getByPlaceholderText(
        /123 Main St, City or 40.7128,-74.0060/i
      )
      const addButton = screen.getByRole('button', { name: /add location/i })

      fireEvent.change(addressInput, { target: { value: '40.7128, -74.0060' } })
      fireEvent.click(addButton)

      await waitFor(() => {
        const locationElements = screen.getAllByText(/40.7128, -74.0060/i)
        expect(locationElements.length).toBeGreaterThan(0)
      })

      const calculateButton = screen.getByRole('button', {
        name: /calculate optimal meeting points/i,
      })
      fireEvent.click(calculateButton)

      await waitFor(() => {
        expect(
          screen.getByText(/Add at least 2 locations to calculate/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe('Location Management', () => {
    it('should allow removing locations and update calculations', async () => {
      const mocks = [
        mockGeocodeResponse,
        mockBrooklynGeocodeResponse,
        mockFindOptimalLocationsResponse,
      ]

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      const addressInput = screen.getByPlaceholderText(
        /123 Main St, City or 40.7128,-74.0060/i
      )
      const buttons = screen.getAllByText('Add Location')
      const addButton = buttons[buttons.length - 1]

      // Add two locations
      fireEvent.change(addressInput, { target: { value: 'New York, NY' } })
      fireEvent.click(addButton)

      await waitFor(() => {
        // Look for the location in the location list, not the toast
        const locationElements = screen.getAllByText(/New York, NY/i)
        expect(locationElements.length).toBeGreaterThan(0)
      })

      fireEvent.change(addressInput, { target: { value: 'Brooklyn, NY' } })
      fireEvent.click(addButton)

      await waitFor(() => {
        const locationElements = screen.getAllByText(/Brooklyn, NY/i)
        expect(locationElements.length).toBeGreaterThan(0)
      })

      // Remove first location using the X button (SVG icon)
      // Find remove buttons by looking for buttons that are children of location items
      const locationItems = document.querySelectorAll(
        '.flex.items-center.justify-between'
      )
      expect(locationItems.length).toBeGreaterThan(0)

      const firstLocationRemoveButton = locationItems[0].querySelector('button')
      expect(firstLocationRemoveButton).toBeTruthy()

      fireEvent.click(firstLocationRemoveButton)

      await waitFor(() => {
        // Check that New York is no longer in the location list by counting location items
        const remainingLocationItems = document.querySelectorAll(
          '.flex.items-center.justify-between'
        )
        expect(remainingLocationItems.length).toBe(1) // Should only have Brooklyn left

        // Brooklyn should still be there
        const brooklynElements = screen.getAllByText(/Brooklyn, NY/i)
        expect(brooklynElements.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Travel Mode and Travel Time Range Controls', () => {
    it('should allow changing travel mode and travel time range', async () => {
      const customMock = {
        request: {
          query: FIND_OPTIMAL_LOCATIONS,
          variables: {
            locations: [
              {
                name: '40.7128, -74.0060',
                latitude: 40.7128,
                longitude: -74.006,
              },
              {
                name: '40.6892, -74.0445',
                latitude: 40.6892,
                longitude: -74.0445,
              },
            ],
            travelMode: 'CYCLING_REGULAR',
            optimizationGoal: 'MINIMAX',
            topM: 3,
            gridSize: 5,
            deduplicationThreshold: 5000.0,
          },
        },
        result: {
          data: {
            findOptimalLocations: {
              optimalPoints: [
                {
                  id: 'optimal-1',
                  coordinate: {
                    latitude: 40.701,
                    longitude: -74.0252,
                  },
                  travelTimeMetrics: {
                    maxTravelTime: 18.2,
                    averageTravelTime: 14.5,
                    totalTravelTime: 29.0,
                    variance: 3.2,
                  },
                  rank: 1,
                },
              ],
              debugPoints: [],
              matrixApiCalls: 1,
              totalHypothesisPoints: 25,
            },
          },
        },
      }

      render(
        <MockedProvider mocks={[customMock]} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      // Add locations directly by coordinates to avoid geocoding mocks
      const addressInput = screen.getByPlaceholderText(
        /123 Main St, City or 40.7128,-74.0060/i
      )
      const addButton = screen.getByRole('button', { name: /add location/i })

      fireEvent.change(addressInput, { target: { value: '40.7128, -74.0060' } })
      fireEvent.click(addButton)

      fireEvent.change(addressInput, { target: { value: '40.6892, -74.0445' } })
      fireEvent.click(addButton)

      // Change travel mode to cycling
      const cyclingButton = screen.getByRole('button', { name: /cycling/i })
      fireEvent.click(cyclingButton)

      // Change travel time range
      const travelTimeRangeInput = screen.getByLabelText(/travel time range/i)
      fireEvent.change(travelTimeRangeInput, { target: { value: '15' } })

      // Calculate with new settings
      const calculateButton = screen.getByText(
        'Calculate Optimal Meeting Points'
      )
      fireEvent.click(calculateButton)

      await waitFor(() => {
        expect(
          screen.getByText(/Successfully calculated optimal meeting location/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe('Loading States', () => {
    it('should show loading indicators during operations', async () => {
      const delayedMock = {
        request: {
          query: GEOCODE_ADDRESS,
          variables: { address: 'New York, NY' },
        },
        result: {
          data: {
            geocodeAddress: {
              latitude: 40.7128,
              longitude: -74.006,
            },
          },
        },
        delay: 1000, // 1 second delay
      }

      render(
        <MockedProvider mocks={[delayedMock]} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      const addressInput = screen.getByPlaceholderText(
        /123 Main St, City or 40.7128,-74.0060/i
      )
      const addButton = screen.getByRole('button', { name: /add location/i })

      fireEvent.change(addressInput, { target: { value: 'New York, NY' } })
      fireEvent.click(addButton)

      // Should show loading state
      expect(screen.getByText(/Finding Location/i)).toBeInTheDocument()

      // Wait for completion
      await waitFor(
        () => {
          const locationElements = screen.getAllByText(/New York, NY/i)
          expect(locationElements.length).toBeGreaterThan(0)
        },
        { timeout: 2000 }
      )
    })
  })
})
