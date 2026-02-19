/**
 * SphericalProjection - Equirectangular (lat/long) projection for 360 content.
 *
 * Maps an equirectangular panoramic image onto a sphere viewed from inside,
 * supporting interactive yaw/pitch rotation via mouse drag and FOV zoom via
 * scroll wheel.
 *
 * The projection computes ray directions from the camera through each pixel,
 * then maps those rays to equirectangular UV coordinates for texture lookup.
 */

import { clamp } from '../utils/math';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default horizontal field of view in degrees */
const DEFAULT_FOV = 90;
/** Minimum FOV (zoomed in) */
const MIN_FOV = 20;
/** Maximum FOV (zoomed out) */
const MAX_FOV = 150;
/** Degrees to radians */
const DEG2RAD = Math.PI / 180;
/** Radians to degrees */
const RAD2DEG = 180 / Math.PI;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** 4x4 matrix stored as column-major Float32Array (WebGL convention) */
export type Mat4 = Float32Array;

/** 3-component vector */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Uniforms required by the spherical projection shader pass */
export interface SphericalProjectionUniforms {
  /** Whether spherical projection is enabled (0 or 1) */
  u_sphericalEnabled: number;
  /** Inverse view-projection matrix (4x4, column-major) */
  u_invViewProj: Float32Array;
  /** Horizontal field of view in radians */
  u_fov: number;
  /** Canvas aspect ratio (width / height) */
  u_aspect: number;
  /** Yaw angle in radians */
  u_yaw: number;
  /** Pitch angle in radians */
  u_pitch: number;
}

/** Metadata hints for detecting 360 content */
export interface SphericalMetadata {
  /** XMP ProjectionType */
  projectionType?: 'equirectangular' | 'cubemap';
  /** Image aspect ratio (equirectangular is typically 2:1) */
  aspectRatio?: number;
  /** Explicit user toggle */
  isSpherical?: boolean;
}

// ---------------------------------------------------------------------------
// Math utilities
// ---------------------------------------------------------------------------

/**
 * Create a 4x4 identity matrix (column-major Float32Array).
 */
export function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

/**
 * Create a perspective projection matrix.
 *
 * @param fovY - Vertical field of view in radians
 * @param aspect - Width / height aspect ratio
 * @param near - Near clipping plane
 * @param far - Far clipping plane
 * @returns Column-major 4x4 matrix
 */
export function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const m = new Float32Array(16);
  const f = 1.0 / Math.tan(fovY / 2);
  const rangeInv = 1.0 / (near - far);

  m[0] = f / aspect;
  m[5] = f;
  m[10] = (near + far) * rangeInv;
  m[11] = -1;
  m[14] = 2 * near * far * rangeInv;

  return m;
}

/**
 * Create a rotation matrix around the X axis.
 */
export function mat4RotateX(angle: number): Mat4 {
  const m = mat4Identity();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

/**
 * Create a rotation matrix around the Y axis.
 */
export function mat4RotateY(angle: number): Mat4 {
  const m = mat4Identity();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

/**
 * Multiply two 4x4 column-major matrices: result = a * b.
 */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[row + k * 4]! * b[k + col * 4]!;
      }
      out[row + col * 4] = sum;
    }
  }
  return out;
}

/**
 * Invert a 4x4 matrix. Returns null if the matrix is singular.
 */
export function mat4Invert(m: Mat4): Mat4 | null {
  const out = new Float32Array(16);

  const a00 = m[0]!, a01 = m[1]!, a02 = m[2]!, a03 = m[3]!;
  const a10 = m[4]!, a11 = m[5]!, a12 = m[6]!, a13 = m[7]!;
  const a20 = m[8]!, a21 = m[9]!, a22 = m[10]!, a23 = m[11]!;
  const a30 = m[12]!, a31 = m[13]!, a32 = m[14]!, a33 = m[15]!;

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-12) return null;
  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

  return out;
}

/**
 * Normalize a 3D vector.
 */
