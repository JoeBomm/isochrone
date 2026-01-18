# Testing Guide

## Overview

This project uses a comprehensive testing strategy combining unit tests, property-based tests, and integration tests to ensure correctness and reliability of the multi-phase optimization algorithms.

## Testing Philosophy

### Dual Testing Approach

The application employs both traditional unit testing and property-based testing:

- **Unit Tests**: Verify specific examples, edge cases, and error conditions
- **Property-Based Tests**: Verify universal properties across all inputs using randomized testing
- **Integration Tests**: Test complete workflows and component interactions

This dual approach provides comprehensive coverage where unit tests catch concrete bugs and property-based tests verify general correctness.

## Property-Based Testing

### What is Property-Based Testing?

Property-based testing validates software by testing universal properties that should hold for all valid inputs. Instead of testing specific examples, it generates hundreds of random inputs to verify that certain properties always hold true.

### Fast-Check Integration

We use [`fast-check`](https://github.com/dubzzz/fast-check) for TypeScript property-based testing:

```typescript
import fc from 'fast-check'

// Example: Test that hypothesis point generation always produces valid coordinates
fc.assert(fc.property(
  fc.array(locationArbitrary, { minLength: 2, maxLength: 12 }),
  (locations) => {
    const hypothesisPoints = generateHypothesisPoints(locations)
    return hypothesisPoints.every(point =>
      point.coordinate.latitude >= -90 && point.coordinate.latitude <= 90 &&
      point.coordinate.longitude >= -180 && point.coordinate.longitude <= 180
    )
  }
))
```

### Property Test Configuration

All property tests run with minimum 100 iterations for thorough randomization:

```typescript
// Configure test iterations
fc.configureGlobal({ numRuns: 100 })

// Tag format for traceability
// Feature: isochrone-center-point, Property 1: API Key Validation
```

## Test Categories

### 1. Hypothesis Generation Tests

#### Unit Tests
```typescript
describe('Hypothesis point generation', () => {
  it('should generate geographic centroid for valid locations', () => {
    const locations = [
      { id: '1', name: 'A', latitude: 37.7749, longitude: -122.4194 },
      { id: '2', name: 'B', latitude: 37.7849, longitude: -122.4094 }
    ]

    const points = generateBaselineHypothesisPoints(locations)
    const centroid = points.find(p => p.type === 'GEOGRAPHIC_CENTROID')

    expect(centroid).toBeDefined()
    expect(centroid.coordinate.latitude).toBeCloseTo(37.7799, 4)
    expect(centroid.coordinate.longitude).toBeCloseTo(-122.4144, 4)
  })
})
```

#### Property Tests
```typescript
describe('Hypothesis generation properties', () => {
  it('should always generate valid coordinates', () => {
    fc.assert(fc.property(
      fc.array(locationArbitrary, { minLength: 2, maxLength: 12 }),
      (locations) => {
        const points = generateHypothesisPoints(locations, defaultConfig)
        return points.every(point => validateCoordinate(point.coordinate))
      }
    ))
  })

  it('should generate all required hypothesis point types for baseline mode', () => {
    fc.assert(fc.property(
      fc.array(locationArbitrary, { minLength: 2, maxLength: 12 }),
      (locations) => {
        const points = generateBaselineHypothesisPoints(locations)
        const types = new Set(points.map(p => p.type))

        return types.has('GEOGRAPHIC_CENTROID') &&
               types.has('MEDIAN_COORDINATE') &&
               types.has('PARTICIPANT_LOCATION')
      }
    ))
  })
})
```

### 2. Matrix Evaluation Tests

#### Unit Tests
```typescript
describe('Travel time matrix evaluation', () => {
  it('should handle valid matrix with reachable destinations', () => {
    const matrix: TravelTimeMatrix = {
      origins: mockLocations,
      destinations: mockHypothesisPoints,
      travelTimes: [
        [10, 15, 20],  // From origin 0 to destinations 0,1,2
        [12, 8, 25]    // From origin 1 to destinations 0,1,2
      ],
      travelMode: 'DRIVING_CAR'
    }

    const result = findMinimaxOptimal(matrix)

    expect(result.optimalIndex).toBe(1) // Destination 1 has max time of 15 (min of maxes)
    expect(result.maxTravelTime).toBe(15)
  })
})
```

#### Property Tests
```typescript
describe('Matrix evaluation properties', () => {
  it('should select point that minimizes maximum travel time', () => {
    fc.assert(fc.property(
      travelTimeMatrixArbitrary,
      (matrix) => {
        const result = findMinimaxOptimal(matrix)

        if (result.optimalIndex === -1) return true // No valid points

        const optimalMaxTime = Math.max(...matrix.travelTimes.map(row => row[result.optimalIndex]))

        // Verify no other point has lower maximum travel time
        for (let j = 0; j < matrix.destinations.length; j++) {
          if (j !== result.optimalIndex) {
            const maxTime = Math.max(...matrix.travelTimes.map(row => row[j]))
            expect(maxTime).toBeGreaterThanOrEqual(optimalMaxTime)
          }
        }

        return true
      }
    ))
  })
})
```

### 3. Optimization Algorithm Tests

#### Unit Tests
```typescript
describe('Multi-phase optimization', () => {
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

#### Property Tests
```typescript
describe('Optimization properties', () => {
  it('should maintain ε-optimality improvement property', () => {
    fc.assert(fc.property(
      fc.array(locationArbitrary, { minLength: 3, maxLength: 8 }),
      async (locations) => {
        const baselineResult = await calculateMinimaxCenter(locations, 'BASELINE')
        const refinedResult = await calculateMinimaxCenter(locations, 'FULL_REFINEMENT')

        // Refined result should be equal or better (allowing for small numerical differences)
        const epsilon = 0.01 // 1% tolerance
        const improvement = (baselineResult.maxTravelTime - refinedResult.maxTravelTime) / baselineResult.maxTravelTime

        return improvement >= -epsilon // Allow small degradation due to randomness
      }
    ))
  })
})
```

### 4. Caching Tests

#### Unit Tests
```typescript
describe('Cache operations', () => {
  it('should cache and retrieve matrix results', async () => {
    const cacheKey = generateMatrixCacheKey(origins, destinations, 'DRIVING_CAR')
    const matrix = mockTravelTimeMatrix

    await setMatrixCache(cacheKey, matrix)
    const cached = await getMatrixCache(cacheKey)

    expect(cached).toEqual(matrix)
  })

  it('should match locations within precision tolerance', () => {
    const coord1 = { latitude: 37.7749, longitude: -122.4194 }
    const coord2 = { latitude: 37.7750, longitude: -122.4195 } // ~15m difference

    const key1 = generateMatrixCacheKey([coord1], [coord1], 'DRIVING_CAR')
    const key2 = generateMatrixCacheKey([coord2], [coord2], 'DRIVING_CAR')

    expect(key1).toBe(key2) // Should match within 100m precision
  })
})
```

#### Property Tests
```typescript
describe('Cache properties', () => {
  it('should maintain cache consistency across coordinate rounding', () => {
    fc.assert(fc.property(
      fc.array(coordinateArbitrary, { minLength: 1, maxLength: 10 }),
      fc.array(coordinateArbitrary, { minLength: 1, maxLength: 10 }),
      (origins, destinations) => {
        // Add small random noise within precision tolerance
        const noisyOrigins = origins.map(coord => ({
          latitude: coord.latitude + (Math.random() - 0.5) * 0.0001, // ~10m
          longitude: coord.longitude + (Math.random() - 0.5) * 0.0001
        }))

        const key1 = generateMatrixCacheKey(origins, destinations, 'DRIVING_CAR')
        const key2 = generateMatrixCacheKey(noisyOrigins, destinations, 'DRIVING_CAR')

        return key1 === key2 // Should generate same cache key
      }
    ))
  })
})
```

### 5. Error Handling Tests

#### Unit Tests
```typescript
describe('Error handling', () => {
  it('should handle unreachable destinations gracefully', () => {
    const matrix: TravelTimeMatrix = {
      origins: mockLocations,
      destinations: mockHypothesisPoints,
      travelTimes: [
        [null, 15, null],  // Some unreachable destinations
        [12, null, 25]
      ],
      travelMode: 'DRIVING_CAR'
    }

    const result = findMinimaxOptimal(matrix)

    // Should select destination 1 (only reachable from both origins)
    expect(result.optimalIndex).toBe(1)
  })

  it('should return error when no valid hypothesis points exist', async () => {
    const invalidLocations = [
      { id: '1', name: 'Invalid', latitude: 91, longitude: 181 } // Invalid coordinates
    ]

    await expect(calculateMinimaxCenter(invalidLocations, 'BASELINE'))
      .rejects.toThrow('No valid hypothesis points')
  })
})
```

#### Property Tests
```typescript
describe('Error handling properties', () => {
  it('should handle invalid coordinates gracefully', () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        id: fc.string(),
        name: fc.string(),
        latitude: fc.float({ min: -180, max: 180 }), // Include invalid range
        longitude: fc.float({ min: -360, max: 360 })
      }), { minLength: 1, maxLength: 12 }),
      (locations) => {
        try {
          const validLocations = locations.filter(validateCoordinate)
          if (validLocations.length < 2) {
            return true // Expected to fail with insufficient locations
          }

          const points = generateHypothesisPoints(validLocations, defaultConfig)
          return points.every(point => validateCoordinate(point.coordinate))
        } catch (error) {
          return error.message.includes('Invalid coordinates') ||
                 error.message.includes('Insufficient locations')
        }
      }
    ))
  })
})
```

## Test Arbitraries

### Custom Arbitraries for Domain Objects

```typescript
// Generate valid coordinates
const coordinateArbitrary = fc.record({
  latitude: fc.float({ min: -90, max: 90 }),
  longitude: fc.float({ min: -180, max: 180 })
})

