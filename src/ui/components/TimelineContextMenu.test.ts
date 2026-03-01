/**
 * TimelineContextMenu Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimelineContextMenu, TimelineContextMenuOptions } from './TimelineContextMenu';

function makeOptions(overrides: Partial<TimelineContextMenuOptions> = {}): TimelineContextMenuOptions {
  return {
    x: 200,
    y: 300,
    frame: 42,
    frameLabel: 'Frame 42',
    timecode: '00:00:01:18',
    sourceName: 'clip_001.mp4',
    sourceResolution: '1920x1080',
    sourceType: 'video',
    markerAtFrame: null,
    hasCustomInOut: false,
    inPoint: 1,
    outPoint: 100,
    onGoToFrame: vi.fn(),
    onSetInPoint: vi.fn(),
    onSetOutPoint: vi.fn(),
    onResetInOutPoints: vi.fn(),
    onToggleMark: vi.fn(),
    onRemoveMark: vi.fn(),
    onCopyTimecode: vi.fn(),
    ...overrides,
  };
}

describe('TimelineContextMenu', () => {
  let menu: TimelineContextMenu;

  beforeEach(() => {
    menu = new TimelineContextMenu();
  });

  afterEach(() => {
    menu.dispose();
    // Clean up any leftover menus
    document.querySelectorAll('.timeline-main-context-menu').forEach(el => el.remove());
  });

  describe('visibility and lifecycle', () => {
    it('TCM-001: isVisible() returns false initially', () => {
      expect(menu.isVisible()).toBe(false);
    });

    it('TCM-002: isVisible() returns true after show()', () => {
      menu.show(makeOptions());
      expect(menu.isVisible()).toBe(true);
    });

    it('TCM-003: isVisible() returns false after hide()', () => {
      menu.show(makeOptions());
      menu.hide();
      expect(menu.isVisible()).toBe(false);
    });

    it('TCM-004: menu element is in the DOM after show()', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu');
      expect(el).not.toBeNull();
    });

    it('TCM-005: menu element is removed from the DOM after hide()', () => {
      menu.show(makeOptions());
      menu.hide();
      const el = document.querySelector('.timeline-main-context-menu');
      expect(el).toBeNull();
    });

    it('TCM-006: dispose() removes the menu', () => {
      menu.show(makeOptions());
      menu.dispose();
      const el = document.querySelector('.timeline-main-context-menu');
      expect(el).toBeNull();
      expect(menu.isVisible()).toBe(false);
    });

    it('TCM-007: calling show() a second time replaces the previous menu', () => {
      menu.show(makeOptions({ frame: 10, frameLabel: 'Frame 10' }));
      menu.show(makeOptions({ frame: 20, frameLabel: 'Frame 20' }));
      const menus = document.querySelectorAll('.timeline-main-context-menu');
      expect(menus.length).toBe(1);
      expect(menus[0]!.textContent).toContain('Frame 20');
    });

    it('TCM-008: hide() is safe to call when already hidden', () => {
      expect(() => menu.hide()).not.toThrow();
    });

    it('TCM-009: dispose() is safe to call multiple times', () => {
      menu.show(makeOptions());
      expect(() => {
        menu.dispose();
        menu.dispose();
      }).not.toThrow();
    });
  });

  describe('positioning', () => {
    it('TCM-010: menu appears at specified coordinates', () => {
      menu.show(makeOptions({ x: 100, y: 200 }));
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.style.left).toBe('100px');
      expect(el.style.top).toBe('200px');
    });

    it('TCM-011: menu renders with visibility hidden before clamping, then visible after', () => {
      // After show completes, visibility should be 'visible'
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.style.visibility).toBe('visible');
    });

    it('TCM-012: viewport clamping adjusts position when overflowing right edge', () => {
      vi.stubGlobal('innerWidth', 300);
      vi.stubGlobal('innerHeight', 800);
      // Mock getBoundingClientRect on any new div to return a realistic size
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: ElementCreationOptions) => {
        const el = origCreate(tag, opts);
        if (tag === 'div') {
          vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
            width: 240, height: 200, top: 0, left: 0,
            bottom: 200, right: 240, x: 0, y: 0, toJSON: () => {},
          } as DOMRect);
        }
        return el;
      });
      menu.show(makeOptions({ x: 280, y: 50 }));
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const left = parseInt(el.style.left, 10);
      // 280 + 240 > 300 - 8, so should flip: 280 - 240 = 40
      expect(left).toBeLessThan(280);
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('TCM-013: viewport clamping adjusts position when overflowing bottom edge', () => {
      vi.stubGlobal('innerWidth', 1024);
      vi.stubGlobal('innerHeight', 100);
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: ElementCreationOptions) => {
        const el = origCreate(tag, opts);
        if (tag === 'div') {
          vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
            width: 240, height: 200, top: 0, left: 0,
            bottom: 200, right: 240, x: 0, y: 0, toJSON: () => {},
          } as DOMRect);
        }
        return el;
      });
      menu.show(makeOptions({ x: 50, y: 90 }));
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const top = parseInt(el.style.top, 10);
      // 90 + 200 > 100 - 8, so should flip upward: 90 - 200 = -110, then clamped to 8
      expect(top).toBeLessThan(90);
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('TCM-014: viewport clamping enforces left margin', () => {
      // Flip scenario: x=-100, width=240 => flipped to -100-240=-340, then clamped to 8
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: ElementCreationOptions) => {
        const el = origCreate(tag, opts);
        if (tag === 'div') {
          vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
            width: 240, height: 200, top: 0, left: 0,
            bottom: 200, right: 240, x: 0, y: 0, toJSON: () => {},
          } as DOMRect);
        }
        return el;
      });
      menu.show(makeOptions({ x: -100, y: 50 }));
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const left = parseInt(el.style.left, 10);
      expect(left).toBeGreaterThanOrEqual(8); // VIEWPORT_MARGIN
      vi.restoreAllMocks();
    });
  });

  describe('info header', () => {
    it('TCM-015: displays frame number and timecode correctly', () => {
      menu.show(makeOptions({ frameLabel: 'Frame 42', timecode: '00:00:01:18' }));
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.textContent).toContain('Frame 42');
      expect(el.textContent).toContain('00:00:01:18');
    });

    it('TCM-016: displays source info with video type label', () => {
      menu.show(makeOptions({ sourceName: 'clip.mp4', sourceType: 'video', sourceResolution: '1920x1080' }));
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.textContent).toContain('[VID]');
      expect(el.textContent).toContain('clip.mp4');
      expect(el.textContent).toContain('1920x1080');
    });

    it('TCM-017: displays source info with image type label', () => {
      menu.show(makeOptions({ sourceName: 'photo.exr', sourceType: 'image', sourceResolution: '3840x2160' }));
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.textContent).toContain('[IMG]');
      expect(el.textContent).toContain('photo.exr');
    });

    it('TCM-018: hides source info when sourceName is null', () => {
      menu.show(makeOptions({ sourceName: null }));
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.textContent).not.toContain('[VID]');
      expect(el.textContent).not.toContain('[IMG]');
    });

    it('TCM-019: info header rows use role="none"', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const noneRows = el.querySelectorAll('[role="none"]');
      // At least 1 info row (frame/timecode), maybe 2 if source info is present
      expect(noneRows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('menu items', () => {
    it('TCM-020: all action items are present with correct labels', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const items = el.querySelectorAll('[role="menuitem"]');
      const labels = Array.from(items).map(i => i.textContent);
      expect(labels.some(l => l!.includes('Copy Timecode'))).toBe(true);
      expect(labels.some(l => l!.includes('Go to Frame 42'))).toBe(true);
      expect(labels.some(l => l!.includes('Set In Point Here'))).toBe(true);
      expect(labels.some(l => l!.includes('Set Out Point Here'))).toBe(true);
      expect(labels.some(l => l!.includes('Add Mark at Frame 42'))).toBe(true);
    });

    it('TCM-021: menu items have role="menuitem"', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const items = el.querySelectorAll('[role="menuitem"]');
      expect(items.length).toBeGreaterThanOrEqual(5);
    });

    it('TCM-022: menu items have tabindex="-1"', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const items = el.querySelectorAll('[role="menuitem"]');
      items.forEach(item => {
        expect(item.getAttribute('tabindex')).toBe('-1');
      });
    });

    it('TCM-023: shortcut hints are displayed for items with shortcuts', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.textContent).toContain('Ctrl+C');
      expect(el.textContent).toContain('I');
      expect(el.textContent).toContain('O');
      expect(el.textContent).toContain('M');
    });
  });

  describe('conditional items', () => {
    it('TCM-024: "Clear In/Out Range" is hidden when hasCustomInOut is false', () => {
      menu.show(makeOptions({ hasCustomInOut: false }));
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.textContent).not.toContain('Clear In/Out Range');
    });

    it('TCM-025: "Clear In/Out Range" is shown when hasCustomInOut is true', () => {
      menu.show(makeOptions({ hasCustomInOut: true }));
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.textContent).toContain('Clear In/Out Range');
    });

    it('TCM-026: shows "Add Mark" when markerAtFrame is null', () => {
      menu.show(makeOptions({ markerAtFrame: null, frame: 42, frameLabel: 'Frame 42' }));
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.textContent).toContain('Add Mark at Frame 42');
      expect(el.textContent).not.toContain('Remove Mark');
    });

    it('TCM-027: shows "Remove Mark" when markerAtFrame is present', () => {
      menu.show(makeOptions({ markerAtFrame: { frame: 40 } }));
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.textContent).toContain('Remove Mark at Frame 40');
      expect(el.textContent).not.toContain('Add Mark');
    });
  });

  describe('action callbacks', () => {
    it('TCM-028: "Copy Timecode" calls onCopyTimecode with the correct timecode', () => {
      const opts = makeOptions({ timecode: '00:01:02:03' });
      menu.show(opts);
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const copyItem = Array.from(el.querySelectorAll('[role="menuitem"]')).find(
        i => i.textContent!.includes('Copy Timecode')
      );
      (copyItem as HTMLElement).click();
      expect(opts.onCopyTimecode).toHaveBeenCalledWith('00:01:02:03');
    });

    it('TCM-029: "Go to Frame" calls onGoToFrame with the correct frame', () => {
      const opts = makeOptions({ frame: 42 });
      menu.show(opts);
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const item = Array.from(el.querySelectorAll('[role="menuitem"]')).find(
        i => i.textContent!.includes('Go to')
      );
      (item as HTMLElement).click();
      expect(opts.onGoToFrame).toHaveBeenCalledWith(42);
    });

    it('TCM-030: "Set In Point Here" calls onSetInPoint with the correct frame', () => {
      const opts = makeOptions({ frame: 42 });
      menu.show(opts);
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const item = Array.from(el.querySelectorAll('[role="menuitem"]')).find(
        i => i.textContent!.includes('Set In Point Here')
      );
      (item as HTMLElement).click();
      expect(opts.onSetInPoint).toHaveBeenCalledWith(42);
    });

    it('TCM-031: "Set Out Point Here" calls onSetOutPoint with the correct frame', () => {
      const opts = makeOptions({ frame: 42 });
      menu.show(opts);
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const item = Array.from(el.querySelectorAll('[role="menuitem"]')).find(
        i => i.textContent!.includes('Set Out Point Here')
      );
      (item as HTMLElement).click();
      expect(opts.onSetOutPoint).toHaveBeenCalledWith(42);
    });

    it('TCM-032: "Clear In/Out Range" calls onResetInOutPoints', () => {
      const opts = makeOptions({ hasCustomInOut: true });
      menu.show(opts);
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const item = Array.from(el.querySelectorAll('[role="menuitem"]')).find(
        i => i.textContent!.includes('Clear In/Out Range')
      );
      (item as HTMLElement).click();
      expect(opts.onResetInOutPoints).toHaveBeenCalled();
    });

    it('TCM-033: "Add Mark" calls onToggleMark with the clicked frame', () => {
      const opts = makeOptions({ frame: 42, markerAtFrame: null });
      menu.show(opts);
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const item = Array.from(el.querySelectorAll('[role="menuitem"]')).find(
        i => i.textContent!.includes('Add Mark')
      );
      (item as HTMLElement).click();
      expect(opts.onToggleMark).toHaveBeenCalledWith(42);
    });

    it('TCM-034: "Remove Mark" calls onRemoveMark with the marker start frame', () => {
      const opts = makeOptions({ frame: 50, markerAtFrame: { frame: 40 } });
      menu.show(opts);
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const item = Array.from(el.querySelectorAll('[role="menuitem"]')).find(
        i => i.textContent!.includes('Remove Mark')
      );
      (item as HTMLElement).click();
      expect(opts.onRemoveMark).toHaveBeenCalledWith(40);
    });

    it('TCM-035: clicking an action item hides the menu', () => {
      const opts = makeOptions();
      menu.show(opts);
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const item = Array.from(el.querySelectorAll('[role="menuitem"]')).find(
        i => i.textContent!.includes('Go to')
      );
      (item as HTMLElement).click();
      expect(menu.isVisible()).toBe(false);
    });
  });

  describe('dismissal', () => {
    it('TCM-036: pressing Escape hides the menu', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(menu.isVisible()).toBe(false);
    });

    it('TCM-037: clicking outside the menu hides it', async () => {
      menu.show(makeOptions());
      // The outside click handler is deferred via setTimeout(0)
      await new Promise(resolve => setTimeout(resolve, 10));
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(menu.isVisible()).toBe(false);
    });

    it('TCM-038: window blur hides the menu', () => {
      menu.show(makeOptions());
      window.dispatchEvent(new Event('blur'));
      expect(menu.isVisible()).toBe(false);
    });

    it('TCM-039: scroll hides the menu', () => {
      menu.show(makeOptions());
      window.dispatchEvent(new Event('scroll'));
      expect(menu.isVisible()).toBe(false);
    });
  });

  describe('keyboard navigation', () => {
    it('TCM-040: ArrowDown moves focus to next menu item', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const items = el.querySelectorAll<HTMLElement>('[role="menuitem"]');

      // First item should be focused initially
      items[0]!.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(items[1]);
    });

    it('TCM-041: ArrowUp moves focus to previous menu item', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const items = el.querySelectorAll<HTMLElement>('[role="menuitem"]');

      items[1]!.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(items[0]);
    });

    it('TCM-042: ArrowDown wraps from last item to first', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const items = el.querySelectorAll<HTMLElement>('[role="menuitem"]');
      const lastItem = items[items.length - 1]!;

      lastItem.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(items[0]);
    });

    it('TCM-043: ArrowUp wraps from first item to last', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const items = el.querySelectorAll<HTMLElement>('[role="menuitem"]');

      items[0]!.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(items[items.length - 1]);
    });

    it('TCM-044: Enter activates the focused menu item', () => {
      const opts = makeOptions();
      menu.show(opts);
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const items = el.querySelectorAll<HTMLElement>('[role="menuitem"]');

      // Focus the "Go to Frame" item (index 1 usually)
      const goToItem = Array.from(items).find(i => i.textContent!.includes('Go to'))!;
      goToItem.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(opts.onGoToFrame).toHaveBeenCalled();
    });

    it('TCM-045: Space activates the focused menu item', () => {
      const opts = makeOptions();
      menu.show(opts);
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const items = el.querySelectorAll<HTMLElement>('[role="menuitem"]');

      const copyItem = Array.from(items).find(i => i.textContent!.includes('Copy Timecode'))!;
      copyItem.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(opts.onCopyTimecode).toHaveBeenCalled();
    });

    it('TCM-046: Home key moves focus to first item', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const items = el.querySelectorAll<HTMLElement>('[role="menuitem"]');

      items[items.length - 1]!.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      expect(document.activeElement).toBe(items[0]);
    });

    it('TCM-047: End key moves focus to last item', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const items = el.querySelectorAll<HTMLElement>('[role="menuitem"]');

      items[0]!.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      expect(document.activeElement).toBe(items[items.length - 1]);
    });
  });

  describe('accessibility', () => {
    it('TCM-048: menu has role="menu"', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.getAttribute('role')).toBe('menu');
    });

    it('TCM-049: menu has aria-label', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.getAttribute('aria-label')).toBe('Timeline context menu');
    });

    it('TCM-050: first action item receives focus on open', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      const firstItem = el.querySelector('[role="menuitem"]');
      expect(document.activeElement).toBe(firstItem);
    });
  });

  describe('multiple context menus', () => {
    it('TCM-051: show() removes existing TimelineEditor context menus', () => {
      // Simulate a TimelineEditor context menu
      const editorMenu = document.createElement('div');
      editorMenu.className = 'timeline-context-menu';
      document.body.appendChild(editorMenu);

      menu.show(makeOptions());

      // The editor menu should have been removed
      expect(document.querySelector('.timeline-context-menu')).toBeNull();
      // Our menu should exist
      expect(document.querySelector('.timeline-main-context-menu')).not.toBeNull();
    });
  });

  describe('styling', () => {
    it('TCM-052: menu uses position fixed', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.style.position).toBe('fixed');
    });

    it('TCM-053: menu has minimum width', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.style.minWidth).toBe('240px');
    });

    it('TCM-054: menu has border-radius of 6px', () => {
      menu.show(makeOptions());
      const el = document.querySelector('.timeline-main-context-menu') as HTMLElement;
      expect(el.style.borderRadius).toBe('6px');
    });
  });
});
