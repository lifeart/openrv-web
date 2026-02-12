import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  loadTwoVideoFiles,
  waitForTestHelper,
} from './fixtures';

/**
 * OTIO (OpenTimelineIO) Import Tests
 *
 * Tests for importing OpenTimelineIO JSON timelines into the playlist.
 * OTIO import is an internal API accessed via PlaylistManager.fromOTIO().
 *
 * Implementation:
 * - Parser: src/utils/OTIOParser.ts (parseOTIO)
 * - Playlist integration: src/core/session/PlaylistManager.ts (fromOTIO)
 * - Playlist UI: src/ui/components/PlaylistPanel.ts
 *
 * Since OTIO import has no dedicated UI button, tests call the parser and
 * playlist manager directly via page.evaluate() through the test helper.
 */

/** Helper to build a minimal valid OTIO timeline JSON string */
function buildOTIOJson(clips: Array<{
  name: string;
  startFrame: number;
  duration: number;
  targetUrl?: string;
}>, options?: { fps?: number; gaps?: Array<{ afterClipIndex: number; duration: number }> }): string {
  const fps = options?.fps ?? 24;
  const gapMap = new Map<number, number>();
  if (options?.gaps) {
    for (const gap of options.gaps) {
      gapMap.set(gap.afterClipIndex, gap.duration);
    }
  }

  const children: unknown[] = [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]!;
    children.push({
      OTIO_SCHEMA: 'Clip.1',
      name: clip.name,
      source_range: {
        OTIO_SCHEMA: 'TimeRange.1',
        start_time: {
          OTIO_SCHEMA: 'RationalTime.1',
          value: clip.startFrame,
          rate: fps,
        },
        duration: {
          OTIO_SCHEMA: 'RationalTime.1',
          value: clip.duration,
          rate: fps,
        },
      },
      ...(clip.targetUrl ? {
        media_reference: {
          OTIO_SCHEMA: 'ExternalReference.1',
          target_url: clip.targetUrl,
        },
      } : {}),
    });

    // Insert gap after this clip if specified
    const gapDuration = gapMap.get(i);
    if (gapDuration !== undefined) {
      children.push({
        OTIO_SCHEMA: 'Gap.1',
        source_range: {
          OTIO_SCHEMA: 'TimeRange.1',
          start_time: {
            OTIO_SCHEMA: 'RationalTime.1',
            value: 0,
            rate: fps,
          },
          duration: {
            OTIO_SCHEMA: 'RationalTime.1',
            value: gapDuration,
            rate: fps,
          },
        },
      });
    }
  }

  return JSON.stringify({
    OTIO_SCHEMA: 'Timeline.1',
    name: 'Test Timeline',
    global_start_time: {
      OTIO_SCHEMA: 'RationalTime.1',
      value: 0,
      rate: fps,
    },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'Tracks',
      children: [
        {
          OTIO_SCHEMA: 'Track.1',
          name: 'Video 1',
          kind: 'Video',
          children,
        },
      ],
    },
  });
}

