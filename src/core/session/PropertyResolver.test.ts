/**
 * PropertyResolver Unit Tests
 *
 * Tests for OpenRV-compatible property addressing modes:
 * - Hash addressing (#Protocol.component.property)
 * - At addressing (@Protocol)
 * - Edge cases: missing nodes, missing properties, multiple matches
 * - GTOData-based resolution
 */

import { describe, it, expect } from 'vitest';
import {
  parseHashAddress,
  parseAtAddress,
  resolveByHash,
  resolveByAt,
  resolveGTOByHash,
  resolveGTOByAt,
  resolveProperty,
} from './PropertyResolver';
import { Graph } from '../graph/Graph';
import type { GTOData } from 'gto-js';

// --- Helpers ---

/**
 * Minimal concrete IPNode for testing.
 * We only need type, name, properties, and the abstract process method.
 */
import { IPNode } from '../../nodes/base/IPNode';
import type { IPImage } from '../image/Image';
import type { EvalContext } from '../graph/Graph';

class TestNode extends IPNode {
  constructor(type: string, name?: string) {
    super(type, name);
  }

  protected process(_context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    return null;
  }
}

function createGraphWithNodes(
  nodes: Array<{ type: string; name?: string; props?: Record<string, unknown> }>,
): Graph {
  const graph = new Graph();
  for (const spec of nodes) {
    const node = new TestNode(spec.type, spec.name);
    if (spec.props) {
      for (const [key, value] of Object.entries(spec.props)) {
        node.properties.add({ name: key, defaultValue: value });
      }
    }
    graph.addNode(node);
  }
  return graph;
}

function createGTOData(
  objects: Array<{
    name: string;
    protocol: string;
    components?: Record<string, Record<string, { type: string; data: unknown[] }>>;
  }>,
): GTOData {
  return {
    version: 4,
    objects: objects.map((obj) => ({
      name: obj.name,
      protocol: obj.protocol,
      protocolVersion: 1,
      components: Object.fromEntries(
        Object.entries(obj.components ?? {}).map(([compName, props]) => [
          compName,
          {
            interpretation: '',
            properties: Object.fromEntries(
              Object.entries(props).map(([propName, propData]) => [
                propName,
                {
                  type: propData.type,
                  size: propData.data.length,
                  width: 1,
                  interpretation: '',
                  data: propData.data,
                },
              ]),
            ),
          },
        ]),
      ),
    })),
  };
}

// --- parseHashAddress ---

describe('parseHashAddress', () => {
  it('parses a valid hash address', () => {
    const result = parseHashAddress('#RVColor.color.exposure');
    expect(result).toEqual({
      protocol: 'RVColor',
      component: 'color',
      property: 'exposure',
    });
  });

  it('returns null for address without hash prefix', () => {
    expect(parseHashAddress('RVColor.color.exposure')).toBeNull();
  });

  it('returns null for at-prefixed address', () => {
    expect(parseHashAddress('@RVColor')).toBeNull();
  });

  it('returns null for address with too few parts', () => {
    expect(parseHashAddress('#RVColor.color')).toBeNull();
  });

  it('returns null for address with too many parts', () => {
    expect(parseHashAddress('#RVColor.color.exposure.extra')).toBeNull();
  });

  it('returns null for empty address', () => {
    expect(parseHashAddress('')).toBeNull();
  });

  it('returns null for hash-only', () => {
    expect(parseHashAddress('#')).toBeNull();
  });

  it('returns null for empty segments', () => {
    expect(parseHashAddress('#..')).toBeNull();
    expect(parseHashAddress('#RVColor..')).toBeNull();
    expect(parseHashAddress('#..exposure')).toBeNull();
  });
});

// --- parseAtAddress ---

describe('parseAtAddress', () => {
  it('parses a valid at address', () => {
    const result = parseAtAddress('@RVDisplayColor');
    expect(result).toEqual({ protocol: 'RVDisplayColor' });
  });

  it('returns null for address without at prefix', () => {
    expect(parseAtAddress('RVDisplayColor')).toBeNull();
  });

  it('returns null for hash-prefixed address', () => {
    expect(parseAtAddress('#RVColor.color.exposure')).toBeNull();
  });

  it('returns null for at address with dots', () => {
    expect(parseAtAddress('@RVColor.color')).toBeNull();
  });

  it('returns null for empty address', () => {
    expect(parseAtAddress('')).toBeNull();
  });

  it('returns null for at-only', () => {
    expect(parseAtAddress('@')).toBeNull();
  });
});

// --- resolveByHash (Graph) ---

