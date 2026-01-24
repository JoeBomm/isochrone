import { useState } from 'react'

export type TravelMode = 'DRIVING_CAR' | 'CYCLING_REGULAR' | 'FOOT_WALKING'
export type OptimizationMode = 'BASELINE' | 'COARSE_GRID' | 'FULL_REFINEMENT'

export interface OptimizationConfig {
  mode: OptimizationMode
  coarseGridConfig?: {
    enabled: boolean
    paddingKm: number
    gridResolution: number
  }
  localRefinementConfig?: {
    enabled: boolean
    topK: number
    refinementRadiusKm: number
    fineGridResolution: number
  }
}

interface IsochroneControlsProps {
  travelMode: TravelMode
  slackTime: number
  optimizationConfig: OptimizationConfig
  onTravelModeChange: (mode: TravelMode) => void
  onSlackTimeChange: (minutes: number) => void
  onOptimizationConfigChange: (config: OptimizationConfig) => void
  onCalculate: () => Promise<void>
  isCalculating: boolean
  canCalculate: boolean
}

const TRAVEL_MODES = [
  { value: 'DRIVING_CAR' as const, label: 'Driving', icon: '🚗' },
  { value: 'CYCLING_REGULAR' as const, label: 'Cycling', icon: '🚴' },
  { value: 'FOOT_WALKING' as const, label: 'Walking', icon: '🚶' },
]

const OPTIMIZATION_MODES = [
  {
    value: 'BASELINE' as const,
    label: 'Baseline',
    description: 'Fast calculation using geographic and participant-based points',
    detailedDescription: 'Uses geographic centroid, median coordinates, participant locations, and pairwise midpoints. Best for quick results with small location sets.',
    apiCalls: '1 Matrix API call',
    icon: '⚡',
    whenToUse: 'Quick analysis, small groups (2-4 locations), or when API usage is limited',
    tradeOffs: 'Fastest but may miss optimal solutions in complex geographic distributions'
  },
  {
    value: 'COARSE_GRID' as const,
    label: 'Coarse Grid',
    description: 'Better accuracy with grid-based hypothesis points',
    detailedDescription: 'Adds systematic grid sampling over the geographic area. Evaluates more candidate points for improved solution quality.',
    apiCalls: '1-2 Matrix API calls',
    icon: '🎯',
    whenToUse: 'Medium groups (3-8 locations), balanced accuracy vs. speed requirements',
    tradeOffs: 'Good balance of accuracy and API efficiency, suitable for most use cases'
  },
  {
    value: 'FULL_REFINEMENT' as const,
    label: 'Full Refinement',
    description: 'Best accuracy with local refinement around top candidates',
    detailedDescription: 'Performs coarse grid analysis, then refines around the best candidates with fine-grained local search. Maximum solution quality.',
    apiCalls: '2 Matrix API calls',
    icon: '🔬',
    whenToUse: 'Large groups (5+ locations), critical meetings, or when optimal accuracy is required',
    tradeOffs: 'Highest accuracy but uses more API quota and takes longer to compute'
  }
]

