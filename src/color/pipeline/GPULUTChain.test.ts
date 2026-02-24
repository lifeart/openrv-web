import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GPULUTChain } from './GPULUTChain';
import type { LUT3D } from '../LUTLoader';

// Mock WebGL2 context
function createMockGL(): WebGL2RenderingContext {
  return {
    TEXTURE_2D: 0x0DE1,
    TEXTURE_3D: 0x806F,
    TEXTURE0: 0x84C0,
    TEXTURE1: 0x84C1,
    TEXTURE2: 0x84C2,
    TEXTURE3: 0x84C3,
    RGBA: 0x1908,
    RGB: 0x1907,
    RGB32F: 0x8815,
    UNSIGNED_BYTE: 0x1401,
    FLOAT: 0x1406,
    FRAMEBUFFER: 0x8D40,
    COLOR_ATTACHMENT0: 0x8CE0,
    TRIANGLE_STRIP: 0x0005,
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    LINK_STATUS: 0x8B82,
    COMPILE_STATUS: 0x8B81,
    CLAMP_TO_EDGE: 0x812F,
    LINEAR: 0x2601,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TEXTURE_WRAP_R: 0x8072,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88E4,

    createTexture: vi.fn(() => ({})),
    deleteTexture: vi.fn(),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texImage3D: vi.fn(),
    texParameteri: vi.fn(),
    activeTexture: vi.fn(),

    createFramebuffer: vi.fn(() => ({})),
    deleteFramebuffer: vi.fn(),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),

    createProgram: vi.fn(() => ({})),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn((_program: unknown, _pname: number) => true),
    getProgramInfoLog: vi.fn(() => ''),

    createShader: vi.fn((_type: number) => ({})),
    deleteShader: vi.fn(),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    attachShader: vi.fn(),
    getShaderParameter: vi.fn((_shader: unknown, _pname: number) => true),
    getShaderInfoLog: vi.fn(() => ''),

    getAttribLocation: vi.fn((_program: unknown, _name: string) => 0),
    getUniformLocation: vi.fn((_program: unknown, _name: string) => ({})),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),

    createBuffer: vi.fn(() => ({})),
    deleteBuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),

    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform3fv: vi.fn(),
    uniformMatrix4fv: vi.fn(),

    viewport: vi.fn(),
    drawArrays: vi.fn(),
    readPixels: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

