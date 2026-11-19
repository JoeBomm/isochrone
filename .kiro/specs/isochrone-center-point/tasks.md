# Implementation Plan: Optimal Facility Location

## Overview

Implement an optimal facility location algorithm that finds the best meeting points for multiple starting locations. This implementation uses a simplified two-phase approach with cost-controlled API usage, modern Material-UI design, and debug visualization capabilities.

## Tasks

- [x] 1. Create modular algorithm architecture
  - [x] 1.1 Implement anchor point generation module
    - Create `AnchorGenerator` class with logic for geographic centroid, median coordinates, participant locations, and pairwise midpoints
    - Make anchor points visually identifiable on the map
    - Ensure anchor points are always included in calculations
    - _Requirements: 1.1, 3.1_

  - [x] 1.2 Write unit test for anchor point generation
    - Test that all required anchor types are generated for any location set
    - Test coordinate validation and edge cases
    - _Requirements: 8.1_

  - [x] 1.3 Implement bounding box grid generation module
    - Create `GridGenerator` class for bounding box calculation and grid subdivision
    - Generate configurable grid (default 5x5) with cell centers as hypothesis points
    - Use grid cell centers as hypothesis points
    - _Requirements: 1.1, 3.2_

  - [x] 1.4 Write unit test for grid generation
    - Test bounding box calculation contains all input locations
    - Test grid generation produces expected number of points
    - _Requirements: 8.1_

- [x] 2. Implement proximity deduplication service
  - [x] 2.1 Create deduplication algorithm
    - Implement configurable distance threshold for point merging (default 5km)
    - Replace nearby points with their average coordinates
    - Recalculate rankings deterministically after deduplication
    - Apply deduplication iteratively until no points are within threshold
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 2.2 Write unit test for deduplication logic
    - Test proximity detection and point merging
    - Test ranking recalculation after deduplication
    - Test edge case when fewer than M points remain
    - _Requirements: 8.2_

- [x] 3. Create modular scoring service
  - [x] 3.1 Implement optimization goal algorithms
    - Create `ScoringService` with Minimax (minimize maximum travel time), Mean (minimize variance), and Min (minimize total travel time) algorithms
    - Calculate travel time metrics for each optimization goal
    - Make scoring functions easily swappable through configuration
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 3.2 Write unit test for scoring algorithms
    - Test each optimization goal produces different rankings
    - Test travel time metrics calculation
    - _Requirements: 8.3_

- [x] 4. Update Matrix API integration for two-phase algorithm
  - [x] 4.1 Implement single matrix evaluation
    - Evaluate all hypothesis points (anchors + grid) using single Matrix API call
    - Track API call count for cost monitoring
    - Handle Matrix API errors with retry logic
    - _Requirements: 1.2, 1.4_

  - [x] 4.2 Write unit test for matrix evaluation
    - Test API call count is exactly one for hypothesis evaluation
    - Test matrix result structure and validation
    - _Requirements: 8.1_

- [x] 5. Implement cost-controlled isochrone service
  - [x] 5.1 Remove automatic isochrone generation
    - Ensure NO automatic Isochrone API calls during hypothesis generation
    - Display top M optimal points immediately without isochrones
    - Make optimal points clickable for on-demand isochrone requests
    - _Requirements: 4.1, 4.3_

  - [x] 5.2 Implement on-demand isochrone calculation
    - Generate isochrones only when user clicks specific optimal points
    - Cache isochrone responses to avoid repeated API calls
    - Display isochrones on map when calculated, hide previous ones
    - _Requirements: 4.2, 4.5_

  - [ ]* 5.3 Write unit test for cost control
    - Test that no automatic isochrone API calls are made
    - Test caching prevents repeated API calls for same point
    - _Requirements: 8.1_

- [x] 6. Create location input interface
  - [x] 6.1 Implement individual location input
    - Create standard location input interface for one-at-a-time entry
    - Support address geocoding via OpenRouteService
    - Support direct coordinate input
    - Validate all location inputs before processing
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

  - [x] 6.2 Implement bulk location import
    - Create bulk input interface accepting addresses or coordinates separated by newlines
    - Parse and validate bulk input format
    - Integrate with geocoding service for address conversion
    - Provide clear feedback for invalid entries
    - _Requirements: 2.2, 2.3_

