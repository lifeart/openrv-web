import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MuPropertyBridge, parsePropertyPath, type StoredProperty } from '../MuPropertyBridge';
import { MuPropertyType } from '../types';

describe('parsePropertyPath', () => {
  it('parses a standard 3-part path', () => {
    const result = parsePropertyPath('myNode.color.exposure');
    expect(result).toEqual({
      node: 'myNode',
      component: 'color',
      property: 'exposure',
      isHashPath: false,
    });
  });

  it('parses a hash-prefixed path', () => {
    const result = parsePropertyPath('#RVColor.color.gamma');
    expect(result).toEqual({
      node: '#RVColor',
      component: 'color',
      property: 'gamma',
      isHashPath: true,
    });
  });

  it('returns null for paths with wrong number of segments', () => {
    expect(parsePropertyPath('foo.bar')).toBeNull();
    expect(parsePropertyPath('foo')).toBeNull();
    expect(parsePropertyPath('a.b.c.d')).toBeNull();
    expect(parsePropertyPath('')).toBeNull();
  });

  it('returns null for paths with empty segments', () => {
    expect(parsePropertyPath('.a.b')).toBeNull();
    expect(parsePropertyPath('a..b')).toBeNull();
    expect(parsePropertyPath('a.b.')).toBeNull();
  });
});

