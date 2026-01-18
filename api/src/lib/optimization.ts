/**
 * Optimization configuration types and validation for multi-phase minimax center calculation
 *
 * This module defines the types and validation logic for optimization modes that control
 * the hypothesis point generation strategy:
 * - BASELINE: Uses only Phase 0 (geographic centroid, median, participants, pairwise midpoints)
 * - COARSE_GRID: Adds Phase 1 (coarse grid over padded bounding box)
 * - FULL_REFINEMENT: Adds Phase 2 (local refinement around top candidates)
 */

export type OptimizationMode = 'BASELINE' | 'COARSE_GRID' | 'FULL_REFINEMENT'

/**
 * Configuration for coarse grid hypothesis generation (Phase 1)
 */
export interface CoarseGridConfig {
  /** Whether coarse grid generation is enabled */
  enabled: boolean
  /** Padding around bounding box in kilometers (default: 5km) */
  paddingKm: number
  /** Grid resolution (NxN grid, default: 5x5) */
  gridResolution: number
}

/**
 * Configuration for local refinement hypothesis generation (Phase 2)
 */
export interface LocalRefinementConfig {
  /** Whether local refinement is enabled */
  enabled: boolean
  /** Number of top candidates to refine around (default: 3) */
  topK: number
  /** Refinement radius around each candidate in kilometers (default: 2km) */
  refinementRadiusKm: number
  /** Fine grid resolution within refinement areas (default: 3x3) */
  fineGridResolution: number
}

/**
 * Complete optimization configuration for minimax center calculation
 */
export interface OptimizationConfig {
  /** Optimization mode determining which phases are enabled */
  mode: OptimizationMode
  /** Configuration for coarse grid generation (Phase 1) */
  coarseGridConfig?: CoarseGridConfig
  /** Configuration for local refinement (Phase 2) */
  localRefinementConfig?: LocalRefinementConfig
}

/**
 * Default optimization configuration (baseline mode)
 */
export const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  mode: 'BASELINE',
  coarseGridConfig: {
    enabled: false,
    paddingKm: 5,
    gridResolution: 5
  },
  localRefinementConfig: {
    enabled: false,
    topK: 3,
    refinementRadiusKm: 2,
    fineGridResolution: 3
  }
}

/**
 * Validation error for optimization configuration
 */
export class OptimizationConfigError extends Error {
  constructor(message: string, public field?: string) {
    super(message)
    this.name = 'OptimizationConfigError'
  }
}

/**
 * Validate optimization mode
 * @param mode Optimization mode to validate
 * @throws OptimizationConfigError if mode is invalid
 */
export const validateOptimizationMode = (mode: string): OptimizationMode => {
  const validModes: OptimizationMode[] = ['BASELINE', 'COARSE_GRID', 'FULL_REFINEMENT']

  if (!validModes.includes(mode as OptimizationMode)) {
    throw new OptimizationConfigError(
      `Invalid optimization mode: ${mode}. Must be one of: ${validModes.join(', ')}`,
      'mode'
    )
  }

  return mode as OptimizationMode
}

/**
 * Validate coarse grid configuration parameters
 * @param config Coarse grid configuration to validate
 * @throws OptimizationConfigError if configuration is invalid
 */
export const validateCoarseGridConfig = (config: CoarseGridConfig): void => {
  if (typeof config.paddingKm !== 'number' || !Number.isFinite(config.paddingKm)) {
    throw new OptimizationConfigError(
      `Invalid padding type: ${typeof config.paddingKm}. Must be a finite number`,
      'coarseGridConfig.paddingKm'
    )
  }

  if (config.paddingKm < 0 || config.paddingKm > 50) {
    throw new OptimizationConfigError(
      `Invalid padding: ${config.paddingKm}km. Must be between 0 and 50 kilometers for reasonable geographic constraints`,
      'coarseGridConfig.paddingKm'
    )
  }

  if (typeof config.gridResolution !== 'number' || !Number.isInteger(config.gridResolution)) {
    throw new OptimizationConfigError(
      `Invalid grid resolution type: ${typeof config.gridResolution}. Must be an integer`,
      'coarseGridConfig.gridResolution'
    )
  }

  if (config.gridResolution < 2 || config.gridResolution > 10) {
    throw new OptimizationConfigError(
      `Invalid grid resolution: ${config.gridResolution}. Must be between 2 and 10 to balance performance and coverage`,
      'coarseGridConfig.gridResolution'
    )
  }

  // Validate that grid resolution doesn't create too many points
  const totalGridPoints = config.gridResolution * config.gridResolution
  if (totalGridPoints > 100) {
    throw new OptimizationConfigError(
      `Grid resolution ${config.gridResolution}x${config.gridResolution} creates ${totalGridPoints} points, exceeding maximum of 100 for API efficiency`,
      'coarseGridConfig.gridResolution'
    )
  }
}

