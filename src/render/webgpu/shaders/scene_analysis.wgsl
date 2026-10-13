// Stage 7: Scene Analysis — out-of-range visualization, tone mapping (all 8
// operators), and gamut mapping (clip/compress with highlight).
// Ports sections 6g, 7, 7a from viewer.frag.glsl.
//
// NOTE: This shader expects common.wgsl to be prepended, which provides:
//   LUMA, tonemapReinhard, tonemapFilmic, filmicCurve, tonemapACES,
//   tonemapAgX, agxDefaultContrastApprox, tonemapPBRNeutral,
//   tonemapGT, gt_tonemap_channel, tonemapACESHill, RRTAndODTFit,
//   tonemapDrago, tonemapDragoChannel, gamutSoftClip, SourceGamutClamp
// The dispatcher applyToneMapping() and applyGamutMapping() below are
// stage-local because they read from this stage's `u` uniform.

struct Uniforms {
  // Out-of-range visualization: 0=off, 1=clamp-to-black, 2=highlight (red>1, blue<0)
  outOfRange: i32,

  // Tone mapping
  toneMappingEnabled: i32,
  toneMappingOperator: i32,  // 0=off,1=reinhard,2=filmic,3=aces,4=agx,5=pbrNeutral,6=gt,7=acesHill,8=drago

  // HDR headroom
  hdrHeadroom: f32,          // 1.0 for SDR, >1.0 for HDR (e.g. 3.0)

  // Reinhard params
  tmReinhardWhitePoint: f32, // default 4.0
  _pad0: f32,

  // Filmic params
  tmFilmicExposureBias: f32, // default 2.0
  tmFilmicWhitePoint: f32,   // default 11.2

  // Drago params
  tmDragoBias: f32,          // default 0.85
  tmDragoLwa: f32,           // scene average luminance
  tmDragoLmax: f32,          // scene max luminance
  tmDragoBrightness: f32,    // post-Drago brightness multiplier (default 2.0)

  // Gamut mapping
  gamutMappingEnabled: i32,
  gamutMappingModeCode: i32, // 0=clip, 1=compress
  gamutSourceCode: i32,      // 0=srgb, 1=rec2020, 2=display-p3
  gamutTargetCode: i32,      // 0=srgb, 1=rec2020, 2=display-p3
  gamutHighlightEnabled: i32,
  sourcePrimariesApplied: i32, // 1 when the input-primaries step or a File LUT already produced BT.709
  _pad2: i32,
  _pad3: i32,

  // Tone mapping runs per channel in the source primaries (wide-gamut working space)
  gamut: SourceGamutClamp,
}

// VSOut is provided by the prepended vertex shader source
// (_viewer_vert.wgsl or _passthrough_vert.wgsl) at pipeline build time.

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@group(1) @binding(0) var<uniform> u: Uniforms;

// LUMA is provided by common.wgsl (prepended).

// --- Gamut mapping matrices ---
//
// Linear-light primary conversions between RGB working spaces sharing D65.
// Each row of the math matrix gives the destination primary contribution from
// each source primary; no chromatic adaptation is needed (all D65 → D65).
//
// Storage convention: WGSL `mat3x3f(...)` is COLUMN-MAJOR (matches GLSL).
// The literal groups of 3 below are columns of the storage matrix, so the
// numbers read across each visual row form one COLUMN of the math matrix.
// For `M * v` this gives r' = m[0][0]*r + m[1][0]*g + m[2][0]*b.
//
// Mirror of GLSL `viewer.frag.glsl` and CPU `effectProcessing.shared.ts`.
// Tests pinning these values: src/render/__tests__/shaderMathColorPipeline.test.ts
// (XE-MATRIX-002..006) and the new MED-54 documentation tests.

// Rec.2020 (ITU-R BT.2020) → sRGB / BT.709 (D65 → D65)
// Reference: ITU-R BT.2020-2 Table 4 and ITU-R BT.709-6 Item 1.4.
const REC2020_TO_SRGB = mat3x3f(
   1.6605, -0.1246, -0.0182,
  -0.5876,  1.1329, -0.1006,
  -0.0728, -0.0083,  1.1187
);

// Display-P3 (D65) → sRGB / BT.709 (D65)
// Reference: SMPTE EG 432-1 (Display-P3) and ITU-R BT.709-6.
const P3_TO_SRGB = mat3x3f(
   1.2249, -0.0420, -0.0197,
  -0.2247,  1.0419, -0.0786,
  -0.0002,  0.0001,  1.0983
);

// sRGB / BT.709 (D65) → Display-P3 (D65) and → Rec.2020 (D65).
// Mirrors COLOR_PRIMARIES_MATRICES.SRGB_TO_P3 / SRGB_TO_REC2020.
const SRGB_TO_P3 = mat3x3f(
   0.8225,  0.0332,  0.0171,
   0.1774,  0.9669,  0.0724,
   0.0001, -0.0001,  0.9105
);
const SRGB_TO_REC2020 = mat3x3f(
   0.6274,  0.0691,  0.0164,
   0.3293,  0.9195,  0.0880,
   0.0433,  0.0114,  0.8956
);

// =====================================================================
// Tone Mapping Operators
//
// All operator implementations live in common.wgsl (prepended). They use
// the MED-52 uniform headroom convention: normalize input by hdrHeadroom
// (curve treats peak white as 1.0), apply the curve, re-scale by
// hdrHeadroom on output. The dispatcher below reads operator parameters
// from this stage's uniform block and forwards them to the common
// implementations.
// =====================================================================