export function vec3Normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-12) return { x: 0, y: 0, z: -1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Convert a normalized 3D direction vector to equirectangular UV coordinates.
 *
 * Mapping convention:
 * - u = 0.5 + atan2(z, x) / (2*PI)  [longitude, wraps around]
 * - v = 0.5 - asin(y) / PI           [latitude, -90..+90 -> 1..0]
 *
 * @param dir - Normalized direction vector
 * @returns UV coordinates in [0, 1]
 */
export function directionToEquirectUV(dir: Vec3): { u: number; v: number } {
  const theta = Math.atan2(dir.z, dir.x); // longitude (-PI to PI)
  const phi = Math.asin(clamp(dir.y, -1, 1)); // latitude (-PI/2 to PI/2)

  const u = 0.5 + theta / (2 * Math.PI);
  const v = 0.5 - phi / Math.PI;

  return { u, v };
}

/**
 * Convert equirectangular UV coordinates to a normalized 3D direction vector.
 *
 * @param u - Horizontal UV (0-1)
 * @param v - Vertical UV (0-1)
 * @returns Normalized direction vector
 */
export function equirectUVToDirection(u: number, v: number): Vec3 {
  const theta = (u - 0.5) * 2 * Math.PI; // longitude
  const phi = (0.5 - v) * Math.PI;       // latitude

  const cosPhi = Math.cos(phi);
  return {
    x: cosPhi * Math.cos(theta),
    y: Math.sin(phi),
    z: cosPhi * Math.sin(theta),
  };
}

/**
 * Detect whether an image is likely 360 equirectangular content.
 *
 * Heuristic: checks for explicit metadata, or falls back to aspect ratio
 * check (equirectangular images are typically 2:1).
 */
export function detect360Content(metadata: SphericalMetadata, width: number, height: number): boolean {
  // Explicit metadata override
  if (metadata.isSpherical !== undefined) return metadata.isSpherical;
  if (metadata.projectionType === 'equirectangular') return true;

  // Aspect ratio heuristic: equirectangular is 2:1
  if (width > 0 && height > 0) {
    const ratio = width / height;
    if (Math.abs(ratio - 2.0) < 0.05) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// GLSL shader code for spherical projection
// ---------------------------------------------------------------------------

/**
 * GLSL fragment shader code for equirectangular projection.
 *
 * This can be injected into the existing viewer fragment shader as an
 * optional pass. When u_sphericalEnabled is 1, the texture coordinates
 * are replaced with equirectangular-projected UVs computed from view
 * ray directions.
 */
export const SPHERICAL_PROJECTION_GLSL = `
// Spherical projection uniforms
uniform int u_sphericalEnabled;
uniform float u_fov;
uniform float u_aspect;
uniform float u_yaw;
uniform float u_pitch;

// Compute equirectangular UV from screen-space UV
vec2 sphericalProject(vec2 screenUV) {
  if (u_sphericalEnabled == 0) return screenUV;

  // Map screen UV to NDC; flip y because screenUV.y=0 is top but NDC y=+1 is top
  vec2 ndc = vec2(screenUV.x * 2.0 - 1.0, 1.0 - screenUV.y * 2.0);

  // Compute ray direction in view space
  float halfFov = u_fov * 0.5;
  float tanHalfFov = tan(halfFov);
  vec3 viewDir = normalize(vec3(
    ndc.x * tanHalfFov * u_aspect,
    ndc.y * tanHalfFov,
    -1.0
  ));

  // Apply pitch rotation (around X axis)
  float cp = cos(u_pitch);
  float sp = sin(u_pitch);
  vec3 pitchDir = vec3(
    viewDir.x,
    viewDir.y * cp - viewDir.z * sp,
    viewDir.y * sp + viewDir.z * cp
  );

  // Apply yaw rotation (around Y axis)
  float cy = cos(u_yaw);
  float sy = sin(u_yaw);
  vec3 worldDir = vec3(
    pitchDir.x * cy + pitchDir.z * sy,
    pitchDir.y,
    -pitchDir.x * sy + pitchDir.z * cy
  );

  // Convert direction to equirectangular UV
  float theta = atan(worldDir.z, worldDir.x);       // longitude
  float phi = asin(clamp(worldDir.y, -1.0, 1.0));   // latitude

  float u = 0.5 + theta / (2.0 * 3.14159265359);
  float v = 0.5 - phi / 3.14159265359;

  // Stabilize u near poles where atan2 is numerically unstable
  float horizLen = length(vec2(worldDir.x, worldDir.z));
  float poleStability = smoothstep(0.0, 0.05, horizLen);
  u = mix(0.5, u, poleStability);

  return vec2(u, v);
}
`;

// ---------------------------------------------------------------------------
// SphericalProjection class
// ---------------------------------------------------------------------------

/**
 * SphericalProjection manages the state and interaction for equirectangular
 * 360 panoramic viewing.
 *
 * Usage:
 * ```ts
 * const sp = new SphericalProjection();
 * sp.enable();
 * sp.setYawPitch(0, 0);
 * sp.setFOV(90);
 * const uniforms = sp.getProjectionUniforms(canvasWidth, canvasHeight);
 * // Pass uniforms to shader
 * ```
 */
export class SphericalProjection {
  private _enabled = false;
  private _yaw = 0;   // radians
  private _pitch = 0;  // radians
  private _fov = DEFAULT_FOV; // degrees

  // Drag state
  private _isDragging = false;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _dragStartYaw = 0;
  private _dragStartPitch = 0;

  // ---------------------------------------------------------------------------
  // Enable / Disable
  // ---------------------------------------------------------------------------

  /** Whether spherical projection is currently active. */
  get enabled(): boolean {
    return this._enabled;
  }

  /** Enable spherical projection mode. */
  enable(): void {
    this._enabled = true;
  }

  /** Disable spherical projection mode and reset view. */
  disable(): void {
    this._enabled = false;
    this._yaw = 0;
    this._pitch = 0;
    this._fov = DEFAULT_FOV;
  }

  // ---------------------------------------------------------------------------
  // View control
  // ---------------------------------------------------------------------------

  /** Get the current yaw in radians. */
  get yaw(): number {
    return this._yaw;
  }

  /** Get the current pitch in radians. */
  get pitch(): number {
    return this._pitch;
  }

  /** Get the current field of view in degrees. */
  get fov(): number {
    return this._fov;
  }

  /**
   * Set the yaw and pitch angles.
   *
   * @param yawDeg - Yaw angle in degrees (horizontal rotation)
   * @param pitchDeg - Pitch angle in degrees (vertical rotation, clamped to +/- 90)
   */
  setYawPitch(yawDeg: number, pitchDeg: number): void {
    this._yaw = yawDeg * DEG2RAD;
    this._pitch = clamp(pitchDeg, -90, 90) * DEG2RAD;
  }

  /**
   * Get the current yaw and pitch in degrees.
   */
  getYawPitchDegrees(): { yaw: number; pitch: number } {
    return {
      yaw: this._yaw * RAD2DEG,
      pitch: this._pitch * RAD2DEG,
    };
  }

  /**
   * Set the horizontal field of view.
   *
   * @param fovDeg - Field of view in degrees (clamped to MIN_FOV..MAX_FOV)
   */
  setFOV(fovDeg: number): void {
    this._fov = clamp(fovDeg, MIN_FOV, MAX_FOV);
  }

  // ---------------------------------------------------------------------------
  // Mouse interaction
  // ---------------------------------------------------------------------------

  /**
   * Begin a drag interaction.
   *
   * @param clientX - Mouse X position
   * @param clientY - Mouse Y position
   */
  beginDrag(clientX: number, clientY: number): void {
    this._isDragging = true;
    this._dragStartX = clientX;
    this._dragStartY = clientY;
    this._dragStartYaw = this._yaw;
    this._dragStartPitch = this._pitch;
  }

  /**
   * Continue a drag interaction, updating yaw/pitch.
   *
   * @param clientX - Current mouse X position
   * @param clientY - Current mouse Y position
   * @param canvasWidth - Canvas width for sensitivity scaling
   * @param canvasHeight - Canvas height for sensitivity scaling
   */
  drag(clientX: number, clientY: number, canvasWidth: number, _canvasHeight: number): void {
    if (!this._isDragging) return;

    const dx = clientX - this._dragStartX;
    const dy = clientY - this._dragStartY;

    // Scale mouse movement to rotation based on FOV and canvas size
    const fovRad = this._fov * DEG2RAD;
    const sensitivity = fovRad / canvasWidth;

    // Dragging right (positive dx) should look right (increase yaw)
    this._yaw = this._dragStartYaw + dx * sensitivity;
    // Dragging down (positive dy) should look down (decrease pitch)
    this._pitch = clamp(
      this._dragStartPitch - dy * sensitivity,
      -Math.PI / 2,
      Math.PI / 2,
    );
  }

  /**
   * End a drag interaction.
   */
  endDrag(): void {
    this._isDragging = false;
  }

  /** Whether a drag is currently in progress. */
  get isDragging(): boolean {
    return this._isDragging;
  }

  /**
   * Handle scroll wheel zoom (adjusts FOV).
   *
   * @param deltaY - Scroll delta (positive = zoom out, negative = zoom in)
   * @param zoomSpeed - Zoom speed multiplier (default 0.1)
   */
  handleWheel(deltaY: number, zoomSpeed = 0.1): void {
    this._fov = clamp(this._fov + deltaY * zoomSpeed, MIN_FOV, MAX_FOV);
  }

  // ---------------------------------------------------------------------------
  // Projection uniforms
  // ---------------------------------------------------------------------------

  /**
   * Get the uniform values needed by the spherical projection shader.
   *
   * @param canvasWidth - Canvas width for aspect ratio
   * @param canvasHeight - Canvas height for aspect ratio
   * @returns Shader uniform values
   */
  getProjectionUniforms(canvasWidth: number, canvasHeight: number): SphericalProjectionUniforms {
    const aspect = canvasHeight > 0 ? canvasWidth / canvasHeight : 1;
    const fovRad = this._fov * DEG2RAD;

    // Build the view-projection matrix and invert it
    const proj = mat4Perspective(fovRad, aspect, 0.1, 100);
    const rotX = mat4RotateX(-this._pitch);
    const rotY = mat4RotateY(-this._yaw);
    const view = mat4Multiply(rotX, rotY);
    const viewProj = mat4Multiply(proj, view);
    const invViewProj = mat4Invert(viewProj) ?? mat4Identity();

    return {
      u_sphericalEnabled: this._enabled ? 1 : 0,
      u_invViewProj: invViewProj,
      u_fov: fovRad,
      u_aspect: aspect,
      u_yaw: this._yaw,
      u_pitch: this._pitch,
    };
  }

  /**
   * Compute the equirectangular UV for a given screen-space position.
   *
   * This is the CPU-side equivalent of the GLSL sphericalProject() function,
   * useful for pixel picking in 360 mode.
   *
   * @param screenU - Horizontal screen position (0-1, left to right)
   * @param screenV - Vertical screen position (0-1, top to bottom)
   * @param canvasWidth - Canvas width
   * @param canvasHeight - Canvas height
   * @returns Equirectangular UV coordinates
   */
  screenToEquirectUV(screenU: number, screenV: number, canvasWidth: number, canvasHeight: number): { u: number; v: number } {
    const aspect = canvasHeight > 0 ? canvasWidth / canvasHeight : 1;
    const fovRad = this._fov * DEG2RAD;
    const tanHalfFov = Math.tan(fovRad / 2);

    // NDC from screen UV
    // screenV=0 is at the top of the screen, but NDC y=+1 is at the top,
    // so we must flip y to avoid an upside-down projection.
    const ndcX = screenU * 2 - 1;
    const ndcY = 1 - screenV * 2;

    // View-space ray direction
    let dir: Vec3 = {
      x: ndcX * tanHalfFov * aspect,
      y: ndcY * tanHalfFov,
      z: -1,
    };
    dir = vec3Normalize(dir);

    // Apply pitch rotation (around X)
    const cp = Math.cos(this._pitch);
    const sp = Math.sin(this._pitch);
    const pitchDir: Vec3 = {
      x: dir.x,
      y: dir.y * cp - dir.z * sp,
      z: dir.y * sp + dir.z * cp,
    };

    // Apply yaw rotation (around Y)
    const cy = Math.cos(this._yaw);
    const sy = Math.sin(this._yaw);
    const worldDir: Vec3 = {
      x: pitchDir.x * cy + pitchDir.z * sy,
      y: pitchDir.y,
      z: -pitchDir.x * sy + pitchDir.z * cy,
    };

    return directionToEquirectUV(worldDir);
  }
}
