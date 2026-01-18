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

  describe('calculateBoundingBox', () => {
    it('should calculate bounding box for two locations with default padding', () => {
      const locations = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 45.6, longitude: -122.6 } }
      ]

      const result = service.calculateBoundingBox(locations)
      expect(result.north).toBeGreaterThan(45.6)
      expect(result.south).toBeLessThan(45.5)
      expect(result.east).toBeGreaterThan(-122.6)
      expect(result.west).toBeLessThan(-122.7)
    })

    it('should calculate bounding box with custom padding', () => {
      const locations = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 0, longitude: 0 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 1, longitude: 1 } }
      ]

      const result = service.calculateBoundingBox(locations, 10) // 10km padding
      const expectedPadding = 10 / 111 // ~0.09 degrees

      expect(result.north).toBeCloseTo(1 + expectedPadding, 2)
      expect(result.south).toBeCloseTo(0 - expectedPadding, 2)
    })

    it('should handle single location', () => {
      const locations = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } }
      ]

      const result = service.calculateBoundingBox(locations)
      expect(result.north).toBeGreaterThan(45.5)
      expect(result.south).toBeLessThan(45.5)
      expect(result.east).toBeGreaterThan(-122.7)
      expect(result.west).toBeLessThan(-122.7)
    })

    it('should clamp coordinates to valid bounds', () => {
      const locations = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 89, longitude: 179 } }
      ]

      const result = service.calculateBoundingBox(locations, 200) // Large padding
      expect(result.north).toBeLessThanOrEqual(90)
      expect(result.south).toBeGreaterThanOrEqual(-90)
      expect(result.east).toBeLessThanOrEqual(180)
      expect(result.west).toBeGreaterThanOrEqual(-180)
    })

    it('should throw error when no locations provided', () => {
      expect(() => service.calculateBoundingBox([])).toThrow('No locations provided for bounding box calculation')
    })
  })

  describe('generateCoarseGridPoints', () => {
    it('should generate 5x5 grid by default', () => {
      const boundingBox = {
        north: 1,
        south: 0,
        east: 1,
        west: 0
      }

      const result = service.generateCoarseGridPoints(boundingBox)
      expect(result).toHaveLength(25) // 5x5 = 25 points
    })

    it('should generate custom grid resolution', () => {
      const boundingBox = {
        north: 1,
        south: 0,
        east: 1,
        west: 0
      }

      const result = service.generateCoarseGridPoints(boundingBox, 3)
      expect(result).toHaveLength(9) // 3x3 = 9 points
    })

    it('should generate grid points with various bounding box sizes', () => {
      // Test small bounding box
      const smallBox = {
        north: 0.1,
        south: 0,
        east: 0.1,
        west: 0
      }
      const smallResult = service.generateCoarseGridPoints(smallBox, 3)
      expect(smallResult).toHaveLength(9)

      // Test large bounding box
      const largeBox = {
        north: 10,
        south: 0,
        east: 10,
        west: 0
      }
      const largeResult = service.generateCoarseGridPoints(largeBox, 3)
      expect(largeResult).toHaveLength(9)

      // All points should be within bounds
      smallResult.forEach(point => {
        expect(point.latitude).toBeGreaterThanOrEqual(smallBox.south)
        expect(point.latitude).toBeLessThanOrEqual(smallBox.north)
        expect(point.longitude).toBeGreaterThanOrEqual(smallBox.west)
        expect(point.longitude).toBeLessThanOrEqual(smallBox.east)
      })

      largeResult.forEach(point => {
        expect(point.latitude).toBeGreaterThanOrEqual(largeBox.south)
        expect(point.latitude).toBeLessThanOrEqual(largeBox.north)
        expect(point.longitude).toBeGreaterThanOrEqual(largeBox.west)
        expect(point.longitude).toBeLessThanOrEqual(largeBox.east)
      })
    })

    it('should handle edge case bounding boxes', () => {
      // Test very narrow bounding box
      const narrowBox = {
        north: 0.001,
        south: 0,
        east: 10,
        west: 0
      }
      const narrowResult = service.generateCoarseGridPoints(narrowBox, 2)
      expect(narrowResult).toHaveLength(4)

      // Test square bounding box
      const squareBox = {
        north: 1,
        south: 0,
        east: 1,
        west: 0
      }
      const squareResult = service.generateCoarseGridPoints(squareBox, 4)
      expect(squareResult).toHaveLength(16)
    })

    it('should generate grid points at cell centers', () => {
      const boundingBox = {
        north: 2,
        south: 0,
        east: 2,
        west: 0
      }

      const result = service.generateCoarseGridPoints(boundingBox, 2)
      expect(result).toHaveLength(4) // 2x2 = 4 points

      // Check that points are at cell centers
      const expectedPoints = [
        { latitude: 0.5, longitude: 0.5 },
        { latitude: 0.5, longitude: 1.5 },
        { latitude: 1.5, longitude: 0.5 },
        { latitude: 1.5, longitude: 1.5 }
      ]

      expectedPoints.forEach(expected => {
        const found = result.find(point =>
          Math.abs(point.latitude - expected.latitude) < 0.001 &&
          Math.abs(point.longitude - expected.longitude) < 0.001
        )
        expect(found).toBeDefined()
      })
    })

    it('should validate all generated points', () => {
      const boundingBox = {
        north: 45.6,
        south: 45.5,
        east: -122.6,
        west: -122.7
      }

      const result = service.generateCoarseGridPoints(boundingBox)
      result.forEach(point => {
        expect(service.validateCoordinateBounds(point)).toBe(true)
      })
    })

    it('should throw error for invalid grid resolution', () => {
      const boundingBox = { north: 1, south: 0, east: 1, west: 0 }

      expect(() => service.generateCoarseGridPoints(boundingBox, 0)).toThrow('Invalid grid resolution')
      expect(() => service.generateCoarseGridPoints(boundingBox, 21)).toThrow('Invalid grid resolution')
    })

    it('should throw error when no bounding box provided', () => {
      expect(() => service.generateCoarseGridPoints(null as any)).toThrow('No bounding box provided for grid generation')
    })
  })

  describe('generateLocalRefinementPoints', () => {
    it('should generate refinement points around top candidates', () => {
      const candidates = [
        { coordinate: { latitude: 45.5, longitude: -122.7 }, maxTravelTime: 10 },
        { coordinate: { latitude: 45.6, longitude: -122.6 }, maxTravelTime: 15 },
        { coordinate: { latitude: 45.7, longitude: -122.5 }, maxTravelTime: 20 }
      ]

      const result = service.generateLocalRefinementPoints(candidates, 2, 1, 3)
      expect(result.length).toBeGreaterThan(0)
      expect(result.length).toBeLessThanOrEqual(18) // 2 candidates * 3x3 grid = 18 max
    })

    it('should generate refinement points with various bounding box sizes', () => {
      const candidates = [
        { coordinate: { latitude: 0, longitude: 0 }, maxTravelTime: 10 },
        { coordinate: { latitude: 10, longitude: 10 }, maxTravelTime: 15 }
      ]

      // Test small bounding box
      const smallResult = service.generateLocalRefinementPoints(candidates, 2, 0.5, 2)
      expect(smallResult.length).toBeGreaterThan(0)
      expect(smallResult.length).toBeLessThanOrEqual(8) // 2 candidates * 2x2 grid = 8 max

      // Test large bounding box
      const largeResult = service.generateLocalRefinementPoints(candidates, 2, 5, 4)
      expect(largeResult.length).toBeGreaterThan(0)
      expect(largeResult.length).toBeLessThanOrEqual(32) // 2 candidates * 4x4 grid = 32 max

      // Large bounding box should generate more diverse points
      expect(largeResult.length).toBeGreaterThanOrEqual(smallResult.length)
    })

    it('should handle different candidate set sizes', () => {
      const manyCandidates = Array.from({ length: 10 }, (_, i) => ({
        coordinate: { latitude: i, longitude: i },
        maxTravelTime: 10 + i
      }))

      // Test with topK smaller than candidate count
      const result1 = service.generateLocalRefinementPoints(manyCandidates, 3, 1, 2)
      expect(result1.length).toBeGreaterThan(0)
      expect(result1.length).toBeLessThanOrEqual(12) // 3 candidates * 2x2 grid = 12 max

      // Test with topK equal to candidate count
      const result2 = service.generateLocalRefinementPoints(manyCandidates, 10, 1, 2)
      expect(result2.length).toBeGreaterThan(0)
      expect(result2.length).toBeLessThanOrEqual(40) // 10 candidates * 2x2 grid = 40 max
    })

    it('should select top-K candidates by travel time', () => {
      const candidates = [
        { coordinate: { latitude: 45.5, longitude: -122.7 }, maxTravelTime: 20 }, // Worst
        { coordinate: { latitude: 45.6, longitude: -122.6 }, maxTravelTime: 10 }, // Best
        { coordinate: { latitude: 45.7, longitude: -122.5 }, maxTravelTime: 15 }  // Middle
      ]

      // Should select the 2 best candidates (travel times 10 and 15)
      const result = service.generateLocalRefinementPoints(candidates, 2, 1, 2)
      expect(result.length).toBeGreaterThan(0)
      expect(result.length).toBeLessThanOrEqual(8) // 2 candidates * 2x2 grid = 8 max
    })

    it('should remove duplicate points', () => {
      const candidates = [
        { coordinate: { latitude: 45.5, longitude: -122.7 }, maxTravelTime: 10 },
        { coordinate: { latitude: 45.5001, longitude: -122.7001 }, maxTravelTime: 11 } // Very close
      ]

      const result = service.generateLocalRefinementPoints(candidates, 2, 0.1, 2) // Small radius
      // Should have fewer points due to duplicate removal
      expect(result.length).toBeLessThan(8) // Less than 2 * 2x2 = 8
    })

    it('should validate all generated points', () => {
      const candidates = [
        { coordinate: { latitude: 45.5, longitude: -122.7 }, maxTravelTime: 10 }
      ]

      const result = service.generateLocalRefinementPoints(candidates)
      result.forEach(point => {
        expect(service.validateCoordinateBounds(point)).toBe(true)
      })
    })

    it('should use default parameters', () => {
      const candidates = [
        { coordinate: { latitude: 45.5, longitude: -122.7 }, maxTravelTime: 10 },
        { coordinate: { latitude: 45.6, longitude: -122.6 }, maxTravelTime: 15 },
        { coordinate: { latitude: 45.7, longitude: -122.5 }, maxTravelTime: 20 },
        { coordinate: { latitude: 45.8, longitude: -122.4 }, maxTravelTime: 25 }
      ]

      const result = service.generateLocalRefinementPoints(candidates) // Use defaults: topK=3, radius=2km, grid=3x3
      expect(result.length).toBeGreaterThan(0)
      expect(result.length).toBeLessThanOrEqual(27) // 3 candidates * 3x3 grid = 27 max
    })

    it('should throw error for invalid parameters', () => {
      const candidates = [
        { coordinate: { latitude: 45.5, longitude: -122.7 }, maxTravelTime: 10 }
      ]

      expect(() => service.generateLocalRefinementPoints(candidates, 0)).toThrow('Invalid topK value')
      expect(() => service.generateLocalRefinementPoints(candidates, 11)).toThrow('Invalid topK value')
      expect(() => service.generateLocalRefinementPoints(candidates, 3, 0.05)).toThrow('Invalid refinement radius')
      expect(() => service.generateLocalRefinementPoints(candidates, 3, 15)).toThrow('Invalid refinement radius')
      expect(() => service.generateLocalRefinementPoints(candidates, 3, 2, 1)).toThrow('Invalid fine grid resolution')
      expect(() => service.generateLocalRefinementPoints(candidates, 3, 2, 11)).toThrow('Invalid fine grid resolution')
    })

    it('should throw error when no candidates provided', () => {
      expect(() => service.generateLocalRefinementPoints([])).toThrow('No candidates provided for local refinement')
    })
  })

  describe('Multi-phase hypothesis generation orchestration', () => {
    const testLocations = [
      { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } },
      { id: '2', name: 'Location 2', coordinate: { latitude: 45.6, longitude: -122.6 } },
      { id: '3', name: 'Location 3', coordinate: { latitude: 45.7, longitude: -122.5 } }
    ]

    it('should generate Phase 0 hypothesis points correctly', () => {
      // Test geographic centroid
      const centroid = service.calculateGeographicCentroid(testLocations)
      expect(centroid).toBeDefined()
      expect(service.validateCoordinateBounds(centroid)).toBe(true)

      // Test median coordinate
      const median = service.calculateMedianCoordinate(testLocations)
      expect(median).toBeDefined()
      expect(service.validateCoordinateBounds(median)).toBe(true)

      // Test pairwise midpoints
      const midpoints = service.calculatePairwiseMidpoints(testLocations)
      expect(midpoints).toHaveLength(3) // 3 choose 2 = 3 pairs
      midpoints.forEach(point => {
        expect(service.validateCoordinateBounds(point)).toBe(true)
      })
    })

    it('should generate Phase 1 coarse grid points correctly', () => {
      const boundingBox = service.calculateBoundingBox(testLocations, 5)
      const gridPoints = service.generateCoarseGridPoints(boundingBox, 5)

      expect(gridPoints).toHaveLength(25) // 5x5 grid
      gridPoints.forEach(point => {
        expect(service.validateCoordinateBounds(point)).toBe(true)
        expect(point.latitude).toBeGreaterThanOrEqual(boundingBox.south)
        expect(point.latitude).toBeLessThanOrEqual(boundingBox.north)
        expect(point.longitude).toBeGreaterThanOrEqual(boundingBox.west)
        expect(point.longitude).toBeLessThanOrEqual(boundingBox.east)
      })
    })

    it('should generate Phase 2 local refinement points correctly', () => {
      // Mock candidates from previous phases
      const candidates = [
        { coordinate: { latitude: 45.55, longitude: -122.65 }, maxTravelTime: 12 },
        { coordinate: { latitude: 45.58, longitude: -122.62 }, maxTravelTime: 15 },
        { coordinate: { latitude: 45.52, longitude: -122.68 }, maxTravelTime: 18 }
      ]

      const refinementPoints = service.generateLocalRefinementPoints(candidates, 2, 1, 3)
      expect(refinementPoints.length).toBeGreaterThan(0)
      expect(refinementPoints.length).toBeLessThanOrEqual(18) // 2 candidates * 3x3 grid = 18 max

      refinementPoints.forEach(point => {
        expect(service.validateCoordinateBounds(point)).toBe(true)
      })
    })

    it('should handle configuration edge cases', () => {
      // Test minimum configuration
      const minBoundingBox = service.calculateBoundingBox(testLocations, 0.5)
      const minGridPoints = service.generateCoarseGridPoints(minBoundingBox, 2)
      expect(minGridPoints).toHaveLength(4) // 2x2 grid

      // Test maximum configuration
      const maxBoundingBox = service.calculateBoundingBox(testLocations, 50)
      const maxGridPoints = service.generateCoarseGridPoints(maxBoundingBox, 10)
      expect(maxGridPoints).toHaveLength(100) // 10x10 grid

      // Test with single location
      const singleLocation = [testLocations[0]]
      const singleBoundingBox = service.calculateBoundingBox(singleLocation)
      const singleGridPoints = service.generateCoarseGridPoints(singleBoundingBox, 3)
      expect(singleGridPoints).toHaveLength(9) // 3x3 grid
    })

    it('should maintain coordinate precision across phases', () => {
      const boundingBox = service.calculateBoundingBox(testLocations)
      const gridPoints = service.generateCoarseGridPoints(boundingBox, 3)

      // All grid points should have reasonable precision
      gridPoints.forEach(point => {
        expect(Number.isFinite(point.latitude)).toBe(true)
        expect(Number.isFinite(point.longitude)).toBe(true)
        expect(Math.abs(point.latitude)).toBeLessThan(90)
        expect(Math.abs(point.longitude)).toBeLessThan(180)
      })

      // Test refinement points precision
      const candidates = gridPoints.slice(0, 2).map((coord, i) => ({
        coordinate: coord,
        maxTravelTime: 10 + i * 5
      }))

      const refinementPoints = service.generateLocalRefinementPoints(candidates, 2, 1, 2)
      refinementPoints.forEach(point => {
        expect(Number.isFinite(point.latitude)).toBe(true)
        expect(Number.isFinite(point.longitude)).toBe(true)
        expect(Math.abs(point.latitude)).toBeLessThan(90)
        expect(Math.abs(point.longitude)).toBeLessThan(180)
      })
    })
  })
})