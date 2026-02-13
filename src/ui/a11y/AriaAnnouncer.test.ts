import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AriaAnnouncer } from './AriaAnnouncer';

describe('AriaAnnouncer', () => {
  let announcer: AriaAnnouncer;

  beforeEach(() => {
    // Remove any existing announcer element
    document.getElementById('openrv-sr-announcer')?.remove();
    announcer = new AriaAnnouncer();
  });

  afterEach(() => {
    announcer.dispose();
  });

  // AA-001
  it('creates aria-live region', () => {
    const el = document.getElementById('openrv-sr-announcer');
    expect(el).not.toBeNull();
    expect(el!.getAttribute('role')).toBe('status');
    expect(el!.getAttribute('aria-live')).toBe('polite');
    expect(el!.getAttribute('aria-atomic')).toBe('true');
  });

  // AA-002
  it('announce sets textContent via rAF', () => {
    vi.useFakeTimers();
    announcer.announce('Hello world');
    // Before rAF fires, content is cleared
    expect(announcer.getElement().textContent).toBe('');
    // Advance rAF
    vi.advanceTimersByTime(16);
    expect(announcer.getElement().textContent).toBe('Hello world');
    vi.useRealTimers();
  });

  // AA-003
  it('polite priority uses aria-live="polite"', () => {
    announcer.announce('Test', 'polite');
    expect(announcer.getElement().getAttribute('aria-live')).toBe('polite');
  });

  // AA-004
  it('assertive priority uses aria-live="assertive"', () => {
    announcer.announce('Urgent', 'assertive');
    expect(announcer.getElement().getAttribute('aria-live')).toBe('assertive');
  });

  // AA-005
  it('getElement returns the live region', () => {
    const el = announcer.getElement();
    expect(el.id).toBe('openrv-sr-announcer');
  });

  // AA-006
  it('dispose removes element from DOM', () => {
    announcer.dispose();
    expect(document.getElementById('openrv-sr-announcer')).toBeNull();
  });
});
