/**
 * DisposableAPI - Base class for all OpenRV sub-APIs.
 *
 * Provides a `_disposed` flag and `assertNotDisposed()` guard method.
 * Sub-APIs call `assertNotDisposed()` at the start of their public methods
 * so that external code cannot drive state changes after `openrv.dispose()`.
 */

import { APIError } from '../core/errors';

export class DisposableAPI {
  /** @internal */
  _disposed = false;

  /**
   * Mark this sub-API as disposed. After this call, `assertNotDisposed()`
   * will throw on every subsequent invocation.
   */
  dispose(): void {
    this._disposed = true;
  }

  /**
   * Throw an `APIError` if the API has been disposed.
   *
   * @throws {APIError} When the API instance has been disposed.
   */
  protected assertNotDisposed(): void {
    if (this._disposed) {
      throw new APIError('Cannot use API after dispose() has been called');
    }
  }
}
