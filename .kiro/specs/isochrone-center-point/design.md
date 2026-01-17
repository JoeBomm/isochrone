# Design Document: Isochrone Center Point

## Overview

This design transforms the existing vanilla HTML/JavaScript isochrone application into a modern RedwoodJS full-stack application with an intelligent "fair meeting point" feature. The system calculates optimal meeting points using a matrix-based minimax travel-time approach that minimizes the maximum travel time from all participant locations.

The application uses RedwoodJS's serverless-first architecture with React frontend, GraphQL API, and TypeScript throughout. The core innovation is the minimax travel-time center calculation: instead of geometric averaging or isochrone unions, we generate strategic hypothesis points and use the OpenRouteService Matrix API to evaluate actual travel times, selecting the point that minimizes the maximum travel time for all participants.

## Architecture

### RedwoodJS Structure

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
│   │   │   ├── isochrones.ts
│   │   │   ├── geometry.ts
│   │   │   └── cache.ts          # API response caching service
│   │   └── lib/
│   │       ├── openroute.ts      # External API client
│   │       └── logger.ts
├── web/                          # Frontend (React SPA)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/
│   │   │   │   ├── Map.tsx       # Leaflet map component
│   │   │   │   └── MapMarkers.tsx
│   │   │   ├── LocationInput/
│   │   │   │   └── LocationInput.tsx
│   │   │   └── Controls/
│   │   │       └── IsochroneControls.tsx
│   │   ├── pages/
│   │   │   └── HomePage/
│   │   │       └── HomePage.tsx
│   │   └── layouts/
│   │       └── MainLayout/
│   │           └── MainLayout.tsx
└── .env.example                  # Environment template
```

### Technology Stack

- **Frontend**: React 18, TypeScript, Leaflet.js for mapping
- **Backend**: Node.js serverless functions, GraphQL with Apollo
- **Matrix Calculations**: OpenRouteService Matrix API for travel time evaluation
- **Geometry**: Turf.js for geographic calculations (centroid, midpoints)
- **External APIs**: OpenRouteService for matrix calculations, isochrone visualization, and geocoding
- **Styling**: Tailwind CSS for responsive design

## Components and Interfaces

### Frontend Components

#### Map Component
```typescript
interface MapProps {
  locations: Location[]
  centerPoint?: Coordinate
  fairMeetingArea?: GeoJSON.Polygon
  onMapClick?: (coordinate: Coordinate) => void
}

interface Location {
  id: string
  name: string
  coordinate: Coordinate
  color: string
}

interface Coordinate {
  latitude: number
  longitude: number
}
```

#### LocationInput Component
```typescript
interface LocationInputProps {
  onLocationAdd: (input: string) => Promise<void>
  onLocationRemove: (locationId: string) => void
  locations: Location[]
  isLoading: boolean
}
```

#### IsochroneControls Component
```typescript
interface IsochroneControlsProps {
  travelTime: number
  travelMode: TravelMode
  bufferTime: number
  onTravelTimeChange: (minutes: number) => void
  onTravelModeChange: (mode: TravelMode) => void
  onBufferTimeChange: (minutes: number) => void
  onCalculate: () => Promise<void>
  isCalculating: boolean
}

type TravelMode = 'driving-car' | 'cycling-regular' | 'foot-walking'
```

### GraphQL Schema

```graphql
type Location {
  id: ID!
  name: String!
  latitude: Float!
  longitude: Float!
}

type IsochroneResult {
  centerPoint: Coordinate
  fairMeetingArea: GeoJSONPolygon
  individualIsochrones: [GeoJSONPolygon!]!
}

type Coordinate {
  latitude: Float!
  longitude: Float!
}

scalar GeoJSONPolygon

type Query {
  geocodeAddress(address: String!): Coordinate
}

type Mutation {
  calculateMinimaxCenter(
    locations: [LocationInput!]!
    travelMode: TravelMode!
    bufferTimeMinutes: Int!
  ): IsochroneResult!
}

input LocationInput {
  name: String!
  latitude: Float!
  longitude: Float!
}

enum TravelMode {
  DRIVING_CAR
  CYCLING_REGULAR
  FOOT_WALKING
}
```

### Backend Services

#### Isochrone Service
```typescript
interface IsochroneService {
  calculateMinimaxCenter(params: MinimaxCenterParams): Promise<IsochroneResult>
  generateHypothesisPoints(locations: Location[]): HypothesisPoint[]
  evaluateTravelTimes(origins: Location[], destinations: HypothesisPoint[], travelMode: TravelMode): Promise<TravelTimeMatrix>
  selectOptimalPoint(matrix: TravelTimeMatrix, hypothesisPoints: HypothesisPoint[]): HypothesisPoint
  calculateVisualizationIsochrone(centerPoint: Coordinate, params: IsochroneParams): Promise<GeoJSON.Polygon>
}