test.describe('OTIO Import', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.waitForTimeout(200);
  });

  test.describe('parseOTIO via page.evaluate', () => {
    test('OTIO-E001: parseOTIO returns parsed result for valid OTIO JSON', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'shot_01', startFrame: 0, duration: 48 },
      ]);

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        // Access parseOTIO through the PlaylistManager's fromOTIO by testing the parser indirectly
        // We construct the call by accessing the module directly via the app's playlist manager
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        // Call fromOTIO with a resolver that always succeeds to verify parsing works
        const count = pm.fromOTIO(json, (name: string) => {
          return { index: 0, frameCount: 100 };
        });
        return { importedCount: count, clipCount: pm.getClipCount() };
      }, otioJson);

      expect(result).not.toBeNull();
      expect(result!.importedCount).toBe(1);
      expect(result!.clipCount).toBe(1);
    });

    test('OTIO-E002: parseOTIO returns 0 clips for invalid JSON', async ({ page }) => {
      const result = await page.evaluate(() => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        const count = pm.fromOTIO('not valid json {', (name: string) => {
          return { index: 0, frameCount: 100 };
        });
        return { importedCount: count, clipCount: pm.getClipCount() };
      });

      expect(result).not.toBeNull();
      expect(result!.importedCount).toBe(0);
    });

    test('OTIO-E003: parseOTIO returns 0 clips for non-Timeline schema', async ({ page }) => {
      const badJson = JSON.stringify({
        OTIO_SCHEMA: 'Clip.1',
        name: 'not a timeline',
      });

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        const count = pm.fromOTIO(json, () => ({ index: 0, frameCount: 100 }));
        return { importedCount: count };
      }, badJson);

      expect(result).not.toBeNull();
      expect(result!.importedCount).toBe(0);
    });
  });

  test.describe('fromOTIO playlist integration', () => {
    test('OTIO-E004: fromOTIO imports multiple clips into playlist', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'shot_01', startFrame: 0, duration: 48 },
        { name: 'shot_02', startFrame: 10, duration: 72 },
        { name: 'shot_03', startFrame: 0, duration: 24 },
      ]);

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear(); // Start fresh
        const count = pm.fromOTIO(json, (name: string) => {
          return { index: 0, frameCount: 200 };
        });
        const clips = pm.getClips();
        return {
          importedCount: count,
          clipCount: clips.length,
          clipNames: clips.map((c: any) => c.sourceName),
          totalDuration: pm.getTotalDuration(),
        };
      }, otioJson);

      expect(result).not.toBeNull();
      expect(result!.importedCount).toBe(3);
      expect(result!.clipCount).toBe(3);
      expect(result!.clipNames).toEqual(['shot_01', 'shot_02', 'shot_03']);
      // 48 + 72 + 24 = 144 frames total
      expect(result!.totalDuration).toBe(144);
    });

    test('OTIO-E005: fromOTIO preserves in/out points from OTIO source_range', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'shot_01', startFrame: 10, duration: 48 },
      ]);

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        pm.fromOTIO(json, () => ({ index: 0, frameCount: 200 }));
        const clips = pm.getClips();
        const clip = clips[0];
        return clip ? {
          inPoint: clip.inPoint,
          outPoint: clip.outPoint,
          duration: clip.duration,
        } : null;
      }, otioJson);

      expect(result).not.toBeNull();
      // inFrame = 10, outFrame = 10 + 48 - 1 = 57
      expect(result!.inPoint).toBe(10);
      expect(result!.outPoint).toBe(57);
      expect(result!.duration).toBe(48);
    });

    test('OTIO-E006: fromOTIO skips clips when resolver returns null', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'found_clip', startFrame: 0, duration: 48 },
        { name: 'missing_clip', startFrame: 0, duration: 24 },
        { name: 'another_found', startFrame: 0, duration: 36 },
      ]);

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        const count = pm.fromOTIO(json, (name: string) => {
          if (name === 'missing_clip') return null;
          return { index: 0, frameCount: 200 };
        });
        const clips = pm.getClips();
        return {
          importedCount: count,
          clipNames: clips.map((c: any) => c.sourceName),
        };
      }, otioJson);

      expect(result).not.toBeNull();
      expect(result!.importedCount).toBe(2);
      expect(result!.clipNames).toEqual(['found_clip', 'another_found']);
    });

    test('OTIO-E007: fromOTIO with gaps preserves timeline structure', async ({ page }) => {
      // Timeline: shot_01 (24 frames) -> gap (12 frames) -> shot_02 (24 frames)
      const otioJson = buildOTIOJson(
        [
          { name: 'shot_01', startFrame: 0, duration: 24 },
          { name: 'shot_02', startFrame: 0, duration: 24 },
        ],
        { gaps: [{ afterClipIndex: 0, duration: 12 }] }
      );

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        const count = pm.fromOTIO(json, () => ({ index: 0, frameCount: 200 }));
        const clips = pm.getClips();
        return {
          importedCount: count,
          clipCount: clips.length,
          // Verify both clips are imported (gaps are not clips)
          clipNames: clips.map((c: any) => c.sourceName),
          totalDuration: pm.getTotalDuration(),
        };
      }, otioJson);

      expect(result).not.toBeNull();
      expect(result!.importedCount).toBe(2);
      expect(result!.clipCount).toBe(2);
      expect(result!.clipNames).toEqual(['shot_01', 'shot_02']);
      // Both clips are 24 frames each = 48 total (gaps don't add to playlist clips)
      expect(result!.totalDuration).toBe(48);
    });

    test('OTIO-E008: fromOTIO returns 0 for empty timeline', async ({ page }) => {
      const otioJson = buildOTIOJson([]);

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        const count = pm.fromOTIO(json, () => ({ index: 0, frameCount: 200 }));
        return { importedCount: count, clipCount: pm.getClipCount() };
      }, otioJson);

      expect(result).not.toBeNull();
      expect(result!.importedCount).toBe(0);
      expect(result!.clipCount).toBe(0);
    });

    test('OTIO-E009: fromOTIO passes source URL to resolver', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'shot_01', startFrame: 0, duration: 48, targetUrl: '/media/shot_01.exr' },
      ]);

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        let receivedName = '';
        let receivedUrl = '';
        pm.fromOTIO(json, (name: string, url?: string) => {
          receivedName = name;
          receivedUrl = url ?? '';
          return { index: 0, frameCount: 200 };
        });
        return { receivedName, receivedUrl };
      }, otioJson);

      expect(result).not.toBeNull();
      expect(result!.receivedName).toBe('shot_01');
      expect(result!.receivedUrl).toBe('/media/shot_01.exr');
    });
  });

  test.describe('OTIO import and playlist panel UI', () => {
    test('OTIO-E010: imported OTIO clips appear in playlist panel', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'vfx_shot_A', startFrame: 0, duration: 48 },
        { name: 'vfx_shot_B', startFrame: 0, duration: 72 },
      ]);

      // Import clips via API
      await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        pm.fromOTIO(json, () => ({ index: 0, frameCount: 200 }));
      }, otioJson);

      // Open playlist panel
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(300);

      const panel = page.locator('[data-testid="playlist-panel"]');
      await expect(panel).toBeVisible();

      // Verify clip items appear
      const clipItems = page.locator('.playlist-clip-item');
      const count = await clipItems.count();
      expect(count).toBe(2);
    });

    test('OTIO-E011: imported OTIO clips show correct names in playlist panel', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'hero_shot', startFrame: 0, duration: 48 },
      ]);

      await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        pm.fromOTIO(json, () => ({ index: 0, frameCount: 200 }));
      }, otioJson);

      // Open playlist panel
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(300);

      // The clip item should display the clip name
      const clipItem = page.locator('.playlist-clip-item').first();
      const text = await clipItem.textContent();
      expect(text).toContain('hero_shot');
    });

    test('OTIO-E012: imported OTIO clips show in/out point info in panel', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'shot_with_range', startFrame: 10, duration: 48 },
      ]);

      await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        pm.fromOTIO(json, () => ({ index: 0, frameCount: 200 }));
      }, otioJson);

      // Open playlist panel
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(300);

      // Clip should show in/out point info
      const inOutInfo = page.locator('text=/In:|Out:/');
      await expect(inOutInfo).toBeVisible();
    });

    test('OTIO-E013: playlist footer updates after OTIO import', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'clip_1', startFrame: 0, duration: 24 },
        { name: 'clip_2', startFrame: 0, duration: 48 },
      ]);

      // Open playlist panel first to see empty state
      await page.keyboard.press('Shift+Alt+p');
      await page.waitForTimeout(200);

      // Import clips
      await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        pm.fromOTIO(json, () => ({ index: 0, frameCount: 200 }));
      }, otioJson);

      await page.waitForTimeout(200);

      // Footer should show clip count; scope to panel footer text pattern to avoid
      // matching numbered clip rows ("1", "2", etc.) in strict mode.
      const panel = page.locator('[data-testid="playlist-panel"]');
      const footerInfo = panel.locator('div').filter({ hasText: /clip[s]?\s*•/ }).first();
      await expect(footerInfo).toBeVisible();
      await expect(footerInfo).toContainText(/2\s*clips?/);
    });
  });

  test.describe('OTIO import with multiple sources', () => {
    test.beforeEach(async ({ page }) => {
      // Override: load two video files instead of one for multi-source tests
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(200);
    });

    test('OTIO-E014: fromOTIO maps clips to different sources via resolver', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'source_A_clip', startFrame: 0, duration: 48 },
        { name: 'source_B_clip', startFrame: 0, duration: 72 },
      ]);

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        const count = pm.fromOTIO(json, (name: string) => {
          // Map first clip to source 0, second to source 1
          if (name === 'source_A_clip') return { index: 0, frameCount: 200 };
          if (name === 'source_B_clip') return { index: 1, frameCount: 200 };
          return null;
        });
        const clips = pm.getClips();
        return {
          importedCount: count,
          clip0SourceIndex: clips[0]?.sourceIndex,
          clip1SourceIndex: clips[1]?.sourceIndex,
        };
      }, otioJson);

      expect(result).not.toBeNull();
      expect(result!.importedCount).toBe(2);
      expect(result!.clip0SourceIndex).toBe(0);
      expect(result!.clip1SourceIndex).toBe(1);
    });
  });

  test.describe('OTIO import clears and appends behavior', () => {
    test('OTIO-E015: fromOTIO appends to existing playlist clips', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'otio_clip', startFrame: 0, duration: 48 },
      ]);

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        // Add a manual clip first
        pm.addClip(0, 'manual_clip', 1, 50);
        // Then import OTIO
        const count = pm.fromOTIO(json, () => ({ index: 0, frameCount: 200 }));
        const clips = pm.getClips();
        return {
          importedCount: count,
          totalClipCount: clips.length,
          clipNames: clips.map((c: any) => c.sourceName),
        };
      }, otioJson);

      expect(result).not.toBeNull();
      expect(result!.importedCount).toBe(1);
      expect(result!.totalClipCount).toBe(2);
      expect(result!.clipNames).toEqual(['manual_clip', 'otio_clip']);
    });

    test('OTIO-E016: clear then fromOTIO gives clean import', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'fresh_clip', startFrame: 0, duration: 24 },
      ]);

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        // Add some clips first
        pm.addClip(0, 'old_clip_1', 1, 30);
        pm.addClip(0, 'old_clip_2', 1, 20);
        // Clear and import
        pm.clear();
        pm.fromOTIO(json, () => ({ index: 0, frameCount: 200 }));
        const clips = pm.getClips();
        return {
          totalClipCount: clips.length,
          clipNames: clips.map((c: any) => c.sourceName),
        };
      }, otioJson);

      expect(result).not.toBeNull();
      expect(result!.totalClipCount).toBe(1);
      expect(result!.clipNames).toEqual(['fresh_clip']);
    });
  });

  test.describe('OTIO import edge cases', () => {
    test('OTIO-E017: fromOTIO handles single-frame clips', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'single_frame', startFrame: 5, duration: 1 },
      ]);

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        pm.fromOTIO(json, () => ({ index: 0, frameCount: 200 }));
        const clips = pm.getClips();
        const clip = clips[0];
        return clip ? {
          inPoint: clip.inPoint,
          outPoint: clip.outPoint,
          duration: clip.duration,
        } : null;
      }, otioJson);

      expect(result).not.toBeNull();
      expect(result!.inPoint).toBe(5);
      expect(result!.outPoint).toBe(5); // in + 1 - 1
      expect(result!.duration).toBe(1);
    });

    test('OTIO-E018: fromOTIO handles large frame counts', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'long_clip', startFrame: 0, duration: 86400 }, // 1 hour at 24fps
      ]);

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        pm.fromOTIO(json, () => ({ index: 0, frameCount: 100000 }));
        return { totalDuration: pm.getTotalDuration() };
      }, otioJson);

      expect(result).not.toBeNull();
      expect(result!.totalDuration).toBe(86400);
    });

    test('OTIO-E019: fromOTIO with all resolvers returning null imports 0 clips', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'clip_a', startFrame: 0, duration: 48 },
        { name: 'clip_b', startFrame: 0, duration: 24 },
      ]);

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        const count = pm.fromOTIO(json, () => null);
        return { importedCount: count, clipCount: pm.getClipCount() };
      }, otioJson);

      expect(result).not.toBeNull();
      expect(result!.importedCount).toBe(0);
      expect(result!.clipCount).toBe(0);
    });

    test('OTIO-E020: fromOTIO correctly sets clip source names for display', async ({ page }) => {
      const otioJson = buildOTIOJson([
        { name: 'My VFX Shot - v003', startFrame: 0, duration: 48 },
        { name: 'BG_plate_final', startFrame: 0, duration: 24 },
      ]);

      const result = await page.evaluate((json) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (!app) return null;
        const pm = (app as any).controls?.playlistManager ?? (app as any).playlistManager;
        pm.clear();
        pm.fromOTIO(json, () => ({ index: 0, frameCount: 200 }));
        const clips = pm.getClips();
        return {
          clip0Name: clips[0]?.sourceName,
          clip1Name: clips[1]?.sourceName,
        };
      }, otioJson);

      expect(result).not.toBeNull();
      // fromOTIO uses clip.name as the sourceName
      expect(result!.clip0Name).toBe('My VFX Shot - v003');
      expect(result!.clip1Name).toBe('BG_plate_final');
    });
  });
});
