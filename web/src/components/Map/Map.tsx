import { useEffect, useRef } from 'react'

import L from 'leaflet'

import type { Location } from 'src/components/LocationInput/LocationInput'

import './Map.css'

// Fix for default markers in Leaflet with Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

export interface Coordinate {
  latitude: number
  longitude: number
}

export interface HypothesisPoint {
  id: string
  coordinate: Coordinate
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

export interface OptimalPoint {
  id: string
  coordinate: Coordinate
  travelTimeMetrics: {
    maxTravelTime: number
    averageTravelTime: number
    variance: number
    totalTravelTime: number
  }
  rank: number
}

export interface DebugPoint {
  id: string
  coordinate: Coordinate
  type: 'ANCHOR' | 'GRID'
}

export interface MapProps {
  locations: Location[]
  centerPoint?: Coordinate
  fairMeetingArea?: GeoJSON.Polygon
  hypothesisPoints?: HypothesisPoint[]
  showHypothesisPoints?: boolean
  isochrones?: GeoJSON.Polygon[]
  onMapClick?: (coordinate: Coordinate) => void
  onLocationClick?: (location: Location) => void
  onCenterPointClick?: (centerPoint: Coordinate) => void
  onFairMeetingAreaClick?: () => void
  onHypothesisPointClick?: (point: HypothesisPoint) => void
  // New optimal points support
  optimalPoints?: OptimalPoint[]
  debugPoints?: DebugPoint[]
  onOptimalPointClick?: (point: OptimalPoint) => void
  selectedOptimalPointId?: string
  // Developer visualization options (Requirements 4.1, 4.3, 4.4)
  developerMode?: boolean
  showAnchors?: boolean
  showCoarseGrid?: boolean
  allHypothesisPoints?: {
    anchorPoints: HypothesisPoint[]
    coarseGridPoints: HypothesisPoint[]
    localRefinementPoints: HypothesisPoint[]
    finalPoints: HypothesisPoint[]
  }
}

const Map = ({
  locations,
  centerPoint,
  fairMeetingArea,
  hypothesisPoints = [],
  showHypothesisPoints = false,
  isochrones = [],
  onMapClick,
  onLocationClick,
  onCenterPointClick,
  onFairMeetingAreaClick,
  onHypothesisPointClick,
  // New optimal points support
  optimalPoints = [],
  debugPoints = [],
  onOptimalPointClick,
  selectedOptimalPointId,
  // Developer visualization options
  developerMode = false,
  showAnchors = true,
  showCoarseGrid = false,
  allHypothesisPoints = {
    anchorPoints: [],
    coarseGridPoints: [],
    localRefinementPoints: [],
    finalPoints: [],
  },
}: MapProps) => {
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const centerMarkerRef = useRef<L.Marker | null>(null)
  const polygonRef = useRef<L.Polygon | null>(null)
  const hypothesisMarkersRef = useRef<L.Marker[]>([])
  const optimalMarkersRef = useRef<L.Marker[]>([])
  const debugMarkersRef = useRef<L.Marker[]>([])
  const isochronePolygonsRef = useRef<L.Polygon[]>([])
  const maxPointsToShow = 300

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) {
      const map = L.map('map', {
        center: [40.7128, -74.006], // Default to NYC
        zoom: 10,
        zoomControl: true,
        attributionControl: true,
      })

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)

      // Handle map clicks
      if (onMapClick) {
        map.on('click', (e: L.LeafletMouseEvent) => {
          onMapClick({
            latitude: e.latlng.lat,
            longitude: e.latlng.lng,
          })
        })
      }

