import React from 'react'

import {
  Speed as SpeedIcon,
  Balance as BalanceIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material'
import {
  Card,
  CardContent,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Box,
  Chip,
  useTheme,
  useMediaQuery,
} from '@mui/material'

export enum OptimizationGoal {
  MINIMAX = 'MINIMAX',
  MINIMIZE_VARIANCE = 'MINIMIZE_VARIANCE',
  MINIMIZE_TOTAL = 'MINIMIZE_TOTAL',
}

interface OptimizationGoalsProps {
  selectedGoal: OptimizationGoal
  onGoalChange: (goal: OptimizationGoal) => void
  disabled?: boolean
}

const optimizationOptions = [
  {
    value: OptimizationGoal.MINIMAX,
    label: 'Minimax',
    description: 'Minimize the maximum travel time for any participant',
    detail:
      'Ensures no one has to travel too far - fairest for the person with the longest commute',
    icon: <BalanceIcon />,
    color: 'primary' as const,
  },
  {
    value: OptimizationGoal.MINIMIZE_VARIANCE,
    label: 'Minimize Variance',
    description: 'Minimize variance to equalize travel times',
    detail:
      "Makes everyone's travel time as similar as possible - most balanced approach",
    icon: <SpeedIcon />,
    color: 'secondary' as const,
  },
  {
    value: OptimizationGoal.MINIMIZE_TOTAL,
    label: 'Minimize Total',
    description: 'Minimize the total sum of all travel times',
    detail:
      'Reduces overall travel time - most efficient but may favor some locations',
    icon: <TrendingDownIcon />,
    color: 'success' as const,
  },
]

const OptimizationGoals: React.FC<OptimizationGoalsProps> = ({
  selectedGoal,
  onGoalChange,
  disabled = false,
}) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onGoalChange(event.target.value as OptimizationGoal)
  }

  return (
    <Card elevation={2}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="h6">Optimization Goal</Typography>
          <Chip
            label={
              optimizationOptions.find((opt) => opt.value === selectedGoal)
                ?.label || 'Unknown'
            }
            color={
              optimizationOptions.find((opt) => opt.value === selectedGoal)
                ?.color || 'default'
            }
            size="small"
          />
        </Box>

        <FormControl component="fieldset" fullWidth disabled={disabled}>
          <FormLabel component="legend" sx={{ mb: 1 }}>
            Choose how to optimize meeting point selection:
          </FormLabel>

          <RadioGroup
            value={selectedGoal}
            onChange={handleChange}
            sx={{ gap: 1 }}
          >
            {optimizationOptions.map((option) => (
              <Box
                key={option.value}
                sx={{
                  border: 1,
                  borderColor:
                    selectedGoal === option.value
                      ? `${option.color}.main`
                      : 'divider',
                  borderRadius: 1,
                  p: 2,
                  bgcolor:
                    selectedGoal === option.value
                      ? `${option.color}.50`
                      : 'background.paper',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    borderColor: `${option.color}.main`,
                    bgcolor: `${option.color}.50`,
                  },
                }}
              >
                <FormControlLabel
                  value={option.value}
                  control={<Radio color={option.color} />}
                  label={
                    <Box sx={{ ml: 1, width: '100%' }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mb: 0.5,
                        }}
                      >
                        {React.cloneElement(option.icon, {
                          fontSize: 'small',
                          color:
                            selectedGoal === option.value
                              ? option.color
                              : 'action',
                        })}
                        <Typography variant="subtitle1" fontWeight="medium">
                          {option.label}
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 0.5 }}
                      >
                        {option.description}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontStyle: 'italic' }}
                      >
                        {option.detail}
                      </Typography>
                    </Box>
                  }
                  sx={{
                    alignItems: 'flex-start',
                    m: 0,
                    width: '100%',
                    '& .MuiFormControlLabel-label': {
                      width: '100%',
                    },
                  }}
                />
              </Box>
            ))}
          </RadioGroup>
        </FormControl>

        {/* Additional Information */}
        <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            <strong>Tip:</strong> The algorithm will recalculate optimal points
            when you change the optimization goal. Different goals may produce
            different meeting point recommendations.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

export default OptimizationGoals
