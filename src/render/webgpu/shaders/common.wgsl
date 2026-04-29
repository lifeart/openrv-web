// Common utility functions shared across WebGPU pipeline stages.
// This file is prepended to other shaders via string concatenation
// before createShaderModule(). No entry points here.

// Luminance coefficients (Rec. 709)
const LUMA: vec3f = vec3f(0.2126, 0.7152, 0.0722);

// ---------------------------------------------------------------------------
// sRGB <-> Linear conversion
// ---------------------------------------------------------------------------

// sRGB EOTF (sRGB signal -> linear light)
fn srgbEOTF(x: f32) -> f32 {
  if (x <= 0.04045) {
    return x / 12.92;
  } else {
    return pow((x + 0.055) / 1.055, 2.4);
  }
}

fn srgbToLinear(color: vec3f) -> vec3f {
  return vec3f(srgbEOTF(color.r), srgbEOTF(color.g), srgbEOTF(color.b));
}

// sRGB inverse EOTF (linear -> sRGB signal)
fn linearToSRGBChannel(c: f32) -> f32 {
  if (c <= 0.0031308) {
    return c * 12.92;
  }
  return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

fn linearToSRGB(color: vec3f) -> vec3f {
  return vec3f(
    linearToSRGBChannel(color.r),
    linearToSRGBChannel(color.g),
    linearToSRGBChannel(color.b)
  );
}

// ---------------------------------------------------------------------------
// HLG EOTF / OETF
// ---------------------------------------------------------------------------

// HLG OETF^-1 (Rec. 2100 HLG, signal -> relative scene light)
// Reference: ITU-R BT.2100-2, Table 5
fn hlgOETFInverse(e: f32) -> f32 {
  let a: f32 = 0.17883277;
  let b: f32 = 0.28466892; // 1.0 - 4.0 * a
  let c: f32 = 0.55991073; // 0.5 - a * ln(4.0 * a)
  if (e <= 0.5) {
    return (e * e) / 3.0;
  } else {
    return (exp((e - c) / a) + b) / 12.0;
  }
}

fn hlgToLinear(signal: vec3f) -> vec3f {
  // Apply inverse OETF per channel, then OOTF (gamma 1.2 for 1000 cd/m^2)
  let scene = vec3f(
    hlgOETFInverse(signal.r),
    hlgOETFInverse(signal.g),
    hlgOETFInverse(signal.b)
  );
  // HLG OOTF: Lw = Ys^(gamma-1) * scene, where gamma ~ 1.2
  // Below OOTF_THRESH, use a linear ramp to avoid extreme gain for
  // near-black values. Linear extension from origin to threshold
  // keeps the curve C0-continuous.
  let OOTF_THRESH: f32 = 0.01;
  let OOTF_SLOPE: f32 = 39.810717; // OOTF_THRESH^(-0.8) = 10^1.6
  let ys = dot(scene, LUMA);
  var ootfGain: f32;
  if (ys < OOTF_THRESH) {
    ootfGain = ys * OOTF_SLOPE; // linear ramp: ys * T^(0.2-1)
  } else {
    ootfGain = pow(ys, 0.2);    // normal power curve
  }
  return scene * ootfGain;
}

// HLG OETF (linear scene light -> HLG signal)
fn hlgOETF(e: f32) -> f32 {
  let a: f32 = 0.17883277;
  let b: f32 = 0.28466892;
  let c: f32 = 0.55991073;
  if (e <= 1.0 / 12.0) {
    return sqrt(3.0 * e);
  } else {
    return a * log(12.0 * e - b) + c;
  }
}

fn linearToHLG(color: vec3f) -> vec3f {
  return vec3f(hlgOETF(color.r), hlgOETF(color.g), hlgOETF(color.b));
}

// ---------------------------------------------------------------------------
// PQ EOTF / OETF (SMPTE ST 2084)
// ---------------------------------------------------------------------------

fn pqEOTFChannel(n: f32) -> f32 {
  let m1: f32 = 0.1593017578125;   // 2610/16384
  let m2: f32 = 78.84375;           // 2523/32 * 128
  let c1: f32 = 0.8359375;          // 3424/4096
  let c2: f32 = 18.8515625;         // 2413/128
  let c3: f32 = 18.6875;            // 2392/128

  let nm1 = pow(max(n, 0.0), 1.0 / m2);
  let num = max(nm1 - c1, 0.0);
  let den = c2 - c3 * nm1;
  return pow(num / max(den, 1e-6), 1.0 / m1);
}

fn pqToLinear(signal: vec3f) -> vec3f {
  // PQ encodes absolute luminance; 1.0 = 10000 cd/m^2
  // Normalize so SDR white (203 cd/m^2) -> 1.0
  let pqNormFactor: f32 = 10000.0 / 203.0;
  return vec3f(
    pqEOTFChannel(signal.r),
    pqEOTFChannel(signal.g),
    pqEOTFChannel(signal.b)
  ) * pqNormFactor;
}

// PQ inverse EOTF (linear -> PQ signal)
fn pqOETFChannel(l: f32) -> f32 {
  let m1: f32 = 0.1593017578125;
  let m2: f32 = 78.84375;
  let c1: f32 = 0.8359375;
  let c2: f32 = 18.8515625;
  let c3: f32 = 18.6875;

  let lm1 = pow(max(l, 0.0), m1);
  let num = c1 + c2 * lm1;
  let den = 1.0 + c3 * lm1;
  return pow(num / den, m2);
}

fn linearToPQ(color: vec3f) -> vec3f {
  let pqNormFactor: f32 = 203.0 / 10000.0;
  let normalized = color * pqNormFactor;
  return vec3f(
    pqOETFChannel(normalized.r),
    pqOETFChannel(normalized.g),
    pqOETFChannel(normalized.b)
  );
}

// ---------------------------------------------------------------------------
// Rec.709 luminance calculation
// ---------------------------------------------------------------------------

fn rec709Luminance(color: vec3f) -> f32 {
  return dot(color, LUMA);
}

// ---------------------------------------------------------------------------
// Color temperature shift (Kelvin to RGB multiplier)
// ---------------------------------------------------------------------------

fn applyTemperature(color: vec3f, temp: f32, tint: f32) -> vec3f {
  // Temperature shifts blue-orange
  // Tint shifts green-magenta
  let t = temp / 100.0;
  let g = tint / 100.0;

  var result = color;
  result.r = result.r + t * 0.1;
  result.b = result.b - t * 0.1;
  result.g = result.g + g * 0.1;
  result.r = result.r - g * 0.05;
  result.b = result.b - g * 0.05;

  // Clamp negative values: negative color is physically meaningless and
  // corrupts downstream stages (HSL conversion, contrast amplification).
  // Values > 1.0 are preserved for HDR headroom.
  return max(result, vec3f(0.0));
}

// ---------------------------------------------------------------------------
// Hue rotation matrix (luminance-preserving)
// The matrix is pre-computed on the CPU and passed as a uniform.
// This function applies the rotation.
// ---------------------------------------------------------------------------

fn applyHueRotation(color: vec3f, hueMatrix: mat3x3f) -> vec3f {
  return hueMatrix * color;
}

// ---------------------------------------------------------------------------
// 3D LUT sampling
//
// Note: stages that need 3D LUT sampling (color_pipeline.wgsl,
// display_output.wgsl) define stage-local helpers that bind their own
// sampler/texture variables — a generic "takes sampler+texture as args"
// helper is unused here because WGSL does not allow passing texture/sampler
// resources as function arguments across stages with the layout: 'auto'
// pipeline reflection. Keeping a dead helper in this prelude would also
// break the deduplication invariant the file documents.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tone mapping operators (all 8 + drago = 9 total)
//
// HDR headroom semantics (MED-52): all operators except Drago use a uniform
// headroom convention — normalize input by hdrHeadroom (peak white = 1.0
// inside the curve), apply the operator-specific curve which maps roughly
// [0,1] → [0,1], then re-scale by hdrHeadroom on output. This guarantees
// that at hdrHeadroom == 1.0 every operator reduces to its canonical
// SDR curve (output in [0,1]) and at hdrHeadroom > 1.0 every operator
// preserves display headroom in the same way (output up to ~hdrHeadroom).
// Drago is physically parameterized (Lwa, Lmax) and folds headroom into
// Lmax instead — this is its own well-defined paradigm.
// ---------------------------------------------------------------------------

// 1. Reinhard tone mapping operator (uniform headroom convention)
fn tonemapReinhard(color: vec3f, whitePoint: f32, hdrHeadroom: f32) -> vec3f {
  // Defensive: floor headroom away from zero so divisions never blow up
  // even if a caller manages to slip a non-finite/zero value past the
  // CPU-side sanitization in WebGPUShaderPipeline.setGlobalHDRHeadroom.
  let headroom = max(hdrHeadroom, 1e-6);
  let wp = whitePoint;
  let wp2 = wp * wp;
  let scaled = color / headroom;
  let mapped = scaled * (1.0 + scaled / wp2) / (1.0 + scaled);
  return mapped * headroom;
}

// 2. Filmic helper (Uncharted 2 style)
fn filmicCurve(x: vec3f) -> vec3f {
  let A: f32 = 0.15;  // Shoulder strength
  let B: f32 = 0.50;  // Linear strength
  let C: f32 = 0.10;  // Linear angle
  let D: f32 = 0.20;  // Toe strength
  let E: f32 = 0.02;  // Toe numerator
  let F: f32 = 0.30;  // Toe denominator
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

// Filmic / Uncharted 2 (uniform headroom convention)
fn tonemapFilmic(color: vec3f, exposureBias: f32, whitePoint: f32, hdrHeadroom: f32) -> vec3f {
  let headroom = max(hdrHeadroom, 1e-6);
  let scaled = color / headroom;
  let curr = filmicCurve(exposureBias * scaled);
  let whiteScale = vec3f(1.0) / filmicCurve(vec3f(whitePoint));
  return max(curr * whiteScale, vec3f(0.0)) * headroom;
}

// 3. ACES (Narkowicz fit)
fn tonemapACES(color: vec3f, hdrHeadroom: f32) -> vec3f {
  let a: f32 = 2.51;
  let b: f32 = 0.03;
  let c: f32 = 2.43;
  let d: f32 = 0.59;
  let e: f32 = 0.14;
  let headroom = max(hdrHeadroom, 1e-6);
  let scaled = color / headroom;
  let mapped = clamp((scaled * (a * scaled + b)) / (scaled * (c * scaled + d) + e), vec3f(0.0), vec3f(1.0));
  return mapped * headroom;
}

// 4. AgX (Troy Sobotka / Blender 4.x)
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

fn tonemapAgX(color: vec3f, hdrHeadroom: f32) -> vec3f {
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
  let AgxMinEv: f32 = -12.47393;
  let AgxMaxEv: f32 = 4.026069;

  let headroom = max(hdrHeadroom, 1e-6);
  var scaled = color / headroom;
  scaled = AgXInsetMatrix * scaled;
  scaled = max(scaled, vec3f(1e-10));
  scaled = log2(scaled);
  scaled = (scaled - AgxMinEv) / (AgxMaxEv - AgxMinEv);
  scaled = clamp(scaled, vec3f(0.0), vec3f(1.0));
  scaled = agxDefaultContrastApprox(scaled);
  scaled = AgXOutsetMatrix * scaled;
  scaled = clamp(scaled, vec3f(0.0), vec3f(1.0));
  return scaled * headroom;
}

// 5. PBR Neutral (Khronos)
fn tonemapPBRNeutral(color: vec3f, hdrHeadroom: f32) -> vec3f {
  let startCompression: f32 = 0.8 - 0.04;
  let desaturation: f32 = 0.15;

  let headroom = max(hdrHeadroom, 1e-6);
  var scaled = color / headroom;

  let x = min(scaled.r, min(scaled.g, scaled.b));
  var offset: f32;
  if (x < 0.08) {
    offset = x - 6.25 * x * x;
  } else {
    offset = 0.04;
  }
  scaled = scaled - offset;

  let peak = max(scaled.r, max(scaled.g, scaled.b));
  if (peak < startCompression) {
    return scaled * headroom;
  }

  let d = 1.0 - startCompression;
  let newPeak = 1.0 - d * d / (peak + d - startCompression);
  scaled = scaled * (newPeak / peak);

  let g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(scaled, vec3f(newPeak), g) * headroom;
}

// 6. GT tone mapping (Hajime Uchimura / Gran Turismo Sport)
fn gt_tonemap_channel(x: f32) -> f32 {
  let P: f32 = 1.0;
  let a: f32 = 1.0;
  let m: f32 = 0.22;
  let l: f32 = 0.4;
  let c: f32 = 1.33;
  let b: f32 = 0.0;

  let l0 = ((P - m) * l) / a;
  let S0 = m + l0;
  let S1 = m + a * l0;
  let C2 = (a * P) / (P - S1);
  let CP = -C2 / P;

  let w0 = 1.0 - smoothstep(0.0, m, x);
  let w2 = step(m + l0, x);
  let w1 = 1.0 - w0 - w2;

  let T = m * pow(x / m, c) + b;
  let L = m + a * (x - m);
  let S = P - (P - S1) * exp(CP * (x - S0));

  return T * w0 + L * w1 + S * w2;
}

fn tonemapGT(color: vec3f, hdrHeadroom: f32) -> vec3f {
  let headroom = max(hdrHeadroom, 1e-6);
  let scaled = color / headroom;
  let mapped = vec3f(
    gt_tonemap_channel(scaled.r),
    gt_tonemap_channel(scaled.g),
    gt_tonemap_channel(scaled.b)
  );
  return mapped * headroom;
}

// 7. ACES Hill (Stephen Hill RRT+ODT fit)
fn RRTAndODTFit(v: vec3f) -> vec3f {
  let a = v * (v + 0.0245786) - 0.000090537;
  let b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

fn tonemapACESHill(color: vec3f, hdrHeadroom: f32) -> vec3f {
  let ACESInputMat = mat3x3f(
    vec3f(0.59719, 0.07600, 0.02840),
    vec3f(0.35458, 0.90834, 0.13383),
    vec3f(0.04823, 0.01566, 0.83777)
  );
  let ACESOutputMat = mat3x3f(
    vec3f(1.60475, -0.10208, -0.00327),
    vec3f(-0.53108, 1.10813, -0.07276),
    vec3f(-0.07367, -0.00605, 1.07602)
  );

  let headroom = max(hdrHeadroom, 1e-6);
  var scaled = color / headroom;
  scaled = ACESInputMat * scaled;
  scaled = RRTAndODTFit(scaled);
  scaled = ACESOutputMat * scaled;
  scaled = clamp(scaled, vec3f(0.0), vec3f(1.0));
  return scaled * headroom;
}

// 8. Drago adaptive logarithmic tone mapping (per-channel)
fn tonemapDragoChannel(L: f32, dragoBias: f32, dragoLwa: f32, dragoLmax: f32, hdrHeadroom: f32) -> f32 {
  let Lwa = max(dragoLwa, 1e-6);
  let Lmax = max(dragoLmax, 1e-6) * hdrHeadroom;
  let Ln = L / Lwa;
  let biasP = log(dragoBias) / log(0.5);
  let denom = log2(1.0 + Lmax / Lwa);
  let num = log(1.0 + Ln) / log(2.0 + 8.0 * pow(Ln / (Lmax / Lwa), biasP));
  return num / max(denom, 1e-6);
}

fn tonemapDrago(color: vec3f, dragoBias: f32, dragoLwa: f32, dragoLmax: f32, dragoBrightness: f32, hdrHeadroom: f32) -> vec3f {
  let mapped = vec3f(
    tonemapDragoChannel(color.r, dragoBias, dragoLwa, dragoLmax, hdrHeadroom),
    tonemapDragoChannel(color.g, dragoBias, dragoLwa, dragoLmax, hdrHeadroom),
    tonemapDragoChannel(color.b, dragoBias, dragoLwa, dragoLmax, hdrHeadroom)
  );
  return mapped * max(dragoBrightness, 0.0);
}

// ---------------------------------------------------------------------------
// Gamut soft-clip function
// ---------------------------------------------------------------------------

fn gamutSoftClip(color: vec3f) -> vec3f {
  var result: vec3f;

  // Red channel
  if (color.r <= 0.0) {
    result.r = 0.0;
  } else if (color.r <= 0.8) {
    result.r = color.r;
  } else {
    result.r = 0.8 + 0.2 * tanh((color.r - 0.8) / 0.2);
  }

  // Green channel
  if (color.g <= 0.0) {
    result.g = 0.0;
  } else if (color.g <= 0.8) {
    result.g = color.g;
  } else {
    result.g = 0.8 + 0.2 * tanh((color.g - 0.8) / 0.2);
  }

  // Blue channel
  if (color.b <= 0.0) {
    result.b = 0.0;
  } else if (color.b <= 0.8) {
    result.b = color.b;
  } else {
    result.b = 0.8 + 0.2 * tanh((color.b - 0.8) / 0.2);
  }

  return result;
}
