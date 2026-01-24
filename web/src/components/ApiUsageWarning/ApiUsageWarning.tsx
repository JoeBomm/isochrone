import React from 'react'

interface ApiUsageWarningProps {
  /** Number of API calls made in the current time window */
  callCount: number
  /** Time window description (e.g., "45 minutes") */
  timeWindow: string
  /** Whether usage is considered high */
  isHighUsage: boolean
  /** Optional callback when user dismisses the warning */
  onDismiss?: () => void
}

/**
 * Component to display API usage warnings to users
 * Helps users understand when they're approaching rate limits
 */
const ApiUsageWarning: React.FC<ApiUsageWarningProps> = ({
  callCount,
  timeWindow,
  isHighUsage,
  onDismiss,
}) => {
  if (!isHighUsage) {
    return null
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
      <div className="flex items-start">
        <svg
          className="w-5 h-5 text-yellow-500 mt-0.5 mr-3 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-yellow-800">
            High API Usage Detected
          </h3>
          <div className="mt-1 text-sm text-yellow-700">
            <p>
              You've made <strong>{callCount}</strong> API calls in the last{' '}
              <strong>{timeWindow}</strong>. To avoid rate limits:
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-xs">
              <li>Consider reducing the number of locations</li>
              <li>Use smaller grid sizes for calculations</li>
              <li>Wait a few minutes before making more requests</li>
              <li>Cached results will help reduce future API calls</li>
            </ul>
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="ml-3 text-yellow-500 hover:text-yellow-600"
            aria-label="Dismiss warning"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

export default ApiUsageWarning