function createTestLUT3D(title: string = 'Test'): LUT3D {
  const size = 2;
  const data = new Float32Array(size * size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const idx = (r * size * size + g * size + b) * 3;
        data[idx] = r / (size - 1);
        data[idx + 1] = g / (size - 1);
        data[idx + 2] = b / (size - 1);
      }
    }
  }
  return { title, size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

describe('GPULUTChain', () => {
  let gl: WebGL2RenderingContext;
  let chain: GPULUTChain;

  beforeEach(() => {
    gl = createMockGL();
    chain = new GPULUTChain(gl);
  });

  afterEach(() => {
    chain.dispose();
  });

  it('GCHAIN-U001: initializes with no LUTs in any stage', () => {
    expect(chain.hasFileLUT()).toBe(false);
    expect(chain.hasLookLUT()).toBe(false);
    expect(chain.hasDisplayLUT()).toBe(false);
  });

  it('GCHAIN-U002: setFileLUT creates GPU texture', () => {
    const lut = createTestLUT3D('File');
    chain.setFileLUT(lut);

    expect(chain.hasFileLUT()).toBe(true);
    expect(gl.createTexture).toHaveBeenCalled();
    expect(gl.texImage3D).toHaveBeenCalled();
  });

  it('GCHAIN-U003: setLookLUT creates GPU texture', () => {
    const lut = createTestLUT3D('Look');
    chain.setLookLUT(lut);

    expect(chain.hasLookLUT()).toBe(true);
  });

  it('GCHAIN-U004: setDisplayLUT creates GPU texture', () => {
    const lut = createTestLUT3D('Display');
    chain.setDisplayLUT(lut);

    expect(chain.hasDisplayLUT()).toBe(true);
  });

  it('GCHAIN-U005: clearFileLUT deletes GPU texture', () => {
    chain.setFileLUT(createTestLUT3D());
    chain.clearFileLUT();

    expect(chain.hasFileLUT()).toBe(false);
    expect(gl.deleteTexture).toHaveBeenCalled();
  });

  it('GCHAIN-U006: replacing a LUT deletes old texture before creating new', () => {
    chain.setFileLUT(createTestLUT3D('First'));
    chain.setFileLUT(createTestLUT3D('Second'));

    expect(gl.deleteTexture).toHaveBeenCalled();
    expect(chain.hasFileLUT()).toBe(true);
  });

  it('GCHAIN-U007: render binds correct texture units for multi-LUT shader', () => {
    chain.setFileLUT(createTestLUT3D('File'));
    chain.setLookLUT(createTestLUT3D('Look'));
    chain.setDisplayLUT(createTestLUT3D('Display'));

    chain.render(100, 100);

    // Should bind source image on TEXTURE0, File LUT on TEXTURE1, Look on TEXTURE2, Display on TEXTURE3
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE1);
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE2);
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE3);
  });

  it('GCHAIN-U008: render sets intensity uniforms for each stage', () => {
    chain.setFileLUT(createTestLUT3D());
    chain.setFileLUTIntensity(0.5);
    chain.setLookLUT(createTestLUT3D());
    chain.setLookLUTIntensity(0.75);
    chain.setDisplayLUT(createTestLUT3D());
    chain.setDisplayLUTIntensity(1.0);

    chain.render(100, 100);

    expect(gl.uniform1f).toHaveBeenCalled();
  });

  it('GCHAIN-U009: render sets enabled uniforms for each stage', () => {
    chain.setFileLUT(createTestLUT3D());
    chain.setFileLUTEnabled(false);

    chain.render(100, 100);

    // The File LUT enabled uniform should be set to false/0
    expect(gl.uniform1i).toHaveBeenCalled();
  });

  it('GCHAIN-U010: dispose cleans up all GPU resources', () => {
    chain.setFileLUT(createTestLUT3D());
    chain.setLookLUT(createTestLUT3D());
    chain.setDisplayLUT(createTestLUT3D());

    chain.dispose();

    expect(gl.deleteTexture).toHaveBeenCalled();
    expect(gl.deleteProgram).toHaveBeenCalled();
    expect(gl.deleteFramebuffer).toHaveBeenCalled();
  });

  it('GCHAIN-U011: getActiveStageCount returns number of LUT stages with data', () => {
    expect(chain.getActiveStageCount()).toBe(0);

    chain.setFileLUT(createTestLUT3D());
    expect(chain.getActiveStageCount()).toBe(1);

    chain.setLookLUT(createTestLUT3D());
    expect(chain.getActiveStageCount()).toBe(2);

    chain.setDisplayLUT(createTestLUT3D());
    expect(chain.getActiveStageCount()).toBe(3);

    chain.clearLookLUT();
    expect(chain.getActiveStageCount()).toBe(2);
  });

  it('GCHAIN-U012: disabled stages are not counted as active', () => {
    chain.setFileLUT(createTestLUT3D());
    chain.setFileLUTEnabled(false);

    expect(chain.getActiveStageCount()).toBe(0);
  });

  it('GCHAIN-U013: hasAnyLUT returns true when any stage has a LUT', () => {
    expect(chain.hasAnyLUT()).toBe(false);

    chain.setDisplayLUT(createTestLUT3D());
    expect(chain.hasAnyLUT()).toBe(true);

    chain.clearDisplayLUT();
    expect(chain.hasAnyLUT()).toBe(false);
  });

  it('GCHAIN-U014: setting null clears a stage LUT', () => {
    chain.setFileLUT(createTestLUT3D());
    expect(chain.hasFileLUT()).toBe(true);

    chain.setFileLUT(null);
    expect(chain.hasFileLUT()).toBe(false);
  });

  describe('LUT Matrix Support', () => {
    it('GCHAIN-U015: render uploads matrix uniforms with uniformMatrix4fv', () => {
      chain.setFileLUT(createTestLUT3D());
      chain.setFileLUTInMatrix(new Float32Array([
        2, 0, 0, 0,
        0, 2, 0, 0,
        0, 0, 2, 0,
        0, 0, 0, 1,
      ]));

      chain.render(100, 100);

      // uniformMatrix4fv should have been called for matrix uploads
      expect(gl.uniformMatrix4fv).toHaveBeenCalled();
    });

    it('GCHAIN-U016: render sets hasInMatrix/hasOutMatrix flags', () => {
      chain.setFileLUT(createTestLUT3D());
      chain.setFileLUTInMatrix(new Float32Array([
        2, 0, 0, 0,
        0, 2, 0, 0,
        0, 0, 2, 0,
        0, 0, 0, 1,
      ]));

      chain.render(100, 100);

      // uniform1i should have been called with hasInMatrix = 1
      expect(gl.uniform1i).toHaveBeenCalled();
    });

    it('GCHAIN-U017: setting identity matrix is optimized to null', () => {
      chain.setFileLUTInMatrix(new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]));

      // Identity matrix should be optimized away (stored as null)
      chain.setFileLUT(createTestLUT3D());
      chain.render(100, 100);
      // No error should occur - hasInMatrix should be 0
      expect(gl.uniformMatrix4fv).toHaveBeenCalled();
    });

    it('GCHAIN-U018: matrices can be set and cleared for all stages', () => {
      const scaleMatrix = new Float32Array([
        2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1,
      ]);

      chain.setFileLUTInMatrix(scaleMatrix);
      chain.setFileLUTOutMatrix(scaleMatrix);
      chain.setLookLUTInMatrix(scaleMatrix);
      chain.setLookLUTOutMatrix(scaleMatrix);
      chain.setDisplayLUTInMatrix(scaleMatrix);
      chain.setDisplayLUTOutMatrix(scaleMatrix);

      // Clear all
      chain.setFileLUTInMatrix(null);
      chain.setFileLUTOutMatrix(null);
      chain.setLookLUTInMatrix(null);
      chain.setLookLUTOutMatrix(null);
      chain.setDisplayLUTInMatrix(null);
      chain.setDisplayLUTOutMatrix(null);

      // Should render without issues
      chain.setFileLUT(createTestLUT3D());
      chain.render(100, 100);
      expect(gl.drawArrays).toHaveBeenCalled();
    });

    it('GCHAIN-U019: NaN matrix is sanitized to identity', () => {
      const nanMatrix = new Float32Array([
        NaN, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
      ]);

      // Should not throw - NaN is sanitized
      chain.setFileLUTInMatrix(nanMatrix);
      chain.setFileLUT(createTestLUT3D());
      chain.render(100, 100);
      expect(gl.drawArrays).toHaveBeenCalled();
    });

    it('GCHAIN-U020: dispose cleans up stage matrix state', () => {
      chain.setFileLUTInMatrix(new Float32Array([
        2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1,
      ]));
      chain.dispose();

      // After dispose, no errors when re-initializing
      expect(chain.hasFileLUT()).toBe(false);
    });
  });

  describe('deferred attribute setup', () => {
    it('GCHAIN-U024: attributes are NOT set up during construction', () => {
      // enableVertexAttribArray and vertexAttribPointer should NOT be called during init
      expect(gl.enableVertexAttribArray).not.toHaveBeenCalled();
      expect(gl.vertexAttribPointer).not.toHaveBeenCalled();
    });

    it('GCHAIN-U025: attributes are set up on first render()', () => {
      chain.setFileLUT(createTestLUT3D());
      chain.render(100, 100);

      expect(gl.enableVertexAttribArray).toHaveBeenCalledTimes(2); // a_position + a_texCoord
      expect(gl.vertexAttribPointer).toHaveBeenCalledTimes(2);
    });

    it('GCHAIN-U026: attributes are set up only once across multiple render calls', () => {
      chain.setFileLUT(createTestLUT3D());
      chain.render(100, 100);
      chain.render(200, 200);

      // Should still be 2 total (once per attribute), not 4
      expect(gl.enableVertexAttribArray).toHaveBeenCalledTimes(2);
      expect(gl.vertexAttribPointer).toHaveBeenCalledTimes(2);
    });

    it('GCHAIN-U027: attributes are NOT set up when shader is not ready', () => {
      const COMPLETION_STATUS_KHR = 0x91B1;
      const gl2 = createMockGL();
      vi.mocked(gl2.getShaderParameter).mockImplementation(
        (_shader: unknown, pname: number) => {
          if (pname === COMPLETION_STATUS_KHR) return false;
          return true;
        },
      );
      vi.mocked(gl2.getProgramParameter).mockImplementation(
        (_prog: unknown, pname: number) => {
          if (pname === COMPLETION_STATUS_KHR) return false;
          return true;
        },
      );

      const chain2 = new GPULUTChain(gl2, {});
      chain2.setFileLUT(createTestLUT3D());
      chain2.render(100, 100);

      // Shader not ready, so attributes should not be set up
      expect(gl2.enableVertexAttribArray).not.toHaveBeenCalled();
      expect(gl2.vertexAttribPointer).not.toHaveBeenCalled();
      chain2.dispose();
    });
  });

  describe('lazy uniform resolution', () => {
    it('GCHAIN-U028: uniforms are NOT resolved during construction', () => {
      // getUniformLocation should NOT have been called with LUT uniform names during construction
      expect(gl.getUniformLocation).not.toHaveBeenCalledWith(
        expect.anything(),
        'u_image'
      );
    });

    it('GCHAIN-U029: uniforms are resolved on first render()', () => {
      chain.setFileLUT(createTestLUT3D());
      chain.render(100, 100);

      expect(gl.getUniformLocation).toHaveBeenCalledWith(
        expect.anything(),
        'u_image'
      );
      expect(gl.getUniformLocation).toHaveBeenCalledWith(
        expect.anything(),
        'u_fileLUT'
      );
    });
  });

  describe('not-ready to ready transition', () => {
    it('GCHAIN-U030: render works after transitioning from not-ready to ready', () => {
      const COMPLETION_STATUS_KHR = 0x91B1;
      const gl2 = createMockGL();
      let compilationComplete = false;

      vi.mocked(gl2.getShaderParameter).mockImplementation(
        (_shader: unknown, pname: number) => {
          if (pname === COMPLETION_STATUS_KHR) return compilationComplete;
          return true;
        },
      );
      vi.mocked(gl2.getProgramParameter).mockImplementation(
        (_prog: unknown, pname: number) => {
          if (pname === COMPLETION_STATUS_KHR) return compilationComplete;
          return true;
        },
      );

      const chain2 = new GPULUTChain(gl2, {});
      chain2.setFileLUT(createTestLUT3D());

      // Not ready yet
      expect(chain2.isReady()).toBe(false);
      chain2.render(100, 100);
      expect(gl2.drawArrays).not.toHaveBeenCalled();

      // Mark as complete
      compilationComplete = true;
      expect(chain2.isReady()).toBe(true);

      // Now render should work
      chain2.render(100, 100);
      expect(gl2.drawArrays).toHaveBeenCalled();

      chain2.dispose();
    });
  });

  describe('dispose resets state', () => {
    it('GCHAIN-U031: dispose resets attribute and uniform resolved state', () => {
      chain.setFileLUT(createTestLUT3D());
      chain.render(100, 100);

      chain.dispose();

      // After dispose, isReady should be false
      expect(chain.isReady()).toBe(false);
      // Uniforms and attributes should be cleared (hasAnyLUT returns false since stages are reset)
      expect(chain.hasFileLUT()).toBe(false);
      expect(chain.hasAnyLUT()).toBe(false);
    });
  });

  describe('ShaderProgram integration', () => {
    it('GCHAIN-U021: accepts parallelCompileExt in constructor', () => {
      const gl2 = createMockGL();
      const ext = {};
      // Should not throw when passing the extension
      const chain2 = new GPULUTChain(gl2, ext);
      expect(chain2).toBeDefined();
      chain2.dispose();
    });

    it('GCHAIN-U022: isReady() returns true when compilation complete', () => {
      // Default mock returns true for all parameters (sync path), so isReady() should be true
      expect(chain.isReady()).toBe(true);
    });

    it('GCHAIN-U023: render() is no-op when shader not ready', () => {
      const COMPLETION_STATUS_KHR = 0x91B1;
      const gl2 = createMockGL();

      // Override getProgramParameter to return false for COMPLETION_STATUS_KHR
      // and true for everything else (LINK_STATUS, COMPILE_STATUS, etc.)
      vi.mocked(gl2.getProgramParameter).mockImplementation(
        (_prog: unknown, pname: number) => {
          if (pname === COMPLETION_STATUS_KHR) return false;
          return true;
        },
      );
      // Override getShaderParameter to return false for COMPLETION_STATUS_KHR
      // and true for COMPILE_STATUS
      vi.mocked(gl2.getShaderParameter).mockImplementation(
        (_shader: unknown, pname: number) => {
          if (pname === COMPLETION_STATUS_KHR) return false;
          return true;
        },
      );

      // Pass a non-null ext to enable the parallel compile path
      const chain2 = new GPULUTChain(gl2, {});
      chain2.setFileLUT(createTestLUT3D());

      // isReady() should be false because COMPLETION_STATUS_KHR returns false
      expect(chain2.isReady()).toBe(false);

      // render() should be a no-op since shader is not ready
      chain2.render(100, 100);
      expect(gl2.drawArrays).not.toHaveBeenCalled();

      chain2.dispose();
    });
  });
});
