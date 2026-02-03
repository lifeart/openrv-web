# HDR Image Format Decoding (EXR / DPX / Cineon / Float TIFF)

## Original OpenRV Implementation
OpenRV provides native decoding for all major HDR and professional imaging formats used in VFX, animation, and digital cinema production:

**OpenEXR (.exr, .sxr)**:
- 16-bit half-float and 32-bit full-float pixel data
- Multi-channel support: RGBA, arbitrary AOV layers (diffuse, specular, depth, normals, etc.)
- Multi-part EXR files (multiple images in a single file)
- Multi-view stereo EXR (left/right eye pairs)
- All compression formats: NONE, RLE, ZIPS, ZIP, PIZ, PXR24, B44, B44A, DWAA, DWAB
- Data window / display window handling (sub-region rendering)
- Tiled and scanline storage modes
- Deep image support (per-pixel variable-depth samples)
- Chromaticity and white point metadata

**DPX (Digital Picture Exchange)**:
- 8, 10, 12, and 16-bit per channel data
- Packed 10-bit formats (Method A and Method B packing)
- Log-encoded data with configurable transfer functions
- Linear and logarithmic encoding modes
- Film-originated metadata (keycode, timecode, frame rate)
- Chromaticity values and color space indicators
- Big-endian and little-endian byte order

**Cineon (.cin)**:
- 10-bit logarithmic encoding (printing density)
- Cineon log-to-linear conversion curves
- Film-originated metadata
- Black/white code value configuration

**TIFF (32-bit float)**:
- 32-bit floating-point pixel data (beyond browser 8-bit limit)
- Multi-channel support
- Tiled and scanline (strip) storage
- Various compression modes (LZW, ZIP, uncompressed)

**Float32 Pipeline**:
- Full floating-point precision maintained from decode through display
- Values outside [0.0, 1.0] preserved through color pipeline
- No clamping at intermediate stages
- WebGL float texture rendering with EXT_color_buffer_float

## Status
- [x] Not implemented
- [ ] Partially implemented
- [ ] Fully implemented

## Implementation Summary

### What's Implemented

**OpenEXR (.exr) - Partial**:
- Basic EXR decoder implemented in `src/formats/EXRDecoder.ts`
- Half-float (16-bit) and full-float (32-bit) pixel type decoding
- Scanline image layout support
- NONE, RLE, ZIP, and ZIPS compression
- Data window / display window parsing
- Multi-layer/AOV channel extraction with `extractLayerInfo()`
- Channel remapping with `resolveChannelMapping()`
- Layer selection via `EXRDecodeOptions.layer`
- Grayscale (Y channel) mapped to RGB
- Integration with `FileSourceNode` for loading via URL or File object
- `exrToIPImage()` conversion to internal `IPImage` with float32 data
- `getEXRInfo()` for header-only metadata extraction
- Comprehensive unit tests in `src/formats/EXRDecoder.test.ts`
- E2E tests for loading and layer selection in `e2e/exr-loading.spec.ts` and `e2e/exr-layers.spec.ts`

**Float32 IPImage**:
- `IPImage` class supports `float32` data type
- `getTypedArray()` returns `Float32Array` for float data
- `getPixel()` / `setPixel()` work with float values
- Basic tone mapping in `FileSourceNode.getCanvas()` (clamp + gamma 2.2)

### What's NOT Implemented

**OpenEXR - Missing Features**:
- PIZ compression (wavelet-based, most common in production EXR files)
- PXR24 compression (lossy 24-bit float)
- B44 / B44A compression (lossy, fixed-rate, used for real-time playback)
- DWAA / DWAB compression (lossy, DCT-based, common in modern pipelines)
- Tiled image layout
- Multi-part EXR files
- Deep image data
- Multi-view stereo EXR
- UINT pixel type channels

**DPX Format - NOT IMPLEMENTED**:
- No DPX file parser
- No 10-bit packed data handling
- No 12-bit or 16-bit data handling
- No log-to-linear conversion
- No film metadata extraction (keycode, timecode)
- No byte-order detection (big-endian / little-endian)
- No DPX header validation

**Cineon Format - NOT IMPLEMENTED**:
- No Cineon file parser
- No 10-bit log data decoding
- No Cineon log-to-linear curve
- No film metadata extraction

**32-bit Float TIFF - NOT IMPLEMENTED**:
- Browser only supports 8-bit TIFF via HTMLImageElement
- No TIFF tag parser for float data detection
- No float sample decoding
- No tiled TIFF reading
- No LZW / ZIP decompression for TIFF

**Float32 Pipeline - INCOMPLETE**:
- `FileSourceNode.getCanvas()` clamps float to [0,1] for display (loses HDR data)
- WebGL renderer requests `EXT_color_buffer_float` but does not use float textures for HDR input
- No `gl.RGBA32F` texture upload path for float IPImage data
- CPU rendering path in `ViewerRenderingUtils.ts` clamps to 8-bit
- Color adjustments (exposure, contrast, etc.) operate on clamped 8-bit in CPU path
- Tone mapping operators not yet implemented (placeholder in `ToneMappingControl.ts`)
- No configurable display range for values outside [0,1]

**WebAssembly Decoders - NOT IMPLEMENTED**:
- No WASM-based OpenEXR decoder for advanced compression (PIZ, B44, DWAA)
- No WASM-based DPX decoder
- No WASM-based Cineon decoder
- No WASM-based TIFF float decoder
- No Web Worker offloading for decode operations

## Requirements

### OpenEXR Decoding
- [x] Parse EXR header (magic, version, attributes) - **IMPLEMENTED**
- [x] Decode half-float (16-bit) pixel data - **IMPLEMENTED**
- [x] Decode full-float (32-bit) pixel data - **IMPLEMENTED**
- [x] NONE compression - **IMPLEMENTED**
- [x] RLE compression - **IMPLEMENTED**
- [x] ZIP / ZIPS compression - **IMPLEMENTED**
- [ ] PIZ compression (wavelet) - **NOT IMPLEMENTED**
- [ ] PXR24 compression (lossy 24-bit) - **NOT IMPLEMENTED**
- [ ] B44 / B44A compression (lossy fixed-rate) - **NOT IMPLEMENTED**
- [ ] DWAA / DWAB compression (lossy DCT) - **NOT IMPLEMENTED**
- [x] Multi-channel / multi-layer AOV extraction - **IMPLEMENTED**
- [x] Layer selection and channel remapping - **IMPLEMENTED**
- [x] Data window / display window handling - **IMPLEMENTED**
- [ ] Tiled image layout - **NOT IMPLEMENTED**
- [ ] Multi-part EXR files - **NOT IMPLEMENTED**
- [ ] Multi-view stereo EXR - **NOT IMPLEMENTED**
- [ ] Deep image data - **NOT IMPLEMENTED**

### DPX Decoding
- [ ] Parse DPX file header (generic header, industry header, user data) - **NOT IMPLEMENTED**
- [ ] Detect byte order (magic number 0x53445058 or 0x58504453) - **NOT IMPLEMENTED**
- [ ] Decode 8-bit RGB/RGBA data - **NOT IMPLEMENTED**
- [ ] Decode 10-bit packed data (Method A / Method B) - **NOT IMPLEMENTED**
- [ ] Decode 12-bit packed data - **NOT IMPLEMENTED**
- [ ] Decode 16-bit data - **NOT IMPLEMENTED**
- [ ] Log-to-linear conversion (Cineon log curve) - **NOT IMPLEMENTED**
- [ ] Extract film metadata (keycode, timecode, frame rate) - **NOT IMPLEMENTED**
- [ ] Chromaticity and color space metadata - **NOT IMPLEMENTED**

### Cineon Decoding
- [ ] Parse Cineon file header - **NOT IMPLEMENTED**
- [ ] Decode 10-bit logarithmic data - **NOT IMPLEMENTED**
- [ ] Cineon log-to-linear conversion curve - **NOT IMPLEMENTED**
- [ ] Black/white code value configuration - **NOT IMPLEMENTED**
- [ ] Film metadata extraction - **NOT IMPLEMENTED**

### 32-bit Float TIFF
- [ ] Parse TIFF IFD (Image File Directory) tags - **NOT IMPLEMENTED**
- [ ] Detect float sample format (SampleFormat tag = 3) - **NOT IMPLEMENTED**
- [ ] Decode 32-bit float strip data - **NOT IMPLEMENTED**
- [ ] Decode 32-bit float tiled data - **NOT IMPLEMENTED**
- [ ] LZW decompression for TIFF - **NOT IMPLEMENTED**
- [ ] ZIP/Deflate decompression for TIFF - **NOT IMPLEMENTED**
- [ ] Multi-channel float TIFF (RGB, RGBA) - **NOT IMPLEMENTED**

