# API Documentation

## Overview

The API provides GraphQL endpoints for calculating optimal meeting points using multi-phase optimization algorithms. Built with RedwoodJS and TypeScript, it integrates with OpenRouteService for travel time calculations.

## GraphQL Schema

### Types

```graphql
type Location {
  id: ID!
  name: String!
  latitude: Float!
  longitude: Float!
}

type Coordinate {
  latitude: Float!
  longitude: Float!
}

type IsochroneResult {
  centerPoint: Coordinate!
  fairMeetingArea: GeoJSONPolygon!
  maxTravelTime: Float
  averageTravelTime: Float
  hypothesisPointsEvaluated: Int
}

type HypothesisPoint {
  id: ID!
  coordinate: Coordinate!
  type: HypothesisPointType!
  metadata: JSON
}

enum HypothesisPointType {
  GEOGRAPHIC_CENTROID
  MEDIAN_COORDINATE
  PARTICIPANT_LOCATION
  PAIRWISE_MIDPOINT
  COARSE_GRID
  LOCAL_REFINEMENT
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

input OptimizationConfigInput {
  mode: OptimizationMode!
  coarseGridConfig: CoarseGridConfigInput
  localRefinementConfig: LocalRefinementConfigInput
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

scalar GeoJSONPolygon
scalar JSON
```

### Queries

```graphql
type Query {
  # Geocode an address to coordinates
  geocodeAddress(address: String!): Coordinate

  # Get cache statistics for monitoring
  getCacheStats: CacheStats
}

type CacheStats {
  matrixHits: Int!
  matrixMisses: Int!
  isochroneHits: Int!
  isochroneMisses: Int!
  totalEntries: Int!
  hitRate: Float!
}
```

### Mutations

```graphql
type Mutation {
  # Calculate optimal meeting point using minimax algorithm
  calculateMinimaxCenter(
    locations: [LocationInput!]!
    travelMode: TravelMode!
    bufferTimeMinutes: Int!
    optimizationConfig: OptimizationConfigInput
  ): IsochroneResult!

  # Clear API response cache
  clearCache: Boolean!
}

input LocationInput {
  name: String!
  latitude: Float!
  longitude: Float!
}
```

## Service Architecture

### Core Services

#### `isochrones.ts`
Main service orchestrating the minimax calculation workflow:

```typescript
export const calculateMinimaxCenter = async (params: CalculateMinimaxCenterArgs): Promise<IsochroneResult> => {
  // 1. Validate inputs
  // 2. Generate hypothesis points using optimization config
  // 3. Evaluate travel time matrix
  // 4. Select optimal point using minimax algorithm
  // 5. Generate visualization isochrone
  // 6. Return results
}
```

#### `locations.ts`
Handles geocoding and location validation:

```typescript
export const geocodeAddress = async ({ address }: { address: string }): Promise<Coordinate> => {
  // Uses cached OpenRouteService geocoding
}
```

### Library Modules

#### `geometry.ts`
Hypothesis point generation algorithms:

```typescript
// Generate baseline hypothesis points
export const generateBaselineHypothesisPoints = (locations: Location[]): HypothesisPoint[]

// Generate coarse grid points
export const generateCoarseGridPoints = (
  locations: Location[],
  config: CoarseGridConfig
): HypothesisPoint[]

// Generate local refinement points
export const generateLocalRefinementPoints = (
  topCandidates: HypothesisPoint[],
  config: LocalRefinementConfig
): HypothesisPoint[]
```

#### `matrix.ts`
Travel time matrix evaluation and optimization:

```typescript
// Find optimal point using minimax algorithm
export const findMinimaxOptimal = (matrix: TravelTimeMatrix): OptimizationResult

// Apply tie-breaking rules for equal maximum travel times
export const applyTieBreakingRules = (
  candidates: Candidate[],
  hypothesisPoints: HypothesisPoint[],
  geographicCentroid: Coordinate
): number
```

#### `optimization.ts`
Multi-phase optimization orchestration:

```typescript
// Orchestrate multi-phase hypothesis generation
export const generateHypothesisPoints = (
  locations: Location[],
  config: OptimizationConfig
): HypothesisPoint[]

// Evaluate hypothesis points in optimized batches
export const evaluateHypothesisPoints = (
  origins: Location[],
  hypothesisPoints: HypothesisPoint[],
  travelMode: TravelMode,
  config: OptimizationConfig
): Promise<TravelTimeMatrix>
```

