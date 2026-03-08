import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WiringEventLog, wiringEventLog } from './WiringEventLog';

describe('WiringEventLog', () => {
  let log: WiringEventLog;

  beforeEach(() => {
    log = new WiringEventLog();
  });

  it('is disabled by default', () => {
    expect(log.enabled).toBe(false);
  });

  it('does not record events when disabled', () => {
    log.record('src', 'event', 'target');

    expect(log.getLog()).toHaveLength(0);
  });

  it('records events when enabled', () => {
    log.enabled = true;
    log.record('filterControl', 'filtersChanged', 'viewer.setFilterSettings');

    const entries = log.getLog();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.source).toBe('filterControl');
    expect(entries[0]!.event).toBe('filtersChanged');
    expect(entries[0]!.target).toBe('viewer.setFilterSettings');
  });

  it('records timestamp from performance.now()', () => {
    log.enabled = true;
    const before = performance.now();
    log.record('src', 'evt', 'tgt');
    const after = performance.now();

    const entry = log.getLog()[0]!;
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(after);
  });

  it('records optional data', () => {
    log.enabled = true;
    const data = { exposure: 1.5 };
    log.record('src', 'evt', 'tgt', data);

    expect(log.getLog()[0]!.data).toEqual({ exposure: 1.5 });
  });

  it('omits data when not provided', () => {
    log.enabled = true;
    log.record('src', 'evt', 'tgt');

    expect(log.getLog()[0]!.data).toBeUndefined();
  });

  it('returns readonly log array', () => {
    log.enabled = true;
    log.record('a', 'b', 'c');

    const entries = log.getLog();
    expect(entries).toHaveLength(1);
  });

  it('clears all entries', () => {
    log.enabled = true;
    log.record('a', 'b', 'c');
    log.record('d', 'e', 'f');

    log.clear();

    expect(log.getLog()).toHaveLength(0);
  });

  it('enforces max size by evicting oldest entries', () => {
    log.enabled = true;
    // Default maxSize is 1000
    for (let i = 0; i < 1005; i++) {
      log.record(`src${i}`, 'evt', 'tgt');
    }

    const entries = log.getLog();
    expect(entries).toHaveLength(1000);
    // Oldest entries should have been evicted
    expect(entries[0]!.source).toBe('src5');
    expect(entries[entries.length - 1]!.source).toBe('src1004');
  });

  it('dump() calls console.table', () => {
    log.enabled = true;
    log.record('a', 'b', 'c');

    const spy = vi.spyOn(console, 'table').mockImplementation(() => {});
    log.dump();
    expect(spy).toHaveBeenCalledWith(log.getLog());
    spy.mockRestore();
  });
});

describe('wiringEventLog singleton', () => {
  it('is an instance of WiringEventLog', () => {
    expect(wiringEventLog).toBeInstanceOf(WiringEventLog);
  });

  it('is disabled by default', () => {
    expect(wiringEventLog.enabled).toBe(false);
  });
});
