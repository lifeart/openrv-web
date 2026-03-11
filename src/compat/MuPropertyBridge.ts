/**
 * MuPropertyBridge — Property System Bridge for Mu API Compatibility
 *
 * Implements OpenRV's property get/set/insert/new/delete/info commands using
 * an internal typed property store with Mu-style `node.component.property` path
 * addressing.
 *
 * Property paths follow Mu conventions:
 *   - Full path: `nodeOrType.component.property`
 *   - Hash shorthand: `#TypeName.component.property` (resolves to first matching node)
 *
 * All get* methods return typed arrays (e.g. `number[]` for float/int).
 * All set* methods accept typed arrays and an optional `quiet` flag.
 */

import {
  MuPropertyType,
  MuPropertyTypeNames,
  type MuPropertyInfo,
  type MuPropertyTypeValue,
} from './types';

// --- Internal property value store ---

/** A single stored property with type metadata. */
export interface StoredProperty {
  /** Property type constant (MuPropertyType.Float, etc.) */
  type: MuPropertyTypeValue;
  /** Dimension layout: 1D = [size], ND = [d0, d1, ...] */
  dimensions: number[];
  /** Whether this property was created by user code */
  userDefined: boolean;
  /** Human-readable description */
  info: string;
  /** The actual data: number[] for float/int/half/byte, string[] for string */
  data: number[] | string[];
}

/**
 * Parse a Mu-style property path into its components.
 *
 * Supports two forms:
 *   - `node.component.property` — 3 dot-separated segments
 *   - `#Type.component.property` — hash-shorthand (# prefix on first segment)
 *
 * Returns null if the path does not have exactly 3 segments.
 */
export function parsePropertyPath(path: string): {
  node: string;
  component: string;
  property: string;
  isHashPath: boolean;
} | null {
  // Handle the hash prefix case
  const isHash = path.startsWith('#');
  const raw = isHash ? path.slice(1) : path;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [node, component, property] = parts;
  if (!node || !component || !property) return null;
  return { node: isHash ? `#${node}` : node, component, property, isHashPath: isHash };
}

/**
 * Build a canonical storage key from path components.
 * Strips leading `#` from the node name for storage.
 */
function storageKey(node: string, component: string, property: string): string {
  const nodeName = node.startsWith('#') ? node.slice(1) : node;
  return `${nodeName}.${component}.${property}`;
}

/**
 * MuPropertyBridge manages typed properties using Mu-style dot-path addressing.
 *
 * This is a standalone store that can be queried/modified via the `commands.*Property`
 * family of functions. It does not require a live session — it owns its own state.
 *
 * When a graph-backed session is available, callers should pre-populate the store
 * from node properties, or the bridge can be subclassed / composed to delegate
 * to live graph properties.
 */
export class MuPropertyBridge {
  /** Internal property map: key = "node.component.property" */
  private _store = new Map<string, StoredProperty>();

  /** Listeners for property change notifications */
  private _listeners: Array<(path: string, value: number[] | string[]) => void> = [];

  // ---- Property change notifications ----