describe('resolveByHash', () => {
  it('resolves #RVColor.color.exposure correctly', () => {
    const graph = createGraphWithNodes([
      { type: 'RVColor', props: { exposure: 1.5 } },
    ]);

    const results = resolveByHash(graph, '#RVColor.color.exposure');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe(1.5);
    expect(results[0]!.component).toBe('color');
    expect(results[0]!.property).toBe('exposure');
    expect(results[0]!.node.type).toBe('RVColor');
  });

  it('returns empty array for missing protocol', () => {
    const graph = createGraphWithNodes([
      { type: 'RVColor', props: { exposure: 1.5 } },
    ]);

    const results = resolveByHash(graph, '#RVNonExistent.color.exposure');
    expect(results).toHaveLength(0);
  });

  it('returns node with null value for missing property', () => {
    const graph = createGraphWithNodes([
      { type: 'RVColor', props: { exposure: 1.5 } },
    ]);

    const results = resolveByHash(graph, '#RVColor.color.nonexistent');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBeNull();
    expect(results[0]!.node.type).toBe('RVColor');
  });

  it('finds multiple nodes matching same protocol', () => {
    const graph = createGraphWithNodes([
      { type: 'RVColor', props: { exposure: 1.0 } },
      { type: 'RVColor', props: { exposure: 2.0 } },
      { type: 'RVDisplayColor', props: { brightness: 0.5 } },
    ]);

    const results = resolveByHash(graph, '#RVColor.color.exposure');
    expect(results).toHaveLength(2);
    expect(results[0]!.value).toBe(1.0);
    expect(results[1]!.value).toBe(2.0);
  });

  it('returns empty array for invalid address', () => {
    const graph = createGraphWithNodes([
      { type: 'RVColor', props: { exposure: 1.5 } },
    ]);

    expect(resolveByHash(graph, 'invalid')).toHaveLength(0);
    expect(resolveByHash(graph, '')).toHaveLength(0);
  });

  it('resolves component.property key as fallback', () => {
    const graph = createGraphWithNodes([
      { type: 'RVColor', props: { 'color.exposure': 3.0 } },
    ]);

    const results = resolveByHash(graph, '#RVColor.color.exposure');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe(3.0);
  });

  it('prefers bare property name over component.property key', () => {
    const graph = createGraphWithNodes([
      { type: 'RVColor', props: { exposure: 1.5, 'color.exposure': 3.0 } },
    ]);

    const results = resolveByHash(graph, '#RVColor.color.exposure');
    expect(results).toHaveLength(1);
    // bare name takes priority
    expect(results[0]!.value).toBe(1.5);
  });

  it('works with an empty graph', () => {
    const graph = new Graph();
    const results = resolveByHash(graph, '#RVColor.color.exposure');
    expect(results).toHaveLength(0);
  });
});

// --- resolveByAt (Graph) ---

describe('resolveByAt', () => {
  it('finds correct nodes by @RVDisplayColor', () => {
    const graph = createGraphWithNodes([
      { type: 'RVDisplayColor', name: 'display1' },
      { type: 'RVColor', name: 'color1' },
      { type: 'RVDisplayColor', name: 'display2' },
    ]);

    const results = resolveByAt(graph, '@RVDisplayColor');
    expect(results).toHaveLength(2);
    expect(results[0]!.node.type).toBe('RVDisplayColor');
    expect(results[1]!.node.type).toBe('RVDisplayColor');
  });

  it('returns empty array for missing protocol', () => {
    const graph = createGraphWithNodes([
      { type: 'RVColor', name: 'color1' },
    ]);

    const results = resolveByAt(graph, '@RVNonExistent');
    expect(results).toHaveLength(0);
  });

  it('returns empty array for invalid address', () => {
    const graph = createGraphWithNodes([
      { type: 'RVColor' },
    ]);

    expect(resolveByAt(graph, 'invalid')).toHaveLength(0);
    expect(resolveByAt(graph, '')).toHaveLength(0);
    expect(resolveByAt(graph, '@')).toHaveLength(0);
  });

  it('works with an empty graph', () => {
    const graph = new Graph();
    const results = resolveByAt(graph, '@RVColor');
    expect(results).toHaveLength(0);
  });
});

// --- resolveGTOByHash (GTOData) ---

