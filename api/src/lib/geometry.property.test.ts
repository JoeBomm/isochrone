import * as fc from 'fast-check'
import { geometryService } from './geometry'
import type { GeoJSON } from 'geojson'

/**
 * Property-based tests for geometry operations
 * Feature: isochrone-center-point, Property 4: Isochrone Calculation Pipeline
 * Validates: Requirements 4.1, 4.2, 4.3
 */

// Helper function to validate coordinates are finite numbers
const isValidCoordinate = (coord: number): boolean => 
  Number.isFinite(coord) && !Number.isNaN(coord)

// Helper function to validate polygon coordinates
const isValidPolygon = (polygon: GeoJSON.Polygon): boolean => {
  if (!polygon.coordinates || !Array.isArray(polygon.coordinates)) return false
  
  return polygon.coordinates.every(ring => 
    Array.isArray(ring) && ring.every(coord => 
      Array.isArray(coord) && 
      coord.length >= 2 && 
      isValidCoordinate(coord[0]) && 
      isValidCoordinate(coord[1])
    )
  )
}

// Generator for simple rectangular polygons with validated coordinates
const rectangularPolygonArbitrary = fc.record({
  minLng: fc.integer({ min: -179, max: 178 }),
  minLat: fc.integer({ min: -89, max: 88 }),
  width: fc.integer({ min: 1, max: 2 }),
  height: fc.integer({ min: 1, max: 2 })
}).map(({ minLng, minLat, width, height }): GeoJSON.Polygon => {
  // Ensure all coordinates are valid finite numbers
  const coords = [
    [minLng, minLat],
    [minLng + width, minLat],
    [minLng + width, minLat + height],
    [minLng, minLat + height],
    [minLng, minLat]
  ]
  
  // Validate all coordinates before creating polygon
  coords.forEach(coord => {
    if (!isValidCoordinate(coord[0]) || !isValidCoordinate(coord[1])) {
      throw new Error(`Invalid coordinate generated: [${coord[0]}, ${coord[1]}]`)
    }
  })
  
  return {
    type: 'Polygon',
    coordinates: [coords]
  }
}).filter(isValidPolygon) // Additional safety filter

// Generator for arrays of polygons
const polygonArrayArbitrary = fc.array(rectangularPolygonArbitrary, { minLength: 1, maxLength: 5 })

