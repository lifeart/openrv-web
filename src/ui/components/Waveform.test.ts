import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Waveform } from './Waveform';

const mockProcessor = vi.hoisted(() => ({
  isReady: vi.fn(() => true),
  setPlaybackMode: vi.fn(),
  setImage: vi.fn(),
  setFloatImage: vi.fn(),
  renderWaveform: vi.fn(),
}));

const mockGetSharedScopesProcessor = vi.hoisted(() => vi.fn((): typeof mockProcessor | null => mockProcessor));

vi.mock('../../scopes/WebGLScopes', () => ({
  getSharedScopesProcessor: mockGetSharedScopesProcessor,
}));

describe('Waveform', () => {
  let waveform: Waveform;

  beforeEach(() => {
    waveform = new Waveform();
  });

  describe('initialization', () => {
    it('should create waveform instance', () => {
      expect(waveform).toBeInstanceOf(Waveform);
    });

    it('should start hidden', () => {
      expect(waveform.isVisible()).toBe(false);
    });

    it('should start in luma mode', () => {
      expect(waveform.getMode()).toBe('luma');
    });

    it('should render container element', () => {
      const el = waveform.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toContain('waveform-container');
    });

    it('should have canvas element', () => {
      const el = waveform.render();
      const canvas = el.querySelector('canvas');
      expect(canvas).not.toBeNull();
      expect(canvas?.width).toBe(256);
      expect(canvas?.height).toBe(128);
    });

    it('should have mode button with testid', () => {
      const el = waveform.render();
      const modeButton = el.querySelector('[data-testid="waveform-mode-button"]');
      expect(modeButton).not.toBeNull();
      expect(modeButton?.textContent).toBe('Luma');
    });

    it('should have close button with testid', () => {
      const el = waveform.render();
      const closeButton = el.querySelector('[data-testid="waveform-close-button"]');
      expect(closeButton).not.toBeNull();
      expect(closeButton?.textContent).toBe('×');
    });
  });

  describe('visibility', () => {
    it('should show waveform', () => {
      waveform.show();
      expect(waveform.isVisible()).toBe(true);
    });

    it('should hide waveform', () => {
      waveform.show();
      waveform.hide();
      expect(waveform.isVisible()).toBe(false);
    });

    it('should toggle visibility', () => {
      expect(waveform.isVisible()).toBe(false);
      waveform.toggle();
      expect(waveform.isVisible()).toBe(true);
      waveform.toggle();
      expect(waveform.isVisible()).toBe(false);
    });

    it('should emit visibilityChanged event on show', () => {
      const callback = vi.fn();
      waveform.on('visibilityChanged', callback);
      waveform.show();
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('should emit visibilityChanged event on hide', () => {
      waveform.show();
      const callback = vi.fn();
      waveform.on('visibilityChanged', callback);
      waveform.hide();
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('should not emit event when already visible', () => {
      waveform.show();
      const callback = vi.fn();
      waveform.on('visibilityChanged', callback);
      waveform.show(); // Already visible
      expect(callback).not.toHaveBeenCalled();
    });

    it('should not emit event when already hidden', () => {
      const callback = vi.fn();
      waveform.on('visibilityChanged', callback);
      waveform.hide(); // Already hidden
      expect(callback).not.toHaveBeenCalled();
    });

    it('should update container display style on show', () => {
      const el = waveform.render();
      expect(el.style.display).toBe('none');
      waveform.show();
      expect(el.style.display).toBe('block');
    });

    it('should update container display style on hide', () => {
      waveform.show();
      const el = waveform.render();
      expect(el.style.display).toBe('block');
      waveform.hide();
      expect(el.style.display).toBe('none');
    });
  });

  describe('mode', () => {
    it('should cycle through modes', () => {
      expect(waveform.getMode()).toBe('luma');
      waveform.cycleMode();
      expect(waveform.getMode()).toBe('rgb');
      waveform.cycleMode();
      expect(waveform.getMode()).toBe('parade');
      waveform.cycleMode();
      expect(waveform.getMode()).toBe('ycbcr');
      waveform.cycleMode();
      expect(waveform.getMode()).toBe('luma');
    });

    it('should set mode directly', () => {
      waveform.setMode('parade');
      expect(waveform.getMode()).toBe('parade');
      waveform.setMode('rgb');
      expect(waveform.getMode()).toBe('rgb');
      waveform.setMode('ycbcr');
      expect(waveform.getMode()).toBe('ycbcr');
      waveform.setMode('luma');
      expect(waveform.getMode()).toBe('luma');
    });

    it('should emit modeChanged event on cycle', () => {
      const callback = vi.fn();
      waveform.on('modeChanged', callback);
      waveform.cycleMode();
      expect(callback).toHaveBeenCalledWith('rgb');
    });

    it('should emit modeChanged event on setMode', () => {
      const callback = vi.fn();
      waveform.on('modeChanged', callback);
      waveform.setMode('parade');
      expect(callback).toHaveBeenCalledWith('parade');
    });

    it('should not emit event when setting same mode', () => {
      waveform.setMode('luma'); // Already luma
      const callback = vi.fn();
      waveform.on('modeChanged', callback);
      waveform.setMode('luma');
      expect(callback).not.toHaveBeenCalled();
    });

    it('should update mode button text on cycle', () => {
      const el = waveform.render();
      const modeButton = el.querySelector('[data-testid="waveform-mode-button"]');
      expect(modeButton?.textContent).toBe('Luma');
      waveform.cycleMode();
      expect(modeButton?.textContent).toBe('RGB');
      waveform.cycleMode();
      expect(modeButton?.textContent).toBe('Parade');
      waveform.cycleMode();
      expect(modeButton?.textContent).toBe('YCbCr');
      waveform.cycleMode();
      expect(modeButton?.textContent).toBe('Luma');
    });

    it('should update mode button text on setMode', () => {
      const el = waveform.render();
      const modeButton = el.querySelector('[data-testid="waveform-mode-button"]');
      waveform.setMode('parade');
      expect(modeButton?.textContent).toBe('Parade');
    });
  });

  describe('update', () => {
    it('should accept ImageData for update', () => {
      const imageData = new ImageData(100, 100);
      // Fill with some data
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 128;     // R
        imageData.data[i + 1] = 128; // G
        imageData.data[i + 2] = 128; // B
        imageData.data[i + 3] = 255; // A
      }

      // Should not throw
      expect(() => waveform.update(imageData)).not.toThrow();
    });

    it('should handle empty ImageData', () => {
      const imageData = new ImageData(1, 1);
      expect(() => waveform.update(imageData)).not.toThrow();
    });

    it('should handle large ImageData', () => {
      const imageData = new ImageData(1920, 1080);
      expect(() => waveform.update(imageData)).not.toThrow();
    });
  });

  describe('drawing modes', () => {
    let imageData: ImageData;

    beforeEach(() => {
      // Create a gradient test image
      imageData = new ImageData(100, 100);
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const i = (y * 100 + x) * 4;
          // Horizontal gradient for testing waveform
          const value = Math.floor(x * 255 / 99);
          imageData.data[i] = value;     // R
          imageData.data[i + 1] = value; // G
          imageData.data[i + 2] = value; // B
          imageData.data[i + 3] = 255;   // A
        }
      }
    });

    it('should draw luma waveform', () => {
      waveform.setMode('luma');
      expect(() => waveform.update(imageData)).not.toThrow();
    });

    it('should draw RGB overlay waveform', () => {
      waveform.setMode('rgb');
      expect(() => waveform.update(imageData)).not.toThrow();
    });

    it('should draw parade waveform', () => {
      waveform.setMode('parade');
      expect(() => waveform.update(imageData)).not.toThrow();
    });

    it('should draw correctly with different RGB values', () => {
      // Create image with separate R, G, B regions
      const rgbImage = new ImageData(99, 100);
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 99; x++) {
          const i = (y * 99 + x) * 4;
          if (x < 33) {
            rgbImage.data[i] = 255;     // Red region
            rgbImage.data[i + 1] = 0;
            rgbImage.data[i + 2] = 0;
          } else if (x < 66) {
            rgbImage.data[i] = 0;
            rgbImage.data[i + 1] = 255; // Green region
            rgbImage.data[i + 2] = 0;
          } else {
            rgbImage.data[i] = 0;
            rgbImage.data[i + 1] = 0;
            rgbImage.data[i + 2] = 255; // Blue region
          }
          rgbImage.data[i + 3] = 255;
        }
      }

      waveform.setMode('parade');
      expect(() => waveform.update(rgbImage)).not.toThrow();
    });
  });

  describe('mode change redraw', () => {
    let imageData: ImageData;

    beforeEach(() => {
      // Create simple image data for testing
      imageData = new ImageData(10, 10);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 128;     // R
        imageData.data[i + 1] = 128; // G
        imageData.data[i + 2] = 128; // B
        imageData.data[i + 3] = 255; // A
      }
    });

    it('should store lastImageData when update is called', () => {
      waveform.update(imageData);
      // Verify cycleMode works after update (would fail if lastImageData not stored)
      expect(() => waveform.cycleMode()).not.toThrow();
    });

    it('should redraw when cycleMode is called after update', () => {
      waveform.update(imageData);

      // cycleMode should trigger a redraw internally
      // We verify this by checking mode changed and no error occurred
      waveform.cycleMode();
      expect(waveform.getMode()).toBe('rgb');
    });

    it('should redraw when setMode is called after update', () => {
      waveform.update(imageData);

      // setMode should trigger a redraw internally
      waveform.setMode('parade');
      expect(waveform.getMode()).toBe('parade');
    });

    it('should not throw when cycleMode called without prior update', () => {
      expect(() => waveform.cycleMode()).not.toThrow();
    });

    it('should not throw when setMode called without prior update', () => {
      expect(() => waveform.setMode('rgb')).not.toThrow();
    });

    it('should use stored imageData for subsequent mode changes', () => {
      waveform.update(imageData);

      // Multiple mode changes should all work without throwing
      waveform.cycleMode(); // luma -> rgb
      expect(waveform.getMode()).toBe('rgb');
      waveform.cycleMode(); // rgb -> parade
      expect(waveform.getMode()).toBe('parade');
      waveform.cycleMode(); // parade -> ycbcr
      expect(waveform.getMode()).toBe('ycbcr');
      waveform.cycleMode(); // ycbcr -> luma
      expect(waveform.getMode()).toBe('luma');
    });
  });

  describe('dispose', () => {
    it('should dispose without error', () => {
      expect(() => waveform.dispose()).not.toThrow();
    });

    it('should clear internal references', () => {
      waveform.dispose();
      // Should not throw on further operations
      expect(() => waveform.cycleMode()).not.toThrow();
    });
  });

  describe('pointer events', () => {
    it('should have pointer event listeners attached to container', () => {
      const el = waveform.render();
      // Container should have event listeners (tested through e2e tests)
      expect(el).toBeInstanceOf(HTMLElement);
    });
  });
});

