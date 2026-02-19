import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AriaAnnouncer } from './AriaAnnouncer';
import { EventEmitter } from '../../utils/EventEmitter';

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

  // A11Y-L58a
  it('toggling play/pause triggers an aria-live announcement', () => {
    vi.useFakeTimers();
    const session = new EventEmitter<{ playbackChanged: boolean }>();

    // Wire up the same listener that App.ts uses
    session.on('playbackChanged', (playing: boolean) => {
      announcer.announce(playing ? 'Playback started' : 'Playback paused');
    });

    // Simulate play
    session.emit('playbackChanged', true);
    vi.advanceTimersByTime(16);
    expect(announcer.getElement().textContent).toBe('Playback started');

    // Simulate pause
    session.emit('playbackChanged', false);
    vi.advanceTimersByTime(16);
    expect(announcer.getElement().textContent).toBe('Playback paused');

    vi.useRealTimers();
  });

  // A11Y-L58b
  it('changing playback speed triggers an aria-live announcement', () => {
    vi.useFakeTimers();
    const session = new EventEmitter<{ playbackSpeedChanged: number }>();

    // Wire up the same listener that App.ts uses
    session.on('playbackSpeedChanged', (speed: number) => {
      announcer.announce(`Playback speed: ${speed}x`);
    });

    // Simulate speed change to 2x
    session.emit('playbackSpeedChanged', 2);
    vi.advanceTimersByTime(16);
    expect(announcer.getElement().textContent).toBe('Playback speed: 2x');

    // Simulate speed change to 0.5x
    session.emit('playbackSpeedChanged', 0.5);
    vi.advanceTimersByTime(16);
    expect(announcer.getElement().textContent).toBe('Playback speed: 0.5x');

    vi.useRealTimers();
  });
});
