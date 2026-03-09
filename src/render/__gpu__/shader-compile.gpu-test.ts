import { describe, it, expect, afterEach } from 'vitest';
import { createTestGL, compileShader, linkProgram } from './helpers/webgl2';

// Import shader sources via Vite ?raw
import viewerVertSrc from '../shaders/viewer.vert.glsl?raw';
import viewerFragSrc from '../shaders/viewer.frag.glsl?raw';
import passthroughVertSrc from '../shaders/passthrough.vert.glsl?raw';
import compositingFragSrc from '../shaders/compositing.frag.glsl?raw';
import luminanceFragSrc from '../shaders/luminance.frag.glsl?raw';
import transitionVertSrc from '../shaders/transition.vert.glsl?raw';
import transitionFragSrc from '../shaders/transition.frag.glsl?raw';

describe('GLSL Shader Compilation (real GPU)', () => {
  let gl: WebGL2RenderingContext;

  afterEach(() => {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });

  // ---- Individual compilation tests ----

  describe('vertex shaders compile independently', () => {
    it('viewer.vert.glsl compiles', () => {
      ({ gl } = createTestGL());
      const shader = compileShader(gl, gl.VERTEX_SHADER, viewerVertSrc);
      expect(shader).toBeTruthy();
      gl.deleteShader(shader);
    });

    it('passthrough.vert.glsl compiles', () => {
      ({ gl } = createTestGL());
      const shader = compileShader(gl, gl.VERTEX_SHADER, passthroughVertSrc);
      expect(shader).toBeTruthy();
      gl.deleteShader(shader);
    });

    it('transition.vert.glsl compiles', () => {
      ({ gl } = createTestGL());
      const shader = compileShader(gl, gl.VERTEX_SHADER, transitionVertSrc);
      expect(shader).toBeTruthy();
      gl.deleteShader(shader);
    });
  });

  describe('fragment shaders compile independently', () => {
    it('viewer.frag.glsl compiles', () => {
      ({ gl } = createTestGL());
      const shader = compileShader(gl, gl.FRAGMENT_SHADER, viewerFragSrc);
      expect(shader).toBeTruthy();
      gl.deleteShader(shader);
    });

    it('compositing.frag.glsl compiles', () => {
      ({ gl } = createTestGL());
      const shader = compileShader(gl, gl.FRAGMENT_SHADER, compositingFragSrc);
      expect(shader).toBeTruthy();
      gl.deleteShader(shader);
    });

    it('luminance.frag.glsl compiles', () => {
      ({ gl } = createTestGL());
      const shader = compileShader(gl, gl.FRAGMENT_SHADER, luminanceFragSrc);
      expect(shader).toBeTruthy();
      gl.deleteShader(shader);
    });

    it('transition.frag.glsl compiles', () => {
      ({ gl } = createTestGL());
      const shader = compileShader(gl, gl.FRAGMENT_SHADER, transitionFragSrc);
      expect(shader).toBeTruthy();
      gl.deleteShader(shader);
    });
  });

  // ---- Shader pair link tests ----

  describe('shader pairs link successfully', () => {
    it('viewer pipeline: viewer.vert + viewer.frag', () => {
      ({ gl } = createTestGL());
      const vert = compileShader(gl, gl.VERTEX_SHADER, viewerVertSrc);
      const frag = compileShader(gl, gl.FRAGMENT_SHADER, viewerFragSrc);
      const program = linkProgram(gl, vert, frag);
      expect(program).toBeTruthy();
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
    });

    it('compositing pipeline: passthrough.vert + compositing.frag', () => {
      ({ gl } = createTestGL());
      const vert = compileShader(gl, gl.VERTEX_SHADER, passthroughVertSrc);
      const frag = compileShader(gl, gl.FRAGMENT_SHADER, compositingFragSrc);
      const program = linkProgram(gl, vert, frag);
      expect(program).toBeTruthy();
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
    });

    it('luminance pipeline: passthrough.vert + luminance.frag', () => {
      ({ gl } = createTestGL());
      const vert = compileShader(gl, gl.VERTEX_SHADER, passthroughVertSrc);
      const frag = compileShader(gl, gl.FRAGMENT_SHADER, luminanceFragSrc);
      const program = linkProgram(gl, vert, frag);
      expect(program).toBeTruthy();
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
    });

    it('transition pipeline: transition.vert + transition.frag', () => {
      ({ gl } = createTestGL());
      const vert = compileShader(gl, gl.VERTEX_SHADER, transitionVertSrc);
      const frag = compileShader(gl, gl.FRAGMENT_SHADER, transitionFragSrc);
      const program = linkProgram(gl, vert, frag);
      expect(program).toBeTruthy();
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
    });
  });
});
