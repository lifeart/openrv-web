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
  let state = {
    enabled: false,
    imageUrl: null as string | null,
    showFullPath: false,
    showDataWindow: true,
    showDisplayWindow: true,
    dataWindowColor: '#00ff00',
    displayWindowColor: '#00ccff',
    lineWidth: 2,
    dashPattern: [6, 4] as [number, number],
    showLabels: true,
    position: 'top-left',
    fontSize: 'medium',
    showFrameCounter: true,
    backgroundOpacity: 0.6,
    showDroppedFrames: true,
    showTargetFps: true,
    warningThreshold: 0.97,
    criticalThreshold: 0.85,
  };
  return Object.assign(emitter, {
    toggle: vi.fn(),
    getState: vi.fn(() => ({ ...state })),
    hasImage: vi.fn(() => state.imageUrl !== null),
    loadImage: vi.fn(async (imageUrl) => {
      state = { ...state, imageUrl, enabled: true };
    }),
    removeImage: vi.fn(() => {
      state = { ...state, imageUrl: null, enabled: false };
    }),
    setShowFullPath: vi.fn((showFullPath) => {
      state = { ...state, showFullPath };
    }),
    setShowDataWindow: vi.fn((showDataWindow) => {
      state = { ...state, showDataWindow };
    }),
    setShowDisplayWindow: vi.fn((showDisplayWindow) => {
      state = { ...state, showDisplayWindow };
    }),
    setShowLabels: vi.fn((showLabels) => {
      state = { ...state, showLabels };
    }),
    setDataWindowColor: vi.fn((dataWindowColor) => {
      state = { ...state, dataWindowColor };
    }),
    setDisplayWindowColor: vi.fn((displayWindowColor) => {
      state = { ...state, displayWindowColor };
    }),
    setLineWidth: vi.fn((lineWidth) => {
      state = { ...state, lineWidth };
    }),
    setDashPattern: vi.fn((dashPattern) => {
      state = { ...state, dashPattern };
    }),
    setPosition: vi.fn((position) => {
      state = { ...state, position };
    }),
    setFontSize: vi.fn((fontSize) => {
      state = { ...state, fontSize };
    }),
    setShowFrameCounter: vi.fn((showFrameCounter) => {
      state = { ...state, showFrameCounter };
    }),
    setBackgroundOpacity: vi.fn((backgroundOpacity) => {
      state = { ...state, backgroundOpacity };
    }),
    setState: vi.fn((partial) => {
      state = { ...state, ...partial };
    }),
  });
}

function createMatteOverlay() {
  const emitter = new EventEmitter();
  let settings = {
    show: false,
    aspect: 1.78,
    opacity: 0.66,
    heightVisible: -1,
    centerPoint: [0, 0] as [number, number],
  };

  return Object.assign(emitter, {
    toggle: vi.fn(() => {
      settings = { ...settings, show: !settings.show };
    }),
    getSettings: vi.fn(() => ({ ...settings, centerPoint: [...settings.centerPoint] as [number, number] })),
    setAspect: vi.fn((aspect) => {
      settings = { ...settings, aspect };
    }),
    setOpacity: vi.fn((opacity) => {
      settings = { ...settings, opacity };
    }),
    setCenterPoint: vi.fn((x, y) => {
      settings = { ...settings, centerPoint: [x, y] };
    }),
  });
}

