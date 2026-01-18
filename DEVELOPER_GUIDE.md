# Developer Guide: Isochrone Center Point

## Overview

This application calculates optimal meeting points using a matrix-based minimax travel-time approach. The system generates strategic hypothesis points and uses the OpenRouteService Matrix API to evaluate actual travel times, selecting the point that minimizes the maximum travel time for all participants.

## Architecture Overview

### Multi-Phase Optimization Algorithm

The application implements a sophisticated multi-phase optimization system with three modes:

1. **Baseline Mode**: Fast calculation using geographic and participant-based points
2. **Coarse Grid Mode**: Enhanced accuracy with systematic grid sampling
3. **Full Refinement Mode**: Maximum accuracy with local refinement around top candidates

### Core Components

```
api/src/
├── lib/
│   ├── geometry.ts          # Hypothesis point generation algorithms
│   ├── matrix.ts            # Travel time matrix evaluation and optimization
│   ├── optimization.ts      # Multi-phase optimization orchestration
│   ├── openroute.ts         # OpenRouteService API client
│   ├── cachedOpenroute.ts   # Cached API client with intelligent caching
│   └── cache.ts             # Redis/in-memory caching layer
├── services/
│   └── isochrones.ts        # GraphQL resolvers and business logic
└── graphql/
    └── isochrones.sdl.ts    # GraphQL schema definitions
```

## Hypothesis Generation Algorithms

### Phase 0: Baseline Hypothesis Points

The baseline algorithm generates strategic candidate points using geographic analysis:

#### 1. Geographic Centroid
```typescript
// Calculate the geographic center of all participant locations
const centroid = turf.centroid(turf.featureCollection(
  locations.map(loc => turf.point([loc.longitude, loc.latitude]))
))
```

#### 2. Median Coordinates
```typescript
// Calculate median latitude and longitude separately
const sortedLats = locations.map(l => l.latitude).sort((a, b) => a - b)
const sortedLngs = locations.map(l => l.longitude).sort((a, b) => a - b)
const medianLat = sortedLats[Math.floor(sortedLats.length / 2)]
const medianLng = sortedLngs[Math.floor(sortedLngs.length / 2)]
```

#### 3. Participant Locations
All input locations are included as hypothesis points since the optimal meeting point might be at one of the participant locations.

#### 4. Pairwise Midpoints
```typescript
// Generate midpoints between all pairs of locations
for (let i = 0; i < locations.length; i++) {
  for (let j = i + 1; j < locations.length; j++) {
    const midpoint = {
      latitude: (locations[i].latitude + locations[j].latitude) / 2,
      longitude: (locations[i].longitude + locations[j].longitude) / 2
    }
  }
}
```

### Phase 1: Coarse Grid Generation

The coarse grid algorithm systematically samples the geographic area:

#### 1. Bounding Box Calculation
```typescript
// Calculate bounding box with configurable padding
const bounds = {
  minLat: Math.min(...locations.map(l => l.latitude)) - paddingKm / 111,
  maxLat: Math.max(...locations.map(l => l.latitude)) + paddingKm / 111,
  minLng: Math.min(...locations.map(l => l.longitude)) - paddingKm / (111 * Math.cos(avgLat * Math.PI / 180)),
  maxLng: Math.max(...locations.map(l => l.longitude)) + paddingKm / (111 * Math.cos(avgLat * Math.PI / 180))
}
```

#### 2. Grid Point Generation
```typescript
// Generate uniform grid over padded bounding box
for (let i = 0; i < gridResolution; i++) {
  for (let j = 0; j < gridResolution; j++) {
    const lat = bounds.minLat + (i / (gridResolution - 1)) * (bounds.maxLat - bounds.minLat)
    const lng = bounds.minLng + (j / (gridResolution - 1)) * (bounds.maxLng - bounds.minLng)
    gridPoints.push({ latitude: lat, longitude: lng })
  }
}
```

