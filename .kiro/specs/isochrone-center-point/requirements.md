# Requirements Document

## Introduction

Transform the existing isochrone mapping application from vanilla HTML/JavaScript to RedwoodJS SDK and add a new "fair meeting point" feature that calculates the optimal meeting location using a matrix-based minimax travel-time approach. This enables users to find equitable meeting locations that minimize the maximum travel time for all participants by evaluating strategic hypothesis points using actual travel time data.

## Glossary

- **Isochrone**: A polygon representing areas reachable within a specified travel time from a given point
- **Minimax_Travel_Time_Center**: The optimal meeting point that minimizes the maximum travel time from all participant locations
- **Hypothesis_Point**: A candidate meeting point generated using strategic algorithms (geographic centroid, median coordinates, participant locations, pairwise midpoints)
- **Travel_Time_Matrix**: A matrix containing travel times from all participant locations to all hypothesis points
- **Fair_Meeting_Area**: The isochrone area calculated from the minimax center point with a buffer time for visualization
- **Matrix_Evaluated_Hypothesis_Set**: The complete set of candidate meeting points evaluated using the OpenRouteService Matrix API
- **Buffer_Time**: Additional travel time added to the center point visualization to show flexible meeting areas (does not influence meeting point selection)
- **RedwoodJS_App**: The full-stack application built using RedwoodJS framework
- **API_Service**: The backend service handling matrix calculations, isochrone visualization, geocoding, and API key management with intelligent caching
- **Cache_Service**: The caching layer that stores Matrix API responses and isochrone data with location-based and time-based keys

## Requirements

### Requirement 1: RedwoodJS Migration

**User Story:** As a developer, I want the application built with RedwoodJS SDK, so that I have a modern full-stack framework with proper structure and tooling.

#### Acceptance Criteria

1. THE RedwoodJS_App SHALL be initialized with proper project structure including web and api sides
2. THE RedwoodJS_App SHALL use TypeScript for type safety across frontend and backend
3. THE RedwoodJS_App SHALL include proper routing, components, and services architecture
4. THE API_Service SHALL handle all external API communications server-side
5. THE RedwoodJS_App SHALL follow RedwoodJS best practices for file organization and naming conventions

### Requirement 2: Environment Configuration

**User Story:** As a developer, I want API keys stored in environment variables, so that sensitive credentials are not committed to version control.

#### Acceptance Criteria

1. THE API_Service SHALL read the OpenRouteService API key from environment variables
2. THE RedwoodJS_App SHALL include a .env.example file with required environment variable templates
3. THE RedwoodJS_App SHALL include .env files in .gitignore to prevent credential exposure
4. WHEN the API key is missing, THE API_Service SHALL return descriptive error messages
5. THE API_Service SHALL validate API key format before making external requests

### Requirement 3: Location Management

**User Story:** As a user, I want to add multiple locations by address or coordinates, so that I can specify all the points for center calculation.

#### Acceptance Criteria

1. WHEN a user enters a valid address, THE RedwoodJS_App SHALL geocode it to coordinates using the API_Service
2. WHEN a user enters coordinates in lat,lng format, THE RedwoodJS_App SHALL validate and accept them directly
3. WHEN a location is added, THE RedwoodJS_App SHALL display it on the map with a unique color marker
4. WHEN a user removes a location, THE RedwoodJS_App SHALL update the map and clear any existing center calculations
5. THE RedwoodJS_App SHALL support adding at least 12 locations for center calculation

### Requirement 4: Minimax Travel-Time Center Calculation

**User Story:** As a user, I want the system to calculate the minimax travel-time center of my locations, so that I can find a fair meeting point that minimizes the maximum travel time for all participants.

#### Acceptance Criteria

1. WHEN multiple locations are provided, THE API_Service SHALL generate hypothesis points using geographic centroid, median coordinates, participant locations, and pairwise midpoints
2. WHEN hypothesis points are generated, THE API_Service SHALL evaluate travel times from all participant locations to all hypothesis points using the Matrix API
3. WHEN travel time matrix is calculated, THE API_Service SHALL select the hypothesis point that minimizes the maximum travel time from all participants
4. WHEN multiple hypothesis points have equal maximum travel time, THE API_Service SHALL apply tie-breaking rules (lowest average travel time, then closest to geographic centroid)
5. WHEN hypothesis points have unreachable or invalid travel times, THE API_Service SHALL exclude them from consideration

