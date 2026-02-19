/**
 * Renderer Tiled Rendering Tests
 *
 * Tests for the renderTiledImages() method that renders multiple
 * images in a tiled layout using viewport/scissor clipping.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { Renderer } from './Renderer';
import { IPImage } from '../core/image/Image';
import { initRendererWithMockGL } from '../../test/mocks';
import type { TileViewport } from '../nodes/groups/LayoutGroupNode';

/**
 * Extended mock GL context with the additional methods needed for tiled rendering.
 */
interface TiledMockGL {
  enable: Mock;
  disable: Mock;
  scissor: Mock;
  viewport: Mock;
  drawArrays: Mock;
  texImage2D: Mock;
  getParameter: Mock;
}

// Extend the mock GL to add the methods needed for tiled rendering
function initRendererForTiled(renderer: Renderer): TiledMockGL {
  const baseGL = initRendererWithMockGL(renderer);

  // Add missing methods for tiled rendering
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gl = baseGL as any;
  gl.enable = gl.enable ?? vi.fn();
  gl.disable = gl.disable ?? vi.fn();
  gl.scissor = gl.scissor ?? vi.fn();
  gl.getParameter = gl.getParameter ?? vi.fn(() => new Int32Array([0, 0, 1920, 1080]));
  gl.SCISSOR_TEST = gl.SCISSOR_TEST ?? 0x0C11;
  gl.VIEWPORT = gl.VIEWPORT ?? 0x0BA2;
  gl.HALF_FLOAT = gl.HALF_FLOAT ?? 0x140B;
  gl.NEAREST = gl.NEAREST ?? 0x2600;
  gl.NO_ERROR = gl.NO_ERROR ?? 0;
  gl.FRAMEBUFFER = gl.FRAMEBUFFER ?? 0x8D40;
  gl.R32F = gl.R32F ?? 0x822E;
  gl.RED = gl.RED ?? 0x1903;
  gl.TEXTURE1 = gl.TEXTURE1 ?? 0x84C1;
  gl.TEXTURE2 = gl.TEXTURE2 ?? 0x84C2;
  gl.TEXTURE4 = gl.TEXTURE4 ?? 0x84C4;
  gl.TEXTURE5 = gl.TEXTURE5 ?? 0x84C5;

  return gl as TiledMockGL;
}

function createTestImage(width = 100, height = 100): IPImage {
  return new IPImage({
    width,
    height,
    channels: 4,
    dataType: 'uint8',
  });
}