describe('Waveform hi-DPI support', () => {
  let waveform: Waveform;
  let originalDevicePixelRatio: number;

  const setDevicePixelRatio = (value: number) => {
    Object.defineProperty(window, 'devicePixelRatio', {
      value,
      writable: true,
      configurable: true,
    });
  };

  beforeEach(() => {
    originalDevicePixelRatio = window.devicePixelRatio;
  });

  afterEach(() => {
    if (waveform) {
      waveform.dispose();
    }
    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDevicePixelRatio,
      writable: true,
      configurable: true,
    });
  });

  it('WF-060: canvas physical dimensions scale with DPR', () => {
    setDevicePixelRatio(2);
    waveform = new Waveform();
    const el = waveform.render();
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;

    // Physical dimensions should be 2x logical (256x128 -> 512x256)
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(256);
  });

  it('WF-061: canvas CSS dimensions remain at logical size', () => {
    setDevicePixelRatio(2);
    waveform = new Waveform();
    const el = waveform.render();
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;

    // CSS dimensions should remain at logical size
    expect(canvas.style.width).toBe('256px');
    expect(canvas.style.height).toBe('128px');
  });

  it('WF-062: canvas renders correctly at 3x DPR', () => {
    setDevicePixelRatio(3);
    waveform = new Waveform();
    const el = waveform.render();
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;

    expect(canvas.width).toBe(768);
    expect(canvas.height).toBe(384);
  });

  it('WF-063: update works correctly at high DPR', () => {
    setDevicePixelRatio(2);
    waveform = new Waveform();

    const imageData = new ImageData(100, 100);
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 128;
      imageData.data[i + 1] = 128;
      imageData.data[i + 2] = 128;
      imageData.data[i + 3] = 255;
    }

    // Should not throw at high DPR
    expect(() => waveform.update(imageData)).not.toThrow();
  });

  it('WF-064: mode cycling works at high DPR', () => {
    setDevicePixelRatio(2);
    waveform = new Waveform();

    const imageData = new ImageData(100, 100);
    waveform.update(imageData);

    // Cycle through all modes at high DPR
    expect(() => {
      waveform.setMode('luma');
      waveform.setMode('rgb');
      waveform.setMode('parade');
    }).not.toThrow();
  });
});

