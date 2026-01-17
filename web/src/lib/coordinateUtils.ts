/**
 * Coordinate validation and parsing utilities
 */

export interface Coordinate {
  latitude: number
  longitude: number
}

/**
 * Validates coordinate ranges
 */
export const isValidCoordinate = (latitude: number, longitude: number): boolean => {
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

/**
 * Parses coordinate string in format "lat,lng"
 * Returns null if invalid format or out of range
 */
export const parseCoordinates = (input: string): Coordinate | null => {
  // Updated regex to handle scientific notation (e.g., 1.23e-10)
  const coordPattern = /^(-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?),\s*(-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)$/
  const match = input.trim().match(coordPattern)

  if (!match) return null

  const latitude = parseFloat(match[1])
  const longitude = parseFloat(match[2])

  // Check for NaN values
  if (isNaN(latitude) || isNaN(longitude)) return null

  // Validate coordinate ranges
  if (!isValidCoordinate(latitude, longitude)) return null

  return { latitude, longitude }
}

/**
 * Formats coordinates for display
 */
export const formatCoordinate = (coordinate: Coordinate): string => {
  return `${coordinate.latitude.toFixed(4)}, ${coordinate.longitude.toFixed(4)}`
}