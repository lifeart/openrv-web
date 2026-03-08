// Stage 9: Display Output — output primaries, display LUT 3D, display transfer,
// gamma override, brightness, and color inversion.
// Ports the display pipeline from viewer.frag.glsl (steps 7c, 7d, 8a-8d, 9).

struct Uniforms {
  outputPrimariesEnabled: i32,        // 0=off, 1=on
  displayLUT3DEnabled: i32,           // 0=off, 1=on
  displayTransferCode: i32,           // 0=linear, 1=sRGB, 2=rec709, 3=gamma2.2, 4=gamma2.4, 5=custom
  colorInversionEnabled: i32,         // 0=off, 1=on
  displayGammaOverride: f32,          // 1.0 = no override
  displayBrightnessMultiplier: f32,   // 1.0 = no change
  displayCustomGamma: f32,            // custom gamma value (only when displayTransferCode == 5)
  displayLUT3DIntensity: f32,         // 0.0 to 1.0
  displayLUT3DSize: f32,              // LUT dimension (e.g. 33)
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
  displayLUT3DDomainMin: vec3f,       // domain minimum
  _pad3: f32,
  displayLUT3DDomainMax: vec3f,       // domain maximum
  _pad4: f32,
  outputPrimariesMatrix: mat3x3f,     // 3x3 color primaries conversion matrix
}

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var lutSamp: sampler;
@group(0) @binding(3) var displayLUT3D: texture_3d<f32>;

@group(1) @binding(0) var<uniform> u: Uniforms;

// --- Display transfer functions (linear -> display encoded) ---

fn displayTransferSRGB(c: f32) -> f32 {
  if (c <= 0.0031308) {
    return c * 12.92;
  }
  return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

fn displayTransferRec709(c: f32) -> f32 {
  if (c < 0.018) {
    return 4.5 * c;
  }
  return 1.099 * pow(c, 0.45) - 0.099;
}

fn applyDisplayTransfer(color: vec3f, tf: i32) -> vec3f {
  let c = max(color, vec3f(0.0));
  if (tf == 1) { // sRGB
    return vec3f(
      displayTransferSRGB(c.r),
      displayTransferSRGB(c.g),
      displayTransferSRGB(c.b)
    );
  } else if (tf == 2) { // Rec.709
    return vec3f(
      displayTransferRec709(c.r),
      displayTransferRec709(c.g),
      displayTransferRec709(c.b)
    );
  } else if (tf == 3) { // gamma 2.2
    return pow(c, vec3f(1.0 / 2.2));
  } else if (tf == 4) { // gamma 2.4
    return pow(c, vec3f(1.0 / 2.4));
  } else if (tf == 5) { // custom gamma
    return pow(c, vec3f(1.0 / u.displayCustomGamma));
  }
  return c; // tf == 0 (linear)
}

// --- Generic 3D LUT application with domain mapping and trilinear interpolation ---
fn applyLUT3DGeneric(color: vec3f, lutSize: f32, intensity: f32,
                     domainMin: vec3f, domainMax: vec3f) -> vec3f {
  var normalized = (color - domainMin) / (domainMax - domainMin);
  normalized = clamp(normalized, vec3f(0.0), vec3f(1.0));
  let offset = 0.5 / lutSize;
  let scale = (lutSize - 1.0) / lutSize;
  let lutCoord = normalized * scale + offset;
  let lutColor = textureSample(displayLUT3D, lutSamp, lutCoord).rgb;
  return mix(color, lutColor, intensity);
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

  // 7c. Output primaries conversion (BT.709 working space -> display gamut)
  if (u.outputPrimariesEnabled != 0) {
    color = vec4f(u.outputPrimariesMatrix * color.rgb, color.a);
  }

  // 7d. Display LUT (session-wide display calibration)
  if (u.displayLUT3DEnabled != 0) {
    color = vec4f(
      applyLUT3DGeneric(color.rgb, u.displayLUT3DSize, u.displayLUT3DIntensity,
                        u.displayLUT3DDomainMin, u.displayLUT3DDomainMax),
      color.a
    );
  }

  // 8a. Display transfer function (linear to display-encoded, per-channel)
  if (u.displayTransferCode > 0) {
    color = vec4f(applyDisplayTransfer(color.rgb, u.displayTransferCode), color.a);
  }

  // 8c. Display gamma override
  if (u.displayGammaOverride != 1.0) {
    color = vec4f(
      pow(max(color.rgb, vec3f(0.0)), vec3f(1.0 / u.displayGammaOverride)),
      color.a
    );
  }

  // 8d. Display brightness
  color = vec4f(color.rgb * u.displayBrightnessMultiplier, color.a);

  // 9. Color inversion (after all corrections, before channel isolation)
  if (u.colorInversionEnabled != 0) {
    color = vec4f(1.0 - color.rgb, color.a);
  }

  return color;
}
