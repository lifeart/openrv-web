import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createThrottle } from './throttle';

describe('createThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires immediately on first call (leading edge)', () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, 100);

    throttled.call('a');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('batches subsequent calls within interval and fires trailing edge', () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, 100);

    throttled.call('a'); // fires immediately (leading)
    expect(fn).toHaveBeenCalledTimes(1);

    throttled.call('b'); // within interval, queued
    throttled.call('c'); // replaces 'b' as pending

    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('c');
  });

  it('cancel prevents trailing invocation', () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, 100);

    throttled.call('a'); // leading
    throttled.call('b'); // queued

    throttled.cancel();
    vi.advanceTimersByTime(200);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('fires leading edge again after interval elapses', () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, 100);

    throttled.call('a'); // leading
    vi.advanceTimersByTime(100);

    throttled.call('b'); // leading again (interval elapsed)
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('b');
  });

  it('handles multiple intervals correctly', () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, 100);

    // Interval 1
    throttled.call(1); // leading
    throttled.call(2); // queued trailing

    vi.advanceTimersByTime(100); // trailing fires with 2
    expect(fn).toHaveBeenCalledTimes(2);

    // Interval 2
    throttled.call(3); // leading
    throttled.call(4); // queued trailing

    vi.advanceTimersByTime(100); // trailing fires with 4
    expect(fn).toHaveBeenCalledTimes(4);
    expect(fn).toHaveBeenNthCalledWith(1, 1);
    expect(fn).toHaveBeenNthCalledWith(2, 2);
    expect(fn).toHaveBeenNthCalledWith(3, 3);
    expect(fn).toHaveBeenNthCalledWith(4, 4);
  });

  it('does not fire trailing if no pending args', () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, 100);

    throttled.call('a'); // leading only

    vi.advanceTimersByTime(200);

    // Only the leading call should have fired
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('supports multiple arguments', () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, 100);

    throttled.call('x', 42, true);

    expect(fn).toHaveBeenCalledWith('x', 42, true);
  });

  it('cancel is safe to call when no timer is pending', () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, 100);

    expect(() => throttled.cancel()).not.toThrow();
  });
});