describe('Waveform GPU rendering', () => {
  let waveform: Waveform;

  beforeEach(() => {
    vi.clearAllMocks();
    waveform = new Waveform();
  });

  afterEach(() => {
    waveform.dispose();
  });

  it('WF-050: update uses GPU rendering when available', () => {
    const imageData = new ImageData(10, 10);
    waveform.update(imageData);

    expect(mockProcessor.setImage).toHaveBeenCalledWith(imageData);
    expect(mockProcessor.renderWaveform).toHaveBeenCalled();
  });

  it('WF-051: GPU rendering uses current mode', () => {
    waveform.setMode('rgb');
    const imageData = new ImageData(10, 10);
    waveform.update(imageData);

    const call = mockProcessor.renderWaveform.mock.calls[0];
    expect(call[1]).toBe('rgb'); // mode parameter
  });

  it('WF-052: GPU rendering respects parade mode', () => {
    waveform.setMode('parade');
    const imageData = new ImageData(10, 10);
    waveform.update(imageData);

    const call = mockProcessor.renderWaveform.mock.calls[0];
    expect(call[1]).toBe('parade');
  });

  it('WF-052b: GPU rendering passes RGB channel and intensity options', () => {
    waveform.setMode('rgb');
    waveform.setChannel('g', false);
    waveform.setIntensity(0.22);
    const imageData = new ImageData(10, 10);
    waveform.update(imageData);

    const call = mockProcessor.renderWaveform.mock.calls[0];
    expect(call[2]).toEqual({
      channels: { r: true, g: false, b: true },
      intensity: 0.22,
    });
  });

  it('WF-052c: channel and intensity controls update GPU options on redraw', () => {
    waveform.setMode('rgb');
    const imageData = new ImageData(10, 10);
    waveform.update(imageData);
    mockProcessor.renderWaveform.mockClear();

    waveform.toggleChannel('r');
    waveform.setIntensity(0.25);

    const lastCall = mockProcessor.renderWaveform.mock.calls.at(-1);
    expect(lastCall?.[2]).toEqual({
      channels: { r: false, g: true, b: true },
      intensity: 0.25,
    });
  });

  it('WF-053: setPlaybackMode updates GPU processor', () => {
    waveform.setPlaybackMode(true);
    const imageData = new ImageData(10, 10);
    waveform.update(imageData);

    expect(mockProcessor.setPlaybackMode).toHaveBeenCalledWith(true);
  });

  it('WF-054: setPlaybackMode(false) updates GPU processor', () => {
    waveform.setPlaybackMode(false);
    const imageData = new ImageData(10, 10);
    waveform.update(imageData);

    expect(mockProcessor.setPlaybackMode).toHaveBeenCalledWith(false);
  });

  it('WF-055: setPlaybackMode is callable without update', () => {
    expect(() => waveform.setPlaybackMode(true)).not.toThrow();
    expect(() => waveform.setPlaybackMode(false)).not.toThrow();
  });
});

