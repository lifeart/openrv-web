/**
 * RemoteCursorsOverlay Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RemoteCursorsOverlay } from './RemoteCursorsOverlay';
import type { CursorSyncPayload, SyncUser } from '../../network/types';

function makeUser(id: string, name: string, color: string): SyncUser {
  return { id, name, color, isHost: false, joinedAt: Date.now() };
}

function makeCursorPayload(userId: string, x: number, y: number): CursorSyncPayload {
  return { userId, x, y, timestamp: Date.now() };
}

describe('RemoteCursorsOverlay', () => {
  let overlay: RemoteCursorsOverlay;
  let container: HTMLDivElement;
  let now: number;

  beforeEach(() => {
    now = 1000;
    overlay = new RemoteCursorsOverlay();
    overlay.setNowFn(() => now);
    container = document.createElement('div');
    container.appendChild(overlay.getElement());
    document.body.appendChild(container);
  });

  afterEach(() => {
    overlay.dispose();
    container.remove();
  });

  // ---- Initial state ----

  describe('initial state', () => {
    it('RCO-001: should be hidden by default', () => {
      expect(overlay.getElement().style.display).toBe('none');
    });

    it('RCO-002: should not be active by default', () => {
      expect(overlay.isActive()).toBe(false);
    });

    it('RCO-003: should have correct data-testid', () => {
      expect(overlay.getElement().dataset.testid).toBe('remote-cursors-overlay');
    });

    it('RCO-004: should have no cursors initially', () => {
      expect(overlay.getCursors().size).toBe(0);
    });
  });

  // ---- Activation ----

  describe('setActive', () => {
    it('RCO-010: should show when activated', () => {
      overlay.setActive(true);
      expect(overlay.isActive()).toBe(true);
      expect(overlay.getElement().style.display).not.toBe('none');
    });

    it('RCO-011: should hide and clear cursors when deactivated', () => {
      overlay.setActive(true);
      overlay.setUsers([makeUser('u1', 'Alice', '#ff0000')]);
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      expect(overlay.getCursors().size).toBe(1);

      overlay.setActive(false);
      expect(overlay.isActive()).toBe(false);
      expect(overlay.getElement().style.display).toBe('none');
      expect(overlay.getCursors().size).toBe(0);
    });
  });

  // ---- Cursor rendering ----

  describe('updateCursor', () => {
    beforeEach(() => {
      overlay.setActive(true);
      overlay.setViewerDimensions(800, 600);
      overlay.setUsers([
        makeUser('u1', 'Alice', '#ff0000'),
        makeUser('u2', 'Bob', '#00ff00'),
      ]);
    });

    it('RCO-020: should create a cursor element for a remote user', () => {
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      const el = overlay.getElement().querySelector('[data-user-id="u1"]');
      expect(el).toBeTruthy();
      expect(el?.getAttribute('data-testid')).toBe('remote-cursor-u1');
    });

    it('RCO-021: should show participant name in cursor label', () => {
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      const label = overlay.getElement().querySelector('[data-user-id="u1"] .remote-cursor-label');
      expect(label?.textContent).toBe('Alice');
    });

    it('RCO-022: should use the participant color for the cursor', () => {
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      const path = overlay.getElement().querySelector('[data-user-id="u1"] svg path');
      expect(path?.getAttribute('fill')).toBe('#ff0000');
    });

    it('RCO-023: should render multiple cursors for different users', () => {
      overlay.updateCursor(makeCursorPayload('u1', 0.2, 0.3));
      overlay.updateCursor(makeCursorPayload('u2', 0.8, 0.7));
      expect(overlay.getCursors().size).toBe(2);
      expect(overlay.getElement().querySelectorAll('.remote-cursor').length).toBe(2);
    });

    it('RCO-024: should not create cursors when overlay is inactive', () => {
      overlay.setActive(false);
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      expect(overlay.getCursors().size).toBe(0);
    });

    it('RCO-025: should use truncated userId when user is unknown', () => {
      overlay.setUsers([]);
      overlay.updateCursor(makeCursorPayload('unknown-long-id', 0.5, 0.5));
      const label = overlay.getElement().querySelector('[data-user-id="unknown-long-id"] .remote-cursor-label');
      expect(label?.textContent).toBe('unknown-');
    });
  });

  // ---- Coordinate mapping ----

  describe('coordinate mapping', () => {
    beforeEach(() => {
      overlay.setActive(true);
      overlay.setUsers([makeUser('u1', 'Alice', '#ff0000')]);
    });

    it('RCO-030: should map normalized (0,0) to top-left pixel', () => {
      overlay.setViewerDimensions(800, 600);
      overlay.updateCursor(makeCursorPayload('u1', 0, 0));
      const el = overlay.getElement().querySelector('[data-user-id="u1"]') as HTMLElement;
      expect(el.style.left).toBe('0px');
      expect(el.style.top).toBe('0px');
    });

    it('RCO-031: should map normalized (1,1) to bottom-right pixel', () => {
      overlay.setViewerDimensions(800, 600);
      overlay.updateCursor(makeCursorPayload('u1', 1, 1));
      const el = overlay.getElement().querySelector('[data-user-id="u1"]') as HTMLElement;
      expect(el.style.left).toBe('800px');
      expect(el.style.top).toBe('600px');
    });

    it('RCO-032: should map normalized (0.5, 0.5) to center', () => {
      overlay.setViewerDimensions(800, 600);
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      const el = overlay.getElement().querySelector('[data-user-id="u1"]') as HTMLElement;
      expect(el.style.left).toBe('400px');
      expect(el.style.top).toBe('300px');
    });

    it('RCO-033: should clamp coordinates outside 0-1 range', () => {
      overlay.setViewerDimensions(800, 600);
      overlay.updateCursor(makeCursorPayload('u1', -0.5, 1.5));
      const el = overlay.getElement().querySelector('[data-user-id="u1"]') as HTMLElement;
      expect(el.style.left).toBe('0px');
      expect(el.style.top).toBe('600px');
    });

    it('RCO-034: should reposition cursors when viewer dimensions change', () => {
      overlay.setViewerDimensions(800, 600);
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      const el = overlay.getElement().querySelector('[data-user-id="u1"]') as HTMLElement;
      expect(el.style.left).toBe('400px');

      overlay.setViewerDimensions(1920, 1080);
      expect(el.style.left).toBe('960px');
      expect(el.style.top).toBe('540px');
    });
  });

  // ---- Fade/hide on inactivity ----

  describe('fade on inactivity', () => {
    beforeEach(() => {
      overlay.setActive(true);
      overlay.setViewerDimensions(800, 600);
      overlay.setUsers([makeUser('u1', 'Alice', '#ff0000')]);
    });

    it('RCO-040: cursor should be fully opaque when freshly updated', () => {
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      const el = overlay.getElement().querySelector('[data-user-id="u1"]') as HTMLElement;
      expect(el.style.opacity).toBe('1');
    });

    it('RCO-041: cursor should start fading after 5 seconds of inactivity', () => {
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      now += 5500; // 5.5 seconds later
      overlay.tickFade();
      const el = overlay.getElement().querySelector('[data-user-id="u1"]') as HTMLElement;
      const opacity = parseFloat(el.style.opacity);
      expect(opacity).toBeLessThan(1);
      expect(opacity).toBeGreaterThan(0);
    });

    it('RCO-042: cursor should be removed after full fade period (7 seconds)', () => {
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      now += 7100; // past FADE_START_MS + FADE_DURATION_MS
      overlay.tickFade();
      expect(overlay.getCursors().size).toBe(0);
      const el = overlay.getElement().querySelector('[data-user-id="u1"]');
      expect(el).toBeNull();
    });

    it('RCO-043: updating a cursor should reset its fade timer', () => {
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      now += 4000; // 4 seconds
      overlay.tickFade();
      // Still visible
      expect(overlay.getElement().querySelector('[data-user-id="u1"]')).toBeTruthy();

      // Update resets the timer
      overlay.updateCursor(makeCursorPayload('u1', 0.6, 0.6));
      now += 4000; // 4 more seconds (8 total but only 4 since last update)
      overlay.tickFade();
      const el = overlay.getElement().querySelector('[data-user-id="u1"]') as HTMLElement;
      expect(el).toBeTruthy();
      expect(el.style.opacity).toBe('1');
    });
  });

  // ---- Disconnect ----

  describe('disconnect behavior', () => {
    it('RCO-050: cursors should be hidden when collaboration disconnects', () => {
      overlay.setActive(true);
      overlay.setViewerDimensions(800, 600);
      overlay.setUsers([makeUser('u1', 'Alice', '#ff0000')]);
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      expect(overlay.getElement().querySelectorAll('.remote-cursor').length).toBe(1);

      overlay.setActive(false);
      expect(overlay.getElement().querySelectorAll('.remote-cursor').length).toBe(0);
      expect(overlay.getElement().style.display).toBe('none');
    });

    it('RCO-051: individual cursor should be removed on user leave', () => {
      overlay.setActive(true);
      overlay.setViewerDimensions(800, 600);
      overlay.setUsers([
        makeUser('u1', 'Alice', '#ff0000'),
        makeUser('u2', 'Bob', '#00ff00'),
      ]);
      overlay.updateCursor(makeCursorPayload('u1', 0.3, 0.3));
      overlay.updateCursor(makeCursorPayload('u2', 0.7, 0.7));
      expect(overlay.getCursors().size).toBe(2);

      overlay.removeCursor('u1');
      expect(overlay.getCursors().size).toBe(1);
      expect(overlay.getElement().querySelector('[data-user-id="u1"]')).toBeNull();
      expect(overlay.getElement().querySelector('[data-user-id="u2"]')).toBeTruthy();
    });
  });

  // ---- setUsers updates existing cursors ----

  describe('user info updates', () => {
    it('RCO-060: should update cursor name/color when users change', () => {
      overlay.setActive(true);
      overlay.setViewerDimensions(800, 600);
      overlay.setUsers([makeUser('u1', 'Alice', '#ff0000')]);
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));

      // User changes name/color
      overlay.setUsers([makeUser('u1', 'Alicia', '#0000ff')]);
      const label = overlay.getElement().querySelector('[data-user-id="u1"] .remote-cursor-label') as HTMLElement;
      expect(label.textContent).toBe('Alicia');
      expect(label.style.background).toBe('rgb(0, 0, 255)');
    });
  });

  // ---- Dispose ----

  describe('dispose', () => {
    it('RCO-070: should remove element from DOM on dispose', () => {
      expect(container.querySelector('.remote-cursors-overlay')).toBeTruthy();
      overlay.dispose();
      expect(container.querySelector('.remote-cursors-overlay')).toBeNull();
    });

    it('RCO-071: should clear cursors on dispose', () => {
      overlay.setActive(true);
      overlay.setViewerDimensions(800, 600);
      overlay.setUsers([makeUser('u1', 'Alice', '#ff0000')]);
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      overlay.dispose();
      expect(overlay.getCursors().size).toBe(0);
    });

    it('RCO-072: should handle double dispose safely', () => {
      overlay.dispose();
      expect(() => overlay.dispose()).not.toThrow();
    });
  });

  // ---- Color sanitization ----

  describe('color sanitization', () => {
    it('RCO-080: should fallback to default color for invalid CSS', () => {
      overlay.setActive(true);
      overlay.setViewerDimensions(800, 600);
      overlay.setUsers([makeUser('u1', 'Alice', 'url(evil)')]);
      overlay.updateCursor(makeCursorPayload('u1', 0.5, 0.5));
      const path = overlay.getElement().querySelector('[data-user-id="u1"] svg path');
      // Should use USER_COLORS[0] fallback
      expect(path?.getAttribute('fill')).toBe('#4a9eff');
    });
  });
});
