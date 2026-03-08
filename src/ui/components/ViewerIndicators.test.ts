/**
 * ViewerIndicators Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLutIndicator,
  createABIndicator,
  updateABIndicator,
  createFilterModeBadge,
  showFilterModeIndicator,
  showFitModeIndicator,
  loadFilterModePreference,
  persistFilterModePreference,
} from './ViewerIndicators';
import type { Session } from '../../core/session/Session';
import type { WipeManager } from './WipeManager';

function mockSession(overrides: Partial<{ currentAB: 'A' | 'B'; abCompareAvailable: boolean }> = {}): Session {
  return {
    currentAB: 'A',
    abCompareAvailable: false,
    ...overrides,
  } as unknown as Session;
}

function mockWipeManager(overrides: Partial<{ isSplitScreen: boolean }> = {}): WipeManager {
  return {
    isSplitScreen: false,
    ...overrides,
  } as unknown as WipeManager;
}

describe('ViewerIndicators', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createLutIndicator', () => {
    it('VI-002: returns an HTMLElement with class lut-indicator', () => {
      const el = createLutIndicator();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('lut-indicator');
    });

    it('VI-003: has text content LUT', () => {
      const el = createLutIndicator();
      expect(el.textContent).toBe('LUT');
    });

    it('VI-004: is hidden by default (display: none)', () => {
      const el = createLutIndicator();
      expect(el.style.display).toBe('none');
    });

  });

  describe('createABIndicator', () => {
    it('VI-007: returns an HTMLElement with class ab-indicator', () => {
      const el = createABIndicator();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('ab-indicator');
    });

    it('VI-008: has data-testid ab-indicator', () => {
      const el = createABIndicator();
      expect(el.dataset.testid).toBe('ab-indicator');
    });

    it('VI-009: has text content A', () => {
      const el = createABIndicator();
      expect(el.textContent).toBe('A');
    });

    it('VI-010: is hidden by default', () => {
      const el = createABIndicator();
      expect(el.style.display).toBe('none');
    });
  });

  describe('createFilterModeBadge', () => {
    it('VI-011: returns an HTMLElement with class filter-mode-badge', () => {
      const el = createFilterModeBadge();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('filter-mode-badge');
    });

    it('VI-012: has data-testid filter-mode-badge', () => {
      const el = createFilterModeBadge();
      expect(el.dataset.testid).toBe('filter-mode-badge');
    });

    it('VI-013: has text content NN', () => {
      const el = createFilterModeBadge();
      expect(el.textContent).toBe('NN');
    });

    it('VI-014: is hidden by default', () => {
      const el = createFilterModeBadge();
      expect(el.style.display).toBe('none');
    });
  });

  describe('updateABIndicator', () => {
    it('VI-015: does nothing when abIndicator is null', () => {
      // Should not throw
      updateABIndicator(null, mockSession(), mockWipeManager());
    });

    it('VI-016: hides indicator when in split screen mode', () => {
      const el = createABIndicator();
      el.style.display = 'block';
      updateABIndicator(el, mockSession({ abCompareAvailable: true }), mockWipeManager({ isSplitScreen: true }));
      expect(el.style.display).toBe('none');
    });

    it('VI-017: shows indicator when AB compare is available', () => {
      const el = createABIndicator();
      updateABIndicator(el, mockSession({ abCompareAvailable: true, currentAB: 'A' }), mockWipeManager());
      expect(el.style.display).toBe('block');
    });

    it('VI-018: hides indicator when AB compare is not available', () => {
      const el = createABIndicator();
      el.style.display = 'block';
      updateABIndicator(el, mockSession({ abCompareAvailable: false }), mockWipeManager());
      expect(el.style.display).toBe('none');
    });

    it('VI-019: displays text A when currentAB is A', () => {
      const el = createABIndicator();
      updateABIndicator(el, mockSession({ abCompareAvailable: true, currentAB: 'A' }), mockWipeManager());
      expect(el.textContent).toBe('A');
    });

    it('VI-020: displays text B when currentAB is B', () => {
      const el = createABIndicator();
      updateABIndicator(el, mockSession({ abCompareAvailable: true, currentAB: 'B' }), mockWipeManager());
      expect(el.textContent).toBe('B');
    });

    it('VI-021: uses accent primary background for A', () => {
      const el = createABIndicator();
      updateABIndicator(el, mockSession({ abCompareAvailable: true, currentAB: 'A' }), mockWipeManager());
      expect(el.style.background).toBe('rgba(var(--accent-primary-rgb), 0.9)');
      expect(el.style.color).toBe('white');
    });

    it('VI-022: uses orange background for B', () => {
      const el = createABIndicator();
      updateABIndicator(el, mockSession({ abCompareAvailable: true, currentAB: 'B' }), mockWipeManager());
      expect(el.style.background).toBe('rgba(255, 180, 50, 0.9)');
      expect(el.style.color).toBe('var(--bg-primary)');
    });

    it('VI-023: overrides session currentAB when current parameter is provided', () => {
      const el = createABIndicator();
      updateABIndicator(el, mockSession({ abCompareAvailable: true, currentAB: 'A' }), mockWipeManager(), 'B');
      expect(el.textContent).toBe('B');
      expect(el.style.background).toBe('rgba(255, 180, 50, 0.9)');
    });

    it('VI-024: split screen takes precedence over AB availability', () => {
      const el = createABIndicator();
      updateABIndicator(
        el,
        mockSession({ abCompareAvailable: true, currentAB: 'A' }),
        mockWipeManager({ isSplitScreen: true }),
      );
      expect(el.style.display).toBe('none');
    });
  });

  describe('showFilterModeIndicator', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      container.remove();
    });

    it('VI-025: creates an indicator element in the container', () => {
      const result = showFilterModeIndicator(container, 'nearest', null, null);
      expect(result.indicator).toBeInstanceOf(HTMLElement);
      expect(container.contains(result.indicator)).toBe(true);
    });

    it('VI-026: displays "Nearest Neighbor" for nearest mode', () => {
      const result = showFilterModeIndicator(container, 'nearest', null, null);
      expect(result.indicator.textContent).toBe('Nearest Neighbor');
    });

    it('VI-027: displays "Bilinear" for linear mode', () => {
      const result = showFilterModeIndicator(container, 'linear', null, null);
      expect(result.indicator.textContent).toBe('Bilinear');
    });

    it('VI-028: sets data-testid filter-mode-indicator', () => {
      const result = showFilterModeIndicator(container, 'linear', null, null);
      expect(result.indicator.dataset.testid).toBe('filter-mode-indicator');
    });

    it('VI-029: removes previous indicator when creating a new one', () => {
      const first = showFilterModeIndicator(container, 'nearest', null, null);
      expect(container.contains(first.indicator)).toBe(true);

      const second = showFilterModeIndicator(container, 'linear', first.indicator, first.timeout);
      expect(container.contains(first.indicator)).toBe(false);
      expect(container.contains(second.indicator)).toBe(true);
    });

    it('VI-031: fades out after 1200ms', () => {
      const result = showFilterModeIndicator(container, 'nearest', null, null);
      expect(result.indicator.style.opacity).toBe('1');

      vi.advanceTimersByTime(1200);
      expect(result.indicator.style.opacity).toBe('0');
    });

    it('VI-032: removes element after fade out completes (1200 + 300ms)', () => {
      const result = showFilterModeIndicator(container, 'nearest', null, null);

      vi.advanceTimersByTime(1200);
      expect(container.contains(result.indicator)).toBe(true);

      vi.advanceTimersByTime(300);
      expect(container.contains(result.indicator)).toBe(false);
    });

  });

  describe('showFitModeIndicator', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      container.remove();
    });

    it('VI-034: creates indicator with "Fit All" for all mode', () => {
      showFitModeIndicator(container, 'all');
      const indicator = container.querySelector('.fit-mode-indicator');
      expect(indicator).not.toBeNull();
      expect(indicator!.textContent).toBe('Fit All');
    });

    it('VI-035: creates indicator with "Fit Width" for width mode', () => {
      showFitModeIndicator(container, 'width');
      const indicator = container.querySelector('.fit-mode-indicator');
      expect(indicator!.textContent).toBe('Fit Width');
    });

    it('VI-036: creates indicator with "Fit Height" for height mode', () => {
      showFitModeIndicator(container, 'height');
      const indicator = container.querySelector('.fit-mode-indicator');
      expect(indicator!.textContent).toBe('Fit Height');
    });

    it('VI-037: removes existing fit mode indicator before creating new one', () => {
      showFitModeIndicator(container, 'all');
      showFitModeIndicator(container, 'width');
      const indicators = container.querySelectorAll('.fit-mode-indicator');
      expect(indicators.length).toBe(1);
      expect(indicators[0].textContent).toBe('Fit Width');
    });

    it('VI-038: fades out after 1200ms', () => {
      showFitModeIndicator(container, 'all');
      const indicator = container.querySelector('.fit-mode-indicator') as HTMLElement;
      expect(indicator.style.opacity).toBe('1');

      vi.advanceTimersByTime(1200);
      expect(indicator.style.opacity).toBe('0');
    });

    it('VI-039: removes element after fade out (1200 + 300ms)', () => {
      showFitModeIndicator(container, 'all');

      vi.advanceTimersByTime(1200);
      expect(container.querySelector('.fit-mode-indicator')).not.toBeNull();

      vi.advanceTimersByTime(300);
      expect(container.querySelector('.fit-mode-indicator')).toBeNull();
    });

    it('VI-040: falls back to raw mode string for unknown fit modes', () => {
      // The labels[mode] ?? mode fallback should use the mode value directly
      showFitModeIndicator(container, 'unknown' as 'all' | 'width' | 'height');
      const indicator = container.querySelector('.fit-mode-indicator');
      expect(indicator).not.toBeNull();
      expect(indicator!.textContent).toBe('unknown');
    });
  });

  describe('loadFilterModePreference', () => {
    it('VI-041: returns linear as default when nothing is stored', () => {
      localStorage.removeItem('openrv.filterMode');
      expect(loadFilterModePreference()).toBe('linear');
    });

    it('VI-042: returns nearest when stored value is nearest', () => {
      localStorage.setItem('openrv.filterMode', 'nearest');
      const result = loadFilterModePreference();
      localStorage.removeItem('openrv.filterMode');
      expect(result).toBe('nearest');
    });

    it('VI-043: returns linear when stored value is linear', () => {
      localStorage.setItem('openrv.filterMode', 'linear');
      const result = loadFilterModePreference();
      localStorage.removeItem('openrv.filterMode');
      expect(result).toBe('linear');
    });

    it('VI-044: returns linear for invalid stored values', () => {
      localStorage.setItem('openrv.filterMode', 'invalid');
      const result = loadFilterModePreference();
      localStorage.removeItem('openrv.filterMode');
      expect(result).toBe('linear');
    });

    it('VI-045: returns linear when localStorage throws', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage disabled');
      });
      expect(loadFilterModePreference()).toBe('linear');
      getItemSpy.mockRestore();
    });
  });

  describe('persistFilterModePreference', () => {
    afterEach(() => {
      localStorage.removeItem('openrv.filterMode');
    });

    it('VI-046: stores nearest to localStorage', () => {
      persistFilterModePreference('nearest');
      expect(localStorage.getItem('openrv.filterMode')).toBe('nearest');
    });

    it('VI-047: stores linear to localStorage', () => {
      persistFilterModePreference('linear');
      expect(localStorage.getItem('openrv.filterMode')).toBe('linear');
    });

    it('VI-048: does not throw when localStorage is unavailable', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('localStorage disabled');
      });
      expect(() => persistFilterModePreference('nearest')).not.toThrow();
      setItemSpy.mockRestore();
    });
  });
});
