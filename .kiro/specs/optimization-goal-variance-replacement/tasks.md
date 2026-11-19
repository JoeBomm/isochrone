# Implementation Plan: Optimization Goal Variance Replacement

## Overview

This implementation plan converts the confusing "Mean" optimization goal to the clearer "Minimize Variance" name. The plan ensures all changes maintain identical scoring behavior while updating names across the GraphQL schema, TypeScript enums, UI components, and existing tests.

## Tasks

- [x] 1. Update GraphQL schema and regenerate types
  - Update OptimizationGoal enum in `api/src/graphql/isochrones.sdl.ts`
  - Change "MEAN" to "MINIMIZE_VARIANCE" and "MIN" to "MINIMIZE_TOTAL"
  - Update schema comments to reflect new goal names
  - Regenerate GraphQL types with `yarn rw generate types`
  - _Requirements: 1.1, 2.2, 3.1_

- [x] 2. Update backend scoring service enum and logic
  - Update OptimizationGoal enum in `api/src/lib/algorithms/scoring.ts`
  - Change MEAN to MINIMIZE_VARIANCE and MIN to MINIMIZE_TOTAL
  - Update calculateScore method switch statements
  - Update error messages to reference new goal names
  - _Requirements: 1.2, 1.4, 2.1, 2.3_

- [x] 3. Update main isochrones service
  - Update validation logic in `api/src/services/isochrones.ts`
  - Update all switch statements that handle optimization goals
  - Update fallback score generation logic and comments
  - Update error messages with new goal names
  - _Requirements: 1.2, 3.1, 3.2, 3.3, 3.4_

- [x] 4. Update frontend optimization goals component
  - Update OptimizationGoal enum in `web/src/components/OptimizationGoals/OptimizationGoals.tsx`
  - Change MEAN to MINIMIZE_VARIANCE and MIN to MINIMIZE_TOTAL
  - Update optimization options labels: "Mean (Equalize)" to "Minimize Variance"
  - Update descriptions and detail text as needed
  - _Requirements: 1.3, 2.3_

- [x] 5. Update frontend constants and GraphQL queries
  - Verify DEFAULT_OPTIMIZATION_GOAL uses MINIMAX in `web/src/lib/constants.ts`
  - Verify GraphQL mutation defaults use MINIMAX in `web/src/lib/graphql.ts`
  - _Requirements: 4.1, 4.2, 4.4_

- [x] 6. Update existing tests to use new enum values
  - Update scoring service tests in `api/src/lib/algorithms/scoring.test.ts`
  - Update isochrones service tests in `api/src/services/isochrones.debug.test.ts`
  - Update OptimizationGoals component tests in `web/src/components/OptimizationGoals/OptimizationGoals.test.tsx`
  - Replace all MEAN/MIN references with MINIMIZE_VARIANCE/MINIMIZE_TOTAL
  - _Requirements: 2.4_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- The checkpoint ensures incremental validation
- All mathematical algorithms remain identical - only names change
- Tasks are designed to maintain green build state throughout implementation
