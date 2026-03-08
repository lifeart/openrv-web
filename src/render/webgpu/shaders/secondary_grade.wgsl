// Stage 4: Secondary Grade — highlights/shadows, vibrance, hue rotation.
// Ports the highlights/shadows, vibrance, and hue rotation logic from viewer.frag.glsl.

struct Uniforms {
  highlights: f32,             // -1.0 to +1.0
  shadows: f32,                // -1.0 to +1.0
  whites: f32,                 // -1.0 to +1.0
  blacks: f32,                 // -1.0 to +1.0
  vibrance: f32,               // -1.0 to +1.0
  vibranceSkinProtection: i32, // 0=off, 1=on
  hueRotationEnabled: i32,     // 0=off, 1=on
  _pad0: f32,                  // padding for alignment
  hueRotationMatrix: mat3x3f,  // luminance-preserving 3x3 matrix
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

// --- RGB to HSL conversion ---
// Returns vec3(h: 0-360, s: 0-1, l: 0-1)
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
    // WGSL % can return negative for negative operands; ensure positive modulo
    h = h - floor(h / 6.0) * 6.0;
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

// Convert HSL (h: 0-360, s: 0-1, l: 0-1) to RGB (0-1 each)
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

  // --- Highlights/Shadows/Whites/Blacks ---
  // (Simplified without HDR headroom; hsPeak = 1.0 for SDR pipeline stage)
  let hsPeak = 1.0;

  // Whites/Blacks clipping
  if (u.whites != 0.0 || u.blacks != 0.0) {
    let whitePoint = hsPeak * (1.0 - u.whites * (55.0 / 255.0));
    let blackPoint = hsPeak * u.blacks * (55.0 / 255.0);
    let range = whitePoint - blackPoint;
    if (range > 0.0) {
      color = vec4f(
        clamp((color.rgb - blackPoint) / range * hsPeak, vec3f(0.0), vec3f(hsPeak)),
        color.a
      );
    }
  }

  // Luminance for highlight/shadow masks
  let hsLum = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let hsLumNorm = hsLum / hsPeak;
  let highlightMask = smoothstep(0.5, 1.0, hsLumNorm);
  let shadowMask = 1.0 - smoothstep(0.0, 0.5, hsLumNorm);

  // Apply highlights (positive = darken highlights)
  if (u.highlights != 0.0) {
    color = vec4f(
      color.rgb - u.highlights * highlightMask * hsPeak * (128.0 / 255.0),
      color.a
    );
  }
  // Apply shadows (positive = brighten shadows)
  if (u.shadows != 0.0) {
    color = vec4f(
      color.rgb + u.shadows * shadowMask * hsPeak * (128.0 / 255.0),
      color.a
    );
  }
  color = vec4f(max(color.rgb, vec3f(0.0)), color.a);

  // --- Vibrance (intelligent saturation) ---
  if (u.vibrance != 0.0) {
    let vibHsl = rgbToHsl(clamp(color.rgb, vec3f(0.0), vec3f(1.0)));
    let vibH = vibHsl.x; // 0-360
    let vibS = vibHsl.y; // 0-1
    let vibL = vibHsl.z; // 0-1

    var skinProt = 1.0;
    if (u.vibranceSkinProtection != 0 && vibH >= 20.0 && vibH <= 50.0 && vibS < 0.6 && vibL > 0.2 && vibL < 0.8) {
      let hueDistance = abs(vibH - 35.0) / 15.0;
      skinProt = 0.3 + (hueDistance * 0.7);
    }

    let satFactor = 1.0 - (vibS * 0.5);
    let adjustment = u.vibrance * satFactor * skinProt;
    let newS = clamp(vibS + adjustment, 0.0, 1.0);

    if (abs(newS - vibS) > 0.001) {
      color = vec4f(hslToRgb(vibH, newS, vibL), color.a);
    }
  }

  // --- Hue rotation (luminance-preserving matrix) ---
  if (u.hueRotationEnabled != 0) {
    color = vec4f(u.hueRotationMatrix * color.rgb, color.a);
  }

  return color;
}