/**
 * Validate local refinement configuration parameters
 * @param config Local refinement configuration to validate
 * @throws OptimizationConfigError if configuration is invalid
 */
export const validateLocalRefinementConfig = (config: LocalRefinementConfig): void => {
  if (typeof config.topK !== 'number' || !Number.isInteger(config.topK)) {
    throw new OptimizationConfigError(
      `Invalid topK type: ${typeof config.topK}. Must be an integer`,
      'localRefinementConfig.topK'
    )
  }

  if (config.topK < 1 || config.topK > 10) {
    throw new OptimizationConfigError(
      `Invalid topK: ${config.topK}. Must be between 1 and 10 to balance refinement quality and API usage`,
      'localRefinementConfig.topK'
    )
  }

  if (typeof config.refinementRadiusKm !== 'number' || !Number.isFinite(config.refinementRadiusKm)) {
    throw new OptimizationConfigError(
      `Invalid refinement radius type: ${typeof config.refinementRadiusKm}. Must be a finite number`,
      'localRefinementConfig.refinementRadiusKm'
    )
  }

  if (config.refinementRadiusKm < 0.5 || config.refinementRadiusKm > 10) {
    throw new OptimizationConfigError(
      `Invalid refinement radius: ${config.refinementRadiusKm}km. Must be between 0.5 and 10 kilometers for meaningful local search`,
      'localRefinementConfig.refinementRadiusKm'
    )
  }

  if (typeof config.fineGridResolution !== 'number' || !Number.isInteger(config.fineGridResolution)) {
    throw new OptimizationConfigError(
      `Invalid fine grid resolution type: ${typeof config.fineGridResolution}. Must be an integer`,
      'localRefinementConfig.fineGridResolution'
    )
  }

  if (config.fineGridResolution < 2 || config.fineGridResolution > 5) {
    throw new OptimizationConfigError(
      `Invalid fine grid resolution: ${config.fineGridResolution}. Must be between 2 and 5 to balance refinement precision and API usage`,
      'localRefinementConfig.fineGridResolution'
    )
  }

  // Validate that fine grid resolution doesn't create too many points per candidate
  const pointsPerCandidate = config.fineGridResolution * config.fineGridResolution
  const totalRefinementPoints = pointsPerCandidate * config.topK
  if (totalRefinementPoints > 75) {
    throw new OptimizationConfigError(
      `Local refinement configuration creates ${totalRefinementPoints} points (${config.topK} candidates × ${pointsPerCandidate} points each), exceeding maximum of 75 for API efficiency`,
      'localRefinementConfig'
    )
  }
}

/**
 * Validate complete optimization configuration
 * @param config Optimization configuration to validate
 * @throws OptimizationConfigError if configuration is invalid
 */
export const validateOptimizationConfig = (config: OptimizationConfig): void => {
  // Validate optimization mode
  validateOptimizationMode(config.mode)

  // Validate coarse grid config if provided
  if (config.coarseGridConfig) {
    validateCoarseGridConfig(config.coarseGridConfig)
  }

  // Validate local refinement config if provided
  if (config.localRefinementConfig) {
    validateLocalRefinementConfig(config.localRefinementConfig)
  }

  // Validate mode-specific requirements
  if (config.mode === 'COARSE_GRID' || config.mode === 'FULL_REFINEMENT') {
    if (!config.coarseGridConfig) {
      throw new OptimizationConfigError(
        `Coarse grid configuration required for mode: ${config.mode}`,
        'coarseGridConfig'
      )
    }

    if (!config.coarseGridConfig.enabled) {
      throw new OptimizationConfigError(
        `Coarse grid must be enabled for mode: ${config.mode}`,
        'coarseGridConfig.enabled'
      )
    }
  }

  if (config.mode === 'FULL_REFINEMENT') {
    if (!config.localRefinementConfig) {
      throw new OptimizationConfigError(
        `Local refinement configuration required for mode: ${config.mode}`,
        'localRefinementConfig'
      )
    }

    if (!config.localRefinementConfig.enabled) {
      throw new OptimizationConfigError(
        `Local refinement must be enabled for mode: ${config.mode}`,
        'localRefinementConfig.enabled'
      )
    }
  }

  // Validate total API usage constraints
  validateApiUsageConstraints(config)
}

