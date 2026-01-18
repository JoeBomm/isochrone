# Implementation Plan: Isochrone Center Point

## Overview

Transform the existing isochrone application to use a matrix-based minimax travel-time approach for finding optimal meeting points. The implementation replaces the previous isochrone-union algorithm with strategic hypothesis point generation and OpenRouteService Matrix API evaluation to minimize maximum travel time for all participants.

## Tasks

- [ ] 1. Update backend services for matrix-based algorithm
  - [x] 1.1 Update GraphQL schema for minimax center calculation
    - Modify SDL files to replace `calculateIsochronicCenter` with `calculateMinimaxCenter`
    - Remove `travelTimeMinutes` parameter (not needed for hypothesis generation)
    - Add new types for `HypothesisPoint` and `TravelTimeMatrix`
    - _Requirements: 1.3, 1.4_

  - [ ]* 1.2 Write property test for GraphQL schema validation
    - **Property 10: Input Validation Boundaries**
    - **Validates: Requirements 5.3**

  - [x] 1.3 Implement Matrix API client integration
    - Extend OpenRouteService client with Matrix API support
    - Add travel time matrix calculation methods
    - Implement proper error handling for matrix API responses
    - _Requirements: 2.1, 2.4, 2.5, 4.2_

  - [ ]* 1.4 Write property test for Matrix API integration
    - **Property 5: Travel Time Matrix Evaluation**
    - **Validates: Requirements 4.2**

- [x] 2. Implement hypothesis point generation service
  - [x] 2.1 Create geometry service for hypothesis generation
    - Implement geographic centroid calculation
    - Add median coordinate calculation
    - Create pairwise midpoint generation
    - Add coordinate validation methods
    - _Requirements: 4.1_

  - [ ]* 2.2 Write property test for hypothesis point generation
    - **Property 4: Hypothesis Point Generation**
    - **Validates: Requirements 4.1**

  - [x] 2.3 Implement hypothesis point service
    - Create `generateHypothesisPoints` method with all required types
    - Add metadata tracking for hypothesis point origins
    - Implement coordinate validation and filtering
    - _Requirements: 4.1_

- [x] 3. Implement minimax optimization service
  - [x] 3.1 Create matrix service for optimization
    - Implement `findMinimaxOptimal` method for travel time matrix analysis
    - Add tie-breaking rules implementation
    - Create optimal point selection logic
    - _Requirements: 4.3, 4.4, 4.5_

  - [ ]* 3.2 Write property test for minimax optimization
    - **Property 6: Minimax Optimization**
    - **Validates: Requirements 4.3, 4.5**

  - [ ]* 3.3 Write property test for tie-breaking rules
    - **Property 7: Tie-Breaking Rules**
    - **Validates: Requirements 4.4**

  - [x] 3.4 Integrate minimax calculation pipeline
    - Create main `calculateMinimaxCenter` method
    - Orchestrate hypothesis generation, matrix evaluation, and optimization
    - Add invalid route filtering and error handling
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 4. Update caching service for matrix data
  - [x] 4.1 Extend cache service with matrix support
    - Add `MatrixCacheKey` generation with coordinate rounding
    - Implement matrix cache storage and retrieval
    - Update cache statistics to include matrix hits/misses
    - _Requirements: 8.1, 8.2, 8.4, 8.5_

  - [ ]* 4.2 Write property test for matrix caching
    - **Property 12: Matrix Response Caching**
    - **Validates: Requirements 8.1, 8.2**

  - [x] 4.3 Integrate matrix caching with OpenRouteService client
    - Add cache lookup before Matrix API calls
    - Implement 100-meter precision matching for matrix requests
    - Add graceful fallback when cache is unavailable
    - _Requirements: 8.1, 8.2_

- [x] 5. Update isochrone service for visualization only
  - [x] 5.1 Modify isochrone service for visualization
    - Update service to generate isochrones only from optimal meeting points
    - Remove individual location isochrone calculation
    - Keep buffer time parameter for visualization purposes only
    - _Requirements: 5.1, 5.2_

  - [ ]* 5.2 Write property test for visualization isochrone generation
    - **Property 8: Visualization Isochrone Generation**
    - **Validates: Requirements 5.1**

- [x] 6. Checkpoint - Ensure backend services are working
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Update GraphQL resolvers for new algorithm
  - [x] 7.1 Replace isochrone resolvers with minimax resolvers
    - Update `calculateIsochronicCenter` to `calculateMinimaxCenter`
    - Modify resolver to use new minimax calculation pipeline
    - Update error handling for matrix calculation failures
    - _Requirements: 1.4, 4.1, 4.2, 4.3, 5.1_

  - [ ]* 7.2 Write property test for resolver integration
    - **Property 13: Minimax Fairness Property**
    - **Validates: Requirements 4.3, 4.5**

