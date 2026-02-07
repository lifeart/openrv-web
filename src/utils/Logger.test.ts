import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { Logger } from './Logger';

describe('Logger', () => {
  let debugSpy: MockInstance;
  let infoSpy: MockInstance;
  let warnSpy: MockInstance;
  let errorSpy: MockInstance;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should prefix messages with the module name', () => {
    const logger = new Logger('TestModule');
    logger.info('hello');
    expect(infoSpy).toHaveBeenCalledWith('[TestModule]', 'hello');
  });

  describe('debug', () => {
    it('should call console.debug with module prefix', () => {
      const logger = new Logger('MyModule');
      logger.debug('debug message');
      expect(debugSpy).toHaveBeenCalledWith('[MyModule]', 'debug message');
    });

    it('should pass additional arguments', () => {
      const logger = new Logger('MyModule');
      const extra = { key: 'value' };
      logger.debug('debug message', extra, 42);
      expect(debugSpy).toHaveBeenCalledWith('[MyModule]', 'debug message', extra, 42);
    });
  });

  describe('info', () => {
    it('should call console.info with module prefix', () => {
      const logger = new Logger('MyModule');
      logger.info('info message');
      expect(infoSpy).toHaveBeenCalledWith('[MyModule]', 'info message');
    });

    it('should pass additional arguments', () => {
      const logger = new Logger('MyModule');
      logger.info('info message', 'extra', true);
      expect(infoSpy).toHaveBeenCalledWith('[MyModule]', 'info message', 'extra', true);
    });
  });

  describe('warn', () => {
    it('should call console.warn with module prefix', () => {
      const logger = new Logger('MyModule');
      logger.warn('warn message');
      expect(warnSpy).toHaveBeenCalledWith('[MyModule]', 'warn message');
    });

    it('should pass additional arguments', () => {
      const logger = new Logger('MyModule');
      const err = new Error('test');
      logger.warn('warn message', err);
      expect(warnSpy).toHaveBeenCalledWith('[MyModule]', 'warn message', err);
    });
  });

  describe('error', () => {
    it('should call console.error with module prefix', () => {
      const logger = new Logger('MyModule');
      logger.error('error message');
      expect(errorSpy).toHaveBeenCalledWith('[MyModule]', 'error message');
    });

    it('should pass additional arguments', () => {
      const logger = new Logger('MyModule');
      const err = new Error('test');
      logger.error('error message', err, { context: 'foo' });
      expect(errorSpy).toHaveBeenCalledWith('[MyModule]', 'error message', err, { context: 'foo' });
    });
  });

  it('should use different module names independently', () => {
    const loggerA = new Logger('ModuleA');
    const loggerB = new Logger('ModuleB');

    loggerA.info('from A');
    loggerB.info('from B');

    expect(infoSpy).toHaveBeenCalledWith('[ModuleA]', 'from A');
    expect(infoSpy).toHaveBeenCalledWith('[ModuleB]', 'from B');
  });

  it('should handle empty message', () => {
    const logger = new Logger('Test');
    logger.info('');
    expect(infoSpy).toHaveBeenCalledWith('[Test]', '');
  });

  it('should handle special characters in module name', () => {
    const logger = new Logger('My.Module/Sub');
    logger.warn('test');
    expect(warnSpy).toHaveBeenCalledWith('[My.Module/Sub]', 'test');
  });
});
