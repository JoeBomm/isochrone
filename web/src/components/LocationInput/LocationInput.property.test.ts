import * as fc from 'fast-check'
import type { Location } from './LocationInput'

/**
 * Property-based tests for location state management
 * Feature: isochrone-center-point, Property 3: Location State Management
 * Validates: Requirements 3.3, 3.4
 */

// Helper function to simulate location state management
interface LocationState {
  locations: Location[]
  centerPoint?: { latitude: number; longitude: number }
  fairMeetingArea?: GeoJSON.Polygon
}

const addLocation = (state: LocationState, location: Location): LocationState => {
  if (state.locations.length >= 12) {
    return state // Don't add if at limit
  }
  return {
    ...state,
    locations: [...state.locations, location]
  }
}

const removeLocation = (state: LocationState, locationId: string): LocationState => {
  return {
    locations: state.locations.filter(loc => loc.id !== locationId),
    // Clear dependent calculations when locations change
    centerPoint: undefined,
    fairMeetingArea: undefined
  }
}

// Generator for valid locations
const locationArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  latitude: fc.float({ min: -90, max: 90, noNaN: true }),
  longitude: fc.float({ min: -180, max: 180, noNaN: true }),
  color: fc.oneof(
    fc.constant('#ef4444'),
    fc.constant('#3b82f6'),
    fc.constant('#10b981'),
    fc.constant('#f59e0b'),
    fc.constant('#8b5cf6')
  )
})

// Generator for location operations
const locationOperationArbitrary = fc.oneof(
  fc.record({ type: fc.constant('add'), location: locationArbitrary }),
  fc.record({ type: fc.constant('remove'), locationId: fc.string({ minLength: 1 }) })
)

