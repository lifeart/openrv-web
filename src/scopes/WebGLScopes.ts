/**
 * WebGL-based Scopes Processor
 *
 * GPU-accelerated histogram, waveform, and vectorscope rendering.
 * - Histogram: Renders traditional bar histogram from pre-computed bin counts
 * - Waveform/Vectorscope: Uses point rendering with additive blending
 */

import { ShaderProgram } from '../render/ShaderProgram';

// Vertex shader for bar histogram - renders bars from pre-computed histogram data
// Uses gl_VertexID to determine bar index and vertex within bar (6 vertices per bar = 2 triangles)
const HISTOGRAM_BAR_VERTEX_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_histogramData; // 256x1 texture with normalized heights
uniform int u_channel; // 0=R, 1=G, 2=B, 3=Luma
uniform float u_maxValue; // Max bin value for normalization
uniform int u_logScale; // 0=linear, 1=log

flat out int v_channel;

void main() {
  // 6 vertices per bar (2 triangles), 256 bars
  int barIndex = gl_VertexID / 6;
  int vertexInBar = gl_VertexID % 6;

  if (barIndex >= 256) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  // Sample histogram value from texture
  float texCoord = (float(barIndex) + 0.5) / 256.0;
  vec4 histSample = texture(u_histogramData, vec2(texCoord, 0.5));

  // Select channel value
  float binValue;
  if (u_channel == 0) binValue = histSample.r;
  else if (u_channel == 1) binValue = histSample.g;
  else if (u_channel == 2) binValue = histSample.b;
  else binValue = histSample.a; // Luma in alpha

  // Normalize and optionally apply log scale
  float height = 0.0;
  if (u_maxValue > 0.0) {
    if (u_logScale == 1 && binValue > 0.0) {
      height = log(binValue + 1.0) / log(u_maxValue + 1.0);
    } else {
      height = binValue / u_maxValue;
    }
  }

  // Bar geometry: 2 triangles forming a rectangle
  // Vertices: 0=BL, 1=BR, 2=TL, 3=TL, 4=BR, 5=TR
  float barWidth = 2.0 / 256.0;
  float left = float(barIndex) * barWidth - 1.0;
  float right = left + barWidth;
  float bottom = -1.0;
  float top = -1.0 + height * 2.0;

  vec2 pos;
  if (vertexInBar == 0) pos = vec2(left, bottom);
  else if (vertexInBar == 1) pos = vec2(right, bottom);
  else if (vertexInBar == 2) pos = vec2(left, top);
  else if (vertexInBar == 3) pos = vec2(left, top);
  else if (vertexInBar == 4) pos = vec2(right, bottom);
  else pos = vec2(right, top);

  gl_Position = vec4(pos, 0.0, 1.0);
  v_channel = u_channel;
}
`;

const HISTOGRAM_BAR_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

flat in int v_channel;
out vec4 fragColor;
uniform float u_opacity;

void main() {
  vec3 color;
  // Match CPU histogram colors exactly
  if (v_channel == 0) color = vec3(1.0, 0.0, 0.0); // Pure Red
  else if (v_channel == 1) color = vec3(0.0, 1.0, 0.0); // Pure Green
  else if (v_channel == 2) color = vec3(0.0, 0.0, 1.0); // Pure Blue
  else color = vec3(0.78, 0.78, 0.78); // Luma (200/255)

  fragColor = vec4(color, u_opacity);
}
`;

// Vertex shader for waveform
// Each vertex represents one pixel in the (potentially downscaled) analysis image
const WAVEFORM_VERTEX_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2 u_imageSize; // Dimensions of the analysis image (texture)
uniform int u_mode; // 0=Luma, 1=RGB, 2=Parade, 3=YCbCr
uniform int u_channel;
uniform float u_waveformMaxValue; // Max value for Y-axis scaling (1.0 for SDR, >1.0 for HDR)

const vec3 LUMA_COEFF = vec3(0.2126, 0.7152, 0.0722);

// BT.709 YCbCr conversion coefficients
// Cb = -0.1146*R - 0.3854*G + 0.5000*B + 0.5
// Cr =  0.5000*R - 0.4542*G - 0.0458*B + 0.5
const vec3 CB_COEFF = vec3(-0.1146, -0.3854, 0.5000);
const vec3 CR_COEFF = vec3(0.5000, -0.4542, -0.0458);

