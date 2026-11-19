'use client'

import React, { useState } from 'react'

import { geocodeLocation } from '../server/locations'

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

// Utility functions for coordinate parsing
const parseCoordinates = (
  input: string
): { latitude: number; longitude: number } | null => {
  const trimmed = input.trim()

  // Try comma-separated format: "lat,lng" or "lat, lng"
  const commaMatch = trimmed.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/)
  if (commaMatch) {
    const lat = parseFloat(commaMatch[1])
    const lng = parseFloat(commaMatch[2])
    if (
      !isNaN(lat) &&
      !isNaN(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return { latitude: lat, longitude: lng }
    }
  }

  return null
}

const formatCoordinate = (coord: {
  latitude: number
  longitude: number
}): string => {
  return `${coord.latitude.toFixed(6)}°, ${coord.longitude.toFixed(6)}°`
}

export function LocationInput({
  onLocationAdd,
  onLocationRemove,
  locations,
  isLoading = false,
}: LocationInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState('')
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [showBulkInput, setShowBulkInput] = useState(false)
  const [bulkInputValue, setBulkInputValue] = useState('')
  const [bulkInputError, setBulkInputError] = useState('')
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)

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
          color: MARKER_COLORS[locations.length % MARKER_COLORS.length],
        }
        onLocationAdd(newLocation)
        setInputValue('')
      } else {
        // Address geocoding using server function
        setIsGeocoding(true)
        try {
          const result = await geocodeLocation(inputValue.trim())

          if (result.features && result.features.length > 0) {
            const feature = result.features[0]
            const newLocation: Location = {
              id: Date.now().toString(),
              name: inputValue.trim(),
              latitude: feature.geometry.coordinates[1],
              longitude: feature.geometry.coordinates[0],
              color: MARKER_COLORS[locations.length % MARKER_COLORS.length],
            }
            onLocationAdd(newLocation)
            setInputValue('')
          } else {
            setInputError(
              `No results found for "${inputValue.trim()}". Try a more specific address or enter coordinates directly.`
            )
          }
        } catch (error) {
          console.error('Geocoding error:', error)
          let errorMessage = 'Failed to find location.'

          if (error instanceof Error) {
            if (error.message.includes('rate limit')) {
              errorMessage =
                'Too many requests. Please wait a moment and try again.'
            } else if (error.message.includes('API key')) {
              errorMessage =
                'Service configuration error. Please contact support.'
            } else if (error.message.includes('timeout')) {
              errorMessage =
                'Request timed out. Please check your connection and try again.'
            } else {
              errorMessage = `Unable to find "${inputValue.trim()}". Please try a different address or enter coordinates directly.`
            }
          }

          setInputError(errorMessage)
        }
        setIsGeocoding(false)
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

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bulkInputValue.trim() || isBulkProcessing) return

    setBulkInputError('')
    setIsBulkProcessing(true)

    try {
      const lines = bulkInputValue
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

      let successCount = 0
      let colorIndex = locations.length

      for (const line of lines) {
        try {
          // Check if line is coordinates
          const coordinates = parseCoordinates(line)

          if (coordinates) {
            const newLocation: Location = {
              id: `${Date.now()}-${Math.random()}-coord`,
              name: formatCoordinate(coordinates),
              latitude: coordinates.latitude,
              longitude: coordinates.longitude,
              color: MARKER_COLORS[colorIndex % MARKER_COLORS.length],
            }
            onLocationAdd(newLocation)
            successCount++
            colorIndex++
          } else {
            // Try geocoding the address
            try {
              const result = await geocodeLocation(line)

              if (result.features && result.features.length > 0) {
                const feature = result.features[0]
                const newLocation: Location = {
                  id: `${Date.now()}-${Math.random()}-addr`,
                  name: line,
                  latitude: feature.geometry.coordinates[1],
                  longitude: feature.geometry.coordinates[0],
                  color: MARKER_COLORS[colorIndex % MARKER_COLORS.length],
                }
                onLocationAdd(newLocation)
                successCount++
                colorIndex++
              }
            } catch (geocodeError) {
              console.warn(`Failed to geocode: ${line}`, geocodeError)
            }
          }
        } catch (lineError) {
          console.warn(`Failed to process line: ${line}`, lineError)
        }
      }

      if (successCount > 0) {
        setBulkInputValue('')
        setShowBulkInput(false)
      } else {
        setBulkInputError(
          'No valid locations could be processed from the input'
        )
      }
    } catch (error) {
      console.error('Bulk processing error:', error)
      setBulkInputError(
        'Failed to process bulk input. Please check the format and try again.'
      )
    } finally {
      setIsBulkProcessing(false)
    }
  }

  const handleBulkInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBulkInputValue(e.target.value)
    if (bulkInputError) setBulkInputError('')
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Individual Location Input */}
      <div className="bg-white p-6 rounded-lg shadow mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">📍</span>
          <h2 className="text-lg font-semibold">Add Location</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="address"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Enter address or coordinates
            </label>
            <input
              id="address"
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="123 Main St, City or 40.7128,-74.0060"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading || isGeocoding}
            />
            {inputError && (
              <p className="text-red-600 text-sm mt-1">{inputError}</p>
            )}
            {!inputError && (
              <p className="text-gray-500 text-sm mt-1">
                Examples: "123 Main St, City" or "40.7128,-74.0060"
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading || isGeocoding}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isGeocoding && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            )}
            {isGeocoding ? 'Finding...' : 'Add Location'}
          </button>
        </form>

        {/* Bulk Input Toggle */}
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => setShowBulkInput(!showBulkInput)}
            disabled={isLoading || isGeocoding || isBulkProcessing}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1 mx-auto"
          >
            {showBulkInput ? '▲' : '▼'}
            <span>📤</span>
            {showBulkInput
              ? 'Switch to Individual Input'
              : 'Import Multiple Locations'}
          </button>
        </div>
      </div>

      {/* Bulk Input Form */}
      {showBulkInput && (
        <div className="bg-white p-6 rounded-lg shadow mb-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">📤</span>
            <h2 className="text-lg font-semibold">Bulk Location Import</h2>
          </div>

          <form onSubmit={handleBulkSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="bulk-input"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Enter locations, one per line
              </label>
              <textarea
                id="bulk-input"
                rows={6}
                value={bulkInputValue}
                onChange={handleBulkInputChange}
                placeholder={`123 Main St, City
40.7128,-74.0060
456 Oak Ave, Town`}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading || isBulkProcessing}
              />
              {bulkInputError && (
                <p className="text-red-600 text-sm mt-1">{bulkInputError}</p>
              )}
              {!bulkInputError && (
                <p className="text-gray-500 text-sm mt-1">
                  Enter one location per line. Mix addresses and coordinates
                  (lat,lng format).
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!bulkInputValue.trim() || isLoading || isBulkProcessing}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isBulkProcessing && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              )}
              {isBulkProcessing ? 'Processing...' : 'Import Locations'}
            </button>
          </form>
        </div>
      )}

      {/* Location List */}
      {locations.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">
            Locations ({locations.length}/12)
          </h3>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {locations.map((location, index) => (
              <div
                key={location.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md border"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                    style={{ backgroundColor: location.color }}
                  />
                  <div>
                    <p className="font-medium text-sm">{location.name}</p>
                    <p className="text-xs text-gray-500">
                      {location.latitude.toFixed(4)},{' '}
                      {location.longitude.toFixed(4)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onLocationRemove(location.id)}
                  disabled={isLoading}
                  className="text-red-600 hover:text-red-700 p-1 rounded"
                  title="Remove location"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Location Limit Warning */}
      {locations.length >= 12 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mt-4">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600">⚠️</span>
            <div>
              <h4 className="font-medium text-yellow-800">
                Location Limit Reached
              </h4>
              <p className="text-yellow-700 text-sm">
                Maximum of 12 locations reached. Remove a location to add more.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
