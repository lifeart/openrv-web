/**
 * PaintRenderer Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PaintRenderer, RenderOptions } from './PaintRenderer';
import { PenStroke, TextAnnotation, BrushType, StrokeMode, TextOrigin, LineCap, LineJoin } from './types';

describe('PaintRenderer', () => {
  let renderer: PaintRenderer;

  beforeEach(() => {
    renderer = new PaintRenderer();
  });

  describe('initialization', () => {
    it('RND-001: creates canvas element', () => {
      const canvas = renderer.getCanvas();
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('RND-002: canvas has 2D context', () => {
      const canvas = renderer.getCanvas();
      const ctx = canvas.getContext('2d');
      expect(ctx).not.toBeNull();
    });
  });

  describe('getCanvas', () => {
    it('RND-003: returns the internal canvas', () => {
      const canvas1 = renderer.getCanvas();
      const canvas2 = renderer.getCanvas();
      expect(canvas1).toBe(canvas2);
    });
  });

  describe('resize', () => {
    it('RND-004: updates canvas dimensions', () => {
      renderer.resize(800, 600);
      const canvas = renderer.getCanvas();
      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(600);
    });

    it('RND-005: handles zero dimensions', () => {
      renderer.resize(0, 0);
      const canvas = renderer.getCanvas();
      expect(canvas.width).toBe(0);
      expect(canvas.height).toBe(0);
    });

    it('RND-006: handles large dimensions', () => {
      renderer.resize(4096, 2160);
      const canvas = renderer.getCanvas();
      expect(canvas.width).toBe(4096);
      expect(canvas.height).toBe(2160);
    });
  });

  describe('clear', () => {
    it('RND-007: clears the canvas', () => {
      renderer.resize(100, 100);
      renderer.clear();
      // The clear operation should not throw
    });
  });

  describe('renderAnnotations', () => {
    const defaultOptions: RenderOptions = {
      width: 800,
      height: 600,
    };

    it('RND-008: renders empty annotations array', () => {
      expect(() => {
        renderer.renderAnnotations([], defaultOptions);
      }).not.toThrow();
    });

    it('RND-009: resizes canvas to match options', () => {
      renderer.renderAnnotations([], { width: 1920, height: 1080 });
      const canvas = renderer.getCanvas();
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });

    it('RND-010: renders pen stroke annotation', () => {
      const stroke: PenStroke = {
        type: 'pen',
        id: 'test-stroke',
        frame: 1,
        user: 'test',
        color: [1, 0, 0, 1], // Red
        width: 5,
        brush: BrushType.Circle,
        points: [
          { x: 0.1, y: 0.1, pressure: 0.5 },
          { x: 0.5, y: 0.5, pressure: 0.5 },
          { x: 0.9, y: 0.9, pressure: 0.5 },
        ],
        join: LineJoin.Round,
        cap: LineCap.Round,
        splat: false,
        mode: StrokeMode.Draw,
        startFrame: 1,
        duration: 1,
      };

      expect(() => {
        renderer.renderAnnotations([{ annotation: stroke, opacity: 1 }], defaultOptions);
      }).not.toThrow();
    });

    it('RND-011: renders text annotation', () => {
      const text: TextAnnotation = {
        type: 'text',
        id: 'test-text',
        frame: 1,
        user: 'test',
        text: 'Hello World',
        position: { x: 0.5, y: 0.5 },
        color: [1, 1, 1, 1],
        size: 24,
        font: 'Arial',
        scale: 1,
        origin: TextOrigin.Center,
        rotation: 0,
        spacing: 0,
        startFrame: 1,
        duration: 1,
      };

      expect(() => {
        renderer.renderAnnotations([{ annotation: text, opacity: 1 }], defaultOptions);
      }).not.toThrow();
    });

    it('RND-012: applies opacity to annotations', () => {
      const stroke: PenStroke = {
        type: 'pen',
        id: 'test-stroke',
        frame: 1,
        user: 'test',
        color: [1, 0, 0, 1],
        width: 5,
        brush: BrushType.Circle,
        points: [{ x: 0.5, y: 0.5, pressure: 0.5 }],
        join: LineJoin.Round,
        cap: LineCap.Round,
        splat: false,
        mode: StrokeMode.Draw,
        startFrame: 1,
        duration: 1,
      };

      expect(() => {
        renderer.renderAnnotations([{ annotation: stroke, opacity: 0.5 }], defaultOptions);
      }).not.toThrow();
    });

    it('RND-013: respects overall opacity option', () => {
      const stroke: PenStroke = {
        type: 'pen',
        id: 'test-stroke',
        frame: 1,
        user: 'test',
        color: [1, 0, 0, 1],
        width: 5,
        brush: BrushType.Circle,
        points: [{ x: 0.5, y: 0.5, pressure: 0.5 }],
        join: LineJoin.Round,
        cap: LineCap.Round,
        splat: false,
        mode: StrokeMode.Draw,
        startFrame: 1,
        duration: 1,
      };

      expect(() => {
        renderer.renderAnnotations(
          [{ annotation: stroke, opacity: 1 }],
          { ...defaultOptions, opacity: 0.5 }
        );
      }).not.toThrow();
    });
  });

  describe('renderStroke', () => {
    const defaultOptions: RenderOptions = {
      width: 800,
      height: 600,
    };

    it('RND-014: renders empty points array without error', () => {
      const stroke: PenStroke = {
        type: 'pen',
        id: 'empty',
        frame: 1,
        user: 'test',
        color: [1, 0, 0, 1],
        width: 5,
        brush: BrushType.Circle,
        points: [],
        join: LineJoin.Round,
        cap: LineCap.Round,
        splat: false,
        mode: StrokeMode.Draw,
        startFrame: 1,
        duration: 1,
      };

      expect(() => {
        renderer.renderStroke(stroke, defaultOptions);
      }).not.toThrow();
    });

    it('RND-015: renders single point as circle', () => {
      const stroke: PenStroke = {
        type: 'pen',
        id: 'single-point',
        frame: 1,
        user: 'test',
        color: [0, 1, 0, 1],
        width: 10,
        brush: BrushType.Circle,
        points: [{ x: 0.5, y: 0.5, pressure: 1 }],
        join: LineJoin.Round,
        cap: LineCap.Round,
        splat: false,
        mode: StrokeMode.Draw,
        startFrame: 1,
        duration: 1,
      };

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderStroke(stroke, defaultOptions);
      }).not.toThrow();
    });

    it('RND-016: renders multi-point stroke as path', () => {
      const stroke: PenStroke = {
        type: 'pen',
        id: 'multi-point',
        frame: 1,
        user: 'test',
        color: [0, 0, 1, 1],
        width: 3,
        brush: BrushType.Circle,
        points: [
          { x: 0.1, y: 0.5, pressure: 0.5 },
          { x: 0.3, y: 0.3, pressure: 0.6 },
          { x: 0.5, y: 0.5, pressure: 0.7 },
          { x: 0.7, y: 0.3, pressure: 0.6 },
          { x: 0.9, y: 0.5, pressure: 0.5 },
        ],
        join: LineJoin.Round,
        cap: LineCap.Round,
        splat: false,
        mode: StrokeMode.Draw,
        startFrame: 1,
        duration: 1,
      };

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderStroke(stroke, defaultOptions);
      }).not.toThrow();
    });

    it('RND-017: handles eraser mode', () => {
      const stroke: PenStroke = {
        type: 'pen',
        id: 'eraser',
        frame: 1,
        user: 'test',
        color: [1, 1, 1, 1],
        width: 20,
        brush: BrushType.Circle,
        points: [
          { x: 0.2, y: 0.5, pressure: 1 },
          { x: 0.8, y: 0.5, pressure: 1 },
        ],
        join: LineJoin.Round,
        cap: LineCap.Round,
        splat: false,
        mode: StrokeMode.Erase,
        startFrame: 1,
        duration: 1,
      };

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderStroke(stroke, defaultOptions);
      }).not.toThrow();
    });

    it('RND-018: handles variable width strokes', () => {
      const stroke: PenStroke = {
        type: 'pen',
        id: 'variable-width',
        frame: 1,
        user: 'test',
        color: [1, 0, 1, 1],
        width: [2, 5, 10, 5, 2], // Variable width array
        brush: BrushType.Circle,
        points: [
          { x: 0.1, y: 0.5, pressure: 0.2 },
          { x: 0.3, y: 0.5, pressure: 0.5 },
          { x: 0.5, y: 0.5, pressure: 1.0 },
          { x: 0.7, y: 0.5, pressure: 0.5 },
          { x: 0.9, y: 0.5, pressure: 0.2 },
        ],
        join: LineJoin.Round,
        cap: LineCap.Round,
        splat: false,
        mode: StrokeMode.Draw,
        startFrame: 1,
        duration: 1,
      };

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderStroke(stroke, defaultOptions);
      }).not.toThrow();
    });

    it('RND-019: handles Gaussian brush type', () => {
      const stroke: PenStroke = {
        type: 'pen',
        id: 'gaussian',
        frame: 1,
        user: 'test',
        color: [1, 0.5, 0, 0.5],
        width: 15,
        brush: BrushType.Gaussian,
        points: [
          { x: 0.3, y: 0.5, pressure: 0.8 },
          { x: 0.5, y: 0.5, pressure: 1.0 },
          { x: 0.7, y: 0.5, pressure: 0.8 },
        ],
        join: LineJoin.Round,
        cap: LineCap.Round,
        splat: true,
        mode: StrokeMode.Draw,
        startFrame: 1,
        duration: 1,
      };

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderStroke(stroke, defaultOptions);
      }).not.toThrow();
    });

    it('RND-020: respects different line caps', () => {
      const caps = [LineCap.NoCap, LineCap.Square, LineCap.Round];

      for (const cap of caps) {
        const stroke: PenStroke = {
          type: 'pen',
          id: `cap-${cap}`,
          frame: 1,
          user: 'test',
          color: [1, 1, 1, 1],
          width: 10,
          brush: BrushType.Circle,
          points: [
            { x: 0.2, y: 0.5, pressure: 1 },
            { x: 0.8, y: 0.5, pressure: 1 },
          ],
          join: LineJoin.Round,
          cap,
          splat: false,
          mode: StrokeMode.Draw,
          startFrame: 1,
          duration: 1,
        };

        renderer.resize(800, 600);
        expect(() => {
          renderer.renderStroke(stroke, defaultOptions);
        }).not.toThrow();
      }
    });

    it('RND-021: respects different line joins', () => {
      const joins = [LineJoin.Miter, LineJoin.Bevel, LineJoin.Round];

      for (const join of joins) {
        const stroke: PenStroke = {
          type: 'pen',
          id: `join-${join}`,
          frame: 1,
          user: 'test',
          color: [1, 1, 1, 1],
          width: 10,
          brush: BrushType.Circle,
          points: [
            { x: 0.2, y: 0.2, pressure: 1 },
            { x: 0.5, y: 0.8, pressure: 1 },
            { x: 0.8, y: 0.2, pressure: 1 },
          ],
          join,
          cap: LineCap.Round,
          splat: false,
          mode: StrokeMode.Draw,
          startFrame: 1,
          duration: 1,
        };

        renderer.resize(800, 600);
        expect(() => {
          renderer.renderStroke(stroke, defaultOptions);
        }).not.toThrow();
      }
    });
  });

  describe('renderText', () => {
    const defaultOptions: RenderOptions = {
      width: 800,
      height: 600,
    };

    it('RND-022: renders basic text', () => {
      const text: TextAnnotation = {
        type: 'text',
        id: 'basic-text',
        frame: 1,
        user: 'test',
        text: 'Test Text',
        position: { x: 0.5, y: 0.5 },
        color: [1, 1, 1, 1],
        size: 24,
        font: 'sans-serif',
        scale: 1,
        origin: TextOrigin.Center,
        rotation: 0,
        spacing: 0,
        startFrame: 1,
        duration: 1,
      };

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderText(text, defaultOptions);
      }).not.toThrow();
    });

    it('RND-023: handles different text origins', () => {
      const origins = [
        TextOrigin.TopLeft,
        TextOrigin.TopCenter,
        TextOrigin.TopRight,
        TextOrigin.CenterLeft,
        TextOrigin.Center,
        TextOrigin.CenterRight,
        TextOrigin.BottomLeft,
        TextOrigin.BottomCenter,
        TextOrigin.BottomRight,
      ];

      for (const origin of origins) {
        const text: TextAnnotation = {
          type: 'text',
          id: `text-origin-${origin}`,
          frame: 1,
          user: 'test',
          text: 'Origin Test',
          position: { x: 0.5, y: 0.5 },
          color: [1, 1, 1, 1],
          size: 20,
          font: 'sans-serif',
          scale: 1,
          origin,
          rotation: 0,
          spacing: 0,
          startFrame: 1,
          duration: 1,
        };

        renderer.resize(800, 600);
        expect(() => {
          renderer.renderText(text, defaultOptions);
        }).not.toThrow();
      }
    });

    it('RND-024: handles text rotation', () => {
      const text: TextAnnotation = {
        type: 'text',
        id: 'rotated-text',
        frame: 1,
        user: 'test',
        text: 'Rotated',
        position: { x: 0.5, y: 0.5 },
        color: [1, 1, 1, 1],
        size: 24,
        font: 'sans-serif',
        scale: 1,
        origin: TextOrigin.Center,
        rotation: 45,
        spacing: 0,
        startFrame: 1,
        duration: 1,
      };

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderText(text, defaultOptions);
      }).not.toThrow();
    });

    it('RND-025: handles text scale', () => {
      const text: TextAnnotation = {
        type: 'text',
        id: 'scaled-text',
        frame: 1,
        user: 'test',
        text: 'Scaled',
        position: { x: 0.5, y: 0.5 },
        color: [1, 1, 1, 1],
        size: 24,
        font: 'sans-serif',
        scale: 2.5,
        origin: TextOrigin.Center,
        rotation: 0,
        spacing: 0,
        startFrame: 1,
        duration: 1,
      };

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderText(text, defaultOptions);
      }).not.toThrow();
    });
  });

  describe('renderLiveStroke', () => {
    const defaultOptions: RenderOptions = {
      width: 800,
      height: 600,
    };

    it('RND-026: renders empty points without error', () => {
      expect(() => {
        renderer.renderLiveStroke([], [1, 0, 0, 1], 5, BrushType.Circle, false, defaultOptions);
      }).not.toThrow();
    });

    it('RND-027: renders live stroke in draw mode', () => {
      const points = [
        { x: 0.2, y: 0.5, pressure: 0.5 },
        { x: 0.5, y: 0.3, pressure: 0.7 },
        { x: 0.8, y: 0.5, pressure: 0.5 },
      ];

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderLiveStroke(points, [0, 1, 0, 1], 8, BrushType.Circle, false, defaultOptions);
      }).not.toThrow();
    });

    it('RND-028: renders live stroke in eraser mode', () => {
      const points = [
        { x: 0.3, y: 0.5, pressure: 1 },
        { x: 0.7, y: 0.5, pressure: 1 },
      ];

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderLiveStroke(points, [1, 1, 1, 1], 20, BrushType.Circle, true, defaultOptions);
      }).not.toThrow();
    });

    it('RND-029: resizes canvas if dimensions differ', () => {
      renderer.resize(640, 480);
      const newOptions: RenderOptions = { width: 1920, height: 1080 };

      renderer.renderLiveStroke(
        [{ x: 0.5, y: 0.5, pressure: 0.5 }],
        [1, 0, 0, 1],
        5,
        BrushType.Circle,
        false,
        newOptions
      );

      const canvas = renderer.getCanvas();
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });

    it('RND-030: handles Gaussian brush for live stroke', () => {
      const points = [
        { x: 0.3, y: 0.5, pressure: 0.8 },
        { x: 0.5, y: 0.5, pressure: 1.0 },
        { x: 0.7, y: 0.5, pressure: 0.8 },
      ];

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderLiveStroke(points, [0.5, 0, 1, 0.7], 15, BrushType.Gaussian, false, defaultOptions);
      }).not.toThrow();
    });
  });

  describe('color handling', () => {
    const defaultOptions: RenderOptions = {
      width: 800,
      height: 600,
    };

    it('RND-031: handles fully opaque colors', () => {
      const stroke: PenStroke = {
        type: 'pen',
        id: 'opaque',
        frame: 1,
        user: 'test',
        color: [1, 0, 0, 1], // Fully opaque red
        width: 5,
        brush: BrushType.Circle,
        points: [{ x: 0.5, y: 0.5, pressure: 1 }],
        join: LineJoin.Round,
        cap: LineCap.Round,
        splat: false,
        mode: StrokeMode.Draw,
        startFrame: 1,
        duration: 1,
      };

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderStroke(stroke, defaultOptions);
      }).not.toThrow();
    });

    it('RND-032: handles semi-transparent colors', () => {
      const stroke: PenStroke = {
        type: 'pen',
        id: 'semi-transparent',
        frame: 1,
        user: 'test',
        color: [0, 1, 0, 0.5], // 50% transparent green
        width: 10,
        brush: BrushType.Circle,
        points: [
          { x: 0.3, y: 0.5, pressure: 1 },
          { x: 0.7, y: 0.5, pressure: 1 },
        ],
        join: LineJoin.Round,
        cap: LineCap.Round,
        splat: false,
        mode: StrokeMode.Draw,
        startFrame: 1,
        duration: 1,
      };

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderStroke(stroke, defaultOptions);
      }).not.toThrow();
    });

    it('RND-033: handles fully transparent colors', () => {
      const stroke: PenStroke = {
        type: 'pen',
        id: 'transparent',
        frame: 1,
        user: 'test',
        color: [0, 0, 1, 0], // Fully transparent blue
        width: 5,
        brush: BrushType.Circle,
        points: [{ x: 0.5, y: 0.5, pressure: 1 }],
        join: LineJoin.Round,
        cap: LineCap.Round,
        splat: false,
        mode: StrokeMode.Draw,
        startFrame: 1,
        duration: 1,
      };

      renderer.resize(800, 600);
      expect(() => {
        renderer.renderStroke(stroke, defaultOptions);
      }).not.toThrow();
    });
  });

  // ====================================================================
  // Phase 3: Color space support
  // ====================================================================
  describe('color space support', () => {
    it('P3-030: constructs without colorSpace (backward compatible)', () => {
      const r = new PaintRenderer();
      expect(r.getCanvas()).toBeInstanceOf(HTMLCanvasElement);
    });

    it('P3-031: constructs with srgb colorSpace', () => {
      const r = new PaintRenderer('srgb');
      expect(r.getCanvas()).toBeInstanceOf(HTMLCanvasElement);
    });

    it('P3-032: constructs with display-p3 colorSpace without throwing', () => {
      // In jsdom, display-p3 may not be supported, but safeCanvasContext2D
      // falls back gracefully
      const r = new PaintRenderer('display-p3');
      expect(r.getCanvas()).toBeInstanceOf(HTMLCanvasElement);
    });

    it('P3-033: canvas works normally regardless of colorSpace', () => {
      const r = new PaintRenderer('display-p3');
      r.resize(100, 100);
      r.clear();
      // Should not throw
      expect(r.getCanvas().width).toBe(100);
    });
  });
});
