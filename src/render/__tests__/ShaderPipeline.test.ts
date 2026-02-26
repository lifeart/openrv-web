import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShaderPipeline } from '../ShaderPipeline';
import type { ShaderStageDescriptor, StageId } from '../ShaderStage';
import type { InternalShaderState, TextureCallbacks } from '../ShaderStateManager';

// Minimal mock state factory
function createMockState(overrides: Partial<InternalShaderState> = {}): InternalShaderState {
  return {
    colorAdjustments: {
      exposure: 0, exposureRGB: undefined,
      scale: 1, scaleRGB: undefined,
      offset: 0, offsetRGB: undefined,
      temperature: 0, tint: 0,
      brightness: 0,
      contrast: 1, contrastRGB: undefined,
      saturation: 1,
      gamma: 1, gammaRGB: undefined,
      hueRotation: 0,
    },
    colorInversionEnabled: false,
    toneMappingState: { operator: 'off', reinhardWhitePoint: 1, filmicShoulderStrength: 0.15, filmicLinearStrength: 0.5, filmicLinearAngle: 0.1, filmicToeStrength: 0.2, filmicToeNumerator: 0.02, filmicToeDenominator: 0.3, filmicWhitePoint: 11.2, dragoLdMax: 100, dragoBias: 0.85 },
    bgPatternCode: 0, bgColor1: [0, 0, 0], bgColor2: [0, 0, 0], bgCheckerSize: 16,
    cdlEnabled: false, cdlSlope: [1, 1, 1], cdlOffset: [0, 0, 0], cdlPower: [1, 1, 1], cdlSaturation: 1, cdlColorspace: 0,
    curvesEnabled: false, curvesLUTData: null, curvesLUTDirty: false,
    colorWheelsEnabled: false, wheelLift: [0, 0, 0, 0], wheelGamma: [0, 0, 0, 0], wheelGain: [0, 0, 0, 0],
    falseColorEnabled: false, falseColorLUTData: null, falseColorLUTDirty: false,
    zebraEnabled: false, zebraHighThreshold: 0.95, zebraLowThreshold: 0.05, zebraHighEnabled: true, zebraLowEnabled: false, zebraTime: 0,
    channelModeCode: 0,
    lut3DEnabled: false, lut3DIntensity: 1, lut3DSize: 0, lut3DDirty: false, lut3DData: null,
    displayTransferCode: 1, displayGammaOverride: 1, displayBrightnessMultiplier: 1, displayCustomGamma: 2.2,
    hsEnabled: false, highlightsValue: 0, shadowsValue: 0, whitesValue: 0, blacksValue: 0,
    vibranceEnabled: false, vibranceValue: 0, vibranceSkinProtection: true,
    clarityEnabled: false, clarityValue: 0,
    sharpenEnabled: false, sharpenAmount: 0,
    texelSize: [0.001, 0.001] as [number, number],
    hslQualifierEnabled: false, hslHueCenter: 0, hslHueWidth: 30, hslHueSoftness: 20, hslSatCenter: 50, hslSatWidth: 100, hslSatSoftness: 10, hslLumCenter: 50, hslLumWidth: 100, hslLumSoftness: 10, hslCorrHueShift: 0, hslCorrSatScale: 1, hslCorrLumScale: 1, hslInvert: false, hslMattePreview: false,
    gamutMappingEnabled: false, gamutMappingModeCode: 0, gamutSourceCode: 0, gamutTargetCode: 0, gamutHighlightEnabled: false,
    deinterlaceEnabled: false, deinterlaceMethod: 0, deinterlaceFieldOrder: 0,
    filmEnabled: false, filmIntensity: 0, filmSaturation: 1, filmGrainIntensity: 0, filmGrainSeed: 0, filmLUTData: null, filmLUTDirty: false,
    perspectiveEnabled: false, perspectiveInvH: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), perspectiveQuality: 0,
    linearizeLogType: 0, linearizeSRGB2linear: false, linearizeRec709ToLinear: false, linearizeFileGamma: 1, linearizeAlphaType: 0,
    inlineLUTEnabled: false, inlineLUTChannels: 1, inlineLUTSize: 0, inlineLUTData: null, inlineLUTDirty: false,
    outOfRange: 0,
    sphericalEnabled: false, sphericalFov: Math.PI / 2, sphericalAspect: 1, sphericalYaw: 0, sphericalPitch: 0,
    channelSwizzle: [0, 1, 2, 3] as [number, number, number, number],
    premultMode: 0,
    ditherMode: 0, quantizeBits: 0,
    inputPrimariesEnabled: false, inputPrimariesMatrix: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    outputPrimariesEnabled: false, outputPrimariesMatrix: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    ...overrides,
  } as InternalShaderState;
}

