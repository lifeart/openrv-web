/**
 * StackGroupNode - Stacks/composites multiple inputs
 *
 * Supports various blend modes and wipe effects between layers.
 * Each input can have its own blend mode and opacity.
 *
 * Composite types (from RV spec):
 * - 'replace': Top layer replaces bottom (default)
 * - 'over': Standard alpha compositing (Porter-Duff over)
 * - 'add': Additive blending
 * - 'difference': Absolute difference
 * - 'dissolve': Cross-dissolve based on opacity
 * - Custom blend modes via per-layer settings
 */

import { BaseGroupNode } from './BaseGroupNode';
import { RegisterNode } from '../base/NodeFactory';
import type { EvalContext } from '../../core/graph/Graph';
import type { BlendMode } from '../../composite/BlendModes';

/**
 * Per-layer compositing settings
 */
export interface LayerCompositeSettings {
  /** Blend mode for this layer */
  blendMode: BlendMode;
  /** Opacity (0-1) for this layer */
  opacity: number;
  /** Whether this layer is visible */
  visible: boolean;
}

/**
 * Stack composite types as defined in RV spec
 */
export type StackCompositeType =
  | 'replace'     // Top replaces bottom
  | 'over'        // Porter-Duff over (alpha composite)
  | 'add'         // Additive
  | 'difference'  // Absolute difference
  | 'dissolve'    // Cross-dissolve
  | 'minus'       // Subtractive
  | 'topmost'     // Show topmost non-transparent
  | string;       // Allow custom types

@RegisterNode('RVStackGroup')
export class StackGroupNode extends BaseGroupNode {
  constructor(name?: string) {
    super('RVStackGroup', name ?? 'Stack');

    // Global composite mode for the stack
    this.properties.add({ name: 'composite', defaultValue: 'replace' });
    this.properties.add({ name: 'mode', defaultValue: 'wipe' });

    // Wipe control properties
    this.properties.add({ name: 'wipeX', defaultValue: 0.5 });
    this.properties.add({ name: 'wipeY', defaultValue: 0.5 });
    this.properties.add({ name: 'wipeAngle', defaultValue: 0 });

    // Per-layer blend modes (array indexed by input)
    this.properties.add({ name: 'layerBlendModes', defaultValue: [] });
    // Per-layer opacities (array indexed by input)
    this.properties.add({ name: 'layerOpacities', defaultValue: [] });
    // Per-layer visibility (array indexed by input)
    this.properties.add({ name: 'layerVisible', defaultValue: [] });

    // Output configuration
    this.properties.add({ name: 'chosenAudioInput', defaultValue: 0 });
    this.properties.add({ name: 'outOfRangePolicy', defaultValue: 'hold' });

    // Mode flags
    this.properties.add({ name: 'alignStartFrames', defaultValue: false });
    this.properties.add({ name: 'strictFrameRanges', defaultValue: false });
  }

  /**
   * Get composite settings for a specific layer
   */
  getLayerSettings(layerIndex: number): LayerCompositeSettings {
    const blendModes = this.properties.getValue('layerBlendModes') as BlendMode[];
    const opacities = this.properties.getValue('layerOpacities') as number[];
    const visible = this.properties.getValue('layerVisible') as boolean[];

    return {
      blendMode: blendModes[layerIndex] ?? 'normal',
      opacity: opacities[layerIndex] ?? 1.0,
      visible: visible[layerIndex] ?? true,
    };
  }

  /**
   * Set composite settings for a specific layer
   */
  setLayerSettings(layerIndex: number, settings: Partial<LayerCompositeSettings>): void {
    if (settings.blendMode !== undefined) {
      const blendModes = [...(this.properties.getValue('layerBlendModes') as BlendMode[])];
      blendModes[layerIndex] = settings.blendMode;
      this.properties.setValue('layerBlendModes', blendModes);
    }

    if (settings.opacity !== undefined) {
      const opacities = [...(this.properties.getValue('layerOpacities') as number[])];
      opacities[layerIndex] = Math.max(0, Math.min(1, settings.opacity));
      this.properties.setValue('layerOpacities', opacities);
    }

    if (settings.visible !== undefined) {
      const visible = [...(this.properties.getValue('layerVisible') as boolean[])];
      visible[layerIndex] = settings.visible;
      this.properties.setValue('layerVisible', visible);
    }

    this.markDirty();
  }

  /**
   * Get all layer settings as an array
   */
  getAllLayerSettings(): LayerCompositeSettings[] {
    const settings: LayerCompositeSettings[] = [];
    for (let i = 0; i < this.inputs.length; i++) {
      settings.push(this.getLayerSettings(i));
    }
    return settings;
  }

  /**
   * Set blend modes for all layers from an array
   */
  setLayerBlendModes(modes: BlendMode[]): void {
    this.properties.setValue('layerBlendModes', modes);
    this.markDirty();
  }

  /**
   * Set opacities for all layers from an array
   */
  setLayerOpacities(opacities: number[]): void {
    this.properties.setValue('layerOpacities', opacities.map(o => Math.max(0, Math.min(1, o))));
    this.markDirty();
  }

  /**
   * Get the global composite type
   */
  getCompositeType(): StackCompositeType {
    return this.properties.getValue('composite') as StackCompositeType;
  }

  /**
   * Set the global composite type
   */
  setCompositeType(type: StackCompositeType): void {
    this.properties.setValue('composite', type);
    this.markDirty();
  }

  getActiveInputIndex(_context: EvalContext): number {
    const mode = this.properties.getValue('mode') as string;
    const wipeX = this.properties.getValue('wipeX') as number;

    if (mode === 'wipe' && this.inputs.length >= 2) {
      // Simple horizontal wipe: select based on wipe position
      return wipeX < 0.5 ? 0 : 1;
    }

    return 0;
  }

  /**
   * Get wipe position (0-1)
   */
  getWipePosition(): { x: number; y: number; angle: number } {
    return {
      x: this.properties.getValue('wipeX') as number,
      y: this.properties.getValue('wipeY') as number,
      angle: this.properties.getValue('wipeAngle') as number,
    };
  }

  /**
   * Set wipe position
   */
  setWipePosition(x: number, y?: number): void {
    this.properties.setValue('wipeX', Math.max(0, Math.min(1, x)));
    if (y !== undefined) {
      this.properties.setValue('wipeY', Math.max(0, Math.min(1, y)));
    }
    this.markDirty();
  }
}
