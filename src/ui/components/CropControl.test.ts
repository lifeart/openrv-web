/**
 * CropControl Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CropControl,
  CropRegion,
  DEFAULT_CROP_REGION,
  DEFAULT_CROP_STATE,
  DEFAULT_UNCROP_STATE,
  UncropState,
  ASPECT_RATIOS,
  MIN_CROP_FRACTION,
  MAX_UNCROP_PADDING,
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

  describe('outside click to close', () => {
    it('CC-L59a: clicking outside the CropControl panel should close it', () => {
      const handler = vi.fn();
      control.on('panelToggled', handler);

      control.showPanel();
      handler.mockClear();

      // Create an element outside the panel and container
      const outsideEl = document.createElement('div');
      document.body.appendChild(outsideEl);

      // Simulate a click on the outside element
      const clickEvent = new MouseEvent('click', { bubbles: true });
      outsideEl.dispatchEvent(clickEvent);

      expect(handler).toHaveBeenCalledWith(false);

      document.body.removeChild(outsideEl);
    });

    it('CC-L59b: clicking inside the CropControl panel should NOT close it', () => {
      const handler = vi.fn();
      control.on('panelToggled', handler);

      control.showPanel();
      handler.mockClear();

      // Find the panel in the DOM and click inside it
      const panel = document.querySelector('.crop-panel') as HTMLElement;
      expect(panel).not.toBeNull();

      const clickEvent = new MouseEvent('click', { bubbles: true });
      panel.dispatchEvent(clickEvent);

      expect(handler).not.toHaveBeenCalled();
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

  // ===== Uncrop / Canvas Extension Tests =====

  describe('uncrop: default state', () => {
    it('UNCRP-001: default uncrop state has correct values', () => {
      const state = control.getUncropState();
      expect(state.enabled).toBe(false);
      expect(state.paddingMode).toBe('uniform');
      expect(state.padding).toBe(0);
      expect(state.paddingTop).toBe(0);
      expect(state.paddingRight).toBe(0);
      expect(state.paddingBottom).toBe(0);
      expect(state.paddingLeft).toBe(0);
    });

    it('UNCRP-002: DEFAULT_UNCROP_STATE constant has correct values', () => {
      expect(DEFAULT_UNCROP_STATE.enabled).toBe(false);
      expect(DEFAULT_UNCROP_STATE.paddingMode).toBe('uniform');
      expect(DEFAULT_UNCROP_STATE.padding).toBe(0);
    });
  });

  describe('uncrop: setUncropState', () => {
    it('UNCRP-003: setUncropState updates canvas dimensions', () => {
      control.setSourceDimensions(1920, 1080);
      control.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: 100,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });

      const state = control.getUncropState();
      expect(state.enabled).toBe(true);
      expect(state.padding).toBe(100);

      const dims = control.getUncropCanvasDimensions();
      expect(dims.width).toBe(2120); // 1920 + 100 + 100
      expect(dims.height).toBe(1280); // 1080 + 100 + 100
    });

    it('UNCRP-004: setUncropState emits uncropStateChanged event', () => {
      const handler = vi.fn();
      control.on('uncropStateChanged', handler);

      control.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: 50,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true, padding: 50 })
      );
    });

    it('UNCRP-005: setUncropState stores copy of state', () => {
      const state: UncropState = {
        enabled: true,
        paddingMode: 'uniform',
        padding: 100,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      };
      control.setUncropState(state);

      // Modify original
      state.padding = 999;

      const retrieved = control.getUncropState();
      expect(retrieved.padding).toBe(100);
    });
  });

  describe('uncrop: getUncropState', () => {
    it('UNCRP-006: returns copy of state', () => {
      const s1 = control.getUncropState();
      const s2 = control.getUncropState();
      expect(s1).not.toBe(s2);
      expect(s1).toEqual(s2);
    });
  });

  describe('uncrop: toggleUncrop', () => {
    it('UNCRP-007: toggleUncrop enables when disabled', () => {
      expect(control.getUncropState().enabled).toBe(false);
      control.toggleUncrop();
      expect(control.getUncropState().enabled).toBe(true);
    });

    it('UNCRP-008: toggleUncrop disables when enabled', () => {
      control.toggleUncrop(); // enable
      control.toggleUncrop(); // disable
      expect(control.getUncropState().enabled).toBe(false);
    });

    it('UNCRP-009: toggleUncrop emits uncropStateChanged', () => {
      const handler = vi.fn();
      control.on('uncropStateChanged', handler);
      control.toggleUncrop();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.lastCall![0].enabled).toBe(true);
    });
  });

  describe('uncrop: resetUncrop', () => {
    it('UNCRP-010: resetUncrop restores default state', () => {
      control.setUncropState({
        enabled: true,
        paddingMode: 'per-side',
        padding: 200,
        paddingTop: 50,
        paddingRight: 100,
        paddingBottom: 50,
        paddingLeft: 100,
      });

      control.resetUncrop();

      const state = control.getUncropState();
      expect(state).toEqual(DEFAULT_UNCROP_STATE);
    });

    it('UNCRP-011: resetUncrop emits uncropStateChanged', () => {
      const handler = vi.fn();
      control.on('uncropStateChanged', handler);
      control.resetUncrop();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('uncrop: canvas dimensions', () => {
    it('UNCRP-012: uniform padding adds to both dimensions', () => {
      control.setSourceDimensions(1920, 1080);
      control.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: 50,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });

      const dims = control.getUncropCanvasDimensions();
      expect(dims.width).toBe(2020); // 1920 + 50 + 50
      expect(dims.height).toBe(1180); // 1080 + 50 + 50
    });

    it('UNCRP-013: per-side padding allows asymmetric extension', () => {
      control.setSourceDimensions(1920, 1080);
      control.setUncropState({
        enabled: true,
        paddingMode: 'per-side',
        padding: 0,
        paddingTop: 100,
        paddingRight: 200,
        paddingBottom: 50,
        paddingLeft: 150,
      });

      const dims = control.getUncropCanvasDimensions();
      expect(dims.width).toBe(2270); // 1920 + 150 + 200
      expect(dims.height).toBe(1230); // 1080 + 100 + 50
    });

    it('UNCRP-014: disabled uncrop returns source dimensions', () => {
      control.setSourceDimensions(1920, 1080);
      control.setUncropState({
        enabled: false,
        paddingMode: 'uniform',
        padding: 200,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });

      const dims = control.getUncropCanvasDimensions();
      expect(dims.width).toBe(1920);
      expect(dims.height).toBe(1080);
    });

    it('UNCRP-015: zero padding returns source dimensions', () => {
      control.setSourceDimensions(1920, 1080);
      control.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });

      const dims = control.getUncropCanvasDimensions();
      expect(dims.width).toBe(1920);
      expect(dims.height).toBe(1080);
    });
  });

  describe('uncrop: getEffectivePadding', () => {
    it('UNCRP-016: uniform mode returns same value for all sides', () => {
      control.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: 75,
        paddingTop: 10,
        paddingRight: 20,
        paddingBottom: 30,
        paddingLeft: 40,
      });

      const pad = control.getEffectivePadding();
      expect(pad.top).toBe(75);
      expect(pad.right).toBe(75);
      expect(pad.bottom).toBe(75);
      expect(pad.left).toBe(75);
    });

    it('UNCRP-017: per-side mode returns individual values', () => {
      control.setUncropState({
        enabled: true,
        paddingMode: 'per-side',
        padding: 999,
        paddingTop: 10,
        paddingRight: 20,
        paddingBottom: 30,
        paddingLeft: 40,
      });

      const pad = control.getEffectivePadding();
      expect(pad.top).toBe(10);
      expect(pad.right).toBe(20);
      expect(pad.bottom).toBe(30);
      expect(pad.left).toBe(40);
    });
  });

  describe('uncrop: crop reset also resets uncrop', () => {
    it('UNCRP-018: crop reset resets uncrop state', () => {
      control.setUncropState({
        enabled: true,
        paddingMode: 'per-side',
        padding: 100,
        paddingTop: 50,
        paddingRight: 50,
        paddingBottom: 50,
        paddingLeft: 50,
      });

      control.reset();

      const uncropState = control.getUncropState();
      expect(uncropState).toEqual(DEFAULT_UNCROP_STATE);
    });
  });

  describe('uncrop: panel UI', () => {
    it('UNCRP-019: uncrop toggle is rendered in panel', () => {
      control.showPanel();
      const toggle = document.querySelector('[data-testid="uncrop-toggle"]');
      expect(toggle).not.toBeNull();
    });

    it('UNCRP-020: uncrop toggle has correct initial aria attributes', () => {
      control.showPanel();
      const toggle = document.querySelector('[data-testid="uncrop-toggle"]');
      expect(toggle).not.toBeNull();
      expect(toggle!.getAttribute('role')).toBe('switch');
      expect(toggle!.getAttribute('aria-checked')).toBe('false');
    });

    it('UNCRP-021: padding mode select is rendered in panel', () => {
      control.showPanel();
      const select = document.querySelector('[data-testid="uncrop-padding-mode"]');
      expect(select).not.toBeNull();
    });

    it('UNCRP-022: uniform padding input is visible by default', () => {
      control.showPanel();
      const container = document.querySelector('[data-testid="uncrop-uniform-container"]') as HTMLElement;
      expect(container).not.toBeNull();
      expect(container!.style.display).not.toBe('none');
    });

    it('UNCRP-023: per-side container is hidden by default', () => {
      control.showPanel();
      const container = document.querySelector('[data-testid="uncrop-perside-container"]') as HTMLElement;
      expect(container).not.toBeNull();
      expect(container!.style.display).toBe('none');
    });

    it('UNCRP-024: canvas dimensions label shows correct values', () => {
      control.setSourceDimensions(1920, 1080);
      control.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: 100,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });
      control.showPanel();

      const label = document.querySelector('[data-testid="uncrop-canvas-dimensions"]');
      expect(label).not.toBeNull();
      expect(label!.textContent).toContain('2120');
      expect(label!.textContent).toContain('1280');
    });

    it('UNCRP-025: reset uncrop button is rendered', () => {
      control.showPanel();
      const btn = document.querySelector('[data-testid="uncrop-reset"]');
      expect(btn).not.toBeNull();
    });

    it('UNCRP-026: clicking uncrop toggle updates aria-checked', () => {
      control.showPanel();
      const toggle = document.querySelector('[data-testid="uncrop-toggle"]') as HTMLButtonElement;
      expect(toggle).not.toBeNull();

      toggle.click();
      expect(toggle.getAttribute('aria-checked')).toBe('true');
      expect(control.getUncropState().enabled).toBe(true);
    });

    it('UNCRP-027: switching padding mode shows per-side inputs', () => {
      control.showPanel();
      const select = document.querySelector('[data-testid="uncrop-padding-mode"]') as HTMLSelectElement;
      select.value = 'per-side';
      select.dispatchEvent(new Event('change'));

      const uniformContainer = document.querySelector('[data-testid="uncrop-uniform-container"]') as HTMLElement;
      const perSideContainer = document.querySelector('[data-testid="uncrop-perside-container"]') as HTMLElement;
      expect(uniformContainer.style.display).toBe('none');
      expect(perSideContainer.style.display).toBe('block');
    });

    it('UNCRP-028: uniform padding input updates state', () => {
      control.showPanel();
      const input = document.querySelector('[data-testid="uncrop-uniform-padding"]') as HTMLInputElement;
      expect(input).not.toBeNull();

      input.value = '150';
      input.dispatchEvent(new Event('input'));

      expect(control.getUncropState().padding).toBe(150);
    });

    it('UNCRP-029: per-side padding inputs update state', () => {
      control.showPanel();
      // Switch to per-side mode
      const select = document.querySelector('[data-testid="uncrop-padding-mode"]') as HTMLSelectElement;
      select.value = 'per-side';
      select.dispatchEvent(new Event('change'));

      const topInput = document.querySelector('[data-testid="uncrop-padding-top"]') as HTMLInputElement;
      const rightInput = document.querySelector('[data-testid="uncrop-padding-right"]') as HTMLInputElement;
      const bottomInput = document.querySelector('[data-testid="uncrop-padding-bottom"]') as HTMLInputElement;
      const leftInput = document.querySelector('[data-testid="uncrop-padding-left"]') as HTMLInputElement;

      topInput.value = '10';
      topInput.dispatchEvent(new Event('input'));
      rightInput.value = '20';
      rightInput.dispatchEvent(new Event('input'));
      bottomInput.value = '30';
      bottomInput.dispatchEvent(new Event('input'));
      leftInput.value = '40';
      leftInput.dispatchEvent(new Event('input'));

      const state = control.getUncropState();
      expect(state.paddingTop).toBe(10);
      expect(state.paddingRight).toBe(20);
      expect(state.paddingBottom).toBe(30);
      expect(state.paddingLeft).toBe(40);
    });
  });

  describe('uncrop: input validation edge cases', () => {
    it('UNCRP-030: negative uniform padding is clamped to 0', () => {
      control.showPanel();
      const input = document.querySelector('[data-testid="uncrop-uniform-padding"]') as HTMLInputElement;
      input.value = '-50';
      input.dispatchEvent(new Event('input'));

      expect(control.getUncropState().padding).toBe(0);
      // DOM value should also be synced to clamped value
      expect(input.value).toBe('0');
    });

    it('UNCRP-031: uniform padding above MAX_UNCROP_PADDING is clamped', () => {
      control.showPanel();
      const input = document.querySelector('[data-testid="uncrop-uniform-padding"]') as HTMLInputElement;
      input.value = '99999';
      input.dispatchEvent(new Event('input'));

      expect(control.getUncropState().padding).toBe(MAX_UNCROP_PADDING);
      expect(input.value).toBe(String(MAX_UNCROP_PADDING));
    });

    it('UNCRP-032: NaN uniform padding is treated as 0', () => {
      control.showPanel();
      const input = document.querySelector('[data-testid="uncrop-uniform-padding"]') as HTMLInputElement;
      input.value = 'abc';
      input.dispatchEvent(new Event('input'));

      expect(control.getUncropState().padding).toBe(0);
    });

    it('UNCRP-033: negative per-side padding is clamped to 0', () => {
      control.showPanel();
      // Switch to per-side mode
      const select = document.querySelector('[data-testid="uncrop-padding-mode"]') as HTMLSelectElement;
      select.value = 'per-side';
      select.dispatchEvent(new Event('change'));

      const topInput = document.querySelector('[data-testid="uncrop-padding-top"]') as HTMLInputElement;
      topInput.value = '-100';
      topInput.dispatchEvent(new Event('input'));

      expect(control.getUncropState().paddingTop).toBe(0);
      expect(topInput.value).toBe('0');
    });

    it('UNCRP-034: per-side padding above MAX_UNCROP_PADDING is clamped', () => {
      control.showPanel();
      const select = document.querySelector('[data-testid="uncrop-padding-mode"]') as HTMLSelectElement;
      select.value = 'per-side';
      select.dispatchEvent(new Event('change'));

      const rightInput = document.querySelector('[data-testid="uncrop-padding-right"]') as HTMLInputElement;
      rightInput.value = '5000';
      rightInput.dispatchEvent(new Event('input'));

      expect(control.getUncropState().paddingRight).toBe(MAX_UNCROP_PADDING);
      expect(rightInput.value).toBe(String(MAX_UNCROP_PADDING));
    });

    it('UNCRP-035: setUncropState clamps negative padding values', () => {
      control.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: -100,
        paddingTop: -10,
        paddingRight: -20,
        paddingBottom: -30,
        paddingLeft: -40,
      });

      const state = control.getUncropState();
      expect(state.padding).toBe(0);
      expect(state.paddingTop).toBe(0);
      expect(state.paddingRight).toBe(0);
      expect(state.paddingBottom).toBe(0);
      expect(state.paddingLeft).toBe(0);
    });

    it('UNCRP-036: setUncropState clamps excessively large padding values', () => {
      control.setUncropState({
        enabled: true,
        paddingMode: 'per-side',
        padding: 50000,
        paddingTop: 10000,
        paddingRight: 10000,
        paddingBottom: 10000,
        paddingLeft: 10000,
      });

      const state = control.getUncropState();
      expect(state.padding).toBe(MAX_UNCROP_PADDING);
      expect(state.paddingTop).toBe(MAX_UNCROP_PADDING);
      expect(state.paddingRight).toBe(MAX_UNCROP_PADDING);
      expect(state.paddingBottom).toBe(MAX_UNCROP_PADDING);
      expect(state.paddingLeft).toBe(MAX_UNCROP_PADDING);
    });

    it('UNCRP-037: setUncropState clamps NaN values to 0', () => {
      control.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: NaN,
        paddingTop: NaN,
        paddingRight: Infinity,
        paddingBottom: -Infinity,
        paddingLeft: NaN,
      });

      const state = control.getUncropState();
      expect(state.padding).toBe(0);
      expect(state.paddingTop).toBe(0);
      expect(state.paddingRight).toBe(0);
      expect(state.paddingBottom).toBe(0);
      expect(state.paddingLeft).toBe(0);
    });

    it('UNCRP-038: setUncropState rounds fractional padding to integer', () => {
      control.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: 99.7,
        paddingTop: 10.3,
        paddingRight: 20.5,
        paddingBottom: 30.9,
        paddingLeft: 40.1,
      });

      const state = control.getUncropState();
      expect(state.padding).toBe(100);
      expect(state.paddingTop).toBe(10);
      expect(state.paddingRight).toBe(21);
      expect(state.paddingBottom).toBe(31);
      expect(state.paddingLeft).toBe(40);
    });
  });

  describe('uncrop: MAX_UNCROP_PADDING constant', () => {
    it('UNCRP-039: MAX_UNCROP_PADDING is a positive integer', () => {
      expect(MAX_UNCROP_PADDING).toBeGreaterThan(0);
      expect(Number.isInteger(MAX_UNCROP_PADDING)).toBe(true);
    });

    it('UNCRP-040: MAX_UNCROP_PADDING matches the input max attribute', () => {
      control.showPanel();
      const input = document.querySelector('[data-testid="uncrop-uniform-padding"]') as HTMLInputElement;
      expect(input.max).toBe(String(MAX_UNCROP_PADDING));
    });
  });

  describe('uncrop: crop and uncrop interaction', () => {
    it('UNCRP-041: crop and uncrop can be enabled simultaneously', () => {
      control.toggle(); // enable crop
      control.toggleUncrop(); // enable uncrop

      expect(control.getCropState().enabled).toBe(true);
      expect(control.getUncropState().enabled).toBe(true);
    });

    it('UNCRP-042: crop reset also resets uncrop, both are disabled', () => {
      control.toggle(); // enable crop
      control.setUncropState({
        enabled: true,
        paddingMode: 'per-side',
        padding: 100,
        paddingTop: 50,
        paddingRight: 60,
        paddingBottom: 70,
        paddingLeft: 80,
      });

      control.reset();

      expect(control.getCropState().enabled).toBe(false);
      expect(control.getCropState().region).toEqual(DEFAULT_CROP_REGION);
      const uncropState = control.getUncropState();
      expect(uncropState.enabled).toBe(false);
      expect(uncropState.padding).toBe(0);
      expect(uncropState.paddingTop).toBe(0);
    });

    it('UNCRP-043: uncrop reset does not affect crop state', () => {
      control.toggle(); // enable crop
      control.setCropRegion({ x: 0.1, y: 0.2, width: 0.5, height: 0.6 });
      control.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: 100,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });

      control.resetUncrop();

      // Crop state should be unaffected
      expect(control.getCropState().enabled).toBe(true);
      expect(control.getCropState().region.x).toBeCloseTo(0.1);
      // Uncrop should be reset
      expect(control.getUncropState()).toEqual(DEFAULT_UNCROP_STATE);
    });
  });

  describe('uncrop: canvas dimensions edge cases', () => {
    it('UNCRP-044: very small source with large padding', () => {
      control.setSourceDimensions(1, 1);
      control.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: 500,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });

      const dims = control.getUncropCanvasDimensions();
      expect(dims.width).toBe(1001); // 1 + 500 + 500
      expect(dims.height).toBe(1001);
    });

    it('UNCRP-045: getEffectivePadding returns correct values regardless of enabled state', () => {
      control.setUncropState({
        enabled: false,
        paddingMode: 'uniform',
        padding: 100,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });

      // getEffectivePadding reflects the stored mode/values, not the enabled flag
      const pad = control.getEffectivePadding();
      expect(pad.top).toBe(100);
      expect(pad.right).toBe(100);
      expect(pad.bottom).toBe(100);
      expect(pad.left).toBe(100);
    });

    it('UNCRP-046: canvas dimensions with zero source defaults to 1x1', () => {
      control.setSourceDimensions(0, 0);
      control.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: 50,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });

      const dims = control.getUncropCanvasDimensions();
      // Source is clamped to 1x1, so canvas is 1 + 50 + 50 = 101
      expect(dims.width).toBe(101);
      expect(dims.height).toBe(101);
    });
  });

  describe('uncrop: accessibility', () => {
    it('UNCRP-047: uncrop toggle has aria-label', () => {
      control.showPanel();
      const toggle = document.querySelector('[data-testid="uncrop-toggle"]');
      expect(toggle).not.toBeNull();
      expect(toggle!.getAttribute('aria-label')).toBe('Enable Canvas Extension');
    });

    it('UNCRP-048: padding mode select has aria-label', () => {
      control.showPanel();
      const select = document.querySelector('[data-testid="uncrop-padding-mode"]');
      expect(select).not.toBeNull();
      expect(select!.getAttribute('aria-label')).toBe('Padding Mode');
    });

    it('UNCRP-049: uniform padding input has aria-label', () => {
      control.showPanel();
      const input = document.querySelector('[data-testid="uncrop-uniform-padding"]');
      expect(input).not.toBeNull();
      expect(input!.getAttribute('aria-label')).toBe('Uniform padding in pixels');
    });

    it('UNCRP-050: per-side padding inputs have aria-labels', () => {
      control.showPanel();
      const topInput = document.querySelector('[data-testid="uncrop-padding-top"]');
      const rightInput = document.querySelector('[data-testid="uncrop-padding-right"]');
      const bottomInput = document.querySelector('[data-testid="uncrop-padding-bottom"]');
      const leftInput = document.querySelector('[data-testid="uncrop-padding-left"]');

      expect(topInput!.getAttribute('aria-label')).toBe('Top padding in pixels');
      expect(rightInput!.getAttribute('aria-label')).toBe('Right padding in pixels');
      expect(bottomInput!.getAttribute('aria-label')).toBe('Bottom padding in pixels');
      expect(leftInput!.getAttribute('aria-label')).toBe('Left padding in pixels');
    });
  });
});
