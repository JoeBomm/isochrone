import type { HypothesisPoint } from 'types/graphql'

import { createGridGenerationError } from '../errors'
import {
  geometryService,
  type Location,
  type Coordinate,
  type BoundingBox,
} from '../geometry'
import { logger } from '../logger'

/**
 * GridGenerator class for generating coarse grid hypothesis points (Phase 1)
 * Calculates bounding box and subdivides it into a grid with configurable cell size
 * Uses grid cell centers as hypothesis points
 */
export class GridGenerator {
  /**
   * Generate coarse grid hypothesis points for a set of locations
   * @param locations Array of participant locations
   * @param gridSize Grid resolution (number of cells per side, default: 5)
   * @param paddingKm Padding around bounding box in kilometers (default: 5km)
   * @returns Array of coarse grid hypothesis points
   * @throws Error if invalid parameters or calculation fails
   */
  generateCoarseGrid(
    locations: Location[],
    gridSize: number = 5,
    paddingKm: number = 5
  ): HypothesisPoint[] {
    if (!locations || locations.length === 0) {
      throw createGridGenerationError(
        'No locations provided for coarse grid generation'
      )
    }

    if (gridSize < 1 || gridSize > 20) {
      throw createGridGenerationError(
        `Invalid grid size: ${gridSize}. Must be between 1 and 20`
      )
    }

    if (paddingKm < 0 || paddingKm > 50) {
      throw createGridGenerationError(
        `Invalid padding: ${paddingKm}km. Must be between 0 and 50`
      )
    }

    try {
      // Calculate bounding box with padding
      let boundingBox: BoundingBox
      try {
        boundingBox = geometryService.calculateBoundingBox(locations, paddingKm)
        logger.info(
          `Calculated bounding box: N=${boundingBox.north.toFixed(4)}, S=${boundingBox.south.toFixed(4)}, E=${boundingBox.east.toFixed(4)}, W=${boundingBox.west.toFixed(4)}`
        )
      } catch (boundingBoxError) {
        throw createGridGenerationError(
          `Failed to calculate bounding box: ${boundingBoxError.message}`,
          boundingBoxError
        )
      }

      // Validate bounding box before grid generation
      if (!this.validateBoundingBox(boundingBox)) {
        throw createGridGenerationError(
          `Invalid bounding box calculated: ${JSON.stringify(boundingBox)}`
        )
      }

      // Generate coarse grid points
      let gridCoordinates: Coordinate[]
      try {
        gridCoordinates = geometryService.generateCoarseGridPoints(
          boundingBox,
          gridSize
        )
      } catch (gridError) {
        throw createGridGenerationError(
          `Failed to generate grid coordinates: ${gridError.message}`,
          gridError
        )
      }

      if (!gridCoordinates || gridCoordinates.length === 0) {
        throw createGridGenerationError('No grid coordinates generated')
      }

      // Convert to hypothesis points
      const coarseGridPoints: HypothesisPoint[] = gridCoordinates.map(
        (coordinate, index) => ({
          id: `coarse_grid_${index}`,
          coordinate,
          type: 'COARSE_GRID_CELL',
          metadata: null,
        })
      )

      // Validate all generated grid points
      const invalidPoints = coarseGridPoints.filter(
        (point) => !geometryService.validateCoordinateBounds(point.coordinate)
      )
      if (invalidPoints.length > 0) {
        throw createGridGenerationError(
          `Generated invalid coarse grid points: ${invalidPoints.map((p) => p.id).join(', ')}`
        )
      }

      // Verify we got the expected number of points
      const expectedCount = this.getExpectedGridPointCount(gridSize)
      if (coarseGridPoints.length !== expectedCount) {
        logger.warn(
          `Expected ${expectedCount} grid points but generated ${coarseGridPoints.length}`
        )
        // Don't fail - just log the discrepancy as it might be due to coordinate filtering
      }

      logger.info(
        `Generated ${coarseGridPoints.length} coarse grid hypothesis points (${gridSize}x${gridSize} grid)`
      )
      return coarseGridPoints
    } catch (error) {
      if (error.code === 'GRID_GENERATION_FAILED') {
        throw error // Re-throw structured errors
      }
      throw createGridGenerationError(
        `Coarse grid hypothesis generation failed: ${error.message}`,
        error
      )
    }
  }

