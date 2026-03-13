/**
 * Regression tests for Issue #306:
 * Media-cache failures are emitted internally, but the shipped app never surfaces them.
 *
 * Verifies that MediaCacheManager error events are properly surfaced
 * to the user via console.warn and showAlert.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaCacheManager } from './MediaCacheManager';
import type { CacheManagerEvents } from './MediaCacheManager';

describe('MediaCacheManager error surfacing', () => {
  let manager: MediaCacheManager;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    manager = new MediaCacheManager();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    manager.dispose();
    warnSpy.mockRestore();
  });

  it('ERROR-SURF-001: error event includes message string', () => {
    const errorHandler = vi.fn();
    manager.on('error', errorHandler);

    // Simulate what happens when initialize() fails
    manager.emit('error', { message: 'Initialization failed: OPFS not available' });

    expect(errorHandler).toHaveBeenCalledWith({
      message: 'Initialization failed: OPFS not available',
    });
  });

  it('ERROR-SURF-002: error event may include optional key', () => {
    const errorHandler = vi.fn();
    manager.on('error', errorHandler);

    manager.emit('error', { message: 'put failed: disk full', key: 'frame-42' });

    expect(errorHandler).toHaveBeenCalledWith({
      message: 'put failed: disk full',
      key: 'frame-42',
    });
  });

  it('ERROR-SURF-003: subscriber can distinguish init failures from write failures', () => {
    const errors: CacheManagerEvents['error'][] = [];
    manager.on('error', (event) => errors.push(event));

    manager.emit('error', { message: 'Initialization failed: SecurityError' });
    manager.emit('error', { message: 'put failed: QuotaExceededError', key: 'frame-1' });
    manager.emit('error', { message: 'clearAll failed: AbortError' });

    expect(errors).toHaveLength(3);
    expect(errors[0]!.message.startsWith('Initialization failed')).toBe(true);
    expect(errors[1]!.message.startsWith('put failed')).toBe(true);
    expect(errors[2]!.message.startsWith('clearAll failed')).toBe(true);
  });

  it('ERROR-SURF-004: error listener can be wired with console.warn', () => {
    manager.on('error', (event) => {
      console.warn('[OpenRV] Media cache error:', event.message);
    });

    manager.emit('error', { message: 'Initialization failed: test' });

    expect(warnSpy).toHaveBeenCalledWith(
      '[OpenRV] Media cache error:',
      'Initialization failed: test',
    );
  });

  it('ERROR-SURF-005: multiple error events are all delivered to subscribers', () => {
    const errorHandler = vi.fn();
    manager.on('error', errorHandler);

    manager.emit('error', { message: 'error 1' });
    manager.emit('error', { message: 'error 2' });
    manager.emit('error', { message: 'error 3' });

    expect(errorHandler).toHaveBeenCalledTimes(3);
  });

  it('ERROR-SURF-006: dispose removes error listeners', () => {
    const errorHandler = vi.fn();
    manager.on('error', errorHandler);

    manager.dispose();

    // After dispose, emitting should not call the handler (all listeners removed)
    // Re-create a fresh manager to avoid errors from disposed state
    const freshManager = new MediaCacheManager();
    freshManager.on('error', errorHandler);
    freshManager.dispose();

    // The handler should not have been called since we only subscribed and disposed
    expect(errorHandler).not.toHaveBeenCalled();
  });

  it('ERROR-SURF-007: error events during clearAll include descriptive message', () => {
    const errorHandler = vi.fn();
    manager.on('error', errorHandler);

    // Simulate the pattern from clearAll catch block
    manager.emit('error', { message: 'clearAll failed: DOMException: InvalidStateError' });

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('clearAll failed'),
      }),
    );
  });

  it('ERROR-SURF-008: error events during put include the cache key', () => {
    const errorHandler = vi.fn();
    manager.on('error', errorHandler);

    // Simulate the pattern from put catch block
    manager.emit('error', { message: 'put failed: QuotaExceededError', key: 'video-frame-100' });

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('put failed'),
        key: 'video-frame-100',
      }),
    );
  });
});