// Generate valid locations
const locationArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  latitude: fc.float({ min: -90, max: 90 }),
  longitude: fc.float({ min: -180, max: 180 })
})

// Generate travel time matrices
const travelTimeMatrixArbitrary = fc.record({
  origins: fc.array(locationArbitrary, { minLength: 2, maxLength: 8 }),
  destinations: fc.array(hypothesisPointArbitrary, { minLength: 5, maxLength: 50 }),
  travelTimes: fc.array(fc.array(fc.oneof(
    fc.float({ min: 1, max: 7200 }), // Valid travel times (1 second to 2 hours)
    fc.constant(null) // Unreachable destinations
  ))),
  travelMode: fc.constantFrom('DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING')
})

// Generate optimization configurations
const optimizationConfigArbitrary = fc.record({
  mode: fc.constantFrom('BASELINE', 'COARSE_GRID', 'FULL_REFINEMENT'),
  coarseGridConfig: fc.record({
    enabled: fc.boolean(),
    paddingKm: fc.float({ min: 0, max: 50 }),
    gridResolution: fc.integer({ min: 2, max: 10 })
  }),
  localRefinementConfig: fc.record({
    enabled: fc.boolean(),
    topK: fc.integer({ min: 1, max: 10 }),
    refinementRadiusKm: fc.float({ min: 0.5, max: 10 }),
    fineGridResolution: fc.integer({ min: 2, max: 5 })
  })
})
```

## Running Tests

### All Tests
```bash
# Run all tests once
yarn rw test --no-watch

