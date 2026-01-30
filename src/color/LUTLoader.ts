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
  // Check if it's a 3D LUT by verifying data length matches size^3 * 3
  return 'size' in lut && lut.data.length === lut.size * lut.size * lut.size * 3;
}

export function isLUT1D(lut: LUT): lut is LUT1D {
  // Check if it's a 1D LUT by verifying data length matches size * 3
  return 'size' in lut && lut.data.length === lut.size * 3;
}

/**
 * Parse a .cube LUT file (supports both 1D and 3D LUTs)
 */
export function parseCubeLUT(content: string): LUT {
  const lines = content.split(/\r?\n/);

  let title = 'Untitled LUT';
  let size1D = 0;
  let size3D = 0;
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
        size3D = parseInt(match[1]!, 10);
      }
      continue;
    }

    if (trimmed.startsWith('LUT_1D_SIZE')) {
      const match = trimmed.match(/LUT_1D_SIZE\s+(\d+)/i);
      if (match) {
        size1D = parseInt(match[1]!, 10);
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

    // Data line - three floats separated by whitespace
    const dataMatch = trimmed.match(/^([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)$/);
    if (dataMatch) {
      dataLines.push(trimmed);
    }
  }

  // Handle 1D LUT
  if (size1D > 0) {
    if (dataLines.length !== size1D) {
      throw new Error(`1D LUT: Expected ${size1D} data lines, got ${dataLines.length}`);
    }

    // Parse data into Float32Array (R, G, B interleaved)
    const data = new Float32Array(size1D * 3);
    let idx = 0;

    for (const line of dataLines) {
      const parts = line.trim().split(/\s+/);
      data[idx++] = parseFloat(parts[0]!);
      data[idx++] = parseFloat(parts[1]!);
      data[idx++] = parseFloat(parts[2]!);
    }

    return {
      title,
      size: size1D,
      domainMin,
      domainMax,
      data,
    } as LUT1D;
  }

  // Handle 3D LUT
  if (size3D === 0) {
    throw new Error('Neither LUT_1D_SIZE nor LUT_3D_SIZE found in .cube file');
  }

  const expectedDataCount = size3D * size3D * size3D;
  if (dataLines.length !== expectedDataCount) {
    throw new Error(`3D LUT: Expected ${expectedDataCount} data lines, got ${dataLines.length}`);
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
    size: size3D,
    domainMin,
    domainMax,
    data,
  } as LUT3D;
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
 * Apply a 1D LUT to a color value using linear interpolation
 * Each channel is processed independently through its own curve
 */
export function applyLUT1D(
  lut: LUT1D,
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const { size, domainMin, domainMax, data } = lut;

  // Helper to apply 1D LUT to a single channel
  const applyChannel = (value: number, channelOffset: number, domainMinCh: number, domainMaxCh: number): number => {
    // Normalize input to 0-1 range based on domain
    const normalized = (value - domainMinCh) / (domainMaxCh - domainMinCh);

    // Clamp and scale to LUT indices
    const maxIdx = size - 1;
    const idx = Math.max(0, Math.min(maxIdx, normalized * maxIdx));

    // Get integer and fractional parts for linear interpolation
    const idx0 = Math.floor(idx);
    const idx1 = Math.min(idx0 + 1, maxIdx);
    const frac = idx - idx0;

    // Get values from LUT (data is interleaved: R0,G0,B0,R1,G1,B1,...)
    const val0 = data[idx0 * 3 + channelOffset]!;
    const val1 = data[idx1 * 3 + channelOffset]!;

    // Linear interpolation
    return val0 + (val1 - val0) * frac;
  };

  return [
    applyChannel(r, 0, domainMin[0], domainMax[0]),
    applyChannel(g, 1, domainMin[1], domainMax[1]),
    applyChannel(b, 2, domainMin[2], domainMax[2]),
  ];
}

/**
 * Apply a LUT (1D or 3D) to ImageData
 */
export function applyLUTToImageData(imageData: ImageData, lut: LUT): void {
  const data = imageData.data;

  if (isLUT1D(lut)) {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

      const [outR, outG, outB] = applyLUT1D(lut, r, g, b);

      data[i] = Math.round(Math.max(0, Math.min(1, outR)) * 255);
      data[i + 1] = Math.round(Math.max(0, Math.min(1, outG)) * 255);
      data[i + 2] = Math.round(Math.max(0, Math.min(1, outB)) * 255);
    }
  } else {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

      const [outR, outG, outB] = applyLUT3D(lut, r, g, b);

      data[i] = Math.round(Math.max(0, Math.min(1, outR)) * 255);
      data[i + 1] = Math.round(Math.max(0, Math.min(1, outG)) * 255);
      data[i + 2] = Math.round(Math.max(0, Math.min(1, outB)) * 255);
    }
  }
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

/**
 * Create a WebGL 2D texture from a 1D LUT
 * The texture is size x 3 (width x height) where each row is a channel (R, G, B)
 */
export function createLUT1DTexture(
  gl: WebGL2RenderingContext,
  lut: LUT1D
): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Set texture parameters
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Reorganize data: from interleaved R0,G0,B0,R1,G1,B1,...
  // to separate rows: R0,R1,R2,..., G0,G1,G2,..., B0,B1,B2,...
  const reorganizedData = new Float32Array(lut.size * 3);

  for (let i = 0; i < lut.size; i++) {
    reorganizedData[i] = lut.data[i * 3]!;                    // R row
    reorganizedData[lut.size + i] = lut.data[i * 3 + 1]!;     // G row
    reorganizedData[lut.size * 2 + i] = lut.data[i * 3 + 2]!; // B row
  }

  // Upload as size x 3 texture (width x height)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R32F,
    lut.size,
    3,
    0,
    gl.RED,
    gl.FLOAT,
    reorganizedData
  );

  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}
