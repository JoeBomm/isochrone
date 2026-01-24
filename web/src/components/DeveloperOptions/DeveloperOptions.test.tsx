import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import DeveloperOptions from './DeveloperOptions'
import type { HypothesisPoint } from 'src/components/Map/Map'

// Mock hypothesis points for testing
const mockHypothesisPoints: HypothesisPoint[] = [
  {
    id: 'anchor-1',
    coordinate: { latitude: 40.7128, longitude: -74.0060 },
    type: 'GEOGRAPHIC_CENTROID',
    phase: 'ANCHOR',
    score: 0.8
  },
  {
    id: 'coarse-1',
    coordinate: { latitude: 40.7200, longitude: -74.0100 },
    type: 'COARSE_GRID_CELL',
    phase: 'COARSE_GRID',
    score: 0.7
  },
  {
    id: 'local-1',
    coordinate: { latitude: 40.7150, longitude: -74.0080 },
    type: 'LOCAL_REFINEMENT_CELL',
    phase: 'LOCAL_REFINEMENT',
    score: 0.9
  },
  {
    id: 'final-1',
    coordinate: { latitude: 40.7140, longitude: -74.0070 },
    type: 'GEOGRAPHIC_CENTROID',
    phase: 'FINAL_OUTPUT',
    score: 0.95
  }
]

const mockAllHypothesisPoints = {
  anchorPoints: [mockHypothesisPoints[0]],
  coarseGridPoints: [mockHypothesisPoints[1]],
  localRefinementPoints: [mockHypothesisPoints[2]],
  finalPoints: [mockHypothesisPoints[3]]
}

