/**
 * Property Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Property, PropertyContainer, PropertyInfo } from './Property';

describe('Property', () => {
  describe('initialization', () => {
    it('PRP-001: stores default value', () => {
      const prop = new Property<number>({
        name: 'testProp',
        defaultValue: 42,
      });

      expect(prop.defaultValue).toBe(42);
      expect(prop.value).toBe(42);
    });

    it('stores metadata', () => {
      const prop = new Property<number>({
        name: 'testProp',
        defaultValue: 0,
        min: 0,
        max: 100,
        step: 1,
        label: 'Test Property',
        group: 'Test Group',
      });

      expect(prop.name).toBe('testProp');
      expect(prop.min).toBe(0);
      expect(prop.max).toBe(100);
      expect(prop.step).toBe(1);
      expect(prop.label).toBe('Test Property');
      expect(prop.group).toBe('Test Group');
    });

    it('uses name as label if not specified', () => {
      const prop = new Property<number>({
        name: 'testProp',
        defaultValue: 0,
      });

      expect(prop.label).toBe('testProp');
    });
  });

  describe('setValue', () => {
    it('PRP-002: updates value', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 0,
      });

      prop.value = 50;
      expect(prop.value).toBe(50);
    });

    it('clamps to min value', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 50,
        min: 0,
      });

      prop.value = -10;
      expect(prop.value).toBe(0);
    });

    it('clamps to max value', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 50,
        max: 100,
      });

      prop.value = 150;
      expect(prop.value).toBe(100);
    });

    it('PRP-004: emits changed signal', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 0,
      });

      const listener = vi.fn();
      prop.changed.connect(listener);

      prop.value = 50;

      expect(listener).toHaveBeenCalledWith(50, 0);
    });

    it('does not emit for same value', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 50,
      });

      const listener = vi.fn();
      prop.changed.connect(listener);

      prop.value = 50;

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('PRP-003: restores default value', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 42,
      });

      prop.value = 100;
      expect(prop.value).toBe(100);

      prop.reset();
      expect(prop.value).toBe(42);
    });

    it('emits changed signal on reset', () => {
      const prop = new Property<number>({
        name: 'test',
        defaultValue: 0,
      });

      prop.value = 50;

      const listener = vi.fn();
      prop.changed.connect(listener);

      prop.reset();

      expect(listener).toHaveBeenCalledWith(0, 50);
    });
  });

  describe('toJSON', () => {
    it('serializes property', () => {
      const prop = new Property<string>({
        name: 'test',
        defaultValue: 'hello',
      });

      prop.value = 'world';

      const json = prop.toJSON();
      expect(json.name).toBe('test');
      expect(json.value).toBe('world');
    });
  });

  describe('with different types', () => {
    it('works with strings', () => {
      const prop = new Property<string>({
        name: 'text',
        defaultValue: 'default',
      });

      prop.value = 'changed';
      expect(prop.value).toBe('changed');
    });

    it('works with booleans', () => {
      const prop = new Property<boolean>({
        name: 'flag',
        defaultValue: false,
      });

      prop.value = true;
      expect(prop.value).toBe(true);
    });

    it('works with arrays', () => {
      const prop = new Property<number[]>({
        name: 'array',
        defaultValue: [1, 2, 3],
      });

      prop.value = [4, 5, 6];
      expect(prop.value).toEqual([4, 5, 6]);
    });
  });
});

describe('PropertyContainer', () => {
  let container: PropertyContainer;

  beforeEach(() => {
    container = new PropertyContainer();
  });

  describe('add', () => {
    it('adds property to container', () => {
      const prop = container.add<number>({
        name: 'test',
        defaultValue: 0,
      });

      expect(container.has('test')).toBe(true);
      expect(container.get('test')).toBe(prop);
    });

    it('returns the created property', () => {
      const prop = container.add<number>({
        name: 'test',
        defaultValue: 42,
      });

      expect(prop.value).toBe(42);
    });
  });

  describe('get', () => {
    it('returns property by name', () => {
      container.add<number>({
        name: 'test',
        defaultValue: 0,
      });

      const prop = container.get<number>('test');
      expect(prop).toBeDefined();
      expect(prop?.value).toBe(0);
    });

    it('returns undefined for non-existent property', () => {
      expect(container.get('nonexistent')).toBeUndefined();
    });
  });

  describe('getValue', () => {
    it('returns property value', () => {
      container.add<number>({
        name: 'test',
        defaultValue: 42,
      });

      expect(container.getValue('test')).toBe(42);
    });

    it('returns undefined for non-existent property', () => {
      expect(container.getValue('nonexistent')).toBeUndefined();
    });
  });

  describe('setValue', () => {
    it('sets property value', () => {
      container.add<number>({
        name: 'test',
        defaultValue: 0,
      });

      container.setValue('test', 100);
      expect(container.getValue('test')).toBe(100);
    });

    it('does nothing for non-existent property', () => {
      // Should not throw
      container.setValue('nonexistent', 100);
    });
  });

  describe('has', () => {
    it('returns true for existing property', () => {
      container.add({ name: 'test', defaultValue: 0 });
      expect(container.has('test')).toBe(true);
    });

    it('returns false for non-existent property', () => {
      expect(container.has('test')).toBe(false);
    });
  });

  describe('all', () => {
    it('iterates over all properties', () => {
      container.add({ name: 'prop1', defaultValue: 1 });
      container.add({ name: 'prop2', defaultValue: 2 });
      container.add({ name: 'prop3', defaultValue: 3 });

      const props = Array.from(container.all());
      expect(props.length).toBe(3);
    });
  });

  describe('names', () => {
    it('iterates over all property names', () => {
      container.add({ name: 'prop1', defaultValue: 1 });
      container.add({ name: 'prop2', defaultValue: 2 });

      const names = Array.from(container.names());
      expect(names).toContain('prop1');
      expect(names).toContain('prop2');
    });
  });

  describe('resetAll', () => {
    it('resets all properties to defaults', () => {
      container.add({ name: 'prop1', defaultValue: 0 });
      container.add({ name: 'prop2', defaultValue: 'default' });

      container.setValue('prop1', 100);
      container.setValue('prop2', 'changed');

      container.resetAll();

      expect(container.getValue('prop1')).toBe(0);
      expect(container.getValue('prop2')).toBe('default');
    });
  });

  describe('toJSON', () => {
    it('serializes all properties', () => {
      container.add({ name: 'num', defaultValue: 42 });
      container.add({ name: 'str', defaultValue: 'hello' });
      container.add({ name: 'bool', defaultValue: true });

      const json = container.toJSON();

      expect(json.num).toBe(42);
      expect(json.str).toBe('hello');
      expect(json.bool).toBe(true);
    });
  });

  describe('fromJSON', () => {
    it('restores property values', () => {
      container.add({ name: 'num', defaultValue: 0 });
      container.add({ name: 'str', defaultValue: '' });

      container.fromJSON({
        num: 100,
        str: 'loaded',
      });

      expect(container.getValue('num')).toBe(100);
      expect(container.getValue('str')).toBe('loaded');
    });

    it('ignores unknown properties', () => {
      container.add({ name: 'known', defaultValue: 0 });

      // Should not throw
      container.fromJSON({
        known: 50,
        unknown: 'value',
      });

      expect(container.getValue('known')).toBe(50);
    });
  });

  describe('propertyChanged signal', () => {
    it('forwards property change events', () => {
      container.add({ name: 'test', defaultValue: 0 });

      const listener = vi.fn();
      container.propertyChanged.connect(listener);

      container.setValue('test', 50);

      expect(listener).toHaveBeenCalledWith(
        { name: 'test', value: 50 },
        { name: 'test', value: 0 }
      );
    });
  });
});
