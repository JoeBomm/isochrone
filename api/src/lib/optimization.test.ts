import {
  type OptimizationMode,
  type OptimizationConfig,
  DEFAULT_OPTIMIZATION_CONFIG,
  OptimizationConfigError,
  validateOptimizationMode,
  validateCoarseGridConfig,
  validateLocalRefinementConfig,
  validateOptimizationConfig,
  createOptimizationConfig
} from './optimization'

describe('optimization configuration', () => {
  describe('validateOptimizationMode', () => {
    it('accepts valid optimization modes', () => {
      expect(validateOptimizationMode('BASELINE')).toBe('BASELINE')
      expect(validateOptimizationMode('COARSE_GRID')).toBe('COARSE_GRID')
      expect(validateOptimizationMode('FULL_REFINEMENT')).toBe('FULL_REFINEMENT')
    })

    it('rejects invalid optimization modes', () => {
      expect(() => validateOptimizationMode('INVALID')).toThrow(OptimizationConfigError)
      expect(() => validateOptimizationMode('')).toThrow(OptimizationConfigError)
      expect(() => validateOptimizationMode('baseline')).toThrow(OptimizationConfigError)
    })
  })

  describe('validateCoarseGridConfig', () => {
    it('accepts valid coarse grid configuration', () => {
      expect(() => validateCoarseGridConfig({
        enabled: true,
        paddingKm: 5,
        gridResolution: 5
      })).not.toThrow()
    })

    it('rejects invalid padding values', () => {
      expect(() => validateCoarseGridConfig({
        enabled: true,
        paddingKm: -1,
        gridResolution: 5
      })).toThrow(OptimizationConfigError)

      expect(() => validateCoarseGridConfig({
        enabled: true,
        paddingKm: 100,
        gridResolution: 5
      })).toThrow(OptimizationConfigError)
    })

    it('rejects invalid grid resolution values', () => {
      expect(() => validateCoarseGridConfig({
        enabled: true,
        paddingKm: 5,
        gridResolution: 1
      })).toThrow(OptimizationConfigError)

      expect(() => validateCoarseGridConfig({
        enabled: true,
        paddingKm: 5,
        gridResolution: 15
      })).toThrow(OptimizationConfigError)
    })
  })

  describe('validateLocalRefinementConfig', () => {
    it('accepts valid local refinement configuration', () => {
      expect(() => validateLocalRefinementConfig({
        enabled: true,
        topK: 3,
        refinementRadiusKm: 2,
        fineGridResolution: 3
      })).not.toThrow()
    })

    it('rejects invalid topK values', () => {
      expect(() => validateLocalRefinementConfig({
        enabled: true,
        topK: 0,
        refinementRadiusKm: 2,
        fineGridResolution: 3
      })).toThrow(OptimizationConfigError)

      expect(() => validateLocalRefinementConfig({
        enabled: true,
        topK: 15,
        refinementRadiusKm: 2,
        fineGridResolution: 3
      })).toThrow(OptimizationConfigError)
    })

    it('rejects invalid refinement radius values', () => {
      expect(() => validateLocalRefinementConfig({
        enabled: true,
        topK: 3,
        refinementRadiusKm: 0.1,
        fineGridResolution: 3
      })).toThrow(OptimizationConfigError)

      expect(() => validateLocalRefinementConfig({
        enabled: true,
        topK: 3,
        refinementRadiusKm: 20,
        fineGridResolution: 3
      })).toThrow(OptimizationConfigError)
    })

    it('rejects invalid fine grid resolution values', () => {
      expect(() => validateLocalRefinementConfig({
        enabled: true,
        topK: 3,
        refinementRadiusKm: 2,
        fineGridResolution: 1
      })).toThrow(OptimizationConfigError)

      expect(() => validateLocalRefinementConfig({
        enabled: true,
        topK: 3,
        refinementRadiusKm: 2,
        fineGridResolution: 10
      })).toThrow(OptimizationConfigError)
    })
  })

  describe('validateOptimizationConfig', () => {
    it('accepts valid baseline configuration', () => {
      expect(() => validateOptimizationConfig({
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
      })).not.toThrow()
    })

    it('accepts valid coarse grid configuration', () => {
      expect(() => validateOptimizationConfig({
        mode: 'COARSE_GRID',
        coarseGridConfig: {
          enabled: true,
          paddingKm: 5,
          gridResolution: 5
        },
        localRefinementConfig: {
          enabled: false,
          topK: 3,
          refinementRadiusKm: 2,
          fineGridResolution: 3
        }
      })).not.toThrow()
    })

    it('accepts valid full refinement configuration', () => {
      expect(() => validateOptimizationConfig({
        mode: 'FULL_REFINEMENT',
        coarseGridConfig: {
          enabled: true,
          paddingKm: 5,
          gridResolution: 5
        },
        localRefinementConfig: {
          enabled: true,
          topK: 3,
          refinementRadiusKm: 2,
          fineGridResolution: 3
        }
      })).not.toThrow()
    })

    it('requires coarse grid config for COARSE_GRID mode', () => {
      expect(() => validateOptimizationConfig({
        mode: 'COARSE_GRID'
      })).toThrow(OptimizationConfigError)
    })

    it('requires enabled coarse grid for COARSE_GRID mode', () => {
      expect(() => validateOptimizationConfig({
        mode: 'COARSE_GRID',
        coarseGridConfig: {
          enabled: false,
          paddingKm: 5,
          gridResolution: 5
        }
      })).toThrow(OptimizationConfigError)
    })

    it('requires local refinement config for FULL_REFINEMENT mode', () => {
      expect(() => validateOptimizationConfig({
        mode: 'FULL_REFINEMENT',
        coarseGridConfig: {
          enabled: true,
          paddingKm: 5,
          gridResolution: 5
        }
      })).toThrow(OptimizationConfigError)
    })

    it('requires enabled local refinement for FULL_REFINEMENT mode', () => {
      expect(() => validateOptimizationConfig({
        mode: 'FULL_REFINEMENT',
        coarseGridConfig: {
          enabled: true,
          paddingKm: 5,
          gridResolution: 5
        },
        localRefinementConfig: {
          enabled: false,
          topK: 3,
          refinementRadiusKm: 2,
          fineGridResolution: 3
        }
      })).toThrow(OptimizationConfigError)
    })
  })

  describe('createOptimizationConfig', () => {
    it('creates baseline configuration with defaults', () => {
      const config = createOptimizationConfig('BASELINE')

      expect(config.mode).toBe('BASELINE')
      expect(config.coarseGridConfig?.enabled).toBe(false)
      expect(config.localRefinementConfig?.enabled).toBe(false)
    })

    it('creates coarse grid configuration with defaults', () => {
      const config = createOptimizationConfig('COARSE_GRID')

      expect(config.mode).toBe('COARSE_GRID')
      expect(config.coarseGridConfig?.enabled).toBe(true)
      expect(config.coarseGridConfig?.paddingKm).toBe(5)
      expect(config.coarseGridConfig?.gridResolution).toBe(5)
      expect(config.localRefinementConfig?.enabled).toBe(false)
    })

    it('creates full refinement configuration with defaults', () => {
      const config = createOptimizationConfig('FULL_REFINEMENT')

      expect(config.mode).toBe('FULL_REFINEMENT')
      expect(config.coarseGridConfig?.enabled).toBe(true)
      expect(config.localRefinementConfig?.enabled).toBe(true)
      expect(config.localRefinementConfig?.topK).toBe(3)
      expect(config.localRefinementConfig?.refinementRadiusKm).toBe(2)
      expect(config.localRefinementConfig?.fineGridResolution).toBe(3)
    })

    it('applies configuration overrides', () => {
      const config = createOptimizationConfig('COARSE_GRID', {
        coarseGridConfig: {
          enabled: true,
          paddingKm: 10,
          gridResolution: 7
        }
      })

      expect(config.coarseGridConfig?.paddingKm).toBe(10)
      expect(config.coarseGridConfig?.gridResolution).toBe(7)
    })

    it('validates the final configuration', () => {
      expect(() => createOptimizationConfig('COARSE_GRID', {
        coarseGridConfig: {
          enabled: false, // Invalid for COARSE_GRID mode
          paddingKm: 5,
          gridResolution: 5
        }
      })).toThrow(OptimizationConfigError)
    })
  })

  describe('DEFAULT_OPTIMIZATION_CONFIG', () => {
    it('has correct baseline defaults', () => {
      expect(DEFAULT_OPTIMIZATION_CONFIG.mode).toBe('BASELINE')
      expect(DEFAULT_OPTIMIZATION_CONFIG.coarseGridConfig?.enabled).toBe(false)
      expect(DEFAULT_OPTIMIZATION_CONFIG.localRefinementConfig?.enabled).toBe(false)
    })

    it('passes validation', () => {
      expect(() => validateOptimizationConfig(DEFAULT_OPTIMIZATION_CONFIG)).not.toThrow()
    })
  })
})