- [x] 7. Create debug visualization controls
  - [x] 7.1 Implement debug visualization mode
    - Add UI controls to visually toggle anchor point display (anchors remain in calculations)
    - Add UI controls to visually toggle bounding box grid display (grid points remain in calculations)
    - Show color-coded hypothesis points: anchors (one color), grid points (different color), optimal points (distinct highlight)
    - Ensure optimal points are always visible above debug points (higher z-index)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 7.2 Ensure algorithm independence
    - Verify debug options only affect visualization, not core algorithm
    - Test that toggling debug mode doesn't change algorithm results
    - _Requirements: 3.5_

- [x] 8. Update GraphQL schema for optimal facility location
  - [x] 8.1 Add optimal location types and enums
    - Add `OptimalPoint` with coordinate, travel time metrics, and rank fields
    - Add `DebugPoint` with coordinate and type fields
    - Add `OptimizationGoal` enum (MINIMAX, MEAN, MIN)
    - Add `OptimalLocationResult` with optimal points and debug points
    - _Requirements: 1.1, 7.1, 7.2, 7.3_

  - [x] 8.2 Update mutation for algorithm configuration
    - Update `findOptimalLocations` mutation with optimization goal selection
    - Add parameters for topM, gridSize, deduplicationThreshold
    - Remove local refinement parameters
    - _Requirements: 7.4, 6.3_

- [x] 9. Create modern UI components with Material-UI
  - [x] 9.1 Create LocationInput component
    - Implement individual location entry with Material-UI components
    - Implement bulk location import with textarea and parsing
    - Add clear validation feedback and error handling
    - Ensure responsive design for desktop and mobile
    - _Requirements: 2.1, 2.2, 5.2, 5.3_

  - [x] 9.2 Create OptimizationGoals component
    - Implement radio buttons or select for Minimax, Mean, Min goals
    - Show clear descriptions of each optimization goal
    - Indicate which goal is currently active
    - Connect to algorithm recalculation
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 9.3 Create DebugControls component
    - Implement toggles for anchor and grid point visualization
    - Use Material-UI switches with clear labels
    - Ensure controls are easily accessible but not cluttered
    - _Requirements: 3.1, 3.2_

  - [x] 9.4 Update Map component for optimal points display
    - Display optimal points with clear ranking and travel time metrics
    - Handle click events for on-demand isochrone generation
    - Support debug mode visualization with proper z-index layering
    - Ensure proper color contrast and accessibility
    - _Requirements: 4.3, 4.4, 5.4, 5.1_

- [x] 10. Checkpoint - Core two-phase functionality complete
  - Ensure anchor and grid generation modules work correctly
  - Verify cost control prevents automatic isochrone API calls
  - Test that exactly one Matrix API call is made for hypothesis evaluation
  - Ask user if questions arise about core implementation

- [x] 11. Implement optimization goal selection
  - [x] 11.1 Add optimization goal UI integration
    - Connect OptimizationGoals component to algorithm service
    - Recalculate rankings when optimization goal changes
    - Update optimal points display with new rankings
    - Provide clear feedback during recalculation
    - _Requirements: 7.4, 7.5_

- [x] 12. Update error handling for simplified algorithm
  - [x] 12.1 Handle algorithm failures
    - Graceful fallback when anchor or grid generation fails
    - Handle Matrix API errors with user-friendly messaging
    - Handle deduplication edge cases (fewer than M points)
    - Validate location inputs and algorithm parameters
    - _Requirements: 6.5_

  - [x] 12.2 Handle UI and API errors
    - User-friendly messaging for isochrone API rate limits
    - Clear indication when Matrix API usage is high
    - Graceful handling of cache failures
    - Proper timeout handling for API calls
    - _Requirements: 4.5_

- [ ] 13. Mark non-essential existing tests as skipped
  - [ ] 13.1 Review and skip integration tests
    - Mark end-to-end tests as skipped rather than removing
    - Mark performance validation tests as skipped
    - Mark comprehensive test suites as skipped
    - Focus only on core business logic tests
    - _Requirements: 8.4, 8.5_

- [ ] 14. Final checkpoint - Optimal facility location implementation complete
  - Ensure core business logic unit tests pass
  - Verify debug visualization works correctly
  - Confirm cost control prevents unnecessary API calls
  - Test optimal points display and on-demand isochrones
  - Verify Material-UI components are accessible and responsive
  - Ask user if questions arise about implementation

## Notes

- Tasks marked with `*` are optional unit tests focusing on core business logic only
- This implementation uses a simplified two-phase algorithm (hypothesis generation → evaluation/selection)
- Algorithm components are designed to be modular and swappable for future changes
- Cost control is critical - isochrones only calculated on explicit user request
- Material-UI provides modern, accessible design components
- Debug visualization provides algorithm transparency without affecting end users
- Integration and end-to-end tests are explicitly skipped to minimize testing overhead
