# Implementation Plan: UI Simplification and Enhancement

## Overview

This implementation plan simplifies the user interface by removing optimization mode complexity, standardizing the algorithm, improving UI consistency with MaterialUI components, updating terminology, and enhancing isochrone display behavior. The approach focuses on frontend changes while maintaining existing backend performance and functionality.

## Tasks

- [x] 1. Remove optimization mode controls and simplify IsochroneControls component
  - Remove optimization mode selection UI (BASELINE, COARSE_GRID, FULL_REFINEMENT options)
  - Remove advanced configuration panels and related state management
  - Update button text from "Generate Hypothesis Points" to "Calculate Optimal Meeting Points"
  - _Requirements: 1.1, 1.3, 4.1_

- [x] 2. Clean up backend optimization code and tests
  - Remove `calculateMultiPhaseMinimaxCenter` function and multi-phase logic
  - Remove `OptimizationConfig`, `OptimizationMode` types and validation functions
  - Remove `generateMultiPhaseHypothesisPoints` and phase-specific generation functions
  - Remove tests related to multi-phase optimization and optimization modes
  - Clean up unused imports and algorithm phase constants
  - _Requirements: 1.2, 1.4, 1.5_

- [x] 3. Update terminology and add helpful tooltips
  - Change "Slack Time" label to "Travel time range"
  - Add tooltip: "Used to calculate the isochrone, this area you can reach in minutes from the ideal meeting point selected using the input travel mode"
  - Add tooltip for meeting point count: "Number of optimal meeting points to calculate and display (1-10)"
  - _Requirements: 2.1, 2.2, 2.5, 3.1_

- [x] 4. Integrate MaterialUI components for consistent design
  - Replace custom form controls with MaterialUI TextField, Button, Select, and Tooltip components
  - Update travel mode selection to use MaterialUI Select with MenuItem options
  - Ensure proper styling and accessibility compliance
  - _Requirements: 1.5, 6.1, 6.2, 6.5_

- [x] 5. Implement single isochrone display logic
  - Update map component to show only one isochrone at a time
  - Hide previous isochrone when new one is requested
  - Add visual indication of which meeting point has active isochrone
  - Maintain isochrone caching for performance
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 6. Simplify HomePage state management
  - Remove optimizationConfig state and related handlers
  - Remove showAdvancedConfig and optimization mode complexity
  - Add logic for automatic point updates when optimization goal changes (without API calls)
  - Ensure existing validation and session persistence continues to work
  - _Requirements: 1.2, 1.4, 4.3, 6.3, 6.4_

- [x] 7. Add MaterialUI dependency and setup
  - Install @mui/material and required peer dependencies
  - Configure MaterialUI theme if needed
  - Update imports in affected components
  - _Requirements: 1.5, 6.1_

- [x] 8. Checkpoint - Verify simplification and functionality
  - Ensure optimization modes are completely removed from both frontend and backend
  - Verify MaterialUI components render correctly with proper styling
  - Test that simplified algorithm behavior remains consistent
  - Confirm tooltips display with correct content
  - Verify single isochrone display works correctly
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks include both frontend and backend cleanup to remove optimization mode complexity
- The simplified algorithm in `findOptimalLocations` will be the only remaining approach
- MaterialUI integration maintains existing functionality while improving consistency
- Each task references specific requirements for traceability
- Isochrone caching and API efficiency are preserved throughout changes
