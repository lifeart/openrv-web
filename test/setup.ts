/**
 * Vitest test setup file
 * Configures global test environment
 */

import { vi, beforeEach } from 'vitest';

// Workaround for jsdom 28 CSS parsing bugs (https://github.com/jsdom/jsdom/issues/4095):
// 1. `border` shorthand with CSS var() values silently rejects entire cssText
// 2. `background` shorthand followed by any other property silently rejects entire cssText
// Caused by @acemir/cssom introduced in jsdom 27.1.0. Remove when fixed upstream.
const cssTextDesc = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'cssText');
if (cssTextDesc && cssTextDesc.set) {
  const originalSet = cssTextDesc.set;
  Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', {
    ...cssTextDesc,
    set(value: string) {
      let fixed = value;

      // Fix 1: extract `border[-side]: <width> <style> var(...)` declarations
      // and apply them individually after the main cssText, because jsdom 28
      // rejects border shorthand with var() values entirely, and expanding to
      // three longhands causes jsdom to re-collapse and lose borderColor.
      const borderDecls: Array<{ side: string; width: string; style: string; color: string }> = [];
      fixed = fixed.replace(
        /\bborder(?:-(top|right|bottom|left))?\s*:\s*([^;]*?)\s+(solid|dashed|dotted|double|groove|ridge|inset|outset|none|hidden)\s+(var\([^)]+\))\s*;?/g,
        (_match, side: string | undefined, width: string, style: string, color: string) => {
          borderDecls.push({ side: side || '', width, style, color });
          return '';
        },
      );

      // Fix 2: move `background` shorthand to end of cssText.
      // `background: <value>` followed by any other property breaks in jsdom 28.
      // Moving it to the end avoids the parsing bug while preserving style.background readability.
      const bgMatches: string[] = [];
      fixed = fixed.replace(/\bbackground\s*:\s*[^;]+;/g, (match) => {
        bgMatches.push(match);
        return '';
      });
      if (bgMatches.length > 0) {
        fixed = fixed + ' ' + bgMatches.join(' ');
      }

      originalSet.call(this, fixed);

      // Apply border declarations individually to avoid jsdom 28 collapse bug
      for (const { side, width, style, color } of borderDecls) {
        const s = side ? `-${side}` : '';
        (this as CSSStyleDeclaration).setProperty(`border${s}-width`, width);
        (this as CSSStyleDeclaration).setProperty(`border${s}-style`, style);
        (this as CSSStyleDeclaration).setProperty(`border${s}-color`, color);
      }
    },
  });
}

// Polyfill ImageData if not available in jsdom
if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataPolyfill {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    readonly colorSpace: PredefinedColorSpace = 'srgb';

    constructor(
      widthOrData: number | Uint8ClampedArray | number[],
      heightOrWidth?: number,
      widthOrSettings?: number | ImageDataSettings,
    ) {
      if (typeof widthOrData === 'number') {
        // new ImageData(width, height)
        this.width = widthOrData;
        this.height = heightOrWidth!;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else if (widthOrData instanceof Uint8ClampedArray || Array.isArray(widthOrData)) {
        // new ImageData(data, width, height?)
        const data = widthOrData instanceof Uint8ClampedArray ? widthOrData : new Uint8ClampedArray(widthOrData);
        this.width = heightOrWidth!;
        this.height = typeof widthOrSettings === 'number' ? widthOrSettings : data.length / (4 * heightOrWidth!);
        this.data = data;
      } else {
        throw new Error('Invalid ImageData constructor arguments');
      }
    }
  }

  globalThis.ImageData = ImageDataPolyfill as unknown as typeof ImageData;
}

// Mock canvas style object that behaves like CSSStyleDeclaration
class MockCSSStyleDeclaration {
  width = '';
  height = '';
  [key: string]: string;
}

// Mock canvas for tests that need it
class MockCanvas {
  width = 100;
  height = 100;
  style = new MockCSSStyleDeclaration();
}

// Mock canvas context for tests that need it
class MockCanvasRenderingContext2D {
  canvas = new MockCanvas();
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  font = '10px sans-serif';
  textAlign = 'start';
  textBaseline = 'alphabetic';

  fillRect = vi.fn();
  clearRect = vi.fn();
  strokeRect = vi.fn();
  beginPath = vi.fn();
  closePath = vi.fn();
  moveTo = vi.fn();
  lineTo = vi.fn();
  arc = vi.fn();
  arcTo = vi.fn();
  quadraticCurveTo = vi.fn();
  bezierCurveTo = vi.fn();
  rect = vi.fn();
  fill = vi.fn();
  stroke = vi.fn();
  clip = vi.fn();
  save = vi.fn();
  restore = vi.fn();
  scale = vi.fn();
  rotate = vi.fn();
  translate = vi.fn();
  transform = vi.fn();
  setTransform = vi.fn();
  resetTransform = vi.fn();
  drawImage = vi.fn();
  createImageData = vi.fn(() => new ImageData(1, 1));
  getImageData = vi.fn(() => new ImageData(100, 100));
  putImageData = vi.fn();
  fillText = vi.fn();
  strokeText = vi.fn();
  measureText = vi.fn(() => ({ width: 10 }));
  createLinearGradient = vi.fn(() => ({
    addColorStop: vi.fn(),
  }));
  createRadialGradient = vi.fn(() => ({
    addColorStop: vi.fn(),
  }));
  createConicGradient = vi.fn(() => ({
    addColorStop: vi.fn(),
  }));
  createPattern = vi.fn();
  roundRect = vi.fn();
  setLineDash = vi.fn();
  getLineDash = vi.fn(() => []);
}

