/**
 * Vitest test setup file
 * Configures global test environment
 */

import { vi } from 'vitest';

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
      widthOrSettings?: number | ImageDataSettings
    ) {
      if (typeof widthOrData === 'number') {
        // new ImageData(width, height)
        this.width = widthOrData;
        this.height = heightOrWidth!;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else if (widthOrData instanceof Uint8ClampedArray || Array.isArray(widthOrData)) {
        // new ImageData(data, width, height?)
        const data = widthOrData instanceof Uint8ClampedArray
          ? widthOrData
          : new Uint8ClampedArray(widthOrData);
        this.width = heightOrWidth!;
        this.height = typeof widthOrSettings === 'number'
          ? widthOrSettings
          : data.length / (4 * heightOrWidth!);
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
HTMLCanvasElement.prototype.getContext = vi.fn(function (
  this: HTMLCanvasElement,
  contextId: string
) {
  if (contextId === '2d') {
    return new MockCanvasRenderingContext2D() as unknown as CanvasRenderingContext2D;
  }
  return null;
}) as typeof HTMLCanvasElement.prototype.getContext;

// Mock HTMLCanvasElement.toDataURL since jsdom doesn't support it without canvas npm package
HTMLCanvasElement.prototype.toDataURL = vi.fn(function (
  this: HTMLCanvasElement,
  type?: string,
  _quality?: unknown
) {
  // Return a valid data URL for testing
  const mimeType = type || 'image/png';
  return `data:${mimeType};base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`;
}) as typeof HTMLCanvasElement.prototype.toDataURL;

// Mock HTMLCanvasElement.toBlob
HTMLCanvasElement.prototype.toBlob = vi.fn(function (
  this: HTMLCanvasElement,
  callback: BlobCallback,
  type?: string,
  _quality?: unknown
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
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock AudioContext
global.AudioContext = vi.fn().mockImplementation(() => ({
  createMediaElementSource: vi.fn(() => ({
    connect: vi.fn(),
  })),
  createAnalyser: vi.fn(() => ({
    connect: vi.fn(),
    fftSize: 2048,
    frequencyBinCount: 1024,
    getByteFrequencyData: vi.fn(),
    getByteTimeDomainData: vi.fn(),
  })),
  destination: {},
  close: vi.fn(),
}));

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
