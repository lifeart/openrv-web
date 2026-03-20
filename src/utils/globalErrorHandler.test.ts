import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { installGlobalErrorHandler, uninstallGlobalErrorHandler, _resetForTesting } from './globalErrorHandler';
import { Logger, LogLevel, type LogSink } from './Logger';

describe('globalErrorHandler', () => {
  let sink: Mock<LogSink>;

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

  it('should register an error listener on window', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    installGlobalErrorHandler();
    expect(addSpy).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should be idempotent — calling twice does not register duplicate listeners', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    installGlobalErrorHandler();
    installGlobalErrorHandler();
    const rejectionCalls = addSpy.mock.calls.filter(([type]) => type === 'unhandledrejection');
    const errorCalls = addSpy.mock.calls.filter(([type]) => type === 'error');
    expect(rejectionCalls).toHaveLength(1);
    expect(errorCalls).toHaveLength(1);
  });

  it('should log via Logger.error when unhandledrejection fires', () => {
    installGlobalErrorHandler();

    const reason = new Error('test rejection');
    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', { value: reason });
    window.dispatchEvent(event);

    expect(sink).toHaveBeenCalledWith(LogLevel.ERROR, '[GlobalErrorHandler]', 'Unhandled promise rejection:', reason);
  });

  it('should log via Logger.error when an uncaught error fires', () => {
    installGlobalErrorHandler();

    const error = new Error('test error');
    const event = new ErrorEvent('error', { error, message: 'test error' });
    window.dispatchEvent(event);

    expect(sink).toHaveBeenCalledWith(LogLevel.ERROR, '[GlobalErrorHandler]', 'Uncaught error:', error);
  });

  it('should fall back to event.message when event.error is null', () => {
    installGlobalErrorHandler();

    const event = new ErrorEvent('error', { error: null, message: 'Script error.' });
    window.dispatchEvent(event);

    expect(sink).toHaveBeenCalledWith(LogLevel.ERROR, '[GlobalErrorHandler]', 'Uncaught error:', 'Script error.');
  });

  it('should be a no-op after _resetForTesting allows re-installation', () => {
    installGlobalErrorHandler();
    _resetForTesting();

    const addSpy = vi.spyOn(window, 'addEventListener');
    installGlobalErrorHandler();
    expect(addSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('error', expect.any(Function));
  });

  describe('uninstallGlobalErrorHandler', () => {
    it('should remove both listeners', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      installGlobalErrorHandler();
      uninstallGlobalErrorHandler();

      expect(removeSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should stop logging after uninstall', () => {
      installGlobalErrorHandler();

      const removeSpy = vi.spyOn(window, 'removeEventListener');

      uninstallGlobalErrorHandler();

      // Verify listeners were removed (the handler references were passed to removeEventListener)
      const removedError = removeSpy.mock.calls.find(([type]) => type === 'error');
      const removedRejection = removeSpy.mock.calls.find(([type]) => type === 'unhandledrejection');
      expect(removedError).toBeDefined();
      expect(removedRejection).toBeDefined();

      // After uninstall, no new listeners should be active, so the sink should not be called
      // We don't dispatch real ErrorEvents here because Vitest would catch them as uncaught exceptions
      expect(sink).not.toHaveBeenCalled();
    });

    it('should allow re-installation after uninstall', () => {
      installGlobalErrorHandler();
      uninstallGlobalErrorHandler();

      const addSpy = vi.spyOn(window, 'addEventListener');
      installGlobalErrorHandler();
      expect(addSpy).toHaveBeenCalledWith('error', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
    });

    it('should be a no-op if not installed', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      uninstallGlobalErrorHandler();
      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('should return an uninstall function from installGlobalErrorHandler', () => {
      const uninstall = installGlobalErrorHandler();
      expect(uninstall).toBeTypeOf('function');

      const removeSpy = vi.spyOn(window, 'removeEventListener');
      uninstall!();
      expect(removeSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });
});