# Run tests in watch mode
yarn rw test --watch
```

### Specific Test Suites
```bash
# API tests only
yarn rw test api --no-watch

# Web tests only
yarn rw test web --no-watch

# Specific test files
yarn rw test api/src/lib/geometry.test.ts --no-watch
yarn rw test api/src/lib/geometry.property.test.ts --no-watch
```

### Property-Based Tests Only
```bash
# Run only property-based tests
yarn rw test --testNamePattern="property" --no-watch

# Run property tests with verbose output
yarn rw test --testNamePattern="property" --verbose --no-watch
```

### Coverage Reports
```bash
# Generate coverage report
yarn rw test --coverage --no-watch

# View coverage in browser
open coverage/lcov-report/index.html
```

## Test Configuration

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  projects: [
    {
      displayName: 'api',
      testMatch: ['<rootDir>/api/**/*.test.{js,ts}'],
      setupFilesAfterEnv: ['<rootDir>/api/jest.setup.js']
    },
    {
      displayName: 'web',
      testMatch: ['<rootDir>/web/**/*.test.{js,ts,tsx}'],
      setupFilesAfterEnv: ['<rootDir>/web/jest.setup.js']
    }
  ],
  collectCoverageFrom: [
    'api/src/**/*.{js,ts}',
    'web/src/**/*.{js,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
}
```

### Fast-Check Configuration

```typescript
// Configure property test iterations
fc.configureGlobal({
  numRuns: 100,           // Minimum iterations per property
  maxSkipsPerRun: 100,    // Skip invalid inputs
  timeout: 5000,          // 5 second timeout per property
  verbose: false          // Set to true for debugging
})
```

## Test Data Management

### Mock Data Generation