interface MinimaxCenterParams {
  locations: Location[]
  travelMode: TravelMode
  bufferTimeMinutes: number // Used only for visualization
}

interface HypothesisPoint {
  id: string
  coordinate: Coordinate
  type: 'geographic_centroid' | 'median_coordinate' | 'participant_location' | 'pairwise_midpoint'
  metadata?: {
    participantId?: string
    pairIds?: [string, string]
  }
}

interface TravelTimeMatrix {
  origins: Location[]
  destinations: HypothesisPoint[]
  travelTimes: number[][] // travelTimes[i][j] = time from origin i to destination j
  travelMode: TravelMode
}

interface IsochroneParams {
  travelTimeMinutes: number
  travelMode: TravelMode
}
```

#### Geometry Service
```typescript
interface GeometryService {
  calculateGeographicCentroid(locations: Location[]): Coordinate
  calculateMedianCoordinate(locations: Location[]): Coordinate
  calculatePairwiseMidpoints(locations: Location[]): Coordinate[]
  validateCoordinateBounds(coordinate: Coordinate): boolean
}
```

#### Matrix Service
```typescript
interface MatrixService {
  calculateTravelTimeMatrix(
    origins: Coordinate[],
    destinations: Coordinate[],
    travelMode: TravelMode
  ): Promise<TravelTimeMatrix>
  findMinimaxOptimal(matrix: TravelTimeMatrix): {
    optimalIndex: number
    maxTravelTime: number
    averageTravelTime: number
  }
  applyTieBreakingRules(
    candidates: Array<{index: number, maxTime: number, avgTime: number}>,
    hypothesisPoints: HypothesisPoint[],
    geographicCentroid: Coordinate
  ): number
}
```

#### Cache Service
```typescript
interface CacheService {
  getMatrixCache(key: MatrixCacheKey): Promise<TravelTimeMatrix | null>
  setMatrixCache(key: MatrixCacheKey, matrix: TravelTimeMatrix, ttl?: number): Promise<void>
  getIsochroneCache(key: IsochroneCacheKey): Promise<GeoJSON.Polygon | null>
  setIsochroneCache(key: IsochroneCacheKey, polygon: GeoJSON.Polygon, ttl?: number): Promise<void>
  getGeocodingCache(address: string): Promise<Coordinate | null>
  setGeocodingCache(address: string, coordinate: Coordinate, ttl?: number): Promise<void>
  clearCache(): Promise<void>
  getCacheStats(): Promise<CacheStats>
}

interface MatrixCacheKey {
  origins: Coordinate[]
  destinations: Coordinate[]
  travelMode: TravelMode
  precision: number // meters for location matching
}

interface IsochroneCacheKey {
  latitude: number
  longitude: number
  travelTimeMinutes: number
  travelMode: TravelMode
  precision: number // meters for location matching
}

interface CacheStats {
  matrixHits: number
  matrixMisses: number
  isochroneHits: number
  isochroneMisses: number
  geocodingHits: number
  geocodingMisses: number
  totalEntries: number
}
```
```typescript
interface OpenRouteClient {
  calculateTravelTimeMatrix(
    origins: Coordinate[],
    destinations: Coordinate[],
    travelMode: TravelMode
  ): Promise<TravelTimeMatrix>
  calculateIsochrone(coordinate: Coordinate, params: IsochroneParams): Promise<GeoJSON.Polygon>
  geocodeAddress(address: string): Promise<Coordinate>
}
```

### Caching Strategy

#### Location-Based Cache Keys
```typescript
// Cache key generation for travel time matrices
function generateMatrixCacheKey(
  origins: Coordinate[],
  destinations: Coordinate[],
  travelMode: TravelMode,
  precision: number = 100 // meters
): string {
  const roundCoordinate = (coord: Coordinate) => ({
    lat: Math.round(coord.latitude * (111000 / precision)) / (111000 / precision),
    lng: Math.round(coord.longitude * (111000 / precision)) / (111000 / precision)
  })

  const originsKey = origins.map(roundCoordinate).sort().map(c => `${c.lat}:${c.lng}`).join(',')
  const destinationsKey = destinations.map(roundCoordinate).sort().map(c => `${c.lat}:${c.lng}`).join(',')

  return `matrix:${originsKey}:${destinationsKey}:${travelMode}`
}

