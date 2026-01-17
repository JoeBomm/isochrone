export const schema = gql`
  scalar GeoJSONPolygon

  type IsochroneResult {
    centerPoint: Coordinate
    fairMeetingArea: GeoJSONPolygon
    individualIsochrones: [GeoJSONPolygon!]!
  }

  enum TravelMode {
    DRIVING_CAR
    CYCLING_REGULAR
    FOOT_WALKING
  }

  type Mutation {
    calculateIsochronicCenter(
      locations: [LocationInput!]!
      travelTimeMinutes: Int!
      travelMode: TravelMode!
      bufferTimeMinutes: Int!
    ): IsochroneResult! @skipAuth
  }
`