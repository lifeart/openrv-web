import { describe, it, expect, vi } from 'vitest';
import { compositeTimecodeFrameburn } from './FrameburnCompositor';

function createContext() {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  return canvas.getContext('2d')!;
}

describe('FrameburnCompositor', () => {
  it('FBC-001: does nothing when disabled', () => {
    const ctx = createContext() as unknown as { fillText: ReturnType<typeof vi.fn> };
    compositeTimecodeFrameburn(ctx as unknown as CanvasRenderingContext2D, 1920, 1080, {
      enabled: false,
      position: 'top-left',
      fontSize: 'medium',
      showFrameCounter: true,
      backgroundOpacity: 0.6,
      frame: 1,
      totalFrames: 100,
      fps: 24,
    });
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('FBC-002: draws timecode and frame counter when enabled', () => {
    const ctx = createContext() as unknown as { fillText: ReturnType<typeof vi.fn> };
    compositeTimecodeFrameburn(ctx as unknown as CanvasRenderingContext2D, 1920, 1080, {
      enabled: true,
      position: 'top-left',
      fontSize: 'medium',
      showFrameCounter: true,
      backgroundOpacity: 0.6,
      frame: 1,
      totalFrames: 240,
      fps: 24,
    });

    const calls = ctx.fillText.mock.calls.map((call) => call[0]);
    expect(calls).toContain('00:00:00:00');
    expect(calls).toContain('Frame 1 / 240');
  });

  it('FBC-003: omits frame counter when disabled in options', () => {
    const ctx = createContext() as unknown as { fillText: ReturnType<typeof vi.fn> };
    compositeTimecodeFrameburn(ctx as unknown as CanvasRenderingContext2D, 1920, 1080, {
      enabled: true,
      position: 'bottom-right',
      fontSize: 'small',
      showFrameCounter: false,
      backgroundOpacity: 0.4,
      frame: 48,
      totalFrames: 240,
      fps: 24,
    });

    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    expect(ctx.fillText.mock.calls[0]?.[0]).toBe('00:00:01:23');
  });
});