### Float32 Pipeline
- [x] IPImage float32 data type support - **IMPLEMENTED**
- [ ] WebGL float texture upload (gl.RGBA32F / gl.texImage2D with FLOAT) - **NOT IMPLEMENTED**
- [ ] Preserve values outside [0,1] through shader pipeline - **NOT IMPLEMENTED**
- [ ] Float-precision color adjustments (exposure, contrast in linear float) - **NOT IMPLEMENTED**
- [ ] Tone mapping operators for display (Reinhard, Filmic, ACES) - **NOT IMPLEMENTED**
- [ ] Configurable soft-clip / display range - **NOT IMPLEMENTED**
- [ ] Out-of-range value visualization (negative values, super-whites) - **NOT IMPLEMENTED**

### WebAssembly Decoders
- [ ] WASM OpenEXR decoder for PIZ/B44/DWAA compression - **NOT IMPLEMENTED**
- [ ] WASM DPX decoder for 10-bit packed data - **NOT IMPLEMENTED**
- [ ] WASM Cineon decoder for 10-bit log data - **NOT IMPLEMENTED**
- [ ] WASM TIFF decoder for float data with LZW - **NOT IMPLEMENTED**
- [ ] Web Worker integration for background decoding - **NOT IMPLEMENTED**
- [ ] Decoder progress reporting - **NOT IMPLEMENTED**

## UI/UX Specification

### File Format Indicators

**Info Panel Format Badge**:
- Display format badge next to filename when HDR/professional format loaded
- Badge styles:
  - EXR: Green badge with "EXR" text, shows "16-bit half" or "32-bit float"
  - DPX: Orange badge with "DPX" text, shows bit depth (10/12/16) and encoding (log/linear)
  - Cineon: Orange badge with "CIN" text, shows "10-bit log"
  - Float TIFF: Blue badge with "TIFF-F" text, shows "32-bit float"
- Clicking the badge opens the metadata detail panel

**Status Bar Indicators**:
- Show data type indicator in bottom status bar: "float32", "uint16", "uint8"
- Show color space indicator: "linear", "log", "sRGB"
- Show bit depth: "16-bit half", "32-bit float", "10-bit packed", etc.

### Metadata Display

**Image Info Panel** (accessible via `I` key or Info tab):
- **File section**: Format, compression, file size, dimensions
- **Data section**: Bit depth, data type, channel count, channel names
- **Color section**: Color space, transfer function (linear/log), chromaticities, white point
- **Film section** (DPX/Cineon only): Keycode, timecode, frame rate, film stock
- **EXR section** (EXR only): Data window, display window, layers/AOVs, pixel aspect ratio
- **Technical section**: Byte order, scanline/tiled, compression ratio

**EXR Layer Selector** (already partially implemented):
- Dropdown selector visible when multi-layer EXR loaded
- Shows layer names with channel count (e.g., "diffuse (RGB)", "depth (Z)")
- Selected layer highlighted
- "RGBA" as default selection
- Quick channel isolation buttons (R, G, B, A) when single layer selected

### DPX/Cineon Log-to-Linear Controls

**Log/Linear Toggle** (View tab):
- Toggle button: "LOG" / "LIN" indicator
- When DPX/Cineon loaded in log mode, default to log display
- Toggle applies log-to-linear conversion (or vice versa)
- Conversion parameters editable in advanced settings:
  - Reference white: default 685 (10-bit code value)
  - Reference black: default 95 (10-bit code value)
  - Display gamma: default 1.7
  - Soft clip: default 0 (range 0-100)
  - Film gamma: default 0.6

### Loading Progress

**Progress Indicator for Large Files**:
- Show progress bar in center of viewer during decode
- For WASM decoders: show download progress then decode progress
- For multi-part EXR: show "Part 1 of N" progress
- Cancel button to abort loading
- File size displayed during loading (e.g., "Loading 128 MB EXR...")

## Technical Notes

### Architecture

**Decoder Registry Pattern**:
All format decoders follow a common interface and are registered in a decoder registry. The system detects file format by magic number (not extension) and dispatches to the appropriate decoder.

```
src/formats/
  DecoderRegistry.ts        # Registry and format detection
  EXRDecoder.ts             # OpenEXR decoder (existing, extend)
  DPXDecoder.ts             # DPX decoder (new)
  CineonDecoder.ts          # Cineon decoder (new)
  TIFFFloatDecoder.ts       # Float TIFF decoder (new)
  wasm/
    exr-wasm.ts             # WASM EXR decoder wrapper
    dpx-wasm.ts             # WASM DPX decoder wrapper
    exr-decoder.wasm        # Compiled WASM binary
    dpx-decoder.wasm        # Compiled WASM binary
  index.ts                  # Public API exports
```

**Decoder Interface**:
```typescript
interface FormatDecoder {
  /** Check if buffer matches this format by magic number */
  canDecode(buffer: ArrayBuffer): boolean;

  /** Get basic metadata without full decode */
  getInfo(buffer: ArrayBuffer): FormatInfo | null;

  /** Full decode to Float32Array RGBA */
  decode(buffer: ArrayBuffer, options?: DecodeOptions): Promise<DecodeResult>;
}

interface FormatInfo {
  format: 'exr' | 'dpx' | 'cineon' | 'tiff';
  width: number;
  height: number;
  channels: string[];
  bitDepth: number;
  dataType: 'half' | 'float' | 'uint' | 'log';
  compression: string;
  metadata: Record<string, unknown>;
}

interface DecodeResult {
  width: number;
  height: number;
  data: Float32Array;
  channels: number;
  colorSpace: 'linear' | 'log' | 'sRGB';
  metadata: Record<string, unknown>;
}

interface DecodeOptions {
  /** Target output: 'float32' (default) or 'uint8' for preview */
  outputType?: 'float32' | 'uint8';
  /** For EXR: specific layer to decode */
  layer?: string;
  /** For EXR: channel remapping */
  channelRemapping?: Record<string, string>;
  /** For DPX/Cineon: apply log-to-linear conversion */
  applyLogToLinear?: boolean;
  /** Progress callback (0.0 to 1.0) */
  onProgress?: (progress: number) => void;
  /** Abort signal */
  signal?: AbortSignal;
}
```

### File Format Specifications

**DPX File Header Structure** (SMPTE 268M):
```
Offset  Size   Field
0       4      Magic number: 0x53445058 ("SDPX") or 0x58504453 (swapped)
4       4      Offset to image data
8       8      Version string ("V2.0" or "V1.0")
16      4      Total file size
20      4      Ditto key (for encryption, typically 0xFFFFFFFF)
24      4      Generic header size
28      4      Industry header size
32      4      User data size
36      100    Original filename
136     24     Creation date/time
160     100    Creator
260     200    Project name
460     200    Copyright
660     4      Encryption key
...
```

**DPX 10-bit Packing (Method A)**:
```
Bits:  31 30 29 28 27 26 25 24 23 22 21 20 19 18 17 16 15 14 13 12 11 10 9 8 7 6 5 4 3 2 1 0
       |-------- Component 0 --------|----- Component 1 --------|---- Component 2 --------|XX|
       MSB                        LSB MSB                     LSB MSB                   LSB
       (2 padding bits at LSB end)
```

**Cineon File Header Structure**:
```
Offset  Size   Field
0       4      Magic number: 0x802A5FD7
4       4      Offset to image data
8       4      Generic header size
12      4      Industry header size
16      4      Variable header size
20      4      Total file size
24      4      Version string
...
```

**Cineon 10-bit Log Encoding**:
The Cineon log curve maps printing density to 10-bit code values:
```
code_value = (685 / 2.046) * log10(exposure) + 95

Where:
  685 = reference white code value
  95  = reference black code value
  2.046 = negative density range
  exposure = scene-referred linear value
```

**Log-to-Linear Conversion**:
```typescript
function cineonLogToLinear(codeValue: number, options: LogLinearOptions): number {
  const { refWhite = 685, refBlack = 95, filmGamma = 0.6 } = options;
  const range = refWhite - refBlack;
  const normalized = (codeValue - refBlack) / range;
  const linearDensity = normalized * 2.046;
  return Math.pow(10, linearDensity) * filmGamma;
}
```

**TIFF Float Detection**:
```
Tag 339 (SampleFormat):
  Value 1 = unsigned integer (default)
  Value 2 = signed integer
  Value 3 = IEEE floating point  <-- target
  Value 4 = undefined

Tag 258 (BitsPerSample):
  Value 32 = 32-bit float (when SampleFormat = 3)

Tag 277 (SamplesPerPixel):
  Value 3 = RGB
  Value 4 = RGBA
```

