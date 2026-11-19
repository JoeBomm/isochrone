# Component Classification for RSC vs Client Rendering

## Analysis Summary

Based on the analysis of existing RedwoodJS components, here's the classification for React Server Components (RSC) vs Client Components in the RedwoodSDK migration:

## Client Components (Require "use client" directive)

### Interactive Components with State Management
- **LocationInput** - Uses useState, form handling, GraphQL mutations, user interactions
- **Map** - Uses useRef, useEffect, Leaflet integration, click handlers, complex DOM manipulation
- **DebugControls** - Uses useState, toggle controls, user interactions
- **IsochroneControls** - Uses useState, form inputs, validation, user interactions
- **OptimizationGoals** - Uses form controls, radio buttons, user interactions
- **ApiUsageWarning** - Uses dismiss functionality, user interactions
- **Toast/ToastContainer** - Uses state management, animations, user interactions
- **LoadingSpinner/LoadingOverlay** - Uses animations, conditional rendering based on state
- **DeveloperOptions** - Uses form controls, user interactions
- **AlgorithmToggles** - Uses toggle controls, user interactions

### Error Boundaries
- **ErrorBoundary** - Uses componentDidCatch, state management for error handling
- **MapErrorBoundary** - Uses componentDidCatch, state management for error handling

## Server Components (No directive needed)

### Layout Components
- **MainLayout** - Pure layout component, can be rendered on server
- **HomePage** - Main page component, can be server-rendered with client components as children

### Static/Presentational Components
- None identified in current codebase - all components have some level of interactivity

## Implementation Strategy

1. **Add "use client" directives** to all interactive components
2. **Keep layout components as RSC** where possible
3. **Migrate HomePage to RSC** while preserving client component functionality
4. **Update imports and exports** to work with RSC architecture

## Key Considerations

- **Leaflet Integration**: Map component requires client-side rendering due to DOM manipulation
- **Form Handling**: All form components need client-side state management
- **GraphQL Mutations**: Components using Apollo Client need client-side rendering
- **State Management**: Components with useState, useEffect need client-side rendering
- **Event Handlers**: Components with click handlers, form submissions need client-side rendering

## Migration Order

1. Start with leaf components (no dependencies)
2. Work up to layout components
3. Finally migrate page components
4. Test each component individually after migration
