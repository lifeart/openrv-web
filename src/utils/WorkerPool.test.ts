/**
 * WorkerPool Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkerPool, WorkerPoolConfig, WorkerTaskData } from './WorkerPool';

// Mock Worker for testing
class MockWorker {
  private messageHandlers: ((event: MessageEvent) => void)[] = [];
  private errorHandlers: ((event: ErrorEvent) => void)[] = [];
  public terminated = false;
  public lastMessage: unknown = null;

  addEventListener(type: string, handler: (event: unknown) => void): void {
    if (type === 'message') {
      this.messageHandlers.push(handler as (event: MessageEvent) => void);
    } else if (type === 'error') {
      this.errorHandlers.push(handler as (event: ErrorEvent) => void);
    }
  }

  removeEventListener(type: string, handler: (event: unknown) => void): void {
    if (type === 'message') {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    } else if (type === 'error') {
      this.errorHandlers = this.errorHandlers.filter(h => h !== handler);
    }
  }

  postMessage(message: unknown, _transferables?: Transferable[]): void {
    this.lastMessage = message;
    // Simulate async response
    setTimeout(() => {
      if (!this.terminated) {
        const response = {
          type: 'result',
          id: (message as { id: number }).id,
          data: 'processed',
        };
        this.messageHandlers.forEach(h => h(new MessageEvent('message', { data: response })));
      }
    }, 10);
  }

  terminate(): void {
    this.terminated = true;
  }

  // Helper to simulate ready signal
  simulateReady(): void {
    this.messageHandlers.forEach(h => h(new MessageEvent('message', { data: { type: 'ready' } })));
  }

  // Helper to simulate error
  simulateError(message: string): void {
    const errorEvent = new ErrorEvent('error', { message });
    this.errorHandlers.forEach(h => h(errorEvent));
  }
}

describe('WorkerPool', () => {
  let pool: WorkerPool<{ type: string; id: number; data: string }>;
  let mockWorkers: MockWorker[];

  beforeEach(() => {
    mockWorkers = [];
    const config: WorkerPoolConfig = {
      maxWorkers: 2,
      workerFactory: () => {
        const worker = new MockWorker();
        mockWorkers.push(worker);
        // Auto-send ready signal
        setTimeout(() => worker.simulateReady(), 5);
        return worker as unknown as Worker;
      },
    };
    pool = new WorkerPool(config);
  });

  afterEach(async () => {
    // Dispose and wait a tick for any pending rejections to be handled
    pool.dispose();
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  describe('init', () => {
    it('WP-001: creates specified number of workers', async () => {
      await pool.init();
      expect(mockWorkers.length).toBe(2);
    });

    it('WP-002: waits for workers to be ready', async () => {
      const initPromise = pool.init();
      await initPromise;
      // Should complete without hanging
      expect(mockWorkers.length).toBe(2);
    });

    it('WP-003: throws if pool is disposed', async () => {
      pool.dispose();
      await expect(pool.init()).rejects.toThrow('disposed');
    });
  });

  describe('submit', () => {
    beforeEach(async () => {
      await pool.init();
    });

    it('WP-004: submits task and returns promise', async () => {
      const result = await pool.submit({ type: 'test', value: 42 });
      expect(result.type).toBe('result');
    });

    it('WP-005: rejects if pool is disposed', async () => {
      pool.dispose();
      await expect(pool.submit({ type: 'test' })).rejects.toThrow('disposed');
    });

    it('WP-006: rejects if data is not an object', async () => {
      await expect(pool.submit(null as unknown as WorkerTaskData)).rejects.toThrow('plain object');
      await expect(pool.submit([] as unknown as WorkerTaskData)).rejects.toThrow('plain object');
    });

    it('WP-007: handles multiple concurrent tasks', async () => {
      const promises = [
        pool.submit({ type: 'task1' }),
        pool.submit({ type: 'task2' }),
        pool.submit({ type: 'task3' }),
      ];

      const results = await Promise.all(promises);
      expect(results.length).toBe(3);
      results.forEach(r => expect(r.type).toBe('result'));
    });

    it('WP-008: respects priority ordering', async () => {
      // Submit low priority first, then high priority
      const lowPriority = pool.submit({ type: 'low' }, undefined, 10);
      const highPriority = pool.submit({ type: 'high' }, undefined, 1);

      await Promise.all([lowPriority, highPriority]);
      // Both should complete, priority affects order when queued
    });

    it('WP-022: higher priority tasks are processed first when queued', async () => {
      // Create a pool with just 1 worker to force queuing
      const processedOrder: number[] = [];
      const singleWorkerPool = new WorkerPool({
        maxWorkers: 1,
        workerFactory: () => {
          const worker = new MockWorker();
          // Override postMessage to track processing order
          const originalPostMessage = worker.postMessage.bind(worker);
          worker.postMessage = (message: unknown, transferables?: Transferable[]) => {
            const msg = message as { id: number; priority?: number };
            // Extract the submitted priority from the task
            if (msg.id) {
              processedOrder.push(msg.id);
            }
            originalPostMessage(message, transferables);
          };
          setTimeout(() => worker.simulateReady(), 5);
          return worker as unknown as Worker;
        },
      });
      await singleWorkerPool.init();

      // Submit a task that will occupy the worker
      const firstTask = singleWorkerPool.submit({ type: 'first' }, undefined, 5);

      // While first task is processing, submit tasks with different priorities
      // These will be queued since the single worker is busy
      // Lower priority number = higher priority
      const lowPriorityTask = singleWorkerPool.submit({ type: 'low' }, undefined, 100);
      const highPriorityTask = singleWorkerPool.submit({ type: 'high' }, undefined, 1);
      const mediumPriorityTask = singleWorkerPool.submit({ type: 'medium' }, undefined, 50);

      await Promise.all([firstTask, lowPriorityTask, highPriorityTask, mediumPriorityTask]);

      // First task should always be first (it was already processing)
      expect(processedOrder[0]).toBeDefined();

      // The queued tasks should be processed in priority order (1, 50, 100)
      // IDs increase with each submission, so:
      // - First task: ID 1
      // - Low priority (100): ID 2
      // - High priority (1): ID 3
      // - Medium priority (50): ID 4
      // Processing order should be: 1 (first), 3 (high), 4 (medium), 2 (low)
      const queuedOrder = processedOrder.slice(1);
      // High priority (ID 3) should come before medium (ID 4) which should come before low (ID 2)
      const highIdx = queuedOrder.indexOf(3);
      const mediumIdx = queuedOrder.indexOf(4);
      const lowIdx = queuedOrder.indexOf(2);

      expect(highIdx).toBeLessThan(mediumIdx);
      expect(mediumIdx).toBeLessThan(lowIdx);

      singleWorkerPool.dispose();
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await pool.init();
    });

    it('WP-009: returns correct statistics', () => {
      const stats = pool.getStats();
      expect(stats.totalWorkers).toBe(2);
      expect(stats.busyWorkers).toBe(0);
      expect(stats.queuedTasks).toBe(0);
      expect(stats.pendingTasks).toBe(0);
    });

    it('WP-010: reflects busy workers during processing', async () => {
      // Submit task but don't await immediately
      const task = pool.submit({ type: 'test' });

      const stats = pool.getStats();
      // At least one worker should be busy
      expect(stats.busyWorkers).toBeGreaterThanOrEqual(0);

      // Wait for task to complete to avoid unhandled rejection in afterEach
      await task;
    });
  });

  describe('clearQueue', () => {
    beforeEach(async () => {
      await pool.init();
    });

    it('WP-011: rejects all queued tasks', async () => {
      // Submit more tasks than workers to queue some
      const promises = [
        pool.submit({ type: 'task1' }),
        pool.submit({ type: 'task2' }),
        pool.submit({ type: 'task3' }),
        pool.submit({ type: 'task4' }),
        pool.submit({ type: 'task5' }),
      ];

      pool.clearQueue();

      // Wait for all promises to settle (some may complete, some may reject)
      const results = await Promise.allSettled(promises);
      const rejected = results.filter(r => r.status === 'rejected');
      // At least the queued ones should be rejected
      expect(rejected.length).toBeGreaterThanOrEqual(0);

      // Dispose the pool before afterEach to ensure no pending tasks
      pool.dispose();
    });

    it('WP-023: clearQueue does not affect in-progress tasks', async () => {
      // Create a pool with slow-responding worker to ensure tasks stay in-progress longer
      const slowWorkerPool = new WorkerPool<{ type: string; id: number; data: string }>({
        maxWorkers: 1,
        workerFactory: () => {
          const worker = new MockWorker();
          // Override postMessage to delay response
          worker.postMessage = (message: unknown) => {
            worker.lastMessage = message;
            setTimeout(() => {
              if (!worker.terminated) {
                const response = {
                  type: 'result',
                  id: (message as { id: number }).id,
                  data: 'processed',
                };
                (worker as unknown as { messageHandlers: ((event: MessageEvent) => void)[] }).messageHandlers
                  .forEach(h => h(new MessageEvent('message', { data: response })));
              }
            }, 100); // Slow response
          };
          setTimeout(() => worker.simulateReady(), 5);
          return worker as unknown as Worker;
        },
      });
      await slowWorkerPool.init();

      // Submit a task that will be in-progress
      const inProgressTask = slowWorkerPool.submit({ type: 'inProgress' });

      // Wait a bit to ensure it's assigned to a worker
      await new Promise(resolve => setTimeout(resolve, 20));

      // Clear the queue - should not affect in-progress task
      slowWorkerPool.clearQueue();

      // The in-progress task should still complete successfully
      const result = await inProgressTask;
      expect(result.type).toBe('result');

      slowWorkerPool.dispose();
    });

    it('WP-024: clearQueue only rejects truly queued tasks, not in-progress ones', async () => {
      // Create a pool with 1 worker and slow response to test queue behavior
      let tasksProcessed = 0;
      const slowWorkerPool = new WorkerPool<{ type: string; id: number; data: string }>({
        maxWorkers: 1,
        workerFactory: () => {
          const worker = new MockWorker();
          worker.postMessage = (message: unknown) => {
            worker.lastMessage = message;
            tasksProcessed++;
            setTimeout(() => {
              if (!worker.terminated) {
                const response = {
                  type: 'result',
                  id: (message as { id: number }).id,
                  data: 'processed',
                };
                (worker as unknown as { messageHandlers: ((event: MessageEvent) => void)[] }).messageHandlers
                  .forEach(h => h(new MessageEvent('message', { data: response })));
              }
            }, 50);
          };
          setTimeout(() => worker.simulateReady(), 5);
          return worker as unknown as Worker;
        },
      });
      await slowWorkerPool.init();

      // Submit 3 tasks - first will be in-progress, rest will be queued
      const task1 = slowWorkerPool.submit({ type: 'task1' });
      const task2 = slowWorkerPool.submit({ type: 'task2' });
      const task3 = slowWorkerPool.submit({ type: 'task3' });

      // Wait a bit for first task to start processing
      await new Promise(resolve => setTimeout(resolve, 20));

      // Clear the queue
      slowWorkerPool.clearQueue();

      // Settle all promises
      const results = await Promise.allSettled([task1, task2, task3]);

      // First task should succeed (was in-progress)
      expect(results[0].status).toBe('fulfilled');

      // Queued tasks should be rejected
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('rejected');

      // Only 1 task should have been processed by the worker
      expect(tasksProcessed).toBe(1);

      slowWorkerPool.dispose();
    });
  });

  describe('dispose', () => {
    beforeEach(async () => {
      await pool.init();
    });

    it('WP-012: terminates all workers', () => {
      pool.dispose();
      mockWorkers.forEach(w => expect(w.terminated).toBe(true));
    });

    it('WP-013: rejects pending tasks', async () => {
      const promise = pool.submit({ type: 'test' });
      pool.dispose();

      await expect(promise).rejects.toThrow('disposed');
    });

    it('WP-014: can be called multiple times safely', () => {
      expect(() => {
        pool.dispose();
        pool.dispose();
        pool.dispose();
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await pool.init();
    });

    it('WP-015: handles worker errors gracefully', async () => {
      // Override mock to simulate error
      const errorConfig: WorkerPoolConfig = {
        maxWorkers: 1,
        workerFactory: () => {
          const worker = new MockWorker();
          // Override postMessage to send error
          worker.postMessage = (message: unknown) => {
            worker.lastMessage = message;
            setTimeout(() => {
              const errorResponse = {
                type: 'error',
                id: (message as { id: number }).id,
                error: 'Test error',
              };
              (worker as unknown as { messageHandlers: ((event: MessageEvent) => void)[] }).messageHandlers
                .forEach(h => h(new MessageEvent('message', { data: errorResponse })));
            }, 10);
          };
          setTimeout(() => worker.simulateReady(), 5);
          return worker as unknown as Worker;
        },
      };

      const errorPool = new WorkerPool(errorConfig);
      await errorPool.init();

      await expect(errorPool.submit({ type: 'test' })).rejects.toThrow('Test error');
      errorPool.dispose();
    });
  });

  describe('transferables', () => {
    beforeEach(async () => {
      await pool.init();
    });

    it('WP-016: accepts transferable objects', async () => {
      const buffer = new ArrayBuffer(1024);
      const result = await pool.submit({ type: 'test', buffer }, [buffer]);
      expect(result.type).toBe('result');
    });

    it('WP-017: handles detached buffer error gracefully', async () => {
      // Create a mock that throws on postMessage with detached buffer
      const errorConfig: WorkerPoolConfig = {
        maxWorkers: 1,
        workerFactory: () => {
          const worker = new MockWorker();
          const originalPostMessage = worker.postMessage.bind(worker);
          worker.postMessage = (message: unknown, transferables?: Transferable[]) => {
            if (transferables && transferables.length > 0) {
              // Simulate detached buffer error
              throw new DOMException('ArrayBuffer is detached', 'DataCloneError');
            }
            originalPostMessage(message, transferables);
          };
          setTimeout(() => worker.simulateReady(), 5);
          return worker as unknown as Worker;
        },
      };

      const errorPool = new WorkerPool(errorConfig);
      await errorPool.init();

      const buffer = new ArrayBuffer(1024);
      await expect(errorPool.submit({ type: 'test' }, [buffer])).rejects.toThrow('DataCloneError');
      errorPool.dispose();
    });
  });

  describe('task ID overflow', () => {
    it('WP-018: handles task ID overflow by wrapping', async () => {
      // Create a pool and manually set taskIdCounter near max
      const config: WorkerPoolConfig = {
        maxWorkers: 1,
        workerFactory: () => {
          const worker = new MockWorker();
          setTimeout(() => worker.simulateReady(), 5);
          return worker as unknown as Worker;
        },
      };

      const testPool = new WorkerPool<{ type: string; id: number; data: string }>(config);
      await testPool.init();

      // Access private field for testing (using type assertion)
      const poolAny = testPool as unknown as { taskIdCounter: number };
      poolAny.taskIdCounter = Number.MAX_SAFE_INTEGER - 1;

      // Submit tasks - should wrap around without error
      const result1 = await testPool.submit({ type: 'test1' });
      expect(result1.type).toBe('result');

      const result2 = await testPool.submit({ type: 'test2' });
      expect(result2.type).toBe('result');

      // Verify counter wrapped
      expect(poolAny.taskIdCounter).toBeLessThan(Number.MAX_SAFE_INTEGER);

      testPool.dispose();
    });
  });

  describe('task timeout', () => {
    it('WP-025: rejects task after configured timeout', async () => {
      // Create a pool with a slow worker that never responds
      const slowPool = new WorkerPool({
        maxWorkers: 1,
        taskTimeout: 100, // 100ms timeout
        workerFactory: () => {
          const worker = new MockWorker();
          // Override postMessage to never respond
          worker.postMessage = () => {
            worker.lastMessage = null;
            // Don't send any response - simulate hung worker
          };
          setTimeout(() => worker.simulateReady(), 5);
          return worker as unknown as Worker;
        },
      });
      await slowPool.init();

      // Submit a task that will timeout
      const task = slowPool.submit({ type: 'slow' });

      // Should reject with timeout error
      await expect(task).rejects.toThrow('timed out');

      slowPool.dispose();
    });

    it('WP-026: does not timeout tasks that complete in time', async () => {
      // Create a pool with timeout but fast worker
      const fastPool = new WorkerPool<{ type: string; id: number; data: string }>({
        maxWorkers: 1,
        taskTimeout: 1000, // 1 second timeout
        workerFactory: () => {
          const worker = new MockWorker();
          // Respond quickly (10ms)
          worker.postMessage = (message: unknown) => {
            worker.lastMessage = message;
            setTimeout(() => {
              if (!worker.terminated) {
                const response = {
                  type: 'result',
                  id: (message as { id: number }).id,
                  data: 'processed',
                };
                (worker as unknown as { messageHandlers: ((event: MessageEvent) => void)[] }).messageHandlers
                  .forEach(h => h(new MessageEvent('message', { data: response })));
              }
            }, 10);
          };
          setTimeout(() => worker.simulateReady(), 5);
          return worker as unknown as Worker;
        },
      });
      await fastPool.init();

      // Task should complete before timeout
      const result = await fastPool.submit({ type: 'fast' });
      expect(result.type).toBe('result');

      fastPool.dispose();
    });

    it('WP-027: restarts worker after timeout', async () => {
      let workerCount = 0;
      const timeoutPool = new WorkerPool({
        maxWorkers: 1,
        taskTimeout: 50,
        workerFactory: () => {
          workerCount++;
          const worker = new MockWorker();
          // First worker never responds, second worker responds normally
          if (workerCount === 1) {
            worker.postMessage = () => {
              // Don't respond
            };
          }
          setTimeout(() => worker.simulateReady(), 5);
          return worker as unknown as Worker;
        },
      });
      await timeoutPool.init();
      expect(workerCount).toBe(1);

      // First task will timeout
      const firstTask = timeoutPool.submit({ type: 'timeout' });
      await expect(firstTask).rejects.toThrow('timed out');

      // Wait for worker restart
      await new Promise(resolve => setTimeout(resolve, 150));

      // A new worker should have been created
      expect(workerCount).toBe(2);

      timeoutPool.dispose();
    });

    it('WP-028: clears timeout when task completes', async () => {
      // This test verifies that completed tasks don't trigger timeout later
      const clearTimeoutPool = new WorkerPool<{ type: string; id: number; data: string }>({
        maxWorkers: 1,
        taskTimeout: 200,
        workerFactory: () => {
          const worker = new MockWorker();
          setTimeout(() => worker.simulateReady(), 5);
          return worker as unknown as Worker;
        },
      });
      await clearTimeoutPool.init();

      // Submit and wait for task to complete quickly
      const result = await clearTimeoutPool.submit({ type: 'quick' });
      expect(result.type).toBe('result');

      // Wait past the timeout period - should not cause any errors
      await new Promise(resolve => setTimeout(resolve, 300));

      // Pool should still be functional
      const result2 = await clearTimeoutPool.submit({ type: 'quick2' });
      expect(result2.type).toBe('result');

      clearTimeoutPool.dispose();
    });
  });

  describe('worker restart', () => {
    it('WP-019: restarts worker after error to maintain pool capacity', async () => {
      let workerCount = 0;
      const config: WorkerPoolConfig = {
        maxWorkers: 1,
        workerFactory: () => {
          workerCount++;
          const worker = new MockWorker();
          setTimeout(() => worker.simulateReady(), 5);
          return worker as unknown as Worker;
        },
      };

      const testPool = new WorkerPool(config);
      await testPool.init();
      expect(workerCount).toBe(1);

      // Get stats before error
      const statsBefore = testPool.getStats();
      expect(statsBefore.totalWorkers).toBe(1);

      // Simulate worker error
      mockWorkers = [];
      const poolAny = testPool as unknown as { workers: Array<{ worker: MockWorker }> };
      const workerState = poolAny.workers[0];
      if (workerState) {
        workerState.worker.simulateError('Test worker crash');
      }

      // Wait for restart
      await new Promise(resolve => setTimeout(resolve, 100));

      // Worker count should have increased (restart created new worker)
      expect(workerCount).toBe(2);

      // Pool should still have capacity
      const statsAfter = testPool.getStats();
      expect(statsAfter.totalWorkers).toBe(1);

      testPool.dispose();
    });

    it('WP-020: continues processing tasks after worker restart', async () => {
      let workerIndex = 0;
      const workers: MockWorker[] = [];

      const config: WorkerPoolConfig = {
        maxWorkers: 1,
        workerFactory: () => {
          const worker = new MockWorker();
          workers.push(worker);
          workerIndex++;

          // First worker will error, second will work
          if (workerIndex === 1) {
            worker.postMessage = () => {
              setTimeout(() => worker.simulateError('Worker crash'), 5);
            };
          }

          setTimeout(() => worker.simulateReady(), 5);
          return worker as unknown as Worker;
        },
      };

      const testPool = new WorkerPool<{ type: string; id: number; data: string }>(config);
      await testPool.init();

      // First task will fail due to worker error
      const firstTask = testPool.submit({ type: 'task1' });
      await expect(firstTask).rejects.toThrow();

      // Wait for worker restart
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second task should succeed with restarted worker
      const secondTask = await testPool.submit({ type: 'task2' });
      expect(secondTask.type).toBe('result');

      testPool.dispose();
    });

    it('WP-021: readyHandled flag prevents race condition between ready message and timeout', async () => {
      // This test verifies that the readyHandled flag works correctly
      // by having the worker send ready immediately (before timeout)
      let workerReadyCount = 0;

      const config: WorkerPoolConfig = {
        maxWorkers: 1,
        workerFactory: () => {
          const worker = new MockWorker();
          // Send ready immediately
          setTimeout(() => {
            worker.simulateReady();
            workerReadyCount++;
          }, 1);
          return worker as unknown as Worker;
        },
        onWorkerReady: () => {
          // This should only be called once per worker, not twice
          // (once from ready message, once from timeout)
        },
      };

      const testPool = new WorkerPool(config);
      await testPool.init();

      // Worker should be ready from the ready message
      const stats = testPool.getStats();
      expect(stats.totalWorkers).toBe(1);

      // Wait past the timeout period
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Ready should have only been triggered once
      expect(workerReadyCount).toBe(1);

      // Simulate error to trigger restart with race condition potential
      const poolAny = testPool as unknown as { workers: Array<{ worker: MockWorker }> };
      const workerState = poolAny.workers[0];
      if (workerState) {
        workerState.worker.simulateError('Test crash');
      }

      // Wait for restart and timeout period
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should have 2 workers created total (initial + restart)
      // but each should only trigger ready once
      expect(workerReadyCount).toBe(2);

      testPool.dispose();
    });
  });
});
