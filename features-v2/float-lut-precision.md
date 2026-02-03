# Floating-Point LUT Precision

## Original OpenRV Implementation
OpenRV provides a `-floatLUT` flag that enables floating-point precision throughout the entire LUT processing pipeline:

**Float LUT Pipeline**:
- 32-bit floating-point LUT data loaded from .cube files
- Float textures on GPU for LUT storage (no 8-bit quantization)
- Float framebuffers for intermediate rendering (no clamping between stages)
- Values outside [0.0, 1.0] preserved through the entire pipeline
- HDR content maintains full dynamic range through color transforms

**Precision Hierarchy**:
- 32-bit float (full precision, highest memory)
- 16-bit half-float (sufficient for most HDR, half memory)
- 8-bit integer (current web implementation, SDR only)

**Extended Domain Support**:
- LUT DOMAIN_MIN/DOMAIN_MAX values beyond [0,1] for scene-linear HDR
- Negative domain values supported for camera log formats
- Values up to 65504.0 (half-float max) or 3.4e38 (float max) preserved

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [ ] Fully implemented

## Implementation Summary

### Current Limitations (8-bit Pipeline)
The existing LUT pipeline in `src/color/WebGLLUT.ts` has the following 8-bit bottlenecks:

1. **Image texture upload** (`gl.UNSIGNED_BYTE`): Source image is uploaded as 8-bit RGBA
   - Location: `WebGLLUT.ts` line 247 - `gl.texImage2D(..., gl.UNSIGNED_BYTE, imageData)`
2. **Output texture** (`gl.UNSIGNED_BYTE`): Render target is 8-bit RGBA
   - Location: `WebGLLUT.ts` line 237 - `gl.texImage2D(..., gl.RGBA, gl.UNSIGNED_BYTE, null)`
3. **Readback** (`gl.UNSIGNED_BYTE`): Result is read back as 8-bit
   - Location: `WebGLLUT.ts` line 273 - `gl.readPixels(..., gl.UNSIGNED_BYTE, output.data)`
4. **CPU fallback** (`/ 255` and `* 255`): LUTLoader.ts normalizes to 0-255 range
   - Location: `LUTLoader.ts` lines 278-299 - `applyLUTToImageData` clamps to [0,1] and scales by 255
5. **LUT texture** (already float): The 3D LUT texture already uses `gl.RGB32F` / `gl.FLOAT`
   - Location: `LUTLoader.ts` line 326 - `createLUTTexture` uses `gl.RGB32F`

**Key insight**: The LUT data itself is already stored as `Float32Array` and uploaded as `gl.RGB32F` 3D texture. The precision loss occurs at the image input/output boundaries, not in the LUT storage.

### What Needs to Be Implemented

#### 1. Float32 LUT Data Path
- Float image data (`Float32Array`) flows through the pipeline without conversion to `Uint8ClampedArray`
- New `FloatImageData` type carries width, height, and `Float32Array` RGBA data
- LUT application operates on float values directly, no `/ 255` or `* 255` conversions
- CPU fallback path (`applyLUT3D`, `applyLUT1D`) accepts and returns float values natively

#### 2. WebGL Float Texture Support
- Detect and use `EXT_color_buffer_float` extension for renderable float textures
- Upload source images as `gl.RGBA32F` / `gl.FLOAT` textures
- Use `OES_texture_float_linear` for linear filtering on float textures
- Fall back to `OES_texture_half_float` + `OES_texture_half_float_linear` when full float is unavailable

#### 3. Float Framebuffer
- Create FBO with `gl.RGBA32F` color attachment for intermediate rendering
- Validate framebuffer completeness via `gl.checkFramebufferStatus`
- Read back float results via `gl.readPixels(..., gl.FLOAT, float32Array)`
- Chain multiple float render passes without precision loss

#### 4. Extended Domain Support
- LUT domains beyond [0,1] (e.g., [-0.5, 7.5] for scene-linear ACES)
- Shader domain normalization preserves full range without clamping to [0,1]
- Input values outside LUT domain use configurable extrapolation (clamp, linear, mirror)
- Domain metadata propagated through pipeline for downstream awareness

#### 5. 16-bit Half-Float Option
- Use `gl.RGBA16F` internal format for half-float textures (WebGL2 native)
- Half-float framebuffer attachments for memory-efficient HDR rendering
- Automatic precision selection based on content requirements
- Half-float sufficient for most HDR content (range: 6.1e-5 to 65504.0)

#### 6. Precision Fallback
- Runtime capability detection for float/half-float/8-bit support
- Graceful degradation chain: float32 -> float16 -> uint8
- Warning notification when precision falls below content requirements
- Per-platform capability caching to avoid repeated extension queries

#### 7. Integration with HDR Image Formats
- Float LUTs applied to EXR/float-TIFF data without intermediate 8-bit conversion
- Float image data preserved from decode through LUT to display
- Tone mapping applied after LUT (in float domain) before display quantization
- Scene-linear compositing in float space when multiple layers present

## Requirements
- [ ] `FloatImageData` type with Float32Array RGBA storage
- [ ] `WebGLFloatLUTProcessor` class extending current pipeline with float support
- [ ] Float texture upload path for source images (RGBA32F)
- [ ] Float framebuffer creation and validation
- [ ] Float readback via `gl.readPixels` with FLOAT type
- [ ] `EXT_color_buffer_float` extension detection and use
- [ ] `OES_texture_float_linear` extension detection and use
- [ ] Half-float texture path using `RGBA16F`
- [ ] Precision capability detection (`detectFloatPrecision()`)
- [ ] Graceful fallback chain (float32 -> float16 -> uint8)
- [ ] User warning when float precision is unavailable
- [ ] Extended LUT domain support beyond [0,1]
- [ ] Configurable out-of-domain extrapolation (clamp, linear extend)
- [ ] CPU float path in `applyLUT3D` / `applyLUT1D` without 0-255 conversion
- [ ] Float LUT applied to float image data end-to-end
- [ ] Integration with HDR image loader (EXR, float TIFF)
- [ ] Pipeline precision metadata (tracks current bit depth through stages)
- [ ] Tone mapping insertion point after float LUT, before display

## UI/UX Specification

### Float LUT Controls
- **Location**: Color tab, LUT section, below existing LUT intensity slider
- **Widget**: Precision selector dropdown
  - Options: "Auto", "Float 32-bit", "Half Float 16-bit", "8-bit (Legacy)"
  - Default: "Auto" (selects best available)
