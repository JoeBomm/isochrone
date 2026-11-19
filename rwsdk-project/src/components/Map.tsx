'use client'

import React, { useEffect, useRef } from 'react'

// Types for map functionality
export interface Coordinate {
  latitude: number
  longitude: number
}

export interface Location {
  id: string
  name: string
  latitude: number
  longitude: number
  color: string
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
  locations?: Location[]
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
  // Optimal points support
  optimalPoints?: OptimalPoint[]
  debugPoints?: DebugPoint[]
  onOptimalPointClick?: (point: OptimalPoint) => void
  selectedOptimalPointId?: string
  // Developer visualization options
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

// Map component using Leaflet (client-side only)
export function Map({
  locations = [],
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
  optimalPoints = [],
  debugPoints = [],
  onOptimalPointClick,
  selectedOptimalPointId,
  developerMode = false,
  showAnchors = true,
  showCoarseGrid = false,
  allHypothesisPoints = {
    anchorPoints: [],
    coarseGridPoints: [],
    localRefinementPoints: [],
    finalPoints: [],
  },
}: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const centerMarkerRef = useRef<any>(null)
  const polygonRef = useRef<any>(null)
  const hypothesisMarkersRef = useRef<any[]>([])
  const optimalMarkersRef = useRef<any[]>([])
  const debugMarkersRef = useRef<any[]>([])
  const isochronePolygonsRef = useRef<any[]>([])
  const maxPointsToShow = 300

  // Initialize map
  useEffect(() => {
    const initializeMap = async () => {
      if (typeof window === 'undefined' || mapInstanceRef.current) return

      try {
        const L = await import('leaflet')

        // Import Leaflet CSS
        await import('leaflet/dist/leaflet.css')

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

        if (mapRef.current) {
          // Initialize map
          const map = L.map(mapRef.current, {
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
            map.on('click', (e: any) => {
              onMapClick({
                latitude: e.latlng.lat,
                longitude: e.latlng.lng,
              })
            })
          }

          mapInstanceRef.current = map
        }
      } catch (error) {
        console.error('Failed to initialize map:', error)
      }
    }

    initializeMap()

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [onMapClick])

  // Helper function to create colored icon for location markers
  const createColoredIcon = (color: string, number: number) => {
    const svgIcon = `
      <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 12.5 12.5 28.5 12.5 28.5s12.5-16 12.5-28.5C25 5.6 19.4 0 12.5 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
        <circle cx="12.5" cy="12.5" r="6" fill="#fff"/>
        <text x="12.5" y="17" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="${color}">${number}</text>
      </svg>
    `

    return {
      html: svgIcon,
      className: 'custom-marker',
      iconSize: [25, 41],
      iconAnchor: [12.5, 41],
      popupAnchor: [0, -41],
    }
  }

  // Helper function to create center point icon
  const createCenterIcon = () => {
    const svgIcon = `
      <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
        <circle cx="15" cy="15" r="12" fill="#10b981" stroke="#fff" stroke-width="3"/>
        <circle cx="15" cy="15" r="6" fill="#fff"/>
        <circle cx="15" cy="15" r="3" fill="#10b981"/>
      </svg>
    `

    return {
      html: svgIcon,
      className: 'center-marker',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -15],
    }
  }

  // Helper function to create hypothesis point icon
  const createHypothesisIcon = (
    point: HypothesisPoint,
    isOptimal: boolean = false,
    developerMode: boolean = false
  ) => {
    if (isOptimal) {
      const svgIcon = `
        <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                fill="#10b981" stroke="#fff" stroke-width="2"/>
        </svg>
      `
      return {
        html: svgIcon,
        className: 'hypothesis-marker optimal-marker optimal-point',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12],
      }
    }

    let color: string
    let shape: string
    let size: number

    // Color coding based on phase and type
    if (developerMode) {
      if (
        point.phase === 'ANCHOR' ||
        point.type === 'GEOGRAPHIC_CENTROID' ||
        point.type === 'MEDIAN_COORDINATE' ||
        point.type === 'PARTICIPANT_LOCATION' ||
        point.type === 'PAIRWISE_MIDPOINT'
      ) {
        color = '#3b82f6'
        shape = 'circle'
        size = 12
      } else if (
        point.phase === 'COARSE_GRID' ||
        point.type === 'COARSE_GRID_CELL'
      ) {
        color = '#6b7280'
        shape = 'square'
        size = 10
      } else if (
        point.phase === 'LOCAL_REFINEMENT' ||
        point.type === 'LOCAL_REFINEMENT_CELL'
      ) {
        color = '#ef4444'
        shape = 'diamond'
        size = 10
      } else if (point.phase === 'FINAL_OUTPUT') {
        color = '#10b981'
        shape = 'circle'
        size = 14
      } else {
        color = '#9ca3af'
        shape = 'circle'
        size = 8
      }
    } else {
      // Regular mode coloring
      if (point.phase === 'FINAL_OUTPUT') {
        color = '#10b981'
        shape = 'circle'
        size = 14
      } else {
        color = '#3b82f6'
        shape = 'circle'
        size = 10
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

    return {
      html: svgIcon,
      className: `hypothesis-marker ${phaseClass}-marker ${typeClass}-marker ${modeClass} ${zIndexClass}`,
      iconSize: [size * 2, size * 2],
      iconAnchor: [size, size],
      popupAnchor: [0, -size],
    }
  }

  // Helper function to create optimal point icon
  const createOptimalPointIcon = (
    point: OptimalPoint,
    isSelected: boolean = false
  ) => {
    const size = isSelected ? 32 : 28
    const color = isSelected ? '#10b981' : '#059669'
    const strokeColor = '#ffffff'
    const strokeWidth = isSelected ? 3 : 2

    const svgIcon = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <path d="M${size / 2} 3l${size / 8} ${size / 4}L${size - 3} ${size / 3}l-${size / 4} ${size / 4} L${(size / 3) * 2} ${size - 3}l-${size / 6} -${size / 8}L${size / 2} ${size - 3}l-${size / 6} ${size / 8} L3 ${size - 3}l${size / 8} -${size / 4} L3 ${size / 3}l${size / 4} -${size / 8} L${size / 2} 3z"
              fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
        <text x="${size / 2}" y="${size / 2 + 2}" text-anchor="middle" font-family="Arial, sans-serif"
              font-size="${size / 4}" font-weight="bold" fill="white">${point.rank}</text>
      </svg>
    `

    return {
      html: svgIcon,
      className: `optimal-point-marker ${isSelected ? 'selected' : ''} rank-${point.rank}`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    }
  }

  // Update location markers
  useEffect(() => {
    if (!mapInstanceRef.current) return

    const L = require('leaflet')

    // Clear existing markers
    markersRef.current.forEach((marker) => {
      mapInstanceRef.current?.removeLayer(marker)
    })
    markersRef.current = []

    // Add new markers for each location
    locations.forEach((location, index) => {
      const iconConfig = createColoredIcon(location.color, index + 1)
      const marker = L.marker([location.latitude, location.longitude], {
        icon: L.divIcon(iconConfig),
      })

      // Enhanced popup
      marker.bindPopup(`
        <div style="padding: 12px; min-width: 200px;">
          <h3 style="font-weight: 600; color: #111827; margin-bottom: 8px;">${location.name}</h3>
          <div style="font-size: 14px; color: #6b7280; line-height: 1.4;">
            <p><strong>Coordinates:</strong> ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}</p>
            <p><strong>Location #:</strong> ${index + 1}</p>
            <div style="display: flex; align-items: center; margin-top: 8px;">
              <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${location.color}; margin-right: 8px;"></div>
              <span style="font-size: 12px; color: #9ca3af;">Marker Color</span>
            </div>
          </div>
        </div>
      `)

      // Add click event handler
      if (onLocationClick) {
        marker.on('click', () => {
          onLocationClick(location)
        })
      }

      marker.addTo(mapInstanceRef.current!)
      markersRef.current.push(marker)
    })

    // Adjust map bounds to show all locations
    if (locations.length > 0) {
      try {
        const bounds = L.latLngBounds(
          locations.map((loc) => [loc.latitude, loc.longitude])
        )

        if (centerPoint) {
          bounds.extend([centerPoint.latitude, centerPoint.longitude])
        }

        const paddingOptions = {
          padding: [30, 30],
          maxZoom: locations.length === 1 ? 12 : undefined,
        }

        mapInstanceRef.current.fitBounds(bounds, paddingOptions)
      } catch (error) {
        console.error('Error fitting map bounds for locations:', error)
        mapInstanceRef.current.setView([40.7128, -74.006], 10)
      }
    }
  }, [locations, centerPoint, onLocationClick])

  // Update center point marker
  useEffect(() => {
    if (!mapInstanceRef.current) return

    const L = require('leaflet')

    // Remove existing center marker
    if (centerMarkerRef.current) {
      mapInstanceRef.current.removeLayer(centerMarkerRef.current)
      centerMarkerRef.current = null
    }

    // Add center point marker if it exists
    if (centerPoint) {
      const iconConfig = createCenterIcon()
      const centerMarker = L.marker(
        [centerPoint.latitude, centerPoint.longitude],
        {
          icon: L.divIcon(iconConfig),
        }
      )

      centerMarker.bindPopup(`
        <div style="padding: 12px; min-width: 220px;">
          <h3 style="font-weight: 600; color: #111827; margin-bottom: 8px;">Optimal Meeting Point</h3>
          <div style="font-size: 14px; color: #6b7280; line-height: 1.4;">
            <p><strong>Coordinates:</strong> ${centerPoint.latitude.toFixed(4)}, ${centerPoint.longitude.toFixed(4)}</p>
            <p style="font-size: 12px; color: #9ca3af; margin-top: 8px;">
              This point minimizes the maximum travel time for all participants using a minimax optimization algorithm.
            </p>
          </div>
        </div>
      `)

      if (onCenterPointClick) {
        centerMarker.on('click', () => {
          onCenterPointClick(centerPoint)
        })
      }

      centerMarker.addTo(mapInstanceRef.current)
      centerMarkerRef.current = centerMarker
    }
  }, [centerPoint, onCenterPointClick])

  // Update fair meeting area polygon
  useEffect(() => {
    if (!mapInstanceRef.current) return

    const L = require('leaflet')

    // Remove existing polygon
    if (polygonRef.current) {
      mapInstanceRef.current.removeLayer(polygonRef.current)
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

      polygon.bindPopup(`
        <div style="padding: 12px; min-width: 240px;">
          <h3 style="font-weight: 600; color: #111827; margin-bottom: 8px;">Visualization Area</h3>
          <div style="font-size: 14px; color: #6b7280; line-height: 1.4;">
            <p>This area shows locations accessible within the configured travel time range from the optimal meeting point.</p>
          </div>
        </div>
      `)

      if (onFairMeetingAreaClick) {
        polygon.on('click', () => {
          onFairMeetingAreaClick()
        })
      }

      polygon.addTo(mapInstanceRef.current)
      polygonRef.current = polygon
    }
  }, [fairMeetingArea, onFairMeetingAreaClick])

  // Update hypothesis point markers
  useEffect(() => {
    if (!mapInstanceRef.current) return

    const L = require('leaflet')

    // Clear existing hypothesis markers
    hypothesisMarkersRef.current.forEach((marker) => {
      mapInstanceRef.current?.removeLayer(marker)
    })
    hypothesisMarkersRef.current = []

    try {
      let pointsToShow: HypothesisPoint[] = []

      if (developerMode) {
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
        pointsToShow = hypothesisPoints
      }

      if (pointsToShow.length > 0) {
        const visiblePoints = pointsToShow.slice(0, maxPointsToShow)

        visiblePoints.forEach((point, index) => {
          try {
            if (
              !point ||
              !point.coordinate ||
              typeof point.coordinate.latitude !== 'number' ||
              typeof point.coordinate.longitude !== 'number'
            ) {
              console.warn(`Invalid hypothesis point at index ${index}:`, point)
              return
            }

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

            const iconConfig = createHypothesisIcon(
              point,
              point.id === 'optimal',
              developerMode
            )
            const marker = L.marker(
              [point.coordinate.latitude, point.coordinate.longitude],
              {
                icon: L.divIcon(iconConfig),
              }
            )

            const isOptimal = point.id === 'optimal'
            const typeLabel = point.type.replace(/_/g, ' ')

            marker.bindPopup(`
              <div style="padding: 12px; min-width: 220px;">
                <h3 style="font-weight: 600; color: #111827; margin-bottom: 8px;">
                  ${isOptimal ? '⭐ Optimal Point' : typeLabel}
                </h3>
                <div style="font-size: 14px; color: #6b7280; line-height: 1.4;">
                  <p><strong>Type:</strong> ${typeLabel}</p>
                  ${point.phase ? `<p><strong>Phase:</strong> ${point.phase.replace('_', ' ')}</p>` : ''}
                  <p><strong>Coordinates:</strong> ${point.coordinate.latitude.toFixed(4)}, ${point.coordinate.longitude.toFixed(4)}</p>
                  <p><strong>ID:</strong> ${point.id}</p>
                  ${point.score !== undefined && point.score !== null && Number.isFinite(point.score) ? `<p><strong>Score:</strong> ${point.score.toFixed(3)}</p>` : ''}
                </div>
              </div>
            `)

            if (onHypothesisPointClick) {
              marker.on('click', () => {
                onHypothesisPointClick(point)
              })
            }

            marker.addTo(mapInstanceRef.current!)
            hypothesisMarkersRef.current.push(marker)
          } catch (error) {
            console.error(
              `Error creating marker for hypothesis point ${point?.id || index}:`,
              error,
              point
            )
          }
        })
      }
    } catch (error) {
      console.error('Error in hypothesis points rendering:', error)
      hypothesisMarkersRef.current.forEach((marker) => {
        mapInstanceRef.current?.removeLayer(marker)
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
    locations,
  ])

  // Update optimal points markers
  useEffect(() => {
    if (!mapInstanceRef.current) return

    const L = require('leaflet')

    // Clear existing optimal markers
    optimalMarkersRef.current.forEach((marker) => {
      mapInstanceRef.current?.removeLayer(marker)
    })
    optimalMarkersRef.current = []

    if (optimalPoints.length > 0) {
      optimalPoints.forEach((point, index) => {
        try {
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
          const iconConfig = createOptimalPointIcon(point, isSelected)
          const marker = L.marker(
            [point.coordinate.latitude, point.coordinate.longitude],
            {
              icon: L.divIcon(iconConfig),
              zIndexOffset: 1000,
            }
          )

          marker.bindPopup(`
            <div style="padding: 16px; min-width: 280px;">
              <h3 style="font-weight: 600; color: #111827; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">⭐</span>
                Optimal Meeting Point #${point.rank}
                ${isSelected ? '<span style="font-size: 12px; background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; margin-left: 8px;">Selected</span>' : ''}
              </h3>
              <div style="font-size: 14px; color: #6b7280; line-height: 1.4;">
                <p><strong>Coordinates:</strong> ${point.coordinate.latitude.toFixed(4)}, ${point.coordinate.longitude.toFixed(4)}</p>
                <div style="background: #f9fafb; padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb; margin: 8px 0;">
                  <p style="font-weight: 500; color: #374151; margin-bottom: 8px;">Travel Time Metrics:</p>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
                    <div>
                      <span style="font-weight: 500;">Max Time:</span><br>
                      <span style="font-size: 16px; font-weight: bold; color: #dc2626;">${point.travelTimeMetrics.maxTravelTime.toFixed(1)}min</span>
                    </div>
                    <div>
                      <span style="font-weight: 500;">Average:</span><br>
                      <span style="font-size: 16px; font-weight: bold; color: #2563eb;">${point.travelTimeMetrics.averageTravelTime.toFixed(1)}min</span>
                    </div>
                    <div>
                      <span style="font-weight: 500;">Total:</span><br>
                      <span style="font-size: 16px; font-weight: bold; color: #059669;">${point.travelTimeMetrics.totalTravelTime.toFixed(1)}min</span>
                    </div>
                    <div>
                      <span style="font-weight: 500;">Variance:</span><br>
                      <span style="font-size: 16px; font-weight: bold; color: #7c3aed;">${point.travelTimeMetrics.variance.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `)

          if (onOptimalPointClick) {
            marker.on('click', () => {
              onOptimalPointClick(point)
            })
          }

          marker.addTo(mapInstanceRef.current!)
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

  // Update isochrone polygons
  useEffect(() => {
    if (!mapInstanceRef.current) return

    const L = require('leaflet')

    // Clear existing isochrone polygons
    isochronePolygonsRef.current.forEach((polygon) => {
      mapInstanceRef.current?.removeLayer(polygon)
    })
    isochronePolygonsRef.current = []

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

          polygon.bindPopup(`
            <div style="padding: 12px; min-width: 220px;">
              <h3 style="font-weight: 600; color: #111827; margin-bottom: 8px;">Isochrone Area</h3>
              <div style="font-size: 14px; color: #6b7280; line-height: 1.4;">
                <p>This area shows locations accessible within the configured travel time from the selected point.</p>
              </div>
            </div>
          `)

          polygon.addTo(mapInstanceRef.current!)
          isochronePolygonsRef.current.push(polygon)
        }
      })
    }
  }, [isochrones])

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Map</h2>
      </div>
      <div
        ref={mapRef}
        className="w-full h-96"
        style={{ minHeight: '400px' }}
      />
    </div>
  )
}
