/**
 * LogCurves - Preset log-to-linear conversion curves for common camera formats
 *
 * Provides mathematically accurate log-to-linear and linear-to-log conversion
 * functions for common camera recording formats.
 */

/**
 * Log curve parameters and conversion functions
 */
export interface LogCurveParams {
  /** Human-readable name */
  name: string;
  /** Short identifier */
  id: string;
  /** Convert log-encoded value to linear */
  toLinear: (v: number) => number;
  /** Convert linear value to log-encoded */
  toLog: (v: number) => number;
}

/**
 * Cineon Film Log (10-bit)
 *
 * Traditional film log encoding used in DPX/Cineon files.
 * Standard printing density encoding.
 */
const CINEON: LogCurveParams = {
  name: 'Cineon Film Log',
  id: 'cineon',
  toLinear: (v: number): number => {
    // Standard Cineon-to-linear conversion
    // Based on printing density with reference black at 95 and white at 685 (10-bit)
    const refBlack = 95.0;
    const refWhite = 685.0;
    const displayGamma = 1.7;

    // Convert normalized (0-1) to 10-bit code value
    const cv = v * 1023.0;

    // Clamp to valid range
    if (cv <= refBlack) return 0.0;

    // Apply the Cineon log-to-linear formula
    const relativeCV = (cv - refBlack) / (refWhite - refBlack);
    const linear = Math.pow(10, (relativeCV - 0.5) * displayGamma);

    return Math.max(0, linear);
  },
  toLog: (v: number): number => {
    const refBlack = 95.0;
    const refWhite = 685.0;
    const displayGamma = 1.7;

    // Clamp input
    const linear = Math.max(0.0001, v);

    // Apply linear-to-log formula
    const relativeCV = Math.log10(linear) / displayGamma + 0.5;
    const cv = relativeCV * (refWhite - refBlack) + refBlack;

    return cv / 1023.0;
  },
};

/**
 * ARRI LogC3 (EI 800)
 *
 * Standard ARRI ALEXA log curve at EI 800.
 */
const ARRI_LOGC3: LogCurveParams = {
  name: 'ARRI LogC3 (EI 800)',
  id: 'arri_logc3',
  toLinear: (v: number): number => {
    // LogC3 EI 800 constants
    const cut = 0.010591;
    const a = 5.555556;
    const b = 0.052272;
    const c = 0.247190;
    const d = 0.385537;
    const e = 5.367655;
    const f = 0.092809;

    const cutPoint = e * cut + f;

    if (v > cutPoint) {
      return (Math.pow(10, (v - d) / c) - b) / a;
    } else {
      return (v - f) / e;
    }
  },
  toLog: (v: number): number => {
    const cut = 0.010591;
    const a = 5.555556;
    const b = 0.052272;
    const c = 0.247190;
    const d = 0.385537;
    const e = 5.367655;
    const f = 0.092809;

    if (v > cut) {
      return c * Math.log10(a * v + b) + d;
    } else {
      return e * v + f;
    }
  },
};

/**
 * ARRI LogC4
 *
 * New ARRI ALEXA 35 log curve with extended dynamic range.
 */
const ARRI_LOGC4: LogCurveParams = {
  name: 'ARRI LogC4',
  id: 'arri_logc4',
  toLinear: (v: number): number => {
    // LogC4 constants
    const a = (Math.pow(2, 18) - 16) / 117.45;
    const b = (16 - 64) / 117.45;
    const c = 14.0;
    const s = (7 * Math.log(2) * Math.pow(2, 7 - 14 * 0)) / (a * Math.log(10));
    const t = (Math.pow(2, 7 - 14 * 0) - b) / a;

    if (v >= 0) {
      const lin = (Math.pow(2, c * v - 7) - b) / a;
      return lin;
    } else {
      // Linear segment for negative values
      return s * v + t;
    }
  },
  toLog: (v: number): number => {
    const a = (Math.pow(2, 18) - 16) / 117.45;
    const b = (16 - 64) / 117.45;
    const c = 14.0;
    const s = (7 * Math.log(2) * Math.pow(2, 7 - 14 * 0)) / (a * Math.log(10));
    const t = (Math.pow(2, 7 - 14 * 0) - b) / a;

    if (v >= t) {
      return (Math.log2(a * v + b) + 7) / c;
    } else {
      return (v - t) / s;
    }
  },
};

