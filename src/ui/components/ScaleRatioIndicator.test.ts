/**
 * ScaleRatioIndicator Tests
 *
 * Unit tests for the transient overlay that shows the current pixel ratio
 * when zoom changes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScaleRatioIndicator } from './ScaleRatioIndicator';

describe('ScaleRatioIndicator', () => {
  let container: HTMLElement;
  let indicator: ScaleRatioIndicator;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    indicator = new ScaleRatioIndicator(container);
  });

  afterEach(() => {
    indicator.dispose();
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  // -- Construction / DOM --------------------------------------------------

  it('SRI-001: creates indicator element in parent container', () => {
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]');
    expect(el).not.toBeNull();
  });

  it('SRI-002: indicator is hidden initially', () => {
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.style.display).toBe('none');
    expect(el.style.opacity).toBe('0');
  });

  // -- show() with fit mode ------------------------------------------------

  it('SRI-010: show with isFit=true displays "Fit"', () => {
    indicator.show(0.5, true);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.textContent).toBe('Fit');
  });

  it('SRI-011: show makes the indicator visible', () => {
    indicator.show(1, false);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.style.display).toBe('');
    expect(el.style.opacity).toBe('1');
  });

  // -- show() with exact presets -------------------------------------------

  it('SRI-020: show with ratio 1.0 displays "1:1 (100%)"', () => {
    indicator.show(1, false);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.textContent).toBe('1:1 (100%)');
  });

  it('SRI-021: show with ratio 2.0 displays "2:1 (200%)"', () => {
    indicator.show(2, false);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.textContent).toBe('2:1 (200%)');
  });

  it('SRI-022: show with ratio 0.5 displays "1:2 (50%)"', () => {
    indicator.show(0.5, false);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.textContent).toBe('1:2 (50%)');
  });

  it('SRI-023: show with ratio 0.25 displays "1:4 (25%)"', () => {
    indicator.show(0.25, false);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.textContent).toBe('1:4 (25%)');
  });

  it('SRI-024: show with ratio 4.0 displays "4:1 (400%)"', () => {
    indicator.show(4, false);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.textContent).toBe('4:1 (400%)');
  });

  it('SRI-025: show with ratio 8.0 displays "8:1 (800%)"', () => {
    indicator.show(8, false);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.textContent).toBe('8:1 (800%)');
  });

  it('SRI-026: show with ratio 0.125 displays "1:8 (12.5%)"', () => {
    indicator.show(0.125, false);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.textContent).toBe('1:8 (12.5%)');
  });

  // -- show() with non-preset ratios --------------------------------------

  it('SRI-030: show with non-preset ratio displays formatted ratio', () => {
    indicator.show(1.5, false);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.textContent).toBe('150%');
  });

  it('SRI-031: show with non-preset ratio 0.7 displays formatted ratio', () => {
    indicator.show(0.7, false);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.textContent).toBe('70%');
  });

  // -- Auto-fade behavior -------------------------------------------------

  it('SRI-040: indicator fades out after display duration', () => {
    indicator.show(1, false);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.style.opacity).toBe('1');

    // Advance past display duration (1500ms)
    vi.advanceTimersByTime(1500);
    expect(el.style.opacity).toBe('0');
  });

  it('SRI-041: indicator is hidden after fade completes', () => {
    indicator.show(1, false);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;

    // Advance past display + fade duration (1500 + 300)
    vi.advanceTimersByTime(1800);
    expect(el.style.display).toBe('none');
  });

  // -- Rapid calls --------------------------------------------------------

  it('SRI-050: rapid show calls replace previous content', () => {
    indicator.show(1, false);
    indicator.show(2, false);
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.textContent).toBe('2:1 (200%)');
  });

  it('SRI-051: rapid show calls reset the fade timer', () => {
    indicator.show(1, false);
    vi.advanceTimersByTime(1000); // 1s into first display

    indicator.show(2, false); // Reset timer
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]') as HTMLElement;
    expect(el.style.opacity).toBe('1');

    vi.advanceTimersByTime(1000); // 1s after reset - still visible
    expect(el.style.opacity).toBe('1');

    vi.advanceTimersByTime(500); // 1.5s after reset - should start fading
    expect(el.style.opacity).toBe('0');
  });

  // -- dispose() ----------------------------------------------------------

  it('SRI-060: dispose removes element from DOM', () => {
    indicator.dispose();
    const el = container.querySelector('[data-testid="scale-ratio-indicator"]');
    expect(el).toBeNull();
  });

  it('SRI-061: dispose clears timers (no errors after dispose)', () => {
    indicator.show(1, false);
    indicator.dispose();

    // Advancing timers after dispose should not throw
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });

  it('SRI-062: dispose can be called multiple times', () => {
    expect(() => {
      indicator.dispose();
      indicator.dispose();
    }).not.toThrow();
  });
});
