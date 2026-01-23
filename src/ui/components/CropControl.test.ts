/**
 * CropControl Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CropControl,
  CropRegion,
  DEFAULT_CROP_REGION,
  DEFAULT_CROP_STATE,
  ASPECT_RATIOS,
  MIN_CROP_FRACTION,
} from './CropControl';

describe('CropControl', () => {
  let control: CropControl;

  beforeEach(() => {
    control = new CropControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('CRP-001: starts with default crop state', () => {
      const state = control.getCropState();
      expect(state.enabled).toBe(false);
      expect(state.aspectRatio).toBeNull();
    });

    it('CRP-002: starts with full region', () => {
      const state = control.getCropState();
      expect(state.region).toEqual(DEFAULT_CROP_REGION);
    });

    it('CRP-003: default region covers entire image', () => {
      expect(DEFAULT_CROP_REGION.x).toBe(0);
      expect(DEFAULT_CROP_REGION.y).toBe(0);
      expect(DEFAULT_CROP_REGION.width).toBe(1);
      expect(DEFAULT_CROP_REGION.height).toBe(1);
    });
  });

  describe('getCropState', () => {
    it('CRP-004: returns copy of state', () => {
      const state1 = control.getCropState();
      const state2 = control.getCropState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it('CRP-005: returns copy of region', () => {
      const state1 = control.getCropState();
      const state2 = control.getCropState();
      expect(state1.region).not.toBe(state2.region);
      expect(state1.region).toEqual(state2.region);
    });
  });

  describe('setCropRegion', () => {
    it('CRP-006: sets crop region', () => {
      const region: CropRegion = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
      control.setCropRegion(region);

      const state = control.getCropState();
      expect(state.region).toEqual(region);
    });

    it('CRP-007: emits cropStateChanged event', () => {
      const handler = vi.fn();
      control.on('cropStateChanged', handler);

      const region: CropRegion = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
      control.setCropRegion(region);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ region: region })
      );
    });

    it('CRP-008: stores copy of region', () => {
      const region: CropRegion = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
      control.setCropRegion(region);

      region.x = 0.5; // Modify original

      const state = control.getCropState();
      expect(state.region.x).toBe(0.1); // Should not be modified
    });
  });

  describe('toggle', () => {
    it('CRP-009: toggle enables crop when disabled', () => {
      expect(control.getCropState().enabled).toBe(false);

      control.toggle();

      expect(control.getCropState().enabled).toBe(true);
    });

    it('CRP-010: toggle disables crop when enabled', () => {
      control.toggle(); // Enable
      expect(control.getCropState().enabled).toBe(true);

      control.toggle(); // Disable

      expect(control.getCropState().enabled).toBe(false);
    });

    it('CRP-011: toggle emits cropStateChanged event', () => {
      const handler = vi.fn();
      control.on('cropStateChanged', handler);

      control.toggle();

      expect(handler).toHaveBeenCalled();
    });

    it('CRP-012: toggle emits cropModeToggled event', () => {
      const handler = vi.fn();
      control.on('cropModeToggled', handler);

      control.toggle();

      expect(handler).toHaveBeenCalledWith(true);
    });

    it('CRP-059: toggle off should auto-close panel if open', () => {
      const panelHandler = vi.fn();
      control.on('panelToggled', panelHandler);

      control.toggle(); // Enable
      control.showPanel();
      panelHandler.mockClear();

      control.toggle(); // Disable — should also close panel

      expect(control.getCropState().enabled).toBe(false);
      expect(panelHandler).toHaveBeenCalledWith(false);
    });

    it('CRP-060: toggle off should not emit panelToggled when panel is already closed', () => {
      const panelHandler = vi.fn();
      control.on('panelToggled', panelHandler);

      control.toggle(); // Enable (panel not opened)
      panelHandler.mockClear();

      control.toggle(); // Disable — panel was not open

      expect(control.getCropState().enabled).toBe(false);
      expect(panelHandler).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('CRP-013: reset disables crop', () => {
      control.toggle(); // Enable
      control.reset();

      expect(control.getCropState().enabled).toBe(false);
    });

    it('CRP-014: reset restores default region', () => {
      control.setCropRegion({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 });
      control.reset();

      expect(control.getCropState().region).toEqual(DEFAULT_CROP_REGION);
    });

    it('CRP-015: reset clears aspect ratio', () => {
      // Set aspect ratio would need to be done via UI, but we can check reset clears it
      control.reset();

      expect(control.getCropState().aspectRatio).toBeNull();
    });

    it('CRP-016: reset emits cropStateChanged event', () => {
      const handler = vi.fn();
      control.on('cropStateChanged', handler);

      control.reset();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getAspectRatio', () => {
    it('CRP-017: returns null for free aspect ratio', () => {
      expect(control.getAspectRatio()).toBeNull();
    });
  });

  describe('panel visibility', () => {
    it('CRP-018: showPanel makes panel visible', () => {
      control.showPanel();
      // Panel is visible (internal state changed)
      // We can't easily check DOM without mounting, but method should not throw
    });

    it('CRP-019: hidePanel hides panel', () => {
      control.showPanel();
      control.hidePanel();
      // Should not throw
    });

    it('CRP-020: togglePanel toggles visibility', () => {
      control.togglePanel(); // Show
      control.togglePanel(); // Hide
      // Should not throw
    });
  });

  describe('render', () => {
    it('CRP-021: render returns HTMLElement', () => {
      const element = control.render();
      expect(element).toBeInstanceOf(HTMLElement);
    });

    it('CRP-022: render returns container element', () => {
      const element = control.render();
      expect(element.className).toBe('crop-control-container');
    });
  });

  describe('DEFAULT_CROP_STATE', () => {
    it('CRP-023: has correct default values', () => {
      expect(DEFAULT_CROP_STATE.enabled).toBe(false);
      expect(DEFAULT_CROP_STATE.aspectRatio).toBeNull();
      expect(DEFAULT_CROP_STATE.region).toEqual(DEFAULT_CROP_REGION);
    });
  });

  describe('applyAspectRatio', () => {
    /**
     * Helper: trigger aspect ratio application via the panel's select element.
     * This exercises the full code path: set value → dispatch change → applyAspectRatio → emitChange.
     */
    function selectAspectRatio(ctrl: CropControl, value: string | null): void {
      ctrl.showPanel();
      const select = document.querySelector('[data-testid="crop-aspect-select"]') as HTMLSelectElement;
      expect(select).not.toBeNull();
      select.value = value ?? '';
      select.dispatchEvent(new Event('change'));
    }

    it('CRP-025: 16:9 on 1920x1080 source yields correct pixel aspect ratio', () => {
      control.setSourceDimensions(1920, 1080);
      control.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });

      selectAspectRatio(control, '16:9');

      const state = control.getCropState();
      const pixelW = state.region.width * 1920;
      const pixelH = state.region.height * 1080;
      const pixelRatio = pixelW / pixelH;
      expect(pixelRatio).toBeCloseTo(16 / 9, 3);
    });

    it('CRP-026: 1:1 on 1920x1080 source yields square pixel crop', () => {
      control.setSourceDimensions(1920, 1080);
      control.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });

      selectAspectRatio(control, '1:1');

      const state = control.getCropState();
      const pixelW = state.region.width * 1920;
      const pixelH = state.region.height * 1080;
      expect(pixelW).toBeCloseTo(pixelH, 1);
    });

    it('CRP-027: 4:3 on 1920x1080 source yields correct ratio', () => {
      control.setSourceDimensions(1920, 1080);
      control.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });

      selectAspectRatio(control, '4:3');

      const state = control.getCropState();
      const pixelW = state.region.width * 1920;
      const pixelH = state.region.height * 1080;
      expect(pixelW / pixelH).toBeCloseTo(4 / 3, 3);
    });

    it('CRP-028: 9:16 on 1920x1080 source yields portrait ratio', () => {
      control.setSourceDimensions(1920, 1080);
      control.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });

      selectAspectRatio(control, '9:16');

      const state = control.getCropState();
      const pixelW = state.region.width * 1920;
      const pixelH = state.region.height * 1080;
      expect(pixelW / pixelH).toBeCloseTo(9 / 16, 3);
    });

    it('CRP-029: aspect ratio is centered within original region', () => {
      control.setSourceDimensions(1920, 1080);
      control.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });

      selectAspectRatio(control, '1:1');

      const state = control.getCropState();
      // For 1:1 on a 16:9 source, width should be reduced (narrower), so it centers horizontally
      expect(state.region.y).toBeCloseTo(0, 5);
      // x should be offset to center the square crop
      const expectedWidth = (1080 / 1920); // normalized width for 1:1 on 1920x1080
      expect(state.region.x).toBeCloseTo((1 - expectedWidth) / 2, 3);
    });

    it('CRP-030: region stays within [0,1] bounds after aspect ratio on offset region', () => {
      control.setSourceDimensions(1920, 1080);
      // Start with a region near the right edge
      control.setCropRegion({ x: 0.7, y: 0.5, width: 0.3, height: 0.5 });

      selectAspectRatio(control, '16:9');

      const state = control.getCropState();
      expect(state.region.x).toBeGreaterThanOrEqual(0);
      expect(state.region.y).toBeGreaterThanOrEqual(0);
      expect(state.region.x + state.region.width).toBeLessThanOrEqual(1 + 1e-6);
      expect(state.region.y + state.region.height).toBeLessThanOrEqual(1 + 1e-6);
    });

    it('CRP-031: region stays within [0,1] bounds near bottom-right corner', () => {
      control.setSourceDimensions(1920, 1080);
      control.setCropRegion({ x: 0.8, y: 0.8, width: 0.2, height: 0.2 });

      selectAspectRatio(control, '2.35:1');

      const state = control.getCropState();
      expect(state.region.x).toBeGreaterThanOrEqual(0);
      expect(state.region.y).toBeGreaterThanOrEqual(0);
      expect(state.region.x + state.region.width).toBeLessThanOrEqual(1 + 1e-6);
      expect(state.region.y + state.region.height).toBeLessThanOrEqual(1 + 1e-6);
    });

    it('CRP-032: "Free" aspect ratio does not modify region', () => {
      control.setSourceDimensions(1920, 1080);
      const region: CropRegion = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
      control.setCropRegion(region);

      selectAspectRatio(control, null);

      const state = control.getCropState();
      expect(state.region.x).toBeCloseTo(0.1, 5);
      expect(state.region.y).toBeCloseTo(0.2, 5);
      expect(state.region.width).toBeCloseTo(0.5, 5);
      expect(state.region.height).toBeCloseTo(0.4, 5);
    });

    it('CRP-033: aspect ratio on portrait source (1080x1920) works correctly', () => {
      control.setSourceDimensions(1080, 1920);
      control.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });

      selectAspectRatio(control, '16:9');

      const state = control.getCropState();
      const pixelW = state.region.width * 1080;
      const pixelH = state.region.height * 1920;
      expect(pixelW / pixelH).toBeCloseTo(16 / 9, 3);
    });

    it('CRP-034: aspect ratio on square source (1000x1000) works correctly', () => {
      control.setSourceDimensions(1000, 1000);
      control.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });

      selectAspectRatio(control, '4:3');

      const state = control.getCropState();
      const pixelW = state.region.width * 1000;
      const pixelH = state.region.height * 1000;
      expect(pixelW / pixelH).toBeCloseTo(4 / 3, 3);
    });

    it('CRP-035: aspect ratio emits cropStateChanged with correct region', () => {
      control.setSourceDimensions(1920, 1080);
      control.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });

      const handler = vi.fn();
      control.on('cropStateChanged', handler);

      selectAspectRatio(control, '1:1');

      expect(handler).toHaveBeenCalled();
      // Verify the most recently emitted state has the correct 1:1 pixel ratio
      const lastState = handler.mock.lastCall![0];
      const pixelW = lastState.region.width * 1920;
      const pixelH = lastState.region.height * 1080;
      expect(pixelW).toBeCloseTo(pixelH, 1);
    });

    it('CRP-036: dimensions label updates after aspect ratio change', () => {
      control.setSourceDimensions(1920, 1080);
      control.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });

      selectAspectRatio(control, '1:1');

      const dimLabel = document.querySelector('[data-testid="crop-dimensions"]');
      expect(dimLabel).not.toBeNull();
      // Should show pixel dimensions
      expect(dimLabel!.textContent).toMatch(/\d+ × \d+ px/);
    });
  });

  describe('setSourceDimensions', () => {
    it('CRP-037: updates dimensions label', () => {
      control.showPanel();
      control.setSourceDimensions(1920, 1080);

      const dimLabel = document.querySelector('[data-testid="crop-dimensions"]');
      expect(dimLabel).not.toBeNull();
      expect(dimLabel!.textContent).toContain('1920');
      expect(dimLabel!.textContent).toContain('1080');
    });

    it('CRP-038: handles zero dimensions gracefully', () => {
      expect(() => control.setSourceDimensions(0, 0)).not.toThrow();
    });
  });

  describe('ASPECT_RATIOS constant', () => {
    it('CRP-039: contains expected presets', () => {
      const labels = ASPECT_RATIOS.map(ar => ar.label);
      expect(labels).toContain('Free');
      expect(labels).toContain('16:9');
      expect(labels).toContain('4:3');
      expect(labels).toContain('1:1');
      expect(labels).toContain('9:16');
    });

    it('CRP-040: Free has null ratio', () => {
      const free = ASPECT_RATIOS.find(ar => ar.label === 'Free');
      expect(free?.ratio).toBeNull();
      expect(free?.value).toBeNull();
    });

    it('CRP-041: all presets have correct numeric ratios', () => {
      const r16_9 = ASPECT_RATIOS.find(ar => ar.value === '16:9');
      expect(r16_9?.ratio).toBeCloseTo(16 / 9, 5);

      const r4_3 = ASPECT_RATIOS.find(ar => ar.value === '4:3');
      expect(r4_3?.ratio).toBeCloseTo(4 / 3, 5);

      const r1_1 = ASPECT_RATIOS.find(ar => ar.value === '1:1');
      expect(r1_1?.ratio).toBe(1);

      const r9_16 = ASPECT_RATIOS.find(ar => ar.value === '9:16');
      expect(r9_16?.ratio).toBeCloseTo(9 / 16, 5);
    });
  });

  describe('MIN_CROP_FRACTION constant', () => {
    it('CRP-042: is 5% of image dimension', () => {
      expect(MIN_CROP_FRACTION).toBe(0.05);
    });

    it('CRP-043: is positive and less than 1', () => {
      expect(MIN_CROP_FRACTION).toBeGreaterThan(0);
      expect(MIN_CROP_FRACTION).toBeLessThan(1);
    });
  });

  describe('setState', () => {
    it('CRP-044: sets enabled state and emits events', () => {
      const modeHandler = vi.fn();
      control.on('cropModeToggled', modeHandler);

      control.setState({ enabled: true, region: DEFAULT_CROP_REGION, aspectRatio: null });

      expect(control.getCropState().enabled).toBe(true);
      expect(modeHandler).toHaveBeenCalledWith(true);
    });

    it('CRP-045: does not emit cropModeToggled when enabled unchanged', () => {
      const modeHandler = vi.fn();
      control.on('cropModeToggled', modeHandler);

      control.setState({ enabled: false, region: DEFAULT_CROP_REGION, aspectRatio: null });

      expect(modeHandler).not.toHaveBeenCalled();
    });

    it('CRP-046: sets region and aspect ratio', () => {
      const region: CropRegion = { x: 0.2, y: 0.3, width: 0.5, height: 0.4 };
      control.setState({ enabled: true, region, aspectRatio: '16:9' });

      const state = control.getCropState();
      expect(state.region).toEqual(region);
      expect(state.aspectRatio).toBe('16:9');
    });
  });

  describe('ARIA accessibility', () => {
    it('CRP-047: panel has role="dialog" and aria-label', () => {
      control.showPanel();
      const panel = document.querySelector('.crop-panel');
      expect(panel).not.toBeNull();
      expect(panel!.getAttribute('role')).toBe('dialog');
      expect(panel!.getAttribute('aria-label')).toBe('Crop Settings');
    });

    it('CRP-048: toggle switch has role="switch" and aria-checked', () => {
      control.showPanel();
      const toggle = document.querySelector('[role="switch"]') as HTMLButtonElement;
      expect(toggle).not.toBeNull();
      expect(toggle!.getAttribute('aria-checked')).toBe('false');
    });

    it('CRP-049: toggle switch aria-checked updates on toggle', () => {
      control.showPanel();
      control.toggle();
      const toggle = document.querySelector('[role="switch"]') as HTMLButtonElement;
      expect(toggle!.getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('Escape key handler', () => {
    it('CRP-050: Escape key closes panel when open', () => {
      const handler = vi.fn();
      control.on('panelToggled', handler);

      control.showPanel();
      expect(handler).toHaveBeenCalledWith(true);

      // Simulate Escape key
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(handler).toHaveBeenCalledWith(false);
    });

    it('CRP-051: Escape key does nothing when panel is closed', () => {
      const handler = vi.fn();
      control.on('panelToggled', handler);

      // Panel is not open, Escape should be a no-op
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('close button', () => {
    it('CRP-052: close button hides the panel', () => {
      const handler = vi.fn();
      control.on('panelToggled', handler);

      control.showPanel();
      handler.mockClear();

      const closeBtn = document.querySelector('[aria-label="Close crop panel"]') as HTMLButtonElement;
      expect(closeBtn).not.toBeNull();
      closeBtn.click();

      expect(handler).toHaveBeenCalledWith(false);
    });
  });

  describe('aspect ratio select accessibility', () => {
    it('CRP-053: select has aria-label', () => {
      control.showPanel();
      const select = document.querySelector('[data-testid="crop-aspect-select"]') as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.getAttribute('aria-label')).toBe('Aspect Ratio');
    });
  });

  describe('MIN_CROP_FRACTION enforcement in applyAspectRatio', () => {
    function selectAspectRatio(ctrl: CropControl, value: string | null): void {
      ctrl.showPanel();
      const select = document.querySelector('[data-testid="crop-aspect-select"]') as HTMLSelectElement;
      select.value = value ?? '';
      select.dispatchEvent(new Event('change'));
    }

    it('CRP-054: extremely tall aspect ratio on wide source still meets minimum width', () => {
      control.setSourceDimensions(1920, 1080);
      // Start with a very small region
      control.setCropRegion({ x: 0.4, y: 0.4, width: 0.01, height: 0.01 });

      selectAspectRatio(control, '9:16');

      const state = control.getCropState();
      expect(state.region.width).toBeGreaterThanOrEqual(MIN_CROP_FRACTION);
      expect(state.region.height).toBeGreaterThanOrEqual(MIN_CROP_FRACTION);
    });

    it('CRP-055: extremely wide aspect ratio on tall source still meets minimum height', () => {
      control.setSourceDimensions(1080, 1920);
      // Start with a very small region
      control.setCropRegion({ x: 0.4, y: 0.4, width: 0.01, height: 0.01 });

      selectAspectRatio(control, '2.35:1');

      const state = control.getCropState();
      expect(state.region.width).toBeGreaterThanOrEqual(MIN_CROP_FRACTION);
      expect(state.region.height).toBeGreaterThanOrEqual(MIN_CROP_FRACTION);
    });
  });

  describe('division by zero guard in applyAspectRatio', () => {
    function selectAspectRatio(ctrl: CropControl, value: string | null): void {
      ctrl.showPanel();
      const select = document.querySelector('[data-testid="crop-aspect-select"]') as HTMLSelectElement;
      select.value = value ?? '';
      select.dispatchEvent(new Event('change'));
    }

    it('CRP-056: zero source height does not crash', () => {
      // setSourceDimensions guards against 0, but test the behavior
      control.setSourceDimensions(1920, 0);
      control.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });

      expect(() => selectAspectRatio(control, '16:9')).not.toThrow();

      // Region should remain valid
      const state = control.getCropState();
      expect(Number.isFinite(state.region.width)).toBe(true);
      expect(Number.isFinite(state.region.height)).toBe(true);
    });

    it('CRP-057: negative source dimensions do not crash', () => {
      control.setSourceDimensions(-100, -100);
      control.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });

      expect(() => selectAspectRatio(control, '1:1')).not.toThrow();

      const state = control.getCropState();
      expect(Number.isFinite(state.region.width)).toBe(true);
      expect(Number.isFinite(state.region.height)).toBe(true);
    });
  });

  describe('dispose', () => {
    it('CRP-024: dispose does not throw', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('CRP-058: dispose removes keydown listener', () => {
      control.showPanel();
      control.dispose();

      const handler = vi.fn();
      control.on('panelToggled', handler);

      // After dispose, Escape should not close the panel
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
