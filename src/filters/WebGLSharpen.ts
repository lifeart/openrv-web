/**
 * WebGL-based Sharpen Filter
 *
 * Uses GPU acceleration for fast 3x3 unsharp mask convolution.
 * Significantly faster than CPU-based sharpen for large images.
 */

// Vertex shader - simple fullscreen quad
const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// Fragment shader - applies 3x3 unsharp mask convolution
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform float u_amount;
uniform vec2 u_texelSize;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  // Sample the center pixel
  vec4 center = texture(u_image, v_texCoord);

  // Early exit if no sharpening
  if (u_amount <= 0.0) {
    fragColor = center;
    return;
  }

  // 3x3 unsharp mask kernel:
  //  0  -1   0
  // -1   5  -1
  //  0  -1   0

  // Sample neighboring pixels
  vec4 top = texture(u_image, v_texCoord + vec2(0.0, -u_texelSize.y));
  vec4 bottom = texture(u_image, v_texCoord + vec2(0.0, u_texelSize.y));
  vec4 left = texture(u_image, v_texCoord + vec2(-u_texelSize.x, 0.0));
  vec4 right = texture(u_image, v_texCoord + vec2(u_texelSize.x, 0.0));

  // Apply kernel: center * 5 - (top + bottom + left + right)
  vec3 sharpened = center.rgb * 5.0 - (top.rgb + bottom.rgb + left.rgb + right.rgb);

  // Only clamp negative (no upper bound) to preserve HDR range
  sharpened = max(sharpened, 0.0);

  // Blend between original and sharpened based on amount
  vec3 finalColor = mix(center.rgb, sharpened, u_amount);

  fragColor = vec4(finalColor, center.a);
}
`;

export class WebGLSharpenProcessor {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private imageTexture: WebGLTexture | null = null;

  private isInitialized = false;

  // Uniform locations
  private uImage: WebGLUniformLocation | null = null;
  private uAmount: WebGLUniformLocation | null = null;
  private uTexelSize: WebGLUniformLocation | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      throw new Error('WebGL2 not supported');
    }

    this.gl = gl;
    this.init();
  }

  private init(): void {
    const gl = this.gl;

    // Create shader program
    const vertexShader = this.createShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) {
      console.error('Failed to create shaders');
      return;
    }

    this.program = gl.createProgram();
    if (!this.program) return;

    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Shader program link error:', gl.getProgramInfoLog(this.program));
      return;
    }

    // Get attribute locations
    const aPosition = gl.getAttribLocation(this.program, 'a_position');
    const aTexCoord = gl.getAttribLocation(this.program, 'a_texCoord');

    // Get uniform locations
    this.uImage = gl.getUniformLocation(this.program, 'u_image');
    this.uAmount = gl.getUniformLocation(this.program, 'u_amount');
    this.uTexelSize = gl.getUniformLocation(this.program, 'u_texelSize');

    // Create position buffer (fullscreen quad)
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]), gl.STATIC_DRAW);

    // Create texture coordinate buffer
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      1, 1,
    ]), gl.STATIC_DRAW);

    // Set up VAO-like state (WebGL2)
    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(aTexCoord);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

    // Create image texture
    this.imageTexture = gl.createTexture();

    this.isInitialized = true;
  }

  private createShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Check if the processor is ready to use
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Apply sharpening to ImageData
   * @param imageData Source image data
   * @param amount Sharpen amount (0-100, will be normalized to 0-1)
   * @returns Sharpened image data
   */
  apply(imageData: ImageData, amount: number): ImageData {
    if (!this.isInitialized || amount <= 0) {
      return imageData;
    }

    const gl = this.gl;
    const { width, height } = imageData;

    // Resize canvas if needed
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    // Upload source image
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Use program and set uniforms
    gl.useProgram(this.program);
    gl.uniform1i(this.uImage, 0);
    gl.uniform1f(this.uAmount, amount / 100); // Normalize to 0-1
    gl.uniform2f(this.uTexelSize, 1.0 / width, 1.0 / height);

    // Render to canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Read back result
    const output = new ImageData(width, height);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, output.data);

    return output;
  }

  /**
   * Apply sharpening to ImageData in-place
   * @param imageData Image data to sharpen (modified in place)
   * @param amount Sharpen amount (0-100)
   */
  applyInPlace(imageData: ImageData, amount: number): void {
    if (!this.isInitialized || amount <= 0) {
      return;
    }

    const result = this.apply(imageData, amount);
    imageData.data.set(result.data);
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    const gl = this.gl;

    if (this.program) gl.deleteProgram(this.program);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);

    this.isInitialized = false;
  }
}

/**
 * Singleton instance for shared use
 */
let sharedProcessor: WebGLSharpenProcessor | null = null;

export function getSharedSharpenProcessor(): WebGLSharpenProcessor {
  if (!sharedProcessor) {
    sharedProcessor = new WebGLSharpenProcessor();
  }
  return sharedProcessor;
}

export function disposeSharedSharpenProcessor(): void {
  if (sharedProcessor) {
    sharedProcessor.dispose();
    sharedProcessor = null;
  }
}