- [x] 8. Update frontend components for new algorithm
  - [x] 8.1 Update IsochroneControls component
    - Remove travel time input (not needed for hypothesis generation)
    - Rename buffer time to "Slack Time" or "Flexible Time" for clarity
    - Update UI labels and descriptions to reflect minimax algorithm
    - Update help text to explain slack time is visualization radius only
    - _Requirements: 5.3, 7.4_

  - [x] 8.2 Update GraphQL queries and mutations
    - Replace `calculateIsochronicCenter` calls with `calculateMinimaxCenter`
    - Remove `travelTimeMinutes` parameter from frontend calls
    - Update TypeScript types for new response structure
    - _Requirements: 4.1, 5.1, 7.5_

  - [ ]* 8.3 Write property test for frontend integration
    - **Property 9: UI Display Consistency**
    - **Validates: Requirements 4.4, 5.2, 6.2, 6.3**

- [x] 9. Update map visualization for minimax results
  - [x] 9.1 Update Map component for minimax display
    - Modify center point display to show minimax optimal point
    - Update popup content to show minimax travel time information
    - Remove individual isochrone display (keep only fair meeting area)
    - _Requirements: 4.4, 5.2, 5.5, 6.2, 6.3, 6.4_

  - [ ]* 9.2 Write property test for map interaction
    - **Property 11: Interactive Behavior**
    - **Validates: Requirements 5.5, 6.4**

- [x] 10. Update error handling for matrix algorithm
  - [x] 10.1 Implement matrix-specific error handling
    - Add error handling for unreachable hypothesis points
    - Implement fallback to geographic centroid when all hypothesis points fail
    - Add user-friendly error messages for matrix calculation failures
    - _Requirements: 4.5, 9.1, 9.2, 9.4, 9.5_

  - [ ]* 10.2 Write property test for error handling robustness
    - **Property 1: API Key Validation**
    - **Property 2: Coordinate Validation and Geocoding**
    - **Validates: Requirements 2.5, 3.1, 3.2, 8.3, 9.1, 9.2, 9.3, 9.4, 9.5**

- [x] 11. Integration testing and validation
  - [x] 11.1 Create integration tests for minimax workflow
    - Test complete user journey from location input to minimax result
    - Validate hypothesis point generation with various location combinations
    - Test matrix evaluation and optimal point selection
    - _Requirements: All requirements integration_

  - [ ]* 11.2 Write property test for location state management
    - **Property 3: Location State Management**
    - **Validates: Requirements 3.3, 3.4**

- [x] 12. Final checkpoint - Ensure all functionality works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation of core functionality
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- The implementation prioritizes the minimax travel-time algorithm as the core innovation

---

# Phase 2: Multi-Phase Optimization Implementation

## Overview
Extend the existing minimax algorithm with coarse grid and local refinement phases to improve solution quality while maintaining API efficiency.

## Implementation Tasks

- [x] 13. Extend hypothesis generation service for multi-phase support
  - [x] 13.1 Create coarse grid hypothesis generator
    - Implement bounding box calculation with configurable padding
    - Generate uniform grid points over padded bounding box
    - Support configurable grid resolution (default: 5×5)
    - Use geographic center of each grid cell as hypothesis point
    - _Requirements: 4.1.2_

  - [x] 13.2 Create local refinement hypothesis generator
    - Implement top-K candidate selection based on maximum travel time
    - Generate local bounding boxes around selected candidates
    - Support configurable refinement radius (default: 2km)
    - Generate fine grids within local bounding boxes
    - Support configurable fine grid resolution (default: 3×3)
    - _Requirements: 4.1.3_

  - [x] 13.3 Update hypothesis generation orchestration
    - Implement phase-based hypothesis generation pipeline
    - Support enabling/disabling individual phases
    - Maintain backward compatibility with existing Phase 0 implementation
    - Add comprehensive unit tests for all hypothesis generators
    - _Requirements: 4.1.1, 4.1.2, 4.1.3_

- [x] 14. Update matrix service for multi-phase evaluation
  - [x] 14.1 Implement batched matrix evaluation
    - Support Phase 0+1 combined matrix evaluation in single API call
    - Implement Phase 2 separate matrix evaluation for refinement points
    - Maintain existing matrix validation and error handling
    - Add matrix result merging across phases
    - _Requirements: 4.2.1, 4.2.2_

  - [x] 14.2 Update minimax optimization for multi-phase results
    - Extend minimax selection to work across all phases
    - Maintain existing tie-breaking rules and deterministic selection
    - Implement ε-optimality improvement validation
    - Add comprehensive tests for multi-phase optimization
    - _Requirements: 4.3_

- [x] 15. Add optimization configuration support
  - [x] 15.1 Create optimization configuration types
    - Define OptimizationMode enum (BASELINE, COARSE_GRID, FULL_REFINEMENT)
    - Create configuration interfaces for grid parameters
    - Add validation for configuration parameters
    - Support reasonable defaults for all parameters
    - _Requirements: 5.1, 5.2_

  - [x] 15.2 Update GraphQL schema for optimization modes
    - Add OptimizationMode to GraphQL enums
    - Add optimization configuration input types
    - Update calculateMinimaxCenter mutation to accept optimization config
    - Maintain backward compatibility with existing API
    - _Requirements: 5.1_