describe('resolveGTOByHash', () => {
  it('resolves component.property from GTO objects', () => {
    const data = createGTOData([
      {
        name: 'rvColor',
        protocol: 'RVColor',
        components: {
          color: {
            exposure: { type: 'float', data: [1.5] },
            gamma: { type: 'float', data: [2.2] },
          },
        },
      },
    ]);

    const results = resolveGTOByHash(data, '#RVColor.color.exposure');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBe(1.5);
    expect(results[0]!.object.name).toBe('rvColor');
  });

  it('returns null value for missing component', () => {
    const data = createGTOData([
      {
        name: 'rvColor',
        protocol: 'RVColor',
        components: {
          color: {
            exposure: { type: 'float', data: [1.5] },
          },
        },
      },
    ]);

    const results = resolveGTOByHash(data, '#RVColor.transform.rotate');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBeNull();
  });

  it('returns null value for missing property in existing component', () => {
    const data = createGTOData([
      {
        name: 'rvColor',
        protocol: 'RVColor',
        components: {
          color: {
            exposure: { type: 'float', data: [1.5] },
          },
        },
      },
    ]);

    const results = resolveGTOByHash(data, '#RVColor.color.nonexistent');
    expect(results).toHaveLength(1);
    expect(results[0]!.value).toBeNull();
  });

  it('returns empty array for missing protocol', () => {
    const data = createGTOData([
      {
        name: 'rvColor',
        protocol: 'RVColor',
      },
    ]);

    const results = resolveGTOByHash(data, '#NoSuchProtocol.color.exposure');
    expect(results).toHaveLength(0);
  });

  it('finds multiple GTO objects with same protocol', () => {
    const data = createGTOData([
      {
        name: 'rvColor1',
        protocol: 'RVColor',
        components: {
          color: { exposure: { type: 'float', data: [1.0] } },
        },
      },
      {
        name: 'rvColor2',
        protocol: 'RVColor',
        components: {
          color: { exposure: { type: 'float', data: [2.5] } },
        },
      },
    ]);

    const results = resolveGTOByHash(data, '#RVColor.color.exposure');
    expect(results).toHaveLength(2);
    expect(results[0]!.value).toBe(1.0);
    expect(results[1]!.value).toBe(2.5);
  });

  it('unwraps single-element arrays', () => {
    const data = createGTOData([
      {
        name: 'rvColor',
        protocol: 'RVColor',
        components: {
          color: { exposure: { type: 'float', data: [1.5] } },
        },
      },
    ]);

    const results = resolveGTOByHash(data, '#RVColor.color.exposure');
    expect(results[0]!.value).toBe(1.5); // unwrapped from [1.5]
  });

  it('preserves multi-element arrays', () => {
    const data = createGTOData([
      {
        name: 'rvColor',
        protocol: 'RVColor',
        components: {
          color: { scale: { type: 'float', data: [1.0, 1.0, 1.0] } },
        },
      },
    ]);

    const results = resolveGTOByHash(data, '#RVColor.color.scale');
    expect(results[0]!.value).toEqual([1.0, 1.0, 1.0]);
  });
});

// --- resolveGTOByAt (GTOData) ---

describe('resolveGTOByAt', () => {
  it('finds GTO objects by protocol', () => {
    const data = createGTOData([
      { name: 'rvColor', protocol: 'RVColor' },
      { name: 'rvDisplay', protocol: 'RVDisplayColor' },
      { name: 'rvDisplay2', protocol: 'RVDisplayColor' },
    ]);

    const results = resolveGTOByAt(data, '@RVDisplayColor');
    expect(results).toHaveLength(2);
    expect(results[0]!.object.name).toBe('rvDisplay');
    expect(results[1]!.object.name).toBe('rvDisplay2');
  });

  it('returns empty array for missing protocol', () => {
    const data = createGTOData([
      { name: 'rvColor', protocol: 'RVColor' },
    ]);

    const results = resolveGTOByAt(data, '@NoSuchProtocol');
    expect(results).toHaveLength(0);
  });

  it('returns empty array for invalid address', () => {
    const data = createGTOData([
      { name: 'rvColor', protocol: 'RVColor' },
    ]);

    expect(resolveGTOByAt(data, 'invalid')).toHaveLength(0);
    expect(resolveGTOByAt(data, '')).toHaveLength(0);
  });
});

// --- resolveProperty (unified) ---

describe('resolveProperty', () => {
  it('dispatches hash addresses to resolveByHash', () => {
    const graph = createGraphWithNodes([
      { type: 'RVColor', props: { exposure: 1.5 } },
    ]);

    const results = resolveProperty(graph, '#RVColor.color.exposure');
    expect(results).not.toBeNull();
    expect(results).toHaveLength(1);
  });

  it('dispatches at addresses to resolveByAt', () => {
    const graph = createGraphWithNodes([
      { type: 'RVDisplayColor' },
    ]);

    const results = resolveProperty(graph, '@RVDisplayColor');
    expect(results).not.toBeNull();
    expect(results).toHaveLength(1);
  });

  it('returns null for unrecognized address format', () => {
    const graph = createGraphWithNodes([
      { type: 'RVColor', props: { exposure: 1.5 } },
    ]);

    expect(resolveProperty(graph, 'plain.string')).toBeNull();
    expect(resolveProperty(graph, '')).toBeNull();
    expect(resolveProperty(graph, '!invalid')).toBeNull();
  });
});
