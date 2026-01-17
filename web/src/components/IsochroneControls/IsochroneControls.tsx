import { useState } from 'react'

export type TravelMode = 'DRIVING_CAR' | 'CYCLING_REGULAR' | 'FOOT_WALKING'

interface IsochroneControlsProps {
  travelMode: TravelMode
  slackTime: number
  onTravelModeChange: (mode: TravelMode) => void
  onSlackTimeChange: (minutes: number) => void
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
  onTravelModeChange,
  onSlackTimeChange,
  onCalculate,
  isCalculating,
  canCalculate
}: IsochroneControlsProps) => {
  const [slackTimeError, setSlackTimeError] = useState('')

  const handleSlackTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value)
    setSlackTimeError('')

    if (isNaN(value) || value < 5 || value > 60) {
      setSlackTimeError('Slack time must be between 5 and 60 minutes')
      return
    }

    onSlackTimeChange(value)
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
    <div className="space-y-6">
      {/* Travel Mode Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Travel Mode
        </label>
        <div className="grid grid-cols-3 gap-2">
          {TRAVEL_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => onTravelModeChange(mode.value)}
              className={`p-3 rounded-lg border-2 transition-colors ${
                travelMode === mode.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
              disabled={isCalculating}
            >
              <div className="text-lg mb-1">{mode.icon}</div>
              <div className="text-xs font-medium">{mode.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Slack Time Input */}
      <div>
        <label htmlFor="slack-time" className="block text-sm font-medium text-gray-700 mb-1">
          Slack Time (minutes)
        </label>
        <input
          id="slack-time"
          type="number"
          min="5"
          max="60"
          value={slackTime}
          onChange={handleSlackTimeChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={isCalculating}
        />
        <p className="text-xs text-gray-500 mt-1">
          Visualization radius around the optimal meeting point (5-60 minutes)
        </p>
        {slackTimeError && (
          <div className="text-sm text-red-600 bg-red-50 p-2 rounded mt-1">
            {slackTimeError}
          </div>
        )}
      </div>

      {/* Calculate Button */}
      <div>
        <button
          onClick={handleCalculate}
          disabled={!canCalculate || isCalculating || !!slackTimeError}
          className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isCalculating ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Finding optimal point...
            </div>
          ) : (
            'Find Optimal Meeting Point'
          )}
        </button>

        {!canCalculate && (
          <p className="text-sm text-gray-500 mt-2 text-center">
            Add at least 2 locations to calculate
          </p>
        )}
      </div>

      {/* Settings Summary */}
      <div className="bg-gray-50 p-3 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Current Settings</h4>
        <div className="text-xs text-gray-600 space-y-1">
          <div>Travel Mode: {TRAVEL_MODES.find(m => m.value === travelMode)?.label}</div>
          <div>Slack Time: {slackTime} minutes</div>
        </div>
      </div>
    </div>
  )
}

export default IsochroneControls