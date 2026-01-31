import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThumbnailManager } from './ThumbnailManager';
import { Session } from '../../core/session/Session';

// Mock Session
vi.mock('../../core/session/Session', () => ({
  Session: vi.fn().mockImplementation(() => ({
    currentSource: null,
    getSequenceFrameImage: vi.fn(),
    getVideoFrameCanvas: vi.fn(),
  })),
}));

describe('ThumbnailManager', () => {
  let manager: ThumbnailManager;
  let mockSession: Session;

  beforeEach(() => {
    mockSession = new Session() as unknown as Session;
    manager = new ThumbnailManager(mockSession);
  });

  afterEach(() => {
    manager.dispose();
    vi.clearAllMocks();
  });

  describe('calculateSlots', () => {
    it('should return empty array for invalid inputs', () => {
      // Zero duration
      let slots = manager.calculateSlots(60, 35, 500, 24, 0, 1920, 1080);
      expect(slots).toEqual([]);

      // Zero source dimensions
      slots = manager.calculateSlots(60, 35, 500, 24, 100, 0, 1080);
      expect(slots).toEqual([]);

      // Zero track width
      slots = manager.calculateSlots(60, 35, 0, 24, 100, 1920, 1080);
      expect(slots).toEqual([]);
    });

    it('should calculate slots with correct dimensions', () => {
      const slots = manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);

      expect(slots.length).toBeGreaterThan(0);
      expect(slots.length).toBeLessThanOrEqual(30);

      // Check first slot
      const firstSlot = slots[0];
      expect(firstSlot).toBeDefined();
      expect(firstSlot!.frame).toBe(1);
      expect(firstSlot!.x).toBeGreaterThanOrEqual(60);
      expect(firstSlot!.width).toBeGreaterThan(0);
      expect(firstSlot!.height).toBeGreaterThan(0);
      expect(firstSlot!.height).toBeLessThanOrEqual(24);
    });

    it('should preserve aspect ratio', () => {
      const sourceWidth = 1920;
      const sourceHeight = 1080;
      const expectedAspect = sourceWidth / sourceHeight;

      const slots = manager.calculateSlots(60, 35, 500, 24, 100, sourceWidth, sourceHeight);

      for (const slot of slots) {
        const slotAspect = slot.width / slot.height;
        expect(Math.abs(slotAspect - expectedAspect)).toBeLessThan(0.1);
      }
    });

    it('should distribute frames evenly across duration', () => {
      const duration = 100;
      const slots = manager.calculateSlots(60, 35, 500, 24, duration, 1920, 1080);

      // First frame should be 1
      expect(slots[0]?.frame).toBe(1);

      // Last frame should be close to duration
      const lastSlot = slots[slots.length - 1];
      expect(lastSlot?.frame).toBeLessThanOrEqual(duration);
      expect(lastSlot?.frame).toBeGreaterThan(duration - 10);
    });
  });

  describe('getSlots', () => {
    it('should return calculated slots', () => {
      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
      const slots = manager.getSlots();

      expect(slots.length).toBeGreaterThan(0);
    });

    it('should return empty array before calculation', () => {
      const slots = manager.getSlots();
      expect(slots).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should clear slots and cache', () => {
      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
      expect(manager.getSlots().length).toBeGreaterThan(0);

      manager.clear();
      expect(manager.getSlots()).toEqual([]);
    });
  });

  describe('getThumbnail', () => {
    it('should return null for uncached frame', () => {
      const thumbnail = manager.getThumbnail(1);
      expect(thumbnail).toBeNull();
    });
  });

  describe('isFullyLoaded', () => {
    it('should return true when no slots exist', () => {
      expect(manager.isFullyLoaded()).toBe(true);
    });

    it('should return false when slots exist but no thumbnails loaded', () => {
      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
      expect(manager.isFullyLoaded()).toBe(false);
    });
  });

  describe('setOnThumbnailReady', () => {
    it('should store callback', () => {
      const callback = vi.fn();
      manager.setOnThumbnailReady(callback);
      // Callback is stored but not called until thumbnail loads
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
      manager.dispose();
      expect(manager.getSlots()).toEqual([]);
    });
  });
});
