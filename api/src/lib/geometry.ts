import { centroid } from '@turf/centroid'
import { union } from '@turf/union'
import type { GeoJSON } from 'geojson'

export interface Coordinate {
  latitude: number
  longitude: number
}

export interface GeometryService {
  calculatePolygonUnion(polygons: GeoJSON.Polygon[]): GeoJSON.Polygon | GeoJSON.MultiPolygon
  calculateCentroid(polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon): Coordinate
  validatePolygonOverlap(polygons: GeoJSON.Polygon[]): boolean
  // Hypothesis point generation methods
  calculateGeographicCentroid(locations: Location[]): Coordinate
  calculateMedianCoordinate(locations: Location[]): Coordinate
  calculatePairwiseMidpoints(locations: Location[]): Coordinate[]
  validateCoordinateBounds(coordinate: Coordinate): boolean
}

export interface Location {
  id: string
  name: string
  coordinate: Coordinate
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

  /**
   * Calculate the geographic centroid of multiple locations
   * @param locations Array of locations to calculate centroid from
   * @returns Coordinate representing the geographic centroid
   * @throws Error if no locations provided or calculation fails
   */
  calculateGeographicCentroid(locations: Location[]): Coordinate {
    if (!locations || locations.length === 0) {
      throw new Error('No locations provided for geographic centroid calculation')
    }

    try {
      // Calculate simple arithmetic mean of coordinates
      const totalLat = locations.reduce((sum, loc) => sum + loc.coordinate.latitude, 0)
      const totalLng = locations.reduce((sum, loc) => sum + loc.coordinate.longitude, 0)

      const centroid = {
        latitude: totalLat / locations.length,
        longitude: totalLng / locations.length
      }

      // Validate the result
      if (!this.validateCoordinateBounds(centroid)) {
        throw new Error('Calculated centroid is outside valid coordinate bounds')
      }

      return centroid
    } catch (error) {
      throw new Error(`Geographic centroid calculation failed: ${error.message}`)
    }
  }

  /**
   * Calculate the median coordinate of multiple locations
   * @param locations Array of locations to calculate median from
   * @returns Coordinate representing the median coordinate
   * @throws Error if no locations provided or calculation fails
   */
  calculateMedianCoordinate(locations: Location[]): Coordinate {
    if (!locations || locations.length === 0) {
      throw new Error('No locations provided for median coordinate calculation')
    }

    try {
      // Sort coordinates separately for latitude and longitude
      const latitudes = locations.map(loc => loc.coordinate.latitude).sort((a, b) => a - b)
      const longitudes = locations.map(loc => loc.coordinate.longitude).sort((a, b) => a - b)

      const length = locations.length
      let medianLat: number
      let medianLng: number

      if (length % 2 === 0) {
        // Even number of locations - average the two middle values
        const midIndex = length / 2
        medianLat = (latitudes[midIndex - 1] + latitudes[midIndex]) / 2
        medianLng = (longitudes[midIndex - 1] + longitudes[midIndex]) / 2
      } else {
        // Odd number of locations - take the middle value
        const midIndex = Math.floor(length / 2)
        medianLat = latitudes[midIndex]
        medianLng = longitudes[midIndex]
      }

      const median = {
        latitude: medianLat,
        longitude: medianLng
      }

      // Validate the result
      if (!this.validateCoordinateBounds(median)) {
        throw new Error('Calculated median coordinate is outside valid coordinate bounds')
      }

      return median
    } catch (error) {
      throw new Error(`Median coordinate calculation failed: ${error.message}`)
    }
  }

  /**
   * Calculate pairwise midpoints between all location pairs
   * @param locations Array of locations to calculate midpoints from
   * @returns Array of coordinates representing midpoints between all pairs
   * @throws Error if insufficient locations provided or calculation fails
   */
  calculatePairwiseMidpoints(locations: Location[]): Coordinate[] {
    if (!locations || locations.length < 2) {
      throw new Error('At least 2 locations required for pairwise midpoint calculation')
    }

    try {
      const midpoints: Coordinate[] = []

      // Calculate midpoint for each unique pair
      for (let i = 0; i < locations.length; i++) {
        for (let j = i + 1; j < locations.length; j++) {
          const loc1 = locations[i].coordinate
          const loc2 = locations[j].coordinate

          const midpoint = {
            latitude: (loc1.latitude + loc2.latitude) / 2,
            longitude: (loc1.longitude + loc2.longitude) / 2
          }

          // Validate each midpoint
          if (!this.validateCoordinateBounds(midpoint)) {
            throw new Error(`Calculated midpoint between ${locations[i].name} and ${locations[j].name} is outside valid coordinate bounds`)
          }

          midpoints.push(midpoint)
        }
      }

      return midpoints
    } catch (error) {
      throw new Error(`Pairwise midpoint calculation failed: ${error.message}`)
    }
  }

  /**
   * Validate that coordinates are within valid geographic bounds
   * @param coordinate Coordinate to validate
   * @returns True if coordinate is within valid bounds
   */
  validateCoordinateBounds(coordinate: Coordinate): boolean {
    if (!coordinate) {
      return false
    }

    // Check for valid numeric values
    if (!Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude)) {
      return false
    }

    // Check latitude bounds (-90 to 90)
    if (coordinate.latitude < -90 || coordinate.latitude > 90) {
      return false
    }

    // Check longitude bounds (-180 to 180)
    if (coordinate.longitude < -180 || coordinate.longitude > 180) {
      return false
    }

    return true
  }
}

// Export singleton instance
export const geometryService = new TurfGeometryService()