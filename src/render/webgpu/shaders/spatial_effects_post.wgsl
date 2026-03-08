// Stage 8: Spatial Effects Post — Sharpen (unsharp mask / Laplacian).
// common.wgsl is prepended before compilation.

struct Uniforms {
  sharpenEnabled: u32,   // 0=off, 1=on
  sharpenAmount: f32,    // 0.0 to 1.0
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

  // Sharpen (unsharp mask via Laplacian kernel)
  if (u.sharpenEnabled == 1u && u.sharpenAmount > 0.0) {
    // Compute Laplacian detail entirely in texture space
    let origCenter = textureSample(tex, samp, in.uv).rgb;
    let neighbors =
        textureSample(tex, samp, in.uv + vec2f(-1.0, 0.0) * u.texelSize).rgb
      + textureSample(tex, samp, in.uv + vec2f(1.0, 0.0) * u.texelSize).rgb
      + textureSample(tex, samp, in.uv + vec2f(0.0, -1.0) * u.texelSize).rgb
      + textureSample(tex, samp, in.uv + vec2f(0.0, 1.0) * u.texelSize).rgb;

    // Laplacian: high-frequency edge detail (both terms in same space)
    let detail = origCenter * 4.0 - neighbors;
    color = vec4f(max(color.rgb + detail * u.sharpenAmount, vec3f(0.0)), color.a);
  }

  return color;
}
