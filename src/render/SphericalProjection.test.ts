/**
 * SphericalProjection Unit Tests
 *
 * Tests for the equirectangular 360 viewer math and projection logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SphericalProjection,
  mat4Identity,
  mat4Perspective,
  mat4RotateX,
  mat4RotateY,
  mat4Multiply,
  mat4Invert,
  vec3Normalize,
  directionToEquirectUV,
  equirectUVToDirection,
  detect360Content,
  type SphericalMetadata,
} from './SphericalProjection';

// ---------------------------------------------------------------------------
// Math utility tests
// ---------------------------------------------------------------------------

describe('mat4Identity', () => {
  it('SP-MATH-001: creates identity matrix', () => {
    const m = mat4Identity();
    expect(m.length).toBe(16);
    // Diagonal should be 1
    expect(m[0]).toBe(1);
    expect(m[5]).toBe(1);
    expect(m[10]).toBe(1);
    expect(m[15]).toBe(1);
    // Off-diagonal should be 0
    expect(m[1]).toBe(0);
    expect(m[4]).toBe(0);
    expect(m[12]).toBe(0);
  });
});

describe('mat4Perspective', () => {
  it('SP-MATH-002: creates valid perspective matrix', () => {
    const fov = Math.PI / 2; // 90 degrees
    const aspect = 16 / 9;
    const m = mat4Perspective(fov, aspect, 0.1, 100);
    expect(m.length).toBe(16);
    // m[0] = f / aspect, where f = 1/tan(fov/2) = 1/tan(PI/4) = 1
    expect(m[0]).toBeCloseTo(1 / aspect, 5);
    // m[5] = f = 1
    expect(m[5]).toBeCloseTo(1, 5);
    // m[11] should be -1 for standard perspective
    expect(m[11]).toBe(-1);
  });

  it('SP-MATH-003: narrower FOV increases focal length', () => {
    const wide = mat4Perspective(Math.PI / 2, 1, 0.1, 100);
    const narrow = mat4Perspective(Math.PI / 4, 1, 0.1, 100);
    // Narrower FOV -> larger f -> larger m[5]
    expect(narrow[5]!).toBeGreaterThan(wide[5]!);
  });
});

describe('mat4RotateX', () => {
  it('SP-MATH-004: rotation by 0 is identity', () => {
    const m = mat4RotateX(0);
    const id = mat4Identity();
    for (let i = 0; i < 16; i++) {
      expect(m[i]).toBeCloseTo(id[i]!, 10);
    }
  });

  it('SP-MATH-005: rotation by PI/2 rotates Y to Z', () => {
    const m = mat4RotateX(Math.PI / 2);
    // cos(PI/2) ~ 0, sin(PI/2) ~ 1
    expect(m[5]).toBeCloseTo(0, 5);
    expect(m[6]).toBeCloseTo(1, 5);
    expect(m[9]).toBeCloseTo(-1, 5);
    expect(m[10]).toBeCloseTo(0, 5);
  });
});

describe('mat4RotateY', () => {
  it('SP-MATH-006: rotation by 0 is identity', () => {
    const m = mat4RotateY(0);
    const id = mat4Identity();
    for (let i = 0; i < 16; i++) {
      expect(m[i]).toBeCloseTo(id[i]!, 10);
    }
  });

  it('SP-MATH-007: rotation by PI/2 rotates X to Z', () => {
    const m = mat4RotateY(Math.PI / 2);
    expect(m[0]).toBeCloseTo(0, 5);
    expect(m[2]).toBeCloseTo(-1, 5);
    expect(m[8]).toBeCloseTo(1, 5);
    expect(m[10]).toBeCloseTo(0, 5);
  });
});

describe('mat4Multiply', () => {
  it('SP-MATH-008: identity * M = M', () => {
    const id = mat4Identity();
    const m = mat4RotateX(0.5);
    const result = mat4Multiply(id, m);
    for (let i = 0; i < 16; i++) {
      expect(result[i]).toBeCloseTo(m[i]!, 10);
    }
  });

  it('SP-MATH-009: M * identity = M', () => {
    const id = mat4Identity();
    const m = mat4RotateY(0.7);
    const result = mat4Multiply(m, id);
    for (let i = 0; i < 16; i++) {
      expect(result[i]).toBeCloseTo(m[i]!, 10);
    }
  });
});

describe('mat4Invert', () => {
  it('SP-MATH-010: inverting identity gives identity', () => {
    const id = mat4Identity();
    const inv = mat4Invert(id);
    expect(inv).not.toBeNull();
    for (let i = 0; i < 16; i++) {
      expect(inv![i]).toBeCloseTo(id[i]!, 10);
    }
  });

  it('SP-MATH-011: M * M^-1 = identity', () => {
    const m = mat4RotateY(0.5);
    const inv = mat4Invert(m);
    expect(inv).not.toBeNull();
    const product = mat4Multiply(m, inv!);
    const id = mat4Identity();
    for (let i = 0; i < 16; i++) {
      expect(product[i]).toBeCloseTo(id[i]!, 5);
    }
  });

  it('SP-MATH-012: inverting perspective matrix works', () => {
    const m = mat4Perspective(Math.PI / 3, 16 / 9, 0.1, 100);
    const inv = mat4Invert(m);
    expect(inv).not.toBeNull();
    const product = mat4Multiply(m, inv!);
    const id = mat4Identity();
    for (let i = 0; i < 16; i++) {
      expect(product[i]).toBeCloseTo(id[i]!, 4);
    }
  });

  it('SP-MATH-013: singular matrix returns null', () => {
    const m = new Float32Array(16); // All zeros = singular
    const inv = mat4Invert(m);
    expect(inv).toBeNull();
  });
});

describe('vec3Normalize', () => {
  it('SP-MATH-014: normalizes to unit length', () => {
    const v = vec3Normalize({ x: 3, y: 4, z: 0 });
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    expect(len).toBeCloseTo(1, 10);
    expect(v.x).toBeCloseTo(0.6, 10);
    expect(v.y).toBeCloseTo(0.8, 10);
  });

  it('SP-MATH-015: zero vector returns default direction', () => {
    const v = vec3Normalize({ x: 0, y: 0, z: 0 });
    expect(v.z).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Equirectangular UV mapping tests
// ---------------------------------------------------------------------------

describe('directionToEquirectUV / equirectUVToDirection', () => {
  it('SP-UV-001: forward direction (-Z) maps to center', () => {
    const uv = directionToEquirectUV({ x: 0, y: 0, z: -1 });
    // atan2(-1, 0) = -PI/2, so u = 0.5 + (-PI/2)/(2PI) = 0.5 - 0.25 = 0.25
    expect(uv.u).toBeCloseTo(0.25, 5);
    expect(uv.v).toBeCloseTo(0.5, 5);
  });

  it('SP-UV-002: up direction maps to top', () => {
    const uv = directionToEquirectUV({ x: 0, y: 1, z: 0 });
    expect(uv.v).toBeCloseTo(0, 5); // Top of equirectangular
  });

  it('SP-UV-003: down direction maps to bottom', () => {
    const uv = directionToEquirectUV({ x: 0, y: -1, z: 0 });
    expect(uv.v).toBeCloseTo(1, 5); // Bottom of equirectangular
  });

  it('SP-UV-004: round-trip direction -> UV -> direction preserves direction', () => {
    const original = vec3Normalize({ x: 0.3, y: 0.5, z: -0.8 });
    const uv = directionToEquirectUV(original);
    const recovered = equirectUVToDirection(uv.u, uv.v);

    expect(recovered.x).toBeCloseTo(original.x, 4);
    expect(recovered.y).toBeCloseTo(original.y, 4);
    expect(recovered.z).toBeCloseTo(original.z, 4);
  });

  it('SP-UV-005: round-trip UV -> direction -> UV preserves UV', () => {
    const originalU = 0.3;
    const originalV = 0.7;
    const dir = equirectUVToDirection(originalU, originalV);
    const uv = directionToEquirectUV(dir);

    expect(uv.u).toBeCloseTo(originalU, 4);
    expect(uv.v).toBeCloseTo(originalV, 4);
  });

  it('SP-UV-006: equator directions are at v=0.5', () => {
    for (const dir of [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ]) {
      const uv = directionToEquirectUV(dir);
      expect(uv.v).toBeCloseTo(0.5, 5);
    }
  });
});

// ---------------------------------------------------------------------------
// 360 content detection tests
// ---------------------------------------------------------------------------

describe('detect360Content', () => {
  it('SP-DET-001: explicit isSpherical=true returns true', () => {
    const metadata: SphericalMetadata = { isSpherical: true };
    expect(detect360Content(metadata, 100, 100)).toBe(true);
  });

  it('SP-DET-002: explicit isSpherical=false returns false', () => {
    const metadata: SphericalMetadata = { isSpherical: false };
    expect(detect360Content(metadata, 4096, 2048)).toBe(false);
  });

  it('SP-DET-003: equirectangular projection type returns true', () => {
    const metadata: SphericalMetadata = { projectionType: 'equirectangular' };
    expect(detect360Content(metadata, 100, 100)).toBe(true);
  });

  it('SP-DET-004: 2:1 aspect ratio returns true', () => {
    expect(detect360Content({}, 4096, 2048)).toBe(true);
    expect(detect360Content({}, 8192, 4096)).toBe(true);
  });

  it('SP-DET-005: non-2:1 aspect ratio returns false', () => {
    expect(detect360Content({}, 1920, 1080)).toBe(false);
    expect(detect360Content({}, 1000, 1000)).toBe(false);
  });

  it('SP-DET-006: zero dimensions return false', () => {
    expect(detect360Content({}, 0, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SphericalProjection class tests
// ---------------------------------------------------------------------------

describe('SphericalProjection', () => {
  let sp: SphericalProjection;

  beforeEach(() => {
    sp = new SphericalProjection();
  });

  describe('enable/disable', () => {
    it('SP-CLS-001: starts disabled', () => {
      expect(sp.enabled).toBe(false);
    });

    it('SP-CLS-002: enable sets enabled to true', () => {
      sp.enable();
      expect(sp.enabled).toBe(true);
    });

    it('SP-CLS-003: disable resets state', () => {
      sp.enable();
      sp.setYawPitch(45, 30);
      sp.setFOV(60);
      sp.disable();

      expect(sp.enabled).toBe(false);
      expect(sp.yaw).toBe(0);
      expect(sp.pitch).toBe(0);
      expect(sp.fov).toBe(90);
    });
  });

  describe('setYawPitch', () => {
    it('SP-CLS-004: sets yaw and pitch in radians', () => {
      sp.setYawPitch(90, 45);
      expect(sp.yaw).toBeCloseTo(Math.PI / 2, 5);
      expect(sp.pitch).toBeCloseTo(Math.PI / 4, 5);
    });

    it('SP-CLS-005: clamps pitch to +/- 90 degrees', () => {
      sp.setYawPitch(0, 100);
      expect(sp.pitch).toBeCloseTo(Math.PI / 2, 5);

      sp.setYawPitch(0, -100);
      expect(sp.pitch).toBeCloseTo(-Math.PI / 2, 5);
    });

    it('SP-CLS-006: getYawPitchDegrees returns degrees', () => {
      sp.setYawPitch(45, -30);
      const { yaw, pitch } = sp.getYawPitchDegrees();
      expect(yaw).toBeCloseTo(45, 3);
      expect(pitch).toBeCloseTo(-30, 3);
    });
  });

  describe('setFOV', () => {
    it('SP-CLS-007: sets FOV within valid range', () => {
      sp.setFOV(60);
      expect(sp.fov).toBe(60);
    });

    it('SP-CLS-008: clamps FOV to minimum', () => {
      sp.setFOV(5);
      expect(sp.fov).toBe(20);
    });

    it('SP-CLS-009: clamps FOV to maximum', () => {
      sp.setFOV(200);
      expect(sp.fov).toBe(150);
    });
  });

  describe('mouse drag', () => {
    it('SP-CLS-010: beginDrag starts drag state', () => {
      sp.beginDrag(100, 200);
      expect(sp.isDragging).toBe(true);
    });

    it('SP-CLS-011: drag updates yaw and pitch', () => {
      sp.beginDrag(100, 200);
      sp.drag(200, 250, 800, 600);
      expect(sp.yaw).not.toBe(0);
      expect(sp.pitch).not.toBe(0);
    });

    it('SP-CLS-012: endDrag stops drag state', () => {
      sp.beginDrag(100, 200);
      sp.endDrag();
      expect(sp.isDragging).toBe(false);
    });

    it('SP-CLS-013: drag without beginDrag is a no-op', () => {
      sp.drag(200, 250, 800, 600);
      expect(sp.yaw).toBe(0);
      expect(sp.pitch).toBe(0);
    });

    it('SP-CLS-014: horizontal drag changes yaw, not pitch', () => {
      sp.beginDrag(100, 200);
      sp.drag(200, 200, 800, 600); // Only horizontal movement
      expect(sp.yaw).not.toBe(0);
      expect(sp.pitch).toBe(0);
    });

    it('SP-CLS-015: vertical drag changes pitch', () => {
      sp.beginDrag(100, 200);
      sp.drag(100, 300, 800, 600); // Only vertical movement
      expect(sp.yaw).toBe(0);
      expect(sp.pitch).not.toBe(0);
    });
  });

  describe('handleWheel', () => {
    it('SP-CLS-016: positive delta zooms out (increases FOV)', () => {
      const initialFOV = sp.fov;
      sp.handleWheel(10);
      expect(sp.fov).toBeGreaterThan(initialFOV);
    });

    it('SP-CLS-017: negative delta zooms in (decreases FOV)', () => {
      const initialFOV = sp.fov;
      sp.handleWheel(-10);
      expect(sp.fov).toBeLessThan(initialFOV);
    });

    it('SP-CLS-018: FOV is clamped after extreme scroll', () => {
      sp.handleWheel(10000);
      expect(sp.fov).toBe(150);

      sp.handleWheel(-10000);
      expect(sp.fov).toBe(20);
    });
  });

  describe('getProjectionUniforms', () => {
    it('SP-CLS-019: returns valid uniforms when disabled', () => {
      const u = sp.getProjectionUniforms(800, 600);
      expect(u.u_sphericalEnabled).toBe(0);
      expect(u.u_invViewProj).toBeInstanceOf(Float32Array);
      expect(u.u_invViewProj.length).toBe(16);
    });

    it('SP-CLS-020: returns enabled=1 when enabled', () => {
      sp.enable();
      const u = sp.getProjectionUniforms(800, 600);
      expect(u.u_sphericalEnabled).toBe(1);
    });

    it('SP-CLS-021: aspect ratio is width/height', () => {
      const u = sp.getProjectionUniforms(1920, 1080);
      expect(u.u_aspect).toBeCloseTo(1920 / 1080, 5);
    });

    it('SP-CLS-022: FOV is in radians', () => {
      sp.setFOV(90);
      const u = sp.getProjectionUniforms(800, 600);
      expect(u.u_fov).toBeCloseTo(Math.PI / 2, 5);
    });

    it('SP-CLS-023: yaw and pitch are passed through', () => {
      sp.setYawPitch(45, 30);
      const u = sp.getProjectionUniforms(800, 600);
      expect(u.u_yaw).toBeCloseTo(Math.PI / 4, 5);
      expect(u.u_pitch).toBeCloseTo(Math.PI / 6, 5);
    });
  });

  describe('screenToEquirectUV', () => {
    it('SP-CLS-024: center of screen at default view maps to front', () => {
      sp.enable();
      sp.setYawPitch(0, 0);
      sp.setFOV(90);
      const uv = sp.screenToEquirectUV(0.5, 0.5, 800, 600);
      // Center should map approximately to the forward direction
      // Forward (-Z) maps to u=0.25 in our convention
      expect(uv.u).toBeCloseTo(0.25, 1);
      expect(uv.v).toBeCloseTo(0.5, 1);
    });

    it('SP-CLS-025: different screen positions produce different UVs', () => {
      sp.enable();
      sp.setYawPitch(0, 0);
      const uv1 = sp.screenToEquirectUV(0.2, 0.3, 800, 600);
      const uv2 = sp.screenToEquirectUV(0.8, 0.7, 800, 600);
      expect(uv1.u).not.toBeCloseTo(uv2.u, 2);
      expect(uv1.v).not.toBeCloseTo(uv2.v, 2);
    });

    it('SP-CLS-026: yaw rotation shifts the horizontal UV', () => {
      sp.enable();
      sp.setFOV(90);

      sp.setYawPitch(0, 0);
      const uv1 = sp.screenToEquirectUV(0.5, 0.5, 800, 600);

      sp.setYawPitch(90, 0);
      const uv2 = sp.screenToEquirectUV(0.5, 0.5, 800, 600);

      // 90 degree yaw should shift u by approximately 0.25
      const duWrapped = Math.abs(uv2.u - uv1.u);
      expect(duWrapped).toBeCloseTo(0.25, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Orientation correctness tests (upside-down bug regression)
  // ---------------------------------------------------------------------------

  describe('orientation correctness', () => {
    it('SP-ORI-001: pitch=0 at screen center should map to the equator (v=0.5)', () => {
      sp.enable();
      sp.setYawPitch(0, 0);
      sp.setFOV(90);
      const uv = sp.screenToEquirectUV(0.5, 0.5, 800, 600);
      // The equator of the equirectangular image is at v=0.5
      expect(uv.v).toBeCloseTo(0.5, 2);
    });

    it('SP-ORI-002: top of screen should map to lower v (upper part of equirect image)', () => {
      sp.enable();
      sp.setYawPitch(0, 0);
      sp.setFOV(90);
      const uvTop = sp.screenToEquirectUV(0.5, 0.0, 800, 600);
      const uvCenter = sp.screenToEquirectUV(0.5, 0.5, 800, 600);
      // Top of screen (screenV=0) should look upward, mapping to lower v (north/top of image)
      expect(uvTop.v).toBeLessThan(uvCenter.v);
    });

    it('SP-ORI-003: bottom of screen should map to higher v (lower part of equirect image)', () => {
      sp.enable();
      sp.setYawPitch(0, 0);
      sp.setFOV(90);
      const uvBottom = sp.screenToEquirectUV(0.5, 1.0, 800, 600);
      const uvCenter = sp.screenToEquirectUV(0.5, 0.5, 800, 600);
      // Bottom of screen (screenV=1) should look downward, mapping to higher v (south/bottom)
      expect(uvBottom.v).toBeGreaterThan(uvCenter.v);
    });

    it('SP-ORI-004: positive pitch (looking up) should decrease v at screen center', () => {
      sp.enable();
      sp.setFOV(90);

      sp.setYawPitch(0, 0);
      const uvNeutral = sp.screenToEquirectUV(0.5, 0.5, 800, 600);

      sp.setYawPitch(0, 45);
      const uvLookingUp = sp.screenToEquirectUV(0.5, 0.5, 800, 600);

      // Looking up -> sampling from the sky/north pole -> lower v
      expect(uvLookingUp.v).toBeLessThan(uvNeutral.v);
    });

    it('SP-ORI-005: negative pitch (looking down) should increase v at screen center', () => {
      sp.enable();
      sp.setFOV(90);

      sp.setYawPitch(0, 0);
      const uvNeutral = sp.screenToEquirectUV(0.5, 0.5, 800, 600);

      sp.setYawPitch(0, -45);
      const uvLookingDown = sp.screenToEquirectUV(0.5, 0.5, 800, 600);

      // Looking down -> sampling from the ground/south pole -> higher v
      expect(uvLookingDown.v).toBeGreaterThan(uvNeutral.v);
    });

    it('SP-ORI-006: drag mouse downward should look down (negative pitch)', () => {
      sp.enable();
      sp.setYawPitch(0, 0);

      // Drag mouse downward (positive dy in screen coordinates)
      sp.beginDrag(400, 300);
      sp.drag(400, 400, 800, 600); // moved 100px down
      sp.endDrag();

      // After dragging down, pitch should be negative (looking down)
      expect(sp.pitch).toBeLessThan(0);
    });

    it('SP-ORI-007: drag mouse upward should look up (positive pitch)', () => {
      sp.enable();
      sp.setYawPitch(0, 0);

      // Drag mouse upward (negative dy in screen coordinates)
      sp.beginDrag(400, 300);
      sp.drag(400, 200, 800, 600); // moved 100px up
      sp.endDrag();

      // After dragging up, pitch should be positive (looking up)
      expect(sp.pitch).toBeGreaterThan(0);
    });

    it('SP-ORI-008: vertical screen gradient is monotonic (no flip)', () => {
      sp.enable();
      sp.setYawPitch(0, 0);
      sp.setFOV(90);

      // Sample v values from top to bottom of screen
      const vValues: number[] = [];
      for (let screenV = 0; screenV <= 1; screenV += 0.1) {
        const uv = sp.screenToEquirectUV(0.5, screenV, 800, 600);
        vValues.push(uv.v);
      }

      // v values should be monotonically increasing (top of screen -> small v, bottom -> large v)
      for (let i = 1; i < vValues.length; i++) {
        expect(vValues[i]!).toBeGreaterThan(vValues[i - 1]!);
      }
    });
  });
});
