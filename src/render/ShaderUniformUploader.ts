/**
 * ShaderUniformUploader — pushes dirty uniforms to the GPU shader program.
 *
 * Extracted from ShaderStateManager.applyUniforms() for maintainability.
 * This is a pure function that reads state + dirty flags, writes to shader,
 * and returns whether texture units were initialized.
 */

import type { ShaderProgram } from './ShaderProgram';
import type { InternalShaderState, TextureCallbacks } from './ShaderStateTypes';
import {
  TONE_MAPPING_OPERATOR_CODES,
  DIRTY_COLOR,
  DIRTY_TONE_MAPPING,
  DIRTY_INVERSION,
  DIRTY_CDL,
  DIRTY_CURVES,
  DIRTY_INLINE_LUT,
  DIRTY_COLOR_WHEELS,
  DIRTY_FALSE_COLOR,
  DIRTY_CONTOUR,
  DIRTY_ZEBRA,
  DIRTY_CHANNELS,
  DIRTY_LUT3D,
  DIRTY_FILE_LUT3D,
  DIRTY_DISPLAY_LUT3D,
  DIRTY_DISPLAY,
  DIRTY_BACKGROUND,
  DIRTY_HIGHLIGHTS_SHADOWS,
  DIRTY_VIBRANCE,
  DIRTY_CLARITY,
  DIRTY_SHARPEN,
  DIRTY_HSL,
  DIRTY_GAMUT_MAPPING,
  DIRTY_COLOR_PRIMARIES,
  DIRTY_DEINTERLACE,
  DIRTY_FILM_EMULATION,
  DIRTY_LINEARIZE,
  DIRTY_OUT_OF_RANGE,
  DIRTY_PREMULT,
  DIRTY_DITHER,
  DIRTY_CHANNEL_SWIZZLE,
  DIRTY_PERSPECTIVE,
  DIRTY_SPHERICAL,
  BG_PATTERN_NONE,
} from './ShaderConstants';
import { getHueRotationMatrix, isIdentityHueRotation } from '../color/HueRotation';

/** Pre-allocated buffers owned by ShaderStateManager, passed through to avoid allocation. */
export interface UniformBuffers {
  resolutionBuffer: [number, number];
  exposureRGBBuffer: [number, number, number];
  gammaRGBBuffer: [number, number, number];
  contrastRGBBuffer: [number, number, number];
  safeGammaRGBBuffer: [number, number, number];
  safeExposureRGBBuffer: [number, number, number];
  scaleRGBBuffer: [number, number, number];
  offsetRGBBuffer: [number, number, number];
  channelSwizzleBuffer: Int32Array;
}

/**
 * Push dirty uniforms to the shader, then clear dirty flags.
 *
 * @returns The new value of textureUnitsInitialized.
 */
