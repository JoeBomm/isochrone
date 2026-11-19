'use client'

import React, { useState } from 'react'

import { findOptimalLocations } from '../server/isochrones'

// Types for isochrone controls
export type TravelMode = 'DRIVING_CAR' | 'CYCLING_REGULAR' | 'FOOT_WALKING'
export type OptimizationGoal =
  | 'MINIMAX'
  | 'MINIMIZE_VARIANCE'
  | 'MINIMIZE_TOTAL'

interface IsochroneControlsProps {
  travelMode: TravelMode
  slackTime: number
  meetingPointCount: number
  optimizationGoal: OptimizationGoal
  onTravelModeChange: (mode: TravelMode) => void
  onSlackTimeChange: (minutes: number) => void
  onMeetingPointCountChange: (count: number) => void
  onOptimizationGoalChange: (goal: OptimizationGoal) => void
  onCalculate: () => Promise<void>
  isCalculating: boolean
  canCalculate: boolean
  locations: Array<{
    id: string
    name: string
    latitude: number
    longitude: number
    color: string
  }>
}

const TRAVEL_MODES = [
  { value: 'DRIVING_CAR' as const, label: 'Driving', icon: '🚗' },
  { value: 'CYCLING_REGULAR' as const, label: 'Cycling', icon: '🚴' },
  { value: 'FOOT_WALKING' as const, label: 'Walking', icon: '🚶' },
]

const OPTIMIZATION_GOALS = [
  {
    value: 'MINIMAX' as const,
    label: 'Minimize Maximum Travel Time',
    description: 'Find the point that minimizes the longest travel time',
  },
  {
    value: 'MINIMIZE_VARIANCE' as const,
    label: 'Minimize Variance',
    description: 'Find the point with the most balanced travel times',
  },
  {
    value: 'MINIMIZE_TOTAL' as const,
    label: 'Minimize Total Travel Time',
    description: 'Find the point that minimizes total travel time',
  },
]

export function IsochroneControls({
  travelMode,
  slackTime,
  meetingPointCount,
  optimizationGoal,
  onTravelModeChange,
  onSlackTimeChange,
  onMeetingPointCountChange,
  onOptimizationGoalChange,
  onCalculate,
  isCalculating,
  canCalculate,
  locations,
}: IsochroneControlsProps) {
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

    if (isNaN(value) || value < 1 || value > 10) {
      setMeetingPointCountError('Meeting point count must be between 1 and 10')
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
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span>⚙️</span>
        Isochrone Settings
      </h2>

      <div className="space-y-4">
        {/* Travel Mode Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Travel Mode
          </label>
          <select
            value={travelMode}
            onChange={(e) => onTravelModeChange(e.target.value as TravelMode)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isCalculating}
          >
            {TRAVEL_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.icon} {mode.label}
              </option>
            ))}
          </select>
        </div>

        {/* Optimization Goal Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Optimization Goal
          </label>
          <select
            value={optimizationGoal}
            onChange={(e) =>
              onOptimizationGoalChange(e.target.value as OptimizationGoal)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isCalculating}
          >
            {OPTIMIZATION_GOALS.map((goal) => (
              <option
                key={goal.value}
                value={goal.value}
                title={goal.description}
              >
                {goal.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {
              OPTIMIZATION_GOALS.find((g) => g.value === optimizationGoal)
                ?.description
            }
          </p>
        </div>

        {/* Meeting Point Count Input */}
        <div>
          <div className="flex items-center gap-1 mb-2">
            <label
              htmlFor="meeting-point-count"
              className="block text-sm font-medium text-gray-700"
            >
              Number of Meeting Points
            </label>
            <span
              title="Number of optimal meeting points to calculate and display (1-10)"
              className="text-gray-400 cursor-help"
            >
              ℹ️
            </span>
          </div>
          <input
            id="meeting-point-count"
            type="number"
            min="1"
            max="10"
            value={meetingPointCount}
            onChange={handleMeetingPointCountChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isCalculating}
          />
          {meetingPointCountError && (
            <p className="text-red-600 text-sm mt-1">
              {meetingPointCountError}
            </p>
          )}
          {!meetingPointCountError && (
            <p className="text-gray-500 text-sm mt-1">
              Number of optimal meeting points to calculate and display (1-10).
            </p>
          )}
        </div>

        {/* Travel Time Range Input */}
        <div>
          <div className="flex items-center gap-1 mb-2">
            <label
              htmlFor="slack-time"
              className="block text-sm font-medium text-gray-700"
            >
              Travel time range (minutes): {slackTime}
            </label>
            <span
              title="Used to calculate the isochrone, this area you can reach in minutes from the ideal meeting point selected using the input travel mode"
              className="text-gray-400 cursor-help"
            >
              ℹ️
            </span>
          </div>
          <input
            id="slack-time"
            type="range"
            min="5"
            max="60"
            step="5"
            value={slackTime}
            onChange={(e) => onSlackTimeChange(Number(e.target.value))}
            className="w-full"
            disabled={isCalculating}
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>5 min</span>
            <span>60 min</span>
          </div>
          {slackTimeError && (
            <p className="text-red-600 text-sm mt-1">{slackTimeError}</p>
          )}
          {!slackTimeError && (
            <p className="text-gray-500 text-sm mt-1">
              Visualization radius around the optimal meeting point (5-60
              minutes). This does not influence the meeting point calculation.
            </p>
          )}
        </div>

        {/* Calculate Button */}
        <button
          onClick={handleCalculate}
          disabled={
            !canCalculate ||
            isCalculating ||
            !!slackTimeError ||
            !!meetingPointCountError
          }
          className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isCalculating && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          )}
          {isCalculating
            ? 'Generating points...'
            : 'Calculate Optimal Meeting Points'}
        </button>

        {!canCalculate && (
          <p className="text-center text-sm text-gray-500 mt-2">
            Add at least 2 locations to calculate
          </p>
        )}

        {/* Settings Summary */}
        <div className="bg-gray-50 p-4 rounded-md mt-4">
          <h4 className="text-sm font-medium text-gray-800 mb-2">
            Current Configuration
          </h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Travel Mode:</span>
              <span className="font-medium">
                {TRAVEL_MODES.find((m) => m.value === travelMode)?.label}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Optimization Goal:</span>
              <span className="font-medium">
                {
                  OPTIMIZATION_GOALS.find((g) => g.value === optimizationGoal)
                    ?.label
                }
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Travel Time Range:</span>
              <span className="font-medium">{slackTime} minutes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Meeting Points:</span>
              <span className="font-medium">{meetingPointCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Locations:</span>
              <span className="font-medium">{locations.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
