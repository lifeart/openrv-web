#version 300 es
      precision highp float;
      precision highp sampler3D;
      in vec2 v_texCoord;
      out vec4 fragColor;
      uniform sampler2D u_texture;

      // Color adjustments
      uniform float u_exposure;      // -5 to +5 stops
      uniform float u_gamma;         // 0.1 to 4.0
      uniform float u_saturation;    // 0 to 2
      uniform float u_contrast;      // 0 to 2
      uniform float u_brightness;    // -1 to +1
      uniform float u_temperature;   // -100 to +100
      uniform float u_tint;          // -100 to +100

      // Hue rotation: luminance-preserving 3x3 matrix
      uniform mat3 u_hueRotationMatrix;
      uniform bool u_hueRotationEnabled;

      // Tone mapping
      uniform int u_toneMappingOperator;  // 0=off, 1=reinhard, 2=filmic, 3=aces
      uniform float u_tmReinhardWhitePoint;  // Reinhard white point (default 4.0)
      uniform float u_tmFilmicExposureBias;  // Filmic exposure bias (default 2.0)
      uniform float u_tmFilmicWhitePoint;    // Filmic white point (default 11.2)

      // Color inversion
      uniform bool u_invert;

      // HDR output mode: 0=SDR (clamp), 1=HDR passthrough
      uniform int u_outputMode;

      // Input transfer function: 0=sRGB/linear, 1=HLG, 2=PQ
      uniform int u_inputTransfer;

      // --- Phase 3: Effect uniforms ---

      // CDL (Color Decision List)
      uniform bool u_cdlEnabled;
      uniform vec3 u_cdlSlope;
      uniform vec3 u_cdlOffset;
      uniform vec3 u_cdlPower;
      uniform float u_cdlSaturation;

      // Curves (1D LUT texture)
      uniform sampler2D u_curvesLUT;    // 256x1 RGBA (R=red, G=green, B=blue, A=master)
      uniform bool u_curvesEnabled;

      // Color Wheels (Lift/Gamma/Gain)
      uniform bool u_colorWheelsEnabled;
      uniform vec4 u_wheelLift;   // r, g, b, luminance
      uniform vec4 u_wheelGamma;  // r, g, b, luminance
      uniform vec4 u_wheelGain;   // r, g, b, luminance

      // False Color (1D LUT texture)
      uniform sampler2D u_falseColorLUT; // 256x1 RGB texture
      uniform bool u_falseColorEnabled;

      // Zebra Stripes
      uniform bool u_zebraEnabled;
      uniform float u_zebraHighThreshold;
      uniform float u_zebraLowThreshold;
      uniform float u_zebraTime;
      uniform bool u_zebraHighEnabled;
      uniform bool u_zebraLowEnabled;

      // Channel Isolation
      uniform int u_channelMode; // 0=rgb, 1=red, 2=green, 3=blue, 4=alpha, 5=luminance

      // 3D LUT (single-pass float precision)
      uniform sampler3D u_lut3D;
      uniform bool u_lut3DEnabled;
      uniform float u_lut3DIntensity;
      uniform float u_lut3DSize;

      // Display transfer function
      uniform int u_displayTransfer;    // 0=linear, 1=sRGB, 2=rec709, 3=gamma2.2, 4=gamma2.4, 5=custom
      uniform float u_displayGamma;     // display gamma override (1.0 = no override)
      uniform float u_displayBrightness; // display brightness multiplier (1.0 = no change)
      uniform float u_displayCustomGamma; // custom gamma value (only used when u_displayTransfer == 5)

      // Background pattern
      uniform int u_backgroundPattern;    // 0=none, 1=solid, 2=checker, 3=crosshatch
      uniform vec3 u_bgColor1;            // primary color
      uniform vec3 u_bgColor2;            // secondary color (checker/crosshatch)
      uniform float u_bgCheckerSize;      // checker size in pixels
      uniform vec2 u_resolution;          // canvas resolution

      // --- Phase 1B: New GPU shader effect uniforms ---

      // Highlights/Shadows/Whites/Blacks
      uniform bool u_hsEnabled;
      uniform float u_highlights;     // -1.0 to +1.0
      uniform float u_shadows;        // -1.0 to +1.0
      uniform float u_whites;         // -1.0 to +1.0
      uniform float u_blacks;         // -1.0 to +1.0

      // Vibrance
      uniform bool u_vibranceEnabled;
      uniform float u_vibrance;                // -1.0 to +1.0
      uniform bool u_vibranceSkinProtection;

      // Clarity (local contrast enhancement)
      uniform bool u_clarityEnabled;
      uniform float u_clarity;     // -1.0 to +1.0
      uniform vec2 u_texelSize;    // 1.0 / textureResolution

      // Sharpen (unsharp mask) - reuses u_texelSize
      uniform bool u_sharpenEnabled;
      uniform float u_sharpenAmount;   // 0.0 to 1.0

      // HSL Qualifier (secondary color correction)
      uniform bool u_hslQualifierEnabled;
      uniform float u_hslHueCenter;        // 0-360
      uniform float u_hslHueWidth;         // degrees
      uniform float u_hslHueSoftness;      // 0-100
      uniform float u_hslSatCenter;        // 0-100
      uniform float u_hslSatWidth;         // percent
      uniform float u_hslSatSoftness;      // 0-100
      uniform float u_hslLumCenter;        // 0-100
      uniform float u_hslLumWidth;         // percent
      uniform float u_hslLumSoftness;      // 0-100
      uniform float u_hslCorrHueShift;     // -180 to +180
      uniform float u_hslCorrSatScale;     // multiplier
      uniform float u_hslCorrLumScale;     // multiplier
      uniform bool u_hslInvert;
      uniform bool u_hslMattePreview;

      // Luminance coefficients (Rec. 709)
      const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

      // Temperature/tint adjustment (simplified Kelvin shift)
      vec3 applyTemperature(vec3 color, float temp, float tint) {
        // Temperature shifts blue-orange
        // Tint shifts green-magenta
        float t = temp / 100.0;
        float g = tint / 100.0;

        color.r += t * 0.1;
        color.b -= t * 0.1;
        color.g += g * 0.1;
        color.r -= g * 0.05;
        color.b -= g * 0.05;

        return color;
      }

      // Reinhard tone mapping operator
      // Simple global operator that preserves detail in highlights
      // Reference: Reinhard et al., "Photographic Tone Reproduction for Digital Images"
      vec3 tonemapReinhard(vec3 color) {
        float wp2 = u_tmReinhardWhitePoint * u_tmReinhardWhitePoint;
        return color * (1.0 + color / wp2) / (1.0 + color);
      }

      // Filmic tone mapping (Uncharted 2 style)
      // S-curve response similar to film stock
      // Reference: John Hable, "Uncharted 2: HDR Lighting"
      vec3 filmic(vec3 x) {
        float A = 0.15;  // Shoulder strength
        float B = 0.50;  // Linear strength
        float C = 0.10;  // Linear angle
        float D = 0.20;  // Toe strength
        float E = 0.02;  // Toe numerator
        float F = 0.30;  // Toe denominator
        return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
      }

      vec3 tonemapFilmic(vec3 color) {
        vec3 curr = filmic(u_tmFilmicExposureBias * color);
        vec3 whiteScale = vec3(1.0) / filmic(vec3(u_tmFilmicWhitePoint));
        // Clamp to non-negative to match CPU implementation (filmic curve can produce slightly negative values)
        return max(curr * whiteScale, vec3(0.0));
      }

      // ACES (Academy Color Encoding System) tone mapping
      // Industry standard for cinema
      // Reference: Academy ACES Output Transform
      vec3 tonemapACES(vec3 color) {
        // ACES fitted curve by Krzysztof Narkowicz
        float a = 2.51;
        float b = 0.03;
        float c = 2.43;
        float d = 0.59;
        float e = 0.14;
        return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
      }

      // Apply selected tone mapping operator
      vec3 applyToneMapping(vec3 color, int op) {
        if (op == 1) {
          return tonemapReinhard(color);
        } else if (op == 2) {
          return tonemapFilmic(color);
        } else if (op == 3) {
          return tonemapACES(color);
        }
        return color;  // op == 0 (off)
      }

      // --- Input EOTF functions (signal to linear) ---

      // HLG OETF^-1 (Rec. 2100 HLG, signal -> relative scene light)
      // Reference: ITU-R BT.2100-2, Table 5
      float hlgOETFInverse(float e) {
        const float a = 0.17883277;
        const float b = 0.28466892; // 1.0 - 4.0 * a
        const float c = 0.55991073; // 0.5 - a * ln(4.0 * a)
        if (e <= 0.5) {
          return (e * e) / 3.0;
        } else {
          return (exp((e - c) / a) + b) / 12.0;
        }
      }

      vec3 hlgToLinear(vec3 signal) {
        // Apply inverse OETF per channel, then OOTF (gamma 1.2 for 1000 cd/m²)
        vec3 scene = vec3(
          hlgOETFInverse(signal.r),
          hlgOETFInverse(signal.g),
          hlgOETFInverse(signal.b)
        );
        // HLG OOTF: Lw = Ys^(gamma-1) * scene, where gamma ≈ 1.2
        float ys = dot(scene, LUMA);
        float ootfGain = pow(max(ys, 1e-6), 0.2); // gamma - 1 = 0.2
        return scene * ootfGain;
      }

      // PQ EOTF (SMPTE ST 2084, signal -> linear cd/m² normalized to 1.0 = 10000 cd/m²)
      // Reference: SMPTE ST 2084:2014
      float pqEOTF(float n) {
        const float m1 = 0.1593017578125;  // 2610/16384
        const float m2 = 78.84375;          // 2523/32 * 128
        const float c1 = 0.8359375;         // 3424/4096
        const float c2 = 18.8515625;        // 2413/128
        const float c3 = 18.6875;           // 2392/128

        float nm1 = pow(max(n, 0.0), 1.0 / m2);
        float num = max(nm1 - c1, 0.0);
        float den = c2 - c3 * nm1;
        return pow(num / max(den, 1e-6), 1.0 / m1);
      }

      vec3 pqToLinear(vec3 signal) {
        // PQ encodes absolute luminance; 1.0 = 10000 cd/m²
        // Normalize so SDR white (203 cd/m²) → 1.0
        const float pqNormFactor = 10000.0 / 203.0;
        return vec3(
          pqEOTF(signal.r),
          pqEOTF(signal.g),
          pqEOTF(signal.b)
        ) * pqNormFactor;
      }

      // Apply 3D LUT with trilinear interpolation
      vec3 applyLUT3D(vec3 color) {
        vec3 c = clamp(color, 0.0, 1.0);
        float offset = 0.5 / u_lut3DSize;
        float scale = (u_lut3DSize - 1.0) / u_lut3DSize;
        vec3 lutCoord = c * scale + offset;
        vec3 lutColor = texture(u_lut3D, lutCoord).rgb;
        return mix(color, lutColor, u_lut3DIntensity);
      }

      // Display transfer functions (linear -> display encoded)
      float displayTransferSRGB(float c) {
        if (c <= 0.0031308) return c * 12.92;
        return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
      }

      float displayTransferRec709(float c) {
        if (c < 0.018) return 4.5 * c;
        return 1.099 * pow(c, 0.45) - 0.099;
      }

      vec3 applyDisplayTransfer(vec3 color, int tf) {
        vec3 c = max(color, 0.0);
        if (tf == 1) { // sRGB
          return vec3(displayTransferSRGB(c.r), displayTransferSRGB(c.g), displayTransferSRGB(c.b));
        } else if (tf == 2) { // Rec.709
          return vec3(displayTransferRec709(c.r), displayTransferRec709(c.g), displayTransferRec709(c.b));
        } else if (tf == 3) { // gamma 2.2
          return pow(c, vec3(1.0 / 2.2));
        } else if (tf == 4) { // gamma 2.4
          return pow(c, vec3(1.0 / 2.4));
        } else if (tf == 5) { // custom gamma
          return pow(c, vec3(1.0 / u_displayCustomGamma));
        }
        return c; // tf == 0 (linear)
      }

      // --- RGB↔HSL conversion helpers (used by vibrance and HSL qualifier) ---

      // Convert RGB (0-1 each) to HSL (h: 0-360, s: 0-1, l: 0-1)
      vec3 rgbToHsl(vec3 c) {
        float maxC = max(max(c.r, c.g), c.b);
        float minC = min(min(c.r, c.g), c.b);
        float l = (maxC + minC) * 0.5;
        float delta = maxC - minC;

        if (delta < 0.00001) {
          return vec3(0.0, 0.0, l);
        }

        float s = (l > 0.5) ? delta / (2.0 - maxC - minC) : delta / (maxC + minC);

        float h;
        if (maxC == c.r) {
          h = mod((c.g - c.b) / delta, 6.0);
        } else if (maxC == c.g) {
          h = (c.b - c.r) / delta + 2.0;
        } else {
          h = (c.r - c.g) / delta + 4.0;
        }
        h *= 60.0;

        return vec3(h, s, l);
      }

      // HSL to RGB helper
      float hueToRgb(float p, float q, float t) {
        float tt = t;
        if (tt < 0.0) tt += 1.0;
        if (tt > 1.0) tt -= 1.0;
        if (tt < 1.0 / 6.0) return p + (q - p) * 6.0 * tt;
        if (tt < 0.5) return q;
        if (tt < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - tt) * 6.0;
        return p;
      }

      // Convert HSL (h: 0-360, s: 0-1, l: 0-1) to RGB (0-1 each)
      vec3 hslToRgb(float h, float s, float l) {
        if (s < 0.00001) {
          return vec3(l);
        }

        float q = (l < 0.5) ? l * (1.0 + s) : l + s - l * s;
        float p = 2.0 * l - q;
        float hNorm = h / 360.0;

        return vec3(
          hueToRgb(p, q, hNorm + 1.0 / 3.0),
          hueToRgb(p, q, hNorm),
          hueToRgb(p, q, hNorm - 1.0 / 3.0)
        );
      }

      void main() {
        vec4 color = texture(u_texture, v_texCoord);

        // 0. Input EOTF: convert from transfer function to linear light
        if (u_inputTransfer == 1) {
          color.rgb = hlgToLinear(color.rgb);
        } else if (u_inputTransfer == 2) {
          color.rgb = pqToLinear(color.rgb);
        }

        // 1. Exposure (in stops, applied in linear space)
        color.rgb *= pow(2.0, u_exposure);

        // 2. Temperature and tint
        color.rgb = applyTemperature(color.rgb, u_temperature, u_tint);

        // 3. Brightness (simple offset)
        color.rgb += u_brightness;

        // 4. Contrast (pivot at 0.5)
        color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;

        // 5. Saturation
        float luma = dot(color.rgb, LUMA);
        color.rgb = mix(vec3(luma), color.rgb, u_saturation);

        // 5b. Highlights/Shadows/Whites/Blacks (before CDL/curves, matching CPU order)
        if (u_hsEnabled) {
          // Whites/Blacks clipping
          if (u_whites != 0.0 || u_blacks != 0.0) {
            float whitePoint = 1.0 - u_whites * (55.0 / 255.0);
            float blackPoint = u_blacks * (55.0 / 255.0);
            float range = whitePoint - blackPoint;
            if (range > 0.0) {
              color.rgb = clamp((color.rgb - blackPoint) / range, 0.0, 1.0);
            }
          }
          // Luminance for highlight/shadow masks
          float hsLum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
          float highlightMask = smoothstep(0.5, 1.0, hsLum);
          float shadowMask = 1.0 - smoothstep(0.0, 0.5, hsLum);
          // Apply highlights (positive = darken highlights)
          if (u_highlights != 0.0) {
            color.rgb -= u_highlights * highlightMask * (128.0 / 255.0);
          }
          // Apply shadows (positive = brighten shadows)
          if (u_shadows != 0.0) {
            color.rgb += u_shadows * shadowMask * (128.0 / 255.0);
          }
          color.rgb = clamp(color.rgb, 0.0, 1.0);
        }

        // 5c. Vibrance (intelligent saturation - boosts less-saturated colors more)
        if (u_vibranceEnabled && u_vibrance != 0.0) {
          vec3 vibHsl = rgbToHsl(clamp(color.rgb, 0.0, 1.0));
          float vibH = vibHsl.x; // 0-360
          float vibS = vibHsl.y; // 0-1
          float vibL = vibHsl.z; // 0-1

          float skinProt = 1.0;
          if (u_vibranceSkinProtection && vibH >= 20.0 && vibH <= 50.0 && vibS < 0.6 && vibL > 0.2 && vibL < 0.8) {
            float hueDistance = abs(vibH - 35.0) / 15.0;
            skinProt = 0.3 + (hueDistance * 0.7);
          }

          float satFactor = 1.0 - (vibS * 0.5);
          float adjustment = u_vibrance * satFactor * skinProt;
          float newS = clamp(vibS + adjustment, 0.0, 1.0);

          if (abs(newS - vibS) > 0.001) {
            color.rgb = hslToRgb(vibH, newS, vibL);
          }
        }

        // 5d. Hue rotation (luminance-preserving matrix)
        if (u_hueRotationEnabled) {
          color.rgb = u_hueRotationMatrix * color.rgb;
        }

        // 5e. Clarity (local contrast enhancement via unsharp mask on midtones)
        // NOTE: Clarity samples neighboring pixels from u_texture (the original source image).
        // In the CPU path, clarity operates on already-modified pixel data within the same
        // imageData buffer. The GPU single-pass approach samples the original texture for
        // the blur kernel, which means the high-frequency detail extraction is based on
        // ungraded pixel differences. This is a known architectural difference between the
        // GPU and CPU paths, accepted as a design trade-off for single-pass rendering
        // performance. The visual difference is minimal for most grading scenarios.
        if (u_clarityEnabled && u_clarity != 0.0) {
          // 5x5 Gaussian blur (separable weights: 1,4,6,4,1, total per axis = 16)
          vec3 blurred = vec3(0.0);
          float weights[5] = float[](1.0, 4.0, 6.0, 4.0, 1.0);
          float totalWeight = 0.0;
          for (int y = -2; y <= 2; y++) {
            for (int x = -2; x <= 2; x++) {
              float w = weights[x + 2] * weights[y + 2];
              blurred += texture(u_texture, v_texCoord + vec2(float(x), float(y)) * u_texelSize).rgb * w;
              totalWeight += w;
            }
          }
          blurred /= totalWeight;

          float clarityLum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
          float deviation = abs(clarityLum - 0.5) * 2.0;
          float midtoneMask = 1.0 - deviation * deviation;

          vec3 highFreq = color.rgb - blurred;
          float effectScale = u_clarity * 0.7; // CLARITY_EFFECT_SCALE
          color.rgb = clamp(color.rgb + highFreq * midtoneMask * effectScale, 0.0, 1.0);
        }

        // --- Color grading effects ---

        // 6a. Color Wheels (Lift/Gamma/Gain)
        if (u_colorWheelsEnabled) {
          float cwLuma = dot(color.rgb, LUMA);
          // Zone weights using smooth falloff
          float shadowW = smoothstep(0.5, 0.0, cwLuma);
          float highW = smoothstep(0.5, 1.0, cwLuma);
          float midW = 1.0 - shadowW - highW;

          // Lift (shadows)
          color.rgb += u_wheelLift.rgb * shadowW;

          // Gain (highlights)
          color.rgb *= 1.0 + u_wheelGain.rgb * highW;

          // Gamma (midtones) - power function
          if (midW > 0.0) {
            vec3 gammaExp = 1.0 / max(1.0 + u_wheelGamma.rgb, vec3(0.01));
            color.rgb = mix(color.rgb, pow(max(color.rgb, vec3(0.0)), gammaExp), midW);
          }
        }

        // 6b. CDL (Color Decision List)
        if (u_cdlEnabled) {
          color.rgb = pow(max(color.rgb * u_cdlSlope + u_cdlOffset, vec3(0.0)), u_cdlPower);
          float cdlLuma = dot(color.rgb, LUMA);
          color.rgb = mix(vec3(cdlLuma), color.rgb, u_cdlSaturation);
        }

        // 6c. Curves (1D LUT)
        if (u_curvesEnabled) {
          vec3 cc = clamp(color.rgb, 0.0, 1.0);
          vec3 excess = color.rgb - cc; // preserve HDR headroom
          // Apply per-channel curves
          cc.r = texture(u_curvesLUT, vec2(cc.r, 0.5)).r;
          cc.g = texture(u_curvesLUT, vec2(cc.g, 0.5)).g;
          cc.b = texture(u_curvesLUT, vec2(cc.b, 0.5)).b;
          // Apply master curve (stored in alpha)
          cc.r = texture(u_curvesLUT, vec2(cc.r, 0.5)).a;
          cc.g = texture(u_curvesLUT, vec2(cc.g, 0.5)).a;
          cc.b = texture(u_curvesLUT, vec2(cc.b, 0.5)).a;
          color.rgb = cc + excess;
        }

        // 6d. 3D LUT (single-pass, float precision)
        if (u_lut3DEnabled) {
          color.rgb = applyLUT3D(color.rgb);
        }

        // 6e. HSL Qualifier (secondary color correction)
        if (u_hslQualifierEnabled) {
          vec3 hslQ = rgbToHsl(clamp(color.rgb, 0.0, 1.0));
          float qH = hslQ.x;
          float qS = hslQ.y * 100.0;
          float qL = hslQ.z * 100.0;

          // Hue match (circular distance)
          float hueDist = abs(qH - u_hslHueCenter);
          if (hueDist > 180.0) hueDist = 360.0 - hueDist;
          float hueInner = u_hslHueWidth / 2.0;
          float hueOuter = hueInner + (u_hslHueSoftness * u_hslHueWidth) / 100.0;
          float hueMatch = hueDist <= hueInner ? 1.0 : (hueDist >= hueOuter ? 0.0 : smoothstep(hueOuter, hueInner, hueDist));

          // Saturation match (linear distance)
          float satDist = abs(qS - u_hslSatCenter);
          float satInner = u_hslSatWidth / 2.0;
          float satOuter = satInner + (u_hslSatSoftness * u_hslSatWidth) / 100.0;
          float satMatch = satDist <= satInner ? 1.0 : (satDist >= satOuter ? 0.0 : smoothstep(satOuter, satInner, satDist));

          // Luminance match (linear distance)
          float lumDist = abs(qL - u_hslLumCenter);
          float lumInner = u_hslLumWidth / 2.0;
          float lumOuter = lumInner + (u_hslLumSoftness * u_hslLumWidth) / 100.0;
          float lumMatch = lumDist <= lumInner ? 1.0 : (lumDist >= lumOuter ? 0.0 : smoothstep(lumOuter, lumInner, lumDist));

          float matte = hueMatch * satMatch * lumMatch;
          if (u_hslInvert) matte = 1.0 - matte;

          if (u_hslMattePreview) {
            color.rgb = vec3(matte);
          } else if (matte > 0.001) {
            float newH = qH + u_hslCorrHueShift * matte;
            if (newH < 0.0) newH += 360.0;
            if (newH >= 360.0) newH -= 360.0;
            float newS = clamp((hslQ.y * (1.0 - matte)) + (hslQ.y * u_hslCorrSatScale * matte), 0.0, 1.0);
            float newL = clamp((hslQ.z * (1.0 - matte)) + (hslQ.z * u_hslCorrLumScale * matte), 0.0, 1.0);
            color.rgb = hslToRgb(newH, newS, newL);
          }
        }

        // 7. Tone mapping (applied before display transfer for proper HDR handling)
        color.rgb = applyToneMapping(max(color.rgb, 0.0), u_toneMappingOperator);

        // 7b. Sharpen (unsharp mask, after tone mapping but before display transfer)
        // NOTE: Sharpen samples neighboring pixels from u_texture (the original source image).
        // In the CPU path, sharpen operates on already-modified pixel data within the same
        // imageData buffer. The GPU single-pass approach samples the original texture for
        // the convolution kernel, which means the sharpening detail is based on ungraded
        // pixel differences. This is a known architectural difference between the GPU and
        // CPU paths, accepted as a design trade-off for single-pass rendering performance.
        // The visual difference is minimal for most grading scenarios.
        if (u_sharpenEnabled && u_sharpenAmount > 0.0) {
          vec3 sharpOriginal = color.rgb;
          // 3x3 unsharp mask: center=5, cross=-1, diagonal=0
          vec3 sharpened = color.rgb * 5.0
            - texture(u_texture, v_texCoord + vec2(-1.0, 0.0) * u_texelSize).rgb
            - texture(u_texture, v_texCoord + vec2(1.0, 0.0) * u_texelSize).rgb
            - texture(u_texture, v_texCoord + vec2(0.0, -1.0) * u_texelSize).rgb
            - texture(u_texture, v_texCoord + vec2(0.0, 1.0) * u_texelSize).rgb;
          sharpened = clamp(sharpened, 0.0, 1.0);
          color.rgb = sharpOriginal + (sharpened - sharpOriginal) * u_sharpenAmount;
        }

        // 8. Display transfer function (replaces simple gamma)
        if (u_displayTransfer > 0) {
          color.rgb = applyDisplayTransfer(color.rgb, u_displayTransfer);
        } else {
          color.rgb = pow(max(color.rgb, 0.0), vec3(1.0 / u_gamma));
        }

        // 8b. Display gamma override
        if (u_displayGamma != 1.0) {
          color.rgb = pow(max(color.rgb, 0.0), vec3(1.0 / u_displayGamma));
        }

        // 8c. Display brightness
        color.rgb *= u_displayBrightness;

        // 9. Color inversion (after all corrections, before channel isolation)
        if (u_invert) {
          color.rgb = 1.0 - color.rgb;
        }

        // 10. Channel isolation
        if (u_channelMode == 1) { color.rgb = vec3(color.r); }
        else if (u_channelMode == 2) { color.rgb = vec3(color.g); }
        else if (u_channelMode == 3) { color.rgb = vec3(color.b); }
        else if (u_channelMode == 4) { color.rgb = vec3(color.a); }
        else if (u_channelMode == 5) { color.rgb = vec3(dot(color.rgb, LUMA)); }

        // 11. False Color (diagnostic overlay - replaces color)
        if (u_falseColorEnabled) {
          float fcLuma = dot(color.rgb, LUMA);
          float lumaSDR = clamp(fcLuma, 0.0, 1.0);
          color.rgb = texture(u_falseColorLUT, vec2(lumaSDR, 0.5)).rgb;
        }

        // 12. Zebra Stripes (diagnostic overlay)
        if (u_zebraEnabled) {
          float zLuma = dot(color.rgb, LUMA);
          vec2 pixelPos = v_texCoord * u_resolution;
          if (u_zebraHighEnabled && zLuma >= u_zebraHighThreshold) {
            float stripe = mod(pixelPos.x + pixelPos.y + u_zebraTime, 12.0);
            if (stripe < 6.0) { color.rgb = mix(color.rgb, vec3(1.0, 0.3, 0.3), 0.5); }
          }
          if (u_zebraLowEnabled && zLuma <= u_zebraLowThreshold) {
            float stripe = mod(pixelPos.x - pixelPos.y + u_zebraTime, 12.0);
            if (stripe < 6.0) { color.rgb = mix(color.rgb, vec3(0.3, 0.3, 1.0), 0.5); }
          }
        }

        // Final output
        if (u_outputMode == 0) {
          // SDR: clamp to [0,1] — identical to current behavior
          color.rgb = clamp(color.rgb, 0.0, 1.0);
        }
        // else: HDR — let values >1.0 pass through to the HDR drawing buffer

        // 13. Background pattern blend (alpha compositing)
        if (u_backgroundPattern > 0 && color.a < 1.0) {
          vec3 bgColor = u_bgColor1;
          if (u_backgroundPattern == 2) {
            // Checker pattern
            vec2 pxPos = gl_FragCoord.xy;
            float cx = floor(pxPos.x / u_bgCheckerSize);
            float cy = floor(pxPos.y / u_bgCheckerSize);
            bool isLight = mod(cx + cy, 2.0) < 1.0;
            bgColor = isLight ? u_bgColor1 : u_bgColor2;
          } else if (u_backgroundPattern == 3) {
            // Crosshatch pattern
            vec2 pxPos = gl_FragCoord.xy;
            float spacing = 12.0;
            float diag1 = mod(pxPos.x + pxPos.y, spacing);
            float diag2 = mod(pxPos.x - pxPos.y, spacing);
            bool onLine = diag1 < 1.0 || diag2 < 1.0;
            bgColor = onLine ? u_bgColor2 : u_bgColor1;
          }
          // u_backgroundPattern == 1 is solid, bgColor = u_bgColor1 already
          color.rgb = mix(bgColor, color.rgb, color.a);
          color.a = 1.0;
        }

        fragColor = color;
      }
