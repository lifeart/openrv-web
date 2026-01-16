import { IPImage, DataType } from '../core/image/Image';
import { ShaderProgram } from './ShaderProgram';

export class Renderer {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;

  // Shaders
  private displayShader: ShaderProgram | null = null;

  // Quad geometry
  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadVBO: WebGLBuffer | null = null;

  // Current texture
  private currentTexture: WebGLTexture | null = null;

  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;

    const gl = canvas.getContext('webgl2', {
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
      uniform float u_gamma;

      void main() {
        vec4 color = texture(u_texture, v_texCoord);
        // Simple sRGB approximation
        color.rgb = pow(color.rgb, vec3(1.0 / u_gamma));
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
    this.displayShader.setUniform('u_gamma', 2.2);
    this.displayShader.setUniform('u_texture', 0);

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, image.texture);

    // Draw quad
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
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

    // Determine format based on image properties
    const { internalFormat, format, type } = this.getTextureFormat(image.dataType, image.channels);

    // Upload data
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

  createTexture(): WebGLTexture | null {
    return this.gl?.createTexture() ?? null;
  }

  deleteTexture(texture: WebGLTexture): void {
    this.gl?.deleteTexture(texture);
  }

  getContext(): WebGL2RenderingContext | null {
    return this.gl;
  }

  dispose(): void {
    if (!this.gl) return;

    const gl = this.gl;

    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
    if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
    if (this.displayShader) this.displayShader.dispose();
    if (this.currentTexture) gl.deleteTexture(this.currentTexture);

    this.gl = null;
    this.canvas = null;
  }
}
