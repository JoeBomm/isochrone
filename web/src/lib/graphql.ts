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

// Mutation for calculating isochronic center
export const CALCULATE_ISOCHRONIC_CENTER = gql`
  mutation CalculateIsochronicCenter(
    $locations: [LocationInput!]!
    $travelTimeMinutes: Int!
    $travelMode: TravelMode!
    $bufferTimeMinutes: Int!
  ) {
    calculateIsochronicCenter(
      locations: $locations
      travelTimeMinutes: $travelTimeMinutes
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