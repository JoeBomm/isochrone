# Requirements Document

## Introduction

This feature replaces the confusingly named "Mean" optimization goal with a clearer "Minimize Variance" goal. The current "Mean" goal actually minimizes variance in travel times (for fairness), not the mean travel time, which creates confusion for users. This change improves the clarity and usability of the optimization goal selection.

## Glossary

- **Optimization_Goal**: An algorithm strategy for selecting the best meeting point from candidate locations
- **Minimax**: Optimization strategy that minimizes the maximum travel time for any participant
- **Minimize_Variance**: Optimization strategy that minimizes variance in travel times to ensure fairness
- **Minimize_Total**: Optimization strategy that minimizes the sum of all travel times
- **Travel_Time_Variance**: Statistical measure of how spread out travel times are from the average
- **GraphQL_Schema**: API schema definition that defines available optimization goals
- **Frontend_UI**: User interface components that display optimization goal options
- **Scoring_Service**: Backend service that calculates scores for candidate meeting points

## Requirements

### Requirement 1: Replace Mean Goal with Minimize Variance

**User Story:** As a user selecting optimization goals, I want clear and accurate goal names, so that I can understand what each optimization strategy does.

#### Acceptance Criteria

1. WHEN the system defines optimization goals, THE GraphQL_Schema SHALL use "MINIMIZE_VARIANCE" instead of "MEAN"
2. WHEN the system processes optimization requests, THE Scoring_Service SHALL map "MINIMIZE_VARIANCE" to variance-based scoring
3. WHEN users view optimization options, THE Frontend_UI SHALL display "Minimize Variance" instead of "Mean"
4. WHEN the system calculates scores, THE Scoring_Service SHALL continue using variance calculation for the renamed goal
5. WHEN existing API clients use the old "MEAN" value, THE System SHALL maintain backward compatibility during transition

### Requirement 2: Update Documentation and Comments

**User Story:** As a developer working with the codebase, I want accurate documentation and comments, so that I can understand the optimization algorithms correctly.

#### Acceptance Criteria

1. WHEN developers read code comments, THE System SHALL describe "MINIMIZE_VARIANCE" as variance minimization for fairness
2. WHEN developers read GraphQL schema comments, THE System SHALL explain that "MINIMIZE_VARIANCE" equalizes travel times
3. WHEN developers read type definitions, THE System SHALL use consistent naming for the variance optimization goal
4. WHEN developers read test descriptions, THE System SHALL reference "MINIMIZE_VARIANCE" instead of "MEAN"

### Requirement 3: Maintain Three Optimization Goals

**User Story:** As a user planning meetings, I want three distinct optimization strategies, so that I can choose the approach that best fits my needs.

#### Acceptance Criteria

1. WHEN the system offers optimization goals, THE System SHALL provide exactly three options: MINIMAX, MINIMIZE_VARIANCE, and MINIMIZE_TOTAL
2. WHEN users select MINIMAX, THE System SHALL minimize the maximum travel time among all participants
3. WHEN users select MINIMIZE_VARIANCE, THE System SHALL minimize variance in travel times for fairness
4. WHEN users select MINIMIZE_TOTAL, THE System SHALL minimize the sum of all travel times
5. WHEN the system processes any goal, THE System SHALL maintain existing scoring algorithm behavior

### Requirement 4: Update Default Configuration

**User Story:** As a system administrator, I want consistent default values, so that the system behavior is predictable and well-documented.

#### Acceptance Criteria

1. WHEN the system sets default optimization goals, THE System SHALL continue using MINIMAX as the default
2. WHEN GraphQL mutations specify default parameters, THE System SHALL use MINIMAX as the default optimization goal
3. WHEN frontend components initialize, THE System SHALL display MINIMAX as the selected default option
4. WHEN configuration constants are defined, THE System SHALL reference the correct goal names

### Requirement 5: Preserve Existing Functionality

**User Story:** As an existing user of the system, I want my optimization results to remain consistent, so that the rename doesn't affect the quality of meeting point suggestions.

#### Acceptance Criteria

1. WHEN the system calculates variance-based scores, THE Scoring_Service SHALL use the same variance calculation formula
2. WHEN the system ranks hypothesis points, THE System SHALL produce identical rankings for variance-based optimization
3. WHEN the system generates travel time metrics, THE System SHALL continue calculating variance when requested
4. WHEN API responses include travel time metrics, THE System SHALL include variance data in the same format
5. WHEN property-based tests run, THE System SHALL maintain all existing correctness properties
