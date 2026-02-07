import { describe, it, expect, beforeEach } from 'vitest';
import { WipeManager } from './WipeManager';
import { DEFAULT_WIPE_STATE, WipeState } from './WipeControl';

describe('WipeManager', () => {
  let mgr: WipeManager;

  beforeEach(() => {
    mgr = new WipeManager();
  });

  // ===========================================================================
  // 1. State management
  // ===========================================================================

  describe('state management', () => {
    it('WM-U001: initial state matches DEFAULT_WIPE_STATE', () => {
      expect(mgr.getState()).toEqual(DEFAULT_WIPE_STATE);
    });

    it('WM-U002: setState updates internal state', () => {
      const newState: WipeState = { mode: 'horizontal', position: 0.3, showOriginal: 'right' };
      mgr.setState(newState);
      expect(mgr.getState()).toEqual(newState);
    });

    it('WM-U003: resetState restores DEFAULT_WIPE_STATE', () => {
      mgr.setState({ mode: 'vertical', position: 0.7, showOriginal: 'top' });
      mgr.resetState();
      expect(mgr.getState()).toEqual(DEFAULT_WIPE_STATE);
    });

    it('WM-U004: mode getter reflects state.mode', () => {
      expect(mgr.mode).toBe('off');
      mgr.setMode('horizontal');
      expect(mgr.mode).toBe('horizontal');
    });

    it('WM-U005: position getter reflects state.position', () => {
      expect(mgr.position).toBe(0.5);
      mgr.setPosition(0.3);
      expect(mgr.position).toBe(0.3);
    });

    it('WM-U006: setPosition clamps to [0, 1]', () => {
      mgr.setPosition(1.5);
      expect(mgr.position).toBe(1);
      mgr.setPosition(-0.5);
      expect(mgr.position).toBe(0);
    });

    it('WM-U007: isOff is true when mode is off', () => {
      expect(mgr.isOff).toBe(true);
      mgr.setMode('horizontal');
      expect(mgr.isOff).toBe(false);
    });

    it('WM-U008: isSplitScreen detects split screen modes', () => {
      expect(mgr.isSplitScreen).toBe(false);
      mgr.setMode('splitscreen-h');
      expect(mgr.isSplitScreen).toBe(true);
      mgr.setMode('splitscreen-v');
      expect(mgr.isSplitScreen).toBe(true);
      mgr.setMode('horizontal');
      expect(mgr.isSplitScreen).toBe(false);
    });

    it('WM-U009: state getter returns internal reference', () => {
      const s = mgr.state;
      expect(s).toEqual(DEFAULT_WIPE_STATE);
    });
  });

  // ===========================================================================
  // 2. Deep-copy semantics
  // ===========================================================================

  describe('deep-copy semantics', () => {
    it('WM-U010: mutations to getState() result do not affect internal state', () => {
      const returned = mgr.getState();
      returned.mode = 'vertical';
      returned.position = 0.99;
      expect(mgr.getState().mode).toBe('off');
      expect(mgr.getState().position).toBe(0.5);
    });

    it('WM-U011: setState deep-copies the input', () => {
      const input: WipeState = { mode: 'horizontal', position: 0.4, showOriginal: 'left' };
      mgr.setState(input);
      input.mode = 'off';
      input.position = 0.0;
      expect(mgr.getState().mode).toBe('horizontal');
      expect(mgr.getState().position).toBe(0.4);
    });
  });

  // ===========================================================================
  // 3. Labels
  // ===========================================================================

  describe('labels', () => {
    it('WM-U012: getLabels returns defaults when no UI initialized', () => {
      const labels = mgr.getLabels();
      expect(labels.labelA).toBe('Original');
      expect(labels.labelB).toBe('Graded');
    });

    it('WM-U013: getLabels returns defaults after initUI', () => {
      const container = document.createElement('div');
      mgr.initUI(container);
      const labels = mgr.getLabels();
      expect(labels.labelA).toBe('Original');
      expect(labels.labelB).toBe('Graded');
    });

    it('WM-U014: setLabels updates label text', () => {
      const container = document.createElement('div');
      mgr.initUI(container);
      mgr.setLabels('Source A', 'Source B');
      const labels = mgr.getLabels();
      expect(labels.labelA).toBe('Source A');
      expect(labels.labelB).toBe('Source B');
    });

    it('WM-U015: setLabels is a no-op before initUI', () => {
      // Should not throw
      mgr.setLabels('X', 'Y');
      expect(mgr.getLabels()).toEqual({ labelA: 'Original', labelB: 'Graded' });
    });
  });

  // ===========================================================================
  // 4. UI initialization
  // ===========================================================================

  describe('UI initialization', () => {
    it('WM-U016: initUI creates wipe and split screen elements', () => {
      const container = document.createElement('div');
      mgr.initUI(container);
      expect(mgr.wipeLine).toBeInstanceOf(HTMLElement);
      expect(mgr.splitLine).toBeInstanceOf(HTMLElement);
    });

    it('WM-U017: wipeLine/splitLine are null before initUI', () => {
      expect(mgr.wipeLine).toBeNull();
      expect(mgr.splitLine).toBeNull();
    });

    it('WM-U018: initUI appends elements to container', () => {
      const container = document.createElement('div');
      const childCountBefore = container.children.length;
      mgr.initUI(container);
      // createWipeUIElements adds 3 elements (line, labelA, labelB)
      // createSplitScreenUIElements adds 3 elements (line, labelA, labelB)
      expect(container.children.length).toBe(childCountBefore + 6);
    });
  });

  // ===========================================================================
  // 5. Pointer handling
  // ===========================================================================

  describe('pointer handling', () => {
    it('WM-U019: handlePointerDown returns false when mode is off', () => {
      const e = new MouseEvent('pointerdown', { clientX: 100, clientY: 100 }) as unknown as PointerEvent;
      expect(mgr.handlePointerDown(e)).toBe(false);
    });

    it('WM-U020: isDragging is false initially', () => {
      expect(mgr.isDragging).toBe(false);
    });

    it('WM-U021: handlePointerUp resets dragging flags', () => {
      // Access internal state via casting to verify
      const internal = mgr as unknown as { _isDraggingWipe: boolean; _isDraggingSplit: boolean };
      internal._isDraggingWipe = true;
      internal._isDraggingSplit = true;
      expect(mgr.isDragging).toBe(true);
      mgr.handlePointerUp();
      expect(mgr.isDragging).toBe(false);
    });

    it('WM-U022: handlePointerDown returns false for wipe mode without elements', () => {
      mgr.setMode('horizontal');
      const e = new MouseEvent('pointerdown', { clientX: 100, clientY: 100 }) as unknown as PointerEvent;
      expect(mgr.handlePointerDown(e)).toBe(false);
    });

    it('WM-U023: handlePointerMove returns false when not dragging', () => {
      const e = new MouseEvent('pointermove', { clientX: 100, clientY: 100 }) as unknown as PointerEvent;
      const rect = new DOMRect(0, 0, 800, 600);
      expect(mgr.handlePointerMove(e, rect, rect, 800, 600)).toBe(false);
    });
  });

  // ===========================================================================
  // 6. Dispose
  // ===========================================================================

  describe('dispose', () => {
    it('WM-U024: dispose nulls out element refs', () => {
      const container = document.createElement('div');
      mgr.initUI(container);
      expect(mgr.wipeLine).not.toBeNull();
      expect(mgr.splitLine).not.toBeNull();
      mgr.dispose();
      expect(mgr.wipeLine).toBeNull();
      expect(mgr.splitLine).toBeNull();
    });

    it('WM-U025: dispose is safe to call without initUI', () => {
      // Should not throw
      mgr.dispose();
      expect(mgr.wipeLine).toBeNull();
    });
  });

  // ===========================================================================
  // 7. UI position updates
  // ===========================================================================

  describe('UI position updates', () => {
    it('WM-U026: updateWipeLine is a no-op without elements', () => {
      // Should not throw
      const rect = new DOMRect(0, 0, 800, 600);
      mgr.updateWipeLine(rect, rect, 800, 600);
    });

    it('WM-U027: updateSplitScreenLine is a no-op without elements', () => {
      // Should not throw
      const rect = new DOMRect(0, 0, 800, 600);
      mgr.updateSplitScreenLine(rect, rect, 800, 600);
    });

    it('WM-U028: updateWipeLine hides wipe elements in split screen mode', () => {
      const container = document.createElement('div');
      mgr.initUI(container);
      mgr.setMode('splitscreen-h');
      const rect = new DOMRect(0, 0, 800, 600);
      mgr.updateWipeLine(rect, rect, 800, 600);
      expect(mgr.wipeLine!.style.display).toBe('none');
    });

    it('WM-U029: updateSplitScreenLine hides split elements when not in split mode', () => {
      const container = document.createElement('div');
      mgr.initUI(container);
      mgr.setMode('horizontal');
      const rect = new DOMRect(0, 0, 800, 600);
      mgr.updateSplitScreenLine(rect, rect, 800, 600);
      expect(mgr.splitLine!.style.display).toBe('none');
    });
  });
});
