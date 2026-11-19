'use client'

import React, { useState } from 'react'

export interface HypothesisPoint {
  id: string
  coordinate: { latitude: number; longitude: number }
  type:
    | 'GEOGRAPHIC_CENTROID'
    | 'MEDIAN_COORDINATE'
    | 'PARTICIPANT_LOCATION'
    | 'PAIRWISE_MIDPOINT'
    | 'COARSE_GRID_CELL'
    | 'LOCAL_REFINEMENT_CELL'
  phase?: 'ANCHOR' | 'COARSE_GRID' | 'LOCAL_REFINEMENT' | 'FINAL_OUTPUT'
  score?: number
  travelTimeMetrics?: {
    maxTravelTime: number
    averageTravelTime: number
    totalTravelTime: number
    variance?: number
  }
  metadata?: {
    participantId?: string
    pairIds?: string[]
  }
}

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

export function DeveloperOptions({
  enabled,
  onToggle,
  hypothesisPoints,
  allHypothesisPoints,
}: DeveloperOptionsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Calculate statistics for different point types
  const stats = {
    anchors: allHypothesisPoints.anchorPoints.length,
    coarseGrid: allHypothesisPoints.coarseGridPoints.length,
    localRefinement: allHypothesisPoints.localRefinementPoints.length,
    finalOutput: allHypothesisPoints.finalPoints.length,
    total: hypothesisPoints.length,
  }

  const hasResults = stats.total > 0

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg">
      {/* Header */}
      <div className="p-4 border-b border-yellow-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-yellow-600 text-xl">⚙️</span>
            <h3 className="text-lg font-semibold text-yellow-800">
              Developer Options
            </h3>
            <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded-full">
              Debug Mode
            </span>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-yellow-600 hover:text-yellow-800 transition-colors p-1"
            aria-label={
              isExpanded
                ? 'Collapse developer options'
                : 'Expand developer options'
            }
          >
            {isExpanded ? '▲' : '▼'}
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
                    Show all hypothesis points with color coding by algorithm
                    phase
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
                  <span className="text-amber-600 mr-2 mt-0.5">⚠️</span>
                  <div>
                    <p className="font-medium">Performance Notice</p>
                    <p className="mt-1">
                      Displaying only 50 of {stats.total} hypothesis points for
                      optimal map performance.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Algorithm Independence Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start">
              <span className="text-blue-500 mr-2 mt-0.5">ℹ️</span>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Visualization Only</p>
                <p className="text-xs text-blue-700">
                  Developer options only affect what you see on the map. The
                  core algorithm calculations remain unchanged. This ensures
                  debugging doesn't interfere with the actual optimization
                  results.
                </p>
              </div>
            </div>
          </div>

          {/* Color-Coded Legend */}
          {enabled && hasResults && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-yellow-800">
                Algorithm Phase Legend
              </h4>
              <div className="grid grid-cols-1 gap-3 text-xs">
                {/* Phase 0: Anchor Points */}
                {stats.anchors > 0 && (
                  <div className="flex items-center space-x-3 p-2 bg-blue-50 rounded border border-blue-200">
                    <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-sm flex-shrink-0"></div>
                    <div className="flex-1">
                      <div className="font-medium text-blue-800">
                        Phase 0: Anchor Points
                      </div>
                      <div className="text-blue-700">
                        Baseline hypothesis points ({stats.anchors} points)
                      </div>
                      <div className="text-blue-600 text-xs mt-1">
                        Geographic centroid, median coordinates, participant
                        locations, pairwise midpoints
                      </div>
                    </div>
                  </div>
                )}

                {/* Phase 1: Coarse Grid */}
                {stats.coarseGrid > 0 && (
                  <div className="flex items-center space-x-3 p-2 bg-gray-50 rounded border border-gray-200">
                    <div className="w-4 h-4 bg-gray-500 border-2 border-white shadow-sm flex-shrink-0"></div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">
                        Phase 1: Coarse Grid
                      </div>
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
                      <div className="font-medium text-red-800">
                        Phase 2: Local Refinement
                      </div>
                      <div className="text-red-700">
                        Fine-grained local search ({stats.localRefinement}{' '}
                        points)
                      </div>
                      <div className="text-red-600 text-xs mt-1">
                        Local grids around top-performing candidates from
                        previous phases
                      </div>
                    </div>
                  </div>
                )}

                {/* Final Output: Points of Interest */}
                {stats.finalOutput > 0 && (
                  <div className="flex items-center space-x-3 p-2 bg-green-50 rounded border border-green-200">
                    <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-sm flex-shrink-0"></div>
                    <div className="flex-1">
                      <div className="font-medium text-green-800">
                        Final Output: Points of Interest
                      </div>
                      <div className="text-green-700">
                        Top-ranked meeting locations ({stats.finalOutput}{' '}
                        points)
                      </div>
                      <div className="text-green-600 text-xs mt-1">
                        Best candidates after multi-phase optimization and
                        deduplication
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Statistics Summary */}
          {hasResults && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-yellow-800">
                Algorithm Statistics
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-2 rounded border border-yellow-200">
                  <div className="font-medium text-gray-800">Total Points</div>
                  <div className="text-lg font-bold text-yellow-700">
                    {stats.total}
                  </div>
                </div>
                <div className="bg-white p-2 rounded border border-yellow-200">
                  <div className="font-medium text-gray-800">Phases Used</div>
                  <div className="text-lg font-bold text-yellow-700">
                    {
                      [
                        stats.anchors > 0,
                        stats.coarseGrid > 0,
                        stats.localRefinement > 0,
                      ].filter(Boolean).length
                    }
                    /3
                  </div>
                </div>
                <div className="bg-white p-2 rounded border border-yellow-200">
                  <div className="font-medium text-gray-800">
                    Final Candidates
                  </div>
                  <div className="text-lg font-bold text-yellow-700">
                    {stats.finalOutput}
                  </div>
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
              <li>
                Enable visualization to see all algorithm phases on the map
              </li>
              <li>
                Each phase uses distinct colors and shapes for easy
                identification
              </li>
              <li>
                Click points to inspect algorithm metadata and travel time
                calculations
              </li>
              <li>
                Compare different algorithm configurations by toggling phases
              </li>
              <li>
                This mode is hidden from end users and only affects
                visualization
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
