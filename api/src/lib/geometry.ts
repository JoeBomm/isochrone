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
  // Multi-phase hypothesis generation methods
  calculateBoundingBox(locations: Location[], paddingKm?: number): BoundingBox
  generateCoarseGridPoints(boundingBox: BoundingBox, gridResolution?: number): Coordinate[]
  generateLocalRefinementPoints(
    candidates: Array<{ coordinate: Coordinate; maxTravelTime: number }>,
    topK?: number,
    refinementRadiusKm?: number,
    fineGridResolution?: number
  ): Coordinate[]
}

export interface Location {
  id: string
  name: string
  coordinate: Coordinate
}

export interface BoundingBox {
  north: number
  south: number
  east: number
  west: number
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

  /**
   * Calculate bounding box for a set of locations with optional padding
   * @param locations Array of locations to calculate bounding box from
   * @param paddingKm Optional padding in kilometers (default: 5km)
   * @returns BoundingBox containing all locations with padding
   * @throws Error if no locations provided or calculation fails
   */
  calculateBoundingBox(locations: Location[], paddingKm: number = 5): BoundingBox {
    if (!locations || locations.length === 0) {
      throw new Error('No locations provided for bounding box calculation')
    }

    try {
      // Find min/max coordinates
      let minLat = locations[0].coordinate.latitude
      let maxLat = locations[0].coordinate.latitude
      let minLng = locations[0].coordinate.longitude
      let maxLng = locations[0].coordinate.longitude

      for (const location of locations) {
        const { latitude, longitude } = location.coordinate
        minLat = Math.min(minLat, latitude)
        maxLat = Math.max(maxLat, latitude)
        minLng = Math.min(minLng, longitude)
        maxLng = Math.max(maxLng, longitude)
      }

      // Convert padding from kilometers to degrees (approximate)
      // 1 degree latitude ≈ 111 km
      // 1 degree longitude ≈ 111 km * cos(latitude)
      const avgLat = (minLat + maxLat) / 2
      const latPadding = paddingKm / 111
      const lngPadding = paddingKm / (111 * Math.cos(avgLat * Math.PI / 180))

      const boundingBox = {
        north: maxLat + latPadding,
        south: minLat - latPadding,
        east: maxLng + lngPadding,
        west: minLng - lngPadding
      }

      // Validate bounding box coordinates
      if (boundingBox.south < -90) boundingBox.south = -90
      if (boundingBox.north > 90) boundingBox.north = 90
      if (boundingBox.west < -180) boundingBox.west = -180
      if (boundingBox.east > 180) boundingBox.east = 180

      return boundingBox
    } catch (error) {
      throw new Error(`Bounding box calculation failed: ${error.message}`)
    }
  }

  /**
   * Generate uniform grid points over a bounding box
   * @param boundingBox Bounding box to generate grid points within
   * @param gridResolution Grid resolution (default: 5x5)
   * @returns Array of coordinates representing grid cell centers
   * @throws Error if invalid bounding box or calculation fails
   */
  generateCoarseGridPoints(boundingBox: BoundingBox, gridResolution: number = 5): Coordinate[] {
    if (!boundingBox) {
      throw new Error('No bounding box provided for grid generation')
    }

    if (gridResolution < 1 || gridResolution > 20) {
      throw new Error(`Invalid grid resolution: ${gridResolution}. Must be between 1 and 20`)
    }

    try {
      const gridPoints: Coordinate[] = []

      // Calculate step sizes
      const latStep = (boundingBox.north - boundingBox.south) / gridResolution
      const lngStep = (boundingBox.east - boundingBox.west) / gridResolution

      // Generate grid points at cell centers
      for (let i = 0; i < gridResolution; i++) {
        for (let j = 0; j < gridResolution; j++) {
          // Calculate center of each grid cell
          const latitude = boundingBox.south + (i + 0.5) * latStep
          const longitude = boundingBox.west + (j + 0.5) * lngStep

          const gridPoint = { latitude, longitude }

          // Validate each grid point
          if (!this.validateCoordinateBounds(gridPoint)) {
            throw new Error(`Generated invalid grid point: ${latitude}, ${longitude}`)
          }

          gridPoints.push(gridPoint)
        }
      }

      return gridPoints
    } catch (error) {
      throw new Error(`Coarse grid generation failed: ${error.message}`)
    }
  }

