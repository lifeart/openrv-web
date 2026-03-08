import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getNumberValue,
  getBooleanValue,
  getNumberArray,
  getStringValue,
  getStringArray,
  AnnotationStore,
  type AnnotationStoreCallbacks,
} from './AnnotationStore';
import type { GTOComponentDTO } from './SessionTypes';
import {
  BrushType,
  LineJoin,
  LineCap,
  StrokeMode,
  TextOrigin,
  RV_PEN_WIDTH_SCALE,
  RV_TEXT_SIZE_SCALE,
} from '../../paint/types';

// ---- Helper ----

function createMockComponent(props: Record<string, unknown>): GTOComponentDTO {
  return {
    property(name: string) {
      return { value: () => props[name] };
    },
  };
}

function createCallbacks(): AnnotationStoreCallbacks & {
  onAnnotationsLoaded: ReturnType<typeof vi.fn>;
  onPaintEffectsLoaded: ReturnType<typeof vi.fn>;
  onMatteChanged: ReturnType<typeof vi.fn>;
} {
  return {
    onAnnotationsLoaded: vi.fn(),
    onPaintEffectsLoaded: vi.fn(),
    onMatteChanged: vi.fn(),
  };
}

// ================================================================
// GTO value extraction helpers
// ================================================================

describe('getNumberValue', () => {
  it('AS-001: returns number when given a number', () => {
    expect(getNumberValue(42)).toBe(42);
  });

  it('AS-002: returns 0 for zero', () => {
    expect(getNumberValue(0)).toBe(0);
  });

  it('AS-003: returns negative numbers', () => {
    expect(getNumberValue(-3.14)).toBe(-3.14);
  });

  it('AS-004: unwraps [number]', () => {
    expect(getNumberValue([7])).toBe(7);
  });

  it('AS-005: unwraps [[number]]', () => {
    expect(getNumberValue([[99]])).toBe(99);
  });

  it('AS-006: returns undefined for undefined', () => {
    expect(getNumberValue(undefined)).toBeUndefined();
  });

  it('AS-007: returns undefined for a string', () => {
    expect(getNumberValue('hello')).toBeUndefined();
  });

  it('AS-008: returns undefined for an empty array', () => {
    expect(getNumberValue([])).toBeUndefined();
  });

  it('AS-009: returns first element from [number, number]', () => {
    expect(getNumberValue([10, 20])).toBe(10);
  });

  it('AS-010: returns undefined for [string]', () => {
    expect(getNumberValue(['abc'])).toBeUndefined();
  });

  it('AS-011: returns undefined for null', () => {
    expect(getNumberValue(null)).toBeUndefined();
  });
});

describe('getBooleanValue', () => {
  it('AS-012: returns true for true', () => {
    expect(getBooleanValue(true)).toBe(true);
  });

  it('AS-013: returns false for false', () => {
    expect(getBooleanValue(false)).toBe(false);
  });

  it('AS-014: returns true for 1', () => {
    expect(getBooleanValue(1)).toBe(true);
  });

  it('AS-015: returns false for 0', () => {
    expect(getBooleanValue(0)).toBe(false);
  });

  it('AS-016: returns true for non-zero number', () => {
    expect(getBooleanValue(42)).toBe(true);
  });

  it('AS-017: returns true for "true"', () => {
    expect(getBooleanValue('true')).toBe(true);
  });

  it('AS-018: returns false for "false"', () => {
    expect(getBooleanValue('false')).toBe(false);
  });

  it('AS-019: returns true for "1"', () => {
    expect(getBooleanValue('1')).toBe(true);
  });

  it('AS-020: returns false for "0"', () => {
    expect(getBooleanValue('0')).toBe(false);
  });

  it('AS-021: is case insensitive for "TRUE"', () => {
    expect(getBooleanValue('TRUE')).toBe(true);
  });

  it('AS-022: is case insensitive for "False"', () => {
    expect(getBooleanValue('False')).toBe(false);
  });

  it('AS-023: handles whitespace in string', () => {
    expect(getBooleanValue('  true  ')).toBe(true);
  });

  it('AS-024: unwraps [boolean]', () => {
    expect(getBooleanValue([true])).toBe(true);
    expect(getBooleanValue([false])).toBe(false);
  });

  it('AS-025: unwraps [number] for boolean', () => {
    expect(getBooleanValue([1])).toBe(true);
    expect(getBooleanValue([0])).toBe(false);
  });

  it('AS-026: unwraps [string] for boolean', () => {
    expect(getBooleanValue(['true'])).toBe(true);
    expect(getBooleanValue(['false'])).toBe(false);
  });

  it('AS-027: returns undefined for undefined', () => {
    expect(getBooleanValue(undefined)).toBeUndefined();
  });

  it('AS-028: returns undefined for unrecognized string', () => {
    expect(getBooleanValue('yes')).toBeUndefined();
  });

  it('AS-029: returns undefined for empty array', () => {
    expect(getBooleanValue([])).toBeUndefined();
  });
});