describe('MuPropertyBridge', () => {
  let bridge: MuPropertyBridge;

  beforeEach(() => {
    bridge = new MuPropertyBridge();
  });

  // ---- newProperty / propertyExists / propertyInfo ----

  describe('newProperty', () => {
    it('creates a float property', () => {
      bridge.newProperty('node.comp.gamma', MuPropertyType.Float, 1);
      expect(bridge.propertyExists('node.comp.gamma')).toBe(true);
    });

    it('creates a string property', () => {
      bridge.newProperty('node.media.movie', MuPropertyType.String, 2);
      expect(bridge.propertyExists('node.media.movie')).toBe(true);
      expect(bridge.getStringProperty('node.media.movie')).toEqual(['', '']);
    });

    it('creates a property with correct initial size', () => {
      bridge.newProperty('node.comp.values', MuPropertyType.Float, 4);
      expect(bridge.getFloatProperty('node.comp.values')).toEqual([0, 0, 0, 0]);
    });

    it('throws if property already exists', () => {
      bridge.newProperty('node.comp.gamma', MuPropertyType.Float, 1);
      expect(() => bridge.newProperty('node.comp.gamma', MuPropertyType.Float, 1)).toThrow(
        'Property already exists',
      );
    });

    it('throws for invalid path', () => {
      expect(() => bridge.newProperty('invalid', MuPropertyType.Float, 1)).toThrow('Invalid property path');
    });
  });

  describe('newNDProperty', () => {
    it('creates a multi-dimensional property', () => {
      bridge.newNDProperty('node.transform.matrix', MuPropertyType.Float, [4, 4]);
      const info = bridge.propertyInfo('node.transform.matrix');
      expect(info.dimensions).toEqual([4, 4]);
      expect(info.size).toBe(16);
      expect(info.type).toBe('float');
    });
  });

  describe('propertyInfo', () => {
    it('returns metadata for a float property', () => {
      bridge.newProperty('myNode.color.exposure', MuPropertyType.Float, 3);
      const info = bridge.propertyInfo('myNode.color.exposure');
      expect(info).toEqual({
        name: 'myNode.color.exposure',
        type: 'float',
        dimensions: [3],
        size: 3,
        userDefined: true,
        info: '',
      });
    });

    it('throws for non-existent property', () => {
      expect(() => bridge.propertyInfo('no.such.prop')).toThrow('Property not found');
    });

    it('throws for invalid path', () => {
      expect(() => bridge.propertyInfo('bad')).toThrow('Invalid property path');
    });
  });

  describe('propertyExists', () => {
    it('returns false for non-existent property', () => {
      expect(bridge.propertyExists('no.such.prop')).toBe(false);
    });

    it('returns false for invalid path', () => {
      expect(bridge.propertyExists('bad')).toBe(false);
    });
  });

  describe('deleteProperty', () => {
    it('deletes an existing property', () => {
      bridge.newProperty('node.comp.value', MuPropertyType.Float, 1);
      expect(bridge.propertyExists('node.comp.value')).toBe(true);
      bridge.deleteProperty('node.comp.value');
      expect(bridge.propertyExists('node.comp.value')).toBe(false);
    });

    it('throws for non-existent property', () => {
      expect(() => bridge.deleteProperty('no.such.prop')).toThrow('Property not found');
    });
  });

  describe('properties', () => {
    it('lists all properties on a node', () => {
      bridge.newProperty('myNode.color.exposure', MuPropertyType.Float, 1);
      bridge.newProperty('myNode.color.gamma', MuPropertyType.Float, 1);
      bridge.newProperty('myNode.media.movie', MuPropertyType.String, 1);
      bridge.newProperty('otherNode.color.gamma', MuPropertyType.Float, 1);

      const props = bridge.properties('myNode');
      expect(props).toHaveLength(3);
      expect(props).toContain('myNode.color.exposure');
      expect(props).toContain('myNode.color.gamma');
      expect(props).toContain('myNode.media.movie');
    });

    it('returns empty array for unknown node', () => {
      expect(bridge.properties('unknown')).toEqual([]);
    });
  });

  // ---- Float property get/set ----

  describe('getFloatProperty / setFloatProperty', () => {
    beforeEach(() => {
      bridge.newProperty('node.color.gamma', MuPropertyType.Float, 3);
      bridge.setFloatProperty('node.color.gamma', [1.0, 2.0, 3.0]);
    });

    it('gets all values by default', () => {
      expect(bridge.getFloatProperty('node.color.gamma')).toEqual([1.0, 2.0, 3.0]);
    });

    it('supports start/count slicing', () => {
      expect(bridge.getFloatProperty('node.color.gamma', 1, 2)).toEqual([2.0, 3.0]);
    });

    it('supports start with count=0 (to end)', () => {
      expect(bridge.getFloatProperty('node.color.gamma', 1, 0)).toEqual([2.0, 3.0]);
    });

    it('overwrites all values on set', () => {
      bridge.setFloatProperty('node.color.gamma', [4.0, 5.0]);
      expect(bridge.getFloatProperty('node.color.gamma')).toEqual([4.0, 5.0]);
    });

    it('throws for non-existent property', () => {
      expect(() => bridge.getFloatProperty('no.such.prop')).toThrow('Property not found');
    });

    it('throws for string property', () => {
      bridge.newProperty('node.media.path', MuPropertyType.String, 1);
      expect(() => bridge.getFloatProperty('node.media.path')).toThrow('string property');
    });
  });

  // ---- Int property get/set ----

  describe('getIntProperty / setIntProperty', () => {
    beforeEach(() => {
      bridge.newProperty('node.cut.in', MuPropertyType.Int, 1);
    });

    it('round-trips int values', () => {
      bridge.setIntProperty('node.cut.in', [42]);
      expect(bridge.getIntProperty('node.cut.in')).toEqual([42]);
    });
  });

  // ---- String property get/set ----

  describe('getStringProperty / setStringProperty', () => {
    beforeEach(() => {
      bridge.newProperty('node.media.movie', MuPropertyType.String, 1);
    });

    it('round-trips string values', () => {
      bridge.setStringProperty('node.media.movie', ['/path/to/file.exr']);
      expect(bridge.getStringProperty('node.media.movie')).toEqual(['/path/to/file.exr']);
    });

    it('throws when getting string from float property', () => {
      bridge.newProperty('node.color.val', MuPropertyType.Float, 1);
      expect(() => bridge.getStringProperty('node.color.val')).toThrow('not a string property');
    });

    it('throws when setting string values on a float property', () => {
      bridge.newProperty('node.color.val', MuPropertyType.Float, 1);
      expect(() => bridge.setStringProperty('node.color.val', ['hello'])).toThrow(
        'not a string property',
      );
    });
  });

  // ---- Byte property get/set ----

  describe('getByteProperty / setByteProperty', () => {
    beforeEach(() => {
      bridge.newProperty('node.data.bytes', MuPropertyType.Byte, 4);
    });

    it('round-trips byte values', () => {
      bridge.setByteProperty('node.data.bytes', [255, 128, 0, 64]);
      expect(bridge.getByteProperty('node.data.bytes')).toEqual([255, 128, 0, 64]);
    });
  });

  // ---- Half property get/set ----

  describe('getHalfProperty / setHalfProperty', () => {
    beforeEach(() => {
      bridge.newProperty('node.data.halfs', MuPropertyType.Half, 2);
    });

    it('round-trips half values', () => {
      bridge.setHalfProperty('node.data.halfs', [0.5, 1.5]);
      expect(bridge.getHalfProperty('node.data.halfs')).toEqual([0.5, 1.5]);
    });
  });

  // ---- Insert operations ----

  describe('insertFloatProperty', () => {
    beforeEach(() => {
      bridge.newProperty('node.points.x', MuPropertyType.Float, 3);
      bridge.setFloatProperty('node.points.x', [1.0, 2.0, 3.0]);
    });

    it('inserts values at the beginning', () => {
      bridge.insertFloatProperty('node.points.x', [0.5], 0);
      expect(bridge.getFloatProperty('node.points.x')).toEqual([0.5, 1.0, 2.0, 3.0]);
    });

    it('inserts values in the middle', () => {
      bridge.insertFloatProperty('node.points.x', [1.5], 1);
      expect(bridge.getFloatProperty('node.points.x')).toEqual([1.0, 1.5, 2.0, 3.0]);
    });

    it('inserts values at the end', () => {
      bridge.insertFloatProperty('node.points.x', [4.0], 3);
      expect(bridge.getFloatProperty('node.points.x')).toEqual([1.0, 2.0, 3.0, 4.0]);
    });

    it('clamps negative index to 0', () => {
      bridge.insertFloatProperty('node.points.x', [0.0], -5);
      expect(bridge.getFloatProperty('node.points.x')).toEqual([0.0, 1.0, 2.0, 3.0]);
    });

    it('clamps out-of-range index to end', () => {
      bridge.insertFloatProperty('node.points.x', [99], 100);
      expect(bridge.getFloatProperty('node.points.x')).toEqual([1.0, 2.0, 3.0, 99]);
    });
  });

  describe('insertIntProperty', () => {
    it('inserts int values', () => {
      bridge.newProperty('node.cut.frames', MuPropertyType.Int, 2);
      bridge.setIntProperty('node.cut.frames', [10, 20]);
      bridge.insertIntProperty('node.cut.frames', [15], 1);
      expect(bridge.getIntProperty('node.cut.frames')).toEqual([10, 15, 20]);
    });
  });

  describe('insertStringProperty', () => {
    it('inserts string values', () => {
      bridge.newProperty('node.media.layers', MuPropertyType.String, 2);
      bridge.setStringProperty('node.media.layers', ['beauty', 'diffuse']);
      bridge.insertStringProperty('node.media.layers', ['specular'], 1);
      expect(bridge.getStringProperty('node.media.layers')).toEqual(['beauty', 'specular', 'diffuse']);
    });

    it('throws for non-string property', () => {
      bridge.newProperty('node.color.val', MuPropertyType.Float, 1);
      expect(() => bridge.insertStringProperty('node.color.val', ['x'], 0)).toThrow(
        'not a string property',
      );
    });
  });

  describe('insertByteProperty', () => {
    it('inserts byte values', () => {
      bridge.newProperty('node.data.raw', MuPropertyType.Byte, 2);
      bridge.setByteProperty('node.data.raw', [10, 20]);
      bridge.insertByteProperty('node.data.raw', [15], 1);
      expect(bridge.getByteProperty('node.data.raw')).toEqual([10, 15, 20]);
    });
  });

  describe('insertHalfProperty', () => {
    it('inserts half values', () => {
      bridge.newProperty('node.data.halfvals', MuPropertyType.Half, 2);
      bridge.setHalfProperty('node.data.halfvals', [0.5, 1.5]);
      bridge.insertHalfProperty('node.data.halfvals', [1.0], 1);
      expect(bridge.getHalfProperty('node.data.halfvals')).toEqual([0.5, 1.0, 1.5]);
    });
  });

  // ---- Hash path resolution ----

  describe('hash path resolution (#TypeName)', () => {
    it('resolves hash paths to matching node', () => {
      bridge.newProperty('RVColor.color.gamma', MuPropertyType.Float, 1);
      bridge.setFloatProperty('RVColor.color.gamma', [2.2]);
      expect(bridge.getFloatProperty('#RVColor.color.gamma')).toEqual([2.2]);
    });

    it('resolves hash paths when node name contains type name', () => {
      bridge.newProperty('sourceGroup000_RVColor.color.gamma', MuPropertyType.Float, 1);
      bridge.setFloatProperty('sourceGroup000_RVColor.color.gamma', [1.8]);
      expect(bridge.getFloatProperty('#RVColor.color.gamma')).toEqual([1.8]);
    });

    it('propertyExists works with hash paths', () => {
      bridge.newProperty('RVColor.color.gamma', MuPropertyType.Float, 1);
      expect(bridge.propertyExists('#RVColor.color.gamma')).toBe(true);
      expect(bridge.propertyExists('#NoSuchType.color.gamma')).toBe(false);
    });

    it('propertyInfo works with hash paths', () => {
      bridge.newProperty('RVColor.color.gamma', MuPropertyType.Float, 1);
      const info = bridge.propertyInfo('#RVColor.color.gamma');
      expect(info.name).toBe('RVColor.color.gamma');
      expect(info.type).toBe('float');
    });
  });

  // ---- Quiet mode (no notifications) ----

  describe('quiet mode', () => {
    it('does not emit change notification when quiet=true', () => {
      bridge.newProperty('node.color.gamma', MuPropertyType.Float, 1);
      const spy = vi.fn();
      bridge.onPropertyChanged(spy);
      bridge.setFloatProperty('node.color.gamma', [2.2], true);
      expect(spy).not.toHaveBeenCalled();
    });

    it('emits change notification when quiet=false', () => {
      bridge.newProperty('node.color.gamma', MuPropertyType.Float, 1);
      const spy = vi.fn();
      bridge.onPropertyChanged(spy);
      bridge.setFloatProperty('node.color.gamma', [2.2], false);
      expect(spy).toHaveBeenCalledWith('node.color.gamma', [2.2]);
    });

    it('emits change notification by default', () => {
      bridge.newProperty('node.color.gamma', MuPropertyType.Float, 1);
      const spy = vi.fn();
      bridge.onPropertyChanged(spy);
      bridge.setFloatProperty('node.color.gamma', [2.2]);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Listener unsubscribe ----

  describe('onPropertyChanged unsubscribe', () => {
    it('stops receiving notifications after unsubscribe', () => {
      bridge.newProperty('node.color.gamma', MuPropertyType.Float, 1);
      const spy = vi.fn();
      const unsub = bridge.onPropertyChanged(spy);
      bridge.setFloatProperty('node.color.gamma', [1.0]);
      expect(spy).toHaveBeenCalledTimes(1);

      unsub();
      bridge.setFloatProperty('node.color.gamma', [2.0]);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  // ---- setStored / clear / size ----

  describe('setStored', () => {
    it('directly sets a stored property', () => {
      const prop: StoredProperty = {
        type: MuPropertyType.Float,
        dimensions: [3],
        userDefined: false,
        info: 'RGB gamma',
        data: [2.2, 2.2, 2.2],
      };
      bridge.setStored('RVColor.color.gamma', prop);
      expect(bridge.getFloatProperty('RVColor.color.gamma')).toEqual([2.2, 2.2, 2.2]);
      expect(bridge.propertyInfo('RVColor.color.gamma').userDefined).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all properties', () => {
      bridge.newProperty('a.b.c', MuPropertyType.Float, 1);
      bridge.newProperty('d.e.f', MuPropertyType.Int, 1);
      expect(bridge.size).toBe(2);
      bridge.clear();
      expect(bridge.size).toBe(0);
      expect(bridge.propertyExists('a.b.c')).toBe(false);
    });
  });

  describe('size', () => {
    it('reflects number of stored properties', () => {
      expect(bridge.size).toBe(0);
      bridge.newProperty('a.b.c', MuPropertyType.Float, 1);
      expect(bridge.size).toBe(1);
    });
  });

  // ---- ND property dimension preservation (Issue #249) ----

  describe('ND property dimension preservation', () => {
    it('preserves [4,4] dimensions after setFloatProperty', () => {
      bridge.newNDProperty('node.transform.matrix', MuPropertyType.Float, [4, 4]);
      const values = Array.from({ length: 16 }, (_, i) => i + 1);
      bridge.setFloatProperty('node.transform.matrix', values);
      const info = bridge.propertyInfo('node.transform.matrix');
      expect(info.dimensions).toEqual([4, 4]);
      expect(info.size).toBe(16);
    });

    it('preserves [4,4] dimensions after setIntProperty', () => {
      bridge.newNDProperty('node.transform.intmat', MuPropertyType.Int, [4, 4]);
      bridge.setIntProperty('node.transform.intmat', Array(16).fill(0));
      expect(bridge.propertyInfo('node.transform.intmat').dimensions).toEqual([4, 4]);
    });

    it('preserves ND string dimensions after setStringProperty', () => {
      bridge.newNDProperty('node.data.grid', MuPropertyType.String, [3, 2]);
      bridge.setStringProperty('node.data.grid', ['a', 'b', 'c', 'd', 'e', 'f']);
      expect(bridge.propertyInfo('node.data.grid').dimensions).toEqual([3, 2]);
    });

    it('updates outermost dimension on insert for ND float property', () => {
      bridge.newNDProperty('node.transform.matrix', MuPropertyType.Float, [4, 4]);
      bridge.setFloatProperty('node.transform.matrix', Array(16).fill(1));
      // Insert one full row (4 elements) at the end
      bridge.insertFloatProperty('node.transform.matrix', [9, 9, 9, 9], 16);
      const info = bridge.propertyInfo('node.transform.matrix');
      expect(info.dimensions).toEqual([5, 4]);
      expect(info.size).toBe(20);
    });

    it('updates outermost dimension on insert for ND string property', () => {
      bridge.newNDProperty('node.data.grid', MuPropertyType.String, [2, 3]);
      bridge.setStringProperty('node.data.grid', ['a', 'b', 'c', 'd', 'e', 'f']);
      bridge.insertStringProperty('node.data.grid', ['g', 'h', 'i'], 6);
      const info = bridge.propertyInfo('node.data.grid');
      expect(info.dimensions).toEqual([3, 3]);
      expect(info.size).toBe(9);
    });

    it('1D property dimensions update to [newLength] after set', () => {
      bridge.newProperty('node.points.x', MuPropertyType.Float, 3);
      bridge.setFloatProperty('node.points.x', [1.0, 2.0, 3.0, 4.0, 5.0]);
      const info = bridge.propertyInfo('node.points.x');
      expect(info.dimensions).toEqual([5]);
      expect(info.size).toBe(5);
    });

    it('1D property dimensions update to [newLength] after insert', () => {
      bridge.newProperty('node.points.x', MuPropertyType.Float, 3);
      bridge.setFloatProperty('node.points.x', [1.0, 2.0, 3.0]);
      bridge.insertFloatProperty('node.points.x', [4.0], 3);
      const info = bridge.propertyInfo('node.points.x');
      expect(info.dimensions).toEqual([4]);
      expect(info.size).toBe(4);
    });

    it('propertyInfo reflects correct shape after multiple set operations on ND property', () => {
      bridge.newNDProperty('node.color.lut', MuPropertyType.Float, [2, 3, 4]);
      bridge.setFloatProperty('node.color.lut', Array(24).fill(0.5));
      expect(bridge.propertyInfo('node.color.lut').dimensions).toEqual([2, 3, 4]);
      bridge.setFloatProperty('node.color.lut', Array(24).fill(1.0));
      expect(bridge.propertyInfo('node.color.lut').dimensions).toEqual([2, 3, 4]);
    });
  });

  // ---- Cross-type numeric compatibility ----

  describe('cross-type numeric compatibility', () => {
    it('allows reading float property with getIntProperty (numeric types are interchangeable)', () => {
      bridge.newProperty('node.val.x', MuPropertyType.Float, 1);
      bridge.setFloatProperty('node.val.x', [3.14]);
      // getIntProperty should work since both are numeric
      expect(bridge.getIntProperty('node.val.x')).toEqual([3.14]);
    });

    it('allows setting int property with setFloatProperty', () => {
      bridge.newProperty('node.val.x', MuPropertyType.Int, 1);
      bridge.setFloatProperty('node.val.x', [42]);
      expect(bridge.getIntProperty('node.val.x')).toEqual([42]);
    });
  });

  // ---- ND property validation (Issue #249 regressions) ----

  describe('ND property set/insert validation', () => {
    it('throws TypeError when setFloatProperty value count mismatches [4,4] ND dimensions', () => {
      bridge.newNDProperty('node.transform.matrix', MuPropertyType.Float, [4, 4]);
      expect(() => bridge.setFloatProperty('node.transform.matrix', new Array(10).fill(0))).toThrow(TypeError);
      expect(() => bridge.setFloatProperty('node.transform.matrix', new Array(10).fill(0))).toThrow(
        /Property "node\.transform\.matrix": ND property set requires exactly 16 values \(dimensions: \[4,4\]\), got 10/
      );
    });

    it('throws TypeError when insertFloatProperty value count is not a multiple of inner size for [4,4] ND', () => {
      bridge.newNDProperty('node.transform.matrix', MuPropertyType.Float, [4, 4]);
      expect(() => bridge.insertFloatProperty('node.transform.matrix', [1, 2, 3], 0)).toThrow(TypeError);
      expect(() => bridge.insertFloatProperty('node.transform.matrix', [1, 2, 3], 0)).toThrow(
        /Property "node\.transform\.matrix": ND property insert requires value count to be a multiple of inner size 4 \(dimensions: \[4,4\]\), got 3/
      );
    });

    it('throws TypeError when setStringProperty value count mismatches [2,3] ND dimensions', () => {
      bridge.newNDProperty('node.data.grid', MuPropertyType.String, [2, 3]);
      expect(() => bridge.setStringProperty('node.data.grid', ['a', 'b'])).toThrow(TypeError);
      expect(() => bridge.setStringProperty('node.data.grid', ['a', 'b'])).toThrow(
        /Property "node\.data\.grid": ND property set requires exactly 6 values \(dimensions: \[2,3\]\), got 2/
      );
    });

    it('throws TypeError when insertStringProperty value count is not a multiple of inner size for [2,3] ND', () => {
      bridge.newNDProperty('node.data.grid', MuPropertyType.String, [2, 3]);
      expect(() => bridge.insertStringProperty('node.data.grid', ['a', 'b'], 0)).toThrow(TypeError);
      expect(() => bridge.insertStringProperty('node.data.grid', ['a', 'b'], 0)).toThrow(
        /Property "node\.data\.grid": ND property insert requires value count to be a multiple of inner size 3 \(dimensions: \[2,3\]\), got 2/
      );
    });

    it('inserts 12 values into a [2,3,4] 3D property and updates dimensions to [3,3,4]', () => {
      bridge.newNDProperty('node.color.lut', MuPropertyType.Float, [2, 3, 4]);
      // Total = 2*3*4 = 24 elements, set them
      bridge.setFloatProperty('node.color.lut', new Array(24).fill(1));
      // innerSize = 3*4 = 12; inserting 12 values adds one outermost "slice"
      bridge.insertFloatProperty('node.color.lut', new Array(12).fill(2), 0);
      const info = bridge.propertyInfo('node.color.lut');
      expect(info.dimensions).toEqual([3, 3, 4]);
      expect(info.size).toBe(36);
    });

    it('throws TypeError when insertFloatProperty index is not aligned to inner size for [4,4] ND', () => {
      bridge.newNDProperty('node.transform.matrix', MuPropertyType.Float, [4, 4]);
      bridge.setFloatProperty('node.transform.matrix', new Array(16).fill(0));
      // innerSize = 4, index 2 is not aligned
      expect(() => bridge.insertFloatProperty('node.transform.matrix', [1, 2, 3, 4], 2)).toThrow(TypeError);
      expect(() => bridge.insertFloatProperty('node.transform.matrix', [1, 2, 3, 4], 2)).toThrow(
        /Property "node\.transform\.matrix": ND property insert requires index to be aligned to inner size 4.*got index 2/
      );
    });
  });
});