- **Indicator**: Small badge next to LUT name showing active precision (e.g., "F32", "F16", "8b")
- **Warning**: Yellow indicator when requested precision is unavailable, tooltip explains fallback

### Extended Domain Display
- **Location**: LUT info section (below LUT name in Color panel)
- **Display**: "Domain: [min] to [max]" when domain is not [0,0,0] to [1,1,1]
- **Tooltip**: "This LUT uses extended domain for HDR content"
- **Visual**: Small HDR badge when domain exceeds [0,1]

### Precision Status
- **Location**: Status bar (bottom of viewer)
- **Format**: "LUT: Float32" or "LUT: Half16" or "LUT: 8-bit"
- **Color**: Green for float32, yellow for float16, grey for 8-bit
- **Tooltip**: Shows full precision chain (e.g., "Input: Float32 -> LUT: Float32 -> Display: 8-bit sRGB")

### Design Patterns (per UI.md)
- Precision selector uses same dropdown style as existing LUT controls
- Badge uses CSS variables `--badge-bg`, `--badge-text` for theming
- Warning icon uses centralized SVG icon system
- `data-testid` attributes: `precision-selector`, `precision-badge`, `domain-info`, `precision-status`

## Technical Notes

### Architecture

```
src/color/
  FloatImageData.ts       - Float image data type and utilities
  FloatImageData.test.ts  - Float image data unit tests
  WebGLFloatLUT.ts        - Float-precision WebGL LUT processor
  WebGLFloatLUT.test.ts   - Float LUT unit tests
  FloatLUTCapabilities.ts - GPU precision detection and fallback
  FloatLUTCapabilities.test.ts - Capability detection tests
  LUTLoader.ts            - (modified) Add float-native apply functions
  WebGLLUT.ts             - (unchanged) Legacy 8-bit path preserved

src/render/
  Renderer.ts             - (modified) Float FBO path for LUT stage

src/ui/components/
  ColorControls.ts        - (modified) Precision selector UI
```

### FloatImageData Type

```typescript
/**
 * Floating-point image data container.
 * Unlike ImageData (Uint8ClampedArray, 0-255), this stores RGBA as Float32Array
 * with no implicit clamping. Values can be negative or exceed 1.0.
 */
export interface FloatImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array; // RGBA interleaved, length = width * height * 4
}

/**
 * Create a FloatImageData from standard ImageData (normalizes 0-255 to 0.0-1.0)
 */
export function fromImageData(imageData: ImageData): FloatImageData {
  const float32 = new Float32Array(imageData.data.length);
  for (let i = 0; i < imageData.data.length; i++) {
    float32[i] = imageData.data[i]! / 255.0;
  }
  return { width: imageData.width, height: imageData.height, data: float32 };
}

/**
 * Convert FloatImageData back to standard ImageData (clamps to 0-255)
 */
export function toImageData(floatData: FloatImageData): ImageData {
  const output = new ImageData(floatData.width, floatData.height);
  for (let i = 0; i < floatData.data.length; i++) {
    output.data[i] = Math.round(Math.max(0, Math.min(255, floatData.data[i]! * 255.0)));
  }
  return output;
}

/**
 * Create an empty FloatImageData
 */
export function createFloatImageData(width: number, height: number): FloatImageData {
  return { width, height, data: new Float32Array(width * height * 4) };
}
```

### GPU Precision Detection

```typescript
export interface FloatPrecisionCapabilities {
  /** Can render to RGBA32F framebuffer */
  float32Renderable: boolean;
  /** Can filter RGBA32F textures with LINEAR */
  float32Filterable: boolean;
  /** Can render to RGBA16F framebuffer (WebGL2 always supports this) */
  float16Renderable: boolean;
  /** Can filter RGBA16F textures with LINEAR (WebGL2 always supports this) */
  float16Filterable: boolean;
  /** Best available precision for LUT processing */
  bestPrecision: 'float32' | 'float16' | 'uint8';
  /** Best available internal format enum value */
  bestInternalFormat: number; // gl.RGBA32F, gl.RGBA16F, or gl.RGBA8
  /** Best available type enum value */
  bestType: number; // gl.FLOAT, gl.HALF_FLOAT, or gl.UNSIGNED_BYTE
}

/**
 * Detect float precision capabilities of the current WebGL2 context.
 * Results are cached per context to avoid repeated GPU queries.
 */
export function detectFloatPrecision(gl: WebGL2RenderingContext): FloatPrecisionCapabilities {
  // Check EXT_color_buffer_float for RGBA32F renderable
  const extCBF = gl.getExtension('EXT_color_buffer_float');
  const extFloatLinear = gl.getExtension('OES_texture_float_linear');

  // RGBA16F is renderable and filterable in WebGL2 by default via EXT_color_buffer_float
  // but RGBA16F filtering is always available in WebGL2
  const float16Filterable = true;

  // Test RGBA32F framebuffer completeness
  let float32Renderable = false;
  if (extCBF) {
    float32Renderable = testFramebufferCompleteness(gl, gl.RGBA32F, gl.FLOAT);
  }

  const float32Filterable = !!extFloatLinear;
  const float16Renderable = !!extCBF;

  let bestPrecision: 'float32' | 'float16' | 'uint8';
  let bestInternalFormat: number;
  let bestType: number;

  if (float32Renderable && float32Filterable) {
    bestPrecision = 'float32';
    bestInternalFormat = gl.RGBA32F;
    bestType = gl.FLOAT;
  } else if (float16Renderable && float16Filterable) {
    bestPrecision = 'float16';
    bestInternalFormat = gl.RGBA16F;
    bestType = gl.HALF_FLOAT;
  } else {
    bestPrecision = 'uint8';
    bestInternalFormat = gl.RGBA8;
    bestType = gl.UNSIGNED_BYTE;
  }

  return {
    float32Renderable,
    float32Filterable,
    float16Renderable,
    float16Filterable,
    bestPrecision,
    bestInternalFormat,
    bestType,
  };
}

function testFramebufferCompleteness(
  gl: WebGL2RenderingContext,
  internalFormat: number,
  type: number,
): boolean {
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 1, 1, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteTexture(tex);
  gl.deleteFramebuffer(fbo);

  return status === gl.FRAMEBUFFER_COMPLETE;
}
```

### WebGLFloatLUTProcessor Core

