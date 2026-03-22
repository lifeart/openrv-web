/**
 * Renderer WebGL Context Loss / Restore Tests
 *
 * Regression tests for HIGH-01: ensures the Renderer properly handles
 * webglcontextlost and webglcontextrestored events on the canvas.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Renderer } from './Renderer';
import { IPImage } from '../core/image/Image';
import { initRendererWithMockGL } from '../../test/mocks';

describe('Renderer WebGL Context Loss Recovery', () => {
  let renderer: Renderer;
  let canvas: HTMLCanvasElement;
  let mockGL: WebGL2RenderingContext;

  beforeEach(() => {
    renderer = new Renderer();
    mockGL = initRendererWithMockGL(renderer);
    // The mock helper creates a canvas internally; retrieve it via getCanvasElement()
    canvas = renderer.getCanvasElement()!;
  });

  // -----------------------------------------------------------------------
  // Context lost flag
  // -----------------------------------------------------------------------

  it('should not report context lost initially', () => {
    expect(renderer.isContextLost()).toBe(false);
  });

  it('should set contextLost flag when webglcontextlost fires', () => {
    const event = new Event('webglcontextlost');
    canvas.dispatchEvent(event);
    expect(renderer.isContextLost()).toBe(true);
  });

  it('should call preventDefault on context lost event to allow restoration', () => {
    const event = new Event('webglcontextlost', { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    canvas.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('should clear contextLost flag when webglcontextrestored fires', () => {
    // Lose context first
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(renderer.isContextLost()).toBe(true);

    // Restore
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(renderer.isContextLost()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Rendering skipped while context is lost
  // -----------------------------------------------------------------------

  it('renderImage should be a no-op when context is lost', () => {
    canvas.dispatchEvent(new Event('webglcontextlost'));

    const image = new IPImage({
      width: 2,
      height: 2,
      channels: 4,
      dataType: 'uint8',
      data: new Uint8Array(16).buffer,
    });

    // Clear call counts from initialization
    (mockGL.drawArrays as ReturnType<typeof vi.fn>).mockClear();

    renderer.renderImage(image);
    expect(mockGL.drawArrays).not.toHaveBeenCalled();
  });

  it('renderSDRFrame should return null when context is lost', () => {
    canvas.dispatchEvent(new Event('webglcontextlost'));

    const sourceCanvas = document.createElement('canvas');
    const result = renderer.renderSDRFrame(sourceCanvas);
    expect(result).toBeNull();
  });

  it('clear should be a no-op when context is lost', () => {
    canvas.dispatchEvent(new Event('webglcontextlost'));

    (mockGL.clearColor as ReturnType<typeof vi.fn>).mockClear();
    (mockGL.clear as ReturnType<typeof vi.fn>).mockClear();

    renderer.clear();
    expect(mockGL.clearColor).not.toHaveBeenCalled();
    expect(mockGL.clear).not.toHaveBeenCalled();
  });

  it('readPixelFloat should return null when context is lost', () => {
    canvas.dispatchEvent(new Event('webglcontextlost'));
    const result = renderer.readPixelFloat(0, 0, 1, 1);
    expect(result).toBeNull();
  });

  it('resize should be a no-op when context is lost', () => {
    canvas.dispatchEvent(new Event('webglcontextlost'));

    (mockGL.viewport as ReturnType<typeof vi.fn>).mockClear();

    renderer.resize(800, 600);
    expect(mockGL.viewport).not.toHaveBeenCalled();
  });

  it('ensureImageTexture should return null when context is lost', () => {
    canvas.dispatchEvent(new Event('webglcontextlost'));

    const image = new IPImage({
      width: 2,
      height: 2,
      channels: 4,
      dataType: 'uint8',
      data: new Uint8Array(16).buffer,
    });

    const result = renderer.ensureImageTexture(image);
    expect(result).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Context restore re-initializes GPU state
  // -----------------------------------------------------------------------

  it('should re-create shaders and quad after context restore', () => {
    // Record initial shader/quad creation call counts
    const createProgramCalls = (mockGL.createProgram as ReturnType<typeof vi.fn>).mock.calls.length;
    const createVAOCalls = (mockGL.createVertexArray as ReturnType<typeof vi.fn>).mock.calls.length;

    // Lose and restore
    canvas.dispatchEvent(new Event('webglcontextlost'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    // Shaders and quad should be re-created (one extra call each)
    expect((mockGL.createProgram as ReturnType<typeof vi.fn>).mock.calls.length).toBe(createProgramCalls + 1);
    expect((mockGL.createVertexArray as ReturnType<typeof vi.fn>).mock.calls.length).toBe(createVAOCalls + 1);
  });

  it('should allow rendering again after context restore', () => {
    const image = new IPImage({
      width: 2,
      height: 2,
      channels: 4,
      dataType: 'uint8',
      data: new Uint8Array(16).buffer,
    });

    // Lose and restore
    canvas.dispatchEvent(new Event('webglcontextlost'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    (mockGL.drawArrays as ReturnType<typeof vi.fn>).mockClear();

    renderer.renderImage(image);
    // After restore, rendering should succeed (drawArrays called)
    expect(mockGL.drawArrays).toHaveBeenCalled();
  });

  it('should re-check extensions after context restore', () => {
    (mockGL.getExtension as ReturnType<typeof vi.fn>).mockClear();

    canvas.dispatchEvent(new Event('webglcontextlost'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    // getExtension should have been called for OES_texture_float_linear,
    // EXT_color_buffer_float, and KHR_parallel_shader_compile
    const extCalls = (mockGL.getExtension as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
    expect(extCalls).toContain('OES_texture_float_linear');
    expect(extCalls).toContain('EXT_color_buffer_float');
    expect(extCalls).toContain('KHR_parallel_shader_compile');
  });

  // -----------------------------------------------------------------------
  // Multiple context loss/restore cycles
  // -----------------------------------------------------------------------

  it('should handle multiple context loss/restore cycles', () => {
    const image = new IPImage({
      width: 2,
      height: 2,
      channels: 4,
      dataType: 'uint8',
      data: new Uint8Array(16).buffer,
    });

    // First cycle
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(renderer.isContextLost()).toBe(true);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(renderer.isContextLost()).toBe(false);

    (mockGL.drawArrays as ReturnType<typeof vi.fn>).mockClear();
    renderer.renderImage(image);
    expect(mockGL.drawArrays).toHaveBeenCalled();

    // Second cycle
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(renderer.isContextLost()).toBe(true);

    (mockGL.drawArrays as ReturnType<typeof vi.fn>).mockClear();
    renderer.renderImage(image);
    expect(mockGL.drawArrays).not.toHaveBeenCalled();

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(renderer.isContextLost()).toBe(false);

    (mockGL.drawArrays as ReturnType<typeof vi.fn>).mockClear();
    renderer.renderImage(image);
    expect(mockGL.drawArrays).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Dispose cleans up listeners
  // -----------------------------------------------------------------------

  it('should remove context loss listeners on dispose', () => {
    const removeEventListenerSpy = vi.spyOn(canvas, 'removeEventListener');

    renderer.dispose();

    // Should have removed both listeners
    const removedEvents = removeEventListenerSpy.mock.calls.map((c) => c[0]);
    expect(removedEvents).toContain('webglcontextlost');
    expect(removedEvents).toContain('webglcontextrestored');
  });

  it('should not respond to context events after dispose', () => {
    renderer.dispose();

    // Dispatching context lost after dispose should not set the flag
    // (the renderer is already cleaned up, and the flag was reset in dispose)
    canvas.dispatchEvent(new Event('webglcontextlost'));

    // The renderer's internal state should remain clean (contextLost = false)
    expect(renderer.isContextLost()).toBe(false);
  });

  it('should reset contextLost flag on dispose', () => {
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(renderer.isContextLost()).toBe(true);

    renderer.dispose();
    expect(renderer.isContextLost()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // renderTiledImages context-lost guard
  // -----------------------------------------------------------------------

  it('renderTiledImages should be a no-op when context is lost', () => {
    canvas.dispatchEvent(new Event('webglcontextlost'));

    const image = new IPImage({
      width: 2,
      height: 2,
      channels: 4,
      dataType: 'uint8',
      data: new Uint8Array(16).buffer,
    });

    (mockGL.getParameter as ReturnType<typeof vi.fn>).mockClear();
    (mockGL.drawArrays as ReturnType<typeof vi.fn>).mockClear();

    renderer.renderTiledImages([{ image, viewport: { x: 0, y: 0, width: 100, height: 100 } }]);

    // gl.getParameter(VIEWPORT) should NOT be called — early return before it
    expect(mockGL.getParameter).not.toHaveBeenCalled();
    expect(mockGL.drawArrays).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Stale texture detection after context restore
  // -----------------------------------------------------------------------

  it('should re-upload texture when gl.isTexture returns false after context restore', () => {
    const image = new IPImage({
      width: 2,
      height: 2,
      channels: 4,
      dataType: 'uint8',
      data: new Uint8Array(16).buffer,
    });

    // First render — uploads texture normally
    renderer.renderImage(image);

    // Simulate the image already having a texture handle (truthy) and
    // textureNeedsUpdate = false — this is the stale-handle scenario
    expect(image.texture).toBeTruthy();
    image.textureNeedsUpdate = false;

    // Lose and restore context
    canvas.dispatchEvent(new Event('webglcontextlost'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    // After restore, gl.isTexture should return false for old handles
    (mockGL.isTexture as ReturnType<typeof vi.fn>).mockReturnValue(false);

    // Clear texImage2D to track whether a re-upload occurs
    (mockGL.texImage2D as ReturnType<typeof vi.fn>).mockClear();

    renderer.renderImage(image);

    // The stale texture should trigger a re-upload via updateTexture
    expect(mockGL.texImage2D).toHaveBeenCalled();

    // Reset isTexture to default for subsequent tests
    (mockGL.isTexture as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });
});
