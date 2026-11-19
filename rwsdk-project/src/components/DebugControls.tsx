'use client'

import React, { useState } from 'react'

interface DebugPoint {
  id: string
  coordinate: { latitude: number; longitude: number }
  type: 'ANCHOR' | 'GRID'
}

interface DebugControlsProps {
  debugPoints: DebugPoint[]
  showAnchors: boolean
  showGrid: boolean
  onToggleAnchors: (show: boolean) => void
  onToggleGrid: (show: boolean) => void
}

export function DebugControls({
  debugPoints,
  showAnchors,
  showGrid,
  onToggleAnchors,
  onToggleGrid,
}: DebugControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Count points by type for statistics
  const anchorPoints = debugPoints.filter((point) => point.type === 'ANCHOR')
  const gridPoints = debugPoints.filter((point) => point.type === 'GRID')
  const totalPoints = debugPoints.length
  const visibleDebugPoints =
    (showAnchors ? anchorPoints.length : 0) + (showGrid ? gridPoints.length : 0)

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🐛</span>
          <h2 className="text-lg font-semibold">Debug Visualization</h2>
          {totalPoints > 0 && (
            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
              {totalPoints} points
            </span>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-500 hover:text-gray-700 p-1"
          aria-label={
            isExpanded ? 'Collapse debug controls' : 'Expand debug controls'
          }
        >
          {isExpanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="space-y-4">
          {/* Debug Point Toggles */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Hypothesis Point Visualization
            </h3>

            <div className="space-y-2">
              {/* Anchor Points Toggle */}
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAnchors}
                    onChange={(e) => onToggleAnchors(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-blue-600">🎯</span>
                    <span className="text-sm font-medium">
                      Show Anchor Points
                    </span>
                  </div>
                </label>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    showAnchors
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {anchorPoints.length} points
                </span>
              </div>

              {/* Grid Points Toggle */}
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => onToggleGrid(e.target.checked)}
                    className="w-4 h-4 text-gray-600 border-gray-300 rounded focus:ring-gray-500"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">⚏</span>
                    <span className="text-sm font-medium">
                      Show Grid Points
                    </span>
                  </div>
                </label>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    showGrid
                      ? 'bg-gray-200 text-gray-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {gridPoints.length} points
                </span>
              </div>
            </div>
          </div>

          {/* Algorithm Independence Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <div className="flex items-start gap-2">
              <span className="text-blue-600 text-sm">ℹ️</span>
              <p className="text-blue-800 text-sm">
                These toggles only affect visualization. All points remain in
                algorithm calculations.
              </p>
            </div>
          </div>

          {/* Legend */}
          {(showAnchors || showGrid || totalPoints > 0) && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Marker Legend
              </h4>
              <div className="space-y-2">
                {/* Anchor Points */}
                {showAnchors && anchorPoints.length > 0 && (
                  <div className="flex items-start gap-3 p-2 bg-blue-50 rounded">
                    <div className="w-3 h-3 rounded-full bg-blue-600 border border-white mt-0.5"></div>
                    <div>
                      <p className="text-sm font-medium text-blue-900">
                        Anchor Points
                      </p>
                      <p className="text-xs text-blue-700">
                        Geographic centroid, median coordinates, participant
                        locations, pairwise midpoints ({anchorPoints.length}{' '}
                        points)
                      </p>
                    </div>
                  </div>
                )}

                {/* Grid Points */}
                {showGrid && gridPoints.length > 0 && (
                  <div className="flex items-start gap-3 p-2 bg-gray-50 rounded">
                    <div className="w-3 h-3 bg-gray-500 border border-white mt-0.5"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Grid Points
                      </p>
                      <p className="text-xs text-gray-700">
                        Bounding box grid cell centers ({gridPoints.length}{' '}
                        points)
                      </p>
                    </div>
                  </div>
                )}

                {/* Optimal Points (always visible) */}
                <div className="flex items-start gap-3 p-2 bg-green-50 rounded">
                  <span className="text-green-600 text-sm mt-0.5">⭐</span>
                  <div>
                    <p className="text-sm font-medium text-green-900">
                      Optimal Points
                    </p>
                    <p className="text-xs text-green-700">
                      Top-ranked meeting points (always visible with higher
                      z-index)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Statistics */}
          {totalPoints > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Statistics
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-lg font-bold text-blue-600">
                    {totalPoints}
                  </div>
                  <div className="text-xs text-gray-600">
                    Total Hypothesis Points
                  </div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-lg font-bold text-gray-600">
                    {visibleDebugPoints}
                  </div>
                  <div className="text-xs text-gray-600">
                    Visible Debug Points
                  </div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded">
                  <div className="text-sm font-medium text-blue-800">
                    {anchorPoints.length}
                  </div>
                  <div className="text-xs text-gray-600">Anchor Points</div>
                </div>
                <div className="text-center p-3 bg-gray-100 rounded">
                  <div className="text-sm font-medium text-gray-800">
                    {gridPoints.length}
                  </div>
                  <div className="text-xs text-gray-600">Grid Points</div>
                </div>
              </div>
            </div>
          )}

          {/* Help Text */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <div className="flex items-start gap-2">
              <span className="text-blue-600 text-sm">ℹ️</span>
              <div>
                <p className="text-blue-800 text-sm font-medium mb-1">
                  How to use:
                </p>
                <ul className="text-blue-700 text-sm space-y-1 list-disc list-inside">
                  <li>
                    Toggle anchor points to see geographic centroid, median
                    coordinates, participant locations, and pairwise midpoints
                  </li>
                  <li>
                    Toggle grid points to see bounding box grid cell centers
                    used for systematic search
                  </li>
                  <li>
                    Optimal points (green stars) are always visible and have
                    higher z-index priority
                  </li>
                  <li>
                    Debug visualization does not affect algorithm calculations
                    or results
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
