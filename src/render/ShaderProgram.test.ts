import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShaderProgram } from './ShaderProgram';

// Create a minimal mock WebGL2RenderingContext
function createMockGL() {
  const program = {};
  const shader = {};
  const gl = {
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    COMPILE_STATUS: 0x8B81,
    LINK_STATUS: 0x8B82,
    createShader: vi.fn(() => shader),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    createProgram: vi.fn(() => program),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn(() => 1), // Return non-null location
    getAttribLocation: vi.fn(() => 0),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform1fv: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniform4fv: vi.fn(),
    uniform1iv: vi.fn(),
    uniform2iv: vi.fn(),
    uniform3iv: vi.fn(),
    uniform4iv: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    uniformMatrix4fv: vi.fn(),
  } as unknown as WebGL2RenderingContext;
  return gl;
}

describe('ShaderProgram', () => {
  let gl: ReturnType<typeof createMockGL>;
  let sp: ShaderProgram;

  beforeEach(() => {
    gl = createMockGL();
    sp = new ShaderProgram(gl, 'void main(){}', 'void main(){}');
  });

  describe('setUniform - number[] passthrough for vectors (GC pressure)', () => {
    it('SP-001: number[] length 2 calls uniform2fv directly without wrapping', () => {
      const arr = [1.0, 2.0];
      sp.setUniform('u_test', arr);
      expect(gl.uniform2fv).toHaveBeenCalledWith(expect.anything(), arr);
    });

    it('SP-002: number[] length 3 calls uniform3fv directly', () => {
      const arr = [1.0, 2.0, 3.0];
      sp.setUniform('u_test', arr);
      expect(gl.uniform3fv).toHaveBeenCalledWith(expect.anything(), arr);
    });

    it('SP-003: number[] length 4 calls uniform4fv directly', () => {
      const arr = [1.0, 2.0, 3.0, 4.0];
      sp.setUniform('u_test', arr);
      expect(gl.uniform4fv).toHaveBeenCalledWith(expect.anything(), arr);
    });

    it('SP-004: Float32Array bypasses wrapping', () => {
      const arr = new Float32Array([1.0, 2.0, 3.0]);
      sp.setUniform('u_test', arr);
      expect(gl.uniform3fv).toHaveBeenCalledWith(expect.anything(), arr);
    });

    it('SP-005: number[] length 9 wraps in Float32Array for matrix', () => {
      const arr = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      sp.setUniform('u_test', arr);
      expect(gl.uniformMatrix3fv).toHaveBeenCalled();
      const call = (gl.uniformMatrix3fv as any).mock.calls[0];
      expect(call[2]).toBeInstanceOf(Float32Array);
    });

    it('SP-006: number[] length 16 wraps in Float32Array for matrix', () => {
      const arr = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      sp.setUniform('u_test', arr);
      expect(gl.uniformMatrix4fv).toHaveBeenCalled();
      const call = (gl.uniformMatrix4fv as any).mock.calls[0];
      expect(call[2]).toBeInstanceOf(Float32Array);
    });

    it('SP-007: Int32Array length 4 calls uniform4iv', () => {
      const arr = new Int32Array([0, 1, 2, 3]);
      sp.setUniform('u_test', arr);
      expect(gl.uniform4iv).toHaveBeenCalledWith(expect.anything(), arr);
    });

    it('SP-008: number[] length 1 calls uniform1fv directly', () => {
      const arr = [42.0];
      sp.setUniform('u_test', arr);
      expect(gl.uniform1fv).toHaveBeenCalledWith(expect.anything(), arr);
    });
  });

  describe('setUniform - pre-allocated matrix buffer reuse (GC pressure)', () => {
    it('SP-009: number[] length 9 reuses the same Float32Array buffer across calls', () => {
      const arr1 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const arr2 = [2, 0, 0, 0, 2, 0, 0, 0, 2];
      sp.setUniform('u_mat3a', arr1);
      sp.setUniform('u_mat3b', arr2);
      const call1 = (gl.uniformMatrix3fv as any).mock.calls[0];
      const call2 = (gl.uniformMatrix3fv as any).mock.calls[1];
      // Both calls should pass the exact same Float32Array instance (the pre-allocated mat3Buffer)
      expect(call1[2]).toBe(call2[2]);
    });

    it('SP-010: number[] length 16 reuses the same Float32Array buffer across calls', () => {
      const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const scaled = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1];
      sp.setUniform('u_mat4a', identity);
      sp.setUniform('u_mat4b', scaled);
      const call1 = (gl.uniformMatrix4fv as any).mock.calls[0];
      const call2 = (gl.uniformMatrix4fv as any).mock.calls[1];
      // Both calls should pass the exact same Float32Array instance (the pre-allocated mat4Buffer)
      expect(call1[2]).toBe(call2[2]);
    });

    it('SP-011: Float32Array length 9 passes through without copying to pre-allocated buffer', () => {
      const original = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      sp.setUniform('u_mat3', original);
      const call = (gl.uniformMatrix3fv as any).mock.calls[0];
      // Should pass the original Float32Array directly, not the internal buffer
      expect(call[2]).toBe(original);
    });

    it('SP-012: Float32Array length 16 passes through without copying to pre-allocated buffer', () => {
      const original = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      sp.setUniform('u_mat4', original);
      const call = (gl.uniformMatrix4fv as any).mock.calls[0];
      // Should pass the original Float32Array directly, not the internal buffer
      expect(call[2]).toBe(original);
    });
  });

  describe('setUniformMatrix3 - pre-allocated buffer reuse', () => {
    it('SP-013: number[] uses the pre-allocated mat3Buffer', () => {
      const arr = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      sp.setUniformMatrix3('u_mat3', arr);
      const call = (gl.uniformMatrix3fv as any).mock.calls[0];
      expect(call[2]).toBeInstanceOf(Float32Array);
      // Verify it contains the correct values
      expect(Array.from(call[2] as Float32Array)).toEqual(arr);
    });

    it('SP-014: number[] reuses the same buffer instance on repeated calls', () => {
      sp.setUniformMatrix3('u_mat3', [1, 0, 0, 0, 1, 0, 0, 0, 1]);
      sp.setUniformMatrix3('u_mat3', [2, 0, 0, 0, 2, 0, 0, 0, 2]);
      const call1 = (gl.uniformMatrix3fv as any).mock.calls[0];
      const call2 = (gl.uniformMatrix3fv as any).mock.calls[1];
      expect(call1[2]).toBe(call2[2]);
    });

    it('SP-015: Float32Array passes through without copying', () => {
      const original = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      sp.setUniformMatrix3('u_mat3', original);
      const call = (gl.uniformMatrix3fv as any).mock.calls[0];
      expect(call[2]).toBe(original);
    });
  });

  describe('setUniformMatrix4 - pre-allocated buffer reuse', () => {
    it('SP-016: number[] uses the pre-allocated mat4Buffer', () => {
      const arr = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      sp.setUniformMatrix4('u_mat4', arr);
      const call = (gl.uniformMatrix4fv as any).mock.calls[0];
      expect(call[2]).toBeInstanceOf(Float32Array);
      // Verify it contains the correct values
      expect(Array.from(call[2] as Float32Array)).toEqual(arr);
    });

    it('SP-017: number[] reuses the same buffer instance on repeated calls', () => {
      sp.setUniformMatrix4('u_mat4', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      sp.setUniformMatrix4('u_mat4', [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]);
      const call1 = (gl.uniformMatrix4fv as any).mock.calls[0];
      const call2 = (gl.uniformMatrix4fv as any).mock.calls[1];
      expect(call1[2]).toBe(call2[2]);
    });

    it('SP-018: Float32Array passes through without copying', () => {
      const original = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      sp.setUniformMatrix4('u_mat4', original);
      const call = (gl.uniformMatrix4fv as any).mock.calls[0];
      expect(call[2]).toBe(original);
    });
  });

  describe('handle getter', () => {
    it('SP-019: handle returns the underlying WebGLProgram', () => {
      const program = gl.createProgram();
      // The program returned by createMockGL is always the same object
      expect(sp.handle).toBe(program);
    });
  });

  describe('program cleanup on failure', () => {
    it('SP-020: sync path deletes program on link failure', () => {
      const failGL = createMockGL();
      vi.mocked(failGL.getProgramParameter).mockReturnValue(false);
      vi.mocked(failGL.getProgramInfoLog).mockReturnValue('link error');

      expect(() => new ShaderProgram(failGL, 'void main(){}', 'void main(){}')).toThrow('Shader program link error');
      expect(failGL.deleteProgram).toHaveBeenCalledTimes(1);
    });

    it('SP-021: sync path deletes program on compile failure', () => {
      const failGL = createMockGL();
      vi.mocked(failGL.getShaderParameter).mockReturnValue(false);
      vi.mocked(failGL.getShaderInfoLog).mockReturnValue('compile error');

      expect(() => new ShaderProgram(failGL, 'bad', 'bad')).toThrow('Shader compile error');
      expect(failGL.deleteProgram).toHaveBeenCalledTimes(1);
    });

    it('SP-022: sync path cleans up shaders on link failure', () => {
      const failGL = createMockGL();
      vi.mocked(failGL.getProgramParameter).mockReturnValue(false);

      expect(() => new ShaderProgram(failGL, 'void main(){}', 'void main(){}')).toThrow();
      // 2 shaders created, both should be deleted in the finally block
      expect(failGL.deleteShader).toHaveBeenCalledTimes(2);
    });

    it('SP-023: parallel path deletes program on link failure', () => {
      const failGL = createMockGL();
      const parallelExt = {};

      // During construction: getShaderParameter returns true (for COMPILE_STATUS
      // in createAndCompileShader — but parallel path doesn't query it).
      // We need COMPLETION_STATUS_KHR to return false initially so isReady()
      // correctly returns false on the first call.
      vi.mocked(failGL.getShaderParameter).mockReturnValue(false);
      vi.mocked(failGL.getProgramParameter).mockReturnValue(false);

      const program = new ShaderProgram(failGL, 'void main(){}', 'void main(){}', parallelExt);
      expect(program.isReady()).toBe(false);

      // Now simulate compilation complete but link failure
      vi.mocked(failGL.getShaderParameter).mockImplementation((_shader, pname) => {
        if (pname === 0x91B1) return true;   // COMPLETION_STATUS_KHR
        if (pname === 0x8B81) return true;    // COMPILE_STATUS → pass
        return true;
      });
      vi.mocked(failGL.getProgramParameter).mockImplementation((_prog, pname) => {
        if (pname === 0x91B1) return true;  // COMPLETION_STATUS_KHR
        if (pname === 0x8B82) return false;  // LINK_STATUS → fail
        return true;
      });
      vi.mocked(failGL.getProgramInfoLog).mockReturnValue('link error');

      expect(() => program.isReady()).toThrow('Shader program link error');
      expect(failGL.deleteProgram).toHaveBeenCalledTimes(1);
    });

    it('SP-024: parallel path deletes program on compile failure', () => {
      const failGL = createMockGL();
      const parallelExt = {};

      // COMPLETION_STATUS_KHR returns false during construction
      vi.mocked(failGL.getShaderParameter).mockReturnValue(false);
      vi.mocked(failGL.getProgramParameter).mockReturnValue(false);

      const program = new ShaderProgram(failGL, 'void main(){}', 'void main(){}', parallelExt);

      // Now simulate compilation complete but vertex shader compile failure
      vi.mocked(failGL.getShaderParameter).mockImplementation((_shader, pname) => {
        if (pname === 0x91B1) return true;   // COMPLETION_STATUS_KHR
        if (pname === 0x8B81) return false;   // COMPILE_STATUS → fail
        return true;
      });
      vi.mocked(failGL.getProgramParameter).mockImplementation((_prog, pname) => {
        if (pname === 0x91B1) return true;  // COMPLETION_STATUS_KHR
        return true;
      });
      vi.mocked(failGL.getShaderInfoLog).mockReturnValue('compile error');

      expect(() => program.isReady()).toThrow('Shader compile error');
      expect(failGL.deleteProgram).toHaveBeenCalledTimes(1);
    });

    it('SP-025: parallel path cleans up shaders regardless of failure', () => {
      const failGL = createMockGL();
      const parallelExt = {};

      // COMPLETION_STATUS_KHR returns false during construction
      vi.mocked(failGL.getShaderParameter).mockReturnValue(false);
      vi.mocked(failGL.getProgramParameter).mockReturnValue(false);

      const program = new ShaderProgram(failGL, 'void main(){}', 'void main(){}', parallelExt);
      failGL.deleteShader = vi.fn(); // reset after constructor

      // Simulate completion with link failure
      vi.mocked(failGL.getShaderParameter).mockImplementation((_shader, pname) => {
        if (pname === 0x91B1) return true;   // COMPLETION_STATUS_KHR
        if (pname === 0x8B81) return true;    // COMPILE_STATUS → pass
        return true;
      });
      vi.mocked(failGL.getProgramParameter).mockImplementation((_prog, pname) => {
        if (pname === 0x91B1) return true;
        if (pname === 0x8B82) return false;
        return true;
      });

      expect(() => program.isReady()).toThrow();
      // Both shaders should be deleted in the finally block
      expect(failGL.deleteShader).toHaveBeenCalledTimes(2);
    });
  });
});