/**
 * Validate that the configuration doesn't exceed API usage limits
 * @param config Optimization configuration to validate
 * @throws OptimizationConfigError if configuration would exceed API limits
 */
export const validateApiUsageConstraints = (config: OptimizationConfig): void => {
  let totalHypothesisPoints = 0

  // Phase 0 always has baseline points (typically 4-20 points depending on location count)
  const estimatedPhase0Points = 20 // Conservative estimate

  totalHypothesisPoints += estimatedPhase0Points

  // Phase 1 coarse grid points
  if (config.coarseGridConfig?.enabled) {
    const gridPoints = config.coarseGridConfig.gridResolution * config.coarseGridConfig.gridResolution
    totalHypothesisPoints += gridPoints
  }

  // Phase 2 local refinement points
  if (config.localRefinementConfig?.enabled) {
    const pointsPerCandidate = config.localRefinementConfig.fineGridResolution * config.localRefinementConfig.fineGridResolution
    const refinementPoints = pointsPerCandidate * config.localRefinementConfig.topK
    totalHypothesisPoints += refinementPoints
  }

  // OpenRouteService Matrix API has limits on matrix size
  // Conservative limit: 200 destinations per request
  if (totalHypothesisPoints > 200) {
    throw new OptimizationConfigError(
      `Configuration would generate approximately ${totalHypothesisPoints} hypothesis points, exceeding API limit of 200 destinations per matrix request`,
      'apiUsageConstraints'
    )
  }

  // Warn about high API usage (but don't fail)
  if (totalHypothesisPoints > 100) {
    console.warn(`Configuration will generate approximately ${totalHypothesisPoints} hypothesis points, which may result in slower response times`)
  }
}

/**
 * Validate geographic constraints for optimization configuration
 * @param config Optimization configuration to validate
 * @param locationCount Number of participant locations
 * @throws OptimizationConfigError if configuration is inappropriate for location distribution
 */
export const validateGeographicConstraints = (config: OptimizationConfig, locationCount: number): void => {
  // For very few locations, coarse grid may not be beneficial
  if (locationCount < 3 && config.mode !== 'BASELINE') {
    throw new OptimizationConfigError(
      `Advanced optimization modes not recommended for ${locationCount} locations. Use BASELINE mode for better performance`,
      'mode'
    )
  }

  // For many locations, ensure refinement parameters are reasonable
  if (locationCount > 8 && config.localRefinementConfig?.enabled) {
    if (config.localRefinementConfig.topK > 5) {
      throw new OptimizationConfigError(
        `TopK value ${config.localRefinementConfig.topK} too high for ${locationCount} locations. Recommend topK ≤ 5 for better performance`,
        'localRefinementConfig.topK'
      )
    }
  }
}

/**
 * Create optimization configuration with reasonable defaults
 * @param mode Optimization mode
 * @param overrides Optional configuration overrides
 * @returns Complete optimization configuration with defaults applied
 */
export const createOptimizationConfig = (
  mode: OptimizationMode,
  overrides: Partial<OptimizationConfig> = {}
): OptimizationConfig => {
  const baseConfig: OptimizationConfig = {
    mode,
    coarseGridConfig: {
      enabled: mode !== 'BASELINE',
      paddingKm: 5,
      gridResolution: 5
    },
    localRefinementConfig: {
      enabled: mode === 'FULL_REFINEMENT',
      topK: 3,
      refinementRadiusKm: 2,
      fineGridResolution: 3
    }
  }

  // Apply overrides
  const config: OptimizationConfig = {
    ...baseConfig,
    ...overrides,
    coarseGridConfig: {
      ...baseConfig.coarseGridConfig,
      ...overrides.coarseGridConfig
    },
    localRefinementConfig: {
      ...baseConfig.localRefinementConfig,
      ...overrides.localRefinementConfig
    }
  }

  // Validate the final configuration
  validateOptimizationConfig(config)

  return config
}