/**
 * ShaderPipeline Unit Tests - Partial Execution Methods
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShaderPipeline } from './ShaderPipeline';
import type { ShaderStageDescriptor, StageId } from './ShaderStage';
import type { InternalShaderState, TextureCallbacks } from './ShaderStateManager';

// --- Minimal WebGL2 mock ---

function createMockGL(): WebGL2RenderingContext {
  let textureId = 1;
  let fboId = 1;
  let shaderId = 1;
  let programId = 1;
  let bufferId = 1;

  return {
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
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
    TRIANGLE_STRIP: 0x0005,

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
    getUniformLocation: vi.fn(() => ({ _loc: true })),
    getUniformBlockIndex: vi.fn(() => 0xffffffff),
    uniformBlockBinding: vi.fn(),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniform4fv: vi.fn(),
    uniform1fv: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    uniformMatrix4fv: vi.fn(),

    createVertexArray: vi.fn(() => ({}) as WebGLVertexArrayObject),
    bindVertexArray: vi.fn(),
    deleteVertexArray: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),

    drawArrays: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

/** Create a minimal shader state for testing. */
function createMockState(): InternalShaderState {
  return {
    exposure: 0,
    gamma: 1,
    saturation: 1,
    temperature: 0,
    tint: 0,
    brightness: 0,
    contrast: 0,
    hue: 0,
    colorInversion: false,
    channelModeCode: 0,
    premultMode: 0,
    texelSize: [1 / 800, 1 / 600],
    toneMappingOperator: 0,
    toneMappingExposure: 1,
    displayTransfer: 0,
    displayGamma: 2.2,
    displayBrightness: 1,
    customGamma: 2.2,
    backgroundPattern: 0,
    backgroundBrightness: 0.1,
    cdlSlope: [1, 1, 1],
    cdlOffset: [0, 0, 0],
    cdlPower: [1, 1, 1],
    cdlSaturation: 1,
    cdlColorspace: 0,
    curvesEnabled: false,
    colorWheelsEnabled: false,
    liftR: 0,
    liftG: 0,
    liftB: 0,
    liftMaster: 0,
    gammaR: 1,
    gammaG: 1,
    gammaB: 1,
    gammaMaster: 1,
    gainR: 1,
    gainG: 1,
    gainB: 1,
    gainMaster: 1,
    falseColorEnabled: false,
    falseColorMode: 0,
    zebraEnabled: false,
    zebraThreshold: 0.95,
    zebraSecondThreshold: 0.05,
    highlightsShadows: [0, 0, 0, 0],
    vibranceAmount: 0,
    skinProtection: false,
    hslEnabled: false,
    hslHueCenter: 0,
    hslHueRange: 30,
    hslSatMin: 0,
    hslSatMax: 1,
    hslLumMin: 0,
    hslLumMax: 1,
    hslSoftness: 10,
    hslOutputMode: 0,
    hslAdjust: [0, 0, 0],
    deinterlaceEnabled: false,
    deinterlaceMethod: 0,
    deinterlaceFieldOrder: 0,
    filmEmulationEnabled: false,
    filmEmulationIntensity: 0.5,
    filmEmulationSaturation: 1,
    filmEmulationGrainIntensity: 0.15,
    filmEmulationGrainSeed: 0,
    perspectiveEnabled: false,
    perspectiveQuality: 0,
    linearizeEnabled: false,
    linearizeBlackPoint: 0,
    linearizeWhitePoint: 1,
    linearizeSoftClip: 0,
    outOfRange: 0,
    channelSwizzle: [0, 1, 2, 3],
    clarityAmount: 0,
    sharpenAmount: 0,
    gamutMappingEnabled: false,
    gamutMappingSourceGamut: 0,
    gamutMappingTargetGamut: 0,
    gamutMappingMode: 0,
    ditherMode: 0,
    quantizeBits: 0,
    luminanceVisMode: 0,
    luminanceContourLevels: 10,
    luminanceContourDesaturate: false,
    luminanceContourLineColor: [1, 1, 1],
    fileLUTEnabled: false,
    fileLUTSize: 0,
    fileLUTIntensity: 1,
    fileLUTDomainMin: [0, 0, 0],
    fileLUTDomainMax: [1, 1, 1],
    lookLUTEnabled: false,
    lookLUTSize: 0,
    lookLUTIntensity: 1,
    lookLUTDomainMin: [0, 0, 0],
    lookLUTDomainMax: [1, 1, 1],
    displayLUTEnabled: false,
    displayLUTSize: 0,
    displayLUTIntensity: 1,
    displayLUTDomainMin: [0, 0, 0],
    displayLUTDomainMax: [1, 1, 1],
    inlineLUTEnabled: false,
    inlineLUTSize: 0,
    inlineLUTChannels: 0,
  } as unknown as InternalShaderState;
}