describe('Location State Management Properties', () => {
  describe('Property 3: Location State Management', () => {
    it('should maintain correct location count after any sequence of additions', () => {
      fc.assert(
        fc.property(
          fc.array(locationArbitrary, { minLength: 0, maxLength: 15 }),
          (locations) => {
            // For any sequence of location additions, the final count should respect the 12-location limit
            let state: LocationState = { locations: [] }

            for (const location of locations) {
              state = addLocation(state, location)
            }

            // The final location count should never exceed 12
            expect(state.locations.length).toBeLessThanOrEqual(12)

            // The final location count should be the minimum of input length and 12
            expect(state.locations.length).toBe(Math.min(locations.length, 12))
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should preserve location order and uniqueness during additions', () => {
      fc.assert(
        fc.property(
          fc.array(locationArbitrary, { minLength: 1, maxLength: 10 }),
          (locations) => {
            // For any sequence of unique locations, they should be added in order
            let state: LocationState = { locations: [] }

            // Make locations unique by ID
            const uniqueLocations = locations.map((loc, index) => ({
              ...loc,
              id: `loc-${index}`
            }))

            for (const location of uniqueLocations) {
              state = addLocation(state, location)
            }

            // All locations should be present in the same order
            expect(state.locations.length).toBe(uniqueLocations.length)

            for (let i = 0; i < uniqueLocations.length; i++) {
              expect(state.locations[i].id).toBe(uniqueLocations[i].id)
              expect(state.locations[i].name).toBe(uniqueLocations[i].name)
              expect(state.locations[i].latitude).toBe(uniqueLocations[i].latitude)
              expect(state.locations[i].longitude).toBe(uniqueLocations[i].longitude)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should correctly remove locations by ID and maintain remaining order', () => {
      fc.assert(
        fc.property(
          fc.array(locationArbitrary, { minLength: 2, maxLength: 8 }),
          fc.integer({ min: 0, max: 7 }),
          (locations, removeIndex) => {
            // For any list of locations, removing one by ID should preserve others in order
            let state: LocationState = { locations: [] }

            // Make locations unique by ID and add them
            const uniqueLocations = locations.map((loc, index) => ({
              ...loc,
              id: `loc-${index}`
            }))

            for (const location of uniqueLocations) {
              state = addLocation(state, location)
            }

            // Remove a location if it exists
            if (removeIndex < state.locations.length) {
              const locationToRemove = state.locations[removeIndex]
              const originalLength = state.locations.length

              state = removeLocation(state, locationToRemove.id)

              // Should have one fewer location
              expect(state.locations.length).toBe(originalLength - 1)

              // The removed location should not be present
              expect(state.locations.find(loc => loc.id === locationToRemove.id)).toBeUndefined()

              // Remaining locations should maintain their relative order
              const remainingOriginal = uniqueLocations.filter((_, i) => i !== removeIndex)
              expect(state.locations.length).toBe(remainingOriginal.length)

              for (let i = 0; i < remainingOriginal.length; i++) {
                expect(state.locations[i].id).toBe(remainingOriginal[i].id)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should clear dependent calculations when locations are removed', () => {
      fc.assert(
        fc.property(
          fc.array(locationArbitrary, { minLength: 2, maxLength: 5 }),
          (locations) => {
            // For any state with calculations, removing a location should clear them
            let state: LocationState = { locations: [] }

            // Add locations
            const uniqueLocations = locations.map((loc, index) => ({
              ...loc,
              id: `loc-${index}`
            }))

            for (const location of uniqueLocations) {
              state = addLocation(state, location)
            }

            // Simulate having calculations
            state.centerPoint = { latitude: 40.7128, longitude: -74.0060 }
            state.fairMeetingArea = {
              type: 'Polygon',
              coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
            }

            // Remove any location
            if (state.locations.length > 0) {
              const locationToRemove = state.locations[0]
              state = removeLocation(state, locationToRemove.id)

              // Dependent calculations should be cleared
              expect(state.centerPoint).toBeUndefined()
              expect(state.fairMeetingArea).toBeUndefined()
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle removal of non-existent location IDs gracefully', () => {
      fc.assert(
        fc.property(
          fc.array(locationArbitrary, { minLength: 1, maxLength: 5 }),
          fc.string({ minLength: 1 }),
          (locations, nonExistentId) => {
            // For any state, removing a non-existent ID should not change the location list
            let state: LocationState = { locations: [] }

            // Add locations with known IDs
            const uniqueLocations = locations.map((loc, index) => ({
              ...loc,
              id: `loc-${index}`
            }))

            for (const location of uniqueLocations) {
              state = addLocation(state, location)
            }

            const originalLength = state.locations.length
            const originalLocations = [...state.locations]

            // Try to remove a non-existent ID (make sure it's different from existing ones)
            const fakeId = `fake-${nonExistentId}-${Date.now()}`
            state = removeLocation(state, fakeId)

            // Location list should be unchanged
            expect(state.locations.length).toBe(originalLength)
            expect(state.locations).toEqual(originalLocations)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should maintain state consistency through mixed add/remove operations', () => {
      fc.assert(
        fc.property(
          fc.array(locationOperationArbitrary, { minLength: 1, maxLength: 20 }),
          (operations) => {
            // For any sequence of mixed operations, state should remain consistent
            let state: LocationState = { locations: [] }
            let nextId = 0

            for (const operation of operations) {
              if (operation.type === 'add') {
                // Ensure unique ID for additions
                const location = {
                  ...operation.location,
                  id: `op-${nextId++}`
                }
                state = addLocation(state, location)
              } else {
                // For removals, use an existing ID if available
                if (state.locations.length > 0) {
                  const randomIndex = Math.floor(Math.random() * state.locations.length)
                  const locationId = state.locations[randomIndex].id
                  state = removeLocation(state, locationId)
                }
              }

              // State should always be consistent
              expect(state.locations.length).toBeLessThanOrEqual(12)
              expect(state.locations.length).toBeGreaterThanOrEqual(0)

              // All location IDs should be unique
              const ids = state.locations.map(loc => loc.id)
              const uniqueIds = new Set(ids)
              expect(uniqueIds.size).toBe(ids.length)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})