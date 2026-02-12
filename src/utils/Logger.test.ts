import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { Logger, LogLevel } from './Logger';

describe('Logger', () => {
  let debugSpy: MockInstance;
  let infoSpy: MockInstance;
  let warnSpy: MockInstance;
  let errorSpy: MockInstance;

  beforeEach(() => {
    Logger.setLevel(LogLevel.DEBUG);
    Logger.setSink(null);
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    Logger.setLevel(LogLevel.DEBUG);
    Logger.setSink(null);
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

  describe('LogLevel filtering', () => {
    it('should suppress debug when level is INFO', () => {
      Logger.setLevel(LogLevel.INFO);
      const logger = new Logger('Test');
      logger.debug('hidden');
      logger.info('visible');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith('[Test]', 'visible');
    });

    it('should suppress debug and info when level is WARN', () => {
      Logger.setLevel(LogLevel.WARN);
      const logger = new Logger('Test');
      logger.debug('hidden');
      logger.info('hidden');
      logger.warn('visible');
      logger.error('visible');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith('[Test]', 'visible');
      expect(errorSpy).toHaveBeenCalledWith('[Test]', 'visible');
    });

    it('should suppress everything except error when level is ERROR', () => {
      Logger.setLevel(LogLevel.ERROR);
      const logger = new Logger('Test');
      logger.debug('hidden');
      logger.info('hidden');
      logger.warn('hidden');
      logger.error('visible');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith('[Test]', 'visible');
    });

    it('should allow all levels when set to DEBUG', () => {
      Logger.setLevel(LogLevel.DEBUG);
      const logger = new Logger('Test');
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(debugSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('custom sink', () => {
    it('should redirect output to custom sink', () => {
      const sink = vi.fn();
      Logger.setSink(sink);
      const logger = new Logger('Test');
      logger.info('hello', 42);
      expect(sink).toHaveBeenCalledWith(LogLevel.INFO, '[Test]', 'hello', 42);
      expect(infoSpy).not.toHaveBeenCalled();
    });

    it('should restore default sink when set to null', () => {
      const sink = vi.fn();
      Logger.setSink(sink);
      Logger.setSink(null);
      const logger = new Logger('Test');
      logger.info('hello');
      expect(sink).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith('[Test]', 'hello');
    });

    it('should pass the correct level to the sink', () => {
      const sink = vi.fn();
      Logger.setSink(sink);
      const logger = new Logger('X');
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(sink).toHaveBeenCalledWith(LogLevel.DEBUG, '[X]', 'd');
      expect(sink).toHaveBeenCalledWith(LogLevel.INFO, '[X]', 'i');
      expect(sink).toHaveBeenCalledWith(LogLevel.WARN, '[X]', 'w');
      expect(sink).toHaveBeenCalledWith(LogLevel.ERROR, '[X]', 'e');
    });
  });

  describe('withContext', () => {
    it('should create a Logger with the given context', () => {
      const logger = Logger.withContext('Renderer');
      logger.info('init');
      expect(infoSpy).toHaveBeenCalledWith('[Renderer]', 'init');
    });
  });
});