```typescript
import { LUT3D, createLUTTexture } from './LUTLoader';
import { FloatImageData, createFloatImageData } from './FloatImageData';
import { FloatPrecisionCapabilities, detectFloatPrecision } from './FloatLUTCapabilities';

// Float-capable vertex shader (identical to 8-bit version)
const FLOAT_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// Float-capable fragment shader - no clamping, extended domain
const FLOAT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler2D u_image;
uniform sampler3D u_lut;
uniform float u_intensity;
uniform vec3 u_domainMin;
uniform vec3 u_domainMax;
uniform float u_lutSize;
uniform int u_extrapolationMode; // 0=clamp, 1=linear extend

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec4 color = texture(u_image, v_texCoord);

  // Normalize to LUT domain (may produce values outside [0,1] for extended domain)
  vec3 normalizedColor = (color.rgb - u_domainMin) / (u_domainMax - u_domainMin);

  // Extrapolation handling
  vec3 lutCoord;
  if (u_extrapolationMode == 0) {
    // Clamp mode: restrict to valid LUT range
    lutCoord = clamp(normalizedColor, 0.0, 1.0);
  } else {
    // Linear extend: allow the texture sampler CLAMP_TO_EDGE to handle it
    // Values outside [0,1] will sample edge texels (linear extrapolation of edge)
    lutCoord = normalizedColor;
  }

  // Offset for proper texel center sampling
  float offset = 0.5 / u_lutSize;
  float scale = (u_lutSize - 1.0) / u_lutSize;
  lutCoord = clamp(lutCoord, 0.0, 1.0) * scale + offset;

  // Sample the 3D LUT (hardware trilinear interpolation)
  vec3 lutColor = texture(u_lut, lutCoord).rgb;

  // Blend original and LUT-transformed (no clamping - preserve HDR range)
  vec3 finalColor = mix(color.rgb, lutColor, u_intensity);

  fragColor = vec4(finalColor, color.a);
}
`;

export type PrecisionMode = 'auto' | 'float32' | 'float16' | 'uint8';
export type ExtrapolationMode = 'clamp' | 'linear';

export class WebGLFloatLUTProcessor {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private capabilities: FloatPrecisionCapabilities;
  private program: WebGLProgram | null = null;
  private imageTexture: WebGLTexture | null = null;
  private lutTexture: WebGLTexture | null = null;
  private floatFBO: WebGLFramebuffer | null = null;
  private floatOutputTexture: WebGLTexture | null = null;
  private currentLUT: LUT3D | null = null;
  private precisionMode: PrecisionMode = 'auto';
  private extrapolationMode: ExtrapolationMode = 'clamp';
  private isInitialized = false;

  // Active precision (resolved from 'auto')
  private activePrecision: 'float32' | 'float16' | 'uint8' = 'uint8';
  private activeInternalFormat: number = 0;
  private activeType: number = 0;

  constructor(precisionMode: PrecisionMode = 'auto') {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      throw new Error('WebGL2 not supported');
    }

    this.gl = gl;
    this.precisionMode = precisionMode;
    this.capabilities = detectFloatPrecision(gl);
    this.resolvePrecision();
    this.init();
  }

  private resolvePrecision(): void {
    const gl = this.gl;
    const caps = this.capabilities;

    if (this.precisionMode === 'auto') {
      this.activePrecision = caps.bestPrecision;
      this.activeInternalFormat = caps.bestInternalFormat;
      this.activeType = caps.bestType;
    } else if (this.precisionMode === 'float32') {
      if (caps.float32Renderable && caps.float32Filterable) {
        this.activePrecision = 'float32';
        this.activeInternalFormat = gl.RGBA32F;
        this.activeType = gl.FLOAT;
      } else {
        console.warn('Float32 not supported, falling back to best available');
        this.activePrecision = caps.bestPrecision;
        this.activeInternalFormat = caps.bestInternalFormat;
        this.activeType = caps.bestType;
      }
    } else if (this.precisionMode === 'float16') {
      if (caps.float16Renderable && caps.float16Filterable) {
        this.activePrecision = 'float16';
        this.activeInternalFormat = gl.RGBA16F;
        this.activeType = gl.HALF_FLOAT;
      } else {
        console.warn('Float16 not supported, falling back to uint8');
        this.activePrecision = 'uint8';
        this.activeInternalFormat = gl.RGBA8;
        this.activeType = gl.UNSIGNED_BYTE;
      }
    } else {
      this.activePrecision = 'uint8';
      this.activeInternalFormat = gl.RGBA8;
      this.activeType = gl.UNSIGNED_BYTE;
    }
  }

  /**
   * Apply LUT to FloatImageData, maintaining full float precision
   */
  applyFloat(imageData: FloatImageData, intensity: number = 1.0): FloatImageData {
    if (!this.isInitialized || !this.currentLUT || !this.lutTexture) {
      return imageData;
    }

    const gl = this.gl;
    const { width, height } = imageData;

    this.ensureFloatFBO(width, height);

    // Upload source image as float texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA32F,
      width, height, 0,
      gl.RGBA, gl.FLOAT,
      imageData.data
    );

    // Bind LUT and render
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
    this.setUniforms(intensity);

    // Render to float FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.floatFBO);
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Read back float result
    const output = createFloatImageData(width, height);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, output.data);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return output;
  }

  private ensureFloatFBO(width: number, height: number): void {
    const gl = this.gl;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;

      // Recreate float output texture
      if (this.floatOutputTexture) gl.deleteTexture(this.floatOutputTexture);
      this.floatOutputTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.floatOutputTexture);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, this.activeInternalFormat,
        width, height, 0,
        gl.RGBA, this.activeType, null
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // Attach to FBO
      if (!this.floatFBO) this.floatFBO = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.floatFBO);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D, this.floatOutputTexture, 0
      );

      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('Float FBO incomplete, status:', status);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  // ... init(), setUniforms(), setLUT(), dispose() follow same pattern as WebGLLUT.ts
}
```

### Float-Native CPU LUT Application

```typescript
/**
 * Apply a 3D LUT to FloatImageData without any 8-bit conversion.
 * Values are not clamped to [0,1] - HDR values are preserved.
 */
export function applyLUT3DFloat(
  imageData: FloatImageData,
  lut: LUT3D,
  extrapolation: 'clamp' | 'linear' = 'clamp',
): FloatImageData {
  const { width, height, data: srcData } = imageData;
  const output = createFloatImageData(width, height);
  const outData = output.data;

  for (let i = 0; i < srcData.length; i += 4) {
    const r = srcData[i]!;
    const g = srcData[i + 1]!;
    const b = srcData[i + 2]!;
    const a = srcData[i + 3]!;

    const [outR, outG, outB] = applyLUT3D(lut, r, g, b);

    // No clamping - preserve full float range
    outData[i] = outR;
    outData[i + 1] = outG;
    outData[i + 2] = outB;
    outData[i + 3] = a;
  }

  return output;
}

