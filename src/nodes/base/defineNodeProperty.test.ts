import { describe, it, expect, vi } from 'vitest';
import { defineNodeProperty } from './defineNodeProperty';
import { IPNode } from './IPNode';
import type { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';

class TestNode extends IPNode {
  declare testProp: number;
  declare testBool: boolean;
  declare testStr: string;

  constructor() {
    super('Test');
  }

  protected process(_context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    return null;
  }
}

describe('defineNodeProperty', () => {
  it('registers the property in PropertyContainer', () => {
    const node = new TestNode();
    defineNodeProperty(node, 'testProp', { defaultValue: 42 });

    expect(node.properties.has('testProp')).toBe(true);
  });

  it('getter returns the default value after registration', () => {
    const node = new TestNode();
    defineNodeProperty(node, 'testProp', { defaultValue: 10 });

    expect(node.testProp).toBe(10);
  });

  it('setter updates value readable via PropertyContainer', () => {
    const node = new TestNode();
    defineNodeProperty(node, 'testProp', { defaultValue: 0 });

    node.testProp = 99;

    expect(node.properties.getValue('testProp')).toBe(99);
  });

  it('getter reflects value set directly via PropertyContainer', () => {
    const node = new TestNode();
    defineNodeProperty(node, 'testProp', { defaultValue: 0 });

    node.properties.setValue('testProp', 55);

    expect(node.testProp).toBe(55);
  });

  it('clamps numeric values to min/max range', () => {
    const node = new TestNode();
    defineNodeProperty(node, 'testProp', { defaultValue: 5, min: 0, max: 10 });

    node.testProp = 20;
    expect(node.testProp).toBe(10);

    node.testProp = -5;
    expect(node.testProp).toBe(0);

    node.testProp = 7;
    expect(node.testProp).toBe(7);
  });

  it('supports multiple independent properties on the same node', () => {
    const node = new TestNode();
    defineNodeProperty(node, 'testProp', { defaultValue: 1 });
    defineNodeProperty(node, 'testBool', { defaultValue: false });
    defineNodeProperty(node, 'testStr', { defaultValue: 'hello' });

    expect(node.testProp).toBe(1);
    expect(node.testBool).toBe(false);
    expect(node.testStr).toBe('hello');

    node.testProp = 42;
    node.testBool = true;
    node.testStr = 'world';

    expect(node.testProp).toBe(42);
    expect(node.testBool).toBe(true);
    expect(node.testStr).toBe('world');
  });

  it('fires propertyChanged signal when setter is called', () => {
    const node = new TestNode();
    defineNodeProperty(node, 'testProp', { defaultValue: 0 });

    const callback = vi.fn();
    node.properties.propertyChanged.connect(callback);

    node.testProp = 77;

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      { name: 'testProp', value: 77 },
      { name: 'testProp', value: 0 },
    );
  });

  it('does not fire propertyChanged when value is unchanged', () => {
    const node = new TestNode();
    defineNodeProperty(node, 'testProp', { defaultValue: 5 });

    const callback = vi.fn();
    node.properties.propertyChanged.connect(callback);

    node.testProp = 5;

    expect(callback).not.toHaveBeenCalled();
  });

  it('passes through extra PropertyInfo fields (label, group, persistent, animatable)', () => {
    const node = new TestNode();
    defineNodeProperty(node, 'testProp', {
      defaultValue: 0,
      label: 'My Prop',
      group: 'General',
      persistent: true,
      animatable: true,
      step: 0.1,
    });

    const prop = node.properties.get<number>('testProp')!;
    expect(prop.label).toBe('My Prop');
    expect(prop.group).toBe('General');
    expect(prop.persistent).toBe(true);
    expect(prop.animatable).toBe(true);
    expect(prop.step).toBe(0.1);
  });

  it('creates enumerable and configurable property descriptor', () => {
    const node = new TestNode();
    defineNodeProperty(node, 'testProp', { defaultValue: 42 });

    const desc = Object.getOwnPropertyDescriptor(node, 'testProp')!;
    expect(desc.enumerable).toBe(true);
    expect(desc.configurable).toBe(true);
    expect(desc.get).toBeInstanceOf(Function);
    expect(desc.set).toBeInstanceOf(Function);
  });

  it('reset() restores the default value through the getter', () => {
    const node = new TestNode();
    defineNodeProperty(node, 'testProp', { defaultValue: 10 });

    node.testProp = 99;
    expect(node.testProp).toBe(99);

    node.properties.get('testProp')!.reset();
    expect(node.testProp).toBe(10);
  });

  it('defaults label to property name when not provided', () => {
    const node = new TestNode();
    defineNodeProperty(node, 'testProp', { defaultValue: 0 });

    const prop = node.properties.get('testProp')!;
    expect(prop.label).toBe('testProp');
  });

  it('re-defining a property replaces the previous definition', () => {
    const node = new TestNode();
    defineNodeProperty(node, 'testProp', { defaultValue: 10, min: 0, max: 100 });
    node.testProp = 50;

    defineNodeProperty(node, 'testProp', { defaultValue: 99, min: 0, max: 200 });
    // Re-definition resets to new default
    expect(node.testProp).toBe(99);

    node.testProp = 150;
    expect(node.testProp).toBe(150); // new max is 200, so 150 is valid
  });

  it('works correctly with a concrete subclass at runtime', () => {
    class SpecificNode extends IPNode {
      declare opacity: number;
      declare visible: boolean;

      constructor() {
        super('Specific');
        defineNodeProperty(this, 'opacity', { defaultValue: 1, min: 0, max: 1 });
        defineNodeProperty(this, 'visible', { defaultValue: true });
      }

      protected process(): IPImage | null {
        return null;
      }
    }

    const node = new SpecificNode();
    expect(node.opacity).toBe(1);
    expect(node.visible).toBe(true);

    node.opacity = 0.5;
    expect(node.opacity).toBe(0.5);
    expect(node.properties.getValue('opacity')).toBe(0.5);

    node.visible = false;
    expect(node.visible).toBe(false);
  });
});
