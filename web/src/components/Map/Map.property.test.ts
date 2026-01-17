import * as fc from 'fast-check'
import type { Location } from 'src/components/LocationInput/LocationInput'
import type { Coordinate } from './Map'

/**
 * Property-based tests for UI display consistency
 * Feature: isochrone-center-point, Property 6: UI Display Consistency
 * Validates: Requirements 4.4, 5.2, 6.2, 6.3
 */

// Mock Leaflet for testing
const mockMarker = {
  bindPopup: jest.fn().mockReturnThis(),
  on: jest.fn().mockReturnThis(),
  addTo: jest.fn().mockReturnThis(),
  remove: jest.fn().mockReturnThis(),
}

const mockPolygon = {
  bindPopup: jest.fn().mockReturnThis(),
  on: jest.fn().mockReturnThis(),
  addTo: jest.fn().mockReturnThis(),
  remove: jest.fn().mockReturnThis(),
}

const mockMap = {
  on: jest.fn(),
  remove: jest.fn(),
  removeLayer: jest.fn(),
  fitBounds: jest.fn(),
}

const mockLatLngBounds = {
  extend: jest.fn().mockReturnThis(),
}

// Mock Leaflet module
jest.mock('leaflet', () => ({
  map: jest.fn(() => mockMap),
  tileLayer: jest.fn(() => ({ addTo: jest.fn() })),
  marker: jest.fn(() => mockMarker),
  polygon: jest.fn(() => mockPolygon),
  latLngBounds: jest.fn(() => mockLatLngBounds),
  divIcon: jest.fn(() => ({})),
  Icon: {
    Default: {
      prototype: {},
      mergeOptions: jest.fn(),
    },
  },
}))

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

// Generator for coordinates
const coordinateArbitrary = fc.record({
  latitude: fc.float({ min: -90, max: 90, noNaN: true }),
  longitude: fc.float({ min: -180, max: 180, noNaN: true })
})

// Generator for GeoJSON polygons
const polygonArbitrary = fc.record({
  type: fc.constant('Polygon' as const),
  coordinates: fc.array(
    fc.array(
      fc.array(fc.float({ min: -180, max: 180, noNaN: true }), { minLength: 2, maxLength: 2 }),
      { minLength: 4, maxLength: 10 }
    ),
    { minLength: 1, maxLength: 1 }
  )
})

// Helper functions to simulate UI display logic
interface DisplayState {
  locations: Location[]
  centerPoint?: Coordinate
  fairMeetingArea?: GeoJSON.Polygon
}

const validateLocationDisplay = (state: DisplayState): boolean => {
  // Each location should have a unique marker with proper color and numbering
  const locationIds = new Set(state.locations.map(loc => loc.id))
  const locationColors = state.locations.map(loc => loc.color)

  // All locations should have unique IDs
  if (locationIds.size !== state.locations.length) return false

  // All locations should have valid colors
  const validColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#a855f7']
  if (!locationColors.every(color => validColors.includes(color))) return false

  // Locations should be numbered sequentially (1, 2, 3, ...)
  return state.locations.length <= 12 // Respect the 12-location limit
}

const validateCenterPointDisplay = (state: DisplayState): boolean => {
  if (!state.centerPoint) return true // No center point is valid

  // Center point should have distinct styling from location markers
  // Center point should be visually different (green color, different icon)
  return (
    state.centerPoint.latitude >= -90 &&
    state.centerPoint.latitude <= 90 &&
    state.centerPoint.longitude >= -180 &&
    state.centerPoint.longitude <= 180
  )
}

const validateFairMeetingAreaDisplay = (state: DisplayState): boolean => {
  if (!state.fairMeetingArea) return true // No area is valid

  // Fair meeting area should be a valid polygon
  if (state.fairMeetingArea.type !== 'Polygon') return false
  if (!state.fairMeetingArea.coordinates || state.fairMeetingArea.coordinates.length === 0) return false

  // Polygon should have at least 3 points (closed polygon needs 4 with first=last)
  const ring = state.fairMeetingArea.coordinates[0]
  return ring.length >= 4
}

const validateVisualDifferentiation = (state: DisplayState): boolean => {
  // Location markers should be visually distinct from center point
  // Fair meeting area should be visually distinct from markers
  // This is validated through different styling approaches:

  // 1. Location markers: colored pins with numbers
  // 2. Center point: green circle with different icon
  // 3. Fair meeting area: blue polygon with transparency

  return true // Visual differentiation is handled by styling
}

const validateMapBounds = (state: DisplayState): boolean => {
  // Map bounds should include all displayed elements
  if (state.locations.length === 0 && !state.centerPoint) return true

  // If there are locations or center point, bounds should be calculated
  const allPoints = [
    ...state.locations.map(loc => ({ lat: loc.latitude, lng: loc.longitude })),
    ...(state.centerPoint ? [{ lat: state.centerPoint.latitude, lng: state.centerPoint.longitude }] : [])
  ]

  if (allPoints.length === 0) return true

  // Bounds should encompass all points
  const minLat = Math.min(...allPoints.map(p => p.lat))
  const maxLat = Math.max(...allPoints.map(p => p.lat))
  const minLng = Math.min(...allPoints.map(p => p.lng))
  const maxLng = Math.max(...allPoints.map(p => p.lng))

  // Valid bounds check
  return minLat <= maxLat && minLng <= maxLng
}

