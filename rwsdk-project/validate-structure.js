#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

// Required files and directories
const requiredFiles = [
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'wrangler.toml',
  'miniflare.toml',
  'worker.ts',
  'README.md',
  '.gitignore',
  '.env.example',
]

const requiredDirs = [
  'src/components',
  'src/pages',
  'src/server',
  'src/lib',
  'src/middleware',
  'src/test',
  'migrations',
]

const requiredSourceFiles = [
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
  'src/test/setup.ts',
  'src/test/project-structure.test.ts',
  'migrations/001_initial_schema.sql',
]

function validateStructure() {
  let errors = []
  let success = []

  // Check required files
  console.log('Checking required files...')
  requiredFiles.forEach((file) => {
    if (fs.existsSync(file)) {
      success.push(`✓ ${file}`)
    } else {
      errors.push(`✗ Missing file: ${file}`)
    }
  })

  // Check required directories
  console.log('Checking required directories...')
  requiredDirs.forEach((dir) => {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      success.push(`✓ ${dir}/`)
    } else {
      errors.push(`✗ Missing directory: ${dir}/`)
    }
  })

  // Check required source files
  console.log('Checking required source files...')
  requiredSourceFiles.forEach((file) => {
    if (fs.existsSync(file)) {
      success.push(`✓ ${file}`)
    } else {
      errors.push(`✗ Missing source file: ${file}`)
    }
  })

  // Report results
  console.log('\n=== VALIDATION RESULTS ===')
  console.log(`✓ Success: ${success.length} items`)
  console.log(`✗ Errors: ${errors.length} items`)

  if (success.length > 0) {
    console.log('\nSuccessful items:')
    success.forEach((item) => console.log(`  ${item}`))
  }

  if (errors.length > 0) {
    console.log('\nErrors:')
    errors.forEach((error) => console.log(`  ${error}`))
    process.exit(1)
  } else {
    console.log('\n🎉 All required files and directories are present!')
    console.log('RedwoodSDK project structure initialized successfully.')
  }
}

validateStructure()
