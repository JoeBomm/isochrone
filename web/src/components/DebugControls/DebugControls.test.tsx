import { render, screen, fireEvent } from '@redwoodjs/testing/web'
import DebugControls from './DebugControls'
import type { HypothesisPoint } from 'src/components/Map/Map'

const mockHypothesisPoints: HypothesisPoint[] = [
  {
    id: 'geographic_centroid',
    coordinate: { latitude: 40.7128, longitude: -74.0060 },
    type: 'GEOGRAPHIC_CENTROID',
    metadata: {}
  },
  {
    id: 'participant_1',
    coordinate: { latitude: 40.7589, longitude: -73.9851 },
    type: 'PARTICIPANT_LOCATION',
    metadata: { participantId: 'loc1' }
  },
  {
    id: 'coarse_grid_1',
    coordinate: { latitude: 40.7200, longitude: -74.0000 },
    type: 'COARSE_GRID',
    metadata: {}
  }
]

describe('DebugControls', () => {
  it('renders successfully', () => {
    const mockToggle = jest.fn()

    render(
      <DebugControls
        hypothesisPoints={mockHypothesisPoints}
        showHypothesisPoints={false}
        onToggleHypothesisPoints={mockToggle}
      />
    )

    expect(screen.getByText('Developer Debug Tools')).toBeInTheDocument()
  })

  it('shows expandable content when clicked', () => {
    const mockToggle = jest.fn()

    render(
      <DebugControls
        hypothesisPoints={mockHypothesisPoints}
        showHypothesisPoints={false}
        onToggleHypothesisPoints={mockToggle}
      />
    )

    // Initially collapsed
    expect(screen.queryByText('Show Hypothesis Points')).not.toBeInTheDocument()

    // Click to expand
    const expandButton = screen.getByLabelText('Expand debug tools')
    fireEvent.click(expandButton)

    // Now should show controls
    expect(screen.getByText('Show Hypothesis Points')).toBeInTheDocument()
  })

  it('calls toggle function when checkbox is clicked', () => {
    const mockToggle = jest.fn()

    render(
      <DebugControls
        hypothesisPoints={mockHypothesisPoints}
        showHypothesisPoints={false}
        onToggleHypothesisPoints={mockToggle}
      />
    )

    // Expand first
    const expandButton = screen.getByLabelText('Expand debug tools')
    fireEvent.click(expandButton)

    // Click checkbox
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    expect(mockToggle).toHaveBeenCalledWith(true)
  })

  it('shows statistics for hypothesis points', () => {
    const mockToggle = jest.fn()

    render(
      <DebugControls
        hypothesisPoints={mockHypothesisPoints}
        showHypothesisPoints={true}
        onToggleHypothesisPoints={mockToggle}
      />
    )

    // Expand first
    const expandButton = screen.getByLabelText('Expand debug tools')
    fireEvent.click(expandButton)

    // Should show statistics
    expect(screen.getByText('Statistics')).toBeInTheDocument()
    expect(screen.getByText(/Total hypothesis points:/)).toBeInTheDocument()
  })

  it('shows legend when hypothesis points are visible', () => {
    const mockToggle = jest.fn()

    render(
      <DebugControls
        hypothesisPoints={mockHypothesisPoints}
        showHypothesisPoints={true}
        onToggleHypothesisPoints={mockToggle}
      />
    )

    // Expand first
    const expandButton = screen.getByLabelText('Expand debug tools')
    fireEvent.click(expandButton)

    // Should show legend
    expect(screen.getByText('Marker Legend')).toBeInTheDocument()
    expect(screen.getByText(/Anchor Points/)).toBeInTheDocument()
  })
})