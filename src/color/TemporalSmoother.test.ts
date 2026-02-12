import { describe, it, expect } from 'vitest';
import { TemporalSmoother } from './TemporalSmoother';

describe('TemporalSmoother', () => {
  it('returns raw value on first call', () => {
    const smoother = new TemporalSmoother();
    expect(smoother.smooth('test', 5.0, 0.1)).toBe(5.0);
  });

  it('applies EMA on subsequent calls', () => {
    const smoother = new TemporalSmoother();
    smoother.smooth('test', 10.0, 0.5);

    // Next call: prev=10, current=0, alpha=0.5 → 10 + 0.5*(0-10) = 5.0
    expect(smoother.smooth('test', 0.0, 0.5)).toBeCloseTo(5.0, 5);
  });

  it('converges to constant input', () => {
    const smoother = new TemporalSmoother();
    for (let i = 0; i < 100; i++) {
      smoother.smooth('test', 42.0, 0.2);
    }
    expect(smoother.smooth('test', 42.0, 0.2)).toBeCloseTo(42.0, 3);
  });

  it('tracks multiple independent keys', () => {
    const smoother = new TemporalSmoother();
    smoother.smooth('a', 100.0, 0.5);
    smoother.smooth('b', 0.0, 0.5);

    const a = smoother.smooth('a', 0.0, 0.5);
    const b = smoother.smooth('b', 100.0, 0.5);

    expect(a).toBeCloseTo(50.0, 5);
    expect(b).toBeCloseTo(50.0, 5);
  });

  it('reset clears all state', () => {
    const smoother = new TemporalSmoother();
    smoother.smooth('test', 100.0, 0.5);
    smoother.smooth('test', 50.0, 0.5);

    smoother.reset();
    // After reset, should return raw value again
    expect(smoother.smooth('test', 7.0, 0.5)).toBe(7.0);
  });

  it('alpha=0 means no change from previous', () => {
    const smoother = new TemporalSmoother();
    smoother.smooth('test', 10.0, 1.0);
    expect(smoother.smooth('test', 999.0, 0.0)).toBeCloseTo(10.0, 5);
  });

  it('alpha=1 means instant tracking', () => {
    const smoother = new TemporalSmoother();
    smoother.smooth('test', 10.0, 1.0);
    expect(smoother.smooth('test', 42.0, 1.0)).toBeCloseTo(42.0, 5);
  });
});