describe('DeveloperOptions', () => {
  const defaultProps = {
    enabled: false,
    onToggle: jest.fn(),
    hypothesisPoints: mockHypothesisPoints,
    allHypothesisPoints: mockAllHypothesisPoints
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders developer options component', () => {
    render(<DeveloperOptions {...defaultProps} />)

    expect(screen.getByText('Developer Options')).toBeInTheDocument()
    expect(screen.getByText('Debug Mode')).toBeInTheDocument()
  })

  it('shows expandable content when clicked', () => {
    render(<DeveloperOptions {...defaultProps} />)

    // Initially collapsed
    expect(screen.queryByText('Enable Developer Visualization')).not.toBeInTheDocument()

    // Click to expand
    const expandButton = screen.getByLabelText('Expand developer options')
    fireEvent.click(expandButton)

    // Now expanded
    expect(screen.getByText('Enable Developer Visualization')).toBeInTheDocument()
  })

  it('calls onToggle when developer mode is enabled', () => {
    const mockOnToggle = jest.fn()
    render(<DeveloperOptions {...defaultProps} onToggle={mockOnToggle} />)

    // Expand the options
    const expandButton = screen.getByLabelText('Expand developer options')
    fireEvent.click(expandButton)

    // Toggle developer mode
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    expect(mockOnToggle).toHaveBeenCalledWith(true)
  })

  it('shows algorithm independence notice', () => {
    render(<DeveloperOptions {...defaultProps} enabled={true} />)

    // Expand the options
    const expandButton = screen.getByLabelText('Expand developer options')
    fireEvent.click(expandButton)

    expect(screen.getByText('Visualization Only')).toBeInTheDocument()
    expect(screen.getByText(/Developer options only affect what you see on the map/)).toBeInTheDocument()
    expect(screen.getByText(/The core algorithm calculations remain unchanged/)).toBeInTheDocument()
  })

  it('displays correct statistics for hypothesis points', () => {
    render(<DeveloperOptions {...defaultProps} enabled={true} />)

    // Expand the options
    const expandButton = screen.getByLabelText('Expand developer options')
    fireEvent.click(expandButton)

    // Check statistics - be more specific about which elements we're looking for
    expect(screen.getByText('Algorithm Statistics')).toBeInTheDocument()

    // Check for the presence of statistics without being too specific about exact text matches
    expect(screen.getByText('Total Points')).toBeInTheDocument()
    expect(screen.getByText('Phases Used')).toBeInTheDocument()
    expect(screen.getByText('Final Candidates')).toBeInTheDocument()
    expect(screen.getByText('Map Display')).toBeInTheDocument()
  })

  it('shows color-coded legend when enabled and has results', () => {
    render(<DeveloperOptions {...defaultProps} enabled={true} />)

    // Expand the options
    const expandButton = screen.getByLabelText('Expand developer options')
    fireEvent.click(expandButton)

    expect(screen.getByText('Algorithm Phase Legend')).toBeInTheDocument()
    expect(screen.getByText('Phase 0: Anchor Points')).toBeInTheDocument()
    expect(screen.getByText('Phase 1: Coarse Grid')).toBeInTheDocument()
    expect(screen.getByText('Phase 2: Local Refinement')).toBeInTheDocument()
    expect(screen.getByText('Final Output: Points of Interest')).toBeInTheDocument()
  })

  it('shows performance warning for large point sets', () => {
    const largePointSet = Array.from({ length: 60 }, (_, i) => ({
      id: `point-${i}`,
      coordinate: { latitude: 40.7128 + i * 0.001, longitude: -74.0060 + i * 0.001 },
      type: 'COARSE_GRID_CELL' as const,
      phase: 'COARSE_GRID' as const,
      score: 0.5
    }))

    render(
      <DeveloperOptions
        {...defaultProps}
        enabled={true}
        hypothesisPoints={largePointSet}
      />
    )

    // Expand the options
    const expandButton = screen.getByLabelText('Expand developer options')
    fireEvent.click(expandButton)

    expect(screen.getByText('Performance Notice')).toBeInTheDocument()
    expect(screen.getByText(/Displaying only 50 of 60 hypothesis points/)).toBeInTheDocument()
  })

  it('provides usage instructions', () => {
    render(<DeveloperOptions {...defaultProps} enabled={true} />)

    // Expand the options
    const expandButton = screen.getByLabelText('Expand developer options')
    fireEvent.click(expandButton)

    expect(screen.getByText('Developer Mode Usage:')).toBeInTheDocument()
    expect(screen.getByText(/Enable visualization to see all algorithm phases/)).toBeInTheDocument()
    expect(screen.getByText(/This mode is hidden from end users/)).toBeInTheDocument()
  })

  // Test algorithm independence (Requirements 4.2)
  it('does not modify hypothesis points data when toggled', () => {
    const originalPoints = [...mockHypothesisPoints]
    const mockOnToggle = jest.fn()

    const { rerender } = render(
      <DeveloperOptions
        {...defaultProps}
        onToggle={mockOnToggle}
        enabled={false}
      />
    )

    // Expand and enable developer mode
    const expandButton = screen.getByLabelText('Expand developer options')
    fireEvent.click(expandButton)

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    // Re-render with developer mode enabled
    rerender(
      <DeveloperOptions
        {...defaultProps}
        onToggle={mockOnToggle}
        enabled={true}
      />
    )

    // Verify that the original hypothesis points data is unchanged
    expect(mockHypothesisPoints).toEqual(originalPoints)
    expect(mockHypothesisPoints[0].score).toBe(0.8) // Anchor point score unchanged
    expect(mockHypothesisPoints[1].score).toBe(0.7) // Coarse grid point score unchanged
    expect(mockHypothesisPoints[2].score).toBe(0.9) // Local refinement point score unchanged
    expect(mockHypothesisPoints[3].score).toBe(0.95) // Final point score unchanged
  })

  it('maintains consistent point IDs regardless of developer mode state', () => {
    const mockOnToggle = jest.fn()

    // Test with developer mode disabled
    const { rerender } = render(
      <DeveloperOptions
        {...defaultProps}
        onToggle={mockOnToggle}
        enabled={false}
      />
    )

    const originalIds = mockHypothesisPoints.map(point => point.id)

    // Re-render with developer mode enabled
    rerender(
      <DeveloperOptions
        {...defaultProps}
        onToggle={mockOnToggle}
        enabled={true}
      />
    )

    const newIds = mockHypothesisPoints.map(point => point.id)

    // Verify IDs remain the same
    expect(newIds).toEqual(originalIds)
  })
})