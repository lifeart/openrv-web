/**
 * Throttle utility with leading + trailing edge semantics.
 *
 * The first call fires immediately. Subsequent calls within `intervalMs`
 * are batched: the last pending args always fire after the interval elapses.
 */

export interface Throttled<Args extends unknown[]> {
  /** Call the throttled function with the given arguments. */
  call(...args: Args): void;
  /** Cancel any pending trailing invocation. */
  cancel(): void;
}

export function createThrottle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  intervalMs: number,
): Throttled<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;
  let lastCallTime = 0;

  function call(...args: Args): void {
    const now = Date.now();
    const elapsed = now - lastCallTime;

    if (elapsed >= intervalMs) {
      // Leading edge: fire immediately
      lastCallTime = now;
      fn(...args);
    } else {
      // Within interval: store latest args for trailing edge
      pendingArgs = args;

      if (timer === null) {
        const remaining = intervalMs - elapsed;
        timer = setTimeout(() => {
          timer = null;
          if (pendingArgs !== null) {
            lastCallTime = Date.now();
            const argsToFire = pendingArgs;
            pendingArgs = null;
            fn(...argsToFire);
          }
        }, remaining);
      }
    }
  }

  function cancel(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingArgs = null;
  }

  return { call, cancel };
}
