// Stage 8: Spatial Effects Post — Sharpen (unsharp mask / Laplacian).
// common.wgsl is prepended before compilation.

struct Uniforms {
  sharpenEnabled: u32,   // 0=off, 1=on
  sharpenAmount: f32,    // 0.0 to 1.0
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

  // Sharpen (unsharp mask via Laplacian kernel)
  //
  // TRADE-OFF (LOW-07): The Laplacian neighbours below sample `tex`, which
  // in this multi-pass pipeline is the previous stage's output. Stage
  // ordering for spatialEffectsPost is:
  //   ... -> colorPipeline -> sceneAnalysis -> spatialEffectsPost -> displayOutput
  // So in the WebGPU backend, sharpen DOES sample post-color-pipeline values
  // (unlike the GLSL single-pass renderer, where the same Laplacian samples
  // the raw input texture — see viewer.frag.glsl, section 7b). This is a
  // deliberate architectural difference: multi-pass naturally enables
  // post-pipeline sampling at the cost of one FBO per active stage, which
  // we already pay in WebGPU. The single-pass GLSL renderer avoids those
  // FBOs and accepts the raw-texture sampling as a documented trade-off.
  //
  // Quality implication: this stage shader is identical in shape to the
  // GLSL one (Laplacian kernel * sharpenAmount), but the inputs differ.
  // GPU-WebGPU and GPU-WebGL output therefore differs by a small expected
  // amount in heavily-graded scenes; both are visually correct.
  //
  // Do NOT change `tex` here to a "raw" texture binding to "match" the GLSL
  // path: the WebGPU pipeline shape is what makes the post-pipeline sample
  // free, and giving it up would mean strictly worse output for no benefit.
  if (u.sharpenEnabled == 1u && u.sharpenAmount > 0.0) {
    // Compute Laplacian detail entirely in stage-input texture space.
    // (See TRADE-OFF note: that input is post-color-pipeline in this
    // backend, raw in the GLSL backend.)
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