  /**
   * Calculate bounding box for a set of locations
   * @param locations Array of participant locations
   * @param paddingKm Padding around bounding box in kilometers
   * @returns BoundingBox containing all locations with padding
   */
  calculateBoundingBox(
    locations: Location[],
    paddingKm: number = 5
  ): BoundingBox {
    if (!locations || locations.length === 0) {
      throw new Error('No locations provided for bounding box calculation')
    }

    return geometryService.calculateBoundingBox(locations, paddingKm)
  }

  /**
   * Get the expected number of grid points for given parameters
   * Useful for UI display and validation
   * @param gridSize Grid resolution (number of cells per side)
   * @returns Expected number of grid points (gridSize^2)
   */
  getExpectedGridPointCount(gridSize: number): number {
    if (gridSize < 1) {
      return 0
    }
    return gridSize * gridSize
  }

  /**
   * Validate grid generation parameters
   * @param gridSize Grid resolution
   * @param paddingKm Padding in kilometers
   * @returns True if parameters are valid
   */
  validateGridParameters(gridSize: number, paddingKm: number): boolean {
    return gridSize >= 1 && gridSize <= 20 && paddingKm >= 0 && paddingKm <= 50
  }

  /**
   * Check if bounding box is reasonable for grid generation
   * Prevents extremely large or small bounding boxes
   * @param boundingBox Bounding box to validate
   * @returns True if bounding box is suitable for grid generation
   */
  validateBoundingBox(boundingBox: BoundingBox): boolean {
    if (!boundingBox) {
      return false
    }

    // Check that coordinates are in valid ranges
    if (
      boundingBox.north < -90 ||
      boundingBox.north > 90 ||
      boundingBox.south < -90 ||
      boundingBox.south > 90 ||
      boundingBox.east < -180 ||
      boundingBox.east > 180 ||
      boundingBox.west < -180 ||
      boundingBox.west > 180
    ) {
      return false
    }

    // Check that north > south and east > west
    if (
      boundingBox.north <= boundingBox.south ||
      boundingBox.east <= boundingBox.west
    ) {
      return false
    }

    // Check that bounding box is not too large (more than 180 degrees in any direction)
    const latSpan = boundingBox.north - boundingBox.south
    const lngSpan = boundingBox.east - boundingBox.west

    if (latSpan > 180 || lngSpan > 360) {
      return false
    }

    // Check that bounding box is not too small (less than 0.001 degrees)
    if (latSpan < 0.001 || lngSpan < 0.001) {
      return false
    }

    return true
  }

  /**
   * Validate that coarse grid points are visually identifiable
   * Ensures grid points have proper IDs and types for map visualization
   * @param gridPoints Array of coarse grid hypothesis points
   * @returns True if all grid points are properly formatted for visualization
   */
  validateVisualizationReadiness(gridPoints: HypothesisPoint[]): boolean {
    if (!gridPoints || gridPoints.length === 0) {
      return false
    }

    // Check that all grid points have proper IDs starting with 'coarse_grid_'
    const hasProperIds = gridPoints.every(
      (point) => point.id && point.id.startsWith('coarse_grid_')
    )

    // Check that all grid points have COARSE_GRID_CELL type
    const hasValidTypes = gridPoints.every(
      (point) => point.type === 'COARSE_GRID_CELL'
    )

    // Check that all coordinates are valid
    const hasValidCoordinates = gridPoints.every((point) =>
      geometryService.validateCoordinateBounds(point.coordinate)
    )

    return hasProperIds && hasValidTypes && hasValidCoordinates
  }
}

// Export singleton instance
export const gridGenerator = new GridGenerator()
