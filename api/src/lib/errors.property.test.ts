import fc from 'fast-check'
import {
  AppError,
  ErrorCode,
  createApiKeyError,
  createRateLimitError,
  createTimeoutError,
  createGeocodingError,
  createInsufficientLocationsError,
  createTooManyLocationsError,
  createBufferTimeError,
  createNoOverlapError,
  createGeometryError,
  createInvalidCoordinatesError,
  createTravelModeError,
  getUserFriendlyMessage,
  handleResolverError
} from './errors'

/**
 * Property 10: Error Handling Robustness
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
 *
 * Feature: isochrone-center-point, Property 10: Error Handling Robustness
 */

describe('Error Handling Robustness Properties', () => {
  describe('AppError structure consistency', () => {
    it('should maintain consistent structure for all error types', () => {
      fc.assert(fc.property(
        fc.constantFrom(
          ErrorCode.INVALID_API_KEY,
          ErrorCode.API_RATE_LIMIT,
          ErrorCode.API_TIMEOUT,
          ErrorCode.GEOCODING_FAILED,
          ErrorCode.INSUFFICIENT_LOCATIONS,
          ErrorCode.TOO_MANY_LOCATIONS,
          ErrorCode.INVALID_BUFFER_TIME,
          ErrorCode.NO_OVERLAPPING_AREAS,
          ErrorCode.GEOMETRY_CALCULATION_FAILED,
          ErrorCode.INVALID_COORDINATES,
          ErrorCode.INVALID_TRAVEL_MODE
        ),
        (errorCode) => {
          let error: AppError

          // Create error based on type
          switch (errorCode) {
            case ErrorCode.INVALID_API_KEY:
              error = createApiKeyError('test key issue')
              break
            case ErrorCode.API_RATE_LIMIT:
              error = createRateLimitError()
              break
            case ErrorCode.API_TIMEOUT:
              error = createTimeoutError('test operation')
              break
            case ErrorCode.GEOCODING_FAILED:
              error = createGeocodingError('test address')
              break
            case ErrorCode.INSUFFICIENT_LOCATIONS:
              error = createInsufficientLocationsError()
              break
            case ErrorCode.TOO_MANY_LOCATIONS:
              error = createTooManyLocationsError()
              break
            case ErrorCode.INVALID_BUFFER_TIME:
              error = createBufferTimeError(3)
              break
            case ErrorCode.NO_OVERLAPPING_AREAS:
              error = createNoOverlapError()
              break
            case ErrorCode.GEOMETRY_CALCULATION_FAILED:
              error = createGeometryError('test operation')
              break
            case ErrorCode.INVALID_COORDINATES:
              error = createInvalidCoordinatesError({ lat: 91, lng: 181 })
              break
            case ErrorCode.INVALID_TRAVEL_MODE:
              error = createTravelModeError('INVALID_MODE')
              break
            default:
              throw new Error(`Unhandled error code: ${errorCode}`)
          }

          // All errors should have required properties
          expect(error).toBeInstanceOf(AppError)
          expect(error.code).toBe(errorCode)
          expect(typeof error.message).toBe('string')
          expect(error.message.length).toBeGreaterThan(0)
          expect(typeof error.userMessage).toBe('string')
          expect(error.userMessage.length).toBeGreaterThan(0)

          // User message should be different from technical message
          expect(error.userMessage).not.toBe(error.message)

          // User message should be user-friendly (avoid excessive technical jargon)
          // Allow "API" in user messages as it's commonly understood
          expect(error.userMessage).not.toMatch(/HTTP|500|401|429|timeout/i)

          return true
        }
      ))
    })
  })

  describe('Buffer time validation', () => {
    it('should reject invalid buffer times with user-friendly messages', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.integer({ min: -100, max: 4 }), // Below minimum
          fc.integer({ min: 61, max: 200 })  // Above maximum
        ),
        (invalidBufferTime) => {
          const error = createBufferTimeError(invalidBufferTime)

          expect(error.code).toBe(ErrorCode.INVALID_BUFFER_TIME)
          expect(error.userMessage).toContain('5 and 60 minutes')
          expect(error.details?.bufferTime).toBe(invalidBufferTime)
          expect(error.details?.validRange).toBe('5-60 minutes')

          return true
        }
      ))
    })
  })

  describe('Coordinate validation', () => {
    it('should reject invalid coordinates with descriptive messages', () => {
      fc.assert(fc.property(
        fc.record({
          latitude: fc.oneof(
            fc.float({ min: -200, max: Math.fround(-90.1) }),
            fc.float({ min: Math.fround(90.1), max: 200 })
          ),
          longitude: fc.oneof(
            fc.float({ min: -300, max: Math.fround(-180.1) }),
            fc.float({ min: Math.fround(180.1), max: 300 })
          )
        }),
        (invalidCoords) => {
          const error = createInvalidCoordinatesError(invalidCoords)

          expect(error.code).toBe(ErrorCode.INVALID_COORDINATES)
          expect(error.userMessage).toContain('Latitude must be between -90 and 90')
          expect(error.userMessage).toContain('longitude between -180 and 180')
          expect(error.details?.coordinates).toEqual(invalidCoords)

          return true
        }
      ))
    })
  })

  describe('Travel mode validation', () => {
    it('should reject invalid travel modes with valid alternatives', () => {
      fc.assert(fc.property(
        fc.string().filter(s => !['DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'].includes(s)),
        (invalidMode) => {
          const error = createTravelModeError(invalidMode)

          expect(error.code).toBe(ErrorCode.INVALID_TRAVEL_MODE)
          expect(error.userMessage).toContain('driving, cycling, or walking')
          expect(error.details?.mode).toBe(invalidMode)
          expect(error.details?.validModes).toEqual(['DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'])

          return true
        }
      ))
    })
  })

  describe('Address geocoding errors', () => {
    it('should provide helpful suggestions for geocoding failures', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (address) => {
          const error = createGeocodingError(address)

          expect(error.code).toBe(ErrorCode.GEOCODING_FAILED)
          expect(error.userMessage).toContain(address)
          expect(error.userMessage).toContain('coordinates directly')
          expect(error.userMessage).toMatch(/\d+\.\d+,-\d+\.\d+/) // Should contain coordinate example
          expect(error.details?.address).toBe(address)

          return true
        }
      ))
    })
  })

  describe('User-friendly message extraction', () => {
    it('should extract appropriate user messages from various error types', () => {
      fc.assert(fc.property(
        fc.oneof(
          // AppError instances
          fc.constant(createApiKeyError('test')),
          fc.constant(createRateLimitError()),
          fc.constant(createTimeoutError('test')),

          // Regular Error instances with known patterns
          fc.constant(new Error('API key is invalid')),
          fc.constant(new Error('Rate limit exceeded')),
          fc.constant(new Error('Request timeout occurred')),
          fc.constant(new Error('No overlapping areas found')),
          fc.constant(new Error('Union calculation failed')),

          // Generic errors
          fc.constant(new Error('Some unexpected error')),
          fc.constant('String error'),
          fc.constant(null),
          fc.constant(undefined)
        ),
        (error) => {
          const userMessage = getUserFriendlyMessage(error)

          // Should always return a string
          expect(typeof userMessage).toBe('string')
          expect(userMessage.length).toBeGreaterThan(0)

          // Should not contain technical jargon for user-facing messages
          if (error instanceof AppError) {
            expect(userMessage).toBe(error.userMessage)
          }

          return true
        }
      ))
    })
  })

  describe('Resolver error handling', () => {
    it('should handle various error types consistently in resolvers', () => {
      fc.assert(fc.property(
        fc.oneof(
          // Structured errors (should be re-thrown with user message)
          fc.constant(createApiKeyError('test')),
          fc.constant(createRateLimitError()),
          fc.constant(createInsufficientLocationsError()),

          // Regular errors with known patterns
          fc.constant(new Error('API key validation failed')),
          fc.constant(new Error('Rate limit exceeded by client')),
          fc.constant(new Error('Request timeout after 30s')),
          fc.constant(new Error('No overlapping travel areas')),
          fc.constant(new Error('Union operation failed')),

          // Unknown errors
          fc.constant(new Error('Completely unexpected error')),
          fc.constant('String error'),
          fc.constant({ message: 'Object error' })
        ),
        fc.string({ minLength: 1, maxLength: 50 }),
        (error, operation) => {
          expect(() => {
            handleResolverError(error, operation)
          }).toThrow()

          try {
            handleResolverError(error, operation)
          } catch (thrownError) {
            // Should always throw an Error instance
            expect(thrownError).toBeInstanceOf(Error)
            expect(typeof thrownError.message).toBe('string')
            expect(thrownError.message.length).toBeGreaterThan(0)

            // Message should be user-friendly for AppErrors
            if (error instanceof AppError) {
              expect(thrownError.message).toBe(error.userMessage)
            }
          }

          return true
        }
      ))
    })
  })

  describe('Error serialization', () => {
    it('should serialize errors consistently for logging and debugging', () => {
      fc.assert(fc.property(
        fc.constantFrom(
          createApiKeyError('test'),
          createRateLimitError(),
          createGeocodingError('test address'),
          createBufferTimeError(3)
        ),
        (error) => {
          const serialized = error.toJSON()

          expect(serialized).toHaveProperty('code')
          expect(serialized).toHaveProperty('message')
          expect(serialized).toHaveProperty('userMessage')
          expect(serialized.code).toBe(error.code)
          expect(serialized.message).toBe(error.message)
          expect(serialized.userMessage).toBe(error.userMessage)

          // Should be JSON serializable
          expect(() => JSON.stringify(serialized)).not.toThrow()

          return true
        }
      ))
    })
  })
})