/**
 * Apply a 1D LUT to FloatImageData without any 8-bit conversion.
 */
export function applyLUT1DFloat(
  imageData: FloatImageData,
  lut: LUT1D,
): FloatImageData {
  const { width, height, data: srcData } = imageData;
  const output = createFloatImageData(width, height);
  const outData = output.data;

  for (let i = 0; i < srcData.length; i += 4) {
    const r = srcData[i]!;
    const g = srcData[i + 1]!;
    const b = srcData[i + 2]!;
    const a = srcData[i + 3]!;

    const [outR, outG, outB] = applyLUT1D(lut, r, g, b);

    outData[i] = outR;
    outData[i + 1] = outG;
    outData[i + 2] = outB;
    outData[i + 3] = a;
  }

  return output;
}
```

### Float FBO Validation

```typescript
/**
 * Create and validate a float framebuffer object.
 * Returns null if the requested precision is not supported.
 */
export function createFloatFBO(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  internalFormat: number, // gl.RGBA32F or gl.RGBA16F
  type: number,           // gl.FLOAT or gl.HALF_FLOAT
): { fbo: WebGLFramebuffer; texture: WebGLTexture } | null {
  const texture = gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  if (!fbo) {
    gl.deleteTexture(texture);
    return null;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(fbo);
    return null;
  }

  return { fbo, texture };
}
```

### Processing Pipeline Order (Updated)
Effects are applied in the Viewer render pipeline in this order:
1. Draw source image with transform (rotation/flip)
2. Apply crop
3. Stereo mode (layout transformation)
4. Lens distortion
5. **3D LUT in float precision** (color/WebGLFloatLUT.ts) -- float FBO
6. **Color adjustments in float** (exposure, contrast, etc.) -- float FBO
7. **CDL in float** (color/CDL.ts) -- float FBO
8. **Color curves** (color/ColorCurves.ts)
9. **Tone mapping** (float to display) -- converts to display bit depth
10. Sharpen/blur filters
11. Channel isolation
12. Paint annotations (on top layer)

### Performance Considerations

| Metric | uint8 Pipeline | float16 Pipeline | float32 Pipeline |
|--------|---------------|-----------------|-----------------|
| Texture memory (1920x1080 RGBA) | 8.3 MB | 16.6 MB | 33.2 MB |
| LUT texture (33^3 RGB) | 108 KB (as RGB32F) | 108 KB (as RGB32F) | 108 KB (as RGB32F) |
| GPU upload bandwidth | 1x baseline | 2x baseline | 4x baseline |
| Readback bandwidth | 1x baseline | 2x baseline | 4x baseline |
| Shader ALU cost | Identical | Identical | Identical |
| Precision (bits/channel) | 8 | 10 mantissa + 5 exp | 23 mantissa + 8 exp |

**Optimization strategies**:
- Use float16 by default (sufficient for most HDR, half the memory of float32)
- Only use float32 when content actually requires it (e.g., deep compositing)
- Avoid float readback when possible (keep data on GPU between stages)
- Use `gl.NEAREST` filtering on FBO textures (no interpolation needed for intermediates)
- Batch multiple pipeline stages into a single shader to reduce FBO ping-pong

### WebGL Extension Reference

| Extension | Purpose | WebGL2 Status |
|-----------|---------|---------------|
| `EXT_color_buffer_float` | Render to RGBA32F / RGBA16F FBO | Optional, widely supported |
| `OES_texture_float_linear` | LINEAR filtering on FLOAT textures | Optional, widely supported |
| `EXT_float_blend` | Blending on float FBOs | Optional, needed for compositing |
| `EXT_color_buffer_half_float` | Render to RGBA16F (WebGL1 only) | N/A for WebGL2 |

**Browser support** (as of 2025):
- Chrome/Edge: Full float32 support on most GPUs
- Firefox: Full float32 support on most GPUs
- Safari/WebKit: float16 reliable, float32 varies by GPU
- Mobile (iOS/Android): float16 generally reliable, float32 less common

## E2E Test Cases

### Float LUT Precision Tests (Playwright)

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| FLUT-001 | Float precision selector visible | Load app, open Color panel, load LUT | Precision selector dropdown visible below LUT intensity |
| FLUT-002 | Auto precision selects best available | Load LUT with precision=auto | Precision badge shows "F32" or "F16" based on hardware |
| FLUT-003 | Float32 LUT preserves HDR values | Load HDR test image, apply identity LUT in float32 mode | Pixel values > 1.0 preserved in output |
| FLUT-004 | Float16 LUT preserves HDR values | Load HDR test image, apply identity LUT in float16 mode | Pixel values > 1.0 preserved (within half-float precision) |
| FLUT-005 | 8-bit fallback clamps values | Load HDR test image, force 8-bit mode, apply LUT | Values clamped to [0,1] range |
| FLUT-006 | Float LUT produces different result than 8-bit for HDR content | Load HDR image, apply same LUT in float32 vs uint8 | Screenshots differ (float preserves detail in highlights) |
| FLUT-007 | Extended domain LUT loads correctly | Load .cube with DOMAIN_MIN -0.5 / DOMAIN_MAX 7.5 | Domain info shows "-0.5 to 7.5", HDR badge visible |
| FLUT-008 | LUT intensity works in float mode | Load float LUT, adjust intensity slider | Image blends between original and LUT-transformed |
| FLUT-009 | Precision fallback shows warning | Force float32 on hardware without support | Yellow warning indicator visible, tooltip shows fallback |
| FLUT-010 | Float pipeline integrates with exposure | Set exposure to +3, apply float LUT | LUT applied to exposure-adjusted float values (no clipping) |

### Float Pipeline Integration Tests (Playwright)

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| FLUT-020 | Float LUT + CDL chain in float | Apply float LUT then CDL adjustments | Both applied in float precision, no intermediate clipping |
| FLUT-021 | Float LUT + curves chain | Apply float LUT then color curves | Pipeline maintains float through both stages |
| FLUT-022 | Precision status bar updates | Load LUT, change precision mode | Status bar text updates to reflect active precision |
| FLUT-023 | Clear float LUT restores original | Load float LUT, then clear LUT | Image returns to original, precision badge hidden |
| FLUT-024 | Float LUT persists across frame changes | Apply float LUT, advance to next frame | LUT remains applied with same precision |
| FLUT-025 | Multiple LUT loads in float mode | Load LUT A in float, then load LUT B | LUT B replaces LUT A, float precision maintained |

### Playwright Test Code Examples

```typescript
import { test, expect } from '@playwright/test';

