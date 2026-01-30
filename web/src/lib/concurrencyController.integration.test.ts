import { ConcurrencyController } from './concurrencyController'

describe('ConcurrencyController Integration', () => {
  it('should handle realistic geocoding-like tasks', async () => {
    const controller = new ConcurrencyController(6)

    // Simulate geocoding tasks with varying response times
    const addresses = [
      '123 Main St',
      '456 Oak Ave',
      '789 Pine Rd',
      '321 Elm St',
      '654 Maple Dr',
      '987 Cedar Ln',
      '147 Birch Way',
      '258 Spruce Ct',
    ]

    const geocodingTasks = addresses.map((address, index) => async () => {
      // Simulate network delay
      const delay = Math.random() * 100 + 50 // 50-150ms
      await new Promise((resolve) => setTimeout(resolve, delay))

      // Simulate occasional failures
      if (index === 3) {
        throw new Error(`Geocoding failed for ${address}`)
      }

      return {
        address,
        latitude: 40.7128 + (Math.random() - 0.5) * 0.1,
        longitude: -74.006 + (Math.random() - 0.5) * 0.1,
      }
    })

    const startTime = Date.now()
    const results = await controller.execute(geocodingTasks)
    const endTime = Date.now()

    // Should complete in reasonable time (parallel execution)
    expect(endTime - startTime).toBeLessThan(500) // Should be much faster than sequential

    // Should have results for all tasks
    expect(results).toHaveLength(8)

    // Check successful results
    const successful = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r) => r.status === 'rejected')

    expect(successful).toHaveLength(7) // All except index 3
    expect(failed).toHaveLength(1) // Only index 3 should fail

    // Verify successful results have expected structure
    successful.forEach((result) => {
      if (result.status === 'fulfilled') {
        expect(result.value).toHaveProperty('address')
        expect(result.value).toHaveProperty('latitude')
        expect(result.value).toHaveProperty('longitude')
        expect(typeof result.value.latitude).toBe('number')
        expect(typeof result.value.longitude).toBe('number')
      }
    })

    // Verify failed result
    expect(failed[0].status).toBe('rejected')
    if (failed[0].status === 'rejected') {
      expect(failed[0].reason.message).toContain(
        'Geocoding failed for 321 Elm St'
      )
    }
  })

  it('should respect concurrency limits with many tasks', async () => {
    const controller = new ConcurrencyController(3)
    let maxConcurrent = 0
    let currentConcurrent = 0

    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)

      await new Promise((resolve) => setTimeout(resolve, 50))

      currentConcurrent--
      return `result-${i}`
    })

    await controller.execute(tasks)

    // Should never exceed the concurrency limit
    expect(maxConcurrent).toBeLessThanOrEqual(3)
    expect(maxConcurrent).toBeGreaterThan(1) // Should use parallelism
  })
})
