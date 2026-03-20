import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from '../../utils/EventEmitter';
import { buildQCTab } from './buildQCTab';
import type { BuildQCTabDeps } from './buildQCTab';

// Mock ContextToolbar to avoid DOM dependencies
vi.mock('../../ui/components/layout/ContextToolbar', () => ({
  ContextToolbar: {
    createIconButton: (_icon: string, cb: () => void, _opts?: object) => {
      const btn = document.createElement('button');
      btn.dataset.testid = 'mock-icon-button';
      btn.addEventListener('click', cb);
      return btn;
    },
    createDivider: () => document.createElement('div'),
  },
}));

// Mock setButtonActive
vi.mock('../../ui/components/shared/Button', () => ({
  setButtonActive: vi.fn(),
  applyHoverEffect: vi.fn(),
}));

function createMockDeps() {
  const pixelProbe = Object.assign(new EventEmitter(), {
    toggle: vi.fn(),
  });

  const falseColor = Object.assign(new EventEmitter(), {});

  const hslQualifier = {
    pickColor: vi.fn(),
  };

  const clippingOverlay = Object.assign(new EventEmitter(), {
    enable: vi.fn(),
    disable: vi.fn(),
    toggle: vi.fn(),
    getState: vi.fn(() => ({
      enabled: false,
      showHighlights: true,
      showShadows: true,
      highlightColor: { r: 255, g: 0, b: 0 },
      shadowColor: { r: 0, g: 100, b: 255 },
      opacity: 0.7,
    })),
    setShowHighlights: vi.fn(),
    setShowShadows: vi.fn(),
    setOpacity: vi.fn(),
  });

  const viewerContainer = document.createElement('div');
  const canvasContainer = document.createElement('div');

  const viewer = {
    getPixelProbe: vi.fn(() => pixelProbe),
    getFalseColor: vi.fn(() => falseColor),
    getHSLQualifier: vi.fn(() => hslQualifier),
    getClippingOverlay: vi.fn(() => clippingOverlay),
    getCanvasContainer: vi.fn(() => canvasContainer),
    getContainer: vi.fn(() => viewerContainer),
    getImageData: vi.fn(() => null) as ReturnType<typeof vi.fn>,
    getPixelCoordinatesFromClient: vi.fn(() => null) as ReturnType<typeof vi.fn>,
    refresh: vi.fn(),
  };

  const histogram = Object.assign(new EventEmitter(), {
    setClippingOverlay: vi.fn(),
  });
  const waveform = Object.assign(new EventEmitter(), {});
  const vectorscope = Object.assign(new EventEmitter(), {});
  const gamutDiagram = Object.assign(new EventEmitter(), {});

  let eyedropperCallback: ((active: boolean) => void) | null = null;
  const hslQualifierControl = {
    render: vi.fn(() => document.createElement('div')),
    setEyedropperCallback: vi.fn((cb: (active: boolean) => void) => {
      eyedropperCallback = cb;
    }),
    deactivateEyedropper: vi.fn(),
  };

  const scopesControl = {
    render: vi.fn(() => document.createElement('div')),
    setScopeVisible: vi.fn(),
  };

  const registry = {
    scopesControl,
    safeAreasControl: { render: vi.fn(() => document.createElement('div')) },
    falseColorControl: { render: vi.fn(() => document.createElement('div')) },
    luminanceVisControl: {
      render: vi.fn(() => document.createElement('div')),
      createBadge: vi.fn(() => document.createElement('div')),
    },
    zebraControl: { render: vi.fn(() => document.createElement('div')) },
    hslQualifierControl,
    histogram,
    waveform,
    vectorscope,
    gamutDiagram,
  };

  const unsubscribers: (() => void)[] = [];
  const addUnsubscriber = (unsub: () => void) => unsubscribers.push(unsub);

  const deps = {
    registry,
    viewer,
    addUnsubscriber,
  } as unknown as BuildQCTabDeps;

  return {
    deps,
    viewer,
    hslQualifier,
    hslQualifierControl,
    clippingOverlay,
    histogram,
    getEyedropperCallback: () => eyedropperCallback,
  };
}

