/**
 * PremultControl E2E Integration Tests
 *
 * Verifies the full wiring of the PremultControl feature end-to-end:
 *   UI (PremultControl) -> event (premultChanged) -> wireColorControls ->
 *   Viewer.setPremultMode -> ViewerGLRenderer.setPremultMode -> Renderer.setPremultMode ->
 *   ShaderStateManager.setPremultMode -> u_premult uniform in fragment shader
 *
 * Tests cover:
 * - PremultControl instantiation and rendering
 * - Mode cycling (Off -> Premultiply -> Unpremultiply -> Off)
 * - Event emission with correct PremultMode values
 * - wireColorControls wiring: premultChanged -> viewer.setPremultMode
 * - Button label and style updates per mode
 * - Dispose cleanup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PremultControl, type PremultMode } from '../ui/components/PremultControl';
import { wireColorControls } from '../AppColorWiring';
import { EventEmitter } from '../utils/EventEmitter';

// ---------------------------------------------------------------------------
// Lightweight stubs (same pattern as AppColorWiring.test.ts)
// ---------------------------------------------------------------------------

class StubColorInversionToggle extends EventEmitter {}
class StubColorControls extends EventEmitter {
  private adjustments = { exposure: 0, contrast: 0, saturation: 1 };
  getAdjustments() { return { ...this.adjustments }; }
  setAdjustments(adj: Record<string, number>) { this.adjustments = { ...adj } as any; }
}
class StubCDLControl extends EventEmitter {}
class StubCurvesControl extends EventEmitter {}
class StubOCIOControl extends EventEmitter {
  private _processor = {
    bakeTo3DLUT: vi.fn(() => new Float32Array(33 * 33 * 33 * 3)),
  };
  getProcessor() { return this._processor; }
}
class StubDisplayProfileControl extends EventEmitter {}
class StubGamutMappingControl extends EventEmitter {}
class StubLUTPipelinePanel extends EventEmitter {}

function createMockViewer() {
  return {
    setColorInversion: vi.fn(),
    setColorAdjustments: vi.fn(),
    setLUT: vi.fn(),
    setLUTIntensity: vi.fn(),
    setCDL: vi.fn(),
    setCurves: vi.fn(),
    setOCIOBakedLUT: vi.fn(),
    setDisplayColorState: vi.fn(),
    setGamutMappingState: vi.fn(),
    setPremultMode: vi.fn(),
    syncLUTPipeline: vi.fn(),
  };
}

function createMockSessionBridge() {
  return { scheduleUpdateScopes: vi.fn() };
}

function createMockPersistenceManager() {
  return { syncGTOStore: vi.fn() };
}

/**
 * Build a full wiring context that uses a **real** PremultControl instance
 * so the event flow is exercised end-to-end through the actual EventEmitter.
 */
