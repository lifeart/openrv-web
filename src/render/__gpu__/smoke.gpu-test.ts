import { describe, it, expect } from 'vitest';

describe('GPU Smoke Test', () => {
  it('creates a WebGL2 context on a real canvas', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const gl = canvas.getContext('webgl2');
    expect(gl).not.toBeNull();
    expect(gl!.getParameter(gl!.VERSION)).toContain('WebGL 2.0');
  });

  it('compiles a trivial GLSL shader', () => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2')!;
    const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(shader, `#version 300 es
      precision highp float;
      out vec4 fragColor;
      void main() { fragColor = vec4(1.0, 0.0, 0.0, 1.0); }
    `);
    gl.compileShader(shader);
    expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS)).toBe(true);
    gl.deleteShader(shader);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  });
});