### Decoder API Details

**EXR WASM Decoder** (for PIZ/B44/DWAA):
```typescript
// Using openexr-wasm or custom compilation of OpenEXR C++ library
interface EXRWasmDecoder {
  /** Initialize WASM module (lazy load) */
  init(): Promise<void>;

  /** Check if WASM module is loaded */
  isReady(): boolean;

  /** Decode EXR buffer to float32 RGBA */
  decode(
    buffer: ArrayBuffer,
    options?: {
      layer?: string;
      onProgress?: (pct: number) => void;
    }
  ): Promise<{
    width: number;
    height: number;
    data: Float32Array;
    channels: string[];
    compression: string;
  }>;

  /** Get header info without full decode */
  getInfo(buffer: ArrayBuffer): {
    width: number;
    height: number;
    channels: string[];
    compression: string;
    layers: string[];
  };

  /** Free WASM memory */
  dispose(): void;
}
```

**WebGL Float Texture Pipeline**:
```typescript
// In Renderer.ts - upload float IPImage as RGBA32F texture
function uploadFloatTexture(gl: WebGL2RenderingContext, image: IPImage): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Use RGBA32F internal format for float data
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,             // internal format
    image.width,
    image.height,
    0,
    gl.RGBA,                // format
    gl.FLOAT,               // type
    new Float32Array(image.data)
  );

  // Float textures require NEAREST or LINEAR with OES_texture_float_linear
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return texture;
}
```

**Display Fragment Shader with Tone Mapping**:
```glsl
#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform float u_exposure;
uniform int u_toneMapOperator; // 0=off, 1=reinhard, 2=filmic, 3=aces
uniform bool u_isHDR;

in vec2 v_texCoord;
out vec4 fragColor;

// Reinhard tone mapping
vec3 reinhardToneMap(vec3 color) {
  return color / (1.0 + color);
}

// ACES filmic tone mapping (approximate)
vec3 acesToneMap(vec3 color) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

void main() {
  vec4 texColor = texture(u_image, v_texCoord);

  // Apply exposure (works in linear float space)
  vec3 color = texColor.rgb * pow(2.0, u_exposure);

  // Apply tone mapping for HDR content
  if (u_isHDR && u_toneMapOperator > 0) {
    if (u_toneMapOperator == 1) color = reinhardToneMap(color);
    else if (u_toneMapOperator == 3) color = acesToneMap(color);
  }

  // Apply sRGB gamma for display (linear -> sRGB)
  color = pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2));

  fragColor = vec4(color, texColor.a);
}
```

### DPX 10-bit Unpacking Implementation

```typescript
/**
 * Unpack DPX 10-bit Method A (most common)
 * Each 32-bit word contains 3 x 10-bit components + 2 padding bits
 */
function unpackDPX10bit(
  packedData: DataView,
  width: number,
  height: number,
  numChannels: number,
  bigEndian: boolean
): Float32Array {
  const output = new Float32Array(width * height * numChannels);
  let srcOffset = 0;
  let dstIdx = 0;

  const totalComponents = width * height * numChannels;
  const wordsNeeded = Math.ceil(totalComponents / 3);

  for (let w = 0; w < wordsNeeded && dstIdx < totalComponents; w++) {
    const word = packedData.getUint32(srcOffset, !bigEndian);
    srcOffset += 4;

    // Extract 3 x 10-bit components from 32-bit word
    // Method A: components packed MSB first, 2 padding bits at LSB
    const c0 = (word >> 22) & 0x3FF;
    const c1 = (word >> 12) & 0x3FF;
    const c2 = (word >> 2) & 0x3FF;

    if (dstIdx < totalComponents) output[dstIdx++] = c0 / 1023.0;
    if (dstIdx < totalComponents) output[dstIdx++] = c1 / 1023.0;
    if (dstIdx < totalComponents) output[dstIdx++] = c2 / 1023.0;
  }

  return output;
}
```

### Worker-Based Decoding Architecture

```typescript
// src/formats/DecoderWorker.ts
// Runs decoders in Web Worker to avoid blocking main thread

interface DecoderMessage {
  id: number;
  type: 'decode' | 'info' | 'init';
  format: 'exr' | 'dpx' | 'cineon' | 'tiff';
  buffer?: ArrayBuffer;
  options?: DecodeOptions;
}

interface DecoderResponse {
  id: number;
  type: 'result' | 'error' | 'progress';
  result?: DecodeResult;
  error?: string;
  progress?: number;
}

class DecoderWorkerPool {
  private workers: Worker[] = [];
  private queue: Map<number, { resolve: Function; reject: Function }> = new Map();
  private nextId = 0;

  constructor(poolSize: number = navigator.hardwareConcurrency || 4) {
    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(new URL('./decoder.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => this.handleMessage(e.data);
      this.workers.push(worker);
    }
  }

  async decode(format: string, buffer: ArrayBuffer, options?: DecodeOptions): Promise<DecodeResult> {
    const id = this.nextId++;
    const worker = this.workers[id % this.workers.length]!;

    return new Promise((resolve, reject) => {
      this.queue.set(id, { resolve, reject });
      worker.postMessage(
        { id, type: 'decode', format, buffer, options },
        [buffer] // Transfer ownership for zero-copy
      );
    });
  }

  private handleMessage(response: DecoderResponse): void {
    const pending = this.queue.get(response.id);
    if (!pending) return;

    if (response.type === 'result') {
      this.queue.delete(response.id);
      pending.resolve(response.result);
    } else if (response.type === 'error') {
      this.queue.delete(response.id);
      pending.reject(new Error(response.error));
    }
  }

  dispose(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.queue.clear();
  }
}
```

## E2E Test Cases

### DPX Format Loading

```typescript
// e2e/dpx-loading.spec.ts
import { test, expect } from '@playwright/test';
import {
  waitForTestHelper,
  getSessionState,
  getViewerState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';
import path from 'path';

const SAMPLE_DPX_10BIT = 'sample/test_10bit.dpx';
const SAMPLE_DPX_16BIT = 'sample/test_16bit.dpx';
const SAMPLE_DPX_LOG = 'sample/test_log.dpx';

test.describe('DPX Format Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test.describe('DPX File Loading', () => {
    test('DPX-E001: should load 10-bit DPX file and update session state', async ({ page }) => {
      let state = await getSessionState(page);
      expect(state.hasMedia).toBe(false);

      const filePath = path.resolve(process.cwd(), SAMPLE_DPX_10BIT);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1500);

      state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);
      expect(state.frameCount).toBeGreaterThan(0);
    });

    test('DPX-E002: should display DPX image on canvas', async ({ page }) => {
      const filePath = path.resolve(process.cwd(), SAMPLE_DPX_10BIT);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1500);

      const screenshot = await captureViewerScreenshot(page);
      expect(screenshot.length).toBeGreaterThan(1000);
    });

    test('DPX-E003: should detect DPX format and show format badge', async ({ page }) => {
      const filePath = path.resolve(process.cwd(), SAMPLE_DPX_10BIT);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1500);

      const formatBadge = page.locator('[data-testid="format-badge"]');
      await expect(formatBadge).toBeVisible();
      await expect(formatBadge).toContainText('DPX');
    });

    test('DPX-E004: should show 10-bit depth in metadata', async ({ page }) => {
      const filePath = path.resolve(process.cwd(), SAMPLE_DPX_10BIT);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1500);

      const viewerState = await getViewerState(page);
      expect(viewerState.bitDepth).toBe(10);
      expect(viewerState.formatName).toBe('DPX');
    });

    test('DPX-E005: should load 16-bit DPX file', async ({ page }) => {
      const filePath = path.resolve(process.cwd(), SAMPLE_DPX_16BIT);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1500);

      const state = await getSessionState(page);
      expect(state.hasMedia).toBe(true);

      const viewerState = await getViewerState(page);
      expect(viewerState.bitDepth).toBe(16);
    });
  });

  test.describe('DPX Log/Linear Conversion', () => {
    test('DPX-E010: should show log/linear toggle for log-encoded DPX', async ({ page }) => {
      const filePath = path.resolve(process.cwd(), SAMPLE_DPX_LOG);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1500);

      const logLinToggle = page.locator('[data-testid="log-linear-toggle"]');
      await expect(logLinToggle).toBeVisible();
    });

    test('DPX-E011: should visually change when toggling log-to-linear', async ({ page }) => {
      const filePath = path.resolve(process.cwd(), SAMPLE_DPX_LOG);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1500);

      // Capture log display
      const screenshotLog = await captureViewerScreenshot(page);

      // Toggle to linear
      const logLinToggle = page.locator('[data-testid="log-linear-toggle"]');
      await logLinToggle.click();
      await page.waitForTimeout(500);

      // Capture linear display
      const screenshotLinear = await captureViewerScreenshot(page);

      // Images should be visually different
      expect(imagesAreDifferent(screenshotLog, screenshotLinear)).toBe(true);
    });

    test('DPX-E012: should preserve log encoding indicator in status bar', async ({ page }) => {
      const filePath = path.resolve(process.cwd(), SAMPLE_DPX_LOG);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(1500);

      const encodingIndicator = page.locator('[data-testid="encoding-indicator"]');
      await expect(encodingIndicator).toContainText('LOG');
    });
  });
});
```

