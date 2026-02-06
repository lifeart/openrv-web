import { IPImage, DataType } from '../core/image/Image';
import { ShaderProgram } from './ShaderProgram';
import { ColorAdjustments, DEFAULT_COLOR_ADJUSTMENTS } from '../ui/components/ColorControls';
import { ToneMappingState, ToneMappingOperator, DEFAULT_TONE_MAPPING_STATE } from '../ui/components/ToneMappingControl';
import { getHueRotationMatrix, isIdentityHueRotation } from '../color/HueRotation';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';
import type { RendererBackend, TextureHandle } from './RendererBackend';
import type { CDLValues } from '../color/CDL';
import type { ColorWheelsState } from '../ui/components/ColorWheels';
import type { ZebraState } from '../ui/components/ZebraStripes';
import type { BackgroundPatternState } from '../ui/components/BackgroundPatternControl';
import { PATTERN_COLORS } from '../ui/components/BackgroundPatternControl';
import type { CurveLUTs } from '../color/ColorCurves';
import type { ChannelMode } from '../ui/components/ChannelSelect';

// Re-export the interface and types so existing consumers can import from here
export type { RendererBackend, TextureHandle } from './RendererBackend';

/**
 * Tone mapping operator integer codes for shader uniform
 */
export const TONE_MAPPING_OPERATOR_CODES: Record<ToneMappingOperator, number> = {
  'off': 0,
  'reinhard': 1,
  'filmic': 2,
  'aces': 3,
};

/** Map ChannelMode string to shader integer */
const CHANNEL_MODE_CODES: Record<ChannelMode, number> = {
  'rgb': 0,
  'red': 1,
  'green': 2,
  'blue': 3,
  'alpha': 4,
  'luminance': 5,
};

/** Parse hex color to [r, g, b] normalized to 0-1 */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  }
  const num = parseInt(h, 16);
  return [(num >> 16) / 255, ((num >> 8) & 0xff) / 255, (num & 0xff) / 255];
}

/**
 * WebGL2-based renderer backend.
 *
 * This is the original Renderer class, now implementing the RendererBackend
 * interface. All behavior is identical to the pre-Phase 4 implementation.
 * Also exported as WebGL2Backend for clarity in backend selection.
 */
export class Renderer implements RendererBackend {
  // Color adjustments state
  private colorAdjustments: ColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;

  // Color inversion state
  private colorInversionEnabled = false;

