import { deduplicationService } from './deduplication'
import type { HypothesisPoint } from 'types/graphql'
import type { Coordinate } from '../geometry'

describe('DeduplicationService', () => {
  // Helper function to create test hypothesis points
  const createTestPoint = (
    id: string,
    lat: number,
    lng: number,
    type: HypothesisPoint['type'] = 'COARSE_GRID_CELL',
    metadata: any = null
  ): HypothesisPoint => ({
    id,
    coordinate: { latitude: lat, longitude: lng },
    type,
    phase: 'COARSE_GRID',
    metadata
  })

  describe('calculateDistance', () => {
    it('should calculate distance between two coordinates correctly', () => {
      const coord1: Coordinate = { latitude: 40.7128, longitude: -74.0060 } // NYC
      const coord2: Coordinate = { latitude: 40.7589, longitude: -73.9851 } // Times Square

      const distance = deduplicationService.calculateDistance(coord1, coord2)

      // Distance should be approximately 5.2 km
      expect(distance).toBeGreaterThan(5000)
      expect(distance).toBeLessThan(6000)
    })

    it('should return 0 for identical coordinates', () => {
      const coord: Coordinate = { latitude: 40.7128, longitude: -74.0060 }

      const distance = deduplicationService.calculateDistance(coord, coord)

      expect(distance).toBe(0)
    })

    it('should throw error for invalid coordinates', () => {
      const validCoord: Coordinate = { latitude: 40.7128, longitude: -74.0060 }
      const invalidCoord: Coordinate = { latitude: 91, longitude: -74.0060 } // Invalid latitude

      expect(() => {
        deduplicationService.calculateDistance(validCoord, invalidCoord)
      }).toThrow('Coordinates are outside valid bounds')
    })
  })

  describe('mergePoints', () => {
    it('should merge two points by averaging coordinates', () => {
      const point1 = createTestPoint('point1', 40.0, -74.0, 'GEOGRAPHIC_CENTROID')
      const point2 = createTestPoint('point2', 40.2, -73.8, 'COARSE_GRID_CELL')

      const merged = deduplicationService.mergePoints(point1, point2)

      expect(merged.coordinate.latitude).toBe(40.1) // Average of 40.0 and 40.2
      expect(merged.coordinate.longitude).toBe(-73.9) // Average of -74.0 and -73.8
      expect(merged.id).toBe('merged_point1_point2')
      expect(merged.type).toBe('GEOGRAPHIC_CENTROID') // Should keep first point's type
    })

    it('should combine metadata from both points', () => {
      const point1 = createTestPoint('point1', 40.0, -74.0, 'PARTICIPANT_LOCATION', {
        participantId: 'user1'
      })
      const point2 = createTestPoint('point2', 40.1, -74.1, 'PARTICIPANT_LOCATION', {
        participantId: 'user2'
      })

      const merged = deduplicationService.mergePoints(point1, point2)

      expect(merged.metadata.participantId).toEqual(['user1', 'user2'])
    })

    it('should handle null metadata gracefully', () => {
      const point1 = createTestPoint('point1', 40.0, -74.0)
      const point2 = createTestPoint('point2', 40.1, -74.1)

      const merged = deduplicationService.mergePoints(point1, point2)

      expect(merged.metadata).toBeNull()
    })
  })

  describe('deduplicate', () => {
    it('should merge points within threshold distance', () => {
      const points = [
        createTestPoint('point1', 40.7128, -74.0060), // NYC
        createTestPoint('point2', 40.7129, -74.0061), // Very close to NYC (~15m)
        createTestPoint('point3', 40.7589, -73.9851)  // Times Square (~5km away)
      ]

      const threshold = 100 // 100 meters
      const deduplicated = deduplicationService.deduplicate(points, threshold)

      // Should merge point1 and point2, keep point3 separate
      expect(deduplicated).toHaveLength(2)

      // Check that one point is merged
      const mergedPoint = deduplicated.find(p => p.id.startsWith('merged_'))
      expect(mergedPoint).toBeDefined()

      // Check that point3 is still present
      const point3 = deduplicated.find(p => p.id === 'point3')
      expect(point3).toBeDefined()
    })

    it('should not merge points outside threshold distance', () => {
      const points = [
        createTestPoint('point1', 40.7128, -74.0060), // NYC
        createTestPoint('point2', 40.7589, -73.9851)  // Times Square (~5km away)
      ]

      const threshold = 1000 // 1km threshold
      const deduplicated = deduplicationService.deduplicate(points, threshold)

      // Should keep both points separate
      expect(deduplicated).toHaveLength(2)
      expect(deduplicated[0].id).toBe('point1')
      expect(deduplicated[1].id).toBe('point2')
    })

    it('should recalculate rankings deterministically', () => {
      const points = [
        createTestPoint('point_z', 40.7589, -73.9851, 'COARSE_GRID_CELL'),
        createTestPoint('point_a', 40.7128, -74.0060, 'GEOGRAPHIC_CENTROID'),
        createTestPoint('point_m', 40.7300, -74.0000, 'PARTICIPANT_LOCATION')
      ]

      const threshold = 10 // Very small threshold, no merging should occur
      const deduplicated = deduplicationService.deduplicate(points, threshold)

      // Should be sorted by type first, then by coordinates
      expect(deduplicated).toHaveLength(3)
      expect(deduplicated[0].type).toBe('COARSE_GRID_CELL') // COARSE_GRID_CELL comes first alphabetically
      expect(deduplicated[1].type).toBe('GEOGRAPHIC_CENTROID')
      expect(deduplicated[2].type).toBe('PARTICIPANT_LOCATION')
    })

    it('should handle edge case when fewer than N points remain', () => {
      const points = [
        createTestPoint('point1', 40.7128, -74.0060),
        createTestPoint('point2', 40.7129, -74.0061) // Very close
      ]

      const threshold = 1000 // Large threshold to merge both
      const deduplicated = deduplicationService.deduplicate(points, threshold)

      // Should merge into 1 point
      expect(deduplicated).toHaveLength(1)
      expect(deduplicated[0].id).toContain('merged_')
    })

    it('should return empty array for empty input', () => {
      const deduplicated = deduplicationService.deduplicate([], 100)
      expect(deduplicated).toEqual([])
    })

    it('should throw error for invalid threshold', () => {
      const points = [createTestPoint('point1', 40.0, -74.0)]

      expect(() => {
        deduplicationService.deduplicate(points, -100)
      }).toThrow('Invalid distance threshold')

      expect(() => {
        deduplicationService.deduplicate(points, 20000)
      }).toThrow('Invalid distance threshold')
    })
  })

  describe('recalculateRankings', () => {
    it('should sort points deterministically', () => {
      const points = [
        createTestPoint('point_c', 40.7589, -73.9851, 'COARSE_GRID_CELL'),
        createTestPoint('point_a', 40.7128, -74.0060, 'GEOGRAPHIC_CENTROID'),
        createTestPoint('point_b', 40.7300, -74.0000, 'GEOGRAPHIC_CENTROID')
      ]

      const ranked = deduplicationService.recalculateRankings(points)

      // Should be sorted by type first (COARSE_GRID_CELL before GEOGRAPHIC_CENTROID)
      expect(ranked[0].type).toBe('COARSE_GRID_CELL')
      expect(ranked[1].type).toBe('GEOGRAPHIC_CENTROID')
      expect(ranked[2].type).toBe('GEOGRAPHIC_CENTROID')

      // Within same type, should be sorted by latitude
      expect(ranked[1].coordinate.latitude).toBeLessThan(ranked[2].coordinate.latitude)
    })

    it('should handle empty array', () => {
      const ranked = deduplicationService.recalculateRankings([])
      expect(ranked).toEqual([])
    })

    it('should sort by score when available', () => {
      const points = [
        { ...createTestPoint('point1', 40.0, -74.0), score: 15.0 },
        { ...createTestPoint('point2', 40.1, -74.1), score: 10.0 },
        { ...createTestPoint('point3', 40.2, -74.2), score: 12.5 }
      ]

      const ranked = deduplicationService.recalculateRankings(points)

      // Should be sorted by score (ascending - lower scores are better)
      expect(ranked[0].score).toBe(10.0)
      expect(ranked[1].score).toBe(12.5)
      expect(ranked[2].score).toBe(15.0)
    })

    it('should prioritize points with scores over points without scores', () => {
      const points = [
        createTestPoint('point1', 40.0, -74.0), // No score
        { ...createTestPoint('point2', 40.1, -74.1), score: 15.0 },
        createTestPoint('point3', 40.2, -74.2), // No score
        { ...createTestPoint('point4', 40.3, -74.3), score: 10.0 }
      ]

      const ranked = deduplicationService.recalculateRankings(points)

      // Points with scores should come first, sorted by score
      expect(ranked[0].score).toBe(10.0)
      expect(ranked[1].score).toBe(15.0)
      // Points without scores should come after, sorted geographically
      expect(ranked[2].score).toBeUndefined()
      expect(ranked[3].score).toBeUndefined()
    })
  })

  describe('mergePoints with score preservation', () => {
    it('should preserve scores and travel time metrics when merging points', () => {
      const point1 = createTestPoint('point1', 40.0, -74.0)
      point1.score = 10.5
      point1.travelTimeMetrics = {
        maxTravelTime: 15,
        averageTravelTime: 10.5,
        totalTravelTime: 21,
        variance: 2.25
      }

      const point2 = createTestPoint('point2', 40.0001, -74.0001) // Very close to point1
      point2.score = 12.0
      point2.travelTimeMetrics = {
        maxTravelTime: 18,
        averageTravelTime: 12.0,
        totalTravelTime: 24,
        variance: 3.0
      }

      const merged = deduplicationService.mergePoints(point1, point2)

      // Should preserve the score and metrics from the first point (better score)
      expect(merged.score).toBe(10.5)
      expect(merged.travelTimeMetrics).toEqual({
        maxTravelTime: 15,
        averageTravelTime: 10.5,
        totalTravelTime: 21,
        variance: 2.25
      })
    })

    it('should maintain score-based order after deduplication', () => {
      const points = [
        { ...createTestPoint('point1', 40.0, -74.0), score: 15.0 },
        { ...createTestPoint('point2', 40.0001, -74.0001), score: 20.0 }, // Close to point1, worse score
        { ...createTestPoint('point3', 40.1, -74.1), score: 10.0 }, // Best score
        { ...createTestPoint('point4', 40.2, -74.2), score: 12.5 }
      ]

      const threshold = 100 // 100 meters - should merge point1 and point2
      const deduplicated = deduplicationService.deduplicate(points, threshold)

      // Should have 3 points (point1+point2 merged, point3, point4)
      expect(deduplicated).toHaveLength(3)

      // Should be sorted by score (point3 first with score 10.0)
      expect(deduplicated[0].id).toBe('point3')
      expect(deduplicated[0].score).toBe(10.0)

      // Second should be point4 with score 12.5
      expect(deduplicated[1].id).toBe('point4')
      expect(deduplicated[1].score).toBe(12.5)

      // Third should be merged point with score 15.0 (from point1, the better of the two merged)
      expect(deduplicated[2].id).toBe('merged_point1_point2')
      expect(deduplicated[2].score).toBe(15.0)
    })
  })

  describe('validateDeduplicationParameters', () => {
    it('should validate correct parameters', () => {
      const points = [createTestPoint('point1', 40.0, -74.0)]
      const threshold = 100

      const isValid = deduplicationService.validateDeduplicationParameters(points, threshold)
      expect(isValid).toBe(true)
    })

    it('should reject invalid threshold', () => {
      const points = [createTestPoint('point1', 40.0, -74.0)]

      expect(deduplicationService.validateDeduplicationParameters(points, -100)).toBe(false)
      expect(deduplicationService.validateDeduplicationParameters(points, 20000)).toBe(false)
    })

    it('should reject invalid points array', () => {
      expect(deduplicationService.validateDeduplicationParameters(null, 100)).toBe(false)
      expect(deduplicationService.validateDeduplicationParameters(undefined, 100)).toBe(false)
    })

    it('should reject points with invalid coordinates', () => {
      const invalidPoints = [createTestPoint('point1', 91, -74.0)] // Invalid latitude

      const isValid = deduplicationService.validateDeduplicationParameters(invalidPoints, 100)
      expect(isValid).toBe(false)
    })
  })

  describe('getDeduplicationStats', () => {
    it('should calculate correct statistics', () => {
      const originalPoints = [
        createTestPoint('point1', 40.0, -74.0),
        createTestPoint('point2', 40.1, -74.1),
        createTestPoint('point3', 40.2, -74.2),
        createTestPoint('point4', 40.3, -74.3)
      ]

      const deduplicatedPoints = [
        createTestPoint('merged1', 40.05, -74.05),
        createTestPoint('point3', 40.2, -74.2)
      ]

      const stats = deduplicationService.getDeduplicationStats(originalPoints, deduplicatedPoints)

      expect(stats.originalCount).toBe(4)
      expect(stats.finalCount).toBe(2)
      expect(stats.mergedCount).toBe(2)
      expect(stats.reductionPercentage).toBe(50)
    })

    it('should handle empty arrays', () => {
      const stats = deduplicationService.getDeduplicationStats([], [])

      expect(stats.originalCount).toBe(0)
      expect(stats.finalCount).toBe(0)
      expect(stats.mergedCount).toBe(0)
      expect(stats.reductionPercentage).toBe(0)
    })
  })
})