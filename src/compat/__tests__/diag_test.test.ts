import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('setTimeout(fn, 0) with fake timers', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('check if setTimeout(fn,0) fires synchronously', () => {
    const calls: string[] = [];
    setTimeout(() => calls.push('timer-0'), 0);
    calls.push('after-schedule');
    expect(calls).toEqual(['after-schedule']); // timer should NOT have fired yet
    vi.advanceTimersByTime(0);
    expect(calls).toEqual(['after-schedule', 'timer-0']);
  });

  it('check if setTimeout(fn,0) scheduled DURING advanceTimersByTime fires', () => {
    const calls: string[] = [];
    setTimeout(() => {
      calls.push('timer-1000');
      setTimeout(() => calls.push('nested-0'), 0);
    }, 1000);
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual(['timer-1000', 'nested-0']); // does nested-0 fire?
  });

  it('check if nested setTimeout(fn,0) needs extra advance', () => {
    const calls: string[] = [];
    setTimeout(() => {
      calls.push('timer-1000');
      setTimeout(() => calls.push('nested-0'), 0);
    }, 1000);
    vi.advanceTimersByTime(1000);
    // What did we get?
    console.log('after 1000ms advance:', JSON.stringify(calls));
    vi.advanceTimersByTime(0);
    console.log('after 0ms advance:', JSON.stringify(calls));
    vi.advanceTimersByTime(1);
    console.log('after 1ms advance:', JSON.stringify(calls));
  });
});