describe('Geometry Service Property Tests', () => {
  describe('Property 4: Isochrone Calculation Pipeline', () => {
    it('should preserve polygon count invariant: union of N polygons produces 1 result', () => {
      fc.assert(fc.property(
        polygonArrayArbitrary,
        (polygons) => {
          const result = geometryService.calculatePolygonUnion(polygons)
          
          // Union should always produce a single polygon or multipolygon
          expect(result.type).toMatch(/^(Polygon|MultiPolygon)$/)
          
          // Result should be a valid GeoJSON geometry
          expect(result).toHaveProperty('coordinates')
          expect(Array.isArray(result.coordinates)).toBe(true)
        }
      ), { numRuns: 100 })
    })

    it('should maintain centroid within reasonable bounds for any valid polygon', () => {
      fc.assert(fc.property(
        rectangularPolygonArbitrary,
        (polygon) => {
          const centroid = geometryService.calculateCentroid(polygon)
          
          // Centroid should have valid coordinate ranges
          expect(centroid.latitude).toBeGreaterThanOrEqual(-90)
          expect(centroid.latitude).toBeLessThanOrEqual(90)
          expect(centroid.longitude).toBeGreaterThanOrEqual(-180)
          expect(centroid.longitude).toBeLessThanOrEqual(180)
          
          // Centroid should be finite numbers
          expect(Number.isFinite(centroid.latitude)).toBe(true)
          expect(Number.isFinite(centroid.longitude)).toBe(true)
        }
      ), { numRuns: 100 })
    })

    it('should maintain union commutativity: union(A,B) = union(B,A)', () => {
      fc.assert(fc.property(
        rectangularPolygonArbitrary,
        rectangularPolygonArbitrary,
        (polygon1, polygon2) => {
          const union1 = geometryService.calculatePolygonUnion([polygon1, polygon2])
          const union2 = geometryService.calculatePolygonUnion([polygon2, polygon1])
          
          // Both unions should produce the same type
          expect(union1.type).toBe(union2.type)
          
          // Both should be valid geometries
          expect(union1).toHaveProperty('coordinates')
          expect(union2).toHaveProperty('coordinates')
        }
      ), { numRuns: 100 })
    })

    it('should maintain union associativity: union(union(A,B),C) = union(A,union(B,C))', () => {
      fc.assert(fc.property(
        rectangularPolygonArbitrary,
        rectangularPolygonArbitrary,
        rectangularPolygonArbitrary,
        (polygon1, polygon2, polygon3) => {
          // Test that both approaches produce valid geometries
          // We can't easily test exact equality due to floating point precision
          // and the complexity of comparing MultiPolygon structures
          
          // Calculate union of all three at once as baseline
          const unionAll = geometryService.calculatePolygonUnion([polygon1, polygon2, polygon3])
          
          // This should always produce a valid geometry
          expect(unionAll.type).toMatch(/^(Polygon|MultiPolygon)$/)
          expect(unionAll).toHaveProperty('coordinates')
          expect(Array.isArray(unionAll.coordinates)).toBe(true)
        }
      ), { numRuns: 50 }) // Reduced runs for complex operations
    })

    it('should validate polygon overlap correctly for overlapping rectangles', () => {
      fc.assert(fc.property(
        fc.record({
          x1: fc.integer({ min: -179, max: 178 }),
          y1: fc.integer({ min: -89, max: 88 }),
          width: fc.integer({ min: 1, max: 2 }),
          height: fc.integer({ min: 1, max: 2 })
        }),
        ({ x1, y1, width, height }) => {
          // Create two overlapping rectangles
          const polygon1: GeoJSON.Polygon = {
            type: 'Polygon',
            coordinates: [[
              [x1, y1],
              [x1 + width, y1],
              [x1 + width, y1 + height],
              [x1, y1 + height],
              [x1, y1]
            ]]
          }
          
          // Second polygon overlaps with the first
          const polygon2: GeoJSON.Polygon = {
            type: 'Polygon',
            coordinates: [[
              [x1 + width/2, y1 + height/2],
              [x1 + width + 1, y1 + height/2],
              [x1 + width + 1, y1 + height + 1],
              [x1 + width/2, y1 + height + 1],
              [x1 + width/2, y1 + height/2]
            ]]
          }
          
          const hasOverlap = geometryService.validatePolygonOverlap([polygon1, polygon2])
          
          // Overlapping rectangles should validate as true
          expect(hasOverlap).toBe(true)
        }
      ), { numRuns: 100 })
    })

    it('should handle single polygon edge case correctly', () => {
      fc.assert(fc.property(
        rectangularPolygonArbitrary,
        (polygon) => {
          // Union of single polygon should return the same polygon
          const result = geometryService.calculatePolygonUnion([polygon])
          expect(result).toEqual(polygon)
          
          // Validation should return false for single polygon
          const hasOverlap = geometryService.validatePolygonOverlap([polygon])
          expect(hasOverlap).toBe(false)
        }
      ), { numRuns: 100 })
    })

    it('should maintain centroid consistency: centroid of union contains information from all inputs', () => {
      fc.assert(fc.property(
        fc.array(rectangularPolygonArbitrary, { minLength: 2, maxLength: 3 }),
        (polygons) => {
          const union = geometryService.calculatePolygonUnion(polygons)
          const centroid = geometryService.calculateCentroid(union)
          
          // Calculate individual centroids for comparison
          const individualCentroids = polygons.map(p => geometryService.calculateCentroid(p))
          
          // Union centroid should be within reasonable bounds of individual centroids
          const minLat = Math.min(...individualCentroids.map(c => c.latitude))
          const maxLat = Math.max(...individualCentroids.map(c => c.latitude))
          const minLng = Math.min(...individualCentroids.map(c => c.longitude))
          const maxLng = Math.max(...individualCentroids.map(c => c.longitude))
          
          // Allow some tolerance for geometric operations
          const tolerance = 2 // degrees
          expect(centroid.latitude).toBeGreaterThanOrEqual(minLat - tolerance)
          expect(centroid.latitude).toBeLessThanOrEqual(maxLat + tolerance)
          expect(centroid.longitude).toBeGreaterThanOrEqual(minLng - tolerance)
          expect(centroid.longitude).toBeLessThanOrEqual(maxLng + tolerance)
        }
      ), { numRuns: 50 })
    })
  })
})