// Cache key generation for isochrones (unchanged)
function generateIsochroneCacheKey(
  coordinate: Coordinate,
  params: IsochroneParams,
  precision: number = 100 // meters
): string {
  // Round coordinates to precision for cache matching
  const latRounded = Math.round(coordinate.latitude * (111000 / precision)) / (111000 / precision)
  const lngRounded = Math.round(coordinate.longitude * (111000 / precision)) / (111000 / precision)

  return `isochrone:${latRounded}:${lngRounded}:${params.travelTimeMinutes}:${params.travelMode}`
}
```

#### Cache Implementation
- **Storage**: Redis for production, in-memory for development
- **TTL**: 24 hours for matrix data, 24 hours for isochrone data, 7 days for geocoding data
- **Precision**: 100-meter radius for location matching (configurable)
- **Eviction**: LRU (Least Recently Used) policy when memory limits reached
- **Cache warming**: Pre-populate cache with common locations during testing

## Data Models

### Location Model
```typescript
interface Location {
  id: string
  name: string
  coordinate: Coordinate
  color: string
  createdAt: Date
}
```

### Minimax Calculation State
```typescript
interface MinimaxCalculation {
  id: string
  locations: Location[]
  travelMode: TravelMode
  bufferTimeMinutes: number
  hypothesisPoints?: HypothesisPoint[]
  travelTimeMatrix?: TravelTimeMatrix
  result?: IsochroneResult
  status: 'pending' | 'generating_hypotheses' | 'evaluating_matrix' | 'selecting_optimal' | 'generating_visualization' | 'completed' | 'error'
  error?: string
  createdAt: Date
}

### Minimax Result
```typescript
interface MinimaxResult {
  optimalPoint: HypothesisPoint
  maxTravelTime: number
  averageTravelTime: number
  allHypothesisPoints: HypothesisPoint[]
  travelTimeMatrix: TravelTimeMatrix
  fairMeetingArea: GeoJSON.Polygon
}
```

