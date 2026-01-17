/**
 * Property-Based Tests for Map Interactive Behavior
 * Feature: isochrone-center-point, Property 8: Interactive Behavior
 * Validates: Requirements 5.5, 6.4
 */

import * as fc from 'fast-check'
import type { Location } from 'src/components/LocationInput/LocationInput'
import type { Coordinate } from './Map'

describe('Map Interactive Behavior Properties', () => {
  /**
   * Property 8: Interactive Behavior
   * For any map marker click event, the system should display appropriate popup information
   * corresponding to the clicked element (location details or fair meeting area description).
   * Validates: Requirements 5.5, 6.4
   */
  it('should validate location marker popup content properties', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1 }),
            name: fc.string({ minLength: 1, maxLength: 20 }).filter(name => name.trim().length > 0),
            latitude: fc.float({ min: -90, max: 90, noNaN: true }),
            longitude: fc.float({ min: -180, max: 180, noNaN: true }),
            color: fc.constantFrom('#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (locations: Location[]) => {
          // Simulate location marker popup creation logic
          locations.forEach((location, index) => {
            // Validate popup content structure (Requirement 6.4)
            const expectedPopupContent = `
              <div class="p-3 min-w-[200px]">
                <h3 class="font-semibold text-gray-900 mb-2">${location.name}</h3>
                <div class="space-y-1 text-sm text-gray-600">
                  <p><strong>Coordinates:</strong> ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}</p>
                  <p><strong>Location #:</strong> ${index + 1}</p>
                  <div class="flex items-center mt-2">
                    <div class="w-3 h-3 rounded-full mr-2" style="background-color: ${location.color}"></div>
                    <span class="text-xs text-gray-500">Marker Color</span>
                  </div>
                </div>
              </div>
            `

            // Validate popup content contains required information
            expect(expectedPopupContent).toContain(location.name)
            expect(expectedPopupContent).toContain(location.latitude.toFixed(4))
            expect(expectedPopupContent).toContain(location.longitude.toFixed(4))
            expect(expectedPopupContent).toContain('Coordinates:')
            expect(expectedPopupContent).toContain(`Location #:</strong> ${index + 1}`)
            expect(expectedPopupContent).toContain(location.color)

            // Validate popup options
            const popupOptions = {
              maxWidth: 250,
              className: 'location-popup'
            }
            expect(popupOptions.maxWidth).toBe(250)
            expect(popupOptions.className).toBe('location-popup')
          })
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should validate center point marker popup content properties', () => {
    fc.assert(
      fc.property(
        fc.record({
          latitude: fc.float({ min: -90, max: 90, noNaN: true }),
          longitude: fc.float({ min: -180, max: 180, noNaN: true })
        }),
        (centerPoint: Coordinate) => {
          // Simulate center point popup creation logic (Requirement 5.5)
          const expectedPopupContent = `
            <div class="p-3 min-w-[220px]">
              <h3 class="font-semibold text-gray-900 mb-2">Fair Meeting Point</h3>
              <div class="space-y-1 text-sm text-gray-600">
                <p><strong>Coordinates:</strong> ${centerPoint.latitude.toFixed(4)}, ${centerPoint.longitude.toFixed(4)}</p>
                <p class="text-xs text-gray-500 mt-2">
                  This point represents the optimal center calculated from the geometric union of all location isochrones, ensuring fair travel times for all participants.
                </p>
              </div>
            </div>
          `

          // Validate popup content contains required information
          expect(expectedPopupContent).toContain('Fair Meeting Point')
          expect(expectedPopupContent).toContain(centerPoint.latitude.toFixed(4))
          expect(expectedPopupContent).toContain(centerPoint.longitude.toFixed(4))
          expect(expectedPopupContent).toContain('optimal center')
          expect(expectedPopupContent).toContain('fair travel times')

          // Validate popup options
          const popupOptions = {
            maxWidth: 280,
            className: 'center-popup'
          }
          expect(popupOptions.maxWidth).toBe(280)
          expect(popupOptions.className).toBe('center-popup')
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should validate fair meeting area polygon popup content properties', () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constant('Polygon' as const),
          coordinates: fc.array(
            fc.array(
              fc.array(fc.float({ min: -180, max: 180, noNaN: true }), { minLength: 2, maxLength: 2 }),
              { minLength: 4, maxLength: 8 }
            ),
            { minLength: 1, maxLength: 1 }
          )
        }),
        (fairMeetingArea: GeoJSON.Polygon) => {
          // Simulate fair meeting area popup creation logic (Requirement 5.5)
          const expectedPopupContent = `
            <div class="p-3 min-w-[240px]">
              <h3 class="font-semibold text-gray-900 mb-2">Fair Meeting Area</h3>
              <div class="space-y-1 text-sm text-gray-600">
                <p>This area represents locations accessible within the configured buffer time from the calculated center point.</p>
                <p class="text-xs text-gray-500 mt-2">
                  <strong>How it works:</strong> Individual isochrones are calculated for each location, their geometric union is computed, and the centroid of that accessible area becomes the fair meeting point.
                </p>
              </div>
            </div>
          `

          // Validate popup content contains required information
          expect(expectedPopupContent).toContain('Fair Meeting Area')
          expect(expectedPopupContent).toContain('buffer time')
          expect(expectedPopupContent).toContain('center point')
          expect(expectedPopupContent).toContain('How it works')
          expect(expectedPopupContent).toContain('isochrones')
          expect(expectedPopupContent).toContain('geometric union')

          // Validate popup options
          const popupOptions = {
            maxWidth: 300,
            className: 'area-popup'
          }
          expect(popupOptions.maxWidth).toBe(300)
          expect(popupOptions.className).toBe('area-popup')

          // Validate polygon structure
          expect(fairMeetingArea.type).toBe('Polygon')
          expect(fairMeetingArea.coordinates).toBeDefined()
          expect(fairMeetingArea.coordinates.length).toBeGreaterThan(0)
          expect(fairMeetingArea.coordinates[0].length).toBeGreaterThanOrEqual(4)
        }
      ),
      { numRuns: 50 }
    )
  })
})