flat out vec3 v_color;

void main() {
  int pixelIndex = gl_VertexID;
  int imgWidth = int(u_imageSize.x);
  int imgHeight = int(u_imageSize.y);

  if (pixelIndex >= imgWidth * imgHeight) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    v_color = vec3(0.0);
    return;
  }

  int px = pixelIndex % imgWidth;
  int py = pixelIndex / imgWidth;

  // Sample texture at pixel center
  vec2 texCoord = (vec2(float(px), float(py)) + 0.5) / u_imageSize;
  vec4 color = texture(u_image, texCoord);

  // Normalized X position in image (0 to 1)
  float normalizedX = (float(px) + 0.5) / u_imageSize.x;

  float value;
  float xPos;

  if (u_mode == 0) {
    // Luma mode
    value = dot(color.rgb, LUMA_COEFF);
    xPos = normalizedX;
    v_color = vec3(0.8);
  } else if (u_mode == 1) {
    // RGB overlay mode
    value = color[u_channel];
    xPos = normalizedX;
    v_color = u_channel == 0 ? vec3(1.0, 0.0, 0.0) :
              u_channel == 1 ? vec3(0.0, 1.0, 0.0) :
                               vec3(0.0, 0.0, 1.0);
  } else if (u_mode == 2) {
    // Parade mode - split into thirds
    value = color[u_channel];
    float thirdWidth = 1.0 / 3.0;
    xPos = (float(u_channel) + normalizedX) * thirdWidth;
    v_color = u_channel == 0 ? vec3(1.0, 0.4, 0.4) :
              u_channel == 1 ? vec3(0.4, 1.0, 0.4) :
                               vec3(0.4, 0.4, 1.0);
  } else {
    // YCbCr parade mode - split into thirds (Y, Cb, Cr)
    float thirdWidth = 1.0 / 3.0;
    xPos = (float(u_channel) + normalizedX) * thirdWidth;

    if (u_channel == 0) {
      // Y channel (white)
      value = dot(color.rgb, LUMA_COEFF);
      v_color = vec3(0.8, 0.8, 0.8);
    } else if (u_channel == 1) {
      // Cb channel (blue)
      value = dot(color.rgb, CB_COEFF) + 0.5;
      v_color = vec3(0.27, 0.53, 1.0);
    } else {
      // Cr channel (red)
      value = dot(color.rgb, CR_COEFF) + 0.5;
      v_color = vec3(1.0, 0.27, 0.27);
    }
  }

  // Scale value by maxValue for HDR support (SDR: maxValue=1.0, no change)
  float scaledValue = value / u_waveformMaxValue;
  gl_Position = vec4(xPos * 2.0 - 1.0, scaledValue * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;

const WAVEFORM_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

flat in vec3 v_color;
out vec4 fragColor;
uniform float u_opacity;

void main() {
  fragColor = vec4(v_color, u_opacity);
}
`;

// Vertex shader for vectorscope
// Each vertex represents one pixel in the (potentially downscaled) analysis image
const VECTORSCOPE_VERTEX_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2 u_imageSize; // Dimensions of the analysis image (texture)
uniform float u_zoom;
uniform float u_saturationScale; // Scale factor for P3/Rec.2020 wider gamut (1.0 for sRGB)

void main() {
  int pixelIndex = gl_VertexID;
  int imgWidth = int(u_imageSize.x);
  int imgHeight = int(u_imageSize.y);

  if (pixelIndex >= imgWidth * imgHeight) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  int px = pixelIndex % imgWidth;
  int py = pixelIndex / imgWidth;

  // Sample texture at pixel center
  vec2 texCoord = (vec2(float(px), float(py)) + 0.5) / u_imageSize;
  vec4 color = texture(u_image, texCoord);

  // RGB to YCbCr (ITU-R BT.601)
  float cb = -0.169 * color.r - 0.331 * color.g + 0.5 * color.b;
  float cr = 0.5 * color.r - 0.419 * color.g - 0.081 * color.b;

  // Apply saturation scale for wider gamuts (P3/Rec.2020 can have larger Cb/Cr values)
  float scaledZoom = u_zoom * u_saturationScale;
  gl_Position = vec4(cb * 2.0 * scaledZoom, cr * 2.0 * scaledZoom, 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;

const VECTORSCOPE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

out vec4 fragColor;
uniform float u_opacity;

void main() {
  fragColor = vec4(0.8, 0.8, 0.8, u_opacity);
}
`;

export type WaveformMode = 'luma' | 'rgb' | 'parade' | 'ycbcr';

export interface WaveformRenderOptions {
  channels?: {
    r: boolean;
    g: boolean;
    b: boolean;
  };
  intensity?: number;
}

// Target resolution for analysis during playback (keeps scopes responsive)
const PLAYBACK_TARGET_WIDTH = 320;
const PLAYBACK_TARGET_HEIGHT = 180;

// Target resolution for paused mode (higher quality)
const PAUSED_TARGET_WIDTH = 640;
const PAUSED_TARGET_HEIGHT = 360;

export class WebGLScopesProcessor {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;

  private histogramShader: ShaderProgram | null = null;
  private waveformShader: ShaderProgram | null = null;
  private vectorscopeShader: ShaderProgram | null = null;
  private parallelCompileExt: object | null = null;

  private imageTexture: WebGLTexture | null = null;
  private histogramDataTexture: WebGLTexture | null = null;
  private histogramTextureData: Float32Array; // Cached to avoid allocation per frame
  private textureConfigured = false;
  private vao: WebGLVertexArrayObject | null = null;

  // Canvas for downscaling images before analysis
  private downscaleCanvas: HTMLCanvasElement;
  private downscaleCtx: CanvasRenderingContext2D;
  // Cached source canvas for putImageData (avoids allocation per frame)
  private srcCanvas: HTMLCanvasElement;
  private srcCtx: CanvasRenderingContext2D;

  private isInitialized = false;
  private analysisWidth = 0;
  private analysisHeight = 0;
  private vertexCount = 0;
  private isPlaybackMode = false;

  private lastCanvasWidth = 0;
  private lastCanvasHeight = 0;

  // HDR mode state
  private hdrActive = false;
  private hdrHeadroom: number | null = null;

  // Histogram bar rendering uniforms
  private histogramUniforms!: {
    u_histogramData: WebGLUniformLocation | null;
    u_channel: WebGLUniformLocation | null;
    u_maxValue: WebGLUniformLocation | null;
    u_logScale: WebGLUniformLocation | null;
    u_opacity: WebGLUniformLocation | null;
  };

  private waveformUniforms!: {
    u_image: WebGLUniformLocation | null;
    u_imageSize: WebGLUniformLocation | null;
    u_mode: WebGLUniformLocation | null;
    u_channel: WebGLUniformLocation | null;
    u_opacity: WebGLUniformLocation | null;
    u_waveformMaxValue: WebGLUniformLocation | null;
  };

  private vectorscopeUniforms!: {
    u_image: WebGLUniformLocation | null;
    u_imageSize: WebGLUniformLocation | null;
    u_zoom: WebGLUniformLocation | null;
    u_opacity: WebGLUniformLocation | null;
    u_saturationScale: WebGLUniformLocation | null;
  };

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
      stencil: false,
    });

    if (!gl) {
      throw new Error('WebGL2 not supported');
    }

    this.gl = gl;
    this.parallelCompileExt = gl.getExtension('KHR_parallel_shader_compile');

    // Create downscaling canvas for image preprocessing
    this.downscaleCanvas = document.createElement('canvas');
    this.downscaleCtx = this.downscaleCanvas.getContext('2d', {
      willReadFrequently: true,
    })!;

    // Create source canvas for putImageData (reused to avoid allocation per frame)
    this.srcCanvas = document.createElement('canvas');
    this.srcCtx = this.srcCanvas.getContext('2d')!;

    // Pre-allocate histogram texture data (256 bins x 4 channels)
    this.histogramTextureData = new Float32Array(256 * 4);

    this.init();
  }

  private init(): void {
    const gl = this.gl;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.histogramShader = new ShaderProgram(gl, HISTOGRAM_BAR_VERTEX_SHADER, HISTOGRAM_BAR_FRAGMENT_SHADER, this.parallelCompileExt);
    this.waveformShader = new ShaderProgram(gl, WAVEFORM_VERTEX_SHADER, WAVEFORM_FRAGMENT_SHADER, this.parallelCompileExt);
    this.vectorscopeShader = new ShaderProgram(gl, VECTORSCOPE_VERTEX_SHADER, VECTORSCOPE_FRAGMENT_SHADER, this.parallelCompileExt);

    this.imageTexture = gl.createTexture();
    this.histogramDataTexture = gl.createTexture();

    // Configure histogram data texture (256x1 RGBA for R,G,B,Luma channels)
    gl.bindTexture(gl.TEXTURE_2D, this.histogramDataTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    this.isInitialized = true;
  }

  private histogramUniformsResolved = false;
  private waveformUniformsResolved = false;
  private vectorscopeUniformsResolved = false;

  private resolveHistogramUniforms(): void {
    if (this.histogramUniformsResolved || !this.histogramShader) return;
    this.histogramUniforms = {
      u_histogramData: this.histogramShader.getUniformLocation('u_histogramData'),
      u_channel: this.histogramShader.getUniformLocation('u_channel'),
      u_maxValue: this.histogramShader.getUniformLocation('u_maxValue'),
      u_logScale: this.histogramShader.getUniformLocation('u_logScale'),
      u_opacity: this.histogramShader.getUniformLocation('u_opacity'),
    };
    this.histogramUniformsResolved = true;
  }

  private resolveWaveformUniforms(): void {
    if (this.waveformUniformsResolved || !this.waveformShader) return;
    this.waveformUniforms = {
      u_image: this.waveformShader.getUniformLocation('u_image'),
      u_imageSize: this.waveformShader.getUniformLocation('u_imageSize'),
      u_mode: this.waveformShader.getUniformLocation('u_mode'),
      u_channel: this.waveformShader.getUniformLocation('u_channel'),
      u_opacity: this.waveformShader.getUniformLocation('u_opacity'),
      u_waveformMaxValue: this.waveformShader.getUniformLocation('u_waveformMaxValue'),
    };
    this.waveformUniformsResolved = true;
  }

  private resolveVectorscopeUniforms(): void {
    if (this.vectorscopeUniformsResolved || !this.vectorscopeShader) return;
    this.vectorscopeUniforms = {
      u_image: this.vectorscopeShader.getUniformLocation('u_image'),
      u_imageSize: this.vectorscopeShader.getUniformLocation('u_imageSize'),
      u_zoom: this.vectorscopeShader.getUniformLocation('u_zoom'),
      u_opacity: this.vectorscopeShader.getUniformLocation('u_opacity'),
      u_saturationScale: this.vectorscopeShader.getUniformLocation('u_saturationScale'),
    };
    this.vectorscopeUniformsResolved = true;
  }

  private ensureCanvasSize(width: number, height: number): void {
    if (this.lastCanvasWidth !== width || this.lastCanvasHeight !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.lastCanvasWidth = width;
      this.lastCanvasHeight = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  /**
   * Calculate target analysis dimensions based on source size and playback mode.
   * Returns dimensions that maintain aspect ratio within target limits.
   */
  private calculateAnalysisDimensions(srcWidth: number, srcHeight: number): { width: number; height: number } {
    const targetWidth = this.isPlaybackMode ? PLAYBACK_TARGET_WIDTH : PAUSED_TARGET_WIDTH;
    const targetHeight = this.isPlaybackMode ? PLAYBACK_TARGET_HEIGHT : PAUSED_TARGET_HEIGHT;

    // If source is smaller than target, use source dimensions
    if (srcWidth <= targetWidth && srcHeight <= targetHeight) {
      return { width: srcWidth, height: srcHeight };
    }

    // Scale to fit within target while maintaining aspect ratio
    const scaleX = targetWidth / srcWidth;
    const scaleY = targetHeight / srcHeight;
    const scale = Math.min(scaleX, scaleY);

    return {
      width: Math.max(1, Math.floor(srcWidth * scale)),
      height: Math.max(1, Math.floor(srcHeight * scale)),
    };
  }

  /**
   * Downscale image data using canvas for efficient browser-accelerated scaling.
   */
  private downscaleImage(imageData: ImageData, targetWidth: number, targetHeight: number): ImageData {
    const { width: srcWidth, height: srcHeight } = imageData;

    // If no downscaling needed, return original
    if (srcWidth === targetWidth && srcHeight === targetHeight) {
      return imageData;
    }

    // Set up downscale canvas
    this.downscaleCanvas.width = targetWidth;
    this.downscaleCanvas.height = targetHeight;

    // Resize source canvas if needed and draw image data
    if (this.srcCanvas.width !== srcWidth || this.srcCanvas.height !== srcHeight) {
      this.srcCanvas.width = srcWidth;
      this.srcCanvas.height = srcHeight;
    }
    this.srcCtx.putImageData(imageData, 0, 0);

    // Draw scaled version using browser's hardware-accelerated scaling
    this.downscaleCtx.drawImage(this.srcCanvas, 0, 0, targetWidth, targetHeight);

    return this.downscaleCtx.getImageData(0, 0, targetWidth, targetHeight);
  }

  /**
   * Set playback mode for performance optimization.
   * During playback, downscales image to smaller resolution for faster processing.
   * When paused, uses higher resolution for detailed analysis.
   */
  setPlaybackMode(isPlaying: boolean): void {
    this.isPlaybackMode = isPlaying;
  }

  /**
   * Set HDR mode for scope rendering.
   * When active, scopes extend beyond the [0, 1] range to visualize HDR values.
   *
   * @param active - Whether HDR mode is active
   * @param headroom - Optional HDR headroom (peak / SDR reference). Defaults to 4.0 when active.
   */
  setHDRMode(active: boolean, headroom?: number): void {
    this.hdrActive = active;
    this.hdrHeadroom = headroom ?? null;
  }

  /**
   * Get the effective max value for scope rendering.
   * Returns 1.0 in SDR mode, or the HDR headroom (default 4.0) in HDR mode.
   */
  getMaxValue(): number {
    return this.hdrActive ? (this.hdrHeadroom ?? 4.0) : 1.0;
  }

  private bindResources(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
  }

  isReady(): boolean {
    return this.isInitialized
        && (this.histogramShader?.isReady() ?? false)
        && (this.waveformShader?.isReady() ?? false)
        && (this.vectorscopeShader?.isReady() ?? false);
  }

  setImage(imageData: ImageData): void {
    if (!this.isInitialized) return;

    const gl = this.gl;
    const { width, height } = imageData;

    // Calculate analysis dimensions and downscale if needed
    const targetDims = this.calculateAnalysisDimensions(width, height);
    const analysisData = this.downscaleImage(imageData, targetDims.width, targetDims.height);

    this.analysisWidth = analysisData.width;
    this.analysisHeight = analysisData.height;
    this.vertexCount = this.analysisWidth * this.analysisHeight;

    // Upload (potentially downscaled) image to texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, analysisData);

    if (!this.textureConfigured) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.textureConfigured = true;
    }
  }

  /**
   * Upload float pixel data (RGBA Float32Array) as an RGBA16F texture.
   *
   * This preserves HDR values > 1.0 that would be clipped by the UNSIGNED_BYTE
   * path in setImage(). The waveform and vectorscope shaders already handle
   * values > 1.0 via u_waveformMaxValue and u_saturationScale uniforms.
   *
   * If the source data is larger than the target analysis resolution,
   * a CPU box-filter downscale is applied (canvas drawImage clips to Uint8).
   *
   * @param data RGBA Float32Array in top-to-bottom row order
   * @param width Source width
   * @param height Source height
   */
  setFloatImage(data: Float32Array, width: number, height: number): void {
    if (!this.isInitialized) return;

    const gl = this.gl;

    // Calculate analysis dimensions and downscale if needed
    const targetDims = this.calculateAnalysisDimensions(width, height);

    let uploadData = data;
    let uploadWidth = width;
    let uploadHeight = height;

    if (targetDims.width !== width || targetDims.height !== height) {
      // CPU box-filter downscale for float data (canvas drawImage clips to Uint8)
      uploadData = this.downscaleFloatData(data, width, height, targetDims.width, targetDims.height);
      uploadWidth = targetDims.width;
      uploadHeight = targetDims.height;
    }

    this.analysisWidth = uploadWidth;
    this.analysisHeight = uploadHeight;
    this.vertexCount = this.analysisWidth * this.analysisHeight;

    // Upload float data as RGBA16F texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA16F,
      uploadWidth, uploadHeight, 0,
      gl.RGBA, gl.FLOAT, uploadData,
    );

    if (!this.textureConfigured) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.textureConfigured = true;
    }
  }

  /**
   * CPU box-filter downscale for Float32Array RGBA data.
   * Used instead of canvas drawImage which clips values to [0, 1] Uint8.
   */
  private downscaleFloatData(
    src: Float32Array,
    srcWidth: number,
    srcHeight: number,
    dstWidth: number,
    dstHeight: number,
  ): Float32Array {
    const dst = new Float32Array(dstWidth * dstHeight * 4);
    const scaleX = srcWidth / dstWidth;
    const scaleY = srcHeight / dstHeight;

    for (let dy = 0; dy < dstHeight; dy++) {
      const srcY0 = Math.floor(dy * scaleY);
      const srcY1 = Math.min(Math.floor((dy + 1) * scaleY), srcHeight);
      for (let dx = 0; dx < dstWidth; dx++) {
        const srcX0 = Math.floor(dx * scaleX);
        const srcX1 = Math.min(Math.floor((dx + 1) * scaleX), srcWidth);

        let r = 0, g = 0, b = 0, a = 0;
        let count = 0;
        for (let sy = srcY0; sy < srcY1; sy++) {
          for (let sx = srcX0; sx < srcX1; sx++) {
            const si = (sy * srcWidth + sx) * 4;
            r += src[si]!;
            g += src[si + 1]!;
            b += src[si + 2]!;
            a += src[si + 3]!;
            count++;
          }
        }

        if (count > 0) {
          const di = (dy * dstWidth + dx) * 4;
          dst[di] = r / count;
          dst[di + 1] = g / count;
          dst[di + 2] = b / count;
          dst[di + 3] = a / count;
        }
      }
    }

    return dst;
  }

  /**
   * Render histogram bars from pre-computed histogram data.
   * @param outputCanvas Target canvas to render to
   * @param histogramData Object with red, green, blue, luminance Uint32Arrays (256 bins each) and maxValue
   * @param mode 'rgb' | 'luminance' | 'separate'
   * @param logScale Whether to use logarithmic scale
   */
  renderHistogram(
    outputCanvas: HTMLCanvasElement,
    histogramData: {
      red: Uint32Array;
      green: Uint32Array;
      blue: Uint32Array;
      luminance: Uint32Array;
      maxValue: number;
    },
    mode: 'rgb' | 'luminance' | 'separate' = 'rgb',
    logScale: boolean = false
  ): void {
    if (!this.isInitialized || !this.histogramShader?.isReady() || !this.histogramDataTexture) return;
    this.resolveHistogramUniforms();
    if (histogramData.maxValue === 0) return;

    const gl = this.gl;
    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) return;

    const width = outputCanvas.width;
    const height = outputCanvas.height;

    this.ensureCanvasSize(width, height);
    gl.bindVertexArray(this.vao);

    // Pack histogram data into cached texture array: R=red, G=green, B=blue, A=luminance
    const textureData = this.histogramTextureData;
    for (let i = 0; i < 256; i++) {
      textureData[i * 4] = histogramData.red[i]!;
      textureData[i * 4 + 1] = histogramData.green[i]!;
      textureData[i * 4 + 2] = histogramData.blue[i]!;
      textureData[i * 4 + 3] = histogramData.luminance[i]!;
    }

    // Upload histogram data to texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.histogramDataTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 256, 1, 0, gl.RGBA, gl.FLOAT, textureData);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.histogramShader!.use();
    gl.uniform1i(this.histogramUniforms.u_histogramData!, 0);
    gl.uniform1f(this.histogramUniforms.u_maxValue!, histogramData.maxValue);
    gl.uniform1i(this.histogramUniforms.u_logScale!, logScale ? 1 : 0);

    const barVertexCount = 256 * 6; // 6 vertices per bar

    if (mode === 'rgb') {
      // RGB mode: use additive blending like CPU's 'lighter' composite operation
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.uniform1f(this.histogramUniforms.u_opacity!, 0.5); // Match CPU opacity

      gl.uniform1i(this.histogramUniforms.u_channel!, 0); // Red
      gl.drawArrays(gl.TRIANGLES, 0, barVertexCount);

      gl.uniform1i(this.histogramUniforms.u_channel!, 1); // Green
      gl.drawArrays(gl.TRIANGLES, 0, barVertexCount);

      gl.uniform1i(this.histogramUniforms.u_channel!, 2); // Blue
      gl.drawArrays(gl.TRIANGLES, 0, barVertexCount);
    } else if (mode === 'luminance') {
      // Luminance mode: standard alpha blending
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(this.histogramUniforms.u_opacity!, 0.8);
      gl.uniform1i(this.histogramUniforms.u_channel!, 3); // Luma
      gl.drawArrays(gl.TRIANGLES, 0, barVertexCount);
    }
    // Note: 'separate' mode is not supported in GPU rendering, falls back to CPU

    // Restore additive blending for waveform/vectorscope
    gl.blendFunc(gl.ONE, gl.ONE);

    // Reset transform before drawImage: the output context may have a hi-DPI
    // scale(dpr, dpr) applied by setupHiDPICanvas. Drawing without resetting
    // would scale the already-physical-sized WebGL canvas by dpr again.
    outputCtx.save();
    outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    outputCtx.drawImage(this.canvas, 0, 0);
    outputCtx.restore();
  }

  renderWaveform(
    outputCanvas: HTMLCanvasElement,
    mode: WaveformMode = 'luma',
    options?: WaveformRenderOptions,
  ): void {
    if (!this.isInitialized || !this.waveformShader?.isReady() || this.vertexCount === 0) return;
    this.resolveWaveformUniforms();

    const gl = this.gl;
    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) return;

    const width = outputCanvas.width;
    const height = outputCanvas.height;

    this.ensureCanvasSize(width, height);
    this.bindResources();

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.waveformShader!.use();
    gl.uniform1i(this.waveformUniforms.u_image!, 0);
    gl.uniform2f(this.waveformUniforms.u_imageSize!, this.analysisWidth, this.analysisHeight);
    const requestedIntensity = options?.intensity;
    const waveformOpacity = typeof requestedIntensity === 'number' && Number.isFinite(requestedIntensity)
      ? Math.max(0, Math.min(1, requestedIntensity))
      : 0.08;
    // Opacity tuned to match CPU rendering brightness
    gl.uniform1f(this.waveformUniforms.u_opacity!, mode === 'rgb' ? waveformOpacity : 0.08);
    // HDR: scale Y-axis to [0, maxValue] instead of [0, 1]
    gl.uniform1f(this.waveformUniforms.u_waveformMaxValue!, this.getMaxValue());

    if (mode === 'luma') {
      gl.uniform1i(this.waveformUniforms.u_mode!, 0);
      gl.uniform1i(this.waveformUniforms.u_channel!, 0);
      gl.drawArrays(gl.POINTS, 0, this.vertexCount);
    } else if (mode === 'rgb') {
      const channels = options?.channels ?? { r: true, g: true, b: true };
      gl.uniform1i(this.waveformUniforms.u_mode!, 1);
      const enabledByChannel = [channels.r, channels.g, channels.b];
      for (let ch = 0; ch < enabledByChannel.length; ch++) {
        if (!enabledByChannel[ch]) continue;
        gl.uniform1i(this.waveformUniforms.u_channel!, ch);
        gl.drawArrays(gl.POINTS, 0, this.vertexCount);
      }
    } else if (mode === 'parade') {
      gl.uniform1i(this.waveformUniforms.u_mode!, 2);
      for (let ch = 0; ch < 3; ch++) {
        gl.uniform1i(this.waveformUniforms.u_channel!, ch);
        gl.drawArrays(gl.POINTS, 0, this.vertexCount);
      }
    } else if (mode === 'ycbcr') {
      gl.uniform1i(this.waveformUniforms.u_mode!, 3);
      for (let ch = 0; ch < 3; ch++) {
        gl.uniform1i(this.waveformUniforms.u_channel!, ch);
        gl.drawArrays(gl.POINTS, 0, this.vertexCount);
      }
    }

    // Reset transform before drawImage: the output context may have a hi-DPI
    // scale(dpr, dpr) applied by setupHiDPICanvas.
    outputCtx.save();
    outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    outputCtx.drawImage(this.canvas, 0, 0);
    outputCtx.restore();
  }

  renderVectorscope(
    outputCanvas: HTMLCanvasElement,
    zoom: number = 1
  ): void {
    if (!this.isInitialized || !this.vectorscopeShader?.isReady() || this.vertexCount === 0) return;
    this.resolveVectorscopeUniforms();

    const gl = this.gl;
    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) return;

    const size = outputCanvas.width;

    this.ensureCanvasSize(size, size);
    this.bindResources();

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.vectorscopeShader!.use();
    gl.uniform1i(this.vectorscopeUniforms.u_image!, 0);
    gl.uniform2f(this.vectorscopeUniforms.u_imageSize!, this.analysisWidth, this.analysisHeight);
    gl.uniform1f(this.vectorscopeUniforms.u_zoom!, zoom);
    // Opacity tuned to match CPU rendering brightness
    gl.uniform1f(this.vectorscopeUniforms.u_opacity!, 0.15);
    // HDR: adjust saturation scale for wider gamuts (P3/Rec.2020 have larger Cb/Cr extents)
    // In SDR mode (maxValue=1.0) this is 1.0 and has no effect
    const saturationScale = this.hdrActive ? 1.0 / this.getMaxValue() : 1.0;
    gl.uniform1f(this.vectorscopeUniforms.u_saturationScale!, saturationScale);

    gl.drawArrays(gl.POINTS, 0, this.vertexCount);

    // Reset transform before drawImage: the output context may have a hi-DPI
    // scale(dpr, dpr) applied by setupHiDPICanvas.
    outputCtx.save();
    outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    outputCtx.drawImage(this.canvas, 0, 0);
    outputCtx.restore();
  }

  dispose(): void {
    const gl = this.gl;

    // Delete ShaderPrograms
    this.histogramShader?.dispose();
    this.waveformShader?.dispose();
    this.vectorscopeShader?.dispose();

    // Delete textures
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    if (this.histogramDataTexture) gl.deleteTexture(this.histogramDataTexture);
    if (this.vao) gl.deleteVertexArray(this.vao);

    // Null out references
    this.histogramShader = null;
    this.waveformShader = null;
    this.vectorscopeShader = null;
    this.imageTexture = null;
    this.histogramDataTexture = null;
    this.vao = null;
    this.textureConfigured = false;
    this.histogramUniformsResolved = false;
    this.waveformUniformsResolved = false;
    this.vectorscopeUniformsResolved = false;

    // Clean up helper canvases to free memory
    this.downscaleCanvas.width = 0;
    this.downscaleCanvas.height = 0;
    this.srcCanvas.width = 0;
    this.srcCanvas.height = 0;

    // Lose WebGL context to free GPU resources
    const loseContext = gl.getExtension('WEBGL_lose_context');
    if (loseContext) {
      loseContext.loseContext();
    }

    // Clean up main canvas
    this.canvas.width = 0;
    this.canvas.height = 0;

    this.isInitialized = false;
  }
}

