/**
 * CompositingRenderer Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CompositingRenderer,
  type CompositeLayerDescriptor,
  getCompositeModeCode,
  isGLBlendStateMode,
  COMPOSITE_MODE_OVER,
  COMPOSITE_MODE_REPLACE,
  COMPOSITE_MODE_ADD,
  COMPOSITE_MODE_DIFFERENCE,
} from './CompositingRenderer';

// --- Minimal WebGL2 mock ---

function createMockGL(): WebGL2RenderingContext & { _calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {};

  let textureId = 100;
  let fboId = 200;
  let bufferId = 300;
  let shaderId = 400;
  let programId = 500;
  let vaoId = 600;

  const gl = {
    // Constants
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    RGBA: 0x1908,
    RGBA8: 0x8058,
    RGBA16F: 0x881a,
    UNSIGNED_BYTE: 0x1401,
    HALF_FLOAT: 0x140b,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    NEAREST: 0x2600,
    CLAMP_TO_EDGE: 0x812f,
    FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0,
    COLOR_BUFFER_BIT: 0x00004000,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    BLEND: 0x0be2,
    ONE: 1,
    ZERO: 0,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    FUNC_ADD: 0x8006,
    TRIANGLE_STRIP: 0x0005,
    SCISSOR_TEST: 0x0c11,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    INVALID_INDEX: 0xffffffff,
    FLOAT: 0x1406,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    UNIFORM_BUFFER: 0x8a11,
    DYNAMIC_DRAW: 0x88e8,

    createTexture: vi.fn(() => textureId++ as unknown as WebGLTexture),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    deleteTexture: vi.fn(),
    activeTexture: vi.fn(),

    createFramebuffer: vi.fn(() => fboId++ as unknown as WebGLFramebuffer),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 0x8cd5),
    deleteFramebuffer: vi.fn(),
    invalidateFramebuffer: vi.fn(),

    createBuffer: vi.fn(() => bufferId++ as unknown as WebGLBuffer),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bufferSubData: vi.fn(),
    bindBufferBase: vi.fn(),
    deleteBuffer: vi.fn(),

    createShader: vi.fn(() => shaderId++ as unknown as WebGLShader),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),

    createProgram: vi.fn(() => programId++ as unknown as WebGLProgram),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    useProgram: vi.fn(),
    deleteProgram: vi.fn(),
    getUniformLocation: vi.fn((_, name: string) => ({ name })),
    getUniformBlockIndex: vi.fn(() => 0xffffffff),
    uniformBlockBinding: vi.fn(),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniform4fv: vi.fn(),
    uniform1fv: vi.fn(),

    createVertexArray: vi.fn(() => vaoId++ as unknown as WebGLVertexArrayObject),
    bindVertexArray: vi.fn(),
    deleteVertexArray: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),

    drawArrays: vi.fn(),

    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    blendFuncSeparate: vi.fn(),
    scissor: vi.fn(),

    _calls: calls,
  };

  return gl as unknown as WebGL2RenderingContext & { _calls: Record<string, unknown[][]> };
}

describe('CompositingRenderer', () => {
  let renderer: CompositingRenderer;
  let gl: ReturnType<typeof createMockGL>;

  beforeEach(() => {
    renderer = new CompositingRenderer();
    gl = createMockGL();
    renderer.initialize(gl);
    renderer.setQuadVAO(gl.createVertexArray()!);
  });

  describe('getCompositeModeCode', () => {
    it('maps over to MODE_OVER (0)', () => {
      expect(getCompositeModeCode('over')).toBe(COMPOSITE_MODE_OVER);
    });

    it('maps normal to MODE_OVER (0)', () => {
      expect(getCompositeModeCode('normal')).toBe(COMPOSITE_MODE_OVER);
    });

    it('maps replace to MODE_REPLACE (1)', () => {
      expect(getCompositeModeCode('replace')).toBe(COMPOSITE_MODE_REPLACE);
    });

    it('maps add to MODE_ADD (2)', () => {
      expect(getCompositeModeCode('add')).toBe(COMPOSITE_MODE_ADD);
    });

    it('maps difference to MODE_DIFFERENCE (3)', () => {
      expect(getCompositeModeCode('difference')).toBe(COMPOSITE_MODE_DIFFERENCE);
    });

    it('maps unknown modes to MODE_OVER as fallback', () => {
      expect(getCompositeModeCode('unknown' as any)).toBe(COMPOSITE_MODE_OVER);
    });
  });

  describe('isGLBlendStateMode', () => {
    it('returns true for over', () => {
      expect(isGLBlendStateMode('over')).toBe(true);
    });

    it('returns true for normal', () => {
      expect(isGLBlendStateMode('normal')).toBe(true);
    });

    it('returns true for replace', () => {
      expect(isGLBlendStateMode('replace')).toBe(true);
    });

    it('returns true for add', () => {
      expect(isGLBlendStateMode('add')).toBe(true);
    });

    it('returns false for difference', () => {
      expect(isGLBlendStateMode('difference')).toBe(false);
    });

    it('returns false for multiply', () => {
      expect(isGLBlendStateMode('multiply')).toBe(false);
    });
  });

  describe('initialize', () => {
    it('marks the renderer as initialized', () => {
      expect(renderer.isInitialized()).toBe(true);
    });
  });

  describe('ensureLayerFBOs', () => {
    it('allocates FBOs successfully', () => {
      const result = renderer.ensureLayerFBOs(3, 1920, 1080);
      expect(result).toBe(true);
      expect(renderer.getLayerPool().size).toBe(3);
    });

    it('returns false when GL context is not set', () => {
      const uninitialized = new CompositingRenderer();
      expect(uninitialized.ensureLayerFBOs(2, 800, 600)).toBe(false);
    });
  });

  describe('dirty-flag caching', () => {
    it('marks a new layer as dirty', () => {
      expect(renderer.isLayerDirty(0, 'src1', 'hash1')).toBe(true);
    });

    it('marks a layer as clean after markLayerClean', () => {
      renderer.markLayerClean(0, 'src1', 'hash1');
      expect(renderer.isLayerDirty(0, 'src1', 'hash1')).toBe(false);
    });

    it('detects source key change', () => {
      renderer.markLayerClean(0, 'src1', 'hash1');
      expect(renderer.isLayerDirty(0, 'src2', 'hash1')).toBe(true);
    });

    it('detects state hash change', () => {
      renderer.markLayerClean(0, 'src1', 'hash1');
      expect(renderer.isLayerDirty(0, 'src1', 'hash2')).toBe(true);
    });

    it('invalidateAllCaches makes all layers dirty', () => {
      renderer.markLayerClean(0, 'src1', 'hash1');
      renderer.markLayerClean(1, 'src2', 'hash2');
      renderer.invalidateAllCaches();
      expect(renderer.isLayerDirty(0, 'src1', 'hash1')).toBe(true);
      expect(renderer.isLayerDirty(1, 'src2', 'hash2')).toBe(true);
    });
  });

  describe('compositeFrame', () => {
    function makeLayer(overrides?: Partial<CompositeLayerDescriptor>): CompositeLayerDescriptor {
      return {
        texture: gl.createTexture()!,
        blendMode: 'over',
        opacity: 1.0,
        visible: true,
        ...overrides,
      };
    }

    it('returns null for empty layers array', () => {
      const result = renderer.compositeFrame([], 800, 600);
      expect(result).toBeNull();
    });

    it('returns null when all layers are invisible', () => {
      const result = renderer.compositeFrame([makeLayer({ visible: false }), makeLayer({ visible: false })], 800, 600);
      expect(result).toBeNull();
    });

    it('returns null when all layers have zero opacity', () => {
      const result = renderer.compositeFrame([makeLayer({ opacity: 0 }), makeLayer({ opacity: 0 })], 800, 600);
      expect(result).toBeNull();
    });

    it('handles single visible layer (passthrough blit)', () => {
      const result = renderer.compositeFrame([makeLayer()], 800, 600);
      // Single layer uses passthrough blit, returns null (rendered to target directly)
      expect(result).toBeNull();
      // Should have drawn a quad
      expect(gl.drawArrays).toHaveBeenCalled();
    });

    it('composites two Over layers using GL blend state', () => {
      renderer.compositeFrame([makeLayer({ blendMode: 'over' }), makeLayer({ blendMode: 'over' })], 800, 600);
      // Should enable blending
      expect(gl.enable).toHaveBeenCalled();
      expect(gl.blendFunc).toHaveBeenCalled();
      // Should draw two quads
      expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    });

    it('composites Replace layers with blending disabled', () => {
      renderer.compositeFrame([makeLayer({ blendMode: 'replace' }), makeLayer({ blendMode: 'replace' })], 800, 600);
      // Replace disables blending
      expect(gl.disable).toHaveBeenCalled();
    });

    it('composites Add layers with GL_ONE, GL_ONE blend func', () => {
      renderer.compositeFrame([makeLayer({ blendMode: 'add' }), makeLayer({ blendMode: 'add' })], 800, 600);
      expect(gl.blendFunc).toHaveBeenCalledWith(gl.ONE, gl.ONE);
    });

    it('uses shader path for Difference mode', () => {
      // Difference requires the compositing shader
      renderer.compositeFrame(
        [makeLayer({ blendMode: 'difference' }), makeLayer({ blendMode: 'difference' })],
        800,
        600,
      );
      // Should have created a shader program for compositing
      expect(gl.createProgram).toHaveBeenCalled();
    });

    it('applies stencil box via scissor test in GL blend path', () => {
      renderer.compositeFrame(
        [makeLayer({ blendMode: 'over' }), makeLayer({ blendMode: 'over', stencilBox: [0.25, 0.75, 0.25, 0.75] })],
        800,
        600,
      );
      expect(gl.enable).toHaveBeenCalledWith(gl.SCISSOR_TEST);
      expect(gl.scissor).toHaveBeenCalled();
    });

    it('does not apply scissor for default stencil box [0,1,0,1]', () => {
      renderer.compositeFrame(
        [makeLayer({ blendMode: 'over' }), makeLayer({ blendMode: 'over', stencilBox: [0, 1, 0, 1] })],
        800,
        600,
      );
      // Should NOT have called scissor for a full-image stencil box
      expect(gl.scissor).not.toHaveBeenCalled();
    });

    it('filters out invisible layers', () => {
      renderer.compositeFrame(
        [
          makeLayer({ blendMode: 'over', visible: true }),
          makeLayer({ blendMode: 'over', visible: false }),
          makeLayer({ blendMode: 'over', visible: true }),
        ],
        800,
        600,
      );
      // Only 2 visible layers should be composited
      expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    });

    it('uses premultiplied alpha blend func by default', () => {
      renderer.compositeFrame([makeLayer({ blendMode: 'over' }), makeLayer({ blendMode: 'over' })], 800, 600);
      // Premultiplied over: blendFunc(ONE, ONE_MINUS_SRC_ALPHA)
      expect(gl.blendFunc).toHaveBeenCalledWith(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    });

    it('uses straight alpha blend func when premultiplied is false', () => {
      renderer.setPremultiplied(false);
      renderer.compositeFrame([makeLayer({ blendMode: 'over' }), makeLayer({ blendMode: 'over' })], 800, 600);
      // Straight alpha over: blendFuncSeparate
      expect(gl.blendFuncSeparate).toHaveBeenCalled();
    });

    it('handles mixed GL-blend and shader modes', () => {
      // First layer is Over (GL blend), second is Difference (shader)
      // The presence of Difference forces the shader path for all layers
      renderer.compositeFrame([makeLayer({ blendMode: 'over' }), makeLayer({ blendMode: 'difference' })], 800, 600);
      // Should have drawn quads (at least 2 for base + composited layer)
      expect(gl.drawArrays).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('releases all GPU resources', () => {
      renderer.ensureLayerFBOs(2, 800, 600);
      renderer.dispose();
      expect(renderer.isInitialized()).toBe(false);
    });

    it('is safe to call multiple times', () => {
      renderer.dispose();
      renderer.dispose(); // Should not throw
    });
  });
});
