/**
 * OCIOShaderTranslator — GLSL 1.x → GLSL ES 300 es translation
 *
 * OpenColorIO generates GLSL 1.x / 1.30 shader code for its GPU processing
 * pipeline. WebGL2 requires GLSL ES 300 es (based on GLSL 3.30). This module
 * translates the OCIO-generated shader fragments so they can be compiled and
 * linked in a WebGL2 context.
 *
 * Key differences handled:
 * - Version directive: #version 130 → #version 300 es
 * - Precision qualifiers: insert mediump/highp
 * - texture2D/texture3D → texture()
 * - varying → in (fragment shader)
 * - gl_FragColor → explicit out variable
 * - sampler types (sampler2D/sampler3D are the same, but usage differs)
 *
 * Also provides utilities to inject the OCIO function into the existing
 * openrv-web monolithic fragment shader pipeline.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the shader translation */
export interface ShaderTranslateOptions {
  /** Precision qualifier for float types. Default: 'highp' */
  floatPrecision?: 'mediump' | 'highp';
  /** Name of the OCIO function to wrap. Default: 'OCIODisplay' */
  functionName?: string;
  /** Whether to generate a standalone fragment shader (true) or a function snippet (false).
   *  Default: false (function snippet for embedding in existing shader) */
  standalone?: boolean;
}

/** Result of shader translation */
export interface TranslatedShader {
  /** The translated GLSL ES 300 es code */
  code: string;
  /** Uniform declarations extracted from the OCIO shader */
  uniforms: UniformInfo[];
  /** The OCIO function name (entry point) */
  functionName: string;
  /** Whether a 3D LUT texture is required */
  requires3DLUT: boolean;
  /** The recommended 3D LUT size (cube edge length) */
  lut3dSize: number;
}

/** Information about a uniform declared in the OCIO shader */
export interface UniformInfo {
  /** Uniform name */
  name: string;
  /** GLSL type (float, vec3, vec4, sampler2D, sampler3D, etc.) */
  type: string;
  /** Whether this is a sampler/texture uniform */
  isSampler: boolean;
}

// ---------------------------------------------------------------------------
// Translator
// ---------------------------------------------------------------------------

/**
 * Translate OCIO-generated GLSL code to GLSL ES 300 es.
 *
 * @param ocioGLSL - Raw GLSL code from OCIO's GPU shader generation
 * @param options - Translation options
 * @returns Translated shader with metadata
 */