/**
 * Sony S-Log3
 *
 * Sony's third-generation log encoding for professional cameras.
 */
const SONY_SLOG3: LogCurveParams = {
  name: 'Sony S-Log3',
  id: 'sony_slog3',
  toLinear: (v: number): number => {
    // S-Log3 constants (10-bit code values normalized to 0-1)
    const cutPoint = 171.2102946929 / 1023;

    if (v >= cutPoint) {
      return Math.pow(10, (v * 1023 - 420) / 261.5) * (0.18 + 0.01) - 0.01;
    } else {
      return (v * 1023 - 95) * 0.01125 / (171.2102946929 - 95);
    }
  },
  toLog: (v: number): number => {
    const linear = v + 0.01;

    if (linear >= 0.01125) {
      return (420 + Math.log10(linear / 0.19) * 261.5) / 1023;
    } else {
      return (linear / 0.01125 * (171.2102946929 - 95) + 95) / 1023;
    }
  },
};

/**
 * RED Log3G10
 *
 * RED's log encoding used in REDCODE RAW.
 */
const RED_LOG3G10: LogCurveParams = {
  name: 'RED Log3G10',
  id: 'red_log3g10',
  toLinear: (v: number): number => {
    // Log3G10 constants
    const a = 0.224282;
    const b = 155.975327;
    const c = 0.01;
    const g = 15.1927;

    if (v < 0) {
      return v / g;
    } else {
      return (Math.pow(10, v / a) - 1) / b - c;
    }
  },
  toLog: (v: number): number => {
    const a = 0.224282;
    const b = 155.975327;
    const c = 0.01;
    const g = 15.1927;

    if (v < -c) {
      return (v + c) * g;
    } else {
      return a * Math.log10((v + c) * b + 1);
    }
  },
};

/**
 * Thomson Viper FilmStream Log (10-bit)
 *
 * Proprietary log encoding from the Thomson Viper camera.
 * Uses different reference levels from Cineon: black=16, white=1000 in 10-bit.
 * NOT a Cineon variant — has different reference black/white points and gamma.
 */
const VIPER: LogCurveParams = {
  name: 'Thomson Viper Log',
  id: 'viper',
  toLinear: (v: number): number => {
    // Viper log-to-linear conversion
    // Reference black at 16 and white at 1000 (10-bit code values)
    const refBlack = 16.0 / 1023.0;
    const refWhite = 1000.0 / 1023.0;
    const displayGamma = 0.6;

    // Clamp to valid range
    if (v <= refBlack) return 0.0;
    if (v >= refWhite) return 1.0;

    // Normalized position in the log range [0, 1]
    const normalized = (v - refBlack) / (refWhite - refBlack);

    // Log-to-linear: pow(10, (normalized - 1) * gamma), then normalize
    // so that refBlack -> 0.0 and refWhite -> 1.0
    const blackOffset = Math.pow(10, -displayGamma);
    const linear = (Math.pow(10, (normalized - 1.0) * displayGamma) - blackOffset) / (1.0 - blackOffset);

    return Math.max(0, linear);
  },
  toLog: (v: number): number => {
    const refBlack = 16.0 / 1023.0;
    const refWhite = 1000.0 / 1023.0;
    const displayGamma = 0.6;

    // Clamp input
    const linear = Math.max(0.0001, Math.min(v, 1.0));

    // Inverse of toLinear:
    // linear = (pow(10, (norm - 1) * gamma) - blackOffset) / (1 - blackOffset)
    // => linear * (1 - blackOffset) + blackOffset = pow(10, (norm - 1) * gamma)
    // => (norm - 1) * gamma = log10(linear * (1 - blackOffset) + blackOffset)
    // => norm = log10(linear * (1 - blackOffset) + blackOffset) / gamma + 1
    const blackOffset = Math.pow(10, -displayGamma);
    const norm = Math.log10(linear * (1.0 - blackOffset) + blackOffset) / displayGamma + 1.0;

    return norm * (refWhite - refBlack) + refBlack;
  },
};

/**
 * Available log curves collection
 */
export const LOG_CURVES = {
  none: null,
  cineon: CINEON,
  viper: VIPER,
  arri_logc3: ARRI_LOGC3,
  arri_logc4: ARRI_LOGC4,
  sony_slog3: SONY_SLOG3,
  red_log3g10: RED_LOG3G10,
} as const;

