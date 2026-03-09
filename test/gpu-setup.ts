/**
 * Setup file for GPU integration tests (runs inside real browser).
 * No jsdom mocks needed — we have real DOM, Canvas, WebGL2, and (possibly) WebGPU.
 */
(window as any).__OPENRV_TEST__ = true;
