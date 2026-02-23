/**
 * StencilBox and Wipe Computation Tests
 *
 * Tests for the stencil box functions used in wipe rendering:
 * computeHorizontalWipeBoxes, computeVerticalWipeBoxes, isStencilBoxActive.
 */

import { describe, it, expect } from 'vitest';
import {
  computeHorizontalWipeBoxes,
  computeVerticalWipeBoxes,
  isStencilBoxActive,
  DEFAULT_STENCIL_BOX,
  DEFAULT_WIPE_STATE,
} from './wipe';

describe('computeHorizontalWipeBoxes', () => {
  it('position=0 gives empty left box and full right box', () => {
    const [left, right] = computeHorizontalWipeBoxes(0);

    // Left box: [0, 0, 0, 1] -- xMin=0, xMax=0, so zero width
    expect(left).toEqual([0, 0, 0, 1]);
    // Right box: [0, 1, 0, 1] -- full image
    expect(right).toEqual([0, 1, 0, 1]);
  });

  it('position=1 gives full left box and empty right box', () => {
    const [left, right] = computeHorizontalWipeBoxes(1);

    // Left box: [0, 1, 0, 1] -- full image
    expect(left).toEqual([0, 1, 0, 1]);
    // Right box: [1, 1, 0, 1] -- xMin=1, xMax=1, so zero width
    expect(right).toEqual([1, 1, 0, 1]);
  });

  it('position=0.5 gives each box covering half the image', () => {
    const [left, right] = computeHorizontalWipeBoxes(0.5);

    // Left box: [0, 0.5, 0, 1] -- left half
    expect(left).toEqual([0, 0.5, 0, 1]);
    // Right box: [0.5, 1, 0, 1] -- right half
    expect(right).toEqual([0.5, 1, 0, 1]);
  });

  it('position=0.25 gives quarter left box and three-quarter right box', () => {
    const [left, right] = computeHorizontalWipeBoxes(0.25);

    expect(left).toEqual([0, 0.25, 0, 1]);
    expect(right).toEqual([0.25, 1, 0, 1]);
  });

  it('position=0.75 gives three-quarter left box and quarter right box', () => {
    const [left, right] = computeHorizontalWipeBoxes(0.75);

    expect(left).toEqual([0, 0.75, 0, 1]);
    expect(right).toEqual([0.75, 1, 0, 1]);
  });

  it('both boxes always have full vertical range (yMin=0, yMax=1)', () => {
    for (const pos of [0, 0.1, 0.5, 0.9, 1]) {
      const [left, right] = computeHorizontalWipeBoxes(pos);
      expect(left[2]).toBe(0);
      expect(left[3]).toBe(1);
      expect(right[2]).toBe(0);
      expect(right[3]).toBe(1);
    }
  });

  it('left xMax equals right xMin (no gap or overlap)', () => {
    for (const pos of [0, 0.1, 0.33, 0.5, 0.67, 0.9, 1]) {
      const [left, right] = computeHorizontalWipeBoxes(pos);
      expect(left[1]).toBe(right[0]);
    }
  });

  it('clamps position below 0 to 0', () => {
    const [left, right] = computeHorizontalWipeBoxes(-0.1);

    // Clamped to 0, same as position=0
    expect(left).toEqual([0, 0, 0, 1]);
    expect(right).toEqual([0, 1, 0, 1]);
  });

  it('clamps position above 1 to 1', () => {
    const [left, right] = computeHorizontalWipeBoxes(1.1);

    // Clamped to 1, same as position=1
    expect(left).toEqual([0, 1, 0, 1]);
    expect(right).toEqual([1, 1, 0, 1]);
  });

  it('clamps large negative position to 0', () => {
    const [left, right] = computeHorizontalWipeBoxes(-100);

    expect(left).toEqual([0, 0, 0, 1]);
    expect(right).toEqual([0, 1, 0, 1]);
  });

  it('clamps large positive position to 1', () => {
    const [left, right] = computeHorizontalWipeBoxes(100);

    expect(left).toEqual([0, 1, 0, 1]);
    expect(right).toEqual([1, 1, 0, 1]);
  });
});