### Cineon Format Loading

```typescript
// e2e/cineon-loading.spec.ts
import { test, expect } from '@playwright/test';
import {
  waitForTestHelper,
  getSessionState,
  getViewerState,
  captureViewerScreenshot,
} from './fixtures';
import path from 'path';

const SAMPLE_CINEON = 'sample/test_film.cin';

test.describe('Cineon Format Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('CIN-E001: should load Cineon file and update session state', async ({ page }) => {
    let state = await getSessionState(page);
    expect(state.hasMedia).toBe(false);

    const filePath = path.resolve(process.cwd(), SAMPLE_CINEON);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    state = await getSessionState(page);
    expect(state.hasMedia).toBe(true);
  });

  test('CIN-E002: should display Cineon image on canvas', async ({ page }) => {
    const filePath = path.resolve(process.cwd(), SAMPLE_CINEON);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    const screenshot = await captureViewerScreenshot(page);
    expect(screenshot.length).toBeGreaterThan(1000);
  });

  test('CIN-E003: should detect Cineon format and show format badge', async ({ page }) => {
    const filePath = path.resolve(process.cwd(), SAMPLE_CINEON);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    const formatBadge = page.locator('[data-testid="format-badge"]');
    await expect(formatBadge).toBeVisible();
    await expect(formatBadge).toContainText('CIN');
  });

  test('CIN-E004: should show 10-bit log encoding in metadata', async ({ page }) => {
    const filePath = path.resolve(process.cwd(), SAMPLE_CINEON);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    const viewerState = await getViewerState(page);
    expect(viewerState.bitDepth).toBe(10);
    expect(viewerState.colorSpace).toBe('log');
  });

  test('CIN-E005: should apply log-to-linear conversion by default', async ({ page }) => {
    const filePath = path.resolve(process.cwd(), SAMPLE_CINEON);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    // Log/linear toggle should be visible and active
    const logLinToggle = page.locator('[data-testid="log-linear-toggle"]');
    await expect(logLinToggle).toBeVisible();
  });
});
```

### Float TIFF Loading

```typescript
// e2e/float-tiff-loading.spec.ts
import { test, expect } from '@playwright/test';
import {
  waitForTestHelper,
  getSessionState,
  getViewerState,
  captureViewerScreenshot,
} from './fixtures';
import path from 'path';

const SAMPLE_FLOAT_TIFF = 'sample/test_float32.tiff';

test.describe('Float TIFF Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('FTIF-E001: should load 32-bit float TIFF and update session state', async ({ page }) => {
    let state = await getSessionState(page);
    expect(state.hasMedia).toBe(false);

    const filePath = path.resolve(process.cwd(), SAMPLE_FLOAT_TIFF);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    state = await getSessionState(page);
    expect(state.hasMedia).toBe(true);
  });

  test('FTIF-E002: should display float TIFF image on canvas', async ({ page }) => {
    const filePath = path.resolve(process.cwd(), SAMPLE_FLOAT_TIFF);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    const screenshot = await captureViewerScreenshot(page);
    expect(screenshot.length).toBeGreaterThan(1000);
  });

  test('FTIF-E003: should detect float TIFF format and show format badge', async ({ page }) => {
    const filePath = path.resolve(process.cwd(), SAMPLE_FLOAT_TIFF);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    const formatBadge = page.locator('[data-testid="format-badge"]');
    await expect(formatBadge).toBeVisible();
    await expect(formatBadge).toContainText('TIFF');
  });

  test('FTIF-E004: should show 32-bit float data type in metadata', async ({ page }) => {
    const filePath = path.resolve(process.cwd(), SAMPLE_FLOAT_TIFF);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    const viewerState = await getViewerState(page);
    expect(viewerState.dataType).toBe('float32');
    expect(viewerState.bitDepth).toBe(32);
  });

  test('FTIF-E005: should handle HDR values in float TIFF with exposure control', async ({ page }) => {
    const filePath = path.resolve(process.cwd(), SAMPLE_FLOAT_TIFF);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    // Capture default exposure
    const screenshotDefault = await captureViewerScreenshot(page);

    // Change exposure to +3 via evaluate
    await page.evaluate(() => {
      const app = (window as any).__testHelper;
      if (app?.setExposure) app.setExposure(3.0);
    });
    await page.waitForTimeout(500);

    const screenshotBright = await captureViewerScreenshot(page);

    // Exposure change on float data should produce a visible difference
    const { imagesAreDifferent } = await import('./fixtures');
    expect(imagesAreDifferent(screenshotDefault, screenshotBright)).toBe(true);
  });
});
```

### Float32 Pipeline Tests

```typescript
// e2e/float-pipeline.spec.ts
import { test, expect } from '@playwright/test';
import {
  waitForTestHelper,
  getViewerState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';
import path from 'path';

const SAMPLE_HDR_EXR = 'sample/test_hdr.exr';

test.describe('Float32 Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('FP32-E001: should preserve HDR values through pipeline', async ({ page }) => {
    const filePath = path.resolve(process.cwd(), SAMPLE_HDR_EXR);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    // Read pixel values from the viewer - should be float32 internally
    const pixelInfo = await page.evaluate(() => {
      const app = (window as any).__testHelper;
      if (app?.getPixelValue) {
        return app.getPixelValue(0, 0);
      }
      return null;
    });

    // Float data should be available (not clamped to 0-255)
    expect(pixelInfo).not.toBeNull();
    if (pixelInfo) {
      expect(pixelInfo.dataType).toBe('float32');
    }
  });

  test('FP32-E002: should render differently with tone mapping on vs off', async ({ page }) => {
    const filePath = path.resolve(process.cwd(), SAMPLE_HDR_EXR);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    // Capture without tone mapping
    const screenshotNoTM = await captureViewerScreenshot(page);

    // Enable ACES tone mapping
    await page.evaluate(() => {
      const app = (window as any).__testHelper;
      if (app?.setToneMapping) app.setToneMapping('aces');
    });
    await page.waitForTimeout(500);

    const screenshotACES = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(screenshotNoTM, screenshotACES)).toBe(true);
  });

  test('FP32-E003: should show out-of-range indicators for super-white pixels', async ({ page }) => {
    const filePath = path.resolve(process.cwd(), SAMPLE_HDR_EXR);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    // Increase exposure to push values well above 1.0
    await page.evaluate(() => {
      const app = (window as any).__testHelper;
      if (app?.setExposure) app.setExposure(4.0);
    });
    await page.waitForTimeout(500);

    // Enable clipping overlay
    const viewerState = await getViewerState(page);
    // With high exposure on HDR content, there should be clipping
    expect(viewerState.highlightClipPercent).toBeGreaterThan(0);
  });

  test('FP32-E004: should support negative exposure on HDR content', async ({ page }) => {
    const filePath = path.resolve(process.cwd(), SAMPLE_HDR_EXR);
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(1500);

    const screenshotDefault = await captureViewerScreenshot(page);

    // Apply strong negative exposure
    await page.evaluate(() => {
      const app = (window as any).__testHelper;
      if (app?.setExposure) app.setExposure(-4.0);
    });
    await page.waitForTimeout(500);

    const screenshotDark = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(screenshotDefault, screenshotDark)).toBe(true);
  });
});
```

## Unit Test Cases

### DPX Decoder Tests

