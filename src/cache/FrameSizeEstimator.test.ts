import { describe, it, expect } from 'vitest';
import {
  estimateFrameBytes,
  maxFramesInBudget,
  regionCapacity,
  calculateWindowSplit,
  evictionGuardRadius,
} from './FrameSizeEstimator';

describe('FrameSizeEstimator', () => {
  // -------------------------------------------------------------------
  // estimateFrameBytes
  // -------------------------------------------------------------------

  describe('estimateFrameBytes', () => {
    it('FSE-001: SDR 1080p frame is ~8 MB (1920*1080*4)', () => {
      const bytes = estimateFrameBytes(1920, 1080, false);
      expect(bytes).toBe(1920 * 1080 * 4);
    });

    it('FSE-002: HDR 1080p frame is ~16 MB (1920*1080*8)', () => {
      const bytes = estimateFrameBytes(1920, 1080, true);
      expect(bytes).toBe(1920 * 1080 * 8);
    });

    it('FSE-003: SDR 4K frame is ~33 MB (3840*2160*4)', () => {
      const bytes = estimateFrameBytes(3840, 2160, false);
      expect(bytes).toBe(3840 * 2160 * 4);
    });

    it('FSE-004: HDR 4K frame is ~66 MB (3840*2160*8)', () => {
      const bytes = estimateFrameBytes(3840, 2160, true);
      expect(bytes).toBe(3840 * 2160 * 8);
    });

    it('FSE-005: uses targetSize when provided', () => {
      const bytes = estimateFrameBytes(3840, 2160, false, { w: 1920, h: 1080 });
      expect(bytes).toBe(1920 * 1080 * 4);
    });

    it('FSE-006: uses source dimensions when targetSize is undefined', () => {
      const bytes = estimateFrameBytes(1280, 720, false);
      expect(bytes).toBe(1280 * 720 * 4);
    });

    it('FSE-007: handles 1x1 pixel frame', () => {
      expect(estimateFrameBytes(1, 1, false)).toBe(4);
      expect(estimateFrameBytes(1, 1, true)).toBe(8);
    });

    it('FSE-008: handles zero dimensions', () => {
      expect(estimateFrameBytes(0, 0, false)).toBe(0);
      expect(estimateFrameBytes(0, 100, false)).toBe(0);
      expect(estimateFrameBytes(100, 0, false)).toBe(0);
    });

    it('FSE-009: targetSize with HDR uses 8 bytes/pixel', () => {
      const bytes = estimateFrameBytes(3840, 2160, true, { w: 960, h: 540 });
      expect(bytes).toBe(960 * 540 * 8);
    });
  });

  // -------------------------------------------------------------------
  // maxFramesInBudget
  // -------------------------------------------------------------------

  describe('maxFramesInBudget', () => {
    it('FSE-010: calculates correct frame count for 512MB budget with 1080p SDR', () => {
      const bytesPerFrame = 1920 * 1080 * 4;
      const budget = 512 * 1024 * 1024;
      const count = maxFramesInBudget(budget, bytesPerFrame);
      expect(count).toBe(Math.floor(budget / bytesPerFrame));
      expect(count).toBe(64); // 512MB / ~8MB
    });

    it('FSE-011: calculates correct frame count for 1GB budget with 4K SDR', () => {
      const bytesPerFrame = 3840 * 2160 * 4;
      const budget = 1024 * 1024 * 1024;
      const count = maxFramesInBudget(budget, bytesPerFrame);
      expect(count).toBe(Math.floor(budget / bytesPerFrame));
    });

    it('FSE-012: returns 0 for zero bytesPerFrame', () => {
      expect(maxFramesInBudget(512 * 1024 * 1024, 0)).toBe(0);
    });

    it('FSE-013: returns 0 for negative bytesPerFrame', () => {
      expect(maxFramesInBudget(512 * 1024 * 1024, -1)).toBe(0);
    });

    it('FSE-014: returns 0 for zero budget', () => {
      expect(maxFramesInBudget(0, 1000)).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // regionCapacity
  // -------------------------------------------------------------------

  describe('regionCapacity', () => {
    it('FSE-015: region capacity is 80% of max frames', () => {
      const bytesPerFrame = 1920 * 1080 * 4;
      const budget = 512 * 1024 * 1024;
      const maxFrames = maxFramesInBudget(budget, bytesPerFrame);
      const capacity = regionCapacity(budget, bytesPerFrame);
      expect(capacity).toBe(Math.floor(maxFrames * 0.8));
    });

    it('FSE-016: handles zero budget', () => {
      expect(regionCapacity(0, 1000)).toBe(0);
    });

    it('FSE-017: handles zero bytesPerFrame', () => {
      expect(regionCapacity(512 * 1024 * 1024, 0)).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // calculateWindowSplit
  // -------------------------------------------------------------------

  describe('calculateWindowSplit', () => {
    it('FSE-018: playback mode splits 70/30 ahead/behind', () => {
      const { aheadFrames, behindFrames } = calculateWindowSplit(100, 'playback');
      expect(aheadFrames).toBe(70);
      expect(behindFrames).toBe(30);
      expect(aheadFrames + behindFrames).toBe(100);
    });

    it('FSE-019: scrub mode splits approximately 50/50', () => {
      const { aheadFrames, behindFrames } = calculateWindowSplit(100, 'scrub');
      expect(aheadFrames).toBe(50);
      expect(behindFrames).toBe(50);
      expect(aheadFrames + behindFrames).toBe(100);
    });

    it('FSE-020: scrub mode handles odd capacity', () => {
      const { aheadFrames, behindFrames } = calculateWindowSplit(99, 'scrub');
      expect(aheadFrames + behindFrames).toBe(99);
    });

    it('FSE-021: scrubDirectional forward biases 70/30 ahead', () => {
      const { aheadFrames, behindFrames } = calculateWindowSplit(100, 'scrubDirectional', 1);
      expect(aheadFrames).toBe(70);
      expect(behindFrames).toBe(30);
    });

    it('FSE-022: scrubDirectional reverse biases 70/30 behind', () => {
      const { aheadFrames, behindFrames } = calculateWindowSplit(100, 'scrubDirectional', -1);
      expect(aheadFrames).toBe(30);
      expect(behindFrames).toBe(70);
    });

    it('FSE-023: returns zeros for zero capacity', () => {
      const { aheadFrames, behindFrames } = calculateWindowSplit(0, 'playback');
      expect(aheadFrames).toBe(0);
      expect(behindFrames).toBe(0);
    });

    it('FSE-024: returns zeros for negative capacity', () => {
      const { aheadFrames, behindFrames } = calculateWindowSplit(-10, 'playback');
      expect(aheadFrames).toBe(0);
      expect(behindFrames).toBe(0);
    });

    it('FSE-025: handles capacity of 1', () => {
      const { aheadFrames, behindFrames } = calculateWindowSplit(1, 'playback');
      expect(aheadFrames + behindFrames).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // evictionGuardRadius
  // -------------------------------------------------------------------

  describe('evictionGuardRadius', () => {
    it('FSE-026: 1x speed returns minimum guard (2)', () => {
      expect(evictionGuardRadius(1)).toBe(2);
    });

    it('FSE-027: 2x speed returns ceil(2*2) = 4', () => {
      expect(evictionGuardRadius(2)).toBe(4);
    });

    it('FSE-028: 4x speed returns ceil(4*2) = 8', () => {
      expect(evictionGuardRadius(4)).toBe(8);
    });

    it('FSE-029: 0.5x speed uses minimum guard', () => {
      expect(evictionGuardRadius(0.5)).toBe(2);
    });

    it('FSE-030: respects custom minimum guard', () => {
      expect(evictionGuardRadius(0.5, 5)).toBe(5);
    });

    it('FSE-031: 1.5x speed returns ceil(1.5*2) = 3', () => {
      expect(evictionGuardRadius(1.5)).toBe(3);
    });
  });
});
