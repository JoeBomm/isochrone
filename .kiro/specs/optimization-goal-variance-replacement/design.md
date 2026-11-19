# Design Document: Optimization Goal Variance Replacement

## Overview

This design replaces the confusingly named "Mean" optimization goal with "Minimize Variance" to improve clarity and user understanding. The current "Mean" goal actually minimizes variance in travel times (not the mean), which creates confusion. This change involves updating the GraphQL schema, TypeScript enums, UI components, and documentation while preserving all existing functionality and scoring algorithms.

## Architecture

The change affects three main layers of the application:

1. **API Layer**: GraphQL schema definitions and TypeScript types
2. **Service Layer**: Scoring algorithms and optimization logic
3. **Frontend Layer**: UI components and user-facing labels

The architecture maintains the existing three-goal structure with identical scoring behavior, only changing the naming and presentation.

## Components and Interfaces

### GraphQL Schema Changes

**File**: `api/src/graphql/isochrones.sdl.ts`

The `OptimizationGoal` enum will be updated:

```typescript
enum OptimizationGoal {
  MINIMAX # Minimize maximum travel time
  MINIMIZE_VARIANCE # Minimize variance (equalize travel times)
  MINIMIZE_TOTAL # Minimize total travel time
}
```

**Rationale**: The new names clearly describe what each goal optimizes for, eliminating confusion about what "Mean" actually does.

### TypeScript Type Definitions

**Files**:
- `api/src/lib/algorithms/scoring.ts`
- `web/src/components/OptimizationGoals/OptimizationGoals.tsx`

The `OptimizationGoal` enum will be updated in both frontend and backend:

```typescript
export enum OptimizationGoal {
  MINIMAX = 'MINIMAX',
  MINIMIZE_VARIANCE = 'MINIMIZE_VARIANCE',
  MINIMIZE_TOTAL = 'MINIMIZE_TOTAL',
}
```

### Frontend UI Component Updates

**File**: `web/src/components/OptimizationGoals/OptimizationGoals.tsx`

The optimization options configuration will be updated:

```typescript
const optimizationOptions = [
  {
    value: OptimizationGoal.MINIMAX,
    label: 'Minimax',
    description: 'Minimize the maximum travel time for any participant',
    // ... existing configuration
  },
  {
    value: OptimizationGoal.MINIMIZE_VARIANCE,
    label: 'Minimize Variance',
    description: 'Minimize variance to equalize travel times',
    detail: "Makes everyone's travel time as similar as possible - most balanced approach",
    // ... existing configuration
  },
  {
    value: OptimizationGoal.MINIMIZE_TOTAL,
    label: 'Minimize Total',
    description: 'Minimize the total sum of all travel times',
    // ... existing configuration
  },
]
```

### Scoring Service Updates

**File**: `api/src/lib/algorithms/scoring.ts`

The scoring logic will be updated to handle the new enum value:

```typescript
calculateScore(metrics: TravelTimeMetrics, goal: OptimizationGoal): number {
  switch (goal) {
    case OptimizationGoal.MINIMAX:
      return metrics.maxTravelTime

    case OptimizationGoal.MINIMIZE_VARIANCE:
      if (typeof metrics.variance !== 'number' || !Number.isFinite(metrics.variance)) {
        throw new Error('Variance not calculated for MINIMIZE_VARIANCE goal')
      }
      return metrics.variance

    case OptimizationGoal.MINIMIZE_TOTAL:
      return metrics.totalTravelTime

    default:
      throw new Error(`Unsupported optimization goal: ${goal}`)
  }
}
```

### Service Layer Updates

**File**: `api/src/services/isochrones.ts`

The main service will be updated to handle the new goal names:

