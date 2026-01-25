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
      screen.getByRole('radio', { name: /Minimize Variance/ })
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

    // Click on the Minimize Variance option
    const varianceOption = screen.getByRole('radio', {
      name: /Minimize Variance/,
    })
    fireEvent.click(varianceOption)

    expect(mockOnGoalChange).toHaveBeenCalledWith(
      OptimizationGoal.MINIMIZE_VARIANCE
    )
  })

  it('shows the correct selected goal', () => {
    const mockOnGoalChange = jest.fn()

    render(
      <OptimizationGoals
        selectedGoal={OptimizationGoal.MINIMIZE_VARIANCE}
        onGoalChange={mockOnGoalChange}
      />
    )

    const varianceRadio = screen.getByRole('radio', {
      name: /Minimize Variance/,
    })
    expect(varianceRadio).toBeChecked()
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
