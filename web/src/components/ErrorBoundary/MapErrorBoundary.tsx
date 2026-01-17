import React from 'react'
import ErrorBoundary from './ErrorBoundary'

interface MapErrorBoundaryProps {
  children: React.ReactNode
}

const MapErrorFallback = () => (
  <div className="h-full flex items-center justify-center bg-gray-100 rounded-lg">
    <div className="text-center p-6">
      <div className="mb-4">
        <svg className="h-12 w-12 text-gray-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        Map Loading Error
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        Unable to load the interactive map. This might be due to a network issue or browser compatibility.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm font-medium"
      >
        Reload Map
      </button>
    </div>
  </div>
)

const MapErrorBoundary: React.FC<MapErrorBoundaryProps> = ({ children }) => {
  return (
    <ErrorBoundary
      fallback={<MapErrorFallback />}
      onError={(error, errorInfo) => {
        console.error('Map component error:', error, errorInfo)
        // Could send to error reporting service here
      }}
    >
      {children}
    </ErrorBoundary>
  )
}

export default MapErrorBoundary