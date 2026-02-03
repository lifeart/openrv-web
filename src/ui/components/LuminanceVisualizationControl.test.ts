/**
 * LuminanceVisualizationControl Unit Tests
 *
 * Tests for the UI control component that manages luminance visualization modes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LuminanceVisualization } from './LuminanceVisualization';
import { LuminanceVisualizationControl } from './LuminanceVisualizationControl';
import { FalseColor } from './FalseColor';

describe('LuminanceVisualizationControl', () => {
  let falseColor: FalseColor;
  let lumVis: LuminanceVisualization;
  let control: LuminanceVisualizationControl;

  beforeEach(() => {
    falseColor = new FalseColor();
    lumVis = new LuminanceVisualization(falseColor);
    control = new LuminanceVisualizationControl(lumVis);
  });

  afterEach(() => {
    control.dispose();
    lumVis.dispose();
    falseColor.dispose();
  });

  describe('render', () => {
    it('renders a container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('luminance-vis-control');
    });

    it('has a toggle button with correct data-testid', () => {
      const el = control.render();
      const btn = el.querySelector('[data-testid="luminance-vis-selector"]');
      expect(btn).not.toBeNull();
    });
  });

  describe('badge', () => {
    it('creates a badge element with correct data-testid', () => {
      const badge = control.createBadge();
      expect(badge).toBeInstanceOf(HTMLElement);
      expect(badge.dataset.testid).toBe('luminance-vis-badge');
    });

    it('badge is hidden when mode is off', () => {
      const badge = control.createBadge();
      expect(badge.style.display).toBe('none');
    });

    it('badge becomes visible when mode is set', () => {
      const badge = control.createBadge();
      lumVis.setMode('hsv');
      expect(badge.style.display).toBe('block');
      expect(badge.textContent).toBe('HSV');
    });

    it('badge shows mode-specific text with parameters', () => {
      const badge = control.createBadge();
      lumVis.setMode('random-color');
      expect(badge.textContent).toBe('Random (16)');

      lumVis.setMode('contour');
      expect(badge.textContent).toBe('Contour (10)');
    });

    it('badge hides when mode returns to off', () => {
      const badge = control.createBadge();
      lumVis.setMode('hsv');
      expect(badge.style.display).toBe('block');

      lumVis.setMode('off');
      expect(badge.style.display).toBe('none');
    });
  });

  describe('dropdown content', () => {
    it('contains mode option buttons', () => {
      const el = control.render();
      // The dropdown should have buttons for all modes
      const offBtn = el.querySelector('[data-testid="luminance-vis-off"]');
      const hsvBtn = el.querySelector('[data-testid="luminance-vis-hsv"]');
      const randomBtn = el.querySelector('[data-testid="luminance-vis-random"]');
      const contourBtn = el.querySelector('[data-testid="luminance-vis-contour"]');
      const fcBtn = el.querySelector('[data-testid="luminance-vis-false-color"]');

      expect(offBtn).not.toBeNull();
      expect(hsvBtn).not.toBeNull();
      expect(randomBtn).not.toBeNull();
      expect(contourBtn).not.toBeNull();
      expect(fcBtn).not.toBeNull();
    });
  });
});
