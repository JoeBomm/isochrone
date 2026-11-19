# Implementation Plan: Algorithm Robustness Fix

## Overview

Fix the critical bug where specific locations cause internal errors during optimal location calculation by implementing minimal validation and fallback mechanisms directly in the existing scoring function. This approach touches only 1 file (`api/src/services/isochrones.ts`), adds no new dependencies, and focuses purely on preventing the specific crash.

## Tasks

- [x] 1. Add numeric validation helpers
  - Add `assertFinite()` function to validate numeric values with clear error context
  - Function should check for finite values and non-negative numbers
  - Include context parameter for clear error messages
  - _Requirements: 1.1, 1.2_

- [x] 2. Add travel time sanitization
  - Create `sanitizeTravelTimes()` function to filter invalid travel time values
  - Filter out NaN, Infinity, negative values, and unreasonably large values (>24 hours)
  - Return only valid finite travel times for scoring calculations
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. Add safe mathematical operations
  - Create `safeDivide()` function to handle division with fallback values
  - Create `safeAverage()` function to handle averaging with empty array protection
  - Guard against zero denominators and invalid inputs
  - Return appropriate fallback values when operations would produce invalid results
  - _Requirements: 3.1, 3.2_

- [x] 4. Add fallback scoring logic
  - Create `getFallbackScore()` function for each optimization goal
  - Handle cases where no valid travel times remain for a point
  - Use penalty scores (999999) for completely unreachable points
  - Provide goal-specific fallback logic (max for MINIMAX, 0 for MEAN, sum for MIN)
  - _Requirements: 3.3, 3.4_

- [x] 5. Update scoring function with validation
  - Integrate all validation helpers into `scoreHypothesisPointsSimplified`
  - Apply travel time sanitization before metric calculations
  - Use safe mathematical operations for all calculations
  - Implement fallback scoring when primary calculations fail
  - Ensure all returned values are validated before GraphQL serialization
  - _Requirements: 1.1, 2.1, 3.1, 3.3, 4.1, 4.2, 4.4_

## Notes

- Implementation touches only `api/src/services/isochrones.ts` (single file change)
- No new services, abstractions, or architectural changes
- No new dependencies or external libraries
- Focus is purely on preventing the specific crash
- Validation is minimal but sufficient to handle edge cases
- Fallback mechanisms ensure graceful degradation
- Follows "prefer simple, explicit code over abstraction" principle
