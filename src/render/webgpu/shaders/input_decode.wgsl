// Stage 1: Input Decode — deinterlace, perspective correction, spherical
// projection, channel swizzle, and unpremultiply alpha.
// Ports sections 0a-0b2 from viewer.frag.glsl.

struct Uniforms {
  // Deinterlace
  deinterlaceEnabled: i32,   // 0=off, 1=on
  deinterlaceMethod: i32,    // 0=bob, 1=weave, 2=blend
  deinterlaceFieldOrder: i32, // 0=tff, 1=bff
  _pad0: i32,

  // Perspective correction
  perspectiveEnabled: i32,   // 0=off, 1=on
  perspectiveQuality: i32,   // 0=bilinear, 1=bicubic
  _pad1: vec2f,

  // mat3x3 stored as 3 vec4f rows for 16-byte alignment (w component unused)
  perspectiveInvH_row0: vec4f,
  perspectiveInvH_row1: vec4f,
  perspectiveInvH_row2: vec4f,

  // Spherical projection
  sphericalEnabled: i32,     // 0=off, 1=on
  _pad2: f32,
  sphericalFov: f32,         // horizontal FOV in radians
  sphericalAspect: f32,      // canvas width / height
  sphericalYaw: f32,         // yaw in radians
  sphericalPitch: f32,       // pitch in radians
  _pad3: vec2f,

  // Channel swizzle (each component: 0=R, 1=G, 2=B, 3=A, 4=0.0, 5=1.0)
  channelSwizzle: vec4i,

  // Premultiply mode: 0=off, 1=premultiply, 2=unpremultiply
  premultMode: i32,
  _pad4: i32,

  // Texel size (1.0 / textureResolution)
  texelSize: vec2f,
}

// VSOut is provided by the prepended vertex shader source
// (_viewer_vert.wgsl or _passthrough_vert.wgsl) at pipeline build time.

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@group(1) @binding(0) var<uniform> u: Uniforms;

const PI = 3.14159265359;

// Catmull-Rom spline weight for bicubic interpolation
fn catmullRom(x: f32) -> f32 {
  let ax = abs(x);
  if (ax < 1.0) {
    return 1.5 * ax * ax * ax - 2.5 * ax * ax + 1.0;
  }
  if (ax < 2.0) {
    return -0.5 * ax * ax * ax + 2.5 * ax * ax - 4.0 * ax + 2.0;
  }
  return 0.0;
}

// Compute equirectangular UV from screen-space UV for 360 content
fn sphericalProject(screenUV: vec2f) -> vec2f {
  // screenUV.y=0 is at the top of the screen (image row 0), but NDC y=+1
  // is at the top, so we must flip the y component to avoid an upside-down image.
  let ndc = vec2f(screenUV.x * 2.0 - 1.0, 1.0 - screenUV.y * 2.0);
  let halfFov = u.sphericalFov * 0.5;
  let tanHalfFov = tan(halfFov);
  let viewDir = normalize(vec3f(
    ndc.x * tanHalfFov * u.sphericalAspect,
    ndc.y * tanHalfFov,
    -1.0
  ));

  let cp = cos(u.sphericalPitch);
  let sp = sin(u.sphericalPitch);
  let pitchDir = vec3f(
    viewDir.x,
    viewDir.y * cp - viewDir.z * sp,
    viewDir.y * sp + viewDir.z * cp
  );

  let cy = cos(u.sphericalYaw);
  let sy = sin(u.sphericalYaw);
  let worldDir = vec3f(
    pitchDir.x * cy + pitchDir.z * sy,
    pitchDir.y,
    -pitchDir.x * sy + pitchDir.z * cy
  );

  let theta = atan2(worldDir.z, worldDir.x);
  let phi = asin(clamp(worldDir.y, -1.0, 1.0));

  var uCoord = 0.5 + theta / (2.0 * PI);
  let vCoord = 0.5 - phi / PI;

  // Stabilize u near poles: atan2(~0, ~0) is numerically unstable,
  // causing adjacent fragments to compute wildly different u values.
  // Near the pole all longitudes converge, so u doesn't matter;
  // blend smoothly toward a stable value (0.5).
  let horizLen = length(vec2f(worldDir.x, worldDir.z));
  let poleStability = smoothstep(0.0, 0.05, horizLen);
  uCoord = mix(0.5, uCoord, poleStability);

  return vec2f(uCoord, vCoord);
}

// Select a channel value from source, given a swizzle index
fn selectChannel(src: vec4f, idx: i32) -> f32 {
  switch (idx) {
    case 0: { return src.r; }
    case 1: { return src.g; }
    case 2: { return src.b; }
    case 3: { return src.a; }
    case 4: { return 0.0; }
    case 5: { return 1.0; }
    default: { return 0.0; }
  }
}

