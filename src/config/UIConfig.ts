/**
 * Centralized UI-related constants.
 *
 * Crop limits, paint scaling factors, and other numeric thresholds used
 * by UI components and painting tools.
 */

// ---------------------------------------------------------------------------
// Crop / Uncrop Limits
// ---------------------------------------------------------------------------

/** Minimum crop region fraction (5% of image dimension) */
export const MIN_CROP_FRACTION = 0.05;

/** Maximum allowed uncrop padding in pixels per side */
export const MAX_UNCROP_PADDING = 2000;

// ---------------------------------------------------------------------------
// Paint / Annotation Scaling
// ---------------------------------------------------------------------------

/** Scale factor for pen width when serializing to RV format */
export const RV_PEN_WIDTH_SCALE = 500;

/** Scale factor for text size when serializing to RV format */
export const RV_TEXT_SIZE_SCALE = 2000;
