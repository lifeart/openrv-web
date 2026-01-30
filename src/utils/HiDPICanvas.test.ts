/**
 * HiDPICanvas Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDevicePixelRatio,
  setupHiDPICanvas,
  resizeHiDPICanvas,
  createHiDPICanvas,
  logicalToPhysical,
  physicalToLogical,
  isHiDPI,
  clientToCanvasCoordinates,
  resetCanvasFromHiDPI,
} from './HiDPICanvas';

describe('HiDPICanvas', () => {
  let originalDevicePixelRatio: number;

  beforeEach(() => {
    // Store original value
    originalDevicePixelRatio = window.devicePixelRatio;
  });

  afterEach(() => {
    // Restore original value
    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDevicePixelRatio,
      writable: true,
      configurable: true,
    });
  });

  const setDevicePixelRatio = (value: number) => {
    Object.defineProperty(window, 'devicePixelRatio', {
      value,
      writable: true,
      configurable: true,
    });
  };

  describe('getDevicePixelRatio', () => {
    it('HDPI-001: returns window.devicePixelRatio', () => {
      setDevicePixelRatio(2);
      expect(getDevicePixelRatio()).toBe(2);
    });

    it('HDPI-002: returns 1 when devicePixelRatio is undefined', () => {
      Object.defineProperty(window, 'devicePixelRatio', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(getDevicePixelRatio()).toBe(1);
    });

    it('HDPI-003: handles various DPR values', () => {
      const testValues = [1, 1.5, 2, 2.5, 3];
      for (const value of testValues) {
        setDevicePixelRatio(value);
        expect(getDevicePixelRatio()).toBe(value);
      }
    });
  });

  describe('setupHiDPICanvas', () => {
    it('HDPI-004: sets canvas physical dimensions correctly for 2x DPR', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const result = setupHiDPICanvas({
        canvas,
        ctx,
        width: 256,
        height: 100,
      });

      expect(canvas.width).toBe(512);
      expect(canvas.height).toBe(200);
      expect(result.physicalWidth).toBe(512);
      expect(result.physicalHeight).toBe(200);
      expect(result.logicalWidth).toBe(256);
      expect(result.logicalHeight).toBe(100);
      expect(result.dpr).toBe(2);
    });

    it('HDPI-005: sets canvas physical dimensions correctly for 1x DPR', () => {
      setDevicePixelRatio(1);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const result = setupHiDPICanvas({
        canvas,
        ctx,
        width: 256,
        height: 100,
      });

      expect(canvas.width).toBe(256);
      expect(canvas.height).toBe(100);
      expect(result.physicalWidth).toBe(256);
      expect(result.physicalHeight).toBe(100);
    });

    it('HDPI-006: sets CSS style dimensions correctly', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      setupHiDPICanvas({
        canvas,
        ctx,
        width: 256,
        height: 100,
      });

      expect(canvas.style.width).toBe('256px');
      expect(canvas.style.height).toBe('100px');
    });

    it('HDPI-007: skips CSS style when setStyle is false', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      setupHiDPICanvas({
        canvas,
        ctx,
        width: 256,
        height: 100,
        setStyle: false,
      });

      expect(canvas.style.width).toBe('');
      expect(canvas.style.height).toBe('');
    });

    it('HDPI-008: scales context correctly', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const setTransformSpy = vi.spyOn(ctx, 'setTransform');
      const scaleSpy = vi.spyOn(ctx, 'scale');

      setupHiDPICanvas({
        canvas,
        ctx,
        width: 256,
        height: 100,
      });

      expect(setTransformSpy).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
      expect(scaleSpy).toHaveBeenCalledWith(2, 2);
    });

    it('HDPI-009: handles fractional DPR values', () => {
      setDevicePixelRatio(1.5);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const result = setupHiDPICanvas({
        canvas,
        ctx,
        width: 200,
        height: 100,
      });

      expect(canvas.width).toBe(300);
      expect(canvas.height).toBe(150);
      expect(result.physicalWidth).toBe(300);
      expect(result.physicalHeight).toBe(150);
    });

    it('HDPI-010: handles 3x DPR (iPhone Plus/Max)', () => {
      setDevicePixelRatio(3);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const result = setupHiDPICanvas({
        canvas,
        ctx,
        width: 100,
        height: 100,
      });

      expect(canvas.width).toBe(300);
      expect(canvas.height).toBe(300);
      expect(result.dpr).toBe(3);
    });
  });

  describe('resizeHiDPICanvas', () => {
    it('HDPI-011: resizes canvas with hi-DPI support', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // Initial setup
      setupHiDPICanvas({
        canvas,
        ctx,
        width: 256,
        height: 100,
      });

      // Resize
      const result = resizeHiDPICanvas({
        canvas,
        ctx,
        width: 512,
        height: 200,
      });

      expect(canvas.width).toBe(1024);
      expect(canvas.height).toBe(400);
      expect(result.physicalWidth).toBe(1024);
      expect(result.physicalHeight).toBe(400);
      expect(result.logicalWidth).toBe(512);
      expect(result.logicalHeight).toBe(200);
    });

    it('HDPI-012: resets transform on resize', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      setupHiDPICanvas({ canvas, ctx, width: 100, height: 100 });

      const setTransformSpy = vi.spyOn(ctx, 'setTransform');
      const scaleSpy = vi.spyOn(ctx, 'scale');

      resizeHiDPICanvas({ canvas, ctx, width: 200, height: 200 });

      expect(setTransformSpy).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
      expect(scaleSpy).toHaveBeenCalledWith(2, 2);
    });
  });

  describe('createHiDPICanvas', () => {
    it('HDPI-013: creates canvas with hi-DPI support', () => {
      setDevicePixelRatio(2);

      const result = createHiDPICanvas(256, 100);

      expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(result.ctx).toBeDefined();
      expect(result.canvas.width).toBe(512);
      expect(result.canvas.height).toBe(200);
      expect(result.dpr).toBe(2);
      expect(result.physicalWidth).toBe(512);
      expect(result.physicalHeight).toBe(200);
    });

    it('HDPI-014: creates canvas with context options', () => {
      setDevicePixelRatio(1);

      const result = createHiDPICanvas(100, 100, { alpha: false });

      expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(result.ctx).toBeDefined();
    });

    it('HDPI-015: creates canvas at 1x DPR', () => {
      setDevicePixelRatio(1);

      const result = createHiDPICanvas(256, 100);

      expect(result.canvas.width).toBe(256);
      expect(result.canvas.height).toBe(100);
      expect(result.dpr).toBe(1);
    });
  });

  describe('logicalToPhysical', () => {
    it('HDPI-016: converts logical to physical coordinates at 2x', () => {
      setDevicePixelRatio(2);

      expect(logicalToPhysical(100)).toBe(200);
      expect(logicalToPhysical(50)).toBe(100);
      expect(logicalToPhysical(0)).toBe(0);
    });

    it('HDPI-017: converts with explicit DPR', () => {
      expect(logicalToPhysical(100, 3)).toBe(300);
      expect(logicalToPhysical(100, 1.5)).toBe(150);
    });

    it('HDPI-018: floors fractional results', () => {
      expect(logicalToPhysical(100, 1.5)).toBe(150);
      expect(logicalToPhysical(101, 1.5)).toBe(151);
    });
  });

  describe('physicalToLogical', () => {
    it('HDPI-019: converts physical to logical coordinates at 2x', () => {
      setDevicePixelRatio(2);

      expect(physicalToLogical(200)).toBe(100);
      expect(physicalToLogical(100)).toBe(50);
      expect(physicalToLogical(0)).toBe(0);
    });

    it('HDPI-020: converts with explicit DPR', () => {
      expect(physicalToLogical(300, 3)).toBe(100);
      expect(physicalToLogical(150, 1.5)).toBe(100);
    });
  });

  describe('isHiDPI', () => {
    it('HDPI-021: returns true for DPR > 1', () => {
      setDevicePixelRatio(2);
      expect(isHiDPI()).toBe(true);

      setDevicePixelRatio(1.5);
      expect(isHiDPI()).toBe(true);

      setDevicePixelRatio(3);
      expect(isHiDPI()).toBe(true);
    });

    it('HDPI-022: returns false for DPR = 1', () => {
      setDevicePixelRatio(1);
      expect(isHiDPI()).toBe(false);
    });

    it('HDPI-023: returns false for DPR < 1', () => {
      setDevicePixelRatio(0.75);
      expect(isHiDPI()).toBe(false);
    });
  });

  describe('clientToCanvasCoordinates', () => {
    it('HDPI-027: converts client coords to logical coords when CSS matches logical', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      setupHiDPICanvas({ canvas, ctx, width: 200, height: 200 });

      // Mock getBoundingClientRect to return CSS dimensions
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      // Click at center (100, 100 in client coords)
      const result = clientToCanvasCoordinates(canvas, 100, 100, 200, 200);
      expect(result.x).toBe(100);
      expect(result.y).toBe(100);
    });

    it('HDPI-028: converts client coords when CSS is scaled up', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      setupHiDPICanvas({ canvas, ctx, width: 200, height: 200 });

      // Mock getBoundingClientRect to return CSS dimensions (e.g., CSS scaled to 400x400)
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        right: 400,
        bottom: 400,
        width: 400,
        height: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      // Click at (200, 200) in client coords should map to (100, 100) in logical coords
      const result = clientToCanvasCoordinates(canvas, 200, 200, 200, 200);
      expect(result.x).toBe(100);
      expect(result.y).toBe(100);
    });

    it('HDPI-029: converts client coords when CSS is scaled down', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      setupHiDPICanvas({ canvas, ctx, width: 200, height: 200 });

      // Mock getBoundingClientRect to return CSS dimensions (e.g., CSS scaled to 100x100)
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      // Click at (50, 50) in client coords should map to (100, 100) in logical coords
      const result = clientToCanvasCoordinates(canvas, 50, 50, 200, 200);
      expect(result.x).toBe(100);
      expect(result.y).toBe(100);
    });

    it('HDPI-030: handles offset canvas position', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      setupHiDPICanvas({ canvas, ctx, width: 200, height: 200 });

      // Mock canvas positioned at (50, 100)
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 50,
        top: 100,
        right: 250,
        bottom: 300,
        width: 200,
        height: 200,
        x: 50,
        y: 100,
        toJSON: () => ({}),
      });

      // Click at (150, 200) in client coords (100, 100 relative to canvas)
      const result = clientToCanvasCoordinates(canvas, 150, 200, 200, 200);
      expect(result.x).toBe(100);
      expect(result.y).toBe(100);
    });

    it('HDPI-031: returns (0, 0) for click at canvas origin', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      setupHiDPICanvas({ canvas, ctx, width: 200, height: 200 });

      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 10,
        top: 20,
        right: 210,
        bottom: 220,
        width: 200,
        height: 200,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      });

      const result = clientToCanvasCoordinates(canvas, 10, 20, 200, 200);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });

    it('HDPI-032: handles non-square canvas with different scales', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      setupHiDPICanvas({ canvas, ctx, width: 300, height: 200 });

      // CSS renders at different aspect ratio (300x200 -> 150x200)
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        right: 150,
        bottom: 200,
        width: 150,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      // Click at (75, 100) in CSS coords
      const result = clientToCanvasCoordinates(canvas, 75, 100, 300, 200);
      // x: 75 * (300/150) = 150, y: 100 * (200/200) = 100
      expect(result.x).toBe(150);
      expect(result.y).toBe(100);
    });
  });

  describe('resetCanvasFromHiDPI', () => {
    it('HDPI-033: resets canvas from hi-DPI to standard mode', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // Setup in hi-DPI mode
      setupHiDPICanvas({ canvas, ctx, width: 200, height: 100 });

      expect(canvas.width).toBe(400); // Physical: 200 * 2
      expect(canvas.height).toBe(200); // Physical: 100 * 2
      expect(canvas.style.width).toBe('200px');
      expect(canvas.style.height).toBe('100px');

      // Reset to standard mode
      resetCanvasFromHiDPI(canvas, ctx, 300, 150);

      expect(canvas.width).toBe(300); // Now logical = physical
      expect(canvas.height).toBe(150);
      expect(canvas.style.width).toBe('');
      expect(canvas.style.height).toBe('');
    });

    it('HDPI-034: resets context transform to identity', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // Setup in hi-DPI mode (context is scaled by 2x)
      setupHiDPICanvas({ canvas, ctx, width: 200, height: 100 });

      const setTransformSpy = vi.spyOn(ctx, 'setTransform');

      // Reset to standard mode
      resetCanvasFromHiDPI(canvas, ctx, 300, 150);

      // Should reset transform to identity
      expect(setTransformSpy).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    });

    it('HDPI-035: clears CSS style dimensions', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // Manually set CSS styles
      canvas.style.width = '500px';
      canvas.style.height = '400px';

      // Reset should clear them
      resetCanvasFromHiDPI(canvas, ctx, 200, 150);

      expect(canvas.style.width).toBe('');
      expect(canvas.style.height).toBe('');
    });

    it('HDPI-036: works even when canvas was not in hi-DPI mode', () => {
      setDevicePixelRatio(1);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = 100;
      canvas.height = 100;

      // Reset (even though it wasn't in hi-DPI mode)
      resetCanvasFromHiDPI(canvas, ctx, 200, 150);

      expect(canvas.width).toBe(200);
      expect(canvas.height).toBe(150);
      expect(canvas.style.width).toBe('');
      expect(canvas.style.height).toBe('');
    });
  });

  describe('integration scenarios', () => {
    it('HDPI-024: drawing at logical coordinates renders correctly', () => {
      setDevicePixelRatio(2);

      const { canvas, ctx } = createHiDPICanvas(100, 100);

      // Draw a rectangle using logical coordinates
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, 100, 100);

      // The canvas should have physical dimensions of 200x200
      expect(canvas.width).toBe(200);
      expect(canvas.height).toBe(200);

      // The CSS size should be 100x100
      expect(canvas.style.width).toBe('100px');
      expect(canvas.style.height).toBe('100px');
    });

    it('HDPI-025: handles window resize scenario', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // Initial size
      setupHiDPICanvas({ canvas, ctx, width: 100, height: 100 });
      expect(canvas.width).toBe(200);

      // Simulate window resize
      resizeHiDPICanvas({ canvas, ctx, width: 200, height: 150 });
      expect(canvas.width).toBe(400);
      expect(canvas.height).toBe(300);
      expect(canvas.style.width).toBe('200px');
      expect(canvas.style.height).toBe('150px');
    });

    it('HDPI-026: maintains correct dimensions after multiple resizes', () => {
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const sizes = [
        { width: 100, height: 100 },
        { width: 200, height: 150 },
        { width: 50, height: 50 },
        { width: 300, height: 200 },
      ];

      for (const size of sizes) {
        const result = resizeHiDPICanvas({
          canvas,
          ctx,
          width: size.width,
          height: size.height,
        });

        expect(canvas.width).toBe(size.width * 2);
        expect(canvas.height).toBe(size.height * 2);
        expect(result.logicalWidth).toBe(size.width);
        expect(result.logicalHeight).toBe(size.height);
      }
    });
  });
});