      mapRef.current = map
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [onMapClick])

  // Update location markers
  useEffect(() => {
    if (!mapRef.current) return

    // Clear existing markers
    markersRef.current.forEach((marker) => {
      mapRef.current?.removeLayer(marker)
    })
    markersRef.current = []

    // Add new markers for each location
    locations.forEach((location, index) => {
      const marker = L.marker([location.latitude, location.longitude], {
        icon: createColoredIcon(location.color, index + 1),
      })

      // Enhanced popup with more detailed information
      marker.bindPopup(
        `
        <div class="p-3 min-w-[200px]">
          <h3 class="font-semibold text-gray-900 mb-2">${location.name}</h3>
          <div class="space-y-1 text-sm text-gray-600">
            <p><strong>Coordinates:</strong> ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}</p>
            <p><strong>Location #:</strong> ${index + 1}</p>
            <div class="flex items-center mt-2">
              <div class="w-3 h-3 rounded-full mr-2" style="background-color: ${location.color}"></div>
              <span class="text-xs text-gray-500">Marker Color</span>
            </div>
          </div>
        </div>
      `,
        {
          maxWidth: 250,
          className: 'location-popup',
        }
      )

      // Add click event handler for location markers
      if (onLocationClick) {
        marker.on('click', () => {
          onLocationClick(location)
        })
      }

      marker.addTo(mapRef.current!)
      markersRef.current.push(marker)
    })

    // Adjust map bounds to show all locations with better padding
    if (locations.length > 0) {
      try {
        const bounds = L.latLngBounds(
          locations.map((loc) => [loc.latitude, loc.longitude])
        )

        // Include center point in bounds if it exists
        if (centerPoint) {
          bounds.extend([centerPoint.latitude, centerPoint.longitude])
        }

        // Use better padding and max zoom for bounds fitting
        const paddingOptions = {
          padding: [30, 30] as [number, number],
          maxZoom: locations.length === 1 ? 12 : undefined,
        }

        mapRef.current.fitBounds(bounds, paddingOptions)
      } catch (error) {
        console.error('Error fitting map bounds for locations:', error)
        // Fallback to a default view if bounds calculation fails
        mapRef.current.setView([40.7128, -74.006], 10)
      }
    }
  }, [locations, centerPoint, onLocationClick])

  // Update center point marker
  useEffect(() => {
    if (!mapRef.current) return

    // Remove existing center marker
    if (centerMarkerRef.current) {
      mapRef.current.removeLayer(centerMarkerRef.current)
      centerMarkerRef.current = null
    }

    // Add center point marker if it exists
    if (centerPoint) {
      const centerMarker = L.marker(
        [centerPoint.latitude, centerPoint.longitude],
        {
          icon: createCenterIcon(),
        }
      )

      // Enhanced popup for center point
      centerMarker.bindPopup(
        `
        <div class="p-3 min-w-[220px]">
          <h3 class="font-semibold text-gray-900 mb-2">Optimal Meeting Point</h3>
          <div class="space-y-1 text-sm text-gray-600">
            <p><strong>Coordinates:</strong> ${centerPoint.latitude.toFixed(4)}, ${centerPoint.longitude.toFixed(4)}</p>
            <p class="text-xs text-gray-500 mt-2">
              This point minimizes the maximum travel time for all participants using a minimax optimization algorithm that evaluates multiple hypothesis points.
            </p>
          </div>
        </div>
      `,
        {
          maxWidth: 280,
          className: 'center-popup',
        }
      )

      // Add click event handler for center point
      if (onCenterPointClick) {
        centerMarker.on('click', () => {
          onCenterPointClick(centerPoint)
        })
      }

      centerMarker.addTo(mapRef.current)
      centerMarkerRef.current = centerMarker
    }
  }, [centerPoint, onCenterPointClick])

  // Update fair meeting area polygon
  useEffect(() => {
    if (!mapRef.current) return

    // Remove existing polygon
    if (polygonRef.current) {
      mapRef.current.removeLayer(polygonRef.current)
      polygonRef.current = null
    }

    // Add fair meeting area polygon if it exists
    if (fairMeetingArea) {
      const coordinates = fairMeetingArea.coordinates[0].map(
        (coord) => [coord[1], coord[0]] as [number, number]
      )

      const polygon = L.polygon(coordinates, {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        weight: 2,
      })

      polygon.bindPopup(
        `
        <div class="p-3 min-w-[240px]">
          <h3 class="font-semibold text-gray-900 mb-2">Visualization Area</h3>
          <div class="space-y-1 text-sm text-gray-600">
            <p>This area shows locations accessible within the configured slack time from the optimal meeting point.</p>
            <p class="text-xs text-gray-500 mt-2">
              <strong>How it works:</strong> The minimax algorithm finds the point that minimizes maximum travel time, then generates this visualization area using the slack time radius.
            </p>
          </div>
        </div>
      `,
        {
          maxWidth: 300,
          className: 'area-popup',
        }
      )

      // Add click event handler for fair meeting area
      if (onFairMeetingAreaClick) {
        polygon.on('click', () => {
          onFairMeetingAreaClick()
        })
      }

      polygon.addTo(mapRef.current)
      polygonRef.current = polygon
    }
  }, [fairMeetingArea, onFairMeetingAreaClick])

  // Update hypothesis point markers with developer mode support
  useEffect(() => {
    if (!mapRef.current) return

    // Clear existing hypothesis markers
    hypothesisMarkersRef.current.forEach((marker) => {
      mapRef.current?.removeLayer(marker)
    })
    hypothesisMarkersRef.current = []

    try {
      // Determine which points to show based on mode and toggles
      let pointsToShow: HypothesisPoint[] = []

      if (developerMode) {
        // Developer mode: show all hypothesis points with color coding (Requirements 4.1, 4.3, 4.4)
        // Filter out points with null scores to prevent rendering errors for unreachable locations
        if (showAnchors) {
          const validAnchorPoints = allHypothesisPoints.anchorPoints.filter(
            (point) => point.score !== null && point.score !== undefined
          )
          pointsToShow = pointsToShow.concat(validAnchorPoints)
        }
        if (showCoarseGrid) {
          const validCoarseGridPoints =
            allHypothesisPoints.coarseGridPoints.filter(
              (point) => point.score !== null && point.score !== undefined
            )
          pointsToShow = pointsToShow.concat(validCoarseGridPoints)
        }
        // Always show local refinement and final points in developer mode (these should already be scored)
        const validLocalRefinementPoints =
          allHypothesisPoints.localRefinementPoints.filter(
            (point) => point.score !== null && point.score !== undefined
          )
        const validFinalPoints = allHypothesisPoints.finalPoints.filter(
          (point) => point.score !== null && point.score !== undefined
        )
        pointsToShow = pointsToShow.concat(validLocalRefinementPoints)
        pointsToShow = pointsToShow.concat(validFinalPoints)
      } else {
        // Regular mode: use the filtered hypothesis points passed from MainLayout
        // MainLayout already handles the algorithm toggle filtering
        pointsToShow = hypothesisPoints
      }

      console.log('Rendering hypothesis points:', {
        total: pointsToShow.length,
        developerMode,
        showAnchors,
        showCoarseGrid,
        samplePoint: pointsToShow[0],
      })

      // Add hypothesis point markers if points exist
      if (pointsToShow.length > 0) {
        // Limit visible points for performance (max maxPointsToShow points)
        const visiblePoints = pointsToShow.slice(0, maxPointsToShow)

        visiblePoints.forEach((point, index) => {
          try {
            // Validate point data structure
            if (
              !point ||
              !point.coordinate ||
              typeof point.coordinate.latitude !== 'number' ||
              typeof point.coordinate.longitude !== 'number'
            ) {
              console.warn(`Invalid hypothesis point at index ${index}:`, point)
              return
            }

            // Check for valid coordinates
            if (
              isNaN(point.coordinate.latitude) ||
              isNaN(point.coordinate.longitude) ||
              Math.abs(point.coordinate.latitude) > 90 ||
              Math.abs(point.coordinate.longitude) > 180
            ) {
              console.warn(
                `Invalid coordinates for hypothesis point ${point.id}:`,
                point.coordinate
              )
              return
            }

            const marker = L.marker(
              [point.coordinate.latitude, point.coordinate.longitude],
              {
                icon: createHypothesisIcon(
                  point,
                  point.id === 'optimal',
                  developerMode
                ) as L.Icon,
              }
            )

            // Enhanced popup with hypothesis point metadata and developer info
            const isOptimal = point.id === 'optimal'
            const typeLabel = getHypothesisTypeLabel(point)
            const phaseLabel = point.phase
              ? ` (${point.phase.replace('_', ' ')})`
              : ''

            // Developer mode provides more detailed information (Requirements 4.3, 4.4)
            const developerInfo = developerMode
              ? `
              <div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                <p class="text-xs font-medium text-yellow-800 mb-1">🔧 Developer Info</p>
                <div class="text-xs text-yellow-700 space-y-1">
                  <p><strong>Algorithm Phase:</strong> ${point.phase || 'Unknown'}</p>
                  <p><strong>Point Type:</strong> ${point.type}</p>
                  ${point.metadata?.participantId ? `<p><strong>Participant ID:</strong> ${point.metadata.participantId}</p>` : ''}
                  ${point.metadata?.pairIds ? `<p><strong>Pair IDs:</strong> ${point.metadata.pairIds.join(' ↔ ')}</p>` : ''}
                  <p><strong>Color Coding:</strong> ${getPhaseColorDescription(point)}</p>
                </div>
              </div>
            `
              : ''

            marker.bindPopup(
              `
              <div class="p-3 min-w-[220px]">
                <h3 class="font-semibold text-gray-900 mb-2">
                  ${isOptimal ? '⭐ Optimal Point' : `${typeLabel}${phaseLabel}`}
                </h3>
                <div class="space-y-1 text-sm text-gray-600">
                  <p><strong>Type:</strong> ${typeLabel}</p>
                  ${point.phase ? `<p><strong>Phase:</strong> ${point.phase.replace('_', ' ')}</p>` : ''}
                  <p><strong>Coordinates:</strong> ${point.coordinate.latitude.toFixed(4)}, ${point.coordinate.longitude.toFixed(4)}</p>
                  <p><strong>ID:</strong> ${point.id}</p>
                  ${point.score !== undefined && point.score !== null && Number.isFinite(point.score) ? `<p><strong>Score:</strong> ${point.score.toFixed(3)}</p>` : ''}
                  ${
                    point.travelTimeMetrics
                      ? `
                    <div class="mt-2">
                      <p><strong>Travel Times:</strong></p>
                      <div class="text-xs ml-2">
                        <p>Max: ${point.travelTimeMetrics.maxTravelTime.toFixed(1)}min</p>
                        <p>Avg: ${point.travelTimeMetrics.averageTravelTime.toFixed(1)}min</p>
                        <p>Total: ${point.travelTimeMetrics.totalTravelTime.toFixed(1)}min</p>
                        ${point.travelTimeMetrics.variance !== undefined ? `<p>Variance: ${point.travelTimeMetrics.variance.toFixed(1)}</p>` : ''}
                      </div>
                    </div>
                  `
                      : ''
                  }
                  <div class="mt-2 text-xs text-gray-500">
                    ${getHypothesisTypeDescription(point)}
                  </div>
                  ${developerInfo}
                </div>
              </div>
            `,
              {
                maxWidth: 350,
                className: `hypothesis-popup ${developerMode ? 'developer-mode' : ''}`,
              }
            )

            // Add click event handler for hypothesis points
            if (onHypothesisPointClick) {
              marker.on('click', () => {
                onHypothesisPointClick(point)
              })
            }

            marker.addTo(mapRef.current!)
            hypothesisMarkersRef.current.push(marker)
          } catch (error) {
            console.error(
              `Error creating marker for hypothesis point ${point?.id || index}:`,
              error,
              point
            )
          }
        })

        // Show performance warning if too many points
        if (pointsToShow.length > maxPointsToShow) {
          console.warn(
            `Performance: Showing only ${maxPointsToShow} of ${pointsToShow.length} hypothesis points`
          )
        }

        // Update map bounds to include hypothesis points
        try {
          if (locations.length > 0) {
            const allPoints = [
              ...locations.map(
                (loc) => [loc.latitude, loc.longitude] as [number, number]
              ),
              ...pointsToShow.map(
                (point) =>
                  [point.coordinate.latitude, point.coordinate.longitude] as [
                    number,
                    number,
                  ]
              ),
            ]

            const bounds = L.latLngBounds(allPoints)

            // Use better padding for bounds fitting
            const paddingOptions = {
              padding: [50, 50] as [number, number],
              maxZoom: 15,
            }

            mapRef.current.fitBounds(bounds, paddingOptions)
          }
        } catch (error) {
          console.error(
            'Error fitting map bounds with hypothesis points:',
            error
          )
        }
      }
    } catch (error) {
      console.error('Error in hypothesis points rendering:', error)
      // Clear any partially created markers on error
      hypothesisMarkersRef.current.forEach((marker) => {
        mapRef.current?.removeLayer(marker)
      })
      hypothesisMarkersRef.current = []
    }
  }, [
    hypothesisPoints,
    showHypothesisPoints,
    onHypothesisPointClick,
    developerMode,
    showAnchors,
    showCoarseGrid,
    allHypothesisPoints,
    locations, // Add locations to dependencies for bounds calculation
  ])

  // Update isochrone polygons
  useEffect(() => {
    if (!mapRef.current) return

    // Clear existing isochrone polygons
    isochronePolygonsRef.current.forEach((polygon) => {
      mapRef.current?.removeLayer(polygon)
    })
    isochronePolygonsRef.current = []

    // Add isochrone polygons if they exist
    if (isochrones.length > 0) {
      isochrones.forEach((isochrone, index) => {
        if (isochrone && isochrone.coordinates && isochrone.coordinates[0]) {
          const coordinates = isochrone.coordinates[0].map(
            (coord) => [coord[1], coord[0]] as [number, number]
          )

          const polygon = L.polygon(coordinates, {
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.15,
            weight: 2,
          })

          polygon.bindPopup(
            `
            <div class="p-3 min-w-[220px]">
              <h3 class="font-semibold text-gray-900 mb-2">Isochrone Area</h3>
              <div class="space-y-1 text-sm text-gray-600">
                <p>This area shows locations accessible within the configured travel time from the selected hypothesis point.</p>
                <p class="text-xs text-gray-500 mt-2">
                  <strong>Generated on-demand:</strong> This isochrone was calculated when you clicked the hypothesis point, demonstrating cost-controlled API usage.
                </p>
              </div>
            </div>
          `,
            {
              maxWidth: 280,
              className: 'isochrone-popup',
            }
          )

          polygon.addTo(mapRef.current!)
          isochronePolygonsRef.current.push(polygon)
        }
      })
    }
  }, [isochrones])

  // Update optimal points markers (always visible with highest z-index)
  useEffect(() => {
    if (!mapRef.current) return

    // Clear existing optimal markers
    optimalMarkersRef.current.forEach((marker) => {
      mapRef.current?.removeLayer(marker)
    })
    optimalMarkersRef.current = []

    // Add optimal point markers
    if (optimalPoints.length > 0) {
      optimalPoints.forEach((point, index) => {
        try {
          // Validate point data structure
          if (
            !point ||
            !point.coordinate ||
            typeof point.coordinate.latitude !== 'number' ||
            typeof point.coordinate.longitude !== 'number'
          ) {
            console.warn(`Invalid optimal point at index ${index}:`, point)
            return
          }

          const isSelected = selectedOptimalPointId === point.id
          const marker = L.marker(
            [point.coordinate.latitude, point.coordinate.longitude],
            {
              icon: createOptimalPointIcon(point, isSelected),
              zIndexOffset: 1000, // Ensure optimal points are always on top
            }
          )

          // Enhanced popup with travel time metrics and ranking
          marker.bindPopup(
            `
            <div class="p-4 min-w-[280px]">
              <h3 class="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <span class="text-lg">⭐</span>
                Optimal Meeting Point #${point.rank}
                ${isSelected ? '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded ml-2">Selected</span>' : ''}
              </h3>
              <div class="space-y-2 text-sm text-gray-600">
                <p><strong>Coordinates:</strong> ${point.coordinate.latitude.toFixed(4)}, ${point.coordinate.longitude.toFixed(4)}</p>
                <div class="bg-gray-50 p-3 rounded border">
                  <p class="font-medium text-gray-800 mb-2">Travel Time Metrics:</p>
                  <div class="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span class="font-medium">Max Time:</span><br>
                      <span class="text-lg font-bold text-red-600">${point.travelTimeMetrics.maxTravelTime.toFixed(1)}min</span>
                    </div>
                    <div>
                      <span class="font-medium">Average:</span><br>
                      <span class="text-lg font-bold text-blue-600">${point.travelTimeMetrics.averageTravelTime.toFixed(1)}min</span>
                    </div>
                    <div>
                      <span class="font-medium">Total:</span><br>
                      <span class="text-lg font-bold text-green-600">${point.travelTimeMetrics.totalTravelTime.toFixed(1)}min</span>
                    </div>
                    <div>
                      <span class="font-medium">Variance:</span><br>
                      <span class="text-lg font-bold text-purple-600">${point.travelTimeMetrics.variance.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
                <div class="text-xs text-gray-500 bg-blue-50 p-2 rounded border border-blue-200">
                  <p><strong>💡 Tip:</strong> Click this point to generate an isochrone showing the travel time area around this location.</p>
                </div>
              </div>
            </div>
          `,
            {
              maxWidth: 350,
              className: `optimal-point-popup ${isSelected ? 'selected' : ''}`,
            }
          )

          // Add click event handler for optimal points
          if (onOptimalPointClick) {
            marker.on('click', () => {
              onOptimalPointClick(point)
            })
          }

          marker.addTo(mapRef.current!)
          optimalMarkersRef.current.push(marker)
        } catch (error) {
          console.error(
            `Error creating marker for optimal point ${point?.id || index}:`,
            error,
            point
          )
        }
      })
    }
  }, [optimalPoints, selectedOptimalPointId, onOptimalPointClick])

  // Update debug points markers (lower z-index than optimal points)
  useEffect(() => {
    if (!mapRef.current) return

    // Clear existing debug markers
    debugMarkersRef.current.forEach((marker) => {
      mapRef.current?.removeLayer(marker)
    })
    debugMarkersRef.current = []

    // Add debug point markers only in debug mode
    if (developerMode && debugPoints.length > 0) {
      // Filter debug points based on show toggles
      const visibleDebugPoints = debugPoints.filter((point) => {
        if (point.type === 'ANCHOR' && !showAnchors) return false
        if (point.type === 'GRID' && !showCoarseGrid) return false
        return true
      })

      visibleDebugPoints.forEach((point, index) => {
        try {
          // Validate point data structure
          if (
            !point ||
            !point.coordinate ||
            typeof point.coordinate.latitude !== 'number' ||
            typeof point.coordinate.longitude !== 'number'
          ) {
            console.warn(`Invalid debug point at index ${index}:`, point)
            return
          }

          const marker = L.marker(
            [point.coordinate.latitude, point.coordinate.longitude],
            {
              icon: createDebugPointIcon(point),
              zIndexOffset: 100, // Lower than optimal points but higher than regular markers
            }
          )

          // Enhanced popup for debug points
          marker.bindPopup(
            `
            <div class="p-3 min-w-[220px]">
              <h3 class="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <span class="text-lg">${point.type === 'ANCHOR' ? '🎯' : '⚏'}</span>
                ${point.type === 'ANCHOR' ? 'Anchor Point' : 'Grid Point'}
              </h3>
              <div class="space-y-1 text-sm text-gray-600">
                <p><strong>Type:</strong> ${point.type}</p>
                <p><strong>Coordinates:</strong> ${point.coordinate.latitude.toFixed(4)}, ${point.coordinate.longitude.toFixed(4)}</p>
                <p><strong>ID:</strong> ${point.id}</p>
                <div class="mt-2 text-xs text-gray-500 bg-yellow-50 p-2 rounded border border-yellow-200">
                  <p><strong>🔧 Debug Mode:</strong> This point is part of the algorithm's hypothesis generation process but only visible in debug mode.</p>
                </div>
              </div>
            </div>
          `,
            {
              maxWidth: 280,
              className: 'debug-point-popup',
            }
          )

          marker.addTo(mapRef.current!)
          debugMarkersRef.current.push(marker)
        } catch (error) {
          console.error(
            `Error creating marker for debug point ${point?.id || index}:`,
            error,
            point
          )
        }
      })
    }
  }, [debugPoints, developerMode, showAnchors, showCoarseGrid])

  return <div id="map" className="map-container" />
}

