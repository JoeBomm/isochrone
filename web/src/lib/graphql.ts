import { gql } from '@apollo/client'

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