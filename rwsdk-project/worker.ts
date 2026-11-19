import { route } from '@redwoodjs/sdk/router'
import { defineApp } from '@redwoodjs/sdk/worker'

import { corsMiddleware } from './src/middleware/cors'
import { loggingMiddleware } from './src/middleware/logging'
import { sessionMiddleware } from './src/middleware/session'
import HomePage from './src/pages/HomePage'
import { isochroneHandler } from './src/server/isochrones'
import { locationHandler } from './src/server/locations'

// Define the Cloudflare Worker environment
export interface Env {
  DB: D1Database
  CACHE: KVNamespace
  ASSETS?: R2Bucket
  OPENROUTE_SERVICE_API_KEY: string
}

// Application context interface
export interface AppContext {
  session?: Session
  user?: User
  env: Env
  db: D1Database
}

// Session interface
interface Session {
  id: string
  userId?: string
  createdAt: Date
  expiresAt: Date
}

// User interface
interface User {
  id: string
  email: string
  name?: string
  createdAt: Date
}

// Define the RedwoodSDK application with enhanced routing and middleware
export default defineApp<Env>([
  // Global middleware - applied to all routes in order
  loggingMiddleware, // Request logging and performance tracking
  corsMiddleware, // CORS handling for API requests
  sessionMiddleware, // Session and user management

  // Page routes - React Server Components
  route('/', HomePage),

  // API routes - Server Functions with explicit HTTP methods
  route('POST /api/isochrones/optimal', isochroneHandler.findOptimalLocations),
  route('POST /api/isochrones/generate', isochroneHandler.generateIsochrone),
  route('POST /api/locations/geocode', locationHandler.geocodeLocation),

  // Health check endpoint
  route('GET /api/health', async () => {
    return new Response(
      JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: 'production', // This could be dynamic based on env
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      }
    )
  }),

  // API info endpoint
  route('GET /api/info', async () => {
    return new Response(
      JSON.stringify({
        name: 'Isochrone Center Point API',
        version: '1.0.0',
        description:
          'Find optimal meeting locations based on travel time accessibility',
        endpoints: {
          'POST /api/isochrones/optimal': 'Find optimal meeting locations',
          'POST /api/isochrones/generate':
            'Generate isochrone for a specific point',
          'POST /api/locations/geocode': 'Geocode an address to coordinates',
          'GET /api/health': 'Health check endpoint',
          'GET /api/info': 'API information',
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      }
    )
  }),

  // Catch-all for SPA routing and 404 handling
  route('*', async (request) => {
    const url = new URL(request.url)

    // If it's an API route that doesn't exist, return 404
    if (url.pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: `API endpoint ${url.pathname} not found`,
          availableEndpoints: [
            'POST /api/isochrones/optimal',
            'POST /api/isochrones/generate',
            'POST /api/locations/geocode',
            'GET /api/health',
            'GET /api/info',
          ],
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // For other routes, redirect to home page (SPA behavior)
    // This supports client-side routing if needed in the future
    return Response.redirect(new URL('/', request.url).toString(), 302)
  }),
])

// Export types for use in other modules
export type { Env, AppContext, Session, User }