function createMockTexCb(): TextureCallbacks {
  return {
    bindCurvesLUTTexture: vi.fn(),
    bindFalseColorLUTTexture: vi.fn(),
    bindLUT3DTexture: vi.fn(),
    bindFilmLUTTexture: vi.fn(),
    bindInlineLUTTexture: vi.fn(),
    getCanvasSize: vi.fn(() => ({ width: 1920, height: 1080 })),
  };
}

// Minimal fragment shader source that compiles (for mock GL)
const DUMMY_FRAG_SOURCE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_inputTexture;
void main() { fragColor = texture(u_inputTexture, v_texCoord); }`;

function createMockStage(
  id: StageId,
  isIdentityFn: (state: Readonly<InternalShaderState>) => boolean = () => true,
): ShaderStageDescriptor {
  return {
    id,
    name: id,
    fragmentSource: DUMMY_FRAG_SOURCE,
    isIdentity: isIdentityFn,
    applyUniforms: vi.fn(),
    dirtyFlags: new Set(),
  };
}

function createMockGL() {
  let textureId = 0;
  let fboId = 0;
  let programId = 0;

  return {
    TEXTURE_2D: 0x0DE1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    NEAREST: 0x2600,
    CLAMP_TO_EDGE: 0x812F,
    RGBA8: 0x8058,
    RGBA16F: 0x881A,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    HALF_FLOAT: 0x140B,
    FLOAT: 0x1406,
    FRAMEBUFFER: 0x8D40,
    COLOR_ATTACHMENT0: 0x8CE0,
    FRAMEBUFFER_COMPLETE: 0x8CD5,
    TRIANGLE_STRIP: 0x0005,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88E4,
    TEXTURE0: 0x84C0,
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    COMPILE_STATUS: 0x8B81,
    LINK_STATUS: 0x8B82,
    UNIFORM_BUFFER: 0x8A11,
    DYNAMIC_DRAW: 0x88E8,
    INVALID_INDEX: 0xFFFFFFFF,

    createTexture: vi.fn(() => ({ _id: textureId++ })),
    createFramebuffer: vi.fn(() => ({ _id: fboId++ })),
    createVertexArray: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    createProgram: vi.fn(() => ({ _id: programId++ })),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteTexture: vi.fn(),
    deleteFramebuffer: vi.fn(),
    deleteVertexArray: vi.fn(),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn(() => 1),
    getUniformBlockIndex: vi.fn(() => 0xFFFFFFFF), // INVALID_INDEX (no UBO by default)
    uniformBlockBinding: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniform4fv: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 0x8CD5),
    viewport: vi.fn(),
    activeTexture: vi.fn(),
    bindVertexArray: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bufferSubData: vi.fn(),
    bindBufferBase: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    drawArrays: vi.fn(),
    invalidateFramebuffer: vi.fn(),
  } as unknown as WebGL2RenderingContext;
}

describe('ShaderPipeline', () => {
  let pipeline: ShaderPipeline;
  let gl: WebGL2RenderingContext;
  let sourceTexture: WebGLTexture;
  let state: InternalShaderState;
  let texCb: TextureCallbacks;

  beforeEach(() => {
    pipeline = new ShaderPipeline();
    gl = createMockGL();
    sourceTexture = { _id: 'source' } as unknown as WebGLTexture;
    state = createMockState();
    texCb = createMockTexCb();
    pipeline.setQuadVAO({} as WebGLVertexArrayObject);
  });

  // ─── A-7: Zero active stages ──────────────────────────────────────

  it('A-7: 0 active stages = passthrough (1 draw call, no FBO)', () => {
    // Register stages that are all identity
    pipeline.registerStage(createMockStage('primaryGrade', () => true));
    pipeline.registerStage(createMockStage('compositing', () => true));

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    // Should draw once (passthrough blit)
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    // All bindFramebuffer calls should be to null (screen), not to any FBO
    const bindCalls = vi.mocked(gl.bindFramebuffer).mock.calls;
    for (const call of bindCalls) {
      expect(call[1]).toBeNull();
    }
    // No FBO textures should be allocated
    expect(gl.createFramebuffer).not.toHaveBeenCalled();
  });

  // ─── A-8: Single active stage ─────────────────────────────────────

  it('A-8: 1 active stage = 1 draw call, no FBO allocation', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false)); // active
    pipeline.registerStage(createMockStage('compositing', () => true));   // identity

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    // Should bind to target FBO (null = screen), not ping-pong FBOs
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, null);
    // No FBO allocation needed for single-pass
    expect(gl.createFramebuffer).not.toHaveBeenCalled();
  });

  // ─── A-9: N active stages ────────────────────────────────────────

  it('A-9: N active stages = N draw calls with FBO alternation', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('displayOutput', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    expect(gl.drawArrays).toHaveBeenCalledTimes(3);

    // Verify FBO alternation pattern by tracking bindFramebuffer calls
    const allBindCalls = vi.mocked(gl.bindFramebuffer).mock.calls
      .filter(c => c[0] === gl.FRAMEBUFFER);
    const fboTargets = allBindCalls.map(c => c[1]);

    // Last bind should be to null (screen) for the final stage
    expect(fboTargets[fboTargets.length - 1]).toBeNull();

    // Extract unique non-null FBO targets (from both FBO setup and rendering)
    const uniqueNonNullFBOs = new Set(fboTargets.filter(t => t !== null));
    // Should have at least 2 distinct FBOs (the ping-pong pair)
    expect(uniqueNonNullFBOs.size).toBe(2);

    // Verify first stage reads from sourceTexture (not an empty FBO texture)
    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, sourceTexture);
  });

  it('A-9b: 4 active stages produce 4 draw calls', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('secondaryGrade', () => false));
    pipeline.registerStage(createMockStage('displayOutput', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    expect(gl.drawArrays).toHaveBeenCalledTimes(4);
  });

  // ─── A-10: Monolithic fallback ───────────────────────────────────

  it('A-10: monolithic fallback when FBO allocation fails', () => {
    const fallbackFn = vi.fn();
    pipeline.setMonolithicFallback(fallbackFn);

    // Make all FBO creation fail
    vi.mocked(gl.checkFramebufferStatus).mockReturnValue(0);

    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    expect(fallbackFn).toHaveBeenCalledWith(
      gl, sourceTexture, state, texCb, null,
    );
  });

  it('A-10b: monolithic fallback not called for single active stage', () => {
    const fallbackFn = vi.fn();
    pipeline.setMonolithicFallback(fallbackFn);

    // Make FBO creation fail
    vi.mocked(gl.checkFramebufferStatus).mockReturnValue(0);

    pipeline.registerStage(createMockStage('primaryGrade', () => false)); // 1 active
    pipeline.registerStage(createMockStage('compositing', () => true));   // identity

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    // Single-pass path doesn't need FBOs, so no fallback
    expect(fallbackFn).not.toHaveBeenCalled();
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
  });

  // ─── A-11: FBO dimensions ────────────────────────────────────────

  it('A-11: FBO dimensions match render target, not canvas', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    // Render at scope resolution (320x180), not canvas (1920x1080)
    pipeline.execute(gl, sourceTexture, 320, 180, state, texCb);

    // FBOs should be allocated at 320x180
    const texImage2DCalls = vi.mocked(gl.texImage2D).mock.calls;
    // Should have 2 FBO texture allocations (ping + pong)
    expect(texImage2DCalls.length).toBe(2);
    expect(texImage2DCalls[0]![3]).toBe(320); // width
    expect(texImage2DCalls[0]![4]).toBe(180); // height
    expect(texImage2DCalls[1]![3]).toBe(320);
    expect(texImage2DCalls[1]![4]).toBe(180);
  });

  // ─── A-12: Global Uniforms UBO ───────────────────────────────────

  it('A-12: Global Uniforms UBO buffer created and bound with correct data', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    state.channelModeCode = 3;
    state.premultMode = 2;
    state.texelSize = [0.001, 0.002];

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    // UBO buffer should be created and populated
    expect(gl.createBuffer).toHaveBeenCalled();
    expect(gl.bindBuffer).toHaveBeenCalledWith(gl.UNIFORM_BUFFER, expect.anything());
    expect(gl.bufferSubData).toHaveBeenCalledWith(
      gl.UNIFORM_BUFFER,
      0,
      expect.any(Float32Array),
    );
    expect(gl.bindBufferBase).toHaveBeenCalledWith(gl.UNIFORM_BUFFER, 0, expect.anything());

    // Verify UBO data contents
    const uboData = vi.mocked(gl.bufferSubData).mock.calls[0]![2] as Float32Array;
    expect(uboData[1]).toBe(3);               // channelModeCode
    expect(uboData[2]).toBe(2);               // premultMode
    expect(uboData[4]).toBeCloseTo(0.001, 5); // texelSize.x (Float32 precision)
    expect(uboData[5]).toBeCloseTo(0.002, 5); // texelSize.y (Float32 precision)
  });

  // ─── A-17: Passthrough vertex shader ──────────────────────────────

  it('A-17: passthrough vertex shader does not apply transforms', () => {
    // When we have multiple active stages, intermediate stages should use
    // passthrough.vert.glsl which has no u_offset/u_scale/u_texRotation uniforms
    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    // The passthrough vertex shader source should NOT contain pan/zoom/rotation
    // uniforms. We verify this by checking that the shader sources passed to
    // createShader/shaderSource differ between first and intermediate stages.
    const shaderSourceCalls = vi.mocked(gl.shaderSource).mock.calls;
    // Should have vertex + fragment shaders for at least 2 programs
    expect(shaderSourceCalls.length).toBeGreaterThanOrEqual(4);

    // Find vertex shader sources (they'll be the ones with 'a_position')
    const vertexSources = shaderSourceCalls
      .map(c => c[1] as string)
      .filter(s => s.includes('a_position'));

    // At least one should contain u_offset (viewer.vert for first stage)
    const hasViewerVert = vertexSources.some(s => s.includes('u_offset') && s.includes('u_scale'));
    // At least one should NOT contain u_offset (passthrough.vert for intermediate)
    const hasPassthroughVert = vertexSources.some(s => !s.includes('u_offset') && !s.includes('u_scale'));

    expect(hasViewerVert).toBe(true);
    expect(hasPassthroughVert).toBe(true);
  });

  // ─── A-18: Vertex shader selection ────────────────────────────────

  it('A-18: first stage uses viewer.vert, intermediate stages use passthrough.vert', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('displayOutput', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    const shaderSourceCalls = vi.mocked(gl.shaderSource).mock.calls;
    const vertexSources = shaderSourceCalls
      .map(c => c[1] as string)
      .filter(s => s.includes('a_position'));

    // First program: viewer.vert.glsl (has u_offset, u_scale, u_texRotation)
    // Other programs: passthrough.vert.glsl (no transforms)
    const viewerVertCount = vertexSources.filter(s => s.includes('u_offset')).length;
    const passthroughVertCount = vertexSources.filter(s => !s.includes('u_offset')).length;

    // Exactly 1 viewer vertex shader (for first stage)
    expect(viewerVertCount).toBe(1);
    // 2 passthrough vertex shaders (for intermediate + last stage)
    expect(passthroughVertCount).toBe(2);
  });

  // ─── Stage ordering ──────────────────────────────────────────────

  it('stages are executed in stageOrder regardless of registration order', () => {
    const callOrder: StageId[] = [];

    const stageA = createMockStage('compositing', () => false);
    stageA.applyUniforms = vi.fn(() => callOrder.push('compositing'));

    const stageB = createMockStage('primaryGrade', () => false);
    stageB.applyUniforms = vi.fn(() => callOrder.push('primaryGrade'));

    // Register in reverse order
    pipeline.registerStage(stageA);
    pipeline.registerStage(stageB);

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    // primaryGrade should be before compositing in the pipeline
    expect(callOrder.indexOf('primaryGrade')).toBeLessThan(callOrder.indexOf('compositing'));
  });

  it('setStageOrder changes execution order', () => {
    const callOrder: StageId[] = [];

    const stageA = createMockStage('compositing', () => false);
    stageA.applyUniforms = vi.fn(() => callOrder.push('compositing'));

    const stageB = createMockStage('primaryGrade', () => false);
    stageB.applyUniforms = vi.fn(() => callOrder.push('primaryGrade'));

    pipeline.registerStage(stageA);
    pipeline.registerStage(stageB);

    // Reverse the default order: compositing before primaryGrade
    const result = pipeline.setStageOrder(['compositing', 'primaryGrade']);
    expect(result).toBe(true);

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    expect(callOrder.indexOf('compositing')).toBeLessThan(callOrder.indexOf('primaryGrade'));
  });

  it('setStageOrder rejects missing stages', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    // Missing 'compositing' — only has primaryGrade
    const result = pipeline.setStageOrder(['primaryGrade']);
    expect(result).toBe(false);
  });

  it('setStageOrder accepts extra IDs for future stages', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false));

    const result = pipeline.setStageOrder(['primaryGrade', 'unknownStage' as StageId]);
    expect(result).toBe(true);
  });

  // ─── FBO format selection ────────────────────────────────────────

  it('uses RGBA8 FBOs for SDR content', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb, null, false);

    const texImage2DCalls = vi.mocked(gl.texImage2D).mock.calls;
    // texImage2D(target, level, internalFormat, width, height, border, format, type, data)
    // RGBA8 internal format = 0x8058
    expect(texImage2DCalls[0]![2]).toBe(0x8058);
    // type is arg[7] = UNSIGNED_BYTE (0x1401)
    expect(texImage2DCalls[0]![7]).toBe(0x1401);
  });

  it('uses RGBA16F FBOs for HDR content', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb, null, true);

    const texImage2DCalls = vi.mocked(gl.texImage2D).mock.calls;
    // RGBA16F internal format = 0x881A
    expect(texImage2DCalls[0]![2]).toBe(0x881A);
    // type is arg[7] = HALF_FLOAT (0x140B)
    expect(texImage2DCalls[0]![7]).toBe(0x140B);
  });

  // ─── Spatial filtering ───────────────────────────────────────────

  it('spatial stages use LINEAR filtering, non-spatial use NEAREST', () => {
    const spatialStage = createMockStage('spatialEffects', () => false);
    spatialStage.needsBilinearInput = true;

    const nonSpatialStage = createMockStage('primaryGrade', () => false);
    const lastStage = createMockStage('compositing', () => false);

    pipeline.registerStage(nonSpatialStage);
    pipeline.registerStage(spatialStage);
    pipeline.registerStage(lastStage);

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    const texParamCalls = vi.mocked(gl.texParameteri).mock.calls;
    // After FBO allocation (which uses NEAREST), there should be setFilteringMode calls
    // The spatial stage should trigger LINEAR filtering on the read texture
    const linearCalls = texParamCalls.filter(c =>
      c[1] === (gl as any).TEXTURE_MIN_FILTER && c[2] === (gl as any).LINEAR
    );
    expect(linearCalls.length).toBeGreaterThan(0);
  });

  // ─── Dispose ─────────────────────────────────────────────────────

  it('dispose cleans up all resources', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    // Execute to create resources
    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    pipeline.dispose(gl);

    // UBO buffer should be deleted
    expect(gl.deleteBuffer).toHaveBeenCalled();
    // Programs should be deleted (2 cached programs: first stage + intermediate stage)
    expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
    // FBO textures and framebuffers should be deleted (2 each from ping-pong)
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(2);
  });

  // ─── Target FBO ──────────────────────────────────────────────────

  it('renders to target FBO when provided', () => {
    const targetFBO = { _id: 'targetFBO' } as unknown as WebGLFramebuffer;
    pipeline.registerStage(createMockStage('primaryGrade', () => false));

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb, targetFBO);

    // Last bindFramebuffer call should be to the target FBO
    const bindCalls = vi.mocked(gl.bindFramebuffer).mock.calls;
    const lastBind = bindCalls[bindCalls.length - 1];
    expect(lastBind![1]).toBe(targetFBO);
  });

  // ─── applyUniforms called correctly ──────────────────────────────

  it('applyUniforms is called for active stages only', () => {
    const activeStage = createMockStage('primaryGrade', () => false);
    const identityStage = createMockStage('compositing', () => true);

    pipeline.registerStage(activeStage);
    pipeline.registerStage(identityStage);

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    expect(activeStage.applyUniforms).toHaveBeenCalledTimes(1);
    expect(identityStage.applyUniforms).not.toHaveBeenCalled();
  });

  it('applyUniforms receives correct arguments', () => {
    const stage = createMockStage('primaryGrade', () => false);
    pipeline.registerStage(stage);

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    expect(stage.applyUniforms).toHaveBeenCalledWith(
      expect.anything(), // ShaderProgram
      state,
      texCb,
    );
  });

  // ─── getStageOrder / getStages ────────────────────────────────────

  it('getStageOrder returns current order', () => {
    const order = pipeline.getStageOrder();
    expect(order).toContain('primaryGrade');
    expect(order).toContain('compositing');
    expect(order.indexOf('primaryGrade')).toBeLessThan(order.indexOf('compositing'));
  });

  it('getStages returns registered stages', () => {
    pipeline.registerStage(createMockStage('primaryGrade'));
    pipeline.registerStage(createMockStage('compositing'));

    const stages = pipeline.getStages();
    expect(stages).toHaveLength(2);
    expect(stages[0]!.id).toBe('primaryGrade');
    expect(stages[1]!.id).toBe('compositing');
  });

  // ─── Global UBO helpers ──────────────────────────────────────────

  it('setGlobalHDRHeadroom updates UBO data', () => {
    pipeline.setGlobalHDRHeadroom(2.5);

    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    const uboData = vi.mocked(gl.bufferSubData).mock.calls[0]![2] as Float32Array;
    expect(uboData[0]).toBe(2.5);
  });

  it('setGlobalOutputMode updates UBO data', () => {
    pipeline.setGlobalOutputMode(1);

    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    const uboData = vi.mocked(gl.bufferSubData).mock.calls[0]![2] as Float32Array;
    expect(uboData[3]).toBe(1);
  });

  // ─── Monolithic fallback edge cases ─────────────────────────────

  it('no fallback set logs warning when FBO fails', () => {
    // No monolithicFallback set — pipeline should not crash
    vi.mocked(gl.checkFramebufferStatus).mockReturnValue(0);

    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    // Should not throw, just skip rendering
    expect(() => pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb)).not.toThrow();
    // No draw calls made (rendering skipped)
    expect(gl.drawArrays).not.toHaveBeenCalled();
  });

  it('RGBA8 failure goes straight to monolithic (no RGBA16F attempt)', () => {
    const fallbackFn = vi.fn();
    pipeline.setMonolithicFallback(fallbackFn);

    // Track checkFramebufferStatus calls
    const fboStatusCalls: number[] = [];
    vi.mocked(gl.checkFramebufferStatus).mockImplementation(() => {
      fboStatusCalls.push(1);
      return 0; // All fail
    });

    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    // SDR mode (isHDR=false) → RGBA8 preferred
    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb, null, false);

    // Should call monolithic fallback
    expect(fallbackFn).toHaveBeenCalledTimes(1);

    // Verify no RGBA16F textures were attempted (only RGBA8)
    const texImage2DCalls = vi.mocked(gl.texImage2D).mock.calls;
    for (const call of texImage2DCalls) {
      // internalFormat at index 2 should never be RGBA16F (0x881A)
      expect(call[2]).not.toBe(0x881A);
    }
  });

  it('RGBA16F failure falls back to RGBA8 before monolithic', () => {
    const fallbackFn = vi.fn();
    pipeline.setMonolithicFallback(fallbackFn);

    let callCount = 0;
    vi.mocked(gl.checkFramebufferStatus).mockImplementation(() => {
      callCount++;
      // First call fails (RGBA16F FBO 0), rest succeed (RGBA8 FBOs)
      return callCount <= 1 ? 0 : 0x8CD5;
    });

    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    // HDR mode → RGBA16F preferred
    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb, null, true);

    // Should NOT call monolithic fallback (RGBA8 succeeded)
    expect(fallbackFn).not.toHaveBeenCalled();
    // Should have drawn
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  });

  // ─── UBO block binding ────────────────────────────────────────────

  it('binds UBO block when GlobalUniforms is found', () => {
    // Return a valid block index
    vi.mocked(gl.getUniformBlockIndex).mockReturnValue(0);

    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    expect(gl.uniformBlockBinding).toHaveBeenCalledWith(
      expect.anything(), // program handle
      0,                 // block index
      0,                 // binding point
    );
  });

  // ─── Intermediate stages write to FBOs ────────────────────────────

  it('intermediate stages write to FBOs, not to screen', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('displayOutput', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    // 3 stages: first writes to FBO, second writes to FBO, last writes to screen
    // We expect bindFramebuffer with non-null values for intermediate passes
    const bindCalls = vi.mocked(gl.bindFramebuffer).mock.calls
      .filter(c => c[0] === gl.FRAMEBUFFER);
    const nonNullBinds = bindCalls.filter(c => c[1] !== null);
    // At least 2 non-null FBO binds: FBO setup (2) + intermediate passes (2)
    expect(nonNullBinds.length).toBeGreaterThanOrEqual(2);
  });

  // ─── Passthrough with target FBO ───────────────────────────────────

  it('passthrough renders to target FBO when provided', () => {
    const targetFBO = { _id: 'target' } as unknown as WebGLFramebuffer;
    pipeline.registerStage(createMockStage('primaryGrade', () => true)); // identity

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb, targetFBO);

    const bindCalls = vi.mocked(gl.bindFramebuffer).mock.calls;
    const lastBind = bindCalls[bindCalls.length - 1];
    expect(lastBind![1]).toBe(targetFBO);
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
  });

  // ─── Single-pass UBO ────────────────────────────────────────────────

  it('single-pass path updates Global UBO', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false)); // 1 active
    pipeline.registerStage(createMockStage('compositing', () => true));   // identity

    state.channelModeCode = 5;
    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    // UBO should be created and populated even for single-pass
    expect(gl.bufferSubData).toHaveBeenCalled();
    const uboData = vi.mocked(gl.bufferSubData).mock.calls[0]![2] as Float32Array;
    expect(uboData[1]).toBe(5); // channelModeCode
  });

  // ─── Duplicate stage registration ──────────────────────────────────

  it('registering same stage ID twice replaces the first descriptor', () => {
    const stageA = createMockStage('primaryGrade', () => false);
    const stageB = createMockStage('primaryGrade', () => false);

    pipeline.registerStage(stageA);
    pipeline.registerStage(stageB);

    // Only one stage should be registered (replaced, not duplicated)
    expect(pipeline.getStages()).toHaveLength(1);

    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);

    // Only stageB's applyUniforms should be called (it replaced stageA)
    expect(stageA.applyUniforms).not.toHaveBeenCalled();
    expect(stageB.applyUniforms).toHaveBeenCalledTimes(1);
  });

  // ─── setStageOrder rejects duplicates ──────────────────────────────

  it('setStageOrder rejects duplicate entries', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => false));
    pipeline.registerStage(createMockStage('compositing', () => false));

    const result = pipeline.setStageOrder(['primaryGrade', 'compositing', 'primaryGrade'] as StageId[]);
    expect(result).toBe(false);
  });

  // ─── Dispose edge cases ────────────────────────────────────────────

  it('dispose cleans up passthrough program', () => {
    pipeline.registerStage(createMockStage('primaryGrade', () => true)); // identity
    // Execute with 0 active stages to create the passthrough program
    pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb);
    vi.mocked(gl.deleteProgram).mockClear();

    pipeline.dispose(gl);

    // Passthrough program should be deleted
    expect(gl.deleteProgram).toHaveBeenCalled();
  });

  it('dispose is safe to call on empty pipeline', () => {
    // No execute() called — nothing allocated
    expect(() => pipeline.dispose(gl)).not.toThrow();
    expect(gl.deleteProgram).not.toHaveBeenCalled();
    expect(gl.deleteBuffer).not.toHaveBeenCalled();
  });

  // ─── ensureProgram failure ──────────────────────────────────────────

  it('execute throws when stage shader fails to compile', () => {
    // Make shader compilation fail
    vi.mocked(gl.getShaderParameter).mockReturnValue(false);
    vi.mocked(gl.getShaderInfoLog).mockReturnValue('syntax error in fragment shader');

    pipeline.registerStage(createMockStage('primaryGrade', () => false));

    expect(() => pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb))
      .toThrow('Shader compile error');
  });

  it('execute throws when stage shader fails to link', () => {
    // Compile succeeds, link fails
    vi.mocked(gl.getShaderParameter).mockReturnValue(true);
    vi.mocked(gl.getProgramParameter).mockReturnValue(false);
    vi.mocked(gl.getProgramInfoLog).mockReturnValue('varying mismatch');

    pipeline.registerStage(createMockStage('primaryGrade', () => false));

    expect(() => pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb))
      .toThrow('Shader program link error');
  });

  it('program is deleted when stage shader fails to compile', () => {
    vi.mocked(gl.getShaderParameter).mockReturnValue(false);
    vi.mocked(gl.getShaderInfoLog).mockReturnValue('error');

    pipeline.registerStage(createMockStage('primaryGrade', () => false));

    expect(() => pipeline.execute(gl, sourceTexture, 1920, 1080, state, texCb)).toThrow();
    expect(gl.deleteProgram).toHaveBeenCalled();
  });
});
