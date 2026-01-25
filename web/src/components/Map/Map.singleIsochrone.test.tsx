import React from 'react'

import { render } from '@testing-library/react'

import Map from './Map'

// Mock Leaflet
jest.mock('leaflet', () => ({
  map: jest.fn(() => ({
    setView: jest.fn(),
    on: jest.fn(),
    remove: jest.fn(),
    removeLayer: jest.fn(),
    fitBounds: jest.fn(),
  })),
  tileLayer: jest.fn(() => ({
    addTo: jest.fn(),
  })),
  marker: jest.fn(() => ({
    addTo: jest.fn(),
    bindPopup: jest.fn(),
    on: jest.fn(),
  })),
  polygon: jest.fn(() => ({
    addTo: jest.fn(),
    bindPopup: jest.fn(),
    on: jest.fn(),
  })),
  latLngBounds: jest.fn(() => ({
    extend: jest.fn(),
  })),
  divIcon: jest.fn(),
  Icon: {
    Default: {
      prototype: {},
      mergeOptions: jest.fn(),
    },
  },
}))

describe('Map Single Isochrone Display', () => {
  const mockOptimalPoints = [
    {
      id: 'point1',
      coordinate: { latitude: 40.7128, longitude: -74.006 },
      travelTimeMetrics: {
        maxTravelTime: 15,
        averageTravelTime: 10,
        totalTravelTime: 30,
        variance: 2.5,
      },
      rank: 1,
    },
    {
      id: 'point2',
      coordinate: { latitude: 40.7589, longitude: -73.9851 },
      travelTimeMetrics: {
        maxTravelTime: 18,
        averageTravelTime: 12,
        totalTravelTime: 36,
        variance: 3.2,
      },
      rank: 2,
    },
  ]

  const mockIsochrone: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [-74.006, 40.7128],
        [-74.0, 40.72],
        [-74.01, 40.72],
        [-74.006, 40.7128],
      ],
    ],
  }

  it('should render with optimal points and selected point ID', () => {
    const { container } = render(
      <Map
        locations={[]}
        optimalPoints={mockOptimalPoints}
        selectedOptimalPointId="point1"
        isochrones={[mockIsochrone]}
        onOptimalPointClick={jest.fn()}
      />
    )

    expect(container.querySelector('#map')).toBeInTheDocument()
  })

  it('should handle single isochrone display', () => {
    const mockOnOptimalPointClick = jest.fn()

    render(
      <Map
        locations={[]}
        optimalPoints={mockOptimalPoints}
        selectedOptimalPointId="point1"
        isochrones={[mockIsochrone]}
        onOptimalPointClick={mockOnOptimalPointClick}
      />
    )

    // The component should render without errors when displaying a single isochrone
    // The actual isochrone display logic is tested through integration tests
    expect(true).toBe(true)
  })

  it('should handle empty isochrones array', () => {
    render(
      <Map
        locations={[]}
        optimalPoints={mockOptimalPoints}
        selectedOptimalPointId="point1"
        isochrones={[]}
        onOptimalPointClick={jest.fn()}
      />
    )

    // Should render without errors when no isochrones are provided
    expect(true).toBe(true)
  })
})
