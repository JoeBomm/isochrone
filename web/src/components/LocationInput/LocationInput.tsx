import { useState } from 'react'
import { useLazyQuery } from '@apollo/client'

import { parseCoordinates, formatCoordinate } from 'src/lib/coordinateUtils'
import { GEOCODE_ADDRESS } from 'src/lib/graphql'
import LoadingSpinner from 'src/components/LoadingSpinner/LoadingSpinner'

export interface Location {
  id: string
  name: string
  latitude: number
  longitude: number
  color: string
}

interface LocationInputProps {
  onLocationAdd: (location: Location) => void
  onLocationRemove: (locationId: string) => void
  locations: Location[]
  isLoading?: boolean
}

// Color palette for location markers
const MARKER_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // yellow
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#a855f7', // violet
]

const LocationInput = ({
  onLocationAdd,
  onLocationRemove,
  locations,
  isLoading = false
}: LocationInputProps) => {
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState('')
  const [isGeocoding, setIsGeocoding] = useState(false)

  // GraphQL query for geocoding
  const [geocodeAddress] = useLazyQuery(GEOCODE_ADDRESS, {
    onCompleted: (data) => {
      if (data?.geocodeAddress) {
        const newLocation: Location = {
          id: Date.now().toString(),
          name: inputValue.trim(),
          latitude: data.geocodeAddress.latitude,
          longitude: data.geocodeAddress.longitude,
          color: MARKER_COLORS[locations.length % MARKER_COLORS.length]
        }
        onLocationAdd(newLocation)
        setInputValue('')
      }
      setIsGeocoding(false)
    },
    onError: (error) => {
      console.error('Geocoding error:', error)

      // Provide more helpful error messages
      let errorMessage = 'Failed to find location.'

      if (error.message.includes('No results found')) {
        errorMessage = `No results found for "${inputValue.trim()}". Try a more specific address or enter coordinates directly (e.g., "40.7128,-74.0060").`
      } else if (error.message.includes('rate limit')) {
        errorMessage = 'Too many requests. Please wait a moment and try again.'
      } else if (error.message.includes('API key')) {
        errorMessage = 'Service configuration error. Please contact support.'
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Request timed out. Please check your connection and try again.'
      } else {
        errorMessage = `Unable to find "${inputValue.trim()}". Please try a different address or enter coordinates directly.`
      }

      setInputError(errorMessage)
      setIsGeocoding(false)
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isLoading || isGeocoding) return

    setInputError('')

    try {
      // Check if input is coordinates
      const coordinates = parseCoordinates(inputValue)

      if (coordinates) {
        // Direct coordinate input
        const newLocation: Location = {
          id: Date.now().toString(),
          name: formatCoordinate(coordinates),
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          color: MARKER_COLORS[locations.length % MARKER_COLORS.length]
        }
        onLocationAdd(newLocation)
        setInputValue('')
      } else {
        // Address geocoding using GraphQL
        setIsGeocoding(true)
        await geocodeAddress({
          variables: { address: inputValue.trim() }
        })
      }
    } catch (error) {
      console.error('Location processing error:', error)
      setInputError('Failed to process location. Please try again.')
      setIsGeocoding(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    if (inputError) setInputError('')
  }

  return (
    <div className="space-y-4">
      {/* Input Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="location-input" className="block text-sm font-medium text-gray-700 mb-1">
            Add Location
          </label>
          <input
            id="location-input"
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder="Enter address or coordinates (lat,lng)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading || isGeocoding}
          />
          <p className="text-xs text-gray-500 mt-1">
            Examples: "123 Main St, City" or "40.7128,-74.0060"
          </p>
        </div>

        {inputError && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
            <div className="flex items-start">
              <svg className="w-4 h-4 text-red-500 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <h4 className="font-medium">Location Error</h4>
                <p className="mt-1">{inputError}</p>
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!inputValue.trim() || isLoading || isGeocoding}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isGeocoding ? (
            <>
              <LoadingSpinner size="sm" color="white" />
              <span className="ml-2">Finding Location...</span>
            </>
          ) : (
            'Add Location'
          )}
        </button>
      </form>

      {/* Location List */}
      {locations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">
            Locations ({locations.length}/12)
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {locations.map((location) => (
              <div
                key={location.id}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-md shadow-sm"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                    style={{ backgroundColor: location.color }}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {location.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onLocationRemove(location.id)}
                  className="text-red-600 hover:text-red-800 focus:outline-none"
                  disabled={isLoading}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Location Limit Warning */}
      {locations.length >= 12 && (
        <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
          Maximum of 12 locations reached. Remove a location to add more.
        </div>
      )}
    </div>
  )
}

export default LocationInput