/**
 * Lightweight per-frame performance tracer for identifying playback bottlenecks.
 *
 * Accumulates timing measurements per named stage across frames, then logs a
 * summary every ~1 second. Enable via `PerfTrace.enabled = true` in browser
 * console or code.
 *
 * Usage:
 *   PerfTrace.begin('stage');
 *   // ... work ...
 *   PerfTrace.end('stage');
 *
 *   // or one-shot:
 *   PerfTrace.mark('event');
 *
 * Output (logged to console every ~1 second):
 *   [PerfTrace] 24 frames in 1003ms (23.9 fps)
 *     tick:           0.4ms avg (0.2–1.1)
 *     session.update: 0.1ms avg (0.0–0.2)
 *     renderHDR:      5.2ms avg (4.8–6.1)
 *     texImage2D:     3.1ms avg (2.8–3.5)
 *     ...
 */

interface StageTiming {
  total: number;
  min: number;
  max: number;
  count: number;
}

class PerfTraceImpl {
  enabled = false;

  private stages = new Map<string, StageTiming>();
  private pending = new Map<string, number>();
  private frameCount = 0;
  private windowStart = 0;
  private counts = new Map<string, number>();

  /** Start timing a stage. */
  begin(stage: string): void {
    if (!this.enabled) return;
    this.pending.set(stage, performance.now());
  }

  /** End timing a stage. */
  end(stage: string): void {
    if (!this.enabled) return;
    const start = this.pending.get(stage);
    if (start === undefined) return;
    this.pending.delete(stage);
    const elapsed = performance.now() - start;
    this.record(stage, elapsed);
  }

  /** Record a count (e.g., number of dirty flags). */
  count(name: string, value: number = 1): void {
    if (!this.enabled) return;
    this.counts.set(name, (this.counts.get(name) ?? 0) + value);
  }

  /** Call once per frame to track frame count and trigger periodic summary. */
  frame(): void {
    if (!this.enabled) return;
    this.frameCount++;
    const now = performance.now();
    if (this.windowStart === 0) {
      this.windowStart = now;
      return;
    }
    const elapsed = now - this.windowStart;
    if (elapsed >= 1000) {
      this.flush(elapsed);
    }
  }

  private record(stage: string, ms: number): void {
    const existing = this.stages.get(stage);
    if (existing) {
      existing.total += ms;
      existing.count++;
      if (ms < existing.min) existing.min = ms;
      if (ms > existing.max) existing.max = ms;
    } else {
      this.stages.set(stage, { total: ms, min: ms, max: ms, count: 1 });
    }
  }

  private flush(windowMs: number): void {
    const fps = (this.frameCount / windowMs) * 1000;
    const lines: string[] = [
      `[PerfTrace] ${this.frameCount} frames in ${Math.round(windowMs)}ms (${fps.toFixed(1)} fps)`,
    ];

    for (const [name, s] of this.stages) {
      const avg = s.total / s.count;
      lines.push(
        `  ${name.padEnd(24)} ${avg.toFixed(1)}ms avg (${s.min.toFixed(1)}–${s.max.toFixed(1)}) ×${s.count}`
      );
    }

    for (const [name, value] of this.counts) {
      const avg = value / this.frameCount;
      lines.push(
        `  ${name.padEnd(24)} ${avg.toFixed(1)} avg (total: ${value})`
      );
    }

    console.log(lines.join('\n'));

    // Reset
    this.stages.clear();
    this.counts.clear();
    this.frameCount = 0;
    this.windowStart = performance.now();
  }
}

export const PerfTrace = new PerfTraceImpl();

// Expose globally for easy console toggling:
//   PerfTrace.enabled = true
if (typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>).PerfTrace = PerfTrace;
}
