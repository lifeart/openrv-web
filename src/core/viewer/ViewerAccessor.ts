/**
 * ViewerAccessor - Read-only accessor surface used by persistence/serialization.
 *
 * The full `Viewer` class exposes hundreds of methods. Persistence only needs
 * to read a small slice of viewer state (tone mapping, OCIO, display color)
 * to detect serialization gaps. This interface declares exactly that slice
 * so AppPersistenceManager can avoid importing the full Viewer type and avoid
 * `as any` casts at every call site.
 *
 * The concrete `Viewer` class implements this interface.
 */

import type { ToneMappingState } from '../types/effects';
import type { DisplayColorState } from '../../color/DisplayTransfer';

/**
 * Minimal read-only viewer surface required by persistence/serialization paths.
 *
 * Keep this interface narrow: only add methods that AppPersistenceManager (or
 * other persistence helpers) actually call. The implementing class is
 * responsible for keeping signatures in sync.
 */
export interface ViewerAccessor {
  /** Current tone mapping state (operator, enabled flag, parameters). */
  getToneMappingState(): ToneMappingState;

  /** Whether OCIO color management is currently enabled and active. */
  isOCIOEnabled(): boolean;

  /** Current display color management state (transfer function, gamma, etc). */
  getDisplayColorState(): DisplayColorState;
}
