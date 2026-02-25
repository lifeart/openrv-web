# Improvement 8: Proper Effect Nodes

## Problem Statement

Effects in the current codebase are applied through three separate, disconnected mechanisms rather than being first-class participants in the node graph:

1. **GPU shader pipeline (monolithic):** The fragment shader in `src/render/shaders/viewer.frag.glsl` bakes a fixed sequence of effects (exposure, temperature/tint, brightness, contrast, saturation, hue rotation, tone mapping, gamma, inversion, highlights/shadows, vibrance, clarity, sharpen, CDL, curves, color wheels, HSL qualifier, deinterlace, film emulation, perspective correction) into a single draw call. The `Renderer` (`src/render/Renderer.ts`) applies all of these via `ShaderStateManager.applyUniforms()` in one pass -- there is no way to reorder, skip selectively, or cache intermediate results between effect stages.

2. **CPU EffectProcessor (batched):** `src/utils/effects/EffectProcessor.ts` applies a second set of pixel-level effects (highlights/shadows, vibrance, clarity, CDL, curves, color wheels, HSL qualifier, tone mapping, sharpen, channel isolation, deinterlace, film emulation) on `ImageData` in a fixed three-pass structure. The Viewer calls `applyEffects()` or `applyEffectsAsync()` after reading pixels back from the GPU. Again the order is hardcoded.

3. **ImageEffect adapters (unused in graph):** `src/effects/` contains an `ImageEffect` interface and `EffectRegistry` with nine adapter implementations (CDL, color inversion, hue rotation, highlights/shadows, tone mapping, deinterlace, film emulation, stabilization, noise reduction). These are thin wrappers around the real effect functions, but they are not connected to the node graph -- they operate on `ImageData` with a flat `params` bag and cannot participate in graph evaluation or caching.

### Consequences

- **No composability:** Effects cannot be reordered, duplicated, or branched in the node graph. A user cannot, for example, apply CDL before exposure, or chain two different noise reduction passes.
- **No per-effect caching:** When a single slider changes (e.g., saturation), every effect in the monolithic pipeline re-executes. There is no way to cache the output of an upstream effect and only recompute downstream.
- **No export of effect pipelines:** Because effects live in Viewer/Renderer state, there is no serializable representation of an effect chain that could be saved, shared, or exported to another tool.
- **GPU/CPU duplication:** Many effects exist in both the GLSL shader and the CPU `EffectProcessor`, with no unified abstraction. Adding a new effect requires changes in up to four places (shader, ShaderStateManager, EffectProcessor, ImageEffect adapter).
- **Testing difficulty:** Effects are tested through the Viewer integration or as standalone functions, not as composable units with well-defined inputs and outputs.

---

## Proposed Solution

Create a family of **EffectNode** classes that extend `IPNode` and participate fully in the node graph. Each effect becomes a node that:

- Takes one input image (or more for effects like difference matte)
- Exposes its parameters as node properties (animatable, serializable)
- Produces one output image via `process()`
- Participates in `IPNode` caching (dirty tracking, frame-based cache)
- Can be wired into any position in the graph
- Can be evaluated on CPU or GPU depending on availability

### Architecture Overview

```
                    SourceNode
                        |
                   [CDLNode]
                        |
                [NoiseReductionNode]
                        |
                  [SharpenNode]
                        |
               [ToneMappingNode]
                        |
                  [ColorWheelsNode]
                        |
                   OutputNode
                        |
                    Renderer
```

Each `EffectNode` is a concrete `IPNode` subclass. The graph evaluator (already in `src/core/graph/Graph.ts`) handles topological ordering, dirty propagation, and caching automatically.

---

## Detailed Steps

### Phase 1: EffectNode Base Class

**File:** `src/nodes/effects/EffectNode.ts`

```typescript
import { IPNode } from '../base/IPNode';
import { RegisterNode } from '../base/NodeFactory';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';

/**
 * Processing backend preference for an effect node.
 * - 'cpu': Always use CPU (ImageData) processing.
 * - 'gpu': Prefer GPU (WebGL/WebGPU shader) when available, fallback to CPU.
 * - 'auto': Let the runtime decide based on image size and capabilities.
 */
export type EffectBackend = 'cpu' | 'gpu' | 'auto';

/**
 * Category for grouping and ordering effects in the UI.
 */
export type EffectCategory = 'color' | 'tone' | 'spatial' | 'diagnostic';

/**
 * Base class for all effect nodes in the graph.
 *
 * Single-input, single-output: takes one image from input[0],
 * applies an effect, and returns the modified image.
 *
 * Subclasses implement:
 * - `applyEffect()`: the actual pixel processing
 * - `isIdentity()`: returns true when current parameters produce no change
 *
 * The base class handles:
 * - Pass-through when disabled or identity
 * - Caching (inherited from IPNode)
 * - Dirty propagation on property changes
 * - Enabled/disabled toggle
 */
export abstract class EffectNode extends IPNode {
  /** Effect category for UI grouping. */
  abstract readonly category: EffectCategory;

  /** Human-readable label for UI display. */
  abstract readonly label: string;

  constructor(type: string, name?: string) {
    super(type, name);
    this.properties.add({ name: 'enabled', defaultValue: true });
    this.properties.add({
      name: 'mix',
      defaultValue: 1.0,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Mix',
    });
  }

  /** Whether the effect is currently enabled. */
  get enabled(): boolean {
    return this.properties.getValue('enabled') as boolean;
  }
  set enabled(value: boolean) {
    this.properties.setValue('enabled', value);
  }

  /** Mix/opacity of the effect (0 = bypass, 1 = full). */
  get mix(): number {
    return this.properties.getValue('mix') as number;
  }
  set mix(value: number) {
    this.properties.setValue('mix', value);
  }

  /**
   * Returns true when the current parameter values produce an identity
   * transform (no pixel change). Used to skip processing entirely.
   */
  abstract isIdentity(): boolean;

  /**
   * Apply the effect to the input image and return the result.
   * Implementations should NOT modify the input image in-place if caching
   * is desired upstream; instead, clone and modify.
   */
  protected abstract applyEffect(
    context: EvalContext,
    input: IPImage
  ): IPImage;

  protected process(
    context: EvalContext,
    inputs: (IPImage | null)[]
  ): IPImage | null {
    const input = inputs[0];
    if (!input) return null;

    // Pass-through when disabled or identity
    if (!this.enabled || this.isIdentity()) {
      return input;
    }

    const result = this.applyEffect(context, input);

    // Apply mix (blend between input and result)
    if (this.mix < 1.0) {
      return this.blendImages(input, result, this.mix);
    }

    return result;
  }

  /**
   * Linearly blend two images by the given factor.
   * factor=0 returns `a`, factor=1 returns `b`.
   */
  private blendImages(a: IPImage, b: IPImage, factor: number): IPImage {
    const output = a.deepClone();
    const srcData = a.getTypedArray();
    const dstData = b.getTypedArray();
    const outData = output.getTypedArray();
    const len = srcData.length;
    for (let i = 0; i < len; i++) {
      outData[i] = srcData[i]! * (1 - factor) + dstData[i]! * factor;
    }
    return output;
  }
}
```

**File:** `src/nodes/effects/index.ts`

```typescript
export { EffectNode } from './EffectNode';
export type { EffectBackend, EffectCategory } from './EffectNode';

// Individual effect nodes (added as they are implemented)
export { CDLNode } from './CDLNode';
export { ColorInversionNode } from './ColorInversionNode';
export { NoiseReductionNode } from './NoiseReductionNode';
export { SharpenNode } from './SharpenNode';
export { ToneMappingNode } from './ToneMappingNode';
export { HueRotationNode } from './HueRotationNode';
export { HighlightsShadowsNode } from './HighlightsShadowsNode';
export { DeinterlaceNode } from './DeinterlaceNode';
export { FilmEmulationNode } from './FilmEmulationNode';
export { StabilizationNode } from './StabilizationNode';
export { ClarityNode } from './ClarityNode';
export { VibranceNode } from './VibranceNode';
export { ColorWheelsNode } from './ColorWheelsNode';
```

