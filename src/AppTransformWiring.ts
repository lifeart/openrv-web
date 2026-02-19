/**
 * AppTransformWiring - Wire transform control to viewer with history recording.
 *
 * Handles:
 * - Transform control (rotation, flip) -> viewer with undo/redo history
 */

import type { AppWiringContext } from './AppWiringContext';
import type { TransformControl } from './ui/components/TransformControl';
import { DEFAULT_TRANSFORM } from './ui/components/TransformControl';
import { getGlobalHistoryManager } from './utils/HistoryManager';

/**
 * Mutable state for transform history tracking.
 */
export interface TransformWiringState {
  transformHistoryPrevious: ReturnType<TransformControl['getTransform']> | null;
}

/**
 * Wire the transform control to the viewer with history recording.
 * Returns mutable state that tracks the previous transform for undo/redo.
 */
export function wireTransformControls(ctx: AppWiringContext): TransformWiringState {
  const { viewer, controls, persistenceManager } = ctx;

  const state: TransformWiringState = {
    transformHistoryPrevious: null,
  };

  controls.transformControl.on('transformChanged', (transform) => {
    const previousTransform = state.transformHistoryPrevious ?? DEFAULT_TRANSFORM;
    const currentTransform = { ...transform };

    viewer.setTransform(transform);
    persistenceManager.syncGTOStore();

    // Record history for transform changes (discrete actions, no debounce needed)
    const changes: string[] = [];
    if (previousTransform.rotation !== currentTransform.rotation) {
      changes.push(`rotation to ${currentTransform.rotation}\u00B0`);
    }
    if (previousTransform.flipH !== currentTransform.flipH) {
      changes.push(currentTransform.flipH ? 'flip horizontal' : 'unflip horizontal');
    }
    if (previousTransform.flipV !== currentTransform.flipV) {
      changes.push(currentTransform.flipV ? 'flip vertical' : 'unflip vertical');
    }
    if (previousTransform.scale.x !== currentTransform.scale.x || previousTransform.scale.y !== currentTransform.scale.y) {
      changes.push(`scale to ${currentTransform.scale.x.toFixed(2)}x${currentTransform.scale.y.toFixed(2)}`);
    }
    if (previousTransform.translate.x !== currentTransform.translate.x || previousTransform.translate.y !== currentTransform.translate.y) {
      changes.push(`translate to (${currentTransform.translate.x.toFixed(1)}, ${currentTransform.translate.y.toFixed(1)})`);
    }

    if (changes.length > 0) {
      const description = changes.length === 1
        ? changes[0]!.charAt(0).toUpperCase() + changes[0]!.slice(1)
        : 'Transform image';

      const historyManager = getGlobalHistoryManager();
      historyManager.recordAction(
        description,
        'transform',
        () => {
          controls.transformControl.setTransform(previousTransform);
          viewer.setTransform(previousTransform);
        },
        () => {
          controls.transformControl.setTransform(currentTransform);
          viewer.setTransform(currentTransform);
        }
      );
    }

    state.transformHistoryPrevious = currentTransform;
  });

  return state;
}
