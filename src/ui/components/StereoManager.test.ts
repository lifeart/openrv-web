/**
 * StereoManager Unit Tests
 *
 * Comprehensive tests for the StereoManager class which manages stereo/3D
 * viewing state: stereo mode, per-eye transforms, and alignment overlay.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StereoManager } from './StereoManager';
import {
  DEFAULT_STEREO_STATE,
  DEFAULT_STEREO_EYE_TRANSFORM_STATE,
  DEFAULT_STEREO_ALIGN_MODE,
  StereoState,
  StereoEyeTransformState,
  StereoAlignMode,
} from '../../stereo/StereoRenderer';

describe('StereoManager', () => {
  let manager: StereoManager;

  beforeEach(() => {
    manager = new StereoManager();
  });

  // ===========================================================================
  // Stereo State Management
  // ===========================================================================
  describe('stereo state management', () => {
    it('SM-U001: should initialize with default stereo state', () => {
      const state = manager.getStereoState();
      expect(state).toEqual(DEFAULT_STEREO_STATE);
      expect(state.mode).toBe('off');
      expect(state.eyeSwap).toBe(false);
      expect(state.offset).toBe(0);
    });

    it('SM-U002: setStereoState should update the stereo state', () => {
      const newState: StereoState = { mode: 'anaglyph', eyeSwap: true, offset: 5 };
      manager.setStereoState(newState);
      const state = manager.getStereoState();
      expect(state).toEqual(newState);
    });

    it('SM-U003: getStereoState should return a shallow copy of the state', () => {
      manager.setStereoState({ mode: 'side-by-side', eyeSwap: false, offset: 10 });
      const state1 = manager.getStereoState();
      const state2 = manager.getStereoState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('SM-U004: mutations to returned getStereoState should not affect internal state', () => {
      manager.setStereoState({ mode: 'mirror', eyeSwap: false, offset: 0 });
      const returned = manager.getStereoState();
      returned.mode = 'off';
      returned.eyeSwap = true;
      returned.offset = 99;

      const internal = manager.getStereoState();
      expect(internal.mode).toBe('mirror');
      expect(internal.eyeSwap).toBe(false);
      expect(internal.offset).toBe(0);
    });

    it('SM-U005: setStereoState should deep-copy input so caller mutations do not affect state', () => {
      const input: StereoState = { mode: 'checkerboard', eyeSwap: false, offset: 3 };
      manager.setStereoState(input);
      input.mode = 'off';
      input.offset = 99;

      const state = manager.getStereoState();
      expect(state.mode).toBe('checkerboard');
      expect(state.offset).toBe(3);
    });

    it('SM-U006: resetStereoState should restore defaults', () => {
      manager.setStereoState({ mode: 'scanline', eyeSwap: true, offset: -10 });
      manager.resetStereoState();
      expect(manager.getStereoState()).toEqual(DEFAULT_STEREO_STATE);
    });

    it('SM-U007: isDefaultStereo should return true for default state', () => {
      expect(manager.isDefaultStereo()).toBe(true);
    });

    it('SM-U008: isDefaultStereo should return false when mode is not off', () => {
      manager.setStereoState({ mode: 'side-by-side', eyeSwap: false, offset: 0 });
      expect(manager.isDefaultStereo()).toBe(false);
    });

    it('SM-U009: isDefaultStereo should return false when eyeSwap is true', () => {
      manager.setStereoState({ mode: 'off', eyeSwap: true, offset: 0 });
      expect(manager.isDefaultStereo()).toBe(false);
    });

    it('SM-U010: isDefaultStereo should return false when offset is non-zero', () => {
      manager.setStereoState({ mode: 'off', eyeSwap: false, offset: 5 });
      expect(manager.isDefaultStereo()).toBe(false);
    });

    it('SM-U011: isDefaultStereo should return true after resetStereoState', () => {
      manager.setStereoState({ mode: 'anaglyph-luminance', eyeSwap: true, offset: 20 });
      expect(manager.isDefaultStereo()).toBe(false);
      manager.resetStereoState();
      expect(manager.isDefaultStereo()).toBe(true);
    });

    it('SM-U012: stereoState getter should return internal reference', () => {
      const ref1 = manager.stereoState;
      const ref2 = manager.stereoState;
      // The getter returns the internal object directly (not a copy)
      expect(ref1).toBe(ref2);
    });

    it('SM-U013: setStereoState should accept all valid stereo modes', () => {
      const modes = [
        'off',
        'side-by-side',
        'over-under',
        'mirror',
        'anaglyph',
        'anaglyph-luminance',
        'checkerboard',
        'scanline',
      ] as const;

      for (const mode of modes) {
        manager.setStereoState({ mode, eyeSwap: false, offset: 0 });
        expect(manager.getStereoState().mode).toBe(mode);
      }
    });
  });

  // ===========================================================================
  // Per-Eye Transforms
  // ===========================================================================
  describe('per-eye transforms', () => {
    it('SM-U020: should initialize with default eye transform state', () => {
      const state = manager.getStereoEyeTransforms();
      expect(state).toEqual(DEFAULT_STEREO_EYE_TRANSFORM_STATE);
    });

    it('SM-U021: setStereoEyeTransforms should update left eye transform', () => {
      const newState: StereoEyeTransformState = {
        left: { flipH: true, flipV: false, rotation: 10, scale: 1.5, translateX: 5, translateY: -3 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      };
      manager.setStereoEyeTransforms(newState);
      expect(manager.getStereoEyeTransforms().left).toEqual(newState.left);
    });

    it('SM-U022: setStereoEyeTransforms should update right eye transform', () => {
      const newState: StereoEyeTransformState = {
        left: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: true, rotation: -45, scale: 0.8, translateX: 10, translateY: 20 },
        linked: true,
      };
      manager.setStereoEyeTransforms(newState);
      expect(manager.getStereoEyeTransforms().right).toEqual(newState.right);
    });

    it('SM-U023: setStereoEyeTransforms should update linked flag', () => {
      const newState: StereoEyeTransformState = {
        left: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: true,
      };
      manager.setStereoEyeTransforms(newState);
      expect(manager.getStereoEyeTransforms().linked).toBe(true);
    });

    it('SM-U024: getStereoEyeTransforms returns a deep copy (left eye)', () => {
      manager.setStereoEyeTransforms({
        left: { flipH: true, flipV: false, rotation: 5, scale: 1.2, translateX: 1, translateY: 2 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      });

      const returned = manager.getStereoEyeTransforms();
      returned.left.flipH = false;
      returned.left.rotation = 999;

      const internal = manager.getStereoEyeTransforms();
      expect(internal.left.flipH).toBe(true);
      expect(internal.left.rotation).toBe(5);
    });

    it('SM-U025: getStereoEyeTransforms returns a deep copy (right eye)', () => {
      manager.setStereoEyeTransforms({
        left: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: true, rotation: -10, scale: 0.7, translateX: 50, translateY: -50 },
        linked: true,
      });

      const returned = manager.getStereoEyeTransforms();
      returned.right.flipV = false;
      returned.right.rotation = 999;
      returned.linked = false;

      const internal = manager.getStereoEyeTransforms();
      expect(internal.right.flipV).toBe(true);
      expect(internal.right.rotation).toBe(-10);
      expect(internal.linked).toBe(true);
    });

    it('SM-U026: setStereoEyeTransforms should deep-copy input so caller mutations do not affect state', () => {
      const input: StereoEyeTransformState = {
        left: { flipH: true, flipV: true, rotation: 30, scale: 1.5, translateX: 10, translateY: 20 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      };
      manager.setStereoEyeTransforms(input);

      // Mutate the input after setting
      input.left.flipH = false;
      input.left.rotation = -999;
      input.linked = true;

      const state = manager.getStereoEyeTransforms();
      expect(state.left.flipH).toBe(true);
      expect(state.left.rotation).toBe(30);
      expect(state.linked).toBe(false);
    });

    it('SM-U027: resetStereoEyeTransforms should restore defaults', () => {
      manager.setStereoEyeTransforms({
        left: { flipH: true, flipV: true, rotation: 90, scale: 2.0, translateX: 100, translateY: -100 },
        right: { flipH: true, flipV: true, rotation: -90, scale: 0.5, translateX: -100, translateY: 100 },
        linked: true,
      });

      manager.resetStereoEyeTransforms();
      const state = manager.getStereoEyeTransforms();
      expect(state.left).toEqual(DEFAULT_STEREO_EYE_TRANSFORM_STATE.left);
      expect(state.right).toEqual(DEFAULT_STEREO_EYE_TRANSFORM_STATE.right);
      expect(state.linked).toBe(false);
    });

    it('SM-U028: hasEyeTransforms should return false for default state', () => {
      expect(manager.hasEyeTransforms()).toBe(false);
    });

    it('SM-U029: hasEyeTransforms should return true when left eye has non-default transform', () => {
      manager.setStereoEyeTransforms({
        left: { flipH: true, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      });
      expect(manager.hasEyeTransforms()).toBe(true);
    });

    it('SM-U030: hasEyeTransforms should return true when right eye has non-default transform', () => {
      manager.setStereoEyeTransforms({
        left: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 5, translateY: 0 },
        linked: false,
      });
      expect(manager.hasEyeTransforms()).toBe(true);
    });

    it('SM-U031: hasEyeTransforms should return false after reset', () => {
      manager.setStereoEyeTransforms({
        left: { flipH: true, flipV: true, rotation: 45, scale: 1.5, translateX: 10, translateY: 20 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      });
      expect(manager.hasEyeTransforms()).toBe(true);
      manager.resetStereoEyeTransforms();
      expect(manager.hasEyeTransforms()).toBe(false);
    });

    it('SM-U032: stereoEyeTransformState getter returns internal reference', () => {
      const ref1 = manager.stereoEyeTransformState;
      const ref2 = manager.stereoEyeTransformState;
      expect(ref1).toBe(ref2);
    });

    it('SM-U033: hasEyeTransforms detects non-default rotation', () => {
      manager.setStereoEyeTransforms({
        left: { flipH: false, flipV: false, rotation: 1, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      });
      expect(manager.hasEyeTransforms()).toBe(true);
    });

    it('SM-U034: hasEyeTransforms detects non-default scale', () => {
      manager.setStereoEyeTransforms({
        left: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.1, translateX: 0, translateY: 0 },
        linked: false,
      });
      expect(manager.hasEyeTransforms()).toBe(true);
    });

    it('SM-U035: linked flag alone does not make hasEyeTransforms return true', () => {
      manager.setStereoEyeTransforms({
        left: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: true,
      });
      // isDefaultStereoEyeTransformState only checks left and right transforms, not linked
      expect(manager.hasEyeTransforms()).toBe(false);
    });
  });

  // ===========================================================================
  // Alignment Mode
  // ===========================================================================
  describe('alignment mode', () => {
    it('SM-U040: should initialize with default alignment mode (off)', () => {
      expect(manager.getStereoAlignMode()).toBe('off');
      expect(manager.getStereoAlignMode()).toBe(DEFAULT_STEREO_ALIGN_MODE);
    });

    it('SM-U041: setStereoAlignMode should update the alignment mode', () => {
      manager.setStereoAlignMode('grid');
      expect(manager.getStereoAlignMode()).toBe('grid');
    });

    it('SM-U042: setStereoAlignMode should accept all valid modes', () => {
      const modes: StereoAlignMode[] = ['off', 'grid', 'crosshair', 'difference', 'edges'];
      for (const mode of modes) {
        manager.setStereoAlignMode(mode);
        expect(manager.getStereoAlignMode()).toBe(mode);
      }
    });

    it('SM-U043: resetStereoAlignMode should restore default', () => {
      manager.setStereoAlignMode('edges');
      manager.resetStereoAlignMode();
      expect(manager.getStereoAlignMode()).toBe('off');
    });

    it('SM-U044: hasAlignOverlay should return false when mode is off', () => {
      expect(manager.hasAlignOverlay()).toBe(false);
    });

    it('SM-U045: hasAlignOverlay should return true when mode is grid', () => {
      manager.setStereoAlignMode('grid');
      expect(manager.hasAlignOverlay()).toBe(true);
    });

    it('SM-U046: hasAlignOverlay should return true when mode is crosshair', () => {
      manager.setStereoAlignMode('crosshair');
      expect(manager.hasAlignOverlay()).toBe(true);
    });

    it('SM-U047: hasAlignOverlay should return true when mode is difference', () => {
      manager.setStereoAlignMode('difference');
      expect(manager.hasAlignOverlay()).toBe(true);
    });

    it('SM-U048: hasAlignOverlay should return true when mode is edges', () => {
      manager.setStereoAlignMode('edges');
      expect(manager.hasAlignOverlay()).toBe(true);
    });

    it('SM-U049: hasAlignOverlay should return false after reset', () => {
      manager.setStereoAlignMode('crosshair');
      expect(manager.hasAlignOverlay()).toBe(true);
      manager.resetStereoAlignMode();
      expect(manager.hasAlignOverlay()).toBe(false);
    });

    it('SM-U050: stereoAlignMode getter returns the current mode', () => {
      manager.setStereoAlignMode('difference');
      expect(manager.stereoAlignMode).toBe('difference');
    });

    it('SM-U051: stereoAlignMode getter reflects changes from setStereoAlignMode', () => {
      expect(manager.stereoAlignMode).toBe('off');
      manager.setStereoAlignMode('grid');
      expect(manager.stereoAlignMode).toBe('grid');
      manager.setStereoAlignMode('edges');
      expect(manager.stereoAlignMode).toBe('edges');
    });
  });

  // ===========================================================================
  // needsEyeTransformApply Logic
  // ===========================================================================
  describe('needsEyeTransformApply', () => {
    it('SM-U060: should return false when all state is default', () => {
      expect(manager.needsEyeTransformApply()).toBe(false);
    });

    it('SM-U061: should return false when stereo mode is non-default but no eye transforms or overlay', () => {
      // Non-default stereo state, but default eye transforms and align mode
      manager.setStereoState({ mode: 'anaglyph', eyeSwap: false, offset: 0 });
      expect(manager.needsEyeTransformApply()).toBe(false);
    });

    it('SM-U062: should return false when eye transforms are set but stereo mode is default', () => {
      // Default stereo means isDefaultStereo() returns true, so needsEyeTransformApply is false
      manager.setStereoEyeTransforms({
        left: { flipH: true, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      });
      expect(manager.needsEyeTransformApply()).toBe(false);
    });

    it('SM-U063: should return false when align overlay is set but stereo mode is default', () => {
      manager.setStereoAlignMode('grid');
      expect(manager.needsEyeTransformApply()).toBe(false);
    });

    it('SM-U064: should return true when stereo is non-default and eye transforms are non-default', () => {
      manager.setStereoState({ mode: 'side-by-side', eyeSwap: false, offset: 0 });
      manager.setStereoEyeTransforms({
        left: { flipH: true, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      });
      expect(manager.needsEyeTransformApply()).toBe(true);
    });

    it('SM-U065: should return true when stereo is non-default and align overlay is active', () => {
      manager.setStereoState({ mode: 'over-under', eyeSwap: false, offset: 0 });
      manager.setStereoAlignMode('crosshair');
      expect(manager.needsEyeTransformApply()).toBe(true);
    });

    it('SM-U066: should return true when stereo is non-default with both eye transforms and overlay', () => {
      manager.setStereoState({ mode: 'anaglyph', eyeSwap: true, offset: 5 });
      manager.setStereoEyeTransforms({
        left: { flipH: false, flipV: false, rotation: 10, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      });
      manager.setStereoAlignMode('difference');
      expect(manager.needsEyeTransformApply()).toBe(true);
    });

    it('SM-U067: should return false after resetting all state', () => {
      manager.setStereoState({ mode: 'mirror', eyeSwap: true, offset: 10 });
      manager.setStereoEyeTransforms({
        left: { flipH: true, flipV: true, rotation: 90, scale: 2.0, translateX: 50, translateY: 50 },
        right: { flipH: true, flipV: true, rotation: -90, scale: 0.5, translateX: -50, translateY: -50 },
        linked: true,
      });
      manager.setStereoAlignMode('edges');
      expect(manager.needsEyeTransformApply()).toBe(true);

      manager.resetStereoState();
      manager.resetStereoEyeTransforms();
      manager.resetStereoAlignMode();
      expect(manager.needsEyeTransformApply()).toBe(false);
    });

    it('SM-U068: stereo with eyeSwap only (non-default) and align overlay active', () => {
      manager.setStereoState({ mode: 'off', eyeSwap: true, offset: 0 });
      manager.setStereoAlignMode('grid');
      // eyeSwap=true makes isDefaultStereo false, and align overlay is active
      expect(manager.needsEyeTransformApply()).toBe(true);
    });

    it('SM-U069: stereo with offset only (non-default) and eye transforms active', () => {
      manager.setStereoState({ mode: 'off', eyeSwap: false, offset: 1 });
      manager.setStereoEyeTransforms({
        left: { flipH: false, flipV: true, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      });
      // offset=1 makes isDefaultStereo false, and hasEyeTransforms is true
      expect(manager.needsEyeTransformApply()).toBe(true);
    });
  });

  // ===========================================================================
  // Getter properties vs. method consistency
  // ===========================================================================
  describe('getter vs method consistency', () => {
    it('SM-U080: stereoState getter and getStereoState return equivalent data', () => {
      manager.setStereoState({ mode: 'scanline', eyeSwap: true, offset: -5 });
      const fromGetter = manager.stereoState;
      const fromMethod = manager.getStereoState();
      expect(fromGetter).toEqual(fromMethod);
    });

    it('SM-U081: stereoEyeTransformState getter and getStereoEyeTransforms return equivalent data', () => {
      manager.setStereoEyeTransforms({
        left: { flipH: true, flipV: false, rotation: 15, scale: 1.3, translateX: 7, translateY: -7 },
        right: { flipH: false, flipV: true, rotation: -15, scale: 0.8, translateX: -7, translateY: 7 },
        linked: true,
      });
      const fromGetter = manager.stereoEyeTransformState;
      const fromMethod = manager.getStereoEyeTransforms();
      expect(fromGetter).toEqual(fromMethod);
    });

    it('SM-U082: stereoAlignMode getter and getStereoAlignMode return the same value', () => {
      manager.setStereoAlignMode('edges');
      expect(manager.stereoAlignMode).toBe(manager.getStereoAlignMode());
    });
  });

  // ===========================================================================
  // Independent state isolation
  // ===========================================================================
  describe('independent state isolation', () => {
    it('SM-U090: resetting stereo state does not affect eye transforms', () => {
      manager.setStereoState({ mode: 'anaglyph', eyeSwap: true, offset: 10 });
      manager.setStereoEyeTransforms({
        left: { flipH: true, flipV: false, rotation: 45, scale: 1.5, translateX: 10, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      });

      manager.resetStereoState();

      expect(manager.getStereoState()).toEqual(DEFAULT_STEREO_STATE);
      expect(manager.hasEyeTransforms()).toBe(true);
      expect(manager.getStereoEyeTransforms().left.flipH).toBe(true);
    });

    it('SM-U091: resetting eye transforms does not affect stereo state', () => {
      manager.setStereoState({ mode: 'side-by-side', eyeSwap: false, offset: 5 });
      manager.setStereoEyeTransforms({
        left: { flipH: true, flipV: true, rotation: 90, scale: 2.0, translateX: 100, translateY: 100 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: true,
      });

      manager.resetStereoEyeTransforms();

      expect(manager.getStereoState().mode).toBe('side-by-side');
      expect(manager.getStereoState().offset).toBe(5);
      expect(manager.hasEyeTransforms()).toBe(false);
    });

    it('SM-U092: resetting align mode does not affect stereo state or eye transforms', () => {
      manager.setStereoState({ mode: 'mirror', eyeSwap: true, offset: 3 });
      manager.setStereoEyeTransforms({
        left: { flipH: false, flipV: true, rotation: 10, scale: 1.2, translateX: 5, translateY: -5 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      });
      manager.setStereoAlignMode('difference');

      manager.resetStereoAlignMode();

      expect(manager.getStereoState().mode).toBe('mirror');
      expect(manager.hasEyeTransforms()).toBe(true);
      expect(manager.getStereoAlignMode()).toBe('off');
    });
  });

  // ===========================================================================
  // Multiple set/reset cycles
  // ===========================================================================
  describe('multiple set/reset cycles', () => {
    it('SM-U100: setting state multiple times should always reflect the latest value', () => {
      manager.setStereoState({ mode: 'anaglyph', eyeSwap: false, offset: 0 });
      expect(manager.getStereoState().mode).toBe('anaglyph');

      manager.setStereoState({ mode: 'checkerboard', eyeSwap: true, offset: 10 });
      expect(manager.getStereoState().mode).toBe('checkerboard');
      expect(manager.getStereoState().eyeSwap).toBe(true);
      expect(manager.getStereoState().offset).toBe(10);

      manager.setStereoState({ mode: 'off', eyeSwap: false, offset: 0 });
      expect(manager.isDefaultStereo()).toBe(true);
    });

    it('SM-U101: setting eye transforms multiple times should always reflect the latest value', () => {
      manager.setStereoEyeTransforms({
        left: { flipH: true, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      });
      expect(manager.getStereoEyeTransforms().left.flipH).toBe(true);

      manager.setStereoEyeTransforms({
        left: { flipH: false, flipV: true, rotation: 90, scale: 2.0, translateX: 50, translateY: 50 },
        right: { flipH: true, flipV: false, rotation: -45, scale: 0.5, translateX: -10, translateY: 10 },
        linked: true,
      });
      expect(manager.getStereoEyeTransforms().left.flipH).toBe(false);
      expect(manager.getStereoEyeTransforms().left.flipV).toBe(true);
      expect(manager.getStereoEyeTransforms().right.flipH).toBe(true);
      expect(manager.getStereoEyeTransforms().linked).toBe(true);
    });

    it('SM-U102: setting alignment mode multiple times should always reflect the latest value', () => {
      manager.setStereoAlignMode('grid');
      expect(manager.getStereoAlignMode()).toBe('grid');

      manager.setStereoAlignMode('crosshair');
      expect(manager.getStereoAlignMode()).toBe('crosshair');

      manager.setStereoAlignMode('off');
      expect(manager.getStereoAlignMode()).toBe('off');
      expect(manager.hasAlignOverlay()).toBe(false);
    });
  });
});
