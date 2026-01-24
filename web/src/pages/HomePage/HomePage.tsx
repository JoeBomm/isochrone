import { useState } from 'react'

import { useMutation } from '@apollo/client'

import { Metadata } from '@redwoodjs/web'

import ApiUsageWarning from 'src/components/ApiUsageWarning/ApiUsageWarning'
import DebugControls from 'src/components/DebugControls/DebugControls'
import LoadingOverlay from 'src/components/LoadingSpinner/LoadingOverlay'
import LocationInput, {
  type Location,
} from 'src/components/LocationInput/LocationInput'
import { type Coordinate } from 'src/components/Map/Map'
import OptimizationGoals, {
  OptimizationGoal,
} from 'src/components/OptimizationGoals/OptimizationGoals'
import ToastContainer from 'src/components/Toast/ToastContainer'
import { useApiUsage } from 'src/hooks/useApiUsage'
import { useToast } from 'src/hooks/useToast'
import MainLayout from 'src/layouts/MainLayout/MainLayout'
import {
  DEFAULT_DEDUPLICATION_THRESHOLD,
  DEFAULT_TOP_M,
  DEFAULT_GRID_SIZE,
  UI_CONSTANTS,
} from 'src/lib/constants'
import { FIND_OPTIMAL_LOCATIONS, GENERATE_ISOCHRONE } from 'src/lib/graphql'

export type TravelMode = 'DRIVING_CAR' | 'CYCLING_REGULAR' | 'FOOT_WALKING'

