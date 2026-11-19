# Design Document: Optimal Facility Location

## Overview

This design implements an optimal facility location algorithm that finds the best meeting points for multiple starting locations. The system uses a simplified two-phase approach: hypothesis generation (anchor points + bounding box grid) followed by Matrix API evaluation to identify the top M optimal locations.

The algorithm supports three optimization goals: Minimax (minimize maximum travel time), Mean (equalize travel times), and Min (minimize total travel time). The system provides cost-controlled isochrone visualization on-demand and includes debug visualization options for algorithm transparency.

## UX Requirements

### Location Input Interface
- **Individual Location Entry**: Users can add locations one at a time through a standard input interface
- **Bulk Location Entry**: Users should have the option to add a list of addresses or coordinates separated by newline characters instead of having to add each one individually
- **Address Geocoding**: Support for converting addresses to coordinates via OpenRouteService
- **Coordinate Input**: Direct coordinate input support for precise location specification

### Optimal Points Display
- Display the top M points to the user with clear ranking and travel time metrics
- When the user clicks one of the points, call the OpenRouteService Isochrone API to generate an isochrone of configurable R minutes
- When a user presses a different point, the original isochrone should be hidden and the new one should display
- The optimal travel time should be displayed near each M point with clear, readable formatting

### Modern UI Design
- The UI should be modern, clean, and accessible
- Use Material-UI component library for consistent, professional design
- Ensure proper color contrast and keyboard navigation support
- Responsive design that works on desktop and mobile devices

### Debug Mode Interface
- Option to visually toggle on Original Anchor Points and Bounding box grid points
- Final output M points should always be at the top/not under (lower z-index) the debug points
- Clear visual distinction between different point types using color coding
- Debug controls should be easily accessible but not cluttered in the main interface

## Algorithm Specification

- **S**: Starting locations (input points on the map)
- **N**: Ideal meeting points (algorithm output)
- **Hypothesis Points**: Potential solutions for N, generated through anchor points and bounding box grid
- **Anchor Points**: Calculated hypothesis points including geographic centroid, median coordinates, S locations, and pairwise midpoints
- **Bounding Box Grid**: Rectangular bounding box containing all S points with configurable grid (5x5, 7x7) where grid cell centers become hypothesis points
- **M**: Top-performing points selected after Matrix API evaluation
- **Matrix API**: OpenRouteService Matrix API for calculating travel times from S to hypothesis points
- **T**: Threshold distance (e.g., 5km) for determining if points should be deduplicated
- **Deduplication**: Process to merge nearby points by averaging coordinates and re-evaluating until M distinct points remain
- **R**: Radius for final isochrone travel time visualization

### Optimization Goals

1. **Minimax**: Minimize the maximum travel time to N for any location in S
2. **Mean**: Find location N such that travel times for all S are as equal as possible (minimize variance)
3. **Min**: Find location N such that the total sum of travel times for all S locations is minimized

### Algorithm Process

#### Phase 1: Hypothesis Generation
1. **Input**: S starting locations
2. **Generate Anchor Points**:
   - Geographic centroid of all S points
   - Median coordinates (median latitude, median longitude)
   - Each individual S location
   - Pairwise midpoints between all S locations
3. **Generate Bounding Box Grid**:
   - Calculate rectangular bounding box containing all S points
   - Create configurable grid (default 5x5) within bounding box
   - Use grid cell centers as additional hypothesis points
4. **Combine**: Create unified set of all anchor points and grid points

#### Phase 2: Evaluation and Selection
1. **Matrix API Call**: Single batched call to evaluate travel times from all S locations to all hypothesis points
2. **Scoring**: Apply selected optimization goal to rank hypothesis points
3. **Deduplication**:
   - Identify points within threshold distance T
   - Replace clustered points with their average coordinates
   - Re-run deduplication until M distinct points remain
4. **Output**: Top M optimal meeting points

