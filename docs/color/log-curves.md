# Log Curve Presets

Log encoding is a technique used by cinema cameras to record a wider dynamic range in a limited bit depth. By distributing code values logarithmically rather than linearly, log encoding preserves more detail in both shadows and highlights than a linear recording would allow. OpenRV Web provides mathematically accurate log-to-linear conversion presets for all major camera formats.

![Log curve presets](/assets/screenshots/30-log-curves.png)

---

## Why Log Encoding Matters

Raw footage from cinema cameras (ARRI ALEXA, Sony VENICE, RED) is typically recorded in a log encoding. Viewed without conversion, log footage appears flat and desaturated. The log-to-linear conversion (sometimes called "linearization") restores the image to its intended appearance and is a prerequisite for correct color grading.

Without proper linearization, all downstream color corrections (exposure, contrast, saturation, CDL, LUTs) operate on non-linear data, producing mathematically incorrect and visually unpredictable results.

---

## Supported Camera Formats

### Cineon Film Log

The traditional film scanning log encoding used in DPX and Cineon files. Based on printing density with reference black at code value 95 and reference white at 685 (10-bit). Uses a display gamma of 1.7.

### Thomson Viper Log

Proprietary log encoding from the Thomson Viper camera. Uses different reference levels from Cineon: black at 16, white at 1000 (10-bit) with a display gamma of 0.6. Not a Cineon variant.

### ARRI LogC3 (EI 800)

The standard log curve for the ARRI ALEXA camera system at Exposure Index 800. LogC3 uses a two-segment function: a linear segment for very low light levels and a logarithmic segment for the main exposure range. This provides approximately 14 stops of dynamic range.

### ARRI LogC4

The next-generation log curve for the ARRI ALEXA 35 camera. LogC4 extends the dynamic range beyond LogC3 with a different set of encoding parameters. It uses a base-2 logarithm rather than base-10.

### Sony S-Log3

Sony's third-generation log encoding for professional cameras including the VENICE and FX series. S-Log3 is designed to match the characteristics of Cineon film scanning more closely than earlier S-Log versions, making it compatible with film-based workflows.

### RED Log3G10

RED's log encoding used in REDCODE RAW recording. Log3G10 encodes an extremely wide dynamic range with a different mathematical formulation from other log curves, using a base-10 logarithm with specific constants tuned for RED sensor characteristics.

---

## Applying a Log Curve

1. Open the Color tab and locate the **Log Curve** selector in the color controls or OCIO panel.
2. Select the log encoding that matches the source media.
3. The image is immediately linearized and displayed with correct brightness and contrast.

When set to **None (Linear)**, no log-to-linear conversion is applied, which is appropriate for already-linear source material such as EXR renders or sRGB images.

---

## GPU Processing

Log-to-linear conversion is performed entirely on the GPU at the beginning of the rendering pipeline (stage 0c, Linearize). The conversion functions are compiled directly into the fragment shader as GLSL code, eliminating any CPU overhead.

Each log curve generates specialized GLSL shader code with the exact mathematical constants for that encoding. The GPU evaluates the log-to-linear function per pixel, per channel, at full frame rate.

For CPU fallback paths, OpenRV Web can also pre-build a 1024-entry 1D lookup table from any log curve for fast evaluation.

---

## Log-to-Linear vs Linear-to-Log

Each log curve preset provides both directions:

- **Log-to-linear (toLinear):** Converts camera-recorded log values to scene-referred linear light. This is the standard direction for viewing and grading.
- **Linear-to-log (toLog):** Converts linear values back to log encoding. Used when exporting graded footage that must remain in the camera's native encoding.

---

## Related Pages

- [OCIO Integration](ocio.md) -- log curves as input color spaces in the OCIO pipeline
- [Primary Color Controls](primary-controls.md) -- color adjustments applied after linearization
- [Display Profiles](display-profiles.md) -- display transfer functions (output encoding)
- [Rendering Pipeline](../guides/rendering-pipeline.md) -- linearize stage position (stage 0c)
