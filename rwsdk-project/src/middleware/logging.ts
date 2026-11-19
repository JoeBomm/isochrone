import { getRequestInfo } from '@redwoodjs/sdk/worker'

import type { AppContext } from '../../worker'

// Request logging middleware
export async function loggingMiddleware(
  request: Request,
  next: () => Promise<Response>
): Promise<Response> {
  const startTime = Date.now()
  const { ctx } = getRequestInfo<AppContext>()
  const url = new URL(request.url)

  // Log request start
  console.log(
    `[${new Date().toISOString()}] ${request.method} ${url.pathname}${url.search}`
  )

  try {
    const response = await next()
    const duration = Date.now() - startTime

    // Log successful response
    console.log(
      `[${new Date().toISOString()}] ${request.method} ${url.pathname} - ${response.status} (${duration}ms)`
    )

    // Add performance headers
    response.headers.set('X-Response-Time', `${duration}ms`)
    response.headers.set('X-Request-ID', crypto.randomUUID())

    return response
  } catch (error) {
    const duration = Date.now() - startTime

    // Log error
    console.error(
      `[${new Date().toISOString()}] ${request.method} ${url.pathname} - ERROR (${duration}ms):`,
      error
    )

    // Return error response
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Response-Time': `${duration}ms`,
          'X-Request-ID': crypto.randomUUID(),
        },
      }
    )
  }
}
