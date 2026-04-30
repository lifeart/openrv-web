// Viewer vertex WGSL — pan/zoom transform for the first stage of the
// pipeline. Prepended (after common.wgsl) to each stage shader at
// pipeline build time by WebGPUShaderPipeline.
//
// Declares `struct VSOut` and `@vertex fn vs(...)` so stage shaders only
// need to provide their `@fragment fn fs(in: VSOut) -> ...`.
//
// Bind group layout (MED-55 4a): `@group(0)` = sampler + textures (stage),
// `@group(1)` = stage `Uniforms` UBO (stage), `@group(2)` = this viewer UBO
// (first-stage only). Putting the viewer UBO at `@group(2)` avoids a WGSL
// module-scope binding collision with stage shaders that all declare
// `@group(1) @binding(0) var<uniform> u: Uniforms;`.

struct ViewerUniforms {
  offset: vec2f,
  scale: vec2f,
}

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@group(2) @binding(0) var<uniform> viewer: ViewerUniforms;

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var out: VSOut;
  let x = f32(i32(i & 1u) * 2) - 1.0;
  let y = f32(i32(i >> 1u) * 2) - 1.0;
  out.pos = vec4f(x * viewer.scale.x + viewer.offset.x,
                  y * viewer.scale.y + viewer.offset.y, 0.0, 1.0);
  out.uv = vec2f((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
  return out;
}