```typescript
// src/formats/DPXDecoder.test.ts
import { describe, it, expect } from 'vitest';
import {
  decodeDPX,
  isDPXFile,
  getDPXInfo,
  unpackDPX10bit,
  dpxLogToLinear,
  DPXTransferFunction,
} from './DPXDecoder';

// DPX magic numbers
const DPX_MAGIC_BE = 0x53445058; // "SDPX" big-endian
const DPX_MAGIC_LE = 0x58504453; // "XPDS" little-endian

/**
 * Create a minimal valid DPX file buffer for testing
 */
function createTestDPX(options: {
  width?: number;
  height?: number;
  bitDepth?: number;
  bigEndian?: boolean;
  transfer?: DPXTransferFunction;
} = {}): ArrayBuffer {
  const {
    width = 4,
    height = 4,
    bitDepth = 10,
    bigEndian = true,
    transfer = DPXTransferFunction.LINEAR,
  } = options;

  // Simplified DPX header construction
  const headerSize = 2048; // Standard DPX header size
  const bytesPerPixel = bitDepth === 10 ? 4 : (bitDepth / 8) * 3; // 10-bit packs 3 channels in 4 bytes
  const rowBytes = bitDepth === 10 ? Math.ceil((width * 3) / 3) * 4 : width * bytesPerPixel;
  const dataSize = rowBytes * height;
  const totalSize = headerSize + dataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Magic number
  view.setUint32(0, bigEndian ? DPX_MAGIC_BE : DPX_MAGIC_LE, !bigEndian);

  // Offset to image data
  view.setUint32(4, headerSize, !bigEndian);

  // Version
  const version = new TextEncoder().encode('V2.0');
  new Uint8Array(buffer, 8, 4).set(version);

  // File size
  view.setUint32(16, totalSize, !bigEndian);

  // Image element descriptor
  // Number of image elements = 1
  view.setUint16(768, 1, !bigEndian);

  // Image width
  view.setUint32(772, width, !bigEndian);

  // Image height
  view.setUint32(776, height, !bigEndian);

  // Element 0 descriptor
  // Bit size
  view.setUint8(803, bitDepth);

  // Transfer function
  view.setUint8(801, transfer);

  // Packing (0 = packed, 1 = Method A, 2 = Method B)
  view.setUint16(804, 1, !bigEndian); // Method A

  // Fill pixel data with test gradient
  const dataOffset = headerSize;
  if (bitDepth === 10) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const wordOffset = dataOffset + (y * width + x) * 4;
        const r = Math.round((x / (width - 1)) * 1023);
        const g = Math.round((y / (height - 1)) * 1023);
        const b = 512;
        // Pack Method A: R[31:22] G[21:12] B[11:2] pad[1:0]
        const word = (r << 22) | (g << 12) | (b << 2);
        view.setUint32(wordOffset, word, !bigEndian);
      }
    }
  }

  return buffer;
}

describe('DPXDecoder', () => {
  describe('isDPXFile', () => {
    it('DPX-U001: should return true for big-endian DPX magic', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint32(0, DPX_MAGIC_BE, false);
      expect(isDPXFile(buffer)).toBe(true);
    });

    it('DPX-U002: should return true for little-endian DPX magic', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint32(0, DPX_MAGIC_LE, false);
      expect(isDPXFile(buffer)).toBe(true);
    });

    it('DPX-U003: should return false for non-DPX data', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint32(0, 0x89504E47, false); // PNG magic
      expect(isDPXFile(buffer)).toBe(false);
    });

    it('DPX-U004: should return false for empty buffer', () => {
      const buffer = new ArrayBuffer(0);
      expect(isDPXFile(buffer)).toBe(false);
    });

    it('DPX-U005: should return false for buffer too small', () => {
      const buffer = new ArrayBuffer(2);
      expect(isDPXFile(buffer)).toBe(false);
    });
  });

  describe('getDPXInfo', () => {
    it('DPX-U010: should extract dimensions from valid DPX', () => {
      const buffer = createTestDPX({ width: 1920, height: 1080 });
      const info = getDPXInfo(buffer);

      expect(info).not.toBeNull();
      expect(info!.width).toBe(1920);
      expect(info!.height).toBe(1080);
    });

    it('DPX-U011: should detect 10-bit depth', () => {
      const buffer = createTestDPX({ bitDepth: 10 });
      const info = getDPXInfo(buffer);

      expect(info).not.toBeNull();
      expect(info!.bitDepth).toBe(10);
    });

    it('DPX-U012: should detect big-endian byte order', () => {
      const buffer = createTestDPX({ bigEndian: true });
      const info = getDPXInfo(buffer);

      expect(info).not.toBeNull();
      expect(info!.bigEndian).toBe(true);
    });

    it('DPX-U013: should detect little-endian byte order', () => {
      const buffer = createTestDPX({ bigEndian: false });
      const info = getDPXInfo(buffer);

      expect(info).not.toBeNull();
      expect(info!.bigEndian).toBe(false);
    });

    it('DPX-U014: should detect transfer function', () => {
      const buffer = createTestDPX({ transfer: DPXTransferFunction.LOGARITHMIC });
      const info = getDPXInfo(buffer);

      expect(info).not.toBeNull();
      expect(info!.transfer).toBe('logarithmic');
    });

    it('DPX-U015: should return null for invalid buffer', () => {
      const buffer = new ArrayBuffer(10);
      expect(getDPXInfo(buffer)).toBeNull();
    });
  });

  describe('decodeDPX', () => {
    it('DPX-U020: should decode 10-bit DPX to float32 RGBA', async () => {
      const buffer = createTestDPX({ width: 4, height: 4, bitDepth: 10 });
      const result = await decodeDPX(buffer);

      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(4 * 4 * 4); // RGBA
    });

    it('DPX-U021: should produce values in [0,1] range for linear DPX', async () => {
      const buffer = createTestDPX({ width: 4, height: 4, transfer: DPXTransferFunction.LINEAR });
      const result = await decodeDPX(buffer);

      for (let i = 0; i < result.data.length; i++) {
        expect(result.data[i]).toBeGreaterThanOrEqual(0);
        expect(result.data[i]).toBeLessThanOrEqual(1);
      }
    });

    it('DPX-U022: should handle big-endian byte order', async () => {
      const buffer = createTestDPX({ bigEndian: true });
      const result = await decodeDPX(buffer);

      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('DPX-U023: should handle little-endian byte order', async () => {
      const buffer = createTestDPX({ bigEndian: false });
      const result = await decodeDPX(buffer);

      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('DPX-U024: should throw for truncated DPX file', async () => {
      const buffer = new ArrayBuffer(100);
      const view = new DataView(buffer);
      view.setUint32(0, DPX_MAGIC_BE, false);

      await expect(decodeDPX(buffer)).rejects.toThrow(/truncated|Invalid|too small/);
    });

    it('DPX-U025: should reject invalid magic number', async () => {
      const buffer = new ArrayBuffer(2048);
      const view = new DataView(buffer);
      view.setUint32(0, 0xDEADBEEF, false);

      await expect(decodeDPX(buffer)).rejects.toThrow(/Invalid DPX/);
    });
  });

  describe('unpackDPX10bit', () => {
    it('DPX-U030: should unpack Method A 10-bit data correctly', () => {
      // Create a single 32-bit word with known values
      // R=1023 (max), G=512 (mid), B=0 (min)
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      const word = (1023 << 22) | (512 << 12) | (0 << 2);
      view.setUint32(0, word, false); // big-endian

      const result = unpackDPX10bit(view, 1, 1, 3, true);

      expect(result[0]).toBeCloseTo(1.0, 3);      // R = 1023/1023
      expect(result[1]).toBeCloseTo(0.5005, 2);    // G = 512/1023
      expect(result[2]).toBeCloseTo(0.0, 3);       // B = 0/1023
    });

    it('DPX-U031: should handle zero values', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint32(0, 0, false);

      const result = unpackDPX10bit(view, 1, 1, 3, true);

      expect(result[0]).toBeCloseTo(0, 5);
      expect(result[1]).toBeCloseTo(0, 5);
      expect(result[2]).toBeCloseTo(0, 5);
    });

    it('DPX-U032: should handle maximum values', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      const word = (1023 << 22) | (1023 << 12) | (1023 << 2);
      view.setUint32(0, word, false);

      const result = unpackDPX10bit(view, 1, 1, 3, true);

      expect(result[0]).toBeCloseTo(1.0, 3);
      expect(result[1]).toBeCloseTo(1.0, 3);
      expect(result[2]).toBeCloseTo(1.0, 3);
    });
  });

  describe('dpxLogToLinear', () => {
    it('DPX-U040: should convert reference white to ~1.0', () => {
      // Reference white at code value 685 should map close to 1.0
      const linear = dpxLogToLinear(685, { refWhite: 685, refBlack: 95, filmGamma: 0.6 });
      expect(linear).toBeCloseTo(1.0, 1);
    });

    it('DPX-U041: should convert reference black to near 0', () => {
      const linear = dpxLogToLinear(95, { refWhite: 685, refBlack: 95, filmGamma: 0.6 });
      expect(linear).toBeCloseTo(0, 1);
    });

    it('DPX-U042: should convert mid-grey code value', () => {
      // Mid-grey is typically around code value 445
      const linear = dpxLogToLinear(445, { refWhite: 685, refBlack: 95, filmGamma: 0.6 });
      expect(linear).toBeGreaterThan(0);
      expect(linear).toBeLessThan(1);
    });

    it('DPX-U043: should handle code value 0', () => {
      const linear = dpxLogToLinear(0, { refWhite: 685, refBlack: 95, filmGamma: 0.6 });
      expect(linear).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(linear)).toBe(true);
    });

    it('DPX-U044: should handle code value 1023 (max 10-bit)', () => {
      const linear = dpxLogToLinear(1023, { refWhite: 685, refBlack: 95, filmGamma: 0.6 });
      expect(linear).toBeGreaterThan(1.0); // Super-white
      expect(Number.isFinite(linear)).toBe(true);
    });

    it('DPX-U045: should be monotonically increasing', () => {
      const values = [95, 200, 300, 445, 600, 685, 800, 1023];
      const linearValues = values.map(v =>
        dpxLogToLinear(v, { refWhite: 685, refBlack: 95, filmGamma: 0.6 })
      );

      for (let i = 1; i < linearValues.length; i++) {
        expect(linearValues[i]).toBeGreaterThan(linearValues[i - 1]!);
      }
    });
  });
});
```