```typescript
// Update validation
if (!['MINIMAX', 'MINIMIZE_VARIANCE', 'MINIMIZE_TOTAL'].includes(optimizationGoal)) {
  throw new Error(
    `Invalid optimization goal: ${optimizationGoal}. Must be MINIMAX, MINIMIZE_VARIANCE, or MINIMIZE_TOTAL.`
  )
}

// Update scoring logic
switch (optimizationGoal) {
  case 'MINIMAX':
    score = maxTravelTime
    break
  case 'MINIMIZE_VARIANCE':
    score = variance
    break
  case 'MINIMIZE_TOTAL':
    score = totalTravelTime
    break
}
```

## Data Models

No changes to data models are required. The existing `TravelTimeMetrics` interface remains unchanged:

```typescript
interface TravelTimeMetrics {
  maxTravelTime: number      // For MINIMAX goal
  averageTravelTime: number  // For reference
  totalTravelTime: number    // For MINIMIZE_TOTAL goal
  variance?: number          // For MINIMIZE_VARIANCE goal
}
```

The variance calculation algorithm and data structures remain identical to preserve existing functionality.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Converting EARS to Properties

Based on the prework analysis, I'll convert the testable acceptance criteria into correctness properties:

**Property 1: Variance scoring consistency**
*For any* set of travel time data, scoring with MINIMIZE_VARIANCE should produce the same results as the variance calculation formula
**Validates: Requirements 1.2, 1.4, 5.1**

**Property 2: Ranking preservation**
*For any* set of hypothesis points with travel time data, ranking points using MINIMIZE_VARIANCE should produce identical rankings to the previous MEAN goal implementation
**Validates: Requirements 5.2**

**Property 3: MINIMAX algorithm preservation**
*For any* set of hypothesis points, scoring with MINIMAX should continue to minimize the maximum travel time among all participants
**Validates: Requirements 3.2**

**Property 4: MINIMIZE_TOTAL algorithm preservation**
*For any* set of hypothesis points, scoring with MINIMIZE_TOTAL should continue to minimize the sum of all travel times
**Validates: Requirements 3.4**

**Property 5: Variance calculation preservation**
*For any* travel time metrics request, when variance is requested, the system should calculate variance using the same formula as before
**Validates: Requirements 5.3**

**Property 6: Scoring algorithm behavior preservation**
*For any* optimization goal and travel time data, the scoring behavior should remain identical to the previous implementation
**Validates: Requirements 3.5**

## Error Handling

Error handling remains unchanged from the existing implementation:

1. **Invalid Optimization Goal**: The system validates that only valid enum values are accepted
2. **Missing Variance Data**: When MINIMIZE_VARIANCE is selected, the system ensures variance is calculated
3. **Invalid Travel Time Data**: The scoring service validates travel time data before processing

Error messages will be updated to reference the new goal names:

```typescript
// Before
throw new Error(`Invalid optimization goal: ${goal}. Must be MINIMAX, MEAN, or MIN.`)

// After
throw new Error(`Invalid optimization goal: ${goal}. Must be MINIMAX, MINIMIZE_VARIANCE, or MINIMIZE_TOTAL.`)
```

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests to ensure correctness:

**Unit Tests**:
- Verify GraphQL schema contains correct enum values
- Verify UI components display correct labels
- Verify default configurations use correct values
- Verify error messages reference correct goal names

**Property-Based Tests**:
- Verify scoring consistency across goal renaming
- Verify ranking preservation for variance-based optimization
- Verify algorithm behavior preservation for all goals
- Verify variance calculation consistency

### Property-Based Testing Configuration

Property tests will use **fast-check** library with minimum 100 iterations per test. Each property test will be tagged with:

**Feature: optimization-goal-variance-replacement, Property {number}: {property_text}**

### Test Implementation Strategy

1. **Regression Testing**: Compare outputs before and after the change to ensure identical behavior
2. **Schema Validation**: Parse GraphQL schema to verify enum values
3. **UI Testing**: Render components to verify correct labels and defaults
4. **Integration Testing**: Test end-to-end optimization flows with new goal names

The testing strategy ensures that while names change, all mathematical algorithms and user experiences remain identical.
