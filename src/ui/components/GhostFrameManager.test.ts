import { describe, it, expect, beforeEach } from 'vitest';
import { GhostFrameManager } from './GhostFrameManager';
import { DEFAULT_GHOST_FRAME_STATE, GhostFrameState } from './GhostFrameControl';

describe('GhostFrameManager', () => {
  let mgr: GhostFrameManager;

  beforeEach(() => {
    mgr = new GhostFrameManager();
  });

  // ===========================================================================
  // 1. State management
  // ===========================================================================

  describe('state management', () => {
    it('GFM-U001: initial state matches DEFAULT_GHOST_FRAME_STATE', () => {
      const state = mgr.getState();
      expect(state).toEqual(DEFAULT_GHOST_FRAME_STATE);
    });

    it('GFM-U002: setState updates internal state', () => {
      const newState: GhostFrameState = {
        enabled: true,
        framesBefore: 3,
        framesAfter: 4,
        opacityBase: 0.4,
        opacityFalloff: 0.8,
        colorTint: true,
      };
      mgr.setState(newState);
      expect(mgr.getState()).toEqual(newState);
    });

    it('GFM-U003: getState returns a copy of current state', () => {
      const state = mgr.getState();
      expect(state.enabled).toBe(false);
      expect(state.framesBefore).toBe(2);
    });

    it('GFM-U004: resetState restores DEFAULT_GHOST_FRAME_STATE', () => {
      mgr.setState({
        enabled: true,
        framesBefore: 5,
        framesAfter: 5,
        opacityBase: 0.5,
        opacityFalloff: 0.9,
        colorTint: true,
      });
      mgr.resetState();
      expect(mgr.getState()).toEqual(DEFAULT_GHOST_FRAME_STATE);
    });

    it('GFM-U005: enabled getter reflects state.enabled', () => {
      expect(mgr.enabled).toBe(false);
      mgr.setState({ ...DEFAULT_GHOST_FRAME_STATE, enabled: true });
      expect(mgr.enabled).toBe(true);
    });

    it('GFM-U006: state getter returns internal state reference', () => {
      const state = mgr.state;
      // The state getter returns the internal reference (unlike getState)
      expect(state).toEqual(DEFAULT_GHOST_FRAME_STATE);
    });
  });

  // ===========================================================================
  // 2. Deep-copy semantics
  // ===========================================================================

  describe('deep-copy semantics', () => {
    it('GFM-U007: mutations to getState() result do not affect internal state', () => {
      const returned = mgr.getState();
      returned.enabled = true;
      returned.framesBefore = 99;
      // Internal state should be unchanged
      expect(mgr.getState().enabled).toBe(false);
      expect(mgr.getState().framesBefore).toBe(2);
    });

    it('GFM-U008: mutations to object passed to setState do not retroactively change internal state', () => {
      const input: GhostFrameState = {
        enabled: true,
        framesBefore: 3,
        framesAfter: 3,
        opacityBase: 0.4,
        opacityFalloff: 0.8,
        colorTint: true,
      };
      mgr.setState(input);
      // Mutate the original input after setState
      input.framesBefore = 99;
      input.enabled = false;
      // Internal state should be unchanged
      expect(mgr.getState().framesBefore).toBe(3);
      expect(mgr.getState().enabled).toBe(true);
    });
  });

  // ===========================================================================
  // 3. Canvas pool creation
  // ===========================================================================

  describe('canvas pool creation', () => {
    it('GFM-U009: getPoolCanvas creates a canvas on first call', () => {
      const result = mgr.getPoolCanvas(0, 100, 50);
      expect(result).not.toBeNull();
      expect(result!.canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(result!.ctx).toBeDefined();
      expect(result!.canvas.width).toBe(100);
      expect(result!.canvas.height).toBe(50);
    });

    it('GFM-U010: created canvas has the correct dimensions', () => {
      const result = mgr.getPoolCanvas(0, 640, 480);
      expect(result!.canvas.width).toBe(640);
      expect(result!.canvas.height).toBe(480);
    });
  });

  // ===========================================================================
  // 4. Canvas pool reuse
  // ===========================================================================

  describe('canvas pool reuse', () => {
    it('GFM-U011: getPoolCanvas returns the same entry for the same index', () => {
      const first = mgr.getPoolCanvas(0, 100, 50);
      const second = mgr.getPoolCanvas(0, 100, 50);
      expect(first).toBe(second);
      expect(first!.canvas).toBe(second!.canvas);
    });

    it('GFM-U012: pool length does not grow when accessing existing index', () => {
      mgr.getPoolCanvas(0, 100, 50);
      expect(mgr.canvasPool.length).toBe(1);
      mgr.getPoolCanvas(0, 100, 50);
      expect(mgr.canvasPool.length).toBe(1);
    });
  });

  // ===========================================================================
  // 5. Pool growth
  // ===========================================================================

  describe('pool growth', () => {
    it('GFM-U013: getPoolCanvas grows pool for new indices', () => {
      mgr.getPoolCanvas(0, 200, 100);
      expect(mgr.canvasPool.length).toBe(1);

      mgr.getPoolCanvas(1, 200, 100);
      expect(mgr.canvasPool.length).toBe(2);

      mgr.getPoolCanvas(2, 200, 100);
      expect(mgr.canvasPool.length).toBe(3);
    });

    it('GFM-U014: each new pool entry is a distinct canvas', () => {
      const a = mgr.getPoolCanvas(0, 200, 100);
      const b = mgr.getPoolCanvas(1, 200, 100);
      expect(a!.canvas).not.toBe(b!.canvas);
    });
  });

  // ===========================================================================
  // 6. Pool resize
  // ===========================================================================

  describe('pool resize', () => {
    it('GFM-U015: existing canvases are resized when width/height change', () => {
      const entry0 = mgr.getPoolCanvas(0, 100, 50);
      const entry1 = mgr.getPoolCanvas(1, 100, 50);
      expect(entry0!.canvas.width).toBe(100);
      expect(entry0!.canvas.height).toBe(50);

      // Request with new dimensions triggers resize of all existing entries
      mgr.getPoolCanvas(0, 200, 150);
      expect(entry0!.canvas.width).toBe(200);
      expect(entry0!.canvas.height).toBe(150);
      expect(entry1!.canvas.width).toBe(200);
      expect(entry1!.canvas.height).toBe(150);
    });

    it('GFM-U016: poolWidth and poolHeight update after resize', () => {
      mgr.getPoolCanvas(0, 100, 50);
      expect(mgr.poolWidth).toBe(100);
      expect(mgr.poolHeight).toBe(50);

      mgr.getPoolCanvas(0, 320, 240);
      expect(mgr.poolWidth).toBe(320);
      expect(mgr.poolHeight).toBe(240);
    });

    it('GFM-U017: no resize occurs when dimensions are unchanged', () => {
      const entry = mgr.getPoolCanvas(0, 100, 50);
      const originalCanvas = entry!.canvas;
      // Call again with same dimensions
      mgr.getPoolCanvas(0, 100, 50);
      // Canvas reference should be the same (no recreation)
      expect(mgr.canvasPool[0]!.canvas).toBe(originalCanvas);
    });
  });

  // ===========================================================================
  // 7. Pool trim
  // ===========================================================================

  describe('pool trim', () => {
    it('GFM-U018: trimPool removes excess entries', () => {
      mgr.getPoolCanvas(0, 100, 50);
      mgr.getPoolCanvas(1, 100, 50);
      mgr.getPoolCanvas(2, 100, 50);
      expect(mgr.canvasPool.length).toBe(3);

      mgr.trimPool(1);
      expect(mgr.canvasPool.length).toBe(1);
    });

    it('GFM-U019: trimPool with count >= pool length does nothing', () => {
      mgr.getPoolCanvas(0, 100, 50);
      mgr.getPoolCanvas(1, 100, 50);
      expect(mgr.canvasPool.length).toBe(2);

      mgr.trimPool(5);
      expect(mgr.canvasPool.length).toBe(2);

      mgr.trimPool(2);
      expect(mgr.canvasPool.length).toBe(2);
    });

    it('GFM-U020: trimPool to 0 empties the pool array', () => {
      mgr.getPoolCanvas(0, 100, 50);
      mgr.getPoolCanvas(1, 100, 50);
      mgr.trimPool(0);
      expect(mgr.canvasPool.length).toBe(0);
    });
  });

  // ===========================================================================
  // 8. Pool clear
  // ===========================================================================

  describe('pool clear', () => {
    it('GFM-U021: clearPool resets pool, poolWidth, and poolHeight', () => {
      mgr.getPoolCanvas(0, 100, 50);
      mgr.getPoolCanvas(1, 100, 50);
      expect(mgr.canvasPool.length).toBe(2);
      expect(mgr.poolWidth).toBe(100);
      expect(mgr.poolHeight).toBe(50);

      mgr.clearPool();
      expect(mgr.canvasPool.length).toBe(0);
      expect(mgr.poolWidth).toBe(0);
      expect(mgr.poolHeight).toBe(0);
    });

    it('GFM-U022: setState with enabled=false triggers clearPool', () => {
      mgr.getPoolCanvas(0, 100, 50);
      mgr.getPoolCanvas(1, 100, 50);
      expect(mgr.canvasPool.length).toBe(2);

      mgr.setState({ ...DEFAULT_GHOST_FRAME_STATE, enabled: false });
      expect(mgr.canvasPool.length).toBe(0);
      expect(mgr.poolWidth).toBe(0);
      expect(mgr.poolHeight).toBe(0);
    });

    it('GFM-U023: setState with enabled=true does not clear pool', () => {
      mgr.getPoolCanvas(0, 100, 50);
      mgr.getPoolCanvas(1, 100, 50);
      expect(mgr.canvasPool.length).toBe(2);

      mgr.setState({ ...DEFAULT_GHOST_FRAME_STATE, enabled: true });
      expect(mgr.canvasPool.length).toBe(2);
    });

    it('GFM-U024: resetState clears the pool', () => {
      mgr.getPoolCanvas(0, 100, 50);
      expect(mgr.canvasPool.length).toBe(1);

      mgr.resetState();
      expect(mgr.canvasPool.length).toBe(0);
      expect(mgr.poolWidth).toBe(0);
      expect(mgr.poolHeight).toBe(0);
    });
  });

  // ===========================================================================
  // 9. Pool inspection
  // ===========================================================================

  describe('pool inspection', () => {
    it('GFM-U025: canvasPool getter returns current pool entries', () => {
      expect(mgr.canvasPool).toEqual([]);
      mgr.getPoolCanvas(0, 100, 50);
      expect(mgr.canvasPool.length).toBe(1);
      expect(mgr.canvasPool[0]!.canvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('GFM-U026: poolWidth and poolHeight start at 0', () => {
      expect(mgr.poolWidth).toBe(0);
      expect(mgr.poolHeight).toBe(0);
    });

    it('GFM-U027: poolWidth and poolHeight reflect dimensions after getPoolCanvas', () => {
      mgr.getPoolCanvas(0, 800, 600);
      expect(mgr.poolWidth).toBe(800);
      expect(mgr.poolHeight).toBe(600);
    });
  });

  // ===========================================================================
  // 10. Dispose
  // ===========================================================================

  describe('dispose', () => {
    it('GFM-U028: dispose clears the pool', () => {
      mgr.getPoolCanvas(0, 100, 50);
      mgr.getPoolCanvas(1, 100, 50);
      expect(mgr.canvasPool.length).toBe(2);

      mgr.dispose();
      expect(mgr.canvasPool.length).toBe(0);
      expect(mgr.poolWidth).toBe(0);
      expect(mgr.poolHeight).toBe(0);
    });

    it('GFM-U029: dispose can be called on a fresh manager without error', () => {
      expect(() => mgr.dispose()).not.toThrow();
      expect(mgr.canvasPool.length).toBe(0);
    });
  });
});
