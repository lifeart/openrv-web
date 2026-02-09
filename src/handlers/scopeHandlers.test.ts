/**
 * Scope Handlers Tests
 *
 * Tests for updateHistogram, updateWaveform, updateVectorscope,
 * and createScopeScheduler functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  updateHistogram,
  updateWaveform,
  updateVectorscope,
  createScopeScheduler,
} from './scopeHandlers';
import type { SessionBridgeContext } from '../AppSessionBridge';

function createMockContext(overrides: {
  histogramVisible?: boolean;
  waveformVisible?: boolean;
  vectorscopeVisible?: boolean;
  imageData?: ImageData | null;
} = {}): SessionBridgeContext {
  const imageData = overrides.imageData !== undefined
    ? overrides.imageData
    : new ImageData(2, 2);

  const histogram = {
    isVisible: vi.fn(() => overrides.histogramVisible ?? false),
    update: vi.fn(),
  };
  const waveform = {
    isVisible: vi.fn(() => overrides.waveformVisible ?? false),
    update: vi.fn(),
  };
  const vectorscope = {
    isVisible: vi.fn(() => overrides.vectorscopeVisible ?? false),
    update: vi.fn(),
  };
  const viewer = {
    getImageData: vi.fn(() => imageData),
  };

  return {
    getHistogram: () => histogram,
    getWaveform: () => waveform,
    getVectorscope: () => vectorscope,
    getViewer: () => viewer,
  } as unknown as SessionBridgeContext;
}

describe('updateHistogram', () => {
  it('SCH-U001: updates histogram when visible and image data exists', () => {
    const imgData = new ImageData(2, 2);
    const context = createMockContext({ histogramVisible: true, imageData: imgData });

    updateHistogram(context);

    expect(context.getHistogram().update).toHaveBeenCalledWith(imgData);
  });

  it('SCH-U002: does not update histogram when not visible', () => {
    const context = createMockContext({ histogramVisible: false });

    updateHistogram(context);

    expect(context.getViewer().getImageData).not.toHaveBeenCalled();
    expect(context.getHistogram().update).not.toHaveBeenCalled();
  });

  it('SCH-U003: does not update histogram when image data is null', () => {
    const context = createMockContext({ histogramVisible: true, imageData: null });

    updateHistogram(context);

    expect(context.getHistogram().update).not.toHaveBeenCalled();
  });
});

describe('updateWaveform', () => {
  it('SCH-U010: updates waveform when visible and image data exists', () => {
    const imgData = new ImageData(2, 2);
    const context = createMockContext({ waveformVisible: true, imageData: imgData });

    updateWaveform(context);

    expect(context.getWaveform().update).toHaveBeenCalledWith(imgData);
  });

  it('SCH-U011: does not update waveform when not visible', () => {
    const context = createMockContext({ waveformVisible: false });

    updateWaveform(context);

    expect(context.getViewer().getImageData).not.toHaveBeenCalled();
    expect(context.getWaveform().update).not.toHaveBeenCalled();
  });

  it('SCH-U012: does not update waveform when image data is null', () => {
    const context = createMockContext({ waveformVisible: true, imageData: null });

    updateWaveform(context);

    expect(context.getWaveform().update).not.toHaveBeenCalled();
  });
});

describe('updateVectorscope', () => {
  it('SCH-U020: updates vectorscope when visible and image data exists', () => {
    const imgData = new ImageData(2, 2);
    const context = createMockContext({ vectorscopeVisible: true, imageData: imgData });

    updateVectorscope(context);

    expect(context.getVectorscope().update).toHaveBeenCalledWith(imgData);
  });

  it('SCH-U021: does not update vectorscope when not visible', () => {
    const context = createMockContext({ vectorscopeVisible: false });

    updateVectorscope(context);

    expect(context.getViewer().getImageData).not.toHaveBeenCalled();
    expect(context.getVectorscope().update).not.toHaveBeenCalled();
  });

  it('SCH-U022: does not update vectorscope when image data is null', () => {
    const context = createMockContext({ vectorscopeVisible: true, imageData: null });

    updateVectorscope(context);

    expect(context.getVectorscope().update).not.toHaveBeenCalled();
  });
});

describe('createScopeScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('SCH-U030: schedule sets pending flag', () => {
    const context = createMockContext({
      histogramVisible: true,
      waveformVisible: true,
      vectorscopeVisible: true,
    });
    const scheduler = createScopeScheduler(context);

    expect(scheduler.isPending()).toBe(false);

    scheduler.schedule();

    expect(scheduler.isPending()).toBe(true);
  });

  it('SCH-U031: schedule coalesces multiple calls', () => {
    const context = createMockContext({
      histogramVisible: true,
      waveformVisible: true,
      vectorscopeVisible: true,
    });
    const scheduler = createScopeScheduler(context);

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();

    // Only one update should occur, verified by pending state
    expect(scheduler.isPending()).toBe(true);
  });

  it('SCH-U032: pending clears after double requestAnimationFrame', () => {
    const context = createMockContext({
      histogramVisible: true,
      waveformVisible: true,
      vectorscopeVisible: true,
    });
    const scheduler = createScopeScheduler(context);

    scheduler.schedule();
    expect(scheduler.isPending()).toBe(true);

    // First rAF callback (mocked as setTimeout 16ms)
    vi.advanceTimersByTime(16);
    // Still pending (need double rAF)
    expect(scheduler.isPending()).toBe(true);

    // Second rAF callback
    vi.advanceTimersByTime(16);
    expect(scheduler.isPending()).toBe(false);
  });

  it('SCH-U033: updates all scopes after double requestAnimationFrame', () => {
    const imgData = new ImageData(2, 2);
    const context = createMockContext({
      histogramVisible: true,
      waveformVisible: true,
      vectorscopeVisible: true,
      imageData: imgData,
    });
    const scheduler = createScopeScheduler(context);

    scheduler.schedule();

    // Advance through double rAF
    vi.advanceTimersByTime(32);

    expect(context.getHistogram().update).toHaveBeenCalledWith(imgData);
    expect(context.getWaveform().update).toHaveBeenCalledWith(imgData);
    expect(context.getVectorscope().update).toHaveBeenCalledWith(imgData);
  });

  it('SCH-U034: can schedule again after completion', () => {
    const context = createMockContext({
      histogramVisible: true,
      waveformVisible: true,
      vectorscopeVisible: true,
    });
    const scheduler = createScopeScheduler(context);

    scheduler.schedule();
    vi.advanceTimersByTime(32);
    expect(scheduler.isPending()).toBe(false);

    scheduler.schedule();
    expect(scheduler.isPending()).toBe(true);
  });
});