#### `openroute.ts`
OpenRouteService API client:

```typescript
// Calculate travel time matrix
export const calculateTravelTimeMatrix = async (
  origins: Coordinate[],
  destinations: Coordinate[],
  travelMode: TravelMode
): Promise<TravelTimeMatrix>

// Generate isochrone polygon
export const calculateIsochrone = async (
  coordinate: Coordinate,
  params: IsochroneParams
): Promise<GeoJSON.Polygon>

// Geocode address to coordinates
export const geocodeAddress = async (address: string): Promise<Coordinate>
```

#### `cachedOpenroute.ts`
Cached wrapper for OpenRouteService client:

```typescript
// Cached matrix calculation with 100m precision matching
export const calculateTravelTimeMatrixCached = async (
  origins: Coordinate[],
  destinations: Coordinate[],
  travelMode: TravelMode
): Promise<TravelTimeMatrix>
```

#### `cache.ts`
Redis/in-memory caching service:

```typescript
// Matrix cache operations
export const getMatrixCache = async (key: MatrixCacheKey): Promise<TravelTimeMatrix | null>
export const setMatrixCache = async (key: MatrixCacheKey, matrix: TravelTimeMatrix): Promise<void>

// Isochrone cache operations
export const getIsochroneCache = async (key: IsochroneCacheKey): Promise<GeoJSON.Polygon | null>
export const setIsochroneCache = async (key: IsochroneCacheKey, polygon: GeoJSON.Polygon): Promise<void>

// Cache statistics
export const getCacheStats = async (): Promise<CacheStats>
```

## API Usage Examples

### Basic Calculation

```graphql
mutation CalculateBasicMeetingPoint {
  calculateMinimaxCenter(
    locations: [
      { name: "Alice", latitude: 37.7749, longitude: -122.4194 }
      { name: "Bob", latitude: 37.7849, longitude: -122.4094 }
      { name: "Carol", latitude: 37.7649, longitude: -122.4294 }
    ]
    travelMode: DRIVING_CAR
    bufferTimeMinutes: 15
    optimizationConfig: {
      mode: BASELINE
    }
  ) {
    centerPoint {
      latitude
      longitude
    }
    fairMeetingArea
    maxTravelTime
    averageTravelTime
    hypothesisPointsEvaluated
  }
}
```

### Advanced Optimization

```graphql
mutation CalculateOptimizedMeetingPoint {
  calculateMinimaxCenter(
    locations: [
      { name: "Location 1", latitude: 37.7749, longitude: -122.4194 }
      { name: "Location 2", latitude: 37.8049, longitude: -122.4094 }
      { name: "Location 3", latitude: 37.7449, longitude: -122.4394 }
      { name: "Location 4", latitude: 37.7949, longitude: -122.3894 }
      { name: "Location 5", latitude: 37.7549, longitude: -122.4494 }
    ]
    travelMode: DRIVING_CAR
    bufferTimeMinutes: 20
    optimizationConfig: {
      mode: FULL_REFINEMENT
      coarseGridConfig: {
        enabled: true
        paddingKm: 5.0
        gridResolution: 5
      }
      localRefinementConfig: {
        enabled: true
        topK: 3
        refinementRadiusKm: 2.0
        fineGridResolution: 3
      }
    }
  ) {
    centerPoint {
      latitude
      longitude
    }
    fairMeetingArea
    maxTravelTime
    averageTravelTime
    hypothesisPointsEvaluated
  }
}
```

### Geocoding

```graphql
query GeocodeAddress {
  geocodeAddress(address: "1600 Amphitheatre Parkway, Mountain View, CA") {
    latitude
    longitude
  }
}
```

### Cache Management

```graphql
query GetCacheStats {
  getCacheStats {
    matrixHits
    matrixMisses
    isochroneHits
    isochroneMisses
    totalEntries
    hitRate
  }
}

mutation ClearCache {
  clearCache
}
```

## Error Handling

### Common Error Types

#### Validation Errors
```json
{
  "errors": [
    {
      "message": "Validation error: Latitude must be between -90 and 90",
      "extensions": {
        "code": "VALIDATION_ERROR",
        "field": "latitude",
        "value": 95.0
      }
    }
  ]
}
```

#### API Errors
```json
{
  "errors": [
    {
      "message": "OpenRouteService API error: Rate limit exceeded",
      "extensions": {
        "code": "EXTERNAL_API_ERROR",
        "service": "openroute",
        "statusCode": 429
      }
    }
  ]
}
```

