import type { ReactNode } from 'react'

import Map, { type Coordinate, type HypothesisPoint } from 'src/components/Map/Map'
import MapErrorBoundary from 'src/components/ErrorBoundary/MapErrorBoundary'
import ErrorBoundary from 'src/components/ErrorBoundary/ErrorBoundary'
import type { Location } from 'src/components/LocationInput/LocationInput'

interface MainLayoutProps {
  children?: ReactNode
  locations?: Location[]
  centerPoint?: Coordinate
  fairMeetingArea?: GeoJSON.Polygon
  hypothesisPoints?: HypothesisPoint[]
  showHypothesisPoints?: boolean
}

const MainLayout = ({
  children,
  locations = [],
  centerPoint,
  fairMeetingArea,
  hypothesisPoints = [],
  showHypothesisPoints = false
}: MainLayoutProps) => {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="sidebar bg-white shadow-lg border-r border-gray-200 overflow-y-auto">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            Isochrone Center Point
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
            centerPoint={centerPoint}
            fairMeetingArea={fairMeetingArea}
            hypothesisPoints={hypothesisPoints}
            showHypothesisPoints={showHypothesisPoints}
          />
        </MapErrorBoundary>
      </div>
    </div>
  )
}

export default MainLayout