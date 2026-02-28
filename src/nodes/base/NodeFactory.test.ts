/**
 * NodeFactory Unit Tests
 */

import { describe, it, expect, afterEach } from 'vitest';
import { NodeFactory } from './NodeFactory';
import type { IPNode } from './IPNode';

describe('NodeFactory', () => {
  const registeredTypes: string[] = [];

  afterEach(() => {
    for (const type of registeredTypes) {
      NodeFactory.unregister(type);
    }
    registeredTypes.length = 0;
  });

  it('NF-001: register and create node', () => {
    const creator = () => ({ type: 'TestNode' }) as unknown as IPNode;
    NodeFactory.register('TestNodeNF001', creator);
    registeredTypes.push('TestNodeNF001');
    const node = NodeFactory.create('TestNodeNF001');
    expect(node).not.toBeNull();
  });

  it('NF-002: isRegistered returns true for registered type', () => {
    NodeFactory.register('TestNodeNF002', () => ({}) as unknown as IPNode);
    registeredTypes.push('TestNodeNF002');
    expect(NodeFactory.isRegistered('TestNodeNF002')).toBe(true);
  });

  it('NF-003: isRegistered returns false for unregistered type', () => {
    expect(NodeFactory.isRegistered('NonExistentType')).toBe(false);
  });

  it('NF-004: create returns null for unregistered type', () => {
    expect(NodeFactory.create('NonExistentType')).toBeNull();
  });

  it('NF-005: unregister removes node type', () => {
    NodeFactory.register('TestNodeNF005', () => ({}) as unknown as IPNode);
    registeredTypes.push('TestNodeNF005');
    expect(NodeFactory.isRegistered('TestNodeNF005')).toBe(true);
    expect(NodeFactory.unregister('TestNodeNF005')).toBe(true);
    expect(NodeFactory.isRegistered('TestNodeNF005')).toBe(false);
  });

  it('NF-006: create returns null after unregister', () => {
    NodeFactory.register('TestNodeNF006', () => ({}) as unknown as IPNode);
    registeredTypes.push('TestNodeNF006');
    expect(NodeFactory.create('TestNodeNF006')).not.toBeNull();
    NodeFactory.unregister('TestNodeNF006');
    expect(NodeFactory.create('TestNodeNF006')).toBeNull();
  });

  it('NF-007: unregister returns false for unknown type', () => {
    expect(NodeFactory.unregister('NonExistentType')).toBe(false);
  });

  it('NF-008: getRegisteredTypes includes registered type', () => {
    NodeFactory.register('TestNodeNF008', () => ({}) as unknown as IPNode);
    registeredTypes.push('TestNodeNF008');
    expect(NodeFactory.getRegisteredTypes()).toContain('TestNodeNF008');
  });
});
