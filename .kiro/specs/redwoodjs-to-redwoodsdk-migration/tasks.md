# Implementation Plan: RedwoodJS to RedwoodSDK Migration

## Overview

This implementation plan provides a phased approach to migrating the Isochrone Center Point application from RedwoodJS 8.9.0 to RedwoodSDK 1.x. The migration is structured to minimize risk through incremental changes, comprehensive testing, and rollback capabilities.

## Tasks

- [x] 1. Initialize RedwoodSDK project structure
  - Create new RedwoodSDK project with Vite plugin configuration
  - Set up Miniflare for local development with Cloudflare Workers emulation
  - Configure TypeScript and build tooling
  - _Requirements: 1.1, 1.2, 1.3_

- [ ]* 1.1 Write property test for project structure setup
  - **Property 1: Project Structure Validation**
  - **Validates: Requirements 1.1**

- [x] 2. Migrate database layer from Prisma to D1
  - [x] 2.1 Convert Prisma schema to D1 SQL migrations
    - Analyze existing Prisma schema structure
    - Create equivalent D1 SQL schema with proper indexes
    - _Requirements: 2.1_

  - [x] 2.2 Implement D1 database access layer
    - Create DatabaseService class with native D1 queries
    - Replace Prisma client calls with D1 prepared statements
    - _Requirements: 2.2, 2.5_

  - [ ]* 2.3 Write property test for database schema migration
    - **Property 1: Database Schema Migration Equivalence**
    - **Validates: Requirements 2.1, 2.2, 2.5**

  - [x] 2.4 Create data migration scripts
    - Build scripts to export data from SQLite
    - Create import scripts for D1 database
    - _Requirements: 2.4_

- [x] 3. Convert GraphQL API to Server Functions
  - [x] 3.1 Migrate isochrone mutations to server functions
    - Convert findOptimalLocations GraphQL mutation
    - Convert generateIsochrone GraphQL mutation
    - Convert calculateMinimaxCenter GraphQL mutation
    - _Requirements: 3.1, 3.3_

  - [x] 3.2 Migrate location services to server functions
    - Convert geocoding functionality to server functions
    - Implement native Request/Response handling
    - _Requirements: 3.1, 3.2_

  - [ ]* 3.3 Write property test for API functional equivalence
    - **Property 2: API Functional Equivalence**
    - **Validates: Requirements 3.1, 3.3, 3.5**

  - [x] 3.4 Implement error handling with HTTP status codes
    - Replace GraphQL error handling with standard HTTP responses
    - Maintain existing authentication patterns
    - _Requirements: 3.4, 3.5_

- [ ] 4. Checkpoint - Ensure backend migration is functional
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Migrate React components to RSC architecture
  - [x] 5.1 Classify components for RSC vs Client rendering
    - Analyze existing components for server/client requirements
    - Add "use client" directives where necessary
    - _Requirements: 4.1, 4.2_

  - [x] 5.2 Convert HomePage to React Server Component
    - Migrate main page layout to RSC
    - Implement custom Document component
    - _Requirements: 4.5_

  - [ ]* 5.3 Write property test for component classification
    - **Property 3: Component Classification Correctness**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 5.4 Migrate routing to RedwoodSDK router
    - Convert RedwoodJS routes to RedwoodSDK route handlers
    - Implement middleware for session management
    - _Requirements: 4.3_

  - [ ]* 5.5 Write property test for route functionality
    - **Property 4: Route Functionality Preservation**
    - **Validates: Requirements 4.3, 4.5**

- [x] 6. Update external service integrations
  - [x] 6.1 Replace GraphQL client with native fetch for OpenRouteService
    - Convert OpenRouteService integration to use fetch API
    - Update API key management for Cloudflare environment
    - _Requirements: 5.1, 5.3_

  - [x] 6.2 Implement Cloudflare caching for external APIs
    - Replace Redis caching with Cloudflare Cache API
    - Maintain existing cache behavior and TTL settings
    - _Requirements: 5.2_

  - [ ]* 6.3 Write property test for external service integration
    - **Property 5: External Service Integration Consistency**
    - **Validates: Requirements 5.1, 5.3, 5.4**

  - [ ]* 6.4 Write property test for caching behavior
    - **Property 6: Caching Behavior Equivalence**
    - **Validates: Requirements 5.2**

- [x] 7. Migrate client-side components and interactivity
  - [x] 7.1 Update LocationInput component for server functions
    - Modify component to call server functions instead of GraphQL
    - Preserve existing UI behavior and validation
    - _Requirements: 4.4_

  - [x] 7.2 Update Map component for RSC compatibility
    - Ensure Leaflet integration works with RSC architecture
    - Maintain all existing map functionality
    - _Requirements: 4.4_

  - [x] 7.3 Update remaining interactive components
    - Migrate IsochroneControls, DebugControls, and other components
    - Preserve existing state management patterns
    - _Requirements: 4.4_

- [-] 8. Configure build and deployment for Cloudflare Workers
  - [x] 8.1 Set up Vite build configuration
    - Configure Vite plugin for RedwoodSDK
    - Set up proper bundling for Cloudflare Workers
    - _Requirements: 6.2_

  - [x] 8.2 Configure Cloudflare Workers deployment
    - Set up wrangler.toml configuration
    - Configure D1 database bindings
    - Configure environment variables and secrets
    - _Requirements: 6.4, 6.5_

- [ ] 9. Migrate and adapt existing tests
  - [ ] 9.1 Convert Jest tests for new architecture
    - Update existing unit tests to work with server functions
    - Adapt integration tests for RSC architecture
    - _Requirements: 6.3_

  - [ ]* 9.2 Write property test for test migration completeness
    - **Property 8: Test Migration Completeness**
    - **Validates: Requirements 6.3, 8.3**

  - [ ]* 9.3 Write property test for performance preservation
    - **Property 7: Performance Preservation**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

- [x] 10. Implement migration adapters and rollback procedures
  - [x] 10.1 Create migration adapter layers
    - Build compatibility layers for gradual migration
    - Implement feature flags for progressive rollout
    - _Requirements: 8.2_

  - [ ]* 10.2 Write property test for migration adapter compatibility
    - **Property 9: Migration Adapter Compatibility**
    - **Validates: Requirements 8.2**

  - [x] 10.3 Implement rollback procedures
    - Create scripts to rollback database migrations
    - Document code deployment rollback process
    - _Requirements: 8.5_

  - [ ]* 10.4 Write property test for rollback integrity
    - **Property 10: Rollback Integrity**
    - **Validates: Requirements 8.5**

- [ ] 11. Final integration testing and validation
  - [ ] 11.1 Run comprehensive end-to-end tests
    - Validate all user workflows in migrated system
    - Compare performance with original RedwoodJS implementation
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 11.2 Validate deployment to Cloudflare Workers
    - Test full deployment pipeline
    - Verify all external integrations work in production
    - _Requirements: 6.4_

- [x] 12. Final checkpoint - Ensure complete migration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout the migration
- Property tests validate universal correctness properties across the migration
- Unit tests validate specific migration scenarios and edge cases
- The migration is designed to be reversible at any stage through rollback procedures
