export const schema = gql`
  scalar GeoJSONPolygon

  type IsochroneResult {
    centerPoint: Coordinate
    fairMeetingArea: GeoJSONPolygon
    individualIsochrones: [GeoJSONPolygon!]!
  }

  type OptimalLocationResult {
    optimalPoints: [OptimalPoint!]!
    debugPoints: [DebugPoint!]!
    matrixApiCalls: Int!
    totalHypothesisPoints: Int!
  }

  type OptimalPoint {
    id: ID!
    coordinate: Coordinate!
    travelTimeMetrics: TravelTimeMetrics!
    rank: Int!
  }

  type DebugPoint {
    id: ID!
    coordinate: Coordinate!
    type: DebugPointType!
  }

  enum DebugPointType {
    GEOGRAPHIC_CENTROID
    MEDIAN_COORDINATE
    PARTICIPANT_LOCATION
    PAIRWISE_MIDPOINT
    GRID_CELL
    ANCHOR
    GRID
  }

  type HypothesisPoint {
    id: ID!
    coordinate: Coordinate!
    type: HypothesisPointType!
    phase: AlgorithmPhase!
    score: Float
    travelTimeMetrics: TravelTimeMetrics
    metadata: HypothesisPointMetadata
  }

  type HypothesisPointMetadata {
    participantId: String
    pairIds: [String!]
  }

  enum HypothesisPointType {
    GEOGRAPHIC_CENTROID
    MEDIAN_COORDINATE
    PARTICIPANT_LOCATION
    PAIRWISE_MIDPOINT
    COARSE_GRID_CELL
    LOCAL_REFINEMENT_CELL
  }

  enum AlgorithmPhase {
    ANCHOR
    COARSE_GRID
    LOCAL_REFINEMENT
  }

  type TravelTimeMetrics {
    maxTravelTime: Float! # For Minimax goal
    averageTravelTime: Float! # For reference
    variance: Float! # For Minimize Variance goal
    totalTravelTime: Float! # For Minimize Total goal
  }

  enum OptimizationGoal {
    MINIMAX # Minimize maximum travel time
    MINIMIZE_VARIANCE # Minimize variance (equalize travel times)
    MINIMIZE_TOTAL # Minimize total travel time
  }

  enum TravelMode {
    DRIVING_CAR
    CYCLING_REGULAR
    FOOT_WALKING
  }

  type Mutation {
    findOptimalLocations(
      locations: [LocationInput!]!
      travelMode: TravelMode!
      optimizationGoal: OptimizationGoal = MINIMAX
      topM: Int = 5 # DEFAULT_TOP_M from constants
      gridSize: Int = 5 # DEFAULT_GRID_SIZE from constants
      deduplicationThreshold: Float = 5000.0 # DEFAULT_DEDUPLICATION_THRESHOLD from constants
    ): OptimalLocationResult! @skipAuth

    generateIsochrone(
      pointId: ID!
      travelTimeMinutes: Int!
      travelMode: TravelMode!
    ): GeoJSONPolygon! @skipAuth

    calculateMinimaxCenter(
      locations: [LocationInput!]!
      travelMode: TravelMode!
      bufferTimeMinutes: Int!
    ): IsochroneResult! @skipAuth

    calculateIsochrone(
      pointId: ID!
      coordinate: CoordinateInput!
      travelTimeMinutes: Int!
      travelMode: TravelMode!
    ): GeoJSONPolygon! @skipAuth
  }
`
