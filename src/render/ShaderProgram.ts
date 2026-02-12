import { RenderError } from '../core/errors';
import { Logger } from '../utils/Logger';

const log = new Logger('ShaderProgram');

type UniformValue = number | number[] | Float32Array | Int32Array;

/**
 * The COMPLETION_STATUS_KHR constant used by KHR_parallel_shader_compile.
 * Value: 0x91B1
 */
const COMPLETION_STATUS_KHR = 0x91B1;

/**
 * Interval in milliseconds for polling shader compilation status when using
 * KHR_parallel_shader_compile.
 */
const COMPILE_POLL_INTERVAL_MS = 4;

export class ShaderProgram {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniformLocations = new Map<string, WebGLUniformLocation | null>();
  private attributeLocations = new Map<string, number>();

  /**
   * Whether shader compilation and linking has fully completed.
   * When KHR_parallel_shader_compile is used, this starts as false and
   * becomes true after polling confirms completion. When the extension is
   * not available (synchronous fallback), this is true immediately after
   * construction.
   */
  private _ready: boolean;

  /**
   * Shaders are kept alive until compilation is confirmed complete so they
   * can be checked for errors. Nulled out after finalization.
   */
  private vertShader: WebGLShader | null = null;
  private fragShader: WebGLShader | null = null;

  /**
   * Whether the KHR_parallel_shader_compile extension is being used for
   * this shader program.
   */
  private parallelCompile: boolean;

  /**
   * Create a ShaderProgram.
   *
   * When `parallelCompileExt` is provided (non-null), shaders are compiled
   * and the program is linked without blocking for the result. Call
   * `waitForCompilation()` or poll `isReady()` to know when the program
   * is usable.
   *
   * When `parallelCompileExt` is null or omitted, the constructor blocks
   * until compilation and linking are complete (original behavior).
   */
  constructor(
    gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
    parallelCompileExt: object | null = null,
  ) {
    this.gl = gl;
    this.parallelCompile = parallelCompileExt !== null;

    const vertShader = this.createAndCompileShader(gl.VERTEX_SHADER, vertexSource);
    const fragShader = this.createAndCompileShader(gl.FRAGMENT_SHADER, fragmentSource);

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertShader);
    gl.attachShader(this.program, fragShader);
    gl.linkProgram(this.program);

    if (this.parallelCompile) {
      // Parallel path: keep shaders alive for later error checking.
      // Do NOT query COMPILE_STATUS or LINK_STATUS yet -- that would block.
      this.vertShader = vertShader;
      this.fragShader = fragShader;
      this._ready = false;
      log.info('Shader program created with parallel compilation (KHR_parallel_shader_compile)');
    } else {
      // Synchronous path (original behavior): check status immediately.
      this.checkShaderCompileStatus(vertShader);
      this.checkShaderCompileStatus(fragShader);
      this.checkProgramLinkStatus();

      // Clean up shaders after linking
      gl.deleteShader(vertShader);
      gl.deleteShader(fragShader);
      this.vertShader = null;
      this.fragShader = null;
      this._ready = true;
    }
  }

  /**
   * Create and issue a compile command for a shader, without querying the result.
   */
  private createAndCompileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  /**
   * Check shader compile status. Throws on failure.
   */
  private checkShaderCompileStatus(shader: WebGLShader): void {
    const gl = this.gl;
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new RenderError(`Shader compile error: ${error}`);
    }
  }

  /**
   * Check program link status. Throws on failure.
   */
  private checkProgramLinkStatus(): void {
    const gl = this.gl;
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(this.program);
      gl.deleteProgram(this.program);
      throw new RenderError(`Shader program link error: ${error}`);
    }
  }

  /**
   * Whether the shader program is fully compiled, linked, and ready for use.
   *
   * When KHR_parallel_shader_compile is active, this polls the GPU driver
   * for completion status without blocking. Returns true once all compilation
   * and linking is confirmed done.
   *
   * When the extension is not used (synchronous path), always returns true.
   */
  isReady(): boolean {
    if (this._ready) return true;

    // Poll COMPLETION_STATUS_KHR on both shaders and the program.
    // All three must report complete before we can check for errors.
    const gl = this.gl;

    if (this.vertShader && !gl.getShaderParameter(this.vertShader, COMPLETION_STATUS_KHR)) {
      return false;
    }
    if (this.fragShader && !gl.getShaderParameter(this.fragShader, COMPLETION_STATUS_KHR)) {
      return false;
    }
    if (!gl.getProgramParameter(this.program, COMPLETION_STATUS_KHR)) {
      return false;
    }

    // Compilation and linking are complete. Now check for errors.
    this.finalizeParallelCompilation();
    return this._ready;
  }

  /**
   * Finalize the parallel compilation path: check for compile/link errors
   * and clean up shader objects.
   *
   * Called once after COMPLETION_STATUS_KHR reports true for all objects.
   * Throws a RenderError if compilation or linking failed.
   */
  private finalizeParallelCompilation(): void {
    const gl = this.gl;

    try {
      if (this.vertShader) {
        this.checkShaderCompileStatus(this.vertShader);
      }
      if (this.fragShader) {
        this.checkShaderCompileStatus(this.fragShader);
      }
      this.checkProgramLinkStatus();

      log.info('Parallel shader compilation completed successfully');
    } finally {
      // Clean up shaders regardless of success/failure
      if (this.vertShader) {
        gl.deleteShader(this.vertShader);
        this.vertShader = null;
      }
      if (this.fragShader) {
        gl.deleteShader(this.fragShader);
        this.fragShader = null;
      }
    }

    this._ready = true;
  }

  /**
   * Returns a promise that resolves when the shader program is fully compiled
   * and linked. If already ready, resolves immediately.
   *
   * Uses COMPLETION_STATUS_KHR polling with `setTimeout` to avoid blocking
   * the main thread. Falls through to immediate resolution if the extension
   * is not in use.
   */
  waitForCompilation(): Promise<void> {
    if (this._ready) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const poll = () => {
        try {
          if (this.isReady()) {
            resolve();
          } else {
            setTimeout(poll, COMPILE_POLL_INTERVAL_MS);
          }
        } catch (e) {
          reject(e);
        }
      };
      poll();
    });
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
    const gl = this.gl;
    // Clean up any shaders that were kept alive for parallel compilation
    if (this.vertShader) {
      gl.deleteShader(this.vertShader);
      this.vertShader = null;
    }
    if (this.fragShader) {
      gl.deleteShader(this.fragShader);
      this.fragShader = null;
    }
    gl.deleteProgram(this.program);
    this.uniformLocations.clear();
    this.attributeLocations.clear();
  }
}