  // Tone mapping state
  private toneMappingState: ToneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };

  // HDR output mode
  private hdrOutputMode: 'sdr' | 'hlg' | 'pq' = 'sdr';

  // Shaders
  private displayShader: ShaderProgram | null = null;

  // Quad geometry
  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadVBO: WebGLBuffer | null = null;

  // Current texture
  private currentTexture: WebGLTexture | null = null;

  // --- Phase 1: Background pattern state ---
  private bgPatternCode = 0; // 0=none/black, 1=solid, 2=checker, 3=crosshatch
  private bgColor1: [number, number, number] = [0, 0, 0];
  private bgColor2: [number, number, number] = [0, 0, 0];
  private bgCheckerSize = 16;

  // --- Phase 3: Effect state ---
  private cdlEnabled = false;
  private cdlSlope: [number, number, number] = [1, 1, 1];
  private cdlOffset: [number, number, number] = [0, 0, 0];
  private cdlPower: [number, number, number] = [1, 1, 1];
  private cdlSaturation = 1;

  private curvesEnabled = false;
  private curvesLUTTexture: WebGLTexture | null = null;
  private curvesLUTDirty = true;
  private curvesLUTData: Uint8Array | null = null; // 256 * 4 RGBA

  private colorWheelsEnabled = false;
  private wheelLift: [number, number, number, number] = [0, 0, 0, 0];
  private wheelGamma: [number, number, number, number] = [0, 0, 0, 0];
  private wheelGain: [number, number, number, number] = [0, 0, 0, 0];

  private falseColorEnabled = false;
  private falseColorLUTTexture: WebGLTexture | null = null;
  private falseColorLUTDirty = true;
  private falseColorLUTData: Uint8Array | null = null; // 256 * 3 RGB

  private zebraEnabled = false;
  private zebraHighThreshold = 0.95;
  private zebraLowThreshold = 0.05;
  private zebraHighEnabled = true;
  private zebraLowEnabled = false;
  private zebraTime = 0;

  private channelModeCode = 0; // 0=rgb

  initialize(canvas: HTMLCanvasElement, capabilities?: DisplayCapabilities): void {
    this.canvas = canvas;

    // For HDR displays, request preserveDrawingBuffer so readPixels works after compositing.
    const wantHDR = capabilities?.displayHDR === true;
    const gl = wantHDR
      ? canvas.getContext('webgl2', { preserveDrawingBuffer: true })
      : canvas.getContext('webgl2', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
        });

    if (!gl) {
      throw new Error('WebGL2 not supported');
    }

    this.gl = gl;

    // Set drawingBufferColorSpace IMMEDIATELY after getContext, before any
    // shader compilation or buffer creation. Chrome may lock the color space
    // once GL state is created. The reference example sets it right away.
    if (wantHDR && 'drawingBufferColorSpace' in gl) {
      const glExt = gl as unknown as { drawingBufferColorSpace: string };
      // Try HLG first, then PQ
      try {
        glExt.drawingBufferColorSpace = 'rec2100-hlg';
        if (glExt.drawingBufferColorSpace === 'rec2100-hlg') {
          this.hdrOutputMode = 'hlg';
          console.log('[Renderer] HDR output: rec2100-hlg');
        } else {
          glExt.drawingBufferColorSpace = 'rec2100-pq';
          if (glExt.drawingBufferColorSpace === 'rec2100-pq') {
            this.hdrOutputMode = 'pq';
            console.log('[Renderer] HDR output: rec2100-pq');
          } else {
            // Fall back to P3
            if (capabilities?.webglP3) {
              glExt.drawingBufferColorSpace = 'display-p3';
            }
            console.log(`[Renderer] HDR color spaces not accepted, drawingBufferColorSpace='${glExt.drawingBufferColorSpace}'`);
          }
        }
      } catch {
        // rec2100-hlg/pq not in PredefinedColorSpace enum — expected on most browsers.
        // Fall back to P3 if possible.
        try {
          if (capabilities?.webglP3) {
            (gl as unknown as { drawingBufferColorSpace: string }).drawingBufferColorSpace = 'display-p3';
          }
        } catch { /* ignore */ }
        console.log(`[Renderer] HDR color spaces not available, using ${capabilities?.webglP3 ? 'display-p3' : 'srgb'}`);
      }
    } else if (capabilities?.webglP3) {
      try {
        (gl as WebGL2RenderingContext & { drawingBufferColorSpace: string }).drawingBufferColorSpace = 'display-p3';
      } catch {
        // Browser doesn't support setting drawingBufferColorSpace
      }
    }

    // Check for required extensions
    const requiredExtensions = ['EXT_color_buffer_float', 'OES_texture_float_linear'];
    for (const ext of requiredExtensions) {
      if (!gl.getExtension(ext)) {
        console.warn(`Extension ${ext} not available`);
      }
    }

    this.initShaders();
    this.initQuad();
  }

  /**
   * Async initialization (no-op for WebGL2).
   *
   * WebGL2 is fully initialized synchronously in initialize(). This method
   * exists to satisfy the RendererBackend interface so that callers can use
   * a uniform `await backend.initAsync()` pattern across all backends.
   */
  async initAsync(): Promise<void> {
    // No-op: WebGL2 initialization is fully synchronous.
  }

  private initShaders(): void {
    if (!this.gl) return;

    // Simple display shader
    const vertSource = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;
      uniform vec2 u_offset;
      uniform vec2 u_scale;

      void main() {
        vec2 pos = a_position * u_scale + u_offset;
        gl_Position = vec4(pos, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fragSource = `#version 300 es
      precision highp float;
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

      // Background pattern
      uniform int u_backgroundPattern;    // 0=none, 1=solid, 2=checker, 3=crosshatch
      uniform vec3 u_bgColor1;            // primary color
      uniform vec3 u_bgColor2;            // secondary color (checker/crosshatch)
      uniform float u_bgCheckerSize;      // checker size in pixels
      uniform vec2 u_resolution;          // canvas resolution

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
        return color / (color + vec3(1.0));
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
        float exposureBias = 2.0;
        vec3 curr = filmic(exposureBias * color);
        vec3 whiteScale = vec3(1.0) / filmic(vec3(11.2));  // Linear white point
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

      // Smoothstep helper
      float smoothstepCustom(float edge0, float edge1, float x) {
        float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
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

        // 5b. Hue rotation (luminance-preserving matrix)
        if (u_hueRotationEnabled) {
          color.rgb = u_hueRotationMatrix * color.rgb;
        }

        // --- New effects (matching CPU pipeline order) ---

        // 6a. Color Wheels (Lift/Gamma/Gain)
        if (u_colorWheelsEnabled) {
          float cwLuma = dot(color.rgb, LUMA);
          // Zone weights using smooth falloff
          float shadowW = smoothstepCustom(0.5, 0.0, cwLuma);
          float highW = smoothstepCustom(0.5, 1.0, cwLuma);
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

        // 7. Tone mapping (applied before gamma for proper HDR handling)
        color.rgb = applyToneMapping(max(color.rgb, 0.0), u_toneMappingOperator);

        // 8. Gamma correction (display transform)
        color.rgb = pow(max(color.rgb, 0.0), vec3(1.0 / u_gamma));

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
    `;

    this.displayShader = new ShaderProgram(this.gl, vertSource, fragSource);
  }

  private initQuad(): void {
    if (!this.gl) return;

    const gl = this.gl;

    // Create VAO
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);

    // Create VBO with quad vertices and texcoords
    const vertices = new Float32Array([
      // Position    TexCoord
      -1, -1, 0, 1,
      1, -1, 1, 1,
      -1, 1, 0, 0,
      1, 1, 1, 0,
    ]);

    this.quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Position attribute
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

    // TexCoord attribute
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
  }

  resize(width: number, height: number): void {
    if (!this.canvas || !this.gl) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  clear(r = 0.1, g = 0.1, b = 0.1, a = 1): void {
    if (!this.gl) return;

    this.gl.clearColor(r, g, b, a);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  renderImage(
    image: IPImage,
    offsetX = 0,
    offsetY = 0,
    scaleX = 1,
    scaleY = 1
  ): void {
    if (!this.gl || !this.displayShader) return;

    const gl = this.gl;

    // Update texture if needed
    if (image.textureNeedsUpdate || !image.texture) {
      this.updateTexture(image);
    }

    // Use display shader
    this.displayShader.use();
    this.displayShader.setUniform('u_offset', [offsetX, offsetY]);
    this.displayShader.setUniform('u_scale', [scaleX, scaleY]);

    // Set color adjustment uniforms
    this.displayShader.setUniform('u_exposure', this.colorAdjustments.exposure);
    this.displayShader.setUniform('u_gamma', this.colorAdjustments.gamma);
    this.displayShader.setUniform('u_saturation', this.colorAdjustments.saturation);
    this.displayShader.setUniform('u_contrast', this.colorAdjustments.contrast);
    this.displayShader.setUniform('u_brightness', this.colorAdjustments.brightness);
    this.displayShader.setUniform('u_temperature', this.colorAdjustments.temperature);
    this.displayShader.setUniform('u_tint', this.colorAdjustments.tint);

    // Set hue rotation uniforms
    const hueRotationDegrees = this.colorAdjustments.hueRotation;
    if (isIdentityHueRotation(hueRotationDegrees)) {
      this.displayShader.setUniformInt('u_hueRotationEnabled', 0);
    } else {
      this.displayShader.setUniformInt('u_hueRotationEnabled', 1);
      const hueMatrix = getHueRotationMatrix(hueRotationDegrees);
      this.displayShader.setUniformMatrix3('u_hueRotationMatrix', hueMatrix);
    }

    // Set tone mapping uniform
    const toneMappingCode = this.toneMappingState.enabled
      ? TONE_MAPPING_OPERATOR_CODES[this.toneMappingState.operator]
      : 0;
    this.displayShader.setUniformInt('u_toneMappingOperator', toneMappingCode);

    // Set color inversion uniform
    this.displayShader.setUniformInt('u_invert', this.colorInversionEnabled ? 1 : 0);

    // Set HDR output mode uniform
    this.displayShader.setUniformInt('u_outputMode', this.hdrOutputMode === 'sdr' ? 0 : 1);

    // Set input transfer function uniform based on image metadata
    let inputTransferCode = 0; // 0 = sRGB/linear (default)
    if (image.metadata.transferFunction === 'hlg') {
      inputTransferCode = 1;
    } else if (image.metadata.transferFunction === 'pq') {
      inputTransferCode = 2;
    }
    this.displayShader.setUniformInt('u_inputTransfer', inputTransferCode);

    // --- Phase 3: Set effect uniforms ---

    // CDL
    this.displayShader.setUniformInt('u_cdlEnabled', this.cdlEnabled ? 1 : 0);
    if (this.cdlEnabled) {
      this.displayShader.setUniform('u_cdlSlope', this.cdlSlope);
      this.displayShader.setUniform('u_cdlOffset', this.cdlOffset);
      this.displayShader.setUniform('u_cdlPower', this.cdlPower);
      this.displayShader.setUniform('u_cdlSaturation', this.cdlSaturation);
    }

    // Curves LUT
    this.displayShader.setUniformInt('u_curvesEnabled', this.curvesEnabled ? 1 : 0);

    // Color Wheels
    this.displayShader.setUniformInt('u_colorWheelsEnabled', this.colorWheelsEnabled ? 1 : 0);
    if (this.colorWheelsEnabled) {
      this.displayShader.setUniform('u_wheelLift', this.wheelLift);
      this.displayShader.setUniform('u_wheelGamma', this.wheelGamma);
      this.displayShader.setUniform('u_wheelGain', this.wheelGain);
    }

    // False Color
    this.displayShader.setUniformInt('u_falseColorEnabled', this.falseColorEnabled ? 1 : 0);

    // Zebra Stripes
    this.displayShader.setUniformInt('u_zebraEnabled', this.zebraEnabled ? 1 : 0);
    if (this.zebraEnabled) {
      this.displayShader.setUniform('u_zebraHighThreshold', this.zebraHighThreshold);
      this.displayShader.setUniform('u_zebraLowThreshold', this.zebraLowThreshold);
      this.displayShader.setUniform('u_zebraTime', this.zebraTime);
      this.displayShader.setUniformInt('u_zebraHighEnabled', this.zebraHighEnabled ? 1 : 0);
      this.displayShader.setUniformInt('u_zebraLowEnabled', this.zebraLowEnabled ? 1 : 0);
    }

    // Channel mode
    this.displayShader.setUniformInt('u_channelMode', this.channelModeCode);

    // Background pattern
    this.displayShader.setUniformInt('u_backgroundPattern', this.bgPatternCode);
    if (this.bgPatternCode > 0) {
      this.displayShader.setUniform('u_bgColor1', this.bgColor1);
      this.displayShader.setUniform('u_bgColor2', this.bgColor2);
      this.displayShader.setUniform('u_bgCheckerSize', this.bgCheckerSize);
    }
    // Resolution is always needed for zebra stripes too
    this.displayShader.setUniform('u_resolution', [this.canvas?.width ?? 0, this.canvas?.height ?? 0]);

    // --- Bind textures ---

    // Texture unit 0: image
    this.displayShader.setUniformInt('u_texture', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, image.texture);

    // Texture unit 1: curves LUT
    if (this.curvesEnabled) {
      this.ensureCurvesLUTTexture();
      this.displayShader.setUniformInt('u_curvesLUT', 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.curvesLUTTexture);
    }

    // Texture unit 2: false color LUT
    if (this.falseColorEnabled) {
      this.ensureFalseColorLUTTexture();
      this.displayShader.setUniformInt('u_falseColorLUT', 2);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.falseColorLUTTexture);
    }

    // Draw quad
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  // --- LUT texture management ---

  private ensureCurvesLUTTexture(): void {
    const gl = this.gl;
    if (!gl) return;

    if (!this.curvesLUTTexture) {
      this.curvesLUTTexture = gl.createTexture();
      this.curvesLUTDirty = true;
    }

    if (this.curvesLUTDirty && this.curvesLUTData) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.curvesLUTTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.curvesLUTData);
      this.curvesLUTDirty = false;
    }
  }

  private ensureFalseColorLUTTexture(): void {
    const gl = this.gl;
    if (!gl) return;

    if (!this.falseColorLUTTexture) {
      this.falseColorLUTTexture = gl.createTexture();
      this.falseColorLUTDirty = true;
    }

    if (this.falseColorLUTDirty && this.falseColorLUTData) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.falseColorLUTTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      // Convert RGB (256*3) to RGBA (256*4) for WebGL
      const rgba = new Uint8Array(256 * 4);
      for (let i = 0; i < 256; i++) {
        rgba[i * 4] = this.falseColorLUTData[i * 3]!;
        rgba[i * 4 + 1] = this.falseColorLUTData[i * 3 + 1]!;
        rgba[i * 4 + 2] = this.falseColorLUTData[i * 3 + 2]!;
        rgba[i * 4 + 3] = 255;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      this.falseColorLUTDirty = false;
    }
  }

  private updateTexture(image: IPImage): void {
    if (!this.gl) return;

    const gl = this.gl;

    // Create texture if needed
    if (!image.texture) {
      image.texture = gl.createTexture();
    }

    gl.bindTexture(gl.TEXTURE_2D, image.texture);

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // VideoFrame direct GPU upload path (HDR video)
    if (image.videoFrame) {
      try {
        // Set unpackColorSpace for best color fidelity
        try {
          (gl as unknown as Record<string, string>).unpackColorSpace = 'display-p3';
        } catch {
          // Browser doesn't support unpackColorSpace
        }

        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA16F,    // 16-bit float internal format for HDR
          gl.RGBA,
          gl.HALF_FLOAT,
          image.videoFrame // VideoFrame is a valid TexImageSource
        );

        // Release VRAM - VideoFrame is consumed
        image.close();

        // Reset unpackColorSpace back to sRGB
        try {
          (gl as unknown as Record<string, string>).unpackColorSpace = 'srgb';
        } catch { /* ignore */ }

        image.textureNeedsUpdate = false;
        return;
      } catch {
        // VideoFrame texImage2D not supported - fall through to SDR path
        console.warn('VideoFrame texImage2D failed, falling back to typed array upload');
        image.close();

        // Reset unpackColorSpace back to sRGB
        try {
          (gl as unknown as Record<string, string>).unpackColorSpace = 'srgb';
        } catch { /* ignore */ }
      }
    }

    // Standard TypedArray upload path
    const { internalFormat, format, type } = this.getTextureFormat(image.dataType, image.channels);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      image.width,
      image.height,
      0,
      format,
      type,
      image.getTypedArray()
    );

    image.textureNeedsUpdate = false;
  }

  private getTextureFormat(dataType: DataType, channels: number): {
    internalFormat: number;
    format: number;
    type: number;
  } {
    const gl = this.gl!;

    let internalFormat: number;
    let format: number;
    let type: number;

    switch (dataType) {
      case 'float32':
        type = gl.FLOAT;
        switch (channels) {
          case 1:
            internalFormat = gl.R32F;
            format = gl.RED;
            break;
          case 2:
            internalFormat = gl.RG32F;
            format = gl.RG;
            break;
          case 3:
            internalFormat = gl.RGB32F;
            format = gl.RGB;
            break;
          default:
            internalFormat = gl.RGBA32F;
            format = gl.RGBA;
        }
        break;

      case 'uint16':
        type = gl.UNSIGNED_SHORT;
        switch (channels) {
          case 1:
            internalFormat = gl.R16UI;
            format = gl.RED_INTEGER;
            break;
          case 2:
            internalFormat = gl.RG16UI;
            format = gl.RG_INTEGER;
            break;
          case 3:
            internalFormat = gl.RGB16UI;
            format = gl.RGB_INTEGER;
            break;
          default:
            internalFormat = gl.RGBA16UI;
            format = gl.RGBA_INTEGER;
        }
        break;

      default: // uint8
        type = gl.UNSIGNED_BYTE;
        switch (channels) {
          case 1:
            internalFormat = gl.R8;
            format = gl.RED;
            break;
          case 2:
            internalFormat = gl.RG8;
            format = gl.RG;
            break;
          case 3:
            internalFormat = gl.RGB8;
            format = gl.RGB;
            break;
          default:
            internalFormat = gl.RGBA8;
            format = gl.RGBA;
        }
    }

    return { internalFormat, format, type };
  }

  createTexture(): TextureHandle {
    return this.gl?.createTexture() ?? null;
  }

  deleteTexture(texture: TextureHandle): void {
    if (texture) {
      this.gl?.deleteTexture(texture);
    }
  }

  getContext(): WebGL2RenderingContext | null {
    return this.gl;
  }

  setColorAdjustments(adjustments: ColorAdjustments): void {
    this.colorAdjustments = { ...adjustments };
  }

  getColorAdjustments(): ColorAdjustments {
    return { ...this.colorAdjustments };
  }

  resetColorAdjustments(): void {
    this.colorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
  }

  setColorInversion(enabled: boolean): void {
    this.colorInversionEnabled = enabled;
  }

  getColorInversion(): boolean {
    return this.colorInversionEnabled;
  }

  setToneMappingState(state: ToneMappingState): void {
    this.toneMappingState = { ...state };
  }

  getToneMappingState(): ToneMappingState {
    return { ...this.toneMappingState };
  }

  resetToneMappingState(): void {
    this.toneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };
  }

  setHDROutputMode(mode: 'sdr' | 'hlg' | 'pq', capabilities: DisplayCapabilities): boolean {
    if (!this.gl) return false;

    const previousMode = this.hdrOutputMode;
    try {
      const glExt = this.gl as unknown as Omit<WebGL2RenderingContext, 'drawingBufferColorSpace'> & { drawingBufferColorSpace: string };
      let targetColorSpace: string;
      switch (mode) {
        case 'hlg':
          targetColorSpace = 'rec2100-hlg';
          break;
        case 'pq':
          targetColorSpace = 'rec2100-pq';
          break;
        default:
          targetColorSpace = capabilities.webglP3 ? 'display-p3' : 'srgb';
      }

      glExt.drawingBufferColorSpace = targetColorSpace;

      // Verify the assignment stuck (browser silently ignores unsupported values)
      if (mode !== 'sdr' && glExt.drawingBufferColorSpace !== targetColorSpace) {
        console.warn(`[Renderer] drawingBufferColorSpace='${targetColorSpace}' not supported (got '${glExt.drawingBufferColorSpace}')`);
        this.hdrOutputMode = previousMode;
        return false;
      }

      this.hdrOutputMode = mode;

      // Attempt to configure HDR metadata when entering HDR mode
      if (mode !== 'sdr') {
        this.tryConfigureHDRMetadata();
      }

      return true;
    } catch {
      // Ensure hdrOutputMode is rolled back to its previous value
      this.hdrOutputMode = previousMode;
      return false;
    }
  }

  getHDROutputMode(): 'sdr' | 'hlg' | 'pq' {
    return this.hdrOutputMode;
  }

  // --- Phase 1: Background pattern ---

  setBackgroundPattern(state: BackgroundPatternState): void {
    const pattern = state.pattern;
    if (pattern === 'black') {
      this.bgPatternCode = 0;
      return;
    }

    const checkerSizes: Record<string, number> = { small: 8, medium: 16, large: 32 };

    if (pattern === 'checker') {
      this.bgPatternCode = 2;
      this.bgColor1 = hexToRgb(PATTERN_COLORS.checkerLight!);
      this.bgColor2 = hexToRgb(PATTERN_COLORS.checkerDark!);
      this.bgCheckerSize = checkerSizes[state.checkerSize] ?? 16;
    } else if (pattern === 'crosshatch') {
      this.bgPatternCode = 3;
      this.bgColor1 = hexToRgb(PATTERN_COLORS.crosshatchBg!);
      this.bgColor2 = hexToRgb(PATTERN_COLORS.crosshatchLine!);
    } else if (pattern === 'custom') {
      this.bgPatternCode = 1;
      this.bgColor1 = hexToRgb(state.customColor);
    } else {
      // Solid color patterns (grey18, grey50, white)
      this.bgPatternCode = 1;
      const color = PATTERN_COLORS[pattern];
      this.bgColor1 = color ? hexToRgb(color) : [0, 0, 0];
    }
  }

  // --- Phase 2: Pixel readback ---

  readPixelFloat(x: number, y: number, width: number, height: number): Float32Array | null {
    const gl = this.gl;
    if (!gl || !this.canvas) return null;
    const pixels = new Float32Array(width * height * 4);
    const glY = this.canvas.height - y - height; // WebGL Y is flipped
    gl.readPixels(x, glY, width, height, gl.RGBA, gl.FLOAT, pixels);
    return gl.getError() === gl.NO_ERROR ? pixels : null;
  }

  // --- Phase 3: Effect setters ---

  setCDL(cdl: CDLValues): void {
    const isDefault =
      cdl.slope.r === 1 && cdl.slope.g === 1 && cdl.slope.b === 1 &&
      cdl.offset.r === 0 && cdl.offset.g === 0 && cdl.offset.b === 0 &&
      cdl.power.r === 1 && cdl.power.g === 1 && cdl.power.b === 1 &&
      cdl.saturation === 1;
    this.cdlEnabled = !isDefault;
    this.cdlSlope = [cdl.slope.r, cdl.slope.g, cdl.slope.b];
    this.cdlOffset = [cdl.offset.r, cdl.offset.g, cdl.offset.b];
    this.cdlPower = [cdl.power.r, cdl.power.g, cdl.power.b];
    this.cdlSaturation = cdl.saturation;
  }

  setCurvesLUT(luts: CurveLUTs | null): void {
    if (!luts) {
      this.curvesEnabled = false;
      return;
    }
    // Pack into 256x1 RGBA: R=red channel, G=green channel, B=blue channel, A=master
    const data = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      data[i * 4] = luts.red[i]!;
      data[i * 4 + 1] = luts.green[i]!;
      data[i * 4 + 2] = luts.blue[i]!;
      data[i * 4 + 3] = luts.master[i]!;
    }
    // Check if identity (no effect)
    let isIdentity = true;
    for (let i = 0; i < 256; i++) {
      if (data[i * 4] !== i || data[i * 4 + 1] !== i || data[i * 4 + 2] !== i || data[i * 4 + 3] !== i) {
        isIdentity = false;
        break;
      }
    }
    this.curvesEnabled = !isIdentity;
    this.curvesLUTData = data;
    this.curvesLUTDirty = true;
  }

  setColorWheels(state: ColorWheelsState): void {
    const { lift, gamma, gain } = state;
    const hasAdjustments =
      lift.r !== 0 || lift.g !== 0 || lift.b !== 0 || lift.y !== 0 ||
      gamma.r !== 0 || gamma.g !== 0 || gamma.b !== 0 || gamma.y !== 0 ||
      gain.r !== 0 || gain.g !== 0 || gain.b !== 0 || gain.y !== 0;
    this.colorWheelsEnabled = hasAdjustments;
    this.wheelLift = [lift.r, lift.g, lift.b, lift.y];
    this.wheelGamma = [gamma.r, gamma.g, gamma.b, gamma.y];
    this.wheelGain = [gain.r, gain.g, gain.b, gain.y];
  }

  setFalseColor(enabled: boolean, lut: Uint8Array | null): void {
    this.falseColorEnabled = enabled;
    if (lut) {
      this.falseColorLUTData = lut;
      this.falseColorLUTDirty = true;
    }
  }

  setZebraStripes(state: ZebraState): void {
    this.zebraEnabled = state.enabled && (state.highEnabled || state.lowEnabled);
    this.zebraHighThreshold = state.highThreshold / 100; // Convert from IRE 0-100 to 0-1
    this.zebraLowThreshold = state.lowThreshold / 100;
    this.zebraHighEnabled = state.highEnabled;
    this.zebraLowEnabled = state.lowEnabled;
    // Animate based on real time
    this.zebraTime = (Date.now() / 50) % 1000;
  }

  setChannelMode(mode: ChannelMode): void {
    this.channelModeCode = CHANNEL_MODE_CODES[mode] ?? 0;
  }

  private tryConfigureHDRMetadata(): void {
    if (!this.canvas) return;
    if ('configureHighDynamicRange' in this.canvas) {
      try {
        (this.canvas as HTMLCanvasElement & { configureHighDynamicRange: (opts: { mode: string }) => void }).configureHighDynamicRange({ mode: 'default' });
      } catch {
        // Not supported — continue without metadata
      }
    }
  }

  dispose(): void {
    if (!this.gl) return;

    const gl = this.gl;

    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
    if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
    if (this.displayShader) this.displayShader.dispose();
    if (this.currentTexture) gl.deleteTexture(this.currentTexture);
    if (this.curvesLUTTexture) gl.deleteTexture(this.curvesLUTTexture);
    if (this.falseColorLUTTexture) gl.deleteTexture(this.falseColorLUTTexture);

    this.gl = null;
    this.canvas = null;
  }
}

/**
 * Alias for the Renderer class, for use in backend selection logic.
 * Semantically identical to Renderer; this name clarifies intent when
 * used alongside WebGPUBackend.
 */
export const WebGL2Backend = Renderer;
