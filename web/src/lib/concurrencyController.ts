/**
 * ConcurrencyController manages parallel execution of Promise-based tasks
 * with configurable concurrency limits and queuing.
 */
export class ConcurrencyController {
  private readonly maxConcurrent: number
  private runningTasks: number
  private taskQueue: Array<() => void>

  constructor(maxConcurrent: number = 6) {
    if (maxConcurrent <= 0) {
      throw new Error('maxConcurrent must be greater than 0')
    }
    this.maxConcurrent = maxConcurrent
    this.runningTasks = 0
    this.taskQueue = []
  }

  /**
   * Execute an array of Promise-returning functions with concurrency control.
   * Returns a Promise that resolves when all tasks complete, with results
   * in the same order as the input tasks.
   */
  async execute<T>(
    tasks: (() => Promise<T>)[]
  ): Promise<PromiseSettledResult<T>[]> {
    if (tasks.length === 0) {
      return []
    }

    return new Promise((resolve) => {
      const results: PromiseSettledResult<T>[] = new Array(tasks.length)
      let completedTasks = 0

      const processTask = (taskIndex: number) => {
        const task = tasks[taskIndex]
        this.runningTasks++

        task()
          .then((value) => {
            results[taskIndex] = { status: 'fulfilled', value }
          })
          .catch((reason) => {
            results[taskIndex] = { status: 'rejected', reason }
          })
          .finally(() => {
            this.runningTasks--
            completedTasks++

            // Process next queued task if available
            if (this.taskQueue.length > 0) {
              const nextTask = this.taskQueue.shift()!
              nextTask()
            }

            // Check if all tasks are complete
            if (completedTasks === tasks.length) {
              resolve(results)
            }
          })
      }

      // Start initial batch of tasks up to concurrency limit
      for (let i = 0; i < Math.min(tasks.length, this.maxConcurrent); i++) {
        processTask(i)
      }

      // Queue remaining tasks
      for (let i = this.maxConcurrent; i < tasks.length; i++) {
        const taskIndex = i
        this.taskQueue.push(() => processTask(taskIndex))
      }
    })
  }

  /**
   * Get the current number of running tasks
   */
  get currentlyRunning(): number {
    return this.runningTasks
  }

  /**
   * Get the number of queued tasks waiting to execute
   */
  get queuedTasks(): number {
    return this.taskQueue.length
  }

  /**
   * Get the maximum concurrent tasks allowed
   */
  get maxConcurrentTasks(): number {
    return this.maxConcurrent
  }
}
