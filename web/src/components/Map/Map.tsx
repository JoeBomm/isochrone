import { useEffect, useRef } from 'react'
import L from 'leaflet'

import type { Location } from 'src/components/LocationInput/LocationInput'

// Fix for default markers in Leaflet with Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

export interface Coordinate {
  latitude: number
  longitude: number
}

export interface HypothesisPoint {
  id: string
  coordinate: Coordinate
  type: 'GEOGRAPHIC_CENTROID' | 'MEDIAN_COORDINATE' | 'PARTICIPANT_LOCATION' | 'PAIRWISE_MIDPOINT' | 'COARSE_GRID' | 'LOCAL_REFINEMENT'
  metadata?: {
    participantId?: string
    pairIds?: string[]
  }
}

export interface MapProps {
  locations: Location[]
  centerPoint?: Coordinate
  fairMeetingArea?: GeoJSON.Polygon
  hypothesisPoints?: HypothesisPoint[]
  showHypothesisPoints?: boolean
  onMapClick?: (coordinate: Coordinate) => void
  onLocationClick?: (location: Location) => void
  onCenterPointClick?: (centerPoint: Coordinate) => void
  onFairMeetingAreaClick?: () => void
  onHypothesisPointClick?: (point: HypothesisPoint) => void
}

const Map = ({
  locations,
  centerPoint,
  fairMeetingArea,
  hypothesisPoints = [],
  showHypothesisPoints = false,
  onMapClick,
  onLocationClick,
  onCenterPointClick,
  onFairMeetingAreaClick,
  onHypothesisPointClick
}: MapProps) => {
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const centerMarkerRef = useRef<L.Marker | null>(null)
  const polygonRef = useRef<L.Polygon | null>(null)
  const hypothesisMarkersRef = useRef<L.Marker[]>([])

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) {
      const map = L.map('map', {
        center: [40.7128, -74.0060], // Default to NYC
        zoom: 10,
        zoomControl: true,
        attributionControl: true,
      })

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
    markersRef.current.forEach(marker => {
      mapRef.current?.removeLayer(marker)
    })
    markersRef.current = []

    // Add new markers for each location
    locations.forEach((location, index) => {
      const marker = L.marker([location.latitude, location.longitude], {
        icon: createColoredIcon(location.color, index + 1),
      })

      // Enhanced popup with more detailed information
      marker.bindPopup(`
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
      `, {
        maxWidth: 250,
        className: 'location-popup'
      })

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
      const bounds = L.latLngBounds(
        locations.map(loc => [loc.latitude, loc.longitude])
      )

      // Include center point in bounds if it exists
      if (centerPoint) {
        bounds.extend([centerPoint.latitude, centerPoint.longitude])
      }

      // Use better padding and max zoom for bounds fitting
      const paddingOptions = {
        padding: [30, 30] as [number, number],
        maxZoom: locations.length === 1 ? 12 : undefined
      }

      mapRef.current.fitBounds(bounds, paddingOptions)
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
      const centerMarker = L.marker([centerPoint.latitude, centerPoint.longitude], {
        icon: createCenterIcon(),
      })

      // Enhanced popup for center point
      centerMarker.bindPopup(`
        <div class="p-3 min-w-[220px]">
          <h3 class="font-semibold text-gray-900 mb-2">Optimal Meeting Point</h3>
          <div class="space-y-1 text-sm text-gray-600">
            <p><strong>Coordinates:</strong> ${centerPoint.latitude.toFixed(4)}, ${centerPoint.longitude.toFixed(4)}</p>
            <p class="text-xs text-gray-500 mt-2">
              This point minimizes the maximum travel time for all participants using a minimax optimization algorithm that evaluates multiple hypothesis points.
            </p>
          </div>
        </div>
      `, {
        maxWidth: 280,
        className: 'center-popup'
      })

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
      const coordinates = fairMeetingArea.coordinates[0].map(coord => [coord[1], coord[0]] as [number, number])

      const polygon = L.polygon(coordinates, {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        weight: 2,
      })

      polygon.bindPopup(`
        <div class="p-3 min-w-[240px]">
          <h3 class="font-semibold text-gray-900 mb-2">Visualization Area</h3>
          <div class="space-y-1 text-sm text-gray-600">
            <p>This area shows locations accessible within the configured slack time from the optimal meeting point.</p>
            <p class="text-xs text-gray-500 mt-2">
              <strong>How it works:</strong> The minimax algorithm finds the point that minimizes maximum travel time, then generates this visualization area using the slack time radius.
            </p>
          </div>
        </div>
      `, {
        maxWidth: 300,
        className: 'area-popup'
      })

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

  // Update hypothesis point markers
  useEffect(() => {
    if (!mapRef.current) return

    // Clear existing hypothesis markers
    hypothesisMarkersRef.current.forEach(marker => {
      mapRef.current?.removeLayer(marker)
    })
    hypothesisMarkersRef.current = []

    // Add hypothesis point markers if enabled and points exist
    if (showHypothesisPoints && hypothesisPoints.length > 0) {
      // Limit visible points for performance (max 50 points)
      const visiblePoints = hypothesisPoints.slice(0, 50)

      visiblePoints.forEach((point) => {
        const marker = L.marker([point.coordinate.latitude, point.coordinate.longitude], {
          icon: createHypothesisIcon(point.type, point.id === 'optimal'),
        })

        // Enhanced popup with hypothesis point metadata
        const isOptimal = point.id === 'optimal'
        const typeLabel = getHypothesisTypeLabel(point.type)

        marker.bindPopup(`
          <div class="p-3 min-w-[220px]">
            <h3 class="font-semibold text-gray-900 mb-2">
              ${isOptimal ? '⭐ Optimal Point' : `${typeLabel} Point`}
            </h3>
            <div class="space-y-1 text-sm text-gray-600">
              <p><strong>Type:</strong> ${typeLabel}</p>
              <p><strong>Coordinates:</strong> ${point.coordinate.latitude.toFixed(4)}, ${point.coordinate.longitude.toFixed(4)}</p>
              <p><strong>ID:</strong> ${point.id}</p>
              ${point.metadata?.participantId ? `<p><strong>Participant:</strong> ${point.metadata.participantId}</p>` : ''}
              ${point.metadata?.pairIds ? `<p><strong>Pair:</strong> ${point.metadata.pairIds.join(' ↔ ')}</p>` : ''}
              <div class="mt-2 text-xs text-gray-500">
                ${getHypothesisTypeDescription(point.type)}
              </div>
            </div>
          </div>
        `, {
          maxWidth: 280,
          className: 'hypothesis-popup'
        })

        // Add click event handler for hypothesis points
        if (onHypothesisPointClick) {
          marker.on('click', () => {
            onHypothesisPointClick(point)
          })
        }

        marker.addTo(mapRef.current!)
        hypothesisMarkersRef.current.push(marker)
      })

      // Show performance warning if too many points
      if (hypothesisPoints.length > 50) {
        console.warn(`Performance: Showing only 50 of ${hypothesisPoints.length} hypothesis points`)
      }
    }
  }, [hypothesisPoints, showHypothesisPoints, onHypothesisPointClick])

  return <div id="map" className="map-container" />
}

// Create colored icon for location markers
const createColoredIcon = (color: string, number: number): L.Icon => {
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
const createCenterIcon = (): L.DivIcon => {
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

// Create hypothesis point icon based on type
const createHypothesisIcon = (type: HypothesisPoint['type'], isOptimal: boolean = false): L.DivIcon => {
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
      className: 'hypothesis-marker optimal-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12],
    })
  }

  let color: string
  let shape: string
  let size: number

  switch (type) {
    case 'GEOGRAPHIC_CENTROID':
    case 'MEDIAN_COORDINATE':
    case 'PARTICIPANT_LOCATION':
    case 'PAIRWISE_MIDPOINT':
      // Blue circles for anchor points (Phase 0)
      color = '#3b82f6'
      shape = 'circle'
      size = 12
      break
    case 'COARSE_GRID':
      // Gray squares for coarse grid points (Phase 1)
      color = '#6b7280'
      shape = 'square'
      size = 10
      break
    case 'LOCAL_REFINEMENT':
      // Red diamonds for local refinement points (Phase 2)
      color = '#ef4444'
      shape = 'diamond'
      size = 10
      break
    default:
      color = '#9ca3af'
      shape = 'circle'
      size = 8
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
  } else { // diamond
    svgIcon = `
      <svg width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}" xmlns="http://www.w3.org/2000/svg">
        <path d="M${size} 2 L${size * 2 - 2} ${size} L${size} ${size * 2 - 2} L2 ${size} Z"
              fill="${color}" stroke="#fff" stroke-width="2"/>
      </svg>
    `
  }

  return L.divIcon({
    html: svgIcon,
    className: `hypothesis-marker ${type.toLowerCase().replace('_', '-')}-marker`,
    iconSize: [size * 2, size * 2],
    iconAnchor: [size, size],
    popupAnchor: [0, -size],
  })
}

// Get human-readable label for hypothesis point type
const getHypothesisTypeLabel = (type: HypothesisPoint['type']): string => {
  switch (type) {
    case 'GEOGRAPHIC_CENTROID':
      return 'Geographic Centroid'
    case 'MEDIAN_COORDINATE':
      return 'Median Coordinate'
    case 'PARTICIPANT_LOCATION':
      return 'Participant Location'
    case 'PAIRWISE_MIDPOINT':
      return 'Pairwise Midpoint'
    case 'COARSE_GRID':
      return 'Coarse Grid'
    case 'LOCAL_REFINEMENT':
      return 'Local Refinement'
    default:
      return 'Unknown'
  }
}

// Get description for hypothesis point type
const getHypothesisTypeDescription = (type: HypothesisPoint['type']): string => {
  switch (type) {
    case 'GEOGRAPHIC_CENTROID':
      return 'Geographic center of all participant locations'
    case 'MEDIAN_COORDINATE':
      return 'Median latitude and longitude coordinates'
    case 'PARTICIPANT_LOCATION':
      return 'One of the original participant locations'
    case 'PAIRWISE_MIDPOINT':
      return 'Midpoint between two participant locations'
    case 'COARSE_GRID':
      return 'Point from coarse grid search (Phase 1)'
    case 'LOCAL_REFINEMENT':
      return 'Point from local refinement search (Phase 2)'
    default:
      return 'Hypothesis point for optimization'
  }
}

export default Map