function createMockTexCb(): TextureCallbacks {
  return {
    bindCurvesLUT: vi.fn(),
    bindFalseColorLUT: vi.fn(),
    bind3DLUT: vi.fn(),
    bindFileLUT3D: vi.fn(),
    bindLookLUT3D: vi.fn(),
    bindDisplayLUT3D: vi.fn(),
    bindFilmLUT: vi.fn(),
    bindInlineLUT: vi.fn(),
  } as unknown as TextureCallbacks;
}

// Create a minimal stage descriptor for testing
function createStage(id: StageId, isActive: boolean = true): ShaderStageDescriptor {
  return {
    id,
    name: `Test ${id}`,
    fragmentSource: `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_inputTexture;
void main() { fragColor = texture(u_inputTexture, v_texCoord); }`,
    isIdentity: () => !isActive,
    applyUniforms: vi.fn(),
    dirtyFlags: new Set(),
  };
}

describe('ShaderPipeline', () => {
  let pipeline: ShaderPipeline;
  let gl: WebGL2RenderingContext;
  let state: InternalShaderState;
  let texCb: TextureCallbacks;

  beforeEach(() => {
    pipeline = new ShaderPipeline();
    gl = createMockGL();
    state = createMockState();
    texCb = createMockTexCb();
    pipeline.setQuadVAO(gl.createVertexArray()!);
  });

  describe('PER_LAYER_STAGES', () => {
    it('contains the correct per-layer stage IDs', () => {
      expect(ShaderPipeline.PER_LAYER_STAGES.has('inputDecode')).toBe(true);
      expect(ShaderPipeline.PER_LAYER_STAGES.has('linearize')).toBe(true);
      expect(ShaderPipeline.PER_LAYER_STAGES.has('primaryGrade')).toBe(true);
      expect(ShaderPipeline.PER_LAYER_STAGES.has('secondaryGrade')).toBe(true);
      expect(ShaderPipeline.PER_LAYER_STAGES.has('spatialEffects')).toBe(true);
      expect(ShaderPipeline.PER_LAYER_STAGES.has('colorPipeline')).toBe(true);
    });

    it('does not contain display output stages', () => {
      expect(ShaderPipeline.PER_LAYER_STAGES.has('sceneAnalysis')).toBe(false);
      expect(ShaderPipeline.PER_LAYER_STAGES.has('displayOutput')).toBe(false);
      expect(ShaderPipeline.PER_LAYER_STAGES.has('diagnostics')).toBe(false);
    });
  });

  describe('DISPLAY_STAGES', () => {
    it('contains the correct display output stage IDs', () => {
      expect(ShaderPipeline.DISPLAY_STAGES.has('sceneAnalysis')).toBe(true);
      expect(ShaderPipeline.DISPLAY_STAGES.has('spatialEffectsPost')).toBe(true);
      expect(ShaderPipeline.DISPLAY_STAGES.has('displayOutput')).toBe(true);
      expect(ShaderPipeline.DISPLAY_STAGES.has('diagnostics')).toBe(true);
      expect(ShaderPipeline.DISPLAY_STAGES.has('compositing')).toBe(true);
    });

    it('does not contain per-layer stages', () => {
      expect(ShaderPipeline.DISPLAY_STAGES.has('inputDecode')).toBe(false);
      expect(ShaderPipeline.DISPLAY_STAGES.has('primaryGrade')).toBe(false);
    });
  });

  describe('executeToLinearFBO', () => {
    it('renders passthrough when no per-layer stages are active', () => {
      const sourceTexture = gl.createTexture()!;
      const targetFBO = gl.createFramebuffer()!;

      const result = pipeline.executeToLinearFBO(gl, sourceTexture, 800, 600, state, texCb, targetFBO);

      expect(result).toBe(true);
      expect(gl.drawArrays).toHaveBeenCalled();
    });

    it('renders single active per-layer stage directly to target FBO', () => {
      const stage = createStage('primaryGrade', true);
      pipeline.registerStage(stage);

      const sourceTexture = gl.createTexture()!;
      const targetFBO = gl.createFramebuffer()!;

      const result = pipeline.executeToLinearFBO(gl, sourceTexture, 800, 600, state, texCb, targetFBO);

      expect(result).toBe(true);
      expect(stage.applyUniforms).toHaveBeenCalled();
    });

    it('renders multi-pass with ping-pong for multiple active stages', () => {
      pipeline.registerStage(createStage('linearize', true));
      pipeline.registerStage(createStage('primaryGrade', true));

      const sourceTexture = gl.createTexture()!;
      const targetFBO = gl.createFramebuffer()!;

      const result = pipeline.executeToLinearFBO(gl, sourceTexture, 800, 600, state, texCb, targetFBO);

      expect(result).toBe(true);
      // Should have drawn at least 2 quads (one per active stage)
      expect((gl.drawArrays as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('ignores display output stages', () => {
      const perLayerStage = createStage('primaryGrade', true);
      const displayStage = createStage('displayOutput', true);
      pipeline.registerStage(perLayerStage);
      pipeline.registerStage(displayStage);

      const sourceTexture = gl.createTexture()!;
      const targetFBO = gl.createFramebuffer()!;

      pipeline.executeToLinearFBO(gl, sourceTexture, 800, 600, state, texCb, targetFBO);

      // Only per-layer stage should have its uniforms applied
      expect(perLayerStage.applyUniforms).toHaveBeenCalled();
      expect(displayStage.applyUniforms).not.toHaveBeenCalled();
    });

    it('skips identity per-layer stages', () => {
      const activeStage = createStage('primaryGrade', true);
      const identityStage = createStage('linearize', false); // identity = skip
      pipeline.registerStage(activeStage);
      pipeline.registerStage(identityStage);

      const sourceTexture = gl.createTexture()!;
      const targetFBO = gl.createFramebuffer()!;

      pipeline.executeToLinearFBO(gl, sourceTexture, 800, 600, state, texCb, targetFBO);

      expect(activeStage.applyUniforms).toHaveBeenCalled();
      expect(identityStage.applyUniforms).not.toHaveBeenCalled();
    });
  });

  describe('executeDisplayOutput', () => {
    it('renders passthrough when no display stages are active', () => {
      const inputTexture = gl.createTexture()!;

      pipeline.executeDisplayOutput(gl, inputTexture, 800, 600, state, texCb);

      expect(gl.drawArrays).toHaveBeenCalled();
    });

    it('renders single active display stage directly to target', () => {
      const stage = createStage('displayOutput', true);
      pipeline.registerStage(stage);

      const inputTexture = gl.createTexture()!;

      pipeline.executeDisplayOutput(gl, inputTexture, 800, 600, state, texCb);

      expect(stage.applyUniforms).toHaveBeenCalled();
    });

    it('renders multi-pass with ping-pong for multiple display stages', () => {
      pipeline.registerStage(createStage('sceneAnalysis', true));
      pipeline.registerStage(createStage('displayOutput', true));

      const inputTexture = gl.createTexture()!;

      pipeline.executeDisplayOutput(gl, inputTexture, 800, 600, state, texCb);

      expect((gl.drawArrays as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('ignores per-layer stages', () => {
      const perLayerStage = createStage('primaryGrade', true);
      const displayStage = createStage('displayOutput', true);
      pipeline.registerStage(perLayerStage);
      pipeline.registerStage(displayStage);

      const inputTexture = gl.createTexture()!;

      pipeline.executeDisplayOutput(gl, inputTexture, 800, 600, state, texCb);

      // Only display stage should have its uniforms applied
      expect(displayStage.applyUniforms).toHaveBeenCalled();
      expect(perLayerStage.applyUniforms).not.toHaveBeenCalled();
    });

    it('renders to a specific target FBO', () => {
      const stage = createStage('displayOutput', true);
      pipeline.registerStage(stage);

      const inputTexture = gl.createTexture()!;
      const targetFBO = gl.createFramebuffer()!;

      pipeline.executeDisplayOutput(gl, inputTexture, 800, 600, state, texCb, targetFBO);

      // Should bind the target FBO
      expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, targetFBO);
    });

    it('renders to screen (null) by default', () => {
      const stage = createStage('displayOutput', true);
      pipeline.registerStage(stage);

      const inputTexture = gl.createTexture()!;

      pipeline.executeDisplayOutput(gl, inputTexture, 800, 600, state, texCb);

      // Should bind null (screen)
      expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, null);
    });
  });
});
