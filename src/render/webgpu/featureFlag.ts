/**
 * WebGPU Stage Pipeline Feature Flag (MED-55 Phase 4)
 *
 * Tristate flag controlling whether the per-stage WebGPU shader pipeline
 * is wired up. See features/hdr-display.md for the rollout plan.
 *
 * - 'disabled' (default in Phase 4-pre/4a): pipeline routes through legacy
 *   `new Renderer()` path; WebGPUBackend is never constructed in production.
 *
 * - 'enabled-no-stages' (Phase 4a internal): renderer is constructed via
 *   `createRenderer(caps)`; WebGPU backend instantiates if caps allow, but
 *   `registerStage()` is NOT called. Used to soak the pure passthrough path.
 *
 * - 'enabled-with-stages' (Phase 4b/c): full multi-pass pipeline.
 *   WebGPUBackend.initAsync() calls registerWebGPUStages() (when wired).
 */
export type WebGPUStageFlag = 'disabled' | 'enabled-no-stages' | 'enabled-with-stages';

const URL_PARAM = 'webgpu';
const STORAGE_KEY = 'openrv:webgpu-stages-flag';

/**
 * Resolve the active WebGPU stage pipeline mode.
 *
 * Resolution order (first match wins):
 *   1. URL query parameter `?webgpu=...` (engineering / debugging)
 *   2. localStorage value at `openrv:webgpu-stages-flag` (user opt-in for beta)
 *   3. Default: `'disabled'` (Phase 4-pre/4a — production sees zero behavior change)
 *
 * Accepted URL values:
 *   - `stages` | `enabled-with-stages` → `'enabled-with-stages'`
 *   - `no-stages` | `enabled-no-stages` → `'enabled-no-stages'`
 *   - `off` | `disabled` | `0` → `'disabled'`
 *   - any other value falls through to step 2
 *
 * Accepted localStorage values: exact match against the three flag literals.
 * Malformed values fall through to the default.
 */
export function getWebGPUBackendMode(): WebGPUStageFlag {
  // 1. URL override (engineering / debugging)
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const v = params.get(URL_PARAM);
      if (v === 'stages' || v === 'enabled-with-stages') return 'enabled-with-stages';
      if (v === 'no-stages' || v === 'enabled-no-stages') return 'enabled-no-stages';
      if (v === 'off' || v === 'disabled' || v === '0') return 'disabled';
      // Any other (or null) value falls through to localStorage.
    } catch {
      // URLSearchParams may throw on malformed strings in some environments
    }
  }

  // 2. localStorage override (user opt-in for beta)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === 'enabled-with-stages' || v === 'enabled-no-stages' || v === 'disabled') {
        return v;
      }
    } catch {
      // localStorage may throw in some sandboxed contexts
    }
  }

  // 3. Default (Phase 4-pre/4a): disabled
  return 'disabled';
}

/**
 * True when any non-disabled mode is active. Used by `createRenderer` to
 * gate WebGPU backend construction in capability-based selection.
 */
export function isWebGPUEnabled(): boolean {
  return getWebGPUBackendMode() !== 'disabled';
}

/**
 * True only when the full multi-pass stage pipeline mode is active.
 * Used by WebGPUBackend.initAsync() (Phase 4b/c) to gate registerStage() calls.
 */
export function isWebGPUStagesEnabled(): boolean {
  return getWebGPUBackendMode() === 'enabled-with-stages';
}

/**
 * Test-only helper to set or clear the localStorage flag.
 * Pass `null` to clear.
 *
 * @internal — for tests only.
 */
export function setWebGPUBackendModeForTest(mode: WebGPUStageFlag | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (mode === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, mode);
    }
  } catch {
    // ignore — localStorage may throw in sandboxed contexts
  }
}
