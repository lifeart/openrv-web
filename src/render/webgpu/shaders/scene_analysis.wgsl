// Stage 7: Scene Analysis — out-of-range visualization, tone mapping (all 8
// operators), and gamut mapping (clip/compress with highlight).
// Ports sections 6g, 7, 7a from viewer.frag.glsl.

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

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@group(1) @binding(0) var<uniform> u: Uniforms;

// Luminance coefficients (Rec. 709)
const LUMA = vec3f(0.2126, 0.7152, 0.0722);

// --- Gamut mapping matrices ---

// Rec.2020 to sRGB
const REC2020_TO_SRGB = mat3x3f(
   1.6605, -0.1246, -0.0182,
  -0.5876,  1.1329, -0.1006,
  -0.0728, -0.0083,  1.1187
);

// Rec.2020 to Display-P3
const REC2020_TO_P3 = mat3x3f(
   1.3436, -0.0653,  0.0028,
  -0.2822,  1.0758, -0.0196,
  -0.0614, -0.0105,  1.0168
);

// Display-P3 to sRGB
const P3_TO_SRGB = mat3x3f(
   1.2249, -0.0420, -0.0197,
  -0.2247,  1.0419, -0.0786,
  -0.0002,  0.0001,  1.0983
);

// =====================================================================
// Tone Mapping Operators
// =====================================================================

// --- Reinhard ---
fn tonemapReinhard(color: vec3f) -> vec3f {
  let wp = u.tmReinhardWhitePoint * u.hdrHeadroom;
  let wp2 = wp * wp;
  return color * (1.0 + color / wp2) / (1.0 + color);
}

