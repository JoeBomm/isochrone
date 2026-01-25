import { useState } from 'react'

import { Info as InfoIcon } from '@mui/icons-material'
import {
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Box,
  Typography,
  Paper,
  FormHelperText,
  CircularProgress,
} from '@mui/material'

import { UI_CONSTANTS, MeetingPointValidation } from 'src/lib/constants'

export type TravelMode = 'DRIVING_CAR' | 'CYCLING_REGULAR' | 'FOOT_WALKING'

interface IsochroneControlsProps {
  travelMode: TravelMode
  slackTime: number
  meetingPointCount: number
  onTravelModeChange: (mode: TravelMode) => void
  onSlackTimeChange: (minutes: number) => void
  onMeetingPointCountChange: (count: number) => void
  onCalculate: () => Promise<void>
  isCalculating: boolean
  canCalculate: boolean
}

const TRAVEL_MODES = [
  { value: 'DRIVING_CAR' as const, label: 'Driving', icon: '🚗' },
  { value: 'CYCLING_REGULAR' as const, label: 'Cycling', icon: '🚴' },
  { value: 'FOOT_WALKING' as const, label: 'Walking', icon: '🚶' },
]

const IsochroneControls = ({
  travelMode,
  slackTime,
  meetingPointCount,
  onTravelModeChange,
  onSlackTimeChange,
  onMeetingPointCountChange,
  onCalculate,
  isCalculating,
  canCalculate,
}: IsochroneControlsProps) => {
  const [slackTimeError, setSlackTimeError] = useState('')
  const [meetingPointCountError, setMeetingPointCountError] = useState('')

  const handleSlackTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value)
    setSlackTimeError('')

    if (isNaN(value) || value < 5 || value > 60) {
      setSlackTimeError('Travel time range must be between 5 and 60 minutes')
      return
    }

    onSlackTimeChange(value)
  }

  const handleMeetingPointCountChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = parseInt(e.target.value)
    setMeetingPointCountError('')

    // Use validation utilities for consistent validation
    if (isNaN(value) || !MeetingPointValidation.isValidCount(value)) {
      setMeetingPointCountError(MeetingPointValidation.getErrorMessage(value))
      return
    }

    onMeetingPointCountChange(value)
  }

  const handleCalculate = async () => {
    if (!canCalculate || isCalculating) return

    try {
      await onCalculate()
    } catch (error) {
      console.error('Calculation failed:', error)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Travel Mode Selection */}
      <FormControl fullWidth>
        <InputLabel id="travel-mode-label">Travel Mode</InputLabel>
        <Select
          labelId="travel-mode-label"
          value={travelMode}
          label="Travel Mode"
          onChange={(e) => onTravelModeChange(e.target.value as TravelMode)}
          disabled={isCalculating}
        >
          {TRAVEL_MODES.map((mode) => (
            <MenuItem key={mode.value} value={mode.value}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>{mode.icon}</span>
                <span>{mode.label}</span>
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Meeting Point Count Input */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography
            variant="body2"
            component="label"
            htmlFor="meeting-point-count"
          >
            Number of Meeting Points
          </Typography>
          <Tooltip title="Number of optimal meeting points to calculate and display (1-10)">
            <InfoIcon
              sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }}
            />
          </Tooltip>
        </Box>
        <TextField
          id="meeting-point-count"
          type="number"
          fullWidth
          value={meetingPointCount}
          onChange={handleMeetingPointCountChange}
          inputProps={{
            min: UI_CONSTANTS.MEETING_POINTS.MIN_COUNT,
            max: UI_CONSTANTS.MEETING_POINTS.MAX_COUNT,
          }}
          disabled={isCalculating}
          error={!!meetingPointCountError}
          helperText={
            meetingPointCountError ||
            `Number of optimal meeting points to calculate and display (${UI_CONSTANTS.MEETING_POINTS.MIN_COUNT}-${UI_CONSTANTS.MEETING_POINTS.MAX_COUNT}).`
          }
        />
      </Box>

      {/* Travel Time Range Input */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="body2" component="label" htmlFor="slack-time">
            Travel time range (minutes)
          </Typography>
          <Tooltip title="Used to calculate the isochrone, this area you can reach in minutes from the ideal meeting point selected using the input travel mode">
            <InfoIcon
              sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }}
            />
          </Tooltip>
        </Box>
        <TextField
          id="slack-time"
          type="number"
          fullWidth
          value={slackTime}
          onChange={handleSlackTimeChange}
          inputProps={{ min: 5, max: 60 }}
          disabled={isCalculating}
          error={!!slackTimeError}
          helperText={
            slackTimeError ||
            'Visualization radius around the optimal meeting point (5-60 minutes). This does not influence the meeting point calculation.'
          }
        />
      </Box>

      {/* Calculate Button */}
      <Box>
        <Button
          onClick={handleCalculate}
          disabled={
            !canCalculate ||
            isCalculating ||
            !!slackTimeError ||
            !!meetingPointCountError
          }
          variant="contained"
          color="success"
          fullWidth
          size="large"
          startIcon={
            isCalculating ? (
              <CircularProgress size={20} color="inherit" />
            ) : null
          }
        >
          {isCalculating
            ? 'Generating points...'
            : 'Calculate Optimal Meeting Points'}
        </Button>

        {!canCalculate && (
          <FormHelperText sx={{ textAlign: 'center', mt: 1 }}>
            Add at least 2 locations to calculate
          </FormHelperText>
        )}
      </Box>

      {/* Settings Summary */}
      <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
        <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.primary' }}>
          Current Configuration
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">
              Travel Mode:
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 'medium' }}>
              {TRAVEL_MODES.find((m) => m.value === travelMode)?.label}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">
              Travel Time Range:
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 'medium' }}>
              {slackTime} minutes
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">
              Meeting Points:
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 'medium' }}>
              {meetingPointCount}
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}

export default IsochroneControls
