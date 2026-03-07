# Implementation Plan: Reducing Property Getter/Setter Boilerplate in Effect Nodes

## 1. Problem Statement

Across 20 node files (12 effect nodes, 5 group nodes, 1 CacheLUTNode, 1 EffectNode base), there are 115+ instances of this boilerplate:

```typescript
get exposure(): number { return this.properties.getValue('exposure') as number; }
set exposure(v: number) { this.properties.setValue('exposure', v); }
```

Each property requires 3 lines: 1 `this.properties.add(...)` in constructor + 2 accessor lines. Two of those are pure mechanical boilerplate.

---

## 2. Approach Evaluation

| Option | Verdict |
|--------|---------|
| **A: Decorator (`@property`)** | **Not viable.** `useDefineForClassFields: true` in tsconfig means `Object.defineProperty(this, 'field', { value: undefined })` overwrites any prototype getter/setter installed by a property decorator. |
| **B: Factory function (`defineNodeProperty`)** | **Recommended.** Runs in constructor after `super()`, so `Object.defineProperty` on `this` overrides field init. Works with current tsconfig. |
| **C: Code generation script** | Over-engineered for this scale of boilerplate. |
| **D: Proxy-based** | Performance overhead on every access (rendering hot path), breaks `instanceof`, complicates TypeScript. |

---

## 3. Recommended Approach: `defineNodeProperty` Factory Function

### 3.1 Core Implementation

New file: `src/nodes/base/defineNodeProperty.ts`

```typescript
import type { PropertyInfo } from '../../core/graph/Property';
import type { IPNode } from './IPNode';

/**
 * Define a node property that combines PropertyContainer registration
 * with a typed getter/setter on the node instance.
 *
 * Must be called in the constructor AFTER super().
 */
export function defineNodeProperty<
  TNode extends IPNode,
  K extends string & keyof TNode,
>(
  node: TNode,
  name: K,
  info: Omit<PropertyInfo<TNode[K]>, 'name'>,
): void {
  node.properties.add({ ...info, name } as PropertyInfo<TNode[K]>);

  Object.defineProperty(node, name, {
    get(): TNode[K] {
      return node.properties.getValue(name) as TNode[K];
    },
    set(value: TNode[K]) {
      node.properties.setValue(name, value);
    },
    enumerable: true,
    configurable: true,
  });
}

/**
 * Batch variant: define multiple properties at once.
 */
export function defineNodeProperties(
  node: IPNode,
  definitions: Array<[string, Omit<PropertyInfo<unknown>, 'name'>]>,
): void {
  for (const [name, info] of definitions) {
    defineNodeProperty(node, name, info);
  }
}
```

### 3.2 Why This Works with `useDefineForClassFields: true`

- Properties are declared with `declare` keyword (no JS emitted, no field initializer)
- `defineNodeProperty` runs in constructor **after** `super()`, using `Object.defineProperty` on `this`
- `configurable: true` allows redefinition if needed

### 3.3 Type Safety

The generic constraint `K extends string & keyof TNode` ensures:
- The property name must exist on the class (via `declare`)
- The `defaultValue` type must match the declared property type
- Typos like `defineNodeProperty(this, 'typoName', ...)` produce compile errors

---

## 4. Before/After Examples

### CDLNode (10 properties, saves 10 lines)

**BEFORE** (99 lines):
```typescript
@RegisterNode('CDL')
export class CDLNode extends EffectNode {
  constructor(name?: string) {
    super('CDL', name);
    this.properties.add({ name: 'slopeR', defaultValue: 1.0, min: 0, max: 10, step: 0.01 });
    // ... 9 more properties.add calls
  }

  get slopeR(): number { return this.properties.getValue('slopeR') as number; }
  set slopeR(v: number) { this.properties.setValue('slopeR', v); }
  // ... 9 more getter/setter pairs (18 more lines)
}
```

**AFTER** (69 lines):
```typescript
import { defineNodeProperty } from '../base/defineNodeProperty';

@RegisterNode('CDL')
export class CDLNode extends EffectNode {
  declare slopeR: number;
  declare slopeG: number;
  declare slopeB: number;
  declare offsetR: number;
  declare offsetG: number;
  declare offsetB: number;
  declare powerR: number;
  declare powerG: number;
  declare powerB: number;
  declare saturation: number;

  constructor(name?: string) {
    super('CDL', name);
    defineNodeProperty(this, 'slopeR', { defaultValue: 1.0, min: 0, max: 10, step: 0.01 });
    defineNodeProperty(this, 'slopeG', { defaultValue: 1.0, min: 0, max: 10, step: 0.01 });
    defineNodeProperty(this, 'slopeB', { defaultValue: 1.0, min: 0, max: 10, step: 0.01 });
    defineNodeProperty(this, 'offsetR', { defaultValue: 0.0, min: -1, max: 1, step: 0.001 });
    defineNodeProperty(this, 'offsetG', { defaultValue: 0.0, min: -1, max: 1, step: 0.001 });
    defineNodeProperty(this, 'offsetB', { defaultValue: 0.0, min: -1, max: 1, step: 0.001 });
    defineNodeProperty(this, 'powerR', { defaultValue: 1.0, min: 0.1, max: 4, step: 0.01 });
    defineNodeProperty(this, 'powerG', { defaultValue: 1.0, min: 0.1, max: 4, step: 0.01 });
    defineNodeProperty(this, 'powerB', { defaultValue: 1.0, min: 0.1, max: 4, step: 0.01 });
    defineNodeProperty(this, 'saturation', { defaultValue: 1.0, min: 0, max: 4, step: 0.01 });
  }
  // ... rest unchanged
}
```

