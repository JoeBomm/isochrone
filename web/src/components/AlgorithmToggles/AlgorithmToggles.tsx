import React from 'react'

export interface AlgorithmToggleState {
  showAnchors: boolean
  showCoarseGrid: boolean
  enableLocalRefinement: boolean
}

interface AlgorithmTogglesProps {
  toggleState: AlgorithmToggleState
  onToggleChange: (newState: AlgorithmToggleState) => void
  isCalculating?: boolean
  hasResults?: boolean
}

const AlgorithmToggles = ({
  toggleState,
  onToggleChange,
  isCalculating = false,
  hasResults = false
}: AlgorithmTogglesProps) => {
  const handleToggleChange = (field: keyof AlgorithmToggleState, value: boolean) => {
    const newState = {
      ...toggleState,
      [field]: value
    }
    onToggleChange(newState)
  }

  return (
    <div className="bg-gray-50 p-4 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">
          Algorithm Visualization
        </h3>
        <div className="group relative">
          <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-80 z-10">
            <div className="text-center">
              <p className="font-medium mb-1">Algorithm Visualization Controls</p>
              <p className="mb-2">These controls affect what you see on the map, not the calculations:</p>
              <div className="text-left space-y-1">
                <p>• <strong>Show Anchors:</strong> Display baseline anchor points (always calculated)</p>
                <p>• <strong>Show Coarse Grid:</strong> Display grid sampling points (always calculated)</p>
                <p>• <strong>Enable Local Refinement:</strong> Calculate and display local refinement points</p>
              </div>
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Anchor Points Toggle */}
        <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-sm"></div>
            <div>
              <div className="font-medium text-gray-900">Show Anchor Points</div>
              <div className="text-sm text-gray-600">
                Display baseline points (centroid, median, participants, midpoints)
              </div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={toggleState.showAnchors}
              onChange={(e) => handleToggleChange('showAnchors', e.target.checked)}
              disabled={isCalculating}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"></div>
          </label>
        </div>

        {/* Coarse Grid Toggle */}
        <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-4 h-4 bg-gray-500 border-2 border-white shadow-sm"></div>
            <div>
              <div className="font-medium text-gray-900">Show Coarse Grid</div>
              <div className="text-sm text-gray-600">
                Display systematic grid sampling points across the area
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={toggleState.showCoarseGrid}
                onChange={(e) => handleToggleChange('showCoarseGrid', e.target.checked)}
                disabled={isCalculating}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"></div>
            </label>
          </div>
        </div>

        {/* Local Refinement Toggle */}
        <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-4 h-4 bg-red-500 border-2 border-white shadow-sm transform rotate-45"></div>
            <div>
              <div className="font-medium text-gray-900">Enable Local Refinement</div>
              <div className="text-sm text-gray-600">
                Calculate and display fine-grained search around top candidates
              </div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={toggleState.enableLocalRefinement}
              onChange={(e) => handleToggleChange('enableLocalRefinement', e.target.checked)}
              disabled={isCalculating}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"></div>
          </label>
        </div>

        {/* Algorithm Impact Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-start">
            <svg className="w-4 h-4 text-blue-500 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Algorithm Impact</p>
              <div className="text-xs text-blue-700 space-y-1">
                <p>• <strong>Visual toggles</strong> (Show Anchors, Show Coarse Grid) only affect map display</p>
                <p>• <strong>Local Refinement</strong> affects both calculation and display</p>
                <p>• Anchor points and coarse grid are always calculated for accuracy</p>
                {hasResults && (
                  <p className="mt-2 text-blue-600">
                    💡 Change settings and recalculate to compare different algorithm combinations
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <h4 className="font-medium text-gray-800 mb-2">Point Type Legend</h4>
          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-blue-500 border border-white shadow-sm"></div>
              <span className="text-gray-700">Anchor Points (Phase 0)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-gray-500 border border-white shadow-sm"></div>
              <span className="text-gray-700">Coarse Grid (Phase 1)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-500 border border-white shadow-sm transform rotate-45"></div>
              <span className="text-gray-700">Local Refinement (Phase 2)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full border border-white shadow-sm"></div>
              <span className="text-gray-700">Final Points of Interest</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AlgorithmToggles