# Requirements Document

## Introduction

This feature simplifies and improves the user interface for the isochrone center point application by removing optimization mode complexity, standardizing the algorithm, improving UI consistency with MaterialUI, and enhancing the isochrone display behavior. The system will use a single, consistent algorithm while maintaining user configurability for meeting point count and adding helpful tooltips for better user experience.

## Glossary

- **Meeting_Point**: A geospatial location that represents an optimal gathering spot based on travel time calculations
- **Algorithm**: The simplified system component that calculates optimal meeting points using anchor points and grid points with matrix API evaluation
- **User_Interface**: The web-based frontend that displays controls and results to users using MaterialUI components
- **Configuration_Control**: A UI element that allows users to specify the number of meeting points to calculate
- **Travel_Time_Range**: The time range used to calculate isochrones around selected meeting points (formerly "Slack Time")
- **Isochrone**: A geographic area showing locations reachable within a specified travel time from a meeting point
- **MaterialUI**: The React component library used for consistent UI design

## Requirements

### Requirement 1: Algorithm Simplification and Code Cleanup

**User Story:** As a developer, I want a simplified codebase with only one algorithm approach, so that the system is easier to maintain and understand.

#### Acceptance Criteria

1. THE User_Interface SHALL remove all optimization mode selection controls (Baseline, Coarse Grid, Full Refinement)
2. THE Backend SHALL remove unused multi-phase optimization code and keep only the simplified algorithm
3. THE System SHALL remove OptimizationConfig, OptimizationMode types and related validation functions
4. THE Backend SHALL clean up unused imports and algorithm phase constants
5. THE System SHALL remove tests related to multi-phase optimization and optimization mode functionality
5. THE User_Interface SHALL use MaterialUI components for consistent design and better user experience
6. THE System SHALL remove tests related to multi-phase optimization and optimization mode functionality

### Requirement 2: Travel Time Range Terminology Update

**User Story:** As a user, I want clear terminology that explains what the time setting controls, so that I understand how it affects the isochrone visualization.

#### Acceptance Criteria

1. THE User_Interface SHALL change "Slack Time" label to "Travel time range"
2. THE Configuration_Control SHALL display a tooltip explaining: "Used to calculate the isochrone, this area you can reach in minutes from the ideal meeting point selected using the input travel mode"
3. THE User_Interface SHALL maintain the same 5-60 minute range validation
4. THE System SHALL continue using this value only for isochrone visualization, not for meeting point calculation
5. THE User_Interface SHALL clearly indicate this setting does not affect meeting point calculation

### Requirement 3: Meeting Point Count Configuration with Tooltips

**User Story:** As a user, I want to configure how many meeting points to see with helpful explanations, so that I can understand what this setting controls.

#### Acceptance Criteria

1. THE Configuration_Control SHALL display a tooltip explaining: "Number of optimal meeting points to calculate and display (1-10)"
2. THE User_Interface SHALL maintain the existing 1-10 range validation with default value of 3
3. THE Configuration_Control SHALL use MaterialUI components for consistent styling
4. THE System SHALL persist the user's choice throughout their browser session
5. THE User_Interface SHALL provide clear visual feedback when values are adjusted due to validation

### Requirement 4: Button Text and Behavior Updates

**User Story:** As a user, I want clear button text and efficient recalculation behavior, so that I understand what actions trigger API calls.

#### Acceptance Criteria

1. THE User_Interface SHALL change button text from "Generate Hypothesis Points" to "Calculate Optimal Meeting Points"
2. WHEN the calculate button is pressed, THE System SHALL call the matrix API and calculate statistics
3. WHEN optimization goal is changed after calculation, THE System SHALL automatically update displayed points without additional API calls
4. THE User_Interface SHALL indicate when recalculation uses cached data versus new API calls
5. THE System SHALL maintain the existing matrix API call efficiency

### Requirement 5: Single Isochrone Display

**User Story:** As a user, I want to see only one isochrone at a time when clicking meeting points, so that the map display remains clear and focused.

#### Acceptance Criteria

1. WHEN a user clicks an isochrone point and an isochrone is already displayed, THE System SHALL hide the previous isochrone
2. THE System SHALL display only one isochrone at any given time
3. THE User_Interface SHALL provide clear visual indication of which meeting point has its isochrone displayed
4. THE System SHALL maintain isochrone caching for performance
5. THE User_Interface SHALL allow users to clear the displayed isochrone

### Requirement 6: MaterialUI Component Integration

**User Story:** As a developer, I want consistent UI components throughout the application, so that the user experience is cohesive and maintainable.

#### Acceptance Criteria

1. THE User_Interface SHALL replace custom form controls with MaterialUI equivalents
2. THE Configuration_Control elements SHALL use MaterialUI TextField, Select, and Button components
3. THE User_Interface SHALL maintain existing functionality while improving visual consistency
4. THE System SHALL preserve all current validation and error handling behavior
5. THE User_Interface SHALL follow MaterialUI design patterns and accessibility guidelines
