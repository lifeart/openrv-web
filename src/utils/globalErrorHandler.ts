import { Logger } from './Logger';

const log = new Logger('GlobalErrorHandler');

let installed = false;

/**
 * Install global listeners for uncaught errors and unhandled promise rejections.
 * Should be called once at application startup (main.ts).
 */
export function installGlobalErrorHandler(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Note: We intentionally do NOT call event.preventDefault().
  // The browser's default console output provides stack traces with source maps,
  // complementing the Logger's formatted, module-prefixed entry.
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    log.error('Unhandled promise rejection:', event.reason);
  });
}

/** @internal - exposed for testing only */
export function _resetForTesting(): void {
  installed = false;
}