### VibranceNode (2 properties, mixed types)

**AFTER:**
```typescript
@RegisterNode('Vibrance')
export class VibranceNode extends EffectNode {
  declare vibrance: number;
  declare skinProtection: boolean;

  constructor(name?: string) {
    super('Vibrance', name);
    defineNodeProperty(this, 'vibrance', { defaultValue: 0, min: -100, max: 100, step: 1 });
    defineNodeProperty(this, 'skinProtection', { defaultValue: true });
  }
}
```

---

## 5. LOC Savings Estimate

| File | Properties | Boilerplate Removed | Declare Added | Net Saved |
|---|---|---|---|---|
| CDLNode.ts | 10 | 20 | 10 | 10 |
| ColorWheelsNode.ts | 16 | 32 | 16 | 16 |
| ToneMappingNode.ts | 8 | 16 | 8 | 8 |
| HighlightsShadowsNode.ts | 4 | 8 | 4 | 4 |
| FilmEmulationNode.ts | 5 | 10 | 5 | 5 |
| NoiseReductionNode.ts | 4 | 8 | 4 | 4 |
| StabilizationNode.ts | 3 | 6 | 3 | 3 |
| DeinterlaceNode.ts | 3 | 6 | 3 | 3 |
| VibranceNode.ts | 2 | 4 | 2 | 2 |
| Others (5 files) | 6 | 12 | 6 | 6 |
| **Total** | **61** | **122** | **61** | **61** |

Plus ~30 lines for the new utility file. **Net savings: ~31 lines in effect nodes alone.** The real value is cognitive load reduction: each property goes from 3 dispersed locations to 2 co-located ones.

---

## 6. Impact on Tests

**Zero impact.** The external API is completely unchanged:
- `node.slopeR` still works as getter/setter
- `node.properties.getValue('slopeR')` still works
- Property change signals still fire
- Clamping, animation, serialization all preserved

New test file `defineNodeProperty.test.ts` should verify:
- Property registration on PropertyContainer
- Getter returns current value
- Setter delegates to PropertyContainer (triggers signals)
- Clamping works
- Type parameter enforces correct default type
- Multiple properties on same node work independently

---

## 7. Migration Strategy

### Phase 1: Add utility (1 file)
- Create `src/nodes/base/defineNodeProperty.ts`
- Create `src/nodes/base/defineNodeProperty.test.ts`
- Run tests to verify

### Phase 2: Migrate effect nodes (smallest first, one at a time)
1. HueRotationNode.ts (1 property)
2. ClarityNode.ts (1 property)
3. SharpenNode.ts (1 property)
4. ColorInversionNode.ts (1 property, boolean)
5. VibranceNode.ts (2 properties, mixed types)
6. DeinterlaceNode.ts (3 properties)
7. StabilizationNode.ts (3 properties)
8. NoiseReductionNode.ts (4 properties)
9. HighlightsShadowsNode.ts (4 properties)
10. FilmEmulationNode.ts (5 properties)
11. ToneMappingNode.ts (8 properties)
12. CDLNode.ts (10 properties)
13. ColorWheelsNode.ts (16 properties)
14. EffectNode.ts base (2 properties: enabled, mix)

Run full test suite after each file.

### Phase 3 (optional): Migrate group nodes

### Phase 4: Export from barrel file

---

## 8. Backwards Compatibility

- **External API:** Fully preserved
- **PropertyContainer:** Unchanged
- **Serialization:** `toJSON()`, `fromJSON()` work identically
- **Signals:** Property change chain preserved
- **Animation:** Keyframes work unchanged
- **Disposal:** `dispose()` unchanged

---

## Critical Files

- `src/nodes/base/defineNodeProperty.ts` -- New utility (core implementation)
- `src/core/graph/Property.ts` -- PropertyContainer API (no changes needed)
- `src/nodes/base/IPNode.ts` -- Base class (no changes needed)
- `src/nodes/effects/ColorWheelsNode.ts` -- Biggest migration win (16 properties)
- `src/nodes/effects/VibranceNode.ts` -- Good first validation target