  /** Register a listener that is called whenever a property value changes. */
  onPropertyChanged(listener: (path: string, value: number[] | string[]) => void): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx !== -1) this._listeners.splice(idx, 1);
    };
  }

  private _notify(path: string, value: number[] | string[]): void {
    for (const listener of this._listeners) {
      listener(path, value);
    }
  }

  // ---- Getters ----

  getFloatProperty(path: string, start = 0, count = 0): number[] {
    return this._getNumericProperty(path, MuPropertyType.Float, start, count);
  }

  getIntProperty(path: string, start = 0, count = 0): number[] {
    return this._getNumericProperty(path, MuPropertyType.Int, start, count);
  }

  getHalfProperty(path: string, start = 0, count = 0): number[] {
    return this._getNumericProperty(path, MuPropertyType.Half, start, count);
  }

  getByteProperty(path: string, start = 0, count = 0): number[] {
    return this._getNumericProperty(path, MuPropertyType.Byte, start, count);
  }

  getStringProperty(path: string, start = 0, count = 0): string[] {
    const key = this._resolveKey(path);
    if (!key) throw new Error(`Invalid property path: "${path}"`);
    const prop = this._store.get(key);
    if (!prop) throw new Error(`Property not found: "${path}"`);
    if (prop.type !== MuPropertyType.String) {
      throw new TypeError(`Property "${path}" is not a string property (type=${MuPropertyTypeNames[prop.type]})`);
    }
    return this._slice(prop.data as string[], start, count);
  }

  // ---- Setters ----

  setFloatProperty(path: string, values: number[], quiet = false): void {
    this._setNumericProperty(path, MuPropertyType.Float, values, quiet);
  }

  setIntProperty(path: string, values: number[], quiet = false): void {
    this._setNumericProperty(path, MuPropertyType.Int, values, quiet);
  }

  setHalfProperty(path: string, values: number[], quiet = false): void {
    this._setNumericProperty(path, MuPropertyType.Half, values, quiet);
  }

  setByteProperty(path: string, values: number[], quiet = false): void {
    this._setNumericProperty(path, MuPropertyType.Byte, values, quiet);
  }

  setStringProperty(path: string, values: string[], quiet = false): void {
    const key = this._resolveKey(path);
    if (!key) throw new Error(`Invalid property path: "${path}"`);
    const prop = this._store.get(key);
    if (!prop) throw new Error(`Property not found: "${path}"`);
    if (prop.type !== MuPropertyType.String) {
      throw new TypeError(`Property "${path}" is not a string property (type=${MuPropertyTypeNames[prop.type]})`);
    }
    if (prop.dimensions.length > 1) {
      // ND property: validate value count matches declared shape
      const expectedTotal = prop.dimensions.reduce((a, b) => a * b, 1);
      if (values.length !== expectedTotal) {
        throw new TypeError(
          `Property "${path}": ND property set requires exactly ${expectedTotal} values (dimensions: [${prop.dimensions.join(',')}]), got ${values.length}`
        );
      }
    }
    prop.data = [...values];
    if (prop.dimensions.length <= 1) {
      prop.dimensions = [values.length];
    }
    if (!quiet) this._notify(path, prop.data);
  }

  // ---- Insert (splice into existing array) ----

  insertFloatProperty(path: string, values: number[], index: number): void {
    this._insertNumericProperty(path, MuPropertyType.Float, values, index);
  }

  insertIntProperty(path: string, values: number[], index: number): void {
    this._insertNumericProperty(path, MuPropertyType.Int, values, index);
  }

  insertStringProperty(path: string, values: string[], index: number): void {
    const key = this._resolveKey(path);
    if (!key) throw new Error(`Invalid property path: "${path}"`);
    const prop = this._store.get(key);
    if (!prop) throw new Error(`Property not found: "${path}"`);
    if (prop.type !== MuPropertyType.String) {
      throw new TypeError(`Property "${path}" is not a string property`);
    }
    const data = prop.data as string[];
    if (prop.dimensions.length > 1) {
      const innerSize = prop.dimensions.slice(1).reduce((a, b) => a * b, 1);
      if (values.length % innerSize !== 0) {
        throw new TypeError(
          `Property "${path}": ND property insert requires value count to be a multiple of inner size ${innerSize} (dimensions: [${prop.dimensions.join(',')}]), got ${values.length}`
        );
      }
      if (index % innerSize !== 0) {
        throw new TypeError(
          `Property "${path}": ND property insert requires index to be aligned to inner size ${innerSize} (dimensions: [${prop.dimensions.join(',')}]), got index ${index}`
        );
      }
    }
    const idx = Math.max(0, Math.min(index, data.length));
    data.splice(idx, 0, ...values);
    if (prop.dimensions.length > 1) {
      const innerSize = prop.dimensions.slice(1).reduce((a, b) => a * b, 1);
      prop.dimensions = [data.length / innerSize, ...prop.dimensions.slice(1)];
    } else {
      prop.dimensions = [data.length];
    }
    this._notify(path, prop.data);
  }

  insertByteProperty(path: string, values: number[], index: number): void {
    this._insertNumericProperty(path, MuPropertyType.Byte, values, index);
  }

  insertHalfProperty(path: string, values: number[], index: number): void {
    this._insertNumericProperty(path, MuPropertyType.Half, values, index);
  }

  // ---- Property lifecycle ----

  /**
   * Create a new 1D typed property.
   *
   * @param path - Full property path (node.component.property)
   * @param type - Property type constant (MuPropertyType.Float, etc.)
   * @param size - Initial size (number of elements)
   */
  newProperty(path: string, type: MuPropertyTypeValue, size: number): void {
    const parsed = parsePropertyPath(path);
    if (!parsed) throw new Error(`Invalid property path: "${path}"`);
    const key = storageKey(parsed.node, parsed.component, parsed.property);
    if (this._store.has(key)) {
      throw new Error(`Property already exists: "${path}"`);
    }
    const isString = type === MuPropertyType.String;
    const data: number[] | string[] = isString
      ? new Array(size).fill('')
      : new Array(size).fill(0);
    this._store.set(key, {
      type,
      dimensions: [size],
      userDefined: true,
      info: '',
      data,
    });
  }

  /**
   * Create a new N-dimensional typed property.
   *
   * @param path - Full property path
   * @param type - Property type constant
   * @param dimensions - Dimension tuple (e.g. [4, 4] for a 4x4 matrix)
   */
  newNDProperty(path: string, type: MuPropertyTypeValue, dimensions: number[]): void {
    const parsed = parsePropertyPath(path);
    if (!parsed) throw new Error(`Invalid property path: "${path}"`);
    const key = storageKey(parsed.node, parsed.component, parsed.property);
    if (this._store.has(key)) {
      throw new Error(`Property already exists: "${path}"`);
    }
    const totalSize = dimensions.reduce((a, b) => a * b, 1);
    const isString = type === MuPropertyType.String;
    const data: number[] | string[] = isString
      ? new Array(totalSize).fill('')
      : new Array(totalSize).fill(0);
    this._store.set(key, {
      type,
      dimensions: [...dimensions],
      userDefined: true,
      info: '',
      data,
    });
  }

  /**
   * Delete a property from the store.
   */
  deleteProperty(path: string): void {
    const key = this._resolveKey(path);
    if (!key) throw new Error(`Invalid property path: "${path}"`);
    if (!this._store.delete(key)) {
      throw new Error(`Property not found: "${path}"`);
    }
  }

  // ---- Query ----

  /**
   * List all property paths on a given node (or matching a node pattern).
   *
   * @param nodeName - Node name or `#TypeName` to filter by
   * @returns Array of full property paths
   */
  properties(nodeName: string): string[] {
    const isHashPath = nodeName.startsWith('#');
    const result: string[] = [];

    if (isHashPath) {
      const typeName = nodeName.slice(1);
      if (!typeName) return result;
      for (const key of this._store.keys()) {
        // Extract the node portion (everything before the first dot)
        const firstDot = key.indexOf('.');
        if (firstDot === -1) continue;
        const nodePart = key.slice(0, firstDot);
        if (nodePart === typeName || nodePart.includes(typeName)) {
          result.push(key);
        }
      }
    } else {
      const prefix = nodeName + '.';
      for (const key of this._store.keys()) {
        if (key.startsWith(prefix)) {
          result.push(key);
        }
      }
    }

    return result;
  }

  /**
   * Get metadata about a property.
   */
  propertyInfo(path: string): MuPropertyInfo {
    const key = this._resolveKey(path);
    if (!key) throw new Error(`Invalid property path: "${path}"`);
    const prop = this._store.get(key);
    if (!prop) throw new Error(`Property not found: "${path}"`);
    return {
      name: key,
      type: MuPropertyTypeNames[prop.type] ?? 'unknown',
      dimensions: [...prop.dimensions],
      size: prop.data.length,
      userDefined: prop.userDefined,
      info: prop.info,
    };
  }

  /**
   * Check whether a property exists.
   */
  propertyExists(path: string): boolean {
    const key = this._resolveKey(path);
    if (!key) return false;
    return this._store.has(key);
  }

  // ---- Bulk population helpers ----

  /**
   * Directly set a stored property (for pre-populating from graph data).
   * Overwrites if exists.
   */
  setStored(path: string, prop: StoredProperty): void {
    const parsed = parsePropertyPath(path);
    if (!parsed) throw new Error(`Invalid property path: "${path}"`);
    const key = storageKey(parsed.node, parsed.component, parsed.property);
    this._store.set(key, prop);
  }

  /**
   * Clear the entire property store.
   */
  clear(): void {
    this._store.clear();
  }

  /**
   * Return number of properties stored.
   */
  get size(): number {
    return this._store.size;
  }

  // ---- Internal helpers ----

  /**
   * Resolve a property path to a storage key.
   * Supports both full paths and #Hash paths.
   *
   * For hash paths (#TypeName.comp.prop), finds the first node whose
   * name contains the type name. In a real implementation this would
   * use the graph to resolve, but for the standalone store it does a
   * prefix match against stored keys.
   */
  private _resolveKey(path: string): string | null {
    const parsed = parsePropertyPath(path);
    if (!parsed) return null;

    if (!parsed.isHashPath) {
      return storageKey(parsed.node, parsed.component, parsed.property);
    }

    // Hash path: #TypeName.component.property
    // Look for any node key matching *.component.property where the
    // node part contains the type name (case sensitive).
    const typeName = parsed.node.slice(1); // remove #
    const suffix = `.${parsed.component}.${parsed.property}`;

    // First try exact match: typeName.component.property
    const exact = `${typeName}${suffix}`;
    if (this._store.has(exact)) return exact;

    // Collect all candidate keys whose node part matches the type name
    const suffixMatches: string[] = [];
    const substringMatches: string[] = [];

    for (const key of this._store.keys()) {
      if (key.endsWith(suffix)) {
        const nodePart = key.slice(0, key.length - suffix.length);
        if (nodePart === typeName) {
          // Exact node-name match (shouldn't reach here due to early return above,
          // but included for safety)
          return key;
        } else if (nodePart.endsWith(`_${typeName}`)) {
          suffixMatches.push(key);
        } else if (nodePart.includes(typeName)) {
          substringMatches.push(key);
        }
      }
    }

    // Prefer suffix matches over substring matches; sort alphabetically for determinism
    if (suffixMatches.length > 0) {
      suffixMatches.sort();
      return suffixMatches[0];
    }
    if (substringMatches.length > 0) {
      substringMatches.sort();
      return substringMatches[0];
    }

    return null;
  }

  private _getNumericProperty(path: string, expectedType: MuPropertyTypeValue, start: number, count: number): number[] {
    const key = this._resolveKey(path);
    if (!key) throw new Error(`Invalid property path: "${path}"`);
    const prop = this._store.get(key);
    if (!prop) throw new Error(`Property not found: "${path}"`);
    // Allow numeric type compatibility: float, int, half, byte are all numeric
    if (prop.type === MuPropertyType.String) {
      throw new TypeError(
        `Property "${path}" is a string property, expected ${MuPropertyTypeNames[expectedType]}`
      );
    }
    return this._slice(prop.data as number[], start, count);
  }

  private _setNumericProperty(path: string, expectedType: MuPropertyTypeValue, values: number[], quiet: boolean): void {
    const key = this._resolveKey(path);
    if (!key) throw new Error(`Invalid property path: "${path}"`);
    const prop = this._store.get(key);
    if (!prop) throw new Error(`Property not found: "${path}"`);
    if (prop.type === MuPropertyType.String) {
      throw new TypeError(
        `Property "${path}" is a string property, cannot set ${MuPropertyTypeNames[expectedType]} values`
      );
    }
    if (prop.dimensions.length > 1) {
      // ND property: validate value count matches declared shape
      const expectedTotal = prop.dimensions.reduce((a, b) => a * b, 1);
      if (values.length !== expectedTotal) {
        throw new TypeError(
          `Property "${path}": ND property set requires exactly ${expectedTotal} values (dimensions: [${prop.dimensions.join(',')}]), got ${values.length}`
        );
      }
    }
    prop.data = [...values];
    if (prop.dimensions.length <= 1) {
      prop.dimensions = [values.length];
    }
    if (!quiet) this._notify(path, prop.data);
  }

  private _insertNumericProperty(
    path: string,
    expectedType: MuPropertyTypeValue,
    values: number[],
    index: number,
  ): void {
    const key = this._resolveKey(path);
    if (!key) throw new Error(`Invalid property path: "${path}"`);
    const prop = this._store.get(key);
    if (!prop) throw new Error(`Property not found: "${path}"`);
    if (prop.type === MuPropertyType.String) {
      throw new TypeError(
        `Property "${path}" is a string property, cannot insert ${MuPropertyTypeNames[expectedType]} values`
      );
    }
    const data = prop.data as number[];
    if (prop.dimensions.length > 1) {
      const innerSize = prop.dimensions.slice(1).reduce((a, b) => a * b, 1);
      if (values.length % innerSize !== 0) {
        throw new TypeError(
          `Property "${path}": ND property insert requires value count to be a multiple of inner size ${innerSize} (dimensions: [${prop.dimensions.join(',')}]), got ${values.length}`
        );
      }
      if (index % innerSize !== 0) {
        throw new TypeError(
          `Property "${path}": ND property insert requires index to be aligned to inner size ${innerSize} (dimensions: [${prop.dimensions.join(',')}]), got index ${index}`
        );
      }
    }
    const idx = Math.max(0, Math.min(index, data.length));
    data.splice(idx, 0, ...values);
    if (prop.dimensions.length > 1) {
      const innerSize = prop.dimensions.slice(1).reduce((a, b) => a * b, 1);
      prop.dimensions = [data.length / innerSize, ...prop.dimensions.slice(1)];
    } else {
      prop.dimensions = [data.length];
    }
    this._notify(path, prop.data);
  }

  /**
   * Slice helper matching Mu's start/count semantics:
   * - start=0, count=0 → return full array
   * - count=0 → return from start to end
   * - otherwise → return slice [start, start+count)
   */
  private _slice<T>(data: T[], start: number, count: number): T[] {
    if (start === 0 && count === 0) return [...data];
    if (count === 0) return data.slice(start);
    return data.slice(start, start + count);
  }
}