function createTestDeps() {
  const bugOverlay = createToggleOverlay();
  const matteOverlay = createMatteOverlay();
  const infoStripOverlay = createToggleOverlay();
  const spotlightOverlay = createToggleOverlay();
  const exrWindowOverlay = createToggleOverlay();
  const fpsOverlay = createToggleOverlay();
  const timecodeOverlay = createToggleOverlay();

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
    getBugOverlay: vi.fn(() => bugOverlay),
    getMatteOverlay: vi.fn(() => matteOverlay),
    getSpotlightOverlay: vi.fn(() => spotlightOverlay),
    getEXRWindowOverlay: vi.fn(() => exrWindowOverlay),
    getInfoStripOverlay: vi.fn(() => infoStripOverlay),
    getTimecodeOverlay: vi.fn(() => timecodeOverlay),
    getFPSIndicator: vi.fn(() => fpsOverlay),
  } as any;

  const timelineEditorPanel = createPanel();

  const unsubscribers: Array<() => void> = [];
  const addUnsubscriber = (unsub: () => void) => {
    unsubscribers.push(unsub);
  };

  return {
    registry,
    viewer,
    timelineEditorPanel,
    addUnsubscriber,
    unsubscribers,
    bugOverlay,
    matteOverlay,
    infoStripOverlay,
    timecodeOverlay,
  };
}

describe('buildViewTab', () => {
  it('adds a matte overlay toggle button wired to the overlay', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);

    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="matte-overlay-toggle-btn"]');
    expect(button).not.toBeNull();

    button!.click();
    expect(deps.matteOverlay.toggle).toHaveBeenCalledOnce();
  });

  it('opens the matte overlay settings menu on right-click', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);
    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="matte-overlay-toggle-btn"]')!;

    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 14, clientY: 26 }));

    const menu = document.querySelector('.matte-overlay-settings-menu');
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute('aria-label')).toBe('Matte Overlay settings');
  });

  it('opens the bug overlay settings menu when the button is clicked without an image', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);

    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="bug-overlay-toggle-btn"]');
    expect(button).not.toBeNull();

    button!.click();

    const menu = document.querySelector('.bug-overlay-settings-menu');
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute('aria-label')).toBe('Bug Overlay settings');
    expect(deps.bugOverlay.toggle).not.toHaveBeenCalled();
  });

  it('toggles the bug overlay when an image is already loaded', async () => {
    const deps = createTestDeps();
    await deps.bugOverlay.loadImage('data:image/png;base64,Zm9v');

    const result = buildViewTab(deps);
    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="bug-overlay-toggle-btn"]');
    expect(button).not.toBeNull();

    button!.click();
    expect(deps.bugOverlay.toggle).toHaveBeenCalledOnce();
  });

  it('opens the bug overlay settings menu on right-click', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);
    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="bug-overlay-toggle-btn"]')!;

    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 22 }));

    const menu = document.querySelector('.bug-overlay-settings-menu');
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute('aria-label')).toBe('Bug Overlay settings');
  });

  it('adds an info strip toggle button wired to the overlay', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);

    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="info-strip-toggle-btn"]');
    expect(button).not.toBeNull();

    button!.click();
    expect(deps.infoStripOverlay.toggle).toHaveBeenCalledOnce();
  });

  it('opens the EXR window settings menu on right-click', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);
    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="exr-window-overlay-toggle-btn"]')!;

    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 8, clientY: 16 }));

    const menu = document.querySelector('.exr-window-overlay-settings-menu');
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute('aria-label')).toBe('EXR Window Overlay settings');
  });

  it('opens the info strip settings menu on right-click', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);
    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="info-strip-toggle-btn"]')!;

    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 12, clientY: 24 }));

    const menu = document.querySelector('.info-strip-settings-menu');
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute('aria-label')).toBe('Info Strip settings');
  });

  it('adds a timecode overlay toggle button wired to the overlay', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);

    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="timecode-overlay-toggle-btn"]');
    expect(button).not.toBeNull();

    button!.click();
    expect(deps.timecodeOverlay.toggle).toHaveBeenCalledOnce();
  });

  it('opens the timecode settings menu on right-click', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);
    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="timecode-overlay-toggle-btn"]')!;

    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 }));

    const menu = document.querySelector('.timecode-overlay-settings-menu');
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute('aria-label')).toBe('Timecode Overlay settings');
  });

  it('opens the FPS settings menu on right-click', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);
    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="fps-indicator-toggle-btn"]')!;

    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 30 }));

    const menu = document.querySelector('.fps-indicator-settings-menu');
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute('aria-label')).toBe('FPS Indicator settings');
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
