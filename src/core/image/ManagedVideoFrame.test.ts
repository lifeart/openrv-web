/**
 * ManagedVideoFrame Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManagedVideoFrame } from './ManagedVideoFrame';

/** Create a mock VideoFrame with a working format property */
function createMockFrame(): VideoFrame {
  let closed = false;
  return {
    get format() { return closed ? null : 'RGBA'; },
    close() { closed = true; },
    displayWidth: 1920,
    displayHeight: 1080,
    codedWidth: 1920,
    codedHeight: 1080,
    timestamp: 0,
    duration: null,
    colorSpace: {},
  } as unknown as VideoFrame;
}

describe('ManagedVideoFrame', () => {
  beforeEach(() => {
    ManagedVideoFrame.resetForTesting();
  });

  describe('wrap()', () => {
    it('creates a managed frame with refCount 1 and increments activeCount', () => {
      const mockFrame = createMockFrame();
      const managed = ManagedVideoFrame.wrap(mockFrame);

      expect(managed.refs).toBe(1);
      expect(managed.isClosed).toBe(false);
      expect(managed.frame).toBe(mockFrame);
      expect(ManagedVideoFrame.activeCount).toBe(1);

      managed.release(); // cleanup
    });

    it('assigns sequential IDs', () => {
      const m1 = ManagedVideoFrame.wrap(createMockFrame());
      const m2 = ManagedVideoFrame.wrap(createMockFrame());

      expect(m1.id).toBe(0);
      expect(m2.id).toBe(1);

      m1.release();
      m2.release();
    });

    it('throws when wrapping an already-closed VideoFrame', () => {
      const mockFrame = createMockFrame();
      mockFrame.close(); // close it first

      expect(() => ManagedVideoFrame.wrap(mockFrame)).toThrow('already-closed');
    });

    it('throws when wrapping a VideoFrame already managed by another ManagedVideoFrame', () => {
      const mockFrame = createMockFrame();
      const managed = ManagedVideoFrame.wrap(mockFrame);

      expect(() => ManagedVideoFrame.wrap(mockFrame)).toThrow('double-wrap');

      managed.release();
    });

    it('allows re-wrapping a VideoFrame after it was released', () => {
      const mockFrame = createMockFrame();
      const m1 = ManagedVideoFrame.wrap(mockFrame);
      m1.release();

      // After release, the frame is removed from the WeakSet, but it's also closed
      // So re-wrapping a closed frame should throw for the closed check
      expect(() => ManagedVideoFrame.wrap(mockFrame)).toThrow('already-closed');
    });
  });

  describe('release()', () => {
    it('calls VideoFrame.close() when refCount reaches 0 and decrements activeCount', () => {
      const mockFrame = createMockFrame();
      const closeSpy = vi.spyOn(mockFrame, 'close');
      const managed = ManagedVideoFrame.wrap(mockFrame);

      expect(ManagedVideoFrame.activeCount).toBe(1);

      managed.release();

      expect(closeSpy).toHaveBeenCalledOnce();
      expect(managed.isClosed).toBe(true);
      expect(ManagedVideoFrame.activeCount).toBe(0);
    });

    it('does not close VideoFrame while references remain', () => {
      const mockFrame = createMockFrame();
      const closeSpy = vi.spyOn(mockFrame, 'close');
      const managed = ManagedVideoFrame.wrap(mockFrame);
      managed.acquire();

      managed.release(); // refcount 2 -> 1
      expect(closeSpy).not.toHaveBeenCalled();
      expect(managed.isClosed).toBe(false);

      managed.release(); // refcount 1 -> 0
      expect(closeSpy).toHaveBeenCalledOnce();
      expect(managed.isClosed).toBe(true);
    });

    it('is idempotent (double-release does not call close twice)', () => {
      const mockFrame = createMockFrame();
      const closeSpy = vi.spyOn(mockFrame, 'close');
      const managed = ManagedVideoFrame.wrap(mockFrame);

      managed.release();
      managed.release(); // no-op

      expect(closeSpy).toHaveBeenCalledOnce();
      expect(ManagedVideoFrame.activeCount).toBe(0);
    });

    it('handles VideoFrame.close() throwing gracefully', () => {
      const mockFrame = {
        get format() { return 'RGBA'; },
        close() { throw new Error('Already closed externally'); },
      } as unknown as VideoFrame;

      const managed = ManagedVideoFrame.wrap(mockFrame);

      // Should not throw
      expect(() => managed.release()).not.toThrow();
      expect(managed.isClosed).toBe(true);
    });
  });

  describe('acquire()', () => {
    it('increments refCount', () => {
      const managed = ManagedVideoFrame.wrap(createMockFrame());

      expect(managed.refs).toBe(1);
      managed.acquire();
      expect(managed.refs).toBe(2);

      managed.release();
      managed.release();
    });

    it('returns this for chaining', () => {
      const managed = ManagedVideoFrame.wrap(createMockFrame());
      const result = managed.acquire();

      expect(result).toBe(managed);

      managed.release();
      managed.release();
    });

    it('throws when acquiring a closed frame', () => {
      const managed = ManagedVideoFrame.wrap(createMockFrame());
      managed.release();

      expect(() => managed.acquire()).toThrow('already closed');
    });
  });

  describe('activeCount', () => {
    it('tracks multiple frames correctly', () => {
      expect(ManagedVideoFrame.activeCount).toBe(0);

      const m1 = ManagedVideoFrame.wrap(createMockFrame());
      expect(ManagedVideoFrame.activeCount).toBe(1);

      const m2 = ManagedVideoFrame.wrap(createMockFrame());
      expect(ManagedVideoFrame.activeCount).toBe(2);

      m1.release();
      expect(ManagedVideoFrame.activeCount).toBe(1);

      m2.release();
      expect(ManagedVideoFrame.activeCount).toBe(0);
    });
  });

  describe('enableLeakDetection()', () => {
    it('accepts a callback without throwing', () => {
      expect(() => ManagedVideoFrame.enableLeakDetection(vi.fn())).not.toThrow();
    });
  });

  describe('resetForTesting()', () => {
    it('resets activeCount and nextId to initial values', () => {
      ManagedVideoFrame.wrap(createMockFrame());
      ManagedVideoFrame.wrap(createMockFrame());
      expect(ManagedVideoFrame.activeCount).toBe(2);

      ManagedVideoFrame.resetForTesting();

      expect(ManagedVideoFrame.activeCount).toBe(0);

      // IDs restart from 0
      const m3 = ManagedVideoFrame.wrap(createMockFrame());
      expect(m3.id).toBe(0);

      m3.release();
    });
  });

  describe('creationStack', () => {
    it('captures stack trace in dev mode', () => {
      const managed = ManagedVideoFrame.wrap(createMockFrame());

      // import.meta.env.DEV is true in test environment
      expect(managed.creationStack).toBeDefined();
      expect(managed.creationStack).toContain('ManagedVideoFrame');

      managed.release();
    });
  });
});