describe('getNumberArray', () => {
  it('AS-030: returns [1,2,3] for [1,2,3]', () => {
    expect(getNumberArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('AS-031: unwraps [[1,2,3]]', () => {
    expect(getNumberArray([[1, 2, 3]])).toEqual([1, 2, 3]);
  });

  it('AS-032: returns undefined for empty array', () => {
    expect(getNumberArray([])).toBeUndefined();
  });

  it('AS-033: filters non-numeric entries from flat array', () => {
    expect(getNumberArray([1, 'a', 3])).toEqual([1, 3]);
  });

  it('AS-034: returns undefined for non-array', () => {
    expect(getNumberArray(42)).toBeUndefined();
  });

  it('AS-035: returns undefined for [[]] (empty nested)', () => {
    expect(getNumberArray([[]])).toBeUndefined();
  });

  it('AS-036: returns undefined for [string] array', () => {
    expect(getNumberArray(['a', 'b'])).toBeUndefined();
  });
});

describe('getStringValue', () => {
  it('AS-037: returns string directly', () => {
    expect(getStringValue('hello')).toBe('hello');
  });

  it('AS-038: unwraps [string]', () => {
    expect(getStringValue(['world'])).toBe('world');
  });

  it('AS-039: returns undefined for undefined', () => {
    expect(getStringValue(undefined)).toBeUndefined();
  });

  it('AS-040: returns undefined for number', () => {
    expect(getStringValue(42)).toBeUndefined();
  });

  it('AS-041: returns undefined for empty array', () => {
    expect(getStringValue([])).toBeUndefined();
  });
});

describe('getStringArray', () => {
  it('AS-042: returns ["a","b"] for ["a","b"]', () => {
    expect(getStringArray(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('AS-043: unwraps [["a","b"]]', () => {
    expect(getStringArray([['a', 'b']])).toEqual(['a', 'b']);
  });

  it('AS-044: returns undefined for empty array', () => {
    expect(getStringArray([])).toBeUndefined();
  });

  it('AS-045: returns undefined for non-array', () => {
    expect(getStringArray('hello')).toBeUndefined();
  });

  it('AS-046: returns undefined for [[]] (empty nested)', () => {
    expect(getStringArray([[]])).toBeUndefined();
  });

  it('AS-047: filters non-string from flat array', () => {
    expect(getStringArray(['a', 42 as unknown as string, 'b'])).toEqual(['a', 'b']);
  });
});

// ================================================================
// AnnotationStore class
// ================================================================

describe('AnnotationStore', () => {
  let store: AnnotationStore;
  let callbacks: ReturnType<typeof createCallbacks>;

  beforeEach(() => {
    store = new AnnotationStore();
    callbacks = createCallbacks();
    store.setCallbacks(callbacks);
  });

  // ---- Construction and callbacks ----

  describe('construction and callbacks', () => {
    it('AS-048: can be constructed', () => {
      expect(new AnnotationStore()).toBeInstanceOf(AnnotationStore);
    });

    it('AS-049: matteSettings starts as null', () => {
      const fresh = new AnnotationStore();
      expect(fresh.matteSettings).toBeNull();
    });

    it('AS-050: sessionPaintEffects starts as null', () => {
      const fresh = new AnnotationStore();
      expect(fresh.sessionPaintEffects).toBeNull();
    });

    it('AS-051: setCallbacks stores callbacks', () => {
      // Verify by triggering a callback
      store.setPaintEffects({ ghost: true });
      expect(callbacks.onPaintEffectsLoaded).toHaveBeenCalled();
    });

    it('AS-052: methods work without callbacks set', () => {
      const fresh = new AnnotationStore();
      expect(() => fresh.setPaintEffects({ ghost: true })).not.toThrow();
      expect(() => fresh.setMatteSettings({ show: true })).not.toThrow();
    });
  });

  // ---- setPaintEffects ----

  describe('setPaintEffects', () => {
    it('AS-053: sets effects and exposes via accessor', () => {
      const effects = { ghost: true, hold: false };
      store.setPaintEffects(effects);
      expect(store.sessionPaintEffects).toEqual(effects);
    });

    it('AS-054: invokes onPaintEffectsLoaded callback', () => {
      const effects = { ghostBefore: 5 };
      store.setPaintEffects(effects);
      expect(callbacks.onPaintEffectsLoaded).toHaveBeenCalledOnce();
      expect(callbacks.onPaintEffectsLoaded).toHaveBeenCalledWith(effects);
    });

    it('AS-055: overwrites previous effects', () => {
      store.setPaintEffects({ ghost: true });
      store.setPaintEffects({ hold: true });
      expect(store.sessionPaintEffects).toEqual({ hold: true });
    });
  });

  // ---- setMatteSettings ----

  describe('setMatteSettings', () => {
    it('AS-056: defaults show to false', () => {
      store.setMatteSettings({});
      expect(store.matteSettings!.show).toBe(false);
    });

    it('AS-057: defaults aspect to 1.78', () => {
      store.setMatteSettings({});
      expect(store.matteSettings!.aspect).toBe(1.78);
    });

    it('AS-058: defaults opacity to 0.66', () => {
      store.setMatteSettings({});
      expect(store.matteSettings!.opacity).toBe(0.66);
    });

    it('AS-059: defaults heightVisible to -1', () => {
      store.setMatteSettings({});
      expect(store.matteSettings!.heightVisible).toBe(-1);
    });

    it('AS-060: defaults centerPoint to [0, 0]', () => {
      store.setMatteSettings({});
      expect(store.matteSettings!.centerPoint).toEqual([0, 0]);
    });

    it('AS-061: accepts custom values', () => {
      store.setMatteSettings({
        show: true,
        aspect: 2.35,
        opacity: 0.8,
        heightVisible: 0.5,
        centerPoint: [0.1, 0.2],
      });
      const m = store.matteSettings!;
      expect(m.show).toBe(true);
      expect(m.aspect).toBe(2.35);
      expect(m.opacity).toBe(0.8);
      expect(m.heightVisible).toBe(0.5);
      expect(m.centerPoint).toEqual([0.1, 0.2]);
    });

    it('AS-062: invokes onMatteChanged callback', () => {
      store.setMatteSettings({ show: true });
      expect(callbacks.onMatteChanged).toHaveBeenCalledOnce();
      expect(callbacks.onMatteChanged.mock.calls[0][0].show).toBe(true);
    });

    it('AS-063: partial values fill in defaults', () => {
      store.setMatteSettings({ show: true, aspect: 1.85 });
      const m = store.matteSettings!;
      expect(m.opacity).toBe(0.66);
      expect(m.heightVisible).toBe(-1);
    });
  });

  // ---- parsePaintTagEffects ----

  describe('parsePaintTagEffects', () => {
    it('AS-064: parses JSON object', () => {
      const result = store.parsePaintTagEffects('{"ghost": true, "hold": false}');
      expect(result).toEqual({ ghost: true, hold: false });
    });

    it('AS-065: parses JSON array (uses first element)', () => {
      const result = store.parsePaintTagEffects('[{"ghost": true}]');
      expect(result).toEqual({ ghost: true });
    });

    it('AS-066: parses JSON with ghostBefore/ghostAfter', () => {
      const result = store.parsePaintTagEffects('{"ghostBefore": 5, "ghostAfter": 3}');
      expect(result).toEqual({ ghostBefore: 5, ghostAfter: 3 });
    });

    it('AS-067: rounds ghostBefore and ghostAfter', () => {
      const result = store.parsePaintTagEffects('{"ghostBefore": 5.7, "ghostAfter": 3.2}');
      expect(result).toEqual({ ghostBefore: 6, ghostAfter: 3 });
    });

    it('AS-068: parses key:value format', () => {
      const result = store.parsePaintTagEffects('ghost:true hold:false');
      expect(result).toEqual({ ghost: true, hold: false });
    });

    it('AS-069: parses key=value format', () => {
      const result = store.parsePaintTagEffects('ghost=true hold=false');
      expect(result).toEqual({ ghost: true, hold: false });
    });

    it('AS-070: parses with semicolon separators', () => {
      const result = store.parsePaintTagEffects('ghost:true;hold:true');
      expect(result).toEqual({ ghost: true, hold: true });
    });

    it('AS-071: parses with comma separators', () => {
      const result = store.parsePaintTagEffects('ghost:true,hold:true');
      expect(result).toEqual({ ghost: true, hold: true });
    });

    it('AS-072: bare "ghost" word sets ghost=true', () => {
      const result = store.parsePaintTagEffects('ghost');
      expect(result).toEqual({ ghost: true });
    });

    it('AS-073: bare "hold" word sets hold=true', () => {
      const result = store.parsePaintTagEffects('hold');
      expect(result).toEqual({ hold: true });
    });

    it('AS-074: bare "ghost hold" sets both', () => {
      const result = store.parsePaintTagEffects('ghost hold');
      expect(result).toEqual({ ghost: true, hold: true });
    });

    it('AS-075: returns null for empty string', () => {
      expect(store.parsePaintTagEffects('')).toBeNull();
    });

    it('AS-076: returns null for whitespace-only string', () => {
      expect(store.parsePaintTagEffects('   ')).toBeNull();
    });

    it('AS-077: returns null for unrecognized keys', () => {
      expect(store.parsePaintTagEffects('unknown:value')).toBeNull();
    });

    it('AS-078: JSON key normalization strips non-alpha chars', () => {
      const result = store.parsePaintTagEffects('{"ghost_before": 4}');
      expect(result).toEqual({ ghostBefore: 4 });
    });

    it('AS-079: ghostBefore/ghostAfter in key:value format', () => {
      const result = store.parsePaintTagEffects('ghostBefore:3 ghostAfter:5');
      expect(result).toEqual({ ghostBefore: 3, ghostAfter: 5 });
    });

    it('AS-080: bare ghost does not override explicit ghost:false', () => {
      // key:value parsed first, then bare word check only if ghost is still undefined
      const result = store.parsePaintTagEffects('ghost:false');
      expect(result).toEqual({ ghost: false });
    });
  });

  // ---- parsePenStroke ----

  describe('parsePenStroke', () => {
    const aspectRatio = 2.0;

    it('AS-081: parses strokeId for user and id', () => {
      const comp = createMockComponent({
        points: [[0, 0]],
        color: [1, 0, 0, 1],
      });
      const stroke = store.parsePenStroke('pen:42:15:Alice', 15, comp, aspectRatio);
      expect(stroke!.user).toBe('Alice');
      expect(stroke!.id).toBe('42');
    });

    it('AS-082: defaults user to "unknown" if not in strokeId', () => {
      const comp = createMockComponent({ points: [[0, 0]] });
      const stroke = store.parsePenStroke('pen:1:1', 1, comp, aspectRatio);
      expect(stroke!.user).toBe('unknown');
    });

    it('AS-083: defaults id to "0" if missing', () => {
      const comp = createMockComponent({ points: [[0, 0]] });
      const stroke = store.parsePenStroke('pen', 1, comp, aspectRatio);
      expect(stroke!.id).toBe('0');
    });

    it('AS-084: defaults color to [1, 0, 0, 1]', () => {
      const comp = createMockComponent({ points: [[0, 0]] });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.color).toEqual([1, 0, 0, 1]);
    });

    it('AS-085: uses provided color', () => {
      const comp = createMockComponent({
        points: [[0, 0]],
        color: [0, 1, 0, 0.5],
      });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.color).toEqual([0, 1, 0, 0.5]);
    });

    it('AS-086: defaults width to 3 when no width property', () => {
      const comp = createMockComponent({ points: [[0, 0]] });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.width).toBe(3);
    });

    it('AS-087: scales width by RV_PEN_WIDTH_SCALE from array', () => {
      const comp = createMockComponent({
        points: [[0, 0]],
        width: [0.01],
      });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.width).toBe(0.01 * RV_PEN_WIDTH_SCALE);
    });

    it('AS-088: scales width by RV_PEN_WIDTH_SCALE from number', () => {
      const comp = createMockComponent({
        points: [[0, 0]],
        width: 0.02,
      });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.width).toBe(0.02 * RV_PEN_WIDTH_SCALE);
    });

    it('AS-089: brush defaults to Circle', () => {
      const comp = createMockComponent({ points: [[0, 0]] });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.brush).toBe(BrushType.Circle);
    });

    it('AS-090: brush is Gaussian when brush="gaussian"', () => {
      const comp = createMockComponent({
        points: [[0, 0]],
        brush: 'gaussian',
      });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.brush).toBe(BrushType.Gaussian);
    });

    it('AS-091: coordinate transform: nested [[x,y]]', () => {
      const rawX = 1.0;
      const rawY = 0.25;
      const comp = createMockComponent({ points: [[rawX, rawY]] });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.points[0].x).toBeCloseTo(rawX / aspectRatio + 0.5);
      expect(stroke!.points[0].y).toBeCloseTo(rawY + 0.5);
    });

    it('AS-092: coordinate transform: flat [x, y, x, y]', () => {
      const comp = createMockComponent({ points: [0.4, 0.1, 0.8, -0.2] });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.points).toHaveLength(2);
      expect(stroke!.points[0].x).toBeCloseTo(0.4 / aspectRatio + 0.5);
      expect(stroke!.points[0].y).toBeCloseTo(0.1 + 0.5);
      expect(stroke!.points[1].x).toBeCloseTo(0.8 / aspectRatio + 0.5);
      expect(stroke!.points[1].y).toBeCloseTo(-0.2 + 0.5);
    });

    it('AS-093: multiple nested points', () => {
      const comp = createMockComponent({
        points: [
          [0, 0],
          [1, 0.5],
        ],
      });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.points).toHaveLength(2);
    });

    it('AS-094: returns null when no points', () => {
      const comp = createMockComponent({ points: [] });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke).toBeNull();
    });

    it('AS-095: returns null when points is undefined', () => {
      const comp = createMockComponent({});
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke).toBeNull();
    });

    it('AS-096: line join defaults to Round', () => {
      const comp = createMockComponent({ points: [[0, 0]] });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.join).toBe(LineJoin.Round);
    });

    it('AS-097: line join 0 maps to Miter', () => {
      const comp = createMockComponent({ points: [[0, 0]], join: 0 });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.join).toBe(LineJoin.Miter);
    });

    it('AS-098: line join 2 maps to Bevel', () => {
      const comp = createMockComponent({ points: [[0, 0]], join: 2 });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.join).toBe(LineJoin.Bevel);
    });

    it('AS-099: line join 1 stays Round', () => {
      const comp = createMockComponent({ points: [[0, 0]], join: 1 });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.join).toBe(LineJoin.Round);
    });

    it('AS-100: line cap defaults to Round', () => {
      const comp = createMockComponent({ points: [[0, 0]] });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.cap).toBe(LineCap.Round);
    });

    it('AS-101: line cap 0 maps to NoCap', () => {
      const comp = createMockComponent({ points: [[0, 0]], cap: 0 });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.cap).toBe(LineCap.NoCap);
    });

    it('AS-102: line cap 2 maps to Square', () => {
      const comp = createMockComponent({ points: [[0, 0]], cap: 2 });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.cap).toBe(LineCap.Square);
    });

    it('AS-103: splat is true when splatValue is 1', () => {
      const comp = createMockComponent({ points: [[0, 0]], splat: 1 });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.splat).toBe(true);
    });

    it('AS-104: splat is false when splatValue is not 1', () => {
      const comp = createMockComponent({ points: [[0, 0]], splat: 0 });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.splat).toBe(false);
    });

    it('AS-105: splat is false when splatValue is undefined', () => {
      const comp = createMockComponent({ points: [[0, 0]] });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.splat).toBe(false);
    });

    it('AS-106: mode is always StrokeMode.Draw', () => {
      const comp = createMockComponent({ points: [[0, 0]] });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.mode).toBe(StrokeMode.Draw);
    });

    it('AS-107: frame and startFrame match', () => {
      const comp = createMockComponent({ points: [[0, 0]] });
      const stroke = store.parsePenStroke('pen:1:15:User', 15, comp, aspectRatio);
      expect(stroke!.frame).toBe(15);
      expect(stroke!.startFrame).toBe(15);
    });

    it('AS-108: duration is 0', () => {
      const comp = createMockComponent({ points: [[0, 0]] });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.duration).toBe(0);
    });

    it('AS-109: type is "pen"', () => {
      const comp = createMockComponent({ points: [[0, 0]] });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.type).toBe('pen');
    });

    it('AS-110: odd number of flat points ignores trailing value', () => {
      const comp = createMockComponent({ points: [0.1, 0.2, 0.3] });
      const stroke = store.parsePenStroke('pen:1:1:User', 1, comp, aspectRatio);
      expect(stroke!.points).toHaveLength(1);
    });
  });

  // ---- parseTextAnnotation ----

  describe('parseTextAnnotation', () => {
    const aspectRatio = 2.0;

    it('AS-111: parses textId for user and id', () => {
      const comp = createMockComponent({ text: 'hello' });
      const text = store.parseTextAnnotation('text:6:1:Bob', 1, comp, aspectRatio);
      expect(text!.user).toBe('Bob');
      expect(text!.id).toBe('6');
    });

    it('AS-112: defaults user to "unknown"', () => {
      const comp = createMockComponent({ text: 'hello' });
      const text = store.parseTextAnnotation('text:1:1', 1, comp, aspectRatio);
      expect(text!.user).toBe('unknown');
    });

    it('AS-113: position defaults to (0.5, 0.5)', () => {
      const comp = createMockComponent({ text: 'hello' });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.position.x).toBeCloseTo(0.5);
      expect(text!.position.y).toBeCloseTo(0.5);
    });

    it('AS-114: position from flat [x, y]', () => {
      const comp = createMockComponent({
        text: 'hello',
        position: [0.4, 0.1],
      });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.position.x).toBeCloseTo(0.4 / aspectRatio + 0.5);
      expect(text!.position.y).toBeCloseTo(0.1 + 0.5);
    });

    it('AS-115: position unwraps [[x, y]]', () => {
      const comp = createMockComponent({
        text: 'hello',
        position: [[0.6, -0.1]],
      });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.position.x).toBeCloseTo(0.6 / aspectRatio + 0.5);
      expect(text!.position.y).toBeCloseTo(-0.1 + 0.5);
    });

    it('AS-116: triple-wrapped [[[x, y]]] does not unwrap (inner length !== 2)', () => {
      // The unwrap loop checks posData[0].length === 2; [[[x,y]]] has posData[0]=[[x,y]] with length 1
      // so it falls through without coordinate transform
      const comp = createMockComponent({
        text: 'hello',
        position: [[[0.2, 0.3]]],
      });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      // posData stays [[[0.2, 0.3]]], posData[0] is [[0.2, 0.3]] which is not a number
      expect(text!.position.x).toBeCloseTo(0.5);
      expect(text!.position.y).toBeCloseTo(0.5);
    });

    it('AS-117: color defaults to [1, 1, 1, 1]', () => {
      const comp = createMockComponent({ text: 'hello' });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.color).toEqual([1, 1, 1, 1]);
    });

    it('AS-118: uses provided color', () => {
      const comp = createMockComponent({
        text: 'hello',
        color: [0, 0, 1, 0.8],
      });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.color).toEqual([0, 0, 1, 0.8]);
    });

    it('AS-119: size is scaled by RV_TEXT_SIZE_SCALE', () => {
      const comp = createMockComponent({ text: 'hello', size: 0.02 });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.size).toBe(0.02 * RV_TEXT_SIZE_SCALE);
    });

    it('AS-120: size defaults to 0.01 * RV_TEXT_SIZE_SCALE', () => {
      const comp = createMockComponent({ text: 'hello' });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.size).toBe(0.01 * RV_TEXT_SIZE_SCALE);
    });

    it('AS-121: scale defaults to 1', () => {
      const comp = createMockComponent({ text: 'hello' });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.scale).toBe(1);
    });

    it('AS-122: rotation defaults to 0', () => {
      const comp = createMockComponent({ text: 'hello' });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.rotation).toBe(0);
    });

    it('AS-123: spacing defaults to 1', () => {
      const comp = createMockComponent({ text: 'hello' });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.spacing).toBe(1);
    });

    it('AS-124: font defaults to "sans-serif"', () => {
      const comp = createMockComponent({ text: 'hello' });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.font).toBe('sans-serif');
    });

    it('AS-125: font uses provided value', () => {
      const comp = createMockComponent({ text: 'hello', font: 'monospace' });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.font).toBe('monospace');
    });

    it('AS-126: origin is always BottomLeft', () => {
      const comp = createMockComponent({ text: 'hello' });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.origin).toBe(TextOrigin.BottomLeft);
    });

    it('AS-127: type is "text"', () => {
      const comp = createMockComponent({ text: 'hello' });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.type).toBe('text');
    });

    it('AS-128: frame and startFrame match', () => {
      const comp = createMockComponent({ text: 'hello' });
      const text = store.parseTextAnnotation('text:1:10:User', 10, comp, aspectRatio);
      expect(text!.frame).toBe(10);
      expect(text!.startFrame).toBe(10);
    });

    it('AS-129: duration is 0', () => {
      const comp = createMockComponent({ text: 'hello' });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.duration).toBe(0);
    });

    it('AS-130: text content is passed through', () => {
      const comp = createMockComponent({ text: 'review note' });
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.text).toBe('review note');
    });

    it('AS-131: text defaults to empty string when undefined', () => {
      const comp = createMockComponent({});
      const text = store.parseTextAnnotation('text:1:1:User', 1, comp, aspectRatio);
      expect(text!.text).toBe('');
    });
  });

  // ---- dispose ----

  describe('dispose', () => {
    it('AS-132: dispose does not throw', () => {
      expect(() => store.dispose()).not.toThrow();
    });

    it('AS-133: dispose can be called multiple times', () => {
      store.dispose();
      expect(() => store.dispose()).not.toThrow();
    });

    it('AS-134: callbacks not invoked after dispose', () => {
      store.dispose();
      store.setPaintEffects({ ghost: true });
      expect(callbacks.onPaintEffectsLoaded).not.toHaveBeenCalled();
    });

    it('AS-135: setMatteSettings still works after dispose (no crash)', () => {
      store.dispose();
      expect(() => store.setMatteSettings({ show: true })).not.toThrow();
      expect(callbacks.onMatteChanged).not.toHaveBeenCalled();
    });
  });
});
