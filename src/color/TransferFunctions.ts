/**
 * TransferFunctions - Extended transfer function library
 *
 * Provides encode/decode pairs for industry-standard transfer functions
 * used in HDR, cinema camera, and broadcast workflows.
 *
 * Each function pair follows the naming convention:
 *   - {name}Encode: linear -> encoded (OETF)
 *   - {name}Decode: encoded -> linear (EOTF)
 */

// =============================================================================
// PQ (ST 2084) - Perceptual Quantizer for HDR10
// =============================================================================

/** PQ constants from SMPTE ST 2084 */
const PQ_M1 = 0.1593017578125; // = 2610 / 16384
const PQ_M2 = 78.84375; // = 2523 / 4096 * 128
const PQ_C1 = 0.8359375; // = 3424 / 4096
const PQ_C2 = 18.8515625; // = 2413 / 4096 * 32
const PQ_C3 = 18.6875; // = 2392 / 4096 * 32

/**
 * PQ (ST 2084) OETF - linear to PQ encoded
 * Input: normalized linear light (0-1 maps to 0-10000 cd/m2)
 */
export function pqEncode(linear: number): number {
  if (!Number.isFinite(linear)) {
    return Number.isNaN(linear) ? 0 : (linear > 0 ? 1 : 0);
  }
  if (linear < 0) return 0;
  const Ym1 = Math.pow(linear, PQ_M1);
  return Math.pow((PQ_C1 + PQ_C2 * Ym1) / (1 + PQ_C3 * Ym1), PQ_M2);
}

/**
 * PQ (ST 2084) EOTF - PQ encoded to linear
 */
export function pqDecode(encoded: number): number {
  if (!Number.isFinite(encoded)) {
    return Number.isNaN(encoded) ? 0 : (encoded > 0 ? 1 : 0);
  }
  if (encoded < 0) return 0;
  const Np = Math.pow(encoded, 1 / PQ_M2);
  const numerator = Math.max(Np - PQ_C1, 0);
  const denominator = PQ_C2 - PQ_C3 * Np;
  if (denominator <= 0) return 0;
  return Math.pow(numerator / denominator, 1 / PQ_M1);
}

// =============================================================================
// HLG (Hybrid Log-Gamma) - ITU-R BT.2100
// =============================================================================

const HLG_A = 0.17883277;
const HLG_B = 0.28466892; // = 1 - 4 * HLG_A
const HLG_C = 0.55991073; // = 0.5 - HLG_A * Math.log(4 * HLG_A)

/**
 * HLG OETF - linear to HLG encoded
 * Input: normalized scene-referred linear (0-1)
 */
export function hlgEncode(linear: number): number {
  if (!Number.isFinite(linear)) {
    return Number.isNaN(linear) ? 0 : (linear > 0 ? 1 : 0);
  }
  if (linear < 0) return 0;
  if (linear <= 1 / 12) {
    return Math.sqrt(3 * linear);
  }
  return HLG_A * Math.log(12 * linear - HLG_B) + HLG_C;
}

/**
 * HLG EOTF (inverse OETF) - HLG encoded to linear
 */
export function hlgDecode(encoded: number): number {
  if (!Number.isFinite(encoded)) {
    return Number.isNaN(encoded) ? 0 : (encoded > 0 ? 1 : 0);
  }
  if (encoded < 0) return 0;
  if (encoded <= 0.5) {
    return (encoded * encoded) / 3;
  }
  return (Math.exp((encoded - HLG_C) / HLG_A) + HLG_B) / 12;
}

// =============================================================================
// ARRI LogC3 (EI 800) - ARRI ALEXA
// =============================================================================

const LOGC3_CUT = 0.010591;
const LOGC3_A = 5.555556;
const LOGC3_B = 0.052272;
const LOGC3_C = 0.247190;
const LOGC3_D = 0.385537;
const LOGC3_E = 5.367655;
const LOGC3_F = 0.092809;
// Linear cut point in encoded domain
const LOGC3_ENCODED_CUT = LOGC3_E * LOGC3_CUT + LOGC3_F;

/**
 * ARRI LogC3 OETF (EI 800) - linear to LogC3
 */
export function logC3Encode(linear: number): number {
  if (!Number.isFinite(linear)) {
    return Number.isNaN(linear) ? 0 : (linear > 0 ? 1 : 0);
  }
  if (linear > LOGC3_CUT) {
    return LOGC3_C * Math.log10(LOGC3_A * linear + LOGC3_B) + LOGC3_D;
  }
  return LOGC3_E * linear + LOGC3_F;
}