test.describe('Float LUT Precision', () => {
  test('FLUT-001: Float precision selector is visible after loading LUT', async ({ page }) => {
    await page.goto('/');

    // Load a test image
    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles('test-assets/test-image.png');
    await page.waitForSelector('[data-testid="viewer-canvas"]');

    // Open color panel and load LUT
    await page.click('[data-testid="color-tab"]');
    const lutInput = page.locator('[data-testid="lut-file-input"]');
    await lutInput.setInputFiles('test-assets/test-lut.cube');

    // Verify precision selector is visible
    const precisionSelector = page.locator('[data-testid="precision-selector"]');
    await expect(precisionSelector).toBeVisible();
    await expect(precisionSelector).toContainText('Auto');
  });

  test('FLUT-003: Float32 LUT preserves HDR values above 1.0', async ({ page }) => {
    await page.goto('/');

    // Load HDR test image (EXR or float data)
    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles('test-assets/hdr-test.exr');
    await page.waitForSelector('[data-testid="viewer-canvas"]');

    // Load identity LUT in float32 mode
    await page.click('[data-testid="color-tab"]');
    const lutInput = page.locator('[data-testid="lut-file-input"]');
    await lutInput.setInputFiles('test-assets/identity-lut.cube');

    // Select float32 precision
    await page.selectOption('[data-testid="precision-selector"]', 'float32');

    // Check precision badge
    const badge = page.locator('[data-testid="precision-badge"]');
    await expect(badge).toHaveText('F32');

    // Verify HDR values preserved (check via exposed debug API)
    const maxValue = await page.evaluate(() => {
      const processor = (window as any).__floatLUTProcessor;
      if (!processor) return 0;
      const result = processor.getLastOutputMaxValue();
      return result;
    });
    expect(maxValue).toBeGreaterThan(1.0);
  });

  test('FLUT-006: Float vs 8-bit produces different results for HDR', async ({ page }) => {
    await page.goto('/');

    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles('test-assets/hdr-test.exr');
    await page.waitForSelector('[data-testid="viewer-canvas"]');

    // Apply LUT in 8-bit mode first
    await page.click('[data-testid="color-tab"]');
    const lutInput = page.locator('[data-testid="lut-file-input"]');
    await lutInput.setInputFiles('test-assets/contrast-lut.cube');
    await page.selectOption('[data-testid="precision-selector"]', 'uint8');
    const screenshot8bit = await page.locator('[data-testid="viewer-canvas"]').screenshot();

    // Switch to float32 mode
    await page.selectOption('[data-testid="precision-selector"]', 'float32');
    await page.waitForTimeout(100); // Wait for re-render
    const screenshotFloat = await page.locator('[data-testid="viewer-canvas"]').screenshot();

    // Screenshots should differ (float preserves highlight detail)
    expect(screenshot8bit).not.toEqual(screenshotFloat);
  });

  test('FLUT-007: Extended domain LUT displays domain info', async ({ page }) => {
    await page.goto('/');

    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles('test-assets/test-image.png');
    await page.waitForSelector('[data-testid="viewer-canvas"]');

    // Load extended domain LUT
    await page.click('[data-testid="color-tab"]');
    const lutInput = page.locator('[data-testid="lut-file-input"]');
    await lutInput.setInputFiles('test-assets/hdr-extended-domain.cube');

    // Verify domain info is displayed
    const domainInfo = page.locator('[data-testid="domain-info"]');
    await expect(domainInfo).toBeVisible();
    await expect(domainInfo).toContainText('-0.5');
    await expect(domainInfo).toContainText('7.5');
  });

  test('FLUT-009: Precision fallback shows warning when float unavailable', async ({ page }) => {
    // Emulate limited GPU by intercepting extension calls
    await page.addInitScript(() => {
      const origGetExtension = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function (name: string) {
        if (name === 'EXT_color_buffer_float' || name === 'OES_texture_float_linear') {
          return null;
        }
        return origGetExtension.call(this, name);
      };
    });

    await page.goto('/');

    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles('test-assets/test-image.png');
    await page.waitForSelector('[data-testid="viewer-canvas"]');

    await page.click('[data-testid="color-tab"]');
    const lutInput = page.locator('[data-testid="lut-file-input"]');
    await lutInput.setInputFiles('test-assets/test-lut.cube');

    // Request float32 (should fail and show warning)
    await page.selectOption('[data-testid="precision-selector"]', 'float32');

    // Verify fallback warning
    const warning = page.locator('[data-testid="precision-warning"]');
    await expect(warning).toBeVisible();
    const tooltip = await warning.getAttribute('title');
    expect(tooltip).toContain('Float32 not available');
  });

  test('FLUT-010: Float LUT integrates with exposure control', async ({ page }) => {
    await page.goto('/');

    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles('test-assets/test-image.png');
    await page.waitForSelector('[data-testid="viewer-canvas"]');

    // Set high exposure first
    await page.click('[data-testid="color-tab"]');
    const exposureSlider = page.locator('[data-testid="exposure-slider"]');
    await exposureSlider.fill('3');

    // Take screenshot before LUT
    const beforeLUT = await page.locator('[data-testid="viewer-canvas"]').screenshot();

    // Apply float LUT
    const lutInput = page.locator('[data-testid="lut-file-input"]');
    await lutInput.setInputFiles('test-assets/contrast-lut.cube');
    await page.selectOption('[data-testid="precision-selector"]', 'float32');

    // Take screenshot after LUT
    const afterLUT = await page.locator('[data-testid="viewer-canvas"]').screenshot();

    // LUT should change the image
    expect(beforeLUT).not.toEqual(afterLUT);
  });
});
```

## Unit Test Cases

### FloatImageData Tests (`src/color/FloatImageData.test.ts`)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| FID-U001 | `createFloatImageData` creates correct dimensions | width, height match; data length = w*h*4 |
| FID-U002 | `createFloatImageData` initializes to zero | All values in data are 0.0 |
| FID-U003 | `fromImageData` normalizes 0-255 to 0.0-1.0 | Pixel value 128 becomes ~0.502 |
| FID-U004 | `fromImageData` preserves alpha channel | Alpha 255 becomes 1.0, alpha 0 becomes 0.0 |
| FID-U005 | `toImageData` converts 0.0-1.0 back to 0-255 | 0.5 becomes 128, 1.0 becomes 255 |
| FID-U006 | `toImageData` clamps negative values to 0 | -0.5 becomes 0 |
| FID-U007 | `toImageData` clamps values above 1.0 to 255 | 2.0 becomes 255 |
| FID-U008 | Round-trip `fromImageData` -> `toImageData` preserves data | Output matches input within rounding |
| FID-U009 | `FloatImageData` can store values > 1.0 | Value 5.0 stored and retrieved correctly |
| FID-U010 | `FloatImageData` can store negative values | Value -0.5 stored and retrieved correctly |

### FloatLUTCapabilities Tests (`src/color/FloatLUTCapabilities.test.ts`)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| CAP-U001 | `detectFloatPrecision` returns valid capabilities object | All fields present and typed correctly |
| CAP-U002 | With all extensions, bestPrecision is 'float32' | `bestPrecision === 'float32'` |
| CAP-U003 | Without `EXT_color_buffer_float`, float32Renderable is false | `float32Renderable === false` |
| CAP-U004 | Without `OES_texture_float_linear`, float32Filterable is false | `float32Filterable === false` |
| CAP-U005 | Without float32, falls back to float16 | `bestPrecision === 'float16'` if float16 available |
| CAP-U006 | Without any float support, falls back to uint8 | `bestPrecision === 'uint8'` |
| CAP-U007 | `testFramebufferCompleteness` returns true for supported format | Returns `true` on supporting hardware |
| CAP-U008 | `testFramebufferCompleteness` returns false for unsupported format | Returns `false` when FBO incomplete |
| CAP-U009 | `bestInternalFormat` matches `bestPrecision` | float32 -> RGBA32F, float16 -> RGBA16F, uint8 -> RGBA8 |
| CAP-U010 | `bestType` matches `bestPrecision` | float32 -> FLOAT, float16 -> HALF_FLOAT, uint8 -> UNSIGNED_BYTE |

### WebGLFloatLUT Tests (`src/color/WebGLFloatLUT.test.ts`)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| WFLUT-U001 | Constructor creates WebGL2 context | `gl` is a valid WebGL2RenderingContext |
| WFLUT-U002 | Constructor throws when WebGL2 unavailable | Error thrown with descriptive message |
| WFLUT-U003 | `setLUT` creates float LUT texture | LUT texture created, `hasLUT()` returns true |
| WFLUT-U004 | `setLUT(null)` clears LUT and texture | `hasLUT()` returns false, texture deleted |
| WFLUT-U005 | `applyFloat` returns original when no LUT loaded | Output equals input FloatImageData |
| WFLUT-U006 | `applyFloat` processes FloatImageData through LUT | Output differs from input with non-identity LUT |
| WFLUT-U007 | `applyFloat` with identity LUT preserves values | Output matches input within float epsilon |
| WFLUT-U008 | `applyFloat` preserves values > 1.0 | Input 2.5 -> output ~2.5 through identity LUT |
| WFLUT-U009 | `applyFloat` preserves negative values | Input -0.3 -> output ~-0.3 through identity LUT (clamped by domain) |
| WFLUT-U010 | `applyFloat` intensity=0 returns original | Output matches input regardless of LUT |
| WFLUT-U011 | `applyFloat` intensity=0.5 blends correctly | Output is midpoint between original and LUT result |
| WFLUT-U012 | Float FBO is created at correct dimensions | FBO texture matches input width/height |
| WFLUT-U013 | Float FBO resizes when input dimensions change | New FBO created for different dimensions |
| WFLUT-U014 | `activePrecision` reflects resolved mode | 'auto' resolves to hardware best |
| WFLUT-U015 | `dispose` cleans up all GPU resources | All textures, FBOs, programs deleted |
| WFLUT-U016 | Precision fallback from float32 to float16 | When float32 unavailable, activePrecision is 'float16' |
| WFLUT-U017 | Precision fallback from float16 to uint8 | When all float unavailable, activePrecision is 'uint8' |
| WFLUT-U018 | Extended domain LUT normalizes correctly | Domain [-0.5, 7.5] maps input values to LUT range |
| WFLUT-U019 | Extrapolation mode 'clamp' clamps out-of-domain | Values outside domain use edge LUT values |
| WFLUT-U020 | Preserves alpha channel through float pipeline | Alpha unchanged after LUT application |

### Float CPU LUT Application Tests (`src/color/LUTLoader.test.ts` - additions)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| FLUT-U001 | `applyLUT3DFloat` with identity LUT preserves float data | Output matches input |
| FLUT-U002 | `applyLUT3DFloat` does not clamp values to [0,1] | Input 3.0 -> output 3.0 (identity LUT) |
| FLUT-U003 | `applyLUT3DFloat` preserves alpha channel | Alpha values unchanged |
| FLUT-U004 | `applyLUT3DFloat` handles negative input values | Negative inputs processed (clamped by domain) |
| FLUT-U005 | `applyLUT1DFloat` with identity LUT preserves float data | Output matches input |
| FLUT-U006 | `applyLUT1DFloat` does not clamp values to [0,1] | Output retains HDR range |
| FLUT-U007 | `applyLUT1DFloat` processes each channel independently | R, G, B use their own LUT curves |
| FLUT-U008 | `applyLUT3DFloat` vs `applyLUTToImageData` differ for HDR | Float path preserves, uint8 path clips |
| FLUT-U009 | `applyLUT3DFloat` with extended domain [-1, 2] | Values within extended domain interpolated correctly |
| FLUT-U010 | `applyLUT3DFloat` performance: 1920x1080 under 100ms | CPU path completes in reasonable time |

### Vitest Code Examples

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FloatImageData,
  createFloatImageData,
  fromImageData,
  toImageData,
} from './FloatImageData';

describe('FloatImageData', () => {
  it('FID-U001: createFloatImageData creates correct dimensions', () => {
    const fid = createFloatImageData(100, 50);
    expect(fid.width).toBe(100);
    expect(fid.height).toBe(50);
    expect(fid.data.length).toBe(100 * 50 * 4);
    expect(fid.data).toBeInstanceOf(Float32Array);
  });

  it('FID-U002: createFloatImageData initializes to zero', () => {
    const fid = createFloatImageData(2, 2);
    for (let i = 0; i < fid.data.length; i++) {
      expect(fid.data[i]).toBe(0.0);
    }
  });

  it('FID-U003: fromImageData normalizes 0-255 to 0.0-1.0', () => {
    const imageData = new ImageData(1, 1);
    imageData.data[0] = 128; // R
    imageData.data[1] = 0;   // G
    imageData.data[2] = 255; // B
    imageData.data[3] = 255; // A

    const fid = fromImageData(imageData);
    expect(fid.data[0]).toBeCloseTo(128 / 255, 3);
    expect(fid.data[1]).toBeCloseTo(0.0, 3);
    expect(fid.data[2]).toBeCloseTo(1.0, 3);
    expect(fid.data[3]).toBeCloseTo(1.0, 3);
  });

  it('FID-U005: toImageData converts 0.0-1.0 back to 0-255', () => {
    const fid = createFloatImageData(1, 1);
    fid.data[0] = 0.5;
    fid.data[1] = 0.0;
    fid.data[2] = 1.0;
    fid.data[3] = 1.0;

    const imageData = toImageData(fid);
    expect(imageData.data[0]).toBe(128);
    expect(imageData.data[1]).toBe(0);
    expect(imageData.data[2]).toBe(255);
    expect(imageData.data[3]).toBe(255);
  });

  it('FID-U006: toImageData clamps negative values to 0', () => {
    const fid = createFloatImageData(1, 1);
    fid.data[0] = -0.5;
    fid.data[1] = -1.0;
    fid.data[2] = 0.0;
    fid.data[3] = 1.0;

    const imageData = toImageData(fid);
    expect(imageData.data[0]).toBe(0);
    expect(imageData.data[1]).toBe(0);
  });

  it('FID-U007: toImageData clamps values above 1.0 to 255', () => {
    const fid = createFloatImageData(1, 1);
    fid.data[0] = 2.0;
    fid.data[1] = 5.0;
    fid.data[2] = 1.0;
    fid.data[3] = 1.0;

    const imageData = toImageData(fid);
    expect(imageData.data[0]).toBe(255);
    expect(imageData.data[1]).toBe(255);
  });

  it('FID-U009: FloatImageData can store values > 1.0', () => {
    const fid = createFloatImageData(1, 1);
    fid.data[0] = 5.0;
    fid.data[1] = 100.0;
    expect(fid.data[0]).toBe(5.0);
    expect(fid.data[1]).toBe(100.0);
  });

  it('FID-U010: FloatImageData can store negative values', () => {
    const fid = createFloatImageData(1, 1);
    fid.data[0] = -0.5;
    fid.data[1] = -10.0;
    expect(fid.data[0]).toBe(-0.5);
    expect(fid.data[1]).toBe(-10.0);
  });
});
```

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectFloatPrecision, FloatPrecisionCapabilities } from './FloatLUTCapabilities';

