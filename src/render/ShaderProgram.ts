type UniformValue = number | number[] | Float32Array | Int32Array;

export class ShaderProgram {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniformLocations = new Map<string, WebGLUniformLocation | null>();
  private attributeLocations = new Map<string, number>();

  constructor(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
    this.gl = gl;

    const vertShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertShader);
    gl.attachShader(this.program, fragShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(this.program);
      gl.deleteProgram(this.program);
      throw new Error(`Shader program link error: ${error}`);
    }

    // Clean up shaders after linking
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);
  }

  private compileShader(type: number, source: string): WebGLShader {
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

  use(): void {
    this.gl.useProgram(this.program);
  }

  getUniformLocation(name: string): WebGLUniformLocation | null {
    if (!this.uniformLocations.has(name)) {
      const location = this.gl.getUniformLocation(this.program, name);
      this.uniformLocations.set(name, location);
    }
    return this.uniformLocations.get(name) ?? null;
  }

  getAttributeLocation(name: string): number {
    if (!this.attributeLocations.has(name)) {
      const location = this.gl.getAttribLocation(this.program, name);
      this.attributeLocations.set(name, location);
    }
    return this.attributeLocations.get(name) ?? -1;
  }

  setUniform(name: string, value: UniformValue): void {
    const location = this.getUniformLocation(name);
    if (location === null) return;

    const gl = this.gl;

    if (typeof value === 'number') {
      // Check if integer or float based on name convention or value
      if (Number.isInteger(value) && (name.startsWith('u_') && name.includes('texture') || name.includes('sampler'))) {
        gl.uniform1i(location, value);
      } else {
        gl.uniform1f(location, value);
      }
    } else if (Array.isArray(value) || value instanceof Float32Array) {
      const arr = value instanceof Float32Array ? value : new Float32Array(value);
      switch (arr.length) {
        case 1:
          gl.uniform1fv(location, arr);
          break;
        case 2:
          gl.uniform2fv(location, arr);
          break;
        case 3:
          gl.uniform3fv(location, arr);
          break;
        case 4:
          gl.uniform4fv(location, arr);
          break;
        case 9:
          gl.uniformMatrix3fv(location, false, arr);
          break;
        case 16:
          gl.uniformMatrix4fv(location, false, arr);
          break;
        default:
          console.warn(`Unsupported uniform array length: ${arr.length}`);
      }
    } else if (value instanceof Int32Array) {
      switch (value.length) {
        case 1:
          gl.uniform1iv(location, value);
          break;
        case 2:
          gl.uniform2iv(location, value);
          break;
        case 3:
          gl.uniform3iv(location, value);
          break;
        case 4:
          gl.uniform4iv(location, value);
          break;
        default:
          console.warn(`Unsupported uniform array length: ${value.length}`);
      }
    }
  }

  setUniformInt(name: string, value: number): void {
    const location = this.getUniformLocation(name);
    if (location !== null) {
      this.gl.uniform1i(location, value);
    }
  }

  setUniformMatrix4(name: string, value: Float32Array | number[]): void {
    const location = this.getUniformLocation(name);
    if (location !== null) {
      const arr = value instanceof Float32Array ? value : new Float32Array(value);
      this.gl.uniformMatrix4fv(location, false, arr);
    }
  }

  setUniformMatrix3(name: string, value: Float32Array | number[]): void {
    const location = this.getUniformLocation(name);
    if (location !== null) {
      const arr = value instanceof Float32Array ? value : new Float32Array(value);
      this.gl.uniformMatrix3fv(location, false, arr);
    }
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
    this.uniformLocations.clear();
    this.attributeLocations.clear();
  }
}