  /**
   * Generate local refinement points around top-K candidates
   * @param candidates Array of candidate points with their maximum travel times
   * @param topK Number of top candidates to refine around (default: 3)
   * @param refinementRadiusKm Radius in kilometers for local refinement (default: 2km)
   * @param fineGridResolution Grid resolution for fine grid (default: 3x3)
   * @returns Array of coordinates representing local refinement points
   * @throws Error if invalid parameters or calculation fails
   */
  generateLocalRefinementPoints(
    candidates: Array<{ coordinate: Coordinate; maxTravelTime: number }>,
    topK: number = 3,
    refinementRadiusKm: number = 2,
    fineGridResolution: number = 3
  ): Coordinate[] {
    if (!candidates || candidates.length === 0) {
      throw new Error('No candidates provided for local refinement')
    }

    if (topK < 1 || topK > 10) {
      throw new Error(`Invalid topK value: ${topK}. Must be between 1 and 10`)
    }

    if (refinementRadiusKm < 0.1 || refinementRadiusKm > 10) {
      throw new Error(`Invalid refinement radius: ${refinementRadiusKm}km. Must be between 0.1 and 10`)
    }

    if (fineGridResolution < 2 || fineGridResolution > 10) {
      throw new Error(`Invalid fine grid resolution: ${fineGridResolution}. Must be between 2 and 10`)
    }

    try {
      // Sort candidates by maximum travel time (ascending - best first)
      const sortedCandidates = [...candidates].sort((a, b) => a.maxTravelTime - b.maxTravelTime)

      // Select top-K candidates
      const topCandidates = sortedCandidates.slice(0, Math.min(topK, sortedCandidates.length))

      const refinementPoints: Coordinate[] = []

      // Generate local bounding boxes and fine grids for each top candidate
      for (const candidate of topCandidates) {
        const localBoundingBox = this.calculateLocalBoundingBox(
          candidate.coordinate,
          refinementRadiusKm
        )

        const localGridPoints = this.generateFineGridPoints(
          localBoundingBox,
          fineGridResolution
        )

        refinementPoints.push(...localGridPoints)
      }

      // Remove duplicates (points that are very close to each other)
      const uniqueRefinementPoints = this.removeDuplicatePoints(refinementPoints, 0.01) // 10m threshold

      return uniqueRefinementPoints
    } catch (error) {
      throw new Error(`Local refinement generation failed: ${error.message}`)
    }
  }

  /**
   * Calculate local bounding box around a center point
   * @param center Center coordinate
   * @param radiusKm Radius in kilometers
   * @returns BoundingBox around the center point
   * @private
   */
  private calculateLocalBoundingBox(center: Coordinate, radiusKm: number): BoundingBox {
    // Convert radius from kilometers to degrees (approximate)
    const latPadding = radiusKm / 111
    const lngPadding = radiusKm / (111 * Math.cos(center.latitude * Math.PI / 180))

    const boundingBox = {
      north: center.latitude + latPadding,
      south: center.latitude - latPadding,
      east: center.longitude + lngPadding,
      west: center.longitude - lngPadding
    }

    // Validate bounding box coordinates
    if (boundingBox.south < -90) boundingBox.south = -90
    if (boundingBox.north > 90) boundingBox.north = 90
    if (boundingBox.west < -180) boundingBox.west = -180
    if (boundingBox.east > 180) boundingBox.east = 180

    return boundingBox
  }

  /**
   * Generate fine grid points within a local bounding box
   * @param boundingBox Local bounding box
   * @param gridResolution Fine grid resolution
   * @returns Array of coordinates representing fine grid points
   * @private
   */
  private generateFineGridPoints(boundingBox: BoundingBox, gridResolution: number): Coordinate[] {
    const gridPoints: Coordinate[] = []

    // Calculate step sizes
    const latStep = (boundingBox.north - boundingBox.south) / gridResolution
    const lngStep = (boundingBox.east - boundingBox.west) / gridResolution

    // Generate grid points at cell centers
    for (let i = 0; i < gridResolution; i++) {
      for (let j = 0; j < gridResolution; j++) {
        // Calculate center of each grid cell
        const latitude = boundingBox.south + (i + 0.5) * latStep
        const longitude = boundingBox.west + (j + 0.5) * lngStep

        const gridPoint = { latitude, longitude }

        // Validate each grid point
        if (this.validateCoordinateBounds(gridPoint)) {
          gridPoints.push(gridPoint)
        }
      }
    }

    return gridPoints
  }

  /**
   * Remove duplicate points that are within a threshold distance
   * @param points Array of coordinates
   * @param thresholdDegrees Threshold distance in degrees
   * @returns Array of unique coordinates
   * @private
   */
  private removeDuplicatePoints(points: Coordinate[], thresholdDegrees: number): Coordinate[] {
    const uniquePoints: Coordinate[] = []

    for (const point of points) {
      let isDuplicate = false

      for (const existingPoint of uniquePoints) {
        const latDiff = Math.abs(point.latitude - existingPoint.latitude)
        const lngDiff = Math.abs(point.longitude - existingPoint.longitude)

        // Simple distance check (not geodesic, but sufficient for small distances)
        if (latDiff < thresholdDegrees && lngDiff < thresholdDegrees) {
          isDuplicate = true
          break
        }
      }

      if (!isDuplicate) {
        uniquePoints.push(point)
      }
    }

    return uniquePoints
  }
}

// Export singleton instance
export const geometryService = new TurfGeometryService()