let sharedProcessor: WebGLScopesProcessor | null = null;

// Cached HDR mode state: allows callers to set HDR mode before the processor
// is created (deferred creation). The cached values are applied when
// getSharedScopesProcessor() first instantiates the processor.
let cachedHDRActive: boolean = false;
let cachedHDRHeadroom: number | null = null;

/**
 * Set HDR mode for the shared scopes processor.
 * If the processor already exists, the mode is applied immediately.
 * Otherwise the values are cached and applied when the processor is created.
 */
export function setScopesHDRMode(active: boolean, headroom?: number): void {
  cachedHDRActive = active;
  cachedHDRHeadroom = headroom ?? null;
  // If processor already exists, apply immediately
  if (sharedProcessor) {
    sharedProcessor.setHDRMode(active, headroom);
  }
}

export function getSharedScopesProcessor(): WebGLScopesProcessor | null {
  if (!sharedProcessor) {
    try {
      sharedProcessor = new WebGLScopesProcessor();
    } catch (e) {
      console.warn('WebGL scopes processor not available:', e);
      return null;
    }
    // Apply cached HDR state to the newly created processor
    if (sharedProcessor) {
      sharedProcessor.setHDRMode(cachedHDRActive, cachedHDRHeadroom ?? undefined);
    }
  }
  return sharedProcessor;
}

export function disposeSharedScopesProcessor(): void {
  if (sharedProcessor) {
    sharedProcessor.dispose();
    sharedProcessor = null;
  }
}