// Mock HTMLCanvasElement.getContext
// This function creates a fresh vi.fn mock. We apply it on setup and also
// re-apply in beforeEach so it survives vi.restoreAllMocks() in other tests.
function createGetContextMock() {
  return vi.fn(function (this: HTMLCanvasElement, contextId: string) {
    if (contextId === '2d') {
      return new MockCanvasRenderingContext2D() as unknown as CanvasRenderingContext2D;
    }
    return null;
  }) as typeof HTMLCanvasElement.prototype.getContext;
}

HTMLCanvasElement.prototype.getContext = createGetContextMock();

// Re-apply mock before each test so it survives vi.restoreAllMocks()
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = createGetContextMock();
});

// Mock HTMLCanvasElement.toDataURL since jsdom doesn't support it without canvas npm package
HTMLCanvasElement.prototype.toDataURL = vi.fn(function (this: HTMLCanvasElement, type?: string, _quality?: unknown) {
  // Return a valid data URL for testing
  const mimeType = type || 'image/png';
  return `data:${mimeType};base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`;
}) as typeof HTMLCanvasElement.prototype.toDataURL;

// Mock HTMLCanvasElement.toBlob
HTMLCanvasElement.prototype.toBlob = vi.fn(function (
  this: HTMLCanvasElement,
  callback: BlobCallback,
  type?: string,
  _quality?: unknown,
) {
  const mimeType = type || 'image/png';
  const blob = new Blob(['mock-image-data'], { type: mimeType });
  setTimeout(() => callback(blob), 0);
}) as typeof HTMLCanvasElement.prototype.toBlob;

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((callback) => {
  setTimeout(callback, 16);
  return 1;
});

global.cancelAnimationFrame = vi.fn();

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_callback?: ResizeObserverCallback) {}
} as unknown as typeof globalThis.ResizeObserver;

// Mock AudioContext
global.AudioContext = class MockAudioContext {
  createMediaElementSource = vi.fn(() => ({
    connect: vi.fn(),
  }));
  createAnalyser = vi.fn(() => ({
    connect: vi.fn(),
    fftSize: 2048,
    frequencyBinCount: 1024,
    getByteFrequencyData: vi.fn(),
    getByteTimeDomainData: vi.fn(),
  }));
  destination = {};
  close = vi.fn();
} as unknown as typeof globalThis.AudioContext;

// Mock Image loading
Object.defineProperty(global.Image.prototype, 'src', {
  set(src: string) {
    if (src) {
      setTimeout(() => {
        Object.defineProperty(this, 'naturalWidth', { value: 100, writable: true });
        Object.defineProperty(this, 'naturalHeight', { value: 100, writable: true });
        Object.defineProperty(this, 'complete', { value: true, writable: true });
        if (this.onload) this.onload(new Event('load'));
      }, 0);
    }
  },
});

// Polyfill File.text() if not available
if (typeof File.prototype.text !== 'function') {
  File.prototype.text = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// Polyfill File.arrayBuffer() if not available (needed for EXR loading)
if (typeof File.prototype.arrayBuffer !== 'function') {
  File.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// Polyfill PointerEvent if not available in jsdom
if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly width: number;
    readonly height: number;
    readonly pressure: number;
    readonly tangentialPressure: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly twist: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.width = params.width ?? 1;
      this.height = params.height ?? 1;
      this.pressure = params.pressure ?? 0;
      this.tangentialPressure = params.tangentialPressure ?? 0;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.twist = params.twist ?? 0;
      this.pointerType = params.pointerType ?? '';
      this.isPrimary = params.isPrimary ?? false;
    }
  } as unknown as typeof PointerEvent;
}

// Polyfill pointer capture methods if not available in jsdom
if (typeof HTMLElement.prototype.hasPointerCapture !== 'function') {
  HTMLElement.prototype.hasPointerCapture = function () {
    return false;
  };
  HTMLElement.prototype.setPointerCapture = function () {};
  HTMLElement.prototype.releasePointerCapture = function () {};
}

// Console warning suppression for expected warnings in tests
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  // Suppress specific expected warnings
  const message = args[0];
  if (typeof message === 'string') {
    if (message.includes('Failed to load')) return;
  }
  originalWarn.apply(console, args);
};