describe('Waveform updateFloat', () => {
  let waveform: Waveform;

  beforeEach(() => {
    vi.clearAllMocks();
    waveform = new Waveform();
  });

  afterEach(() => {
    waveform.dispose();
  });

  it('WF-070: updateFloat does not throw with valid float data', () => {
    const floatData = new Float32Array(10 * 10 * 4);
    expect(() => waveform.updateFloat(floatData, 10, 10)).not.toThrow();
  });

  it('WF-071: updateFloat uses GPU setFloatImage when available', () => {
    const floatData = new Float32Array(10 * 10 * 4);
    waveform.updateFloat(floatData, 10, 10);

    expect(mockProcessor.setFloatImage).toHaveBeenCalledWith(floatData, 10, 10);
    expect(mockProcessor.renderWaveform).toHaveBeenCalled();
  });

  it('WF-072: updateFloat sets playback mode on GPU processor', () => {
    waveform.setPlaybackMode(true);
    const floatData = new Float32Array(10 * 10 * 4);
    waveform.updateFloat(floatData, 10, 10);

    expect(mockProcessor.setPlaybackMode).toHaveBeenCalledWith(true);
  });

  it('WF-073: updateFloat preserves HDR values > 1.0', () => {
    const floatData = new Float32Array([3.5, 2.0, 1.5, 1.0]);
    waveform.updateFloat(floatData, 1, 1);

    // setFloatImage should receive the original float data with HDR values
    const call = mockProcessor.setFloatImage.mock.calls[0];
    expect(call![0][0]).toBe(3.5);
    expect(call![0][1]).toBe(2.0);
  });

  it('WF-074: updateFloat uses current waveform mode for rendering', () => {
    waveform.setMode('parade');
    const floatData = new Float32Array(10 * 10 * 4);
    waveform.updateFloat(floatData, 10, 10);

    const call = mockProcessor.renderWaveform.mock.calls[0];
    expect(call![1]).toBe('parade');
  });

  it('WF-074b: updateFloat passes RGB channel and intensity options', () => {
    waveform.setMode('rgb');
    waveform.setChannel('b', false);
    waveform.setIntensity(0.18);
    const floatData = new Float32Array(10 * 10 * 4);
    waveform.updateFloat(floatData, 10, 10);

    const call = mockProcessor.renderWaveform.mock.calls[0];
    expect(call![2]).toEqual({
      channels: { r: true, g: true, b: false },
      intensity: 0.18,
    });
  });

  it('WF-075: updateFloat does not throw when GPU processor is not available', () => {
    // Override to return null (simulating no WebGL2)
    mockGetSharedScopesProcessor.mockReturnValueOnce(null);

    const floatData = new Float32Array(10 * 10 * 4);
    expect(() => waveform.updateFloat(floatData, 10, 10)).not.toThrow();
  });

  it('WF-076: cycleMode redraws from cached HDR float frame', () => {
    const floatData = new Float32Array(10 * 10 * 4);
    waveform.updateFloat(floatData, 10, 10);
    expect(mockProcessor.renderWaveform).toHaveBeenCalledTimes(1);

    waveform.cycleMode(); // luma -> rgb

    expect(waveform.getMode()).toBe('rgb');
    expect(mockProcessor.setFloatImage).toHaveBeenCalledTimes(2);
    expect(mockProcessor.renderWaveform).toHaveBeenCalledTimes(2);
    expect(mockProcessor.renderWaveform.mock.calls[1]![1]).toBe('rgb');
  });

  it('WF-077: channel toggle redraws from cached HDR float frame', () => {
    waveform.setMode('rgb');
    const floatData = new Float32Array(10 * 10 * 4);
    waveform.updateFloat(floatData, 10, 10);
    expect(mockProcessor.renderWaveform).toHaveBeenCalledTimes(1);

    waveform.toggleChannel('r');

    expect(mockProcessor.setFloatImage).toHaveBeenCalledTimes(2);
    expect(mockProcessor.renderWaveform).toHaveBeenCalledTimes(2);
    expect(mockProcessor.renderWaveform.mock.calls[1]![1]).toBe('rgb');
  });
});

