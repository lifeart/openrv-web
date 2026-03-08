// Stage 5: Spatial Effects — Clarity (local contrast enhancement).
// common.wgsl is prepended before compilation.

struct Uniforms {
  clarityEnabled: u32,   // 0=off, 1=on
  clarityValue: f32,     // -1.0 to +1.0
  texelSize: vec2f,      // 1.0 / textureResolution
}

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@group(1) @binding(0) var<uniform> u: Uniforms;

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  // Fullscreen triangle: 3 vertices that cover the entire screen.
  var out: VSOut;
  let x = f32(i32(i & 1u) * 2) - 1.0;
  let y = f32(i32(i >> 1u) * 2) - 1.0;
  out.pos = vec4f(x, y, 0.0, 1.0);
  out.uv = vec2f((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  var color = textureSample(tex, samp, in.uv);

  // Clarity (local contrast enhancement via unsharp mask on midtones)
  if (u.clarityEnabled == 1u && u.clarityValue != 0.0) {
    // Read center pixel from texture (original/input space)
    let origCenter = textureSample(tex, samp, in.uv).rgb;

    // 5x5 Gaussian blur (separable weights: 1,4,6,4,1)
    let weights = array<f32, 5>(1.0, 4.0, 6.0, 4.0, 1.0);
    var blurred = vec3f(0.0);
    var totalWeight: f32 = 0.0;

    for (var dy: i32 = -2; dy <= 2; dy = dy + 1) {
      for (var dx: i32 = -2; dx <= 2; dx = dx + 1) {
        let w = weights[dx + 2] * weights[dy + 2];
        let offset = vec2f(f32(dx), f32(dy)) * u.texelSize;
        blurred = blurred + textureSample(tex, samp, in.uv + offset).rgb * w;
        totalWeight = totalWeight + w;
      }
    }
    blurred = blurred / totalWeight;

    // Midtone mask based on processed luminance, normalized for HDR
    let clarityLum = dot(color.rgb, LUMA);
    let peakLum = max(clarityLum, 1.0);
    let normLum = clarityLum / peakLum;
    let deviation = abs(normLum - 0.5) * 2.0;
    let midtoneMask = 1.0 - deviation * deviation;

    // High-frequency detail from texture (both terms in same space)
    let highFreq = origCenter - blurred;
    let effectScale = u.clarityValue * 0.7; // CLARITY_EFFECT_SCALE
    let maxVal = max(max(color.r, max(color.g, color.b)), 1.0);
    color = vec4f(
      clamp(color.rgb + highFreq * midtoneMask * effectScale, vec3f(0.0), vec3f(maxVal)),
      color.a
    );
  }

  return color;
}
