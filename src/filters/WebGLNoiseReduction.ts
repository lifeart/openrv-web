/**
 * WebGLNoiseReduction - GPU-accelerated bilateral filter for noise reduction
 *
 * Uses WebGL2 for real-time edge-preserving noise reduction.
 */

import { NoiseReductionParams, applyNoiseReduction } from './NoiseReduction';

// Maximum radius supported by the bilateral filter kernel
// This is hardcoded in the shader loop bounds for GPU efficiency
const MAX_FILTER_RADIUS = 5;

const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform float u_strength;        // 0-1 blend factor
uniform float u_rangeSigma;      // Range sigma for bilateral filter
uniform int u_radius;            // Kernel radius (1-5)
uniform vec2 u_resolution;       // Image dimensions

in vec2 v_texCoord;
out vec4 fragColor;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec4 center = texture(u_image, v_texCoord);

  // Early exit if no strength
  if (u_strength < 0.001) {
    fragColor = center;
    return;
  }

  float centerLuma = luminance(center.rgb);

  vec3 sum = vec3(0.0);
  float weightSum = 0.0;

  float spatialSigma = float(u_radius) / 2.0;
  float spatialSigmaSq2 = 2.0 * spatialSigma * spatialSigma;
  float rangeSigmaSq2 = 2.0 * u_rangeSigma * u_rangeSigma;

  // Bilateral filter kernel
  // Loop bounds are hardcoded to MAX_RADIUS=5 for GPU efficiency
  // The actual radius is controlled by u_radius uniform (1-5)
  for (int dy = -5; dy <= 5; dy++) {
    if (abs(dy) > u_radius) continue;

    for (int dx = -5; dx <= 5; dx++) {
      if (abs(dx) > u_radius) continue;

      vec2 offset = vec2(float(dx), float(dy)) / u_resolution;
      vec4 neighbor = texture(u_image, v_texCoord + offset);

      // Spatial weight (Gaussian based on distance)
      float dist = length(vec2(float(dx), float(dy)));
      float spatialW = exp(-(dist * dist) / spatialSigmaSq2);

      // Range weight (Gaussian based on luminance difference)
      float lumaDiff = abs(centerLuma - luminance(neighbor.rgb));
      float rangeW = exp(-(lumaDiff * lumaDiff) / rangeSigmaSq2);

      float weight = spatialW * rangeW;
      sum += neighbor.rgb * weight;
      weightSum += weight;
    }
  }

  vec3 filtered = sum / weightSum;

  // Blend between original and filtered based on strength
  vec3 result = mix(center.rgb, filtered, u_strength);

  fragColor = vec4(result, center.a);
}`;

export class WebGLNoiseReductionProcessor {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private positionBuffer: WebGLBuffer;
  private texCoordBuffer: WebGLBuffer;
  private sourceTexture: WebGLTexture;
  private framebuffer: WebGLFramebuffer;
  private outputTexture: WebGLTexture;
  private uniforms: {
    image: WebGLUniformLocation;
    strength: WebGLUniformLocation;
    rangeSigma: WebGLUniformLocation;
    radius: WebGLUniformLocation;
    resolution: WebGLUniformLocation;
  };
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });

    if (!gl) {
      throw new Error('WebGL2 not supported');
    }

    this.gl = gl;

    // Create shader program
    this.program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);

    // Get uniform locations
    this.uniforms = {
      image: gl.getUniformLocation(this.program, 'u_image')!,
      strength: gl.getUniformLocation(this.program, 'u_strength')!,
      rangeSigma: gl.getUniformLocation(this.program, 'u_rangeSigma')!,
      radius: gl.getUniformLocation(this.program, 'u_radius')!,
      resolution: gl.getUniformLocation(this.program, 'u_resolution')!,
    };

    // Create buffers
    this.positionBuffer = this.createPositionBuffer();
    this.texCoordBuffer = this.createTexCoordBuffer();

    // Create textures and framebuffer
    this.sourceTexture = this.createTexture();
    this.outputTexture = this.createTexture();
    this.framebuffer = gl.createFramebuffer()!;
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${error}`);
    }

    return shader;
  }

  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    const gl = this.gl;
    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program link error: ${error}`);
    }

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return program;
  }

  private createPositionBuffer(): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]),
      gl.STATIC_DRAW
    );
    return buffer;
  }

  private createTexCoordBuffer(): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        0, 1,
        1, 0,
        1, 1,
      ]),
      gl.STATIC_DRAW
    );
    return buffer;
  }

  private createTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  /**
   * Process an ImageData with noise reduction
   */
  process(imageData: ImageData, params: NoiseReductionParams): ImageData {
    const gl = this.gl;
    const { width, height, data } = imageData;

    // Skip processing if strength is 0
    if (params.strength === 0) {
      return imageData;
    }

    // Resize if needed
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      gl.canvas.width = width;
      gl.canvas.height = height;
      gl.viewport(0, 0, width, height);

      // Resize output texture
      gl.bindTexture(gl.TEXTURE_2D, this.outputTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    // Upload source image
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);

    // Bind framebuffer for output
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.outputTexture, 0);

    // Use program
    gl.useProgram(this.program);

    // Set uniforms
    // Clamp radius to MAX_FILTER_RADIUS (hardcoded shader loop bounds)
    const clampedRadius = Math.min(params.radius, MAX_FILTER_RADIUS);
    gl.uniform1i(this.uniforms.image, 0);
    gl.uniform1f(this.uniforms.strength, params.strength / 100);
    gl.uniform1f(this.uniforms.rangeSigma, (100 - params.luminanceStrength) * 0.5 + 5);
    gl.uniform1i(this.uniforms.radius, clampedRadius);
    gl.uniform2f(this.uniforms.resolution, width, height);

    // Bind source texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);

    // Set up attributes
    const positionLocation = gl.getAttribLocation(this.program, 'a_position');
    const texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Read result
    const result = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, result);

    // Unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return new ImageData(result, width, height);
  }

  /**
   * Process in-place (modifies the input ImageData)
   */
  processInPlace(imageData: ImageData, params: NoiseReductionParams): void {
    if (params.strength === 0) return;

    const result = this.process(imageData, params);
    imageData.data.set(result.data);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.texCoordBuffer);
    gl.deleteTexture(this.sourceTexture);
    gl.deleteTexture(this.outputTexture);
    gl.deleteFramebuffer(this.framebuffer);
  }
}

/**
 * Create a WebGL noise reduction processor with fallback to CPU
 */
export function createNoiseReductionProcessor(): {
  process: (imageData: ImageData, params: NoiseReductionParams) => ImageData;
  processInPlace: (imageData: ImageData, params: NoiseReductionParams) => void;
  dispose: () => void;
  isGPU: boolean;
} {
  try {
    const canvas = document.createElement('canvas');
    const processor = new WebGLNoiseReductionProcessor(canvas);
    return {
      process: (imageData, params) => processor.process(imageData, params),
      processInPlace: (imageData, params) => processor.processInPlace(imageData, params),
      dispose: () => processor.dispose(),
      isGPU: true,
    };
  } catch {
    // Fallback to CPU implementation
    return {
      process: (imageData: ImageData, params: NoiseReductionParams) => {
        const copy = new ImageData(
          new Uint8ClampedArray(imageData.data),
          imageData.width,
          imageData.height
        );
        applyNoiseReduction(copy, params);
        return copy;
      },
      processInPlace: (imageData: ImageData, params: NoiseReductionParams) => {
        applyNoiseReduction(imageData, params);
      },
      dispose: () => {},
      isGPU: false,
    };
  }
}
