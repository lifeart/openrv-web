import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FullscreenManager } from './FullscreenManager';

describe('FullscreenManager', () => {
  let container: HTMLElement;
  let manager: FullscreenManager;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    manager?.dispose();
    container.remove();
  });

  describe('initialization', () => {
    it('FS-U001: should initialize with isFullscreen = false', () => {
      manager = new FullscreenManager(container);
      expect(manager.isFullscreen).toBe(false);
    });

    it('FS-U002: should attach fullscreenchange listener', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      manager = new FullscreenManager(container);
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'fullscreenchange',
        expect.any(Function)
      );
    });
  });

  describe('toggle()', () => {
    it('FS-U003: should call enter() when not in fullscreen', async () => {
      manager = new FullscreenManager(container);
      // Mock requestFullscreen
      container.requestFullscreen = vi.fn().mockResolvedValue(undefined);
      await manager.toggle();
      expect(container.requestFullscreen).toHaveBeenCalled();
    });

    it('FS-U004: should call exit() when in fullscreen', async () => {
      manager = new FullscreenManager(container);
      // Simulate fullscreen state
      (manager as any)._isFullscreen = true;
      document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
      await manager.toggle();
      expect(document.exitFullscreen).toHaveBeenCalled();
    });
  });

  describe('enter()', () => {
    it('FS-U005: should call requestFullscreen on container', async () => {
      container.requestFullscreen = vi.fn().mockResolvedValue(undefined);
      manager = new FullscreenManager(container);
      await manager.enter();
      expect(container.requestFullscreen).toHaveBeenCalled();
    });

    it('FS-U006: should handle requestFullscreen failure gracefully', async () => {
      container.requestFullscreen = vi.fn().mockRejectedValue(new Error('not allowed'));
      manager = new FullscreenManager(container);
      // Should not throw
      await expect(manager.enter()).resolves.toBeUndefined();
    });
  });

  describe('exit()', () => {
    it('FS-U007: should call document.exitFullscreen', async () => {
      document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
      manager = new FullscreenManager(container);
      await manager.exit();
      expect(document.exitFullscreen).toHaveBeenCalled();
    });

    it('FS-U008: should handle exitFullscreen failure gracefully', async () => {
      document.exitFullscreen = vi.fn().mockRejectedValue(new Error('not in fullscreen'));
      manager = new FullscreenManager(container);
      // Should not throw
      await expect(manager.exit()).resolves.toBeUndefined();
    });
  });

  describe('event emission', () => {
    it('FS-U009: should emit fullscreenChanged when fullscreen state changes', () => {
      manager = new FullscreenManager(container);
      const handler = vi.fn();
      manager.on('fullscreenChanged', handler);

      // Simulate fullscreenchange event
      const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
      Object.defineProperty(document, 'fullscreenElement', {
        value: container,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));

      expect(handler).toHaveBeenCalledWith(true);

      // Restore
      if (originalDescriptor) {
        Object.defineProperty(document, 'fullscreenElement', originalDescriptor);
      } else {
        Object.defineProperty(document, 'fullscreenElement', {
          value: null,
          writable: true,
          configurable: true,
        });
      }
    });

    it('FS-U010: should emit false when exiting fullscreen', () => {
      manager = new FullscreenManager(container);
      const handler = vi.fn();
      manager.on('fullscreenChanged', handler);

      // Simulate exit fullscreen
      const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));

      expect(handler).toHaveBeenCalledWith(false);

      // Restore
      if (originalDescriptor) {
        Object.defineProperty(document, 'fullscreenElement', originalDescriptor);
      }
    });
  });

  describe('dispose()', () => {
    it('FS-U011: should remove event listeners on dispose', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      manager = new FullscreenManager(container);
      manager.dispose();
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'fullscreenchange',
        expect.any(Function)
      );
    });
  });

  describe('isSupported()', () => {
    it('FS-U012: should return boolean based on API availability', () => {
      // In jsdom, requestFullscreen is not available, so this returns false
      // In real browsers, it would return true
      const result = FullscreenManager.isSupported();
      expect(typeof result).toBe('boolean');
    });

    it('FS-U013: should return true when requestFullscreen is mocked', () => {
      const original = document.documentElement.requestFullscreen;
      (document.documentElement as any).requestFullscreen = vi.fn();
      expect(FullscreenManager.isSupported()).toBe(true);
      document.documentElement.requestFullscreen = original;
    });
  });

  describe('webkit fallback', () => {
    it('FS-U014: should use webkitRequestFullscreen when requestFullscreen is unavailable', async () => {
      const originalRFS = container.requestFullscreen;
      // Remove standard API
      (container as any).requestFullscreen = undefined;
      // Add webkit API
      (container as any).webkitRequestFullscreen = vi.fn().mockResolvedValue(undefined);

      manager = new FullscreenManager(container);
      await manager.enter();

      expect((container as any).webkitRequestFullscreen).toHaveBeenCalled();

      // Restore
      container.requestFullscreen = originalRFS;
      delete (container as any).webkitRequestFullscreen;
    });

    it('FS-U015: should use webkitExitFullscreen when exitFullscreen is unavailable', async () => {
      const originalEFS = document.exitFullscreen;
      // Remove standard API
      (document as any).exitFullscreen = undefined;
      // Add webkit API
      (document as any).webkitExitFullscreen = vi.fn().mockResolvedValue(undefined);

      manager = new FullscreenManager(container);
      await manager.exit();

      expect((document as any).webkitExitFullscreen).toHaveBeenCalled();

      // Restore
      document.exitFullscreen = originalEFS;
      delete (document as any).webkitExitFullscreen;
    });

    it('FS-U016: should also listen for webkitfullscreenchange', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      manager = new FullscreenManager(container);
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'webkitfullscreenchange',
        expect.any(Function)
      );
    });

    it('FS-U017: should remove webkitfullscreenchange listener on dispose', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      manager = new FullscreenManager(container);
      manager.dispose();
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'webkitfullscreenchange',
        expect.any(Function)
      );
    });
  });

  describe('edge cases', () => {
    it('FS-U018: should update isFullscreen state on fullscreenchange event', () => {
      manager = new FullscreenManager(container);
      expect(manager.isFullscreen).toBe(false);

      // Simulate entering fullscreen
      const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
      Object.defineProperty(document, 'fullscreenElement', {
        value: container,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
      expect(manager.isFullscreen).toBe(true);

      // Simulate exiting fullscreen
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
      expect(manager.isFullscreen).toBe(false);

      // Restore
      if (originalDescriptor) {
        Object.defineProperty(document, 'fullscreenElement', originalDescriptor);
      }
    });

    it('FS-U019: should not throw when entering fullscreen with no API available', async () => {
      const originalRFS = container.requestFullscreen;
      (container as any).requestFullscreen = undefined;
      // Ensure no webkit fallback either
      delete (container as any).webkitRequestFullscreen;

      manager = new FullscreenManager(container);
      // Should not throw
      await expect(manager.enter()).resolves.toBeUndefined();

      container.requestFullscreen = originalRFS;
    });

    it('FS-U020: should not throw when exiting fullscreen with no API available', async () => {
      const originalEFS = document.exitFullscreen;
      (document as any).exitFullscreen = undefined;
      // Ensure no webkit fallback either
      delete (document as any).webkitExitFullscreen;

      manager = new FullscreenManager(container);
      // Should not throw
      await expect(manager.exit()).resolves.toBeUndefined();

      document.exitFullscreen = originalEFS;
    });

    it('FS-U021: dispose should clear all listeners even after multiple events', () => {
      manager = new FullscreenManager(container);
      const handler = vi.fn();
      manager.on('fullscreenChanged', handler);

      manager.dispose();

      // After dispose, simulating fullscreenchange should not call the handler
      const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
      Object.defineProperty(document, 'fullscreenElement', {
        value: container,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));

      expect(handler).not.toHaveBeenCalled();

      // Restore
      if (originalDescriptor) {
        Object.defineProperty(document, 'fullscreenElement', originalDescriptor);
      } else {
        Object.defineProperty(document, 'fullscreenElement', {
          value: null,
          writable: true,
          configurable: true,
        });
      }
    });
  });
});