describe('computeVerticalWipeBoxes', () => {
  it('position=0 gives empty top box and full bottom box', () => {
    const [top, bottom] = computeVerticalWipeBoxes(0);

    // Top box: [0, 1, 0, 0] -- yMin=0, yMax=0, so zero height
    expect(top).toEqual([0, 1, 0, 0]);
    // Bottom box: [0, 1, 0, 1] -- full image
    expect(bottom).toEqual([0, 1, 0, 1]);
  });

  it('position=1 gives full top box and empty bottom box', () => {
    const [top, bottom] = computeVerticalWipeBoxes(1);

    // Top box: [0, 1, 0, 1] -- full image
    expect(top).toEqual([0, 1, 0, 1]);
    // Bottom box: [0, 1, 1, 1] -- yMin=1, yMax=1, so zero height
    expect(bottom).toEqual([0, 1, 1, 1]);
  });

  it('position=0.5 gives each box covering half the image', () => {
    const [top, bottom] = computeVerticalWipeBoxes(0.5);

    // Top box: [0, 1, 0, 0.5] -- top half
    expect(top).toEqual([0, 1, 0, 0.5]);
    // Bottom box: [0, 1, 0.5, 1] -- bottom half
    expect(bottom).toEqual([0, 1, 0.5, 1]);
  });

  it('position=0.25 gives quarter top box and three-quarter bottom box', () => {
    const [top, bottom] = computeVerticalWipeBoxes(0.25);

    expect(top).toEqual([0, 1, 0, 0.25]);
    expect(bottom).toEqual([0, 1, 0.25, 1]);
  });

  it('both boxes always have full horizontal range (xMin=0, xMax=1)', () => {
    for (const pos of [0, 0.1, 0.5, 0.9, 1]) {
      const [top, bottom] = computeVerticalWipeBoxes(pos);
      expect(top[0]).toBe(0);
      expect(top[1]).toBe(1);
      expect(bottom[0]).toBe(0);
      expect(bottom[1]).toBe(1);
    }
  });

  it('top yMax equals bottom yMin (no gap or overlap)', () => {
    for (const pos of [0, 0.1, 0.33, 0.5, 0.67, 0.9, 1]) {
      const [top, bottom] = computeVerticalWipeBoxes(pos);
      expect(top[3]).toBe(bottom[2]);
    }
  });

  it('clamps position below 0 to 0', () => {
    const [top, bottom] = computeVerticalWipeBoxes(-0.1);

    // Clamped to 0, same as position=0
    expect(top).toEqual([0, 1, 0, 0]);
    expect(bottom).toEqual([0, 1, 0, 1]);
  });

  it('clamps position above 1 to 1', () => {
    const [top, bottom] = computeVerticalWipeBoxes(1.1);

    // Clamped to 1, same as position=1
    expect(top).toEqual([0, 1, 0, 1]);
    expect(bottom).toEqual([0, 1, 1, 1]);
  });
});

describe('isStencilBoxActive', () => {
  it('returns false for DEFAULT_STENCIL_BOX [0, 1, 0, 1]', () => {
    expect(isStencilBoxActive(DEFAULT_STENCIL_BOX)).toBe(false);
  });

  it('returns false for an explicit [0, 1, 0, 1]', () => {
    expect(isStencilBoxActive([0, 1, 0, 1])).toBe(false);
  });

  it('returns true when xMin > 0', () => {
    expect(isStencilBoxActive([0.2, 1, 0, 1])).toBe(true);
  });

  it('returns true when xMax < 1', () => {
    expect(isStencilBoxActive([0, 0.8, 0, 1])).toBe(true);
  });

  it('returns true when yMin > 0', () => {
    expect(isStencilBoxActive([0, 1, 0.1, 1])).toBe(true);
  });

  it('returns true when yMax < 1', () => {
    expect(isStencilBoxActive([0, 1, 0, 0.9])).toBe(true);
  });

  it('returns true for partial coverage [0.2, 0.8, 0, 1]', () => {
    expect(isStencilBoxActive([0.2, 0.8, 0, 1])).toBe(true);
  });

  it('returns true for a small centered box', () => {
    expect(isStencilBoxActive([0.25, 0.75, 0.25, 0.75])).toBe(true);
  });

  it('returns true for a zero-size box [0, 0, 0, 0]', () => {
    // All zeros means xMax=0 < 1 and yMax=0 < 1, so active
    expect(isStencilBoxActive([0, 0, 0, 0])).toBe(true);
  });

  it('returns true for horizontal wipe left box at position=0.5', () => {
    const [left] = computeHorizontalWipeBoxes(0.5);
    // Left box = [0, 0.5, 0, 1], xMax < 1 so active
    expect(isStencilBoxActive(left)).toBe(true);
  });

  it('returns true for vertical wipe top box at position=0.5', () => {
    const [top] = computeVerticalWipeBoxes(0.5);
    // Top box = [0, 1, 0, 0.5], yMax < 1 so active
    expect(isStencilBoxActive(top)).toBe(true);
  });

  it('returns false for full-coverage wipe boxes', () => {
    // Horizontal wipe at position=0: right box is full coverage [0, 1, 0, 1]
    const [, right] = computeHorizontalWipeBoxes(0);
    expect(isStencilBoxActive(right)).toBe(false);

    // Vertical wipe at position=1: top box is full coverage [0, 1, 0, 1]
    const [top] = computeVerticalWipeBoxes(1);
    expect(isStencilBoxActive(top)).toBe(false);
  });
});

describe('DEFAULT_STENCIL_BOX', () => {
  it('is [0, 1, 0, 1] representing full image visibility', () => {
    expect(DEFAULT_STENCIL_BOX).toEqual([0, 1, 0, 1]);
  });
});

describe('DEFAULT_WIPE_STATE', () => {
  it('has mode=off, position=0.5, showOriginal=left', () => {
    expect(DEFAULT_WIPE_STATE.mode).toBe('off');
    expect(DEFAULT_WIPE_STATE.position).toBe(0.5);
    expect(DEFAULT_WIPE_STATE.showOriginal).toBe('left');
  });
});
