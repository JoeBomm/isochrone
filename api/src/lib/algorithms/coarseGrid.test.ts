import { GridGenerator, gridGenerator } from './coarseGrid'
import { geometryService, type Location, type BoundingBox } from '../geometry'
import type { HypothesisPoint } from 'types/graphql'

describe('GridGenerator', () => {
  let generator: GridGenerator

  beforeEach(() => {
    generator = new GridGenerator()
  })

  describe('calculateBoundingBox', () => {
    const validLocations: Location[] = [
      { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } },
      { id: '2', name: 'Location 2', coordinate: { latitude: 45.6, longitude: -122.6 } },
      { id: '3', name: 'Location 3', coordinate: { latitude: 45.7, longitude: -122.5 } }
    ]

    it('should calculate bounding box that contains all input locations', () => {
      const boundingBox = generator.calculateBoundingBox(validLocations, 0) // No padding for exact test

      // Check that bounding box contains all locations
      validLocations.forEach(location => {
        const { latitude, longitude } = location.coordinate
        expect(latitude).toBeGreaterThanOrEqual(boundingBox.south)
        expect(latitude).toBeLessThanOrEqual(boundingBox.north)
        expect(longitude).toBeGreaterThanOrEqual(boundingBox.west)
        expect(longitude).toBeLessThanOrEqual(boundingBox.east)
      })

      // Check that bounding box is tight (no unnecessary expansion)
      expect(boundingBox.south).toBe(45.5) // Min latitude
      expect(boundingBox.north).toBe(45.7) // Max latitude
      expect(boundingBox.west).toBe(-122.7) // Min longitude
      expect(boundingBox.east).toBe(-122.5) // Max longitude
    })

    it('should calculate bounding box with padding that contains all input locations', () => {
      const paddingKm = 5
      const boundingBox = generator.calculateBoundingBox(validLocations, paddingKm)

      // Check that bounding box contains all locations
      validLocations.forEach(location => {
        const { latitude, longitude } = location.coordinate
        expect(latitude).toBeGreaterThanOrEqual(boundingBox.south)
        expect(latitude).toBeLessThanOrEqual(boundingBox.north)
        expect(longitude).toBeGreaterThanOrEqual(boundingBox.west)
        expect(longitude).toBeLessThanOrEqual(boundingBox.east)
      })

      // Check that padding was applied (bounding box should be larger than tight fit)
      expect(boundingBox.south).toBeLessThan(45.5) // Padded below min latitude
      expect(boundingBox.north).toBeGreaterThan(45.7) // Padded above max latitude
      expect(boundingBox.west).toBeLessThan(-122.7) // Padded below min longitude
      expect(boundingBox.east).toBeGreaterThan(-122.5) // Padded above max longitude
    })

    it('should handle single location', () => {
      const singleLocation = [validLocations[0]]
      const boundingBox = generator.calculateBoundingBox(singleLocation, 5)

      // Should contain the single location
      const { latitude, longitude } = singleLocation[0].coordinate
      expect(latitude).toBeGreaterThanOrEqual(boundingBox.south)
      expect(latitude).toBeLessThanOrEqual(boundingBox.north)
      expect(longitude).toBeGreaterThanOrEqual(boundingBox.west)
      expect(longitude).toBeLessThanOrEqual(boundingBox.east)

      // Should have padding applied
      expect(boundingBox.north).toBeGreaterThan(latitude)
      expect(boundingBox.south).toBeLessThan(latitude)
      expect(boundingBox.east).toBeGreaterThan(longitude)
      expect(boundingBox.west).toBeLessThan(longitude)
    })

    it('should handle locations at extreme coordinates', () => {
      const extremeLocations: Location[] = [
        { id: '1', name: 'North Pole', coordinate: { latitude: 89, longitude: 0 } },
        { id: '2', name: 'South Pole', coordinate: { latitude: -89, longitude: 0 } },
        { id: '3', name: 'Date Line East', coordinate: { latitude: 0, longitude: 179 } },
        { id: '4', name: 'Date Line West', coordinate: { latitude: 0, longitude: -179 } }
      ]

      const boundingBox = generator.calculateBoundingBox(extremeLocations, 1)

      // Should contain all extreme locations
      extremeLocations.forEach(location => {
        const { latitude, longitude } = location.coordinate
        expect(latitude).toBeGreaterThanOrEqual(boundingBox.south)
        expect(latitude).toBeLessThanOrEqual(boundingBox.north)
        expect(longitude).toBeGreaterThanOrEqual(boundingBox.west)
        expect(longitude).toBeLessThanOrEqual(boundingBox.east)
      })

      // Should respect coordinate bounds
      expect(boundingBox.north).toBeLessThanOrEqual(90)
      expect(boundingBox.south).toBeGreaterThanOrEqual(-90)
      expect(boundingBox.east).toBeLessThanOrEqual(180)
      expect(boundingBox.west).toBeGreaterThanOrEqual(-180)
    })

    it('should throw error when no locations provided', () => {
      expect(() => generator.calculateBoundingBox([])).toThrow('No locations provided for bounding box calculation')
      expect(() => generator.calculateBoundingBox(null as any)).toThrow('No locations provided for bounding box calculation')
    })
  })

  describe('generateCoarseGrid', () => {
    const validLocations: Location[] = [
      { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } },
      { id: '2', name: 'Location 2', coordinate: { latitude: 45.6, longitude: -122.6 } },
      { id: '3', name: 'Location 3', coordinate: { latitude: 45.7, longitude: -122.5 } }
    ]

    it('should generate expected number of grid points', () => {
      const gridSize = 5
      const result = generator.generateCoarseGrid(validLocations, gridSize)

      // Should generate gridSize^2 points
      const expectedCount = gridSize * gridSize
      expect(result).toHaveLength(expectedCount)
    })

    it('should generate correct number of points for different grid sizes', () => {
      const testCases = [1, 3, 5, 10]

      testCases.forEach(gridSize => {
        const result = generator.generateCoarseGrid(validLocations, gridSize)
        const expectedCount = gridSize * gridSize
        expect(result).toHaveLength(expectedCount)
      })
    })

    it('should generate grid points with proper structure', () => {
      const result = generator.generateCoarseGrid(validLocations, 3)

      result.forEach((point, index) => {
        // Check ID format
        expect(point.id).toBe(`coarse_grid_${index}`)

        // Check type
        expect(point.type).toBe('COARSE_GRID_CELL')

        // Check metadata
        expect(point.metadata).toBeNull()

        // Check coordinate validity
        expect(geometryService.validateCoordinateBounds(point.coordinate)).toBe(true)
        expect(Number.isFinite(point.coordinate.latitude)).toBe(true)
        expect(Number.isFinite(point.coordinate.longitude)).toBe(true)
      })
    })

    it('should generate grid points within bounding box', () => {
      const gridSize = 4
      const paddingKm = 2
      const result = generator.generateCoarseGrid(validLocations, gridSize, paddingKm)
      const boundingBox = generator.calculateBoundingBox(validLocations, paddingKm)

      // All grid points should be within the bounding box
      result.forEach(point => {
        const { latitude, longitude } = point.coordinate
        expect(latitude).toBeGreaterThanOrEqual(boundingBox.south)
        expect(latitude).toBeLessThanOrEqual(boundingBox.north)
        expect(longitude).toBeGreaterThanOrEqual(boundingBox.west)
        expect(longitude).toBeLessThanOrEqual(boundingBox.east)
      })
    })

    it('should generate grid points that cover the area containing input locations', () => {
      const result = generator.generateCoarseGrid(validLocations, 5)

      // Find the bounding box of generated grid points
      const gridLatitudes = result.map(p => p.coordinate.latitude)
      const gridLongitudes = result.map(p => p.coordinate.longitude)
      const gridBounds = {
        north: Math.max(...gridLatitudes),
        south: Math.min(...gridLatitudes),
        east: Math.max(...gridLongitudes),
        west: Math.min(...gridLongitudes)
      }

      // The grid should span an area that could contain the input locations
      // (allowing for padding and grid cell positioning)
      const inputBounds = {
        north: Math.max(...validLocations.map(l => l.coordinate.latitude)),
        south: Math.min(...validLocations.map(l => l.coordinate.latitude)),
        east: Math.max(...validLocations.map(l => l.coordinate.longitude)),
        west: Math.min(...validLocations.map(l => l.coordinate.longitude))
      }

      // Grid bounds should encompass or be close to input bounds
      expect(gridBounds.north).toBeGreaterThanOrEqual(inputBounds.north - 0.1)
      expect(gridBounds.south).toBeLessThanOrEqual(inputBounds.south + 0.1)
      expect(gridBounds.east).toBeGreaterThanOrEqual(inputBounds.east - 0.1)
      expect(gridBounds.west).toBeLessThanOrEqual(inputBounds.west + 0.1)
    })

    it('should handle single location', () => {
      const singleLocation = [validLocations[0]]
      const result = generator.generateCoarseGrid(singleLocation, 3)

      expect(result).toHaveLength(9) // 3x3 grid
      result.forEach(point => {
        expect(geometryService.validateCoordinateBounds(point.coordinate)).toBe(true)
      })
    })

    it('should handle edge case grid sizes', () => {
      // Test minimum grid size
      const minResult = generator.generateCoarseGrid(validLocations, 1)
      expect(minResult).toHaveLength(1)

      // Test maximum grid size
      const maxResult = generator.generateCoarseGrid(validLocations, 20)
      expect(maxResult).toHaveLength(400) // 20x20
    })

    it('should throw error for invalid parameters', () => {
      // Invalid locations
      expect(() => generator.generateCoarseGrid([], 5)).toThrow('No locations provided for coarse grid generation')
      expect(() => generator.generateCoarseGrid(null as any, 5)).toThrow('No locations provided for coarse grid generation')

      // Invalid grid size
      expect(() => generator.generateCoarseGrid(validLocations, 0)).toThrow('Invalid grid size: 0. Must be between 1 and 20')
      expect(() => generator.generateCoarseGrid(validLocations, 21)).toThrow('Invalid grid size: 21. Must be between 1 and 20')

      // Invalid padding
      expect(() => generator.generateCoarseGrid(validLocations, 5, -1)).toThrow('Invalid padding: -1km. Must be between 0 and 50')
      expect(() => generator.generateCoarseGrid(validLocations, 5, 51)).toThrow('Invalid padding: 51km. Must be between 0 and 50')
    })

    it('should generate unique grid points', () => {
      const result = generator.generateCoarseGrid(validLocations, 5)

      // Check that all coordinates are unique
      const coordinateStrings = result.map(p => `${p.coordinate.latitude},${p.coordinate.longitude}`)
      const uniqueCoordinates = new Set(coordinateStrings)
      expect(uniqueCoordinates.size).toBe(result.length)

      // Check that all IDs are unique
      const ids = result.map(p => p.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(result.length)
    })
  })

  describe('getExpectedGridPointCount', () => {
    it('should return correct count for various grid sizes', () => {
      expect(generator.getExpectedGridPointCount(0)).toBe(0)
      expect(generator.getExpectedGridPointCount(1)).toBe(1)
      expect(generator.getExpectedGridPointCount(3)).toBe(9)
      expect(generator.getExpectedGridPointCount(5)).toBe(25)
      expect(generator.getExpectedGridPointCount(10)).toBe(100)
      expect(generator.getExpectedGridPointCount(20)).toBe(400)
    })

    it('should match actual generated count', () => {
      const validLocations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 45.6, longitude: -122.6 } }
      ]

      const testCases = [1, 3, 5, 8, 15]

      testCases.forEach(gridSize => {
        const expectedCount = generator.getExpectedGridPointCount(gridSize)
        const actualResult = generator.generateCoarseGrid(validLocations, gridSize)
        expect(actualResult).toHaveLength(expectedCount)
      })
    })
  })

  describe('validateGridParameters', () => {
    it('should validate correct parameters', () => {
      expect(generator.validateGridParameters(5, 10)).toBe(true)
      expect(generator.validateGridParameters(1, 0)).toBe(true)
      expect(generator.validateGridParameters(20, 50)).toBe(true)
    })

    it('should reject invalid parameters', () => {
      // Invalid grid size
      expect(generator.validateGridParameters(0, 5)).toBe(false)
      expect(generator.validateGridParameters(21, 5)).toBe(false)

      // Invalid padding
      expect(generator.validateGridParameters(5, -1)).toBe(false)
      expect(generator.validateGridParameters(5, 51)).toBe(false)
    })
  })

  describe('validateBoundingBox', () => {
    it('should validate correct bounding boxes', () => {
      const validBoundingBox: BoundingBox = {
        north: 45.7,
        south: 45.5,
        east: -122.5,
        west: -122.7
      }
      expect(generator.validateBoundingBox(validBoundingBox)).toBe(true)
    })

    it('should reject invalid bounding boxes', () => {
      // Null bounding box
      expect(generator.validateBoundingBox(null as any)).toBe(false)

      // Invalid coordinate ranges
      const invalidCoords: BoundingBox = {
        north: 91, // Invalid latitude
        south: 45.5,
        east: -122.5,
        west: -122.7
      }
      expect(generator.validateBoundingBox(invalidCoords)).toBe(false)

      // North <= South
      const invalidOrder: BoundingBox = {
        north: 45.5,
        south: 45.7, // South > North
        east: -122.5,
        west: -122.7
      }
      expect(generator.validateBoundingBox(invalidOrder)).toBe(false)

      // Too large span
      const tooLarge: BoundingBox = {
        north: 90,
        south: -91, // > 180 degrees
        east: 180,
        west: -180
      }
      expect(generator.validateBoundingBox(tooLarge)).toBe(false)

      // Too small span
      const tooSmall: BoundingBox = {
        north: 45.5001,
        south: 45.5000, // < 0.001 degrees
        east: -122.5000,
        west: -122.5001
      }
      expect(generator.validateBoundingBox(tooSmall)).toBe(false)
    })
  })

  describe('validateVisualizationReadiness', () => {
    it('should return true for properly formatted grid points', () => {
      const validLocations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 45.6, longitude: -122.6 } }
      ]

      const gridPoints = generator.generateCoarseGrid(validLocations, 3)
      expect(generator.validateVisualizationReadiness(gridPoints)).toBe(true)
    })

    it('should return false for empty grid points array', () => {
      expect(generator.validateVisualizationReadiness([])).toBe(false)
      expect(generator.validateVisualizationReadiness(null as any)).toBe(false)
    })

    it('should return false for grid points with invalid IDs', () => {
      const invalidGridPoints: HypothesisPoint[] = [
        {
          id: 'invalid_id', // Should start with 'coarse_grid_'
          coordinate: { latitude: 45.5, longitude: -122.7 },
          type: 'COARSE_GRID_CELL',
          metadata: null
        }
      ]

      expect(generator.validateVisualizationReadiness(invalidGridPoints)).toBe(false)
    })

    it('should return false for grid points with invalid types', () => {
      const invalidGridPoints: HypothesisPoint[] = [
        {
          id: 'coarse_grid_0',
          coordinate: { latitude: 45.5, longitude: -122.7 },
          type: 'GEOGRAPHIC_CENTROID' as any, // Invalid type for grid points
          metadata: null
        }
      ]

      expect(generator.validateVisualizationReadiness(invalidGridPoints)).toBe(false)
    })

    it('should return false for grid points with invalid coordinates', () => {
      const invalidGridPoints: HypothesisPoint[] = [
        {
          id: 'coarse_grid_0',
          coordinate: { latitude: 91, longitude: -122.7 }, // Invalid latitude
          type: 'COARSE_GRID_CELL',
          metadata: null
        }
      ]

      expect(generator.validateVisualizationReadiness(invalidGridPoints)).toBe(false)
    })
  })

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(gridGenerator).toBeInstanceOf(GridGenerator)
    })

    it('should work with singleton instance', () => {
      const validLocations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 45.6, longitude: -122.6 } }
      ]

      const result = gridGenerator.generateCoarseGrid(validLocations, 3)
      expect(result).toHaveLength(9)
      expect(gridGenerator.validateVisualizationReadiness(result)).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should provide descriptive error messages', () => {
      // Test empty locations
      expect(() => generator.generateCoarseGrid([], 5)).toThrow('No locations provided for coarse grid generation')

      // Test invalid grid size
      expect(() => generator.generateCoarseGrid([{ id: '1', name: 'Test', coordinate: { latitude: 45.5, longitude: -122.7 } }], 0))
        .toThrow('Invalid grid size: 0. Must be between 1 and 20')
    })

    it('should handle geometry service failures gracefully', () => {
      // Mock geometry service to throw error
      const originalCalculateBoundingBox = geometryService.calculateBoundingBox
      geometryService.calculateBoundingBox = jest.fn().mockImplementation(() => {
        throw new Error('Bounding box calculation failed')
      })

      const validLocations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } }
      ]

      expect(() => generator.generateCoarseGrid(validLocations, 5)).toThrow('Coarse grid hypothesis generation failed: Bounding box calculation failed')

      // Restore original function
      geometryService.calculateBoundingBox = originalCalculateBoundingBox
    })

    it('should handle coordinate validation failures', () => {
      // Mock geometry service to return invalid coordinates
      const originalGenerateCoarseGridPoints = geometryService.generateCoarseGridPoints
      geometryService.generateCoarseGridPoints = jest.fn().mockReturnValue([
        { latitude: 91, longitude: -122.7 } // Invalid latitude
      ])

      const validLocations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } }
      ]

      expect(() => generator.generateCoarseGrid(validLocations, 1)).toThrow('Generated invalid coarse grid points: coarse_grid_0')

      // Restore original function
      geometryService.generateCoarseGridPoints = originalGenerateCoarseGridPoints
    })
  })
})