### Requirement 5: Fair Meeting Area Visualization

**User Story:** As a user, I want to see an isochrone from the calculated minimax center point, so that I can identify areas where all participants have reasonable travel times.

#### Acceptance Criteria

1. WHEN an optimal meeting point is selected, THE API_Service SHALL generate a visualization isochrone from that point using the specified buffer time
2. WHEN displaying the fair meeting area, THE RedwoodJS_App SHALL show only the center isochrone, not individual location isochrones or hypothesis points
3. THE RedwoodJS_App SHALL allow users to adjust the buffer time between 5 and 60 minutes for visualization purposes only
4. THE RedwoodJS_App SHALL support different travel modes (driving, cycling, walking) for center isochrone calculation
5. WHEN the isochrone is displayed, THE RedwoodJS_App SHALL show a popup indicating it represents the fair meeting area with the minimax travel time

### Requirement 6: Interactive Map Interface

**User Story:** As a user, I want an interactive map interface, so that I can visualize locations and the fair meeting area clearly.

#### Acceptance Criteria

1. THE RedwoodJS_App SHALL display an interactive map using Leaflet with OpenStreetMap tiles
2. WHEN locations are added, THE RedwoodJS_App SHALL automatically adjust the map bounds to show all points
3. THE RedwoodJS_App SHALL display location markers in different colors from the center point marker
4. WHEN clicking on markers, THE RedwoodJS_App SHALL show popups with location details
5. THE RedwoodJS_App SHALL provide map controls for zoom, pan, and layer management

### Requirement 7: User Interface Controls

**User Story:** As a user, I want intuitive controls for managing locations and settings, so that I can easily configure my fair meeting point analysis.

#### Acceptance Criteria

1. THE RedwoodJS_App SHALL provide a sidebar with location input, settings, and location list
2. WHEN entering locations, THE RedwoodJS_App SHALL support both address search and coordinate input
3. THE RedwoodJS_App SHALL display a list of added locations with remove buttons
4. THE RedwoodJS_App SHALL provide controls for buffer time and travel mode selection
5. THE RedwoodJS_App SHALL show clear feedback messages for user actions and errors

### Requirement 8: API Response Caching

**User Story:** As a user, I want the system to cache API responses, so that repeated requests for similar locations and travel parameters don't consume unnecessary API quota and provide faster responses.

#### Acceptance Criteria

1. WHEN a travel time matrix is calculated, THE API_Service SHALL cache the result with location coordinates and travel mode as the cache key
2. WHEN a subsequent matrix request is made for locations within 100 meters of cached locations with identical travel mode, THE API_Service SHALL return the cached result instead of making a new API call
3. WHEN an isochrone is calculated for visualization, THE API_Service SHALL cache the result with location coordinates and travel parameters as the cache key
4. THE API_Service SHALL implement cache expiration with a default TTL of 24 hours for matrix data, 24 hours for isochrone data, and 7 days for geocoding data
5. THE API_Service SHALL provide cache statistics and allow cache clearing for development and testing purposes

### Requirement 9: Error Handling and Validation

**User Story:** As a user, I want clear error messages and validation, so that I understand what went wrong and how to fix it.

#### Acceptance Criteria

1. WHEN geocoding fails, THE RedwoodJS_App SHALL display helpful error messages suggesting coordinate input
2. WHEN API requests fail, THE API_Service SHALL return structured error responses with user-friendly messages
3. WHEN invalid coordinates are entered, THE RedwoodJS_App SHALL validate ranges and show specific error details
4. WHEN insufficient locations are provided, THE RedwoodJS_App SHALL prevent center calculation and explain requirements
5. IF API rate limits are exceeded, THE API_Service SHALL handle gracefully and inform the user about limits