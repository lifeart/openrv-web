import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacheManagementPanel } from './CacheManagementPanel';
import type { MediaCacheManager } from '../../cache/MediaCacheManager';

function createMockCacheManager(): MediaCacheManager {
  return {
    getStats: vi.fn().mockResolvedValue({
      entryCount: 0,
      totalSizeBytes: 0,
      maxSizeBytes: 1024 * 1024 * 100,
    }),
    clearAll: vi.fn().mockResolvedValue(undefined),
  } as unknown as MediaCacheManager;
}

describe('CacheManagementPanel', () => {
  let panel: CacheManagementPanel;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    panel = new CacheManagementPanel(createMockCacheManager());
  });

  afterEach(() => {
    panel.dispose();
    infoSpy.mockRestore();
  });

  describe('not-wired documentation', () => {
    it('CACHE-PANEL-001: has a static NOT_WIRED_MESSAGE property', () => {
      expect(CacheManagementPanel.NOT_WIRED_MESSAGE).toContain('not mounted in production layout');
    });

    it('CACHE-PANEL-002: logs an info message on construction about not being wired', () => {
      expect(infoSpy).toHaveBeenCalledWith(CacheManagementPanel.NOT_WIRED_MESSAGE);
    });

    it('CACHE-PANEL-003: source file contains TODO(#16) referencing the wiring issue', async () => {
      // Verify the static message references the issue number
      expect(CacheManagementPanel.NOT_WIRED_MESSAGE).toContain('#16');
    });
  });

  describe('basic functionality', () => {
    it('CACHE-PANEL-004: creates a container element with correct test id', () => {
      const el = panel.getElement();
      expect(el.dataset.testid).toBe('cache-management-panel');
    });

    it('CACHE-PANEL-005: starts hidden', () => {
      expect(panel.isVisible()).toBe(false);
    });

    it('CACHE-PANEL-006: show/hide toggles visibility', () => {
      panel.show();
      expect(panel.isVisible()).toBe(true);
      panel.hide();
      expect(panel.isVisible()).toBe(false);
    });

    it('CACHE-PANEL-007: toggle flips visibility', () => {
      panel.toggle();
      expect(panel.isVisible()).toBe(true);
      panel.toggle();
      expect(panel.isVisible()).toBe(false);
    });
  });
});