// Create colored icon for location markers
const createColoredIcon = (color: string, number: number) => {
  const svgIcon = `
    <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 12.5 12.5 28.5 12.5 28.5s12.5-16 12.5-28.5C25 5.6 19.4 0 12.5 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="12.5" cy="12.5" r="6" fill="#fff"/>
      <text x="12.5" y="17" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="${color}">${number}</text>
    </svg>
  `

  return L.divIcon({
    html: svgIcon,
    className: 'custom-marker',
    iconSize: [25, 41],
    iconAnchor: [12.5, 41],
    popupAnchor: [0, -41],
  })
}

// Create center point icon
const createCenterIcon = () => {
  const svgIcon = `
    <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
      <circle cx="15" cy="15" r="12" fill="#10b981" stroke="#fff" stroke-width="3"/>
      <circle cx="15" cy="15" r="6" fill="#fff"/>
      <circle cx="15" cy="15" r="3" fill="#10b981"/>
    </svg>
  `

  return L.divIcon({
    html: svgIcon,
    className: 'center-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  })
}

// Create hypothesis point icon based on type and phase with developer mode support
const createHypothesisIcon = (
  point: HypothesisPoint,
  isOptimal: boolean = false,
  developerMode: boolean = false
) => {
  try {
    if (isOptimal) {
      // Green star for optimal point
      const svgIcon = `
        <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                fill="#10b981" stroke="#fff" stroke-width="2"/>
        </svg>
      `
      return L.divIcon({
        html: svgIcon,
        className: 'hypothesis-marker optimal-marker optimal-point',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12],
      })
    }

    let color: string
    let shape: string
    let size: number

    // In developer mode, use strict phase-based color coding (Requirements 4.1, 4.3)
    if (developerMode) {
      if (
        point.phase === 'ANCHOR' ||
        point.type === 'GEOGRAPHIC_CENTROID' ||
        point.type === 'MEDIAN_COORDINATE' ||
        point.type === 'PARTICIPANT_LOCATION' ||
        point.type === 'PAIRWISE_MIDPOINT'
      ) {
        // Blue circles for anchor points (Phase 0)
        color = '#3b82f6'
        shape = 'circle'
        size = 12
      } else if (
        point.phase === 'COARSE_GRID' ||
        point.type === 'COARSE_GRID_CELL'
      ) {
        // Gray squares for coarse grid points (Phase 1)
        color = '#6b7280'
        shape = 'square'
        size = 10
      } else if (
        point.phase === 'LOCAL_REFINEMENT' ||
        point.type === 'LOCAL_REFINEMENT_CELL'
      ) {
        // Red diamonds for local refinement points (Phase 2)
        color = '#ef4444'
        shape = 'diamond'
        size = 10
      } else if (point.phase === 'FINAL_OUTPUT') {
        // Green circles for final points of interest
        color = '#10b981'
        shape = 'circle'
        size = 14
      } else {
        // Default for unknown types
        color = '#9ca3af'
        shape = 'circle'
        size = 8
      }
    } else {
      // Regular mode: use existing logic
      if (point.phase === 'FINAL_OUTPUT') {
        // Green circles for final points of interest
        color = '#10b981'
        shape = 'circle'
        size = 14
      } else if (
        point.phase === 'ANCHOR' ||
        point.type === 'GEOGRAPHIC_CENTROID' ||
        point.type === 'MEDIAN_COORDINATE' ||
        point.type === 'PARTICIPANT_LOCATION' ||
        point.type === 'PAIRWISE_MIDPOINT'
      ) {
        // Blue circles for anchor points (Phase 0)
        color = '#3b82f6'
        shape = 'circle'
        size = 12
      } else if (
        point.phase === 'COARSE_GRID' ||
        point.type === 'COARSE_GRID_CELL'
      ) {
        // Gray squares for coarse grid points (Phase 1)
        color = '#6b7280'
        shape = 'square'
        size = 10
      } else if (
        point.phase === 'LOCAL_REFINEMENT' ||
        point.type === 'LOCAL_REFINEMENT_CELL'
      ) {
        // Red diamonds for local refinement points (Phase 2)
        color = '#ef4444'
        shape = 'diamond'
        size = 10
      } else {
        color = '#9ca3af'
        shape = 'circle'
        size = 8
      }
    }

    let svgIcon: string

    if (shape === 'circle') {
      svgIcon = `
        <svg width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${size}" cy="${size}" r="${size - 2}" fill="${color}" stroke="#fff" stroke-width="2"/>
        </svg>
      `
    } else if (shape === 'square') {
      svgIcon = `
        <svg width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="${size * 2 - 4}" height="${size * 2 - 4}" fill="${color}" stroke="#fff" stroke-width="2"/>
        </svg>
      `
    } else {
      // diamond
      svgIcon = `
        <svg width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}" xmlns="http://www.w3.org/2000/svg">
          <path d="M${size} 2 L${size * 2 - 2} ${size} L${size} ${size * 2 - 2} L2 ${size} Z"
                fill="${color}" stroke="#fff" stroke-width="2"/>
        </svg>
      `
    }

    const phaseClass = point.phase
      ? point.phase.toLowerCase().replace('_', '-')
      : 'unknown'
    const typeClass = point.type.toLowerCase().replace('_', '-')
    const modeClass = developerMode ? 'developer-mode' : 'regular-mode'
    const zIndexClass = isOptimal ? 'optimal-point' : 'debug-point'

    return L.divIcon({
      html: svgIcon,
      className: `hypothesis-marker ${phaseClass}-marker ${typeClass}-marker ${modeClass} ${zIndexClass}`,
      iconSize: [size * 2, size * 2],
      iconAnchor: [size, size],
      popupAnchor: [0, -size],
    })
  } catch (error) {
    console.error('Error creating hypothesis icon:', error, point)
    // Return a simple fallback icon
    return L.divIcon({
      html: '<div style="width: 12px; height: 12px; background: #9ca3af; border-radius: 50%; border: 2px solid white;"></div>',
      className: 'hypothesis-marker fallback-marker debug-point',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -8],
    })
  }
}