export type LogCurveId = keyof typeof LOG_CURVES;

/**
 * Get all available log curve options for UI
 */
export function getLogCurveOptions(): Array<{ id: LogCurveId; name: string }> {
  return [
    { id: 'none', name: 'None (Linear)' },
    { id: 'cineon', name: CINEON.name },
    { id: 'viper', name: VIPER.name },
    { id: 'arri_logc3', name: ARRI_LOGC3.name },
    { id: 'arri_logc4', name: ARRI_LOGC4.name },
    { id: 'sony_slog3', name: SONY_SLOG3.name },
    { id: 'red_log3g10', name: RED_LOG3G10.name },
  ];
}

/**
 * Build a 1D lookup table for log-to-linear conversion
 *
 * @param curve - The log curve to use
 * @param size - LUT size (default: 1024)
 * @returns Float32Array with linear values
 */
export function buildLogLUT(curve: LogCurveParams, size = 1024): Float32Array {
  const lut = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    const logValue = i / (size - 1);
    lut[i] = curve.toLinear(logValue);
  }

  return lut;
}

/**
 * Build GLSL function string for log-to-linear conversion
 *
 * @param curveId - The log curve identifier
 * @returns GLSL function code
 */
export function buildLogToLinearGLSL(curveId: LogCurveId): string {
  switch (curveId) {
    case 'cineon':
      return `
        float logToLinear(float v) {
          float refBlack = 95.0 / 1023.0;
          float refWhite = 685.0 / 1023.0;
          float gamma = 0.6;
          float offset = 0.0108;
          float normalized = (v - refBlack) / (refWhite - refBlack);
          return max(0.0, (pow(10.0, normalized * 0.002 / gamma) - offset) / (1.0 - offset));
        }
      `;
    case 'viper':
      return `
        float logToLinear(float v) {
          float refBlack = 16.0 / 1023.0;
          float refWhite = 1000.0 / 1023.0;
          float displayGamma = 0.6;
          if (v <= refBlack) return 0.0;
          if (v >= refWhite) return 1.0;
          float normalized = (v - refBlack) / (refWhite - refBlack);
          float blackOffset = pow(10.0, -displayGamma);
          return max(0.0, (pow(10.0, (normalized - 1.0) * displayGamma) - blackOffset) / (1.0 - blackOffset));
        }
      `;
    case 'arri_logc3':
      return `
        float logToLinear(float v) {
          float cut = 0.010591;
          float a = 5.555556;
          float b = 0.052272;
          float c = 0.247190;
          float d = 0.385537;
          float e = 5.367655;
          float f = 0.092809;
          float cutPoint = e * cut + f;
          if (v > cutPoint) {
            return (pow(10.0, (v - d) / c) - b) / a;
          } else {
            return (v - f) / e;
          }
        }
      `;
    case 'arri_logc4':
      return `
        float logToLinear(float v) {
          float a = (pow(2.0, 18.0) - 16.0) / 117.45;
          float b = (16.0 - 64.0) / 117.45;
          float c = 14.0;
          return (pow(2.0, c * v - 7.0) - b) / a;
        }
      `;
    case 'sony_slog3':
      return `
        float logToLinear(float v) {
          float cutPoint = 171.2102946929 / 1023.0;
          if (v >= cutPoint) {
            return pow(10.0, (v * 1023.0 - 420.0) / 261.5) * 0.19 - 0.01;
          } else {
            return (v * 1023.0 - 95.0) * 0.01125 / (171.2102946929 - 95.0);
          }
        }
      `;
    case 'red_log3g10':
      return `
        float logToLinear(float v) {
          float a = 0.224282;
          float b = 155.975327;
          float c = 0.01;
          float g = 15.1927;
          if (v < 0.0) {
            return v / g;
          } else {
            return (pow(10.0, v / a) - 1.0) / b - c;
          }
        }
      `;
    default:
      return `
        float logToLinear(float v) {
          return v; // Pass-through for linear
        }
      `;
  }
}

/**
 * Apply log curve to RGB color
 *
 * @param curve - The log curve to use
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @returns Linear RGB values
 */
export function applyLogCurve(
  curve: LogCurveParams,
  r: number,
  g: number,
  b: number
): [number, number, number] {
  return [curve.toLinear(r), curve.toLinear(g), curve.toLinear(b)];
}
