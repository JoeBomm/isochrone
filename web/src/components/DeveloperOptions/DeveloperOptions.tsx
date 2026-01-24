import React, { useState } from 'react'
import type { HypothesisPoint } from 'src/components/Map/Map'

export interface DeveloperOptionsProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  hypothesisPoints: HypothesisPoint[]
  allHypothesisPoints: {
    anchorPoints: HypothesisPoint[]
    coarseGridPoints: HypothesisPoint[]
    localRefinementPoints: HypothesisPoint[]
    finalPoints: HypothesisPoint[]
  }
}

const DeveloperOptions = ({
  enabled,
  onToggle,
  hypothesisPoints,
  allHypothesisPoints
}: DeveloperOptionsProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

  // Calculate statistics for different point types
  const stats = {
    anchors: allHypothesisPoints.anchorPoints.length,
    coarseGrid: allHypothesisPoints.coarseGridPoints.length,
    localRefinement: allHypothesisPoints.localRefinementPoints.length,
    finalOutput: allHypothesisPoints.finalPoints.length,
    total: hypothesisPoints.length
  }

  const hasResults = stats.total > 0

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg">
      {/* Header */}
      <div className="p-4 border-b border-yellow-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-yellow-800">
              Developer Options
            </h3>
            <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded-full">
              Debug Mode
            </span>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-yellow-600 hover:text-yellow-800 transition-colors"
            aria-label={isExpanded ? 'Collapse developer options' : 'Expand developer options'}
          >
            <svg
              className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Developer Mode Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => onToggle(e.target.checked)}
                  className="w-4 h-4 text-yellow-600 bg-gray-100 border-gray-300 rounded focus:ring-yellow-500 focus:ring-2"
                />
                <div>
                  <span className="text-sm font-medium text-yellow-800">
                    Enable Developer Visualization
                  </span>
                  <div className="text-xs text-yellow-700">
                    Show all hypothesis points with color coding by algorithm phase
                  </div>
                </div>
              </label>
              {hasResults && (
                <span className="text-xs text-yellow-600 bg-yellow-100 px-2 py-1 rounded">
                  {enabled ? `Showing ${Math.min(stats.total, 50)}` : 'Hidden'}
                  {stats.total > 50 && enabled && ` of ${stats.total}`} points
                </span>
              )}
            </div>

            {/* Performance Warning */}
            {stats.total > 50 && enabled && (
              <div className="text-xs text-amber-700 bg-amber-100 p-3 rounded border border-amber-300">
                <div className="flex items-start">
                  <svg className="w-4 h-4 text-amber-600 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <p className="font-medium">Performance Notice</p>
                    <p className="mt-1">Displaying only 50 of {stats.total} hypothesis points for optimal map performance.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Algorithm Independence Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start">
              <svg className="w-4 h-4 text-blue-500 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Visualization Only</p>
                <p className="text-xs text-blue-700">
                  Developer options only affect what you see on the map. The core algorithm calculations remain unchanged.
                  This ensures debugging doesn't interfere with the actual optimization results.
                </p>
              </div>
            </div>
          </div>

          {/* Color-Coded Legend */}
          {enabled && hasResults && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-yellow-800">Algorithm Phase Legend</h4>
              <div className="grid grid-cols-1 gap-3 text-xs">

                {/* Phase 0: Anchor Points */}
                {stats.anchors > 0 && (
                  <div className="flex items-center space-x-3 p-2 bg-blue-50 rounded border border-blue-200">
                    <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-sm flex-shrink-0"></div>
                    <div className="flex-1">
                      <div className="font-medium text-blue-800">Phase 0: Anchor Points</div>
                      <div className="text-blue-700">
                        Baseline hypothesis points ({stats.anchors} points)
                      </div>
                      <div className="text-blue-600 text-xs mt-1">
                        Geographic centroid, median coordinates, participant locations, pairwise midpoints
                      </div>
                    </div>
                  </div>
                )}

                {/* Phase 1: Coarse Grid */}
                {stats.coarseGrid > 0 && (
                  <div className="flex items-center space-x-3 p-2 bg-gray-50 rounded border border-gray-200">
                    <div className="w-4 h-4 bg-gray-500 border-2 border-white shadow-sm flex-shrink-0"></div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">Phase 1: Coarse Grid</div>
                      <div className="text-gray-700">
                        Systematic grid sampling ({stats.coarseGrid} points)
                      </div>
                      <div className="text-gray-600 text-xs mt-1">
                        Grid cell centers within bounding box of all locations
                      </div>
                    </div>
                  </div>
                )}

                {/* Phase 2: Local Refinement */}
                {stats.localRefinement > 0 && (
                  <div className="flex items-center space-x-3 p-2 bg-red-50 rounded border border-red-200">
                    <div className="w-4 h-4 bg-red-500 border-2 border-white shadow-sm transform rotate-45 flex-shrink-0"></div>
                    <div className="flex-1">
                      <div className="font-medium text-red-800">Phase 2: Local Refinement</div>
                      <div className="text-red-700">
                        Fine-grained local search ({stats.localRefinement} points)
                      </div>
                      <div className="text-red-600 text-xs mt-1">
                        Local grids around top-performing candidates from previous phases
                      </div>
                    </div>
                  </div>
                )}

                {/* Final Output: Points of Interest */}
                {stats.finalOutput > 0 && (
                  <div className="flex items-center space-x-3 p-2 bg-green-50 rounded border border-green-200">
                    <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-sm flex-shrink-0"></div>
                    <div className="flex-1">
                      <div className="font-medium text-green-800">Final Output: Points of Interest</div>
                      <div className="text-green-700">
                        Top-ranked meeting locations ({stats.finalOutput} points)
                      </div>
                      <div className="text-green-600 text-xs mt-1">
                        Best candidates after multi-phase optimization and deduplication
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Point Type Tooltips Guide */}
          {enabled && hasResults && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-yellow-800">Interactive Features</h4>
              <div className="text-xs text-yellow-700 space-y-1">
                <div className="flex items-center space-x-2">
                  <svg className="w-3 h-3 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.122 2.122" />
                  </svg>
                  <span>Click any hypothesis point for detailed information and metadata</span>
                </div>
                <div className="flex items-center space-x-2">
                  <svg className="w-3 h-3 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 0h10m-10 0V3a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H7z" />
                  </svg>
                  <span>Tooltips show point type, phase, coordinates, and travel time metrics</span>
                </div>
                <div className="flex items-center space-x-2">
                  <svg className="w-3 h-3 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span>Different shapes identify algorithm phases: circles, squares, diamonds</span>
                </div>
              </div>
            </div>
          )}

          {/* Statistics Summary */}
          {hasResults && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-yellow-800">Algorithm Statistics</h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-2 rounded border border-yellow-200">
                  <div className="font-medium text-gray-800">Total Points</div>
                  <div className="text-lg font-bold text-yellow-700">{stats.total}</div>
                </div>
                <div className="bg-white p-2 rounded border border-yellow-200">
                  <div className="font-medium text-gray-800">Phases Used</div>
                  <div className="text-lg font-bold text-yellow-700">
                    {[stats.anchors > 0, stats.coarseGrid > 0, stats.localRefinement > 0].filter(Boolean).length}/3
                  </div>
                </div>
                <div className="bg-white p-2 rounded border border-yellow-200">
                  <div className="font-medium text-gray-800">Final Candidates</div>
                  <div className="text-lg font-bold text-yellow-700">{stats.finalOutput}</div>
                </div>
                <div className="bg-white p-2 rounded border border-yellow-200">
                  <div className="font-medium text-gray-800">Map Display</div>
                  <div className="text-lg font-bold text-yellow-700">
                    {enabled ? Math.min(stats.total, 50) : 0}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Usage Instructions */}
          <div className="text-xs text-yellow-700 bg-yellow-100 p-3 rounded border border-yellow-300">
            <p className="font-medium mb-2">Developer Mode Usage:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Enable visualization to see all algorithm phases on the map</li>
              <li>Each phase uses distinct colors and shapes for easy identification</li>
              <li>Click points to inspect algorithm metadata and travel time calculations</li>
              <li>Compare different algorithm configurations by toggling phases</li>
              <li>This mode is hidden from end users and only affects visualization</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default DeveloperOptions