// Get human-readable label for hypothesis point type
const getHypothesisTypeLabel = (point: HypothesisPoint): string => {
  // Use phase if available for better labeling
  if (point.phase) {
    switch (point.phase) {
      case 'ANCHOR':
        return 'Anchor Point'
      case 'COARSE_GRID':
        return 'Coarse Grid Point'
      case 'LOCAL_REFINEMENT':
        return 'Local Refinement Point'
      case 'FINAL_OUTPUT':
        return 'Point of Interest'
    }
  }

  // Fall back to type-based labeling
  switch (point.type) {
    case 'GEOGRAPHIC_CENTROID':
      return 'Geographic Centroid'
    case 'MEDIAN_COORDINATE':
      return 'Median Coordinate'
    case 'PARTICIPANT_LOCATION':
      return 'Participant Location'
    case 'PAIRWISE_MIDPOINT':
      return 'Pairwise Midpoint'
    case 'COARSE_GRID_CELL':
      return 'Coarse Grid Cell'
    case 'LOCAL_REFINEMENT_CELL':
      return 'Local Refinement Cell'
    default:
      return 'Hypothesis Point'
  }
}

// Get description for hypothesis point type
const getHypothesisTypeDescription = (point: HypothesisPoint): string => {
  // Use phase if available for better descriptions
  if (point.phase) {
    switch (point.phase) {
      case 'ANCHOR':
        return 'Baseline anchor point used as starting hypothesis'
      case 'COARSE_GRID':
        return 'Point from systematic grid sampling (Phase 1)'
      case 'LOCAL_REFINEMENT':
        return 'Point from fine-grained local search (Phase 2)'
      case 'FINAL_OUTPUT':
        return 'Top-ranked point of interest for meeting location'
    }
  }

  // Fall back to type-based descriptions
  switch (point.type) {
    case 'GEOGRAPHIC_CENTROID':
      return 'Geographic center of all participant locations'
    case 'MEDIAN_COORDINATE':
      return 'Median latitude and longitude coordinates'
    case 'PARTICIPANT_LOCATION':
      return 'One of the original participant locations'
    case 'PAIRWISE_MIDPOINT':
      return 'Midpoint between two participant locations'
    case 'COARSE_GRID_CELL':
      return 'Point from coarse grid search (Phase 1)'
    case 'LOCAL_REFINEMENT_CELL':
      return 'Point from local refinement search (Phase 2)'
    default:
      return 'Hypothesis point for optimization'
  }
}

