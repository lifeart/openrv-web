/**
 * Playback Handlers Tests
 *
 * Tests for handlePlaybackChanged: scope playback mode toggling,
 * prerender buffer updates, video preload management, and scope refresh on stop.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePlaybackChanged } from './playbackHandlers';
import type { SessionBridgeContext } from '../AppSessionBridge';

function createMockContext(overrides: {
  playDirection?: number;
  currentSource?: { videoSourceNode?: { stopPlaybackPreload: ReturnType<typeof vi.fn> } } | null;
} = {}): SessionBridgeContext {
  const histogram = { setPlaybackMode: vi.fn() };
  const waveform = { setPlaybackMode: vi.fn() };
  const vectorscope = { setPlaybackMode: vi.fn() };
  const viewer = { updatePrerenderPlaybackState: vi.fn() };
  const session = {
    playDirection: overrides.playDirection ?? 1,
    currentSource: overrides.currentSource !== undefined ? overrides.currentSource : null,
  };

  return {
    getSession: () => session,
    getViewer: () => viewer,
    getHistogram: () => histogram,
    getWaveform: () => waveform,
    getVectorscope: () => vectorscope,
  } as unknown as SessionBridgeContext;
}

describe('handlePlaybackChanged', () => {
  let updateHistogram: ReturnType<typeof vi.fn>;
  let updateWaveform: ReturnType<typeof vi.fn>;
  let updateVectorscope: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateHistogram = vi.fn();
    updateWaveform = vi.fn();
    updateVectorscope = vi.fn();
  });

  it('PBH-U001: sets playback mode on all scopes when playing', () => {
    const context = createMockContext();
    handlePlaybackChanged(context, true, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getHistogram().setPlaybackMode).toHaveBeenCalledWith(true);
    expect(context.getWaveform().setPlaybackMode).toHaveBeenCalledWith(true);
    expect(context.getVectorscope().setPlaybackMode).toHaveBeenCalledWith(true);
  });

  it('PBH-U002: clears playback mode on all scopes when stopped', () => {
    const context = createMockContext();
    handlePlaybackChanged(context, false, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getHistogram().setPlaybackMode).toHaveBeenCalledWith(false);
    expect(context.getWaveform().setPlaybackMode).toHaveBeenCalledWith(false);
    expect(context.getVectorscope().setPlaybackMode).toHaveBeenCalledWith(false);
  });

  it('PBH-U003: updates prerender buffer playback state with direction', () => {
    const context = createMockContext({ playDirection: -1 });
    handlePlaybackChanged(context, true, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getViewer().updatePrerenderPlaybackState).toHaveBeenCalledWith(true, -1);
  });

  it('PBH-U004: updates prerender buffer with forward direction', () => {
    const context = createMockContext({ playDirection: 1 });
    handlePlaybackChanged(context, true, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getViewer().updatePrerenderPlaybackState).toHaveBeenCalledWith(true, 1);
  });

  it('PBH-U005: calls stopPlaybackPreload when playback stops and video source exists', () => {
    const stopPlaybackPreload = vi.fn();
    const context = createMockContext({
      currentSource: { videoSourceNode: { stopPlaybackPreload } },
    });

    handlePlaybackChanged(context, false, updateHistogram, updateWaveform, updateVectorscope);

    expect(stopPlaybackPreload).toHaveBeenCalled();
  });

  it('PBH-U006: does not call stopPlaybackPreload when playback starts', () => {
    const stopPlaybackPreload = vi.fn();
    const context = createMockContext({
      currentSource: { videoSourceNode: { stopPlaybackPreload } },
    });

    handlePlaybackChanged(context, true, updateHistogram, updateWaveform, updateVectorscope);

    expect(stopPlaybackPreload).not.toHaveBeenCalled();
  });

  it('PBH-U007: does not call stopPlaybackPreload when no video source node', () => {
    const context = createMockContext({ currentSource: {} as any });
    // Should not throw
    expect(() => {
      handlePlaybackChanged(context, false, updateHistogram, updateWaveform, updateVectorscope);
    }).not.toThrow();
  });

  it('PBH-U008: does not call stopPlaybackPreload when no current source', () => {
    const context = createMockContext({ currentSource: null });
    expect(() => {
      handlePlaybackChanged(context, false, updateHistogram, updateWaveform, updateVectorscope);
    }).not.toThrow();
  });

  it('PBH-U009: updates all scopes when playback stops', () => {
    const context = createMockContext();
    handlePlaybackChanged(context, false, updateHistogram, updateWaveform, updateVectorscope);

    expect(updateHistogram).toHaveBeenCalled();
    expect(updateWaveform).toHaveBeenCalled();
    expect(updateVectorscope).toHaveBeenCalled();
  });

  it('PBH-U010: does not update scopes when playback starts', () => {
    const context = createMockContext();
    handlePlaybackChanged(context, true, updateHistogram, updateWaveform, updateVectorscope);

    expect(updateHistogram).not.toHaveBeenCalled();
    expect(updateWaveform).not.toHaveBeenCalled();
    expect(updateVectorscope).not.toHaveBeenCalled();
  });
});
