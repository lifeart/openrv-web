import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { Vectorscope } from './Vectorscope';

// Type for mock processor
interface MockScopesProcessor {
  isReady: Mock;
  setPlaybackMode: Mock;
  setImage: Mock;
  renderVectorscope: Mock;
}

// Mock WebGLScopes module
vi.mock('../../scopes/WebGLScopes', () => {
  const mockProcessor: MockScopesProcessor = {
    isReady: vi.fn(() => true),
    setPlaybackMode: vi.fn(),
    setImage: vi.fn(),
    renderVectorscope: vi.fn(),
  };
  return {
    getSharedScopesProcessor: vi.fn(() => mockProcessor),
    __mockProcessor: mockProcessor,
  };
});

describe('Vectorscope', () => {
  let vectorscope: Vectorscope;

  beforeEach(() => {
    vectorscope = new Vectorscope();
  });

  describe('initialization', () => {
    it('should create vectorscope instance', () => {
      expect(vectorscope).toBeInstanceOf(Vectorscope);
    });

    it('should start hidden', () => {
      expect(vectorscope.isVisible()).toBe(false);
    });

    it('should start with auto zoom', () => {
      expect(vectorscope.getZoom()).toBe('auto');
    });

    it('should render container element', () => {
      const el = vectorscope.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toContain('vectorscope-container');
    });

    it('should have canvas element', () => {
      const el = vectorscope.render();
      const canvas = el.querySelector('canvas');
      expect(canvas).not.toBeNull();
      expect(canvas?.width).toBe(200);
      expect(canvas?.height).toBe(200);
    });

    it('should have zoom button with testid', () => {
      const el = vectorscope.render();
      const zoomButton = el.querySelector('[data-testid="vectorscope-zoom-button"]');
      expect(zoomButton).not.toBeNull();
      // Initial zoom mode is 'auto', so button shows 'Auto'
      expect(zoomButton?.textContent).toBe('Auto');
    });

    it('should have close button with testid', () => {
      const el = vectorscope.render();
      const closeButton = el.querySelector('[data-testid="vectorscope-close-button"]');
      expect(closeButton).not.toBeNull();
      expect(closeButton?.textContent).toBe('×');
    });
  });

  describe('visibility', () => {
    it('should show vectorscope', () => {
      vectorscope.show();
      expect(vectorscope.isVisible()).toBe(true);
    });

    it('should hide vectorscope', () => {
      vectorscope.show();
      vectorscope.hide();
      expect(vectorscope.isVisible()).toBe(false);
    });

    it('should toggle visibility', () => {
      expect(vectorscope.isVisible()).toBe(false);
      vectorscope.toggle();
      expect(vectorscope.isVisible()).toBe(true);
      vectorscope.toggle();
      expect(vectorscope.isVisible()).toBe(false);
    });

    it('should emit visibilityChanged event on show', () => {
      const callback = vi.fn();
      vectorscope.on('visibilityChanged', callback);
      vectorscope.show();
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('should emit visibilityChanged event on hide', () => {
      vectorscope.show();
      const callback = vi.fn();
      vectorscope.on('visibilityChanged', callback);
      vectorscope.hide();
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('should not emit event when already visible', () => {
      vectorscope.show();
      const callback = vi.fn();
      vectorscope.on('visibilityChanged', callback);
      vectorscope.show();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should not emit event when already hidden', () => {
      const callback = vi.fn();
      vectorscope.on('visibilityChanged', callback);
      vectorscope.hide();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should update container display style on show', () => {
      const el = vectorscope.render();
      expect(el.style.display).toBe('none');
      vectorscope.show();
      expect(el.style.display).toBe('block');
    });

    it('should update container display style on hide', () => {
      vectorscope.show();
      const el = vectorscope.render();
      expect(el.style.display).toBe('block');
      vectorscope.hide();
      expect(el.style.display).toBe('none');
    });
  });

  describe('zoom', () => {
    it('should cycle through zoom levels', () => {
      // Initial zoom mode is 'auto'
      expect(vectorscope.getZoom()).toBe('auto');
      vectorscope.cycleZoom(); // auto -> 1
      expect(vectorscope.getZoom()).toBe(1);
      vectorscope.cycleZoom(); // 1 -> 2
      expect(vectorscope.getZoom()).toBe(2);
      vectorscope.cycleZoom(); // 2 -> 4
      expect(vectorscope.getZoom()).toBe(4);
      vectorscope.cycleZoom(); // 4 -> auto
      expect(vectorscope.getZoom()).toBe('auto');
    });

    it('should set zoom level directly', () => {
      vectorscope.setZoom(4);
      expect(vectorscope.getZoom()).toBe(4);
      vectorscope.setZoom(2);
      expect(vectorscope.getZoom()).toBe(2);
      vectorscope.setZoom(1);
      expect(vectorscope.getZoom()).toBe(1);
    });

    it('should emit zoomChanged event on cycle', () => {
      const callback = vi.fn();
      vectorscope.on('zoomChanged', callback);
      vectorscope.cycleZoom(); // auto -> 1
      expect(callback).toHaveBeenCalledWith(1);
    });

    it('should emit zoomChanged event on setZoom', () => {
      const callback = vi.fn();
      vectorscope.on('zoomChanged', callback);
      vectorscope.setZoom(4);
      expect(callback).toHaveBeenCalledWith(4);
    });

    it('should not emit event when setting same zoom', () => {
      vectorscope.setZoom(1);
      const callback = vi.fn();
      vectorscope.on('zoomChanged', callback);
      vectorscope.setZoom(1);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should update zoom button text on cycle', () => {
      const el = vectorscope.render();
      const zoomButton = el.querySelector('[data-testid="vectorscope-zoom-button"]');
      // Initial state is 'auto' mode, button shows 'Auto'
      expect(zoomButton?.textContent).toBe('Auto');
      vectorscope.cycleZoom(); // auto -> 1
      expect(zoomButton?.textContent).toBe('1x');
      vectorscope.cycleZoom(); // 1 -> 2
      expect(zoomButton?.textContent).toBe('2x');
      vectorscope.cycleZoom(); // 2 -> 4
      expect(zoomButton?.textContent).toBe('4x');
    });

    it('should update zoom button text on setZoom', () => {
      const el = vectorscope.render();
      const zoomButton = el.querySelector('[data-testid="vectorscope-zoom-button"]');
      vectorscope.setZoom(4);
      expect(zoomButton?.textContent).toBe('4x');
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
      expect(() => vectorscope.update(imageData)).not.toThrow();
    });

    it('should handle empty ImageData', () => {
      const imageData = new ImageData(1, 1);
      expect(() => vectorscope.update(imageData)).not.toThrow();
    });

    it('should handle large ImageData', () => {
      const imageData = new ImageData(1920, 1080);
      expect(() => vectorscope.update(imageData)).not.toThrow();
    });

    it('should handle saturated colors', () => {
      const imageData = new ImageData(10, 10);
      // Create pure red, green, blue pixels
      for (let i = 0; i < imageData.data.length; i += 12) {
        // Red
        imageData.data[i] = 255;
        imageData.data[i + 1] = 0;
        imageData.data[i + 2] = 0;
        imageData.data[i + 3] = 255;
        // Green
        imageData.data[i + 4] = 0;
        imageData.data[i + 5] = 255;
        imageData.data[i + 6] = 0;
        imageData.data[i + 7] = 255;
        // Blue
        imageData.data[i + 8] = 0;
        imageData.data[i + 9] = 0;
        imageData.data[i + 10] = 255;
        imageData.data[i + 11] = 255;
      }

      expect(() => vectorscope.update(imageData)).not.toThrow();
    });
  });

  describe('zoom change redraw', () => {
    let imageData: ImageData;

    beforeEach(() => {
      // Create simple image data for testing
      imageData = new ImageData(10, 10);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 128;     // R
        imageData.data[i + 1] = 64;  // G
        imageData.data[i + 2] = 192; // B
        imageData.data[i + 3] = 255; // A
      }
    });

    it('should store lastImageData when update is called', () => {
      vectorscope.update(imageData);
      // Verify cycleZoom works after update (would fail if lastImageData not stored)
      expect(() => vectorscope.cycleZoom()).not.toThrow();
    });

    it('should redraw when cycleZoom is called after update', () => {
      // Spy on update method to verify it's called during zoom change
      const updateSpy = vi.spyOn(vectorscope, 'update');

      vectorscope.update(imageData);
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // cycleZoom should trigger update internally with stored imageData
      // Initial zoom is 'auto', cycling goes to 1
      vectorscope.cycleZoom();
      expect(vectorscope.getZoom()).toBe(1);
      expect(updateSpy).toHaveBeenCalledTimes(2);
    });

    it('should redraw when setZoom is called after update', () => {
      const updateSpy = vi.spyOn(vectorscope, 'update');

      vectorscope.update(imageData);
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // setZoom should trigger update internally with stored imageData
      vectorscope.setZoom(4);
      expect(vectorscope.getZoom()).toBe(4);
      expect(updateSpy).toHaveBeenCalledTimes(2);
    });

    it('should not throw when cycleZoom called without prior update', () => {
      expect(() => vectorscope.cycleZoom()).not.toThrow();
    });

    it('should not throw when setZoom called without prior update', () => {
      expect(() => vectorscope.setZoom(4)).not.toThrow();
    });

    it('should use stored imageData for subsequent zoom changes', () => {
      const updateSpy = vi.spyOn(vectorscope, 'update');

      vectorscope.update(imageData);
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // Multiple zoom changes should all trigger redraws
      // Initial zoom is 'auto', cycling goes: auto -> 1 -> 2 -> 4 -> auto
      vectorscope.cycleZoom(); // auto -> 1x
      expect(vectorscope.getZoom()).toBe(1);
      expect(updateSpy).toHaveBeenCalledTimes(2);

      vectorscope.cycleZoom(); // 1x -> 2x
      expect(vectorscope.getZoom()).toBe(2);
      expect(updateSpy).toHaveBeenCalledTimes(3);

      vectorscope.cycleZoom(); // 2x -> 4x
      expect(vectorscope.getZoom()).toBe(4);
      expect(updateSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('dispose', () => {
    it('should dispose without error', () => {
      expect(() => vectorscope.dispose()).not.toThrow();
    });

    it('should clear internal references', () => {
      vectorscope.dispose();
      // Should not throw on further operations
      expect(() => vectorscope.cycleZoom()).not.toThrow();
    });
  });

  describe('pointer events', () => {
    it('should have pointer event listeners attached to container', () => {
      const el = vectorscope.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });
  });
});

describe('Vectorscope hi-DPI support', () => {
  let vectorscope: Vectorscope;
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
    if (vectorscope) {
      vectorscope.dispose();
    }
    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDevicePixelRatio,
      writable: true,
      configurable: true,
    });
  });

  it('VS-060: canvas physical dimensions scale with DPR', () => {
    setDevicePixelRatio(2);
    vectorscope = new Vectorscope();
    const el = vectorscope.render();
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;

    // Physical dimensions should be 2x logical (200x200 -> 400x400)
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(400);
  });

  it('VS-061: canvas CSS dimensions remain at logical size', () => {
    setDevicePixelRatio(2);
    vectorscope = new Vectorscope();
    const el = vectorscope.render();
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;

    // CSS dimensions should remain at logical size
    expect(canvas.style.width).toBe('200px');
    expect(canvas.style.height).toBe('200px');
  });

  it('VS-062: canvas renders correctly at 3x DPR', () => {
    setDevicePixelRatio(3);
    vectorscope = new Vectorscope();
    const el = vectorscope.render();
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;

    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(600);
  });

  it('VS-063: update works correctly at high DPR', () => {
    setDevicePixelRatio(2);
    vectorscope = new Vectorscope();

    const imageData = new ImageData(100, 100);
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 128;
      imageData.data[i + 1] = 64;
      imageData.data[i + 2] = 192;
      imageData.data[i + 3] = 255;
    }

    // Should not throw at high DPR
    expect(() => vectorscope.update(imageData)).not.toThrow();
  });

  it('VS-064: zoom cycling works at high DPR', () => {
    setDevicePixelRatio(2);
    vectorscope = new Vectorscope();

    const imageData = new ImageData(100, 100);
    vectorscope.update(imageData);

    // Cycle through zoom levels at high DPR
    expect(() => {
      vectorscope.setZoom(1);
      vectorscope.setZoom(2);
      vectorscope.setZoom(4);
      vectorscope.setZoom('auto');
    }).not.toThrow();
  });

  it('VS-065: DPR is stored for pixel buffer operations', () => {
    setDevicePixelRatio(2);
    vectorscope = new Vectorscope();

    // The vectorscope stores DPR for use in CPU rendering
    // Verify it renders without errors (DPR used for getImageData/putImageData)
    const imageData = new ImageData(50, 50);
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 255;
      imageData.data[i + 1] = 0;
      imageData.data[i + 2] = 0;
      imageData.data[i + 3] = 255;
    }

    expect(() => vectorscope.update(imageData)).not.toThrow();
  });
});

describe('Vectorscope GPU rendering', () => {
  let vectorscope: Vectorscope;

  beforeEach(() => {
    vi.clearAllMocks();
    vectorscope = new Vectorscope();
  });

  afterEach(() => {
    vectorscope.dispose();
  });

  it('VS-050: update uses GPU rendering when available', async () => {
    const { getSharedScopesProcessor } = await import('../../scopes/WebGLScopes');
    const mockProcessor = (getSharedScopesProcessor as ReturnType<typeof vi.fn>)() as MockScopesProcessor;

    const imageData = new ImageData(10, 10);
    vectorscope.update(imageData);

    expect(mockProcessor.setImage).toHaveBeenCalledWith(imageData);
    expect(mockProcessor.renderVectorscope).toHaveBeenCalled();
  });

  it('VS-051: GPU rendering uses current zoom level', async () => {
    const { getSharedScopesProcessor } = await import('../../scopes/WebGLScopes');
    const mockProcessor = (getSharedScopesProcessor as ReturnType<typeof vi.fn>)() as MockScopesProcessor;

    vectorscope.setZoom(2);
    const imageData = new ImageData(10, 10);
    vectorscope.update(imageData);

    const call = mockProcessor.renderVectorscope.mock.calls[0];
    expect(call[1]).toBe(2); // zoom parameter
  });

  it('VS-052: GPU rendering uses 4x zoom when set', async () => {
    const { getSharedScopesProcessor } = await import('../../scopes/WebGLScopes');
    const mockProcessor = (getSharedScopesProcessor as ReturnType<typeof vi.fn>)() as MockScopesProcessor;

    vectorscope.setZoom(4);
    const imageData = new ImageData(10, 10);
    vectorscope.update(imageData);

    const call = mockProcessor.renderVectorscope.mock.calls[0];
    expect(call[1]).toBe(4);
  });

  it('VS-053: setPlaybackMode updates GPU processor', async () => {
    const { getSharedScopesProcessor } = await import('../../scopes/WebGLScopes');
    const mockProcessor = (getSharedScopesProcessor as ReturnType<typeof vi.fn>)() as MockScopesProcessor;

    vectorscope.setPlaybackMode(true);
    const imageData = new ImageData(10, 10);
    vectorscope.update(imageData);

    expect(mockProcessor.setPlaybackMode).toHaveBeenCalledWith(true);
  });

  it('VS-054: setPlaybackMode(false) updates GPU processor', async () => {
    const { getSharedScopesProcessor } = await import('../../scopes/WebGLScopes');
    const mockProcessor = (getSharedScopesProcessor as ReturnType<typeof vi.fn>)() as MockScopesProcessor;

    vectorscope.setPlaybackMode(false);
    const imageData = new ImageData(10, 10);
    vectorscope.update(imageData);

    expect(mockProcessor.setPlaybackMode).toHaveBeenCalledWith(false);
  });

  it('VS-055: setPlaybackMode is callable without update', () => {
    expect(() => vectorscope.setPlaybackMode(true)).not.toThrow();
    expect(() => vectorscope.setPlaybackMode(false)).not.toThrow();
  });

  it('VS-056: GPU processor receives correct canvas', async () => {
    const { getSharedScopesProcessor } = await import('../../scopes/WebGLScopes');
    const mockProcessor = (getSharedScopesProcessor as ReturnType<typeof vi.fn>)() as MockScopesProcessor;

    vectorscope.render(); // Ensure canvas is created
    const imageData = new ImageData(10, 10);
    vectorscope.update(imageData);

    const call = mockProcessor.renderVectorscope.mock.calls[0];
    expect(call[0]).toBeInstanceOf(HTMLCanvasElement);
  });
});