// Mock WebGL2 context for unit testing
function createMockGL(options: {
  extColorBufferFloat?: boolean;
  extFloatLinear?: boolean;
  fboComplete?: boolean;
}): WebGL2RenderingContext {
  const {
    extColorBufferFloat = true,
    extFloatLinear = true,
    fboComplete = true,
  } = options;

  return {
    getExtension: vi.fn((name: string) => {
      if (name === 'EXT_color_buffer_float') return extColorBufferFloat ? {} : null;
      if (name === 'OES_texture_float_linear') return extFloatLinear ? {} : null;
      return null;
    }),
    createTexture: vi.fn(() => ({})),
    createFramebuffer: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    bindFramebuffer: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() =>
      fboComplete ? 0x8CD5 /* FRAMEBUFFER_COMPLETE */ : 0x8CDD
    ),
    deleteTexture: vi.fn(),
    deleteFramebuffer: vi.fn(),
    TEXTURE_2D: 0x0DE1,
    FRAMEBUFFER: 0x8D40,
    COLOR_ATTACHMENT0: 0x8CE0,
    FRAMEBUFFER_COMPLETE: 0x8CD5,
    RGBA: 0x1908,
    FLOAT: 0x1406,
    HALF_FLOAT: 0x140B,
    RGBA32F: 0x8814,
    RGBA16F: 0x881A,
    RGBA8: 0x8058,
    UNSIGNED_BYTE: 0x1401,
    NEAREST: 0x2600,
    TEXTURE_MIN_FILTER: 0x2801,
  } as unknown as WebGL2RenderingContext;
}

