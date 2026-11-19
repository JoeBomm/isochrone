import { getRequestInfo } from '@redwoodjs/sdk/worker'

import type { AppContext, Session, User } from '../../worker'

// Session configuration
const SESSION_CONFIG = {
  cookieName: 'isochrone_session',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
}

// Session middleware for handling user sessions
export async function sessionMiddleware(
  request: Request,
  next: () => Promise<Response>
): Promise<Response> {
  const { ctx } = getRequestInfo<AppContext>()

  try {
    // Extract session from cookies
    const cookieHeader = request.headers.get('Cookie')
    const sessionId = extractSessionFromCookies(cookieHeader)

    if (sessionId) {
      // Load session from database or cache
      const session = await loadSession(sessionId, ctx)
      if (session && !isSessionExpired(session)) {
        ctx.session = session

        // Load user if session has userId
        if (session.userId) {
          ctx.user = await loadUser(session.userId, ctx)
        }
      }
    }

    // Execute the next handler
    const response = await next()

    // If a new session was created, set the cookie
    if (ctx.session && !sessionId) {
      setSessionCookie(response, ctx.session.id)
    }

    return response
  } catch (error) {
    console.error('Session middleware error:', error)

    // Clear session on error and continue
    ctx.session = undefined
    ctx.user = undefined

    return next()
  }
}

// Helper function to extract session ID from cookies
function extractSessionFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim())
  const sessionCookie = cookies.find((cookie) =>
    cookie.startsWith(`${SESSION_CONFIG.cookieName}=`)
  )

  return sessionCookie ? sessionCookie.split('=')[1] : null
}

// Helper function to load session from storage
async function loadSession(
  sessionId: string,
  ctx: AppContext
): Promise<Session | null> {
  try {
    // Try to load from cache first (KV storage)
    const cachedSession = await ctx.env.CACHE.get(`session:${sessionId}`)
    if (cachedSession) {
      return JSON.parse(cachedSession)
    }

    // Fallback to database
    const result = await ctx.db
      .prepare(
        `
      SELECT id, user_id, created_at, expires_at
      FROM sessions
      WHERE id = ? AND expires_at > datetime('now')
    `
      )
      .bind(sessionId)
      .first()

    if (result) {
      const session: Session = {
        id: result.id as string,
        userId: result.user_id as string,
        createdAt: new Date(result.created_at as string),
        expiresAt: new Date(result.expires_at as string),
      }

      // Cache the session for faster access
      await ctx.env.CACHE.put(
        `session:${sessionId}`,
        JSON.stringify(session),
        { expirationTtl: 3600 } // 1 hour cache
      )

      return session
    }

    return null
  } catch (error) {
    console.error('Error loading session:', error)
    return null
  }
}

// Helper function to load user from storage
async function loadUser(userId: string, ctx: AppContext): Promise<User | null> {
  try {
    // Try cache first
    const cachedUser = await ctx.env.CACHE.get(`user:${userId}`)
    if (cachedUser) {
      return JSON.parse(cachedUser)
    }

    // Fallback to database
    const result = await ctx.db
      .prepare(
        `
      SELECT id, email, name, created_at
      FROM users
      WHERE id = ?
    `
      )
      .bind(userId)
      .first()

    if (result) {
      const user: User = {
        id: result.id as string,
        email: result.email as string,
        name: result.name as string,
        createdAt: new Date(result.created_at as string),
      }

      // Cache the user
      await ctx.env.CACHE.put(
        `user:${userId}`,
        JSON.stringify(user),
        { expirationTtl: 1800 } // 30 minutes cache
      )

      return user
    }

    return null
  } catch (error) {
    console.error('Error loading user:', error)
    return null
  }
}

// Helper function to check if session is expired
function isSessionExpired(session: Session): boolean {
  return new Date() > session.expiresAt
}

// Helper function to set session cookie
function setSessionCookie(response: Response, sessionId: string): void {
  const expires = new Date(Date.now() + SESSION_CONFIG.maxAge)
  const cookieValue = [
    `${SESSION_CONFIG.cookieName}=${sessionId}`,
    `Max-Age=${SESSION_CONFIG.maxAge / 1000}`,
    `Expires=${expires.toUTCString()}`,
    `Path=/`,
    SESSION_CONFIG.httpOnly ? 'HttpOnly' : '',
    SESSION_CONFIG.secure ? 'Secure' : '',
    `SameSite=${SESSION_CONFIG.sameSite}`,
  ]
    .filter(Boolean)
    .join('; ')

  response.headers.set('Set-Cookie', cookieValue)
}

// Utility function to create a new session (can be used by auth handlers)
export async function createSession(
  userId: string,
  ctx: AppContext
): Promise<Session> {
  const sessionId = crypto.randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_CONFIG.maxAge)

  const session: Session = {
    id: sessionId,
    userId,
    createdAt: now,
    expiresAt,
  }

  // Store in database
  await ctx.db
    .prepare(
      `
    INSERT INTO sessions (id, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `
    )
    .bind(sessionId, userId, now.toISOString(), expiresAt.toISOString())
    .run()

  // Cache the session
  await ctx.env.CACHE.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: 3600,
  })

  return session
}

// Utility function to destroy a session
export async function destroySession(
  sessionId: string,
  ctx: AppContext
): Promise<void> {
  // Remove from database
  await ctx.db
    .prepare(
      `
    DELETE FROM sessions WHERE id = ?
  `
    )
    .bind(sessionId)
    .run()

  // Remove from cache
  await ctx.env.CACHE.delete(`session:${sessionId}`)
}
