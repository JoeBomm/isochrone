# Implementation Plan: Unreachable Points Filtering

## Overview

This implementation plan fixes the critical bug where null travel times from the OpenRoute Matrix API cause validateMatrixResult to throw errors. The solution filters out unreachable hypothesis points and continues processing with reachable ones.

## Tasks

- [x] 1. Modify validateMatrixResult to detect unreachable points without throwing errors
  - Change validateMatrixResult to return validation result object instead of throwing
  - Add detection for null, undefined, and Infinity travel times in matrix
  - Identify unreachable destination column indices
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Implement filterUnreachablePoints method to remove unreachable destinations
  - Create private method to filter unreachable points from all data structures
  - Remove unreachable points from hypothesisPoints array
  - Remove corresponding columns from matrix.travelTimes array
  - Remove unreachable destinations from matrix.destinations array
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Integrate filtering into evaluateAllHypothesisPoints main flow
  - Modify evaluateAllHypothesisPoints to use new validation approach
  - Add filtering step after matrix validation but before returning result
  - Ensure filtered result maintains correct data structure consistency
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Add error handling for complete unreachability scenarios
  - Handle edge case where all hypothesis points are unreachable
  - Throw descriptive error when no reachable points remain
  - Ensure graceful degradation when some points are unreachable
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5. Add logging for filtered points
  - Log which hypothesis points were filtered out with coordinates
  - Log reasons for filtering (null, undefined, or Infinity travel times)
  - Include filtering count in existing log messages
  - _Requirements: 2.5, 5.5_

- [x] 6. Update SingleMatrixResult to reflect filtered data
  - Ensure totalHypothesisPoints reflects original count before filtering
  - Ensure matrix and hypothesisPoints arrays contain only reachable points
  - Maintain backward compatibility with existing SingleMatrixResult interface
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

## Notes

- Each task maintains a green build and passes existing tests
- Implementation preserves backward compatibility with existing API
- Focus is on fixing the core bug: null travel times causing system crashes
- Filtering happens transparently without breaking downstream consumers
