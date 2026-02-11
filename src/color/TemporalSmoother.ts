/**
 * TemporalSmoother - Generic exponential moving average (EMA) utility.
 *
 * Smooths values over time using the formula:
 *   smoothed = previous + alpha * (current - previous)
 *
 * Used by AutoExposureController for temporal stability.
 * Also available for future scene-adaptive parameters.
 */
export class TemporalSmoother {
  private previousValues = new Map<string, number>();

  /**
   * Smooth a value using exponential moving average.
   *
   * On first call for a given key, returns the raw value (instant convergence).
   * On subsequent calls, applies EMA with the specified alpha.
   *
   * @param key - Unique identifier for this value stream
   * @param currentValue - Current raw value
   * @param alpha - Smoothing factor (0 = no change, 1 = instant)
   * @returns Smoothed value
   */
  smooth(key: string, currentValue: number, alpha: number): number {
    const prev = this.previousValues.get(key);
    if (prev === undefined) {
      this.previousValues.set(key, currentValue);
      return currentValue;
    }
    const smoothed = prev + alpha * (currentValue - prev);
    this.previousValues.set(key, smoothed);
    return smoothed;
  }

  /**
   * Clear all stored values. Next call to smooth() will return the raw value.
   */
  reset(): void {
    this.previousValues.clear();
  }
}
