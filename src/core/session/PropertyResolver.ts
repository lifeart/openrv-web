/**
 * PropertyResolver - OpenRV-compatible property addressing modes
 *
 * Resolves dynamic property access patterns used in OpenRV scripting:
 * - Hash addressing: `#RVColor.color.exposure` — find nodes by protocol, resolve component.property
 * - At addressing: `@RVDisplayColor` — find nodes by protocol
 *
 * Works against both the live Graph (IPNode) and raw GTOData structures.
 */

import type { Graph } from '../graph/Graph';
import type { IPNode } from '../../nodes/base/IPNode';
import type { GTOData, ObjectData } from 'gto-js';

/**
 * Result of resolving a hash-addressed property (#Protocol.component.property)
 */
export interface HashResolveResult {
  /** The matching node */
  node: IPNode;
  /** The resolved property value, or null if the property was not found */
  value: unknown | null;
  /** The component name from the address */
  component: string;
  /** The property name from the address */
  property: string;
}

/**
 * Result of resolving an at-addressed node (@Protocol)
 */
export interface AtResolveResult {
  /** The matching node */
  node: IPNode;
}

/**
 * Result of resolving a hash address against raw GTOData
 */
export interface GTOHashResolveResult {
  /** The matching GTO object */
  object: ObjectData;
  /** The resolved property value, or null if the property was not found */
  value: unknown | null;
  /** The component name from the address */
  component: string;
  /** The property name from the address */
  property: string;
}

/**
 * Result of resolving an at address against raw GTOData
 */
export interface GTOAtResolveResult {
  /** The matching GTO object */
  object: ObjectData;
}

/**
 * Parse a hash address into its parts.
 *
 * Format: `#Protocol.component.property`
 * Returns null if the address is malformed.
 */
export function parseHashAddress(address: string): { protocol: string; component: string; property: string } | null {
  if (!address.startsWith('#')) return null;
  const parts = address.slice(1).split('.');
  if (parts.length !== 3) return null;
  const [protocol, component, property] = parts;
  if (!protocol || !component || !property) return null;
  return { protocol, component, property };
}

/**
 * Parse an at address into its protocol.
 *
 * Format: `@Protocol`
 * Returns null if the address is malformed.
 */
export function parseAtAddress(address: string): { protocol: string } | null {
  if (!address.startsWith('@')) return null;
  const protocol = address.slice(1);
  if (!protocol || protocol.includes('.')) return null;
  return { protocol };
}

/**
 * Resolve a hash address against the live node graph.
 *
 * Hash addressing (`#RVColor.color.exposure`) finds all nodes whose `type`
 * matches the protocol and attempts to read the `component.property` value
 * from the node's flattened PropertyContainer. Since properties in the graph
 * are stored in a flattened manner (without component prefixes), this looks
 * up the property by its bare name first, then by `component.property` as
 * a fallback key.
 *
 * @param graph - The node graph to search
 * @param address - Hash address string, e.g. `#RVColor.color.exposure`
 * @returns Array of matching results (empty if no nodes match)
 */
export function resolveByHash(graph: Graph, address: string): HashResolveResult[] {
  const parsed = parseHashAddress(address);
  if (!parsed) return [];

  const { protocol, component, property } = parsed;
  const results: HashResolveResult[] = [];

  for (const node of graph.getAllNodes()) {
    if (node.type !== protocol) continue;

    // Try bare property name first (most graph properties are flattened)
    let value: unknown | null = node.properties.getValue(property) ?? null;

    // Fallback: try component.property as a key
    if (value === null) {
      value = node.properties.getValue(`${component}.${property}`) ?? null;
    }

    results.push({ node, value, component, property });
  }

  return results;
}

/**
 * Resolve an at address against the live node graph.
 *
 * At addressing (`@RVDisplayColor`) finds all nodes whose `type` matches
 * the protocol.
 *
 * @param graph - The node graph to search
 * @param address - At address string, e.g. `@RVDisplayColor`
 * @returns Array of matching nodes (empty if none match)
 */
export function resolveByAt(graph: Graph, address: string): AtResolveResult[] {
  const parsed = parseAtAddress(address);
  if (!parsed) return [];

  const results: AtResolveResult[] = [];

  for (const node of graph.getAllNodes()) {
    if (node.type !== parsed.protocol) continue;
    results.push({ node });
  }

  return results;
}

/**
 * Resolve a hash address against raw GTOData.
 *
 * This uses the full component.property structure present in GTO files,
 * which preserves the original OpenRV property hierarchy.
 *
 * @param data - Raw GTOData from a parsed GTO/RV file
 * @param address - Hash address string, e.g. `#RVColor.color.exposure`
 * @returns Array of matching results (empty if no objects match)
 */
export function resolveGTOByHash(data: GTOData, address: string): GTOHashResolveResult[] {
  const parsed = parseHashAddress(address);
  if (!parsed) return [];

  const { protocol, component, property } = parsed;
  const results: GTOHashResolveResult[] = [];

  for (const obj of data.objects) {
    if (obj.protocol !== protocol) continue;

    let value: unknown | null = null;
    const comp = obj.components[component];
    if (comp) {
      const prop = comp.properties[property];
      if (prop && prop.data !== undefined) {
        // Unwrap single-element arrays to match PropertyDTO.value() behavior
        value = prop.data.length === 1 ? prop.data[0] : prop.data;
      }
    }

    results.push({ object: obj, value, component, property });
  }

  return results;
}

/**
 * Resolve an at address against raw GTOData.
 *
 * @param data - Raw GTOData from a parsed GTO/RV file
 * @param address - At address string, e.g. `@RVDisplayColor`
 * @returns Array of matching objects (empty if none match)
 */
export function resolveGTOByAt(data: GTOData, address: string): GTOAtResolveResult[] {
  const parsed = parseAtAddress(address);
  if (!parsed) return [];

  const results: GTOAtResolveResult[] = [];

  for (const obj of data.objects) {
    if (obj.protocol !== parsed.protocol) continue;
    results.push({ object: obj });
  }

  return results;
}

/**
 * Resolve a property address (either hash or at style) against the live graph.
 *
 * Detects the addressing mode from the prefix character:
 * - `#` → hash addressing (protocol.component.property)
 * - `@` → at addressing (protocol only)
 *
 * @param graph - The node graph to search
 * @param address - Property address string
 * @returns Matching results, or null if the address format is invalid
 */
export function resolveProperty(
  graph: Graph,
  address: string,
): HashResolveResult[] | AtResolveResult[] | null {
  if (address.startsWith('#')) {
    return resolveByHash(graph, address);
  }
  if (address.startsWith('@')) {
    return resolveByAt(graph, address);
  }
  return null;
}
