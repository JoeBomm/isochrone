import { useState } from 'react'

import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  BugReport as BugReportIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  MyLocation as MyLocationIcon,
  GridOn as GridOnIcon,
  Star as StarIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import {
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  Box,
  Collapse,
  IconButton,
  Divider,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
} from '@mui/material'

interface DebugPoint {
  id: string
  coordinate: { latitude: number; longitude: number }
  type: 'ANCHOR' | 'GRID'
}

interface DebugControlsProps {
  debugPoints: DebugPoint[]
  showAnchors: boolean
  showGrid: boolean
  onToggleAnchors: (show: boolean) => void
  onToggleGrid: (show: boolean) => void
}

const DebugControls = ({
  debugPoints,
  showAnchors,
  showGrid,
  onToggleAnchors,
  onToggleGrid,
}: DebugControlsProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  // Count points by type for statistics
  const anchorPoints = debugPoints.filter((point) => point.type === 'ANCHOR')
  const gridPoints = debugPoints.filter((point) => point.type === 'GRID')
  const totalPoints = debugPoints.length
  const visibleDebugPoints =
    (showAnchors ? anchorPoints.length : 0) + (showGrid ? gridPoints.length : 0)

  return (
    <Card elevation={2}>
      <CardContent sx={{ pb: isExpanded ? 2 : '16px !important' }}>
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BugReportIcon color="action" />
            <Typography variant="h6">Debug Visualization</Typography>
            {totalPoints > 0 && (
              <Chip
                label={`${totalPoints} points`}
                size="small"
                variant="outlined"
                color="primary"
              />
            )}
          </Box>
          <IconButton
            onClick={() => setIsExpanded(!isExpanded)}
            size="small"
            aria-label={
              isExpanded ? 'Collapse debug controls' : 'Expand debug controls'
            }
          >
            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>

        {/* Expandable Content */}
        <Collapse in={isExpanded}>
          <Box sx={{ mt: 2 }}>
            {/* Debug Point Toggles */}
            <Typography variant="subtitle2" gutterBottom sx={{ mt: 2, mb: 1 }}>
              Hypothesis Point Visualization
            </Typography>

            <Box sx={{ mb: 2 }}>
              {/* Anchor Points Toggle */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                }}
              >
                <FormControlLabel
                  control={
                    <Switch
                      checked={showAnchors}
                      onChange={(e) => onToggleAnchors(e.target.checked)}
                      color="primary"
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <MyLocationIcon fontSize="small" color="primary" />
                      <Typography variant="body2">
                        Show Anchor Points
                      </Typography>
                    </Box>
                  }
                />
                <Chip
                  label={`${anchorPoints.length} points`}
                  size="small"
                  variant="outlined"
                  color={showAnchors ? 'primary' : 'default'}
                />
              </Box>

              {/* Grid Points Toggle */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                }}
              >
                <FormControlLabel
                  control={
                    <Switch
                      checked={showGrid}
                      onChange={(e) => onToggleGrid(e.target.checked)}
                      color="secondary"
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <GridOnIcon fontSize="small" color="action" />
                      <Typography variant="body2">Show Grid Points</Typography>
                    </Box>
                  }
                />
                <Chip
                  label={`${gridPoints.length} points`}
                  size="small"
                  variant="outlined"
                  color={showGrid ? 'secondary' : 'default'}
                />
              </Box>
            </Box>

            {/* Algorithm Independence Note */}
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                These toggles only affect visualization. All points remain in
                algorithm calculations.
              </Typography>
            </Alert>

            {/* Legend */}
            {(showAnchors || showGrid || totalPoints > 0) && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" gutterBottom>
                  Marker Legend
                </Typography>
                <List dense>
                  {/* Anchor Points */}
                  {showAnchors && anchorPoints.length > 0 && (
                    <ListItem>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            bgcolor: 'primary.main',
                            border: 1,
                            borderColor: 'white',
                          }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary="Anchor Points"
                        secondary={`Geographic centroid, median coordinates, participant locations, pairwise midpoints (${anchorPoints.length} points)`}
                        primaryTypographyProps={{
                          variant: 'body2',
                          fontWeight: 'medium',
                        }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItem>
                  )}

                  {/* Grid Points */}
                  {showGrid && gridPoints.length > 0 && (
                    <ListItem>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            bgcolor: 'grey.500',
                            border: 1,
                            borderColor: 'white',
                          }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary="Grid Points"
                        secondary={`Bounding box grid cell centers (${gridPoints.length} points)`}
                        primaryTypographyProps={{
                          variant: 'body2',
                          fontWeight: 'medium',
                        }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItem>
                  )}

                  {/* Optimal Points (always visible) */}
                  <ListItem>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <StarIcon sx={{ fontSize: 12, color: 'success.main' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary="Optimal Points"
                      secondary="Top-ranked meeting points (always visible with higher z-index)"
                      primaryTypographyProps={{
                        variant: 'body2',
                        fontWeight: 'medium',
                      }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItem>
                </List>
              </>
            )}

            {/* Statistics */}
            {totalPoints > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" gutterBottom>
                  Statistics
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                  <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="h6" color="primary">
                      {totalPoints}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Total Hypothesis Points
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="h6" color="secondary">
                      {visibleDebugPoints}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Visible Debug Points
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'primary.50', borderRadius: 1 }}>
                    <Typography variant="body2" fontWeight="medium">
                      {anchorPoints.length}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Anchor Points
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                    <Typography variant="body2" fontWeight="medium">
                      {gridPoints.length}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Grid Points
                    </Typography>
                  </Box>
                </Box>
              </>
            )}

            {/* Help Text */}
            <Alert severity="info" icon={<InfoIcon />}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>How to use:</strong>
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2, '& li': { mb: 0.5 } }}>
                <li>
                  Toggle anchor points to see geographic centroid, median
                  coordinates, participant locations, and pairwise midpoints
                </li>
                <li>
                  Toggle grid points to see bounding box grid cell centers used
                  for systematic search
                </li>
                <li>
                  Optimal points (green stars) are always visible and have
                  higher z-index priority
                </li>
                <li>
                  Debug visualization does not affect algorithm calculations or
                  results
                </li>
              </Box>
            </Alert>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  )
}

// Helper function to get readable type labels (kept for potential future use)
const getTypeLabel = (type: string): string => {
  switch (type) {
    case 'GEOGRAPHIC_CENTROID':
      return 'Centroid'
    case 'MEDIAN_COORDINATE':
      return 'Median'
    case 'PARTICIPANT_LOCATION':
      return 'Participants'
    case 'PAIRWISE_MIDPOINT':
      return 'Midpoints'
    case 'COARSE_GRID':
      return 'Coarse Grid'
    case 'LOCAL_REFINEMENT':
      return 'Refinement'
    default:
      return type
  }
}

export default DebugControls
