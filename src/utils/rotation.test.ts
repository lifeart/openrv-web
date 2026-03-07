/**
 * Rotation Utility Tests
 *
 * Comprehensive tests for normalizeAngle, snapAngle, isCardinalAngle,
 * and getRotationMatrix2x2 functions.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeAngle,
  snapAngle,
  isCardinalAngle,
  getRotationMatrix2x2,
  DEFAULT_SNAP_TARGETS,
  DEFAULT_SNAP_THRESHOLD,
} from './rotation';

describe('normalizeAngle', () => {
  it('ROT-001: normalizes 0 to 0', () => {
    expect(normalizeAngle(0)).toBe(0);
  });

  it('ROT-002: normalizes 90 to 90', () => {
    expect(normalizeAngle(90)).toBe(90);
  });

  it('ROT-003: normalizes 180 to 180', () => {
    expect(normalizeAngle(180)).toBe(180);
  });

  it('ROT-004: normalizes 270 to 270', () => {
    expect(normalizeAngle(270)).toBe(270);
  });

  it('ROT-005: normalizes 360 to 0', () => {
    expect(normalizeAngle(360)).toBe(0);
  });

  it('ROT-006: normalizes 450 to 90', () => {
    expect(normalizeAngle(450)).toBe(90);
  });

  it('ROT-007: normalizes 720 to 0', () => {
    expect(normalizeAngle(720)).toBe(0);
  });

  it('ROT-008: normalizes -90 to 270', () => {
    expect(normalizeAngle(-90)).toBe(270);
  });

  it('ROT-009: normalizes -180 to 180', () => {
    expect(normalizeAngle(-180)).toBe(180);
  });

  it('ROT-010: normalizes -270 to 90', () => {
    expect(normalizeAngle(-270)).toBe(90);
  });

  it('ROT-011: normalizes -360 to 0', () => {
    expect(normalizeAngle(-360)).toBe(0);
  });

  it('ROT-012: normalizes -450 to 270', () => {
    expect(normalizeAngle(-450)).toBe(270);
  });

  it('ROT-013: normalizes 45 to 45', () => {
    expect(normalizeAngle(45)).toBe(45);
  });

  it('ROT-014: normalizes 37.5 to 37.5', () => {
    expect(normalizeAngle(37.5)).toBe(37.5);
  });

  it('ROT-015: normalizes 359.9 to 359.9', () => {
    expect(normalizeAngle(359.9)).toBeCloseTo(359.9, 5);
  });

  it('ROT-016: normalizes NaN to 0', () => {
    expect(normalizeAngle(NaN)).toBe(0);
  });

  it('ROT-017: normalizes Infinity to 0', () => {
    expect(normalizeAngle(Infinity)).toBe(0);
  });

  it('ROT-018: normalizes -Infinity to 0', () => {
    expect(normalizeAngle(-Infinity)).toBe(0);
  });

  it('ROT-019: normalizes very small positive angle', () => {
    expect(normalizeAngle(0.001)).toBeCloseTo(0.001, 5);
  });

  it('ROT-020: normalizes very large angle', () => {
    expect(normalizeAngle(3600)).toBe(0);
  });

  it('ROT-021: normalizes -0 to 0', () => {
    expect(normalizeAngle(-0)).toBe(0);
  });
});

describe('snapAngle', () => {
  it('ROT-022: snaps 2 to 0 (within threshold)', () => {
    expect(snapAngle(2)).toBe(0);
  });

  it('ROT-023: snaps 358 to 0 (within threshold, wrapping)', () => {
    expect(snapAngle(358)).toBe(0);
  });

  it('ROT-024: snaps 88 to 90', () => {
    expect(snapAngle(88)).toBe(90);
  });

  it('ROT-025: snaps 93 to 90', () => {
    expect(snapAngle(93)).toBe(90);
  });

  it('ROT-026: snaps 177 to 180', () => {
    expect(snapAngle(177)).toBe(180);
  });

  it('ROT-027: snaps 183 to 180', () => {
    expect(snapAngle(183)).toBe(180);
  });

  it('ROT-028: snaps 268 to 270', () => {
    expect(snapAngle(268)).toBe(270);
  });

  it('ROT-029: snaps 273 to 270', () => {
    expect(snapAngle(273)).toBe(270);
  });

  it('ROT-030: snaps 43 to 45', () => {
    expect(snapAngle(43)).toBe(45);
  });

  it('ROT-031: snaps 47 to 45', () => {
    expect(snapAngle(47)).toBe(45);
  });

  it('ROT-032: does not snap 10 (outside threshold)', () => {
    expect(snapAngle(10)).toBe(10);
  });

  it('ROT-033: does not snap 37 (outside threshold)', () => {
    expect(snapAngle(37)).toBe(37);
  });

  it('ROT-034: snaps exactly at threshold boundary (5 degrees)', () => {
    expect(snapAngle(5)).toBe(0);
  });

  it('ROT-035: does not snap at 6 degrees from target', () => {
    expect(snapAngle(6)).toBe(6);
  });

  it('ROT-036: snaps 315+4=319 to 315', () => {
    expect(snapAngle(319)).toBe(315);
  });

  it('ROT-037: snaps 135+3=138 to 135', () => {
    expect(snapAngle(138)).toBe(135);
  });

  it('ROT-038: snaps 225-2=223 to 225', () => {
    expect(snapAngle(223)).toBe(225);
  });

  it('ROT-039: custom threshold of 10', () => {
    expect(snapAngle(10, 10)).toBe(0);
  });

  it('ROT-040: custom threshold of 0 means no snapping', () => {
    expect(snapAngle(2, 0)).toBe(2);
  });

  it('ROT-041: custom snap targets', () => {
    expect(snapAngle(14, 5, [0, 15, 30])).toBe(15);
  });

  it('ROT-042: snap with negative input normalizes first', () => {
    expect(snapAngle(-2)).toBe(0);
  });

  it('ROT-043: snap 360+ values work (normalize first)', () => {
    expect(snapAngle(362)).toBe(0);
  });
});

describe('isCardinalAngle', () => {
  it('ROT-044: 0 is cardinal', () => {
    expect(isCardinalAngle(0)).toBe(true);
  });

  it('ROT-045: 90 is cardinal', () => {
    expect(isCardinalAngle(90)).toBe(true);
  });

  it('ROT-046: 180 is cardinal', () => {
    expect(isCardinalAngle(180)).toBe(true);
  });

  it('ROT-047: 270 is cardinal', () => {
    expect(isCardinalAngle(270)).toBe(true);
  });

  it('ROT-048: 360 is cardinal (normalizes to 0)', () => {
    expect(isCardinalAngle(360)).toBe(true);
  });

  it('ROT-049: 45 is not cardinal', () => {
    expect(isCardinalAngle(45)).toBe(false);
  });

  it('ROT-050: 135 is not cardinal', () => {
    expect(isCardinalAngle(135)).toBe(false);
  });

  it('ROT-051: 37.5 is not cardinal', () => {
    expect(isCardinalAngle(37.5)).toBe(false);
  });

  it('ROT-052: near-cardinal (89.999) is cardinal with default epsilon', () => {
    expect(isCardinalAngle(89.999)).toBe(true);
  });

  it('ROT-053: near-cardinal (90.005) is cardinal with default epsilon', () => {
    expect(isCardinalAngle(90.005)).toBe(true);
  });

  it('ROT-054: not near-cardinal (89.5) is not cardinal', () => {
    expect(isCardinalAngle(89.5)).toBe(false);
  });

  it('ROT-055: -90 is cardinal (normalizes to 270)', () => {
    expect(isCardinalAngle(-90)).toBe(true);
  });

  it('ROT-056: custom epsilon allows wider tolerance', () => {
    expect(isCardinalAngle(88, 3)).toBe(true);
  });

  it('ROT-057: custom epsilon too tight rejects near-cardinal', () => {
    expect(isCardinalAngle(89.999, 0.0001)).toBe(false);
  });
});

describe('getRotationMatrix2x2', () => {
  it('ROT-058: 0 degrees produces identity matrix', () => {
    const mat = getRotationMatrix2x2(0);
    expect(mat).toBeInstanceOf(Float32Array);
    expect(mat.length).toBe(4);
    expect(mat[0]).toBeCloseTo(1, 5);
    expect(mat[1]).toBeCloseTo(0, 5);
    expect(mat[2]).toBeCloseTo(0, 5);
    expect(mat[3]).toBeCloseTo(1, 5);
  });

  it('ROT-059: 90 degrees CW rotation matrix', () => {
    const mat = getRotationMatrix2x2(90);
    // Rotation by -90 radians (CW in tex space):
    // cos(-90°) = 0, sin(-90°) = -1
    // mat = [cos, sin, -sin, cos] = [0, -1, 1, 0]
    expect(mat[0]).toBeCloseTo(0, 5);
    expect(mat[1]).toBeCloseTo(-1, 5);
    expect(mat[2]).toBeCloseTo(1, 5);
    expect(mat[3]).toBeCloseTo(0, 5);
  });

  it('ROT-060: 180 degrees rotation matrix', () => {
    const mat = getRotationMatrix2x2(180);
    // cos(-180°) = -1, sin(-180°) = 0
    // mat = [-1, 0, 0, -1]
    expect(mat[0]).toBeCloseTo(-1, 5);
    expect(mat[1]).toBeCloseTo(0, 5);
    expect(mat[2]).toBeCloseTo(0, 5);
    expect(mat[3]).toBeCloseTo(-1, 5);
  });

  it('ROT-061: 270 degrees CW rotation matrix', () => {
    const mat = getRotationMatrix2x2(270);
    // cos(-270°) = 0, sin(-270°) = 1
    // mat = [0, 1, -1, 0]
    expect(mat[0]).toBeCloseTo(0, 5);
    expect(mat[1]).toBeCloseTo(1, 5);
    expect(mat[2]).toBeCloseTo(-1, 5);
    expect(mat[3]).toBeCloseTo(0, 5);
  });

  it('ROT-062: 45 degrees rotation matrix', () => {
    const mat = getRotationMatrix2x2(45);
    const s2 = Math.SQRT2 / 2;
    // cos(-45°) = sqrt(2)/2, sin(-45°) = -sqrt(2)/2
    // mat = [sqrt(2)/2, -sqrt(2)/2, sqrt(2)/2, sqrt(2)/2]
    expect(mat[0]).toBeCloseTo(s2, 5);
    expect(mat[1]).toBeCloseTo(-s2, 5);
    expect(mat[2]).toBeCloseTo(s2, 5);
    expect(mat[3]).toBeCloseTo(s2, 5);
  });

  it('ROT-063: 360 degrees equals identity', () => {
    const mat = getRotationMatrix2x2(360);
    expect(mat[0]).toBeCloseTo(1, 5);
    expect(mat[1]).toBeCloseTo(0, 5);
    expect(mat[2]).toBeCloseTo(0, 5);
    expect(mat[3]).toBeCloseTo(1, 5);
  });

  it('ROT-064: rotation matrix is orthogonal (det = 1)', () => {
    const mat = getRotationMatrix2x2(37.5);
    // For a 2x2 rotation matrix [a, b, c, d] (column-major):
    // det = a*d - c*b
    const det = mat[0]! * mat[3]! - mat[2]! * mat[1]!;
    expect(det).toBeCloseTo(1, 5);
  });

  it('ROT-065: rotation matrix determinant is 1 for arbitrary angle', () => {
    for (const angle of [0, 30, 45, 60, 90, 120, 150, 180, 210, 270, 315, 359.5]) {
      const mat = getRotationMatrix2x2(angle);
      const det = mat[0]! * mat[3]! - mat[2]! * mat[1]!;
      expect(det).toBeCloseTo(1, 5);
    }
  });

  it('ROT-066: negative angle produces same result as 360-angle', () => {
    const matNeg = getRotationMatrix2x2(-45);
    const matPos = getRotationMatrix2x2(315);
    expect(matNeg[0]).toBeCloseTo(matPos[0]!, 5);
    expect(matNeg[1]).toBeCloseTo(matPos[1]!, 5);
    expect(matNeg[2]).toBeCloseTo(matPos[2]!, 5);
    expect(matNeg[3]).toBeCloseTo(matPos[3]!, 5);
  });

  it('ROT-067: returns Float32Array', () => {
    const mat = getRotationMatrix2x2(45);
    expect(mat).toBeInstanceOf(Float32Array);
  });

  it('ROT-068: returns array of length 4', () => {
    const mat = getRotationMatrix2x2(123.456);
    expect(mat.length).toBe(4);
  });
});

describe('DEFAULT_SNAP_TARGETS', () => {
  it('ROT-069: contains 8 standard targets', () => {
    expect(DEFAULT_SNAP_TARGETS.length).toBe(8);
  });

  it('ROT-070: targets are every 45 degrees from 0 to 315', () => {
    expect([...DEFAULT_SNAP_TARGETS]).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });
});

describe('DEFAULT_SNAP_THRESHOLD', () => {
  it('ROT-071: default threshold is 5 degrees', () => {
    expect(DEFAULT_SNAP_THRESHOLD).toBe(5);
  });
});

describe('getEffectiveDimensions (via rotation)', () => {
  // These tests are in ViewerRenderingUtils.test.ts but we verify the math here
  // for non-cardinal angles using the rotation matrix determinant check.

  it('ROT-072: composing two rotations by multiplying matrices gives correct result', () => {
    // Verify that rotating by 45 then 45 is equivalent to 90
    const mat45 = getRotationMatrix2x2(45);
    const mat90 = getRotationMatrix2x2(90);

    // Matrix multiply (column-major): C = A * B
    // C[0] = A[0]*B[0] + A[2]*B[1]
    // C[1] = A[1]*B[0] + A[3]*B[1]
    // C[2] = A[0]*B[2] + A[2]*B[3]
    // C[3] = A[1]*B[2] + A[3]*B[3]
    const composed0 = mat45[0]! * mat45[0]! + mat45[2]! * mat45[1]!;
    const composed1 = mat45[1]! * mat45[0]! + mat45[3]! * mat45[1]!;
    const composed2 = mat45[0]! * mat45[2]! + mat45[2]! * mat45[3]!;
    const composed3 = mat45[1]! * mat45[2]! + mat45[3]! * mat45[3]!;

    expect(composed0).toBeCloseTo(mat90[0]!, 5);
    expect(composed1).toBeCloseTo(mat90[1]!, 5);
    expect(composed2).toBeCloseTo(mat90[2]!, 5);
    expect(composed3).toBeCloseTo(mat90[3]!, 5);
  });
});

describe('edge cases', () => {
  it('ROT-073: normalizeAngle handles very small negative angle', () => {
    const result = normalizeAngle(-0.001);
    expect(result).toBeCloseTo(359.999, 3);
  });

  it('ROT-074: snapAngle at exact target returns target', () => {
    expect(snapAngle(90)).toBe(90);
  });

  it('ROT-075: snapAngle at exact 0 returns 0', () => {
    expect(snapAngle(0)).toBe(0);
  });

  it('ROT-076: isCardinalAngle with 0.001 custom epsilon', () => {
    expect(isCardinalAngle(90, 0.001)).toBe(true);
    expect(isCardinalAngle(90.01, 0.001)).toBe(false);
  });

  it('ROT-077: getRotationMatrix2x2 with 0.5 degree angle', () => {
    const mat = getRotationMatrix2x2(0.5);
    const rad = -(0.5 * Math.PI) / 180;
    expect(mat[0]).toBeCloseTo(Math.cos(rad), 5);
    expect(mat[1]).toBeCloseTo(Math.sin(rad), 5);
    expect(mat[2]).toBeCloseTo(-Math.sin(rad), 5);
    expect(mat[3]).toBeCloseTo(Math.cos(rad), 5);
  });
});