### Phase 2: Local Refinement

The local refinement algorithm focuses on the most promising areas:

#### 1. Top-K Candidate Selection
```typescript
// Select best candidates from Phase 0+1 results
const sortedCandidates = matrixResults
  .map((result, index) => ({ index, maxTime: Math.max(...result.travelTimes) }))
  .sort((a, b) => a.maxTime - b.maxTime)
  .slice(0, topK)
```

#### 2. Local Bounding Box Generation
```typescript
// Create local search areas around each top candidate
const localBounds = {
  minLat: candidate.latitude - refinementRadiusKm / 111,
  maxLat: candidate.latitude + refinementRadiusKm / 111,
  minLng: candidate.longitude - refinementRadiusKm / (111 * Math.cos(candidate.latitude * Math.PI / 180)),
  maxLng: candidate.longitude + refinementRadiusKm / (111 * Math.cos(candidate.latitude * Math.PI / 180))
}
```

#### 3. Fine Grid Generation
```typescript
// Generate fine grids within each local bounding box
for (let i = 0; i < fineGridResolution; i++) {
  for (let j = 0; j < fineGridResolution; j++) {
    const lat = localBounds.minLat + (i / (fineGridResolution - 1)) * (localBounds.maxLat - localBounds.minLat)
    const lng = localBounds.minLng + (j / (fineGridResolution - 1)) * (localBounds.maxLng - localBounds.minLng)
    refinementPoints.push({ latitude: lat, longitude: lng })
  }
}
```

## API Call Optimization Strategies

### Batched Matrix Evaluation

The system optimizes API usage through intelligent batching:

#### Phase 0+1 Combined Evaluation
```typescript
// Combine baseline and coarse grid points in single API call
const combinedPoints = [...baselinePoints, ...coarseGridPoints]
const matrixResult = await openRouteClient.calculateTravelTimeMatrix(
  locations,
  combinedPoints,
  travelMode
)
```

#### Phase 2 Separate Evaluation
```typescript
// Evaluate refinement points in separate call for efficiency
const refinementResult = await openRouteClient.calculateTravelTimeMatrix(
  locations,
  refinementPoints,
  travelMode
)
```

### API Call Limits

| Optimization Mode | Matrix API Calls | Typical Hypothesis Points |
|-------------------|------------------|---------------------------|
| Baseline          | 1                | 8-15 points              |
| Coarse Grid       | 1-2              | 25-50 points             |
| Full Refinement   | 2                | 50-100 points            |

### Caching Strategy

The system implements intelligent caching to minimize API usage:

#### Location-Based Cache Keys
```typescript
// Round coordinates to 100m precision for cache matching
const roundCoordinate = (coord: Coordinate) => ({
  lat: Math.round(coord.latitude * (111000 / 100)) / (111000 / 100),
  lng: Math.round(coord.longitude * (111000 / 100)) / (111000 / 100)
})

const cacheKey = `matrix:${originsKey}:${destinationsKey}:${travelMode}`
```

#### Cache TTL Configuration
- **Matrix Data**: 24 hours (travel times are relatively stable)
- **Isochrone Data**: 24 hours (visualization polygons)
- **Geocoding Data**: 7 days (address-to-coordinate mappings)

## Minimax Optimization Algorithm

### Travel Time Matrix Evaluation

The system evaluates all hypothesis points using the OpenRouteService Matrix API:

```typescript
interface TravelTimeMatrix {
  origins: Location[]           // Participant locations
  destinations: HypothesisPoint[] // Candidate meeting points
  travelTimes: number[][]       // travelTimes[i][j] = time from origin i to destination j
  travelMode: TravelMode
}
```

### Minimax Selection

The optimal point minimizes the maximum travel time:

```typescript
const findMinimaxOptimal = (matrix: TravelTimeMatrix) => {
  let bestIndex = -1
  let bestMaxTime = Infinity
  let bestAvgTime = Infinity

  for (let j = 0; j < matrix.destinations.length; j++) {
    const travelTimes = matrix.origins.map((_, i) => matrix.travelTimes[i][j])

    // Skip invalid routes
    if (travelTimes.some(time => time === null || time < 0)) continue

    const maxTime = Math.max(...travelTimes)
    const avgTime = travelTimes.reduce((sum, time) => sum + time, 0) / travelTimes.length

    // Minimax selection with tie-breaking
    if (maxTime < bestMaxTime || (maxTime === bestMaxTime && avgTime < bestAvgTime)) {
      bestIndex = j
      bestMaxTime = maxTime
      bestAvgTime = avgTime
    }
  }

  return { optimalIndex: bestIndex, maxTravelTime: bestMaxTime, averageTravelTime: bestAvgTime }
}
```

### Tie-Breaking Rules

When multiple points have equal maximum travel time:

1. **Primary**: Select point with lowest average travel time
2. **Secondary**: Select point closest to geographic centroid

```typescript
const applyTieBreakingRules = (candidates, hypothesisPoints, geographicCentroid) => {
  // Sort by average travel time, then by distance to centroid
  return candidates.sort((a, b) => {
    if (a.avgTime !== b.avgTime) return a.avgTime - b.avgTime

    const distA = calculateDistance(hypothesisPoints[a.index].coordinate, geographicCentroid)
    const distB = calculateDistance(hypothesisPoints[b.index].coordinate, geographicCentroid)
    return distA - distB
  })[0].index
}
```

## Optimization Mode Usage Examples

### Example 1: Small Team Meeting (2-4 people)
```typescript
const optimizationConfig = {
  mode: 'BASELINE',
  coarseGridConfig: { enabled: false },
  localRefinementConfig: { enabled: false }
}
// Result: ~10-15 hypothesis points, 1 API call, fast results
```

### Example 2: Department Meeting (5-8 people)
```typescript
const optimizationConfig = {
  mode: 'COARSE_GRID',
  coarseGridConfig: {
    enabled: true,
    paddingKm: 5,
    gridResolution: 5
  },
  localRefinementConfig: { enabled: false }
}
// Result: ~35-40 hypothesis points, 1-2 API calls, balanced accuracy
```

### Example 3: Large Conference (8+ people)
```typescript
const optimizationConfig = {
  mode: 'FULL_REFINEMENT',
  coarseGridConfig: {
    enabled: true,
    paddingKm: 5,
    gridResolution: 5
  },
  localRefinementConfig: {
    enabled: true,
    topK: 3,
    refinementRadiusKm: 2,
    fineGridResolution: 3
  }
}
// Result: ~60-80 hypothesis points, 2 API calls, maximum accuracy
```

## Debugging and Visualization Features

### Hypothesis Point Visualization

The application provides comprehensive debugging visualization:

#### Marker Types
- **Blue Circles**: Anchor points (geographic centroid, median, participants)
- **Gray Squares**: Coarse grid points
- **Red Diamonds**: Local refinement points
- **Green Star**: Selected optimal point

#### Debug Controls Component
```typescript
// Toggle hypothesis point visibility
const [showHypothesisPoints, setShowHypothesisPoints] = useState(false)

// Filter points by type for focused debugging
const filteredPoints = hypothesisPoints.filter(point =>
  selectedTypes.includes(point.type)
)
```

### Performance Monitoring

#### API Usage Tracking
```typescript
interface OptimizationMetrics {
  hypothesisPointsGenerated: number
  matrixApiCalls: number
  totalEvaluationTime: number
  cacheHitRate: number
  optimalMaxTravelTime: number
}
```

#### Cache Statistics
```typescript
interface CacheStats {
  matrixHits: number
  matrixMisses: number
  isochroneHits: number
  isochroneMisses: number
  totalEntries: number
  hitRate: number
}
```

## Error Handling and Resilience

### Matrix API Error Handling

The system implements comprehensive error handling:

#### Unreachable Destinations
```typescript
// Filter out hypothesis points with invalid travel times
const validPoints = matrixResults.filter((result, index) => {
  const travelTimes = result.travelTimes
  return travelTimes.every(time => time !== null && time >= 0 && time < Infinity)
})
```

#### Fallback Strategies
1. **Empty hypothesis set**: Fall back to geographic centroid
2. **All points unreachable**: Return error with geographic centroid suggestion
3. **API rate limiting**: Use cached results when available
4. **Network failures**: Implement exponential backoff retry logic

### Input Validation

#### Coordinate Bounds Validation
```typescript
const validateCoordinate = (coord: Coordinate): boolean => {
  return coord.latitude >= -90 && coord.latitude <= 90 &&
         coord.longitude >= -180 && coord.longitude <= 180
}
```

#### Configuration Validation
```typescript
const validateOptimizationConfig = (config: OptimizationConfig): ValidationResult => {
  const errors: string[] = []

  if (config.coarseGridConfig?.gridResolution < 2 || config.coarseGridConfig?.gridResolution > 10) {
    errors.push('Grid resolution must be between 2 and 10')
  }

  if (config.localRefinementConfig?.refinementRadiusKm < 0.5 || config.localRefinementConfig?.refinementRadiusKm > 10) {
    errors.push('Refinement radius must be between 0.5 and 10 km')
  }

  return { isValid: errors.length === 0, errors }
}
```

## Testing Strategy

### Property-Based Testing

The application uses `fast-check` for comprehensive property-based testing:

#### Hypothesis Generation Properties
```typescript
// Property: All generated hypothesis points should have valid coordinates
fc.assert(fc.property(
  fc.array(locationArbitrary, { minLength: 2, maxLength: 12 }),
  (locations) => {
    const hypothesisPoints = generateHypothesisPoints(locations)
    return hypothesisPoints.every(point => validateCoordinate(point.coordinate))
  }
))
```

#### Minimax Optimization Properties
```typescript
// Property: Selected optimal point should minimize maximum travel time
fc.assert(fc.property(
  travelTimeMatrixArbitrary,
  (matrix) => {
    const result = findMinimaxOptimal(matrix)
    const optimalMaxTime = Math.max(...matrix.travelTimes.map(row => row[result.optimalIndex]))

    // Verify no other point has a lower maximum travel time
    for (let j = 0; j < matrix.destinations.length; j++) {
      if (j !== result.optimalIndex) {
        const maxTime = Math.max(...matrix.travelTimes.map(row => row[j]))
        expect(maxTime).toBeGreaterThanOrEqual(optimalMaxTime)
      }
    }
  }
))
```

### Integration Testing

#### End-to-End Workflow Testing
```typescript
describe('Multi-phase optimization workflow', () => {
  it('should improve solution quality with higher optimization modes', async () => {
    const locations = generateTestLocations(6)

    const baselineResult = await calculateMinimaxCenter(locations, 'BASELINE')
    const coarseGridResult = await calculateMinimaxCenter(locations, 'COARSE_GRID')
    const fullRefinementResult = await calculateMinimaxCenter(locations, 'FULL_REFINEMENT')

    // Higher modes should provide equal or better solutions
    expect(coarseGridResult.maxTravelTime).toBeLessThanOrEqual(baselineResult.maxTravelTime)
    expect(fullRefinementResult.maxTravelTime).toBeLessThanOrEqual(coarseGridResult.maxTravelTime)
  })
})
```

## Performance Considerations

### Computational Complexity

| Phase | Time Complexity | Space Complexity | API Calls |
|-------|----------------|------------------|-----------|
| Baseline | O(n²) | O(n²) | 1 |
| Coarse Grid | O(g²) | O(g²) | 1-2 |
| Local Refinement | O(k×f²) | O(k×f²) | 2 |

Where:
- n = number of participant locations
- g = grid resolution
- k = top-K candidates
- f = fine grid resolution

