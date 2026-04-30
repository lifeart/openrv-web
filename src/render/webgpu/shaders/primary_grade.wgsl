// Stage 3: Primary Grade — exposure, scale/offset, gamma, contrast,
// temperature/tint, brightness, saturation, inline 1D LUT, curves LUT.
// Ports sections 1-5 (color grading primaries) from viewer.frag.glsl.
//
// NOTE: This shader expects common.wgsl to be prepended, which provides:
//   LUMA, applyTemperature

struct Uniforms {
  // Exposure per-channel (in stops, applied as exp2)
  exposureRGB: vec4f,       // .xyz = per-channel, .w = unused

  // Scale / offset per-channel
  scaleRGB: vec4f,          // .xyz = per-channel, .w = unused
  offsetRGB: vec4f,         // .xyz = per-channel, .w = unused

  // Gamma per-channel
  gammaRGB: vec4f,          // .xyz = per-channel, .w = unused

  // Contrast per-channel (pivot at 0.5)
  contrastRGB: vec4f,       // .xyz = per-channel, .w = unused

  // Temperature and tint
  temperature: f32,         // -100 to +100
  tint: f32,                // -100 to +100

  // Brightness (simple additive offset)
  brightness: f32,          // -1 to +1

  // Saturation
  saturation: f32,          // 0 to 2

  // Inline 1D LUT control
  inlineLUTEnabled: i32,    // 0=off, 1=on
  inlineLUTChannels: i32,   // 1=luminance, 3=per-channel RGB
  inlineLUTSize: f32,       // entries per channel (e.g. 256)

  // Curves LUT control
  curvesEnabled: i32,       // 0=off, 1=on
}

// VSOut is provided by the prepended vertex shader source
// (_viewer_vert.wgsl or _passthrough_vert.wgsl) at pipeline build time.

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var curvesLUT: texture_2d<f32>;
@group(0) @binding(3) var inlineLUT: texture_2d<f32>;

@group(1) @binding(0) var<uniform> u: Uniforms;

// LUMA and applyTemperature are provided by common.wgsl (prepended).

// Apply inline 1D LUT (from RVColor luminanceLUT)
fn applyInlineLUT(color: vec3f) -> vec3f {
  let invSize = 1.0 / u.inlineLUTSize;
  let halfTexel = 0.5 * invSize;
  var c = color;

  if (u.inlineLUTChannels == 3) {
    // 3-channel: R table in row 0, G table in row 1, B table in row 2
    c.r = textureSample(inlineLUT, samp, vec2f(
      clamp(c.r, 0.0, 1.0) * (1.0 - invSize) + halfTexel, 0.5 / 3.0
    )).r;
    c.g = textureSample(inlineLUT, samp, vec2f(
      clamp(c.g, 0.0, 1.0) * (1.0 - invSize) + halfTexel, 1.5 / 3.0
    )).r;
    c.b = textureSample(inlineLUT, samp, vec2f(
      clamp(c.b, 0.0, 1.0) * (1.0 - invSize) + halfTexel, 2.5 / 3.0
    )).r;
  } else {
    // 1-channel luminance: single row
    c.r = textureSample(inlineLUT, samp, vec2f(
      clamp(c.r, 0.0, 1.0) * (1.0 - invSize) + halfTexel, 0.5
    )).r;
    c.g = textureSample(inlineLUT, samp, vec2f(
      clamp(c.g, 0.0, 1.0) * (1.0 - invSize) + halfTexel, 0.5
    )).r;
    c.b = textureSample(inlineLUT, samp, vec2f(
      clamp(c.b, 0.0, 1.0) * (1.0 - invSize) + halfTexel, 0.5
    )).r;
  }

  return c;
}

// `@vertex fn vs(...)` is provided by the prepended vertex shader source.

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  var color = textureSample(tex, samp, in.uv);

  // 1. Exposure (in stops, applied in linear space, per-channel)
  color = vec4f(color.rgb * exp2(u.exposureRGB.xyz), color.a);

  // 1a. Per-channel scale and offset (after exposure, before contrast)
  // OpenRV pipeline: exposure -> scale -> offset -> contrast -> saturation
  color = vec4f(color.rgb * u.scaleRGB.xyz + u.offsetRGB.xyz, color.a);

  // 1b. Inline 1D LUT (from RVColor luminanceLUT, applied after exposure, before contrast)
  if (u.inlineLUTEnabled == 1) {
    color = vec4f(applyInlineLUT(color.rgb), color.a);
  }

  // 2. Temperature and tint
  color = vec4f(applyTemperature(color.rgb, u.temperature, u.tint), color.a);

  // 3. Brightness (simple offset)
  color = vec4f(color.rgb + u.brightness, color.a);

  // 3a. Clamp after brightness: negative values are physically meaningless
  // and would be amplified by contrast multiplication, producing artifacts.
  color = vec4f(max(color.rgb, vec3f(0.0)), color.a);

  // 4. Contrast (pivot at 0.5, per-channel)
  color = vec4f((color.rgb - 0.5) * u.contrastRGB.xyz + 0.5, color.a);

  // 5. Saturation
  let luma = dot(color.rgb, LUMA);
  color = vec4f(mix(vec3f(luma), color.rgb, u.saturation), color.a);

  // 5e. Curves (1D LUT)
  if (u.curvesEnabled == 1) {
    var cc = clamp(color.rgb, vec3f(0.0), vec3f(1.0));
    let excess = color.rgb - cc; // preserve HDR headroom

    // Apply per-channel curves
    cc.r = textureSample(curvesLUT, samp, vec2f(cc.r, 0.5)).r;
    cc.g = textureSample(curvesLUT, samp, vec2f(cc.g, 0.5)).g;
    cc.b = textureSample(curvesLUT, samp, vec2f(cc.b, 0.5)).b;

    // Apply master curve (stored in alpha)
    cc.r = textureSample(curvesLUT, samp, vec2f(cc.r, 0.5)).a;
    cc.g = textureSample(curvesLUT, samp, vec2f(cc.g, 0.5)).a;
    cc.b = textureSample(curvesLUT, samp, vec2f(cc.b, 0.5)).a;

    color = vec4f(cc + excess, color.a);
  }

  // Per-channel gamma (always applied; identity when gammaRGB == 1.0)
  color = vec4f(
    pow(max(color.rgb, vec3f(0.0)), 1.0 / u.gammaRGB.xyz),
    color.a
  );

  return color;
}