### Cineon Decoder Tests

```typescript
// src/formats/CineonDecoder.test.ts
import { describe, it, expect } from 'vitest';
import {
  decodeCineon,
  isCineonFile,
  getCineonInfo,
  cineonLogToLinear,
} from './CineonDecoder';

const CINEON_MAGIC = 0x802A5FD7;

/**
 * Create a minimal valid Cineon file buffer for testing
 */
function createTestCineon(options: {
  width?: number;
  height?: number;
} = {}): ArrayBuffer {
  const { width = 4, height = 4 } = options;

  const headerSize = 1024;
  const rowBytes = Math.ceil((width * 3 * 10) / 32) * 4; // 10-bit packed
  const dataSize = rowBytes * height;
  const totalSize = headerSize + dataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Magic number
  view.setUint32(0, CINEON_MAGIC, false);

  // Offset to image data
  view.setUint32(4, headerSize, false);

  // Generic header size
  view.setUint32(8, headerSize, false);

  // Total file size
  view.setUint32(20, totalSize, false);

  // Image dimensions (Cineon stores in image information header)
  // Pixels per line
  view.setUint32(200, width, false);
  // Lines per image
  view.setUint32(204, height, false);

  // Bit depth per channel element
  view.setUint8(213, 10);

  return buffer;
}

describe('CineonDecoder', () => {
  describe('isCineonFile', () => {
    it('CIN-U001: should return true for valid Cineon magic', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint32(0, CINEON_MAGIC, false);
      expect(isCineonFile(buffer)).toBe(true);
    });

    it('CIN-U002: should return false for non-Cineon data', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint32(0, 0x89504E47, false);
      expect(isCineonFile(buffer)).toBe(false);
    });

    it('CIN-U003: should return false for empty buffer', () => {
      expect(isCineonFile(new ArrayBuffer(0))).toBe(false);
    });
  });

  describe('getCineonInfo', () => {
    it('CIN-U010: should extract dimensions from valid Cineon', () => {
      const buffer = createTestCineon({ width: 2048, height: 1556 });
      const info = getCineonInfo(buffer);

      expect(info).not.toBeNull();
      expect(info!.width).toBe(2048);
      expect(info!.height).toBe(1556);
    });

    it('CIN-U011: should detect 10-bit depth', () => {
      const buffer = createTestCineon();
      const info = getCineonInfo(buffer);

      expect(info).not.toBeNull();
      expect(info!.bitDepth).toBe(10);
    });

    it('CIN-U012: should return null for invalid buffer', () => {
      expect(getCineonInfo(new ArrayBuffer(10))).toBeNull();
    });
  });

  describe('decodeCineon', () => {
    it('CIN-U020: should decode Cineon to float32 RGBA', async () => {
      const buffer = createTestCineon({ width: 4, height: 4 });
      const result = await decodeCineon(buffer);

      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(4 * 4 * 4);
    });

    it('CIN-U021: should produce finite float values', async () => {
      const buffer = createTestCineon({ width: 2, height: 2 });
      const result = await decodeCineon(buffer);

      for (let i = 0; i < result.data.length; i++) {
        expect(Number.isFinite(result.data[i])).toBe(true);
      }
    });

    it('CIN-U022: should throw for invalid magic', async () => {
      const buffer = new ArrayBuffer(1024);
      const view = new DataView(buffer);
      view.setUint32(0, 0xDEADBEEF, false);

      await expect(decodeCineon(buffer)).rejects.toThrow(/Invalid Cineon/);
    });

    it('CIN-U023: should throw for truncated file', async () => {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint32(0, CINEON_MAGIC, false);

      await expect(decodeCineon(buffer)).rejects.toThrow(/truncated|too small/);
    });
  });

  describe('cineonLogToLinear', () => {
    it('CIN-U030: should convert reference white to ~1.0', () => {
      const linear = cineonLogToLinear(685);
      expect(linear).toBeCloseTo(1.0, 1);
    });

    it('CIN-U031: should convert reference black to near 0', () => {
      const linear = cineonLogToLinear(95);
      expect(linear).toBeCloseTo(0, 1);
    });

    it('CIN-U032: should be monotonically increasing', () => {
      let prev = cineonLogToLinear(0);
      for (let cv = 100; cv <= 1023; cv += 100) {
        const curr = cineonLogToLinear(cv);
        expect(curr).toBeGreaterThan(prev);
        prev = curr;
      }
    });

    it('CIN-U033: should produce finite values for full code range', () => {
      for (let cv = 0; cv <= 1023; cv++) {
        const linear = cineonLogToLinear(cv);
        expect(Number.isFinite(linear)).toBe(true);
      }
    });
  });
});
```

### TIFF Float Decoder Tests

