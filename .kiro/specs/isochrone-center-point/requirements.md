# Requirements Document

## Introduction

Implement an optimal facility location algorithm that finds the best meeting points for multiple starting locations. This system uses a simplified two-phase approach with cost-controlled API usage, supporting multiple optimization goals and providing modern UI with debug visualization capabilities.

## Glossary

- **S**: Starting locations (input points on the map)
- **N**: Ideal meeting points (algorithm output)
- **Hypothesis_Point**: A candidate meeting point generated through anchor points and bounding box grid
- **Anchor_Point**: Baseline hypothesis points including geographic centroid, median coordinates, participant locations, and pairwise midpoints
- **Bounding_Box_Grid**: A grid subdivision of the bounding box containing all input locations, with grid cell centers as hypothesis points
- **Matrix_API**: OpenRouteService Matrix API for evaluating travel times between locations and hypothesis points
- **Isochrone_API**: OpenRouteService Isochrone API for generating travel time polygons (cost-controlled)
- **Deduplication**: Algorithm to merge nearby points by averaging coordinates and recalculating rankings
- **Debug_Mode**: Visualization mode showing all hypothesis points with color coding
- **M**: Top-performing points selected after Matrix API evaluation and deduplication
- **R**: Radius for final isochrone travel time visualization

## Requirements

### Requirement 1: Two-Phase Hypothesis Generation

**User Story:** As a user, I want the system to generate optimal meeting points through a streamlined two-phase algorithm, so that I can quickly find the best locations without complex configuration.

#### Acceptance Criteria

1. **Phase 1 - Hypothesis Generation**: THE System SHALL compute anchor points (geographic centroid, median coordinates, participant locations, pairwise midpoints) and bounding box grid points as hypothesis candidates
2. **Phase 2 - Evaluation and Selection**: THE System SHALL evaluate all hypothesis points using a single Matrix API call, apply scoring based on optimization goal, and perform deduplication to select top M optimal points
3. WHEN hypothesis generation is executed, THE System SHALL combine anchor points and grid points into a unified candidate set
4. WHEN evaluation is performed, THE System SHALL use exactly one Matrix API call for all hypothesis points
5. WHEN deduplication is applied, THE System SHALL merge points within threshold distance and recalculate rankings

### Requirement 2: Location Input Interface

**User Story:** As a user, I want flexible location input options, so that I can efficiently add multiple locations for analysis.

#### Acceptance Criteria

1. THE System SHALL provide individual location entry through a standard input interface
2. THE System SHALL provide bulk location entry accepting addresses or coordinates separated by newline characters
3. THE System SHALL support address geocoding via OpenRouteService to convert addresses to coordinates
4. THE System SHALL support direct coordinate input for precise location specification
5. THE System SHALL validate all location inputs before processing

### Requirement 3: Debug Visualization Controls

**User Story:** As a user, I want debug visualization options, so that I can understand the algorithm's hypothesis generation process.

#### Acceptance Criteria

1. THE System SHALL provide UI controls to visually toggle display of anchor points (anchors remain in calculations)
2. THE System SHALL provide UI controls to visually toggle display of bounding box grid points (grid points remain in calculations)
3. THE System SHALL visually distinguish different point types using colors: anchors, grid points, and final optimal points
4. THE System SHALL ensure final optimal points are always visible above debug points (higher z-index)
5. THE System SHALL allow toggling debug visualization without affecting core algorithm functionality

### Requirement 4: Cost-Controlled Isochrone Usage

**User Story:** As a user, I want isochrones to be calculated only when explicitly requested, so that API costs are minimized while still providing visualization capabilities.

#### Acceptance Criteria

1. THE System SHALL NOT automatically calculate isochrones for any hypothesis points
2. WHEN a user clicks on a specific optimal point, THE System SHALL request its isochrone from the Isochrone API and display it on the map
3. THE System SHALL display the top M optimal points immediately after calculation without isochrones
4. THE System SHALL make optimal points clickable for on-demand isochrone generation
5. THE System SHALL cache isochrone responses to avoid repeated API calls for the same point

### Requirement 5: Modern UI Design

**User Story:** As a user, I want a modern, clean, and accessible interface, so that I can efficiently use the application across different devices.

#### Acceptance Criteria

1. THE System SHALL use Material-UI component library for consistent, professional design
2. THE System SHALL ensure proper color contrast and keyboard navigation support for accessibility
3. THE System SHALL provide responsive design that works on desktop and mobile devices
4. THE System SHALL display optimal travel time metrics near each optimal point with clear, readable formatting
5. THE System SHALL hide previous isochrones when a user selects a different point

### Requirement 6: Proximity Deduplication

**User Story:** As a user, I want nearby optimal points to be merged intelligently, so that the results are clean and avoid redundant recommendations.

#### Acceptance Criteria

1. WHEN optimal points N1 and N2 are closer than a configurable distance threshold, THE System SHALL replace them with their average coordinates
2. WHEN proximity deduplication occurs, THE System SHALL recalculate rankings for remaining points
3. THE System SHALL make the distance threshold configurable (default 5km)
4. THE System SHALL apply deduplication iteratively until no points are within threshold distance
5. WHEN fewer than M points exist after deduplication, THE System SHALL display all remaining points

### Requirement 7: Optimization Goal Selection

**User Story:** As a user, I want to choose between different optimization goals, so that I can explore various fairness criteria for meeting point selection.

#### Acceptance Criteria

1. THE System SHALL provide an option to select "Minimax" (minimize maximum travel time) as the optimization goal
2. THE System SHALL provide an option to select "Mean" (minimize variance/equalize travel times) as the optimization goal
3. THE System SHALL provide an option to select "Min" (minimize total travel time) as the optimization goal
4. WHEN optimization goal is changed, THE System SHALL recalculate rankings using the selected criteria
5. THE System SHALL clearly indicate which optimization goal is currently active

### Requirement 8: Minimal Testing Requirements

**User Story:** As a developer, I want focused unit tests for core business logic, so that essential functionality is validated without excessive testing overhead.

#### Acceptance Criteria

1. THE System SHALL include unit tests for hypothesis generation algorithms (anchor points, grid generation)
2. THE System SHALL include unit tests for deduplication logic with various proximity scenarios
3. THE System SHALL include unit tests for scoring and ranking logic with different optimization goals
4. THE System SHALL mark non-essential existing tests as skipped rather than removing them during development
5. THE System SHALL focus testing efforts on core business logic that is stable and essential to functionality

### Requirement 9: Modular Architecture for Flexibility

**User Story:** As a developer, I want modular, swappable components, so that the system can adapt to changing requirements and algorithm experimentation.

#### Acceptance Criteria

1. THE System SHALL implement hypothesis generation strategies as modular, swappable components
2. THE System SHALL implement scoring functions as modular, swappable components
3. THE System SHALL provide clear interfaces for adding new hypothesis generation algorithms
4. THE System SHALL provide clear interfaces for adding new optimization criteria
5. THE System SHALL maintain separation between algorithm logic and UI presentation