// Apply selected tone mapping operator, reading params from `u`.
fn applyToneMapping(color: vec3f, op: i32) -> vec3f {
  switch (op) {
    case 1: { return tonemapReinhard(color, u.tmReinhardWhitePoint, u.hdrHeadroom); }
    case 2: { return tonemapFilmic(color, u.tmFilmicExposureBias, u.tmFilmicWhitePoint, u.hdrHeadroom); }
    case 3: { return tonemapACES(color, u.hdrHeadroom); }
    case 4: { return tonemapAgX(color, u.hdrHeadroom); }
    case 5: { return tonemapPBRNeutral(color, u.hdrHeadroom); }
    case 6: { return tonemapGT(color, u.hdrHeadroom); }
    case 7: { return tonemapACESHill(color, u.hdrHeadroom); }
    case 8: { return tonemapDrago(color, u.tmDragoBias, u.tmDragoLwa, u.tmDragoLmax, u.tmDragoBrightness, u.hdrHeadroom); }
    default: { return color; } // op == 0 (off)
  }
}

// --- Gamut mapping ---
// gamutSoftClip is provided by common.wgsl (prepended).

// Gamut mapping takes and returns BT.709 working-space values; the
// displayOutput stage converts the result to the output primaries.
fn applyGamutMapping(color: vec3f) -> vec3f {
  var c = color;

  // Bring the pixel into BT.709. The input-primaries step already did this
  // for tagged sources; only untagged pixels still carry the declared gamut.
  if (u.sourcePrimariesApplied == 0) {
    if (u.gamutSourceCode == 1) {
      c = REC2020_TO_SRGB * c;
    } else if (u.gamutSourceCode == 2) {
      c = P3_TO_SRGB * c;
    }
  }

  // Express it in the target gamut, where out-of-gamut means < 0.
  if (u.gamutTargetCode == 2) {
    c = SRGB_TO_P3 * c;
  } else if (u.gamutTargetCode == 1) {
    c = SRGB_TO_REC2020 * c;
  }

  // Range ceiling: SDR white, or the display headroom on HDR outputs so
  // gamut mapping does not clip highlights above 1.0.
  let peak = max(u.hdrHeadroom, 1.0);

  // Detect out-of-gamut pixels BEFORE clipping/compressing
  var highlighted = false;
  if (u.gamutHighlightEnabled == 1) {
    let outOfGamut = c.r < 0.0 || c.r > peak
                  || c.g < 0.0 || c.g > peak
                  || c.b < 0.0 || c.b > peak;
    if (outOfGamut) {
      // Blend with magenta at ~50% opacity
      c = clamp(c, vec3f(0.0), vec3f(peak));
      c = mix(c, vec3f(peak, 0.0, peak), 0.5);
      highlighted = true;
    }
  }

  // Apply clipping or soft compression
  if (!highlighted) {
    if (u.gamutMappingModeCode == 1) {
      c = gamutSoftClip(c / peak) * peak;
    } else {
      c = clamp(c, vec3f(0.0), vec3f(peak));
    }
  }

  // Back to the BT.709 working space.
  if (u.gamutTargetCode == 2) {
    c = P3_TO_SRGB * c;
  } else if (u.gamutTargetCode == 1) {
    c = REC2020_TO_SRGB * c;
  }

  return c;
}

// `@vertex fn vs(...)` is provided by the prepended vertex shader source.

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  var color = textureSample(tex, samp, in.uv);

  // 6g. Out-of-range visualization (before tone mapping, on scene-referred linear values)
  if (u.outOfRange == 2) {
    // Highlight mode: red where any channel > 1.0, blue where any channel < 0.0
    if (color.r > 1.0 || color.g > 1.0 || color.b > 1.0) {
      color = vec4f(1.0, 0.0, 0.0, color.a);
    } else if (color.r < 0.0 || color.g < 0.0 || color.b < 0.0) {
      color = vec4f(0.0, 0.0, 1.0, color.a);
    }
  } else if (u.outOfRange == 1) {
    // Clamp-to-black mode: out-of-range pixels become black
    if (color.r > 1.0 || color.g > 1.0 || color.b > 1.0 ||
        color.r < 0.0 || color.g < 0.0 || color.b < 0.0) {
      color = vec4f(0.0, 0.0, 0.0, color.a);
    }
  }

  // 7. Tone mapping (applied before display transfer for proper HDR handling)
  // The per-channel curves run in the source primaries so a wide-gamut
  // source keeps its gamut; BT.709 sources are tone mapped in BT.709.
  if (u.toneMappingEnabled == 1) {
    if (u.gamut.enabled != 0) {
      let tmSource = max(u.gamut.toSource * color.rgb, vec3f(0.0));
      color = vec4f(u.gamut.toWorking * applyToneMapping(tmSource, u.toneMappingOperator), color.a);
    } else {
      color = vec4f(
        applyToneMapping(max(color.rgb, vec3f(0.0)), u.toneMappingOperator),
        color.a
      );
    }
  }

  // 7a. Gamut mapping (after tone mapping, before display transfer)
  if (u.gamutMappingEnabled == 1) {
    color = vec4f(applyGamutMapping(color.rgb), color.a);
  }

  return color;
}
