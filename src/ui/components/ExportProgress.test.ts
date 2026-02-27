/**
 * ExportProgressDialog Unit Tests
 *
 * Tests for the video export progress dialog UI component.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { ExportProgressDialog } from './ExportProgress';
import type { ExportProgress } from '../../export/VideoExporter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDialog(): { parent: HTMLElement; dialog: ExportProgressDialog } {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const dialog = new ExportProgressDialog(parent);
  return { parent, dialog };
}

function makeProgress(overrides?: Partial<ExportProgress>): ExportProgress {
  return {
    currentFrame: 5,
    totalFrames: 10,
    percentage: 50,
    elapsedMs: 2000,
    estimatedRemainingMs: 2000,
    status: 'encoding',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let activeDialog: ExportProgressDialog | null = null;
let activeParent: HTMLElement | null = null;

afterEach(() => {
  activeDialog?.dispose();
  activeDialog = null;
  activeParent?.remove();
  activeParent = null;
});

describe('ExportProgressDialog', () => {
  describe('lifecycle', () => {
    it('UI-001: can be constructed', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;
      expect(dialog).toBeDefined();
    });

    it('UI-002: starts hidden', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;
      expect(dialog.isVisible()).toBe(false);
    });

    it('UI-003: show/hide toggles visibility', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      expect(dialog.isVisible()).toBe(true);

      dialog.hide();
      expect(dialog.isVisible()).toBe(false);
    });

    it('UI-004: dispose removes DOM elements', () => {
      const { parent, dialog } = createDialog();
      activeParent = parent;

      expect(parent.children.length).toBe(2); // backdrop + container
      dialog.dispose();
      expect(parent.children.length).toBe(0);
      activeDialog = null; // already disposed
    });

    it('UI-005: methods are no-ops after dispose', () => {
      const { parent, dialog } = createDialog();
      activeParent = parent;

      dialog.dispose();
      // Should not throw
      dialog.show();
      dialog.updateProgress(makeProgress());
      expect(dialog.isVisible()).toBe(false);
      activeDialog = null;
    });
  });

  describe('accessibility', () => {
    it('UI-A11Y-001: container has role=dialog', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      const container = parent.querySelector('.export-progress-dialog');
      expect(container?.getAttribute('role')).toBe('dialog');
    });

    it('UI-A11Y-002: container has aria-modal=true', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      const container = parent.querySelector('.export-progress-dialog');
      expect(container?.getAttribute('aria-modal')).toBe('true');
    });

    it('UI-A11Y-003: container has aria-labelledby pointing to title', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      const container = parent.querySelector('.export-progress-dialog');
      const labelledBy = container?.getAttribute('aria-labelledby');
      expect(labelledBy).toBe('export-dialog-title');

      const title = parent.querySelector(`#${labelledBy}`);
      expect(title?.textContent).toBe('Exporting Video');
    });

    it('UI-A11Y-004: progress bar has role=progressbar with aria attributes', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      const progressBar = parent.querySelector('[role="progressbar"]');
      expect(progressBar).not.toBeNull();
      expect(progressBar?.getAttribute('aria-valuemin')).toBe('0');
      expect(progressBar?.getAttribute('aria-valuemax')).toBe('100');
      expect(progressBar?.getAttribute('aria-valuenow')).toBe('0');
    });

    it('UI-A11Y-005: progress bar aria-valuenow updates', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      dialog.updateProgress(makeProgress({ percentage: 75 }));

      const progressBar = parent.querySelector('[role="progressbar"]');
      expect(progressBar?.getAttribute('aria-valuenow')).toBe('75');
    });

    it('UI-A11Y-006: status label has aria-live=polite', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      const status = parent.querySelector('[aria-live="polite"]');
      expect(status).not.toBeNull();
    });

    it('UI-A11Y-006a: status label is single-line with ellipsis', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      const status = parent.querySelector('[data-testid="export-progress-status"]') as HTMLElement;
      expect(status.style.whiteSpace).toBe('nowrap');
      expect(status.style.overflow).toBe('hidden');
      expect(status.style.textOverflow).toBe('ellipsis');
    });

    it('UI-A11Y-006b: frame/time labels are compact overflow-safe', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      const frame = parent.querySelector('[data-testid="export-progress-frames"]') as HTMLElement;
      const time = parent.querySelector('[data-testid="export-progress-time"]') as HTMLElement;

      expect(frame.style.whiteSpace).toBe('nowrap');
      expect(frame.style.overflow).toBe('hidden');
      expect(frame.style.textOverflow).toBe('ellipsis');
      expect(time.style.whiteSpace).toBe('nowrap');
      expect(time.style.overflow).toBe('hidden');
      expect(time.style.textOverflow).toBe('ellipsis');
    });

    it('UI-A11Y-007: backdrop is present for modal behavior', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      const backdrop = parent.querySelector('.export-progress-backdrop');
      expect(backdrop).not.toBeNull();
    });

    it('UI-A11Y-008: show focuses the cancel button', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      const button = parent.querySelector('button');
      expect(document.activeElement).toBe(button);
    });
  });

  describe('progress updates', () => {
    it('UI-PROG-001: encoding status shows percentage', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      dialog.updateProgress(makeProgress({ percentage: 42, status: 'encoding' }));

      const statusEl = parent.querySelector('[aria-live="polite"]');
      expect(statusEl?.textContent).toBe('Encoding... 42%');
    });

    it('UI-PROG-002: flushing status shows Finalizing', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      dialog.updateProgress(makeProgress({ status: 'flushing' }));

      const statusEl = parent.querySelector('[aria-live="polite"]');
      expect(statusEl?.textContent).toBe('Finalizing...');
    });

    it('UI-PROG-003: complete status shows Export complete', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      dialog.updateProgress(makeProgress({ percentage: 100, status: 'complete' }));

      const statusEl = parent.querySelector('[aria-live="polite"]');
      expect(statusEl?.textContent).toBe('Export complete!');
    });

    it('UI-PROG-004: cancelled status shows Export cancelled', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      dialog.updateProgress(makeProgress({ status: 'cancelled' }));

      const statusEl = parent.querySelector('[aria-live="polite"]');
      expect(statusEl?.textContent).toBe('Export cancelled');
    });

    it('UI-PROG-005: error status shows Export failed', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      dialog.updateProgress(makeProgress({ status: 'error' }));

      const statusEl = parent.querySelector('[aria-live="polite"]');
      expect(statusEl?.textContent).toBe('Export failed');
    });

    it('UI-PROG-006: button changes to Close on terminal states', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      const button = parent.querySelector('button')!;
      expect(button.textContent).toBe('Cancel');

      dialog.updateProgress(makeProgress({ status: 'complete' }));
      expect(button.textContent).toBe('Close');
    });

    it('UI-PROG-007: frame count updates correctly', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      dialog.updateProgress(makeProgress({ percentage: 60, totalFrames: 100 }));

      // 60% of 100 = 60 frames. Find the leaf div that contains 'frames' but has no child elements.
      const allDivs = parent.querySelectorAll('div');
      const frameLabel = Array.from(allDivs).find(
        l => l.children.length === 0 && l.textContent?.includes('frames')
      );
      expect(frameLabel?.textContent).toBe('60 / 100 frames');
    });

    it('UI-PROG-008: elapsed time display', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      dialog.updateProgress(makeProgress({ elapsedMs: 5000, estimatedRemainingMs: 3000 }));

      // Find the leaf div containing 'elapsed'
      const allDivs = parent.querySelectorAll('div');
      const timeLabel = Array.from(allDivs).find(
        l => l.children.length === 0 && l.textContent?.includes('elapsed')
      );
      expect(timeLabel?.textContent).toBe('5s elapsed / ~3s remaining');
    });
  });

  describe('cancel / close events', () => {
    it('UI-EVT-001: cancel button emits cancel during encoding', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;
      let cancelled = false;

      dialog.on('cancel', () => { cancelled = true; });
      dialog.show();

      const button = parent.querySelector('button')!;
      button.click();

      expect(cancelled).toBe(true);
    });

    it('UI-EVT-002: cancel button shows Cancelling... after click', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      const button = parent.querySelector('button')!;
      button.click();

      expect(button.textContent).toBe('Cancelling...');
      expect(button.disabled).toBe(true);
    });

    it('UI-EVT-003: close button emits close in terminal state', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;
      let closed = false;

      dialog.on('close', () => { closed = true; });
      dialog.show();
      dialog.updateProgress(makeProgress({ status: 'complete' }));

      const button = parent.querySelector('button')!;
      button.click();

      expect(closed).toBe(true);
    });

    it('UI-EVT-004: close button does NOT emit cancel in terminal state', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;
      let cancelled = false;

      dialog.on('cancel', () => { cancelled = true; });
      dialog.show();
      dialog.updateProgress(makeProgress({ status: 'complete' }));

      const button = parent.querySelector('button')!;
      button.click();

      expect(cancelled).toBe(false);
    });
  });

  describe('keyboard interaction', () => {
    it('UI-KEY-001: Escape key triggers cancel during encoding', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;
      let cancelled = false;

      dialog.on('cancel', () => { cancelled = true; });
      dialog.show();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(cancelled).toBe(true);
    });

    it('UI-KEY-002: Escape key triggers close in terminal state', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;
      let closed = false;

      dialog.on('close', () => { closed = true; });
      dialog.show();
      dialog.updateProgress(makeProgress({ status: 'complete' }));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(true);
    });

    it('UI-KEY-003: Escape key does nothing when dialog is hidden', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;
      let cancelled = false;

      dialog.on('cancel', () => { cancelled = true; });
      // Do NOT call show() — dialog is hidden

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(cancelled).toBe(false);
    });
  });

  describe('time formatting', () => {
    it('UI-TIME-001: displays minutes format', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      dialog.updateProgress(makeProgress({ elapsedMs: 90000, estimatedRemainingMs: 0 }));

      const allDivs = parent.querySelectorAll('div');
      const timeLabel = Array.from(allDivs).find(
        l => l.children.length === 0 && l.textContent?.includes('elapsed')
      );
      expect(timeLabel?.textContent).toBe('1m 30s elapsed');
    });

    it('UI-TIME-002: displays hours format', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      dialog.updateProgress(makeProgress({ elapsedMs: 3661000, estimatedRemainingMs: 0 }));

      const allDivs = parent.querySelectorAll('div');
      const timeLabel = Array.from(allDivs).find(
        l => l.children.length === 0 && l.textContent?.includes('elapsed')
      );
      expect(timeLabel?.textContent).toBe('1h 1m 1s elapsed');
    });
  });

  describe('backdrop', () => {
    it('UI-BACK-001: backdrop is hidden initially', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      const backdrop = parent.querySelector('.export-progress-backdrop') as HTMLElement;
      expect(backdrop.style.display).toBe('none');
    });

    it('UI-BACK-002: backdrop is visible when dialog is shown', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();

      const backdrop = parent.querySelector('.export-progress-backdrop') as HTMLElement;
      expect(backdrop.style.display).toBe('block');
    });

    it('UI-BACK-003: backdrop hides when dialog is hidden', () => {
      const { parent, dialog } = createDialog();
      activeDialog = dialog;
      activeParent = parent;

      dialog.show();
      dialog.hide();

      const backdrop = parent.querySelector('.export-progress-backdrop') as HTMLElement;
      expect(backdrop.style.display).toBe('none');
    });
  });
});