// Get phase color description for developer mode tooltips (Requirements 4.3, 4.4)
const getPhaseColorDescription = (point: HypothesisPoint): string => {
  if (
    point.phase === 'ANCHOR' ||
    point.type === 'GEOGRAPHIC_CENTROID' ||
    point.type === 'MEDIAN_COORDINATE' ||
    point.type === 'PARTICIPANT_LOCATION' ||
    point.type === 'PAIRWISE_MIDPOINT'
  ) {
    return 'Blue circle (Anchor/Phase 0)'
  } else if (
    point.phase === 'COARSE_GRID' ||
    point.type === 'COARSE_GRID_CELL'
  ) {
    return 'Gray square (Coarse Grid/Phase 1)'
  } else if (
    point.phase === 'LOCAL_REFINEMENT' ||
    point.type === 'LOCAL_REFINEMENT_CELL'
  ) {
    return 'Red diamond (Local Refinement/Phase 2)'
  } else if (point.phase === 'FINAL_OUTPUT') {
    return 'Green circle (Final Output)'
  } else {
    return 'Gray circle (Unknown phase)'
  }
}

// Create optimal point icon with ranking and selection state
const createOptimalPointIcon = (
  point: OptimalPoint,
  isSelected: boolean = false
) => {
  const size = isSelected ? 32 : 28
  const color = isSelected ? '#10b981' : '#059669'
  const strokeColor = isSelected ? '#ffffff' : '#ffffff'
  const strokeWidth = isSelected ? 3 : 2

  const svgIcon = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <g filter="${isSelected ? 'url(#glow)' : ''}">
        <path d="M${size / 2} 3l${size / 8} ${size / 4}L${size - 3} ${size / 3}l-${size / 4} ${size / 4} L${(size / 3) * 2} ${size - 3}l-${size / 6} -${size / 8}L${size / 2} ${size - 3}l-${size / 6} ${size / 8} L3 ${size - 3}l${size / 8} -${size / 4} L3 ${size / 3}l${size / 4} -${size / 8} L${size / 2} 3z"
              fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
        <text x="${size / 2}" y="${size / 2 + 2}" text-anchor="middle" font-family="Arial, sans-serif"
              font-size="${size / 4}" font-weight="bold" fill="white">${point.rank}</text>
      </g>
      ${
        isSelected
          ? `
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      `
          : ''
      }
    </svg>
  `

  return L.divIcon({
    html: svgIcon,
    className: `optimal-point-marker ${isSelected ? 'selected' : ''} rank-${point.rank}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

// Create debug point icon based on type
const createDebugPointIcon = (point: DebugPoint) => {
  const size = 12
  let color: string
  let shape: string

  if (point.type === 'ANCHOR') {
    color = '#3b82f6' // Blue for anchor points
    shape = 'circle'
  } else {
    color = '#6b7280' // Gray for grid points
    shape = 'square'
  }

  let svgIcon: string

  if (shape === 'circle') {
    svgIcon = `
      <svg width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size}" cy="${size}" r="${size - 2}" fill="${color}" stroke="#fff" stroke-width="2"/>
      </svg>
    `
  } else {
    svgIcon = `
      <svg width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="${size * 2 - 4}" height="${size * 2 - 4}" fill="${color}" stroke="#fff" stroke-width="2"/>
      </svg>
    `
  }

  return L.divIcon({
    html: svgIcon,
    className: `debug-point-marker ${point.type.toLowerCase()}-marker`,
    iconSize: [size * 2, size * 2],
    iconAnchor: [size, size],
    popupAnchor: [0, -size],
  })
}

export default Map
