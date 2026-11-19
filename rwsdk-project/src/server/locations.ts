'use server'

import { getRequestInfo } from '@redwoodjs/sdk/worker'

import type { AppContext } from '../../worker'
import { cachedOpenRouteClient } from '../lib/cachedOpenroute'
import { db } from '../lib/database'
import { handleResolverError, createErrorResponse } from '../lib/errors'

// Types for location operations
export interface LocationResult {
  features: LocationFeature[]
}

export interface LocationFeature {
  geometry: {
    coordinates: [number, number]
  }
  properties: {
    label: string
    confidence: number
  }
}

export interface Coordinate {
  latitude: number
  longitude: number
}

// Server function for geocoding locations
export async function geocodeLocation(
  address: string
): Promise<LocationResult> {
  try {
    console.log(`Geocoding address: ${address}`)

    if (!address || address.trim().length === 0) {
      throw new Error('Address is required for geocoding')
    }

    const trimmedAddress = address.trim()

    // Check cache first
    const cachedResult = await db.getCachedGeocode(trimmedAddress)
    if (cachedResult) {
      console.log(`Returning cached geocoding result for: ${trimmedAddress}`)
      return {
        features: [
          {
            geometry: {
              coordinates: [cachedResult.longitude, cachedResult.latitude],
            },
            properties: {
              label: trimmedAddress,
              confidence: 1.0, // Cached results are considered high confidence
            },
          },
        ],
      }
    }

    // Use cached OpenRouteService client for geocoding
    try {
      const geocodeResults =
        await cachedOpenRouteClient.geocodeAddress(trimmedAddress)

      // Convert single result to array format expected by the interface
      const features: LocationFeature[] = [
        {
          geometry: {
            coordinates: [geocodeResults.longitude, geocodeResults.latitude],
          },
          properties: {
            label: trimmedAddress,
            confidence: 1.0, // Single result from geocodeAddress is considered high confidence
          },
        },
      ]

      // Cache the best result (first one)
      if (features.length > 0) {
        const bestResult = features[0]
        await db.setCachedGeocode(
          trimmedAddress,
          bestResult.geometry.coordinates[1], // latitude
          bestResult.geometry.coordinates[0], // longitude
          168 // 7 days TTL
        )
      }

      console.log(
        `Geocoding successful for: ${trimmedAddress}, found ${features.length} results`
      )
      return { features }
    } catch (apiError) {
      // Handle specific API errors with user-friendly messages
      if (
        apiError.message?.includes('rate limit') ||
        apiError.message?.includes('quota')
      ) {
        console.warn(`Geocoding API rate limit reached for: ${trimmedAddress}`)
        throw new Error(
          'Geocoding rate limit reached. Please wait a moment before trying again.'
        )
      }

      if (apiError.message?.includes('timeout')) {
        console.warn(`Geocoding timeout for: ${trimmedAddress}`)
        throw new Error('Geocoding request timed out. Please try again.')
      }

      if (
        apiError.message?.includes('network') ||
        apiError.message?.includes('connection')
      ) {
        console.warn(`Network error during geocoding for: ${trimmedAddress}`)
        throw new Error(
          'Network error during geocoding. Please check your internet connection and try again.'
        )
      }

      if (
        apiError.message?.includes('401') ||
        apiError.message?.includes('403')
      ) {
        console.error(
          `Geocoding API authentication failed for: ${trimmedAddress}`
        )
        throw new Error(
          'Geocoding service authentication failed. Please check the API key configuration.'
        )
      }

      if (apiError.message?.includes('400')) {
        console.warn(`Invalid geocoding request for: ${trimmedAddress}`)
        throw new Error(
          'Invalid address format. Please check the address and try again.'
        )
      }

      // Generic API error
      console.error(`Geocoding API error for: ${trimmedAddress}:`, apiError)
      throw new Error(
        'Geocoding service is temporarily unavailable. Please try again later.'
      )
    }
  } catch (error) {
    console.error(`Geocoding failed for address: ${address}:`, error)
    handleResolverError(error, 'geocodeLocation')
  }
}

// Server function for reverse geocoding (coordinate to address)
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<LocationResult> {
  try {
    console.log(`Reverse geocoding coordinates: ${latitude}, ${longitude}`)

    // Validate coordinates
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      throw new Error('Invalid coordinates provided for reverse geocoding')
    }

    if (latitude < -90 || latitude > 90) {
      throw new Error(
        `Invalid latitude: ${latitude}. Must be between -90 and 90`
      )
    }

    if (longitude < -180 || longitude > 180) {
      throw new Error(
        `Invalid longitude: ${longitude}. Must be between -180 and 180`
      )
    }

    // For now, return a placeholder result since reverse geocoding is not implemented in OpenRouteService client
    // This would need to be implemented if reverse geocoding is required
    console.warn('Reverse geocoding not yet implemented, returning placeholder')

    return {
      features: [
        {
          geometry: {
            coordinates: [longitude, latitude],
          },
          properties: {
            label: `Location at ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
            confidence: 0.5,
          },
        },
      ],
    }
  } catch (error) {
    console.error(
      `Reverse geocoding failed for coordinates: ${latitude}, ${longitude}:`,
      error
    )
    handleResolverError(error, 'reverseGeocode')
  }
}

// Export handlers for route registration
export const locationHandler = {
  geocodeLocation: async (request: Request): Promise<Response> => {
    try {
      const body = await request.json()
      const { address } = body

      if (!address) {
        return new Response(
          JSON.stringify({
            error: 'Address is required',
            statusCode: 400,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      const result = await geocodeLocation(address)

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('geocodeLocation handler error:', error)
      return createErrorResponse(error)
    }
  },

  reverseGeocode: async (request: Request): Promise<Response> => {
    try {
      const body = await request.json()
      const { latitude, longitude } = body

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return new Response(
          JSON.stringify({
            error: 'Valid latitude and longitude are required',
            statusCode: 400,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      const result = await reverseGeocode(latitude, longitude)

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('reverseGeocode handler error:', error)
      return createErrorResponse(error)
    }
  },
}
