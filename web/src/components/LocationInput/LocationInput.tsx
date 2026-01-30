import { useState } from 'react'

import { useLazyQuery } from '@apollo/client'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Upload as UploadIcon,
  LocationOn as LocationOnIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material'
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  AlertTitle,
  Card,
  CardContent,
  IconButton,
  CircularProgress,
  Collapse,
  List,
  ListItem,
  ListItemText,
  Divider,
  useTheme,
  useMediaQuery,
} from '@mui/material'

import { ConcurrencyController } from 'src/lib/concurrencyController'
import { parseCoordinates, formatCoordinate } from 'src/lib/coordinateUtils'
import { GEOCODE_ADDRESS } from 'src/lib/graphql'

export interface Location {
  id: string
  name: string
  latitude: number
  longitude: number
  color: string
}

interface LocationInputProps {
  onLocationAdd: (location: Location) => void
  onLocationRemove: (locationId: string) => void
  locations: Location[]
  isLoading?: boolean
}

// Color palette for location markers
const MARKER_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // yellow
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#a855f7', // violet
]

const LocationInput = ({
  onLocationAdd,
  onLocationRemove,
  locations,
  isLoading = false,
}: LocationInputProps) => {
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState('')
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [showBulkInput, setShowBulkInput] = useState(false)
  const [bulkInputValue, setBulkInputValue] = useState('')
  const [bulkInputError, setBulkInputError] = useState('')
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)
  const [bulkResults, setBulkResults] = useState<{
    successful: Location[]
    failed: Array<{ input: string; error: string }>
  }>({ successful: [], failed: [] })
  const [bulkProcessingState, setBulkProcessingState] = useState<{
    totalItems: number
    processedItems: number
    coordinatesFound: number
    addressesFound: number
    isProcessing: boolean
  }>({
    totalItems: 0,
    processedItems: 0,
    coordinatesFound: 0,
    addressesFound: 0,
    isProcessing: false,
  })

  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  // GraphQL query for geocoding (individual input)
  const [geocodeAddress] = useLazyQuery(GEOCODE_ADDRESS, {
    onCompleted: (data) => {
      if (data?.geocodeAddress) {
        const newLocation: Location = {
          id: Date.now().toString(),
          name: inputValue.trim(),
          latitude: data.geocodeAddress.latitude,
          longitude: data.geocodeAddress.longitude,
          color: MARKER_COLORS[locations.length % MARKER_COLORS.length],
        }
        onLocationAdd(newLocation)
        setInputValue('')
      }
      setIsGeocoding(false)
    },
    onError: (error) => {
      console.error('Geocoding error:', error)

      // Provide more helpful error messages
      let errorMessage = 'Failed to find location.'

      if (error.message.includes('No results found')) {
        errorMessage = `No results found for "${inputValue.trim()}". Try a more specific address or enter coordinates directly (e.g., "40.7128,-74.0060").`
      } else if (error.message.includes('rate limit')) {
        errorMessage = 'Too many requests. Please wait a moment and try again.'
      } else if (error.message.includes('API key')) {
        errorMessage = 'Service configuration error. Please contact support.'
      } else if (error.message.includes('timeout')) {
        errorMessage =
          'Request timed out. Please check your connection and try again.'
      } else {
        errorMessage = `Unable to find "${inputValue.trim()}". Please try a different address or enter coordinates directly.`
      }

      setInputError(errorMessage)
      setIsGeocoding(false)
    },
  })

  // Separate geocoding query for bulk processing (no callbacks to avoid duplicates)
  // This prevents the onCompleted callback from automatically adding locations
  // when we're doing bulk processing, which would create duplicates
  const [geocodeAddressBulk] = useLazyQuery(GEOCODE_ADDRESS)

  // Input processing functions
  const separateCoordinatesFromAddresses = (inputText: string) => {
    const lines = inputText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const coordinates: string[] = []
    const addresses: string[] = []

    for (const line of lines) {
      const parsedCoordinates = parseCoordinates(line)
      if (parsedCoordinates) {
        coordinates.push(line)
      } else {
        addresses.push(line)
      }
    }

    return { coordinates, addresses }
  }

  const processCoordinatesImmediately = (
    coordinateLines: string[],
    startColorIndex: number = 0
  ): {
    locations: Location[]
    errors: Array<{ input: string; error: string }>
  } => {
    const coordinateLocations: Location[] = []
    const coordinateErrors: Array<{ input: string; error: string }> = []

    for (let i = 0; i < coordinateLines.length; i++) {
      const line = coordinateLines[i]
      try {
        const coordinates = parseCoordinates(line)
        if (coordinates) {
          const newLocation: Location = {
            id: `${Date.now()}-${Math.random()}-coord-${i}`,
            name: formatCoordinate(coordinates),
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            color:
              MARKER_COLORS[
                (startColorIndex + coordinateLocations.length) %
                  MARKER_COLORS.length
              ],
          }
          coordinateLocations.push(newLocation)
        } else {
          coordinateErrors.push({
            input: line,
            error: 'Invalid coordinate format',
          })
        }
      } catch (error) {
        console.error('Error processing coordinate:', line, error)
        coordinateErrors.push({
          input: line,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to parse coordinates',
        })
      }
    }

    return { locations: coordinateLocations, errors: coordinateErrors }
  }

  const processBulkInput = async (
    inputText: string,
    onProgressiveResult?: (location: Location) => void
  ): Promise<Location[]> => {
    if (!inputText.trim()) {
      throw new Error('No valid input lines found')
    }

    // Separate coordinates from addresses
    const { coordinates: coordinateLines, addresses: addressLines } =
      separateCoordinatesFromAddresses(inputText)

    const totalItems = coordinateLines.length + addressLines.length
    let processedItems = 0

    // Initialize processing state
    setBulkProcessingState({
      totalItems,
      processedItems: 0,
      coordinatesFound: coordinateLines.length,
      addressesFound: addressLines.length,
      isProcessing: true,
    })

    // Process coordinates immediately
    const coordinateResult = processCoordinatesImmediately(
      coordinateLines,
      locations.length
    )
    const coordinateLocations = coordinateResult.locations
    const allErrors: Array<{ input: string; error: string }> = [
      ...coordinateResult.errors,
    ]

    // Add coordinate locations immediately via progressive callback
    let colorIndex = locations.length + coordinateLocations.length
    if (onProgressiveResult) {
      coordinateLocations.forEach((location) => {
        onProgressiveResult(location)
        processedItems++
        setBulkProcessingState((prev) => ({
          ...prev,
          processedItems: processedItems,
        }))
      })
    }

    // Update processed items count for coordinate errors too
    processedItems += coordinateResult.errors.length
    setBulkProcessingState((prev) => ({
      ...prev,
      processedItems: processedItems,
    }))

    // Process addresses in parallel using ConcurrencyController
    const addressLocations: Location[] = []

    if (addressLines.length > 0) {
      const concurrencyController = new ConcurrencyController(6)

      // Create geocoding tasks for parallel execution
      const geocodingTasks = addressLines.map((address, index) => {
        return async () => {
          try {
            const geocodeResult = await geocodeAddressBulk({
              variables: { address },
            })

            if (geocodeResult.data?.geocodeAddress) {
              const newLocation: Location = {
                id: `${Date.now()}-${Math.random()}-${index}`,
                name: address,
                latitude: geocodeResult.data.geocodeAddress.latitude,
                longitude: geocodeResult.data.geocodeAddress.longitude,
                color: MARKER_COLORS[colorIndex % MARKER_COLORS.length],
              }

              // Add to results array
              addressLocations.push(newLocation)

              // Progressive result callback for immediate display
              if (onProgressiveResult) {
                onProgressiveResult(newLocation)
              }

              // Update processing state and increment color index
              processedItems++
              colorIndex++
              setBulkProcessingState((prev) => ({
                ...prev,
                processedItems: processedItems,
              }))

              return { success: true, location: newLocation, address }
            } else {
              const error = {
                input: address,
                error: 'No geocoding result found',
              }
              allErrors.push(error)

              // Update processing state even for failures
              processedItems++
              setBulkProcessingState((prev) => ({
                ...prev,
                processedItems: processedItems,
              }))

              return { success: false, error, address }
            }
          } catch (geocodeError) {
            const errorMessage =
              geocodeError instanceof Error
                ? geocodeError.message
                : 'Failed to geocode address'
            const error = { input: address, error: errorMessage }
            allErrors.push(error)

            // Update processing state even for failures
            processedItems++
            setBulkProcessingState((prev) => ({
              ...prev,
              processedItems: processedItems,
            }))

            return { success: false, error, address }
          }
        }
      })

      // Execute all geocoding tasks in parallel with concurrency control
      await concurrencyController.execute(geocodingTasks)
    }

    // Mark processing as complete
    setBulkProcessingState((prev) => ({
      ...prev,
      isProcessing: false,
    }))

    // Combine all results (coordinates + addresses)
    const allSuccessfulLocations = [...coordinateLocations, ...addressLocations]
    setBulkResults({ successful: allSuccessfulLocations, failed: allErrors })
    return allSuccessfulLocations
  }

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bulkInputValue.trim() || isBulkProcessing) return

    setBulkInputError('')
    setIsBulkProcessing(true)
    setBulkResults({ successful: [], failed: [] })
    setBulkProcessingState({
      totalItems: 0,
      processedItems: 0,
      coordinatesFound: 0,
      addressesFound: 0,
      isProcessing: false,
    })

    try {
      // Progressive result callback to add locations immediately as they're processed
      const onProgressiveResult = (location: Location) => {
        if (onLocationAdd) {
          onLocationAdd(location)
        }
      }

      const processedLocations = await processBulkInput(
        bulkInputValue,
        onProgressiveResult
      )

      // Since locations are added progressively, we only need to handle completion
      if (processedLocations.length > 0) {
        setBulkInputValue('')
        setShowBulkInput(false)
      } else {
        setBulkInputError(
          'No valid locations could be processed from the input'
        )
      }
    } catch (error) {
      console.error('Bulk processing error:', error)
      setBulkInputError(
        error instanceof Error
          ? error.message
          : 'Failed to process bulk input. Please check the format and try again.'
      )

      // Reset processing state on error
      setBulkProcessingState({
        totalItems: 0,
        processedItems: 0,
        coordinatesFound: 0,
        addressesFound: 0,
        isProcessing: false,
      })
    } finally {
      setIsBulkProcessing(false)
    }
  }

  const handleBulkInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBulkInputValue(e.target.value)
    if (bulkInputError) setBulkInputError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isLoading || isGeocoding) return

    setInputError('')

    try {
      // Check if input is coordinates
      const coordinates = parseCoordinates(inputValue)

      if (coordinates) {
        // Direct coordinate input
        const newLocation: Location = {
          id: Date.now().toString(),
          name: formatCoordinate(coordinates),
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          color: MARKER_COLORS[locations.length % MARKER_COLORS.length],
        }
        onLocationAdd(newLocation)
        setInputValue('')
      } else {
        // Address geocoding using GraphQL
        setIsGeocoding(true)
        await geocodeAddress({
          variables: { address: inputValue.trim() },
        })
      }
    } catch (error) {
      console.error('Location processing error:', error)
      setInputError('Failed to process location. Please try again.')
      setIsGeocoding(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    if (inputError) setInputError('')
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 600, mx: 'auto' }}>
      {/* Individual Location Input */}
      <Card elevation={2} sx={{ mb: 2 }}>
        <CardContent>
          <Typography
            variant="h6"
            gutterBottom
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <LocationOnIcon color="primary" />
            Add Location
          </Typography>

          <Box component="form" onSubmit={handleSubmit} sx={{ mb: 2 }}>
            <TextField
              fullWidth
              label="Enter address or coordinates"
              placeholder="123 Main St, City or 40.7128,-74.0060"
              value={inputValue}
              onChange={handleInputChange}
              disabled={isLoading || isGeocoding}
              error={!!inputError}
              helperText={
                inputError ||
                'Examples: "123 Main St, City" or "40.7128,-74.0060"'
              }
              sx={{ mb: 2 }}
              slotProps={{
                input: {
                  endAdornment: isGeocoding ? (
                    <CircularProgress size={20} />
                  ) : null,
                },
              }}
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth={isMobile}
              disabled={!inputValue.trim() || isLoading || isGeocoding}
              startIcon={
                isGeocoding ? <CircularProgress size={16} /> : <AddIcon />
              }
              sx={{ minWidth: isMobile ? 'auto' : 140 }}
            >
              {isGeocoding ? 'Finding...' : 'Add Location'}
            </Button>
          </Box>

          {/* Bulk Input Toggle */}
          <Box sx={{ textAlign: 'center' }}>
            <Button
              variant="text"
              size="small"
              onClick={() => setShowBulkInput(!showBulkInput)}
              disabled={isLoading || isGeocoding || isBulkProcessing}
              startIcon={
                showBulkInput ? <ExpandLessIcon /> : <ExpandMoreIcon />
              }
              endIcon={<UploadIcon />}
            >
              {showBulkInput
                ? 'Switch to Individual Input'
                : 'Import Multiple Locations'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Bulk Input Form */}
      <Collapse in={showBulkInput}>
        <Card elevation={2} sx={{ mb: 2 }}>
          <CardContent>
            <Typography
              variant="h6"
              gutterBottom
              sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
            >
              <UploadIcon color="primary" />
              Bulk Location Import
            </Typography>

            <Box component="form" onSubmit={handleBulkSubmit}>
              <TextField
                fullWidth
                multiline
                rows={6}
                label="Enter locations, one per line"
                placeholder={`123 Main St, City
40.7128,-74.0060
456 Oak Ave, Town`}
                value={bulkInputValue}
                onChange={handleBulkInputChange}
                disabled={isLoading || isBulkProcessing}
                error={!!bulkInputError}
                helperText="Enter one location per line. Mix addresses and coordinates (lat,lng format)."
                sx={{ mb: 2 }}
              />

              {bulkInputError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <AlertTitle>Bulk Import Error</AlertTitle>
                  {bulkInputError}
                </Alert>
              )}

              {/* Processing Progress Indicator */}
              {bulkProcessingState.isProcessing && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <AlertTitle>Processing Locations...</AlertTitle>
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      Progress: {bulkProcessingState.processedItems} of{' '}
                      {bulkProcessingState.totalItems} items processed
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      Found: {bulkProcessingState.coordinatesFound} coordinates,{' '}
                      {bulkProcessingState.addressesFound} addresses
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                      <CircularProgress size={16} sx={{ mr: 1 }} />
                      <Typography variant="body2">
                        {bulkProcessingState.processedItems <
                        bulkProcessingState.coordinatesFound
                          ? 'Processing coordinates...'
                          : 'Geocoding addresses...'}
                      </Typography>
                    </Box>
                  </Box>
                </Alert>
              )}

              {/* Bulk Results Summary */}
              {!bulkProcessingState.isProcessing &&
                (bulkResults.successful.length > 0 ||
                  bulkResults.failed.length > 0) && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <AlertTitle>Import Results</AlertTitle>
                    <Box sx={{ mt: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <CheckCircleIcon fontSize="small" color="success" />
                        Successfully processed: {
                          bulkResults.successful.length
                        }{' '}
                        locations
                      </Typography>

                      {/* Detailed breakdown of successful results */}
                      {bulkResults.successful.length > 0 && (
                        <Box sx={{ ml: 3, mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {
                              bulkResults.successful.filter((loc) =>
                                loc.name.includes('°')
                              ).length
                            }{' '}
                            coordinates,{' '}
                            {
                              bulkResults.successful.filter(
                                (loc) => !loc.name.includes('°')
                              ).length
                            }{' '}
                            geocoded addresses
                          </Typography>
                        </Box>
                      )}

                      {bulkResults.failed.length > 0 && (
                        <>
                          <Typography
                            variant="body2"
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              mt: 0.5,
                            }}
                          >
                            <ErrorIcon fontSize="small" color="error" />
                            Failed to process: {bulkResults.failed.length}{' '}
                            locations
                          </Typography>

                          {/* Summary of processing results */}
                          <Box sx={{ ml: 3, mt: 0.5, mb: 1 }}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Total processed: {bulkProcessingState.totalItems}{' '}
                              items ({bulkProcessingState.coordinatesFound}{' '}
                              coordinates, {bulkProcessingState.addressesFound}{' '}
                              addresses)
                            </Typography>
                          </Box>

                          <Box sx={{ mt: 1 }}>
                            <Typography variant="body2" fontWeight="medium">
                              Failed locations:
                            </Typography>
                            <List dense sx={{ mt: 0.5 }}>
                              {bulkResults.failed.map((failure, index) => (
                                <ListItem key={index} sx={{ py: 0.25 }}>
                                  <ListItemText
                                    primary={`"${failure.input}"`}
                                    secondary={failure.error}
                                    slotProps={{
                                      primary: { variant: 'body2' },
                                      secondary: { variant: 'caption' },
                                    }}
                                  />
                                </ListItem>
                              ))}
                            </List>
                          </Box>
                        </>
                      )}
                    </Box>
                  </Alert>
                )}

              <Button
                type="submit"
                variant="contained"
                color="success"
                fullWidth={isMobile}
                disabled={
                  !bulkInputValue.trim() || isLoading || isBulkProcessing
                }
                startIcon={
                  isBulkProcessing ? (
                    <CircularProgress size={16} />
                  ) : (
                    <UploadIcon />
                  )
                }
                sx={{ minWidth: isMobile ? 'auto' : 160 }}
              >
                {isBulkProcessing ? 'Processing...' : 'Import Locations'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Collapse>

      {/* Location List */}
      {locations.length > 0 && (
        <Card elevation={2}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Locations ({locations.length}/12)
            </Typography>

            <List sx={{ maxHeight: 300, overflow: 'auto' }}>
              {locations.map((location, index) => (
                <Box key={location.id}>
                  <ListItem
                    sx={{
                      bgcolor: 'background.paper',
                      borderRadius: 1,
                      mb: 1,
                      border: 1,
                      borderColor: 'divider',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        bgcolor: location.color,
                        border: 2,
                        borderColor: 'white',
                        boxShadow: 1,
                        mr: 2,
                        flexShrink: 0,
                      }}
                    />
                    <ListItemText
                      primary={location.name}
                      secondary={`${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
                      slotProps={{
                        primary: {
                          variant: 'body2',
                          fontWeight: 'medium',
                        },
                        secondary: {
                          variant: 'caption',
                          color: 'text.secondary',
                        },
                      }}
                    />
                    <IconButton
                      onClick={() => onLocationRemove(location.id)}
                      disabled={isLoading}
                      size="small"
                      color="error"
                      sx={{ ml: 1 }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItem>
                  {index < locations.length - 1 && <Divider />}
                </Box>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Location Limit Warning */}
      {locations.length >= 12 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          <AlertTitle>Location Limit Reached</AlertTitle>
          Maximum of 12 locations reached. Remove a location to add more.
        </Alert>
      )}
    </Box>
  )
}

export default LocationInput
