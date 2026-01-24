import { useState, useEffect } from 'react'

interface ApiUsageStats {
  callCount: number
  timeWindow: string
  isHighUsage: boolean
}

/**
 * Hook to track and monitor API usage on the frontend
 * Provides warnings when usage is high to help users avoid rate limits
 */
export const useApiUsage = () => {
  const [apiUsage, setApiUsage] = useState<ApiUsageStats>({
    callCount: 0,
    timeWindow: '0 minutes',
    isHighUsage: false,
  })
  const [isWarningDismissed, setIsWarningDismissed] = useState(false)

  // Track API calls made in the current session
  const trackApiCall = (
    callType: 'matrix' | 'isochrone' | 'geocoding' = 'matrix'
  ) => {
    setApiUsage((prev) => {
      const newCallCount = prev.callCount + 1
      const isHighUsage = newCallCount >= 50 // Frontend threshold (lower than backend)

      return {
        callCount: newCallCount,
        timeWindow: 'this session',
        isHighUsage,
      }
    })

    // Reset warning dismissal when usage becomes high
    if (apiUsage.callCount + 1 >= 50 && !apiUsage.isHighUsage) {
      setIsWarningDismissed(false)
    }
  }

  // Reset usage stats (e.g., when user starts a new session)
  const resetUsage = () => {
    setApiUsage({
      callCount: 0,
      timeWindow: '0 minutes',
      isHighUsage: false,
    })
    setIsWarningDismissed(false)
  }

  // Dismiss the warning
  const dismissWarning = () => {
    setIsWarningDismissed(true)
  }

  // Auto-reset after 1 hour
  useEffect(() => {
    const resetInterval = setInterval(
      () => {
        resetUsage()
      },
      60 * 60 * 1000
    ) // 1 hour

    return () => clearInterval(resetInterval)
  }, [])

  return {
    apiUsage,
    isWarningDismissed,
    trackApiCall,
    resetUsage,
    dismissWarning,
    shouldShowWarning: apiUsage.isHighUsage && !isWarningDismissed,
  }
}