---

### Phase 2: Concrete Effect Nodes

Each effect node wraps the existing processing function. No pixel logic is duplicated -- nodes delegate to the functions already in `src/color/`, `src/filters/`, and `src/ui/components/ViewerEffects.ts`.

#### 2a. CDLNode

**File:** `src/nodes/effects/CDLNode.ts`

```typescript
import { EffectNode } from './EffectNode';
import { RegisterNode } from '../base/NodeFactory';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { applyCDL, isDefaultCDL, type CDLValues } from '../../color/CDL';

@RegisterNode('CDL')
export class CDLNode extends EffectNode {
  readonly category = 'color' as const;
  readonly label = 'ASC CDL';

  constructor(name?: string) {
    super('CDL', name ?? 'CDL');
    // Slope per channel
    this.properties.add({ name: 'slopeR', defaultValue: 1.0, min: 0, max: 10, step: 0.01 });
    this.properties.add({ name: 'slopeG', defaultValue: 1.0, min: 0, max: 10, step: 0.01 });
    this.properties.add({ name: 'slopeB', defaultValue: 1.0, min: 0, max: 10, step: 0.01 });
    // Offset per channel
    this.properties.add({ name: 'offsetR', defaultValue: 0.0, min: -1, max: 1, step: 0.001 });
    this.properties.add({ name: 'offsetG', defaultValue: 0.0, min: -1, max: 1, step: 0.001 });
    this.properties.add({ name: 'offsetB', defaultValue: 0.0, min: -1, max: 1, step: 0.001 });
    // Power per channel
    this.properties.add({ name: 'powerR', defaultValue: 1.0, min: 0.1, max: 4, step: 0.01 });
    this.properties.add({ name: 'powerG', defaultValue: 1.0, min: 0.1, max: 4, step: 0.01 });
    this.properties.add({ name: 'powerB', defaultValue: 1.0, min: 0.1, max: 4, step: 0.01 });
    // Saturation
    this.properties.add({ name: 'saturation', defaultValue: 1.0, min: 0, max: 4, step: 0.01 });
  }

  getCDLValues(): CDLValues {
    return {
      slope: {
        r: this.properties.getValue('slopeR') as number,
        g: this.properties.getValue('slopeG') as number,
        b: this.properties.getValue('slopeB') as number,
      },
      offset: {
        r: this.properties.getValue('offsetR') as number,
        g: this.properties.getValue('offsetG') as number,
        b: this.properties.getValue('offsetB') as number,
      },
      power: {
        r: this.properties.getValue('powerR') as number,
        g: this.properties.getValue('powerG') as number,
        b: this.properties.getValue('powerB') as number,
      },
      saturation: this.properties.getValue('saturation') as number,
    };
  }

  isIdentity(): boolean {
    return isDefaultCDL(this.getCDLValues());
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const output = input.deepClone();
    const cdl = this.getCDLValues();
    const data = output.getTypedArray();
    const channels = output.channels;
    const pixelCount = output.width * output.height;

    // Determine normalization based on data type
    let maxVal: number;
    switch (output.dataType) {
      case 'uint8': maxVal = 255; break;
      case 'uint16': maxVal = 65535; break;
      case 'float32': default: maxVal = 1; break;
    }

    for (let i = 0; i < pixelCount; i++) {
      const idx = i * channels;
      const r = (data[idx] ?? 0) / maxVal * 255;
      const g = (data[idx + 1] ?? 0) / maxVal * 255;
      const b = (data[idx + 2] ?? 0) / maxVal * 255;
      const result = applyCDL(r, g, b, cdl);
      data[idx] = result.r / 255 * maxVal;
      data[idx + 1] = result.g / 255 * maxVal;
      data[idx + 2] = result.b / 255 * maxVal;
    }

    return output;
  }
}
```

#### 2b. NoiseReductionNode

**File:** `src/nodes/effects/NoiseReductionNode.ts`

```typescript
import { EffectNode } from './EffectNode';
import { RegisterNode } from '../base/NodeFactory';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import {
  applyNoiseReduction,
  isNoiseReductionActive,
  type NoiseReductionParams,
} from '../../filters/NoiseReduction';

@RegisterNode('NoiseReduction')
export class NoiseReductionNode extends EffectNode {
  readonly category = 'spatial' as const;
  readonly label = 'Noise Reduction';

  constructor(name?: string) {
    super('NoiseReduction', name ?? 'Noise Reduction');
    this.properties.add({ name: 'strength', defaultValue: 0, min: 0, max: 100, step: 1 });
    this.properties.add({ name: 'luminanceStrength', defaultValue: 50, min: 0, max: 100, step: 1 });
    this.properties.add({ name: 'chromaStrength', defaultValue: 75, min: 0, max: 100, step: 1 });
    this.properties.add({ name: 'radius', defaultValue: 2, min: 1, max: 5, step: 1 });
  }

  getParams(): NoiseReductionParams {
    return {
      strength: this.properties.getValue('strength') as number,
      luminanceStrength: this.properties.getValue('luminanceStrength') as number,
      chromaStrength: this.properties.getValue('chromaStrength') as number,
      radius: this.properties.getValue('radius') as number,
    };
  }

  isIdentity(): boolean {
    return !isNoiseReductionActive(this.getParams());
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    // CPU path: convert to ImageData, apply, convert back
    const output = input.deepClone();
    const imageData = output.toImageData(); // Assumes IPImage can produce ImageData
    applyNoiseReduction(imageData, this.getParams());
    output.fromImageData(imageData);
    return output;
  }
}
```

#### 2c. SharpenNode

**File:** `src/nodes/effects/SharpenNode.ts`

Wraps `src/filters/WebGLSharpen.ts` (GPU) with fallback to `src/ui/components/ViewerEffects.ts` `applySharpenCPU()`.

```typescript
@RegisterNode('Sharpen')
export class SharpenNode extends EffectNode {
  readonly category = 'spatial' as const;
  readonly label = 'Sharpen';

  constructor(name?: string) {
    super('Sharpen', name ?? 'Sharpen');
    this.properties.add({ name: 'amount', defaultValue: 0, min: 0, max: 100, step: 1 });
  }

  isIdentity(): boolean {
    return (this.properties.getValue('amount') as number) <= 0;
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const amount = this.properties.getValue('amount') as number;
    const output = input.deepClone();
    const imageData = output.toImageData();
    applySharpenCPU(imageData, amount);
    output.fromImageData(imageData);
    return output;
  }
}
```

#### 2d. Additional Effect Nodes (same pattern)

Each wraps the corresponding existing function:

| Node Class | File | Delegates To | Category |
|---|---|---|---|
| `ColorInversionNode` | `src/nodes/effects/ColorInversionNode.ts` | `src/color/Inversion.ts` `applyColorInversion()` | color |
| `HueRotationNode` | `src/nodes/effects/HueRotationNode.ts` | `src/color/HueRotation.ts` `applyHueRotationInto()` | color |
| `ToneMappingNode` | `src/nodes/effects/ToneMappingNode.ts` | `src/ui/components/ViewerEffects.ts` `applyToneMappingWithParams()` | tone |
| `HighlightsShadowsNode` | `src/nodes/effects/HighlightsShadowsNode.ts` | `src/ui/components/ViewerEffects.ts` `applyHighlightsShadows()` | tone |
| `VibranceNode` | `src/nodes/effects/VibranceNode.ts` | `src/ui/components/ViewerEffects.ts` `applyVibrance()` | tone |
| `ClarityNode` | `src/nodes/effects/ClarityNode.ts` | `src/ui/components/ViewerEffects.ts` `applyClarity()` | spatial |
| `DeinterlaceNode` | `src/nodes/effects/DeinterlaceNode.ts` | `src/filters/Deinterlace.ts` `applyDeinterlace()` | spatial |
| `FilmEmulationNode` | `src/nodes/effects/FilmEmulationNode.ts` | `src/filters/FilmEmulation.ts` `applyFilmEmulation()` | color |
| `StabilizationNode` | `src/nodes/effects/StabilizationNode.ts` | `src/filters/StabilizeMotion.ts` (stateful) | spatial |
| `ColorWheelsNode` | `src/nodes/effects/ColorWheelsNode.ts` | Lift/Gamma/Gain from `EffectProcessor` shared logic | color |

