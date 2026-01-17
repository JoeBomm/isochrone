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

export interface MapProps {
  locations: Location[]
  centerPoint?: Coordinate
  fairMeetingArea?: GeoJSON.Polygon
  onMapClick?: (coordinate: Coordinate) => void
  onLocationClick?: (location: Location) => void
  onCenterPointClick?: (centerPoint: Coordinate) => void
  onFairMeetingAreaClick?: () => void
}

const Map = ({
  locations,
  centerPoint,
  fairMeetingArea,
  onMapClick,
  onLocationClick,
  onCenterPointClick,
  onFairMeetingAreaClick
}: MapProps) => {
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const centerMarkerRef = useRef<L.Marker | null>(null)
  const polygonRef = useRef<L.Polygon | null>(null)

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
        padding: [30, 30],
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
          <h3 class="font-semibold text-gray-900 mb-2">Fair Meeting Point</h3>
          <div class="space-y-1 text-sm text-gray-600">
            <p><strong>Coordinates:</strong> ${centerPoint.latitude.toFixed(4)}, ${centerPoint.longitude.toFixed(4)}</p>
            <p class="text-xs text-gray-500 mt-2">
              This point represents the optimal center calculated from the geometric union of all location isochrones, ensuring fair travel times for all participants.
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
          <h3 class="font-semibold text-gray-900 mb-2">Fair Meeting Area</h3>
          <div class="space-y-1 text-sm text-gray-600">
            <p>This area represents locations accessible within the configured buffer time from the calculated center point.</p>
            <p class="text-xs text-gray-500 mt-2">
              <strong>How it works:</strong> Individual isochrones are calculated for each location, their geometric union is computed, and the centroid of that accessible area becomes the fair meeting point.
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
const createCenterIcon = (): L.Icon => {
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

export default Map