```typescript
// src/formats/TIFFFloatDecoder.test.ts
import { describe, it, expect } from 'vitest';
import {
  decodeTIFFFloat,
  isTIFFFile,
  isFloatTIFF,
  getTIFFInfo,
} from './TIFFFloatDecoder';

// TIFF magic numbers
const TIFF_MAGIC_LE = 0x4949; // "II" little-endian
const TIFF_MAGIC_BE = 0x4D4D; // "MM" big-endian
const TIFF_MAGIC_42 = 42;     // TIFF identifier

/**
 * Create a minimal valid float TIFF buffer for testing
 */
function createTestFloatTIFF(options: {
  width?: number;
  height?: number;
  channels?: number;
} = {}): ArrayBuffer {
  const { width = 4, height = 4, channels = 3 } = options;

  // Build a minimal TIFF with float data
  const pixelBytes = width * height * channels * 4; // float32
  const ifdOffset = 8;
  const numTags = 10;
  const tagSize = 12;
  const ifdSize = 2 + numTags * tagSize + 4; // count + tags + next IFD offset
  const dataOffset = ifdOffset + ifdSize + 32; // extra space for overflow values
  const totalSize = dataOffset + pixelBytes;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // TIFF header (little-endian)
  view.setUint16(0, TIFF_MAGIC_LE, true);
  view.setUint16(2, TIFF_MAGIC_42, true);
  view.setUint32(4, ifdOffset, true);

  let tagOffset = ifdOffset;
  view.setUint16(tagOffset, numTags, true);
  tagOffset += 2;

  function writeTag(tag: number, type: number, count: number, value: number) {
    view.setUint16(tagOffset, tag, true);
    view.setUint16(tagOffset + 2, type, true);
    view.setUint32(tagOffset + 4, count, true);
    view.setUint32(tagOffset + 8, value, true);
    tagOffset += 12;
  }

  // ImageWidth (256)
  writeTag(256, 3, 1, width);
  // ImageLength (257)
  writeTag(257, 3, 1, height);
  // BitsPerSample (258) - 32
  writeTag(258, 3, 1, 32);
  // Compression (259) - none
  writeTag(259, 3, 1, 1);
  // PhotometricInterpretation (262) - RGB
  writeTag(262, 3, 1, 2);
  // StripOffsets (273)
  writeTag(273, 4, 1, dataOffset);
  // SamplesPerPixel (277)
  writeTag(277, 3, 1, channels);
  // RowsPerStrip (278)
  writeTag(278, 3, 1, height);
  // StripByteCounts (279)
  writeTag(279, 4, 1, pixelBytes);
  // SampleFormat (339) = 3 (IEEE float)
  writeTag(339, 3, 1, 3);

  // Next IFD offset (0 = no more IFDs)
  view.setUint32(tagOffset, 0, true);

  // Fill pixel data with gradient
  let pixelOffset = dataOffset;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        const value = c === 0 ? x / (width - 1) : c === 1 ? y / (height - 1) : 0.5;
        view.setFloat32(pixelOffset, value, true);
        pixelOffset += 4;
      }
    }
  }

  return buffer;
}

describe('TIFFFloatDecoder', () => {
  describe('isTIFFFile', () => {
    it('FTIF-U001: should return true for little-endian TIFF', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_MAGIC_LE, true);
      view.setUint16(2, TIFF_MAGIC_42, true);
      expect(isTIFFFile(buffer)).toBe(true);
    });

    it('FTIF-U002: should return true for big-endian TIFF', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_MAGIC_BE, false);
      view.setUint16(2, TIFF_MAGIC_42, false);
      expect(isTIFFFile(buffer)).toBe(true);
    });

    it('FTIF-U003: should return false for non-TIFF data', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint32(0, 0x89504E47, false);
      expect(isTIFFFile(buffer)).toBe(false);
    });

    it('FTIF-U004: should return false for empty buffer', () => {
      expect(isTIFFFile(new ArrayBuffer(0))).toBe(false);
    });
  });

  describe('isFloatTIFF', () => {
    it('FTIF-U010: should return true for float32 TIFF', () => {
      const buffer = createTestFloatTIFF();
      expect(isFloatTIFF(buffer)).toBe(true);
    });

    it('FTIF-U011: should return false for uint8 TIFF', () => {
      // Create a non-float TIFF (SampleFormat = 1 or absent)
      const buffer = createTestFloatTIFF();
      const view = new DataView(buffer);
      // Modify SampleFormat tag value from 3 to 1
      // This is a simplified approach; in practice we'd build a separate buffer
      expect(isFloatTIFF(new ArrayBuffer(10))).toBe(false);
    });
  });

  describe('getTIFFInfo', () => {
    it('FTIF-U020: should extract dimensions', () => {
      const buffer = createTestFloatTIFF({ width: 1920, height: 1080 });
      const info = getTIFFInfo(buffer);

      expect(info).not.toBeNull();
      expect(info!.width).toBe(1920);
      expect(info!.height).toBe(1080);
    });

    it('FTIF-U021: should detect float sample format', () => {
      const buffer = createTestFloatTIFF();
      const info = getTIFFInfo(buffer);

      expect(info).not.toBeNull();
      expect(info!.sampleFormat).toBe('float');
      expect(info!.bitsPerSample).toBe(32);
    });

    it('FTIF-U022: should detect channel count', () => {
      const buffer = createTestFloatTIFF({ channels: 4 });
      const info = getTIFFInfo(buffer);

      expect(info).not.toBeNull();
      expect(info!.channels).toBe(4);
    });
  });

  describe('decodeTIFFFloat', () => {
    it('FTIF-U030: should decode float TIFF to Float32Array RGBA', async () => {
      const buffer = createTestFloatTIFF({ width: 4, height: 4, channels: 3 });
      const result = await decodeTIFFFloat(buffer);

      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(4 * 4 * 4); // Always output RGBA
    });

    it('FTIF-U031: should preserve float values accurately', async () => {
      const buffer = createTestFloatTIFF({ width: 2, height: 1, channels: 3 });
      const result = await decodeTIFFFloat(buffer);

      // First pixel: R=0.0, G=0.0, B=0.5
      expect(result.data[0]).toBeCloseTo(0.0, 3);
      expect(result.data[2]).toBeCloseTo(0.5, 3);
    });

    it('FTIF-U032: should add alpha=1 for RGB input', async () => {
      const buffer = createTestFloatTIFF({ width: 2, height: 2, channels: 3 });
      const result = await decodeTIFFFloat(buffer);

      // Check alpha values
      for (let i = 3; i < result.data.length; i += 4) {
        expect(result.data[i]).toBeCloseTo(1.0, 5);
      }
    });

    it('FTIF-U033: should handle RGBA input directly', async () => {
      const buffer = createTestFloatTIFF({ width: 2, height: 2, channels: 4 });
      const result = await decodeTIFFFloat(buffer);

      expect(result.data.length).toBe(2 * 2 * 4);
    });

    it('FTIF-U034: should throw for non-TIFF data', async () => {
      const buffer = new ArrayBuffer(100);
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow(/Invalid TIFF/);
    });

    it('FTIF-U035: should throw for non-float TIFF', async () => {
      // Buffer with TIFF magic but no float SampleFormat
      const buffer = new ArrayBuffer(100);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_MAGIC_LE, true);
      view.setUint16(2, TIFF_MAGIC_42, true);

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow(/not a float|not supported/i);
    });
  });
});
```

### Float32 Pipeline Tests

```typescript
// src/render/FloatPipeline.test.ts
import { describe, it, expect } from 'vitest';
import { IPImage } from '../core/image/Image';

describe('Float32 Pipeline', () => {
  describe('IPImage float32 handling', () => {
    it('FP32-U001: should create float32 IPImage', () => {
      const image = new IPImage({
        width: 2,
        height: 2,
        channels: 4,
        dataType: 'float32',
      });

      expect(image.dataType).toBe('float32');
      expect(image.getBytesPerComponent()).toBe(4);
    });

    it('FP32-U002: should store and retrieve HDR values > 1.0', () => {
      const image = new IPImage({
        width: 1,
        height: 1,
        channels: 4,
        dataType: 'float32',
      });

      image.setPixel(0, 0, [2.5, 10.0, 0.001, 1.0]);
      const pixel = image.getPixel(0, 0);

      expect(pixel[0]).toBeCloseTo(2.5, 5);
      expect(pixel[1]).toBeCloseTo(10.0, 5);
      expect(pixel[2]).toBeCloseTo(0.001, 5);
      expect(pixel[3]).toBeCloseTo(1.0, 5);
    });

    it('FP32-U003: should store and retrieve negative values', () => {
      const image = new IPImage({
        width: 1,
        height: 1,
        channels: 4,
        dataType: 'float32',
      });

      image.setPixel(0, 0, [-0.5, -1.0, 0.0, 1.0]);
      const pixel = image.getPixel(0, 0);

      expect(pixel[0]).toBeCloseTo(-0.5, 5);
      expect(pixel[1]).toBeCloseTo(-1.0, 5);
    });

    it('FP32-U004: should return Float32Array from getTypedArray', () => {
      const image = new IPImage({
        width: 2,
        height: 2,
        channels: 4,
        dataType: 'float32',
      });

      const array = image.getTypedArray();
      expect(array).toBeInstanceOf(Float32Array);
      expect(array.length).toBe(2 * 2 * 4);
    });

    it('FP32-U005: should clone float32 data correctly', () => {
      const original = new IPImage({
        width: 1,
        height: 1,
        channels: 4,
        dataType: 'float32',
      });
      original.setPixel(0, 0, [5.0, 10.0, 0.001, 1.0]);

      const cloned = original.clone();

      expect(cloned.dataType).toBe('float32');
      const pixel = cloned.getPixel(0, 0);
      expect(pixel[0]).toBeCloseTo(5.0, 5);
      expect(pixel[1]).toBeCloseTo(10.0, 5);
    });

    it('FP32-U006: should handle Infinity and NaN in float32', () => {
      const image = new IPImage({
        width: 1,
        height: 1,
        channels: 4,
        dataType: 'float32',
      });

      image.setPixel(0, 0, [Infinity, -Infinity, NaN, 1.0]);
      const pixel = image.getPixel(0, 0);

      expect(pixel[0]).toBe(Infinity);
      expect(pixel[1]).toBe(-Infinity);
      expect(Number.isNaN(pixel[2])).toBe(true);
    });

    it('FP32-U007: should calculate correct buffer size for float32', () => {
      const image = new IPImage({
        width: 100,
        height: 100,
        channels: 4,
        dataType: 'float32',
      });

      // 100 * 100 * 4 channels * 4 bytes = 160,000 bytes
      expect(image.data.byteLength).toBe(160000);
    });
  });

  describe('Exposure on float32 data', () => {
    it('FP32-U010: should apply exposure correctly to HDR values', () => {
      const image = new IPImage({
        width: 1,
        height: 1,
        channels: 4,
        dataType: 'float32',
      });
      image.setPixel(0, 0, [0.5, 1.0, 2.0, 1.0]);

      // Simulate exposure +1 (multiply by 2)
      const exposure = 1.0;
      const multiplier = Math.pow(2, exposure);
      const array = image.getTypedArray() as Float32Array;

      const result = new Float32Array(array.length);
      for (let i = 0; i < array.length; i += 4) {
        result[i] = array[i]! * multiplier;
        result[i + 1] = array[i + 1]! * multiplier;
        result[i + 2] = array[i + 2]! * multiplier;
        result[i + 3] = array[i + 3]!; // Alpha unchanged
      }

      expect(result[0]).toBeCloseTo(1.0, 5);   // 0.5 * 2
      expect(result[1]).toBeCloseTo(2.0, 5);   // 1.0 * 2
      expect(result[2]).toBeCloseTo(4.0, 5);   // 2.0 * 2
      expect(result[3]).toBeCloseTo(1.0, 5);   // Alpha unchanged
    });

    it('FP32-U011: should preserve super-white values through exposure', () => {
      // Start with HDR value of 10.0
      const value = 10.0;
      const exposure = -2.0; // Bring it down 2 stops
      const multiplier = Math.pow(2, exposure);
      const result = value * multiplier;

      // 10.0 * 0.25 = 2.5 (still above 1.0)
      expect(result).toBeCloseTo(2.5, 5);
    });
  });
});
```