describe('buildQCTab eyedropper coordinate conversion', () => {
  let deps: BuildQCTabDeps;
  let viewer: ReturnType<typeof createMockDeps>['viewer'];
  let hslQualifier: ReturnType<typeof createMockDeps>['hslQualifier'];
  let clippingOverlay: ReturnType<typeof createMockDeps>['clippingOverlay'];
  let histogram: ReturnType<typeof createMockDeps>['histogram'];
  let getEyedropperCallback: () => ((active: boolean) => void) | null;
  let element: HTMLElement;

  beforeEach(() => {
    const mock = createMockDeps();
    deps = mock.deps;
    viewer = mock.viewer;
    hslQualifier = mock.hslQualifier;
    clippingOverlay = mock.clippingOverlay;
    histogram = mock.histogram;
    getEyedropperCallback = mock.getEyedropperCallback;

    element = buildQCTab(deps);
  });

  it('QC-CLIP-001: clipping overlay button toggles the overlay', () => {
    const button = element.querySelector<HTMLButtonElement>('[data-testid="clipping-overlay-toggle"]');
    expect(button).not.toBeNull();

    button!.click();
    expect(clippingOverlay.toggle).toHaveBeenCalledOnce();
  });

  it('QC-CLIP-002: clipping overlay settings menu opens on right-click', () => {
    const button = element.querySelector<HTMLButtonElement>('[data-testid="clipping-overlay-toggle"]')!;

    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }));

    const menu = document.querySelector('.clipping-overlay-settings-menu');
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute('aria-label')).toBe('Clipping Overlay settings');
  });

  it('QC-CLIP-003: histogram clipping toggle still enables and disables overlay', () => {
    histogram.emit('clippingOverlayToggled', true);
    histogram.emit('clippingOverlayToggled', false);

    expect(clippingOverlay.enable).toHaveBeenCalledOnce();
    expect(clippingOverlay.disable).toHaveBeenCalledOnce();
  });

  it('QC-CLIP-004: overlay state syncs back into histogram clipping state', () => {
    clippingOverlay.emit('stateChanged', {
      enabled: true,
      showHighlights: true,
      showShadows: true,
      highlightColor: { r: 255, g: 0, b: 0 },
      shadowColor: { r: 0, g: 100, b: 255 },
      opacity: 0.7,
    });

    expect(histogram.setClippingOverlay).toHaveBeenCalledWith(true);
  });

  it('QC-EYE-001: uses viewer.getPixelCoordinatesFromClient for coordinate conversion', () => {
    // Create a 4x4 image with known pixel data
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    // Set pixel at (2, 1) to red
    const idx = (1 * width + 2) * 4;
    data[idx] = 255; // R
    data[idx + 1] = 0; // G
    data[idx + 2] = 0; // B
    data[idx + 3] = 255; // A

    const imageData = new ImageData(data, width, height);
    viewer.getImageData.mockReturnValue(imageData);
    viewer.getPixelCoordinatesFromClient.mockReturnValue({ x: 2, y: 1 });

    const container = viewer.getContainer();

    // Activate eyedropper
    const callback = getEyedropperCallback()!;
    expect(callback).not.toBeNull();
    callback(true);

    // Simulate click
    const event = new MouseEvent('click', { clientX: 150, clientY: 250 });
    container.dispatchEvent(event);

    // Should have used the correct coordinate conversion method
    expect(viewer.getPixelCoordinatesFromClient).toHaveBeenCalledWith(150, 250);
    expect(hslQualifier.pickColor).toHaveBeenCalledWith(255, 0, 0);
  });

  it('QC-EYE-002: handles out-of-bounds coordinates (getPixelCoordinatesFromClient returns null)', () => {
    const imageData = new ImageData(4, 4);
    viewer.getImageData.mockReturnValue(imageData);
    viewer.getPixelCoordinatesFromClient.mockReturnValue(null);

    const container = viewer.getContainer();

    const callback = getEyedropperCallback()!;
    callback(true);

    const event = new MouseEvent('click', { clientX: -10, clientY: -10 });
    container.dispatchEvent(event);

    expect(viewer.getPixelCoordinatesFromClient).toHaveBeenCalledWith(-10, -10);
    expect(hslQualifier.pickColor).not.toHaveBeenCalled();
  });

  it('QC-EYE-003: handles zoomed viewer state (coordinates mapped correctly)', () => {
    const width = 100;
    const height = 100;
    const data = new Uint8ClampedArray(width * height * 4);
    // Set pixel at (50, 50) to green
    const idx = (50 * width + 50) * 4;
    data[idx] = 0;
    data[idx + 1] = 128;
    data[idx + 2] = 0;
    data[idx + 3] = 255;

    const imageData = new ImageData(data, width, height);
    viewer.getImageData.mockReturnValue(imageData);
    // Simulate 2x zoom: small client coords map to larger image coords
    viewer.getPixelCoordinatesFromClient.mockReturnValue({ x: 50, y: 50 });

    const container = viewer.getContainer();

    const callback = getEyedropperCallback()!;
    callback(true);

    const event = new MouseEvent('click', { clientX: 25, clientY: 25 });
    container.dispatchEvent(event);

    expect(viewer.getPixelCoordinatesFromClient).toHaveBeenCalledWith(25, 25);
    expect(hslQualifier.pickColor).toHaveBeenCalledWith(0, 128, 0);
  });

  it('QC-EYE-004: handles panned viewer state (coordinates mapped correctly)', () => {
    const width = 200;
    const height = 200;
    const data = new Uint8ClampedArray(width * height * 4);
    // Set pixel at (10, 10) to blue
    const idx = (10 * width + 10) * 4;
    data[idx] = 0;
    data[idx + 1] = 0;
    data[idx + 2] = 255;
    data[idx + 3] = 255;

    const imageData = new ImageData(data, width, height);
    viewer.getImageData.mockReturnValue(imageData);
    // Panned: client coords map to different image coords
    viewer.getPixelCoordinatesFromClient.mockReturnValue({ x: 10, y: 10 });

    const container = viewer.getContainer();

    const callback = getEyedropperCallback()!;
    callback(true);

    const event = new MouseEvent('click', { clientX: 500, clientY: 500 });
    container.dispatchEvent(event);

    expect(viewer.getPixelCoordinatesFromClient).toHaveBeenCalledWith(500, 500);
    expect(hslQualifier.pickColor).toHaveBeenCalledWith(0, 0, 255);
  });

  it('QC-EYE-005: does not use querySelector("canvas") for coordinate mapping', () => {
    // Ensure we are not using the old pattern of querySelector('canvas')
    const container = viewer.getContainer();
    const querySelectorSpy = vi.spyOn(container, 'querySelector');

    const imageData = new ImageData(4, 4);
    viewer.getImageData.mockReturnValue(imageData);
    viewer.getPixelCoordinatesFromClient.mockReturnValue({ x: 0, y: 0 });

    const callback = getEyedropperCallback()!;
    callback(true);

    const event = new MouseEvent('click', { clientX: 100, clientY: 100 });
    container.dispatchEvent(event);

    // querySelector should not be called with 'canvas' for coordinate mapping
    expect(querySelectorSpy).not.toHaveBeenCalledWith('canvas');
    querySelectorSpy.mockRestore();
  });

  it('QC-EYE-006: rejects coordinates outside image dimensions', () => {
    const width = 100;
    const height = 100;
    const imageData = new ImageData(width, height);
    viewer.getImageData.mockReturnValue(imageData);
    // Return coords that are outside the image bounds
    viewer.getPixelCoordinatesFromClient.mockReturnValue({ x: 100, y: 100 });

    const container = viewer.getContainer();

    const callback = getEyedropperCallback()!;
    callback(true);

    const event = new MouseEvent('click', { clientX: 150, clientY: 150 });
    container.dispatchEvent(event);

    // x=100 is >= imageData.width=100, so pickColor should not be called
    expect(hslQualifier.pickColor).not.toHaveBeenCalled();
  });
});
