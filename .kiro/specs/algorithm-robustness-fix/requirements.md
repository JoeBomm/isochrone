# Requirements Document

## Introduction

Fix a critical bug in the optimal location calculation algorithm where specific locations cause internal errors during calculation, particularly when using certain optimization goals (average or minimize total). The system should handle all valid geocoded locations robustly without internal failures through minimal validation and fallback mechanisms.

## Glossary

- **Problematic_Location**: A geocoded location that causes the algorithm to fail with internal errors
- **Optimization_Goal**: The scoring criteria used for ranking optimal points (Minimax, Mean, Min)
- **Data_Validation**: Process of checking numeric values for validity (finite, non-NaN)
- **Fallback_Score**: A safe default score used when calculation produces invalid results
- **Matrix_Sanitization**: Process of filtering invalid travel time values before scoring

## Requirements

### Requirement 1: Numeric Value Validation

**User Story:** As a developer, I want to validate all numeric values in calculations, so that invalid values (NaN, Infinity) don't cause crashes.

#### Acceptance Criteria

1. THE System SHALL validate that all numeric values used in calculations are finite
2. THE System SHALL provide a helper function to assert finite values with clear error messages
3. WHEN invalid numeric values are detected, THE System SHALL use fallback values or skip the calculation
4. THE System SHALL validate travel time matrix data before scoring calculations
5. THE System SHALL guard all division and averaging operations against invalid inputs

### Requirement 2: Matrix Data Sanitization

**User Story:** As a user, I want the system to handle invalid travel time data gracefully, so that calculations complete successfully even with problematic API responses.

#### Acceptance Criteria

1. WHEN travel time matrix contains invalid values, THE System SHALL filter them out before scoring
2. THE System SHALL skip travel times that are NaN, Infinity, or negative
3. WHEN no valid travel times remain for a point, THE System SHALL assign a fallback score
4. THE System SHALL continue processing other points when some have invalid travel times
5. THE System SHALL log warnings about filtered invalid travel times

### Requirement 3: Robust Scoring Calculations

**User Story:** As a user, I want scoring calculations to handle edge cases gracefully, so that the system works reliably with any valid location combination.

#### Acceptance Criteria

1. WHEN calculating averages, THE System SHALL guard against division by zero
2. WHEN calculating variance, THE System SHALL handle single-value arrays appropriately
3. WHEN scoring produces invalid results, THE System SHALL use fallback scoring logic
4. THE System SHALL validate all calculated metrics before using them
5. THE System SHALL ensure all optimization goals work with edge case inputs

### Requirement 4: Specific Bug Fix

**User Story:** As a user, I want the specific problematic location to work correctly, so that I can include any valid address in my calculations.

#### Acceptance Criteria

1. WHEN the location "29111 Timber Woods Dr, Chesterfield" is included, THE System SHALL complete successfully
2. THE System SHALL handle this location with all optimization goals (Minimax, Mean, Min)
3. THE System SHALL not crash or produce internal errors with this location
4. THE System SHALL return valid results when this location is combined with others
