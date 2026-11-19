import { existsSync } from 'fs'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

describe('Project Structure', () => {
  const projectRoot = join(__dirname, '../..')

  it('should have required configuration files', () => {
    const requiredFiles = [
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'wrangler.toml',
      'miniflare.toml',
      'worker.ts',
    ]

    requiredFiles.forEach((file) => {
      expect(existsSync(join(projectRoot, file))).toBe(true)
    })
  })

  it('should have required source directories', () => {
    const requiredDirs = [
      'src/components',
      'src/pages',
      'src/server',
      'src/lib',
      'src/middleware',
      'migrations',
    ]

    requiredDirs.forEach((dir) => {
      expect(existsSync(join(projectRoot, dir))).toBe(true)
    })
  })

  it('should have required source files', () => {
    const requiredFiles = [
      'src/pages/HomePage.tsx',
      'src/components/LocationInput.tsx',
      'src/components/Map.tsx',
      'src/components/IsochroneControls.tsx',
      'src/server/isochrones.ts',
      'src/server/locations.ts',
      'src/lib/database.ts',
      'src/lib/cache.ts',
      'src/lib/openroute.ts',
      'src/middleware/session.ts',
    ]

    requiredFiles.forEach((file) => {
      expect(existsSync(join(projectRoot, file))).toBe(true)
    })
  })

  it('should have database migration files', () => {
    expect(
      existsSync(join(projectRoot, 'migrations/001_initial_schema.sql'))
    ).toBe(true)
  })
})