---

### Phase 3: GPU Effect Processor Strategy

For effects that have both CPU and GPU implementations (sharpen, noise reduction, deinterlace, film emulation), introduce a `GPUEffectProcessor` pattern using the existing `NodeProcessor` interface.

**File:** `src/nodes/effects/processors/GPUSharpenProcessor.ts`

```typescript
import type { NodeProcessor } from '../../base/NodeProcessor';
import type { IPImage } from '../../../core/image/Image';
import type { EvalContext } from '../../../core/graph/Graph';
import { WebGLSharpenProcessor } from '../../../filters/WebGLSharpen';

/**
 * GPU-accelerated sharpen processor.
 * Attaches to a SharpenNode via `node.processor = new GPUSharpenProcessor()`.
 * Falls back to the node's built-in CPU applyEffect() if GPU is unavailable.
 */
export class GPUSharpenProcessor implements NodeProcessor {
  private gpuProcessor: WebGLSharpenProcessor | null = null;

  constructor() {
    try {
      this.gpuProcessor = new WebGLSharpenProcessor();
    } catch {
      // GPU not available -- node will use its built-in CPU path
    }
  }

  process(context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    const input = inputs[0];
    if (!input || !this.gpuProcessor?.isReady()) return input ?? null;

    // GPU path: convert to ImageData, process, convert back
    const imageData = input.toImageData();
    const amount = 50; // Would be read from node properties
    const result = this.gpuProcessor.apply(imageData, amount);
    const output = input.deepClone();
    output.fromImageData(result);
    return output;
  }

  invalidate(): void {}

  dispose(): void {
    this.gpuProcessor?.dispose();
    this.gpuProcessor = null;
  }
}
```

This follows the existing `NodeProcessor` pattern already established by `StackProcessor`, `LayoutProcessor`, and `SwitchProcessor` in `src/nodes/processors/`.

---

### Phase 4: EffectChain Helper

A convenience class for building linear effect chains without manually wiring nodes.

**File:** `src/nodes/effects/EffectChain.ts`

```typescript
import type { IPNode } from '../base/IPNode';
import type { EffectNode } from './EffectNode';
import { Graph, type EvalContext } from '../../core/graph/Graph';

/**
 * Convenience wrapper for a linear chain of EffectNodes.
 *
 * Usage:
 *   const chain = new EffectChain();
 *   chain.append(new CDLNode());
 *   chain.append(new SharpenNode());
 *   chain.setSource(sourceNode);
 *   const result = chain.evaluate(context);
 */
export class EffectChain {
  private effects: EffectNode[] = [];
  private graph = new Graph();
  private source: IPNode | null = null;

  append(effect: EffectNode): void {
    this.graph.addNode(effect);
    this.effects.push(effect);
    this.rebuildChain();
  }

  insert(index: number, effect: EffectNode): void {
    this.graph.addNode(effect);
    this.effects.splice(index, 0, effect);
    this.rebuildChain();
  }

  remove(effect: EffectNode): void {
    const idx = this.effects.indexOf(effect);
    if (idx === -1) return;
    this.effects.splice(idx, 1);
    this.graph.removeNode(effect.id);
    this.rebuildChain();
  }

  reorder(fromIndex: number, toIndex: number): void {
    const [effect] = this.effects.splice(fromIndex, 1);
    if (!effect) return;
    this.effects.splice(toIndex, 0, effect);
    this.rebuildChain();
  }

  setSource(source: IPNode): void {
    this.source = source;
    if (!this.graph.getNode(source.id)) {
      this.graph.addNode(source);
    }
    this.rebuildChain();
  }

  getEffects(): readonly EffectNode[] {
    return this.effects;
  }

  evaluate(frame: number): IPImage | null {
    return this.graph.evaluate(frame);
  }

  private rebuildChain(): void {
    // Disconnect all
    for (const effect of this.effects) {
      effect.disconnectAllInputs();
    }

    // Wire: source -> effect[0] -> effect[1] -> ... -> last
    let prev: IPNode | null = this.source;
    for (const effect of this.effects) {
      if (prev) {
        effect.connectInput(prev);
      }
      prev = effect;
    }

    // Set last node as graph output
    if (prev) {
      this.graph.setOutputNode(prev);
    }
  }

  /** Serialize the chain to a portable format. */
  toJSON(): object {
    return {
      effects: this.effects.map(e => ({
        type: e.type,
        properties: e.properties.toJSON(),
      })),
    };
  }

  dispose(): void {
    for (const effect of this.effects) {
      effect.dispose();
    }
    this.effects = [];
    this.graph.clear();
  }
}
```

---

### Phase 5: Integration with Existing Viewer/Renderer

This is the most delicate phase. The migration must be backward-compatible.

#### Step 5a: Create a ViewerEffectChain adapter

**File:** `src/ui/components/ViewerEffectChain.ts`

This adapter reads the existing Viewer state (CDL values, filter settings, tone mapping state, etc.) and maps them onto a chain of EffectNodes. It acts as a bridge during the migration period.

```typescript
/**
 * Bridge between Viewer's existing flat effect state and the new
 * node-graph-based EffectChain.
 *
 * During the migration period, this reads Viewer state and syncs
 * it to the corresponding EffectNode properties. Eventually, the
 * Viewer will manage EffectNodes directly and this bridge is removed.
 */
export class ViewerEffectChain {
  private chain: EffectChain;
  private cdlNode: CDLNode;
  private sharpenNode: SharpenNode;
  // ... one field per effect

  constructor() {
    this.chain = new EffectChain();
    this.cdlNode = new CDLNode();
    this.sharpenNode = new SharpenNode();
    // ... create all nodes in desired order
    this.chain.append(this.cdlNode);
    this.chain.append(this.sharpenNode);
    // ...
  }

  /** Sync from Viewer's flat state to node properties. */
  syncFromViewerState(state: AllEffectsState): void {
    // CDL
    this.cdlNode.properties.setValue('slopeR', state.cdlValues.slope.r);
    this.cdlNode.properties.setValue('slopeG', state.cdlValues.slope.g);
    // ... etc for all properties
    this.sharpenNode.properties.setValue('amount', state.filterSettings.sharpen);
  }

  evaluate(frame: number): IPImage | null {
    return this.chain.evaluate(frame);
  }
}
```

#### Step 5b: Gradual Renderer Integration

The existing GPU shader pipeline in `Renderer.renderImage()` will continue to handle effects that are implemented as GPU uniforms (exposure, contrast, saturation, etc. -- the core color adjustments). Effect nodes handle the higher-level composable effects (CDL, noise reduction, stabilization, film emulation, etc.) that currently live in `EffectProcessor`.

The integration sequence:

1. **Phase 5b-1:** EffectNodes produce CPU-processed `IPImage` results. The Viewer evaluates the node graph to get a final `IPImage`, then hands it to `Renderer.renderImage()` which applies the remaining GPU shader effects (exposure, gamma, tone mapping via the fragment shader). No change to the shader.

2. **Phase 5b-2:** Move GPU shader effects into EffectNodes one by one. For example, create an `ExposureNode` that sets the `u_exposureRGB` uniform on the Renderer before the final draw call, instead of the Viewer setting it directly. This is a gradual migration.

3. **Phase 5b-3:** Eventually, the Renderer becomes a thin "blit + display transform" layer, and all creative effects are managed by EffectNodes.

---

### Phase 6: IPImage CPU/GPU Interop

Currently `IPImage` (`src/core/image/Image.ts`) stores pixel data as typed arrays. To support GPU effect nodes efficiently, add optional methods:

