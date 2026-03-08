// Stage 10: Diagnostics — channel isolation, false color, contour visualization,
// dither/quantize, and zebra stripes.
// Ports diagnostic/visualization logic from viewer.frag.glsl (steps 10-12c).

struct Uniforms {
  channelModeCode: i32,       // 0=rgb, 1=red, 2=green, 3=blue, 4=alpha, 5=luminance
  falseColorEnabled: i32,     // 0=off, 1=on
  contourEnabled: i32,        // 0=off, 1=on
  contourDesaturate: i32,     // 0=off, 1=on
  ditherMode: i32,            // 0=off, 1=ordered Bayer 8x8
  quantizeBits: i32,          // 0=off, 2-16 = target bit depth
  zebraEnabled: i32,          // 0=off, 1=on
  zebraHighEnabled: i32,      // 0=off, 1=on
  zebraLowEnabled: i32,       // 0=off, 1=on
  _pad0: i32,
  _pad1: i32,
  _pad2: i32,
  zebraHighThreshold: f32,    // e.g. 0.95
  zebraLowThreshold: f32,     // e.g. 0.05
  zebraTime: f32,             // animation time offset
  contourLevels: f32,         // 2.0 to 50.0
  contourLineColor: vec3f,    // normalized RGB
  _pad3: f32,
  resolution: vec2f,          // canvas resolution (for zebra stripe computation)
  texelSize: vec2f,           // 1.0 / textureResolution (for contour neighbor fetch)
}

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var falseColorSamp: sampler;
@group(0) @binding(3) var falseColorLUT: texture_2d<f32>;

@group(1) @binding(0) var<uniform> u: Uniforms;

// Luminance coefficients (Rec. 709)
const LUMA = vec3f(0.2126, 0.7152, 0.0722);

// --- Bayer 8x8 dither matrix (normalized to [0,1] range) ---
fn bayerDither8x8(pos: vec2i) -> f32 {
  let x = pos.x & 7;
  let y = pos.y & 7;
  // Standard 8x8 Bayer matrix stored as a const array
  // WGSL requires const array syntax
  let bayer = array<i32, 64>(
     0, 32,  8, 40,  2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44,  4, 36, 14, 46,  6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
     3, 35, 11, 43,  1, 33,  9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47,  7, 39, 13, 45,  5, 37,
    63, 31, 55, 23, 61, 29, 53, 21
  );
  return (f32(bayer[y * 8 + x]) + 0.5) / 64.0;
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

  // 10. Channel isolation
  if (u.channelModeCode == 1) {
    color = vec4f(vec3f(color.r), color.a);
  } else if (u.channelModeCode == 2) {
    color = vec4f(vec3f(color.g), color.a);
  } else if (u.channelModeCode == 3) {
    color = vec4f(vec3f(color.b), color.a);
  } else if (u.channelModeCode == 4) {
    color = vec4f(vec3f(color.a), color.a);
  } else if (u.channelModeCode == 5) {
    let lum = dot(color.rgb, LUMA);
    color = vec4f(vec3f(lum), color.a);
  }

  // 11. False Color (diagnostic overlay - replaces color)
  if (u.falseColorEnabled != 0) {
    let fcLuma = dot(color.rgb, LUMA);
    let lumaSDR = clamp(fcLuma, 0.0, 1.0);
    let fcColor = textureSample(falseColorLUT, falseColorSamp, vec2f(lumaSDR, 0.5)).rgb;
    color = vec4f(fcColor, color.a);
  }

  // 11b. Contour iso-lines (luminance visualization - neighbor edge detection)
  if (u.contourEnabled != 0) {
    let texSize = vec2i(textureDimensions(tex, 0));
    let pc = vec2i(in.uv * vec2f(f32(texSize.x), f32(texSize.y)));

    // Center pixel luminance from source texture
    let cLuma = dot(textureLoad(tex, pc, 0).rgb, LUMA);
    let quantC = floor(cLuma * u.contourLevels) / u.contourLevels;

    // Clamp neighbor coordinates to texture bounds
    let left  = vec2i(max(pc.x - 1, 0), pc.y);
    let right = vec2i(min(pc.x + 1, texSize.x - 1), pc.y);
    let up    = vec2i(pc.x, max(pc.y - 1, 0));
    let down  = vec2i(pc.x, min(pc.y + 1, texSize.y - 1));

    let qL = floor(dot(textureLoad(tex, left, 0).rgb, LUMA) * u.contourLevels) / u.contourLevels;
    let qR = floor(dot(textureLoad(tex, right, 0).rgb, LUMA) * u.contourLevels) / u.contourLevels;
    let qU = floor(dot(textureLoad(tex, up, 0).rgb, LUMA) * u.contourLevels) / u.contourLevels;
    let qD = floor(dot(textureLoad(tex, down, 0).rgb, LUMA) * u.contourLevels) / u.contourLevels;

    // Epsilon-based comparison to avoid floating-point precision artifacts
    let eps = 0.5 / u.contourLevels;
    let isContour = (abs(qL - quantC) > eps) || (abs(qR - quantC) > eps) ||
                    (abs(qU - quantC) > eps) || (abs(qD - quantC) > eps);

    if (isContour) {
      color = vec4f(u.contourLineColor, color.a);
    } else if (u.contourDesaturate != 0) {
      let displayLuma = dot(color.rgb, LUMA);
      color = vec4f(mix(color.rgb, vec3f(displayLuma), 0.5), color.a);
    }
  }

  // 12. Zebra Stripes (diagnostic overlay)
  if (u.zebraEnabled != 0) {
    let zLuma = dot(color.rgb, LUMA);
    let pixelPos = in.uv * u.resolution;
    if (u.zebraHighEnabled != 0 && zLuma >= u.zebraHighThreshold) {
      let stripe = (pixelPos.x + pixelPos.y + u.zebraTime) % 12.0;
      if (stripe < 6.0) {
        color = vec4f(mix(color.rgb, vec3f(1.0, 0.3, 0.3), 0.5), color.a);
      }
    }
    if (u.zebraLowEnabled != 0 && zLuma <= u.zebraLowThreshold) {
      let stripe = (pixelPos.x - pixelPos.y + u.zebraTime) % 12.0;
      if (stripe < 6.0) {
        color = vec4f(mix(color.rgb, vec3f(0.3, 0.3, 1.0), 0.5), color.a);
      }
    }
  }

  // 12c. Dither + Quantize visualization (after false color/zebra, before SDR clamp)
  if (u.quantizeBits > 0) {
    let levels = pow(2.0, f32(u.quantizeBits)) - 1.0;

    if (u.ditherMode == 1) {
      // Ordered dither: add Bayer pattern before quantization
      let pixelPos = vec2i(in.pos.xy);
      let threshold = bayerDither8x8(pixelPos) - 0.5; // Center around 0
      let ditherAmount = 1.0 / levels;
      color = vec4f(color.rgb + vec3f(threshold * ditherAmount), color.a);
    }

    // Clamp before quantization to prevent overflow from dither noise
    color = vec4f(clamp(color.rgb, vec3f(0.0), vec3f(1.0)), color.a);

    // Quantize (posterize)
    color = vec4f(floor(color.rgb * levels + 0.5) / levels, color.a);
  }

  return color;
}
