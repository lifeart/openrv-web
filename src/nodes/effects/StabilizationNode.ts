import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import {
  computeMotionVector,
  smoothMotionPath,
  applyStabilization,
  isStabilizationActive,
  type StabilizationParams,
  type MotionVector,
  type ApplyStabilizationParams,
} from '../../filters/StabilizeMotion';

/**
 * 2D motion stabilization effect node.
 *
 * Accumulates per-frame motion vectors from consecutive frames,
 * smooths the cumulative camera path, and applies a corrective
 * pixel shift with optional border cropping.
 *
 * This is preview-quality only — intended for quick stabilization
 * previews, not production-grade warp stabilization.
 */
@RegisterNode('Stabilization')
export class StabilizationNode extends EffectNode {
  readonly category: EffectCategory = 'spatial';
  readonly label = 'Stabilization';

  /** Accumulated per-frame motion vectors. */
  private motionHistory: MotionVector[] = [];

  /** Previous frame's ImageData for motion estimation. */
  private previousFrame: ImageData | null = null;

  /** Frame number of the previous frame (for consecutive-frame detection). */
  private previousFrameNumber: number = -1;

  constructor(name?: string) {
    super('Stabilization', name);

    this.properties.add({
      name: 'stabilizationEnabled',
      defaultValue: false,
    });
    this.properties.add({
      name: 'smoothingStrength',
      defaultValue: 50,
      min: 0,
      max: 100,
      step: 1,
    });
    this.properties.add({
      name: 'cropAmount',
      defaultValue: 8,
      min: 0,
      max: 64,
      step: 1,
    });
  }

  // -- Property accessors --

  get stabilizationEnabled(): boolean {
    return this.properties.getValue('stabilizationEnabled') as boolean;
  }
  set stabilizationEnabled(v: boolean) {
    this.properties.setValue('stabilizationEnabled', v);
  }

  get smoothingStrength(): number {
    return this.properties.getValue('smoothingStrength') as number;
  }
  set smoothingStrength(v: number) {
    this.properties.setValue('smoothingStrength', v);
  }

  get cropAmount(): number {
    return this.properties.getValue('cropAmount') as number;
  }
  set cropAmount(v: number) {
    this.properties.setValue('cropAmount', v);
  }

  /**
   * Build a StabilizationParams struct from the current property values.
   */
  getParams(): StabilizationParams {
    return {
      enabled: this.stabilizationEnabled,
      smoothingStrength: this.smoothingStrength,
      cropAmount: this.cropAmount,
    };
  }

  isIdentity(): boolean {
    return !isStabilizationActive(this.getParams());
  }

  protected applyEffect(context: EvalContext, input: IPImage): IPImage {
    const clone = input.deepClone();
    const imageData = clone.toImageData();

    // Only compute motion if we have a consecutive previous frame
    if (
      this.previousFrame !== null &&
      this.previousFrameNumber === context.frame - 1
    ) {
      const motion = computeMotionVector(imageData, this.previousFrame);
      this.motionHistory.push(motion);

      const smoothed = smoothMotionPath(
        this.motionHistory,
        this.smoothingStrength,
      );
      const lastSmoothed = smoothed[smoothed.length - 1]!;

      const stabilizationParams: ApplyStabilizationParams = {
        dx: lastSmoothed.dx,
        dy: lastSmoothed.dy,
        cropAmount: this.cropAmount,
      };
      applyStabilization(imageData, stabilizationParams);
    }

    // Store current frame for next iteration
    this.previousFrame = imageData;
    this.previousFrameNumber = context.frame;

    clone.fromImageData(imageData);
    return clone;
  }

  override dispose(): void {
    this.motionHistory = [];
    this.previousFrame = null;
    super.dispose();
  }
}
