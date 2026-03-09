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
  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_hueRotationMatrix'), false, [1,0,0, 0,1,0, 0,0,1]);

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
