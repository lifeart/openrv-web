import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from '../../utils/EventEmitter';
import { createPanel } from '../../ui/components/shared/Panel';
import { buildViewTab } from './buildViewTab';

function createRenderable() {
  return {
    render: vi.fn(() => document.createElement('div')),
  };
}

function createToggleOverlay() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    toggle: vi.fn(),
  });
}

function createTestDeps() {
  const infoStripOverlay = createToggleOverlay();
  const spotlightOverlay = createToggleOverlay();
  const exrWindowOverlay = createToggleOverlay();
  const fpsOverlay = createToggleOverlay();

  const registry = {
    zoomControl: createRenderable(),
    channelSelect: createRenderable(),
    compareControl: createRenderable(),
    layoutControl: createRenderable(),
    stereoControl: createRenderable(),
    stereoEyeTransformControl: createRenderable(),
    stereoAlignControl: createRenderable(),
    stackControl: createRenderable(),
    parControl: createRenderable(),
    backgroundPatternControl: createRenderable(),
    ghostFrameControl: createRenderable(),
    convergenceMeasure: Object.assign(new EventEmitter(), {
      isEnabled: vi.fn(() => false),
      setEnabled: vi.fn(),
      on: EventEmitter.prototype.on,
    }),
    floatingWindowControl: Object.assign(new EventEmitter(), {
      detect: vi.fn(),
      formatResult: vi.fn(() => 'ok'),
      on: EventEmitter.prototype.on,
    }),
    referenceManager: Object.assign(new EventEmitter(), {
      captureReference: vi.fn(),
      enable: vi.fn(),
      toggle: vi.fn(),
      on: EventEmitter.prototype.on,
    }),
    sphericalProjection: (() => {
      const listeners = new Set<(enabled: boolean) => void>();
      return {
        enabled: false,
        enable: vi.fn(function (this: { enabled: boolean }) {
          this.enabled = true;
          for (const l of listeners) l(true);
        }),
        disable: vi.fn(function (this: { enabled: boolean }) {
          this.enabled = false;
          for (const l of listeners) l(false);
        }),
        onEnabledChange: vi.fn((listener: (enabled: boolean) => void) => {
          listeners.add(listener);
          return () => { listeners.delete(listener); };
        }),
        getProjectionUniforms: vi.fn(() => ({
          u_sphericalEnabled: 0,
          u_fov: 90,
          u_aspect: 1,
          u_yaw: 0,
          u_pitch: 0,
        })),
      };
    })(),
  } as any;

  const viewer = {
    getStereoPair: vi.fn(() => null),
    getImageData: vi.fn(() => null),
    setReferenceImage: vi.fn(),
    getDisplayWidth: vi.fn(() => 1920),
    getDisplayHeight: vi.fn(() => 1080),
    setSphericalProjectionRef: vi.fn(),
    setSphericalProjection: vi.fn(),
    getMissingFrameMode: vi.fn(() => 'off'),
    setMissingFrameMode: vi.fn(),
    getSpotlightOverlay: vi.fn(() => spotlightOverlay),
    getEXRWindowOverlay: vi.fn(() => exrWindowOverlay),
    getInfoStripOverlay: vi.fn(() => infoStripOverlay),
    getFPSIndicator: vi.fn(() => fpsOverlay),
  } as any;

  const timelineEditorPanel = createPanel();

  const unsubscribers: Array<() => void> = [];
  const addUnsubscriber = (unsub: () => void) => {
    unsubscribers.push(unsub);
  };

  return { registry, viewer, timelineEditorPanel, addUnsubscriber, unsubscribers, infoStripOverlay };
}

describe('buildViewTab', () => {
  it('adds an info strip toggle button wired to the overlay', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);

    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="info-strip-toggle-btn"]');
    expect(button).not.toBeNull();

    button!.click();
    expect(deps.infoStripOverlay.toggle).toHaveBeenCalledOnce();
  });

  describe('Timeline editor button active state sync', () => {
    it('button becomes active when panel is shown via toggle', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);
      const button = result.element.querySelector<HTMLButtonElement>('[data-testid="timeline-editor-toggle-button"]')!;

      button.click();
      expect(button.classList.contains('active')).toBe(true);
    });

    it('button becomes inactive when panel is closed via toggle', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);
      const button = result.element.querySelector<HTMLButtonElement>('[data-testid="timeline-editor-toggle-button"]')!;

      button.click(); // open
      button.click(); // close
      expect(button.classList.contains('active')).toBe(false);
    });

    it('button becomes inactive when panel is closed via Escape', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);
      const button = result.element.querySelector<HTMLButtonElement>('[data-testid="timeline-editor-toggle-button"]')!;

      button.click(); // open
      expect(button.classList.contains('active')).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(button.classList.contains('active')).toBe(false);
    });

    it('button becomes inactive when panel is closed via outside click', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);
      const button = result.element.querySelector<HTMLButtonElement>('[data-testid="timeline-editor-toggle-button"]')!;

      button.click(); // open
      expect(button.classList.contains('active')).toBe(true);

      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(button.classList.contains('active')).toBe(false);
    });
  });

  describe('Spherical projection button state sync', () => {
    it('button becomes active when spherical projection is enabled externally (e.g. 360 source loaded)', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);
      const button = result.element.querySelector<HTMLButtonElement>('[data-testid="spherical-projection-btn"]')!;

      expect(button.classList.contains('active')).toBe(false);

      // Simulate external enable (like LayoutOrchestrator auto-detecting 360 content)
      deps.registry.sphericalProjection.enable();

      expect(button.classList.contains('active')).toBe(true);
    });

    it('button becomes inactive when spherical projection is disabled externally (e.g. normal source loaded)', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);
      const button = result.element.querySelector<HTMLButtonElement>('[data-testid="spherical-projection-btn"]')!;

      // Enable first
      deps.registry.sphericalProjection.enable();
      expect(button.classList.contains('active')).toBe(true);

      // Then disable externally (like loading a non-360 source)
      deps.registry.sphericalProjection.disable();
      expect(button.classList.contains('active')).toBe(false);
    });

    it('manual toggle via click still updates the button state', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);
      const button = result.element.querySelector<HTMLButtonElement>('[data-testid="spherical-projection-btn"]')!;

      // Click to enable
      button.click();
      expect(button.classList.contains('active')).toBe(true);

      // Click to disable
      button.click();
      expect(button.classList.contains('active')).toBe(false);
    });
  });
});