```typescript
// Additions to IPImage (src/core/image/Image.ts)

/** Convert this image to an ImageData for CPU effect processing. */
toImageData(): ImageData {
  // Already possible via existing getTypedArray() + width/height
}

/** Update this image's pixel data from an ImageData. */
fromImageData(imageData: ImageData): void {
  // Copy ImageData.data into the internal typed array
}
```

These methods are needed by EffectNode subclasses that delegate to the existing `applyNoiseReduction(imageData, ...)` style functions. If `IPImage` already has equivalent functionality (via `deepClone()` + `getTypedArray()`), these can be thin wrappers.

---

## File Structure Summary

New files to create:

```
src/nodes/effects/
  EffectNode.ts              - Abstract base class
  EffectChain.ts             - Linear chain helper
  index.ts                   - Re-exports
  CDLNode.ts                 - ASC CDL color correction
  CDLNode.test.ts
  ColorInversionNode.ts      - Color inversion
  ColorInversionNode.test.ts
  NoiseReductionNode.ts      - Bilateral filter NR
  NoiseReductionNode.test.ts
  SharpenNode.ts             - Unsharp mask sharpen
  SharpenNode.test.ts
  ToneMappingNode.ts         - Tone mapping operators
  ToneMappingNode.test.ts
  HueRotationNode.ts         - Hue rotation
  HueRotationNode.test.ts
  HighlightsShadowsNode.ts   - Highlights/shadows/whites/blacks
  HighlightsShadowsNode.test.ts
  VibranceNode.ts            - Vibrance with skin protection
  VibranceNode.test.ts
  ClarityNode.ts             - Local contrast (clarity)
  ClarityNode.test.ts
  DeinterlaceNode.ts         - Bob/weave/blend deinterlace
  DeinterlaceNode.test.ts
  FilmEmulationNode.ts       - Film stock emulation
  FilmEmulationNode.test.ts
  StabilizationNode.ts       - Motion stabilization (stateful)
  StabilizationNode.test.ts
  ColorWheelsNode.ts         - Lift/Gamma/Gain color wheels
  ColorWheelsNode.test.ts
  processors/
    GPUSharpenProcessor.ts   - GPU strategy for SharpenNode
    GPUNoiseReductionProcessor.ts - GPU strategy for NoiseReductionNode

src/ui/components/
  ViewerEffectChain.ts       - Bridge adapter (migration period)
```

Existing files to modify:

| File | Change |
|---|---|
| `src/core/image/Image.ts` | Add `toImageData()` and `fromImageData()` convenience methods if missing |
| `src/nodes/base/NodeFactory.ts` | No change needed (uses `@RegisterNode` decorator) |
| `src/ui/components/Viewer.ts` | Gradually replace `EffectProcessor.applyEffects()` calls with `ViewerEffectChain.evaluate()` |
| `src/utils/effects/EffectProcessor.ts` | Kept during migration; eventually deprecated |
| `src/effects/EffectRegistry.ts` | Kept as-is; the `ImageEffect` interface is complementary (flat params for simple use cases) |

---

## How Effects Integrate with Existing Node Graph Evaluation

The node graph evaluation is already defined in `src/core/graph/Graph.ts`:

1. `Graph.evaluate(frame)` calls `outputNode.evaluate(context)`.
2. `IPNode.evaluate()` checks the cache (dirty flag + frame number). If valid, returns cached result.
3. If dirty, evaluates all inputs recursively via `input.evaluate(context)`.
4. Calls `this.process(context, inputImages)` (or delegates to `this.processor.process()` if set).
5. Caches the result, clears the dirty flag, returns.

EffectNodes fit into this naturally:

- `EffectNode.process()` receives the upstream `IPImage` in `inputs[0]`.
- If the effect is disabled or identity, returns the input unchanged (no clone, no allocation).
- If active, calls `applyEffect()` which clones the input, applies the transform, and returns.
- The result is cached by `IPNode.evaluate()` until a property changes (which calls `markDirty()`).

**Caching benefit:** If a user changes the sharpen amount but not the CDL, only the SharpenNode and all downstream nodes re-evaluate. The CDLNode returns its cached result. This is a significant improvement over the current approach where every effect re-runs on any change.

---

## How to Handle GPU vs CPU Effects

Three-tier strategy:

### Tier 1: CPU-only effects (default)

Most effects start as CPU implementations delegating to existing functions. This is safe, portable, and testable. Examples: CDL, color inversion, hue rotation, highlights/shadows, vibrance.

### Tier 2: GPU-accelerated via NodeProcessor

For performance-critical spatial effects (sharpen, noise reduction, deinterlace), attach a `NodeProcessor` that uses the existing GPU processors:

```typescript
const sharpenNode = new SharpenNode();
// Upgrade to GPU if available
try {
  sharpenNode.processor = new GPUSharpenProcessor();
} catch {
  // Falls back to CPU path in SharpenNode.applyEffect()
}
```

The `NodeProcessor` interface (`src/nodes/base/NodeProcessor.ts`) already supports this pattern. When `processor` is set on a node, `IPNode.evaluate()` delegates to `processor.process()` instead of calling `this.process()`.

### Tier 3: Shader-integrated effects (future)

Effects that are currently part of the fragment shader (exposure, contrast, saturation, tone mapping, etc.) continue to run on GPU via the Renderer's shader pipeline. These are the last to migrate to EffectNodes because they are the most performance-sensitive and benefit from single-pass GPU execution.

In the future, these could become EffectNodes that modify `RenderState` rather than pixel data directly -- essentially "GPU instruction nodes" that configure the shader rather than processing pixels.

---

## Migration Strategy

### Stage 1: Create EffectNode infrastructure (no behavioral changes)

- Implement `EffectNode` base class and all concrete node subclasses.
- Write comprehensive tests for each node in isolation.
- Register all nodes in `NodeFactory`.
- Duration: 1-2 weeks.

### Stage 2: EffectChain parallel path

- Create `ViewerEffectChain` adapter.
- In Viewer, evaluate the EffectChain in parallel with the existing `EffectProcessor` pipeline.
- Compare outputs for correctness (dev-mode only assertion).
- Duration: 1 week.

### Stage 3: Switch to EffectNode path for CPU effects

- Replace `EffectProcessor.applyEffects()` calls in `Viewer.ts` with `ViewerEffectChain.evaluate()`.
- Keep `EffectProcessor` available as fallback via feature flag.
- Remove the `ImageEffect` adapter layer in `src/effects/adapters/` (its role is now filled by EffectNodes).
- Duration: 1-2 weeks.

### Stage 4: GPU processor upgrades

- Attach `GPUSharpenProcessor` and `GPUNoiseReductionProcessor` to their respective nodes.
- Measure performance against the current standalone `WebGLSharpenProcessor` / `WebGLNoiseReductionProcessor`.
- Duration: 1 week.

### Stage 5: Expose EffectChain in UI

- Update the Effects panel to display the EffectChain as a reorderable list.
- Allow users to add/remove/reorder effect nodes.
- Serialize EffectChain configuration as part of session save.
- Duration: 2-3 weeks.

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **Performance regression** from per-effect `deepClone()` | High | Medium | Use copy-on-write or shared backing buffers. Profile early. Skip clone when mix=1.0 and no downstream branching. |
| **Pixel-level differences** between old EffectProcessor and new EffectNodes | Medium | Medium | Automated pixel comparison tests during Stage 2. Accept sub-LSB differences from float rounding. |
| **Memory increase** from caching intermediate images per node | Medium | Medium | Implement cache eviction policy. Only cache when node has multiple outputs or expensive computation. |
| **GPU context overhead** for per-effect GPU processors | Medium | Low | Share WebGL contexts between GPU processors. Use a single offscreen canvas with FBO swapping. |
| **Breaking changes** in Viewer API | High | Low | Feature flag for gradual rollout. Keep `EffectProcessor` as fallback during migration. |
| **Stateful effects** (stabilization) harder to fit into pure functional model | Low | Medium | `StabilizationNode` maintains internal state (reference frame, motion vectors). Its `process()` is side-effectful by design -- document this clearly. |

---

## Testing Strategy

### Unit Tests (per-effect node)

