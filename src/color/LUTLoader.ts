/**
 * LUT (Look-Up Table) loader and data structure
 * Supports .cube format (Adobe/Resolve standard)
 */

export interface LUT3D {
  title: string;
  size: number;  // Cube dimension (e.g., 33 for 33x33x33)
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  data: Float32Array;  // Flattened RGB data
}

export interface LUT1D {
  title: string;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  data: Float32Array;  // R, G, B channels
}

export type LUT = LUT3D | LUT1D;

export function isLUT3D(lut: LUT): lut is LUT3D {
  return 'size' in lut && lut.data.length === lut.size * lut.size * lut.size * 3;
}

/**
 * Parse a .cube LUT file
 */
export function parseCubeLUT(content: string): LUT3D {
  const lines = content.split(/\r?\n/);

  let title = 'Untitled LUT';
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const dataLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse header
    if (trimmed.startsWith('TITLE')) {
      const match = trimmed.match(/TITLE\s+"?([^"]+)"?/i);
      if (match) {
        title = match[1]!;
      }
      continue;
    }

    if (trimmed.startsWith('LUT_3D_SIZE')) {
      const match = trimmed.match(/LUT_3D_SIZE\s+(\d+)/i);
      if (match) {
        size = parseInt(match[1]!, 10);
      }
      continue;
    }

    if (trimmed.startsWith('DOMAIN_MIN')) {
      const match = trimmed.match(/DOMAIN_MIN\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/i);
      if (match) {
        domainMin = [parseFloat(match[1]!), parseFloat(match[2]!), parseFloat(match[3]!)];
      }
      continue;
    }

    if (trimmed.startsWith('DOMAIN_MAX')) {
      const match = trimmed.match(/DOMAIN_MAX\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/i);
      if (match) {
        domainMax = [parseFloat(match[1]!), parseFloat(match[2]!), parseFloat(match[3]!)];
      }
      continue;
    }

    // Skip 1D LUT size (we only support 3D for now)
    if (trimmed.startsWith('LUT_1D_SIZE')) {
      throw new Error('1D LUTs are not currently supported');
    }

    // Data line - three floats separated by whitespace
    const dataMatch = trimmed.match(/^([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)$/);
    if (dataMatch) {
      dataLines.push(trimmed);
    }
  }

  if (size === 0) {
    throw new Error('LUT_3D_SIZE not found in .cube file');
  }

  const expectedDataCount = size * size * size;
  if (dataLines.length !== expectedDataCount) {
    throw new Error(`Expected ${expectedDataCount} data lines, got ${dataLines.length}`);
  }

  // Parse data into Float32Array
  const data = new Float32Array(expectedDataCount * 3);
  let idx = 0;

  for (const line of dataLines) {
    const parts = line.trim().split(/\s+/);
    data[idx++] = parseFloat(parts[0]!);
    data[idx++] = parseFloat(parts[1]!);
    data[idx++] = parseFloat(parts[2]!);
  }

  return {
    title,
    size,
    domainMin,
    domainMax,
    data,
  };
}

/**
 * Apply a 3D LUT to a color value using trilinear interpolation
 */
export function applyLUT3D(
  lut: LUT3D,
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const { size, domainMin, domainMax, data } = lut;

  // Normalize input to 0-1 range based on domain
  const nr = (r - domainMin[0]) / (domainMax[0] - domainMin[0]);
  const ng = (g - domainMin[1]) / (domainMax[1] - domainMin[1]);
  const nb = (b - domainMin[2]) / (domainMax[2] - domainMin[2]);

  // Clamp and scale to LUT indices
  const maxIdx = size - 1;
  const ri = Math.max(0, Math.min(maxIdx, nr * maxIdx));
  const gi = Math.max(0, Math.min(maxIdx, ng * maxIdx));
  const bi = Math.max(0, Math.min(maxIdx, nb * maxIdx));

  // Get integer and fractional parts
  const r0 = Math.floor(ri);
  const g0 = Math.floor(gi);
  const b0 = Math.floor(bi);
  const r1 = Math.min(r0 + 1, maxIdx);
  const g1 = Math.min(g0 + 1, maxIdx);
  const b1 = Math.min(b0 + 1, maxIdx);

  const rf = ri - r0;
  const gf = gi - g0;
  const bf = bi - b0;

  // Get the 8 corner values for trilinear interpolation
  const getColor = (ri: number, gi: number, bi: number): [number, number, number] => {
    // .cube files store data in BGR order (B varies fastest)
    const idx = (ri * size * size + gi * size + bi) * 3;
    return [data[idx]!, data[idx + 1]!, data[idx + 2]!];
  };

  // 8 corners of the cube
  const c000 = getColor(r0, g0, b0);
  const c001 = getColor(r0, g0, b1);
  const c010 = getColor(r0, g1, b0);
  const c011 = getColor(r0, g1, b1);
  const c100 = getColor(r1, g0, b0);
  const c101 = getColor(r1, g0, b1);
  const c110 = getColor(r1, g1, b0);
  const c111 = getColor(r1, g1, b1);

  // Trilinear interpolation
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const c00 = lerp(c000[i]!, c001[i]!, bf);
    const c01 = lerp(c010[i]!, c011[i]!, bf);
    const c10 = lerp(c100[i]!, c101[i]!, bf);
    const c11 = lerp(c110[i]!, c111[i]!, bf);

    const c0 = lerp(c00, c01, gf);
    const c1 = lerp(c10, c11, gf);

    out[i] = lerp(c0, c1, rf);
  }

  return out;
}

/**
 * Create a WebGL 3D texture from a LUT
 */
export function createLUTTexture(
  gl: WebGL2RenderingContext,
  lut: LUT3D
): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_3D, texture);

  // Set texture parameters
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Upload data
  gl.texImage3D(
    gl.TEXTURE_3D,
    0,
    gl.RGB32F,
    lut.size,
    lut.size,
    lut.size,
    0,
    gl.RGB,
    gl.FLOAT,
    lut.data
  );

  gl.bindTexture(gl.TEXTURE_3D, null);

  return texture;
}
