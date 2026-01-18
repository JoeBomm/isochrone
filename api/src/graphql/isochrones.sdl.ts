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
    COARSE_GRID
    LOCAL_REFINEMENT
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

  enum OptimizationMode {
    BASELINE
    COARSE_GRID
    FULL_REFINEMENT
  }

  input CoarseGridConfigInput {
    enabled: Boolean!
    paddingKm: Float!
    gridResolution: Int!
  }

  input LocalRefinementConfigInput {
    enabled: Boolean!
    topK: Int!
    refinementRadiusKm: Float!
    fineGridResolution: Int!
  }

  input OptimizationConfigInput {
    mode: OptimizationMode!
    coarseGridConfig: CoarseGridConfigInput
    localRefinementConfig: LocalRefinementConfigInput
  }

  type Mutation {
    calculateMinimaxCenter(
      locations: [LocationInput!]!
      travelMode: TravelMode!
      bufferTimeMinutes: Int!
      optimizationConfig: OptimizationConfigInput
    ): IsochroneResult! @skipAuth
  }
`