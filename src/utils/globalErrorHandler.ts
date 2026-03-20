import { Logger } from './Logger';

const log = new Logger('GlobalErrorHandler');

let installed = false;
let rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;
let errorHandler: ((event: ErrorEvent) => void) | null = null;

/**
 * Install global listeners for uncaught errors and unhandled promise rejections.
 * Should be called once at application startup (main.ts).
 *
 * Returns an uninstall function that removes both listeners.
 */
export function installGlobalErrorHandler(): (() => void) | undefined {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Note: We intentionally do NOT call event.preventDefault().
  // The browser's default console output provides stack traces with source maps,
  // complementing the Logger's formatted, module-prefixed entry.
  rejectionHandler = (event: PromiseRejectionEvent) => {
    log.error('Unhandled promise rejection:', event.reason);
  };

  errorHandler = (event: ErrorEvent) => {
    log.error('Uncaught error:', event.error ?? event.message);
  };

  window.addEventListener('unhandledrejection', rejectionHandler);
  window.addEventListener('error', errorHandler);

  return uninstallGlobalErrorHandler;
}

/**
 * Remove the global error and unhandled-rejection listeners.
 */
export function uninstallGlobalErrorHandler(): void {
  if (!installed) return;

  if (rejectionHandler) {
    window.removeEventListener('unhandledrejection', rejectionHandler);
    rejectionHandler = null;
  }
  if (errorHandler) {
    window.removeEventListener('error', errorHandler);
    errorHandler = null;
  }
  installed = false;
}

/** @internal - exposed for testing only */
export function _resetForTesting(): void {
  uninstallGlobalErrorHandler();
}