### Memory Usage

The system maintains several data structures in memory:

```typescript
// Typical memory usage for 8 locations, FULL_REFINEMENT mode
const memoryEstimate = {
  locations: 8 * 64,              // ~512 bytes
  hypothesisPoints: 80 * 128,     // ~10KB
  travelTimeMatrix: 8 * 80 * 8,   // ~5KB
  cacheEntries: 100 * 1024,       // ~100KB (varies)
  total: '~115KB per calculation'
}
```

### API Rate Limiting

OpenRouteService API limits:
- **Free tier**: 2,000 requests/day
- **Matrix API**: Up to 50 origins × 50 destinations per request
- **Rate limit**: 40 requests/minute

The application respects these limits through:
- Intelligent batching of matrix requests
- Aggressive caching with 100m precision matching
- Request queuing during high-load periods

## Configuration Reference

### Environment Variables

```bash
# Required
OPENROUTE_SERVICE_API_KEY=your_api_key_here

# Optional
REDIS_URL=redis://localhost:6379  # Falls back to in-memory cache
CACHE_TTL_MATRIX=86400           # 24 hours
CACHE_TTL_ISOCHRONE=86400        # 24 hours
CACHE_TTL_GEOCODING=604800       # 7 days
```

### Default Configuration Values

```typescript
const DEFAULT_CONFIG = {
  optimization: {
    baseline: {
      enabled: true
    },
    coarseGrid: {
      paddingKm: 5,
      gridResolution: 5
    },
    localRefinement: {
      topK: 3,
      refinementRadiusKm: 2,
      fineGridResolution: 3
    }
  },
  cache: {
    precisionMeters: 100,
    ttlSeconds: {
      matrix: 86400,
      isochrone: 86400,
      geocoding: 604800
    }
  },
  api: {
    timeoutMs: 45000,
    retryAttempts: 3,
    backoffMultiplier: 2
  }
}
```

## Troubleshooting

### Common Issues

#### 1. High API Usage
**Symptoms**: Rapid API quota consumption
**Solutions**:
- Use Baseline mode for development/testing
- Implement more aggressive caching
- Reduce grid resolution parameters

#### 2. Slow Response Times
**Symptoms**: Long calculation times
**Solutions**:
- Check network connectivity to OpenRouteService
- Verify Redis cache is working
- Reduce hypothesis point count

#### 3. Inaccurate Results
**Symptoms**: Suboptimal meeting points
**Solutions**:
- Use Full Refinement mode for critical calculations
- Increase grid resolution (with API usage consideration)
- Verify input location accuracy

#### 4. Cache Misses
**Symptoms**: High API usage despite similar requests
**Solutions**:
- Check cache precision settings (default: 100m)
- Verify Redis connectivity
- Monitor cache statistics

### Debug Commands

```bash
# Check cache statistics
yarn rw console
> const cache = require('./api/src/lib/cache')
> cache.getCacheStats()

# Test API connectivity
yarn rw console
> const openroute = require('./api/src/lib/openroute')
> openroute.testConnection()

# Validate optimization configuration
yarn rw console
> const optimization = require('./api/src/lib/optimization')
> optimization.validateConfig(yourConfig)
```

## Contributing

### Code Style

The project follows standard TypeScript/React conventions:

- Use TypeScript for all new code
- Follow ESLint configuration
- Write comprehensive tests for new features
- Document complex algorithms with inline comments

### Testing Requirements

All new features must include:

1. **Unit tests**: Test individual functions and components
2. **Property-based tests**: Test universal properties with `fast-check`
3. **Integration tests**: Test complete workflows
4. **Performance tests**: Benchmark API usage and response times

### Pull Request Guidelines

1. Include comprehensive tests
2. Update documentation for new features
3. Verify API usage optimization
4. Test with various location configurations
5. Ensure backward compatibility

## License

This project is licensed under the MIT License. See LICENSE file for details.