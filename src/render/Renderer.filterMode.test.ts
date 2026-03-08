/**
 * Renderer Texture Filter Mode Tests
 *
 * Tests for nearest-neighbor / bilinear filter mode toggle in the Renderer class.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Renderer } from './Renderer';
import { IPImage } from '../core/image/Image';
import { createMockRendererGL, initRendererWithMockGL } from '../../test/mocks';
import { DEFAULT_COLOR_ADJUSTMENTS, DEFAULT_HSL_QUALIFIER_STATE } from '../core/types/color';
import { DEFAULT_TONE_MAPPING_STATE, DEFAULT_ZEBRA_STATE } from '../core/types/effects';
import { DEFAULT_BACKGROUND_PATTERN_STATE } from '../core/types/background';
import type { RenderState } from './RenderState';

describe('Renderer Texture Filter Mode', () => {
  let renderer: Renderer;

  beforeEach(() => {
    renderer = new Renderer();
  });

  // =========================================================================
  // Basic getter/setter
  // =========================================================================

  it('FM-001: default filter mode is linear', () => {
    expect(renderer.getTextureFilterMode()).toBe('linear');
  });

  it('FM-002: setTextureFilterMode changes mode to nearest', () => {
    renderer.setTextureFilterMode('nearest');
    expect(renderer.getTextureFilterMode()).toBe('nearest');
  });

  it('FM-003: setTextureFilterMode changes mode back to linear', () => {
    renderer.setTextureFilterMode('nearest');
    renderer.setTextureFilterMode('linear');
    expect(renderer.getTextureFilterMode()).toBe('linear');
  });

  it('FM-004: setTextureFilterMode with same mode is a no-op', () => {
    renderer.setTextureFilterMode('linear');
    expect(renderer.getTextureFilterMode()).toBe('linear');
  });

  it('FM-005: setTextureFilterMode nearest then same nearest is no-op', () => {
    renderer.setTextureFilterMode('nearest');
    renderer.setTextureFilterMode('nearest');
    expect(renderer.getTextureFilterMode()).toBe('nearest');
  });

  // =========================================================================
  // applyImageTextureFilter via renderImage
  // =========================================================================

  describe('renderImage applies filter mode', () => {
    let mockGL: WebGL2RenderingContext;

    beforeEach(() => {
      mockGL = initRendererWithMockGL(renderer);
    });

    function createTestImage(): IPImage {
      const img = new IPImage({ width: 2, height: 2, channels: 4, dataType: 'uint8' });
      img.texture = (mockGL as any).createTexture();
      img.textureNeedsUpdate = false;
      return img;
    }

    it('FM-006: renderImage sets NEAREST mag/min filter when mode is nearest', () => {
      renderer.setTextureFilterMode('nearest');
      const image = createTestImage();
      renderer.renderImage(image);

      const calls = (mockGL.texParameteri as any).mock.calls as Array<[number, number, number]>;

      // Find the last MAG_FILTER and MIN_FILTER calls
      const magFilterCalls = calls.filter((c: number[]) => c[1] === mockGL.TEXTURE_MAG_FILTER);
      const minFilterCalls = calls.filter((c: number[]) => c[1] === mockGL.TEXTURE_MIN_FILTER);

      const lastMag = magFilterCalls[magFilterCalls.length - 1];
      const lastMin = minFilterCalls[minFilterCalls.length - 1];

      expect(lastMag?.[2]).toBe(mockGL.NEAREST);
      expect(lastMin?.[2]).toBe(mockGL.NEAREST);
    });

    it('FM-007: renderImage sets LINEAR mag/min filter when mode is linear (default)', () => {
      const image = createTestImage();
      renderer.renderImage(image);

      const calls = (mockGL.texParameteri as any).mock.calls as Array<[number, number, number]>;

      const magFilterCalls = calls.filter((c: number[]) => c[1] === mockGL.TEXTURE_MAG_FILTER);
      const minFilterCalls = calls.filter((c: number[]) => c[1] === mockGL.TEXTURE_MIN_FILTER);

      const lastMag = magFilterCalls[magFilterCalls.length - 1];
      const lastMin = minFilterCalls[minFilterCalls.length - 1];

      expect(lastMag?.[2]).toBe(mockGL.LINEAR);
      expect(lastMin?.[2]).toBe(mockGL.LINEAR);
    });

    it('FM-008: switching from nearest to linear restores LINEAR on next render', () => {
      const image = createTestImage();

      renderer.setTextureFilterMode('nearest');
      renderer.renderImage(image);

      renderer.setTextureFilterMode('linear');
      (mockGL.texParameteri as any).mockClear();
      renderer.renderImage(image);

      const calls = (mockGL.texParameteri as any).mock.calls as Array<[number, number, number]>;
      const magFilterCalls = calls.filter((c: number[]) => c[1] === mockGL.TEXTURE_MAG_FILTER);
      const lastMag = magFilterCalls[magFilterCalls.length - 1];
      expect(lastMag?.[2]).toBe(mockGL.LINEAR);
    });

    it('FM-009: switching from linear to nearest sets NEAREST on next render', () => {
      const image = createTestImage();

      renderer.renderImage(image);

      renderer.setTextureFilterMode('nearest');
      (mockGL.texParameteri as any).mockClear();
      renderer.renderImage(image);

      const calls = (mockGL.texParameteri as any).mock.calls as Array<[number, number, number]>;
      const magFilterCalls = calls.filter((c: number[]) => c[1] === mockGL.TEXTURE_MAG_FILTER);
      const lastMag = magFilterCalls[magFilterCalls.length - 1];
      expect(lastMag?.[2]).toBe(mockGL.NEAREST);
    });
  });

  // =========================================================================
  // Mipmap tracking
  // =========================================================================

  describe('mipmap tracking', () => {
    let mockGL: WebGL2RenderingContext;

    beforeEach(() => {
      // Enable mipmap support by making getExtension return truthy for the needed extensions
      mockGL = createMockRendererGL();
      (mockGL.getExtension as any).mockImplementation((name: string) => {
        if (name === 'OES_texture_float_linear') return {};
        if (name === 'EXT_color_buffer_float') return {};
        if (name === 'KHR_parallel_shader_compile') return {};
        return null;
      });
      const canvas = document.createElement('canvas');
      const originalGetContext = canvas.getContext.bind(canvas);
      canvas.getContext = vi.fn((contextId: string, _options?: unknown) => {
        if (contextId === 'webgl2') return mockGL;
        return originalGetContext(contextId, _options as CanvasRenderingContext2DSettings);
      }) as typeof canvas.getContext;
      renderer.initialize(canvas);
    });

    function createFloat32RGBAImage(): IPImage {
      const img = new IPImage({ width: 2, height: 2, channels: 4, dataType: 'float32' });
      // Mark as needing update so updateTexture is called
      img.textureNeedsUpdate = true;
      return img;
    }

    it('FM-010: mipmapped textures get LINEAR_MIPMAP_LINEAR restored after nearest round-trip', () => {
      const image = createFloat32RGBAImage();

      // First render: texture is uploaded with mipmaps
      renderer.renderImage(image);

      // Switch to nearest
      renderer.setTextureFilterMode('nearest');
      (mockGL.texParameteri as any).mockClear();
      renderer.renderImage(image);

      let calls = (mockGL.texParameteri as any).mock.calls as Array<[number, number, number]>;
      let minFilterCalls = calls.filter((c: number[]) => c[1] === mockGL.TEXTURE_MIN_FILTER);
      let lastMin = minFilterCalls[minFilterCalls.length - 1];
      expect(lastMin?.[2]).toBe(mockGL.NEAREST);

      // Switch back to linear - should restore LINEAR_MIPMAP_LINEAR, not just LINEAR
      renderer.setTextureFilterMode('linear');
      (mockGL.texParameteri as any).mockClear();
      renderer.renderImage(image);

      calls = (mockGL.texParameteri as any).mock.calls as Array<[number, number, number]>;
      minFilterCalls = calls.filter((c: number[]) => c[1] === mockGL.TEXTURE_MIN_FILTER);
      lastMin = minFilterCalls[minFilterCalls.length - 1];
      expect(lastMin?.[2]).toBe((mockGL as any).LINEAR_MIPMAP_LINEAR);
    });

    it('FM-011: non-mipmapped textures get LINEAR (not LINEAR_MIPMAP_LINEAR) in linear mode', () => {
      // Create a uint8 image with a pre-set texture (bypasses updateTexture,
      // so the texture is never added to the mipmapped set)
      const img = new IPImage({ width: 2, height: 2, channels: 4, dataType: 'uint8' });
      img.texture = (mockGL as any).createTexture();
      img.textureNeedsUpdate = false;

      renderer.renderImage(img);

      // Switch to nearest then back to linear
      renderer.setTextureFilterMode('nearest');
      renderer.renderImage(img);

      renderer.setTextureFilterMode('linear');
      (mockGL.texParameteri as any).mockClear();
      renderer.renderImage(img);

      const calls = (mockGL.texParameteri as any).mock.calls as Array<[number, number, number]>;
      const minFilterCalls = calls.filter((c: number[]) => c[1] === mockGL.TEXTURE_MIN_FILTER);
      const lastMin = minFilterCalls[minFilterCalls.length - 1];
      expect(lastMin?.[2]).toBe(mockGL.LINEAR);
    });

    it('FM-012: deleteTexture removes texture from mipmapped set', () => {
      const image = createFloat32RGBAImage();
      renderer.renderImage(image);

      // Delete the texture
      const tex = image.texture;
      renderer.deleteTexture(tex);

      // Set a new texture and render in linear mode
      image.texture = (mockGL as any).createTexture();
      image.textureNeedsUpdate = false;

      renderer.setTextureFilterMode('linear');
      (mockGL.texParameteri as any).mockClear();
      renderer.renderImage(image);

      // Should use LINEAR since the old texture was deleted from the mipmap set
      const calls = (mockGL.texParameteri as any).mock.calls as Array<[number, number, number]>;
      const minFilterCalls = calls.filter((c: number[]) => c[1] === mockGL.TEXTURE_MIN_FILTER);
      const lastMin = minFilterCalls[minFilterCalls.length - 1];
      expect(lastMin?.[2]).toBe(mockGL.LINEAR);
    });
  });

  // =========================================================================
  // renderSDRFrame applies filter mode
  // =========================================================================

  describe('renderSDRFrame applies filter mode', () => {
    let mockGL: WebGL2RenderingContext;

    beforeEach(() => {
      mockGL = initRendererWithMockGL(renderer);
    });

    it('FM-013: renderSDRFrame sets NEAREST when mode is nearest', () => {
      renderer.setTextureFilterMode('nearest');

      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      renderer.renderSDRFrame(canvas);

      const calls = (mockGL.texParameteri as any).mock.calls as Array<[number, number, number]>;
      const magFilterCalls = calls.filter((c: number[]) => c[1] === mockGL.TEXTURE_MAG_FILTER);
      const lastMag = magFilterCalls[magFilterCalls.length - 1];
      expect(lastMag?.[2]).toBe(mockGL.NEAREST);
    });

    it('FM-014: renderSDRFrame sets LINEAR when mode is linear', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      renderer.renderSDRFrame(canvas);

      const calls = (mockGL.texParameteri as any).mock.calls as Array<[number, number, number]>;
      const magFilterCalls = calls.filter((c: number[]) => c[1] === mockGL.TEXTURE_MAG_FILTER);
      const lastMag = magFilterCalls[magFilterCalls.length - 1];
      expect(lastMag?.[2]).toBe(mockGL.LINEAR);
    });
  });

  // =========================================================================
  // applyRenderState handles textureFilterMode
  // =========================================================================

  describe('applyRenderState', () => {
    it('FM-015: applyRenderState sets textureFilterMode when provided', () => {
      initRendererWithMockGL(renderer);
      const state = createMinimalRenderState();
      state.textureFilterMode = 'nearest';
      renderer.applyRenderState(state);
      expect(renderer.getTextureFilterMode()).toBe('nearest');
    });

    it('FM-016: applyRenderState does not change textureFilterMode when undefined', () => {
      initRendererWithMockGL(renderer);
      renderer.setTextureFilterMode('nearest');
      const state = createMinimalRenderState();
      state.textureFilterMode = undefined;
      renderer.applyRenderState(state);
      expect(renderer.getTextureFilterMode()).toBe('nearest');
    });

    it('FM-017: applyRenderState sets textureFilterMode to linear', () => {
      initRendererWithMockGL(renderer);
      renderer.setTextureFilterMode('nearest');
      const state = createMinimalRenderState();
      state.textureFilterMode = 'linear';
      renderer.applyRenderState(state);
      expect(renderer.getTextureFilterMode()).toBe('linear');
    });
  });

  // =========================================================================
  // dispose clears mipmapped textures
  // =========================================================================

  it('FM-018: dispose clears mipmapped textures set', () => {
    initRendererWithMockGL(renderer);
    renderer.setTextureFilterMode('nearest');
    renderer.dispose();
    // After dispose, creating a new renderer should have clean state
    expect(renderer.getTextureFilterMode()).toBe('nearest'); // state persists on JS side
    // The important thing is that _mipmappedTextures.clear() was called (no crash)
  });

  // =========================================================================
  // Tiled rendering uses filter mode transitively
  // =========================================================================

  describe('tiled rendering', () => {
    let mockGL: WebGL2RenderingContext;

    beforeEach(() => {
      mockGL = initRendererWithMockGL(renderer);
    });

    it('FM-019: renderTiledImages applies filter mode via renderImage delegation', () => {
      renderer.setTextureFilterMode('nearest');

      const image = new IPImage({ width: 2, height: 2, channels: 4, dataType: 'uint8' });
      image.texture = (mockGL as any).createTexture();
      image.textureNeedsUpdate = false;

      renderer.renderTiledImages([{ image, viewport: { x: 0, y: 0, width: 100, height: 100 } }]);

      const calls = (mockGL.texParameteri as any).mock.calls as Array<[number, number, number]>;
      const magFilterCalls = calls.filter((c: number[]) => c[1] === mockGL.TEXTURE_MAG_FILTER);
      const lastMag = magFilterCalls[magFilterCalls.length - 1];
      expect(lastMag?.[2]).toBe(mockGL.NEAREST);
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMinimalRenderState(): RenderState {
  return {
    colorAdjustments: { ...DEFAULT_COLOR_ADJUSTMENTS },
    colorInversion: false,
    toneMappingState: { ...DEFAULT_TONE_MAPPING_STATE },
    backgroundPattern: { ...DEFAULT_BACKGROUND_PATTERN_STATE },
    cdl: {
      slope: { r: 1, g: 1, b: 1 },
      offset: { r: 0, g: 0, b: 0 },
      power: { r: 1, g: 1, b: 1 },
      saturation: 1,
    },
    curvesLUT: null,
    colorWheels: {
      lift: { r: 0, g: 0, b: 0, y: 0 },
      gamma: { r: 0, g: 0, b: 0, y: 0 },
      gain: { r: 0, g: 0, b: 0, y: 0 },
      master: { r: 0, g: 0, b: 0, y: 0 },
      linked: false,
    },
    falseColor: { enabled: false, lut: null },
    zebraStripes: { ...DEFAULT_ZEBRA_STATE },
    channelMode: 'rgb' as const,
    lut: { data: null, size: 0, intensity: 1 },
    displayColor: { transferFunction: 0, displayGamma: 1, displayBrightness: 1, customGamma: 2.2 },
    highlightsShadows: { highlights: 0, shadows: 0, whites: 0, blacks: 0 },
    vibrance: { amount: 0, skinProtection: false },
    clarity: 0,
    sharpen: 0,
    hslQualifier: { ...DEFAULT_HSL_QUALIFIER_STATE },
    textureFilterMode: 'linear',
  };
}
