import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  showToast,
  dismissAllToasts,
  DEFAULT_TOAST_DURATION_MS,
  MAX_VISIBLE_TOASTS,
  TOAST_CONTAINER_ID,
} from './Toast';
import { Z_INDEX } from './theme';

function getToasts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="toast"]'));
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    dismissAllToasts();
    vi.useRealTimers();
  });

  it('TOAST-U001: renders the message in a polite live region', () => {
    showToast('Snapshot created', { type: 'success' });

    const container = document.getElementById(TOAST_CONTAINER_ID);
    expect(container).not.toBeNull();
    expect(container!.getAttribute('aria-live')).toBe('polite');
    expect(container!.getAttribute('role')).toBe('status');
    expect(container!.style.zIndex).toBe(String(Z_INDEX.toast));
    expect(container!.textContent).toContain('Snapshot created');
  });

  it('TOAST-U002: tags the toast with its type (default info)', () => {
    const a = showToast('a');
    const b = showToast('b', { type: 'success' });
    expect(a.element.dataset.toastType).toBe('info');
    expect(b.element.dataset.toastType).toBe('success');
  });

  it('TOAST-U003: auto-dismisses after the default duration', () => {
    showToast('bye');
    expect(getToasts()).toHaveLength(1);

    vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS - 1);
    expect(getToasts()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(getToasts()).toHaveLength(0);
    // Container is torn down when the last toast goes away
    expect(document.getElementById(TOAST_CONTAINER_ID)).toBeNull();
  });

  it('TOAST-U004: honours a custom duration', () => {
    showToast('quick', { duration: 500 });
    vi.advanceTimersByTime(500);
    expect(getToasts()).toHaveLength(0);
  });

  it('TOAST-U005: duration 0 keeps the toast until dismissed', () => {
    const handle = showToast('sticky', { duration: 0 });
    vi.advanceTimersByTime(60_000);
    expect(getToasts()).toHaveLength(1);
    handle.dismiss();
    expect(getToasts()).toHaveLength(0);
  });

  it('TOAST-U006: click dismisses the toast', () => {
    const handle = showToast('click me');
    handle.element.click();
    expect(getToasts()).toHaveLength(0);
    // Dismissing twice is harmless
    expect(() => handle.dismiss()).not.toThrow();
  });

  it('TOAST-U007: stacks multiple toasts in order', () => {
    showToast('first');
    showToast('second');
    const texts = getToasts().map((t) => t.textContent);
    expect(texts).toEqual(['first', 'second']);
  });

  it('TOAST-U008: caps the stack and drops the oldest toast', () => {
    for (let i = 0; i < MAX_VISIBLE_TOASTS + 2; i++) {
      showToast(`t${i}`);
    }
    const texts = getToasts().map((t) => t.textContent);
    expect(texts).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(texts[0]).toBe('t2');
  });

  it('TOAST-U009: does not block focus or trap the page (no modal container)', () => {
    showToast('non-blocking', { type: 'success' });
    expect(document.getElementById('modal-container')).toBeNull();
  });

  it('TOAST-U010: renders message as text, not HTML', () => {
    showToast('<img src=x onerror=alert(1)>');
    const toast = getToasts()[0]!;
    expect(toast.querySelector('img')).toBeNull();
    expect(toast.textContent).toContain('<img');
  });
});
