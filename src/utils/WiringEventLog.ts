/**
 * WiringEventLog - Debug tracing for event wiring.
 *
 * Bounded ring buffer that records event flow through wiring modules.
 * Disabled by default; enable via `wiringEventLog.enabled = true` in devtools.
 */

export interface WiringEvent {
  timestamp: number;
  source: string;
  event: string;
  target: string;
  data?: unknown;
}

export class WiringEventLog {
  private log: WiringEvent[] = [];
  private maxSize = 1000;
  enabled = false;

  record(source: string, event: string, target: string, data?: unknown): void {
    if (!this.enabled) return;
    if (this.log.length >= this.maxSize) this.log.shift();
    this.log.push({ timestamp: performance.now(), source, event, target, data });
  }

  getLog(): ReadonlyArray<WiringEvent> {
    return this.log;
  }

  clear(): void {
    this.log = [];
  }

  dump(): void {
    console.table(this.log);
  }
}

export const wiringEventLog = new WiringEventLog();
