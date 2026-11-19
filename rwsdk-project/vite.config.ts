import { defineConfig } from 'vite'

import { redwoodSDK } from '@redwoodjs/sdk/vite'

export default defineConfig({
  plugins: [
    redwoodSDK({
      ssr: true,
      rsc: true,
      // Enable Cloudflare Workers optimizations
      worker: true,
      // Configure entry point for worker
      entry: './worker.ts',
    }),
  ],
  build: {
    target: 'esnext',
    // Optimize for Cloudflare Workers environment
    minify: 'esbuild',
    sourcemap: false, // Disable sourcemaps for production builds
    rollupOptions: {
      // External dependencies that should not be bundled
      external: ['__STATIC_CONTENT_MANIFEST', 'cloudflare:workers'],
      output: {
        // Ensure proper module format for Cloudflare Workers
        format: 'es',
        entryFileNames: 'worker.js',
        // Optimize chunk splitting for Workers
        manualChunks: undefined,
      },
    },
    // Configure build output directory
    outDir: 'dist',
    emptyOutDir: true,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(
      process.env.NODE_ENV || 'development'
    ),
    // Define global constants for Cloudflare Workers
    'globalThis.process': JSON.stringify({ env: {} }),
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/server',
      '@turf/centroid',
      '@turf/union',
    ],
    // Exclude Cloudflare-specific modules from optimization
    exclude: ['__STATIC_CONTENT_MANIFEST'],
  },
  // Configure server for development
  server: {
    port: 5173,
    host: true,
  },
  // Configure preview server
  preview: {
    port: 4173,
    host: true,
  },
  // Configure environment variables
  envPrefix: ['VITE_', 'OPENROUTE_'],
  // Configure CSS handling
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
  // Configure worker-specific settings
  worker: {
    format: 'es',
    plugins: [],
  },
  // Configure esbuild for better Cloudflare Workers compatibility
  esbuild: {
    target: 'esnext',
    platform: 'neutral',
    // Ensure proper handling of JSX
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
})
