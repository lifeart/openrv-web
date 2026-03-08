// Passthrough shader: samples texture and outputs directly.
// Uses a fullscreen triangle (3 vertices, no vertex buffer) for zero overhead.

struct Uniforms {
  offset: vec2f,
  scale: vec2f,
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
  // Vertex 0: (-1, -1), Vertex 1: (3, -1), Vertex 2: (-1, 3)
  var out: VSOut;
  let x = f32(i32(i & 1u) * 2) - 1.0;
  let y = f32(i32(i >> 1u) * 2) - 1.0;

  // Apply scale and offset for pan/zoom
  out.pos = vec4f(x * u.scale.x + u.offset.x, y * u.scale.y + u.offset.y, 0.0, 1.0);

  // UV: map NDC [-1,1] to [0,1], flip Y for top-to-bottom texture convention
  out.uv = vec2f((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return textureSample(tex, samp, in.uv);
}
