// Stage 2: Linearize — log-to-linear conversion and EOTF application.
// Ports the applyLinearize() + input EOTF logic from viewer.frag.glsl.
//
// NOTE: This shader expects common.wgsl to be prepended, which provides:
//   LUMA, srgbEOTF, hlgToLinear, pqToLinear

struct Uniforms {
  logType: i32,          // 0=none, 1=cineon, 2=viper, 3=logc3
  sRGB2linear: i32,      // 0=no, 1=yes
  rec709ToLinear: i32,   // 0=no, 1=yes
  fileGamma: f32,        // 1.0 = no-op
  inputTransfer: i32,    // 0=sRGB/linear, 1=HLG, 2=PQ, 7=SMPTE240M
  alphaType: i32,        // reserved for future use
}

// VSOut is provided by the prepended vertex shader source
// (_viewer_vert.wgsl or _passthrough_vert.wgsl) at pipeline build time.

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@group(1) @binding(0) var<uniform> u: Uniforms;

// --- Cineon log-to-linear ---
// refBlack=95, refWhite=685 (out of 1023), softClip=0
fn cineonLogToLinear(x: f32) -> f32 {
  let refBlack = 95.0 / 1023.0;
  let refWhite = 685.0 / 1023.0;
  let gain = 1.0 / (1.0 - pow(10.0, (refBlack - refWhite) * 0.002 / 0.6));
  let offset = gain - 1.0;
  return (gain * pow(10.0, (x - refWhite) * 0.002 / 0.6)) - offset;
}

// --- Thomson Viper log-to-linear ---
// refBlack=16, refWhite=1000 (out of 1023)
fn viperLogToLinear(x: f32) -> f32 {
  let refBlack = 16.0 / 1023.0;
  let refWhite = 1000.0 / 1023.0;
  let displayGamma = 0.6;
  if (x <= refBlack) {
    return 0.0;
  }
  if (x >= refWhite) {
    return 1.0;
  }
  let normalized = (x - refBlack) / (refWhite - refBlack);
  let blackOffset = pow(10.0, -displayGamma);
  return max(0.0, (pow(10.0, (normalized - 1.0) * displayGamma) - blackOffset) / (1.0 - blackOffset));
}

// --- ARRI LogC3-to-linear (EI 800) ---
fn logC3ToLinear(x: f32) -> f32 {
  let cut = 0.010591;
  let a = 5.555556;
  let b = 0.052272;
  let c = 0.247190;
  let d = 0.385537;
  let e = 5.367655;
  let f = 0.092809;
  if (x > e * cut + f) {
    return (pow(10.0, (x - d) / c) - b) / a;
  } else {
    return (x - f) / e;
  }
}

// --- Rec.709 EOTF (Rec.709 signal -> linear light) ---
fn rec709EOTF(x: f32) -> f32 {
  if (x < 0.081) {
    return x / 4.5;
  } else {
    return pow((x + 0.099) / 1.099, 1.0 / 0.45);
  }
}

// --- SMPTE 240M EOTF (inverse OETF, signal -> linear) ---
fn smpte240mEOTF(v: f32) -> f32 {
  let threshold = 4.0 * 0.0228; // = 0.0912
  if (v < threshold) {
    return v / 4.0;
  } else {
    return pow((v + 0.1115) / 1.1115, 1.0 / 0.45);
  }
}

fn smpte240mToLinear(signal: vec3f) -> vec3f {
  return vec3f(
    smpte240mEOTF(signal.r),
    smpte240mEOTF(signal.g),
    smpte240mEOTF(signal.b)
  );
}

// `@vertex fn vs(...)` is provided by the prepended vertex shader source.

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  var color = textureSample(tex, samp, in.uv);

  // Track whether linearize is active (if so, skip auto input transfer)
  var linearizeActive = false;

  // Log type conversion (Cineon, Viper, or LogC3)
  if (u.logType == 1) {
    color = vec4f(
      cineonLogToLinear(color.r),
      cineonLogToLinear(color.g),
      cineonLogToLinear(color.b),
      color.a
    );
    linearizeActive = true;
  } else if (u.logType == 2) {
    color = vec4f(
      viperLogToLinear(color.r),
      viperLogToLinear(color.g),
      viperLogToLinear(color.b),
      color.a
    );
    linearizeActive = true;
  } else if (u.logType == 3) {
    color = vec4f(
      logC3ToLinear(color.r),
      logC3ToLinear(color.g),
      logC3ToLinear(color.b),
      color.a
    );
    linearizeActive = true;
  }

  // sRGB-to-linear EOTF (srgbEOTF from common.wgsl)
  if (u.sRGB2linear == 1) {
    color = vec4f(
      srgbEOTF(color.r),
      srgbEOTF(color.g),
      srgbEOTF(color.b),
      color.a
    );
    linearizeActive = true;
  }

  // Rec.709-to-linear EOTF
  if (u.rec709ToLinear == 1) {
    color = vec4f(
      rec709EOTF(color.r),
      rec709EOTF(color.g),
      rec709EOTF(color.b),
      color.a
    );
    linearizeActive = true;
  }

  // File gamma (pow(color, fileGamma))
  if (u.fileGamma != 1.0) {
    color = vec4f(
      pow(max(color.rgb, vec3f(0.0)), vec3f(u.fileGamma)),
      color.a
    );
    linearizeActive = true;
  }

  // Input EOTF: convert from transfer function to linear light
  // Skipped when linearize is active (linearize already handled the conversion)
  // hlgToLinear and pqToLinear come from common.wgsl
  if (!linearizeActive) {
    if (u.inputTransfer == 1) {
      color = vec4f(hlgToLinear(color.rgb), color.a);
    } else if (u.inputTransfer == 2) {
      color = vec4f(pqToLinear(color.rgb), color.a);
    } else if (u.inputTransfer == 7) {
      color = vec4f(smpte240mToLinear(color.rgb), color.a);
    }
  }

  return color;
}