/**
 * ARRI LogC3 EOTF (EI 800) - LogC3 to linear
 */
export function logC3Decode(encoded: number): number {
  if (!Number.isFinite(encoded)) {
    return Number.isNaN(encoded) ? 0 : (encoded > 0 ? 1 : 0);
  }
  if (encoded > LOGC3_ENCODED_CUT) {
    return (Math.pow(10, (encoded - LOGC3_D) / LOGC3_C) - LOGC3_B) / LOGC3_A;
  }
  return (encoded - LOGC3_F) / LOGC3_E;
}

// =============================================================================
// ARRI LogC4 - ARRI ALEXA 35
// =============================================================================

const LOGC4_A = 2231.82630906905;
const LOGC4_B = 64.0;
const LOGC4_C = 0.0740718950408889;
const LOGC4_S = 7.0;
const LOGC4_T = 1.0;
const LOGC4_CUT = 0.00937677;
// Linear cut (compute from the encoding equation)
const LOGC4_ENCODED_CUT = (LOGC4_CUT + LOGC4_T) / LOGC4_S;

/**
 * ARRI LogC4 OETF - linear to LogC4
 */
export function logC4Encode(linear: number): number {
  if (!Number.isFinite(linear)) {
    return Number.isNaN(linear) ? 0 : (linear > 0 ? 1 : 0);
  }
  if (linear >= LOGC4_CUT) {
    return (Math.log2(linear * LOGC4_A + LOGC4_B) + LOGC4_C) / 14.0;
  }
  return (linear * LOGC4_S + LOGC4_T) / 14.0;
}

/**
 * ARRI LogC4 EOTF - LogC4 to linear
 */
export function logC4Decode(encoded: number): number {
  if (!Number.isFinite(encoded)) {
    return Number.isNaN(encoded) ? 0 : (encoded > 0 ? 1 : 0);
  }
  const x = encoded * 14.0;
  if (encoded >= LOGC4_ENCODED_CUT) {
    return (Math.pow(2, x - LOGC4_C) - LOGC4_B) / LOGC4_A;
  }
  return (x - LOGC4_T) / LOGC4_S;
}

// =============================================================================
// RED Log3G10 - RED camera log encoding
// =============================================================================

const LOG3G10_A = 0.224282;
const LOG3G10_B = 155.975327;
const LOG3G10_C = 0.01;
const LOG3G10_G = 15.1927;

/**
 * RED Log3G10 OETF - linear to Log3G10
 */
export function log3G10Encode(linear: number): number {
  if (!Number.isFinite(linear)) {
    return Number.isNaN(linear) ? 0 : (linear > 0 ? 1 : 0);
  }
  const x = linear + LOG3G10_C;
  if (x < 0) {
    return x * LOG3G10_G;
  }
  return LOG3G10_A * Math.log10(x * LOG3G10_B + 1);
}

/**
 * RED Log3G10 EOTF - Log3G10 to linear
 */
export function log3G10Decode(encoded: number): number {
  if (!Number.isFinite(encoded)) {
    return Number.isNaN(encoded) ? 0 : (encoded > 0 ? 1 : 0);
  }
  if (encoded < 0) {
    return encoded / LOG3G10_G - LOG3G10_C;
  }
  return (Math.pow(10, encoded / LOG3G10_A) - 1) / LOG3G10_B - LOG3G10_C;
}

// =============================================================================
// Sony S-Log3 - Sony camera log encoding
// =============================================================================

/**
 * Sony S-Log3 OETF - linear to S-Log3
 */
export function slog3Encode(linear: number): number {
  if (!Number.isFinite(linear)) {
    return Number.isNaN(linear) ? 0 : (linear > 0 ? 1 : 0);
  }
  if (linear >= 0.01125000) {
    return (420.0 + Math.log10((linear + 0.01) / (0.18 + 0.01)) * 261.5) / 1023.0;
  }
  return (linear * (171.2102946929 - 95.0) / 0.01125000 + 95.0) / 1023.0;
}

/**
 * Sony S-Log3 EOTF - S-Log3 to linear
 */
export function slog3Decode(encoded: number): number {
  if (!Number.isFinite(encoded)) {
    return Number.isNaN(encoded) ? 0 : (encoded > 0 ? 1 : 0);
  }
  const x = encoded * 1023.0;
  if (x >= 171.2102946929) {
    return Math.pow(10, (x - 420.0) / 261.5) * (0.18 + 0.01) - 0.01;
  }
  return (x - 95.0) * 0.01125000 / (171.2102946929 - 95.0);
}