export function applyUniforms(
  state: InternalShaderState,
  dirtyFlags: Set<string>,
  shader: ShaderProgram,
  texCb: TextureCallbacks,
  buffers: UniformBuffers,
  textureUnitsInitialized: boolean,
): boolean {
  const dirty = dirtyFlags;
  const s = state;

  // Color adjustments
  if (dirty.has(DIRTY_COLOR)) {
    const adj = s.colorAdjustments;

    const expBuf = buffers.exposureRGBBuffer;
    if (adj.exposureRGB) {
      expBuf[0] = adj.exposureRGB[0];
      expBuf[1] = adj.exposureRGB[1];
      expBuf[2] = adj.exposureRGB[2];
    } else {
      expBuf[0] = adj.exposure;
      expBuf[1] = adj.exposure;
      expBuf[2] = adj.exposure;
    }

    const gamBuf = buffers.gammaRGBBuffer;
    if (adj.gammaRGB) {
      gamBuf[0] = adj.gammaRGB[0];
      gamBuf[1] = adj.gammaRGB[1];
      gamBuf[2] = adj.gammaRGB[2];
    } else {
      gamBuf[0] = adj.gamma;
      gamBuf[1] = adj.gamma;
      gamBuf[2] = adj.gamma;
    }

    const conBuf = buffers.contrastRGBBuffer;
    if (adj.contrastRGB) {
      conBuf[0] = adj.contrastRGB[0];
      conBuf[1] = adj.contrastRGB[1];
      conBuf[2] = adj.contrastRGB[2];
    } else {
      conBuf[0] = adj.contrast;
      conBuf[1] = adj.contrast;
      conBuf[2] = adj.contrast;
    }

    const safeGamBuf = buffers.safeGammaRGBBuffer;
    safeGamBuf[0] = gamBuf[0] <= 0 ? 1e-4 : gamBuf[0];
    safeGamBuf[1] = gamBuf[1] <= 0 ? 1e-4 : gamBuf[1];
    safeGamBuf[2] = gamBuf[2] <= 0 ? 1e-4 : gamBuf[2];

    const safeExpBuf = buffers.safeExposureRGBBuffer;
    safeExpBuf[0] = Number.isFinite(expBuf[0]) ? expBuf[0] : 0;
    safeExpBuf[1] = Number.isFinite(expBuf[1]) ? expBuf[1] : 0;
    safeExpBuf[2] = Number.isFinite(expBuf[2]) ? expBuf[2] : 0;

    const sclBuf = buffers.scaleRGBBuffer;
    const scaleScalar = adj.scale ?? 1;
    if (adj.scaleRGB) {
      sclBuf[0] = adj.scaleRGB[0];
      sclBuf[1] = adj.scaleRGB[1];
      sclBuf[2] = adj.scaleRGB[2];
    } else {
      sclBuf[0] = scaleScalar;
      sclBuf[1] = scaleScalar;
      sclBuf[2] = scaleScalar;
    }

    const offBuf = buffers.offsetRGBBuffer;
    const offsetScalar = adj.offset ?? 0;
    if (adj.offsetRGB) {
      offBuf[0] = adj.offsetRGB[0];
      offBuf[1] = adj.offsetRGB[1];
      offBuf[2] = adj.offsetRGB[2];
    } else {
      offBuf[0] = offsetScalar;
      offBuf[1] = offsetScalar;
      offBuf[2] = offsetScalar;
    }

    shader.setUniform('u_exposureRGB', safeExpBuf);
    shader.setUniform('u_gammaRGB', safeGamBuf);
    shader.setUniform('u_contrastRGB', conBuf);
    shader.setUniform('u_scaleRGB', sclBuf);
    shader.setUniform('u_offsetRGB', offBuf);
    shader.setUniform('u_saturation', adj.saturation);
    shader.setUniform('u_brightness', adj.brightness);
    shader.setUniform('u_temperature', adj.temperature);
    shader.setUniform('u_tint', adj.tint);

    const hueRotationDegrees = adj.hueRotation;
    if (isIdentityHueRotation(hueRotationDegrees)) {
      shader.setUniformInt('u_hueRotationEnabled', 0);
    } else {
      shader.setUniformInt('u_hueRotationEnabled', 1);
      const hueMatrix = getHueRotationMatrix(hueRotationDegrees);
      shader.setUniformMatrix3('u_hueRotationMatrix', hueMatrix);
    }
  }

  // Tone mapping
  if (dirty.has(DIRTY_TONE_MAPPING)) {
    const toneMappingCode = s.toneMappingState.enabled ? TONE_MAPPING_OPERATOR_CODES[s.toneMappingState.operator] : 0;
    shader.setUniformInt('u_toneMappingOperator', toneMappingCode);
    shader.setUniform('u_tmReinhardWhitePoint', s.toneMappingState.reinhardWhitePoint ?? 4.0);
    shader.setUniform('u_tmFilmicExposureBias', s.toneMappingState.filmicExposureBias ?? 2.0);
    shader.setUniform('u_tmDragoBias', s.toneMappingState.dragoBias ?? 0.85);
    shader.setUniform('u_tmDragoLwa', s.toneMappingState.dragoLwa ?? 0.2);
    shader.setUniform('u_tmDragoLmax', s.toneMappingState.dragoLmax ?? 1.5);
    shader.setUniform('u_tmDragoBrightness', s.toneMappingState.dragoBrightness ?? 2.0);
    shader.setUniform('u_tmFilmicWhitePoint', s.toneMappingState.filmicWhitePoint ?? 11.2);
  }

  // Color inversion
  if (dirty.has(DIRTY_INVERSION)) {
    shader.setUniformInt('u_invert', s.colorInversionEnabled ? 1 : 0);
  }

  // CDL
  if (dirty.has(DIRTY_CDL)) {
    shader.setUniformInt('u_cdlEnabled', s.cdlEnabled ? 1 : 0);
    if (s.cdlEnabled) {
      shader.setUniform('u_cdlSlope', s.cdlSlope);
      shader.setUniform('u_cdlOffset', s.cdlOffset);
      shader.setUniform('u_cdlPower', s.cdlPower);
      shader.setUniform('u_cdlSaturation', s.cdlSaturation);
      shader.setUniformInt('u_cdlColorspace', s.cdlColorspace);
    }
  }

  // Curves LUT
  if (dirty.has(DIRTY_CURVES)) {
    shader.setUniformInt('u_curvesEnabled', s.curvesEnabled ? 1 : 0);
  }

  // Inline 1D LUT (from RVColor luminanceLUT)
  if (dirty.has(DIRTY_INLINE_LUT)) {
    shader.setUniformInt('u_inlineLUTEnabled', s.inlineLUTEnabled ? 1 : 0);
    if (s.inlineLUTEnabled) {
      shader.setUniformInt('u_inlineLUTChannels', s.inlineLUTChannels);
      shader.setUniform('u_inlineLUTSize', s.inlineLUTSize);
    }
  }

  // Color Wheels
  if (dirty.has(DIRTY_COLOR_WHEELS)) {
    shader.setUniformInt('u_colorWheelsEnabled', s.colorWheelsEnabled ? 1 : 0);
    if (s.colorWheelsEnabled) {
      shader.setUniform('u_wheelLift', s.wheelLift);
      shader.setUniform('u_wheelGamma', s.wheelGamma);
      shader.setUniform('u_wheelGain', s.wheelGain);
    }
  }

  // False Color
  if (dirty.has(DIRTY_FALSE_COLOR)) {
    shader.setUniformInt('u_falseColorEnabled', s.falseColorEnabled ? 1 : 0);
  }

  // Contour visualization (luminance iso-lines)
  if (dirty.has(DIRTY_CONTOUR)) {
    shader.setUniformInt('u_contourEnabled', s.contourEnabled ? 1 : 0);
    if (s.contourEnabled) {
      shader.setUniform('u_contourLevels', s.contourLevels);
      shader.setUniformInt('u_contourDesaturate', s.contourDesaturate ? 1 : 0);
      shader.setUniform('u_contourLineColor', s.contourLineColor);
    }
  }

  // Zebra Stripes
  if (dirty.has(DIRTY_ZEBRA)) {
    shader.setUniformInt('u_zebraEnabled', s.zebraEnabled ? 1 : 0);
    if (s.zebraEnabled) {
      shader.setUniform('u_zebraHighThreshold', s.zebraHighThreshold);
      shader.setUniform('u_zebraLowThreshold', s.zebraLowThreshold);
      shader.setUniform('u_zebraTime', s.zebraTime);
      shader.setUniformInt('u_zebraHighEnabled', s.zebraHighEnabled ? 1 : 0);
      shader.setUniformInt('u_zebraLowEnabled', s.zebraLowEnabled ? 1 : 0);
    }
  }

  // Channel mode
  if (dirty.has(DIRTY_CHANNELS)) {
    shader.setUniformInt('u_channelMode', s.channelModeCode);
  }

  // Look LUT (renamed from u_lut3D)
  if (dirty.has(DIRTY_LUT3D)) {
    shader.setUniformInt('u_lookLUT3DEnabled', s.lut3DEnabled ? 1 : 0);
    if (s.lut3DEnabled) {
      shader.setUniform('u_lookLUT3DIntensity', s.lut3DIntensity);
      shader.setUniform('u_lookLUT3DSize', s.lut3DSize);
      shader.setUniform('u_lookLUT3DDomainMin', s.lookLUT3DDomainMin);
      shader.setUniform('u_lookLUT3DDomainMax', s.lookLUT3DDomainMax);
    }
  }

  // File LUT
  if (dirty.has(DIRTY_FILE_LUT3D)) {
    shader.setUniformInt('u_fileLUT3DEnabled', s.fileLUT3DEnabled ? 1 : 0);
    if (s.fileLUT3DEnabled) {
      shader.setUniform('u_fileLUT3DIntensity', s.fileLUT3DIntensity);
      shader.setUniform('u_fileLUT3DSize', s.fileLUT3DSize);
      shader.setUniform('u_fileLUT3DDomainMin', s.fileLUT3DDomainMin);
      shader.setUniform('u_fileLUT3DDomainMax', s.fileLUT3DDomainMax);
    }
  }

  // Display LUT
  if (dirty.has(DIRTY_DISPLAY_LUT3D)) {
    shader.setUniformInt('u_displayLUT3DEnabled', s.displayLUT3DEnabled ? 1 : 0);
    if (s.displayLUT3DEnabled) {
      shader.setUniform('u_displayLUT3DIntensity', s.displayLUT3DIntensity);
      shader.setUniform('u_displayLUT3DSize', s.displayLUT3DSize);
      shader.setUniform('u_displayLUT3DDomainMin', s.displayLUT3DDomainMin);
      shader.setUniform('u_displayLUT3DDomainMax', s.displayLUT3DDomainMax);
    }
  }

  // Display transfer function
  if (dirty.has(DIRTY_DISPLAY)) {
    shader.setUniformInt('u_displayTransfer', s.displayTransferCode);
    shader.setUniform('u_displayGamma', s.displayGammaOverride);
    shader.setUniform('u_displayBrightness', s.displayBrightnessMultiplier);
    shader.setUniform('u_displayCustomGamma', s.displayCustomGamma);
  }

  // Background pattern
  if (dirty.has(DIRTY_BACKGROUND)) {
    shader.setUniformInt('u_backgroundPattern', s.bgPatternCode);
    if (s.bgPatternCode !== BG_PATTERN_NONE) {
      shader.setUniform('u_bgColor1', s.bgColor1);
      shader.setUniform('u_bgColor2', s.bgColor2);
      shader.setUniform('u_bgCheckerSize', s.bgCheckerSize);
    }
  }
  // Resolution is always needed for zebra stripes too and can change
  // without a setter (via resize()), so it is set unconditionally.
  const canvasSize = texCb.getCanvasSize();
  buffers.resolutionBuffer[0] = canvasSize.width;
  buffers.resolutionBuffer[1] = canvasSize.height;
  shader.setUniform('u_resolution', buffers.resolutionBuffer);

  // Highlights/Shadows/Whites/Blacks
  if (dirty.has(DIRTY_HIGHLIGHTS_SHADOWS)) {
    shader.setUniformInt('u_hsEnabled', s.hsEnabled ? 1 : 0);
    if (s.hsEnabled) {
      shader.setUniform('u_highlights', s.highlightsValue);
      shader.setUniform('u_shadows', s.shadowsValue);
      shader.setUniform('u_whites', s.whitesValue);
      shader.setUniform('u_blacks', s.blacksValue);
    }
  }

  // Vibrance
  if (dirty.has(DIRTY_VIBRANCE)) {
    shader.setUniformInt('u_vibranceEnabled', s.vibranceEnabled ? 1 : 0);
    if (s.vibranceEnabled) {
      shader.setUniform('u_vibrance', s.vibranceValue);
      shader.setUniformInt('u_vibranceSkinProtection', s.vibranceSkinProtection ? 1 : 0);
    }
  }

  // Clarity
  if (dirty.has(DIRTY_CLARITY)) {
    shader.setUniformInt('u_clarityEnabled', s.clarityEnabled ? 1 : 0);
    if (s.clarityEnabled) {
      shader.setUniform('u_clarity', s.clarityValue);
    }
  }

  // Sharpen
  if (dirty.has(DIRTY_SHARPEN)) {
    shader.setUniformInt('u_sharpenEnabled', s.sharpenEnabled ? 1 : 0);
    if (s.sharpenEnabled) {
      shader.setUniform('u_sharpenAmount', s.sharpenAmount);
    }
  }

  // Texel size (needed for clarity and sharpen)
  if ((dirty.has(DIRTY_CLARITY) || dirty.has(DIRTY_SHARPEN)) && (s.clarityEnabled || s.sharpenEnabled)) {
    shader.setUniform('u_texelSize', s.texelSize);
  }

  // HSL Qualifier
  if (dirty.has(DIRTY_HSL)) {
    shader.setUniformInt('u_hslQualifierEnabled', s.hslQualifierEnabled ? 1 : 0);
    if (s.hslQualifierEnabled) {
      shader.setUniform('u_hslHueCenter', s.hslHueCenter);
      shader.setUniform('u_hslHueWidth', s.hslHueWidth);
      shader.setUniform('u_hslHueSoftness', s.hslHueSoftness);
      shader.setUniform('u_hslSatCenter', s.hslSatCenter);
      shader.setUniform('u_hslSatWidth', s.hslSatWidth);
      shader.setUniform('u_hslSatSoftness', s.hslSatSoftness);
      shader.setUniform('u_hslLumCenter', s.hslLumCenter);
      shader.setUniform('u_hslLumWidth', s.hslLumWidth);
      shader.setUniform('u_hslLumSoftness', s.hslLumSoftness);
      shader.setUniform('u_hslCorrHueShift', s.hslCorrHueShift);
      shader.setUniform('u_hslCorrSatScale', s.hslCorrSatScale);
      shader.setUniform('u_hslCorrLumScale', s.hslCorrLumScale);
      shader.setUniformInt('u_hslInvert', s.hslInvert ? 1 : 0);
      shader.setUniformInt('u_hslMattePreview', s.hslMattePreview ? 1 : 0);
    }
  }

  // Gamut Mapping
  if (dirty.has(DIRTY_GAMUT_MAPPING)) {
    shader.setUniformInt('u_gamutMappingEnabled', s.gamutMappingEnabled ? 1 : 0);
    if (s.gamutMappingEnabled) {
      shader.setUniformInt('u_gamutMappingMode', s.gamutMappingModeCode);
      shader.setUniformInt('u_sourceGamut', s.gamutSourceCode);
      shader.setUniformInt('u_targetGamut', s.gamutTargetCode);
      shader.setUniformInt('u_gamutHighlightEnabled', s.gamutHighlightEnabled ? 1 : 0);
    } else {
      shader.setUniformInt('u_gamutHighlightEnabled', 0);
    }
  }

  // Automatic Color Primaries Conversion
  if (dirty.has(DIRTY_COLOR_PRIMARIES)) {
    shader.setUniformInt('u_inputPrimariesEnabled', s.inputPrimariesEnabled ? 1 : 0);
    if (s.inputPrimariesEnabled) {
      shader.setUniformMatrix3('u_inputPrimariesMatrix', s.inputPrimariesMatrix);
    }
    shader.setUniformInt('u_outputPrimariesEnabled', s.outputPrimariesEnabled ? 1 : 0);
    if (s.outputPrimariesEnabled) {
      shader.setUniformMatrix3('u_outputPrimariesMatrix', s.outputPrimariesMatrix);
    }
  }

  // Deinterlace
  if (dirty.has(DIRTY_DEINTERLACE)) {
    shader.setUniformInt('u_deinterlaceEnabled', s.deinterlaceEnabled ? 1 : 0);
    if (s.deinterlaceEnabled) {
      shader.setUniformInt('u_deinterlaceMethod', s.deinterlaceMethod);
      shader.setUniformInt('u_deinterlaceFieldOrder', s.deinterlaceFieldOrder);
    }
  }

  // Texel size - also needed for deinterlace
  if (dirty.has(DIRTY_DEINTERLACE) && s.deinterlaceEnabled) {
    shader.setUniform('u_texelSize', s.texelSize);
  }

  // Film Emulation
  if (dirty.has(DIRTY_FILM_EMULATION)) {
    shader.setUniformInt('u_filmEnabled', s.filmEnabled ? 1 : 0);
    if (s.filmEnabled) {
      shader.setUniform('u_filmIntensity', s.filmIntensity);
      shader.setUniform('u_filmSaturation', s.filmSaturation);
      shader.setUniform('u_filmGrainIntensity', s.filmGrainIntensity);
      shader.setUniform('u_filmGrainSeed', s.filmGrainSeed);
    }
  }

  // Linearize (log-to-linear conversion)
  if (dirty.has(DIRTY_LINEARIZE)) {
    shader.setUniformInt('u_linearizeLogType', s.linearizeLogType);
    shader.setUniform('u_linearizeFileGamma', s.linearizeFileGamma);
    shader.setUniformInt('u_linearizeSRGB2linear', s.linearizeSRGB2linear ? 1 : 0);
    shader.setUniformInt('u_linearizeRec709ToLinear', s.linearizeRec709ToLinear ? 1 : 0);
  }

  // Out-of-range visualization
  if (dirty.has(DIRTY_OUT_OF_RANGE)) {
    shader.setUniformInt('u_outOfRange', s.outOfRange);
  }

  // Premultiply/unpremultiply alpha
  if (dirty.has(DIRTY_PREMULT)) {
    shader.setUniformInt('u_premult', s.premultMode);
  }

  // Dither + Quantize visualization
  if (dirty.has(DIRTY_DITHER)) {
    shader.setUniformInt('u_ditherMode', s.ditherMode);
    shader.setUniformInt('u_quantizeBits', s.quantizeBits);
  }

  // Channel swizzle (RVChannelMap remapping)
  if (dirty.has(DIRTY_CHANNEL_SWIZZLE)) {
    buffers.channelSwizzleBuffer[0] = s.channelSwizzle[0];
    buffers.channelSwizzleBuffer[1] = s.channelSwizzle[1];
    buffers.channelSwizzleBuffer[2] = s.channelSwizzle[2];
    buffers.channelSwizzleBuffer[3] = s.channelSwizzle[3];
    shader.setUniform('u_channelSwizzle', buffers.channelSwizzleBuffer);
  }

  // Perspective Correction
  if (dirty.has(DIRTY_PERSPECTIVE)) {
    shader.setUniformInt('u_perspectiveEnabled', s.perspectiveEnabled ? 1 : 0);
    if (s.perspectiveEnabled) {
      shader.setUniformMatrix3('u_perspectiveInvH', s.perspectiveInvH);
      shader.setUniformInt('u_perspectiveQuality', s.perspectiveQuality);
      if (s.perspectiveQuality === 1) {
        shader.setUniform('u_texelSize', s.texelSize);
      }
    }
  }

  // Spherical (equirectangular 360) projection
  if (dirty.has(DIRTY_SPHERICAL)) {
    shader.setUniformInt('u_sphericalEnabled', s.sphericalEnabled ? 1 : 0);
    if (s.sphericalEnabled) {
      shader.setUniform('u_sphericalFov', s.sphericalFov);
      shader.setUniform('u_sphericalAspect', s.sphericalAspect);
      shader.setUniform('u_sphericalYaw', s.sphericalYaw);
      shader.setUniform('u_sphericalPitch', s.sphericalPitch);
    }
  }

  // --- Bind effect textures ---
  if (!textureUnitsInitialized) {
    shader.setUniformInt('u_curvesLUT', 1);
    shader.setUniformInt('u_falseColorLUT', 2);
    shader.setUniformInt('u_lookLUT3D', 3);
    shader.setUniformInt('u_filmLUT', 4);
    shader.setUniformInt('u_inlineLUT', 5);
    shader.setUniformInt('u_fileLUT3D', 6);
    shader.setUniformInt('u_displayLUT3D', 7);
    textureUnitsInitialized = true;
  }

  if (s.curvesEnabled) texCb.bindCurvesLUTTexture();
  if (s.falseColorEnabled) texCb.bindFalseColorLUTTexture();
  if (s.lut3DEnabled) texCb.bindLUT3DTexture();
  if (s.filmEnabled) texCb.bindFilmLUTTexture();
  if (s.inlineLUTEnabled) texCb.bindInlineLUTTexture();
  if (s.fileLUT3DEnabled) texCb.bindFileLUT3DTexture();
  if (s.displayLUT3DEnabled) texCb.bindDisplayLUT3DTexture();

  // Clear all dirty flags after uniforms have been set
  dirty.clear();

  return textureUnitsInitialized;
}
