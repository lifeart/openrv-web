// Stage 11: Compositing — SDR clamp, premultiply/unpremultiply alpha, background pattern.
// common.wgsl is prepended before compilation.

struct Uniforms {
  premultMode: u32,      // 0=off, 1=premultiply, 2=unpremultiply
  bgPatternCode: u32,    // 0=none, 1=solid, 2=checker, 3=crosshatch
  bgCheckerSize: f32,    // checker square size in pixels
  _pad0: f32,
  bgColor1: vec4f,       // primary background color (rgb + padding)
  bgColor2: vec4f,       // secondary background color (rgb + padding)
}

// VSOut is provided by the prepended vertex shader source
// (_viewer_vert.wgsl or _passthrough_vert.wgsl) at pipeline build time.

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@group(1) @binding(0) var<uniform> u: Uniforms;

// `@vertex fn vs(...)` is provided by the prepended vertex shader source.

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  var color = textureSample(tex, samp, in.uv);

  // SDR clamp: clamp to [0,1]
  color = vec4f(clamp(color.rgb, vec3f(0.0), vec3f(1.0)), color.a);

  // Premultiply alpha (mode 1): multiply RGB by alpha
  if (u.premultMode == 1u) {
    color = vec4f(color.rgb * color.a, color.a);
  }
  // Unpremultiply alpha (mode 2): divide RGB by alpha
  if (u.premultMode == 2u) {
    if (color.a > 1e-5) {
      color = vec4f(color.rgb / color.a, color.a);
    }
  }

  // Background pattern blend (alpha compositing)
  if (u.bgPatternCode > 0u && color.a < 1.0) {
    var bgColor = u.bgColor1.rgb;

    if (u.bgPatternCode == 2u) {
      // Checker pattern
      let pxPos = in.pos.xy;
      let cx = floor(pxPos.x / u.bgCheckerSize);
      let cy = floor(pxPos.y / u.bgCheckerSize);
      let isLight = (cx + cy) % 2.0 < 1.0;
      if (isLight) {
        bgColor = u.bgColor1.rgb;
      } else {
        bgColor = u.bgColor2.rgb;
      }
    } else if (u.bgPatternCode == 3u) {
      // Crosshatch pattern
      let pxPos = in.pos.xy;
      let spacing: f32 = 12.0;
      let diag1 = (pxPos.x + pxPos.y) % spacing;
      let diag2 = (pxPos.x - pxPos.y) % spacing;
      let onLine = diag1 < 1.0 || diag2 < 1.0;
      if (onLine) {
        bgColor = u.bgColor2.rgb;
      } else {
        bgColor = u.bgColor1.rgb;
      }
    }
    // bgPatternCode == 1 is solid, bgColor = u.bgColor1 already

    if (u.premultMode == 1u) {
      // Premultiplied over: rgb is already multiplied by alpha
      color = vec4f(bgColor * (1.0 - color.a) + color.rgb, 1.0);
    } else {
      color = vec4f(mix(bgColor, color.rgb, color.a), 1.0);
    }
  }

  return color;
}
