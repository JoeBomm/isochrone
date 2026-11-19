/**
 * Create error for insufficient locations
 */
export function createInsufficientLocationsError(): Error {
  const error = new Error(
    'At least 2 locations are required for optimal location calculation'
  )
  ;(error as any).statusCode = 400
  return error
}

/**
 * Create error for too many locations
 */
export function createTooManyLocationsError(): Error {
  const error = new Error(
    'Maximum 12 locations allowed for optimal location calculation'
  )
  ;(error as any).statusCode = 400
  return error
}

/**
 * Create error for invalid buffer time
 */
export function createBufferTimeError(bufferTime: number): Error {
  const error = new Error(
    `Invalid buffer time: ${bufferTime} minutes. Must be between 5 and 60 minutes`
  )
  ;(error as any).statusCode = 400
  return error
}

/**
 * Create error for invalid travel mode
 */
export function createTravelModeError(travelMode: string): Error {
  const error = new Error(
    `Invalid travel mode: ${travelMode}. Must be DRIVING_CAR, CYCLING_REGULAR, or FOOT_WALKING`
  )
  ;(error as any).statusCode = 400
  return error
}

/**
 * Create error for deduplication failures
 */
export function createDeduplicationError(
  message: string,
  cause?: Error
): Error {
  const error = new Error(message)
  ;(error as any).statusCode = 500
  if (cause) {
    error.cause = cause
  }
  return error
}

/**
 * Create error for validation failures
 */
export function createValidationError(message: string): Error {
  const error = new Error(message)
  ;(error as any).statusCode = 400
  return error
}

/**
 * Create error for rate limiting
 */
export function createRateLimitError(message: string): Error {
  const error = new Error(message)
  ;(error as any).statusCode = 429
  return error
}

/**
 * Create error for authentication failures
 */
export function createAuthenticationError(message: string): Error {
  const error = new Error(message)
  ;(error as any).statusCode = 401
  return error
}

/**
 * Create error for service unavailable
 */
export function createServiceUnavailableError(message: string): Error {
  const error = new Error(message)
  ;(error as any).statusCode = 503
  return error
}

/**
 * Create error for timeout
 */
export function createTimeoutError(message: string): Error {
  const error = new Error(message)
  ;(error as any).statusCode = 408
  return error
}

/**
 * Create error for not found
 */
export function createNotFoundError(message: string): Error {
  const error = new Error(message)
  ;(error as any).statusCode = 404
  return error
}

/**
 * Get HTTP status code from error
 */
export function getErrorStatusCode(error: Error): number {
  // Check for explicit status code
  if ((error as any).statusCode) {
    return (error as any).statusCode
  }

  // Infer status code from error message
  const message = error.message.toLowerCase()

  if (
    message.includes('invalid') ||
    message.includes('must be') ||
    message.includes('required') ||
    message.includes('between') ||
    message.includes('format')
  ) {
    return 400 // Bad Request
  }

  if (
    message.includes('authentication') ||
    message.includes('api key') ||
    message.includes('unauthorized')
  ) {
    return 401 // Unauthorized
  }

  if (
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('too many')
  ) {
    return 429 // Too Many Requests
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return 408 // Request Timeout
  }

  if (
    message.includes('not found') ||
    message.includes('no results') ||
    message.includes('no routes')
  ) {
    return 404 // Not Found
  }

  if (
    message.includes('service') ||
    message.includes('unavailable') ||
    message.includes('server error')
  ) {
    return 503 // Service Unavailable
  }

  // Default to 500 for unknown errors
  return 500 // Internal Server Error
}

/**
 * Handle resolver errors with appropriate HTTP status codes
 */
export function handleResolverError(error: Error, context: string): never {
  console.error(`${context} error:`, error)

  // Enhance error with status code if not already present
  if (!(error as any).statusCode) {
    ;(error as any).statusCode = getErrorStatusCode(error)
  }

  throw error
}

/**
 * Create HTTP response from error
 */
export function createErrorResponse(error: Error): Response {
  const statusCode = getErrorStatusCode(error)

  const errorResponse = {
    error: error.message,
    statusCode,
    timestamp: new Date().toISOString(),
  }

  return new Response(JSON.stringify(errorResponse), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json' },
  })
}
