// Stage 7: Scene Analysis — out-of-range visualization, tone mapping (all 8
// operators), and gamut mapping (clip/compress with highlight).
// Ports sections 6g, 7, 7a from viewer.frag.glsl.
//
// NOTE: This shader expects common.wgsl to be prepended, which provides:
//   LUMA, tonemapReinhard, tonemapFilmic, filmicCurve, tonemapACES,
//   tonemapAgX, agxDefaultContrastApprox, tonemapPBRNeutral,
//   tonemapGT, gt_tonemap_channel, tonemapACESHill, RRTAndODTFit,
//   tonemapDrago, tonemapDragoChannel, gamutSoftClip
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
  _pad1: i32,
  _pad2: i32,
  _pad3: i32,
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

// Rec.2020 (ITU-R BT.2020) → Display-P3 (D65 → D65)
// Reference: SMPTE EG 432-1 / Apple Display-P3 (DCI-P3 primaries with D65).
const REC2020_TO_P3 = mat3x3f(
   1.3436, -0.0653,  0.0028,
  -0.2822,  1.0758, -0.0196,
  -0.0614, -0.0105,  1.0168
);

// Display-P3 (D65) → sRGB / BT.709 (D65)
// Reference: SMPTE EG 432-1 (Display-P3) and ITU-R BT.709-6.
const P3_TO_SRGB = mat3x3f(
   1.2249, -0.0420, -0.0197,
  -0.2247,  1.0419, -0.0786,
  -0.0002,  0.0001,  1.0983
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

fn applyGamutMapping(color: vec3f) -> vec3f {
  var c = color;

  // Matrix conversion based on source/target gamut
  if (u.gamutSourceCode == 1) {
    // Rec.2020 source
    if (u.gamutTargetCode == 2) {
      c = REC2020_TO_P3 * c;
    } else {
      c = REC2020_TO_SRGB * c;
    }
  } else if (u.gamutSourceCode == 2 && u.gamutTargetCode == 0) {
    // P3 -> sRGB
    c = P3_TO_SRGB * c;
  }

  // Detect out-of-gamut pixels BEFORE clipping/compressing
  if (u.gamutHighlightEnabled == 1) {
    let outOfGamut = c.r < 0.0 || c.r > 1.0
                  || c.g < 0.0 || c.g > 1.0
                  || c.b < 0.0 || c.b > 1.0;
    if (outOfGamut) {
      // Blend with magenta at ~50% opacity
      c = clamp(c, vec3f(0.0), vec3f(1.0));
      c = mix(c, vec3f(1.0, 0.0, 1.0), 0.5);
      return c;
    }
  }

  // Apply clipping or soft compression
  if (u.gamutMappingModeCode == 1) {
    c = gamutSoftClip(c);
  } else {
    c = clamp(c, vec3f(0.0), vec3f(1.0));
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
  if (u.toneMappingEnabled == 1) {
    color = vec4f(
      applyToneMapping(max(color.rgb, vec3f(0.0)), u.toneMappingOperator),
      color.a
    );
  }

  // 7a. Gamut mapping (after tone mapping, before display transfer)
  if (u.gamutMappingEnabled == 1) {
    color = vec4f(applyGamutMapping(color.rgb), color.a);
  }

  return color;
}
