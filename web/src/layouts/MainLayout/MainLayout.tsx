import type { ReactNode } from 'react'

import ErrorBoundary from 'src/components/ErrorBoundary/ErrorBoundary'
import MapErrorBoundary from 'src/components/ErrorBoundary/MapErrorBoundary'
import type { Location } from 'src/components/LocationInput/LocationInput'
import Map, { type Coordinate } from 'src/components/Map/Map'

interface OptimalPoint {
  id: string
  coordinate: Coordinate
  travelTimeMetrics: {
    maxTravelTime: number
    averageTravelTime: number
    totalTravelTime: number
    variance: number
  }
  rank: number
}

interface DebugPoint {
  id: string
  coordinate: Coordinate
  type: 'ANCHOR' | 'GRID'
}

interface MainLayoutProps {
  children?: ReactNode
  locations?: Location[]
  optimalPoints?: OptimalPoint[]
  debugPoints?: DebugPoint[]
  isochrones?: globalThis.Map<string, GeoJSON.Polygon>
  showDebugPoints?: boolean
  showAnchors?: boolean
  showGrid?: boolean
  onOptimalPointClick?: (point: OptimalPoint) => void
}

const MainLayout = ({
  children,
  locations = [],
  optimalPoints = [],
  debugPoints = [],
  isochrones = new globalThis.Map(),
  showDebugPoints = false,
  showAnchors = false,
  showGrid = false,
  onOptimalPointClick,
}: MainLayoutProps) => {
  // Convert isochrones Map to array for Map component
  const isochronePolygons = Array.from(isochrones.values())

  // Convert optimal points to format expected by Map component
  const mapOptimalPoints = optimalPoints.map((point) => ({
    id: point.id,
    coordinate: point.coordinate,
    type: 'GEOGRAPHIC_CENTROID' as const, // Use a valid type from the enum
    phase: 'FINAL_OUTPUT' as const,
    score: point.travelTimeMetrics.maxTravelTime, // Use max travel time as score for display
    travelTimeMetrics: point.travelTimeMetrics,
  }))

  // Convert debug points to format expected by Map component (filtered by debug toggles)
  const mapDebugPoints = showDebugPoints
    ? debugPoints
        .filter((point) => {
          // Only show points based on their type and the corresponding toggle
          if (point.type === 'ANCHOR' && !showAnchors) return false
          if (point.type === 'GRID' && !showGrid) return false
          return true
        })
        .map((point) => ({
          id: point.id,
          coordinate: point.coordinate,
          type:
            point.type === 'ANCHOR'
              ? ('GEOGRAPHIC_CENTROID' as const)
              : ('COARSE_GRID_CELL' as const),
          phase:
            point.type === 'ANCHOR'
              ? ('ANCHOR' as const)
              : ('COARSE_GRID' as const),
          score: null,
          travelTimeMetrics: null,
        }))
    : []

  // Combine optimal points and debug points for display
  const allPointsToShow = [...mapOptimalPoints, ...mapDebugPoints]

  // Create a wrapper function to handle the click event
  const handlePointClick = (point: {
    id: string
    coordinate: Coordinate
    travelTimeMetrics?: any
  }) => {
    if (onOptimalPointClick && point.travelTimeMetrics) {
      // This is an optimal point
      onOptimalPointClick({
        id: point.id,
        coordinate: point.coordinate,
        travelTimeMetrics: point.travelTimeMetrics,
        rank: mapOptimalPoints.findIndex((p) => p.id === point.id) + 1,
      })
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="sidebar bg-white shadow-lg border-r border-gray-200 overflow-y-auto">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            Optimal Meeting Points
          </h1>
          <ErrorBoundary
            onError={(error, errorInfo) => {
              console.error('Sidebar component error:', error, errorInfo)
            }}
          >
            {children}
          </ErrorBoundary>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative">
        <MapErrorBoundary>
          <Map
            locations={locations}
            hypothesisPoints={allPointsToShow}
            showHypothesisPoints={true} // Always show points when they exist
            onHypothesisPointClick={handlePointClick}
            isochrones={isochronePolygons}
          />
        </MapErrorBoundary>
      </div>
    </div>
  )
}

export default MainLayout
