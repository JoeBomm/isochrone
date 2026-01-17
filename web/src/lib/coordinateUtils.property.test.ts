import * as fc from 'fast-check'
import { parseCoordinates, isValidCoordinate, formatCoordinate } from './coordinateUtils'

/**
 * Property-based tests for coordinate validation and geocoding
 * Feature: isochrone-center-point, Property 2: Coordinate Validation and Geocoding
 * Validates: Requirements 3.1, 3.2, 8.3
 */

describe('Coordinate Validation Properties', () => {
  describe('Property 2: Coordinate Validation and Geocoding', () => {
    it('should validate coordinate ranges correctly for all valid coordinates', () => {
      fc.assert(
        fc.property(
          fc.float({ min: -90, max: 90, noNaN: true }),
          fc.float({ min: -180, max: 180, noNaN: true }),
          (latitude, longitude) => {
            // For any valid latitude and longitude, isValidCoordinate should return true
            const result = isValidCoordinate(latitude, longitude)
            expect(result).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject coordinates outside valid ranges', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // Invalid latitudes - use Math.fround for 32-bit float compatibility
            fc.float({ min: Math.fround(-1000), max: Math.fround(-90.1), noNaN: true }),
            fc.float({ min: Math.fround(90.1), max: Math.fround(1000), noNaN: true })
          ),
          fc.float({ min: -180, max: 180, noNaN: true }),
          (invalidLatitude, longitude) => {
            // For any invalid latitude, isValidCoordinate should return false
            const result = isValidCoordinate(invalidLatitude, longitude)
            expect(result).toBe(false)
          }
        ),
        { numRuns: 100 }
      )

      fc.assert(
        fc.property(
          fc.float({ min: -90, max: 90, noNaN: true }),
          fc.oneof(
            // Invalid longitudes - use Math.fround for 32-bit float compatibility
            fc.float({ min: Math.fround(-1000), max: Math.fround(-180.1), noNaN: true }),
            fc.float({ min: Math.fround(180.1), max: Math.fround(1000), noNaN: true })
          ),
          (latitude, invalidLongitude) => {
            // For any invalid longitude, isValidCoordinate should return false
            const result = isValidCoordinate(latitude, invalidLongitude)
            expect(result).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should parse valid coordinate strings correctly', () => {
      fc.assert(
        fc.property(
          // Use more reasonable float ranges to avoid scientific notation issues
          fc.float({ min: -90, max: 90, noNaN: true }).filter(n => Math.abs(n) > 1e-10),
          fc.float({ min: -180, max: 180, noNaN: true }).filter(n => Math.abs(n) > 1e-10),
          (latitude, longitude) => {
            // For any valid coordinates, parsing their string representation should return equivalent values
            const coordString = `${latitude},${longitude}`
            const parsed = parseCoordinates(coordString)

            expect(parsed).not.toBeNull()
            if (parsed) {
              expect(parsed.latitude).toBeCloseTo(latitude, 10)
              expect(parsed.longitude).toBeCloseTo(longitude, 10)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle coordinate string formatting with spaces', () => {
      fc.assert(
        fc.property(
          // Use more reasonable float ranges to avoid scientific notation issues
          fc.float({ min: -90, max: 90, noNaN: true }).filter(n => Math.abs(n) > 1e-10),
          fc.float({ min: -180, max: 180, noNaN: true }).filter(n => Math.abs(n) > 1e-10),
          fc.integer({ min: 0, max: 5 }), // number of spaces
          (latitude, longitude, spaces) => {
            // For any valid coordinates, parsing with various spacing should work
            const spaceString = ' '.repeat(spaces)
            const coordString = `${latitude},${spaceString}${longitude}`
            const parsed = parseCoordinates(coordString)

            expect(parsed).not.toBeNull()
            if (parsed) {
              expect(parsed.latitude).toBeCloseTo(latitude, 10)
              expect(parsed.longitude).toBeCloseTo(longitude, 10)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject invalid coordinate string formats', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string().filter(s => !s.match(/^-?\d+\.?\d*,\s*-?\d+\.?\d*$/)),
            fc.constant('not-a-coordinate'),
            fc.constant('123'),
            fc.constant('123,'),
            fc.constant(',123'),
            fc.constant('abc,def')
          ),
          (invalidString) => {
            // For any invalid coordinate string format, parsing should return null
            const result = parseCoordinates(invalidString)
            expect(result).toBeNull()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should format and parse coordinates consistently (round-trip property)', () => {
      fc.assert(
        fc.property(
          // Use integers for more predictable round-trip behavior
          fc.integer({ min: -90, max: 90 }),
          fc.integer({ min: -180, max: 180 }),
          (latitude, longitude) => {
            // For any valid coordinate, formatting then parsing should preserve the values
            const coordinate = { latitude, longitude }
            const formatted = formatCoordinate(coordinate)
            const parsed = parseCoordinates(formatted.replace(' ', ''))

            expect(parsed).not.toBeNull()
            if (parsed) {
              // Allow for small floating point precision differences
              expect(parsed.latitude).toBeCloseTo(latitude, 4)
              expect(parsed.longitude).toBeCloseTo(longitude, 4)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject coordinates outside valid ranges in string parsing', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.float({ min: Math.fround(-1000), max: Math.fround(-90.1), noNaN: true }),
            fc.float({ min: Math.fround(90.1), max: Math.fround(1000), noNaN: true })
          ),
          fc.float({ min: -180, max: 180, noNaN: true }),
          (invalidLatitude, longitude) => {
            // For any coordinate string with invalid latitude, parsing should return null
            const coordString = `${invalidLatitude},${longitude}`
            const result = parseCoordinates(coordString)
            expect(result).toBeNull()
          }
        ),
        { numRuns: 100 }
      )

      fc.assert(
        fc.property(
          fc.float({ min: -90, max: 90, noNaN: true }),
          fc.oneof(
            fc.float({ min: Math.fround(-1000), max: Math.fround(-180.1), noNaN: true }),
            fc.float({ min: Math.fround(180.1), max: Math.fround(1000), noNaN: true })
          ),
          (latitude, invalidLongitude) => {
            // For any coordinate string with invalid longitude, parsing should return null
            const coordString = `${latitude},${invalidLongitude}`
            const result = parseCoordinates(coordString)
            expect(result).toBeNull()
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})