- [x] 16. Update isochrones service for multi-phase integration
  - [x] 16.1 Integrate multi-phase hypothesis generation
    - Update service to use new hypothesis generation pipeline
    - Implement optimization mode selection logic
    - Add configuration parameter handling
    - Maintain existing error handling and fallback mechanisms
    - _Requirements: 4.1.1, 4.1.2, 4.1.3, 5.1_

  - [x] 16.2 Update matrix evaluation pipeline
    - Integrate batched matrix evaluation for phases
    - Implement API call optimization (1-2 Matrix calls max)
    - Add comprehensive error handling for multi-phase failures
    - Update caching to support multi-phase results
    - _Requirements: 4.2.1, 4.2.2, 7.1_

- [x] 17. Update frontend for optimization mode selection
  - [x] 17.1 Add optimization mode controls to IsochroneControls
    - Create optimization mode selector (radio buttons or segmented control)
    - Add configuration parameter inputs (grid resolution, refinement radius)
    - Display expected API usage for each mode
    - Update UI to show optimization mode in results
    - _Requirements: 5.1, 5.2_

  - [x] 17.2 Update GraphQL queries for optimization configuration
    - Update calculateMinimaxCenter mutation calls to include optimization config
    - Add optimization mode state management
    - Update TypeScript types for new GraphQL schema
    - Maintain backward compatibility during transition
    - _Requirements: 5.1_

- [x] 18. Implement developer visualization features
  - [x] 18.1 Add hypothesis point visualization to Map component
    - Create distinct markers for anchor points (blue circles)
    - Create distinct markers for coarse grid points (gray squares)
    - Create distinct markers for local refinement points (red diamonds)
    - Highlight selected optimal point with special marker (green star)
    - _Requirements: 5.3_

  - [x] 18.2 Add debug visualization controls
    - Create toggle for enabling/disabling hypothesis point visualization
    - Add legend explaining different marker types
    - Implement performance-conscious rendering (limit visible points)
    - Add developer-friendly tooltips with hypothesis point metadata
    - _Requirements: 5.3_

- [x] 19. Update error handling for multi-phase optimization
  - [x] 19.1 Extend matrix error handling
    - Add error handling for coarse grid matrix failures
    - Add error handling for local refinement matrix failures
    - Implement graceful degradation (fall back to previous phase results)
    - Update user-friendly error messages for multi-phase failures
    - _Requirements: 8.1, 8.3_

  - [x] 19.2 Add configuration validation
    - Validate grid resolution parameters (reasonable bounds)
    - Validate refinement radius parameters (geographic constraints)
    - Validate top-K candidate selection parameters
    - Add comprehensive error messages for invalid configurations
    - _Requirements: 8.2_

- [x] 20. Create comprehensive tests for multi-phase optimization
  - [x] 20.1 Unit tests for hypothesis generation
    - Test coarse grid generation with various bounding boxes
    - Test local refinement generation with different candidate sets
    - Test phase orchestration and configuration handling
    - Test edge cases and boundary conditions
    - _Requirements: 4.1.2, 4.1.3_

  - [x] 20.2 Integration tests for multi-phase workflow
    - Test complete optimization workflow for each mode
    - Test API call optimization and batching
    - Test ε-optimality improvement property
    - Test error handling and fallback mechanisms
    - _Requirements: 4.2.1, 4.2.2, 4.3_

  - [x] 20.3 Performance tests for optimization modes
    - Benchmark API usage for each optimization mode
    - Test hypothesis point generation performance
    - Test matrix evaluation performance with larger point sets
    - Validate API call limits are respected
    - _Requirements: 7.1, 7.2_

- [x] 21. Update documentation and user guidance
  - [x] 21.1 Update user interface help text
    - Add explanations for optimization mode selection
    - Update help text to explain trade-offs between modes
    - Add guidance on when to use each optimization mode
    - Update terminology to reflect multi-phase approach
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 21.2 Add developer documentation
    - Document hypothesis generation algorithms
    - Document API call optimization strategies
    - Add examples of optimization mode usage
    - Document debugging and visualization features
    - _Requirements: 5.3_

- [-] 22. Final integration and validation
  - [-] 22.1 End-to-end testing
    - Test complete user workflow for all optimization modes
    - Validate solution quality improvements across modes
    - Test developer visualization features
    - Ensure backward compatibility with existing functionality
    - _Requirements: All requirements integration_

  - [ ] 22.2 Performance validation
    - Validate API usage limits for all optimization modes
    - Test response times for different optimization modes
    - Validate caching effectiveness across phases
    - Ensure system stability under various load conditions
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 23. Final checkpoint - Multi-phase optimization complete
  - Ensure all tests pass for multi-phase functionality
  - Validate ε-optimality improvement property
  - Confirm API usage optimization
  - Ask user if questions arise about Phase 2 implementation