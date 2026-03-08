/**
 * Unit tests for shared timeline rendering helpers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  drawPlayhead,
  drawInOutBrackets,
  drawInOutRange,
  drawPlayedRegion,
  drawMarkLines,
  drawAnnotationTriangles,
} from './timelineRenderHelpers';

function createMockCtx(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    globalAlpha: 1.0,
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('timelineRenderHelpers', () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  describe('drawPlayhead', () => {
    it('TRHELP-001: draws glow, line, and circle', () => {
      drawPlayhead(ctx, 100, 0, 42, '#ff0000', 'rgba(255,0,0,0.3)', 9);

      // Glow circle
      expect(ctx.arc).toHaveBeenCalledWith(100, 21, 14, 0, Math.PI * 2);
      // Line
      expect(ctx.fillRect).toHaveBeenCalledWith(98.5, -10, 3, 62);
      // Handle circle
      expect(ctx.arc).toHaveBeenCalledWith(100, -10, 9, 0, Math.PI * 2);
    });

    it('TRHELP-002: uses correct colors for glow and playhead', () => {
      const fillStyles: string[] = [];
      Object.defineProperty(ctx, 'fillStyle', {
        set(v: string) {
          fillStyles.push(v);
        },
        get() {
          return fillStyles[fillStyles.length - 1] || '';
        },
      });

      drawPlayhead(ctx, 50, 0, 40, '#00ff00', 'rgba(0,255,0,0.3)', 8);

      expect(fillStyles).toContain('rgba(0,255,0,0.3)'); // glow
      expect(fillStyles).toContain('#00ff00'); // playhead color
    });
  });

  describe('drawInOutBrackets', () => {
    it('TRHELP-003: draws in and out bracket markers', () => {
      drawInOutBrackets(ctx, 100, 300, 0, 42, '#0000ff');

      // Should draw fillRects for both brackets
      // In bracket: 3 rects, Out bracket: 3 rects
      expect(ctx.fillRect).toHaveBeenCalledTimes(6);
    });

    it('TRHELP-004: sets correct fill color', () => {
      drawInOutBrackets(ctx, 100, 300, 0, 42, '#ff00ff');

      expect(ctx.fillStyle).toBe('#ff00ff');
    });
  });

  describe('drawInOutRange', () => {
    it('TRHELP-005: draws a filled rectangle between in and out positions', () => {
      drawInOutRange(ctx, 100, 300, 0, 42, 'rgba(0,0,255,0.13)');

      expect(ctx.fillRect).toHaveBeenCalledWith(100, 0, 200, 42);
      expect(ctx.fillStyle).toBe('rgba(0,0,255,0.13)');
    });
  });

  describe('drawPlayedRegion', () => {
    it('TRHELP-006: draws played region when width is positive', () => {
      drawPlayedRegion(ctx, 50, 200, 0, 42, 'rgba(255,0,0,0.2)');

      expect(ctx.fillRect).toHaveBeenCalledWith(50, 0, 150, 42);
    });

    it('TRHELP-007: does not draw when width is zero or negative', () => {
      drawPlayedRegion(ctx, 200, 200, 0, 42, 'rgba(255,0,0,0.2)');
      expect(ctx.fillRect).not.toHaveBeenCalled();

      drawPlayedRegion(ctx, 200, 100, 0, 42, 'rgba(255,0,0,0.2)');
      expect(ctx.fillRect).not.toHaveBeenCalled();
    });
  });

  describe('drawMarkLines', () => {
    it('TRHELP-008: draws point markers as vertical lines', () => {
      const marks = [{ frame: 10, color: '#ff0000' }];
      const frameToX = (f: number) => f * 10;

      drawMarkLines(ctx, marks, frameToX, 0, 42, '#00ff00', 100);

      expect(ctx.fillRect).toHaveBeenCalledWith(99, 0, 2, 42);
    });

    it('TRHELP-009: draws duration markers as ranges', () => {
      const marks = [{ frame: 10, endFrame: 20, color: '#ff0000' }];
      const frameToX = (f: number) => f * 10;

      drawMarkLines(ctx, marks, frameToX, 0, 42, '#00ff00', 100);

      // Should draw: range fill, start line, end line, top border, bottom border
      expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it('TRHELP-010: skips markers outside duration range', () => {
      const marks = [{ frame: 200, color: '#ff0000' }];
      const frameToX = (f: number) => f * 10;

      drawMarkLines(ctx, marks, frameToX, 0, 42, '#00ff00', 100);

      expect(ctx.fillRect).not.toHaveBeenCalled();
    });

    it('TRHELP-011: uses default color when marker has no color', () => {
      const marks = [{ frame: 10 }];
      const frameToX = (f: number) => f * 10;

      drawMarkLines(ctx, marks, frameToX, 0, 42, '#defaultColor', 100);

      expect(ctx.fillStyle).toBe('#defaultColor');
    });

    it('TRHELP-012: draws note indicator dot for markers with notes', () => {
      const marks = [{ frame: 10, note: 'test note' }];
      const frameToX = (f: number) => f * 10;

      drawMarkLines(ctx, marks, frameToX, 0, 42, '#ff0000', 100);

      // Should draw arc for note indicator
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });
  });

  describe('drawAnnotationTriangles', () => {
    it('TRHELP-013: draws triangles for annotated frames', () => {
      const annotatedFrames = new Set([10, 20, 30]);
      const frameToX = (f: number) => f * 5;

      drawAnnotationTriangles(ctx, annotatedFrames, frameToX, 0, 42, '#ffaa00', 100);

      // Should draw 3 triangles (3 beginPath, 3 moveTo, 6 lineTo, 3 closePath, 3 fill)
      expect(ctx.beginPath).toHaveBeenCalledTimes(3);
      expect(ctx.moveTo).toHaveBeenCalledTimes(3);
      expect(ctx.closePath).toHaveBeenCalledTimes(3);
      expect(ctx.fill).toHaveBeenCalledTimes(3);
    });

    it('TRHELP-014: skips frames outside duration', () => {
      const annotatedFrames = new Set([0, 200]);
      const frameToX = (f: number) => f * 5;

      drawAnnotationTriangles(ctx, annotatedFrames, frameToX, 0, 42, '#ffaa00', 100);

      // Frame 0 is < 1, frame 200 is > 100 duration
      expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    it('TRHELP-015: sets correct color', () => {
      const annotatedFrames = new Set([5]);
      const frameToX = (f: number) => f * 5;

      drawAnnotationTriangles(ctx, annotatedFrames, frameToX, 0, 42, '#123456', 100);

      expect(ctx.fillStyle).toBe('#123456');
    });
  });
});
