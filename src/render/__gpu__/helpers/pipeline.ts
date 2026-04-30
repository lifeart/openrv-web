/**
 * Shared identity pipeline setup for GPU tests.
 *
 * Sets all viewer.frag.glsl uniforms to identity/passthrough values so that
 * only the targeted stage under test has an effect. Defaults to HDR passthrough
 * output mode (u_outputMode = 1) for float-precision readback.
 *
 * Tests that need different defaults (e.g. SDR clamp, different resolution)
 * should override the relevant uniforms after calling this function.
 */
export function setupIdentityPipeline(gl: WebGL2RenderingContext, program: WebGLProgram): void {
  gl.useProgram(program);

  // Bind dummy 1x1 textures for unused LUT samplers and point each sampler
  // uniform to the matching unit. Required because viewer.frag declares
  // sampler2D and sampler3D uniforms (curves/falseColor/film/inline LUTs and
  // 3D file/look/display LUTs) that the test pipeline never enables. Strict
  // WebGL2 validators (ANGLE/Metal on recent macOS runner images) fail draw
  // calls when sampler2D and sampler3D uniforms point at the same texture
  // unit (their default of 0), even when the corresponding code paths are
  // guarded by a boolean — the conflict is checked at draw time, not at
  // sample time, and the draw is silently dropped (output = clear color).
  bindUnusedSamplerDummies(gl, program);

  // Vertex transform: identity (fill viewport)
  gl.uniform2f(gl.getUniformLocation(program, 'u_offset'), 0, 0);
  gl.uniform2f(gl.getUniformLocation(program, 'u_scale'), 1, 1);
  gl.uniformMatrix2fv(gl.getUniformLocation(program, 'u_texRotationMatrix'), false, [1, 0, 0, 1]);
  gl.uniform1i(gl.getUniformLocation(program, 'u_texFlipH'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_texFlipV'), 0);

  // Color adjustments: identity
  gl.uniform3f(gl.getUniformLocation(program, 'u_exposureRGB'), 0, 0, 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_gammaRGB'), 1, 1, 1);
  gl.uniform1f(gl.getUniformLocation(program, 'u_saturation'), 1);
  gl.uniform3f(gl.getUniformLocation(program, 'u_contrastRGB'), 1, 1, 1);
  gl.uniform3f(gl.getUniformLocation(program, 'u_scaleRGB'), 1, 1, 1);
  gl.uniform3f(gl.getUniformLocation(program, 'u_offsetRGB'), 0, 0, 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_brightness'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_temperature'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tint'), 0);

  // Hue rotation: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_hueRotationEnabled'), 0);
  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_hueRotationMatrix'), false, [1, 0, 0, 0, 1, 0, 0, 0, 1]);

  // Tone mapping: off
  gl.uniform1i(gl.getUniformLocation(program, 'u_toneMappingOperator'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmReinhardWhitePoint'), 4.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmFilmicExposureBias'), 2.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmFilmicWhitePoint'), 11.2);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmDragoBias'), 0.85);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmDragoLmax'), 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmDragoLwa'), 0.5);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmDragoBrightness'), 2.0);

  // Inversion: off
  gl.uniform1i(gl.getUniformLocation(program, 'u_invert'), 0);

  // Output mode: HDR passthrough (1) so we get raw linear values without clamping
  gl.uniform1i(gl.getUniformLocation(program, 'u_outputMode'), 1);

  // Input transfer: default sRGB (0)
  gl.uniform1i(gl.getUniformLocation(program, 'u_inputTransfer'), 0);

  // HDR headroom: 1.0 (SDR)
  gl.uniform1f(gl.getUniformLocation(program, 'u_hdrHeadroom'), 1.0);

  // CDL: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_cdlEnabled'), 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_cdlSlope'), 1, 1, 1);
  gl.uniform3f(gl.getUniformLocation(program, 'u_cdlOffset'), 0, 0, 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_cdlPower'), 1, 1, 1);
  gl.uniform1f(gl.getUniformLocation(program, 'u_cdlSaturation'), 1);
  gl.uniform1i(gl.getUniformLocation(program, 'u_cdlColorspace'), 0);

  // Curves: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_curvesEnabled'), 0);

  // Color wheels: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_colorWheelsEnabled'), 0);

  // False color: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_falseColorEnabled'), 0);

  // Contour: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_contourEnabled'), 0);

  // Zebra: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_zebraEnabled'), 0);

  // Channel mode: RGB (0)
  gl.uniform1i(gl.getUniformLocation(program, 'u_channelMode'), 0);

  // LUTs: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_fileLUT3DEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_lookLUT3DEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_displayLUT3DEnabled'), 0);

  // Display transfer: linear (0) — no OETF
  gl.uniform1i(gl.getUniformLocation(program, 'u_displayTransfer'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_displayGamma'), 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_displayBrightness'), 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_displayCustomGamma'), 2.2);

  // Background: none
  gl.uniform1i(gl.getUniformLocation(program, 'u_backgroundPattern'), 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_bgColor1'), 0, 0, 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_bgColor2'), 0, 0, 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_bgCheckerSize'), 8);
  gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), 1, 1);

  // Highlights/Shadows: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_hsEnabled'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_highlights'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_shadows'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_whites'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_blacks'), 0);

  // Vibrance: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_vibranceEnabled'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_vibrance'), 0);

  // Clarity: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_clarityEnabled'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_clarity'), 0);
  gl.uniform2f(gl.getUniformLocation(program, 'u_texelSize'), 1, 1);

  // Sharpen: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_sharpenEnabled'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_sharpenAmount'), 0);

  // HSL qualifier: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_hslQualifierEnabled'), 0);

  // Gamut mapping: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_gamutMappingEnabled'), 0);

  // Input/output primaries: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_inputPrimariesEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_outputPrimariesEnabled'), 0);

  // Linearize: disabled (no log conversion)
  gl.uniform1i(gl.getUniformLocation(program, 'u_linearizeLogType'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_linearizeFileGamma'), 1.0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_linearizeSRGB2linear'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_linearizeRec709ToLinear'), 0);

  // Deinterlace: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_deinterlaceEnabled'), 0);

  // Film: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_filmEnabled'), 0);

  // Perspective: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_perspectiveEnabled'), 0);

  // Inline LUT: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_inlineLUTEnabled'), 0);

  // Out-of-range: off
  gl.uniform1i(gl.getUniformLocation(program, 'u_outOfRange'), 0);

  // Channel swizzle: identity
  gl.uniform4i(gl.getUniformLocation(program, 'u_channelSwizzle'), 0, 1, 2, 3);

  // Premult: off
  gl.uniform1i(gl.getUniformLocation(program, 'u_premult'), 0);

  // Spherical: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_sphericalEnabled'), 0);

  // Dither/quantize: off
  gl.uniform1i(gl.getUniformLocation(program, 'u_ditherMode'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_quantizeBits'), 0);
}

// Texture units reserved for the dummy LUT bindings. Picked at the high end
// of the unit range so they don't collide with units 0..N that callers use
// for the input texture (u_texture is always bound to unit 0). All WebGL2
// implementations guarantee at least 16 combined texture units, so 14/15
// are safe.
const DUMMY_LUT_2D_UNIT = 15;
const DUMMY_LUT_3D_UNIT = 14;

function bindUnusedSamplerDummies(gl: WebGL2RenderingContext, program: WebGLProgram): void {
  const dummy2D = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + DUMMY_LUT_2D_UNIT);
  gl.bindTexture(gl.TEXTURE_2D, dummy2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

  const dummy3D = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + DUMMY_LUT_3D_UNIT);
  gl.bindTexture(gl.TEXTURE_3D, dummy3D);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

  // sampler2D LUTs → dummy 2D unit (matches sampler type, satisfies validator).
  gl.uniform1i(gl.getUniformLocation(program, 'u_curvesLUT'), DUMMY_LUT_2D_UNIT);
  gl.uniform1i(gl.getUniformLocation(program, 'u_falseColorLUT'), DUMMY_LUT_2D_UNIT);
  gl.uniform1i(gl.getUniformLocation(program, 'u_filmLUT'), DUMMY_LUT_2D_UNIT);
  gl.uniform1i(gl.getUniformLocation(program, 'u_inlineLUT'), DUMMY_LUT_2D_UNIT);

  // sampler3D LUTs → dummy 3D unit.
  gl.uniform1i(gl.getUniformLocation(program, 'u_fileLUT3D'), DUMMY_LUT_3D_UNIT);
  gl.uniform1i(gl.getUniformLocation(program, 'u_lookLUT3D'), DUMMY_LUT_3D_UNIT);
  gl.uniform1i(gl.getUniformLocation(program, 'u_displayLUT3D'), DUMMY_LUT_3D_UNIT);

  // Restore active texture to unit 0 so callers can bind u_texture without
  // having to know what setupIdentityPipeline left selected.
  gl.activeTexture(gl.TEXTURE0);
}
