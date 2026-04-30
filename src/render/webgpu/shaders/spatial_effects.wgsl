// Stage 5: Spatial Effects — Clarity (local contrast enhancement).
// common.wgsl is prepended before compilation.

struct Uniforms {
  clarityEnabled: u32,   // 0=off, 1=on
  clarityValue: f32,     // -1.0 to +1.0
  texelSize: vec2f,      // 1.0 / textureResolution
}

// VSOut is provided by the prepended vertex shader source
// (_viewer_vert.wgsl or _passthrough_vert.wgsl) at pipeline build time.

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@group(1) @binding(0) var<uniform> u: Uniforms;

// `@vertex fn vs(...)` is provided by the prepended vertex shader source.

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  var color = textureSample(tex, samp, in.uv);

  // Clarity (local contrast enhancement via unsharp mask on midtones)
  //
  // TRADE-OFF (LOW-07): The blur kernel below samples `tex`, which in this
  // multi-pass WebGPU pipeline is whatever the previous stage produced
  // (linearize -> primaryGrade -> secondaryGrade -> spatialEffects). It is
  // therefore NOT post-color-pipeline; the colorPipeline / displayOutput
  // stages run AFTER this one. We deliberately keep clarity here, before
  // the heavy color pipeline, so we don't have to allocate a second FBO
  // chain or rerun the color pipeline twice — the same single-input,
  // single-output stage shape used by every other spatial stage.
  //
  // Quality implication: clarity operates on linear-light values with the
  // input primaries (post primary/secondary grade), not on display-referred
  // values. This matches the GLSL single-pass renderer's behaviour (see
  // viewer.frag.glsl, section 5e) and is acceptable because unsharp-mask
  // edge enhancement is dominated by local high-frequency differences,
  // which survive the remaining linear transformations.
  //
  // Do NOT replace `tex` with a hypothetical post-color-pipeline texture:
  // that would require either reordering the entire pipeline (breaking the
  // clarity-before-grade contract) or paying for an extra full-resolution
  // FBO + render pass dedicated to clarity input.
  if (u.clarityEnabled == 1u && u.clarityValue != 0.0) {
    // Read center pixel from the stage input texture. Note: this is the
    // raw stage input (see TRADE-OFF note above), NOT the result of the
    // color pipeline.
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
