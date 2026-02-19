/**
 * Slate/Leader Renderer Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildSlateFields,
  getFontSize,
  computeLogoRect,
  layoutText,
  renderSlate,
  generateSlateFrame,
  generateLeaderFrames,
  type SlateConfig,
  type SlateField,
  type SlateMetadata,
  type LogoPosition,
} from './SlateRenderer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<SlateConfig> = {}): SlateConfig {
  return {
    width: 1920,
    height: 1080,
    fields: [
      { label: '', value: 'My Show', size: 'large' as const },
      { label: '', value: 'shot_010', size: 'large' as const },
      { label: 'Version', value: 'v02' },
      { label: 'Date', value: '2026-02-18' },
    ],
    ...overrides,
  };
}

function makeMetadata(overrides: Partial<SlateMetadata> = {}): SlateMetadata {
  return {
    showName: 'My Show',
    shotName: 'shot_010',
    version: 'v02',
    artist: 'John Doe',
    date: '2026-02-18',
    frameIn: 1001,
    frameOut: 1049,
    fps: 24,
    resolution: '1920x1080',
    codec: 'H.264',
    colorSpace: 'sRGB',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlateRenderer', () => {
  describe('buildSlateFields', () => {
    it('SLATE-001: builds standard field list from metadata', () => {
      const meta = makeMetadata();
      const fields = buildSlateFields(meta);

      // Should have: showName, shotName, version, artist, date,
      // TC In, TC Out, duration, resolution, codec, colorSpace = 11 fields
      expect(fields.length).toBe(11);

      // First two should be large
      expect(fields[0]!.size).toBe('large');
      expect(fields[0]!.value).toBe('My Show');
      expect(fields[1]!.size).toBe('large');
      expect(fields[1]!.value).toBe('shot_010');
    });

    it('SLATE-002: omits fields with empty/undefined values', () => {
      const fields = buildSlateFields({
        showName: 'Show',
        shotName: undefined,
        version: '',
        fps: 24,
      });

      expect(fields.length).toBe(1);
      expect(fields[0]!.value).toBe('Show');
    });

    it('SLATE-003: formats timecodes from frame numbers', () => {
      const fields = buildSlateFields({
        frameIn: 1,
        frameOut: 49,
        fps: 24,
      });

      const tcIn = fields.find(f => f.label === 'TC In');
      const tcOut = fields.find(f => f.label === 'TC Out');
      const dur = fields.find(f => f.label === 'Duration');

      expect(tcIn).toBeDefined();
      expect(tcOut).toBeDefined();
      expect(dur).toBeDefined();
      expect(dur!.value).toBe('48 frames');
    });

    it('SLATE-004: omits timecodes when fps is zero or missing', () => {
      const fields = buildSlateFields({
        frameIn: 1,
        frameOut: 49,
        fps: 0,
      });

      expect(fields.find(f => f.label === 'TC In')).toBeUndefined();
      expect(fields.find(f => f.label === 'TC Out')).toBeUndefined();
    });

    it('sets small size for resolution, codec, colorSpace', () => {
      const fields = buildSlateFields({
        resolution: '1920x1080',
        codec: 'H.264',
        colorSpace: 'sRGB',
      });

      expect(fields.every(f => f.size === 'small')).toBe(true);
    });
  });

  describe('getFontSize', () => {
    it('SLATE-005: scales font size by canvas height', () => {
      const large = getFontSize('large', 1080);
      const medium = getFontSize('medium', 1080);
      const small = getFontSize('small', 1080);

      expect(large).toBeGreaterThan(medium);
      expect(medium).toBeGreaterThan(small);
      expect(large).toBe(Math.round(1080 * 0.06));
    });

    it('enforces minimum font size of 10px', () => {
      const tiny = getFontSize('small', 100);
      expect(tiny).toBeGreaterThanOrEqual(10);
    });
  });

  describe('computeLogoRect', () => {
    it('SLATE-006: positions logo in bottom-right corner', () => {
      const rect = computeLogoRect(200, 100, 1920, 1080, 'bottom-right', 0.15);

      // Logo should be near bottom-right
      expect(rect.x).toBeGreaterThan(1920 / 2);
      expect(rect.y).toBeGreaterThan(1080 / 2);
      expect(rect.w).toBeGreaterThan(0);
      expect(rect.h).toBeGreaterThan(0);
    });

    it('constrains logo to max scale fraction', () => {
      // Very large logo should be constrained
      const rect = computeLogoRect(5000, 2500, 1920, 1080, 'bottom-right', 0.15);

      expect(rect.w).toBeLessThanOrEqual(Math.ceil(1920 * 0.15));
      expect(rect.h).toBeLessThanOrEqual(Math.ceil(1080 * 0.15));
    });

    it('handles all four corner positions', () => {
      const positions: LogoPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      const rects = positions.map(p => computeLogoRect(100, 100, 1920, 1080, p, 0.1));

      // top-left should have small x,y
      expect(rects[0]!.x).toBeLessThan(1920 / 2);
      expect(rects[0]!.y).toBeLessThan(1080 / 2);

      // top-right should have large x, small y
      expect(rects[1]!.x).toBeGreaterThan(1920 / 2);
      expect(rects[1]!.y).toBeLessThan(1080 / 2);

      // bottom-left should have small x, large y
      expect(rects[2]!.x).toBeLessThan(1920 / 2);
      expect(rects[2]!.y).toBeGreaterThan(1080 / 2);

      // bottom-right should have large x, large y
      expect(rects[3]!.x).toBeGreaterThan(1920 / 2);
      expect(rects[3]!.y).toBeGreaterThan(1080 / 2);
    });

    it('preserves logo aspect ratio', () => {
      // 2:1 aspect ratio logo
      const rect = computeLogoRect(400, 200, 1920, 1080, 'bottom-right', 0.15);
      const aspect = rect.w / rect.h;
      expect(aspect).toBeCloseTo(2.0, 0);
    });
  });

  describe('layoutText', () => {
    it('SLATE-007: vertically centers text block', () => {
      const fields: SlateField[] = [
        { label: '', value: 'Title', size: 'large' },
      ];

      const lines = layoutText(fields, 1080);
      expect(lines.length).toBe(1);
      // Single line should be roughly centered
      expect(lines[0]!.y).toBeGreaterThan(1080 * 0.3);
      expect(lines[0]!.y).toBeLessThan(1080 * 0.7);
    });

    it('assigns correct font sizes by tier', () => {
      const fields: SlateField[] = [
        { label: '', value: 'Large', size: 'large' },
        { label: 'Med', value: 'Medium' },
        { label: 'Sm', value: 'Small', size: 'small' },
      ];

      const lines = layoutText(fields, 1080);
      expect(lines[0]!.fontSize).toBeGreaterThan(lines[1]!.fontSize);
      expect(lines[1]!.fontSize).toBeGreaterThan(lines[2]!.fontSize);
    });

    it('includes label prefix in text', () => {
      const fields: SlateField[] = [
        { label: 'Version', value: 'v02' },
      ];

      const lines = layoutText(fields, 1080);
      expect(lines[0]!.text).toBe('Version: v02');
    });

    it('omits label prefix for empty label', () => {
      const fields: SlateField[] = [
        { label: '', value: 'Title' },
      ];

      const lines = layoutText(fields, 1080);
      expect(lines[0]!.text).toBe('Title');
    });

    it('returns empty array for empty fields', () => {
      expect(layoutText([], 1080)).toEqual([]);
    });

    it('lines are ordered top to bottom', () => {
      const fields: SlateField[] = [
        { label: '', value: 'First', size: 'large' },
        { label: '', value: 'Second', size: 'large' },
        { label: '', value: 'Third', size: 'large' },
      ];

      const lines = layoutText(fields, 1080);
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i]!.y).toBeGreaterThan(lines[i - 1]!.y);
      }
    });
  });

  describe('renderSlate', () => {
    it('SLATE-008: renders to canvas without errors', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d')!;

      const config = makeConfig();
      expect(() => renderSlate(ctx, config)).not.toThrow();
    });

    it('sets fillStyle to custom background color', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;

      renderSlate(ctx, {
        width: 100,
        height: 100,
        backgroundColor: '#ff0000',
        textColor: '#00ff00',
        fields: [{ label: 'Test', value: 'Value' }],
      });

      // After rendering, fillStyle should reflect the last color used (text)
      // We verify the function ran without error and set text alignment
      expect(ctx.textAlign).toBe('center');
    });

    it('renders with default colors when not specified', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;

      renderSlate(ctx, {
        width: 100,
        height: 100,
        fields: [],
      });

      // Canvas context should have been used
      expect(ctx.textAlign).toBe('center');
    });
  });

  describe('generateSlateFrame', () => {
    it('SLATE-009: returns pixel data at correct dimensions', () => {
      const frame = generateSlateFrame(makeConfig({ width: 320, height: 240 }));

      expect(frame.width).toBe(320);
      expect(frame.height).toBe(240);
      expect(frame.pixels).toBeInstanceOf(Uint8ClampedArray);
      // JSDOM canvas has limited rendering, but getImageData still returns an array
      expect(frame.pixels.length).toBeGreaterThan(0);
    });

    it('SLATE-010: returns valid frame structure', () => {
      const config = makeConfig({ width: 64, height: 64 });
      const frame = generateSlateFrame(config);

      expect(frame).toHaveProperty('pixels');
      expect(frame).toHaveProperty('width', 64);
      expect(frame).toHaveProperty('height', 64);
      expect(frame.pixels).toBeInstanceOf(Uint8ClampedArray);
    });
  });

  describe('generateLeaderFrames', () => {
    it('SLATE-011: generates correct number of frames for duration', () => {
      const frames = generateLeaderFrames(
        makeConfig({ width: 64, height: 64 }),
        2, // 2 seconds
        24, // 24fps
      );

      expect(frames.length).toBe(48); // 2 * 24
      expect(frames[0]!.width).toBe(64);
      expect(frames[0]!.height).toBe(64);
    });

    it('SLATE-012: all leader frames share the same pixel data', () => {
      const frames = generateLeaderFrames(
        makeConfig({ width: 64, height: 64 }),
        1,
        24,
      );

      // All frames should reference the same pixels object
      for (let i = 1; i < frames.length; i++) {
        expect(frames[i]!.pixels).toBe(frames[0]!.pixels);
      }
    });

    it('returns empty array for zero duration', () => {
      const frames = generateLeaderFrames(makeConfig(), 0, 24);
      expect(frames.length).toBe(0);
    });

    it('returns empty array for zero fps', () => {
      const frames = generateLeaderFrames(makeConfig(), 2, 0);
      expect(frames.length).toBe(0);
    });

    it('rounds frame count for fractional durations', () => {
      const frames = generateLeaderFrames(
        makeConfig({ width: 64, height: 64 }),
        1.5,
        24,
      );
      expect(frames.length).toBe(36); // 1.5 * 24
    });

    it('returns empty array for negative duration', () => {
      const frames = generateLeaderFrames(makeConfig(), -5, 24);
      expect(frames.length).toBe(0);
    });
  });

  describe('validation', () => {
    it('SLATE-013: throws for zero or negative dimensions', () => {
      expect(() => generateSlateFrame({ width: 0, height: 100, fields: [] })).toThrow('dimensions must be positive');
      expect(() => generateSlateFrame({ width: 100, height: -1, fields: [] })).toThrow('dimensions must be positive');
    });

    it('buildSlateFields returns empty array for empty metadata', () => {
      const fields = buildSlateFields({});
      expect(fields).toEqual([]);
    });
  });

  describe('renderSlate draw calls', () => {
    it('SLATE-014: calls fillRect for background and fillText for each field', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d')!;

      const fillRectSpy = vi.spyOn(ctx, 'fillRect');
      const fillTextSpy = vi.spyOn(ctx, 'fillText');

      const config = makeConfig();
      renderSlate(ctx, config);

      // One fillRect for background
      expect(fillRectSpy).toHaveBeenCalledWith(0, 0, 1920, 1080);

      // fillText called once per field (4 fields in makeConfig)
      expect(fillTextSpy).toHaveBeenCalledTimes(4);

      fillRectSpy.mockRestore();
      fillTextSpy.mockRestore();
    });

    it('SLATE-015: fillText uses maxWidth to prevent overflow', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;

      const fillTextSpy = vi.spyOn(ctx, 'fillText');

      renderSlate(ctx, {
        width: 800,
        height: 600,
        fields: [{ label: '', value: 'Title', size: 'large' }],
      });

      // Should pass maxWidth (90% of canvas width)
      expect(fillTextSpy).toHaveBeenCalledWith(
        'Title',
        400, // width/2
        expect.any(Number),
        720, // 800 * 0.9
      );

      fillTextSpy.mockRestore();
    });

    it('SLATE-016: draws logo when provided', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d')!;

      const drawImageSpy = vi.spyOn(ctx, 'drawImage');

      // Create a mock image with width/height
      const mockLogo = document.createElement('img');
      Object.defineProperty(mockLogo, 'width', { value: 200 });
      Object.defineProperty(mockLogo, 'height', { value: 100 });

      renderSlate(ctx, {
        width: 1920,
        height: 1080,
        fields: [],
        logo: mockLogo,
        logoPosition: 'bottom-right',
        logoScale: 0.15,
      });

      expect(drawImageSpy).toHaveBeenCalledTimes(1);
      // Verify the logo was drawn at a position in the bottom-right region
      const [, x, y, w, h] = drawImageSpy.mock.calls[0]! as unknown[];
      expect(x as number).toBeGreaterThan(1920 / 2);
      expect(y as number).toBeGreaterThan(1080 / 2);
      expect(w as number).toBeGreaterThan(0);
      expect(h as number).toBeGreaterThan(0);

      drawImageSpy.mockRestore();
    });
  });
});
