import { Logger } from './Logger';

const logger = new Logger('probe');

/**
 * Run a feature-detection probe and swallow any synchronous error.
 *
 * Use this only when the swallow is intentional and safe — e.g. probing for
 * an optional browser API where absence is expected and falls back to a
 * different code path. Returns `undefined` on failure and logs at debug level
 * so the swallow remains auditable.
 *
 * Anything other than feature detection should propagate or surface to the
 * user; do not use `probe` to hide unexpected runtime errors.
 */
export function probe<T>(name: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    logger.debug(`probe:${name} failed`, { error });
    return undefined;
  }
}

/**
 * Async variant of `probe`. Awaits `fn()` and returns `undefined` if it throws
 * or rejects. Logs at debug level on failure with the probe name.
 */
export async function probeAsync<T>(name: string, fn: () => Promise<T> | T): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    logger.debug(`probe:${name} failed`, { error });
    return undefined;
  }
}