// =============================================================================
// Gamma Power Curves (2.2, 2.4, 2.6)
// =============================================================================

/**
 * Gamma 2.2 encode - linear to gamma 2.2
 */
export function gamma22Encode(linear: number): number {
  if (!Number.isFinite(linear)) {
    return Number.isNaN(linear) ? 0 : (linear > 0 ? 1 : 0);
  }
  if (linear < 0) return -Math.pow(-linear, 1 / 2.2);
  return Math.pow(linear, 1 / 2.2);
}

/**
 * Gamma 2.2 decode - gamma 2.2 to linear
 */
export function gamma22Decode(encoded: number): number {
  if (!Number.isFinite(encoded)) {
    return Number.isNaN(encoded) ? 0 : (encoded > 0 ? 1 : 0);
  }
  if (encoded < 0) return -Math.pow(-encoded, 2.2);
  return Math.pow(encoded, 2.2);
}

/**
 * Gamma 2.4 encode - linear to gamma 2.4
 */
export function gamma24Encode(linear: number): number {
  if (!Number.isFinite(linear)) {
    return Number.isNaN(linear) ? 0 : (linear > 0 ? 1 : 0);
  }
  if (linear < 0) return -Math.pow(-linear, 1 / 2.4);
  return Math.pow(linear, 1 / 2.4);
}

/**
 * Gamma 2.4 decode - gamma 2.4 to linear
 */
export function gamma24Decode(encoded: number): number {
  if (!Number.isFinite(encoded)) {
    return Number.isNaN(encoded) ? 0 : (encoded > 0 ? 1 : 0);
  }
  if (encoded < 0) return -Math.pow(-encoded, 2.4);
  return Math.pow(encoded, 2.4);
}

/**
 * Gamma 2.6 encode - linear to gamma 2.6
 */
export function gamma26Encode(linear: number): number {
  if (!Number.isFinite(linear)) {
    return Number.isNaN(linear) ? 0 : (linear > 0 ? 1 : 0);
  }
  if (linear < 0) return -Math.pow(-linear, 1 / 2.6);
  return Math.pow(linear, 1 / 2.6);
}

/**
 * Gamma 2.6 decode - gamma 2.6 to linear
 */
export function gamma26Decode(encoded: number): number {
  if (!Number.isFinite(encoded)) {
    return Number.isNaN(encoded) ? 0 : (encoded > 0 ? 1 : 0);
  }
  if (encoded < 0) return -Math.pow(-encoded, 2.6);
  return Math.pow(encoded, 2.6);
}

// =============================================================================
// ACEScct - ACES contrast-controlled log encoding
// =============================================================================

/** ACEScct cut point: 2^(-15) * 10.5402377416545 + 0.0729055341958355 */
const ACESCCT_CUT_LINEAR = 0.0078125; // = 2^(-7)
const ACESCCT_CUT_ENCODED = 0.155251141552511; // = (log2(0.0078125) + 9.72) / 17.52
const ACESCCT_SLOPE = 10.5402377416545;
const ACESCCT_OFFSET = 0.0729055341958355;

/**
 * ACEScct OETF - ACEScg linear to ACEScct encoded
 * Defined in ACES specification S-2016-001
 * Below cut: ACEScct = 10.5402377416545 * lin + 0.0729055341958355
 * Above cut: ACEScct = (log2(lin) + 9.72) / 17.52
 */
export function acescctEncode(linear: number): number {
  if (!Number.isFinite(linear)) {
    return Number.isNaN(linear) ? 0 : (linear > 0 ? 1 : 0);
  }
  if (linear <= ACESCCT_CUT_LINEAR) {
    return ACESCCT_SLOPE * Math.max(0, linear) + ACESCCT_OFFSET;
  }
  return (Math.log2(linear) + 9.72) / 17.52;
}

/**
 * ACEScct EOTF - ACEScct encoded to ACEScg linear
 * Inverse of acescctEncode per S-2016-001
 * Below cut: lin = (ACEScct - 0.0729055341958355) / 10.5402377416545
 * Above cut: lin = 2^(ACEScct * 17.52 - 9.72)
 */
export function acescctDecode(encoded: number): number {
  if (!Number.isFinite(encoded)) {
    return Number.isNaN(encoded) ? 0 : (encoded > 0 ? 1 : 0);
  }
  if (encoded > ACESCCT_CUT_ENCODED) {
    return Math.pow(2, encoded * 17.52 - 9.72);
  }
  return Math.max(0, (encoded - ACESCCT_OFFSET) / ACESCCT_SLOPE);
}
