/**
 * OCIOShaderTranslator Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  translateOCIOShader,
  injectOCIOUniforms,
  generateOCIOCallSnippet,
} from './OCIOShaderTranslator';
import type { UniformInfo } from './OCIOShaderTranslator';

// ---------------------------------------------------------------------------
// Sample OCIO shader fragments
// ---------------------------------------------------------------------------

const SAMPLE_OCIO_GLSL = `
#version 130
uniform sampler3D ocio_lut3d_Sampler;
uniform float ocio_lut3d_Size;

vec4 OCIODisplay(vec4 inPixel) {
  vec4 out_pixel = inPixel;
  vec3 coords = (out_pixel.rgb * (ocio_lut3d_Size - 1.0) + 0.5) / ocio_lut3d_Size;
  out_pixel.rgb = texture3D(ocio_lut3d_Sampler, coords).rgb;
  return out_pixel;
}
`;

const SAMPLE_MATRIX_GLSL = `
uniform mat4 ocio_matrix_0;
uniform vec4 ocio_offset_0;
uniform sampler2D ocio_lut1d_Sampler;

vec4 OCIOMain(vec4 inPixel) {
  vec4 out_pixel = ocio_matrix_0 * inPixel + ocio_offset_0;
  out_pixel.rgb = texture2D(ocio_lut1d_Sampler, vec2(out_pixel.r, 0.5)).rgb;
  return out_pixel;
}
`;

const FRAGCOLOR_GLSL = `
varying vec2 texCoord;
uniform sampler2D tex;

void main() {
  vec4 color = texture2D(tex, texCoord);
  gl_FragColor = color;
}
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OCIOShaderTranslator', () => {
  describe('translateOCIOShader', () => {
    it('SHDR-001: removes #version 130 directive', () => {
      const result = translateOCIOShader(SAMPLE_OCIO_GLSL);
      expect(result.code).not.toContain('#version 130');
    });

    it('SHDR-002: replaces texture3D with texture', () => {
      const result = translateOCIOShader(SAMPLE_OCIO_GLSL);
      expect(result.code).not.toContain('texture3D(');
      expect(result.code).toContain('texture(');
    });

    it('SHDR-003: replaces texture2D with texture', () => {
      const result = translateOCIOShader(SAMPLE_MATRIX_GLSL);
      expect(result.code).not.toContain('texture2D(');
      expect(result.code).toContain('texture(');
    });

    it('SHDR-004: extracts uniform declarations', () => {
      const result = translateOCIOShader(SAMPLE_OCIO_GLSL);
      expect(result.uniforms).toHaveLength(2);

      const sampler = result.uniforms.find(u => u.name === 'ocio_lut3d_Sampler');
      expect(sampler).toBeDefined();
      expect(sampler!.type).toBe('sampler3D');
      expect(sampler!.isSampler).toBe(true);

      const size = result.uniforms.find(u => u.name === 'ocio_lut3d_Size');
      expect(size).toBeDefined();
      expect(size!.type).toBe('float');
      expect(size!.isSampler).toBe(false);
    });

    it('SHDR-005: detects 3D LUT requirement', () => {
      const result = translateOCIOShader(SAMPLE_OCIO_GLSL);
      expect(result.requires3DLUT).toBe(true);
      expect(result.lut3dSize).toBe(65);
    });

    it('SHDR-006: no 3D LUT when only matrix + 1D', () => {
      const result = translateOCIOShader(SAMPLE_MATRIX_GLSL);
      expect(result.requires3DLUT).toBe(false);
      expect(result.lut3dSize).toBe(0);
    });

    it('SHDR-007: detects function name', () => {
      const result = translateOCIOShader(SAMPLE_OCIO_GLSL);
      expect(result.functionName).toBe('OCIODisplay');
    });

    it('SHDR-008: renames function when requested', () => {
      const result = translateOCIOShader(SAMPLE_MATRIX_GLSL, {
        functionName: 'OCIODisplay',
      });
      expect(result.functionName).toBe('OCIODisplay');
      expect(result.code).toContain('OCIODisplay(');
      expect(result.code).not.toContain('OCIOMain(');
    });

    it('SHDR-009: standalone mode adds version and precision', () => {
      const result = translateOCIOShader(SAMPLE_OCIO_GLSL, { standalone: true });
      expect(result.code).toContain('#version 300 es');
      expect(result.code).toContain('precision highp float');
      expect(result.code).toContain('precision highp sampler2D');
      expect(result.code).toContain('precision highp sampler3D');
    });

    it('SHDR-010: snippet mode does not add version', () => {
      const result = translateOCIOShader(SAMPLE_OCIO_GLSL, { standalone: false });
      expect(result.code).not.toContain('#version');
    });

    it('SHDR-011: replaces varying with in', () => {
      const result = translateOCIOShader(FRAGCOLOR_GLSL, { standalone: true });
      expect(result.code).toContain('in vec2 texCoord');
      expect(result.code).not.toContain('varying');
    });

    it('SHDR-012: replaces gl_FragColor with fragColor', () => {
      const result = translateOCIOShader(FRAGCOLOR_GLSL, { standalone: true });
      expect(result.code).toContain('fragColor');
      expect(result.code).not.toContain('gl_FragColor');
      expect(result.code).toContain('out vec4 fragColor');
    });

    it('SHDR-013: mediump precision option', () => {
      const result = translateOCIOShader(SAMPLE_OCIO_GLSL, {
        standalone: true,
        floatPrecision: 'mediump',
      });
      expect(result.code).toContain('precision mediump float');
    });

    it('SHDR-014: extracts matrix and vector uniforms', () => {
      const result = translateOCIOShader(SAMPLE_MATRIX_GLSL);
      const mat = result.uniforms.find(u => u.name === 'ocio_matrix_0');
      expect(mat).toBeDefined();
      expect(mat!.type).toBe('mat4');
      expect(mat!.isSampler).toBe(false);

      const offset = result.uniforms.find(u => u.name === 'ocio_offset_0');
      expect(offset).toBeDefined();
      expect(offset!.type).toBe('vec4');
    });

    it('SHDR-015: handles texture2DLod replacement', () => {
      const glsl = 'vec4 c = texture2DLod(sampler, uv, 0.0);';
      const result = translateOCIOShader(glsl);
      expect(result.code).toContain('textureLod(');
      expect(result.code).not.toContain('texture2DLod');
    });

    it('SHDR-016: handles textureCubeLod replacement', () => {
      const glsl = 'vec4 c = textureCubeLod(sampler, dir, 0.0);';
      const result = translateOCIOShader(glsl);
      expect(result.code).toContain('textureLod(');
      expect(result.code).not.toContain('textureCubeLod');
    });

    it('SHDR-017: handles empty shader input', () => {
      const result = translateOCIOShader('');
      expect(result.code).toBeDefined();
      expect(result.uniforms).toHaveLength(0);
      expect(result.requires3DLUT).toBe(false);
    });

    it('SHDR-018: handles #version 330 directive', () => {
      const glsl = '#version 330\nvec4 OCIODisplay(vec4 p) { return p; }';
      const result = translateOCIOShader(glsl, { standalone: true });
      expect(result.code).toContain('#version 300 es');
      expect(result.code).not.toContain('#version 330');
    });
  });

  describe('generateOCIOCallSnippet', () => {
    it('SHDR-CALL-001: generates a non-recursive wrapper', () => {
      const snippet = generateOCIOCallSnippet('OCIODisplay');
      expect(snippet).toContain('applyOCIO');
      expect(snippet).toContain('OCIODisplay(inColor)');
      // applyOCIO calls OCIODisplay, not itself
      expect(snippet).not.toContain('applyOCIO(inColor)');
    });

    it('SHDR-CALL-002: uses custom function name', () => {
      const snippet = generateOCIOCallSnippet('myTransform');
      expect(snippet).toContain('myTransform(inColor)');
    });
  });

  describe('injectOCIOUniforms', () => {
    const sampleShader = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
in vec2 v_texCoord;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture, v_texCoord);
}
`;
    it('SHDR-INJ-001: inserts uniforms after version line', () => {
      const uniforms: UniformInfo[] = [
        { name: 'ocio_lut3d_Sampler', type: 'sampler3D', isSampler: true },
        { name: 'ocio_lut3d_Size', type: 'float', isSampler: false },
      ];

      const result = injectOCIOUniforms(sampleShader, uniforms);
      expect(result).toContain('uniform sampler3D ocio_lut3d_Sampler;');
      expect(result).toContain('uniform float ocio_lut3d_Size;');
      expect(result).toContain('// --- OCIO uniforms ---');
    });

    it('SHDR-INJ-002: inserts after precision declarations', () => {
      const shader = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D u_tex;
`;
      const uniforms: UniformInfo[] = [
        { name: 'ocio_test', type: 'float', isSampler: false },
      ];

      const result = injectOCIOUniforms(shader, uniforms);
      // The OCIO uniforms should appear after the last precision line
      const precisionIdx = result.lastIndexOf('precision highp sampler3D;');
      const ocioIdx = result.indexOf('uniform float ocio_test;');
      expect(ocioIdx).toBeGreaterThan(precisionIdx);
    });

    it('SHDR-INJ-003: no-op for empty uniforms', () => {
      const result = injectOCIOUniforms(sampleShader, []);
      expect(result).toBe(sampleShader);
    });
  });
});