#### Phase 3: User Interaction (On-Demand)
1. **Display**: Show top M points with travel time metrics
2. **Isochrone Generation**: When user clicks a point, call Isochrone API to generate R-minute travel time polygon
3. **Visualization**: Display isochrone on map, hide previous isochrones

## Architecture

### Updated RedwoodJS Structure

```
├── api/                          # Backend (Node.js serverless functions)
│   ├── src/
│   │   ├── functions/
│   │   │   └── graphql.ts        # GraphQL endpoint
│   │   ├── graphql/
│   │   │   ├── locations.sdl.ts  # GraphQL schema definitions
│   │   │   └── isochrones.sdl.ts
│   │   ├── services/
│   │   │   ├── locations.ts      # Business logic services
│   │   │   └── isochrones.ts     # Simplified two-phase algorithm
│   │   └── lib/
│   │       ├── algorithms/       # Algorithm modules
│   │       │   ├── anchors.ts    # Anchor point generation
│   │       │   ├── gridGeneration.ts # Bounding box grid generation
│   │       │   ├── deduplication.ts # Proximity deduplication logic
│   │       │   └── scoring.ts    # Optimization goal implementations
│   │       ├── openroute.ts      # External API client
│   │       └── cache.ts          # API response caching
├── web/                          # Frontend (React SPA)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/
│   │   │   │   └── Map.tsx       # Clean map with M points and isochrones
│   │   │   ├── Controls/
│   │   │   │   ├── LocationInput.tsx # Location input interface
│   │   │   │   ├── OptimizationGoals.tsx # Goal selection (Minimax/Mean/Min)
│   │   │   │   └── DebugControls.tsx # Debug visualization toggles
│   │   │   └── UI/
│   │   │       ├── OptimalPoints.tsx # Display M points with metrics
│   │   │       └── IsochroneDisplay.tsx # On-demand isochrone visualization
│   │   ├── pages/
│   │   │   └── HomePage/
│   │   │       └── HomePage.tsx  # Clean, modern UI layout
│   │   └── hooks/
│   │       └── useOptimalLocation.ts # Algorithm state management
└── .env.example                  # Environment template
```

### Technology Stack

- **Frontend**: React 18, TypeScript, Material-UI for modern component library
- **Backend**: Node.js serverless functions, GraphQL with Apollo
- **Matrix Calculations**: OpenRouteService Matrix API for travel time evaluation
- **Isochrone Visualization**: OpenRouteService Isochrone API (on-demand only)
- **Geometry**: Turf.js for geographic calculations (centroid, bounding box, grid generation)
- **Algorithm Architecture**: Simplified, modular components for hypothesis generation and scoring
- **Styling**: Material-UI with clean, accessible design patterns

## Components and Interfaces

### Frontend Components

#### LocationInput Component
```typescript
interface LocationInputProps {
  locations: Location[]
  onLocationsChange: (locations: Location[]) => void
  onBulkImport: (text: string) => Promise<Location[]>
}

interface BulkLocationInputProps {
  onImport: (text: string) => Promise<Location[]>
  placeholder: string
}
```

#### OptimizationGoals Component
```typescript
interface OptimizationGoalsProps {
  selectedGoal: OptimizationGoal
  onGoalChange: (goal: OptimizationGoal) => void
}

enum OptimizationGoal {
  MINIMAX = 'minimax',    // Minimize maximum travel time
  MEAN = 'mean',          // Minimize variance (equalize travel times)
  MIN = 'min'             // Minimize total travel time
}
```

#### DebugControls Component
```typescript
interface DebugControlsProps {
  debugMode: boolean
  showAnchors: boolean
  showGrid: boolean
  onDebugModeChange: (enabled: boolean) => void
  onShowAnchorsChange: (show: boolean) => void
  onShowGridChange: (show: boolean) => void
}
```

#### OptimalPoints Component
```typescript
interface OptimalPointsProps {
  points: OptimalPoint[]
  onPointClick: (point: OptimalPoint) => Promise<void>
  selectedPointId?: string
}

interface OptimalPoint {
  id: string
  coordinate: Coordinate
  travelTimeMetrics: TravelTimeMetrics
  rank: number
}
```

