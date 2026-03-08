import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaybackEngine, type PlaybackEngineHost } from './PlaybackEngine';
import { createMockPlaybackEngineHost } from '../../../test/mocks';

describe('PlaybackEngine.setInOutRange', () => {
  let engine: PlaybackEngine;
  let host: PlaybackEngineHost;

  beforeEach(() => {
    engine = new PlaybackEngine();
    host = createMockPlaybackEngineHost(100);
    engine.setHost(host);
    // Set initial out point so we have a range to work with
    engine.setOutPointInternal(100);
  });

  it('PE-101: sets both in and out points atomically', () => {
    engine.setInOutRange(10, 50);
    expect(engine.inPoint).toBe(10);
    expect(engine.outPoint).toBe(50);
  });

  it('PE-102: clamps in point to [1, duration]', () => {
    engine.setInOutRange(-5, 50);
    expect(engine.inPoint).toBe(1);

    engine.setInOutRange(200, 50);
    expect(engine.inPoint).toBe(100); // clamped to duration
  });

  it('PE-103: clamps out point to [inPoint, duration]', () => {
    engine.setInOutRange(50, 200);
    expect(engine.outPoint).toBe(100); // clamped to duration

    engine.setInOutRange(50, 30);
    // out is clamped to [inPoint, duration] = [50, 100], so min is 50
    expect(engine.outPoint).toBe(50);
  });

  it('PE-104: emits inOutChanged exactly once', () => {
    const listener = vi.fn();
    engine.on('inOutChanged', listener);

    engine.setInOutRange(10, 50);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ inPoint: 10, outPoint: 50 });
  });

  it('PE-105: handles forward shift (newIn > current outPoint) without clamping bug', () => {
    // Start with range [10, 20]
    engine.setInOutRange(10, 20);
    expect(engine.inPoint).toBe(10);
    expect(engine.outPoint).toBe(20);

    // Shift forward to [30, 40] - this would fail with sequential set calls
    engine.setInOutRange(30, 40);
    expect(engine.inPoint).toBe(30);
    expect(engine.outPoint).toBe(40);
  });

  it('PE-106: handles backward shift (newOut < current inPoint)', () => {
    // Start with range [50, 80]
    engine.setInOutRange(50, 80);

    // Shift backward to [10, 30]
    engine.setInOutRange(10, 30);
    expect(engine.inPoint).toBe(10);
    expect(engine.outPoint).toBe(30);
  });

  it('PE-107: handles single-frame range (inPoint === outPoint)', () => {
    engine.setInOutRange(50, 50);
    expect(engine.inPoint).toBe(50);
    expect(engine.outPoint).toBe(50);
  });

  it('PE-108: handles full range', () => {
    engine.setInOutRange(1, 100);
    expect(engine.inPoint).toBe(1);
    expect(engine.outPoint).toBe(100);
  });

  it('PE-109: works when no host is set (defaults to duration 1)', () => {
    const noHostEngine = new PlaybackEngine();
    noHostEngine.setInOutRange(1, 1);
    expect(noHostEngine.inPoint).toBe(1);
    expect(noHostEngine.outPoint).toBe(1);
  });

  it('PE-110: emits correct values after clamping', () => {
    const listener = vi.fn();
    engine.on('inOutChanged', listener);

    engine.setInOutRange(-5, 200);

    expect(listener).toHaveBeenCalledWith({ inPoint: 1, outPoint: 100 });
  });
});
