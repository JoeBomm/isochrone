import React from 'react'

import { render, screen, fireEvent } from '@testing-library/react'

import OptimizationGoals, { OptimizationGoal } from './OptimizationGoals'

describe('OptimizationGoals', () => {
  it('renders all optimization goal options', () => {
    const mockOnGoalChange = jest.fn()

    render(
      <OptimizationGoals
        selectedGoal={OptimizationGoal.MINIMAX}
        onGoalChange={mockOnGoalChange}
      />
    )

    expect(screen.getByRole('radio', { name: /Minimax/ })).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: /Mean \(Equalize\)/ })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: /Minimize Total/ })
    ).toBeInTheDocument()
  })

  it('calls onGoalChange when a different goal is selected', () => {
    const mockOnGoalChange = jest.fn()

    render(
      <OptimizationGoals
        selectedGoal={OptimizationGoal.MINIMAX}
        onGoalChange={mockOnGoalChange}
      />
    )

    // Click on the Mean option
    const meanOption = screen.getByRole('radio', { name: /Mean \(Equalize\)/ })
    fireEvent.click(meanOption)

    expect(mockOnGoalChange).toHaveBeenCalledWith(OptimizationGoal.MEAN)
  })

  it('shows the correct selected goal', () => {
    const mockOnGoalChange = jest.fn()

    render(
      <OptimizationGoals
        selectedGoal={OptimizationGoal.MEAN}
        onGoalChange={mockOnGoalChange}
      />
    )

    const meanRadio = screen.getByRole('radio', { name: /Mean \(Equalize\)/ })
    expect(meanRadio).toBeChecked()
  })

  it('disables all options when disabled prop is true', () => {
    const mockOnGoalChange = jest.fn()

    render(
      <OptimizationGoals
        selectedGoal={OptimizationGoal.MINIMAX}
        onGoalChange={mockOnGoalChange}
        disabled={true}
      />
    )

    const radios = screen.getAllByRole('radio')
    radios.forEach((radio) => {
      expect(radio).toBeDisabled()
    })
  })
})