#### Map Component
```typescript
interface MapProps {
  locations: Location[]
  optimalPoints: OptimalPoint[]
  debugPoints?: DebugPoint[]
  isochrone?: GeoJSON.Polygon
  onPointClick: (point: OptimalPoint) => Promise<void>
  debugMode: boolean
}

interface DebugPoint {
  coordinate: Coordinate
  type: 'anchor' | 'grid'
  color: string
}
```

### Updated GraphQL Schema

```graphql
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

type TravelTimeMetrics {
  maxTravelTime: Float!      # For Minimax goal
  averageTravelTime: Float!  # For Min goal
  variance: Float!           # For Mean goal
  totalTravelTime: Float!
}

enum DebugPointType {
  GEOGRAPHIC_CENTROID
  MEDIAN_COORDINATE
  PARTICIPANT_LOCATION
  PAIRWISE_MIDPOINT
  GRID_CELL
}

enum OptimizationGoal {
  MINIMAX    # Minimize maximum travel time
  MEAN       # Minimize variance (equalize travel times)
  MIN        # Minimize total travel time
}

type Mutation {
  findOptimalLocations(
    locations: [LocationInput!]!
    travelMode: TravelMode!
    optimizationGoal: OptimizationGoal!
    topM: Int = 5
    gridSize: Int = 5
    deduplicationThreshold: Float = 5000.0  # meters
  ): OptimalLocationResult!

  generateIsochrone(
    pointId: ID!
    travelTimeMinutes: Int!
    travelMode: TravelMode!
  ): GeoJSONPolygon!
}
```

### Backend Algorithm Services

#### Optimal Location Service
```typescript
interface OptimalLocationService {
  findOptimalLocations(params: OptimalLocationParams): Promise<OptimalLocationResult>
}

interface OptimalLocationParams {
  locations: Location[]
  travelMode: TravelMode
  optimizationGoal: OptimizationGoal
  topM: number
  gridSize: number
  deduplicationThreshold: number
}

interface OptimalLocationResult {
  optimalPoints: OptimalPoint[]
  debugPoints: DebugPoint[]
  matrixApiCalls: number
  totalHypothesisPoints: number
}
```

#### Algorithm Components
```typescript
interface AnchorGenerator {
  generate(locations: Location[]): HypothesisPoint[]
}

interface GridGenerator {
  generateBoundingBoxGrid(locations: Location[], gridSize: number): HypothesisPoint[]
  calculateBoundingBox(locations: Location[]): BoundingBox
}

interface DeduplicationService {
  deduplicate(points: HypothesisPoint[], threshold: number): HypothesisPoint[]
  calculateDistance(point1: Coordinate, point2: Coordinate): number
  averagePoints(points: HypothesisPoint[]): HypothesisPoint
}

interface ScoringService {
  scorePoints(
    points: HypothesisPoint[],
    travelTimeMatrix: TravelTimeMatrix,
    goal: OptimizationGoal
  ): OptimalPoint[]

  calculateMetrics(
    point: HypothesisPoint,
    travelTimes: number[]
  ): TravelTimeMetrics
}

interface BoundingBox {
  north: number
  south: number
  east: number
  west: number
}

interface TravelTimeMatrix {
  origins: Location[]
  destinations: HypothesisPoint[]
  travelTimes: number[][] // travelTimes[i][j] = travel time from origin i to destination j
  travelMode: TravelMode
}
```

## Data Models