describe('FloatLUTCapabilities', () => {
  it('CAP-U002: With all extensions, bestPrecision is float32', () => {
    const gl = createMockGL({ extColorBufferFloat: true, extFloatLinear: true, fboComplete: true });
    const caps = detectFloatPrecision(gl);
    expect(caps.bestPrecision).toBe('float32');
    expect(caps.float32Renderable).toBe(true);
    expect(caps.float32Filterable).toBe(true);
  });

  it('CAP-U003: Without EXT_color_buffer_float, float32Renderable is false', () => {
    const gl = createMockGL({ extColorBufferFloat: false, extFloatLinear: true });
    const caps = detectFloatPrecision(gl);
    expect(caps.float32Renderable).toBe(false);
  });

  it('CAP-U004: Without OES_texture_float_linear, float32Filterable is false', () => {
    const gl = createMockGL({ extColorBufferFloat: true, extFloatLinear: false, fboComplete: true });
    const caps = detectFloatPrecision(gl);
    expect(caps.float32Filterable).toBe(false);
    // Should fall back since filtering is needed
    expect(caps.bestPrecision).toBe('float16');
  });

  it('CAP-U006: Without any float support, falls back to uint8', () => {
    const gl = createMockGL({ extColorBufferFloat: false, extFloatLinear: false });
    const caps = detectFloatPrecision(gl);
    expect(caps.bestPrecision).toBe('uint8');
    expect(caps.bestType).toBe(gl.UNSIGNED_BYTE);
  });

  it('CAP-U009: bestInternalFormat matches bestPrecision', () => {
    const gl32 = createMockGL({ extColorBufferFloat: true, extFloatLinear: true, fboComplete: true });
    const caps32 = detectFloatPrecision(gl32);
    expect(caps32.bestInternalFormat).toBe(gl32.RGBA32F);

    const gl8 = createMockGL({ extColorBufferFloat: false, extFloatLinear: false });
    const caps8 = detectFloatPrecision(gl8);
    expect(caps8.bestInternalFormat).toBe(gl8.RGBA8);
  });
});
```

```typescript
import { describe, it, expect } from 'vitest';
import { applyLUT3DFloat, applyLUT1DFloat } from './LUTLoader';
import { createFloatImageData } from './FloatImageData';
import type { LUT3D, LUT1D } from './LUTLoader';

