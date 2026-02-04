/**
 * ViewerSplitScreen Unit Tests
 *
 * Tests for batch style mutation optimization in split screen line positioning.
 * Verifies that cssText is used instead of individual style assignments,
 * all CSS properties from creation are preserved, gradient backgrounds are
 * correct, and display/hide logic works.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSplitScreenUIElements,
  updateSplitScreenPosition,
  SplitScreenUIElements,
  SplitScreenState,
} from './ViewerSplitScreen';

// Helper to create mock DOMRect
function makeDOMRect(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    width: w,
    height: h,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  };
}

describe('ViewerSplitScreen', () => {
  let container: HTMLElement;
  let elements: SplitScreenUIElements;
  const containerRect = makeDOMRect(0, 0, 1000, 800);
  const canvasRect = makeDOMRect(100, 50, 800, 600);
  const displayWidth = 800;
  const displayHeight = 600;

  beforeEach(() => {
    container = document.createElement('div');
    elements = createSplitScreenUIElements(container);
  });

  describe('createSplitScreenUIElements', () => {
    it('BSM-S001: creates splitLine with correct base styles', () => {
      const { splitLine } = elements;
      expect(splitLine.style.position).toBe('absolute');
      expect(splitLine.style.zIndex).toBe('52');
      expect(splitLine.style.display).toBe('none');
    });

    it('BSM-S002: creates labelA with correct base styles', () => {
      const { labelA } = elements;
      expect(labelA.style.position).toBe('absolute');
      expect(labelA.style.fontSize).toBe('13px');
      expect(labelA.style.fontWeight).toBe('700');
      expect(labelA.style.zIndex).toBe('53');
      expect(labelA.style.pointerEvents).toBe('none');
      expect(labelA.style.display).toBe('none');
    });

    it('BSM-S003: creates labelB with correct base styles', () => {
      const { labelB } = elements;
      expect(labelB.style.position).toBe('absolute');
      expect(labelB.style.fontSize).toBe('13px');
      expect(labelB.style.fontWeight).toBe('700');
      expect(labelB.style.zIndex).toBe('53');
      expect(labelB.style.pointerEvents).toBe('none');
      expect(labelB.style.display).toBe('none');
    });

    it('BSM-S004: appends all elements to container', () => {
      expect(container.children.length).toBe(3);
    });

    it('BSM-S005: elements have correct test ids', () => {
      expect(elements.splitLine.dataset.testid).toBe('split-screen-line');
      expect(elements.labelA.dataset.testid).toBe('split-screen-label-a');
      expect(elements.labelB.dataset.testid).toBe('split-screen-label-b');
    });

    it('BSM-S006: elements have correct class names', () => {
      expect(elements.splitLine.className).toBe('split-screen-line');
      expect(elements.labelA.className).toBe('split-screen-label-a');
      expect(elements.labelB.className).toBe('split-screen-label-b');
    });

    it('BSM-S007: labels have correct text content', () => {
      expect(elements.labelA.textContent).toBe('A');
      expect(elements.labelB.textContent).toBe('B');
    });
  });

  describe('updateSplitScreenPosition - off mode', () => {
    it('BSM-S010: hides all elements when mode is off', () => {
      const state: SplitScreenState = { mode: 'off', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.splitLine.style.display).toBe('none');
      expect(elements.labelA.style.display).toBe('none');
      expect(elements.labelB.style.display).toBe('none');
    });
  });

  describe('updateSplitScreenPosition - horizontal split (splitscreen-h)', () => {
    it('BSM-S020: uses cssText for batch style update on split line', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const style = elements.splitLine.style;
      expect(style.position).toBe('absolute');
      expect(style.display).toBe('block');
      expect(style.width).toBe('4px');
      expect(style.cursor).toBe('ew-resize');
      expect(style.zIndex).toBe('52');
    });

    it('BSM-S021: preserves gradient background in horizontal split mode', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const cssText = elements.splitLine.style.cssText;
      expect(cssText).toContain('linear-gradient');
      expect(cssText).toContain('to bottom');
    });

    it('BSM-S022: preserves box-shadow in base styles after update', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const cssText = elements.splitLine.style.cssText;
      expect(cssText).toContain('box-shadow');
    });

    it('BSM-S023: sets correct dimensions for horizontal split line (width=4px)', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.splitLine.style.width).toBe('4px');
      expect(elements.splitLine.style.height).toBe(`${displayHeight}px`);
    });

    it('BSM-S024: positions split line correctly at position=0.5', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasLeft = canvasRect.left - containerRect.left;
      const canvasTop = canvasRect.top - containerRect.top;
      const expectedX = canvasLeft + displayWidth * 0.5;

      expect(elements.splitLine.style.left).toBe(`${expectedX - 2}px`);
      expect(elements.splitLine.style.top).toBe(`${canvasTop}px`);
    });

    it('BSM-S025: sets cursor to ew-resize in horizontal split mode', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.splitLine.style.cursor).toBe('ew-resize');
    });

    it('BSM-S026: shows labels when position is in mid-range (0.5)', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.labelA.style.display).toBe('block');
      expect(elements.labelB.style.display).toBe('block');
    });

    it('BSM-S027: hides label A when position < 0.1 (low threshold)', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.05 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.labelA.style.display).toBe('none');
      expect(elements.labelB.style.display).toBe('block');
    });

    it('BSM-S028: hides label B when position > 0.9 (high threshold)', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.95 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.labelA.style.display).toBe('block');
      expect(elements.labelB.style.display).toBe('none');
    });

    it('BSM-S029: label A uses cssText with correct base styles when visible', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const style = elements.labelA.style;
      expect(style.position).toBe('absolute');
      expect(style.fontSize).toBe('13px');
      expect(style.fontWeight).toBe('700');
      expect(style.zIndex).toBe('53');
      expect(style.pointerEvents).toBe('none');
      expect(style.display).toBe('block');
    });

    it('BSM-S030: label B uses cssText with correct base styles when visible', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const style = elements.labelB.style;
      expect(style.position).toBe('absolute');
      expect(style.fontSize).toBe('13px');
      expect(style.fontWeight).toBe('700');
      expect(style.zIndex).toBe('53');
      expect(style.pointerEvents).toBe('none');
      expect(style.display).toBe('block');
    });

    it('BSM-S031: positions labels correctly in horizontal split mode', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasLeft = canvasRect.left - containerRect.left;
      const canvasTop = canvasRect.top - containerRect.top;

      // Label A: bottom-left corner
      expect(elements.labelA.style.left).toBe(`${canvasLeft + 12}px`);
      expect(elements.labelA.style.top).toBe(`${canvasTop + displayHeight - 40}px`);

      // Label B: bottom-right corner
      expect(elements.labelB.style.left).toBe(`${canvasLeft + displayWidth - 40}px`);
      expect(elements.labelB.style.top).toBe(`${canvasTop + displayHeight - 40}px`);
    });
  });

  describe('updateSplitScreenPosition - vertical split (splitscreen-v)', () => {
    it('BSM-S040: uses cssText for batch style update on split line in vertical mode', () => {
      const state: SplitScreenState = { mode: 'splitscreen-v', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const style = elements.splitLine.style;
      expect(style.position).toBe('absolute');
      expect(style.display).toBe('block');
      expect(style.height).toBe('4px');
      expect(style.cursor).toBe('ns-resize');
      expect(style.zIndex).toBe('52');
    });

    it('BSM-S041: preserves gradient background in vertical split mode', () => {
      const state: SplitScreenState = { mode: 'splitscreen-v', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const cssText = elements.splitLine.style.cssText;
      expect(cssText).toContain('linear-gradient');
      expect(cssText).toContain('to right');
    });

    it('BSM-S042: sets correct dimensions for vertical split line (height=4px)', () => {
      const state: SplitScreenState = { mode: 'splitscreen-v', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.splitLine.style.width).toBe(`${displayWidth}px`);
      expect(elements.splitLine.style.height).toBe('4px');
    });

    it('BSM-S043: positions split line correctly at position=0.5 in vertical mode', () => {
      const state: SplitScreenState = { mode: 'splitscreen-v', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasLeft = canvasRect.left - containerRect.left;
      const canvasTop = canvasRect.top - containerRect.top;
      const expectedY = canvasTop + displayHeight * 0.5;

      expect(elements.splitLine.style.left).toBe(`${canvasLeft}px`);
      expect(elements.splitLine.style.top).toBe(`${expectedY - 2}px`);
    });

    it('BSM-S044: sets cursor to ns-resize in vertical split mode', () => {
      const state: SplitScreenState = { mode: 'splitscreen-v', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.splitLine.style.cursor).toBe('ns-resize');
    });

    it('BSM-S045: shows labels when position is in mid-range in vertical mode', () => {
      const state: SplitScreenState = { mode: 'splitscreen-v', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.labelA.style.display).toBe('block');
      expect(elements.labelB.style.display).toBe('block');
    });

    it('BSM-S046: hides label A when position < 0.1 in vertical mode', () => {
      const state: SplitScreenState = { mode: 'splitscreen-v', position: 0.05 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.labelA.style.display).toBe('none');
      expect(elements.labelB.style.display).toBe('block');
    });

    it('BSM-S047: hides label B when position > 0.9 in vertical mode', () => {
      const state: SplitScreenState = { mode: 'splitscreen-v', position: 0.95 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.labelA.style.display).toBe('block');
      expect(elements.labelB.style.display).toBe('none');
    });

    it('BSM-S048: positions labels correctly in vertical split mode', () => {
      const state: SplitScreenState = { mode: 'splitscreen-v', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasLeft = canvasRect.left - containerRect.left;
      const canvasTop = canvasRect.top - containerRect.top;

      // Label A: top-left corner
      expect(elements.labelA.style.left).toBe(`${canvasLeft + 12}px`);
      expect(elements.labelA.style.top).toBe(`${canvasTop + 12}px`);

      // Label B: bottom-left corner
      expect(elements.labelB.style.left).toBe(`${canvasLeft + 12}px`);
      expect(elements.labelB.style.top).toBe(`${canvasTop + displayHeight - 40}px`);
    });
  });

  describe('updateSplitScreenPosition - boundary thresholds', () => {
    it('BSM-S050: label A visible at exactly position=0.1', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.1 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      // position is NOT < 0.1, so label A should be visible
      expect(elements.labelA.style.display).toBe('block');
    });

    it('BSM-S051: label B visible at exactly position=0.9', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.9 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      // position is NOT > 0.9, so label B should be visible
      expect(elements.labelB.style.display).toBe('block');
    });

    it('BSM-S052: label A hidden at position=0.0', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.0 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.labelA.style.display).toBe('none');
      expect(elements.labelB.style.display).toBe('block');
    });

    it('BSM-S053: label B hidden at position=1.0', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 1.0 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.labelA.style.display).toBe('block');
      expect(elements.labelB.style.display).toBe('none');
    });
  });

  describe('updateSplitScreenPosition - dynamic position values', () => {
    it('BSM-S060: split line position updates correctly at position=0.25', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.25 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasLeft = canvasRect.left - containerRect.left;
      const expectedX = canvasLeft + displayWidth * 0.25;
      expect(elements.splitLine.style.left).toBe(`${expectedX - 2}px`);
    });

    it('BSM-S061: split line position updates correctly at position=0.75', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.75 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasLeft = canvasRect.left - containerRect.left;
      const expectedX = canvasLeft + displayWidth * 0.75;
      expect(elements.splitLine.style.left).toBe(`${expectedX - 2}px`);
    });

    it('BSM-S062: vertical split line position updates correctly at position=0.3', () => {
      const state: SplitScreenState = { mode: 'splitscreen-v', position: 0.3 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasTop = canvasRect.top - containerRect.top;
      const expectedY = canvasTop + displayHeight * 0.3;
      expect(elements.splitLine.style.top).toBe(`${expectedY - 2}px`);
    });
  });

  describe('base style constant consistency', () => {
    it('BSM-S070: split line base styles match creation z-index', () => {
      // After creation, z-index is 52
      expect(elements.splitLine.style.zIndex).toBe('52');

      // After update, z-index should still be 52
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.splitLine.style.zIndex).toBe('52');
    });

    it('BSM-S071: label A base styles preserve z-index after update', () => {
      expect(elements.labelA.style.zIndex).toBe('53');

      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.labelA.style.zIndex).toBe('53');
    });

    it('BSM-S072: label B base styles preserve z-index after update', () => {
      expect(elements.labelB.style.zIndex).toBe('53');

      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.labelB.style.zIndex).toBe('53');
    });

    it('BSM-S073: label A preserves font-size and font-weight after update', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.labelA.style.fontSize).toBe('13px');
      expect(elements.labelA.style.fontWeight).toBe('700');
    });

    it('BSM-S074: label B preserves font-size and font-weight after update', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.labelB.style.fontSize).toBe('13px');
      expect(elements.labelB.style.fontWeight).toBe('700');
    });

    it('BSM-S075: label A preserves pointer-events: none after update', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.labelA.style.pointerEvents).toBe('none');
    });

    it('BSM-S076: label B preserves pointer-events: none after update', () => {
      const state: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.labelB.style.pointerEvents).toBe('none');
    });
  });

  describe('mode switching', () => {
    it('BSM-S080: switching from horizontal split to off hides all elements', () => {
      const horizState: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(horizState, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.splitLine.style.display).toBe('block');

      const offState: SplitScreenState = { mode: 'off', position: 0.5 };
      updateSplitScreenPosition(offState, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.splitLine.style.display).toBe('none');
      expect(elements.labelA.style.display).toBe('none');
      expect(elements.labelB.style.display).toBe('none');
    });

    it('BSM-S081: switching from horizontal to vertical split changes cursor and dimensions', () => {
      const horizState: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(horizState, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.splitLine.style.cursor).toBe('ew-resize');
      expect(elements.splitLine.style.width).toBe('4px');

      const vertState: SplitScreenState = { mode: 'splitscreen-v', position: 0.5 };
      updateSplitScreenPosition(vertState, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.splitLine.style.cursor).toBe('ns-resize');
      expect(elements.splitLine.style.height).toBe('4px');
      expect(elements.splitLine.style.width).toBe(`${displayWidth}px`);
    });

    it('BSM-S082: switching between modes changes gradient direction', () => {
      const horizState: SplitScreenState = { mode: 'splitscreen-h', position: 0.5 };
      updateSplitScreenPosition(horizState, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.splitLine.style.cssText).toContain('to bottom');

      const vertState: SplitScreenState = { mode: 'splitscreen-v', position: 0.5 };
      updateSplitScreenPosition(vertState, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.splitLine.style.cssText).toContain('to right');
    });
  });
});
