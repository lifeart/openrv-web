/**
 * Unified Effect Pipeline - public API.
 *
 * Re-exports the core interface, the registry class / singleton,
 * and all adapter effects.
 *
 * Quick start:
 *   import { effectRegistry, colorInversionEffect } from '../effects';
 *
 *   effectRegistry.register(colorInversionEffect);
 *   effectRegistry.applyAll(imageData, { colorInversionEnabled: true });
 */

// --- Core types ---
export type { EffectCategory, ImageEffect } from './ImageEffect';

// --- Registry ---
export { EffectRegistry, effectRegistry } from './EffectRegistry';

// --- Adapter effects (proof-of-concept) ---
export { colorInversionEffect } from './adapters/ColorInversionEffect';
export { cdlEffect } from './adapters/CDLEffect';
export { hueRotationEffect } from './adapters/HueRotationEffect';
export { highlightsShadowsEffect } from './adapters/HighlightsShadowsEffect';
export { toneMappingEffect } from './adapters/ToneMappingEffect';
export { deinterlaceEffect } from './adapters/DeinterlaceEffect';
export { filmEmulationEffect } from './adapters/FilmEmulationEffect';
export { stabilizationEffect } from './adapters/StabilizationEffect';
