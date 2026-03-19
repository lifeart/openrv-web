import { afterEach, describe, expect, it, vi } from 'vitest';
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

function createSpotlightOverlay() {
  const emitter = new EventEmitter();
  let state = {
    enabled: false,
    shape: 'circle' as const,
    x: 0.5,
    y: 0.5,
    width: 0.2,
    height: 0.2,
    dimAmount: 0.7,
    feather: 0.05,
  };

  return Object.assign(emitter, {
    toggle: vi.fn(() => {
      state = { ...state, enabled: !state.enabled };
    }),
    getState: vi.fn(() => ({ ...state })),
    setShape: vi.fn((shape) => {
      state = { ...state, shape };
    }),
    setPosition: vi.fn((x, y) => {
      state = { ...state, x, y };
    }),
    setSize: vi.fn((width, height) => {
      state = { ...state, width, height };
    }),
    setDimAmount: vi.fn((dimAmount) => {
      state = { ...state, dimAmount };
    }),
    setFeather: vi.fn((feather) => {
      state = { ...state, feather };
    }),
  });
}

function createTestDeps() {
  const bugOverlay = createToggleOverlay();
  const matteOverlay = createMatteOverlay();
  const infoStripOverlay = createToggleOverlay();
  const spotlightOverlay = createSpotlightOverlay();
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
      getState: vi.fn(() => ({
        enabled: false,
        referenceImage: null,
        viewMode: 'split-h',
        opacity: 0.5,
        wipePosition: 0.5,
      })),
      hasReference: vi.fn(() => false),
      captureReference: vi.fn(),
      clearReference: vi.fn(),
      enable: vi.fn(),
      toggle: vi.fn(),
      setViewMode: vi.fn(),
      setOpacity: vi.fn(),
      setWipePosition: vi.fn(),
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
          return () => {
            listeners.delete(listener);
          };
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
  afterEach(() => {
    // Clean up any dropdowns/menus appended to document.body by tests
    document.body.innerHTML = '';
  });

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

  it('highlights the matte overlay button when the overlay is shown', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);
    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="matte-overlay-toggle-btn"]')!;

    expect(button.classList.contains('active')).toBe(false);

    deps.matteOverlay.emit('settingsChanged', {
      show: true,
      aspect: 1.78,
      opacity: 0.66,
      heightVisible: -1,
      centerPoint: [0, 0],
    });
    expect(button.classList.contains('active')).toBe(true);
  });

  it('removes the matte overlay button highlight when the overlay is hidden', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);
    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="matte-overlay-toggle-btn"]')!;

    deps.matteOverlay.emit('settingsChanged', {
      show: true,
      aspect: 1.78,
      opacity: 0.66,
      heightVisible: -1,
      centerPoint: [0, 0],
    });
    expect(button.classList.contains('active')).toBe(true);

    deps.matteOverlay.emit('settingsChanged', {
      show: false,
      aspect: 1.78,
      opacity: 0.66,
      heightVisible: -1,
      centerPoint: [0, 0],
    });
    expect(button.classList.contains('active')).toBe(false);
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

  it('opens the reference comparison settings menu on right-click', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);
    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="toggle-reference-btn"]')!;

    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 18, clientY: 28 }));

    const menu = document.querySelector('.reference-comparison-settings-menu');
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute('aria-label')).toBe('Reference Comparison settings');
  });

  it('adds a spotlight toggle button wired to the overlay', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);
    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="spotlight-toggle-btn"]');
    expect(button).not.toBeNull();

    button!.click();
    expect(deps.viewer.getSpotlightOverlay().toggle).toHaveBeenCalledOnce();
  });

  it('opens the spotlight settings menu on right-click', () => {
    const deps = createTestDeps();

    const result = buildViewTab(deps);
    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="spotlight-toggle-btn"]')!;

    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 22, clientY: 34 }));

    const menu = document.querySelector('.spotlight-overlay-settings-menu');
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute('aria-label')).toBe('Spotlight settings');
  });

  it('passes comparison settings through to the viewer render path', () => {
    const deps = createTestDeps();
    buildViewTab(deps);

    deps.registry.referenceManager.emit('stateChanged', {
      enabled: true,
      referenceImage: {
        width: 2,
        height: 1,
        data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]),
        channels: 4,
        capturedAt: Date.now(),
      },
      viewMode: 'split-v',
      opacity: 0.62,
      wipePosition: 0.3,
    });

    expect(deps.viewer.setReferenceImage).toHaveBeenCalledTimes(1);
    expect(deps.viewer.setReferenceImage).toHaveBeenCalledWith(expect.any(ImageData), 'split-v', 0.62, 0.3, undefined);
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

  describe('Reference view mode dropdown', () => {
    it('renders the reference view mode dropdown', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);

      const container = result.element.querySelector('[data-testid="ref-view-mode-select"]');
      expect(container).not.toBeNull();

      const button = container!.querySelector('button');
      expect(button).not.toBeNull();
      expect(button!.title).toBe('Reference comparison mode');
    });

    it('opens the dropdown on click and lists all view modes', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);

      const container = result.element.querySelector('[data-testid="ref-view-mode-select"]')!;
      const button = container.querySelector('button')!;

      button.click();

      const dropdown = document.querySelector<HTMLElement>('[data-testid="ref-view-mode-dropdown"]')!;
      expect(dropdown.style.display).toBe('flex');

      const options = dropdown.querySelectorAll('button');
      expect(options.length).toBe(5);
      expect(options[0]!.textContent).toBe('Split H');
      expect(options[1]!.textContent).toBe('Split V');
      expect(options[2]!.textContent).toBe('Overlay');
      expect(options[3]!.textContent).toBe('Side by Side');
      expect(options[4]!.textContent).toBe('Toggle');
    });

    it('selects a view mode and calls setViewMode on the reference manager', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);

      const container = result.element.querySelector('[data-testid="ref-view-mode-select"]')!;
      const button = container.querySelector('button')!;
      button.click();

      const dropdown = document.querySelector<HTMLElement>('[data-testid="ref-view-mode-dropdown"]')!;
      const overlayOption = dropdown.querySelector<HTMLButtonElement>('[data-value="overlay"]')!;
      overlayOption.click();

      expect(deps.registry.referenceManager.setViewMode).toHaveBeenCalledWith('overlay');
      expect(dropdown.style.display).toBe('none');
    });
  });

  describe('Reference opacity slider', () => {
    it('renders the opacity slider', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);

      const slider = result.element.querySelector('[data-testid="ref-opacity-slider"]');
      expect(slider).not.toBeNull();
    });

    it('calls setOpacity on the reference manager when changed', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);

      const container = result.element.querySelector<HTMLElement>('[data-testid="ref-opacity-slider"]')!;
      const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
      slider.value = '75';
      slider.dispatchEvent(new Event('input', { bubbles: true }));

      expect(deps.registry.referenceManager.setOpacity).toHaveBeenCalledWith(0.75);
    });

    it('is visible for overlay mode and hidden for split-h mode', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);

      // Default is split-h, so opacity slider should be hidden
      const opacitySlider = result.element.querySelector<HTMLElement>('[data-testid="ref-opacity-slider"]')!;
      expect(opacitySlider.style.display).toBe('none');

      // Switch to overlay mode via dropdown
      const container = result.element.querySelector('[data-testid="ref-view-mode-select"]')!;
      container.querySelector('button')!.click();
      const dropdown = document.querySelector<HTMLElement>('[data-testid="ref-view-mode-dropdown"]')!;
      dropdown.querySelector<HTMLButtonElement>('[data-value="overlay"]')!.click();

      expect(opacitySlider.style.display).toBe('flex');
    });
  });

  describe('Reference wipe position slider', () => {
    it('renders the wipe position slider', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);

      const slider = result.element.querySelector('[data-testid="ref-wipe-slider"]');
      expect(slider).not.toBeNull();
    });

    it('calls setWipePosition on the reference manager when changed', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);

      const container = result.element.querySelector<HTMLElement>('[data-testid="ref-wipe-slider"]')!;
      const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
      slider.value = '30';
      slider.dispatchEvent(new Event('input', { bubbles: true }));

      expect(deps.registry.referenceManager.setWipePosition).toHaveBeenCalledWith(0.3);
    });

    it('is visible for split-h mode and hidden for overlay mode', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);

      // Default is split-h, so wipe slider should be visible
      const wipeSlider = result.element.querySelector<HTMLElement>('[data-testid="ref-wipe-slider"]')!;
      expect(wipeSlider.style.display).toBe('flex');

      // Switch to overlay mode via dropdown
      const container = result.element.querySelector('[data-testid="ref-view-mode-select"]')!;
      container.querySelector('button')!.click();
      const dropdown = document.querySelector<HTMLElement>('[data-testid="ref-view-mode-dropdown"]')!;
      dropdown.querySelector<HTMLButtonElement>('[data-value="overlay"]')!.click();

      expect(wipeSlider.style.display).toBe('none');
    });
  });

  describe('Reference controls sync with external state changes', () => {
    it('updates dropdown label and slider visibility when viewMode changes externally', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);

      const opacitySlider = result.element.querySelector<HTMLElement>('[data-testid="ref-opacity-slider"]')!;
      const wipeSlider = result.element.querySelector<HTMLElement>('[data-testid="ref-wipe-slider"]')!;

      // Initially split-h: wipe visible, opacity hidden
      expect(wipeSlider.style.display).toBe('flex');
      expect(opacitySlider.style.display).toBe('none');

      // Simulate external state change to overlay mode
      deps.registry.referenceManager.emit('stateChanged', {
        enabled: false,
        referenceImage: null,
        viewMode: 'overlay',
        opacity: 0.5,
        wipePosition: 0.5,
      });

      // Now overlay: opacity visible, wipe hidden
      expect(opacitySlider.style.display).toBe('flex');
      expect(wipeSlider.style.display).toBe('none');
    });
  });

  describe('Dropdown cleanup on dispose', () => {
    it('removes the ref-view-mode dropdown from document.body when unsubscribers run', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);

      // Open the dropdown so it gets appended to document.body
      const container = result.element.querySelector('[data-testid="ref-view-mode-select"]')!;
      container.querySelector('button')!.click();

      const dropdown = document.querySelector('[data-testid="ref-view-mode-dropdown"]');
      expect(dropdown).not.toBeNull();
      expect(document.body.contains(dropdown)).toBe(true);

      // Run all unsubscribers (simulates dispose)
      for (const unsub of deps.unsubscribers) unsub();

      expect(document.body.contains(dropdown)).toBe(false);
    });

    it('removes the missing-frame-mode dropdown from document.body when unsubscribers run', () => {
      const deps = createTestDeps();
      const result = buildViewTab(deps);

      // Open the dropdown so it gets appended to document.body
      const container = result.element.querySelector('[data-testid="missing-frame-mode-select"]')!;
      container.querySelector('button')!.click();

      const dropdown = document.querySelector('[data-testid="missing-frame-mode-dropdown"]');
      expect(dropdown).not.toBeNull();
      expect(document.body.contains(dropdown)).toBe(true);

      // Run all unsubscribers (simulates dispose)
      for (const unsub of deps.unsubscribers) unsub();

      expect(document.body.contains(dropdown)).toBe(false);
    });

    it('cleans up dropdowns even if they were never opened', () => {
      const deps = createTestDeps();
      buildViewTab(deps);

      // Run all unsubscribers without ever opening the dropdowns
      // Should not throw
      for (const unsub of deps.unsubscribers) unsub();

      expect(document.querySelector('[data-testid="ref-view-mode-dropdown"]')).toBeNull();
      expect(document.querySelector('[data-testid="missing-frame-mode-dropdown"]')).toBeNull();
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
