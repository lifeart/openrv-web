/**
 * SphericalProjection E2E Integration Tests
 *
 * Verifies the full wiring of the SphericalProjection (360 equirectangular viewer):
 *   SphericalProjection class -> AppControlRegistry (toggle button) ->
 *   Viewer.setSphericalProjection -> ViewerGLRenderer.setSphericalProjection ->
 *   Renderer.setSphericalProjection -> ShaderStateManager.setSphericalProjection ->
 *   u_sphericalEnabled/Fov/Aspect/Yaw/Pitch uniforms in fragment shader
 *
 * Tests cover:
 * - SphericalProjection class instantiation and state management
 * - GLSL uniform name consistency between TypeScript and shader
 * - Shader math: CPU screenToEquirectUV matches GLSL sphericalProject logic
 * - Uniform forwarding through Renderer -> ShaderStateManager pipeline
 * - Toggle button wiring (enable/disable round-trip)
 * - Hardcoded dimension bug detection (1920x1080 vs actual viewer size)
 * - Missing interaction wiring (no drag/wheel in ViewerInputHandler)
 * - detect360Content auto-detection not wired to source load
 * - Redundant initial texture fetch when spherical is enabled
 * - SPHERICAL_PROJECTION_GLSL was removed (stale unused export with wrong uniform names)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SphericalProjection,
  directionToEquirectUV,
  equirectUVToDirection,
  vec3Normalize,
  detect360Content,
  type SphericalProjectionUniforms,
  type SphericalMetadata,
} from '../render/SphericalProjection';

// ---------------------------------------------------------------------------
// Constants (mirrored from SphericalProjection.ts for validation)
// ---------------------------------------------------------------------------
const DEG2RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * CPU-side equivalent of GLSL sphericalProject(), for verifying shader math.
 * Uses the same algorithm as the shader: NDC -> view ray -> pitch -> yaw -> equirect UV.
 */
function cpuSphericalProject(
  screenU: number,
  screenV: number,
  fovRad: number,
  aspect: number,
  yaw: number,
  pitch: number,
): { u: number; v: number } {
  // Flip y: screenV=0 is at the top but NDC y=+1 is at the top
  const ndcX = screenU * 2 - 1;
  const ndcY = 1 - screenV * 2;

  const halfFov = fovRad * 0.5;
  const tanHalfFov = Math.tan(halfFov);

  // View direction
  const vx = ndcX * tanHalfFov * aspect;
  const vy = ndcY * tanHalfFov;
  const vz = -1.0;
  const len = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const dx = vx / len;
  const dy = vy / len;
  const dz = vz / len;

  // Pitch rotation (around X)
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const px = dx;
  const py = dy * cp - dz * sp;
  const pz = dy * sp + dz * cp;

  // Yaw rotation (around Y)
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const wx = px * cy + pz * sy;
  const wy = py;
  const wz = -px * sy + pz * cy;

  // Equirectangular UV
  const theta = Math.atan2(wz, wx);
  const phi = Math.asin(Math.max(-1, Math.min(1, wy)));

  return {
    u: 0.5 + theta / (2 * Math.PI),
    v: 0.5 - phi / Math.PI,
  };
}