### Core Data Structures
```typescript
interface HypothesisPoint {
  id: string
  coordinate: Coordinate
  type: HypothesisPointType
  metadata?: {
    participantId?: string
    pairIds?: [string, string]
    gridCell?: { row: number, col: number }
  }
}

interface OptimalPoint {
  id: string
  coordinate: Coordinate
  travelTimeMetrics: TravelTimeMetrics
  rank: number
}

interface TravelTimeMetrics {
  maxTravelTime: number      // For Minimax optimization
  averageTravelTime: number  // For Min optimization
  variance: number           // For Mean optimization
  totalTravelTime: number
}

enum HypothesisPointType {
  GEOGRAPHIC_CENTROID = 'geographic_centroid',
  MEDIAN_COORDINATE = 'median_coordinate',
  PARTICIPANT_LOCATION = 'participant_location',
  PAIRWISE_MIDPOINT = 'pairwise_midpoint',
  GRID_CELL = 'grid_cell'
}

enum OptimizationGoal {
  MINIMAX = 'minimax',  // Minimize maximum travel time
  MEAN = 'mean',        // Minimize variance (equalize travel times)
  MIN = 'min'           // Minimize total travel time
}
```

### Algorithm Configuration
```typescript
interface AlgorithmConfig {
  optimizationGoal: OptimizationGoal
  topM: number                    // Number of optimal points to return
  gridSize: number               // Grid dimensions (e.g., 5 for 5x5 grid)
  deduplicationThreshold: number // Distance threshold in meters
  debugMode: boolean
  visualization: {
    showAnchors: boolean
    showGrid: boolean
    colors: {
      anchors: string
      grid: string
      optimal: string
    }
  }
}
```

