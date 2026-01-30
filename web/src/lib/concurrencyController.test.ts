import { ConcurrencyController } from './concurrencyController'

describe('ConcurrencyController', () => {
  it('should create controller with default concurrency limit of 6', () => {
    const controller = new ConcurrencyController()
    expect(controller.maxConcurrentTasks).toBe(6)
  })

  it('should create controller with custom concurrency limit', () => {
    const controller = new ConcurrencyController(3)
    expect(controller.maxConcurrentTasks).toBe(3)
  })

  it('should throw error for invalid concurrency limit', () => {
    expect(() => new ConcurrencyController(0)).toThrow(
      'maxConcurrent must be greater than 0'
    )
    expect(() => new ConcurrencyController(-1)).toThrow(
      'maxConcurrent must be greater than 0'
    )
  })

  it('should execute tasks with concurrency control', async () => {
    const controller = new ConcurrencyController(2)
    const executionOrder: number[] = []
    let concurrentTasks = 0
    let maxConcurrentObserved = 0

    const createTask = (id: number, delay: number) => async () => {
      concurrentTasks++
      maxConcurrentObserved = Math.max(maxConcurrentObserved, concurrentTasks)
      executionOrder.push(id)

      await new Promise((resolve) => setTimeout(resolve, delay))

      concurrentTasks--
      return `task-${id}`
    }

    const tasks = [
      createTask(1, 50),
      createTask(2, 30),
      createTask(3, 40),
      createTask(4, 20),
    ]

    const results = await controller.execute(tasks)

    // All tasks should complete successfully
    expect(results).toHaveLength(4)
    results.forEach((result, index) => {
      expect(result.status).toBe('fulfilled')
      if (result.status === 'fulfilled') {
        expect(result.value).toBe(`task-${index + 1}`)
      }
    })

    // Should not exceed concurrency limit
    expect(maxConcurrentObserved).toBeLessThanOrEqual(2)

    // All tasks should have started
    expect(executionOrder).toHaveLength(4)
  })

  it('should handle task failures without blocking other tasks', async () => {
    const controller = new ConcurrencyController(2)

    const tasks = [
      async () => 'success-1',
      async () => {
        throw new Error('task-2-error')
      },
      async () => 'success-3',
      async () => {
        throw new Error('task-4-error')
      },
    ]

    const results = await controller.execute(tasks)

    expect(results).toHaveLength(4)

    expect(results[0].status).toBe('fulfilled')
    if (results[0].status === 'fulfilled') {
      expect(results[0].value).toBe('success-1')
    }

    expect(results[1].status).toBe('rejected')
    if (results[1].status === 'rejected') {
      expect(results[1].reason.message).toBe('task-2-error')
    }

    expect(results[2].status).toBe('fulfilled')
    if (results[2].status === 'fulfilled') {
      expect(results[2].value).toBe('success-3')
    }

    expect(results[3].status).toBe('rejected')
    if (results[3].status === 'rejected') {
      expect(results[3].reason.message).toBe('task-4-error')
    }
  })

  it('should return empty array for empty task list', async () => {
    const controller = new ConcurrencyController()
    const results = await controller.execute([])
    expect(results).toEqual([])
  })

  it('should track running and queued tasks correctly', async () => {
    const controller = new ConcurrencyController(2)
    let resolveTask1: () => void
    let resolveTask2: () => void
    let resolveTask3: () => void

    const task1 = () =>
      new Promise<string>((resolve) => {
        resolveTask1 = () => resolve('task-1')
      })

    const task2 = () =>
      new Promise<string>((resolve) => {
        resolveTask2 = () => resolve('task-2')
      })

    const task3 = () =>
      new Promise<string>((resolve) => {
        resolveTask3 = () => resolve('task-3')
      })

    const executePromise = controller.execute([task1, task2, task3])

    // Wait a bit for tasks to start
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Should have 2 running tasks and 1 queued
    expect(controller.currentlyRunning).toBe(2)
    expect(controller.queuedTasks).toBe(1)

    // Complete first task
    resolveTask1!()
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Should still have 2 running (task2 + task3 started) and 0 queued
    expect(controller.currentlyRunning).toBe(2)
    expect(controller.queuedTasks).toBe(0)

    // Complete remaining tasks
    resolveTask2!()
    resolveTask3!()

    await executePromise
  })
})