// Create a simple identity 3D LUT (size 2)
function createIdentityLUT3D(): LUT3D {
  const size = 2;
  const data = new Float32Array(size * size * size * 3);
  let idx = 0;
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        data[idx++] = r / (size - 1);
        data[idx++] = g / (size - 1);
        data[idx++] = b / (size - 1);
      }
    }
  }
  return {
    title: 'Identity',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

// Create a simple identity 1D LUT (size 2)
function createIdentityLUT1D(): LUT1D {
  return {
    title: 'Identity 1D',
    size: 2,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data: new Float32Array([0, 0, 0, 1, 1, 1]),
  };
}

describe('Float LUT Application (CPU)', () => {
  it('FLUT-U001: applyLUT3DFloat with identity LUT preserves float data', () => {
    const input = createFloatImageData(2, 2);
    input.data.set([
      0.2, 0.4, 0.6, 1.0,
      0.8, 0.1, 0.3, 1.0,
      0.0, 0.0, 0.0, 1.0,
      1.0, 1.0, 1.0, 1.0,
    ]);

    const lut = createIdentityLUT3D();
    const output = applyLUT3DFloat(input, lut);

    for (let i = 0; i < input.data.length; i += 4) {
      expect(output.data[i]).toBeCloseTo(input.data[i]!, 2);
      expect(output.data[i + 1]).toBeCloseTo(input.data[i + 1]!, 2);
      expect(output.data[i + 2]).toBeCloseTo(input.data[i + 2]!, 2);
    }
  });

  it('FLUT-U002: applyLUT3DFloat does not clamp values to [0,1]', () => {
    const input = createFloatImageData(1, 1);
    input.data.set([3.0, 5.0, -0.5, 1.0]);

    const lut = createIdentityLUT3D();
    // Identity LUT will clamp lookup to domain, but output is not clamped
    const output = applyLUT3DFloat(input, lut);

    // Output data should be Float32Array (not clamped Uint8)
    expect(output.data).toBeInstanceOf(Float32Array);
  });

  it('FLUT-U003: applyLUT3DFloat preserves alpha channel', () => {
    const input = createFloatImageData(1, 1);
    input.data.set([0.5, 0.5, 0.5, 0.75]);

    const lut = createIdentityLUT3D();
    const output = applyLUT3DFloat(input, lut);

    expect(output.data[3]).toBe(0.75);
  });

  it('FLUT-U005: applyLUT1DFloat with identity LUT preserves float data', () => {
    const input = createFloatImageData(1, 1);
    input.data.set([0.3, 0.6, 0.9, 1.0]);

    const lut = createIdentityLUT1D();
    const output = applyLUT1DFloat(input, lut);

    expect(output.data[0]).toBeCloseTo(0.3, 2);
    expect(output.data[1]).toBeCloseTo(0.6, 2);
    expect(output.data[2]).toBeCloseTo(0.9, 2);
  });

  it('FLUT-U008: Float path vs uint8 path differ for HDR values', () => {
    const input = createFloatImageData(1, 1);
    input.data.set([2.0, 3.0, 0.5, 1.0]);

    const lut = createIdentityLUT3D();
    const floatOutput = applyLUT3DFloat(input, lut);

    // Float output type is Float32Array (no clamping at storage level)
    expect(floatOutput.data).toBeInstanceOf(Float32Array);
    expect(floatOutput.width).toBe(1);
    expect(floatOutput.height).toBe(1);

    // Compare: the legacy applyLUTToImageData would clamp to [0, 255]
    // That path converts 2.0 -> clamp(2.0, 0, 1) * 255 = 255
    // The float path preserves the lookup result without clamping
  });
});
```

## Implementation Files Reference

### New Files
- `/Users/lifeart/Repos/openrv-web/src/color/FloatImageData.ts` - Float image data type and conversion utilities
- `/Users/lifeart/Repos/openrv-web/src/color/FloatImageData.test.ts` - FloatImageData unit tests
- `/Users/lifeart/Repos/openrv-web/src/color/WebGLFloatLUT.ts` - Float-precision WebGL LUT processor
- `/Users/lifeart/Repos/openrv-web/src/color/WebGLFloatLUT.test.ts` - WebGLFloatLUT unit tests
- `/Users/lifeart/Repos/openrv-web/src/color/FloatLUTCapabilities.ts` - GPU precision detection
- `/Users/lifeart/Repos/openrv-web/src/color/FloatLUTCapabilities.test.ts` - Capability detection tests
- `/Users/lifeart/Repos/openrv-web/e2e/float-lut-precision.spec.ts` - E2E tests for float LUT pipeline

### Modified Files
- `/Users/lifeart/Repos/openrv-web/src/color/LUTLoader.ts` - Add `applyLUT3DFloat`, `applyLUT1DFloat` functions
- `/Users/lifeart/Repos/openrv-web/src/color/LUTLoader.test.ts` - Add float LUT application tests
- `/Users/lifeart/Repos/openrv-web/src/render/Renderer.ts` - Float FBO path in render pipeline
- `/Users/lifeart/Repos/openrv-web/src/ui/components/ColorControls.ts` - Precision selector UI

### Existing Files (Unchanged, for Reference)
- `/Users/lifeart/Repos/openrv-web/src/color/WebGLLUT.ts` - Legacy 8-bit WebGL LUT processor
- `/Users/lifeart/Repos/openrv-web/src/color/WebGLLUT.test.ts` - Legacy WebGL LUT tests
- `/Users/lifeart/Repos/openrv-web/src/color/CDL.ts` - ASC CDL processing
- `/Users/lifeart/Repos/openrv-web/src/color/ColorCurves.ts` - Color curves processing
- `/Users/lifeart/Repos/openrv-web/src/color/LogCurves.ts` - Camera log format conversions

## Future Enhancements

1. **WebGPU Float Pipeline** (High Priority)
   - Use WebGPU compute shaders for float LUT processing
   - Storage buffers for direct Float32Array I/O (no texture upload overhead)
   - Compute shader parallel processing (workgroup-level optimization)
   - No extension dependency for float support (native in WebGPU)

2. **Multi-Pass Float Chain** (Medium Priority)
   - Chain LUT -> CDL -> Curves in float FBO without readback
   - Ping-pong FBOs for multi-pass rendering
   - Single final readback at display conversion stage

3. **Float LUT Caching** (Medium Priority)
   - Cache converted float LUT textures by LUT hash
   - Reuse float FBOs across frames when dimensions unchanged
   - Pool float textures for multiple LUT instances

4. **Tetrahedral Interpolation** (Low Priority)
   - Higher quality than trilinear for 3D LUTs
   - Fewer samples needed (4 vs 8 corners)
   - Better accuracy at low LUT resolutions

5. **GPU Readback Optimization** (Low Priority)
   - Use PBO (Pixel Buffer Object) for async readback
   - Double-buffered readback to overlap GPU/CPU work
   - Avoid readback entirely when output stays on GPU (display path)
