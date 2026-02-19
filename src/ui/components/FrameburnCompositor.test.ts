import { describe, it, expect, vi } from 'vitest';
import {
  compositeTimecodeFrameburn,
  compositeFrameburn,
  buildTextLines,
  type FrameburnConfig,
  type FrameburnContext,
  type FrameburnField,
} from './FrameburnCompositor';

function createContext() {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  return canvas.getContext('2d')!;
}

const baseContext: FrameburnContext = {
  currentFrame: 48,
  totalFrames: 240,
  fps: 24,
  shotName: 'vfx_010_020',
  width: 1920,
  height: 1080,
  colorSpace: 'ACEScg',
  codec: 'EXR',
  date: '2026-02-18',
};

const baseConfig: FrameburnConfig = {
  enabled: true,
  fields: [{ type: 'timecode' }],
  fontSize: 16,
  position: 'bottom-left',
};

describe('FrameburnCompositor', () => {
  // === Existing timecode-only tests ===

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

  // === Extended multi-field tests (T1.6) ===

  describe('buildTextLines', () => {
    it('BURN-006: formats each field type correctly', () => {
      const fields: FrameburnField[] = [
        { type: 'timecode' },
        { type: 'frame' },
        { type: 'shotName' },
        { type: 'date' },
        { type: 'resolution' },
        { type: 'fps' },
        { type: 'colorspace' },
        { type: 'codec' },
      ];
      const lines = buildTextLines(fields, baseContext);

      expect(lines[0]).toBe('00:00:01:23'); // frame 48 at 24fps
      expect(lines[1]).toBe('48 / 240');
      expect(lines[2]).toBe('vfx_010_020');
      expect(lines[3]).toBe('2026-02-18');
      expect(lines[4]).toBe('1920x1080');
      expect(lines[5]).toBe('24 fps');
      expect(lines[6]).toBe('ACEScg');
      expect(lines[7]).toBe('EXR');
    });

    it('BURN-007: custom field uses provided label and value', () => {
      const fields: FrameburnField[] = [
        { type: 'custom', label: 'Client', value: 'ACME Studios' },
        { type: 'custom', value: 'Internal Review' },
      ];
      const lines = buildTextLines(fields, baseContext);

      expect(lines[0]).toBe('Client: ACME Studios');
      expect(lines[1]).toBe('Internal Review');
    });

    it('BURN-005: handles missing optional fields gracefully', () => {
      const ctx: FrameburnContext = {
        ...baseContext,
        colorSpace: undefined,
        codec: undefined,
        date: undefined,
      };
      const fields: FrameburnField[] = [
        { type: 'colorspace' },
        { type: 'codec' },
        { type: 'shotName' },
      ];
      const lines = buildTextLines(fields, ctx);

      // colorspace and codec are empty and get skipped
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe('vfx_010_020');
    });

    it('skips custom fields with no value', () => {
      const lines = buildTextLines([{ type: 'custom' }], baseContext);
      expect(lines).toHaveLength(0);
    });

    it('adds label prefix to any field type', () => {
      const lines = buildTextLines(
        [{ type: 'frame', label: 'Frame' }],
        baseContext
      );
      expect(lines[0]).toBe('Frame: 48 / 240');
    });

    it('date field uses fallback when context.date is undefined', () => {
      const ctx: FrameburnContext = { ...baseContext, date: undefined };
      const lines = buildTextLines([{ type: 'date' }], ctx);
      expect(lines).toHaveLength(1);
      // Should be a YYYY-MM-DD format string
      expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('compositeFrameburn', () => {
    it('BURN-001: renders timecode text on canvas', () => {
      const ctx = createContext();
      const fillTextSpy = vi.spyOn(ctx, 'fillText');

      compositeFrameburn(ctx, 1920, 1080, baseConfig, baseContext);

      const texts = fillTextSpy.mock.calls.map(c => c[0]);
      expect(texts).toContain('00:00:01:23');
    });

    it('BURN-002: positions text correctly for each position option', () => {
      const positions = [
        'top-left', 'top-center', 'top-right',
        'bottom-left', 'bottom-center', 'bottom-right',
      ] as const;

      for (const pos of positions) {
        const ctx = createContext();
        const fillTextSpy = vi.spyOn(ctx, 'fillText');

        compositeFrameburn(ctx, 1920, 1080, { ...baseConfig, position: pos }, baseContext);

        // Each position should produce at least one fillText call
        expect(fillTextSpy).toHaveBeenCalled();

        const [, textX, textY] = fillTextSpy.mock.calls[0]!;
        // Verify position makes sense
        if (pos.includes('top')) {
          expect(textY).toBeLessThan(1080 / 2);
        }
        if (pos.includes('bottom')) {
          expect(textY).toBeGreaterThan(1080 / 2);
        }
        if (pos === 'top-right' || pos === 'bottom-right') {
          expect(textX).toBeGreaterThan(1920 / 2);
        }
        if (pos === 'top-left' || pos === 'bottom-left') {
          expect(textX).toBeLessThan(1920 / 2);
        }
      }
    });

    it('BURN-003: renders multiple fields as separate lines', () => {
      const ctx = createContext();
      const fillTextSpy = vi.spyOn(ctx, 'fillText');

      const config: FrameburnConfig = {
        enabled: true,
        fields: [
          { type: 'timecode' },
          { type: 'shotName' },
          { type: 'resolution' },
        ],
      };
      compositeFrameburn(ctx, 1920, 1080, config, baseContext);

      // 3 fields = 3 fillText calls
      expect(fillTextSpy).toHaveBeenCalledTimes(3);

      const texts = fillTextSpy.mock.calls.map(c => c[0]);
      expect(texts).toContain('00:00:01:23');
      expect(texts).toContain('vfx_010_020');
      expect(texts).toContain('1920x1080');

      // Each line should have a different Y coordinate
      const yPositions = fillTextSpy.mock.calls.map(c => c[2] as number);
      expect(yPositions[1]).toBeGreaterThan(yPositions[0]!);
      expect(yPositions[2]).toBeGreaterThan(yPositions[1]!);
    });

    it('BURN-004: draws background rectangle behind text', () => {
      const ctx = createContext();
      const fillRectSpy = vi.spyOn(ctx, 'fill');

      compositeFrameburn(ctx, 1920, 1080, baseConfig, baseContext);

      // fill() is called at least once for the background rect (via drawRoundedRect)
      expect(fillRectSpy).toHaveBeenCalled();
    });

    it('does nothing when disabled', () => {
      const ctx = createContext();
      const fillTextSpy = vi.spyOn(ctx, 'fillText');

      compositeFrameburn(ctx, 1920, 1080, { ...baseConfig, enabled: false }, baseContext);

      expect(fillTextSpy).not.toHaveBeenCalled();
    });

    it('does nothing with empty fields', () => {
      const ctx = createContext();
      const fillTextSpy = vi.spyOn(ctx, 'fillText');

      compositeFrameburn(ctx, 1920, 1080, { ...baseConfig, fields: [] }, baseContext);

      expect(fillTextSpy).not.toHaveBeenCalled();
    });

    it('uses save/restore for context state protection', () => {
      const ctx = createContext();
      const saveSpy = vi.spyOn(ctx, 'save');
      const restoreSpy = vi.spyOn(ctx, 'restore');

      compositeFrameburn(ctx, 1920, 1080, baseConfig, baseContext);

      expect(saveSpy).toHaveBeenCalledOnce();
      expect(restoreSpy).toHaveBeenCalledOnce();
    });
  });
});
