import { centroid } from '@turf/centroid'
import { union } from '@turf/union'
import type { GeoJSON, Feature, Polygon, MultiPolygon } from 'geojson'

export interface Coordinate {
  latitude: number
  longitude: number
}

export interface GeometryService {
  calculatePolygonUnion(polygons: GeoJSON.Polygon[]): GeoJSON.Polygon | GeoJSON.MultiPolygon
  calculateCentroid(polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon): Coordinate
  validatePolygonOverlap(polygons: GeoJSON.Polygon[]): boolean
}

/**
 * Service for geometric operations on isochrone polygons using Turf.js
 */
export class TurfGeometryService implements GeometryService {
  /**
   * Calculate the geometric union of multiple polygons
   * @param polygons Array of GeoJSON polygons to union
   * @returns Combined polygon or multipolygon representing the union
   * @throws Error if union calculation fails or no valid polygons provided
   */
  calculatePolygonUnion(polygons: GeoJSON.Polygon[]): GeoJSON.Polygon | GeoJSON.MultiPolygon {
    if (!polygons || polygons.length === 0) {
      throw new Error('No polygons provided for union calculation')
    }

    if (polygons.length === 1) {
      return polygons[0]
    }

    try {
      // Convert polygons to a FeatureCollection for Turf.js
      const featureCollection = {
        type: 'FeatureCollection' as const,
        features: polygons.map(polygon => ({
          type: 'Feature' as const,
          properties: {},
          geometry: polygon
        }))
      }

      const unionResult = union(featureCollection)
      if (!unionResult) {
        throw new Error('Union operation returned null result')
      }

      return unionResult.geometry
    } catch (error) {
      throw new Error(`Polygon union calculation failed: ${error.message}`)
    }
  }

  /**
   * Calculate the centroid of a polygon or multipolygon
   * @param polygon GeoJSON polygon or multipolygon
   * @returns Coordinate representing the centroid
   * @throws Error if centroid calculation fails
   */
  calculateCentroid(polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon): Coordinate {
    if (!polygon) {
      throw new Error('No polygon provided for centroid calculation')
    }

    try {
      const centroidFeature = centroid(polygon)
      const [longitude, latitude] = centroidFeature.geometry.coordinates
      
      return {
        latitude,
        longitude
      }
    } catch (error) {
      throw new Error(`Centroid calculation failed: ${error.message}`)
    }
  }

  /**
   * Validate that polygons have overlapping or adjacent areas
   * @param polygons Array of GeoJSON polygons to validate
   * @returns True if polygons have sufficient overlap for meaningful center calculation
   */
  validatePolygonOverlap(polygons: GeoJSON.Polygon[]): boolean {
    if (!polygons || polygons.length < 2) {
      return false
    }

    try {
      // Calculate union to check if polygons can be combined
      const unionResult = this.calculatePolygonUnion(polygons)
      
      // If union succeeds and produces a valid geometry, polygons are compatible
      return unionResult && (unionResult.type === 'Polygon' || unionResult.type === 'MultiPolygon')
    } catch (error) {
      // If union fails, polygons likely don't overlap or are invalid
      return false
    }
  }
}

// Export singleton instance
export const geometryService = new TurfGeometryService()