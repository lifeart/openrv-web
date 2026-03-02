import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from '../../utils/EventEmitter';
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

describe('buildViewTab', () => {
  it('adds an info strip toggle button wired to the overlay', () => {
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
      sphericalProjection: {
        enabled: false,
        enable: vi.fn(),
        disable: vi.fn(),
        getProjectionUniforms: vi.fn(() => ({
          u_sphericalEnabled: 0,
          u_fov: 90,
          u_aspect: 1,
          u_yaw: 0,
          u_pitch: 0,
        })),
      },
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

    const result = buildViewTab({
      registry,
      viewer,
      timelineEditorPanel: {
        toggle: vi.fn(),
        isVisible: vi.fn(() => false),
      } as any,
      addUnsubscriber: vi.fn(),
    });

    const button = result.element.querySelector<HTMLButtonElement>('[data-testid="info-strip-toggle-btn"]');
    expect(button).not.toBeNull();

    button!.click();
    expect(infoStripOverlay.toggle).toHaveBeenCalledOnce();
  });
});
