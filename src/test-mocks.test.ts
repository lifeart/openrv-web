import { describe, it, expect } from 'vitest';
import { createMockWebGL2Context, createMockRendererGL } from '../test/mocks';

describe('Task 4.0: Mock KHR_parallel_shader_compile support', () => {
  it('MOCK-001: createMockWebGL2Context exposes COMPLETION_STATUS_KHR constant', () => {
    const gl = createMockWebGL2Context();
    expect((gl as any).COMPLETION_STATUS_KHR).toBe(0x91B1);
  });

  it('MOCK-002: createMockWebGL2Context.getExtension returns object for KHR_parallel_shader_compile', () => {
    const gl = createMockWebGL2Context();
    expect(gl.getExtension('KHR_parallel_shader_compile')).not.toBeNull();
  });

  it('MOCK-003: createMockWebGL2Context.getShaderParameter returns true for COMPLETION_STATUS_KHR', () => {
    const gl = createMockWebGL2Context();
    const shader = gl.createShader(gl.VERTEX_SHADER);
    expect(gl.getShaderParameter(shader, 0x91B1)).toBe(true);
  });

  it('MOCK-004: createMockWebGL2Context.getProgramParameter returns true for COMPLETION_STATUS_KHR', () => {
    const gl = createMockWebGL2Context();
    const program = gl.createProgram();
    expect(gl.getProgramParameter(program, 0x91B1)).toBe(true);
  });

  it('MOCK-005: createMockRendererGL exposes COMPLETION_STATUS_KHR constant', () => {
    const gl = createMockRendererGL();
    expect((gl as any).COMPLETION_STATUS_KHR).toBe(0x91B1);
  });

  it('MOCK-006: createMockRendererGL.getExtension returns object for KHR_parallel_shader_compile', () => {
    const gl = createMockRendererGL();
    expect(gl.getExtension('KHR_parallel_shader_compile')).not.toBeNull();
  });
});
