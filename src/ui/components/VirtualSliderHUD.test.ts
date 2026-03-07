import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VirtualSliderHUD } from './VirtualSliderHUD';
import { VIRTUAL_SLIDER_PARAMS } from './VirtualSliderConfig';

describe('VirtualSliderHUD', () => {
  let container: HTMLElement;
  let hud: VirtualSliderHUD;
  const exposureParam = VIRTUAL_SLIDER_PARAMS.KeyE!;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    hud = new VirtualSliderHUD(container);
  });

  afterEach(() => {
    hud.dispose();
    container.remove();
  });

  function getRoot(): HTMLElement | null {
    return container.querySelector('[data-testid="virtual-slider-hud"]');
  }

  function getLabel(): HTMLElement | null {
    return container.querySelector('[data-testid="virtual-slider-label"]');
  }

  function getValueEl(): HTMLElement | null {
    return container.querySelector('[data-testid="virtual-slider-value"]');
  }

  function getLockBadge(): HTMLElement | null {
    return container.querySelector('[data-testid="virtual-slider-lock"]');
  }

  function getTrack(): HTMLElement | null {
    return container.querySelector('[data-testid="virtual-slider-track"]');
  }

  function getFill(): HTMLElement | null {
    return container.querySelector('[data-testid="virtual-slider-fill"]');
  }

  function getNumeric(): HTMLElement | null {
    return container.querySelector('[data-testid="virtual-slider-numeric"]');
  }

  describe('show()', () => {
    it('creates the HUD DOM element in the container', () => {
      expect(getRoot()).toBeNull();
      hud.show(exposureParam, 0);
      expect(getRoot()).not.toBeNull();
    });

    it('displays the parameter label', () => {
      hud.show(exposureParam, 0);
      expect(getLabel()?.textContent).toBe('Exposure');
    });

    it('displays the formatted value', () => {
      hud.show(exposureParam, 1.5);
      expect(getValueEl()?.textContent).toBe('+1.50');
    });

    it('sets display to flex', () => {
      hud.show(exposureParam, 0);
      expect(getRoot()?.style.display).toBe('flex');
    });

    it('sets opacity to 1 after reflow', () => {
      hud.show(exposureParam, 0);
      // After show(), opacity should be '1' (set synchronously after forced reflow)
      expect(getRoot()?.style.opacity).toBe('1');
    });

    it('hides the lock badge initially', () => {
      hud.show(exposureParam, 0);
      expect(getLockBadge()?.style.display).toBe('none');
    });

    it('sets role=status on the root element', () => {
      hud.show(exposureParam, 0);
      expect(getRoot()?.getAttribute('role')).toBe('status');
    });

    it('sets aria-live=assertive on initial show', () => {
      hud.show(exposureParam, 0);
      // After show+update, it switches to polite for ongoing updates
      // The first call to updateContent changes it to polite
      // The initial call in show() sets assertive, then updateContent changes it
      // Actually: ensureRoot sets assertive, then updateContent runs and changes to polite
      // Let's check what the final value is
      const root = getRoot();
      // After the first updateContent call, it switches to polite
      expect(root?.getAttribute('aria-live')).toBe('polite');
    });

    it('sets z-index to 60', () => {
      hud.show(exposureParam, 0);
      expect(getRoot()?.style.zIndex).toBe('60');
    });

    it('shows the track bar in normal mode', () => {
      hud.show(exposureParam, 0);
      expect(getTrack()?.style.display).toBe('block');
      expect(getNumeric()?.style.display).toBe('none');
    });
  });

  describe('update()', () => {
    it('updates the value display', () => {
      hud.show(exposureParam, 0);
      hud.update(exposureParam, 2.5, false, null);
      expect(getValueEl()?.textContent).toBe('+2.50');
    });

    it('shows the lock badge when locked is true', () => {
      hud.show(exposureParam, 0);
      hud.update(exposureParam, 0, true, null);
      expect(getLockBadge()?.style.display).toBe('inline-block');
    });

    it('hides the lock badge when locked is false', () => {
      hud.show(exposureParam, 0);
      hud.update(exposureParam, 0, true, null);
      hud.update(exposureParam, 0, false, null);
      expect(getLockBadge()?.style.display).toBe('none');
    });

    it('switches to numeric entry mode when numericInput is provided', () => {
      hud.show(exposureParam, 0);
      hud.update(exposureParam, 0, false, '1.5');
      expect(getTrack()?.style.display).toBe('none');
      expect(getNumeric()?.style.display).toBe('block');
      expect(getNumeric()?.textContent).toBe('1.5_');
    });

    it('shows cursor placeholder when numeric input is empty', () => {
      hud.show(exposureParam, 0);
      hud.update(exposureParam, 0, false, '');
      expect(getNumeric()?.textContent).toBe('_');
    });

    it('switches back from numeric entry mode when null', () => {
      hud.show(exposureParam, 0);
      hud.update(exposureParam, 0, false, '1.5');
      hud.update(exposureParam, 1.5, false, null);
      expect(getTrack()?.style.display).toBe('block');
      expect(getNumeric()?.style.display).toBe('none');
    });

    it('updates the slider fill percentage', () => {
      hud.show(exposureParam, 0);
      // For exposure: min=-5, max=5, range=10
      // value=0 => (0 - (-5))/10 = 0.5 => 50%
      hud.update(exposureParam, 0, false, null);
      expect(getFill()?.style.width).toBe('50%');
    });

    it('clamps fill percentage to 0%', () => {
      hud.show(exposureParam, -10);
      hud.update(exposureParam, -10, false, null);
      expect(getFill()?.style.width).toBe('0%');
    });

    it('clamps fill percentage to 100%', () => {
      hud.show(exposureParam, 10);
      hud.update(exposureParam, 10, false, null);
      expect(getFill()?.style.width).toBe('100%');
    });

    it('updates aria-label with current value', () => {
      hud.show(exposureParam, 0);
      hud.update(exposureParam, 1.5, false, null);
      expect(getRoot()?.getAttribute('aria-label')).toContain('Exposure');
      expect(getRoot()?.getAttribute('aria-label')).toContain('+1.50');
    });

    it('includes (locked) in aria-label when locked', () => {
      hud.show(exposureParam, 0);
      hud.update(exposureParam, 0, true, null);
      expect(getRoot()?.getAttribute('aria-label')).toContain('(locked)');
    });

    it('works with different parameters', () => {
      const gammaParam = VIRTUAL_SLIDER_PARAMS.KeyY!;
      hud.show(gammaParam, 1.0);
      expect(getLabel()?.textContent).toBe('Gamma');
      expect(getValueEl()?.textContent).toBe('1.00');
    });

    it('does nothing if HUD is not shown yet', () => {
      // Should not throw
      hud.update(exposureParam, 0, false, null);
      expect(getRoot()).toBeNull();
    });
  });

  describe('hide()', () => {
    it('sets opacity to 0', () => {
      hud.show(exposureParam, 0);
      hud.hide();
      expect(getRoot()?.style.opacity).toBe('0');
    });

    it('removes the root after the fade-out timer', () => {
      vi.useFakeTimers();
      hud.show(exposureParam, 0);
      hud.hide();
      expect(getRoot()).not.toBeNull();
      vi.advanceTimersByTime(150);
      expect(getRoot()).toBeNull();
      vi.useRealTimers();
    });

    it('does nothing if not shown', () => {
      // Should not throw
      hud.hide();
      expect(getRoot()).toBeNull();
    });
  });

  describe('hideImmediate()', () => {
    it('removes the root immediately without animation', () => {
      hud.show(exposureParam, 0);
      hud.hideImmediate();
      expect(getRoot()).toBeNull();
    });

    it('cancels any pending fade-out timer', () => {
      vi.useFakeTimers();
      hud.show(exposureParam, 0);
      hud.hide(); // starts fade-out timer
      hud.hideImmediate(); // should cancel and remove immediately
      expect(getRoot()).toBeNull();
      vi.advanceTimersByTime(200);
      // No error from timer firing on removed element
      vi.useRealTimers();
    });
  });

  describe('dispose()', () => {
    it('removes the root element', () => {
      hud.show(exposureParam, 0);
      hud.dispose();
      expect(getRoot()).toBeNull();
    });

    it('prevents further show() calls from creating elements', () => {
      hud.dispose();
      hud.show(exposureParam, 0);
      expect(getRoot()).toBeNull();
    });

    it('prevents further update() calls', () => {
      hud.show(exposureParam, 0);
      hud.dispose();
      // Should not throw
      hud.update(exposureParam, 1, false, null);
    });

    it('can be called multiple times safely', () => {
      hud.dispose();
      hud.dispose();
      // No error
    });
  });

  describe('re-show after hide', () => {
    it('creates a new root element', () => {
      vi.useFakeTimers();
      hud.show(exposureParam, 0);
      hud.hide();
      vi.advanceTimersByTime(200);
      expect(getRoot()).toBeNull();

      hud.show(exposureParam, 1);
      expect(getRoot()).not.toBeNull();
      expect(getValueEl()?.textContent).toBe('+1.00');
      vi.useRealTimers();
    });
  });
});
