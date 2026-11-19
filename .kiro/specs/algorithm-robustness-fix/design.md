# Design Document: Algorithm Robustness Fix

## Overview

This design addresses a critical bug in the optimal location calculation algorithm where specific locations cause internal errors during calculation, particularly when using certain optimization goals (average or minimize total). The root cause is insufficient numeric validation in the scoring calculation pipeline, where edge case coordinates can produce invalid mathematical results (NaN, Infinity) that cause crashes.

The solution implements minimal validation and fallback mechanisms directly in the existing scoring function without architectural changes or new services.

## Root Cause Analysis

Based on the error logs and code analysis, the issue occurs in the `scoreHypothesisPointsSimplified` function where:

1. **Invalid Travel Time Data**: The Matrix API may return invalid travel times (NaN, Infinity) for certain location combinations
2. **Mathematical Edge Cases**: Variance calculations and division operations can produce invalid results with edge case data
3. **Insufficient Validation**: Current validation doesn't catch all edge cases before they cause downstream failures
4. **Error Propagation**: Invalid values propagate through the calculation pipeline and cause GraphQL serialization errors

The specific location "29111 Timber Woods Dr, Chesterfield" likely has geographic properties that trigger these edge cases.

## Minimal Solution Approach

### File to Modify (Single File Change)
1. **`api/src/services/isochrones.ts`** - Add validation helpers and update scoring function

### Core Changes

#### 1. Add assertFinite() Helper
```typescript
// Add to isochrones.ts
const assertFinite = (value: number, context: string): number => {
  if (!Number.isFinite(value) || value < 0) {
    logger.warn(`Invalid numeric value in ${context}: ${value}`)
    throw new Error(`Invalid numeric value in ${context}`)
  }
  return value
}
```

#### 2. Sanitize Matrix Before Scoring
```typescript
// Update scoreHypothesisPointsSimplified function
const sanitizeTravelTimes = (travelTimes: number[]): number[] => {
  return travelTimes.filter(time =>
    Number.isFinite(time) && time >= 0 && time < 86400 // 24 hours max
  )
}
```

#### 3. Guard All Divisions and Averages
```typescript
// Safe division helper
const safeDivide = (numerator: number, denominator: number, fallback: number = 0): number => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback
  }
  const result = numerator / denominator
  return Number.isFinite(result) ? result : fallback
}

// Safe average calculation
const safeAverage = (values: number[]): number => {
  if (values.length === 0) return 0
  const sum = values.reduce((acc, val) => acc + val, 0)
  return safeDivide(sum, values.length, 0)
}
```

#### 4. Return Fallback Score if Invalid
```typescript
// Fallback scoring logic
const getFallbackScore = (goal: OptimizationGoal, validTravelTimes: number[]): number => {
  if (validTravelTimes.length === 0) {
    return 999999 // High penalty score for unreachable points
  }

  switch (goal) {
    case 'MINIMAX':
      return Math.max(...validTravelTimes)
    case 'MEAN':
      return 0 // No variance if we can't calculate it properly
    case 'MIN':
      return validTravelTimes.reduce((sum, time) => sum + time, 0)
    default:
      return 999999
  }
}
```

## Implementation Strategy

### Phase 1: Add Validation Helpers
- Add `assertFinite()` helper function
- Add `sanitizeTravelTimes()` function
- Add `safeDivide()` and `safeAverage()` helpers
- Add `getFallbackScore()` function

### Phase 2: Update Scoring Function
- Sanitize travel times before processing
- Guard all mathematical operations
- Use fallback scoring when calculations fail
- Validate all results before returning

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Numeric Value Validation
*For any* numeric value used in scoring calculations, the system should validate that it is finite and handle invalid values gracefully.
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Matrix Data Sanitization
*For any* travel time matrix data, the system should filter out invalid values before performing scoring calculations.
**Validates: Requirements 2.1, 2.2, 2.3**

### Property 3: Robust Mathematical Operations
*For any* division or averaging operation, the system should guard against invalid inputs and use fallback values when necessary.
**Validates: Requirements 3.1, 3.2, 3.4**

### Property 4: Specific Location Robustness
*For any* calculation including the problematic location "29111 Timber Woods Dr, Chesterfield", the system should complete successfully with all optimization goals.
**Validates: Requirements 4.1, 4.2, 4.3**

## Error Handling

### Validation Error Handling
- Use `assertFinite()` to validate numeric values with clear error context
- Filter invalid travel times before processing
- Use fallback scores when calculations produce invalid results
- Log warnings for filtered values without crashing

### Mathematical Edge Cases
- Guard division operations against zero denominators
- Handle empty arrays in averaging operations
- Validate variance calculations for single-value arrays
- Use appropriate fallback values for each optimization goal

### Graceful Degradation
- Continue processing other points when some have invalid data
- Return partial results when possible
- Use penalty scores for unreachable points
- Maintain algorithm flow even with problematic inputs

## Testing Strategy

### Manual Validation
- **Specific bug reproduction**: Manually verify "29111 Timber Woods Dr, Chesterfield" works
- **Optimization goal coverage**: Test all goals with problematic location manually
- **Edge case validation**: Verify mathematical edge cases are handled
- **Integration validation**: Test end-to-end flow with problematic inputs

### Code Review Focus
- **Validation helpers**: Review `assertFinite()` implementation
- **Sanitization functions**: Review travel time filtering logic
- **Mathematical guards**: Review safe division and averaging
- **Fallback logic**: Review fallback score generation
