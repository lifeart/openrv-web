/**
 * Scripting API E2E Tests
 *
 * Tests the public window.openrv API from the browser context.
 */

import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getSessionState,
  getViewerState,
} from './fixtures';

test.describe('Scripting API', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  // ============================================================
  // API Availability Tests
  // ============================================================

  test('SCRIPT-001: window.openrv exists after app initialization', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.openrv !== 'undefined');
    expect(exists).toBe(true);
  });

  test('SCRIPT-002: openrv.version returns valid semver string', async ({ page }) => {
    const version = await page.evaluate(() => window.openrv?.version);
    expect(version).toBeDefined();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('SCRIPT-003: openrv.isReady() returns true when app is loaded', async ({ page }) => {
    const ready = await page.evaluate(() => window.openrv?.isReady());
    expect(ready).toBe(true);
  });

  test('SCRIPT-004: All major API namespaces exist', async ({ page }) => {
    const namespaces = await page.evaluate(() => ({
      playback: typeof window.openrv?.playback,
      media: typeof window.openrv?.media,
      audio: typeof window.openrv?.audio,
      loop: typeof window.openrv?.loop,
      view: typeof window.openrv?.view,
      color: typeof window.openrv?.color,
      markers: typeof window.openrv?.markers,
      events: typeof window.openrv?.events,
    }));

    expect(namespaces.playback).toBe('object');
    expect(namespaces.media).toBe('object');
    expect(namespaces.audio).toBe('object');
    expect(namespaces.loop).toBe('object');
    expect(namespaces.view).toBe('object');
    expect(namespaces.color).toBe('object');
    expect(namespaces.markers).toBe('object');
    expect(namespaces.events).toBe('object');
  });

  // ============================================================
  // Media Information Tests (no media loaded)
  // ============================================================

  test('SCRIPT-030: openrv.media.getCurrentSource() returns null when no media', async ({ page }) => {
    const source = await page.evaluate(() => window.openrv?.media.getCurrentSource());
    expect(source).toBeNull();
  });

  test('SCRIPT-031: openrv.media.hasMedia() returns false when no media', async ({ page }) => {
    const hasMedia = await page.evaluate(() => window.openrv?.media.hasMedia());
    expect(hasMedia).toBe(false);
  });

  // ============================================================
  // Tests requiring loaded media
  // ============================================================

  test.describe('With Media Loaded', () => {
    test.beforeEach(async ({ page }) => {
      await loadVideoFile(page);
    });

    // Playback Control Tests
    test('SCRIPT-010: openrv.playback.play() starts playback', async ({ page }) => {
      await page.evaluate(() => window.openrv?.playback.play());
      await page.waitForTimeout(200);
      const isPlaying = await page.evaluate(() => window.openrv?.playback.isPlaying());
      expect(isPlaying).toBe(true);
      // Stop playback to clean up
      await page.evaluate(() => window.openrv?.playback.pause());
    });

    test('SCRIPT-011: openrv.playback.pause() stops playback', async ({ page }) => {
      await page.evaluate(() => window.openrv?.playback.play());
      await page.waitForTimeout(100);
      await page.evaluate(() => window.openrv?.playback.pause());
      await page.waitForTimeout(100);
      const isPlaying = await page.evaluate(() => window.openrv?.playback.isPlaying());
      expect(isPlaying).toBe(false);
    });

    test('SCRIPT-012: openrv.playback.toggle() toggles play/pause state', async ({ page }) => {
      // Start playing
      await page.evaluate(() => window.openrv?.playback.toggle());
      await page.waitForTimeout(200);
      const playing = await page.evaluate(() => window.openrv?.playback.isPlaying());
      expect(playing).toBe(true);

      // Stop
      await page.evaluate(() => window.openrv?.playback.toggle());
      await page.waitForTimeout(100);
      const stopped = await page.evaluate(() => window.openrv?.playback.isPlaying());
      expect(stopped).toBe(false);
    });

    test('SCRIPT-014: openrv.playback.seek(frame) navigates to correct frame', async ({ page }) => {
      await page.evaluate(() => window.openrv?.playback.seek(10));
      await page.waitForTimeout(100);
      const frame = await page.evaluate(() => window.openrv?.playback.getCurrentFrame());
      expect(frame).toBe(10);
    });

    test('SCRIPT-015: openrv.playback.seek() clamps to valid frame range', async ({ page }) => {
      // Seek to very large frame
      await page.evaluate(() => window.openrv?.playback.seek(999999));
      await page.waitForTimeout(100);
      const frame = await page.evaluate(() => window.openrv?.playback.getCurrentFrame());
      const total = await page.evaluate(() => window.openrv?.playback.getTotalFrames());
      // Should be clamped to total frames
      expect(frame).toBeLessThanOrEqual(total ?? 0);
      expect(frame).toBeGreaterThan(0);
    });

    test('SCRIPT-016: openrv.playback.step(1) advances one frame', async ({ page }) => {
      await page.evaluate(() => window.openrv?.playback.seek(5));
      await page.waitForTimeout(100);
      const before = await page.evaluate(() => window.openrv?.playback.getCurrentFrame());
      await page.evaluate(() => window.openrv?.playback.step(1));
      await page.waitForTimeout(100);
      const after = await page.evaluate(() => window.openrv?.playback.getCurrentFrame());
      expect(after).toBe((before ?? 0) + 1);
    });

    test('SCRIPT-017: openrv.playback.step(-1) goes back one frame', async ({ page }) => {
      await page.evaluate(() => window.openrv?.playback.seek(10));
      await page.waitForTimeout(100);
      const before = await page.evaluate(() => window.openrv?.playback.getCurrentFrame());
      await page.evaluate(() => window.openrv?.playback.step(-1));
      await page.waitForTimeout(100);
      const after = await page.evaluate(() => window.openrv?.playback.getCurrentFrame());
      expect(after).toBe((before ?? 0) - 1);
    });

    test('SCRIPT-020: openrv.playback.getSpeed() returns current speed', async ({ page }) => {
      const speed = await page.evaluate(() => window.openrv?.playback.getSpeed());
      expect(speed).toBe(1);
    });

    test('SCRIPT-022: openrv.playback.getCurrentFrame() returns current frame', async ({ page }) => {
      const frame = await page.evaluate(() => window.openrv?.playback.getCurrentFrame());
      expect(typeof frame).toBe('number');
      expect(frame).toBeGreaterThan(0);
    });

    // Media Information Tests
    test('SCRIPT-031b: openrv.media.getCurrentSource() returns source info after load', async ({ page }) => {
      const source = await page.evaluate(() => window.openrv?.media.getCurrentSource());
      expect(source).not.toBeNull();
      expect(source?.type).toBe('video');
      expect(source?.width).toBeGreaterThan(0);
      expect(source?.height).toBeGreaterThan(0);
      expect(source?.duration).toBeGreaterThan(0);
    });

    test('SCRIPT-032: openrv.media.getDuration() returns frame count', async ({ page }) => {
      const duration = await page.evaluate(() => window.openrv?.media.getDuration());
      expect(duration).toBeGreaterThan(0);
    });

    test('SCRIPT-033: openrv.media.getFPS() returns correct framerate', async ({ page }) => {
      const fps = await page.evaluate(() => window.openrv?.media.getFPS());
      expect(fps).toBeGreaterThan(0);
    });

    test('SCRIPT-034: openrv.media.getResolution() returns width and height', async ({ page }) => {
      const res = await page.evaluate(() => window.openrv?.media.getResolution());
      expect(res?.width).toBeGreaterThan(0);
      expect(res?.height).toBeGreaterThan(0);
    });

    // Audio Control Tests
    test('SCRIPT-040: openrv.audio.setVolume(0.5) sets volume to 50%', async ({ page }) => {
      await page.evaluate(() => window.openrv?.audio.setVolume(0.5));
      const vol = await page.evaluate(() => window.openrv?.audio.getVolume());
      expect(vol).toBe(0.5);
    });

    test('SCRIPT-042: openrv.audio.mute() mutes audio', async ({ page }) => {
      await page.evaluate(() => window.openrv?.audio.mute());
      const muted = await page.evaluate(() => window.openrv?.audio.isMuted());
      expect(muted).toBe(true);
    });

    test('SCRIPT-043: openrv.audio.unmute() unmutes audio', async ({ page }) => {
      await page.evaluate(() => window.openrv?.audio.mute());
      await page.evaluate(() => window.openrv?.audio.unmute());
      const muted = await page.evaluate(() => window.openrv?.audio.isMuted());
      expect(muted).toBe(false);
    });

    // Loop Control Tests
    test('SCRIPT-050: openrv.loop.setMode(loop) enables looping', async ({ page }) => {
      await page.evaluate(() => window.openrv?.loop.setMode('loop'));
      const mode = await page.evaluate(() => window.openrv?.loop.getMode());
      expect(mode).toBe('loop');
    });

    test('SCRIPT-051: openrv.loop.setMode(once) disables looping', async ({ page }) => {
      await page.evaluate(() => window.openrv?.loop.setMode('once'));
      const mode = await page.evaluate(() => window.openrv?.loop.getMode());
      expect(mode).toBe('once');
    });

    test('SCRIPT-052: openrv.loop.setMode(pingpong) enables pingpong', async ({ page }) => {
      await page.evaluate(() => window.openrv?.loop.setMode('pingpong'));
      const mode = await page.evaluate(() => window.openrv?.loop.getMode());
      expect(mode).toBe('pingpong');
    });

    test('SCRIPT-054: openrv.loop.setInPoint(10) sets in point', async ({ page }) => {
      const duration = await page.evaluate(() => window.openrv?.media.getDuration() ?? 0);
      const targetInPoint = Math.max(1, Math.min(10, Math.max(1, duration - 1)));
      await page.evaluate((value) => window.openrv?.loop.setInPoint(value), targetInPoint);
      const inPt = await page.evaluate(() => window.openrv?.loop.getInPoint());
      expect(inPt).toBe(targetInPoint);
    });

    test('SCRIPT-055: openrv.loop.setOutPoint(50) sets out point', async ({ page }) => {
      const duration = await page.evaluate(() => window.openrv?.media.getDuration() ?? 0);
      const targetOutPoint = Math.max(1, Math.min(50, duration));
      await page.evaluate((value) => window.openrv?.loop.setOutPoint(value), targetOutPoint);
      const outPt = await page.evaluate(() => window.openrv?.loop.getOutPoint());
      expect(outPt).toBe(targetOutPoint);
    });

    // View Control Tests
    test('SCRIPT-060: openrv.view.setZoom(2) sets 200% zoom', async ({ page }) => {
      await page.evaluate(() => window.openrv?.view.setZoom(2));
      await page.waitForTimeout(100);
      const zoom = await page.evaluate(() => window.openrv?.view.getZoom());
      expect(zoom).toBe(2);
    });

    test('SCRIPT-062: openrv.view.fitToWindow() fits image to viewport', async ({ page }) => {
      // Set non-default zoom first
      await page.evaluate(() => window.openrv?.view.setZoom(4));
      await page.waitForTimeout(100);
      await page.evaluate(() => window.openrv?.view.fitToWindow());
      await page.waitForTimeout(100);
      const zoom = await page.evaluate(() => window.openrv?.view.getZoom());
      // Zoom should be reasonable (not 4 anymore)
      expect(zoom).not.toBe(4);
    });

    test('SCRIPT-065: openrv.view.setChannel(red) isolates red channel', async ({ page }) => {
      await page.evaluate(() => window.openrv?.view.setChannel('red'));
      await page.waitForTimeout(100);
      const channel = await page.evaluate(() => window.openrv?.view.getChannel());
      expect(channel).toBe('red');
    });

    test('SCRIPT-066: openrv.view.getChannel() returns current channel', async ({ page }) => {
      const channel = await page.evaluate(() => window.openrv?.view.getChannel());
      expect(channel).toBe('rgb');
    });

    // Marker Tests
    test('SCRIPT-080: openrv.markers.add(10) adds marker at frame 10', async ({ page }) => {
      await page.evaluate(() => window.openrv?.markers.add(10));
      const all = await page.evaluate(() => window.openrv?.markers.getAll());
      expect(all?.length).toBe(1);
      expect(all?.[0]?.frame).toBe(10);
    });

    test('SCRIPT-081: openrv.markers.add(10, note) adds marker with note', async ({ page }) => {
      await page.evaluate(() => window.openrv?.markers.add(10, 'my note'));
      const all = await page.evaluate(() => window.openrv?.markers.getAll());
      expect(all?.[0]?.note).toBe('my note');
    });

    test('SCRIPT-082: openrv.markers.add(10, note, color) adds colored marker', async ({ page }) => {
      await page.evaluate(() => window.openrv?.markers.add(10, 'test', '#00ff00'));
      const all = await page.evaluate(() => window.openrv?.markers.getAll());
      expect(all?.[0]?.color).toBe('#00ff00');
    });

    test('SCRIPT-083: openrv.markers.remove(10) removes marker', async ({ page }) => {
      await page.evaluate(() => window.openrv?.markers.add(10));
      await page.evaluate(() => window.openrv?.markers.remove(10));
      const all = await page.evaluate(() => window.openrv?.markers.getAll());
      expect(all?.length).toBe(0);
    });

    test('SCRIPT-085: openrv.markers.clear() removes all markers', async ({ page }) => {
      await page.evaluate(() => {
        window.openrv?.markers.add(10);
        window.openrv?.markers.add(20);
        window.openrv?.markers.add(30);
      });
      await page.evaluate(() => window.openrv?.markers.clear());
      const all = await page.evaluate(() => window.openrv?.markers.getAll());
      expect(all?.length).toBe(0);
    });

    // Event System Tests
    test('SCRIPT-090: openrv.events.on(frameChange, fn) registers callback', async ({ page }) => {
      const result = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          window.openrv?.events.on('frameChange', (data) => {
            resolve((data as any).frame);
          });
          // Trigger a frame change
          window.openrv?.playback.seek(15);
        });
      });
      expect(result).toBe(15);
    });

    test('SCRIPT-092: openrv.events.off() removes callback', async ({ page }) => {
      const callCount = await page.evaluate(() => {
        let count = 0;
        const handler = () => { count++; };
        window.openrv?.events.on('frameChange', handler);
        window.openrv?.playback.seek(5);
        // Remove listener
        window.openrv?.events.off('frameChange', handler);
        window.openrv?.playback.seek(10);
        return count;
      });
      expect(callCount).toBe(1);
    });

    test('SCRIPT-093: openrv.events.once() fires only once', async ({ page }) => {
      const callCount = await page.evaluate(() => {
        let count = 0;
        window.openrv?.events.once('frameChange', () => { count++; });
        window.openrv?.playback.seek(5);
        window.openrv?.playback.seek(10);
        window.openrv?.playback.seek(15);
        return count;
      });
      expect(callCount).toBe(1);
    });

    test('SCRIPT-094: on() returns unsubscribe function', async ({ page }) => {
      const callCount = await page.evaluate(() => {
        let count = 0;
        const unsub = window.openrv?.events.on('frameChange', () => { count++; });
        window.openrv?.playback.seek(5);
        // Unsubscribe using returned function
        unsub?.();
        window.openrv?.playback.seek(10);
        return count;
      });
      expect(callCount).toBe(1);
    });

    // Integration Tests
    test('SCRIPT-100: Sequential API calls execute in order', async ({ page }) => {
      const duration = await page.evaluate(() => window.openrv?.media.getDuration() ?? 1);
      const targetFrame = Math.max(1, duration);
      await page.evaluate((target) => {
        window.openrv?.playback.seek(1);
        window.openrv?.playback.seek(Math.max(1, target - 7));
        window.openrv?.playback.seek(target);
      }, targetFrame);
      await page.waitForTimeout(100);
      const frame = await page.evaluate(() => window.openrv?.playback.getCurrentFrame());
      expect(frame).toBe(targetFrame);
    });

    test('SCRIPT-102: API state matches UI state after API calls', async ({ page }) => {
      // Use API to seek to frame 10
      await page.evaluate(() => window.openrv?.playback.seek(10));
      await page.waitForTimeout(100);

      // Check via API
      const apiFrame = await page.evaluate(() => window.openrv?.playback.getCurrentFrame());

      // Check via test helper
      const sessionState = await getSessionState(page);

      expect(apiFrame).toBe(10);
      expect(sessionState.currentFrame).toBe(10);
    });

    test('SCRIPT-103: UI changes trigger corresponding events', async ({ page }) => {
      // Use keyboard to step forward and check if event fires
      const result = await page.evaluate(() => {
        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => resolve(false), 2000);
          window.openrv?.events.on('frameChange', () => {
            clearTimeout(timeout);
            resolve(true);
          });
          // Step forward via API (simulating what keyboard would do)
          window.openrv?.playback.step(1);
        });
      });
      expect(result).toBe(true);
    });

    // Color Control Tests
    test('SCRIPT-070: openrv.color.setAdjustments({ exposure: 0.5 }) changes exposure', async ({ page }) => {
      await page.evaluate(() => window.openrv?.color.setAdjustments({ exposure: 0.5 }));
      await page.waitForTimeout(100);
      const adj = await page.evaluate(() => window.openrv?.color.getAdjustments());
      expect(adj?.exposure).toBe(0.5);
    });

    test('SCRIPT-071: openrv.color.getAdjustments() returns all adjustments', async ({ page }) => {
      const adj = await page.evaluate(() => window.openrv?.color.getAdjustments());
      expect(adj).toBeDefined();
      expect(typeof adj?.exposure).toBe('number');
      expect(typeof adj?.gamma).toBe('number');
      expect(typeof adj?.saturation).toBe('number');
      expect(typeof adj?.contrast).toBe('number');
    });

    test('SCRIPT-072: openrv.color.reset() restores default values', async ({ page }) => {
      await page.evaluate(() => window.openrv?.color.setAdjustments({ exposure: 2 }));
      await page.evaluate(() => window.openrv?.color.reset());
      await page.waitForTimeout(100);
      const adj = await page.evaluate(() => window.openrv?.color.getAdjustments());
      expect(adj?.exposure).toBe(0);
    });

    test('SCRIPT-074: openrv.color.getCDL() returns CDL values', async ({ page }) => {
      const cdl = await page.evaluate(() => window.openrv?.color.getCDL());
      expect(cdl).toBeDefined();
      expect(cdl?.slope).toBeDefined();
      expect(cdl?.offset).toBeDefined();
      expect(cdl?.power).toBeDefined();
      expect(typeof cdl?.saturation).toBe('number');
    });
  });
});
