import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installGlobalErrorHandler, _resetForTesting } from './globalErrorHandler';
import { Logger, LogLevel } from './Logger';

describe('globalErrorHandler', () => {
  let sink: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetForTesting();
    sink = vi.fn();
    Logger.setLevel(LogLevel.DEBUG);
    Logger.setSink(sink);
  });

  afterEach(() => {
    _resetForTesting();
    Logger.setLevel(LogLevel.DEBUG);
    Logger.setSink(null);
    vi.restoreAllMocks();
  });

  it('should register an unhandledrejection listener on window', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    installGlobalErrorHandler();
    expect(addSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
  });

  it('should be idempotent — calling twice does not register duplicate listeners', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    installGlobalErrorHandler();
    installGlobalErrorHandler();
    const rejectionCalls = addSpy.mock.calls.filter(
      ([type]) => type === 'unhandledrejection',
    );
    expect(rejectionCalls).toHaveLength(1);
  });

  it('should log via Logger.error when unhandledrejection fires', () => {
    installGlobalErrorHandler();

    const reason = new Error('test rejection');
    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', { value: reason });
    window.dispatchEvent(event);

    expect(sink).toHaveBeenCalledWith(
      LogLevel.ERROR,
      '[GlobalErrorHandler]',
      'Unhandled promise rejection:',
      reason,
    );
  });

  it('should be a no-op after _resetForTesting allows re-installation', () => {
    installGlobalErrorHandler();
    _resetForTesting();

    const addSpy = vi.spyOn(window, 'addEventListener');
    installGlobalErrorHandler();
    expect(addSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
  });
});
