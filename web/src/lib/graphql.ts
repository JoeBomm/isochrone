import { gql } from '@apollo/client'

import {
  DEFAULT_DEDUPLICATION_THRESHOLD,
  DEFAULT_TOP_M,
  DEFAULT_GRID_SIZE,
} from './constants'

// Query for geocoding addresses
export const GEOCODE_ADDRESS = gql`
  query GeocodeAddress($address: String!) {
    geocodeAddress(address: $address) {
      latitude
      longitude
    }
  }
`

// Mutation for calculating minimax center
export const CALCULATE_MINIMAX_CENTER = gql`
  mutation CalculateMinimaxCenter(
    $locations: [LocationInput!]!
    $travelMode: TravelMode!
    $bufferTimeMinutes: Int!
  ) {
    calculateMinimaxCenter(
      locations: $locations
      travelMode: $travelMode
      bufferTimeMinutes: $bufferTimeMinutes
    ) {
      centerPoint {
        latitude
        longitude
      }
      fairMeetingArea
      individualIsochrones
    }
  }
`

// Mutation for finding optimal locations using simplified two-phase algorithm (cost-controlled)
export const FIND_OPTIMAL_LOCATIONS = gql`
  mutation FindOptimalLocations(
    $locations: [LocationInput!]!
    $travelMode: TravelMode!
    $optimizationGoal: OptimizationGoal = MINIMAX
    $topM: Int = 5
    $gridSize: Int = 5
    $deduplicationThreshold: Float = 5000.0
  ) {
    findOptimalLocations(
      locations: $locations
      travelMode: $travelMode
      optimizationGoal: $optimizationGoal
      topM: $topM
      gridSize: $gridSize
      deduplicationThreshold: $deduplicationThreshold
    ) {
      optimalPoints {
        id
        coordinate {
          latitude
          longitude
        }
        travelTimeMetrics {
          maxTravelTime
          averageTravelTime
          totalTravelTime
          variance
        }
        rank
      }
      debugPoints {
        id
        coordinate {
          latitude
          longitude
        }
        type
      }
      matrixApiCalls
      totalHypothesisPoints
    }
  }
`

// Mutation for generating isochrone for specific optimal point on-demand
export const GENERATE_ISOCHRONE = gql`
  mutation GenerateIsochrone(
    $pointId: ID!
    $travelTimeMinutes: Int!
    $travelMode: TravelMode!
  ) {
    generateIsochrone(
      pointId: $pointId
      travelTimeMinutes: $travelTimeMinutes
      travelMode: $travelMode
    )
  }
`

// Mutation for calculating on-demand isochrone (legacy)
export const CALCULATE_ISOCHRONE = gql`
  mutation CalculateIsochrone(
    $pointId: ID!
    $coordinate: CoordinateInput!
    $travelTimeMinutes: Int!
    $travelMode: TravelMode!
  ) {
    calculateIsochrone(
      pointId: $pointId
      coordinate: $coordinate
      travelTimeMinutes: $travelTimeMinutes
      travelMode: $travelMode
    )
  }
`