// --- Filmic / Uncharted 2 ---
fn filmicCurve(x: vec3f) -> vec3f {
  let A = 0.15;  // Shoulder strength
  let B = 0.50;  // Linear strength
  let C = 0.10;  // Linear angle
  let D = 0.20;  // Toe strength
  let E = 0.02;  // Toe numerator
  let F = 0.30;  // Toe denominator
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

fn tonemapFilmic(color: vec3f) -> vec3f {
  let curr = filmicCurve(u.tmFilmicExposureBias * color);
  let whiteScale = vec3f(1.0) / filmicCurve(vec3f(u.tmFilmicWhitePoint * u.hdrHeadroom));
  return curr * whiteScale;
}

// --- ACES (Narkowicz fit) ---
fn tonemapACES(color: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  // Scale input to map headroom range to [0,1], apply curve, then scale back
  let scaled = color / u.hdrHeadroom;
  let mapped = clamp((scaled * (a * scaled + b)) / (scaled * (c * scaled + d) + e), vec3f(0.0), vec3f(1.0));
  return mapped * u.hdrHeadroom;
}

// --- AgX (Troy Sobotka / Blender 4.x) ---
fn agxDefaultContrastApprox(x: vec3f) -> vec3f {
  let x2 = x * x;
  let x4 = x2 * x2;
  return 15.5 * x4 * x2
       - 40.14 * x4 * x
       + 31.96 * x4
       - 6.868 * x2 * x
       + 0.4298 * x2
       + 0.1191 * x
       - 0.00232;
}

fn tonemapAgX(color: vec3f) -> vec3f {
  let AgXInsetMatrix = mat3x3f(
    vec3f(0.842479062253094, 0.0423282422610123, 0.0423756549057051),
    vec3f(0.0784335999999992, 0.878468636469772, 0.0784336),
    vec3f(0.0792237451477643, 0.0791661274605434, 0.879142973793104)
  );
  let AgXOutsetMatrix = mat3x3f(
    vec3f(1.19687900512017, -0.0528968517574562, -0.0529716355144438),
    vec3f(-0.0980208811401368, 1.15190312990417, -0.0980434501171241),
    vec3f(-0.0990297440797205, -0.0989611768448433, 1.15107367264116)
  );

  let AgxMinEv = -12.47393;
  let AgxMaxEv = 4.026069;

  var scaled = color / u.hdrHeadroom;
  scaled = AgXInsetMatrix * scaled;
  scaled = max(scaled, vec3f(1e-10));
  scaled = log2(scaled);
  scaled = (scaled - AgxMinEv) / (AgxMaxEv - AgxMinEv);
  scaled = clamp(scaled, vec3f(0.0), vec3f(1.0));
  scaled = agxDefaultContrastApprox(scaled);
  scaled = AgXOutsetMatrix * scaled;
  scaled = clamp(scaled, vec3f(0.0), vec3f(1.0));
  return scaled * u.hdrHeadroom;
}

// --- PBR Neutral (Khronos) ---
fn tonemapPBRNeutral(color: vec3f) -> vec3f {
  let startCompression = 0.8 - 0.04;
  let desaturation = 0.15;

  var scaled = color / u.hdrHeadroom;

  let x = min(scaled.r, min(scaled.g, scaled.b));
  var offset: f32;
  if (x < 0.08) {
    offset = x - 6.25 * x * x;
  } else {
    offset = 0.04;
  }
  scaled -= offset;

  let peak = max(scaled.r, max(scaled.g, scaled.b));
  if (peak < startCompression) {
    return scaled * u.hdrHeadroom;
  }

  let d = 1.0 - startCompression;
  let newPeak = 1.0 - d * d / (peak + d - startCompression);
  scaled *= newPeak / peak;

  let g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(scaled, vec3f(newPeak), g) * u.hdrHeadroom;
}

// --- GT / Gran Turismo (Hajime Uchimura) ---
fn gt_tonemap_channel(x: f32) -> f32 {
  let P = 1.0;
  let a = 1.0;
  let m = 0.22;
  let l = 0.4;
  let c = 1.33;
  let b = 0.0;

  let l0 = ((P - m) * l) / a;
  let S0 = m + l0;
  let S1 = m + a * l0;
  let C2 = (a * P) / (P - S1);
  let CP = -C2 / P;

  let w0 = 1.0 - smoothstep(0.0, m, x);
  let w2 = smoothstep(m + l0, m + l0, x);
  let w1 = 1.0 - w0 - w2;

  let T = m * pow(x / m, c) + b;
  let L = m + a * (x - m);
  let S = P - (P - S1) * exp(CP * (x - S0));

  return T * w0 + L * w1 + S * w2;
}

fn tonemapGT(color: vec3f) -> vec3f {
  let scaled = color / u.hdrHeadroom;
  let mapped = vec3f(
    gt_tonemap_channel(scaled.r),
    gt_tonemap_channel(scaled.g),
    gt_tonemap_channel(scaled.b)
  );
  return mapped * u.hdrHeadroom;
}

// --- ACES Hill (Stephen Hill) ---
fn RRTAndODTFit(v: vec3f) -> vec3f {
  let a = v * (v + 0.0245786) - 0.000090537;
  let b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

fn tonemapACESHill(color: vec3f) -> vec3f {
  let ACESInputMat = mat3x3f(
    vec3f(0.59719, 0.07600, 0.02840),
    vec3f(0.35458, 0.90834, 0.13383),
    vec3f(0.04823, 0.01566, 0.83777)
  );
  let ACESOutputMat = mat3x3f(
    vec3f( 1.60475, -0.10208, -0.00327),
    vec3f(-0.53108,  1.10813, -0.07276),
    vec3f(-0.07367, -0.00605,  1.07602)
  );

  var scaled = color / u.hdrHeadroom;
  scaled = ACESInputMat * scaled;
  scaled = RRTAndODTFit(scaled);
  scaled = ACESOutputMat * scaled;
  scaled = clamp(scaled, vec3f(0.0), vec3f(1.0));
  return scaled * u.hdrHeadroom;
}

// --- Drago adaptive logarithmic tone mapping (per-channel) ---
fn tonemapDragoChannel(L: f32) -> f32 {
  let Lwa = max(u.tmDragoLwa, 1e-6);
  let Lmax = max(u.tmDragoLmax, 1e-6) * u.hdrHeadroom;
  let Ln = L / Lwa;
  let biasP = log(u.tmDragoBias) / log(0.5);
  let denom = log2(1.0 + Lmax / Lwa);
  let num = log(1.0 + Ln) / log(2.0 + 8.0 * pow(Ln / (Lmax / Lwa), biasP));
  return num / max(denom, 1e-6);
}

fn tonemapDrago(color: vec3f) -> vec3f {
  let mapped = vec3f(
    tonemapDragoChannel(color.r),
    tonemapDragoChannel(color.g),
    tonemapDragoChannel(color.b)
  );
  return mapped * max(u.tmDragoBrightness, 0.0);
}

// Apply selected tone mapping operator
fn applyToneMapping(color: vec3f, op: i32) -> vec3f {
  switch (op) {
    case 1: { return tonemapReinhard(color); }
    case 2: { return tonemapFilmic(color); }
    case 3: { return tonemapACES(color); }
    case 4: { return tonemapAgX(color); }
    case 5: { return tonemapPBRNeutral(color); }
    case 6: { return tonemapGT(color); }
    case 7: { return tonemapACESHill(color); }
    case 8: { return tonemapDrago(color); }
    default: { return color; } // op == 0 (off)
  }
}

// --- Gamut mapping ---

fn gamutSoftClip(color: vec3f) -> vec3f {
  var result: vec3f;
  // Per-channel soft compression using smooth Hermite curve for values near 1.0
  for (var i = 0; i < 3; i++) {
    let x = color[i];
    if (x <= 0.0) {
      result[i] = 0.0;
    } else if (x <= 0.8) {
      result[i] = x;
    } else if (x <= 1.0) {
      // Soft rolloff: smoothstep from 0.8 to 1.0
      let t = (x - 0.8) / 0.2;
      let s = t * t * (3.0 - 2.0 * t);
      result[i] = 0.8 + s * 0.2;
    } else {
      result[i] = 1.0;
    }
  }
  return result;
}

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

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var out: VSOut;
  let x = f32(i32(i & 1u) * 2) - 1.0;
  let y = f32(i32(i >> 1u) * 2) - 1.0;
  out.pos = vec4f(x, y, 0.0, 1.0);
  out.uv = vec2f((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
  return out;
}

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