// `@vertex fn vs(...)` is provided by the prepended vertex shader source.

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  // Sample first (uniform control flow), then apply OOB mask. The previous
  // form (early return) made later textureSample calls non-uniform.
  var color = textureSample(tex, samp, in.uv);
  if (in.uv.x < 0.0 || in.uv.x > 1.0 || in.uv.y < 0.0 || in.uv.y > 1.0) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }

  // 0a. Deinterlace (before EOTF, operates on raw texels)
  if (u.deinterlaceEnabled == 1 && u.deinterlaceMethod != 1) {
    // not weave (weave = passthrough)
    let row = in.uv.y / u.texelSize.y;
    let rowInt = i32(floor(row));
    let isEvenRow = (rowInt - 2 * (rowInt / 2)) == 0; // modulo 2 without bitwise

    if (u.deinterlaceMethod == 0) {
      // Bob: interpolate missing field lines from neighbors
      var interpolate = false;
      if (u.deinterlaceFieldOrder == 0) {
        interpolate = !isEvenRow;
      } else {
        interpolate = isEvenRow;
      }
      if (interpolate) {
        // Use textureSampleLevel: textureSample requires uniform control flow,
        // and `interpolate` is per-pixel here (depends on isEvenRow).
        let above = textureSampleLevel(tex, samp, in.uv - vec2f(0.0, u.texelSize.y), 0.0);
        let below = textureSampleLevel(tex, samp, in.uv + vec2f(0.0, u.texelSize.y), 0.0);
        color = (above + below) * 0.5;
      }
    } else if (u.deinterlaceMethod == 2) {
      // Blend: average current line with adjacent field line
      var offset: f32;
      if (isEvenRow) {
        offset = u.texelSize.y;
      } else {
        offset = -u.texelSize.y;
      }
      // textureSampleLevel: per-pixel offset means non-uniform control flow.
      let neighbor = textureSampleLevel(tex, samp, in.uv + vec2f(0.0, offset), 0.0);
      color = (color + neighbor) * 0.5;
    }
  }

  // 0a2. Perspective correction (geometric warp, after deinterlace, before EOTF)
  if (u.perspectiveEnabled == 1) {
    // Reconstruct mat3x3 from padded vec4 rows
    let invH = mat3x3f(
      u.perspectiveInvH_row0.xyz,
      u.perspectiveInvH_row1.xyz,
      u.perspectiveInvH_row2.xyz
    );
    let srcH = invH * vec3f(in.uv, 1.0);

    if (abs(srcH.z) < 1e-6) {
      // Singularity guard
      color = vec4f(0.0, 0.0, 0.0, 0.0);
    } else {
      let srcUV = srcH.xy / srcH.z;

      if (srcUV.x < 0.0 || srcUV.x > 1.0 || srcUV.y < 0.0 || srcUV.y > 1.0) {
        // Out of bounds
        color = vec4f(0.0, 0.0, 0.0, 0.0);
      } else if (u.perspectiveQuality == 1) {
        // Bicubic Catmull-Rom 4x4 — uses textureSampleLevel because the
        // sample coords are computed inside non-uniform control flow.
        let texSize = 1.0 / u.texelSize;
        let fCoord = srcUV * texSize - 0.5;
        let f = fract(fCoord);
        let iCoord = floor(fCoord);
        var result = vec4f(0.0);

        for (var j = -1; j <= 2; j++) {
          let wy = catmullRom(f32(j) - f.y);
          for (var ii = -1; ii <= 2; ii++) {
            let wx = catmullRom(f32(ii) - f.x);
            let sc = clamp(
              (iCoord + vec2f(f32(ii), f32(j)) + 0.5) / texSize,
              vec2f(0.0),
              vec2f(1.0)
            );
            result += textureSampleLevel(tex, samp, sc, 0.0) * wx * wy;
          }
        }
        color = result;
      } else {
        // Bilinear (hardware) — non-uniform control flow path; use level 0.
        color = textureSampleLevel(tex, samp, srcUV, 0.0);
      }
    }
  }

  // 0a3. Spherical (equirectangular 360) projection — uses textureSampleLevel
  // because the resampled coords are arbitrary screen-space remaps that
  // would otherwise need explicit derivatives.
  if (u.sphericalEnabled == 1) {
    let eqUV = sphericalProject(in.uv);
    color = textureSampleLevel(tex, samp, eqUV, 0.0);
  }

  // 0b. Channel swizzle (RVChannelMap remapping, before any color processing)
  if (u.channelSwizzle.x != 0 || u.channelSwizzle.y != 1 ||
      u.channelSwizzle.z != 2 || u.channelSwizzle.w != 3) {
    let src = color;
    color = vec4f(
      selectChannel(src, u.channelSwizzle.x),
      selectChannel(src, u.channelSwizzle.y),
      selectChannel(src, u.channelSwizzle.z),
      selectChannel(src, u.channelSwizzle.w)
    );
  }

  // 0b2. Unpremultiply alpha (early, before any color processing)
  // premultMode == 2 means unpremultiply
  if (u.premultMode == 2) {
    if (color.a > 1e-5) {
      color = vec4f(color.rgb / color.a, color.a);
    }
  }

  return color;
}