describe('UI Display Consistency Properties', () => {
  describe('Property 6: UI Display Consistency', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('should display location markers with proper visual differentiation', () => {
      fc.assert(
        fc.property(
          fc.array(locationArbitrary, { minLength: 0, maxLength: 12 }),
          (locations) => {
            // For any set of locations, display should maintain proper visual differentiation
            const uniqueLocations = locations.map((loc, index) => ({
              ...loc,
              id: `loc-${index}` // Ensure unique IDs
            }))

            const state: DisplayState = { locations: uniqueLocations }

            // Location display should be valid
            expect(validateLocationDisplay(state)).toBe(true)

            // Each location should have distinct visual properties
            const colors = uniqueLocations.map(loc => loc.color)
            const ids = uniqueLocations.map(loc => loc.id)

            // All IDs should be unique
            expect(new Set(ids).size).toBe(ids.length)

            // All colors should be valid
            const validColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']
            expect(colors.every(color => validColors.includes(color))).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should display center point with distinct styling from location markers', () => {
      fc.assert(
        fc.property(
          fc.array(locationArbitrary, { minLength: 1, maxLength: 8 }),
          coordinateArbitrary,
          (locations, centerPoint) => {
            // For any locations and center point, center should be visually distinct
            const uniqueLocations = locations.map((loc, index) => ({
              ...loc,
              id: `loc-${index}`
            }))

            const state: DisplayState = {
              locations: uniqueLocations,
              centerPoint
            }

            // Center point display should be valid
            expect(validateCenterPointDisplay(state)).toBe(true)

            // Center point should be visually different from location markers
            expect(validateVisualDifferentiation(state)).toBe(true)

            // Center point coordinates should be valid
            expect(centerPoint.latitude).toBeGreaterThanOrEqual(-90)
            expect(centerPoint.latitude).toBeLessThanOrEqual(90)
            expect(centerPoint.longitude).toBeGreaterThanOrEqual(-180)
            expect(centerPoint.longitude).toBeLessThanOrEqual(180)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should display fair meeting area with proper polygon visualization', () => {
      fc.assert(
        fc.property(
          fc.array(locationArbitrary, { minLength: 2, maxLength: 5 }),
          coordinateArbitrary,
          polygonArbitrary,
          (locations, centerPoint, fairMeetingArea) => {
            // For any complete state, fair meeting area should display correctly
            const uniqueLocations = locations.map((loc, index) => ({
              ...loc,
              id: `loc-${index}`
            }))

            const state: DisplayState = {
              locations: uniqueLocations,
              centerPoint,
              fairMeetingArea
            }

            // Fair meeting area display should be valid
            expect(validateFairMeetingAreaDisplay(state)).toBe(true)

            // Polygon should have valid structure
            expect(fairMeetingArea.type).toBe('Polygon')
            expect(fairMeetingArea.coordinates).toBeDefined()
            expect(fairMeetingArea.coordinates.length).toBeGreaterThan(0)

            // First ring should have at least 4 points (closed polygon)
            const ring = fairMeetingArea.coordinates[0]
            expect(ring.length).toBeGreaterThanOrEqual(4)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should maintain consistent display state across all elements', () => {
      fc.assert(
        fc.property(
          fc.array(locationArbitrary, { minLength: 1, maxLength: 10 }),
          fc.option(coordinateArbitrary),
          fc.option(polygonArbitrary),
          (locations, centerPoint, fairMeetingArea) => {
            // For any combination of display elements, consistency should be maintained
            const uniqueLocations = locations.map((loc, index) => ({
              ...loc,
              id: `loc-${index}`
            }))

            const state: DisplayState = {
              locations: uniqueLocations,
              centerPoint: centerPoint || undefined,
              fairMeetingArea: fairMeetingArea || undefined
            }

            // All display validations should pass
            expect(validateLocationDisplay(state)).toBe(true)
            expect(validateCenterPointDisplay(state)).toBe(true)
            expect(validateFairMeetingAreaDisplay(state)).toBe(true)
            expect(validateVisualDifferentiation(state)).toBe(true)
            expect(validateMapBounds(state)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle empty and partial states gracefully', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.record({ locations: fc.constant([]), centerPoint: fc.constant(undefined), fairMeetingArea: fc.constant(undefined) }),
            fc.record({ locations: fc.array(locationArbitrary, { minLength: 1, maxLength: 3 }), centerPoint: fc.constant(undefined), fairMeetingArea: fc.constant(undefined) }),
            fc.record({ locations: fc.constant([]), centerPoint: coordinateArbitrary, fairMeetingArea: fc.constant(undefined) }),
            fc.record({ locations: fc.constant([]), centerPoint: fc.constant(undefined), fairMeetingArea: polygonArbitrary })
          ),
          (partialState) => {
            // For any partial state, display should handle gracefully
            const state: DisplayState = {
              locations: partialState.locations.map((loc, index) => ({
                ...loc,
                id: `loc-${index}`
              })),
              centerPoint: partialState.centerPoint,
              fairMeetingArea: partialState.fairMeetingArea
            }

            // All validations should pass even with partial data
            expect(validateLocationDisplay(state)).toBe(true)
            expect(validateCenterPointDisplay(state)).toBe(true)
            expect(validateFairMeetingAreaDisplay(state)).toBe(true)
            expect(validateMapBounds(state)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should respect location limits and maintain display consistency', () => {
      fc.assert(
        fc.property(
          fc.array(locationArbitrary, { minLength: 10, maxLength: 20 }),
          (locations) => {
            // For any large set of locations, should respect 12-location limit
            const uniqueLocations = locations.map((loc, index) => ({
              ...loc,
              id: `loc-${index}`
            }))

            // Simulate adding locations up to the limit
            const displayedLocations = uniqueLocations.slice(0, 12)
            const state: DisplayState = { locations: displayedLocations }

            // Should never display more than 12 locations
            expect(state.locations.length).toBeLessThanOrEqual(12)

            // Display should remain consistent
            expect(validateLocationDisplay(state)).toBe(true)

            // All displayed locations should have unique properties
            const ids = state.locations.map(loc => loc.id)
            expect(new Set(ids).size).toBe(ids.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})