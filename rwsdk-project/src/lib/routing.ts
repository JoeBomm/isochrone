// Routing utilities for RedwoodSDK application

// Route path constants
export const ROUTES = {
  HOME: '/',
  API: {
    HEALTH: '/api/health',
    INFO: '/api/info',
    ISOCHRONES: {
      OPTIMAL: '/api/isochrones/optimal',
      GENERATE: '/api/isochrones/generate',
    },
    LOCATIONS: {
      GEOCODE: '/api/locations/geocode',
    },
  },
} as const

// Route validation utilities
export function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

export function isHealthRoute(pathname: string): boolean {
  return pathname === ROUTES.API.HEALTH
}

export function isIsochroneRoute(pathname: string): boolean {
  return pathname.startsWith('/api/isochrones/')
}

export function isLocationRoute(pathname: string): boolean {
  return pathname.startsWith('/api/locations/')
}

// URL building utilities
export function buildApiUrl(baseUrl: string, endpoint: string): string {
  return new URL(endpoint, baseUrl).toString()
}

// Request validation utilities
export function validateHttpMethod(
  request: Request,
  allowedMethods: string[]
): boolean {
  return allowedMethods.includes(request.method.toUpperCase())
}

// Response utilities
export function createJsonResponse(
  data: any,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

export function createErrorResponse(
  message: string,
  status: number = 400,
  details?: any
): Response {
  return createJsonResponse(
    {
      error: getErrorName(status),
      message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
    },
    status
  )
}

// Error name mapping
function getErrorName(status: number): string {
  switch (status) {
    case 400:
      return 'Bad Request'
    case 401:
      return 'Unauthorized'
    case 403:
      return 'Forbidden'
    case 404:
      return 'Not Found'
    case 405:
      return 'Method Not Allowed'
    case 429:
      return 'Too Many Requests'
    case 500:
      return 'Internal Server Error'
    case 502:
      return 'Bad Gateway'
    case 503:
      return 'Service Unavailable'
    default:
      return 'Error'
  }
}

// Route parameter extraction utilities
export function extractRouteParams(
  pathname: string,
  pattern: string
): Record<string, string> {
  const params: Record<string, string> = {}
  const patternParts = pattern.split('/')
  const pathParts = pathname.split('/')

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]
    const pathPart = pathParts[i]

    if (patternPart?.startsWith(':')) {
      const paramName = patternPart.slice(1)
      params[paramName] = pathPart || ''
    }
  }

  return params
}

// Query parameter utilities
export function getQueryParams(request: Request): URLSearchParams {
  const url = new URL(request.url)
  return url.searchParams
}

export function getQueryParam(request: Request, name: string): string | null {
  return getQueryParams(request).get(name)
}

// Request body utilities
export async function parseJsonBody<T = any>(request: Request): Promise<T> {
  try {
    const text = await request.text()
    if (!text) {
      throw new Error('Request body is empty')
    }
    return JSON.parse(text)
  } catch (error) {
    throw new Error(
      `Invalid JSON in request body: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

// Content type validation
export function validateContentType(
  request: Request,
  expectedType: string
): boolean {
  const contentType = request.headers.get('Content-Type')
  return contentType?.includes(expectedType) ?? false
}

// Rate limiting utilities (basic implementation)
export class RateLimiter {
  private requests = new Map<string, number[]>()

  constructor(
    private maxRequests: number = 100,
    private windowMs: number = 60000 // 1 minute
  ) {}

  isAllowed(identifier: string): boolean {
    const now = Date.now()
    const windowStart = now - this.windowMs

    // Get existing requests for this identifier
    const requests = this.requests.get(identifier) || []

    // Filter out old requests
    const recentRequests = requests.filter((time) => time > windowStart)

    // Check if under limit
    if (recentRequests.length >= this.maxRequests) {
      return false
    }

    // Add current request
    recentRequests.push(now)
    this.requests.set(identifier, recentRequests)

    return true
  }

  getRemainingRequests(identifier: string): number {
    const now = Date.now()
    const windowStart = now - this.windowMs
    const requests = this.requests.get(identifier) || []
    const recentRequests = requests.filter((time) => time > windowStart)

    return Math.max(0, this.maxRequests - recentRequests.length)
  }

  getResetTime(identifier: string): number {
    const requests = this.requests.get(identifier) || []
    if (requests.length === 0) return Date.now()

    const oldestRequest = Math.min(...requests)
    return oldestRequest + this.windowMs
  }
}
