// Stage 6: Color Pipeline — color wheels, CDL, HSL qualifier, film emulation,
// input primaries matrix, file LUT 3D, look LUT 3D.
// Ports sections 6a-6f and 0e from viewer.frag.glsl.

struct Uniforms {
  // Color Wheels (Lift/Gamma/Gain)
  colorWheelsEnabled: i32,
  _pad0: i32,
  _pad1: i32,
  _pad2: i32,
  wheelLift: vec4f,          // .rgb = lift adjustment, .a = unused
  wheelGamma: vec4f,         // .rgb = gamma adjustment, .a = unused
  wheelGain: vec4f,          // .rgb = gain adjustment, .a = unused

  // CDL (Color Decision List)
  cdlEnabled: i32,
  cdlColorspace: i32,        // 0=rec709/direct, 1=ACEScct
  cdlSaturation: f32,
  _pad3: f32,
  cdlSlope: vec4f,           // .xyz = slope, .w = unused
  cdlOffset: vec4f,          // .xyz = offset, .w = unused
  cdlPower: vec4f,           // .xyz = power, .w = unused

  // HSL Qualifier
  hslQualifierEnabled: i32,
  hslInvert: i32,
  hslMattePreview: i32,
  _pad4: f32,
  hslHueCenter: f32,         // 0-360
  hslHueWidth: f32,          // degrees
  hslHueSoftness: f32,       // 0-100
  hslSatCenter: f32,         // 0-100
  hslSatWidth: f32,          // percent
  hslSatSoftness: f32,       // 0-100
  hslLumCenter: f32,         // 0-100
  hslLumWidth: f32,          // percent
  hslLumSoftness: f32,       // 0-100
  hslCorrHueShift: f32,      // -180 to +180
  hslCorrSatScale: f32,      // multiplier
  hslCorrLumScale: f32,      // multiplier

  // Film Emulation
  filmEmulationEnabled: i32,
  _pad5: f32,
  filmIntensity: f32,
  filmSaturation: f32,
  filmGrainIntensity: f32,
  filmGrainSeed: f32,
  _pad6: vec2f,

  // Input primaries conversion
  inputPrimariesEnabled: i32,
  _pad7: i32,
  _pad8: i32,
  _pad9: i32,
  // mat3x3 stored as 3 vec4f rows for 16-byte alignment (w unused)
  inputPrimariesMatrix_row0: vec4f,
  inputPrimariesMatrix_row1: vec4f,
  inputPrimariesMatrix_row2: vec4f,

  // File LUT 3D
  fileLUT3DEnabled: i32,
  _pad10: f32,
  fileLUT3DIntensity: f32,
  fileLUT3DSize: f32,
  fileLUT3DDomainMin: vec4f, // .xyz = min, .w = unused
  fileLUT3DDomainMax: vec4f, // .xyz = max, .w = unused

  // Look LUT 3D
  lookLUT3DEnabled: i32,
  _pad11: f32,
  lookLUT3DIntensity: f32,
  lookLUT3DSize: f32,
  lookLUT3DDomainMin: vec4f, // .xyz = min, .w = unused
  lookLUT3DDomainMax: vec4f, // .xyz = max, .w = unused
}

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var filmLUT: texture_2d<f32>;
@group(0) @binding(3) var fileLUT3D: texture_3d<f32>;
@group(0) @binding(4) var lookLUT3D: texture_3d<f32>;

@group(1) @binding(0) var<uniform> u: Uniforms;

// Luminance coefficients (Rec. 709)
const LUMA = vec3f(0.2126, 0.7152, 0.0722);

// --- RGB to HSL conversion ---
fn rgbToHsl(c: vec3f) -> vec3f {
  let maxC = max(max(c.r, c.g), c.b);
  let minC = min(min(c.r, c.g), c.b);
  let l = (maxC + minC) * 0.5;
  let delta = maxC - minC;

  if (delta < 0.00001) {
    return vec3f(0.0, 0.0, l);
  }

  var s: f32;
  if (l > 0.5) {
    s = delta / (2.0 - maxC - minC);
  } else {
    s = delta / (maxC + minC);
  }

  var h: f32;
  if (maxC == c.r) {
    h = (c.g - c.b) / delta;
    if (h < 0.0) { h += 6.0; }
  } else if (maxC == c.g) {
    h = (c.b - c.r) / delta + 2.0;
  } else {
    h = (c.r - c.g) / delta + 4.0;
  }
  h *= 60.0;

  return vec3f(h, s, l);
}

// --- HSL to RGB helper ---
fn hueToRgb(p: f32, q: f32, t_in: f32) -> f32 {
  var t = t_in;
  if (t < 0.0) { t += 1.0; }
  if (t > 1.0) { t -= 1.0; }
  if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
  if (t < 0.5) { return q; }
  if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
  return p;
}

