/**
 * ShaderBatchApplicator — compares incoming RenderState against current
 * internal state and calls the appropriate setters on ShaderStateManager.
 *
 * Extracted from ShaderStateManager.applyRenderState() for maintainability.
 */

import type { RenderState } from './RenderState';
import type { ShaderStateManager } from './ShaderStateManager';
import { CHANNEL_MODE_CODES, GAMUT_CODES, GAMUT_MODE_CODES, DIRTY_BACKGROUND } from './ShaderConstants';
import { float32ArrayEquals } from './ShaderStateTypes';
import type { InternalShaderState } from './ShaderStateTypes';

/**
 * Apply a full RenderState to the manager, marking only groups whose values
 * actually changed.
 *
 * During steady-state playback (no user interaction), all comparisons
 * short-circuit → no dirty flags → applyUniforms() skips all GL calls.
 * This eliminates ~65 redundant uniform uploads per frame.
 */
export function applyRenderState(manager: ShaderStateManager, renderState: RenderState): void {
  const s = manager.getInternalState() as InternalShaderState;

  // --- Color adjustments (8+ uniforms) ---
  {
    const a = renderState.colorAdjustments;
    const c = s.colorAdjustments;
    const rgbChanged = (
      aRGB: [number, number, number] | undefined,
      cRGB: [number, number, number] | undefined,
    ): boolean => {
      if (aRGB === cRGB) return false;
      if (!aRGB || !cRGB) return true;
      return aRGB[0] !== cRGB[0] || aRGB[1] !== cRGB[1] || aRGB[2] !== cRGB[2];
    };
    if (
      a.exposure !== c.exposure ||
      a.gamma !== c.gamma ||
      a.saturation !== c.saturation ||
      a.contrast !== c.contrast ||
      a.brightness !== c.brightness ||
      a.temperature !== c.temperature ||
      a.tint !== c.tint ||
      a.hueRotation !== c.hueRotation ||
      a.scale !== c.scale ||
      a.offset !== c.offset ||
      rgbChanged(a.exposureRGB, c.exposureRGB) ||
      rgbChanged(a.gammaRGB, c.gammaRGB) ||
      rgbChanged(a.contrastRGB, c.contrastRGB) ||
      rgbChanged(a.scaleRGB, c.scaleRGB) ||
      rgbChanged(a.offsetRGB, c.offsetRGB)
    ) {
      manager.setColorAdjustments(a);
    }

    // Inline LUT (part of color adjustments but uses separate texture)
    const newLUT = a.inlineLUT ?? null;
    const newChannels = a.lutChannels ?? 1;
    if (newLUT !== s.inlineLUTData || newChannels !== s.inlineLUTChannels) {
      manager.setInlineLUT(newLUT, newChannels);
    }
  }

  // --- Color inversion (1 uniform) ---
  if (renderState.colorInversion !== s.colorInversionEnabled) {
    manager.setColorInversion(renderState.colorInversion);
  }

  // --- Tone mapping (3+ uniforms) ---
  {
    const t = renderState.toneMappingState;
    const c = s.toneMappingState;
    if (
      t.enabled !== c.enabled ||
      t.operator !== c.operator ||
      (t.reinhardWhitePoint ?? 4.0) !== (c.reinhardWhitePoint ?? 4.0) ||
      (t.filmicExposureBias ?? 2.0) !== (c.filmicExposureBias ?? 2.0) ||
      (t.filmicWhitePoint ?? 11.2) !== (c.filmicWhitePoint ?? 11.2) ||
      (t.dragoBias ?? 0.85) !== (c.dragoBias ?? 0.85) ||
      (t.dragoLwa ?? 0.2) !== (c.dragoLwa ?? 0.2) ||
      (t.dragoLmax ?? 1.5) !== (c.dragoLmax ?? 1.5) ||
      (t.dragoBrightness ?? 2.0) !== (c.dragoBrightness ?? 2.0)
    ) {
      manager.setToneMappingState(t);
    }
  }

  // --- Background pattern (4 uniforms) ---
  {
    const oldCode = s.bgPatternCode;
    const oldC1_0 = s.bgColor1[0],
      oldC1_1 = s.bgColor1[1],
      oldC1_2 = s.bgColor1[2];
    const oldC2_0 = s.bgColor2[0],
      oldC2_1 = s.bgColor2[1],
      oldC2_2 = s.bgColor2[2];
    const oldChecker = s.bgCheckerSize;
    manager.setBackgroundPattern(renderState.backgroundPattern);
    if (
      s.bgPatternCode === oldCode &&
      s.bgColor1[0] === oldC1_0 &&
      s.bgColor1[1] === oldC1_1 &&
      s.bgColor1[2] === oldC1_2 &&
      s.bgColor2[0] === oldC2_0 &&
      s.bgColor2[1] === oldC2_1 &&
      s.bgColor2[2] === oldC2_2 &&
      s.bgCheckerSize === oldChecker
    ) {
      manager.clearDirtyFlag(DIRTY_BACKGROUND);
    }
  }

  // --- CDL (6 uniforms) ---
  {
    const c = renderState.cdl;
    const newColorspace = renderState.cdlColorspace ?? 0;
    if (
      c.slope.r !== s.cdlSlope[0] ||
      c.slope.g !== s.cdlSlope[1] ||
      c.slope.b !== s.cdlSlope[2] ||
      c.offset.r !== s.cdlOffset[0] ||
      c.offset.g !== s.cdlOffset[1] ||
      c.offset.b !== s.cdlOffset[2] ||
      c.power.r !== s.cdlPower[0] ||
      c.power.g !== s.cdlPower[1] ||
      c.power.b !== s.cdlPower[2] ||
      c.saturation !== s.cdlSaturation ||
      newColorspace !== s.cdlColorspace
    ) {
      manager.setCDL(c);
      manager.setCDLColorspace(newColorspace);
    }
  }

  // --- Curves LUT (1-2 uniforms) ---
  if (renderState.curvesLUT !== null || s.curvesEnabled) {
    manager.setCurvesLUT(renderState.curvesLUT);
  }

  // --- Color wheels (4 uniforms) ---
  {
    const cw = renderState.colorWheels;
    const wl = s.wheelLift;
    const wg = s.wheelGamma;
    const wn = s.wheelGain;
    if (
      cw.lift.r !== wl[0] ||
      cw.lift.g !== wl[1] ||
      cw.lift.b !== wl[2] ||
      cw.lift.y !== wl[3] ||
      cw.gamma.r !== wg[0] ||
      cw.gamma.g !== wg[1] ||
      cw.gamma.b !== wg[2] ||
      cw.gamma.y !== wg[3] ||
      cw.gain.r !== wn[0] ||
      cw.gain.g !== wn[1] ||
      cw.gain.b !== wn[2] ||
      cw.gain.y !== wn[3]
    ) {
      manager.setColorWheels(cw);
    }
  }

  // --- False color (2 uniforms) ---
  if (
    renderState.falseColor.enabled !== s.falseColorEnabled ||
    (renderState.falseColor.enabled && renderState.falseColor.lut !== s.falseColorLUTData)
  ) {
    manager.setFalseColor(renderState.falseColor);
  }

  // --- Zebra stripes (5 uniforms, time animates when enabled) ---
  {
    const z = renderState.zebraStripes;
    const newEnabled = z.enabled && (z.highEnabled || z.lowEnabled);
    if (newEnabled || newEnabled !== s.zebraEnabled) {
      manager.setZebraStripes(z);
    }
  }

  // --- Channel mode (1 uniform) ---
  {
    const code = CHANNEL_MODE_CODES[renderState.channelMode] ?? 0;
    if (code !== s.channelModeCode) {
      manager.setChannelMode(renderState.channelMode);
    }
  }

  // --- Look LUT 3D (via legacy lut field or new lookLUT) ---
  {
    const lookLUT = renderState.lookLUT;
    if (lookLUT) {
      if (
        lookLUT.data !== s.lut3DData ||
        lookLUT.size !== s.lut3DSize ||
        lookLUT.intensity !== s.lut3DIntensity ||
        lookLUT.domainMin[0] !== s.lookLUT3DDomainMin[0] ||
        lookLUT.domainMin[1] !== s.lookLUT3DDomainMin[1] ||
        lookLUT.domainMin[2] !== s.lookLUT3DDomainMin[2] ||
        lookLUT.domainMax[0] !== s.lookLUT3DDomainMax[0] ||
        lookLUT.domainMax[1] !== s.lookLUT3DDomainMax[1] ||
        lookLUT.domainMax[2] !== s.lookLUT3DDomainMax[2]
      ) {
        manager.setLookLUT(lookLUT.data, lookLUT.size, lookLUT.intensity, lookLUT.domainMin, lookLUT.domainMax);
      }
    } else {
      const l = renderState.lut;
      if (l.data !== s.lut3DData || l.size !== s.lut3DSize || l.intensity !== s.lut3DIntensity) {
        manager.setLUT(l.data, l.size, l.intensity);
      }
    }
  }

  // --- File LUT 3D ---
  if (renderState.fileLUT) {
    const fl = renderState.fileLUT;
    if (
      fl.data !== s.fileLUT3DData ||
      fl.size !== s.fileLUT3DSize ||
      fl.intensity !== s.fileLUT3DIntensity ||
      fl.domainMin[0] !== s.fileLUT3DDomainMin[0] ||
      fl.domainMin[1] !== s.fileLUT3DDomainMin[1] ||
      fl.domainMin[2] !== s.fileLUT3DDomainMin[2] ||
      fl.domainMax[0] !== s.fileLUT3DDomainMax[0] ||
      fl.domainMax[1] !== s.fileLUT3DDomainMax[1] ||
      fl.domainMax[2] !== s.fileLUT3DDomainMax[2]
    ) {
      manager.setFileLUT(fl.data, fl.size, fl.intensity, fl.domainMin, fl.domainMax);
    }
  } else if (s.fileLUT3DEnabled) {
    manager.setFileLUT(null, 0, 0);
  }

  // --- Display LUT 3D ---
  if (renderState.displayLUT) {
    const dl = renderState.displayLUT;
    if (
      dl.data !== s.displayLUT3DData ||
      dl.size !== s.displayLUT3DSize ||
      dl.intensity !== s.displayLUT3DIntensity ||
      dl.domainMin[0] !== s.displayLUT3DDomainMin[0] ||
      dl.domainMin[1] !== s.displayLUT3DDomainMin[1] ||
      dl.domainMin[2] !== s.displayLUT3DDomainMin[2] ||
      dl.domainMax[0] !== s.displayLUT3DDomainMax[0] ||
      dl.domainMax[1] !== s.displayLUT3DDomainMax[1] ||
      dl.domainMax[2] !== s.displayLUT3DDomainMax[2]
    ) {
      manager.setDisplayLUT(dl.data, dl.size, dl.intensity, dl.domainMin, dl.domainMax);
    }
  } else if (s.displayLUT3DEnabled) {
    manager.setDisplayLUT(null, 0, 0);
  }

  // --- Display color (4 uniforms) ---
  {
    const d = renderState.displayColor;
    if (
      d.transferFunction !== s.displayTransferCode ||
      d.displayGamma !== s.displayGammaOverride ||
      d.displayBrightness !== s.displayBrightnessMultiplier ||
      d.customGamma !== s.displayCustomGamma
    ) {
      manager.setDisplayColorState(d);
    }
  }

  // --- Highlights/shadows (5 uniforms) ---
  {
    const h = renderState.highlightsShadows;
    if (
      h.highlights / 100 !== s.highlightsValue ||
      h.shadows / 100 !== s.shadowsValue ||
      h.whites / 100 !== s.whitesValue ||
      h.blacks / 100 !== s.blacksValue
    ) {
      manager.setHighlightsShadows(h);
    }
  }

  // --- Vibrance (3 uniforms) ---
  {
    const v = renderState.vibrance;
    if (v.amount / 100 !== s.vibranceValue || v.skinProtection !== s.vibranceSkinProtection) {
      manager.setVibrance({ vibrance: v.amount, skinProtection: v.skinProtection });
    }
  }

  // --- Clarity (2 uniforms) ---
  if (renderState.clarity / 100 !== s.clarityValue) {
    manager.setClarity({ clarity: renderState.clarity });
  }

  // --- Sharpen (2 uniforms) ---
  if (renderState.sharpen / 100 !== s.sharpenAmount) {
    manager.setSharpen({ amount: renderState.sharpen });
  }

  // --- HSL qualifier (14 uniforms) ---
  {
    const h = renderState.hslQualifier;
    if (
      h.enabled !== s.hslQualifierEnabled ||
      h.hue.center !== s.hslHueCenter ||
      h.hue.width !== s.hslHueWidth ||
      h.hue.softness !== s.hslHueSoftness ||
      h.saturation.center !== s.hslSatCenter ||
      h.saturation.width !== s.hslSatWidth ||
      h.saturation.softness !== s.hslSatSoftness ||
      h.luminance.center !== s.hslLumCenter ||
      h.luminance.width !== s.hslLumWidth ||
      h.luminance.softness !== s.hslLumSoftness ||
      h.correction.hueShift !== s.hslCorrHueShift ||
      h.correction.saturationScale !== s.hslCorrSatScale ||
      h.correction.luminanceScale !== s.hslCorrLumScale ||
      h.invert !== s.hslInvert ||
      h.mattePreview !== s.hslMattePreview
    ) {
      manager.setHSLQualifier(h);
    }
  }

  // --- Gamut mapping (5 uniforms) ---
  if (renderState.gamutMapping) {
    const gm = renderState.gamutMapping;
    const newEnabled = gm.mode !== 'off' && gm.sourceGamut !== gm.targetGamut;
    const newModeCode = newEnabled ? (GAMUT_MODE_CODES[gm.mode] ?? 0) : 0;
    const newSourceCode = GAMUT_CODES[gm.sourceGamut] ?? 0;
    const newTargetCode = GAMUT_CODES[gm.targetGamut] ?? 0;
    const newHighlight = newEnabled && gm.highlightOutOfGamut === true;
    if (
      newEnabled !== s.gamutMappingEnabled ||
      newModeCode !== s.gamutMappingModeCode ||
      newSourceCode !== s.gamutSourceCode ||
      newTargetCode !== s.gamutTargetCode ||
      newHighlight !== s.gamutHighlightEnabled
    ) {
      manager.setGamutMapping(gm);
    }
  }

  // --- Deinterlace (3 uniforms) ---
  if (renderState.deinterlace) {
    const di = renderState.deinterlace;
    const newEnabled = di.enabled && di.method !== 1;
    if (
      newEnabled !== s.deinterlaceEnabled ||
      di.method !== s.deinterlaceMethod ||
      di.fieldOrder !== s.deinterlaceFieldOrder
    ) {
      manager.setDeinterlace(di);
    }
  } else if (s.deinterlaceEnabled) {
    manager.setDeinterlace({ enabled: false, method: 1, fieldOrder: 0 });
  }

  // --- Film emulation (5 uniforms + LUT texture) ---
  if (renderState.filmEmulation) {
    const fe = renderState.filmEmulation;
    const newEnabled = fe.enabled && fe.intensity > 0;
    if (
      newEnabled !== s.filmEnabled ||
      fe.intensity !== s.filmIntensity ||
      fe.saturation !== s.filmSaturation ||
      fe.grainIntensity !== s.filmGrainIntensity ||
      fe.grainSeed !== s.filmGrainSeed ||
      fe.lutData !== s.filmLUTData
    ) {
      manager.setFilmEmulation(fe);
    }
  } else if (s.filmEnabled) {
    manager.setFilmEmulation({
      enabled: false,
      intensity: 0,
      saturation: 1,
      grainIntensity: 0,
      grainSeed: 0,
      lutData: null,
    });
  }

  // --- Perspective correction (3 uniforms) ---
  if (renderState.perspective) {
    const pc = renderState.perspective;
    if (
      pc.enabled !== s.perspectiveEnabled ||
      pc.quality !== s.perspectiveQuality ||
      !float32ArrayEquals(pc.invH, s.perspectiveInvH)
    ) {
      manager.setPerspective(pc);
    }
  } else if (s.perspectiveEnabled) {
    manager.setPerspective({ enabled: false, invH: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), quality: 0 });
  }

  // --- Linearize (log-to-linear conversion, 4 uniforms) ---
  if (renderState.linearize) {
    const lz = renderState.linearize;
    if (
      lz.logType !== s.linearizeLogType ||
      lz.sRGB2linear !== s.linearizeSRGB2linear ||
      lz.rec709ToLinear !== s.linearizeRec709ToLinear ||
      lz.fileGamma !== s.linearizeFileGamma ||
      lz.alphaType !== s.linearizeAlphaType
    ) {
      manager.setLinearize(lz);
    }
  } else if (
    s.linearizeLogType !== 0 ||
    s.linearizeSRGB2linear ||
    s.linearizeRec709ToLinear ||
    s.linearizeFileGamma !== 1.0 ||
    s.linearizeAlphaType !== 0
  ) {
    manager.setLinearize({ logType: 0, sRGB2linear: false, rec709ToLinear: false, fileGamma: 1.0, alphaType: 0 });
  }

  // --- Out-of-range visualization (1 uniform) ---
  {
    const newOutOfRange = renderState.outOfRange ?? 0;
    if (newOutOfRange !== s.outOfRange) {
      manager.setOutOfRange(newOutOfRange);
    }
  }

  // --- Premultiply/unpremultiply alpha (1 uniform) ---
  {
    const newPremult = renderState.premultMode ?? 0;
    if (newPremult !== s.premultMode) {
      manager.setPremultMode(newPremult);
    }
  }

  // --- Channel swizzle (1 uniform, ivec4) ---
  if (renderState.channelSwizzle) {
    const cs = renderState.channelSwizzle;
    if (
      cs[0] !== s.channelSwizzle[0] ||
      cs[1] !== s.channelSwizzle[1] ||
      cs[2] !== s.channelSwizzle[2] ||
      cs[3] !== s.channelSwizzle[3]
    ) {
      manager.setChannelSwizzle(cs);
    }
  } else if (
    s.channelSwizzle[0] !== 0 ||
    s.channelSwizzle[1] !== 1 ||
    s.channelSwizzle[2] !== 2 ||
    s.channelSwizzle[3] !== 3
  ) {
    manager.setChannelSwizzle([0, 1, 2, 3]);
  }

  // --- Dither + Quantize visualization (2 uniforms) ---
  {
    const newDither = renderState.ditherMode ?? 0;
    const newQuantize = renderState.quantizeBits ?? 0;
    if (newDither !== s.ditherMode) {
      manager.setDitherMode(newDither);
    }
    if (newQuantize !== s.quantizeBits) {
      manager.setQuantizeBits(newQuantize);
    }
  }

  // --- Contour visualization (4 uniforms) ---
  if (renderState.luminanceVis) {
    const lv = renderState.luminanceVis;
    const contourEnabled = lv.mode === 'contour';
    if (
      s.contourEnabled !== contourEnabled ||
      s.contourLevels !== lv.contourLevels ||
      s.contourDesaturate !== lv.contourDesaturate ||
      s.contourLineColor[0] !== lv.contourLineColor[0] ||
      s.contourLineColor[1] !== lv.contourLineColor[1] ||
      s.contourLineColor[2] !== lv.contourLineColor[2]
    ) {
      manager.setContour({
        enabled: contourEnabled,
        levels: lv.contourLevels,
        desaturate: lv.contourDesaturate,
        lineColor: lv.contourLineColor,
      });
    }
  } else if (s.contourEnabled) {
    manager.disableContour();
  }
}
