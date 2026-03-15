/**
 * StereoManager - Stereo Input Format Tests
 *
 * Tests for the stereo input format feature that wires multi-view EXR
 * and other stereo input formats into the stereo viewing system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StereoManager } from './StereoManager';

describe('StereoManager stereo input format', () => {
  let manager: StereoManager;

  beforeEach(() => {
    manager = new StereoManager();
  });

  // ===========================================================================
  // Input Format State Management
  // ===========================================================================
  describe('input format state management', () => {
    it('SM-IF001: should initialize with side-by-side input format (backward compat)', () => {
      expect(manager.getStereoInputFormat()).toBe('side-by-side');
    });

    it('SM-IF002: setStereoInputFormat should accept side-by-side', () => {
      manager.setStereoInputFormat('side-by-side');
      expect(manager.getStereoInputFormat()).toBe('side-by-side');
    });

    it('SM-IF003: setStereoInputFormat should accept over-under', () => {
      manager.setStereoInputFormat('over-under');
      expect(manager.getStereoInputFormat()).toBe('over-under');
    });

    it('SM-IF004: setStereoInputFormat should accept separate', () => {
      manager.setStereoInputFormat('separate');
      expect(manager.getStereoInputFormat()).toBe('separate');
    });

    it('SM-IF005: stereoInputFormat getter should return current format', () => {
      manager.setStereoInputFormat('over-under');
      expect(manager.stereoInputFormat).toBe('over-under');
    });

    it('SM-IF006: resetStereoInputFormat should restore side-by-side default', () => {
      manager.setStereoInputFormat('separate');
      manager.resetStereoInputFormat();
      expect(manager.getStereoInputFormat()).toBe('side-by-side');
    });

    it('SM-IF007: setting format multiple times should reflect the latest value', () => {
      manager.setStereoInputFormat('over-under');
      expect(manager.getStereoInputFormat()).toBe('over-under');

      manager.setStereoInputFormat('separate');
      expect(manager.getStereoInputFormat()).toBe('separate');

      manager.setStereoInputFormat('side-by-side');
      expect(manager.getStereoInputFormat()).toBe('side-by-side');
    });
  });

  // ===========================================================================
  // Input Format Independence from Other State
  // ===========================================================================
  describe('input format independence', () => {
    it('SM-IF010: resetting stereo state should not affect input format', () => {
      manager.setStereoInputFormat('separate');
      manager.setStereoState({ mode: 'anaglyph', eyeSwap: true, offset: 5 });
      manager.resetStereoState();

      expect(manager.getStereoInputFormat()).toBe('separate');
    });

    it('SM-IF011: resetting input format should not affect stereo state', () => {
      manager.setStereoState({ mode: 'side-by-side', eyeSwap: false, offset: 3 });
      manager.setStereoInputFormat('over-under');
      manager.resetStereoInputFormat();

      expect(manager.getStereoState().mode).toBe('side-by-side');
      expect(manager.getStereoState().offset).toBe(3);
    });

    it('SM-IF012: resetting input format should not affect eye transforms', () => {
      manager.setStereoEyeTransforms({
        left: { flipH: true, flipV: false, rotation: 10, scale: 1.5, translateX: 5, translateY: -3 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      });
      manager.setStereoInputFormat('separate');
      manager.resetStereoInputFormat();

      expect(manager.hasEyeTransforms()).toBe(true);
      expect(manager.getStereoEyeTransforms().left.flipH).toBe(true);
    });

    it('SM-IF013: resetting input format should not affect align mode', () => {
      manager.setStereoAlignMode('grid');
      manager.setStereoInputFormat('over-under');
      manager.resetStereoInputFormat();

      expect(manager.getStereoAlignMode()).toBe('grid');
    });
  });
});