// --- HSL to RGB conversion ---
fn hslToRgb(h: f32, s: f32, l: f32) -> vec3f {
  if (s < 0.00001) {
    return vec3f(l);
  }

  var q: f32;
  if (l < 0.5) {
    q = l * (1.0 + s);
  } else {
    q = l + s - l * s;
  }
  let p = 2.0 * l - q;
  let hNorm = h / 360.0;

  return vec3f(
    hueToRgb(p, q, hNorm + 1.0 / 3.0),
    hueToRgb(p, q, hNorm),
    hueToRgb(p, q, hNorm - 1.0 / 3.0)
  );
}

// --- ACEScct conversion functions (for CDL colorspace wrapping) ---

// Linear (ACES) to ACEScct
fn linearToACEScctChannel(x: f32) -> f32 {
  let CUT = 0.0078125; // 2^(-7)
  if (x <= CUT) {
    return x * 10.5402377416545 + 0.0729055341958355;
  } else {
    return (log2(x) + 9.72) / 17.52;
  }
}

fn linearToACEScct(color: vec3f) -> vec3f {
  return vec3f(
    linearToACEScctChannel(color.r),
    linearToACEScctChannel(color.g),
    linearToACEScctChannel(color.b)
  );
}

// ACEScct to linear (ACES)
fn ACEScctToLinearChannel(x: f32) -> f32 {
  let CUT_OUT = 0.155251141552511; // (log2(0.0078125) + 9.72) / 17.52
  if (x <= CUT_OUT) {
    return (x - 0.0729055341958355) / 10.5402377416545;
  } else {
    return pow(2.0, x * 17.52 - 9.72);
  }
}

fn ACEScctToLinear(color: vec3f) -> vec3f {
  return vec3f(
    ACEScctToLinearChannel(color.r),
    ACEScctToLinearChannel(color.g),
    ACEScctToLinearChannel(color.b)
  );
}

