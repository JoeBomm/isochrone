import React from 'react'

import { MockedProvider } from '@apollo/client/testing'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { GEOCODE_ADDRESS } from 'src/lib/graphql'

import LocationInput, { Location } from './LocationInput'

// Mock successful geocoding response
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

describe('LocationInput Integration', () => {
  const mockOnLocationAdd = jest.fn()
  const mockOnLocationRemove = jest.fn()
  const mockLocations: Location[] = []

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should maintain backward compatibility for single address processing', async () => {
    render(
      <MockedProvider mocks={[mockGeocodeResponse]} addTypename={false}>
        <LocationInput
          onLocationAdd={mockOnLocationAdd}
          onLocationRemove={mockOnLocationRemove}
          locations={mockLocations}
        />
      </MockedProvider>
    )

    // Find the input field and submit button
    const input = screen.getByPlaceholderText(
      /123 Main St, City or 40.7128,-74.0060/
    )
    const submitButton = screen.getByRole('button', { name: /Add Location/ })

    // Enter an address
    fireEvent.change(input, { target: { value: 'New York, NY' } })
    fireEvent.click(submitButton)

    // Wait for geocoding to complete
    await waitFor(() => {
      expect(mockOnLocationAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New York, NY',
          latitude: 40.7128,
          longitude: -74.006,
        })
      )
    })
  })

  it('should process coordinates immediately without geocoding', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <LocationInput
          onLocationAdd={mockOnLocationAdd}
          onLocationRemove={mockOnLocationRemove}
          locations={mockLocations}
        />
      </MockedProvider>
    )

    // Find the input field and submit button
    const input = screen.getByPlaceholderText(
      /123 Main St, City or 40.7128,-74.0060/
    )
    const submitButton = screen.getByRole('button', { name: /Add Location/ })

    // Enter coordinates
    fireEvent.change(input, { target: { value: '40.7128,-74.0060' } })
    fireEvent.click(submitButton)

    // Should immediately add the location without geocoding
    expect(mockOnLocationAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '40.7128, -74.0060',
        latitude: 40.7128,
        longitude: -74.006,
      })
    )
  })

  it('should show bulk input toggle and form', () => {
    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <LocationInput
          onLocationAdd={mockOnLocationAdd}
          onLocationRemove={mockOnLocationRemove}
          locations={mockLocations}
        />
      </MockedProvider>
    )

    // Find and click the bulk input toggle
    const bulkToggle = screen.getByRole('button', {
      name: /Import Multiple Locations/,
    })
    fireEvent.click(bulkToggle)

    // Should show the bulk input form
    expect(
      screen.getByLabelText(/Enter locations, one per line/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Import Locations/ })
    ).toBeInTheDocument()
  })

  it('should preserve existing public interface', () => {
    const { rerender } = render(
      <MockedProvider mocks={[]} addTypename={false}>
        <LocationInput
          onLocationAdd={mockOnLocationAdd}
          onLocationRemove={mockOnLocationRemove}
          locations={mockLocations}
          isLoading={false}
        />
      </MockedProvider>
    )

    // Verify all expected props are accepted and component renders
    expect(screen.getByRole('button', { name: /Add Location/ })).toBeInTheDocument()

    // Test with loading state
    rerender(
      <MockedProvider mocks={[]} addTypename={false}>
        <LocationInput
          onLocationAdd={mockOnLocationAdd}
          onLocationRemove={mockOnLocationRemove}
          locations={mockLocations}
          isLoading={true}
        />
      </MockedProvider>
    )

    // Should disable inputs when loading
    expect(
      screen.getByPlaceholderText(/123 Main St, City or 40.7128,-74.0060/)
    ).toBeDisabled()
  })
})