export function translateOCIOShader(
  ocioGLSL: string,
  options: ShaderTranslateOptions = {},
): TranslatedShader {
  const {
    floatPrecision = 'highp',
    functionName = 'OCIODisplay',
    standalone = false,
  } = options;

  let code = ocioGLSL;

  // 1. Remove existing version directive
  code = code.replace(/^\s*#version\s+\d+(\s+\w+)?\s*$/gm, '');

  // 2. Replace texture lookup functions
  code = code.replace(/\btexture2D\s*\(/g, 'texture(');
  code = code.replace(/\btexture3D\s*\(/g, 'texture(');
  code = code.replace(/\btextureCube\s*\(/g, 'texture(');

  // 3. Replace varying with in (fragment shader input)
  code = code.replace(/\bvarying\s+/g, 'in ');

  // 4. Replace gl_FragColor with out variable (handled in standalone mode)
  // OCIO typically generates function-only code, but handle edge case
  const usesFragColor = code.includes('gl_FragColor');
  if (usesFragColor) {
    code = code.replace(/\bgl_FragColor\b/g, 'fragColor');
  }

  // 5. Replace deprecated built-in GLSL functions
  code = code.replace(/\btexture2DLod\s*\(/g, 'textureLod(');
  code = code.replace(/\btexture3DLod\s*\(/g, 'textureLod(');
  code = code.replace(/\btextureCubeLod\s*\(/g, 'textureLod(');

  // 6. Extract uniforms
  const uniforms = extractUniforms(code);

  // 7. Detect if 3D LUT is required
  const requires3DLUT = uniforms.some(
    u => u.isSampler && u.type === 'sampler3D'
  );

  // 8. Detect/extract the OCIO function name
  const detectedName = detectFunctionName(code) ?? functionName;

  // 9. Rename the function if needed
  if (detectedName !== functionName) {
    // Rename the function declaration and any self-references
    const funcDeclRegex = new RegExp(`\\b${escapeRegex(detectedName)}\\s*\\(`, 'g');
    code = code.replace(funcDeclRegex, `${functionName}(`);
  }

  // 10. Build final output
  let output: string;
  if (standalone) {
    output = buildStandaloneShader(code, floatPrecision, usesFragColor);
  } else {
    output = buildFunctionSnippet(code, floatPrecision);
  }

  return {
    code: output,
    uniforms,
    functionName,
    requires3DLUT,
    lut3dSize: requires3DLUT ? 65 : 0,
  };
}

/**
 * Generate a GLSL ES 300 es function call snippet that can be inserted into
 * the existing openrv-web fragment shader pipeline.
 *
 * The returned code applies the OCIO transform to an `inColor` vec4 and
 * returns the transformed vec4.
 *
 * @param functionName - Name of the OCIO function
 */
export function generateOCIOCallSnippet(functionName: string = 'OCIODisplay'): string {
  return `vec4 applyOCIO(vec4 inColor) {\n` +
         `  return ${functionName}(inColor);\n` +
         `}\n`;
}

/**
 * Inject OCIO uniform declarations into an existing shader.
 * Inserts them after the precision qualifiers and before the first
 * uniform/in/out declaration.
 */
export function injectOCIOUniforms(
  shaderSource: string,
  uniforms: UniformInfo[],
): string {
  if (uniforms.length === 0) return shaderSource;

  const declarations = uniforms.map(u =>
    `uniform ${u.type} ${u.name};`
  ).join('\n');

  const marker = '// --- OCIO uniforms ---';
  const block = `\n${marker}\n${declarations}\n${marker}\n`;

  // Try to insert after the last precision declaration
  const precisionRegex = /^precision\s+\w+\s+\w+;\s*$/gm;
  let lastPrecisionEnd = -1;
  let match: RegExpExecArray | null;
  while ((match = precisionRegex.exec(shaderSource)) !== null) {
    lastPrecisionEnd = match.index + match[0].length;
  }

  if (lastPrecisionEnd >= 0) {
    return shaderSource.slice(0, lastPrecisionEnd) + block + shaderSource.slice(lastPrecisionEnd);
  }

  // Fallback: insert after #version line
  const versionRegex = /^#version\s+.*$/m;
  const versionMatch = versionRegex.exec(shaderSource);
  if (versionMatch) {
    const end = versionMatch.index + versionMatch[0].length;
    return shaderSource.slice(0, end) + block + shaderSource.slice(end);
  }

  // Last resort: prepend
  return block + shaderSource;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractUniforms(code: string): UniformInfo[] {
  const uniforms: UniformInfo[] = [];
  const seen = new Set<string>();
  const regex = /^\s*uniform\s+(\w+)\s+(\w+)\s*;/gm;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(code)) !== null) {
    const type = match[1]!;
    const name = match[2]!;
    if (!seen.has(name)) {
      seen.add(name);
      uniforms.push({
        name,
        type,
        isSampler: type.startsWith('sampler'),
      });
    }
  }

  return uniforms;
}

function detectFunctionName(code: string): string | null {
  // OCIO typically generates a function like: vec4 OCIODisplay(vec4 inPixel)
  const funcRegex = /\bvec4\s+(\w+)\s*\(\s*vec4\s+\w+\s*\)/;
  const match = funcRegex.exec(code);
  return match ? match[1]! : null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildStandaloneShader(
  code: string,
  floatPrecision: string,
  usesFragColor: boolean,
): string {
  let header = `#version 300 es\nprecision ${floatPrecision} float;\nprecision ${floatPrecision} sampler2D;\nprecision ${floatPrecision} sampler3D;\n`;

  if (usesFragColor) {
    header += `out vec4 fragColor;\n`;
  }

  return header + '\n' + code.trim() + '\n';
}

function buildFunctionSnippet(code: string, _floatPrecision: string): string {
  // For embedding, we don't add version/precision — the host shader has those.
  // Just clean up and return the function code with uniform declarations.
  return `// OCIO-generated shader code (translated to GLSL ES 300 es)\n` +
         code.trim() + '\n';
}
