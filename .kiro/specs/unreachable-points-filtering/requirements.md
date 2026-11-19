# Requirements Document

## Introduction

Fix a critical bug in the SingleMatrixService where hypothesis points over unreachable areas (like lakes, restricted zones, or disconnected road networks) cause the validateMatrixResult method to fail when the OpenRoute Matrix API returns null travel times. The system should automatically filter out unreachable hypothesis points from the SingleMatrixResult and continue processing with only the reachable ones.

## Glossary

- **SingleMatrixService**: The service class in `api/src/lib/algorithms/singleMatrix.ts` that handles matrix evaluation
- **OpenRoute_Matrix_API**: External OpenRouteService API that calculates travel times between origins and destinations
- **Unreachable_Point**: A hypothesis point that cannot be reached by one or more origins via the specified travel mode
- **Null_Travel_Time**: A travel time value returned as null, undefined, or Infinity by the Matrix API
- **Point_Filtering**: Process of removing unreachable hypothesis points from the SingleMatrixResult
- **Matrix_Sanitization**: Process of cleaning the TravelTimeMatrix after removing unreachable points
- **SingleMatrixResult**: The return type containing matrix, hypothesisPoints, apiCallCount, and totalHypothesisPoints

## Requirements

### Requirement 1: Detect Unreachable Points in Matrix Validation

**User Story:** As a developer, I want the validateMatrixResult method to detect unreachable points, so that the SingleMatrixService doesn't crash when the OpenRoute API returns null travel times.

#### Acceptance Criteria

1. WHEN the OpenRoute Matrix API returns null travel times for a hypothesis point, THE validateMatrixResult method SHALL identify that point as unreachable
2. WHEN the OpenRoute Matrix API returns undefined travel times for a hypothesis point, THE validateMatrixResult method SHALL identify that point as unreachable
3. WHEN the OpenRoute Matrix API returns Infinity travel times for a hypothesis point, THE validateMatrixResult method SHALL identify that point as unreachable
4. THE validateMatrixResult method SHALL check all origin rows for each destination column to determine reachability
5. WHEN any origin cannot reach a hypothesis point, THE validateMatrixResult method SHALL mark that destination column as unreachable

### Requirement 2: Filter Unreachable Points from SingleMatrixResult

**User Story:** As a developer, I want unreachable hypothesis points to be automatically removed from the SingleMatrixResult, so that downstream algorithms receive clean data.

#### Acceptance Criteria

1. WHEN a hypothesis point is identified as unreachable, THE SingleMatrixService SHALL remove it from the hypothesisPoints array in SingleMatrixResult
2. WHEN a hypothesis point is removed, THE SingleMatrixService SHALL remove its corresponding column from the TravelTimeMatrix.travelTimes array
3. WHEN a hypothesis point is removed, THE SingleMatrixService SHALL remove its coordinate from the TravelTimeMatrix.destinations array
4. THE SingleMatrixService SHALL maintain the correct mapping between remaining hypothesis points and matrix columns
5. THE SingleMatrixService SHALL log which hypothesis points were filtered out with their coordinates and reasons

### Requirement 3: Matrix Consistency

**User Story:** As a developer, I want the travel time matrix to remain consistent after filtering, so that downstream scoring algorithms receive clean data.

#### Acceptance Criteria

1. WHEN hypothesis points are filtered, THE System SHALL ensure matrix dimensions match the remaining points
2. THE System SHALL validate that all remaining travel times are valid numbers
3. THE System SHALL ensure the origins array remains unchanged during filtering
4. THE System SHALL ensure the destinations array matches the filtered hypothesis points
5. THE System SHALL maintain the correct row-to-origin and column-to-destination mapping

### Requirement 4: Graceful Degradation

**User Story:** As a user, I want the system to continue working even when many hypothesis points are unreachable, so that I can still get results in challenging geographic areas.

#### Acceptance Criteria

1. WHEN some hypothesis points are unreachable, THE System SHALL continue processing with remaining points
2. WHEN all anchor points are unreachable, THE System SHALL continue with grid points if available
3. WHEN all grid points are unreachable, THE System SHALL continue with anchor points if available
4. WHEN all hypothesis points are unreachable, THE System SHALL return an appropriate error message
5. THE System SHALL require at least one reachable hypothesis point to proceed

### Requirement 5: Performance Optimization

**User Story:** As a developer, I want the filtering to be efficient, so that it doesn't significantly impact algorithm performance.

#### Acceptance Criteria

1. THE System SHALL perform filtering in a single pass through the matrix data
2. THE System SHALL avoid creating unnecessary intermediate data structures during filtering
3. THE System SHALL minimize memory allocation during the filtering process
4. THE System SHALL complete filtering before any scoring calculations begin
5. THE System SHALL log filtering performance metrics for monitoring