```typescript
// Generate consistent test data
export const generateTestLocations = (count: number): Location[] => {
  const baseCoord = { latitude: 37.7749, longitude: -122.4194 } // San Francisco

  return Array.from({ length: count }, (_, i) => ({
    id: `test-location-${i}`,
    name: `Test Location ${i + 1}`,
    latitude: baseCoord.latitude + (Math.random() - 0.5) * 0.1, // ~5km spread
    longitude: baseCoord.longitude + (Math.random() - 0.5) * 0.1
  }))
}

// Generate mock travel time matrix
export const generateMockMatrix = (
  origins: Location[],
  destinations: HypothesisPoint[]
): TravelTimeMatrix => {
  const travelTimes = origins.map(origin =>
    destinations.map(dest => {
      const distance = calculateDistance(origin, dest.coordinate)
      return Math.max(1, distance * 60) // Rough time estimate
    })
  )

  return {
    origins,
    destinations,
    travelTimes,
    travelMode: 'DRIVING_CAR'
  }
}
```

### Test Scenarios

```typescript
// Predefined test scenarios for consistent testing
export const testScenarios = {
  smallGroup: {
    locations: generateTestLocations(3),
    expectedOptimizationMode: 'BASELINE'
  },
  mediumGroup: {
    locations: generateTestLocations(6),
    expectedOptimizationMode: 'COARSE_GRID'
  },
  largeGroup: {
    locations: generateTestLocations(10),
    expectedOptimizationMode: 'FULL_REFINEMENT'
  },
  clustered: {
    locations: [
      { id: '1', name: 'A', latitude: 37.7749, longitude: -122.4194 },
      { id: '2', name: 'B', latitude: 37.7750, longitude: -122.4195 },
      { id: '3', name: 'C', latitude: 37.7751, longitude: -122.4196 }
    ]
  },
  dispersed: {
    locations: [
      { id: '1', name: 'SF', latitude: 37.7749, longitude: -122.4194 },
      { id: '2', name: 'LA', latitude: 34.0522, longitude: -118.2437 },
      { id: '3', name: 'NYC', latitude: 40.7128, longitude: -74.0060 }
    ]
  }
}
```

## Debugging Tests

### Property Test Debugging

When property tests fail, fast-check provides counterexamples:

```typescript
// Enable verbose mode for debugging
fc.configureGlobal({ verbose: true })

// Add logging to understand failures
fc.assert(fc.property(
  locationArbitrary,
  (locations) => {
    console.log('Testing with locations:', locations)

    try {
      const result = generateHypothesisPoints(locations)
      console.log('Generated points:', result.length)
      return result.every(validateCoordinate)
    } catch (error) {
      console.log('Error:', error.message)
      throw error
    }
  }
))
```

### Test Isolation

```typescript
// Isolate tests with proper setup/teardown
describe('Matrix evaluation', () => {
  let mockCache: jest.MockedFunction<any>

  beforeEach(() => {
    mockCache = jest.fn()
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })
})
```

## Continuous Integration

### GitHub Actions Configuration

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'yarn'

      - run: yarn install --frozen-lockfile
      - run: yarn rw test --no-watch --coverage
      - run: yarn rw test --testNamePattern="property" --no-watch

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## Best Practices

### Writing Effective Property Tests

1. **Start Simple**: Begin with basic properties before complex ones
2. **Use Good Arbitraries**: Create domain-specific arbitraries for realistic data
3. **Handle Edge Cases**: Consider null, empty, and boundary values
4. **Test Invariants**: Focus on properties that should always hold
5. **Combine with Unit Tests**: Use both approaches for comprehensive coverage

### Test Organization

1. **Group Related Tests**: Organize by feature/component
2. **Use Descriptive Names**: Test names should explain what's being verified
3. **Keep Tests Independent**: Each test should be able to run in isolation
4. **Mock External Dependencies**: Use mocks for API calls and external services
5. **Test Error Conditions**: Verify error handling and edge cases

### Performance Testing

```typescript
// Benchmark optimization modes
describe('Performance benchmarks', () => {
  it('should complete baseline optimization within time limit', async () => {
    const start = Date.now()
    const locations = generateTestLocations(8)

    await calculateMinimaxCenter(locations, 'BASELINE')

    const duration = Date.now() - start
    expect(duration).toBeLessThan(5000) // 5 second limit
  })
})
```

This comprehensive testing strategy ensures the reliability and correctness of the multi-phase optimization algorithms while maintaining good performance and API usage efficiency.