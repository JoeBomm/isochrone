import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Configure test environment for Cloudflare Workers
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Mock Cloudflare Workers APIs for testing
    env: {
      NODE_ENV: 'test',
    },
  },
  resolve: {
    alias: {
      '~/': new URL('./src/', import.meta.url).pathname,
    },
  },
  define: {
    'process.env.NODE_ENV': '"test"',
    // Mock Cloudflare Workers globals for testing
    'globalThis.process': JSON.stringify({ env: { NODE_ENV: 'test' } }),
  },
  esbuild: {
    target: 'esnext',
    platform: 'node',
  },
})
