import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger, LogLevel, type LogSink } from './Logger';
import { probe, probeAsync } from './probe';

describe('probe', () => {
  let sinkSpy: ReturnType<typeof vi.fn>;
  let originalLevel: LogLevel;

  beforeEach(() => {
    originalLevel = LogLevel.DEBUG;
    Logger.setLevel(LogLevel.DEBUG);
    sinkSpy = vi.fn();
    Logger.setSink(sinkSpy as LogSink);
  });

  afterEach(() => {
    Logger.setSink(null);
    Logger.setLevel(originalLevel);
  });

  describe('probe (sync)', () => {
    it('returns the function result on success and does not log', () => {
      const result = probe('readNumber', () => 42);
      expect(result).toBe(42);
      expect(sinkSpy).not.toHaveBeenCalled();
    });

    it('returns undefined when the function throws', () => {
      const result = probe('willThrow', () => {
        throw new Error('boom');
      });
      expect(result).toBeUndefined();
    });

    it('logs at DEBUG level with the probe name and the error on failure', () => {
      const failure = new Error('not supported');
      probe('checkFeature', () => {
        throw failure;
      });

      expect(sinkSpy).toHaveBeenCalledTimes(1);
      const [level, prefix, message, payload] = sinkSpy.mock.calls[0]!;
      expect(level).toBe(LogLevel.DEBUG);
      expect(prefix).toBe('[probe]');
      expect(message).toBe('probe:checkFeature failed');
      expect(payload).toEqual({ error: failure });
    });
  });

  describe('probeAsync', () => {
    it('returns the awaited result on success and does not log', async () => {
      const result = await probeAsync('asyncOk', async () => 'value');
      expect(result).toBe('value');
      expect(sinkSpy).not.toHaveBeenCalled();
    });

    it('returns undefined when the async function rejects', async () => {
      const result = await probeAsync('asyncReject', async () => {
        throw new Error('reject');
      });
      expect(result).toBeUndefined();
    });

    it('returns undefined when the sync body of an async wrapper throws', async () => {
      const result = await probeAsync('asyncSyncThrow', () => {
        throw new Error('sync throw');
      });
      expect(result).toBeUndefined();
    });

    it('logs at DEBUG level with the probe name when rejected', async () => {
      const failure = new Error('async-failure');
      await probeAsync('asyncFails', async () => {
        throw failure;
      });

      expect(sinkSpy).toHaveBeenCalledTimes(1);
      const [level, prefix, message, payload] = sinkSpy.mock.calls[0]!;
      expect(level).toBe(LogLevel.DEBUG);
      expect(prefix).toBe('[probe]');
      expect(message).toBe('probe:asyncFails failed');
      expect(payload).toEqual({ error: failure });
    });
  });
});