Each `*Node.test.ts` file tests:

1. **Identity pass-through:** When parameters are at defaults, `isIdentity()` returns true and `process()` returns the input unchanged (same reference).
2. **Enabled/disabled:** When `enabled=false`, effect is bypassed regardless of parameters.
3. **Mix blending:** When `mix=0.5`, output is the midpoint between input and fully-effected image.
4. **Parameter clamping:** Property min/max constraints are respected.
5. **Dirty propagation:** Changing a property marks the node and its outputs dirty.
6. **Cache validity:** Evaluating twice with the same frame and no changes returns the cached result.
7. **Pixel correctness:** Compare output against directly calling the underlying function (e.g., `applyCDL()`).

### Integration Tests (EffectChain)

1. **Chain ordering:** CDL -> Sharpen produces different results than Sharpen -> CDL.
2. **Chain serialization:** `toJSON()` / `fromJSON()` round-trip preserves parameters.
3. **Cache efficiency:** Changing only the last effect in a 5-node chain re-evaluates only 1 node.
4. **Node insertion/removal:** Dynamic chain modification correctly re-wires connections.

### Regression Tests (Viewer migration)

1. **Pixel parity:** During Stage 2, assert that `ViewerEffectChain.evaluate()` produces identical output to `EffectProcessor.applyEffects()` for a test matrix of effect combinations.
2. **Performance benchmark:** Frame rendering time must not regress more than 10% vs the current monolithic pipeline.

### Estimated Test Count

- 13 effect nodes x ~8 tests each = ~104 unit tests
- EffectChain: ~15 integration tests
- Regression: ~10 pixel-parity tests
- **Total: ~130 new tests**

---

## Success Metrics

1. **Composability:** Users can reorder effects in the chain and see correct results. Verified by chain ordering integration tests.
2. **Caching:** Changing one effect parameter only re-evaluates that node and downstream. Verified by cache efficiency tests.
3. **Serialization:** An effect chain can be saved to JSON and restored with identical parameters. Verified by round-trip tests.
4. **Pixel parity:** No visible difference between old and new pipelines for the same parameters. Verified by regression tests with per-pixel comparison (tolerance: 1 LSB for uint8).
5. **Performance:** Frame rendering time within 10% of current pipeline for standard effect combinations.
6. **Code reduction:** `EffectProcessor.applyEffects()` (currently ~600 lines of merged pixel-processing) replaced by ~13 focused EffectNode subclasses averaging ~50 lines each.

---

## Estimated Effort

| Phase | Duration | Dependencies |
|---|---|---|
| Phase 1: EffectNode base class | 2-3 days | None |
| Phase 2: 13 concrete effect nodes + tests | 8-10 days | Phase 1 |
| Phase 3: GPU processor strategies | 3-4 days | Phase 2 |
| Phase 4: EffectChain helper | 2-3 days | Phase 1 |
| Phase 5: Viewer integration + migration | 5-7 days | Phase 2, 4 |
| Phase 6: IPImage interop methods | 1-2 days | Phase 1 |
| **Total** | **3-4 weeks** | |

This estimate assumes a single developer working full-time. The work is highly parallelizable -- phases 2, 3, 4, and 6 can proceed concurrently after Phase 1 is complete.

---

## Appendix: Current Effect Inventory

For reference, here is every effect that currently exists in the codebase and where it is implemented:

| Effect | GPU Shader | CPU EffectProcessor | ImageEffect Adapter | Filter Module | Node (proposed) |
|---|---|---|---|---|---|
| Exposure | `u_exposureRGB` | -- | -- | -- | (future) |
| Gamma | `u_gammaRGB` | -- | -- | -- | (future) |
| Saturation | `u_saturation` | -- | -- | -- | (future) |
| Contrast | `u_contrastRGB` | -- | -- | -- | (future) |
| Brightness | `u_brightness` | -- | -- | -- | (future) |
| Temperature | `u_temperature` | -- | -- | -- | (future) |
| Tint | `u_tint` | -- | -- | -- | (future) |
| Color Inversion | `u_invert` | Yes | `ColorInversionEffect` | -- | `ColorInversionNode` |
| CDL (SOP+Sat) | shader uniforms | Yes | `CDLEffect` | `src/color/CDL.ts` | `CDLNode` |
| Hue Rotation | `u_hueRotationMatrix` | Yes | `HueRotationEffect` | `src/color/HueRotation.ts` | `HueRotationNode` |
| Tone Mapping | `u_toneMappingOperator` | Yes | `ToneMappingEffect` | -- | `ToneMappingNode` |
| Highlights/Shadows | shader uniforms | Yes | `HighlightsShadowsEffect` | -- | `HighlightsShadowsNode` |
| Vibrance | shader uniforms | Yes | -- | -- | `VibranceNode` |
| Clarity | shader uniforms | Yes | -- | -- | `ClarityNode` |
| Sharpen | shader uniforms | Yes | -- | `WebGLSharpen.ts` | `SharpenNode` |
| Color Wheels | shader uniforms | Yes | -- | -- | `ColorWheelsNode` |
| Noise Reduction | -- | -- | `NoiseReductionEffect` | `NoiseReduction.ts`, `WebGLNoiseReduction.ts` | `NoiseReductionNode` |
| Deinterlace | shader uniforms | Yes | `DeinterlaceEffect` | `Deinterlace.ts` | `DeinterlaceNode` |
| Film Emulation | shader uniforms | Yes | `FilmEmulationEffect` | `FilmEmulation.ts` | `FilmEmulationNode` |
| Stabilization | -- | -- | `StabilizationEffect` | `StabilizeMotion.ts` | `StabilizationNode` |
| Channel Isolation | shader uniforms | Yes | -- | -- | (future) |
| HSL Qualifier | shader uniforms | Yes | -- | -- | (future) |
| Color Curves | shader LUT | Yes | -- | `src/color/ColorCurves.ts` | (future) |
| False Color | shader LUT | -- | -- | -- | (future) |
| Zebra Stripes | shader uniforms | -- | -- | -- | (future) |
| Perspective Correction | shader uniforms | -- | -- | -- | (future) |
| 3D LUT | shader 3D texture | -- | -- | `src/color/LUTLoader.ts` | (future) |

---

## Expert Review -- Round 1

### Verdict: APPROVE WITH CHANGES

### Accuracy Check

The plan demonstrates a solid understanding of the current codebase architecture. Specific accuracy observations:

1. **IPNode API alignment is correct.** The proposed `EffectNode` constructor calls `super(type, name)` which matches the `IPNode(type: string, name?: string)` signature. The `process(context: EvalContext, inputs: (IPImage | null)[])` return type matches `IPNode`'s abstract contract. The `properties.add()` calls use the correct `PropertyInfo<T>` shape including `min`, `max`, `step`, and `label` fields. The plan correctly identifies that `processor` is an opt-in field on `IPNode` for attaching a `NodeProcessor` strategy.

2. **Graph evaluation flow is accurately described.** The five-step evaluation sequence (Section "How Effects Integrate with Existing Node Graph Evaluation") matches the actual `IPNode.evaluate()` implementation: cache check, recursive input evaluation, delegation to `processor.process()` or `this.process()`, cache store, return. The dirty propagation cascade through `_outputs` is correctly accounted for.

3. **CDLNode incorrectly uses `applyCDL()` instead of `applyCDLToImageData()`.** The plan's CDLNode manually iterates pixels, normalizes to 0-255, calls `applyCDL(r, g, b, cdl)`, then converts back. This duplicates and bypasses `applyCDLToImageData()` which already handles the ImageData loop. Worse, the manual normalization for `uint16` and `float32` data types introduces a 0-255 round-trip that destroys precision for high-bit-depth images. The existing `CDLEffect` adapter correctly delegates to `applyCDLToImageData()`.