### Calculation State
```typescript
interface OptimalLocationCalculation {
  id: string
  locations: Location[]
  travelMode: TravelMode
  config: AlgorithmConfig
  results?: OptimalLocationResult
  status: CalculationStatus
  error?: string
  createdAt: Date
  matrixApiCallCount: number
  isochroneApiCallCount: number
}

enum CalculationStatus {
  PENDING = 'pending',
  GENERATING_HYPOTHESES = 'generating_hypotheses',
  EVALUATING_MATRIX = 'evaluating_matrix',
  SCORING_POINTS = 'scoring_points',
  DEDUPLICATING = 'deduplicating',
  COMPLETED = 'completed',
  ERROR = 'error'
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the simplified two-phase algorithm, the following properties validate the core functionality:

### Property 1: Anchor Point Generation Completeness
*For any* set of valid input locations, the anchor generation should produce all required hypothesis point types: geographic centroid, median coordinates, participant locations, and pairwise midpoints.
**Validates: Requirements 1.1**

### Property 2: Bounding Box and Grid Generation
*For any* set of input locations, the bounding box should contain all input points and the grid should generate the expected number of hypothesis points within the bounding box.
**Validates: Requirements 1.2**

### Property 3: Matrix API Call Efficiency
*For any* hypothesis generation process, the system should use exactly one Matrix API call to evaluate all hypothesis points (anchors + grid) simultaneously.
**Validates: Requirements 1.4**

### Property 4: Debug Toggle Independence
*For any* debug visualization toggle state change (show anchors, show grid), the core algorithm calculation results should remain unchanged.
**Validates: Requirements 2.1, 2.2**

### Property 5: Cost-Controlled Hypothesis Generation
*For any* hypothesis generation process, the system should not automatically make any Isochrone API calls until explicitly triggered by user interaction.
**Validates: Requirements 3.1**

### Property 6: On-Demand Isochrone Calculation
*For any* user click on an optimal point, the system should request and display exactly one isochrone from the Isochrone API.
**Validates: Requirements 3.2**

### Property 7: Immediate Optimal Points Display
*For any* completed hypothesis generation, the system should immediately display the top M optimal points without requiring isochrone calculations.
**Validates: Requirements 3.3, 6.1**

### Property 8: Isochrone Response Caching
*For any* isochrone request, the system should cache the response and return cached results for subsequent requests to the same point with identical parameters.
**Validates: Requirements 3.5**

### Property 9: Proximity Deduplication Algorithm
*For any* set of hypothesis points with configurable distance threshold, the deduplication algorithm should merge points closer than the threshold by replacing them with their average coordinates.
**Validates: Requirements 5.1**

### Property 10: Consistent Deduplication Results
*For any* deduplication process, the algorithm should produce deterministic results and recalculate rankings for the remaining points.
**Validates: Requirements 5.2**

### Property 11: Optimization Goal Impact
*For any* optimization goal change (Minimax, Mean, Min), the system should recalculate point rankings using the selected criteria and produce different results for different goals.
**Validates: Requirements 7.4**

## Error Handling

### Algorithm Error Management
- **Hypothesis generation failures**: Implement graceful fallback when anchor or grid generation fails
- **Matrix API failures**: Handle Matrix API errors with retry logic and user-friendly error messages
- **Deduplication edge cases**: Handle scenarios where deduplication reduces points below minimum thresholds
- **Invalid input validation**: Validate location inputs and algorithm parameters before processing

### Cost Control Error Handling
- **Isochrone API rate limiting**: Implement user-friendly messaging when on-demand isochrone requests hit rate limits
- **Matrix API quota management**: Track and warn users about Matrix API usage approaching limits
- **Cache failures**: Graceful fallback to API calls when cache is unavailable, with cost warnings
- **Network timeouts**: Set appropriate timeouts for Matrix API calls (45s) and Isochrone API calls (30s)

### UI State Error Handling
- **Optimal point display**: Handle cases where no valid optimal points are generated
- **Interactive element failures**: Graceful handling when map interactions fail
- **Optimization goal switching**: Handle optimization goal changes during active calculations
- **Debug mode errors**: Ensure debug visualization doesn't break core functionality

### Data Validation Error Handling
- **Location input validation**: Validate coordinates are within valid ranges and properly formatted
- **Parameter validation**: Validate grid sizes, deduplication thresholds, and top M values
- **Travel mode validation**: Ensure selected travel modes are supported by OpenRouteService
- **Bounding box validation**: Handle edge cases where locations are too close or too far apart

## Testing Strategy

### Dual Testing Approach
The application will use both unit testing and property-based testing for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions for core business logic
- **Property tests**: Verify universal properties across all inputs for algorithm correctness
- Both approaches are complementary and necessary for comprehensive coverage

### Property-Based Testing Configuration
- **Testing library**: Use `fast-check` for TypeScript property-based testing
- **Test iterations**: Minimum 100 iterations per property test for thorough randomization
- **Test tagging**: Each property test references its design document property
- **Tag format**: `Feature: isochrone-center-point, Property {number}: {property_text}`

### Unit Testing Focus Areas
- **Hypothesis generation algorithms**: Test anchor generation and grid generation with known inputs
- **Deduplication logic**: Test proximity deduplication with various point configurations and thresholds
- **Scoring and ranking**: Test optimization goal calculations (Minimax, Mean, Min) with different travel time matrices
- **Debug toggles**: Test that UI toggles correctly affect visualization without changing calculations
- **Error scenarios**: Test specific error conditions and recovery mechanisms

### Property Testing Focus Areas
- **Hypothesis generation**: Test that anchor and grid generation produce expected point types and quantities
- **Deduplication consistency**: Test that deduplication produces deterministic results across different input orders
- **API call efficiency**: Test that exactly one Matrix API call is made for hypothesis evaluation
- **Cost control**: Test that no automatic Isochrone API calls are made during hypothesis generation
- **Debug independence**: Test that debug options don't affect core algorithm results
- **Optimization goals**: Test that different optimization goals produce different rankings

### Minimal Integration Testing
- **End-to-end workflows**: Limited testing of complete user journeys from location input to optimal points display
- **API mocking**: Use MSW (Mock Service Worker) for reliable Matrix API testing without external dependencies
- **Map interactions**: Basic testing of optimal point click interactions for isochrone generation
- **UI component integration**: Test that optimization goal selection correctly triggers algorithm recalculation

### Performance Considerations
- **Matrix API efficiency**: Monitor single Matrix API call performance with various hypothesis point counts
- **Hypothesis point limits**: Test performance with maximum supported location counts
- **Grid generation efficiency**: Benchmark grid generation algorithms with various grid sizes
- **Memory usage**: Monitor memory usage during hypothesis generation with large point sets
