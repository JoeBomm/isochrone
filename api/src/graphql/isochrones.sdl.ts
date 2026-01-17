export const schema = gql`
  scalar GeoJSONPolygon

  type IsochroneResult {
    centerPoint: Coordinate
    fairMeetingArea: GeoJSONPolygon
    individualIsochrones: [GeoJSONPolygon!]!
  }

  type HypothesisPoint {
    id: ID!
    coordinate: Coordinate!
    type: HypothesisPointType!
    metadata: HypothesisPointMetadata
  }

  enum HypothesisPointType {
    GEOGRAPHIC_CENTROID
    MEDIAN_COORDINATE
    PARTICIPANT_LOCATION
    PAIRWISE_MIDPOINT
  }

  type HypothesisPointMetadata {
    participantId: String
    pairIds: [String!]
  }

  type TravelTimeMatrix {
    origins: [Location!]!
    destinations: [HypothesisPoint!]!
    travelTimes: [[Float!]!]!
    travelMode: TravelMode!
  }

  enum TravelMode {
    DRIVING_CAR
    CYCLING_REGULAR
    FOOT_WALKING
  }

  type Mutation {
    calculateMinimaxCenter(
      locations: [LocationInput!]!
      travelMode: TravelMode!
      bufferTimeMinutes: Int!
    ): IsochroneResult! @skipAuth
  }
`