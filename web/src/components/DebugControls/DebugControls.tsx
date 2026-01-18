import { useState } from 'react'
import type { HypothesisPoint } from 'src/components/Map/Map'

interface DebugControlsProps {
  hypothesisPoints: HypothesisPoint[]
  showHypothesisPoints: boolean
  onToggleHypothesisPoints: (show: boolean) => void
}

const DebugControls = ({
  hypothesisPoints,
  showHypothesisPoints,
  onToggleHypothesisPoints
}: DebugControlsProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

  // Count points by type for statistics
  const pointStats = hypothesisPoints.reduce((stats, point) => {
    stats[point.type] = (stats[point.type] || 0) + 1
    return stats
  }, {} as Record<string, number>)

  const totalPoints = hypothesisPoints.length
  const visiblePoints = Math.min(totalPoints, 50) // Performance limit

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-800">
              Developer Debug Tools
            </h3>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label={isExpanded ? 'Collapse debug tools' : 'Expand debug tools'}
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
          {/* Hypothesis Points Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showHypothesisPoints}
                  onChange={(e) => onToggleHypothesisPoints(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <span className="text-sm font-medium text-gray-700">
                  Show Hypothesis Points
                </span>
              </label>
              <span className="text-xs text-gray-500">
                {showHypothesisPoints ? `Showing ${visiblePoints}` : 'Hidden'}
                {totalPoints > 50 && showHypothesisPoints && ` of ${totalPoints}`}
              </span>
            </div>

            {/* Performance Warning */}
            {totalPoints > 50 && showHypothesisPoints && (
              <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                <div className="flex items-start">
                  <svg className="w-3 h-3 text-amber-500 mt-0.5 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span>Performance: Showing only 50 of {totalPoints} points for optimal map performance.</span>
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          {showHypothesisPoints && totalPoints > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Marker Legend</h4>
              <div className="grid grid-cols-1 gap-2 text-xs">
                {/* Anchor Points (Phase 0) */}
                {(pointStats['GEOGRAPHIC_CENTROID'] || pointStats['MEDIAN_COORDINATE'] ||
                  pointStats['PARTICIPANT_LOCATION'] || pointStats['PAIRWISE_MIDPOINT']) && (
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500 border border-white flex-shrink-0"></div>
                    <span className="text-gray-600">
                      <strong>Anchor Points</strong> - Geographic centroid, median, participants, midpoints
                      {pointStats['GEOGRAPHIC_CENTROID'] && ` (${pointStats['GEOGRAPHIC_CENTROID']} centroid)`}
                      {pointStats['MEDIAN_COORDINATE'] && ` (${pointStats['MEDIAN_COORDINATE']} median)`}
                      {pointStats['PARTICIPANT_LOCATION'] && ` (${pointStats['PARTICIPANT_LOCATION']} participants)`}
                      {pointStats['PAIRWISE_MIDPOINT'] && ` (${pointStats['PAIRWISE_MIDPOINT']} midpoints)`}
                    </span>
                  </div>
                )}

                {/* Coarse Grid Points (Phase 1) */}
                {pointStats['COARSE_GRID'] && (
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-gray-500 border border-white flex-shrink-0"></div>
                    <span className="text-gray-600">
                      <strong>Coarse Grid</strong> - Grid search points ({pointStats['COARSE_GRID']} points)
                    </span>
                  </div>
                )}

                {/* Local Refinement Points (Phase 2) */}
                {pointStats['LOCAL_REFINEMENT'] && (
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-500 border border-white transform rotate-45 flex-shrink-0"></div>
                    <span className="text-gray-600">
                      <strong>Local Refinement</strong> - Fine-tuned search points ({pointStats['LOCAL_REFINEMENT']} points)
                    </span>
                  </div>
                )}

                {/* Optimal Point */}
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 flex-shrink-0">
                    <svg viewBox="0 0 12 12" className="w-full h-full">
                      <path d="M6 1l1.5 3L11 4.5l-2.5 2.5L9 11l-3-1.5L3 11l.5-4L1 4.5l3.5-.5L6 1z"
                            fill="#10b981" stroke="#fff" strokeWidth="1"/>
                    </svg>
                  </div>
                  <span className="text-gray-600">
                    <strong>Optimal Point</strong> - Selected minimax center (green star)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Statistics */}
          {totalPoints > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Statistics</h4>
              <div className="text-xs text-gray-600 space-y-1">
                <div>Total hypothesis points: <strong>{totalPoints}</strong></div>
                {showHypothesisPoints && (
                  <div>Visible on map: <strong>{visiblePoints}</strong></div>
                )}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {Object.entries(pointStats).map(([type, count]) => (
                    <div key={type} className="text-xs">
                      {getTypeLabel(type)}: <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Help Text */}
          <div className="text-xs text-gray-500 bg-gray-100 p-3 rounded">
            <p className="mb-2"><strong>How to use:</strong></p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Toggle "Show Hypothesis Points" to visualize algorithm candidates</li>
              <li>Click on any hypothesis point marker for detailed information</li>
              <li>Different shapes and colors represent different optimization phases</li>
              <li>The green star shows the selected optimal meeting point</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper function to get readable type labels
const getTypeLabel = (type: string): string => {
  switch (type) {
    case 'GEOGRAPHIC_CENTROID':
      return 'Centroid'
    case 'MEDIAN_COORDINATE':
      return 'Median'
    case 'PARTICIPANT_LOCATION':
      return 'Participants'
    case 'PAIRWISE_MIDPOINT':
      return 'Midpoints'
    case 'COARSE_GRID':
      return 'Coarse Grid'
    case 'LOCAL_REFINEMENT':
      return 'Refinement'
    default:
      return type
  }
}

export default DebugControls