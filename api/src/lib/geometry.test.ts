import { geometryService, TurfGeometryService, type Location } from './geometry'
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

  describe('calculateGeographicCentroid', () => {
    it('should calculate centroid of two locations', () => {
      const locations = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 2, longitude: 2 } }
      ]

      const result = service.calculateGeographicCentroid(locations)
      expect(result.latitude).toBeCloseTo(1, 5)
      expect(result.longitude).toBeCloseTo(1, 5)
    })

    it('should calculate centroid of multiple locations', () => {
      const locations = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 3, longitude: 3 } },
        { id: '3', name: 'Location 3', coordinate: { latitude: 6, longitude: 6 } }
      ]

      const result = service.calculateGeographicCentroid(locations)
      expect(result.latitude).toBeCloseTo(3, 5)
      expect(result.longitude).toBeCloseTo(3, 5)
    })

    it('should throw error when no locations provided', () => {
      expect(() => service.calculateGeographicCentroid([])).toThrow('No locations provided for geographic centroid calculation')
    })

    it('should throw error when null locations provided', () => {
      expect(() => service.calculateGeographicCentroid(null as any)).toThrow('No locations provided for geographic centroid calculation')
    })
  })

  describe('calculateMedianCoordinate', () => {
    it('should calculate median of odd number of locations', () => {
      const locations = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 1, longitude: 1 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 2, longitude: 2 } },
        { id: '3', name: 'Location 3', coordinate: { latitude: 3, longitude: 3 } }
      ]

      const result = service.calculateMedianCoordinate(locations)
      expect(result.latitude).toBe(2)
      expect(result.longitude).toBe(2)
    })

    it('should calculate median of even number of locations', () => {
      const locations = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 1, longitude: 1 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 2, longitude: 2 } },
        { id: '3', name: 'Location 3', coordinate: { latitude: 3, longitude: 3 } },
        { id: '4', name: 'Location 4', coordinate: { latitude: 4, longitude: 4 } }
      ]

      const result = service.calculateMedianCoordinate(locations)
      expect(result.latitude).toBe(2.5)
      expect(result.longitude).toBe(2.5)
    })

    it('should throw error when no locations provided', () => {
      expect(() => service.calculateMedianCoordinate([])).toThrow('No locations provided for median coordinate calculation')
    })
  })

  describe('calculatePairwiseMidpoints', () => {
    it('should calculate midpoints for two locations', () => {
      const locations = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 2, longitude: 2 } }
      ]

      const result = service.calculatePairwiseMidpoints(locations)
      expect(result).toHaveLength(1)
      expect(result[0].latitude).toBeCloseTo(1, 5)
      expect(result[0].longitude).toBeCloseTo(1, 5)
    })

    it('should calculate midpoints for three locations', () => {
      const locations = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 2, longitude: 2 } },
        { id: '3', name: 'Location 3', coordinate: { latitude: 4, longitude: 4 } }
      ]

      const result = service.calculatePairwiseMidpoints(locations)
      expect(result).toHaveLength(3) // 3 choose 2 = 3 pairs

      // Check that all midpoints are valid
      result.forEach(midpoint => {
        expect(midpoint.latitude).toBeGreaterThanOrEqual(0)
        expect(midpoint.latitude).toBeLessThanOrEqual(4)
        expect(midpoint.longitude).toBeGreaterThanOrEqual(0)
        expect(midpoint.longitude).toBeLessThanOrEqual(4)
      })
    })

    it('should throw error when less than 2 locations provided', () => {
      const locations = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } }
      ]
      expect(() => service.calculatePairwiseMidpoints(locations)).toThrow('At least 2 locations required for pairwise midpoint calculation')
    })

    it('should throw error when no locations provided', () => {
      expect(() => service.calculatePairwiseMidpoints([])).toThrow('At least 2 locations required for pairwise midpoint calculation')
    })
  })

  describe('validateCoordinateBounds', () => {
    it('should return true for valid coordinates', () => {
      expect(service.validateCoordinateBounds({ latitude: 0, longitude: 0 })).toBe(true)
      expect(service.validateCoordinateBounds({ latitude: 45.5, longitude: -122.7 })).toBe(true)
      expect(service.validateCoordinateBounds({ latitude: -90, longitude: -180 })).toBe(true)
      expect(service.validateCoordinateBounds({ latitude: 90, longitude: 180 })).toBe(true)
    })

    it('should return false for invalid latitude', () => {
      expect(service.validateCoordinateBounds({ latitude: 91, longitude: 0 })).toBe(false)
      expect(service.validateCoordinateBounds({ latitude: -91, longitude: 0 })).toBe(false)
    })

    it('should return false for invalid longitude', () => {
      expect(service.validateCoordinateBounds({ latitude: 0, longitude: 181 })).toBe(false)
      expect(service.validateCoordinateBounds({ latitude: 0, longitude: -181 })).toBe(false)
    })

    it('should return false for non-finite values', () => {
      expect(service.validateCoordinateBounds({ latitude: NaN, longitude: 0 })).toBe(false)
      expect(service.validateCoordinateBounds({ latitude: 0, longitude: Infinity })).toBe(false)
      expect(service.validateCoordinateBounds({ latitude: -Infinity, longitude: 0 })).toBe(false)
    })

    it('should return false for null coordinate', () => {
      expect(service.validateCoordinateBounds(null as any)).toBe(false)
    })
  })
})