import { AnchorGenerator, anchorGenerator } from './anchors'
import { geometryService, type Location } from '../geometry'
import type { HypothesisPoint } from 'types/graphql'

describe('AnchorGenerator', () => {
  let generator: AnchorGenerator

  beforeEach(() => {
    generator = new AnchorGenerator()
  })

  describe('generateAnchors', () => {
    const validLocations: Location[] = [
      { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } },
      { id: '2', name: 'Location 2', coordinate: { latitude: 45.6, longitude: -122.6 } },
      { id: '3', name: 'Location 3', coordinate: { latitude: 45.7, longitude: -122.5 } }
    ]

    it('should generate all required anchor types for any location set', () => {
      const result = generator.generateAnchors(validLocations)

      // Should have geographic centroid
      const geographicCentroid = result.find(p => p.type === 'GEOGRAPHIC_CENTROID')
      expect(geographicCentroid).toBeDefined()
      expect(geographicCentroid?.id).toBe('anchor_geographic_centroid')

      // Should have median coordinate
      const medianCoordinate = result.find(p => p.type === 'MEDIAN_COORDINATE')
      expect(medianCoordinate).toBeDefined()
      expect(medianCoordinate?.id).toBe('anchor_median_coordinate')

      // Should have participant locations
      const participantLocations = result.filter(p => p.type === 'PARTICIPANT_LOCATION')
      expect(participantLocations).toHaveLength(3)
      participantLocations.forEach((point, index) => {
        expect(point.id).toBe(`anchor_participant_${index}`)
        expect(point.metadata?.participantId).toBe(validLocations[index].id)
      })

      // Should have pairwise midpoints (3 choose 2 = 3 pairs)
      const pairwiseMidpoints = result.filter(p => p.type === 'PAIRWISE_MIDPOINT')
      expect(pairwiseMidpoints).toHaveLength(3)
      pairwiseMidpoints.forEach(point => {
        expect(point.metadata?.pairIds).toHaveLength(2)
        expect(point.id).toMatch(/^anchor_pairwise_\d+_\d+$/)
      })
    })

    it('should generate correct number of anchor points for different location counts', () => {
      // Test with 2 locations
      const twoLocations = validLocations.slice(0, 2)
      const twoResult = generator.generateAnchors(twoLocations)
      // 2 (centroid + median) + 2 (participants) + 1 (pairwise) = 5
      expect(twoResult).toHaveLength(5)

      // Test with 3 locations
      const threeResult = generator.generateAnchors(validLocations)
      // 2 (centroid + median) + 3 (participants) + 3 (pairwise) = 8
      expect(threeResult).toHaveLength(8)

      // Test with 4 locations
      const fourLocations = [
        ...validLocations,
        { id: '4', name: 'Location 4', coordinate: { latitude: 45.8, longitude: -122.4 } }
      ]
      const fourResult = generator.generateAnchors(fourLocations)
      // 2 (centroid + median) + 4 (participants) + 6 (pairwise) = 12
      expect(fourResult).toHaveLength(12)
    })

    it('should generate pairwise midpoints with correct pair IDs', () => {
      const result = generator.generateAnchors(validLocations)
      const pairwiseMidpoints = result.filter(p => p.type === 'PAIRWISE_MIDPOINT')

      // Check that all expected pairs are present
      const expectedPairs = [
        ['1', '2'], ['1', '3'], ['2', '3']
      ]

      expectedPairs.forEach(expectedPair => {
        const found = pairwiseMidpoints.find(point =>
          point.metadata?.pairIds?.includes(expectedPair[0]) &&
          point.metadata?.pairIds?.includes(expectedPair[1])
        )
        expect(found).toBeDefined()
      })
    })

    it('should handle single location (no pairwise midpoints)', () => {
      const singleLocation = [validLocations[0]]
      const result = generator.generateAnchors(singleLocation)

      // Should have centroid + median + 1 participant = 3 points
      expect(result).toHaveLength(3)

      // Should not have any pairwise midpoints
      const pairwiseMidpoints = result.filter(p => p.type === 'PAIRWISE_MIDPOINT')
      expect(pairwiseMidpoints).toHaveLength(0)
    })

    it('should validate all generated coordinates', () => {
      const result = generator.generateAnchors(validLocations)

      result.forEach(point => {
        expect(geometryService.validateCoordinateBounds(point.coordinate)).toBe(true)
        expect(Number.isFinite(point.coordinate.latitude)).toBe(true)
        expect(Number.isFinite(point.coordinate.longitude)).toBe(true)
      })
    })

    it('should throw error when no locations provided', () => {
      expect(() => generator.generateAnchors([])).toThrow('No locations provided for anchor point generation')
      expect(() => generator.generateAnchors(null as any)).toThrow('No locations provided for anchor point generation')
    })

    it('should throw error when invalid participant coordinates provided', () => {
      const invalidLocations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 91, longitude: -122.7 } }, // Invalid latitude
        { id: '2', name: 'Location 2', coordinate: { latitude: 45.6, longitude: -122.6 } }
      ]

      expect(() => generator.generateAnchors(invalidLocations)).toThrow('Invalid coordinates for participant location')
    })

    it('should handle edge case coordinates', () => {
      const edgeCaseLocations: Location[] = [
        { id: '1', name: 'North Pole', coordinate: { latitude: 90, longitude: 0 } },
        { id: '2', name: 'South Pole', coordinate: { latitude: -90, longitude: 0 } },
        { id: '3', name: 'Date Line', coordinate: { latitude: 0, longitude: 180 } }
      ]

      const result = generator.generateAnchors(edgeCaseLocations)
      expect(result.length).toBeGreaterThan(0)

      result.forEach(point => {
        expect(geometryService.validateCoordinateBounds(point.coordinate)).toBe(true)
      })
    })

    it('should handle locations with identical coordinates', () => {
      const identicalLocations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 45.5, longitude: -122.7 } }
      ]

      const result = generator.generateAnchors(identicalLocations)
      expect(result).toHaveLength(5) // 2 + 2 + 1 = 5

      // All coordinates should be valid
      result.forEach(point => {
        expect(geometryService.validateCoordinateBounds(point.coordinate)).toBe(true)
      })
    })

    it('should generate anchor points with proper metadata structure', () => {
      const result = generator.generateAnchors(validLocations)

      // Check geographic centroid metadata
      const geographicCentroid = result.find(p => p.type === 'GEOGRAPHIC_CENTROID')
      expect(geographicCentroid?.metadata).toBeNull()

      // Check median coordinate metadata
      const medianCoordinate = result.find(p => p.type === 'MEDIAN_COORDINATE')
      expect(medianCoordinate?.metadata).toBeNull()

      // Check participant location metadata
      const participantLocations = result.filter(p => p.type === 'PARTICIPANT_LOCATION')
      participantLocations.forEach(point => {
        expect(point.metadata?.participantId).toBeDefined()
        expect(point.metadata?.pairIds).toBeNull()
      })

      // Check pairwise midpoint metadata
      const pairwiseMidpoints = result.filter(p => p.type === 'PAIRWISE_MIDPOINT')
      pairwiseMidpoints.forEach(point => {
        expect(point.metadata?.participantId).toBeNull()
        expect(point.metadata?.pairIds).toHaveLength(2)
      })
    })
  })

  describe('getExpectedAnchorCount', () => {
    it('should return correct count for various location numbers', () => {
      expect(generator.getExpectedAnchorCount(0)).toBe(0)
      expect(generator.getExpectedAnchorCount(1)).toBe(3) // centroid + median + 1 participant
      expect(generator.getExpectedAnchorCount(2)).toBe(5) // centroid + median + 2 participants + 1 pairwise
      expect(generator.getExpectedAnchorCount(3)).toBe(8) // centroid + median + 3 participants + 3 pairwise
      expect(generator.getExpectedAnchorCount(4)).toBe(12) // centroid + median + 4 participants + 6 pairwise
      expect(generator.getExpectedAnchorCount(5)).toBe(17) // centroid + median + 5 participants + 10 pairwise
    })

    it('should match actual generated count', () => {
      const testCases = [1, 2, 3, 4, 5]

      testCases.forEach(count => {
        const locations = Array.from({ length: count }, (_, i) => ({
          id: `${i + 1}`,
          name: `Location ${i + 1}`,
          coordinate: { latitude: 45.5 + i * 0.1, longitude: -122.7 + i * 0.1 }
        }))

        const expectedCount = generator.getExpectedAnchorCount(count)
        const actualResult = generator.generateAnchors(locations)
        expect(actualResult).toHaveLength(expectedCount)
      })
    })
  })

  describe('validateVisualizationReadiness', () => {
    it('should return true for properly formatted anchor points', () => {
      const validLocations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 45.6, longitude: -122.6 } }
      ]

      const anchorPoints = generator.generateAnchors(validLocations)
      expect(generator.validateVisualizationReadiness(anchorPoints)).toBe(true)
    })

    it('should return false for empty anchor points array', () => {
      expect(generator.validateVisualizationReadiness([])).toBe(false)
      expect(generator.validateVisualizationReadiness(null as any)).toBe(false)
    })

    it('should return false for anchor points with invalid IDs', () => {
      const invalidAnchorPoints: HypothesisPoint[] = [
        {
          id: 'invalid_id', // Should start with 'anchor_'
          coordinate: { latitude: 45.5, longitude: -122.7 },
          type: 'GEOGRAPHIC_CENTROID',
          metadata: null,
          phase: 'ANCHOR'
        }
      ]

      expect(generator.validateVisualizationReadiness(invalidAnchorPoints)).toBe(false)
    })

    it('should return false for anchor points with invalid types', () => {
      const invalidAnchorPoints: HypothesisPoint[] = [
        {
          id: 'anchor_test',
          coordinate: { latitude: 45.5, longitude: -122.7 },
          type: 'COARSE_GRID_CELL' as any, // Invalid type for anchor points
          metadata: null,
          phase: 'ANCHOR'
        }
      ]

      expect(generator.validateVisualizationReadiness(invalidAnchorPoints)).toBe(false)
    })

    it('should return false for anchor points with invalid coordinates', () => {
      const invalidAnchorPoints: HypothesisPoint[] = [
        {
          id: 'anchor_test',
          coordinate: { latitude: 91, longitude: -122.7 }, // Invalid latitude
          type: 'GEOGRAPHIC_CENTROID',
          metadata: null,
          phase: 'ANCHOR'
        }
      ]

      expect(generator.validateVisualizationReadiness(invalidAnchorPoints)).toBe(false)
    })
  })

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(anchorGenerator).toBeInstanceOf(AnchorGenerator)
    })

    it('should work with singleton instance', () => {
      const validLocations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } },
        { id: '2', name: 'Location 2', coordinate: { latitude: 45.6, longitude: -122.6 } }
      ]

      const result = anchorGenerator.generateAnchors(validLocations)
      expect(result).toHaveLength(5)
      expect(anchorGenerator.validateVisualizationReadiness(result)).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should provide descriptive error messages', () => {
      // Test empty locations
      expect(() => generator.generateAnchors([])).toThrow('No locations provided for anchor point generation')

      // Test invalid coordinates - the error occurs during centroid calculation
      const invalidLocations: Location[] = [
        { id: '1', name: 'Invalid', coordinate: { latitude: 200, longitude: -122.7 } }
      ]
      expect(() => generator.generateAnchors(invalidLocations)).toThrow('Anchor point generation failed')
    })

    it('should handle geometry service failures gracefully', () => {
      // Mock geometry service to throw error
      const originalValidate = geometryService.validateCoordinateBounds
      geometryService.validateCoordinateBounds = jest.fn().mockReturnValue(false)

      const validLocations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } }
      ]

      expect(() => generator.generateAnchors(validLocations)).toThrow('Anchor point generation failed')

      // Restore original function
      geometryService.validateCoordinateBounds = originalValidate
    })

    it('should handle coordinate calculation failures', () => {
      // Mock geometry service to throw error during centroid calculation
      const originalCentroid = geometryService.calculateGeographicCentroid
      geometryService.calculateGeographicCentroid = jest.fn().mockImplementation(() => {
        throw new Error('Centroid calculation failed')
      })

      const validLocations: Location[] = [
        { id: '1', name: 'Location 1', coordinate: { latitude: 45.5, longitude: -122.7 } }
      ]

      expect(() => generator.generateAnchors(validLocations)).toThrow('Anchor point generation failed: Centroid calculation failed')

      // Restore original function
      geometryService.calculateGeographicCentroid = originalCentroid
    })
  })
})