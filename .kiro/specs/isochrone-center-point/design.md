# Design Document: Isochrone Center Point

## Overview

This design transforms the existing vanilla HTML/JavaScript isochrone application into a modern RedwoodJS full-stack application with an intelligent "fair meeting point" feature. The system calculates isochronic centroids by finding the geometric center of overlapping travel-time areas, ensuring meeting points are actually accessible within reasonable time from all participants.

The application uses RedwoodJS's serverless-first architecture with React frontend, GraphQL API, and TypeScript throughout. The core innovation is the isochronic centroid calculation: instead of simple geographic averaging, we calculate individual isochrones, find their union, and determine the centroid of that accessible area.

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
- **Geometry**: Turf.js for polygon operations (union, centroid calculation)
- **External APIs**: OpenRouteService for isochrone calculation and geocoding
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
  calculateIsochronicCenter(
    locations: [LocationInput!]!
    travelTimeMinutes: Int!
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
  calculateIsochronicCenter(params: IsochroneCenterParams): Promise<IsochroneResult>
  calculateSingleIsochrone(location: Coordinate, params: IsochroneParams): Promise<GeoJSON.Polygon>
}

interface IsochroneCenterParams {
  locations: Location[]
  travelTimeMinutes: number
  travelMode: TravelMode
  bufferTimeMinutes: number
}

interface IsochroneParams {
  travelTimeMinutes: number
  travelMode: TravelMode
}
```

#### Geometry Service
```typescript
interface GeometryService {
  calculatePolygonUnion(polygons: GeoJSON.Polygon[]): GeoJSON.Polygon | GeoJSON.MultiPolygon
  calculateCentroid(polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon): Coordinate
  validatePolygonOverlap(polygons: GeoJSON.Polygon[]): boolean
}
```

#### Cache Service
```typescript
interface CacheService {
  getIsochroneCache(key: IsochroneCacheKey): Promise<GeoJSON.Polygon | null>
  setIsochroneCache(key: IsochroneCacheKey, polygon: GeoJSON.Polygon, ttl?: number): Promise<void>
  getGeocodingCache(address: string): Promise<Coordinate | null>
  setGeocodingCache(address: string, coordinate: Coordinate, ttl?: number): Promise<void>
  clearCache(): Promise<void>
  getCacheStats(): Promise<CacheStats>
}

interface IsochroneCacheKey {
  latitude: number
  longitude: number
  travelTimeMinutes: number
  travelMode: TravelMode
  precision: number // meters for location matching
}

interface CacheStats {
  isochroneHits: number
  isochroneMisses: number
  geocodingHits: number
  geocodingMisses: number
  totalEntries: number
}
```
```typescript
interface OpenRouteClient {
  calculateIsochrone(coordinate: Coordinate, params: IsochroneParams): Promise<GeoJSON.Polygon>
  geocodeAddress(address: string): Promise<Coordinate>
}
```

### Caching Strategy

#### Location-Based Cache Keys
```typescript
// Cache key generation for isochrones
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
- **TTL**: 24 hours for isochrone data, 7 days for geocoding data
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

### Isochrone Calculation State
```typescript
interface IsochroneCalculation {
  id: string
  locations: Location[]
  travelTimeMinutes: number
  travelMode: TravelMode
  bufferTimeMinutes: number
  result?: IsochroneResult
  status: 'pending' | 'calculating' | 'completed' | 'error'
  error?: string
  createdAt: Date
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

### Property 4: Isochrone Calculation Pipeline
*For any* set of valid locations and travel parameters, the system should successfully calculate individual isochrones, compute their geometric union, and determine the centroid of the accessible area.
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 5: Isochronic Center Validation
*For any* calculated isochronic center point, generating an isochrone from that center should produce a valid polygon that represents the fair meeting area.
**Validates: Requirements 5.1**

### Property 6: UI Display Consistency
*For any* application state with locations and calculated results, the map display should correctly show location markers, center point, and fair meeting area with proper visual differentiation.
**Validates: Requirements 4.4, 5.2, 6.2, 6.3**

### Property 7: Input Validation Boundaries
*For any* buffer time input, the system should accept values between 5 and 60 minutes and reject values outside this range with appropriate error messages.
**Validates: Requirements 5.3**

### Property 8: Interactive Behavior
*For any* map marker click event, the system should display appropriate popup information corresponding to the clicked element (location details or fair meeting area description).
**Validates: Requirements 5.5, 6.4**

### Property 9: API Response Caching
*For any* location within 100 meters of a previously cached location with identical travel parameters, the system should return the cached result instead of making a new API call, and the cached result should be equivalent to a fresh API response.
**Validates: Requirements 8.1, 8.2**

### Property 10: Error Handling Robustness
*For any* error condition (missing API key, geocoding failure, API rate limits, insufficient locations), the system should return structured error responses with user-friendly messages and maintain stable application state.
**Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

<function_calls>
<invoke name="prework">
<parameter name="featureName">isochrone-center-point

## Error Handling

### API Error Management
- **OpenRouteService API failures**: Implement exponential backoff retry logic with circuit breaker pattern
- **Rate limiting**: Cache successful responses and implement request queuing to respect API limits
- **Cache failures**: Graceful fallback to API calls when cache is unavailable, with appropriate logging
- **Network timeouts**: Set reasonable timeout values (30s for isochrone calculations, 10s for geocoding)
- **Invalid responses**: Validate API response schemas and handle malformed GeoJSON gracefully

### Input Validation
- **Coordinate bounds**: Validate latitude (-90 to 90) and longitude (-180 to 180) ranges
- **Address format**: Handle various address formats and international addresses
- **Travel parameters**: Validate travel time (1-60 minutes) and buffer time (5-60 minutes) ranges
- **Location limits**: Enforce minimum 2 locations and maximum 12 locations for performance

### Geometry Error Handling
- **Empty intersections**: Handle cases where isochrones don't overlap by suggesting larger travel times
- **Invalid polygons**: Validate GeoJSON polygon structure and handle self-intersecting polygons
- **Centroid calculation failures**: Fallback to geographic centroid if geometric centroid calculation fails
- **Union operation failures**: Handle complex polygon union edge cases with Turf.js error recovery

### User Experience Error Handling
- **Loading states**: Show appropriate loading indicators during API calls and calculations
- **Error messages**: Display user-friendly error messages with actionable suggestions
- **Graceful degradation**: Allow partial functionality when some features fail
- **State recovery**: Maintain application state consistency during error conditions

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
- **Calculation consistency**: Test isochrone calculation pipeline with random valid inputs
- **State management**: Test location addition/removal with various sequences
- **Cache behavior**: Test cache hit/miss scenarios with location proximity and parameter variations
- **Error handling**: Test error response consistency across different failure modes

### Integration Testing
- **End-to-end workflows**: Test complete user journeys from location input to result display
- **API mocking**: Use MSW (Mock Service Worker) for reliable API testing
- **Map interactions**: Test Leaflet map integration and marker management
- **GraphQL operations**: Test GraphQL queries and mutations with various inputs

### Performance Testing
- **Polygon operations**: Benchmark Turf.js union and centroid calculations with large polygons
- **API response times**: Monitor OpenRouteService API performance and implement timeouts
- **Memory usage**: Test application memory usage with maximum location limits
- **Rendering performance**: Test map rendering performance with complex isochrone polygons