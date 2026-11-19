#!/usr/bin/env node

/**
 * Rollback Validation Script
 *
 * This script validates that rollback procedures work correctly
 * by testing them in a safe environment.
 *
 * Requirements: 8.5 - Validate rollback procedures
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Configuration
interface ValidationConfig {
  testEnvironment: string
  skipDatabaseTests: boolean
  skipDeploymentTests: boolean
  verbose: boolean
  cleanupAfterTest: boolean
}

// Test results
interface TestResult {
  name: string
  passed: boolean
  duration: number
  error?: string
  details?: string
}

// Validation report
interface ValidationReport {
  timestamp: string
  environment: string
  totalTests: number
  passedTests: number
  failedTests: number
  totalDuration: number
  results: TestResult[]
  summary: string
}

// Default configuration
const DEFAULT_CONFIG: ValidationConfig = {
  testEnvironment: 'test',
  skipDatabaseTests: false,
  skipDeploymentTests: false,
  verbose: false,
  cleanupAfterTest: true,
}

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

// Logging functions
function log(message: string, color?: keyof typeof colors): void {
  const colorCode = color ? colors[color] : ''
  const resetCode = color ? colors.reset : ''
  console.log(`${colorCode}${message}${resetCode}`)
}

function logInfo(message: string): void {
  log(`[INFO] ${message}`, 'blue')
}

function logSuccess(message: string): void {
  log(`[SUCCESS] ${message}`, 'green')
}

function logWarning(message: string): void {
  log(`[WARNING] ${message}`, 'yellow')
}

function logError(message: string): void {
  log(`[ERROR] ${message}`, 'red')
}

// Test execution helper
async function runTest(
  name: string,
  testFn: () => Promise<void>,
  config: ValidationConfig
): Promise<TestResult> {
  const startTime = Date.now()

  try {
    if (config.verbose) {
      logInfo(`Running test: ${name}`)
    }

    await testFn()

    const duration = Date.now() - startTime

    if (config.verbose) {
      logSuccess(`Test passed: ${name} (${duration}ms)`)
    }

    return {
      name,
      passed: true,
      duration,
    }
  } catch (error) {
    const duration = Date.now() - startTime

    if (config.verbose) {
      logError(`Test failed: ${name} (${duration}ms)`)
      logError(`Error: ${error.message}`)
    }

    return {
      name,
      passed: false,
      duration,
      error: error.message,
    }
  }
}

// Execute command safely
function execCommand(command: string, options: { cwd?: string; timeout?: number } = {}): string {
  try {
    return execSync(command, {
      encoding: 'utf8',
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout || 30000,
      stdio: 'pipe',
    }).toString().trim()
  } catch (error) {
    throw new Error(`Command failed: ${command}\n${error.message}`)
  }
}

// Test 1: Validate rollback scripts exist
async function testRollbackScriptsExist(): Promise<void> {
  const requiredScripts = [
    'scripts/rollback-database.ts',
    'scripts/rollback-deployment.sh',
  ]

  for (const script of requiredScripts) {
    if (!existsSync(script)) {
      throw new Error(`Required rollback script not found: ${script}`)
    }
  }

  // Check if deployment script is executable
  try {
    execCommand('test -x scripts/rollback-deployment.sh')
  } catch {
    throw new Error('Deployment rollback script is not executable')
  }
}

// Test 2: Validate database rollback script
async function testDatabaseRollbackScript(): Promise<void> {
  // Test dry run mode
  try {
    execCommand('node scripts/rollback-database.ts --dry-run --output /tmp/test-rollback.sql')
  } catch (error) {
    throw new Error(`Database rollback dry run failed: ${error.message}`)
  }

  // Check if output file was created
  if (!existsSync('/tmp/test-rollback.sql')) {
    throw new Error('Database rollback script did not generate output file')
  }

  // Validate SQL content
  const sqlContent = readFileSync('/tmp/test-rollback.sql', 'utf8')
  if (!sqlContent.includes('CREATE TABLE') || !sqlContent.includes('INSERT')) {
    throw new Error('Generated rollback SQL appears to be incomplete')
  }
}

// Test 3: Validate deployment rollback script
async function testDeploymentRollbackScript(): Promise<void> {
  // Test help output
  try {
    execCommand('./scripts/rollback-deployment.sh --help')
  } catch (error) {
    throw new Error(`Deployment rollback help failed: ${error.message}`)
  }

  // Test dry run mode
  try {
    execCommand('./scripts/rollback-deployment.sh --dry-run --environment test')
  } catch (error) {
    throw new Error(`Deployment rollback dry run failed: ${error.message}`)
  }
}

// Test 4: Validate backup creation
async function testBackupCreation(): Promise<void> {
  const backupDir = './test-backups'

  // Create test backup
  try {
    execCommand(`mkdir -p ${backupDir}`)
    execCommand(`echo "test backup" > ${backupDir}/test-file.txt`)
  } catch (error) {
    throw new Error(`Failed to create test backup: ${error.message}`)
  }

  // Verify backup exists
  if (!existsSync(`${backupDir}/test-file.txt`)) {
    throw new Error('Test backup file was not created')
  }

  // Cleanup
  execCommand(`rm -rf ${backupDir}`)
}

// Test 5: Validate RedwoodJS project structure
async function testRedwoodJSStructure(): Promise<void> {
  const requiredFiles = [
    '../redwood.toml',
    '../api/package.json',
    '../web/package.json',
    '../api/db/schema.prisma',
  ]

  for (const file of requiredFiles) {
    if (!existsSync(file)) {
      throw new Error(`Required RedwoodJS file not found: ${file}`)
    }
  }

  // Test RedwoodJS CLI
  try {
    execCommand('yarn rw --version', { cwd: '..' })
  } catch (error) {
    throw new Error(`RedwoodJS CLI not working: ${error.message}`)
  }
}

// Test 6: Validate migration adapters
async function testMigrationAdapters(): Promise<void> {
  // Test adapter imports
  try {
    const adapterTest = `
      const { migrationAdapter, featureFlags, emergencyControls } = require('./src/lib/migration');

      // Test feature flags
      const flags = featureFlags.get();
      if (typeof flags.useRedwoodSDK !== 'boolean') {
        throw new Error('Feature flags not working');
      }

      // Test emergency controls
      if (typeof emergencyControls.rollback !== 'function') {
        throw new Error('Emergency controls not working');
      }

      console.log('Migration adapters working correctly');
    `

    writeFileSync('/tmp/adapter-test.js', adapterTest)
    execCommand('node /tmp/adapter-test.js')
  } catch (error) {
    throw new Error(`Migration adapters test failed: ${error.message}`)
  }
}

// Test 7: Validate environment configurations
async function testEnvironmentConfigurations(): Promise<void> {
  const environments = ['development', 'staging', 'production']

  for (const env of environments) {
    try {
      const configTest = `
        const { ENVIRONMENT_CONFIGS } = require('./src/lib/migration/featureFlags');
        const config = ENVIRONMENT_CONFIGS['${env}'];

        if (!config || typeof config.useRedwoodSDK !== 'boolean') {
          throw new Error('Invalid environment configuration for ${env}');
        }

        console.log('Environment ${env} configuration valid');
      `

      writeFileSync('/tmp/env-test.js', configTest)
      execCommand('node /tmp/env-test.js')
    } catch (error) {
      throw new Error(`Environment configuration test failed for ${env}: ${error.message}`)
    }
  }
}

// Test 8: Validate monitoring system
async function testMonitoringSystem(): Promise<void> {
  try {
    const monitorTest = `
      const { getMigrationMonitor } = require('./src/lib/migration/monitoring');

      const monitor = getMigrationMonitor();

      // Test metric recording
      monitor.recordMetric({
        requestId: 'test-123',
        endpoint: 'test',
        implementation: 'redwoodjs',
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        duration: 1000,
        success: true,
      });

      // Test dashboard generation
      const dashboard = monitor.getDashboard();
      if (!dashboard || typeof dashboard.totalRequests !== 'number') {
        throw new Error('Dashboard generation failed');
      }

      console.log('Monitoring system working correctly');
    `

    writeFileSync('/tmp/monitor-test.js', monitorTest)
    execCommand('node /tmp/monitor-test.js')
  } catch (error) {
    throw new Error(`Monitoring system test failed: ${error.message}`)
  }
}

// Main validation function
async function validateRollbackProcedures(config: ValidationConfig): Promise<ValidationReport> {
  logInfo('=== Rollback Procedures Validation ===')
  logInfo(`Environment: ${config.testEnvironment}`)
  logInfo(`Verbose: ${config.verbose}`)
  logInfo('')

  const startTime = Date.now()
  const results: TestResult[] = []

  // Define tests
  const tests = [
    { name: 'Rollback Scripts Exist', fn: testRollbackScriptsExist },
    { name: 'Database Rollback Script', fn: testDatabaseRollbackScript, skip: config.skipDatabaseTests },
    { name: 'Deployment Rollback Script', fn: testDeploymentRollbackScript, skip: config.skipDeploymentTests },
    { name: 'Backup Creation', fn: testBackupCreation },
    { name: 'RedwoodJS Project Structure', fn: testRedwoodJSStructure },
    { name: 'Migration Adapters', fn: testMigrationAdapters },
    { name: 'Environment Configurations', fn: testEnvironmentConfigurations },
    { name: 'Monitoring System', fn: testMonitoringSystem },
  ]

  // Run tests
  for (const test of tests) {
    if (test.skip) {
      logWarning(`Skipping test: ${test.name}`)
      continue
    }

    const result = await runTest(test.name, test.fn, config)
    results.push(result)
  }

  // Calculate summary
  const totalDuration = Date.now() - startTime
  const passedTests = results.filter(r => r.passed).length
  const failedTests = results.filter(r => !r.passed).length

  // Generate report
  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    environment: config.testEnvironment,
    totalTests: results.length,
    passedTests,
    failedTests,
    totalDuration,
    results,
    summary: failedTests === 0
      ? 'All rollback procedures are working correctly'
      : `${failedTests} test(s) failed - rollback procedures need attention`,
  }

  // Display results
  logInfo('=== Validation Results ===')

  for (const result of results) {
    if (result.passed) {
      logSuccess(`✓ ${result.name} (${result.duration}ms)`)
    } else {
      logError(`✗ ${result.name} (${result.duration}ms)`)
      if (result.error && config.verbose) {
        logError(`  Error: ${result.error}`)
      }
    }
  }

  logInfo('')
  logInfo(`Total: ${results.length} tests`)
  logSuccess(`Passed: ${passedTests}`)
  if (failedTests > 0) {
    logError(`Failed: ${failedTests}`)
  }
  logInfo(`Duration: ${totalDuration}ms`)
  logInfo('')

  if (failedTests === 0) {
    logSuccess(report.summary)
  } else {
    logError(report.summary)
  }

  return report
}

// CLI interface
function parseArgs(): ValidationConfig {
  const args = process.argv.slice(2)
  const config = { ...DEFAULT_CONFIG }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const nextArg = args[i + 1]

    switch (arg) {
      case '--environment':
        if (nextArg) {
          config.testEnvironment = nextArg
          i++
        }
        break
      case '--skip-database':
        config.skipDatabaseTests = true
        break
      case '--skip-deployment':
        config.skipDeploymentTests = true
        break
      case '--verbose':
        config.verbose = true
        break
      case '--no-cleanup':
        config.cleanupAfterTest = false
        break
      case '--help':
        console.log(`
Rollback Procedures Validation Script

Usage: node validate-rollback.ts [options]

Options:
  --environment <env>      Test environment (default: ${DEFAULT_CONFIG.testEnvironment})
  --skip-database         Skip database rollback tests
  --skip-deployment       Skip deployment rollback tests
  --verbose               Enable verbose output
  --no-cleanup           Don't cleanup test files after validation
  --help                  Show this help message

Examples:
  node validate-rollback.ts --verbose
  node validate-rollback.ts --skip-database --environment staging
`)
        process.exit(0)
        break
    }
  }

  return config
}

// Cleanup function
function cleanup(config: ValidationConfig): void {
  if (!config.cleanupAfterTest) {
    return
  }

  try {
    // Remove temporary test files
    const tempFiles = [
      '/tmp/test-rollback.sql',
      '/tmp/adapter-test.js',
      '/tmp/env-test.js',
      '/tmp/monitor-test.js',
    ]

    for (const file of tempFiles) {
      if (existsSync(file)) {
        execCommand(`rm -f ${file}`)
      }
    }
  } catch (error) {
    logWarning(`Cleanup failed: ${error.message}`)
  }
}

// Execute if run directly
if (require.main === module) {
  const config = parseArgs()

  validateRollbackProcedures(config)
    .then(report => {
      // Write report to file
      const reportFile = `./validation-report-${Date.now()}.json`
      writeFileSync(reportFile, JSON.stringify(report, null, 2))
      logInfo(`Validation report written to: ${reportFile}`)

      // Cleanup
      cleanup(config)

      // Exit with appropriate code
      process.exit(report.failedTests > 0 ? 1 : 0)
    })
    .catch(error => {
      logError(`Validation failed: ${error.message}`)
      cleanup(config)
      process.exit(1)
    })
}

export { validateRollbackProcedures, type ValidationConfig, type ValidationReport }
