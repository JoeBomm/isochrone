import { render, screen, fireEvent } from '@redwoodjs/testing/web'

import DebugControls from './DebugControls'

interface DebugPoint {
  id: string
  coordinate: { latitude: number; longitude: number }
  type: 'ANCHOR' | 'GRID'
}

const mockDebugPoints: DebugPoint[] = [
  {
    id: 'geographic_centroid',
    coordinate: { latitude: 40.7128, longitude: -74.006 },
    type: 'ANCHOR',
  },
  {
    id: 'participant_1',
    coordinate: { latitude: 40.7589, longitude: -73.9851 },
    type: 'ANCHOR',
  },
  {
    id: 'grid_1',
    coordinate: { latitude: 40.72, longitude: -74.0 },
    type: 'GRID',
  },
  {
    id: 'grid_2',
    coordinate: { latitude: 40.73, longitude: -74.01 },
    type: 'GRID',
  },
]

describe('DebugControls', () => {
  it('renders successfully', () => {
    const mockToggleAnchors = jest.fn()
    const mockToggleGrid = jest.fn()

    render(
      <DebugControls
        debugPoints={mockDebugPoints}
        showAnchors={false}
        showGrid={false}
        onToggleAnchors={mockToggleAnchors}
        onToggleGrid={mockToggleGrid}
      />
    )

    expect(screen.getByText('Debug Visualization')).toBeInTheDocument()
  })

  it('shows expandable content when clicked', () => {
    const mockToggleAnchors = jest.fn()
    const mockToggleGrid = jest.fn()

    render(
      <DebugControls
        debugPoints={mockDebugPoints}
        showAnchors={false}
        showGrid={false}
        onToggleAnchors={mockToggleAnchors}
        onToggleGrid={mockToggleGrid}
      />
    )

    // Initially collapsed
    expect(screen.queryByText('Show Anchor Points')).not.toBeInTheDocument()

    // Click to expand
    const expandButton = screen.getByLabelText('Expand debug controls')
    fireEvent.click(expandButton)

    // Now should show controls
    expect(screen.getByText('Show Anchor Points')).toBeInTheDocument()
    expect(screen.getByText('Show Grid Points')).toBeInTheDocument()
  })

  it('calls toggle functions when checkboxes are clicked', () => {
    const mockToggleAnchors = jest.fn()
    const mockToggleGrid = jest.fn()

    render(
      <DebugControls
        debugPoints={mockDebugPoints}
        showAnchors={false}
        showGrid={false}
        onToggleAnchors={mockToggleAnchors}
        onToggleGrid={mockToggleGrid}
      />
    )

    // Expand first
    const expandButton = screen.getByLabelText('Expand debug controls')
    fireEvent.click(expandButton)

    // Click anchor checkbox
    const anchorCheckbox = screen.getByLabelText('Show Anchor Points')
    fireEvent.click(anchorCheckbox)
    expect(mockToggleAnchors).toHaveBeenCalledWith(true)

    // Click grid checkbox
    const gridCheckbox = screen.getByLabelText('Show Grid Points')
    fireEvent.click(gridCheckbox)
    expect(mockToggleGrid).toHaveBeenCalledWith(true)
  })

  it('shows statistics for debug points', () => {
    const mockToggleAnchors = jest.fn()
    const mockToggleGrid = jest.fn()

    render(
      <DebugControls
        debugPoints={mockDebugPoints}
        showAnchors={true}
        showGrid={true}
        onToggleAnchors={mockToggleAnchors}
        onToggleGrid={mockToggleGrid}
      />
    )

    // Expand first
    const expandButton = screen.getByLabelText('Expand debug controls')
    fireEvent.click(expandButton)

    // Should show statistics
    expect(screen.getByText('Statistics')).toBeInTheDocument()
    expect(screen.getByText(/Total hypothesis points:/)).toBeInTheDocument()
  })

  it('shows algorithm independence note', () => {
    const mockToggleAnchors = jest.fn()
    const mockToggleGrid = jest.fn()

    render(
      <DebugControls
        debugPoints={mockDebugPoints}
        showAnchors={false}
        showGrid={false}
        onToggleAnchors={mockToggleAnchors}
        onToggleGrid={mockToggleGrid}
      />
    )

    // Expand first
    const expandButton = screen.getByLabelText('Expand debug controls')
    fireEvent.click(expandButton)

    // Should show algorithm independence note (Requirements 3.5)
    expect(
      screen.getByText(/These toggles only affect visualization/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/All points remain in algorithm calculations/)
    ).toBeInTheDocument()
  })

  it('correctly counts anchor and grid points', () => {
    const mockToggleAnchors = jest.fn()
    const mockToggleGrid = jest.fn()

    render(
      <DebugControls
        debugPoints={mockDebugPoints}
        showAnchors={false}
        showGrid={false}
        onToggleAnchors={mockToggleAnchors}
        onToggleGrid={mockToggleGrid}
      />
    )

    // Expand first
    const expandButton = screen.getByLabelText('Expand debug controls')
    fireEvent.click(expandButton)

    // Should show correct counts (2 anchors, 2 grid points from mockDebugPoints)
    expect(screen.getAllByText('2 points')).toHaveLength(2) // Both anchor and grid should show 2 points
  })
})