function createWiringContext() {
  const premultControl = new PremultControl();
  const colorInversionToggle = new StubColorInversionToggle();
  const colorControls = new StubColorControls();
  const cdlControl = new StubCDLControl();
  const curvesControl = new StubCurvesControl();
  const ocioControl = new StubOCIOControl();
  const displayProfileControl = new StubDisplayProfileControl();
  const gamutMappingControl = new StubGamutMappingControl();
  const lutPipelinePanel = new StubLUTPipelinePanel();
  const viewer = createMockViewer();
  const sessionBridge = createMockSessionBridge();
  const persistenceManager = createMockPersistenceManager();
  const gamutDiagram = { setColorSpaces: vi.fn() };

  const controls = {
    colorInversionToggle,
    colorControls,
    cdlControl,
    curvesControl,
    ocioControl,
    displayProfileControl,
    gamutMappingControl,
    lutPipelinePanel,
    premultControl,
    gamutDiagram,
  };

  return {
    viewer: viewer as any,
    controls: controls as any,
    sessionBridge: sessionBridge as any,
    persistenceManager: persistenceManager as any,
    session: {} as any,
    paintEngine: {} as any,
    headerBar: {} as any,
    tabBar: {} as any,
    // Typed references for assertions
    _viewer: viewer,
    _sessionBridge: sessionBridge,
    _premultControl: premultControl,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PremultControl E2E Integration', () => {
  // =========================================================================
  // 1. Component instantiation and rendering
  // =========================================================================
  describe('instantiation and rendering', () => {
    let control: PremultControl;

    beforeEach(() => {
      control = new PremultControl();
    });

    afterEach(() => {
      control.dispose();
    });

    it('PREMULT-E2E-001: can be instantiated without errors', () => {
      expect(control).toBeInstanceOf(PremultControl);
    });

    it('PREMULT-E2E-002: render() returns an HTMLElement', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('PREMULT-E2E-003: renders a button with data-testid="premult-control"', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="premult-control"]');
      expect(button).not.toBeNull();
      expect(button!.tagName).toBe('BUTTON');
    });

    it('PREMULT-E2E-004: renders with initial label "Off"', () => {
      const el = control.render();
      const label = el.querySelector('[data-testid="premult-label"]');
      expect(label).not.toBeNull();
      expect(label!.textContent).toBe('Off');
    });

    it('PREMULT-E2E-005: initial mode is 0 (Off)', () => {
      expect(control.getMode()).toBe(0);
    });

    it('PREMULT-E2E-006: button has proper ARIA label for accessibility', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="premult-control"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-label')).toBe('Alpha Premultiply Mode');
    });
  });

  // =========================================================================
  // 2. Mode cycling
  // =========================================================================
  describe('mode cycling', () => {
    let control: PremultControl;

    beforeEach(() => {
      control = new PremultControl();
    });

    afterEach(() => {
      control.dispose();
    });

    it('PREMULT-E2E-010: cycle() advances Off -> Premultiply -> Unpremultiply -> Off', () => {
      expect(control.getMode()).toBe(0);

      control.cycle();
      expect(control.getMode()).toBe(1);

      control.cycle();
      expect(control.getMode()).toBe(2);

      control.cycle();
      expect(control.getMode()).toBe(0);
    });

    it('PREMULT-E2E-011: clicking the button cycles through modes', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="premult-control"]') as HTMLButtonElement;

      button.click();
      expect(control.getMode()).toBe(1);

      button.click();
      expect(control.getMode()).toBe(2);

      button.click();
      expect(control.getMode()).toBe(0);
    });

    it('PREMULT-E2E-012: setMode() sets a specific mode without cycling', () => {
      control.setMode(2);
      expect(control.getMode()).toBe(2);

      control.setMode(0);
      expect(control.getMode()).toBe(0);
    });

    it('PREMULT-E2E-013: setMode() with same value does not emit event', () => {
      const callback = vi.fn();
      control.on('premultChanged', callback);

      control.setMode(0); // already 0
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. Event emission
  // =========================================================================
  describe('event emission', () => {
    let control: PremultControl;

    beforeEach(() => {
      control = new PremultControl();
    });

    afterEach(() => {
      control.dispose();
    });

    it('PREMULT-E2E-020: emits premultChanged with mode 1 on first cycle', () => {
      const callback = vi.fn();
      control.on('premultChanged', callback);

      control.cycle();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(1);
    });

    it('PREMULT-E2E-021: emits premultChanged with mode 2 on second cycle', () => {
      const callback = vi.fn();
      control.on('premultChanged', callback);

      control.cycle(); // 0 -> 1
      control.cycle(); // 1 -> 2

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith(2);
    });

    it('PREMULT-E2E-022: emits premultChanged with mode 0 on third cycle', () => {
      const callback = vi.fn();
      control.on('premultChanged', callback);

      control.cycle(); // 0 -> 1
      control.cycle(); // 1 -> 2
      control.cycle(); // 2 -> 0

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenLastCalledWith(0);
    });

    it('PREMULT-E2E-023: emitted values are valid PremultMode values (0, 1, or 2)', () => {
      const values: PremultMode[] = [];
      control.on('premultChanged', (mode) => values.push(mode));

      control.cycle();
      control.cycle();
      control.cycle();

      expect(values).toEqual([1, 2, 0]);
      for (const v of values) {
        expect([0, 1, 2]).toContain(v);
      }
    });

    it('PREMULT-E2E-024: setMode() emits premultChanged with the target mode', () => {
      const callback = vi.fn();
      control.on('premultChanged', callback);

      control.setMode(2);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(2);
    });

    it('PREMULT-E2E-025: button click emits premultChanged event', () => {
      const callback = vi.fn();
      control.on('premultChanged', callback);
      const el = control.render();
      const button = el.querySelector('[data-testid="premult-control"]') as HTMLButtonElement;

      button.click();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(1);
    });
  });

  // =========================================================================
  // 4. Label and style updates
  // =========================================================================
  describe('label and style updates', () => {
    let control: PremultControl;

    beforeEach(() => {
      control = new PremultControl();
    });

    afterEach(() => {
      control.dispose();
    });

    it('PREMULT-E2E-030: label updates to "Premultiply" when mode is 1', () => {
      const el = control.render();
      control.setMode(1);
      const label = el.querySelector('[data-testid="premult-label"]');
      expect(label!.textContent).toBe('Premultiply');
    });

    it('PREMULT-E2E-031: label updates to "Unpremultiply" when mode is 2', () => {
      const el = control.render();
      control.setMode(2);
      const label = el.querySelector('[data-testid="premult-label"]');
      expect(label!.textContent).toBe('Unpremultiply');
    });

    it('PREMULT-E2E-032: label resets to "Off" when mode returns to 0', () => {
      const el = control.render();
      control.setMode(1);
      control.setMode(0);
      const label = el.querySelector('[data-testid="premult-label"]');
      expect(label!.textContent).toBe('Off');
    });

    it('PREMULT-E2E-033: button gets accent styling when mode is active (1 or 2)', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="premult-control"]') as HTMLButtonElement;

      control.setMode(1);
      expect(button.style.borderColor).toBe('var(--accent-primary)');
      expect(button.style.color).toBe('var(--accent-primary)');

      control.setMode(2);
      expect(button.style.borderColor).toBe('var(--accent-primary)');
      expect(button.style.color).toBe('var(--accent-primary)');
    });

    it('PREMULT-E2E-034: button reverts to muted styling when mode is Off', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="premult-control"]') as HTMLButtonElement;

      control.setMode(1); // active
      control.setMode(0); // back to off

      expect(button.style.borderColor).toBe('transparent');
      expect(button.style.color).toBe('var(--text-muted)');
      expect(button.style.background).toBe('transparent');
    });
  });

  // =========================================================================
  // 5. Full wiring: PremultControl -> wireColorControls -> viewer
  // =========================================================================
  describe('wireColorControls integration', () => {
    let ctx: ReturnType<typeof createWiringContext>;

    beforeEach(() => {
      ctx = createWiringContext();
    });

    afterEach(() => {
      ctx._premultControl.dispose();
    });

    it('PREMULT-E2E-040: premultChanged event calls viewer.setPremultMode with correct mode', () => {
      wireColorControls(ctx as any);

      ctx._premultControl.setMode(1);

      expect(ctx._viewer.setPremultMode).toHaveBeenCalledTimes(1);
      expect(ctx._viewer.setPremultMode).toHaveBeenCalledWith(1);
    });

    it('PREMULT-E2E-041: premultChanged event triggers sessionBridge.scheduleUpdateScopes', () => {
      wireColorControls(ctx as any);

      ctx._premultControl.setMode(2);

      expect(ctx._sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
    });

    it('PREMULT-E2E-042: cycling through all modes calls viewer.setPremultMode for each', () => {
      wireColorControls(ctx as any);

      ctx._premultControl.cycle(); // 0 -> 1
      ctx._premultControl.cycle(); // 1 -> 2
      ctx._premultControl.cycle(); // 2 -> 0

      expect(ctx._viewer.setPremultMode).toHaveBeenCalledTimes(3);
      expect(ctx._viewer.setPremultMode).toHaveBeenNthCalledWith(1, 1);
      expect(ctx._viewer.setPremultMode).toHaveBeenNthCalledWith(2, 2);
      expect(ctx._viewer.setPremultMode).toHaveBeenNthCalledWith(3, 0);
    });

    it('PREMULT-E2E-043: button click flows through to viewer.setPremultMode', () => {
      wireColorControls(ctx as any);

      const el = ctx._premultControl.render();
      const button = el.querySelector('[data-testid="premult-control"]') as HTMLButtonElement;
      button.click();

      expect(ctx._viewer.setPremultMode).toHaveBeenCalledTimes(1);
      expect(ctx._viewer.setPremultMode).toHaveBeenCalledWith(1);
    });

    it('PREMULT-E2E-044: scheduleUpdateScopes called on every mode change', () => {
      wireColorControls(ctx as any);

      ctx._premultControl.cycle();
      ctx._premultControl.cycle();
      ctx._premultControl.cycle();

      // Each mode change should schedule scope updates
      expect(ctx._sessionBridge.scheduleUpdateScopes).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // 6. Dispose and cleanup
  // =========================================================================
  describe('dispose', () => {
    it('PREMULT-E2E-050: dispose removes event listeners (no events emitted after dispose)', () => {
      const control = new PremultControl();
      const callback = vi.fn();
      control.on('premultChanged', callback);

      control.dispose();

      // After dispose, cycling should not trigger the listener
      // (setMode still changes internal state, but removeAllListeners was called)
      control.cycle();
      expect(callback).not.toHaveBeenCalled();
    });

    it('PREMULT-E2E-051: dispose can be called multiple times without error', () => {
      const control = new PremultControl();
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });

    it('PREMULT-E2E-052: after dispose, button click does not emit events', () => {
      const control = new PremultControl();
      const callback = vi.fn();
      control.on('premultChanged', callback);
      const el = control.render();
      const button = el.querySelector('[data-testid="premult-control"]') as HTMLButtonElement;

      control.dispose();
      button.click();

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