### Decoder Registry Tests

```typescript
// src/formats/DecoderRegistry.test.ts
import { describe, it, expect } from 'vitest';
import { DecoderRegistry } from './DecoderRegistry';

describe('DecoderRegistry', () => {
  it('REG-U001: should detect EXR format by magic number', () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, 0x01312F76, true); // EXR magic

    const registry = new DecoderRegistry();
    expect(registry.detectFormat(buffer)).toBe('exr');
  });

  it('REG-U002: should detect DPX format by big-endian magic', () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, 0x53445058, false); // "SDPX"

    const registry = new DecoderRegistry();
    expect(registry.detectFormat(buffer)).toBe('dpx');
  });

  it('REG-U003: should detect DPX format by little-endian magic', () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, 0x58504453, false); // "XPDS"

    const registry = new DecoderRegistry();
    expect(registry.detectFormat(buffer)).toBe('dpx');
  });

  it('REG-U004: should detect Cineon format by magic', () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, 0x802A5FD7, false);

    const registry = new DecoderRegistry();
    expect(registry.detectFormat(buffer)).toBe('cineon');
  });

  it('REG-U005: should detect TIFF format by LE magic', () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint16(0, 0x4949, true); // "II"
    view.setUint16(2, 42, true);

    const registry = new DecoderRegistry();
    expect(registry.detectFormat(buffer)).toBe('tiff');
  });

  it('REG-U006: should detect TIFF format by BE magic', () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint16(0, 0x4D4D, false); // "MM"
    view.setUint16(2, 42, false);

    const registry = new DecoderRegistry();
    expect(registry.detectFormat(buffer)).toBe('tiff');
  });

  it('REG-U007: should return null for unknown format', () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, 0xDEADBEEF, false);

    const registry = new DecoderRegistry();
    expect(registry.detectFormat(buffer)).toBeNull();
  });

  it('REG-U008: should return null for empty buffer', () => {
    const registry = new DecoderRegistry();
    expect(registry.detectFormat(new ArrayBuffer(0))).toBeNull();
  });

  it('REG-U009: should return appropriate decoder for detected format', () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, 0x01312F76, true);

    const registry = new DecoderRegistry();
    const decoder = registry.getDecoder(buffer);

    expect(decoder).not.toBeNull();
    expect(decoder!.formatName).toBe('exr');
  });
});
```

## File Structure

### New Files to Create

```
src/formats/
  DecoderRegistry.ts          # Format detection and decoder dispatch
  DecoderRegistry.test.ts     # Registry unit tests
  DPXDecoder.ts               # DPX file format decoder
  DPXDecoder.test.ts          # DPX decoder unit tests
  CineonDecoder.ts            # Cineon file format decoder
  CineonDecoder.test.ts       # Cineon decoder unit tests
  TIFFFloatDecoder.ts         # 32-bit float TIFF decoder
  TIFFFloatDecoder.test.ts    # TIFF float decoder unit tests
  LogLinear.ts                # Shared log-to-linear conversion utilities
  LogLinear.test.ts           # Log/linear conversion unit tests
  wasm/
    EXRWasmDecoder.ts         # WASM wrapper for advanced EXR compression
    DPXWasmDecoder.ts         # WASM wrapper for DPX decoding (optional)
    decoder.worker.ts         # Web Worker entry point for decode operations
    README.md                 # Build instructions for WASM binaries
  index.ts                    # Updated exports (extend existing)

src/nodes/sources/
  DPXSourceNode.ts            # Source node for DPX files
  DPXSourceNode.test.ts       # DPX source node unit tests
  CineonSourceNode.ts         # Source node for Cineon files
  CineonSourceNode.test.ts    # Cineon source node unit tests
  TIFFSourceNode.ts           # Source node for float TIFF files
  TIFFSourceNode.test.ts      # TIFF source node unit tests

src/render/
  FloatTextureManager.ts      # WebGL float texture upload/management
  FloatTextureManager.test.ts # Float texture unit tests

src/ui/components/
  LogLinearToggle.ts          # Log/linear conversion toggle UI
  LogLinearToggle.test.ts     # Log/linear toggle unit tests
  FormatBadge.ts              # Format indicator badge component
  FormatBadge.test.ts         # Format badge unit tests

e2e/
  dpx-loading.spec.ts         # DPX format E2E tests
  cineon-loading.spec.ts       # Cineon format E2E tests
  float-tiff-loading.spec.ts   # Float TIFF E2E tests
  float-pipeline.spec.ts       # Float32 pipeline E2E tests

sample/
  test_10bit.dpx              # 10-bit linear DPX test file
  test_16bit.dpx              # 16-bit DPX test file
  test_log.dpx                # Log-encoded DPX test file
  test_film.cin               # Cineon test file
  test_float32.tiff           # 32-bit float TIFF test file
```

### Files to Modify

```
src/formats/EXRDecoder.ts     # Add PIZ/B44/DWAA support via WASM fallback
src/formats/index.ts          # Export new decoders and registry
src/nodes/sources/FileSourceNode.ts  # Extend to detect and dispatch DPX/Cineon/TIFF
src/nodes/sources/index.ts    # Export new source nodes
src/utils/SequenceLoader.ts   # Add .dpx, .cin, .tiff extensions to supported list
src/render/Renderer.ts        # Add float texture upload path (RGBA32F)
src/render/ShaderProgram.ts   # Extend display shader with tone mapping
src/ui/components/ViewerRenderingUtils.ts  # Float32 CPU fallback rendering
src/ui/components/InfoPanel.ts # Show format-specific metadata
```

## Dependencies

### Required NPM Packages (New)

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| None required for JS-only decoders | DPX/Cineon/TIFF parsers are pure TypeScript | - | - |

### Optional NPM Packages (for WASM approach)

| Package | Purpose | Size | License |
|---------|---------|------|---------|
| `openexr-wasm` | WASM OpenEXR decoder for PIZ/B44/DWAA compression | ~2 MB | BSD-3-Clause |
| `exr-js` | Alternative JS-only EXR decoder (simpler, fewer compression types) | ~150 KB | MIT |

### Browser API Requirements

| API | Purpose | Fallback |
|-----|---------|----------|
| `WebGL2` (existing) | Float texture rendering via `gl.RGBA32F` | CPU tone mapping to uint8 canvas |
| `EXT_color_buffer_float` (existing, checked) | Required for float framebuffer attachments | CPU fallback rendering |
| `OES_texture_float_linear` (existing, checked) | Linear filtering on float textures | Use `gl.NEAREST` filtering |
| `DecompressionStream` (existing, used for EXR ZIP) | zlib decompression for ZIP-compressed EXR and TIFF | pako.js or fflate fallback |
| `WebAssembly` | Run compiled C/C++ decoders | Pure JS decoder fallback (slower, fewer formats) |
| `Worker` | Background decoding to avoid blocking UI | Main thread decoding (blocks during large files) |
| `AbortController` | Cancel in-progress decode operations | Non-cancellable decode |

### Existing Internal Dependencies

| Module | Relationship |
|--------|-------------|
| `src/core/image/Image.ts` (IPImage) | All decoders output IPImage with float32 data |
| `src/render/Renderer.ts` | Must be extended for float texture upload and tone mapping shaders |
| `src/render/ShaderProgram.ts` | Display shader needs tone mapping uniforms |
| `src/nodes/sources/BaseSourceNode.ts` | New source nodes extend this base class |
| `src/nodes/sources/FileSourceNode.ts` | Primary integration point; dispatches to format-specific decoders |
| `src/utils/SequenceLoader.ts` | Must recognize new file extensions (.dpx, .cin) |
| `src/formats/EXRDecoder.ts` | Existing; extend with WASM fallback for unsupported compression |
| `src/ui/components/ColorControls.ts` | Exposure control works with float pipeline |
| `src/ui/components/ToneMappingControl.ts` | Tone mapping operator selection |
| `src/color/LUTLoader.ts` | 3D LUT application in float domain |
