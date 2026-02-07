/**
 * WorkerPool - Manages a pool of Web Workers for parallel processing
 *
 * Features:
 * - Automatic worker lifecycle management
 * - Task queuing with priority support
 * - Load balancing across workers
 * - Graceful shutdown and cleanup
 */

import { Logger } from './Logger';

const log = new Logger('WorkerPool');

/**
 * Task data must be a plain object (not null, array, or primitive)
 */
export type WorkerTaskData = Record<string, unknown>;

export interface WorkerTask<T = unknown> {
  id: number;
  data: WorkerTaskData;
  transferables?: Transferable[];
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  priority: number;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

export interface WorkerPoolConfig {
  maxWorkers: number;
  workerFactory: () => Worker;
  onWorkerReady?: (worker: Worker) => void;
  /** Task timeout in milliseconds. Tasks exceeding this time will be rejected. Default: no timeout */
  taskTimeout?: number;
}

interface WorkerState {
  worker: Worker;
  busy: boolean;
  currentTaskId: number | null;
  ready: boolean;
}

// Maximum task ID before wrapping (safe integer range)
const MAX_TASK_ID = Number.MAX_SAFE_INTEGER - 1;

export class WorkerPool<TResult = unknown> {
  private config: WorkerPoolConfig;
  private workers: WorkerState[] = [];
  private taskQueue: WorkerTask<TResult>[] = [];
  private taskIdCounter = 0;
  private pendingTasks: Map<number, WorkerTask<TResult>> = new Map();
  private disposed = false;

  constructor(config: WorkerPoolConfig) {
    this.config = config;
  }

  /**
   * Generate next task ID with overflow protection
   */
  private nextTaskId(): number {
    this.taskIdCounter++;
    if (this.taskIdCounter > MAX_TASK_ID) {
      this.taskIdCounter = 1;
    }
    return this.taskIdCounter;
  }