const HomePage = () => {
  const [locations, setLocations] = useState<Location[]>([])

  // Toast notifications
  const { toasts, removeToast, showSuccess, showError, showWarning } =
    useToast()

  // API usage tracking
  const { apiUsage, shouldShowWarning, trackApiCall, dismissWarning } =
    useApiUsage()

  // Optimal location calculation settings (simplified for cost-controlled approach)
  const [travelMode, setTravelMode] = useState<TravelMode>('DRIVING_CAR')
  const [slackTime, setSlackTime] = useState(10)
  const [optimizationGoal, setOptimizationGoal] = useState<OptimizationGoal>(
    OptimizationGoal.MINIMAX
  )
  const [topM] = useState(DEFAULT_TOP_M)
  const [gridSize] = useState(DEFAULT_GRID_SIZE)
  const [deduplicationThreshold] = useState(DEFAULT_DEDUPLICATION_THRESHOLD)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isRecalculating, setIsRecalculating] = useState(false)

  // Results state - Updated for cost-controlled optimal points (Requirements 4.1, 4.3)
  const [optimalPoints, setOptimalPoints] = useState<
    Array<{
      id: string
      coordinate: Coordinate
      travelTimeMetrics: {
        maxTravelTime: number
        averageTravelTime: number
        totalTravelTime: number
        variance: number
      }
      rank: number
    }>
  >([])
  const [debugPoints, setDebugPoints] = useState<
    Array<{
      id: string
      coordinate: Coordinate
      type: 'ANCHOR' | 'GRID'
    }>
  >([])
  const [isochrones, setIsochrones] = useState<
    globalThis.Map<string, GeoJSON.Polygon>
  >(new globalThis.Map())
  const [calculationError, setCalculationError] = useState<string>('')
  const [matrixApiCalls, setMatrixApiCalls] = useState<number>(0)
  const [totalHypothesisPoints, setTotalHypothesisPoints] = useState<number>(0)

  // Debug visualization state
  const [showAnchors, setShowAnchors] = useState(false)
  const [showGrid, setShowGrid] = useState(false)

  // GraphQL mutation for finding optimal locations (cost-controlled, Requirements 4.1, 4.3)
  const [findOptimalLocations] = useMutation(FIND_OPTIMAL_LOCATIONS, {
    onCompleted: (data) => {
      if (data?.findOptimalLocations) {
        const result = data.findOptimalLocations

        // Track API usage
        trackApiCall('matrix')

        // Display optimal points immediately without isochrones (Requirements 4.3)
        setOptimalPoints(result.optimalPoints || [])
        setDebugPoints(result.debugPoints || [])
        setMatrixApiCalls(result.matrixApiCalls || 0)
        setTotalHypothesisPoints(result.totalHypothesisPoints || 0)
        setCalculationError('')

        // Show success notification
        showSuccess(
          'Optimal Points Found!',
          `Found ${result.optimalPoints?.length || 0} optimal meeting points using ${result.matrixApiCalls || 0} Matrix API calls. Click any point to generate its isochrone.`
        )
      }
      setIsCalculating(false)
      setIsRecalculating(false)
    },
    onError: (error) => {
      console.error('Optimal location calculation error:', error)
      const errorMessage = error.message || 'Failed to find optimal locations'
      setCalculationError(errorMessage)
      setOptimalPoints([])
      setDebugPoints([])
      setIsCalculating(false)
      setIsRecalculating(false)

      // Show error notification
      showError('Calculation Failed', errorMessage)
    },
  })

  // GraphQL mutation for calculating on-demand isochrones (Requirements 4.2, 4.5)
  const [generateIsochrone] = useMutation(GENERATE_ISOCHRONE, {
    onCompleted: (data) => {
      if (data?.generateIsochrone) {
        // Track API usage for isochrone calls
        trackApiCall('isochrone')
        // The mutation returns the pointId in variables, so we need to get it from the cache
        // For now, we'll handle this in the onOptimalPointClick function
      }
    },
    onError: (error) => {
      console.error('Isochrone calculation error:', error)
      showError(
        'Isochrone Calculation Failed',
        error.message || 'Failed to calculate isochrone for the selected point'
      )
    },
  })

  const handleLocationAdd = (location: Location) => {
    if (locations.length < 12) {
      setLocations((prev) => [...prev, location])

      // Show success notification for location addition
      showSuccess(
        'Location Added',
        `Added "${location.name}" to your locations.`,
        3000
      )

      // Clear previous results when locations change
      if (optimalPoints.length > 0) {
        setOptimalPoints([])
        setDebugPoints([])
        setIsochrones(new globalThis.Map())
        setCalculationError('')
      }
    } else {
      showWarning(
        'Location Limit Reached',
        'Maximum of 12 locations supported. Remove a location to add more.'
      )
    }
  }

  const handleBulkImport = (newLocations: Location[]) => {
    const availableSlots = 12 - locations.length
    const locationsToAdd = newLocations.slice(0, availableSlots)
    const skippedCount = newLocations.length - locationsToAdd.length

    if (locationsToAdd.length > 0) {
      setLocations((prev) => [...prev, ...locationsToAdd])

      // Show success notification for bulk import
      showSuccess(
        'Locations Imported',
        `Successfully imported ${locationsToAdd.length} location${locationsToAdd.length === 1 ? '' : 's'}.${
          skippedCount > 0
            ? ` ${skippedCount} location${skippedCount === 1 ? '' : 's'} skipped due to 12-location limit.`
            : ''
        }`,
        5000
      )

      // Clear previous results when locations change
      if (optimalPoints.length > 0) {
        setOptimalPoints([])
        setDebugPoints([])
        setIsochrones(new globalThis.Map())
        setCalculationError('')
      }
    } else {
      showWarning(
        'Import Limit Reached',
        'Cannot import locations. Maximum of 12 locations supported.'
      )
    }
  }

  const handleLocationRemove = (locationId: string) => {
    const locationToRemove = locations.find((loc) => loc.id === locationId)
    setLocations((prev) => prev.filter((loc) => loc.id !== locationId))

    // Show notification for location removal
    if (locationToRemove) {
      // Note: showInfo is not available, using console.log for now
      console.log(`Removed "${locationToRemove.name}" from your locations.`)
    }

    // Clear results when locations change
    setOptimalPoints([])
    setDebugPoints([])
    setIsochrones(new globalThis.Map())
    setCalculationError('')
  }

  const handleCalculate = async () => {
    if (locations.length < 2) {
      showWarning(
        'Insufficient Locations',
        'Please add at least 2 locations to find optimal meeting points.'
      )
      return
    }

    setIsCalculating(true)
    setCalculationError('')

    // Show info notification about calculation starting
    console.log(
      `Finding optimal meeting points for ${locations.length} locations. This may take a moment.`
    )

    try {
      // Prepare location inputs for GraphQL mutation
      const locationInputs = locations.map((location) => ({
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
      }))

      await findOptimalLocations({
        variables: {
          locations: locationInputs,
          travelMode: travelMode,
          optimizationGoal: optimizationGoal,
          topM: topM,
          gridSize: gridSize,
          deduplicationThreshold: deduplicationThreshold,
        },
      })
    } catch (error) {
      console.error('Optimal location calculation failed:', error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to find optimal locations. Please try again.'
      setCalculationError(errorMessage)
      setIsCalculating(false)

      showError('Calculation Error', errorMessage)
    }
  }

  // Handle optimization goal change and recalculation (Requirements 7.4, 7.5)
  const handleOptimizationGoalChange = async (newGoal: OptimizationGoal) => {
    const previousGoal = optimizationGoal
    setOptimizationGoal(newGoal)

    // If we have existing results and locations, recalculate with new goal
    if (optimalPoints.length > 0 && locations.length >= 2) {
      setIsRecalculating(true)
      setCalculationError('')

      // Show feedback during recalculation
      showSuccess(
        'Recalculating...',
        `Switching from ${previousGoal} to ${newGoal} optimization. Recalculating optimal points...`
      )

      try {
        // Prepare location inputs for GraphQL mutation
        const locationInputs = locations.map((location) => ({
          name: location.name,
          latitude: location.latitude,
          longitude: location.longitude,
        }))

        await findOptimalLocations({
          variables: {
            locations: locationInputs,
            travelMode: travelMode,
            optimizationGoal: newGoal,
            topM: topM,
            gridSize: gridSize,
            deduplicationThreshold: deduplicationThreshold,
          },
        })

        // Clear existing isochrones since rankings may have changed
        setIsochrones(new globalThis.Map())
      } catch (error) {
        console.error('Optimization goal recalculation failed:', error)
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to recalculate with new optimization goal. Please try again.'
        setCalculationError(errorMessage)
        setIsRecalculating(false)

        showError('Recalculation Failed', errorMessage)

        // Revert to previous goal on error
        setOptimizationGoal(previousGoal)
      }
    }
  }

  // Handle on-demand isochrone calculation when user clicks an optimal point (Requirements 4.2)
  const handleOptimalPointClick = async (point: {
    id: string
    coordinate: Coordinate
  }) => {
    try {
      // Check if isochrone is already calculated and cached
      if (isochrones.has(point.id)) {
        showSuccess(
          'Isochrone Already Displayed',
          `Isochrone for ${point.id} is already shown on the map (cached).`
        )
        return
      }

      // Show loading notification
      console.log(`Calculating isochrone for ${point.id}...`)

      // Create pointId in the format expected by the resolver (lat,lng)
      const pointId = `${point.coordinate.latitude},${point.coordinate.longitude}`

      const result = await generateIsochrone({
        variables: {
          pointId: pointId,
          travelTimeMinutes: slackTime,
          travelMode: travelMode,
        },
      })

      if (result.data?.generateIsochrone) {
        // Cache the isochrone result (Requirements 4.5)
        const newIsochrones = new globalThis.Map(isochrones)
        newIsochrones.set(point.id, result.data.generateIsochrone)
        setIsochrones(newIsochrones)

        showSuccess(
          'Isochrone Calculated',
          `Generated ${slackTime}-minute isochrone for ${point.id}. The area is now displayed on the map.`
        )
      }
    } catch (error) {
      console.error('Isochrone calculation failed:', error)
      showError(
        'Isochrone Failed',
        error instanceof Error
          ? error.message
          : 'Failed to calculate isochrone for the selected point'
      )
    }
  }

  // Calculate if we can perform calculations
  const canCalculate =
    locations.length >= 2 && !isCalculating && !isRecalculating

  return (
    <>
      <Metadata title="Home" description="Optimal Meeting Point Calculator" />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Loading Overlay */}
      <LoadingOverlay
        isVisible={isCalculating || isRecalculating}
        message={
          isRecalculating
            ? 'Recalculating with new optimization goal...'
            : 'Finding optimal meeting point...'
        }
      />

      <MainLayout
        locations={locations}
        optimalPoints={optimalPoints}
        debugPoints={debugPoints}
        isochrones={isochrones}
        showDebugPoints={showAnchors || showGrid}
        showAnchors={showAnchors}
        showGrid={showGrid}
        onOptimalPointClick={handleOptimalPointClick}
      >
        <div className="space-y-6">
          {/* API Usage Warning */}
          {shouldShowWarning && (
            <ApiUsageWarning
              callCount={apiUsage.callCount}
              timeWindow={apiUsage.timeWindow}
              isHighUsage={apiUsage.isHighUsage}
              onDismiss={dismissWarning}
            />
          )}

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
              onBulkImport={handleBulkImport}
              locations={locations}
            />
          </div>

          {/* Optimal Location Settings */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              Optimal Location Settings
            </h2>

            {/* Travel Mode Selection */}
            <div className="mb-4">
              <label
                htmlFor="travel-mode"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Travel Mode
              </label>
              <div id="travel-mode" className="grid grid-cols-3 gap-2">
                {[
                  { value: 'DRIVING_CAR', label: 'Driving', icon: '🚗' },
                  { value: 'CYCLING_REGULAR', label: 'Cycling', icon: '🚴' },
                  { value: 'FOOT_WALKING', label: 'Walking', icon: '🚶' },
                ].map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => setTravelMode(mode.value as TravelMode)}
                    className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                      travelMode === mode.value
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-lg mb-1">{mode.icon}</div>
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optimization Goal Selection */}
            <OptimizationGoals
              selectedGoal={optimizationGoal}
              onGoalChange={handleOptimizationGoalChange}
              disabled={isCalculating || isRecalculating}
            />

            {/* Isochrone Time Setting */}
            <div className="mb-4">
              <label
                htmlFor="isochrone-time"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Isochrone Time (minutes)
              </label>
              <input
                id="isochrone-time"
                type="number"
                min="5"
                max="60"
                value={slackTime}
                onChange={(e) => setSlackTime(parseInt(e.target.value) || 10)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-600 mt-1">
                Time range for on-demand isochrone visualization
              </p>
            </div>

            {/* Calculate Button */}
            <button
              onClick={handleCalculate}
              disabled={!canCalculate || isRecalculating}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                canCalculate && !isRecalculating
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isCalculating
                ? 'Finding Optimal Points...'
                : isRecalculating
                  ? 'Recalculating...'
                  : 'Find Optimal Meeting Points'}
            </button>
          </div>

          {/* Debug Controls Section */}
          {(optimalPoints.length > 0 || debugPoints.length > 0) && (
            <DebugControls
              debugPoints={debugPoints}
              showAnchors={showAnchors}
              showGrid={showGrid}
              onToggleAnchors={setShowAnchors}
              onToggleGrid={setShowGrid}
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
                  <svg
                    className="w-4 h-4 text-red-500 mt-0.5 mr-2 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  <div>
                    <h4 className="font-medium">Calculation Error</h4>
                    <p className="mt-1">{calculationError}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="text-center text-gray-500 py-8">
              {isCalculating || isRecalculating ? (
                <div className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <div>
                    <p className="font-medium">
                      {isRecalculating
                        ? 'Recalculating with new optimization goal...'
                        : 'Finding optimal meeting points...'}
                    </p>
                    <p className="text-xs mt-1">
                      {isRecalculating
                        ? 'Rankings may change with different optimization criteria'
                        : 'This may take a moment while we analyze travel times'}
                    </p>
                  </div>
                </div>
              ) : optimalPoints.length > 0 ? (
                <div className="text-left">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-start">
                      <svg
                        className="w-5 h-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <div>
                        <h3 className="text-lg font-medium text-blue-800 mb-2">
                          Optimal Meeting Points Found!
                        </h3>
                        <div className="text-sm text-blue-700 space-y-1">
                          <div>
                            <strong>Optimal Points:</strong>{' '}
                            {optimalPoints.length} points
                          </div>
                          <div>
                            <strong>Matrix API Calls:</strong> {matrixApiCalls}{' '}
                            calls
                          </div>
                          <div>
                            <strong>Total Hypothesis Points:</strong>{' '}
                            {totalHypothesisPoints} points
                          </div>
                          <div>
                            <strong>Travel Mode:</strong>{' '}
                            {travelMode.replace('_', ' ').toLowerCase()}
                          </div>
                          <div>
                            <strong>Optimization Goal:</strong>{' '}
                            {optimizationGoal}
                          </div>
                          <div>
                            <strong>Isochrone Time:</strong> {slackTime} minutes
                          </div>
                          <div className="mt-2 text-xs opacity-75">
                            <strong>Cost-Controlled:</strong> Click any point on
                            the map to generate its isochrone on-demand.
                            Isochrones are cached to avoid repeated API calls.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Optimal Points List */}
                  <div className="mt-4 bg-white p-4 rounded-lg border border-gray-200">
                    <h4 className="font-medium text-gray-800 mb-3">
                      Optimal Meeting Points
                    </h4>
                    <div className="space-y-2">
                      {optimalPoints.map((point) => (
                        <div
                          key={point.id}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded"
                        >
                          <div className="flex items-center">
                            <span className="w-6 h-6 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-3">
                              {point.rank}
                            </span>
                            <div>
                              <div className="font-medium text-sm">
                                {point.id}
                              </div>
                              <div className="text-xs text-gray-500">
                                {point.coordinate.latitude.toFixed(4)},{' '}
                                {point.coordinate.longitude.toFixed(4)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-600">
                              <div>
                                Max:{' '}
                                {point.travelTimeMetrics.maxTravelTime.toFixed(
                                  1
                                )}
                                min
                              </div>
                              <div>
                                Avg:{' '}
                                {point.travelTimeMetrics.averageTravelTime.toFixed(
                                  1
                                )}
                                min
                              </div>
                            </div>
                            {isochrones.has(point.id) && (
                              <div className="text-xs text-green-600 mt-1">
                                ✓ Isochrone shown
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <svg
                    className="w-12 h-12 text-gray-300 mx-auto mb-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3"
                    />
                  </svg>
                  <p className="font-medium">Ready to Find Optimal Points</p>
                  <p className="text-sm mt-1">
                    Add at least 2 locations and click &ldquo;Find Optimal
                    Meeting Points&rdquo; to get started.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </MainLayout>
    </>
  )
}

export default HomePage
