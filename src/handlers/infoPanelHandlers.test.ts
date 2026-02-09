/**
 * Info Panel Handlers Tests
 *
 * Tests for formatTimecode, formatDuration, and updateInfoPanel functions.
 */

import { describe, it, expect, vi } from 'vitest';
import { formatTimecode, formatDuration, updateInfoPanel } from './infoPanelHandlers';
import type { SessionBridgeContext } from '../AppSessionBridge';

describe('formatTimecode', () => {
  it('IPH-U001: formats zero frame at 24fps', () => {
    expect(formatTimecode(0, 24)).toBe('00:00:00:00');
  });

  it('IPH-U002: formats frame within first second', () => {
    expect(formatTimecode(12, 24)).toBe('00:00:00:12');
  });

  it('IPH-U003: formats frame at exactly one second', () => {
    expect(formatTimecode(24, 24)).toBe('00:00:01:00');
  });

  it('IPH-U004: formats frame at one minute', () => {
    expect(formatTimecode(24 * 60, 24)).toBe('00:01:00:00');
  });

  it('IPH-U005: formats frame at one hour', () => {
    expect(formatTimecode(24 * 3600, 24)).toBe('01:00:00:00');
  });

  it('IPH-U006: formats complex timecode', () => {
    // 1 hour, 2 minutes, 3 seconds, 4 frames = 3600*24 + 120*24 + 72 + 4 = 86400 + 2880 + 72 + 4 = 89356
    const frames = 1 * 3600 * 24 + 2 * 60 * 24 + 3 * 24 + 4;
    expect(formatTimecode(frames, 24)).toBe('01:02:03:04');
  });

  it('IPH-U007: returns 00:00:00:00 when fps is zero', () => {
    expect(formatTimecode(100, 0)).toBe('00:00:00:00');
  });

  it('IPH-U008: returns 00:00:00:00 when fps is negative', () => {
    expect(formatTimecode(100, -1)).toBe('00:00:00:00');
  });

  it('IPH-U009: formats with 30fps', () => {
    expect(formatTimecode(30, 30)).toBe('00:00:01:00');
  });

  it('IPH-U010: pads single-digit values', () => {
    expect(formatTimecode(1, 24)).toBe('00:00:00:01');
  });
});

describe('formatDuration', () => {
  it('IPH-U020: formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('IPH-U021: formats seconds under a minute', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('IPH-U022: formats exactly one minute', () => {
    expect(formatDuration(60)).toBe('1:00');
  });

  it('IPH-U023: formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
  });

  it('IPH-U024: formats with hours when over 3600', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('IPH-U025: formats exactly one hour', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
  });

  it('IPH-U026: pads minutes and seconds when hours present', () => {
    expect(formatDuration(3605)).toBe('1:00:05');
  });

  it('IPH-U027: does not include hours when under 3600', () => {
    expect(formatDuration(3599)).toBe('59:59');
  });
});

describe('updateInfoPanel', () => {
  function createMockContext(overrides: {
    currentFrame?: number;
    fps?: number;
    currentSource?: { name?: string; width?: number; height?: number; duration?: number } | null;
  } = {}): SessionBridgeContext {
    const infoPanel = { update: vi.fn() };
    const session = {
      currentFrame: overrides.currentFrame ?? 0,
      fps: overrides.fps ?? 24,
      currentSource: overrides.currentSource !== undefined ? overrides.currentSource : null,
    };

    return {
      getSession: () => session,
      getInfoPanel: () => infoPanel,
    } as unknown as SessionBridgeContext;
  }

  it('IPH-U030: updates info panel with source data', () => {
    const context = createMockContext({
      currentFrame: 48,
      fps: 24,
      currentSource: { name: 'clip.mov', width: 1920, height: 1080, duration: 240 },
    });

    updateInfoPanel(context);

    expect(context.getInfoPanel().update).toHaveBeenCalledWith({
      filename: 'clip.mov',
      width: 1920,
      height: 1080,
      currentFrame: 48,
      totalFrames: 240,
      timecode: '00:00:02:00',
      duration: '0:10',
      fps: 24,
    });
  });

  it('IPH-U031: updates info panel with undefined values when no source', () => {
    const context = createMockContext({ currentSource: null });

    updateInfoPanel(context);

    expect(context.getInfoPanel().update).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: undefined,
        width: undefined,
        height: undefined,
        totalFrames: 0,
      })
    );
  });

  it('IPH-U032: calculates correct timecode', () => {
    const context = createMockContext({
      currentFrame: 72,
      fps: 24,
      currentSource: { name: 'test.exr', width: 100, height: 100, duration: 100 },
    });

    updateInfoPanel(context);

    const call = (context.getInfoPanel().update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.timecode).toBe('00:00:03:00');
  });

  it('IPH-U033: calculates correct duration', () => {
    const context = createMockContext({
      fps: 24,
      currentSource: { name: 'test.mov', width: 100, height: 100, duration: 2400 },
    });

    updateInfoPanel(context);

    const call = (context.getInfoPanel().update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // 2400 frames / 24 fps = 100 seconds = 1:40
    expect(call.duration).toBe('1:40');
  });
});