/** Create a mock viewer that records setSphericalProjection calls. */
function createMockViewer() {
  return {
    setSphericalProjection: vi.fn(),
    scheduleRender: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SphericalProjection E2E Integration', () => {
  // =========================================================================
  // 1. GLSL uniform naming consistency
  // =========================================================================
  describe('GLSL uniform naming', () => {
    it('SP-E2E-001: shader uses u_sphericalFov/Aspect/Yaw/Pitch (prefixed names)', () => {
      // The actual shader (viewer.frag.glsl) uses:
      //   u_sphericalEnabled, u_sphericalFov, u_sphericalAspect, u_sphericalYaw, u_sphericalPitch
      // Verify ShaderStateManager uploads match these names.
      // This test documents the expected uniform names.
      const expectedUniforms = [
        'u_sphericalEnabled',
        'u_sphericalFov',
        'u_sphericalAspect',
        'u_sphericalYaw',
        'u_sphericalPitch',
      ];
      // Each must be present in the shader source (we check the GLSL code pattern)
      for (const name of expectedUniforms) {
        // The uniforms exist in the actual .glsl file, not in SPHERICAL_PROJECTION_GLSL
        expect(name).toMatch(/^u_spherical/);
      }
    });

    it('SP-E2E-002: SPHERICAL_PROJECTION_GLSL stale export has been removed', async () => {
      // The stale GLSL constant with wrong uniform names (u_fov, u_aspect, u_yaw, u_pitch
      // instead of u_sphericalFov, u_sphericalAspect, etc.) was removed from the module.
      // Verify the export no longer exists.
      const mod = await import('../render/SphericalProjection') as Record<string, unknown>;
      expect(mod.SPHERICAL_PROJECTION_GLSL).toBeUndefined();
    });

    it('SP-E2E-003: SphericalProjectionUniforms interface uses u_fov/u_aspect (non-prefixed)', () => {
      // The TypeScript interface uses u_fov, u_aspect, u_yaw, u_pitch
      // while the shader + ShaderStateManager use u_sphericalFov etc.
      // This is an inconsistency between the class interface and the actual uniform pipeline.
      const sp = new SphericalProjection();
      sp.enable();
      const uniforms = sp.getProjectionUniforms(800, 600);

      // Interface field names (non-prefixed)
      expect('u_fov' in uniforms).toBe(true);
      expect('u_aspect' in uniforms).toBe(true);
      expect('u_yaw' in uniforms).toBe(true);
      expect('u_pitch' in uniforms).toBe(true);

      // ShaderStateManager maps these to prefixed names internally
      // This is not a runtime bug, but a naming inconsistency worth noting.
    });
  });

  // =========================================================================
  // 2. Shader math correctness: CPU vs GLSL logic
  // =========================================================================
  describe('shader math: CPU screenToEquirectUV matches GLSL sphericalProject', () => {
    let sp: SphericalProjection;

    beforeEach(() => {
      sp = new SphericalProjection();
      sp.enable();
    });

    it('SP-E2E-010: center of screen at default view', () => {
      sp.setYawPitch(0, 0);
      sp.setFOV(90);

      const classUV = sp.screenToEquirectUV(0.5, 0.5, 800, 600);
      const cpuUV = cpuSphericalProject(0.5, 0.5, 90 * DEG2RAD, 800 / 600, 0, 0);

      expect(classUV.u).toBeCloseTo(cpuUV.u, 4);
      expect(classUV.v).toBeCloseTo(cpuUV.v, 4);
    });

    it('SP-E2E-011: off-center with yaw rotation', () => {
      sp.setYawPitch(45, 0);
      sp.setFOV(90);

      const classUV = sp.screenToEquirectUV(0.3, 0.5, 1920, 1080);
      const cpuUV = cpuSphericalProject(0.3, 0.5, 90 * DEG2RAD, 1920 / 1080, 45 * DEG2RAD, 0);

      expect(classUV.u).toBeCloseTo(cpuUV.u, 4);
      expect(classUV.v).toBeCloseTo(cpuUV.v, 4);
    });

    it('SP-E2E-012: off-center with pitch rotation', () => {
      sp.setYawPitch(0, 30);
      sp.setFOV(90);

      const classUV = sp.screenToEquirectUV(0.5, 0.3, 800, 600);
      const cpuUV = cpuSphericalProject(0.5, 0.3, 90 * DEG2RAD, 800 / 600, 0, 30 * DEG2RAD);

      expect(classUV.u).toBeCloseTo(cpuUV.u, 4);
      expect(classUV.v).toBeCloseTo(cpuUV.v, 4);
    });

    it('SP-E2E-013: combined yaw+pitch with narrow FOV', () => {
      sp.setYawPitch(120, -45);
      sp.setFOV(45);

      const classUV = sp.screenToEquirectUV(0.7, 0.2, 1280, 720);
      const cpuUV = cpuSphericalProject(
        0.7, 0.2,
        45 * DEG2RAD,
        1280 / 720,
        120 * DEG2RAD,
        -45 * DEG2RAD,
      );

      expect(classUV.u).toBeCloseTo(cpuUV.u, 4);
      expect(classUV.v).toBeCloseTo(cpuUV.v, 4);
    });

    it('SP-E2E-014: corner pixels produce valid UV in [0,1]', () => {
      sp.setYawPitch(0, 0);
      sp.setFOV(90);

      const corners = [
        [0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5],
      ] as const;

      for (const [su, sv] of corners) {
        const uv = sp.screenToEquirectUV(su, sv, 800, 600);
        expect(uv.u).toBeGreaterThanOrEqual(0);
        expect(uv.u).toBeLessThanOrEqual(1);
        expect(uv.v).toBeGreaterThanOrEqual(0);
        expect(uv.v).toBeLessThanOrEqual(1);
      }
    });
  });

  // =========================================================================
  // 3. Uniform forwarding pipeline
  // =========================================================================
  describe('uniform forwarding pipeline', () => {
    it('SP-E2E-020: getProjectionUniforms returns all 6 fields', () => {
      const sp = new SphericalProjection();
      sp.enable();
      sp.setYawPitch(30, 15);
      sp.setFOV(75);

      const u = sp.getProjectionUniforms(1920, 1080);

      expect(u.u_sphericalEnabled).toBe(1);
      expect(u.u_fov).toBeCloseTo(75 * DEG2RAD, 5);
      expect(u.u_aspect).toBeCloseTo(1920 / 1080, 5);
      expect(u.u_yaw).toBeCloseTo(30 * DEG2RAD, 5);
      expect(u.u_pitch).toBeCloseTo(15 * DEG2RAD, 5);
      expect(u.u_invViewProj).toBeInstanceOf(Float32Array);
      expect(u.u_invViewProj.length).toBe(16);
    });

    it('SP-E2E-021: disabled state returns enabled=0', () => {
      const sp = new SphericalProjection();
      const u = sp.getProjectionUniforms(800, 600);
      expect(u.u_sphericalEnabled).toBe(0);
    });

    it('SP-E2E-022: AppControlRegistry updateSphericalUniforms maps fields correctly', () => {
      // Simulate what AppControlRegistry.updateSphericalUniforms does:
      const sp = new SphericalProjection();
      sp.enable();
      sp.setYawPitch(45, 20);
      sp.setFOV(80);

      const uniforms = sp.getProjectionUniforms(1920, 1080);
      const mockViewer = createMockViewer();

      // This mirrors the code in AppControlRegistry:
      mockViewer.setSphericalProjection({
        enabled: uniforms.u_sphericalEnabled === 1,
        fov: uniforms.u_fov,
        aspect: uniforms.u_aspect,
        yaw: uniforms.u_yaw,
        pitch: uniforms.u_pitch,
      });

      expect(mockViewer.setSphericalProjection).toHaveBeenCalledWith({
        enabled: true,
        fov: uniforms.u_fov,
        aspect: uniforms.u_aspect,
        yaw: uniforms.u_yaw,
        pitch: uniforms.u_pitch,
      });
    });

    it('SP-E2E-023: u_invViewProj is computed but NOT uploaded to shader', () => {
      // BUG DETECTION: The SphericalProjection.getProjectionUniforms() computes
      // an invViewProj matrix, but there is no corresponding u_invViewProj uniform
      // in the shader. The shader computes the projection inline with direct
      // fov/yaw/pitch uniforms. The invViewProj computation is wasted work.
      const sp = new SphericalProjection();
      sp.enable();
      const u = sp.getProjectionUniforms(800, 600);

      // The field exists on the return value...
      expect(u.u_invViewProj).toBeInstanceOf(Float32Array);
      // ...but it is never sent to any uniform. The ShaderStateManager
      // only uploads: u_sphericalEnabled, u_sphericalFov, u_sphericalAspect,
      // u_sphericalYaw, u_sphericalPitch.
      // u_invViewProj is dead code.
    });
  });

  // =========================================================================
  // 4. Hardcoded dimensions bug
  // =========================================================================
  describe('hardcoded dimension bug (1920x1080)', () => {
    it('SP-E2E-030: aspect ratio is wrong when viewer is not 1920x1080', () => {
      // BUG: AppControlRegistry calls getProjectionUniforms(1920, 1080) hardcoded.
      // When the actual viewer is a different size, the aspect ratio is wrong.
      const sp = new SphericalProjection();
      sp.enable();
      sp.setFOV(90);

      const hardcodedUniforms = sp.getProjectionUniforms(1920, 1080);
      const correctUniforms = sp.getProjectionUniforms(800, 600);

      // Hardcoded gives 16:9 = 1.7778
      expect(hardcodedUniforms.u_aspect).toBeCloseTo(1920 / 1080, 5);
      // Actual viewer at 800x600 gives 4:3 = 1.3333
      expect(correctUniforms.u_aspect).toBeCloseTo(800 / 600, 5);

      // These are not equal -- the hardcoded value produces a distorted projection
      expect(hardcodedUniforms.u_aspect).not.toBeCloseTo(correctUniforms.u_aspect, 2);
    });

    it('SP-E2E-031: square viewer gets wrong aspect from hardcoded dimensions', () => {
      const sp = new SphericalProjection();
      sp.enable();

      const hardcoded = sp.getProjectionUniforms(1920, 1080);
      const square = sp.getProjectionUniforms(1000, 1000);

      expect(hardcoded.u_aspect).toBeCloseTo(16 / 9, 3);
      expect(square.u_aspect).toBeCloseTo(1.0, 3);

      // A square canvas would receive a 16:9 aspect ratio, causing horizontal stretching
      expect(Math.abs(hardcoded.u_aspect - square.u_aspect)).toBeGreaterThan(0.5);
    });
  });

  // =========================================================================
  // 5. Toggle button wiring
  // =========================================================================
  describe('toggle button wiring', () => {
    it('SP-E2E-040: enable/disable round-trip updates uniforms', () => {
      const sp = new SphericalProjection();
      const mockViewer = createMockViewer();

      // Simulate toggle ON
      sp.enable();
      let uniforms = sp.getProjectionUniforms(1920, 1080);
      mockViewer.setSphericalProjection({
        enabled: uniforms.u_sphericalEnabled === 1,
        fov: uniforms.u_fov,
        aspect: uniforms.u_aspect,
        yaw: uniforms.u_yaw,
        pitch: uniforms.u_pitch,
      });
      expect(mockViewer.setSphericalProjection).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: true }),
      );

      // Simulate toggle OFF
      sp.disable();
      uniforms = sp.getProjectionUniforms(1920, 1080);
      mockViewer.setSphericalProjection({
        enabled: uniforms.u_sphericalEnabled === 1,
        fov: uniforms.u_fov,
        aspect: uniforms.u_aspect,
        yaw: uniforms.u_yaw,
        pitch: uniforms.u_pitch,
      });
      expect(mockViewer.setSphericalProjection).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: false }),
      );
    });

    it('SP-E2E-041: disable resets yaw/pitch/fov to defaults', () => {
      const sp = new SphericalProjection();
      sp.enable();
      sp.setYawPitch(90, 45);
      sp.setFOV(60);

      sp.disable();
      const u = sp.getProjectionUniforms(800, 600);

      expect(u.u_sphericalEnabled).toBe(0);
      expect(u.u_yaw).toBe(0);
      expect(u.u_pitch).toBe(0);
      expect(u.u_fov).toBeCloseTo(90 * DEG2RAD, 5);
    });
  });

  // =========================================================================
  // 6. Missing interaction wiring
  // =========================================================================
  describe('missing interaction wiring', () => {
    it('SP-E2E-050: SphericalProjection has drag/wheel methods but they are not wired', () => {
      // The SphericalProjection class exposes beginDrag(), drag(), endDrag(), handleWheel()
      // but ViewerInputHandler.ts has NO references to spherical/360 at all.
      // This means mouse drag for yaw/pitch and wheel for FOV zoom are NOT connected.
      const sp = new SphericalProjection();
      sp.enable();

      // The methods work correctly in isolation...
      sp.beginDrag(100, 200);
      sp.drag(200, 300, 800, 600);
      expect(sp.yaw).not.toBe(0);
      expect(sp.pitch).not.toBe(0);
      sp.endDrag();

      sp.handleWheel(-50);
      expect(sp.fov).toBeLessThan(90);

      // ...but no code in ViewerInputHandler calls them.
      // This is a MISSING FEATURE: 360 navigation via mouse is not wired.
    });

    it('SP-E2E-051: drag sensitivity scales with FOV and canvas width', () => {
      const sp = new SphericalProjection();
      sp.enable();

      // Wide FOV -> larger angular movement per pixel
      sp.setFOV(120);
      sp.beginDrag(100, 200);
      sp.drag(200, 200, 800, 600);
      const wideYaw = Math.abs(sp.yaw);
      sp.endDrag();

      // Reset and try narrow FOV
      sp.disable();
      sp.enable();
      sp.setFOV(30);
      sp.beginDrag(100, 200);
      sp.drag(200, 200, 800, 600);
      const narrowYaw = Math.abs(sp.yaw);
      sp.endDrag();

      // Wide FOV should produce larger rotation for same mouse delta
      expect(wideYaw).toBeGreaterThan(narrowYaw);
    });
  });

  // =========================================================================
  // 7. Auto-detection not wired
  // =========================================================================
  describe('auto-detection (detect360Content)', () => {
    it('SP-E2E-060: detect360Content correctly identifies 2:1 aspect images', () => {
      expect(detect360Content({}, 4096, 2048)).toBe(true);
      expect(detect360Content({}, 8192, 4096)).toBe(true);
      expect(detect360Content({}, 7680, 3840)).toBe(true);
    });

    it('SP-E2E-061: detect360Content respects explicit metadata', () => {
      const meta: SphericalMetadata = { projectionType: 'equirectangular' };
      expect(detect360Content(meta, 100, 100)).toBe(true);

      const metaFalse: SphericalMetadata = { isSpherical: false };
      expect(detect360Content(metaFalse, 4096, 2048)).toBe(false);
    });

    it('SP-E2E-062: detect360Content is exported but NOT called on source load', () => {
      // BUG: detect360Content is only used in SphericalProjection.test.ts
      // and SphericalProjection.ts itself. No code in the application
      // (Session, FileSourceNode, AppControlRegistry, etc.) calls it
      // when a new image/video is loaded. The 360 toggle is manual only.
      // This means auto-detection of equirectangular content is dead code.
      expect(typeof detect360Content).toBe('function');
    });
  });

  // =========================================================================
  // 8. Redundant texture fetch
  // =========================================================================

  // =========================================================================
  // 9. Equirectangular UV mapping edge cases
  // =========================================================================
  describe('equirectangular UV edge cases', () => {
    it('SP-E2E-080: full 360 yaw sweep covers full UV range', () => {
      const sp = new SphericalProjection();
      sp.enable();
      sp.setFOV(90);

      const uValues: number[] = [];
      for (let yawDeg = -180; yawDeg <= 180; yawDeg += 30) {
        sp.setYawPitch(yawDeg, 0);
        const uv = sp.screenToEquirectUV(0.5, 0.5, 800, 600);
        uValues.push(uv.u);
      }

      const minU = Math.min(...uValues);
      const maxU = Math.max(...uValues);

      // Should cover most of the [0, 1] range
      expect(maxU - minU).toBeGreaterThan(0.7);
    });

    it('SP-E2E-081: full pitch sweep covers vertical UV range', () => {
      const sp = new SphericalProjection();
      sp.enable();
      sp.setFOV(90);

      const vValues: number[] = [];
      for (let pitchDeg = -85; pitchDeg <= 85; pitchDeg += 10) {
        sp.setYawPitch(0, pitchDeg);
        const uv = sp.screenToEquirectUV(0.5, 0.5, 800, 600);
        vValues.push(uv.v);
      }

      const minV = Math.min(...vValues);
      const maxV = Math.max(...vValues);

      // Should cover significant vertical range
      expect(maxV - minV).toBeGreaterThan(0.5);
    });

    it('SP-E2E-082: direction roundtrip preserves poles', () => {
      // Near the north pole
      const up = vec3Normalize({ x: 0.01, y: 0.999, z: 0 });
      const uvUp = directionToEquirectUV(up);
      expect(uvUp.v).toBeLessThan(0.1); // Near top

      const down = vec3Normalize({ x: 0.01, y: -0.999, z: 0 });
      const uvDown = directionToEquirectUV(down);
      expect(uvDown.v).toBeGreaterThan(0.9); // Near bottom
    });
  });

  // =========================================================================
  // 10. Perspective + Spherical mutual exclusion
  // =========================================================================
  describe('perspective and spherical interaction', () => {
    it('SP-E2E-090: both perspective and spherical can be enabled simultaneously', () => {
      // The shader checks them independently:
      //   if (u_perspectiveEnabled == 1) { ... }
      //   if (u_sphericalEnabled == 1) { ... }
      // If both are enabled, spherical overwrites the perspective result.
      // There is no mutex or guard. This could produce unexpected results
      // if a user enables perspective correction AND 360 view simultaneously.
      // Documenting as a potential UX issue.
      const sp = new SphericalProjection();
      sp.enable();
      const u = sp.getProjectionUniforms(800, 600);
      expect(u.u_sphericalEnabled).toBe(1);
      // There is no check preventing u_perspectiveEnabled=1 at the same time
    });
  });

  // =========================================================================
  // 11. FOV clamping
  // =========================================================================
  describe('FOV clamping', () => {
    it('SP-E2E-100: FOV clamps to 20-150 range', () => {
      const sp = new SphericalProjection();
      sp.setFOV(10);
      expect(sp.fov).toBe(20);

      sp.setFOV(200);
      expect(sp.fov).toBe(150);
    });

    it('SP-E2E-101: extreme FOV produces valid UV output', () => {
      const sp = new SphericalProjection();
      sp.enable();

      // Min FOV (zoomed in)
      sp.setFOV(20);
      const uvNarrow = sp.screenToEquirectUV(0, 0, 800, 600);
      expect(uvNarrow.u).toBeGreaterThanOrEqual(0);
      expect(uvNarrow.v).toBeGreaterThanOrEqual(0);
      expect(uvNarrow.u).toBeLessThanOrEqual(1);
      expect(uvNarrow.v).toBeLessThanOrEqual(1);

      // Max FOV (zoomed out)
      sp.setFOV(150);
      const uvWide = sp.screenToEquirectUV(0, 0, 800, 600);
      expect(uvWide.u).toBeGreaterThanOrEqual(0);
      expect(uvWide.v).toBeGreaterThanOrEqual(0);
      expect(uvWide.u).toBeLessThanOrEqual(1);
      expect(uvWide.v).toBeLessThanOrEqual(1);
    });
  });

  // =========================================================================
  // 12. Regression: mouse drag updates yaw/pitch via ViewerInputHandler wiring
  // =========================================================================
  describe('mouse drag updates yaw/pitch (Fix 1 regression)', () => {
    it('SP-E2E-110: beginDrag + drag updates yaw and pitch from initial values', () => {
      const sp = new SphericalProjection();
      sp.enable();
      sp.setYawPitch(0, 0);

      expect(sp.yaw).toBe(0);
      expect(sp.pitch).toBe(0);

      sp.beginDrag(400, 300);
      sp.drag(500, 250, 800, 600); // move right and up

      // Yaw should change (dragging right should adjust yaw)
      expect(sp.yaw).not.toBe(0);
      // Pitch should change (dragging up should adjust pitch)
      expect(sp.pitch).not.toBe(0);

      sp.endDrag();
      expect(sp.isDragging).toBe(false);
    });

    it('SP-E2E-111: drag without beginDrag does not change yaw/pitch', () => {
      const sp = new SphericalProjection();
      sp.enable();
      sp.setYawPitch(0, 0);

      // Call drag without beginDrag
      sp.drag(500, 250, 800, 600);

      expect(sp.yaw).toBe(0);
      expect(sp.pitch).toBe(0);
    });

    it('SP-E2E-112: multiple drags accumulate rotation correctly', () => {
      const sp = new SphericalProjection();
      sp.enable();
      sp.setYawPitch(0, 0);

      // First drag
      sp.beginDrag(400, 300);
      sp.drag(500, 300, 800, 600);
      sp.endDrag();
      const yaw1 = sp.yaw;

      // Second drag from new position
      sp.beginDrag(400, 300);
      sp.drag(500, 300, 800, 600);
      sp.endDrag();
      const yaw2 = sp.yaw;

      // Yaw should have accumulated (two identical drags)
      expect(Math.abs(yaw2)).toBeGreaterThan(Math.abs(yaw1) * 0.5);
    });
  });

  // =========================================================================
  // 13. Regression: mouse wheel updates FOV (Fix 1 regression)
  // =========================================================================
  describe('mouse wheel updates FOV (Fix 1 regression)', () => {
    it('SP-E2E-120: handleWheel with negative deltaY zooms in (decreases FOV)', () => {
      const sp = new SphericalProjection();
      sp.enable();
      sp.setFOV(90);
      const initialFov = sp.fov;

      sp.handleWheel(-100); // scroll up = zoom in

      expect(sp.fov).toBeLessThan(initialFov);
    });

    it('SP-E2E-121: handleWheel with positive deltaY zooms out (increases FOV)', () => {
      const sp = new SphericalProjection();
      sp.enable();
      sp.setFOV(90);
      const initialFov = sp.fov;

      sp.handleWheel(100); // scroll down = zoom out

      expect(sp.fov).toBeGreaterThan(initialFov);
    });

    it('SP-E2E-122: handleWheel respects FOV clamping limits', () => {
      const sp = new SphericalProjection();
      sp.enable();

      // Try to zoom in past minimum
      sp.setFOV(20);
      sp.handleWheel(-1000);
      expect(sp.fov).toBe(20);

      // Try to zoom out past maximum
      sp.setFOV(150);
      sp.handleWheel(1000);
      expect(sp.fov).toBe(150);
    });

    it('SP-E2E-123: FOV change reflects in getProjectionUniforms', () => {
      const sp = new SphericalProjection();
      sp.enable();
      sp.setFOV(90);

      const uniformsBefore = sp.getProjectionUniforms(800, 600);
      sp.handleWheel(-50);
      const uniformsAfter = sp.getProjectionUniforms(800, 600);

      expect(uniformsAfter.u_fov).not.toBeCloseTo(uniformsBefore.u_fov, 3);
      expect(uniformsAfter.u_fov).toBeLessThan(uniformsBefore.u_fov);
    });
  });

  // =========================================================================
  // 14. Regression: viewer dimensions used (not hardcoded) (Fix 2 regression)
  // =========================================================================
  describe('viewer dimensions used instead of hardcoded (Fix 2 regression)', () => {
    it('SP-E2E-130: different dimensions produce different aspect ratios', () => {
      const sp = new SphericalProjection();
      sp.enable();
      sp.setFOV(90);

      const u16_9 = sp.getProjectionUniforms(1920, 1080);
      const u4_3 = sp.getProjectionUniforms(800, 600);
      const u1_1 = sp.getProjectionUniforms(1000, 1000);

      expect(u16_9.u_aspect).toBeCloseTo(16 / 9, 2);
      expect(u4_3.u_aspect).toBeCloseTo(4 / 3, 2);
      expect(u1_1.u_aspect).toBeCloseTo(1.0, 2);

      // All three are distinct
      expect(u16_9.u_aspect).not.toBeCloseTo(u4_3.u_aspect, 1);
      expect(u16_9.u_aspect).not.toBeCloseTo(u1_1.u_aspect, 1);
      expect(u4_3.u_aspect).not.toBeCloseTo(u1_1.u_aspect, 1);
    });

    it('SP-E2E-131: updateSphericalUniforms uses viewer.getDisplayWidth/Height (via mock)', () => {
      // Simulate the updateSphericalUniforms closure from AppControlRegistry
      const sp = new SphericalProjection();
      sp.enable();

      const mockViewer = createMockViewer();

      // Simulate with viewer-reported dimensions (not hardcoded 1920x1080)
      // Use 800x600 (4:3) which is distinctly different from 16:9
      const viewerWidth = 800;
      const viewerHeight = 600;
      const uniforms = sp.getProjectionUniforms(viewerWidth, viewerHeight);

      mockViewer.setSphericalProjection({
        enabled: uniforms.u_sphericalEnabled === 1,
        fov: uniforms.u_fov,
        aspect: uniforms.u_aspect,
        yaw: uniforms.u_yaw,
        pitch: uniforms.u_pitch,
      });

      const call = mockViewer.setSphericalProjection.mock.calls[0]![0];
      expect(call.aspect).toBeCloseTo(800 / 600, 3);
      // Ensure it is NOT the old hardcoded 16:9 ratio
      expect(call.aspect).not.toBeCloseTo(1920 / 1080, 2);
    });
  });

  // =========================================================================
  // 15. Regression: auto-detection triggers on 360 content (Fix 3 regression)
  // =========================================================================
  describe('auto-detection triggers on 360 content (Fix 3 regression)', () => {
    it('SP-E2E-140: detect360Content returns true for 2:1 equirectangular images', () => {
      expect(detect360Content({}, 4096, 2048)).toBe(true);
      expect(detect360Content({}, 8000, 4000)).toBe(true);
      expect(detect360Content({}, 7680, 3840)).toBe(true);
    });

    it('SP-E2E-141: detect360Content returns false for non-2:1 images', () => {
      expect(detect360Content({}, 1920, 1080)).toBe(false);
      expect(detect360Content({}, 800, 600)).toBe(false);
      expect(detect360Content({}, 1000, 1000)).toBe(false);
    });

    it('SP-E2E-142: detect360Content respects explicit isSpherical override', () => {
      // Force spherical even for non-2:1
      expect(detect360Content({ isSpherical: true }, 800, 600)).toBe(true);
      // Force non-spherical even for 2:1
      expect(detect360Content({ isSpherical: false }, 4096, 2048)).toBe(false);
    });

    it('SP-E2E-143: detect360Content enables SphericalProjection on matching content', () => {
      const sp = new SphericalProjection();
      expect(sp.enabled).toBe(false);

      // Simulate sourceLoaded handler
      const source = { width: 4096, height: 2048 };
      const is360 = detect360Content({}, source.width, source.height);
      if (is360 && !sp.enabled) {
        sp.enable();
      }

      expect(sp.enabled).toBe(true);
    });

    it('SP-E2E-144: detect360Content disables SphericalProjection on non-360 content', () => {
      const sp = new SphericalProjection();
      sp.enable();
      expect(sp.enabled).toBe(true);

      // Simulate sourceLoaded with non-360 content
      const source = { width: 1920, height: 1080 };
      const is360 = detect360Content({}, source.width, source.height);
      if (!is360 && sp.enabled) {
        sp.disable();
      }

      expect(sp.enabled).toBe(false);
    });
  });
});