4. **`IPImage` does NOT have instance methods `toImageData()` or `fromImageData(imageData)`.** It has a *static* `IPImage.fromImageData(imageData: ImageData): IPImage` factory method, but no instance `toImageData()` or instance `fromImageData()`. The plan's Phase 6 proposes adding these, but several Phase 2 effect nodes (`NoiseReductionNode`, `SharpenNode`) *already call them* in their code samples. This creates an implementation-order dependency that is not reflected in the phase sequencing -- Phase 6 must actually be completed before Phase 2 nodes that use these methods can work.

5. **`EffectBackend` type is declared but never used.** It appears in the EffectNode module but no code references it -- not in the base class, not in concrete nodes, not in the GPU processor strategy. It is dead code.

6. **The `RegisterNode` decorator usage is correct** and matches `NodeFactory.ts`. The decorator registers a zero-arg constructor creator, which works because the CDLNode etc. constructors have only optional parameters.

### Strengths

1. **Single-input/single-output contract.** Modeling each effect as a unary transform node is the correct VFX pipeline primitive. It maps cleanly to the ACES/OCIO concept of a "look transform" and allows trivial reordering, which is the stated primary goal.

2. **Identity bypass and mix blending.** The `isIdentity()` + `enabled` check avoids unnecessary `deepClone()` allocations when an effect is at its neutral state. The `mix` property enables partial blending which is a standard compositing workflow feature (equivalent to Nuke's "mix" knob). The implementation correctly returns the input reference unchanged for passthrough, avoiding allocation.

3. **Delegation to existing functions, not duplication.** The plan explicitly states "no pixel logic is duplicated" and each node wraps the corresponding function. This is the right approach for migration.

4. **`NodeProcessor` GPU strategy** leverages the existing strategy pattern (`StackProcessor`, `SwitchProcessor`, `LayoutProcessor`) rather than inventing a parallel mechanism. The fallback-to-CPU design is correct -- GPU unavailability should never be a hard failure in a review tool.

5. **EffectChain serialization** via `toJSON()` addresses a real gap. The current `AllEffectsState` in EffectProcessor is a flat bag of unrelated fields; the chain-of-nodes serialization is structurally superior and extensible.

6. **Phased migration with parallel comparison** (Stage 2) is industry-standard practice for VFX pipeline transitions. Running old and new in parallel with pixel comparison catches regressions before they reach users.

### Concerns

1. **`deepClone()` on every active effect is a serious performance risk for the primary use case.** A 4K RGBA float32 image is ~141 MB. A chain of 5 active effects means 5 allocations of 141 MB each, totaling ~700 MB of transient allocations per frame. The risk assessment mentions this but the proposed mitigations ("copy-on-write or shared backing buffers") are hand-waved without implementation detail. In practice, a copy-on-write scheme for typed arrays in JavaScript requires a `Proxy` or similar indirection, which has its own overhead.

   **Concrete alternative:** Since EffectNodes are strictly single-input/single-output in a linear chain, a ping-pong buffer strategy with two pre-allocated buffers would reduce allocations to two per chain evaluation regardless of chain length. Effects would alternate writing to buffer A and buffer B. This is the standard approach in GPU post-processing pipelines and works equally well on CPU.

2. **The `blendImages()` method in the base class operates on raw typed arrays but ignores alpha.** It linearly interpolates all channels including alpha, which produces incorrect results for premultiplied-alpha workflows. In a VFX pipeline where images may carry premultiplied alpha (standard for compositing), the mix blend should operate on straight (unpremultiplied) color channels and handle alpha separately. At minimum, alpha should be excluded from the blend so that the input's alpha channel is preserved when `mix < 1.0`.

3. **HDR / high-bit-depth data flow is not addressed.** The existing `IPImage` carries `transferFunction` (sRGB/HLG/PQ) and `colorPrimaries` (BT.709/BT.2020/P3) metadata, and many effects assume scene-referred linear light. The plan's CDLNode implementation normalizes everything to 0-255 range, which quantizes HDR data. Effects like tone mapping and CDL are *defined* in scene-referred linear light, not in display-referred 0-255 space. The plan should specify which color space effects expect their inputs in and whether linearization/de-linearization is the responsibility of the effect node or a separate node in the chain.

4. **The `EffectChain` creates its own `Graph` instance.** This means effect chains exist as isolated sub-graphs that cannot participate in the main application graph. If a user wants to branch after a CDLNode (e.g., sending the CDL output to both a sharpen path and a noise reduction path), the linear EffectChain does not support it. More importantly, the EffectChain's internal Graph has hardcoded `width: 1920, height: 1080` and `quality: 'full'` in its `evaluate()` method (inherited from `Graph.evaluate(frame)`), which is incorrect for images of other resolutions.

   The EffectChain should either accept an `EvalContext` in its `evaluate()` method, or the Graph's `evaluate()` should be updated to accept resolution parameters. Using the existing application-level Graph and simply wiring effect nodes into it would avoid this problem entirely.

5. **No `fromJSON()` on EffectChain.** The plan includes `toJSON()` for serialization but no deserialization path. Serialization without deserialization is incomplete -- the "export of effect pipelines" goal requires round-tripping. The `fromJSON()` implementation needs the `NodeFactory` to reconstruct nodes by type string and then call `properties.fromJSON()`.

6. **Animated properties are not addressed.** The Property system supports keyframe animation (`animatable`, `getAnimatedValue(frame)`), but the EffectNode base class never calls `getAnimatedValue()` and none of the properties are declared with `animatable: true`. For VFX work, animated parameters (e.g., exposure ramp, CDL keyframes for shot matching) are essential. The `process()` method receives `context.frame` but never uses it to resolve animated values.

7. **`StabilizationNode` breaks the pure functional model** more deeply than the plan acknowledges. Stabilization requires access to neighboring frames (reference frame for motion estimation), not just the current input. The single-input `applyEffect(context, input)` signature does not provide a way to request the input image at a different frame. This likely requires a multi-frame input mechanism or an internal frame buffer, neither of which is designed in the plan.

### Recommended Changes

1. **Swap the CDLNode implementation to use `applyCDLToImageData()`** via the `ImageData` pathway, exactly as the existing `CDLEffect` adapter does. For non-uint8 images, convert to float32 scene-linear first, apply CDL in float, and convert back. Do not round-trip through 0-255.

2. **Move Phase 6 (IPImage interop) before Phase 2** in the dependency order, or define `toImageData()` and `fromImageData()` as static utility functions in a helper module rather than instance methods. This avoids modifying the core `IPImage` class during the initial implementation.

3. **Add a ping-pong buffer pool to EffectChain.** Pre-allocate two `IPImage` buffers at the resolution of the source image. Effect nodes write into the "back" buffer and the chain swaps buffers between stages. This eliminates per-effect `deepClone()` overhead. The `applyEffect()` signature would become `applyEffect(context, input, output)` where the base class provides the output buffer.

4. **Fix `blendImages()` to handle alpha correctly.** At minimum:
   ```
   // For RGBA images, blend RGB but preserve input alpha
   if (a.channels >= 4) {
     for (let i = 0; i < len; i++) {
       if ((i + 1) % a.channels === 0) {
         outData[i] = srcData[i]; // preserve alpha from input
       } else {
         outData[i] = srcData[i] * (1 - factor) + dstData[i] * factor;
       }
     }
   }
   ```

5. **Add `EvalContext` parameter to `EffectChain.evaluate()`** instead of just a frame number, so that resolution and quality mode are correctly propagated from the application.

6. **Declare effect properties as `animatable: true`** where appropriate (CDL slope/offset/power, exposure, sharpen amount, etc.) and add a `resolveAnimatedProperties(frame)` step in the `EffectNode.process()` before calling `applyEffect()`. This ensures keyframe animation works out of the box.

7. **Clarify the expected input color space for each effect.** Add a `readonly inputColorSpace: 'scene-linear' | 'display-referred' | 'any'` field to EffectNode. Effects like CDL and tone mapping require scene-linear input; effects like sharpen and deinterlace are color-space agnostic. This metadata enables the chain to insert automatic linearization/de-linearization nodes when needed.

### Missing Considerations

1. **Region-of-interest (ROI) propagation.** In production VFX tools (Nuke, Flame, DaVinci), when a downstream node requests a crop region, upstream nodes can limit their computation to that region. This is critical for interactive playback at 4K+ resolutions. The `EvalContext` should carry an optional ROI rectangle that spatial effects (sharpen, clarity, noise reduction) can expand by their kernel radius, and pixel effects can pass through unchanged.

2. **Thread/worker offloading.** The plan mentions `applyEffectsAsync()` in the problem statement but the proposed EffectNode architecture is entirely synchronous. For CPU-heavy spatial effects (noise reduction, clarity), the `applyEffect()` method should return `IPImage | Promise<IPImage>` to allow offloading to a Web Worker without blocking the main thread. The existing `EffectProcessor.applyEffectsAsync()` already demonstrates this pattern.

3. **Memory lifecycle of cached images.** `IPNode.evaluate()` stores the result in `cachedImage`. If the chain has 10 effect nodes, 10 intermediate images are cached simultaneously. For 4K float32, this is ~1.4 GB of cached intermediates. The plan's risk assessment mentions cache eviction but provides no design. A simple improvement: only cache nodes that have `outputs.length > 1` (branch points); linear chain nodes do not benefit from caching since their sole consumer will trigger re-evaluation anyway.

4. **Interaction with the existing `CacheLUTNode`.** The `CacheLUTNode` already bakes color transforms (exposure, contrast, saturation, gamma, temperature, tint) into a 3D LUT for fast playback. If these same effects are also implemented as EffectNodes, there is a conflict: which one executes? The plan should define the boundary -- `CacheLUTNode` handles the "display transform" (always-on, LUT-baked), while EffectNodes handle "creative effects" (user-adjustable, per-node cached). This should be documented explicitly.

5. **Disposal of intermediate IPImages.** When an EffectNode re-evaluates and produces a new `cachedImage`, the previous cached image's `VideoFrame` (if any) must be `close()`d to avoid VRAM leaks. The current `IPNode.dispose()` nulls `cachedImage` but does not call `close()` on it. Any image that carries a `VideoFrame` or `ImageBitmap` must have its `close()` called when evicted from cache. This is a pre-existing issue in `IPNode` but becomes more acute with effect chains that produce many intermediates.

6. **Order-dependent effects and color science correctness.** The plan allows arbitrary reordering, which is the goal, but does not warn users about color-science implications. For example, applying CDL *after* tone mapping produces a fundamentally different (and usually wrong) result compared to CDL *before* tone mapping, because tone mapping is a nonlinear operation. The UI should indicate recommended ordering (the `EffectCategory` + a `defaultOrder` field could drive suggested sort), and potentially warn when known-problematic orderings are detected.

---

## QA Review -- Round 1

### Verdict: APPROVE WITH CHANGES

The plan is architecturally sound and the proposed EffectNode abstraction fits cleanly into the existing IPNode/Graph/NodeProcessor infrastructure. However, the testing strategy has meaningful coverage gaps, the proposed test count is insufficient for the scope of changes, and several implementation details create compile-time blockers that must be resolved before tests can even run.

### Test Coverage Assessment

**The proposed ~130 tests are insufficient. Recommend ~200 tests.**

The existing codebase already has 776+ test cases across the underlying effect functions (CDL: 48, HueRotation: 41, Inversion: 20, NoiseReduction: 18, ToneMappingOperators: 137, EffectProcessor: 131, WebGLSharpen: 33, WebGLNoiseReduction: 42, Deinterlace: 18, FilmEmulation: 19, StabilizeMotion: 42, EffectRegistry+adapters: 113, CacheLUTNode: 39, NodeProcessor: 36). The new EffectNode layer introduces an abstraction boundary on top of all of these. 130 tests is thin coverage for 13 new node classes, an EffectChain orchestrator, and a Viewer bridge adapter.

**Per-node tests: 8 per node is insufficient. Recommend 14-15 per node.**

The plan lists 7 test categories (identity pass-through, enabled/disabled, mix blending, parameter clamping, dirty propagation, cache validity, pixel correctness). Missing categories:

1. **Data type coverage.** The CDLNode code in the plan explicitly handles `uint8`, `uint16`, and `float32` with different `maxVal` normalization. Each data type needs at least one pixel correctness test. The NoiseReduction, Sharpen, Deinterlace, FilmEmulation, Stabilization, and Clarity nodes all depend on `toImageData()` which converts to uint8 -- this lossy conversion for float32/uint16 inputs must be tested.

2. **Alpha preservation.** Many underlying functions (CDL, hue rotation, tone mapping) operate on RGB only. Tests must verify alpha is never corrupted. The existing adapter tests in `src/effects/EffectRegistry.test.ts` already test this pattern (e.g., `deinterlaceEffect` preserves alpha at line 392-404, `filmEmulationEffect` at line 505-519). EffectNode tests must replicate this.

3. **Channel count mismatch.** IPImage supports 1, 3, and 4 channel images. Effects that index `data[idx+1]` and `data[idx+2]` on a 1-channel image will read out of bounds. Each node needs a defensive test for non-4-channel input.

4. **Edge-case image sizes.** 1x1, 0x0 (empty), very large. The `PropertyContainer` stores `min`/`max` as metadata but does not enforce them -- tests must verify that effects handle out-of-range parameter values gracefully (e.g., `sharpen: -50`, `noiseReduction.radius: 100`).

5. **Mix = 0.0 bypass.** The base class `blendImages()` at mix=0.0 should effectively return the input unchanged. This is a distinct case from enabled=false.

6. **Dispose cleanup.** Verify `dispose()` nullifies cached state and does not throw on double-dispose.

**Revised per-node estimate: 13 nodes x 14 tests = ~182 unit tests.**

**EffectChain tests: 15 proposed, recommend 20.**

Missing scenarios:
- **Empty chain evaluate:** What does `evaluate()` return when no effects are appended? Should return source image or null.
- **Source-only chain:** Zero effects after source -- pure pass-through.
- **Duplicate node insertion:** Adding the same EffectNode instance twice.
- **`fromJSON()` deserialization:** The plan proposes `toJSON()` and a serialization round-trip test, but there is no `fromJSON()` implementation. The test cannot exist without the method.
- **Concurrent modification safety:** Calling `reorder()` during evaluation.

**Regression/parity tests: 10 proposed, recommend 20-25.**

The existing `EffectProcessor.e2e.test.ts` already has 19 parity tests for main-thread vs worker alone. For the EffectNode migration path:
- One pixel-parity test per effect (13 effects = 13 tests).
- Five multi-effect combination parity tests (CDL+ToneMapping, CDL+Sharpen, Vibrance+Saturation, NoiseReduction+Sharpen, full-pipeline-all-enabled).
- Two ordering sensitivity tests (confirm ViewerEffectChain wires effects in exactly the same order as EffectProcessor's three-pass structure).
- Two tolerance definition tests (verify uint8 tolerance=1 LSB, float32 tolerance=1e-5).

**Revised total: ~182 unit + 20 integration + 22 regression = ~224 tests.**

### Risk Assessment

**1. IPImage `toImageData()` / `fromImageData()` instance methods do not exist -- COMPILE BLOCKER**

The plan's `NoiseReductionNode`, `SharpenNode`, `DeinterlaceNode`, `FilmEmulationNode`, `StabilizationNode`, and `ClarityNode` all call `output.toImageData()` and `output.fromImageData(imageData)` in their `applyEffect()` implementations. However, IPImage (`src/core/image/Image.ts`) only has:
- A static factory: `IPImage.fromImageData(imageData: ImageData): IPImage` (line 234)
- No instance `toImageData()` method at all

Phase 6, which proposes adding these methods, is scheduled last. Since 6 of the 13 Phase 2 nodes depend on these methods, **Phase 6 must be completed before or concurrently with Phase 2**. Without this change, tests for roughly half the nodes will fail at compile time.

Additionally, `toImageData()` for `float32` or `uint16` IPImage requires normalization to `Uint8ClampedArray` (0-255). This is a lossy conversion. Tests must verify that this round-trip does not introduce visible artifacts (banding, clamping). The plan does not address this.

**2. `deepClone()` per-effect performance -- HIGH RISK (confirmed by Expert Review)**

Every concrete node calls `input.deepClone()` in `applyEffect()`. For a 4K float32 RGBA image: `3840 * 2160 * 4 * 4 bytes = ~127 MB` per clone. A 5-node active chain = ~635 MB transient allocations per frame. The Expert Review's ping-pong buffer suggestion (Recommended Change #3) is the correct mitigation. Tests should include a memory-pressure stress test or at minimum assert that pass-through (identity/disabled) does NOT allocate.

**3. `blendImages()` alpha handling -- CORRECTNESS BUG**

The base class `blendImages()` linearly interpolates ALL channels including alpha. For premultiplied-alpha images (standard in compositing), this produces incorrect semi-transparent results where the input was fully opaque. The Expert Review (Concern #2) already flags this. Tests must verify alpha preservation specifically: `mix=0.5` on an RGBA image with `alpha=255` should keep alpha at 255 in the output, not blend it to a midpoint.

**4. CDL 0-255 normalization precision loss -- CORRECTNESS CONCERN**

The CDLNode code normalizes all data types to 0-255, applies `applyCDL()`, then converts back. For `float32` images with values in [0, 1], this means: `0.5 -> 127.5 -> CDL -> result/255`. The intermediate 0-255 representation quantizes to ~8-bit precision. For scene-referred linear-light float32 data (common in VFX), this destroys subtle gradients. Tests should compare CDLNode output on float32 images against a direct float32 CDL computation and measure the precision loss.

**5. PropertyContainer does not enforce min/max -- SILENT FAILURE RISK**

The plan's "parameter clamping" test category assumes PropertyContainer enforces bounds. Reviewing `src/core/graph/Property.ts`, the `min`/`max` fields are metadata for UI display -- `setValue()` stores whatever value is passed. An effect node that receives `sharpen: -999` or `noiseReduction.strength: Infinity` will process with that value. Tests must verify either: (a) the EffectNode setters clamp values, or (b) the underlying functions handle extreme values gracefully.

### Recommended Test Additions

**Per-node additions (beyond the 7 planned categories):**

| Category | Description | Per-node |
|---|---|---|
| uint8 pixel correctness | Apply effect to uint8 image, verify output values | 1 |
| float32 pixel correctness | Apply effect to float32 image, verify output values | 1 |
| uint16 pixel correctness | Apply effect to uint16 image, verify output values | 1 |
| Alpha preservation | Apply effect to RGBA image, verify alpha unchanged | 1 |
| 1x1 edge case | Single pixel image does not crash or produce NaN | 1 |
| Mix = 0.0 bypass | mix=0 returns input-equivalent output (no effect applied) | 1 |
| Dispose idempotent | Double dispose() does not throw | 1 |

**EffectChain additions:**

| Test | Description |
|---|---|
| Empty chain evaluate | No effects appended, returns null or source pass-through |
| Source-only pass-through | Source set, zero effects -- image passes through unchanged |
| Duplicate node guard | Adding same EffectNode instance twice is handled (error or no-op) |
| fromJSON round-trip | Requires implementing `fromJSON()` -- serialize then deserialize, verify identical chain |
| Double dispose | `dispose()` called twice does not throw |

**GPU effect processor tests (follow existing `WebGLSharpen.test.ts` pattern):**

| Test | Description |
|---|---|
| GPU fallback to CPU | When `WebGLSharpenProcessor` constructor fails, SharpenNode still processes via CPU path |
| GPU mock processing | Using `createMockWebGL2Context()` from `test/mocks.ts`, verify GPU processor calls correct WebGL methods |
| Processor swap at runtime | Attach GPU processor, swap to null, verify CPU path resumes (existing NodeProcessor.test.ts pattern) |
| GPU dispose on node dispose | Node.dispose() calls processor.dispose() (existing NodeProcessor.test.ts line 159-171) |

**ViewerEffectChain bridge tests (critical for migration safety):**

| Test | Description |
|---|---|
| Property sync round-trip | Set `AllEffectsState` value, call `syncFromViewerState()`, read back from node property, assert equality. One test per mapped property. |
| Effect ordering match | Assert `ViewerEffectChain` wires nodes in same order as `EffectProcessor`'s three-pass structure |
| Full pipeline parity | Apply all effects via both paths, assert pixel match within tolerance |

### Migration Safety

The plan's parallel-evaluation migration strategy (Stage 2) is sound and follows the established `EffectProcessor.e2e.test.ts` pattern. Three specific recommendations:

1. **Define tolerance per data type.** The plan says "1 LSB for uint8" but does not address float32 or uint16. Recommended: uint8 tolerance = 1 (already used in `assertPixelMatch()` in e2e tests), uint16 tolerance = 1, float32 tolerance = 1e-5 relative.

2. **ViewerEffectChain property mapping is a critical failure point.** The bridge maps from flat `AllEffectsState` fields to individual node properties. Any mapping error silently produces wrong pixels with no runtime error. Each property mapping should have a dedicated assertion in the parity test suite.

3. **Test effect ordering explicitly.** The existing `EffectProcessor.applyEffects()` applies effects in a hardcoded order across three passes. During the parallel comparison period (Stage 2), the EffectChain must reproduce this exact order. A dedicated test should assert the chain's node ordering matches the EffectProcessor's pass sequence.

### Concerns

1. **GPU tests are fully feasible in jsdom.** The existing test suite demonstrates the exact pattern needed: `WebGLSharpen.test.ts` (33 tests) and `WebGLNoiseReduction.test.ts` (42 tests) both use `createMockWebGL2Context()` from `test/mocks.ts` to mock the WebGL2 rendering context. The mock provides all necessary stubs (`createShader`, `createProgram`, `texImage2D`, `readPixels`, `drawArrays`, etc.) with `vi.fn()` return values. The `GPUSharpenProcessor` and `GPUNoiseReductionProcessor` tests should follow this exact pattern. The plan should explicitly reference `test/mocks.ts:createMockWebGL2Context()` as the GPU testing strategy rather than leaving GPU test feasibility unaddressed. Tests can verify: shader setup calls, uniform values, texture upload, draw calls, readPixels output, and dispose cleanup -- all without a real GPU.

2. **`StabilizationNode` statefulness requires specialized cache tests.** The node maintains internal state (reference frame, motion vectors) across frames. The standard `IPNode` cache checks `dirty` flag and `context.frame`, but stabilization output at frame N depends on the reference frame. Missing tests: (a) cache invalidation when reference frame changes, (b) sequential frame evaluation produces temporally stable output, (c) random-access evaluation (jump from frame 50 to frame 2) handles missing motion history gracefully. The Expert Review (Concern #7) also flags that the single-input `applyEffect()` signature cannot request images at other frames, which is a design gap.

3. **The `EffectChain.toJSON()` without `fromJSON()` makes serialization untestable.** The plan's Testing Strategy section lists "Chain serialization: toJSON() / fromJSON() round-trip preserves parameters" but the EffectChain code has no `fromJSON()` implementation. This must be designed and implemented in Phase 4, or the serialization test should be descoped to only verify `toJSON()` output structure.

4. **No tests for interaction with `CacheLUTNode`.** The existing `CacheLUTNode` bakes exposure/contrast/saturation/gamma/temperature/tint into a 3D LUT. Several of these transforms overlap with proposed EffectNodes (exposure, contrast, saturation are listed as "future" nodes). If both `CacheLUTNode` and future EffectNodes run on the same parameters, effects will be double-applied. A boundary test should verify that when `CacheLUTNode` is active in the graph, its handled transforms are not also applied by EffectNodes.

5. **The `EffectChain` hardcodes Graph evaluation resolution.** The internal `Graph.evaluate(frame)` uses hardcoded `width: 1920, height: 1080, quality: 'full'` (Graph.ts line 136-140). If the source image is 4K or 720p, the EvalContext will carry wrong dimensions. `EffectChain.evaluate()` should accept a full `EvalContext` parameter, not just a frame number.