### GeoJSON Types
```typescript
interface GeoJSONPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

interface GeoJSONMultiPolygon {
  type: 'MultiPolygon'
  coordinates: number[][][][]
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties validate the core functionality:

### Property 1: API Key Validation
*For any* API key string, the validation function should correctly identify valid OpenRouteService API key formats and reject invalid formats with descriptive error messages.
**Validates: Requirements 2.5**

### Property 2: Coordinate Validation and Geocoding
*For any* valid address string, the geocoding service should return coordinates within valid latitude (-90 to 90) and longitude (-180 to 180) ranges.
**Validates: Requirements 3.1, 3.2, 8.3**

### Property 3: Location State Management
*For any* sequence of location additions and removals, the application state should correctly maintain the location list and clear dependent calculations when locations are modified.
**Validates: Requirements 3.3, 3.4**

### Property 4: Hypothesis Point Generation
*For any* set of valid locations, the system should generate all required hypothesis point types: geographic centroid, median coordinates, participant locations, and pairwise midpoints.
**Validates: Requirements 4.1**

### Property 5: Travel Time Matrix Evaluation
*For any* set of origins and destinations with valid travel mode, the matrix evaluation should return travel times with correct dimensions and all values should be positive numbers or indicate unreachable routes.
**Validates: Requirements 4.2**

### Property 6: Minimax Optimization
*For any* valid travel time matrix, the selected optimal point should minimize the maximum travel time among all hypothesis points, excluding any points with invalid travel times.
**Validates: Requirements 4.3, 4.5**

### Property 7: Tie-Breaking Rules
*For any* travel time matrix where multiple hypothesis points have equal maximum travel time, the tie-breaking rules should select the point with lowest average travel time, and if still tied, the point closest to geographic centroid.
**Validates: Requirements 4.4**

### Property 8: Visualization Isochrone Generation
*For any* optimal meeting point and buffer time parameters, the system should generate a valid GeoJSON polygon representing the fair meeting area.
**Validates: Requirements 5.1**

### Property 9: UI Display Consistency
*For any* application state with locations and calculated results, the map display should correctly show location markers, center point, and fair meeting area with proper visual differentiation.
**Validates: Requirements 4.4, 5.2, 6.2, 6.3**

### Property 10: Input Validation Boundaries
*For any* buffer time input, the system should accept values between 5 and 60 minutes and reject values outside this range with appropriate error messages.
**Validates: Requirements 5.3**

### Property 11: Interactive Behavior
*For any* map marker click event, the system should display appropriate popup information corresponding to the clicked element (location details or fair meeting area description).
**Validates: Requirements 5.5, 6.4**

### Property 12: Matrix Response Caching
*For any* travel time matrix calculation, the system should cache the result with location coordinates and travel mode as the cache key, and subsequent requests for locations within 100 meters with identical travel mode should return the cached result.
**Validates: Requirements 8.1, 8.2**

### Property 13: Minimax Fairness Property
*For any* valid set of locations, the selected meeting point should minimize the maximum travel time from all participants among the evaluated hypothesis points, ensuring optimal fairness in travel time distribution.
**Validates: Requirements 4.3, 4.5**

## Error Handling

### API Error Management
- **OpenRouteService Matrix API failures**: Implement exponential backoff retry logic with circuit breaker pattern for matrix calculations
- **Rate limiting**: Cache successful matrix responses and implement request queuing to respect API limits
- **Cache failures**: Graceful fallback to API calls when cache is unavailable, with appropriate logging
- **Network timeouts**: Set reasonable timeout values (45s for matrix calculations, 30s for isochrone calculations, 10s for geocoding)
- **Invalid responses**: Validate Matrix API response schemas and handle malformed travel time data gracefully

### Input Validation
- **Coordinate bounds**: Validate latitude (-90 to 90) and longitude (-180 to 180) ranges
- **Address format**: Handle various address formats and international addresses
- **Travel parameters**: Validate buffer time (5-60 minutes) ranges
- **Location limits**: Enforce minimum 2 locations and maximum 12 locations for performance
- **Hypothesis point validation**: Ensure all generated hypothesis points have valid coordinates

### Matrix Calculation Error Handling
- **Unreachable destinations**: Handle cases where some hypothesis points are unreachable from participant locations
- **Invalid travel times**: Filter out hypothesis points with null, negative, or infinite travel times
- **Empty hypothesis set**: Handle cases where all hypothesis points are invalid by falling back to geographic centroid
- **Matrix dimension mismatches**: Validate matrix response dimensions match expected origins and destinations
- **Tie-breaking failures**: Implement fallback selection when tie-breaking rules cannot determine a unique winner

### User Experience Error Handling
- **Loading states**: Show appropriate loading indicators during matrix calculations and optimization
- **Error messages**: Display user-friendly error messages with actionable suggestions
- **Graceful degradation**: Allow partial functionality when some features fail
- **State recovery**: Maintain application state consistency during error conditions
- **Progress indicators**: Show calculation progress through hypothesis generation, matrix evaluation, and optimization phases

## Testing Strategy

### Dual Testing Approach
The application will use both unit testing and property-based testing for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs
- Both approaches are complementary and necessary for comprehensive coverage

### Property-Based Testing Configuration
- **Testing library**: Use `fast-check` for TypeScript property-based testing
- **Test iterations**: Minimum 100 iterations per property test for thorough randomization
- **Test tagging**: Each property test references its design document property
- **Tag format**: `Feature: isochrone-center-point, Property {number}: {property_text}`

### Unit Testing Focus Areas
- **API integration**: Test specific OpenRouteService API responses and error conditions
- **Geometry operations**: Test polygon union and centroid calculations with known inputs
- **UI components**: Test React component rendering and user interactions
- **Error scenarios**: Test specific error conditions and recovery mechanisms

### Property Testing Focus Areas
- **Input validation**: Test coordinate validation across all possible input ranges
- **Hypothesis generation**: Test hypothesis point generation with random location sets
- **Matrix evaluation**: Test travel time matrix calculations with various location combinations
- **Minimax optimization**: Test optimal point selection with random travel time matrices
- **State management**: Test location addition/removal with various sequences
- **Cache behavior**: Test cache hit/miss scenarios with location proximity and parameter variations
- **Error handling**: Test error response consistency across different failure modes

### Integration Testing
- **End-to-end workflows**: Test complete user journeys from location input to minimax result display
- **API mocking**: Use MSW (Mock Service Worker) for reliable Matrix API testing
- **Map interactions**: Test Leaflet map integration and marker management
- **GraphQL operations**: Test GraphQL queries and mutations with various inputs

### Performance Testing
- **Matrix calculations**: Benchmark OpenRouteService Matrix API performance with various location counts
- **Hypothesis generation**: Test performance of hypothesis point generation with maximum location limits
- **Optimization algorithms**: Benchmark minimax optimization with large travel time matrices
- **API response times**: Monitor OpenRouteService API performance and implement timeouts
- **Memory usage**: Test application memory usage with maximum location limits
- **Rendering performance**: Test map rendering performance with multiple hypothesis points and optimal center display