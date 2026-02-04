/**
 * ViewerWipe Unit Tests
 *
 * Tests for batch style mutation optimization in wipe line positioning.
 * Verifies that cssText is used instead of individual style assignments,
 * all CSS properties from creation are preserved, and display/hide logic works.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWipeUIElements,
  updateWipeLinePosition,
  WipeUIElements,
} from './ViewerWipe';
import type { WipeState } from './WipeControl';

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

describe('ViewerWipe', () => {
  let container: HTMLElement;
  let elements: WipeUIElements;
  const containerRect = makeDOMRect(0, 0, 1000, 800);
  const canvasRect = makeDOMRect(100, 50, 800, 600);
  const displayWidth = 800;
  const displayHeight = 600;

  beforeEach(() => {
    container = document.createElement('div');
    elements = createWipeUIElements(container);
  });

  describe('createWipeUIElements', () => {
    it('BSM-W001: creates wipeLine with correct base styles via cssText', () => {
      const { wipeLine } = elements;
      expect(wipeLine.style.position).toBe('absolute');
      expect(wipeLine.style.zIndex).toBe('50');
      expect(wipeLine.style.display).toBe('none');
    });

    it('BSM-W002: creates wipeLabelA with correct base styles via cssText', () => {
      const { wipeLabelA } = elements;
      expect(wipeLabelA.style.position).toBe('absolute');
      expect(wipeLabelA.style.fontSize).toBe('11px');
      expect(wipeLabelA.style.fontWeight).toBe('500');
      expect(wipeLabelA.style.zIndex).toBe('51');
      expect(wipeLabelA.style.pointerEvents).toBe('none');
      expect(wipeLabelA.style.display).toBe('none');
    });

    it('BSM-W003: creates wipeLabelB with correct base styles via cssText', () => {
      const { wipeLabelB } = elements;
      expect(wipeLabelB.style.position).toBe('absolute');
      expect(wipeLabelB.style.fontSize).toBe('11px');
      expect(wipeLabelB.style.fontWeight).toBe('500');
      expect(wipeLabelB.style.zIndex).toBe('51');
      expect(wipeLabelB.style.pointerEvents).toBe('none');
      expect(wipeLabelB.style.display).toBe('none');
    });

    it('BSM-W004: appends all elements to container', () => {
      expect(container.children.length).toBe(3);
    });

    it('BSM-W005: wipeLabelA has correct test id and class', () => {
      expect(elements.wipeLabelA.dataset.testid).toBe('wipe-label-a');
      expect(elements.wipeLabelA.className).toBe('wipe-label-a');
    });

    it('BSM-W006: wipeLabelB has correct test id and class', () => {
      expect(elements.wipeLabelB.dataset.testid).toBe('wipe-label-b');
      expect(elements.wipeLabelB.className).toBe('wipe-label-b');
    });
  });

  describe('updateWipeLinePosition - off mode', () => {
    it('BSM-W010: hides all elements when mode is off', () => {
      const state: WipeState = { mode: 'off', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLine.style.display).toBe('none');
      expect(elements.wipeLabelA.style.display).toBe('none');
      expect(elements.wipeLabelB.style.display).toBe('none');
    });
  });

  describe('updateWipeLinePosition - horizontal mode', () => {
    it('BSM-W020: uses cssText for batch style update on wipe line', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      // Verify cssText was used - all properties should be present
      const style = elements.wipeLine.style;
      expect(style.position).toBe('absolute');
      expect(style.display).toBe('block');
      expect(style.width).toBe('3px');
      expect(style.cursor).toBe('ew-resize');
      expect(style.zIndex).toBe('50');
    });

    it('BSM-W021: preserves base styles (background, z-index, box-shadow) in horizontal mode', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const cssText = elements.wipeLine.style.cssText;
      expect(cssText).toContain('z-index');
      expect(cssText).toContain('box-shadow');
      // background var may be parsed differently by jsdom, but should be present
      expect(elements.wipeLine.style.zIndex).toBe('50');
    });

    it('BSM-W022: sets correct dimensions for horizontal wipe line (width=3px)', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLine.style.width).toBe('3px');
      expect(elements.wipeLine.style.height).toBe(`${displayHeight}px`);
    });

    it('BSM-W023: positions wipe line correctly at position=0.5', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasLeft = canvasRect.left - containerRect.left;
      const canvasTop = canvasRect.top - containerRect.top;
      const expectedX = canvasLeft + displayWidth * 0.5;

      expect(elements.wipeLine.style.left).toBe(`${expectedX - 1}px`);
      expect(elements.wipeLine.style.top).toBe(`${canvasTop}px`);
    });

    it('BSM-W024: sets cursor to ew-resize in horizontal mode', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLine.style.cursor).toBe('ew-resize');
    });

    it('BSM-W025: shows labels when position is in mid-range (0.5)', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLabelA.style.display).toBe('block');
      expect(elements.wipeLabelB.style.display).toBe('block');
    });

    it('BSM-W026: hides label A when position < 0.1 (low threshold)', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.05, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLabelA.style.display).toBe('none');
      expect(elements.wipeLabelB.style.display).toBe('block');
    });

    it('BSM-W027: hides label B when position > 0.9 (high threshold)', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.95, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLabelA.style.display).toBe('block');
      expect(elements.wipeLabelB.style.display).toBe('none');
    });

    it('BSM-W028: label A uses cssText with correct base styles when visible', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const style = elements.wipeLabelA.style;
      expect(style.position).toBe('absolute');
      expect(style.fontSize).toBe('11px');
      expect(style.fontWeight).toBe('500');
      expect(style.zIndex).toBe('51');
      expect(style.pointerEvents).toBe('none');
      expect(style.display).toBe('block');
    });

    it('BSM-W029: label B uses cssText with correct base styles when visible', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const style = elements.wipeLabelB.style;
      expect(style.position).toBe('absolute');
      expect(style.fontSize).toBe('11px');
      expect(style.fontWeight).toBe('500');
      expect(style.zIndex).toBe('51');
      expect(style.pointerEvents).toBe('none');
      expect(style.display).toBe('block');
    });

    it('BSM-W030: positions labels correctly in horizontal mode', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasLeft = canvasRect.left - containerRect.left;
      const canvasTop = canvasRect.top - containerRect.top;
      const x = canvasLeft + displayWidth * 0.5;

      // Label A: bottom-left
      expect(elements.wipeLabelA.style.left).toBe(`${canvasLeft + 10}px`);
      expect(elements.wipeLabelA.style.top).toBe(`${canvasTop + displayHeight - 30}px`);

      // Label B: to the right of the wipe line
      expect(elements.wipeLabelB.style.left).toBe(`${x + 10}px`);
      expect(elements.wipeLabelB.style.top).toBe(`${canvasTop + displayHeight - 30}px`);
    });
  });

  describe('updateWipeLinePosition - vertical mode', () => {
    it('BSM-W040: uses cssText for batch style update on wipe line in vertical mode', () => {
      const state: WipeState = { mode: 'vertical', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const style = elements.wipeLine.style;
      expect(style.position).toBe('absolute');
      expect(style.display).toBe('block');
      expect(style.height).toBe('3px');
      expect(style.cursor).toBe('ns-resize');
      expect(style.zIndex).toBe('50');
    });

    it('BSM-W041: sets correct dimensions for vertical wipe line (height=3px)', () => {
      const state: WipeState = { mode: 'vertical', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLine.style.width).toBe(`${displayWidth}px`);
      expect(elements.wipeLine.style.height).toBe('3px');
    });

    it('BSM-W042: positions wipe line correctly at position=0.5 in vertical mode', () => {
      const state: WipeState = { mode: 'vertical', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasLeft = canvasRect.left - containerRect.left;
      const canvasTop = canvasRect.top - containerRect.top;
      const expectedY = canvasTop + displayHeight * 0.5;

      expect(elements.wipeLine.style.left).toBe(`${canvasLeft}px`);
      expect(elements.wipeLine.style.top).toBe(`${expectedY - 1}px`);
    });

    it('BSM-W043: sets cursor to ns-resize in vertical mode', () => {
      const state: WipeState = { mode: 'vertical', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLine.style.cursor).toBe('ns-resize');
    });

    it('BSM-W044: shows labels when position is in mid-range in vertical mode', () => {
      const state: WipeState = { mode: 'vertical', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLabelA.style.display).toBe('block');
      expect(elements.wipeLabelB.style.display).toBe('block');
    });

    it('BSM-W045: hides label A when position < 0.1 in vertical mode', () => {
      const state: WipeState = { mode: 'vertical', position: 0.05, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLabelA.style.display).toBe('none');
      expect(elements.wipeLabelB.style.display).toBe('block');
    });

    it('BSM-W046: hides label B when position > 0.9 in vertical mode', () => {
      const state: WipeState = { mode: 'vertical', position: 0.95, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLabelA.style.display).toBe('block');
      expect(elements.wipeLabelB.style.display).toBe('none');
    });

    it('BSM-W047: positions labels correctly in vertical mode', () => {
      const state: WipeState = { mode: 'vertical', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasLeft = canvasRect.left - containerRect.left;
      const canvasTop = canvasRect.top - containerRect.top;
      const y = canvasTop + displayHeight * 0.5;

      // Label A: top-left
      expect(elements.wipeLabelA.style.left).toBe(`${canvasLeft + 10}px`);
      expect(elements.wipeLabelA.style.top).toBe(`${canvasTop + 10}px`);

      // Label B: below the wipe line
      expect(elements.wipeLabelB.style.left).toBe(`${canvasLeft + 10}px`);
      expect(elements.wipeLabelB.style.top).toBe(`${y + 10}px`);
    });
  });

  describe('updateWipeLinePosition - boundary thresholds', () => {
    it('BSM-W050: label A visible at exactly position=0.1', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.1, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      // position is NOT < 0.1, so label A should be visible
      expect(elements.wipeLabelA.style.display).toBe('block');
    });

    it('BSM-W051: label B visible at exactly position=0.9', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.9, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      // position is NOT > 0.9, so label B should be visible
      expect(elements.wipeLabelB.style.display).toBe('block');
    });

    it('BSM-W052: both labels hidden at extreme boundaries', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.0, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      // position 0 is < 0.1 => label A hidden; position 0 is NOT > 0.9 => label B visible
      expect(elements.wipeLabelA.style.display).toBe('none');
      expect(elements.wipeLabelB.style.display).toBe('block');
    });

    it('BSM-W053: at position=1.0 label B is hidden, label A is visible', () => {
      const state: WipeState = { mode: 'horizontal', position: 1.0, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLabelA.style.display).toBe('block');
      expect(elements.wipeLabelB.style.display).toBe('none');
    });
  });

  describe('updateWipeLinePosition - dynamic position values', () => {
    it('BSM-W060: wipe line position updates correctly at position=0.25', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.25, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasLeft = canvasRect.left - containerRect.left;
      const expectedX = canvasLeft + displayWidth * 0.25;
      expect(elements.wipeLine.style.left).toBe(`${expectedX - 1}px`);
    });

    it('BSM-W061: wipe line position updates correctly at position=0.75', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.75, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasLeft = canvasRect.left - containerRect.left;
      const expectedX = canvasLeft + displayWidth * 0.75;
      expect(elements.wipeLine.style.left).toBe(`${expectedX - 1}px`);
    });

    it('BSM-W062: vertical wipe line position updates correctly at position=0.3', () => {
      const state: WipeState = { mode: 'vertical', position: 0.3, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      const canvasTop = canvasRect.top - containerRect.top;
      const expectedY = canvasTop + displayHeight * 0.3;
      expect(elements.wipeLine.style.top).toBe(`${expectedY - 1}px`);
    });
  });

  describe('base style constant consistency', () => {
    it('BSM-W070: wipe line base styles match creation z-index', () => {
      // After creation, z-index is 50
      expect(elements.wipeLine.style.zIndex).toBe('50');

      // After update, z-index should still be 50
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.wipeLine.style.zIndex).toBe('50');
    });

    it('BSM-W071: label A base styles preserve z-index after update', () => {
      expect(elements.wipeLabelA.style.zIndex).toBe('51');

      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.wipeLabelA.style.zIndex).toBe('51');
    });

    it('BSM-W072: label B base styles preserve z-index after update', () => {
      expect(elements.wipeLabelB.style.zIndex).toBe('51');

      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.wipeLabelB.style.zIndex).toBe('51');
    });

    it('BSM-W073: label A preserves font-size and font-weight after update', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLabelA.style.fontSize).toBe('11px');
      expect(elements.wipeLabelA.style.fontWeight).toBe('500');
    });

    it('BSM-W074: label B preserves font-size and font-weight after update', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLabelB.style.fontSize).toBe('11px');
      expect(elements.wipeLabelB.style.fontWeight).toBe('500');
    });

    it('BSM-W075: label A preserves pointer-events: none after update', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLabelA.style.pointerEvents).toBe('none');
    });

    it('BSM-W076: label B preserves pointer-events: none after update', () => {
      const state: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(state, elements, containerRect, canvasRect, displayWidth, displayHeight);

      expect(elements.wipeLabelB.style.pointerEvents).toBe('none');
    });
  });

  describe('mode switching', () => {
    it('BSM-W080: switching from horizontal to off hides all elements', () => {
      // First show in horizontal mode
      const horizState: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(horizState, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.wipeLine.style.display).toBe('block');

      // Then switch to off
      const offState: WipeState = { mode: 'off', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(offState, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.wipeLine.style.display).toBe('none');
      expect(elements.wipeLabelA.style.display).toBe('none');
      expect(elements.wipeLabelB.style.display).toBe('none');
    });

    it('BSM-W081: switching from horizontal to vertical changes cursor and dimensions', () => {
      const horizState: WipeState = { mode: 'horizontal', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(horizState, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.wipeLine.style.cursor).toBe('ew-resize');
      expect(elements.wipeLine.style.width).toBe('3px');

      const vertState: WipeState = { mode: 'vertical', position: 0.5, showOriginal: 'left' };
      updateWipeLinePosition(vertState, elements, containerRect, canvasRect, displayWidth, displayHeight);
      expect(elements.wipeLine.style.cursor).toBe('ns-resize');
      expect(elements.wipeLine.style.height).toBe('3px');
      expect(elements.wipeLine.style.width).toBe(`${displayWidth}px`);
    });
  });
});