describe('Waveform RGB Overlay Controls', () => {
  let waveform: Waveform;

  beforeEach(() => {
    waveform = new Waveform();
  });

  afterEach(() => {
    waveform.dispose();
  });

  describe('RGB channel toggles', () => {
    it('RGBW-001: all channels enabled by default', () => {
      const channels = waveform.getEnabledChannels();
      expect(channels.r).toBe(true);
      expect(channels.g).toBe(true);
      expect(channels.b).toBe(true);
    });

    it('RGBW-002: toggleChannel disables a channel', () => {
      waveform.toggleChannel('r');
      const channels = waveform.getEnabledChannels();
      expect(channels.r).toBe(false);
      expect(channels.g).toBe(true);
      expect(channels.b).toBe(true);
    });

    it('RGBW-003: toggleChannel re-enables a channel', () => {
      waveform.toggleChannel('r');
      waveform.toggleChannel('r');
      const channels = waveform.getEnabledChannels();
      expect(channels.r).toBe(true);
    });

    it('RGBW-004: setChannel sets specific channel state', () => {
      waveform.setChannel('g', false);
      expect(waveform.getEnabledChannels().g).toBe(false);

      waveform.setChannel('g', true);
      expect(waveform.getEnabledChannels().g).toBe(true);
    });

    it('RGBW-005: channel toggle emits channelToggled event', () => {
      const callback = vi.fn();
      waveform.on('channelToggled', callback);

      waveform.toggleChannel('b');

      expect(callback).toHaveBeenCalledWith({ r: true, g: true, b: false });
    });

    it('RGBW-006: multiple channels can be toggled independently', () => {
      waveform.toggleChannel('r');
      waveform.toggleChannel('b');

      const channels = waveform.getEnabledChannels();
      expect(channels.r).toBe(false);
      expect(channels.g).toBe(true);
      expect(channels.b).toBe(false);
    });
  });

  describe('intensity control', () => {
    it('RGBW-010: default intensity is 0.1', () => {
      expect(waveform.getIntensity()).toBe(0.1);
    });

    it('RGBW-011: setIntensity changes trace intensity', () => {
      waveform.setIntensity(0.2);
      expect(waveform.getIntensity()).toBe(0.2);
    });

    it('RGBW-012: intensity is clamped to minimum 0.05', () => {
      waveform.setIntensity(0.01);
      expect(waveform.getIntensity()).toBe(0.05);
    });

    it('RGBW-013: intensity is clamped to maximum 0.3', () => {
      waveform.setIntensity(0.5);
      expect(waveform.getIntensity()).toBe(0.3);
    });

    it('RGBW-014: setIntensity emits intensityChanged event', () => {
      const callback = vi.fn();
      waveform.on('intensityChanged', callback);

      waveform.setIntensity(0.15);

      expect(callback).toHaveBeenCalledWith(0.15);
    });
  });

  describe('RGB controls UI', () => {
    it('RGBW-020: RGB controls container exists', () => {
      const el = waveform.render();
      const controls = el.querySelector('[data-testid="waveform-rgb-controls"]');
      expect(controls).not.toBeNull();
    });

    it('RGBW-021: RGB controls hidden when not in RGB mode', () => {
      const el = waveform.render();
      const controls = el.querySelector('[data-testid="waveform-rgb-controls"]') as HTMLElement;
      expect(controls.style.display).toBe('none');
    });

    it('RGBW-022: RGB controls shown when in RGB mode', () => {
      waveform.setMode('rgb');
      const el = waveform.render();
      const controls = el.querySelector('[data-testid="waveform-rgb-controls"]') as HTMLElement;
      expect(controls.style.display).toBe('flex');
    });

    it('RGBW-023: RGB controls hidden when switching from RGB to parade', () => {
      waveform.setMode('rgb');
      waveform.setMode('parade');
      const el = waveform.render();
      const controls = el.querySelector('[data-testid="waveform-rgb-controls"]') as HTMLElement;
      expect(controls.style.display).toBe('none');
    });

    it('RGBW-024: R channel button exists', () => {
      const el = waveform.render();
      const btn = el.querySelector('[data-testid="waveform-channel-r"]');
      expect(btn).not.toBeNull();
      expect(btn?.textContent).toBe('R');
    });

    it('RGBW-025: G channel button exists', () => {
      const el = waveform.render();
      const btn = el.querySelector('[data-testid="waveform-channel-g"]');
      expect(btn).not.toBeNull();
      expect(btn?.textContent).toBe('G');
    });

    it('RGBW-026: B channel button exists', () => {
      const el = waveform.render();
      const btn = el.querySelector('[data-testid="waveform-channel-b"]');
      expect(btn).not.toBeNull();
      expect(btn?.textContent).toBe('B');
    });

    it('RGBW-027: intensity slider exists', () => {
      const el = waveform.render();
      const slider = el.querySelector('[data-testid="waveform-intensity-slider"]');
      expect(slider).not.toBeNull();
      expect((slider as HTMLInputElement)?.type).toBe('range');
    });

    it('RGBW-028: clicking channel button toggles channel', () => {
      const el = waveform.render();
      const btn = el.querySelector('[data-testid="waveform-channel-r"]') as HTMLButtonElement;

      btn.click();

      expect(waveform.getEnabledChannels().r).toBe(false);
    });

    it('RGBW-029: channel button opacity changes when disabled', () => {
      const el = waveform.render();
      const btn = el.querySelector('[data-testid="waveform-channel-r"]') as HTMLButtonElement;

      expect(btn.style.opacity).toBe('1');

      btn.click();

      expect(btn.style.opacity).toBe('0.5');
    });
  });

  describe('RGB overlay drawing', () => {
    let imageData: ImageData;

    beforeEach(() => {
      // Create test image data with distinct RGB values
      imageData = new ImageData(10, 10);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 200;     // R
        imageData.data[i + 1] = 100; // G
        imageData.data[i + 2] = 50;  // B
        imageData.data[i + 3] = 255; // A
      }
    });

    it('RGBW-030: drawing with all channels enabled works', () => {
      waveform.setMode('rgb');
      expect(() => waveform.update(imageData)).not.toThrow();
    });

    it('RGBW-031: drawing with only R channel works', () => {
      waveform.setMode('rgb');
      waveform.setChannel('g', false);
      waveform.setChannel('b', false);
      expect(() => waveform.update(imageData)).not.toThrow();
    });

    it('RGBW-032: drawing with no channels disabled works', () => {
      waveform.setMode('rgb');
      waveform.setChannel('r', false);
      waveform.setChannel('g', false);
      waveform.setChannel('b', false);
      expect(() => waveform.update(imageData)).not.toThrow();
    });

    it('RGBW-033: drawing with different intensity values works', () => {
      waveform.setMode('rgb');
      waveform.setIntensity(0.05);
      expect(() => waveform.update(imageData)).not.toThrow();

      waveform.setIntensity(0.3);
      expect(() => waveform.update(imageData)).not.toThrow();
    });
  });
});
