import { render, screen, fireEvent, waitFor } from '@redwoodjs/testing/web'
import { MockedProvider } from '@apollo/client/testing'
import HomePage from 'src/pages/HomePage/HomePage'
import { GEOCODE_ADDRESS, GENERATE_HYPOTHESIS_POINTS, CALCULATE_ISOCHRONE } from 'src/lib/graphql'

// Mock the Map component to avoid Leaflet issues in JSDOM
jest.mock('src/components/Map/Map', () => {
  return function MockMap({
    locations,
    hypothesisPoints,
    isochrones,
    onHypothesisPointClick
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
    variables: { address: 'New York, NY' }
  },
  result: {
    data: {
      geocodeAddress: {
        latitude: 40.7128,
        longitude: -74.0060
      }
    }
  }
}

const mockGenerateHypothesisPointsResponse = {
  request: {
    query: GENERATE_HYPOTHESIS_POINTS,
    variables: {
      locations: [
        { name: 'New York, NY', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Brooklyn, NY', latitude: 40.6892, longitude: -74.0445 }
      ],
      travelMode: 'DRIVING_CAR',
      enableLocalRefinement: false,
      optimizationGoal: 'MINIMIZE_AVERAGE_TIME',
      topM: 5,
      topN: 5,
      deduplicationThreshold: 100.0
    }
  },
  result: {
    data: {
      generateHypothesisPoints: {
        anchorPoints: [
          {
            id: 'geographic_centroid',
            coordinate: { latitude: 40.7010, longitude: -74.0252 },
            type: 'GEOGRAPHIC_CENTROID',
            phase: 'ANCHOR',
            score: 15.5,
            travelTimeMetrics: {
              maxTravelTime: 15.5,
              averageTravelTime: 12.3,
              totalTravelTime: 24.6,
              variance: 2.1
            }
          }
        ],
        coarseGridPoints: [],
        localRefinementPoints: [],
        finalPoints: [
          {
            id: 'geographic_centroid',
            coordinate: { latitude: 40.7010, longitude: -74.0252 },
            type: 'GEOGRAPHIC_CENTROID',
            phase: 'FINAL_OUTPUT',
            score: 15.5,
            travelTimeMetrics: {
              maxTravelTime: 15.5,
              averageTravelTime: 12.3,
              totalTravelTime: 24.6,
              variance: 2.1
            }
          }
        ],
        pointsOfInterest: [
          {
            id: 'geographic_centroid',
            coordinate: { latitude: 40.7010, longitude: -74.0252 },
            type: 'GEOGRAPHIC_CENTROID',
            phase: 'FINAL_OUTPUT',
            score: 15.5,
            travelTimeMetrics: {
              maxTravelTime: 15.5,
              averageTravelTime: 12.3,
              totalTravelTime: 24.6,
              variance: 2.1
            }
          }
        ],
        matrixApiCalls: 1,
        totalHypothesisPoints: 1
      }
    }
  }
}

const mockCalculateIsochroneResponse = {
  request: {
    query: CALCULATE_ISOCHRONE,
    variables: {
      pointId: 'geographic_centroid',
      coordinate: { latitude: 40.7010, longitude: -74.0252 },
      travelTimeMinutes: 10,
      travelMode: 'DRIVING_CAR'
    }
  },
  result: {
    data: {
      calculateIsochrone: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
      }
    }
  }
}

const mockGenerateHypothesisPointsCoordinateResponse = [{
  request: {
    query: GENERATE_HYPOTHESIS_POINTS,
    variables: {
      locations: [
        { name: '40.7128, -74.0060', latitude: 40.7128, longitude: -74.0060 },
        { name: '40.6892, -74.0445', latitude: 40.6892, longitude: -74.0445 }
      ],
      travelMode: 'DRIVING_CAR',
      enableLocalRefinement: false,
      optimizationGoal: 'MINIMIZE_AVERAGE_TIME',
      topM: 5,
      topN: 5,
      deduplicationThreshold: 100.0
    }
  },
  result: {
    data: {
      generateHypothesisPoints: {
        anchorPoints: [
          {
            id: 'geographic_centroid',
            coordinate: { latitude: 40.7010, longitude: -74.0252 },
            type: 'GEOGRAPHIC_CENTROID',
            phase: 'ANCHOR',
            score: 15.5,
            travelTimeMetrics: {
              maxTravelTime: 15.5,
              averageTravelTime: 12.3,
              totalTravelTime: 24.6,
              variance: 2.1
            }
          }
        ],
        coarseGridPoints: [],
        localRefinementPoints: [],
        finalPoints: [
          {
            id: 'geographic_centroid',
            coordinate: { latitude: 40.7010, longitude: -74.0252 },
            type: 'GEOGRAPHIC_CENTROID',
            phase: 'FINAL_OUTPUT',
            score: 15.5,
            travelTimeMetrics: {
              maxTravelTime: 15.5,
              averageTravelTime: 12.3,
              totalTravelTime: 24.6,
              variance: 2.1
            }
          }
        ],
        pointsOfInterest: [
          {
            id: 'geographic_centroid',
            coordinate: { latitude: 40.7010, longitude: -74.0252 },
            type: 'GEOGRAPHIC_CENTROID',
            phase: 'FINAL_OUTPUT',
            score: 15.5,
            travelTimeMetrics: {
              maxTravelTime: 15.5,
              averageTravelTime: 12.3,
              totalTravelTime: 24.6,
              variance: 2.1
            }
          }
        ],
        matrixApiCalls: 1,
        totalHypothesisPoints: 1
      }
    }
  }
}, {
  request: {
    query: "CALCULATE_MINIMAX_CENTER",
    variables: {
      locations: [
        { name: 'Location 1', latitude: 40.7128, longitude: -74.0060 },
        { name: 'Location 2', latitude: 40.7589, longitude: -73.9851 }
      ],
      bufferTimeMinutes: 10,
      travelMode: 'DRIVING_CAR'
    }
  },
  result: {
    data: {
      calculateMinimaxCenter: {
        centerPoint: {
          latitude: 40.7010,
          longitude: -74.0252
        },
        fairMeetingArea: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        },
        individualIsochrones: []
      }
    }
  }
}]

const mockBrooklynGeocodeResponse = {
  request: {
    query: GEOCODE_ADDRESS,
    variables: { address: 'Brooklyn, NY' }
  },
  result: {
    data: {
      geocodeAddress: {
        latitude: 40.6892,
        longitude: -74.0445
      }
    }
  }
}

describe('Integration Tests - Complete User Workflows', () => {
  describe('End-to-End Address Input to Fair Meeting Point', () => {
    it('should complete full workflow from address input to result display', async () => {
      const mocks = [mockGeocodeResponse, mockBrooklynGeocodeResponse, mockCalculateIsochroneResponse]

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      // Step 1: Add first location by address
      const addressInput = screen.getByPlaceholderText(/enter address or coordinates/i)
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
      const calculateButton = screen.getByRole('button', { name: /find optimal meeting point/i })
      fireEvent.click(calculateButton)

      await waitFor(() => {
        // Look for the success message in toast notifications
        expect(screen.getByText(/Successfully calculated optimal meeting location/i)).toBeInTheDocument()
      }, { timeout: 5000 })

      // Verify results are displayed
      expect(screen.getAllByText(/Center Point/i).length).toBeGreaterThan(0)
    })
  })

  describe('Coordinate Input Workflow', () => {
    it('should handle direct coordinate input', async () => {
      const coordinateMocks = [mockCalculateCoordinateResponse]

      render(
        <MockedProvider mocks={coordinateMocks} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      const addressInput = screen.getByPlaceholderText(/enter address or coordinates/i)
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
      const calculateButton = screen.getByRole('button', { name: /find optimal meeting point/i })
      fireEvent.click(calculateButton)

      await waitFor(() => {
        expect(screen.getByText(/Successfully calculated optimal meeting location/i)).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling in UI', () => {
    it('should display error messages for failed geocoding', async () => {
      const errorMock = {
        request: {
          query: GEOCODE_ADDRESS,
          variables: { address: 'Invalid Address' }
        },
        error: new Error('Geocoding failed')
      }

      render(
        <MockedProvider mocks={[errorMock]} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      const addressInput = screen.getByPlaceholderText(/enter address or coordinates/i)
      const addButton = screen.getByRole('button', { name: /add location/i })

      fireEvent.change(addressInput, { target: { value: 'Invalid Address' } })
      fireEvent.click(addButton)

      await waitFor(() => {
        expect(screen.getByText(/Unable to find "Invalid Address"/i)).toBeInTheDocument()
      })
    })

    it('should display error messages for failed calculations', async () => {
      const calculationErrorMock = {
        request: {
          query: CALCULATE_MINIMAX_CENTER,
          variables: {
            locations: [
              { name: 'Test Location', latitude: 40.7128, longitude: -74.0060 }
            ],
            bufferTimeMinutes: 10,
            travelMode: 'DRIVING_CAR'
          }
        },
        error: new Error('Calculation failed')
      }

      render(
        <MockedProvider mocks={[calculationErrorMock]} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      // Add a single location (insufficient for calculation)
      const addressInput = screen.getByPlaceholderText(/enter address or coordinates/i)
      const addButton = screen.getByRole('button', { name: /add location/i })

      fireEvent.change(addressInput, { target: { value: '40.7128, -74.0060' } })
      fireEvent.click(addButton)

      await waitFor(() => {
        const locationElements = screen.getAllByText(/40.7128, -74.0060/i)
        expect(locationElements.length).toBeGreaterThan(0)
      })

      const calculateButton = screen.getByRole('button', { name: /find optimal meeting point/i })
      fireEvent.click(calculateButton)

      await waitFor(() => {
        expect(screen.getByText(/Add at least 2 locations to calculate/i)).toBeInTheDocument()
      })
    })
  })

  describe('Location Management', () => {
    it('should allow removing locations and update calculations', async () => {
      const mocks = [mockGeocodeResponse, mockBrooklynGeocodeResponse]

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      const addressInput = screen.getByPlaceholderText(/enter address or coordinates/i)
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
      const locationItems = document.querySelectorAll('.flex.items-center.justify-between')
      expect(locationItems.length).toBeGreaterThan(0)

      const firstLocationRemoveButton = locationItems[0].querySelector('button')
      expect(firstLocationRemoveButton).toBeTruthy()

      fireEvent.click(firstLocationRemoveButton)

      await waitFor(() => {
        // Check that New York is no longer in the location list by counting location items
        const remainingLocationItems = document.querySelectorAll('.flex.items-center.justify-between')
        expect(remainingLocationItems.length).toBe(1) // Should only have Brooklyn left

        // Brooklyn should still be there
        const brooklynElements = screen.getAllByText(/Brooklyn, NY/i)
        expect(brooklynElements.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Travel Mode and Slack Time Controls', () => {
    it('should allow changing travel mode and slack time', async () => {
      const customMock = {
        request: {
          query: CALCULATE_MINIMAX_CENTER,
          variables: {
            locations: [
              { name: '40.7128, -74.0060', latitude: 40.7128, longitude: -74.0060 },
              { name: '40.6892, -74.0445', latitude: 40.6892, longitude: -74.0445 }
            ],
            bufferTimeMinutes: 15,
            travelMode: 'CYCLING_REGULAR'
          }
        },
        result: {
          data: {
            calculateMinimaxCenter: {
              centerPoint: {
                latitude: 40.7010,
                longitude: -74.0252
              },
              fairMeetingArea: {
                type: 'Polygon',
                coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
              },
              individualIsochrones: []
            }
          }
        }
      }

      render(
        <MockedProvider mocks={[customMock]} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      // Add locations directly by coordinates to avoid geocoding mocks
      const addressInput = screen.getByPlaceholderText(/enter address or coordinates/i)
      const addButton = screen.getByRole('button', { name: /add location/i })

      fireEvent.change(addressInput, { target: { value: '40.7128, -74.0060' } })
      fireEvent.click(addButton)

      fireEvent.change(addressInput, { target: { value: '40.6892, -74.0445' } })
      fireEvent.click(addButton)

      // Change travel mode to cycling
      const cyclingButton = screen.getByRole('button', { name: /cycling/i })
      fireEvent.click(cyclingButton)

      // Change slack time
      const slackTimeInput = screen.getByLabelText(/slack time/i)
      fireEvent.change(slackTimeInput, { target: { value: '15' } })

      // Calculate with new settings
      const calculateButton = screen.getByText('Find Optimal Meeting Point')
      fireEvent.click(calculateButton)

      await waitFor(() => {
        expect(screen.getByText(/Successfully calculated optimal meeting location/i)).toBeInTheDocument()
      })
    })
  })

  describe('Loading States', () => {
    it('should show loading indicators during operations', async () => {
      const delayedMock = {
        request: {
          query: GEOCODE_ADDRESS,
          variables: { address: 'New York, NY' }
        },
        result: {
          data: {
            geocodeAddress: {
              latitude: 40.7128,
              longitude: -74.0060
            }
          }
        },
        delay: 1000 // 1 second delay
      }

      render(
        <MockedProvider mocks={[delayedMock]} addTypename={false}>
          <HomePage />
        </MockedProvider>
      )

      const addressInput = screen.getByPlaceholderText(/enter address or coordinates/i)
      const addButton = screen.getByRole('button', { name: /add location/i })

      fireEvent.change(addressInput, { target: { value: 'New York, NY' } })
      fireEvent.click(addButton)

      // Should show loading state
      expect(screen.getByText(/Finding Location/i)).toBeInTheDocument()

      // Wait for completion
      await waitFor(() => {
        const locationElements = screen.getAllByText(/New York, NY/i)
        expect(locationElements.length).toBeGreaterThan(0)
      }, { timeout: 2000 })
    })
  })
})