  /**
   * Initialize the worker pool
   */
  async init(): Promise<void> {
    if (this.disposed) {
      throw new Error('WorkerPool has been disposed');
    }

    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.config.maxWorkers; i++) {
      const worker = this.config.workerFactory();
      const workerState: WorkerState = {
        worker,
        busy: false,
        currentTaskId: null,
        ready: false,
      };

      // Wait for worker ready signal
      const readyPromise = new Promise<void>((resolve) => {
        let resolved = false;
        const onMessage = (event: MessageEvent) => {
          if (event.data?.type === 'ready' && !resolved) {
            resolved = true;
            workerState.ready = true;
            worker.removeEventListener('message', onMessage);
            if (this.config.onWorkerReady) {
              this.config.onWorkerReady(worker);
            }
            resolve();
          }
        };
        worker.addEventListener('message', onMessage);

        // Also resolve if worker doesn't send ready (fallback)
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            log.warn('Worker did not send ready signal within timeout, assuming ready');
            workerState.ready = true;
            worker.removeEventListener('message', onMessage); // Fix memory leak
            resolve();
          }
        }, 1000);
      });

      // Set up message handler for results
      worker.addEventListener('message', (event: MessageEvent) => {
        this.handleWorkerMessage(workerState, event);
      });

      worker.addEventListener('error', (event: ErrorEvent) => {
        this.handleWorkerError(workerState, event);
      });

      this.workers.push(workerState);
      initPromises.push(readyPromise);
    }

    await Promise.all(initPromises);
  }

  /**
   * Submit a task to the pool
   */
  submit(
    data: WorkerTaskData,
    transferables?: Transferable[],
    priority: number = 0
  ): Promise<TResult> {
    if (this.disposed) {
      return Promise.reject(new Error('WorkerPool has been disposed'));
    }

    // Validate that data is a plain object
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return Promise.reject(new Error('Task data must be a plain object'));
    }

    return new Promise((resolve, reject) => {
      const task: WorkerTask<TResult> = {
        id: this.nextTaskId(),
        data,
        transferables,
        resolve,
        reject,
        priority,
      };

      // Insert into queue based on priority (lower = higher priority)
      const insertIndex = this.taskQueue.findIndex(t => t.priority > priority);
      if (insertIndex === -1) {
        this.taskQueue.push(task);
      } else {
        this.taskQueue.splice(insertIndex, 0, task);
      }

      this.processQueue();
    });
  }

  /**
   * Process pending tasks
   */
  private processQueue(): void {
    if (this.disposed) return;

    // Find available workers
    const availableWorkers = this.workers.filter(w => w.ready && !w.busy);

    while (availableWorkers.length > 0 && this.taskQueue.length > 0) {
      const worker = availableWorkers.shift()!;
      const task = this.taskQueue.shift()!;

      this.assignTask(worker, task);
    }
  }

  /**
   * Assign a task to a worker
   */
  private assignTask(workerState: WorkerState, task: WorkerTask<TResult>): void {
    workerState.busy = true;
    workerState.currentTaskId = task.id;
    this.pendingTasks.set(task.id, task);

    // Start task timeout if configured
    if (this.config.taskTimeout && this.config.taskTimeout > 0) {
      task.timeoutHandle = setTimeout(() => {
        this.handleTaskTimeout(workerState, task.id);
      }, this.config.taskTimeout);
    }

    const message = {
      ...task.data,
      id: task.id,
    };

    try {
      if (task.transferables && task.transferables.length > 0) {
        workerState.worker.postMessage(message, task.transferables);
      } else {
        workerState.worker.postMessage(message);
      }
    } catch (error) {
      // Handle errors from postMessage (e.g., detached ArrayBuffer)
      if (task.timeoutHandle) {
        clearTimeout(task.timeoutHandle);
      }
      this.pendingTasks.delete(task.id);
      workerState.busy = false;
      workerState.currentTaskId = null;
      task.reject(error instanceof Error ? error : new Error(String(error)));
      this.processQueue();
    }
  }

  /**
   * Handle task timeout - reject the task and restart the worker
   */
  private handleTaskTimeout(workerState: WorkerState, taskId: number): void {
    const task = this.pendingTasks.get(taskId);
    if (!task) {
      return; // Task already completed
    }

    log.warn(`Task ${taskId} timed out after ${this.config.taskTimeout}ms`);

    this.pendingTasks.delete(taskId);
    workerState.busy = false;
    workerState.currentTaskId = null;

    task.reject(new Error(`Task timed out after ${this.config.taskTimeout}ms`));

    // Restart the worker since it may be hung
    this.restartWorker(workerState);

    // Process next task
    this.processQueue();
  }

  /**
   * Handle message from worker
   */
  private handleWorkerMessage(workerState: WorkerState, event: MessageEvent): void {
    const { type, id } = event.data;

    if (type === 'ready') {
      return; // Handled in init
    }

    const task = this.pendingTasks.get(id);
    if (!task) {
      return;
    }

    // Clear timeout if set
    if (task.timeoutHandle) {
      clearTimeout(task.timeoutHandle);
    }

    this.pendingTasks.delete(id);
    workerState.busy = false;
    workerState.currentTaskId = null;

    if (type === 'result') {
      task.resolve(event.data);
    } else if (type === 'error') {
      const workerError = new Error(event.data.error || 'Worker error');
      // Preserve the original stack trace from the worker if available
      if (event.data.stack) {
        workerError.stack = `Worker Error: ${event.data.error}\n${event.data.stack}`;
      }
      task.reject(workerError);
    }

    // Process next task
    this.processQueue();
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(workerState: WorkerState, event: ErrorEvent): void {
    // Log detailed error information for debugging
    log.error('Worker error:', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });

    const taskId = workerState.currentTaskId;
    if (taskId !== null) {
      const task = this.pendingTasks.get(taskId);
      if (task) {
        // Clear timeout if set
        if (task.timeoutHandle) {
          clearTimeout(task.timeoutHandle);
        }
        this.pendingTasks.delete(taskId);
        // Create error with detailed context
        const errorMessage = event.message || 'Worker error';
        const workerError = new Error(errorMessage);
        // Include original error stack if available, otherwise use file location
        if (event.error?.stack) {
          workerError.stack = event.error.stack;
        } else if (event.filename) {
          workerError.stack = `${errorMessage}\n    at ${event.filename}:${event.lineno}:${event.colno}`;
        }
        task.reject(workerError);
      }
    }

    workerState.busy = false;
    workerState.currentTaskId = null;

    // Attempt to restart the failed worker
    this.restartWorker(workerState);

    // Process next task
    this.processQueue();
  }

  /**
   * Restart a failed worker to restore pool capacity.
   *
   * Note: If restart fails (e.g., worker factory throws), the worker is removed
   * from the pool permanently. This provides graceful degradation - the pool
   * continues operating with reduced capacity rather than failing entirely.
   * Multiple failures will progressively reduce pool size.
   */
  private restartWorker(workerState: WorkerState): void {
    if (this.disposed) return;

    try {
      // Terminate the old worker
      workerState.worker.terminate();

      // Create a new worker
      const newWorker = this.config.workerFactory();
      workerState.worker = newWorker;
      workerState.ready = false;

      // Set up message handler for results
      newWorker.addEventListener('message', (event: MessageEvent) => {
        this.handleWorkerMessage(workerState, event);
      });

      newWorker.addEventListener('error', (event: ErrorEvent) => {
        this.handleWorkerError(workerState, event);
      });

      // Wait for ready signal (with timeout)
      // Use readyHandled flag to prevent race condition between ready message and timeout
      let readyHandled = false;
      const onReadyMessage = (event: MessageEvent) => {
        if (event.data?.type === 'ready' && !readyHandled) {
          readyHandled = true;
          workerState.ready = true;
          newWorker.removeEventListener('message', onReadyMessage);
          if (this.config.onWorkerReady) {
            this.config.onWorkerReady(newWorker);
          }
          // Process queue now that worker is available again
          this.processQueue();
        }
      };
      newWorker.addEventListener('message', onReadyMessage);

      // Fallback timeout
      setTimeout(() => {
        if (!readyHandled && !this.disposed) {
          readyHandled = true;
          workerState.ready = true;
          newWorker.removeEventListener('message', onReadyMessage);
          this.processQueue();
        }
      }, 1000);

      log.info('Worker restarted successfully');
    } catch (error) {
      log.error('Failed to restart worker:', error);
      // Remove the failed worker from the pool
      const index = this.workers.indexOf(workerState);
      if (index !== -1) {
        this.workers.splice(index, 1);
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalWorkers: number;
    busyWorkers: number;
    queuedTasks: number;
    pendingTasks: number;
  } {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      queuedTasks: this.taskQueue.length,
      pendingTasks: this.pendingTasks.size,
    };
  }

  /**
   * Clear all pending tasks
   */
  clearQueue(): void {
    for (const task of this.taskQueue) {
      task.reject(new Error('Task cancelled'));
    }
    this.taskQueue = [];
  }

  /**
   * Dispose the pool and terminate all workers
   */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    // Reject all pending and queued tasks
    for (const task of this.taskQueue) {
      task.reject(new Error('WorkerPool disposed'));
    }
    this.taskQueue = [];

    for (const task of this.pendingTasks.values()) {
      // Clear timeout if set
      if (task.timeoutHandle) {
        clearTimeout(task.timeoutHandle);
      }
      task.reject(new Error('WorkerPool disposed'));
    }
    this.pendingTasks.clear();

    // Terminate all workers
    for (const workerState of this.workers) {
      workerState.worker.terminate();
    }
    this.workers = [];
  }
}
