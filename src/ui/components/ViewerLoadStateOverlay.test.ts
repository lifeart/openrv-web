import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from '../../utils/EventEmitter';
import type { SessionEvents } from '../../core/session/SessionTypes';
import type { MediaSource } from '../../core/session/Session';
import { EMPTY_STATE_TITLE, ViewerLoadStateOverlay } from './ViewerLoadStateOverlay';
import { Z_INDEX } from './shared/theme';

class FakeSession extends EventEmitter<SessionEvents> {
  sourceCount = 0;
}

function source(name: string): MediaSource {
  return { type: 'image', name, url: '', width: 1, height: 1, duration: 1, fps: 24 };
}

describe('ViewerLoadStateOverlay', () => {
  let container: HTMLElement;
  let session: FakeSession;
  let overlay: ViewerLoadStateOverlay;
  let onOpenFile: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.position = 'relative';
    document.body.appendChild(container);
    session = new FakeSession();
    onOpenFile = vi.fn<() => void>();
    overlay = new ViewerLoadStateOverlay({ container, session, onOpenFile });
  });

  afterEach(() => {
    overlay.dispose();
    container.remove();
    vi.useRealTimers();
  });

  describe('empty state', () => {
    it('VLS-001: is shown as accessible DOM when no source is loaded', () => {
      const el = container.querySelector('[data-testid="viewer-empty-state"]') as HTMLElement;
      expect(el).toBeTruthy();
      expect(overlay.isEmptyStateVisible()).toBe(true);
      expect(el.getAttribute('role')).toBe('region');
      expect(el.getAttribute('aria-label')).toBe('No media loaded');
      expect(el.textContent).toContain(EMPTY_STATE_TITLE);
      expect(el.textContent).toContain('Images:');
      expect(el.textContent).toContain('Video:');
    });

    it('VLS-002: "Open file…" is a real button that triggers the open-file action', () => {
      const button = container.querySelector('[data-testid="viewer-empty-state-open"]') as HTMLButtonElement;
      expect(button).toBeInstanceOf(HTMLButtonElement);
      expect(button.textContent).toContain('Open file');
      button.click();
      expect(onOpenFile).toHaveBeenCalledTimes(1);
    });

    it('VLS-003: does not intercept viewer pointer input except on the button', () => {
      const el = overlay.getEmptyStateElement();
      expect(el.style.pointerEvents).toBe('none');
      expect(overlay.getOpenButton()?.style.pointerEvents).toBe('auto');
      expect(el.style.zIndex).toBe(String(Z_INDEX.viewerOverlay));
    });

    it('VLS-004: hides once a source is loaded', () => {
      session.sourceCount = 1;
      session.emit('sourceLoaded', source('a.exr'));
      expect(overlay.isEmptyStateVisible()).toBe(false);
    });

    it('VLS-005: reappears when the session has no sources again', () => {
      session.sourceCount = 1;
      session.emit('sourceLoaded', source('a.exr'));
      session.sourceCount = 0;
      session.emit('sessionLoaded', undefined);
      expect(overlay.isEmptyStateVisible()).toBe(true);
    });

    it('VLS-006: omits the button when no open action is supplied', () => {
      const other = document.createElement('div');
      const o = new ViewerLoadStateOverlay({ container: other, session });
      expect(other.querySelector('[data-testid="viewer-empty-state-open"]')).toBeNull();
      o.dispose();
    });
  });

  describe('loading indicator', () => {
    it('VLS-010: shows from sourceLoadingStarted until sourceLoaded', () => {
      expect(overlay.isLoadingVisible()).toBe(false);

      session.emit('sourceLoadingStarted', { name: 'shot_010.exr' });
      const hud = overlay.getLoadingElement();
      expect(overlay.isLoadingVisible()).toBe(true);
      expect(hud.getAttribute('role')).toBe('status');
      expect(hud.getAttribute('aria-live')).toBe('polite');
      expect(hud.textContent).toContain('Loading shot_010.exr');
      // Empty-state copy is hidden while loading
      expect(overlay.isEmptyStateVisible()).toBe(false);

      session.sourceCount = 1;
      session.emit('sourceLoaded', source('shot_010.exr'));
      expect(overlay.isLoadingVisible()).toBe(false);
    });

    it('VLS-011: hides on sourceLoadFailed and restores the empty state', () => {
      session.emit('sourceLoadingStarted', { name: 'broken.png' });
      session.emit('sourceLoadFailed', { name: 'broken.png' });
      expect(overlay.isLoadingVisible()).toBe(false);
      expect(overlay.isEmptyStateVisible()).toBe(true);
    });

    it('VLS-012: counts concurrent loads', () => {
      session.emit('sourceLoadingStarted', { name: 'a.exr' });
      session.emit('sourceLoadingStarted', { name: 'b.exr' });
      expect(overlay.getLoadingElement().textContent).toContain('Loading 2 files');

      session.sourceCount = 1;
      session.emit('sourceLoaded', source('a.exr'));
      expect(overlay.getLoadingElement().textContent).toContain('Loading b.exr');

      session.sourceCount = 2;
      session.emit('sourceLoaded', source('b.exr'));
      expect(overlay.isLoadingVisible()).toBe(false);
    });

    it('VLS-013: a load that finishes under a different name still clears the indicator', () => {
      session.emit('sourceLoadingStarted', { name: 'frame.####.exr' });
      session.sourceCount = 1;
      session.emit('sourceLoaded', source('frame.1001-1100.exr'));
      expect(overlay.isLoadingVisible()).toBe(false);
    });

    it('VLS-014: a load that never reports completion is dropped after the safety timeout', () => {
      vi.useFakeTimers();
      const other = document.createElement('div');
      const o = new ViewerLoadStateOverlay({ container: other, session, stuckLoadTimeoutMs: 1000 });
      session.emit('sourceLoadingStarted', { name: 'hung.mov' });
      expect(o.isLoadingVisible()).toBe(true);
      vi.advanceTimersByTime(1000);
      expect(o.isLoadingVisible()).toBe(false);
      o.dispose();
    });

    it('VLS-015: a finished load cancels its own safety timer', () => {
      vi.useFakeTimers();
      const other = document.createElement('div');
      const o = new ViewerLoadStateOverlay({ container: other, session, stuckLoadTimeoutMs: 1000 });
      session.emit('sourceLoadingStarted', { name: 'x.exr' });
      session.emit('sourceLoadFailed', { name: 'x.exr' });
      // Second load of the same name must not be cleared by the first load's timer
      vi.advanceTimersByTime(500);
      session.emit('sourceLoadingStarted', { name: 'x.exr' });
      vi.advanceTimersByTime(600);
      expect(o.isLoadingVisible()).toBe(true);
      o.dispose();
    });
  });

  it('VLS-020: dispose removes the overlays and stops listening', () => {
    overlay.dispose();
    expect(container.querySelector('[data-testid="viewer-empty-state"]')).toBeNull();
    expect(container.querySelector('[data-testid="viewer-loading-indicator"]')).toBeNull();
    expect(() => session.emit('sourceLoadingStarted', { name: 'late.exr' })).not.toThrow();
  });
});