#### Calculation Errors
```json
{
  "errors": [
    {
      "message": "No valid hypothesis points found - all locations may be unreachable",
      "extensions": {
        "code": "CALCULATION_ERROR",
        "hypothesisPointsGenerated": 25,
        "validHypothesisPoints": 0
      }
    }
  ]
}
```

## Performance Monitoring

### Metrics Collection

The API collects performance metrics for monitoring:

```typescript
interface CalculationMetrics {
  requestId: string
  locations: number
  optimizationMode: OptimizationMode
  hypothesisPointsGenerated: number
  matrixApiCalls: number
  cacheHitRate: number
  totalDurationMs: number
  phases: {
    hypothesisGeneration: number
    matrixEvaluation: number
    optimization: number
    visualization: number
  }
}
```

### API Usage Tracking

```typescript
interface ApiUsageMetrics {
  date: string
  matrixApiCalls: number
  geocodingApiCalls: number
  isochroneApiCalls: number
  cacheHitRate: number
  averageResponseTime: number
  errorRate: number
}
```

## Configuration

### Environment Variables

```bash
# Required
OPENROUTE_SERVICE_API_KEY=your_api_key_here

# Optional - Caching
REDIS_URL=redis://localhost:6379
CACHE_TTL_MATRIX=86400
CACHE_TTL_ISOCHRONE=86400
CACHE_TTL_GEOCODING=604800

# Optional - API Timeouts
OPENROUTE_TIMEOUT_MS=45000
OPENROUTE_RETRY_ATTEMPTS=3
OPENROUTE_BACKOFF_MULTIPLIER=2

# Optional - Performance
MAX_HYPOTHESIS_POINTS=100
MAX_LOCATIONS=12
CACHE_PRECISION_METERS=100
```

### Default Values

```typescript
const DEFAULT_CONFIG = {
  optimization: {
    maxHypothesisPoints: 100,
    maxLocations: 12,
    defaultOptimizationMode: 'BASELINE' as OptimizationMode
  },
  cache: {
    precisionMeters: 100,
    ttl: {
      matrix: 86400,      // 24 hours
      isochrone: 86400,   // 24 hours
      geocoding: 604800   // 7 days
    }
  },
  api: {
    timeoutMs: 45000,
    retryAttempts: 3,
    backoffMultiplier: 2
  }
}
```

## Testing

### Unit Tests

Run API unit tests:
```bash
yarn rw test api --no-watch
```

### Property-Based Tests

The API includes comprehensive property-based tests using `fast-check`:

```typescript
// Test hypothesis point generation properties
describe('Hypothesis point generation properties', () => {
  it('should generate valid coordinates for all hypothesis points', () => {
    fc.assert(fc.property(
      fc.array(locationArbitrary, { minLength: 2, maxLength: 12 }),
      (locations) => {
        const points = generateHypothesisPoints(locations, defaultConfig)
        return points.every(point =>
          point.coordinate.latitude >= -90 && point.coordinate.latitude <= 90 &&
          point.coordinate.longitude >= -180 && point.coordinate.longitude <= 180
        )
      }
    ))
  })
})
```

### Integration Tests

Test complete workflows:
```bash
yarn rw test api/src/services/integration.test.ts --no-watch
```

## Deployment

### Production Configuration

```bash
# Set production environment variables
export NODE_ENV=production
export OPENROUTE_SERVICE_API_KEY=your_production_key
export REDIS_URL=your_production_redis_url

# Build and deploy
yarn rw build api
yarn rw deploy
```

### Health Checks

The API provides health check endpoints:

```graphql
query HealthCheck {
  getCacheStats {
    totalEntries
  }
}
```

### Monitoring

Monitor key metrics:
- API response times
- Cache hit rates
- External API usage
- Error rates
- Memory usage

## Troubleshooting

### Common Issues

1. **High API Usage**: Use Baseline mode, check cache configuration
2. **Slow Responses**: Verify Redis connectivity, check network to OpenRouteService
3. **Cache Misses**: Verify precision settings, check Redis logs
4. **Invalid Results**: Validate input coordinates, check optimization configuration

### Debug Commands

```bash
# Test API connectivity
yarn rw console
> const openroute = require('./src/lib/openroute')
> await openroute.testConnection()

# Check cache statistics
> const cache = require('./src/lib/cache')
> await cache.getCacheStats()

# Validate configuration
> const optimization = require('./src/lib/optimization')
> optimization.validateConfig(config)
```