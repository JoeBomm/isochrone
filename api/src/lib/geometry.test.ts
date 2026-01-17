import { geometryService, TurfGeometryService } from './geometry'
import type { GeoJSON } from 'geojson'

describe('TurfGeometryService', () => {
  let service: TurfGeometryService

  beforeEach(() => {
    service = new TurfGeometryService()
  })

  describe('calculatePolygonUnion', () => {
    it('should return single polygon when only one provided', () => {
      const polygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
      }

      const result = service.calculatePolygonUnion([polygon])
      expect(result).toEqual(polygon)
    })

    it('should union two overlapping polygons', () => {
      const polygon1: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]
      }
      const polygon2: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]]
      }

      const result = service.calculatePolygonUnion([polygon1, polygon2])
      expect(result.type).toBe('Polygon')
    })

    it('should throw error when no polygons provided', () => {
      expect(() => service.calculatePolygonUnion([])).toThrow('No polygons provided for union calculation')
    })

    it('should throw error when null polygons provided', () => {
      expect(() => service.calculatePolygonUnion(null as any)).toThrow('No polygons provided for union calculation')
    })
  })

  describe('calculateCentroid', () => {
    it('should calculate centroid of a simple square polygon', () => {
      const polygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]
      }

      const result = service.calculateCentroid(polygon)
      expect(result.latitude).toBeCloseTo(1, 5)
      expect(result.longitude).toBeCloseTo(1, 5)
    })

    it('should calculate centroid of a multipolygon', () => {
      const multipolygon: GeoJSON.MultiPolygon = {
        type: 'MultiPolygon',
        coordinates: [
          [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]]
        ]
      }

      const result = service.calculateCentroid(multipolygon)
      expect(result.latitude).toBeDefined()
      expect(result.longitude).toBeDefined()
    })

    it('should throw error when no polygon provided', () => {
      expect(() => service.calculateCentroid(null as any)).toThrow('No polygon provided for centroid calculation')
    })
  })

  describe('validatePolygonOverlap', () => {
    it('should return false for less than 2 polygons', () => {
      const polygon: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
      }

      expect(service.validatePolygonOverlap([])).toBe(false)
      expect(service.validatePolygonOverlap([polygon])).toBe(false)
    })

    it('should return true for overlapping polygons', () => {
      const polygon1: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]
      }
      const polygon2: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]]
      }

      expect(service.validatePolygonOverlap([polygon1, polygon2])).toBe(true)
    })

    it('should return true for adjacent polygons', () => {
      const polygon1: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
      }
      const polygon2: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]]
      }

      expect(service.validatePolygonOverlap([polygon1, polygon2])).toBe(true)
    })

    it('should return false for null input', () => {
      expect(service.validatePolygonOverlap(null as any)).toBe(false)
    })
  })

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(geometryService).toBeInstanceOf(TurfGeometryService)
    })
  })
})