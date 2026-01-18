import { useState } from 'react'
import { useMutation } from '@apollo/client'
import { MetaTags } from '@redwoodjs/web'

import MainLayout from 'src/layouts/MainLayout/MainLayout'
import LocationInput, { type Location } from 'src/components/LocationInput/LocationInput'
import IsochroneControls, { type TravelMode, type OptimizationConfig } from 'src/components/IsochroneControls/IsochroneControls'
import Map, { type Coordinate, type HypothesisPoint } from 'src/components/Map/Map'
import DebugControls from 'src/components/DebugControls/DebugControls'
import ToastContainer from 'src/components/Toast/ToastContainer'
import LoadingOverlay from 'src/components/LoadingSpinner/LoadingOverlay'
import { useToast } from 'src/hooks/useToast'
import { CALCULATE_MINIMAX_CENTER } from 'src/lib/graphql'

const HomePage = () => {
  const [locations, setLocations] = useState<Location[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Toast notifications
  const { toasts, removeToast, showSuccess, showError, showWarning } = useToast()

  // Isochrone calculation settings
  const [travelMode, setTravelMode] = useState<TravelMode>('DRIVING_CAR')
  const [slackTime, setSlackTime] = useState(10)
  const [optimizationConfig, setOptimizationConfig] = useState<OptimizationConfig>({
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
  })
  const [isCalculating, setIsCalculating] = useState(false)

  // Results state
  const [centerPoint, setCenterPoint] = useState<Coordinate | undefined>()
  const [fairMeetingArea, setFairMeetingArea] = useState<GeoJSON.Polygon | undefined>()
  const [hypothesisPoints, setHypothesisPoints] = useState<HypothesisPoint[]>([])
  const [calculationError, setCalculationError] = useState<string>('')

  // Debug visualization state
  const [showHypothesisPoints, setShowHypothesisPoints] = useState(false)

  // GraphQL mutation for calculating minimax center
  const [calculateMinimaxCenter] = useMutation(CALCULATE_MINIMAX_CENTER, {
    onCompleted: (data) => {
      if (data?.calculateMinimaxCenter) {
        const result = data.calculateMinimaxCenter
        setCenterPoint(result.centerPoint)
        setFairMeetingArea(result.fairMeetingArea)
        setCalculationError('')

        // TODO: Update backend to return hypothesis points in GraphQL response
        // For now, generate mock hypothesis points for demonstration
        const mockHypothesisPoints = generateMockHypothesisPoints(locations, result.centerPoint)
        setHypothesisPoints(mockHypothesisPoints)

        // Show success notification
        showSuccess(
          'Fair Meeting Point Found!',
          `Successfully calculated optimal meeting location for ${locations.length} locations.`
        )
      }
      setIsCalculating(false)
    },
    onError: (error) => {
      console.error('Calculation error:', error)
      const errorMessage = error.message || 'Failed to calculate meeting point'
      setCalculationError(errorMessage)
      setHypothesisPoints([]) // Clear hypothesis points on error
      setIsCalculating(false)

      // Show error notification
      showError(
        'Calculation Failed',
        errorMessage
      )
    }
  })

  const handleLocationAdd = (location: Location) => {
    if (locations.length < 12) {
      setLocations(prev => [...prev, location])

      // Show success notification for location addition
      showSuccess(
        'Location Added',
        `Added "${location.name}" to your locations.`,
        3000
      )

      // Clear previous results when locations change
      if (centerPoint || fairMeetingArea) {
        setCenterPoint(undefined)
        setFairMeetingArea(undefined)
        setHypothesisPoints([])
        setCalculationError('')
      }
    } else {
      showWarning(
        'Location Limit Reached',
        'Maximum of 12 locations supported. Remove a location to add more.'
      )
    }
  }

  const handleLocationRemove = (locationId: string) => {
    const locationToRemove = locations.find(loc => loc.id === locationId)
    setLocations(prev => prev.filter(loc => loc.id !== locationId))

    // Show notification for location removal
    if (locationToRemove) {
      // Note: showInfo is not available, using console.log for now
      console.log(`Removed "${locationToRemove.name}" from your locations.`)
    }

    // Clear results when locations change
    setCenterPoint(undefined)
    setFairMeetingArea(undefined)
    setHypothesisPoints([])
    setCalculationError('')
  }

  const handleCalculate = async () => {
    if (locations.length < 2) {
      showWarning(
        'Insufficient Locations',
        'Please add at least 2 locations to calculate a fair meeting point.'
      )
      return
    }

    setIsCalculating(true)
    setCalculationError('')

    // Show info notification about calculation starting
    console.log(`Finding optimal meeting point for ${locations.length} locations. This may take a moment.`)

    try {
      // Prepare location inputs for GraphQL mutation
      const locationInputs = locations.map(location => ({
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude
      }))

      // Prepare optimization configuration for GraphQL
      const optimizationConfigInput = {
        mode: optimizationConfig.mode,
        coarseGridConfig: optimizationConfig.coarseGridConfig ? {
          enabled: optimizationConfig.coarseGridConfig.enabled,
          paddingKm: optimizationConfig.coarseGridConfig.paddingKm,
          gridResolution: optimizationConfig.coarseGridConfig.gridResolution
        } : null,
        localRefinementConfig: optimizationConfig.localRefinementConfig ? {
          enabled: optimizationConfig.localRefinementConfig.enabled,
          topK: optimizationConfig.localRefinementConfig.topK,
          refinementRadiusKm: optimizationConfig.localRefinementConfig.refinementRadiusKm,
          fineGridResolution: optimizationConfig.localRefinementConfig.fineGridResolution
        } : null
      }

      await calculateMinimaxCenter({
        variables: {
          locations: locationInputs,
          travelMode: travelMode,
          bufferTimeMinutes: slackTime,
          optimizationConfig: optimizationConfigInput
        }
      })
    } catch (error) {
      console.error('Calculation failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to calculate meeting point. Please try again.'
      setCalculationError(errorMessage)
      setIsCalculating(false)

      showError(
        'Calculation Error',
        errorMessage
      )
    }
  }

  const canCalculate = locations.length >= 2

  return (
    <>
      <MetaTags title="Home" description="Isochrone Center Point Calculator" />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Loading Overlay */}
      <LoadingOverlay
        isVisible={isCalculating}
        message="Finding optimal meeting point..."
      />

      <MainLayout
        locations={locations}
        centerPoint={centerPoint}
        fairMeetingArea={fairMeetingArea}
        hypothesisPoints={hypothesisPoints}
        showHypothesisPoints={showHypothesisPoints}
      >
        <div className="space-y-6">
          {/* Location Input Section */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              Add Locations
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Enter addresses or coordinates to find the optimal meeting point.
            </p>
            <LocationInput
              onLocationAdd={handleLocationAdd}
              onLocationRemove={handleLocationRemove}
              locations={locations}
              isLoading={isLoading}
            />
          </div>

          {/* Controls Section */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              Algorithm Settings
            </h2>
            <IsochroneControls
              travelMode={travelMode}
              slackTime={slackTime}
              optimizationConfig={optimizationConfig}
              onTravelModeChange={setTravelMode}
              onSlackTimeChange={setSlackTime}
              onOptimizationConfigChange={setOptimizationConfig}
              onCalculate={handleCalculate}
              isCalculating={isCalculating}
              canCalculate={canCalculate}
            />
          </div>

          {/* Debug Controls Section */}
          {hypothesisPoints.length > 0 && (
            <DebugControls
              hypothesisPoints={hypothesisPoints}
              showHypothesisPoints={showHypothesisPoints}
              onToggleHypothesisPoints={setShowHypothesisPoints}
            />
          )}

          {/* Results Section */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              Results
            </h2>

            {calculationError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded mb-4 border border-red-200">
                <div className="flex items-start">
                  <svg className="w-4 h-4 text-red-500 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <h4 className="font-medium">Calculation Error</h4>
                    <p className="mt-1">{calculationError}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="text-center text-gray-500 py-8">
              {isCalculating ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <div>
                    <p className="font-medium">Calculating fair meeting point...</p>
                    <p className="text-xs mt-1">This may take a moment while we analyze travel times</p>
                  </div>
                </div>
              ) : centerPoint ? (
                <div className="text-left">
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <div className="flex items-start">
                      <svg className="w-5 h-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <div>
                        <h3 className="text-lg font-medium text-green-800 mb-2">
                          Fair Meeting Point Found!
                        </h3>
                        <div className="text-sm text-green-700 space-y-1">
                          <div>
                            <strong>Center Point:</strong> {centerPoint.latitude.toFixed(4)}, {centerPoint.longitude.toFixed(4)}
                          </div>
                          <div>
                            <strong>Travel Mode:</strong> {travelMode.replace('_', ' ').toLowerCase()}
                          </div>
                          <div>
                            <strong>Slack Time:</strong> {slackTime} minutes
                          </div>
                          <div className="mt-2 text-xs opacity-75">
                            The highlighted area on the map shows locations accessible within {slackTime} minutes from the optimal center point.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3" />
                  </svg>
                  <p className="font-medium">Ready to Calculate</p>
                  <p className="text-sm mt-1">Add at least 2 locations and click "Find Optimal Meeting Point" to get started.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </MainLayout>
    </>
  )
}

// TODO: Remove this mock function when backend returns actual hypothesis points
// Generate mock hypothesis points for demonstration purposes
const generateMockHypothesisPoints = (locations: Location[], centerPoint: Coordinate): HypothesisPoint[] => {
  const mockPoints: HypothesisPoint[] = []

  if (locations.length === 0) return mockPoints

  // Add geographic centroid
  const avgLat = locations.reduce((sum, loc) => sum + loc.latitude, 0) / locations.length
  const avgLng = locations.reduce((sum, loc) => sum + loc.longitude, 0) / locations.length
  mockPoints.push({
    id: 'geographic_centroid',
    coordinate: { latitude: avgLat, longitude: avgLng },
    type: 'GEOGRAPHIC_CENTROID',
    metadata: {}
  })

  // Add median coordinate
  const sortedLats = locations.map(loc => loc.latitude).sort((a, b) => a - b)
  const sortedLngs = locations.map(loc => loc.longitude).sort((a, b) => a - b)
  const medianLat = sortedLats[Math.floor(sortedLats.length / 2)]
  const medianLng = sortedLngs[Math.floor(sortedLngs.length / 2)]
  mockPoints.push({
    id: 'median_coordinate',
    coordinate: { latitude: medianLat, longitude: medianLng },
    type: 'MEDIAN_COORDINATE',
    metadata: {}
  })

  // Add participant locations
  locations.forEach((location, index) => {
    mockPoints.push({
      id: `participant_${index}`,
      coordinate: location,
      type: 'PARTICIPANT_LOCATION',
      metadata: {
        participantId: location.id
      }
    })
  })

  // Add some pairwise midpoints
  for (let i = 0; i < locations.length && i < 3; i++) {
    for (let j = i + 1; j < locations.length && j < 3; j++) {
      const midLat = (locations[i].latitude + locations[j].latitude) / 2
      const midLng = (locations[i].longitude + locations[j].longitude) / 2
      mockPoints.push({
        id: `pairwise_${i}_${j}`,
        coordinate: { latitude: midLat, longitude: midLng },
        type: 'PAIRWISE_MIDPOINT',
        metadata: {
          pairIds: [locations[i].id, locations[j].id]
        }
      })
    }
  }

  // Add some mock coarse grid points around the center
  const gridOffset = 0.01 // ~1km
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i !== 0 || j !== 0) { // Skip center point
        mockPoints.push({
          id: `coarse_grid_${i}_${j}`,
          coordinate: {
            latitude: centerPoint.latitude + i * gridOffset,
            longitude: centerPoint.longitude + j * gridOffset
          },
          type: 'COARSE_GRID',
          metadata: {}
        })
      }
    }
  }

  // Add optimal point (the actual center point)
  mockPoints.push({
    id: 'optimal',
    coordinate: centerPoint,
    type: 'GEOGRAPHIC_CENTROID', // This would be determined by the algorithm
    metadata: {}
  })

  return mockPoints
}

export default HomePage