// Generic 3D LUT application with domain mapping, trilinear interpolation, and intensity blend
fn applyLUT3DGeneric(lut: texture_3d<f32>, color: vec3f, lutSize: f32, intensity: f32,
                     domainMin: vec3f, domainMax: vec3f) -> vec3f {
  var normalized = (color - domainMin) / (domainMax - domainMin);
  normalized = clamp(normalized, vec3f(0.0), vec3f(1.0));
  let offset = 0.5 / lutSize;
  let scale = (lutSize - 1.0) / lutSize;
  let lutCoord = normalized * scale + offset;
  let lutColor = textureSample(lut, samp, lutCoord).rgb;
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

  // 0e-alt. File LUT (per-source input device transform)
  // When active, bypasses automatic input primaries conversion
  if (u.fileLUT3DEnabled == 1) {
    color = vec4f(
      applyLUT3DGeneric(fileLUT3D, color.rgb, u.fileLUT3DSize,
                        u.fileLUT3DIntensity, u.fileLUT3DDomainMin.xyz,
                        u.fileLUT3DDomainMax.xyz),
      color.a
    );
    // Skip input primaries -- the File LUT handles the full IDT
  } else {
    // 0e. Input primaries normalization (source -> BT.709 working space)
    if (u.inputPrimariesEnabled == 1) {
      let primMat = mat3x3f(
        u.inputPrimariesMatrix_row0.xyz,
        u.inputPrimariesMatrix_row1.xyz,
        u.inputPrimariesMatrix_row2.xyz
      );
      color = vec4f(primMat * color.rgb, color.a);
    }
  }

  // 6a. Color Wheels (Lift/Gamma/Gain)
  if (u.colorWheelsEnabled == 1) {
    let cwLuma = dot(color.rgb, LUMA);
    // Zone weights using smooth falloff
    let shadowW = smoothstep(0.5, 0.0, cwLuma);
    let highW = smoothstep(0.5, 1.0, cwLuma);
    let midW = 1.0 - shadowW - highW;

    // Lift (shadows)
    color = vec4f(color.rgb + u.wheelLift.rgb * shadowW, color.a);

    // Gain (highlights)
    color = vec4f(color.rgb * (1.0 + u.wheelGain.rgb * highW), color.a);

    // Gamma (midtones) - power function
    if (midW > 0.0) {
      let gammaExp = 1.0 / max(1.0 + u.wheelGamma.rgb, vec3f(0.01));
      color = vec4f(
        mix(color.rgb, pow(max(color.rgb, vec3f(0.0)), gammaExp), midW),
        color.a
      );
    }
  }

  // 6b. CDL (Color Decision List)
  if (u.cdlEnabled == 1) {
    // Convert to ACEScct if colorspace requires it
    if (u.cdlColorspace == 1) {
      color = vec4f(linearToACEScct(color.rgb), color.a);
    }

    // CDL SOP + Saturation
    color = vec4f(
      pow(max(color.rgb * u.cdlSlope.xyz + u.cdlOffset.xyz, vec3f(0.0)), u.cdlPower.xyz),
      color.a
    );
    let cdlLuma = dot(color.rgb, LUMA);
    color = vec4f(mix(vec3f(cdlLuma), color.rgb, u.cdlSaturation), color.a);

    // Convert back from ACEScct to linear
    if (u.cdlColorspace == 1) {
      color = vec4f(ACEScctToLinear(color.rgb), color.a);
    }
  }

  // 6d. Look LUT (per-source creative grade)
  if (u.lookLUT3DEnabled == 1) {
    color = vec4f(
      applyLUT3DGeneric(lookLUT3D, color.rgb, u.lookLUT3DSize,
                        u.lookLUT3DIntensity, u.lookLUT3DDomainMin.xyz,
                        u.lookLUT3DDomainMax.xyz),
      color.a
    );
  }

  // 6e. HSL Qualifier (secondary color correction)
  if (u.hslQualifierEnabled == 1) {
    let hslQ = rgbToHsl(clamp(color.rgb, vec3f(0.0), vec3f(1.0)));
    let qH = hslQ.x;
    let qS = hslQ.y * 100.0;
    let qL = hslQ.z * 100.0;

    // Hue match (circular distance)
    var hueDist = abs(qH - u.hslHueCenter);
    if (hueDist > 180.0) { hueDist = 360.0 - hueDist; }
    let hueInner = u.hslHueWidth / 2.0;
    let hueOuter = hueInner + (u.hslHueSoftness * u.hslHueWidth) / 100.0;
    var hueMatch: f32;
    if (hueDist <= hueInner) {
      hueMatch = 1.0;
    } else if (hueDist >= hueOuter) {
      hueMatch = 0.0;
    } else {
      hueMatch = smoothstep(hueOuter, hueInner, hueDist);
    }

    // Saturation match (linear distance)
    let satDist = abs(qS - u.hslSatCenter);
    let satInner = u.hslSatWidth / 2.0;
    let satOuter = satInner + (u.hslSatSoftness * u.hslSatWidth) / 100.0;
    var satMatch: f32;
    if (satDist <= satInner) {
      satMatch = 1.0;
    } else if (satDist >= satOuter) {
      satMatch = 0.0;
    } else {
      satMatch = smoothstep(satOuter, satInner, satDist);
    }

    // Luminance match (linear distance)
    let lumDist = abs(qL - u.hslLumCenter);
    let lumInner = u.hslLumWidth / 2.0;
    let lumOuter = lumInner + (u.hslLumSoftness * u.hslLumWidth) / 100.0;
    var lumMatch: f32;
    if (lumDist <= lumInner) {
      lumMatch = 1.0;
    } else if (lumDist >= lumOuter) {
      lumMatch = 0.0;
    } else {
      lumMatch = smoothstep(lumOuter, lumInner, lumDist);
    }

    var matte = hueMatch * satMatch * lumMatch;
    if (u.hslInvert == 1) { matte = 1.0 - matte; }

    if (u.hslMattePreview == 1) {
      color = vec4f(vec3f(matte), color.a);
    } else if (matte > 0.001) {
      var newH = qH + u.hslCorrHueShift * matte;
      if (newH < 0.0) { newH += 360.0; }
      if (newH >= 360.0) { newH -= 360.0; }
      let newS = clamp(
        (hslQ.y * (1.0 - matte)) + (hslQ.y * u.hslCorrSatScale * matte),
        0.0, 1.0
      );
      let newL = clamp(
        (hslQ.z * (1.0 - matte)) + (hslQ.z * u.hslCorrLumScale * matte),
        0.0, 1.0
      );
      color = vec4f(hslToRgb(newH, newS, newL), color.a);
    }
  }

  // 6f. Film Emulation (after CDL/curves/HSL, before tone mapping)
  if (u.filmEmulationEnabled == 1) {
    let origFilm = color.rgb;

    // Sample per-channel LUT (clamped to 0-1 for LUT lookup)
    let cc = clamp(color.rgb, vec3f(0.0), vec3f(1.0));
    var filmColor = vec3f(
      textureSample(filmLUT, samp, vec2f(cc.r, 0.5)).r,
      textureSample(filmLUT, samp, vec2f(cc.g, 0.5)).g,
      textureSample(filmLUT, samp, vec2f(cc.b, 0.5)).b
    );

    // Apply stock saturation
    let filmLuma = dot(filmColor, LUMA);
    filmColor = mix(vec3f(filmLuma), filmColor, u.filmSaturation);

    // Add grain (hash-based noise, luminance-dependent)
    if (u.filmGrainIntensity > 0.0) {
      let n = fract(sin(dot(in.pos.xy + u.filmGrainSeed, vec2f(12.9898, 78.233))) * 43758.5453);
      let grain = (n * 2.0 - 1.0) * u.filmGrainIntensity;
      let envelope = 4.0 * filmLuma * (1.0 - filmLuma); // midtone peak
      filmColor += grain * envelope;
    }

    // Blend with original based on intensity
    color = vec4f(mix(origFilm, filmColor, u.filmIntensity), color.a);
  }

  return color;
}