const IsochroneControls = ({
  travelMode,
  slackTime,
  optimizationConfig,
  onTravelModeChange,
  onSlackTimeChange,
  onOptimizationConfigChange,
  onCalculate,
  isCalculating,
  canCalculate
}: IsochroneControlsProps) => {
  const [slackTimeError, setSlackTimeError] = useState('')
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false)
  const [showOptimizationHelp, setShowOptimizationHelp] = useState(false)

  const handleSlackTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value)
    setSlackTimeError('')

    if (isNaN(value) || value < 5 || value > 60) {
      setSlackTimeError('Slack time must be between 5 and 60 minutes')
      return
    }

    onSlackTimeChange(value)
  }

  const handleOptimizationModeChange = (mode: OptimizationMode) => {
    const newConfig: OptimizationConfig = {
      mode,
      coarseGridConfig: {
        enabled: mode !== 'BASELINE',
        paddingKm: optimizationConfig.coarseGridConfig?.paddingKm || 5,
        gridResolution: optimizationConfig.coarseGridConfig?.gridResolution || 5
      },
      localRefinementConfig: {
        enabled: mode === 'FULL_REFINEMENT',
        topK: optimizationConfig.localRefinementConfig?.topK || 3,
        refinementRadiusKm: optimizationConfig.localRefinementConfig?.refinementRadiusKm || 2,
        fineGridResolution: optimizationConfig.localRefinementConfig?.fineGridResolution || 3
      }
    }
    onOptimizationConfigChange(newConfig)
  }

  const handleCoarseGridConfigChange = (field: string, value: number) => {
    const newConfig: OptimizationConfig = {
      ...optimizationConfig,
      coarseGridConfig: {
        ...optimizationConfig.coarseGridConfig!,
        [field]: value
      }
    }
    onOptimizationConfigChange(newConfig)
  }

  const handleLocalRefinementConfigChange = (field: string, value: number) => {
    const newConfig: OptimizationConfig = {
      ...optimizationConfig,
      localRefinementConfig: {
        ...optimizationConfig.localRefinementConfig!,
        [field]: value
      }
    }
    onOptimizationConfigChange(newConfig)
  }

  const handleCalculate = async () => {
    if (!canCalculate || isCalculating) return

    try {
      await onCalculate()
    } catch (error) {
      console.error('Calculation failed:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Travel Mode Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Travel Mode
        </label>
        <div className="grid grid-cols-3 gap-2">
          {TRAVEL_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => onTravelModeChange(mode.value)}
              className={`p-3 rounded-lg border-2 transition-colors ${
                travelMode === mode.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
              disabled={isCalculating}
            >
              <div className="text-lg mb-1">{mode.icon}</div>
              <div className="text-xs font-medium">{mode.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Optimization Mode Selection */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-700">
            Optimization Mode
          </label>
          <button
            type="button"
            onClick={() => setShowOptimizationHelp(!showOptimizationHelp)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
          >
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Help
          </button>
        </div>

        {/* Optimization Help Panel */}
        {showOptimizationHelp && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-3">Optimization Mode Guide</h4>
            <div className="space-y-3 text-sm text-blue-800">
              {OPTIMIZATION_MODES.map((mode) => (
                <div key={mode.value} className="border-l-2 border-blue-300 pl-3">
                  <div className="flex items-center mb-1">
                    <span className="mr-2">{mode.icon}</span>
                    <span className="font-medium">{mode.label}</span>
                    <span className="ml-2 text-xs bg-blue-200 px-2 py-0.5 rounded">
                      {mode.apiCalls}
                    </span>
                  </div>
                  <p className="text-xs mb-1">{mode.detailedDescription}</p>
                  <p className="text-xs text-blue-600">
                    <strong>When to use:</strong> {mode.whenToUse}
                  </p>
                  <p className="text-xs text-blue-600">
                    <strong>Trade-offs:</strong> {mode.tradeOffs}
                  </p>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-blue-200">
                <p className="text-xs text-blue-700">
                  <strong>Algorithm Overview:</strong> The system generates strategic hypothesis points
                  (candidate meeting locations) and uses the OpenRouteService Matrix API to evaluate
                  actual travel times. It then selects the point that minimizes the maximum travel
                  time for all participants, ensuring fairness.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {OPTIMIZATION_MODES.map((mode) => (
            <div
              key={mode.value}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                optimizationConfig.mode === mode.value
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
              onClick={() => handleOptimizationModeChange(mode.value)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="text-lg">{mode.icon}</div>
                  <div>
                    <div className="font-medium text-gray-900">{mode.label}</div>
                    <div className="text-sm text-gray-600">{mode.description}</div>
                  </div>
                </div>
                <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  {mode.apiCalls}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced Configuration */}
      {(optimizationConfig.mode === 'COARSE_GRID' || optimizationConfig.mode === 'FULL_REFINEMENT') && (
        <div>
          <button
            type="button"
            onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
            className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-3 hover:text-gray-900"
          >
            <span>Advanced Configuration</span>
            <svg
              className={`w-4 h-4 transition-transform ${showAdvancedConfig ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAdvancedConfig && (
            <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
              <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-200 p-3 rounded">
                <p className="font-medium text-yellow-800 mb-1">⚠️ Advanced Configuration</p>
                <p>These settings control the multi-phase optimization algorithm. Default values work well for most use cases. Adjust only if you understand the trade-offs between accuracy and API usage.</p>
              </div>

              {/* Coarse Grid Configuration */}
              {optimizationConfig.coarseGridConfig?.enabled && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Coarse Grid Settings</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Padding (km)
                        <span className="ml-1 text-gray-400 cursor-help" title="Geographic padding around participant locations for grid generation">ⓘ</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        value={optimizationConfig.coarseGridConfig.paddingKm}
                        onChange={(e) => handleCoarseGridConfigChange('paddingKm', parseFloat(e.target.value))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        disabled={isCalculating}
                      />
                      <p className="text-xs text-gray-500 mt-1">Expands search area beyond participant locations</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Grid Resolution
                        <span className="ml-1 text-gray-400 cursor-help" title="Number of grid points per dimension (e.g., 5 = 5×5 = 25 points)">ⓘ</span>
                      </label>
                      <input
                        type="number"
                        min="2"
                        max="10"
                        value={optimizationConfig.coarseGridConfig.gridResolution}
                        onChange={(e) => handleCoarseGridConfigChange('gridResolution', parseInt(e.target.value))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        disabled={isCalculating}
                      />
                      <p className="text-xs text-gray-500 mt-1">Higher values = more candidates, more API usage</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Local Refinement Configuration */}
              {optimizationConfig.localRefinementConfig?.enabled && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Local Refinement Settings</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Top Candidates
                        <span className="ml-1 text-gray-400 cursor-help" title="Number of best candidates to refine around">ⓘ</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={optimizationConfig.localRefinementConfig.topK}
                        onChange={(e) => handleLocalRefinementConfigChange('topK', parseInt(e.target.value))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        disabled={isCalculating}
                      />
                      <p className="text-xs text-gray-500 mt-1">Best coarse grid points to refine</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Refinement Radius (km)
                        <span className="ml-1 text-gray-400 cursor-help" title="Search radius around each top candidate">ⓘ</span>
                      </label>
                      <input
                        type="number"
                        min="0.5"
                        max="10"
                        step="0.1"
                        value={optimizationConfig.localRefinementConfig.refinementRadiusKm}
                        onChange={(e) => handleLocalRefinementConfigChange('refinementRadiusKm', parseFloat(e.target.value))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        disabled={isCalculating}
                      />
                      <p className="text-xs text-gray-500 mt-1">Local search area around candidates</p>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Fine Grid Resolution
                        <span className="ml-1 text-gray-400 cursor-help" title="Grid density within each refinement area">ⓘ</span>
                      </label>
                      <input
                        type="number"
                        min="2"
                        max="5"
                        value={optimizationConfig.localRefinementConfig.fineGridResolution}
                        onChange={(e) => handleLocalRefinementConfigChange('fineGridResolution', parseInt(e.target.value))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        disabled={isCalculating}
                      />
                      <p className="text-xs text-gray-500 mt-1">Density of refinement grid (keep low to control API usage)</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Slack Time Input */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="slack-time" className="block text-sm font-medium text-gray-700">
            Slack Time (minutes)
          </label>
          <div className="group relative">
            <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-64 z-10">
              <div className="text-center">
                <p className="font-medium mb-1">Slack Time Explained</p>
                <p>This is the visualization radius around the optimal meeting point. It shows areas accessible within this time from the calculated center.</p>
                <p className="mt-1 text-gray-300">Note: This does NOT affect the meeting point calculation - it's only for visualization purposes.</p>
              </div>
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
        <input
          id="slack-time"
          type="number"
          min="5"
          max="60"
          value={slackTime}
          onChange={handleSlackTimeChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={isCalculating}
        />
        <p className="text-xs text-gray-500 mt-1">
          Visualization radius around the optimal meeting point (5-60 minutes).
          <span className="font-medium"> This does not influence the meeting point calculation.</span>
        </p>
        {slackTimeError && (
          <div className="text-sm text-red-600 bg-red-50 p-2 rounded mt-1">
            {slackTimeError}
          </div>
        )}
      </div>

      {/* Calculate Button */}
      <div>
        <button
          onClick={handleCalculate}
          disabled={!canCalculate || isCalculating || !!slackTimeError}
          className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isCalculating ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating points...
            </div>
          ) : (
            'Generate Hypothesis Points'
          )}
        </button>

        {!canCalculate && (
          <p className="text-sm text-gray-500 mt-2 text-center">
            Add at least 2 locations to calculate
          </p>
        )}
      </div>

      {/* Settings Summary */}
      <div className="bg-gray-50 p-3 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Current Configuration</h4>
        <div className="text-xs text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>Travel Mode:</span>
            <span className="font-medium">{TRAVEL_MODES.find(m => m.value === travelMode)?.label}</span>
          </div>
          <div className="flex justify-between">
            <span>Optimization:</span>
            <span className="font-medium">{OPTIMIZATION_MODES.find(m => m.value === optimizationConfig.mode)?.label}</span>
          </div>
          <div className="flex justify-between">
            <span>Slack Time:</span>
            <span className="font-medium">{slackTime} minutes</span>
          </div>
          <div className="flex justify-between">
            <span>Expected API Usage:</span>
            <span className="font-medium text-blue-600">{OPTIMIZATION_MODES.find(m => m.value === optimizationConfig.mode)?.apiCalls}</span>
          </div>
          {optimizationConfig.mode !== 'BASELINE' && (
            <>
              <hr className="my-2 border-gray-300" />
              <div className="text-xs text-gray-500">
                <div className="font-medium mb-1">Algorithm Details:</div>
                {optimizationConfig.coarseGridConfig?.enabled && (
                  <div>• Grid: {optimizationConfig.coarseGridConfig.gridResolution}×{optimizationConfig.coarseGridConfig.gridResolution} with {optimizationConfig.coarseGridConfig.paddingKm}km padding</div>
                )}
                {optimizationConfig.localRefinementConfig?.enabled && (
                  <div>• Refinement: Top {optimizationConfig.localRefinementConfig.topK} candidates, {optimizationConfig.localRefinementConfig.refinementRadiusKm}km radius</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default IsochroneControls