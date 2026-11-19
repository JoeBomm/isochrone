// Test setup file for Vitest
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

// Mock Cloudflare Workers environment
beforeAll(() => {
  // Set up global mocks for Cloudflare Workers APIs
  global.caches = {
    open: async (name: string) => ({
      match: async (key: string) => null,
      put: async (key: string, response: Response) => {},
      delete: async (key: string) => false,
    }),
  } as any

  // Mock crypto.randomUUID if not available
  if (!global.crypto?.randomUUID) {
    global.crypto = {
      ...global.crypto,
      randomUUID: () => Math.random().toString(36).substring(2, 15),
    } as any
  }
})

// Clean up after each test
afterEach(() => {
  // Reset any test-specific state
})

// Clean up after all tests
afterAll(() => {
  // Clean up global mocks if needed
})