describe('Renderer renderTiledImages', () => {
  let renderer: Renderer;

  beforeEach(() => {
    renderer = new Renderer();
  });

  it('REN-TILE-001: renderTiledImages does nothing when no tiles', () => {
    const gl = initRendererForTiled(renderer);

    renderer.renderTiledImages([]);

    expect(gl.enable).not.toHaveBeenCalled();
  });

  it('REN-TILE-002: renderTiledImages enables scissor test', () => {
    const gl = initRendererForTiled(renderer);
    const image = createTestImage();
    const viewport: TileViewport = { x: 0, y: 0, width: 400, height: 300 };

    renderer.renderTiledImages([{ image, viewport }]);

    expect(gl.enable).toHaveBeenCalledWith(0x0C11); // SCISSOR_TEST
  });

  it('REN-TILE-003: renderTiledImages disables scissor test after rendering', () => {
    const gl = initRendererForTiled(renderer);
    const image = createTestImage();
    const viewport: TileViewport = { x: 0, y: 0, width: 400, height: 300 };

    renderer.renderTiledImages([{ image, viewport }]);

    expect(gl.disable).toHaveBeenCalledWith(0x0C11); // SCISSOR_TEST
  });

  it('REN-TILE-004: renderTiledImages sets viewport for each tile', () => {
    const gl = initRendererForTiled(renderer);
    const viewports: TileViewport[] = [
      { x: 0, y: 300, width: 400, height: 300 },
      { x: 400, y: 300, width: 400, height: 300 },
      { x: 0, y: 0, width: 400, height: 300 },
      { x: 400, y: 0, width: 400, height: 300 },
    ];

    const tiles = viewports.map(vp => ({
      image: createTestImage(),
      viewport: vp,
    }));

    renderer.renderTiledImages(tiles);

    // viewport should be called for each tile + restore
    const viewportCalls = gl.viewport.mock.calls;
    expect(viewportCalls.length).toBeGreaterThanOrEqual(4);
    expect(viewportCalls).toContainEqual([0, 300, 400, 300]);
    expect(viewportCalls).toContainEqual([400, 300, 400, 300]);
    expect(viewportCalls).toContainEqual([0, 0, 400, 300]);
    expect(viewportCalls).toContainEqual([400, 0, 400, 300]);
  });

  it('REN-TILE-005: renderTiledImages sets scissor for each tile', () => {
    const gl = initRendererForTiled(renderer);
    const viewports: TileViewport[] = [
      { x: 0, y: 300, width: 400, height: 300 },
      { x: 400, y: 0, width: 400, height: 300 },
    ];

    const tiles = viewports.map(vp => ({
      image: createTestImage(),
      viewport: vp,
    }));

    renderer.renderTiledImages(tiles);

    const scissorCalls = gl.scissor.mock.calls;
    expect(scissorCalls).toContainEqual([0, 300, 400, 300]);
    expect(scissorCalls).toContainEqual([400, 0, 400, 300]);
  });

  it('REN-TILE-006: renderTiledImages restores previous viewport', () => {
    const gl = initRendererForTiled(renderer);
    const savedViewport = new Int32Array([10, 20, 1920, 1080]);
    gl.getParameter = vi.fn(() => savedViewport);

    const image = createTestImage();
    const viewport: TileViewport = { x: 0, y: 0, width: 400, height: 300 };

    renderer.renderTiledImages([{ image, viewport }]);

    // Last viewport call should restore the saved viewport
    const viewportCalls = gl.viewport.mock.calls;
    const lastCall = viewportCalls[viewportCalls.length - 1];
    expect(lastCall).toEqual([10, 20, 1920, 1080]);
  });

  it('REN-TILE-007: renderTiledImages calls drawArrays for each tile', () => {
    const gl = initRendererForTiled(renderer);

    const tiles = [
      { image: createTestImage(), viewport: { x: 0, y: 0, width: 400, height: 300 } },
      { image: createTestImage(), viewport: { x: 400, y: 0, width: 400, height: 300 } },
      { image: createTestImage(), viewport: { x: 0, y: 300, width: 400, height: 300 } },
      { image: createTestImage(), viewport: { x: 400, y: 300, width: 400, height: 300 } },
    ];

    renderer.renderTiledImages(tiles);

    // Each tile should trigger a drawArrays call
    expect(gl.drawArrays.mock.calls.length).toBe(4);
  });

  it('REN-TILE-008: renderTiledImages handles single tile', () => {
    const gl = initRendererForTiled(renderer);
    const image = createTestImage();
    const viewport: TileViewport = { x: 100, y: 200, width: 500, height: 400 };

    renderer.renderTiledImages([{ image, viewport }]);

    expect(gl.drawArrays.mock.calls.length).toBe(1);
    expect(gl.scissor).toHaveBeenCalledWith(100, 200, 500, 400);
    expect(gl.viewport).toHaveBeenCalledWith(100, 200, 500, 400);
  });

  it('REN-TILE-009: renderTiledImages uploads texture for each tile image', () => {
    const gl = initRendererForTiled(renderer);

    const imageA = createTestImage(100, 100);
    const imageB = createTestImage(200, 200);

    renderer.renderTiledImages([
      { image: imageA, viewport: { x: 0, y: 0, width: 400, height: 300 } },
      { image: imageB, viewport: { x: 400, y: 0, width: 400, height: 300 } },
    ]);

    // texImage2D should be called for each unique image
    expect(gl.texImage2D.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('REN-TILE-010: renderTiledImages does nothing when renderer not initialized', () => {
    // Don't initialize - should be a no-op
    const uninitializedRenderer = new Renderer();
    const tiles = [
      { image: createTestImage(), viewport: { x: 0, y: 0, width: 400, height: 300 } },
    ];

    // Should not throw
    expect(() => uninitializedRenderer.renderTiledImages(tiles)).not.toThrow();
  });

  it('REN-TILE-011: renderTiledImages cleans up scissor even on error', () => {
    const gl = initRendererForTiled(renderer);

    // Make texImage2D throw to simulate an error
    gl.texImage2D.mockImplementation(() => {
      throw new Error('GPU error');
    });

    const tiles = [
      { image: createTestImage(), viewport: { x: 0, y: 0, width: 400, height: 300 } },
    ];

    // renderTiledImages calls renderImage which calls updateTexture which calls texImage2D
    // The error happens inside renderImage, which is caught by the try/finally in renderTiledImages
    try {
      renderer.renderTiledImages(tiles);
    } catch {
      // Expected
    }

    // Scissor should be disabled regardless of error
    expect(gl.disable).toHaveBeenCalledWith(0x0C11);
  });
});
