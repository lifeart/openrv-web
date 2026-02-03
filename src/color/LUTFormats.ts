/**
 * Additional LUT Format Parsers
 *
 * Supports: .3dl, .csp, .itx, .look, .lut (Houdini), .nk (Nuke), .mga (Pandora),
 * RV3DLUT (OpenRV native 3D), RVCHANNELLUT (OpenRV native 1D)
 */

import type { LUT, LUT3D, LUT1D } from './LUTLoader';
import { reorderRFastestToBFastest, normalizeIntegers } from './LUTUtils';

// ─── Helpers ───────────────────────────────────────────────────────────

/** Strip comment lines and empty lines, return trimmed non-empty lines */
function stripComments(content: string, commentPrefix = '#'): string[] {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith(commentPrefix));
}

/** Parse a line of space-separated floats */
function parseFloats(line: string): number[] {
  return line.trim().split(/\s+/).map(Number);
}

/** Parse a line of space-separated integers */
function parseInts(line: string): number[] {
  return line.trim().split(/\s+/).map((v) => parseInt(v, 10));
}

// ─── 1. Autodesk .3dl (Lustre / Flame) ────────────────────────────────

export function parse3DLLUT(content: string): LUT {
  const lines = stripComments(content);

  if (lines.length === 0) {
    throw new Error('3DL: Empty file');
  }

  // First non-comment line is either a size integer or an input range line
  const firstLineValues = parseInts(lines[0]!);

  let headerLineCount: number;
  let size: number;

  if (firstLineValues.length === 1) {
    // Single integer -> 3D mesh size
    size = firstLineValues[0]!;
    headerLineCount = 1;
  } else {
    // Multiple integers -> input range line; size is the count of entries
    size = firstLineValues.length;
    headerLineCount = 1;
  }

  // Parse data lines
  const dataLines = lines.slice(headerLineCount);
  const triplets: number[][] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const vals = parseInts(dataLines[i]!);
    if (vals.length !== 3) {
      throw new Error(`3DL: Invalid data at line ${headerLineCount + i + 1}`);
    }
    triplets.push(vals);
  }

  // Detect max output value for normalization
  let maxOut = 0;
  for (const t of triplets) {
    for (const v of t) {
      if (v! > maxOut) maxOut = v!;
    }
  }
  // Common output depths: 4095 (12-bit), 1023 (10-bit), 65535 (16-bit)
  if (maxOut === 0) maxOut = 1; // avoid division by zero

  // Detect 1D vs 3D
  const is1D = triplets.length === size;
  const is3D = triplets.length === size * size * size;

  if (!is1D && !is3D) {
    // Try to infer size from cube root
    const cubeRoot = Math.round(Math.cbrt(triplets.length));
    if (cubeRoot * cubeRoot * cubeRoot === triplets.length) {
      size = cubeRoot;
    } else {
      throw new Error(
        `3DL: Cannot determine LUT type. Data count ${triplets.length} is neither ${size} (1D) nor ${size}^3=${size * size * size} (3D)`
      );
    }
  }

  // Build Float32Array
  const data = new Float32Array(triplets.length * 3);
  for (let i = 0; i < triplets.length; i++) {
    data[i * 3] = triplets[i]![0]!;
    data[i * 3 + 1] = triplets[i]![1]!;
    data[i * 3 + 2] = triplets[i]![2]!;
  }

  // Normalize
  const normalizedData = normalizeIntegers(data, maxOut);

  if (triplets.length === size && !is3D) {
    // 1D LUT
    return {
      title: 'Untitled 3DL LUT',
      size,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data: normalizedData,
    } as LUT1D;
  }

  // 3D LUT - reorder from R-fastest to B-fastest
  const reordered = reorderRFastestToBFastest(normalizedData, size);

  return {
    title: 'Untitled 3DL LUT',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data: reordered,
  } as LUT3D;
}

// ─── 2. Rising Sun .csp (cineSpace) ───────────────────────────────────

export function parseCSPLUT(content: string): LUT {
  const lines = content.split(/\r?\n/).map((l) => l.trim());

  let cursor = 0;

  // Find first non-empty line
  while (cursor < lines.length && lines[cursor]!.length === 0) cursor++;

  // Verify magic header
  if (cursor >= lines.length || lines[cursor] !== 'CSPLUTV100') {
    throw new Error('CSP: Missing CSPLUTV100 magic header');
  }
  cursor++;

  // Read type line
  while (cursor < lines.length && lines[cursor]!.length === 0) cursor++;
  if (cursor >= lines.length) {
    throw new Error('CSP: Missing type line (1D or 3D)');
  }
  const lutType = lines[cursor]!.toUpperCase();
  if (lutType !== '1D' && lutType !== '3D') {
    throw new Error(`CSP: Invalid LUT type "${lines[cursor]}". Expected "1D" or "3D".`);
  }
  cursor++;

  // Skip metadata block
  let title = 'Untitled CSP LUT';
  while (cursor < lines.length) {
    if (lines[cursor] === 'BEGIN METADATA') {
      cursor++;
      while (cursor < lines.length && lines[cursor] !== 'END METADATA') {
        const metaMatch = lines[cursor]!.match(/"title"\s+"([^"]+)"/i);
        if (metaMatch) {
          title = metaMatch[1]!;
        }
        cursor++;
      }
      if (cursor < lines.length) cursor++; // skip END METADATA
      break;
    } else if (lines[cursor]!.length === 0) {
      cursor++;
    } else {
      break;
    }
  }

  // Skip empty lines
  while (cursor < lines.length && lines[cursor]!.length === 0) cursor++;

  // Parse pre-LUT shaper for each channel (R, G, B)
  // Each channel: count line, input values line, output values line
  const preLUTs: { inputs: number[]; outputs: number[] }[] = [];
  for (let ch = 0; ch < 3; ch++) {
    while (cursor < lines.length && lines[cursor]!.length === 0) cursor++;
    if (cursor >= lines.length) {
      throw new Error(`CSP: Missing pre-LUT data for channel ${ch}`);
    }
    const count = parseInt(lines[cursor]!, 10);
    cursor++;

    while (cursor < lines.length && lines[cursor]!.length === 0) cursor++;
    const inputs = parseFloats(lines[cursor]!);
    cursor++;

    while (cursor < lines.length && lines[cursor]!.length === 0) cursor++;
    const outputs = parseFloats(lines[cursor]!);
    cursor++;

    if (inputs.length !== count || outputs.length !== count) {
      throw new Error(`CSP: Pre-LUT channel ${ch} expected ${count} entries, got ${inputs.length}/${outputs.length}`);
    }
    preLUTs.push({ inputs, outputs });
  }

  // Skip empty lines
  while (cursor < lines.length && lines[cursor]!.length === 0) cursor++;

  if (lutType === '1D') {
    // For 1D type, use the pre-LUT shaper data directly
    // Find the maximum size among channels
    const maxSize = Math.max(...preLUTs.map((p) => p.outputs.length));
    const data = new Float32Array(maxSize * 3);
    for (let i = 0; i < maxSize; i++) {
      for (let ch = 0; ch < 3; ch++) {
        const preLut = preLUTs[ch]!;
        if (i < preLut.outputs.length) {
          data[i * 3 + ch] = preLut.outputs[i]!;
        }
      }
    }

    return {
      title,
      size: maxSize,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data,
    } as LUT1D;
  }

  // 3D LUT: read cube dimensions
  if (cursor >= lines.length) {
    throw new Error('CSP: Missing cube dimensions');
  }
  const dims = parseInts(lines[cursor]!);
  cursor++;

  if (dims.length < 3) {
    throw new Error('CSP: Invalid cube dimensions');
  }

  // For simplicity, use uniform size (take the first dimension)
  const size = dims[0]!;
  const totalEntries = dims[0]! * dims[1]! * dims[2]!;

  // Parse data triplets
  const data = new Float32Array(totalEntries * 3);
  let dataIdx = 0;

  while (cursor < lines.length && dataIdx < totalEntries) {
    if (lines[cursor]!.length === 0) {
      cursor++;
      continue;
    }
    const vals = parseFloats(lines[cursor]!);
    if (vals.length >= 3) {
      data[dataIdx * 3] = vals[0]!;
      data[dataIdx * 3 + 1] = vals[1]!;
      data[dataIdx * 3 + 2] = vals[2]!;
      dataIdx++;
    }
    cursor++;
  }

  if (dataIdx !== totalEntries) {
    throw new Error(`CSP: Expected ${totalEntries} data entries, got ${dataIdx}`);
  }

  // Reorder from R-fastest to B-fastest
  const reordered = reorderRFastestToBFastest(data, size);

  return {
    title,
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data: reordered,
  } as LUT3D;
}

// ─── 3. IRIDAS .itx ──────────────────────────────────────────────────

export function parseITXLUT(content: string): LUT {
  const lines = content.split(/\r?\n/);

  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const dataLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('LUT_3D_SIZE')) {
      const match = trimmed.match(/LUT_3D_SIZE\s+(\d+)/i);
      if (match) size = parseInt(match[1]!, 10);
      continue;
    }

    if (trimmed.startsWith('LUT_3D_INPUT_RANGE')) {
      const match = trimmed.match(/LUT_3D_INPUT_RANGE\s+([\d.eE+-]+)\s+([\d.eE+-]+)/i);
      if (match) {
        const min = parseFloat(match[1]!);
        const max = parseFloat(match[2]!);
        domainMin = [min, min, min];
        domainMax = [max, max, max];
      }
      continue;
    }

    // Data line
    const dataMatch = trimmed.match(/^[\d.eE+-]+\s+[\d.eE+-]+\s+[\d.eE+-]+$/);
    if (dataMatch) {
      dataLines.push(trimmed);
    }
  }

  if (size === 0) {
    throw new Error('ITX: LUT_3D_SIZE not found');
  }

  const expectedCount = size * size * size;
  if (dataLines.length !== expectedCount) {
    throw new Error(`ITX: Expected ${expectedCount} data entries, got ${dataLines.length}`);
  }

  const data = new Float32Array(expectedCount * 3);
  for (let i = 0; i < dataLines.length; i++) {
    const vals = parseFloats(dataLines[i]!);
    data[i * 3] = vals[0]!;
    data[i * 3 + 1] = vals[1]!;
    data[i * 3 + 2] = vals[2]!;
  }

  // Reorder from R-fastest to B-fastest
  const reordered = reorderRFastestToBFastest(data, size);

  return {
    title: 'Untitled ITX LUT',
    size,
    domainMin,
    domainMax,
    data: reordered,
  } as LUT3D;
}

// ─── 4. IRIDAS .look (XML) ───────────────────────────────────────────

export function parseLookLUT(content: string): LUT {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('LOOK: Invalid XML');
  }

  const lookEl = doc.querySelector('look');
  if (!lookEl) {
    throw new Error('LOOK: Missing <look> element');
  }

  const lutEl = lookEl.querySelector('LUT');
  if (!lutEl) {
    throw new Error('LOOK: Missing <LUT> element');
  }

  const titleEl = lutEl.querySelector('title');
  const title = titleEl?.textContent?.trim() ?? 'Untitled Look LUT';

  const sizeEl = lutEl.querySelector('size');
  if (!sizeEl?.textContent) {
    throw new Error('LOOK: Missing <size> element');
  }
  const size = parseInt(sizeEl.textContent.trim(), 10);

  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];

  const inputRangeEl = lutEl.querySelector('inputRange');
  if (inputRangeEl?.textContent) {
    const vals = parseFloats(inputRangeEl.textContent);
    if (vals.length >= 2) {
      domainMin = [vals[0]!, vals[0]!, vals[0]!];
      domainMax = [vals[1]!, vals[1]!, vals[1]!];
    }
  }

  const dataEl = lutEl.querySelector('data');
  if (!dataEl?.textContent) {
    throw new Error('LOOK: Missing <data> element');
  }

  // Parse data
  const dataText = dataEl.textContent.trim();
  const dataLinesList = dataText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const expectedCount = size * size * size;
  if (dataLinesList.length !== expectedCount) {
    throw new Error(`LOOK: Expected ${expectedCount} data entries, got ${dataLinesList.length}`);
  }

  const data = new Float32Array(expectedCount * 3);
  for (let i = 0; i < dataLinesList.length; i++) {
    const vals = parseFloats(dataLinesList[i]!);
    data[i * 3] = vals[0]!;
    data[i * 3 + 1] = vals[1]!;
    data[i * 3 + 2] = vals[2]!;
  }

  // Reorder from R-fastest to B-fastest
  const reordered = reorderRFastestToBFastest(data, size);

  return {
    title,
    size,
    domainMin,
    domainMax,
    data: reordered,
  } as LUT3D;
}

// ─── 5. Houdini .lut ─────────────────────────────────────────────────

export function parseHoudiniLUT(content: string): LUT {
  const lines = content.split(/\r?\n/);

  // Parse header key-value pairs
  let type = '';
  let fromRange: [number, number] = [0, 1];
  let length = 0;
  let lutMarkerLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();

    if (trimmed.startsWith('Type')) {
      const match = trimmed.match(/Type\s+(\S+)/);
      if (match) type = match[1]!;
      continue;
    }

    if (trimmed.startsWith('From')) {
      const match = trimmed.match(/From\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
      if (match) fromRange = [parseFloat(match[1]!), parseFloat(match[2]!)];
      continue;
    }

    if (trimmed.startsWith('Length')) {
      const match = trimmed.match(/Length\s+(\d+)/);
      if (match) length = parseInt(match[1]!, 10);
      continue;
    }

    if (trimmed === 'LUT:') {
      lutMarkerLine = i;
      break;
    }
  }

  if (lutMarkerLine < 0) {
    throw new Error('Houdini LUT: Missing "LUT:" marker');
  }

  const domainMin: [number, number, number] = [fromRange[0], fromRange[0], fromRange[0]];
  const domainMax: [number, number, number] = [fromRange[1], fromRange[1], fromRange[1]];

  // Get all content after LUT: marker
  const afterLUT = lines.slice(lutMarkerLine + 1).join('\n');

  if (type === 'C' || type === 'c') {
    // 1D Channel LUT: R { ... } G { ... } B { ... }
    const channelPattern = /[RGB]\s*\{([^}]+)\}/g;
    const channels: number[][] = [];
    let match;

    while ((match = channelPattern.exec(afterLUT)) !== null) {
      const vals = match[1]!.trim().split(/\s+/).map(Number);
      channels.push(vals);
    }

    if (channels.length < 3) {
      throw new Error('Houdini LUT: Expected R, G, B channel data');
    }

    const size = length || channels[0]!.length;
    const data = new Float32Array(size * 3);

    for (let i = 0; i < size; i++) {
      data[i * 3] = channels[0]![i] ?? 0;
      data[i * 3 + 1] = channels[1]![i] ?? 0;
      data[i * 3 + 2] = channels[2]![i] ?? 0;
    }

    return {
      title: 'Untitled Houdini LUT',
      size,
      domainMin,
      domainMax,
      data,
    } as LUT1D;
  }

  if (type === '3D' || type === '3d') {
    // 3D LUT: { r g b } triplets
    const tripletPattern = /\{\s*([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s*\}/g;
    const triplets: number[][] = [];
    let match;

    while ((match = tripletPattern.exec(afterLUT)) !== null) {
      triplets.push([parseFloat(match[1]!), parseFloat(match[2]!), parseFloat(match[3]!)]);
    }

    const size = length || Math.round(Math.cbrt(triplets.length));
    const expectedCount = size * size * size;

    if (triplets.length !== expectedCount) {
      throw new Error(`Houdini LUT: Expected ${expectedCount} 3D entries, got ${triplets.length}`);
    }

    const data = new Float32Array(expectedCount * 3);
    for (let i = 0; i < triplets.length; i++) {
      data[i * 3] = triplets[i]![0]!;
      data[i * 3 + 1] = triplets[i]![1]!;
      data[i * 3 + 2] = triplets[i]![2]!;
    }

    // Reorder from R-fastest to B-fastest
    const reordered = reorderRFastestToBFastest(data, size);

    return {
      title: 'Untitled Houdini LUT',
      size,
      domainMin,
      domainMax,
      data: reordered,
    } as LUT3D;
  }

  throw new Error(`Houdini LUT: Unknown Type "${type}"`);
}

// ─── 6. Nuke .nk (Vectorfield export) ────────────────────────────────

export function parseNukeLUT(content: string): LUT {
  const trimmedContent = content.trim();

  // Detect format
  if (trimmedContent.startsWith('Vectorfield')) {
    return parseNukeVectorfieldNode(trimmedContent);
  }

  // Exported plain text format with # comments
  return parseNukeExportedFormat(trimmedContent);
}

function parseNukeVectorfieldNode(content: string): LUT3D {
  // Extract cube_size
  const sizeMatch = content.match(/cube_size\s+(\d+)/);
  if (!sizeMatch) {
    throw new Error('Nuke: Missing cube_size in Vectorfield node');
  }
  const size = parseInt(sizeMatch[1]!, 10);

  // Extract data string from lut3d { ... data "..." }
  const dataMatch = content.match(/data\s+"([^"]+)"/s);
  if (!dataMatch) {
    throw new Error('Nuke: Missing data in Vectorfield node');
  }

  const dataText = dataMatch[1]!.trim();
  const dataLines = dataText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const expectedCount = size * size * size;
  if (dataLines.length !== expectedCount) {
    throw new Error(`Nuke: Expected ${expectedCount} data entries, got ${dataLines.length}`);
  }

  const data = new Float32Array(expectedCount * 3);
  for (let i = 0; i < dataLines.length; i++) {
    const vals = parseFloats(dataLines[i]!);
    data[i * 3] = vals[0]!;
    data[i * 3 + 1] = vals[1]!;
    data[i * 3 + 2] = vals[2]!;
  }

  const reordered = reorderRFastestToBFastest(data, size);

  return {
    title: 'Untitled Nuke LUT',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data: reordered,
  };
}

function parseNukeExportedFormat(content: string): LUT3D {
  const lines = content.split(/\r?\n/);

  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const dataLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('#')) {
      // Parse comment headers
      const sizeMatch = trimmed.match(/#\s*cube_size\s+(\d+)/);
      if (sizeMatch) {
        size = parseInt(sizeMatch[1]!, 10);
      }

      const minMatch = trimmed.match(/#\s*input_min\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
      if (minMatch) {
        domainMin = [parseFloat(minMatch[1]!), parseFloat(minMatch[2]!), parseFloat(minMatch[3]!)];
      }

      const maxMatch = trimmed.match(/#\s*input_max\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
      if (maxMatch) {
        domainMax = [parseFloat(maxMatch[1]!), parseFloat(maxMatch[2]!), parseFloat(maxMatch[3]!)];
      }

      continue;
    }

    if (!trimmed) continue;

    // Data line
    const dataMatch = trimmed.match(/^[\d.eE+-]+\s+[\d.eE+-]+\s+[\d.eE+-]+$/);
    if (dataMatch) {
      dataLines.push(trimmed);
    }
  }

  if (size === 0 && dataLines.length > 0) {
    // Infer size from data count
    size = Math.round(Math.cbrt(dataLines.length));
  }

  if (size === 0) {
    throw new Error('Nuke: Cannot determine LUT size');
  }

  const expectedCount = size * size * size;
  if (dataLines.length !== expectedCount) {
    throw new Error(`Nuke: Expected ${expectedCount} data entries, got ${dataLines.length}`);
  }

  const data = new Float32Array(expectedCount * 3);
  for (let i = 0; i < dataLines.length; i++) {
    const vals = parseFloats(dataLines[i]!);
    data[i * 3] = vals[0]!;
    data[i * 3 + 1] = vals[1]!;
    data[i * 3 + 2] = vals[2]!;
  }

  const reordered = reorderRFastestToBFastest(data, size);

  return {
    title: 'Untitled Nuke LUT',
    size,
    domainMin,
    domainMax,
    data: reordered,
  };
}

// ─── 7. Pandora .mga ─────────────────────────────────────────────────

export function parseMGALUT(content: string): LUT {
  const lines = content.split(/\r?\n/).map((l) => l.trim());

  let cursor = 0;

  // Skip empty lines
  while (cursor < lines.length && lines[cursor]!.length === 0) cursor++;

  // Verify magic header
  if (cursor >= lines.length || lines[cursor] !== 'MGA') {
    throw new Error('MGA: Missing MGA magic header');
  }
  cursor++;

  let size = 0;
  let outBitDepth = 0;

  // Parse optional header fields
  while (cursor < lines.length) {
    const line = lines[cursor]!;

    if (line.startsWith('LUT_TYPE')) {
      cursor++;
      continue;
    }

    if (line.startsWith('LUT_SIZE')) {
      const match = line.match(/LUT_SIZE\s+(\d+)/);
      if (match) size = parseInt(match[1]!, 10);
      cursor++;
      continue;
    }

    if (line.startsWith('LUT_IN_BITDEPTH')) {
      cursor++;
      continue;
    }

    if (line.startsWith('LUT_OUT_BITDEPTH')) {
      const match = line.match(/LUT_OUT_BITDEPTH\s+(\d+)/);
      if (match) outBitDepth = parseInt(match[1]!, 10);
      cursor++;
      continue;
    }

    // If line looks like data (three numbers), break out of header
    if (/^\d+\s+\d+\s+\d+$/.test(line)) {
      break;
    }

    cursor++;
  }

  // Parse data lines
  const triplets: number[][] = [];
  while (cursor < lines.length) {
    const line = lines[cursor]!;
    if (line.length === 0) {
      cursor++;
      continue;
    }
    const vals = parseInts(line);
    if (vals.length === 3) {
      triplets.push(vals);
    }
    cursor++;
  }

  if (triplets.length === 0) {
    throw new Error('MGA: No data found');
  }

  // Infer size if not provided
  if (size === 0) {
    size = Math.round(Math.cbrt(triplets.length));
  }

  // Determine max output value
  let maxOut = 0;
  if (outBitDepth > 0) {
    maxOut = (1 << outBitDepth) - 1;
  } else {
    // Infer from data
    for (const t of triplets) {
      for (const v of t) {
        if (v! > maxOut) maxOut = v!;
      }
    }
  }
  if (maxOut === 0) maxOut = 1;

  const expectedCount = size * size * size;
  if (triplets.length !== expectedCount) {
    throw new Error(`MGA: Expected ${expectedCount} data entries, got ${triplets.length}`);
  }

  const data = new Float32Array(expectedCount * 3);
  for (let i = 0; i < triplets.length; i++) {
    data[i * 3] = triplets[i]![0]!;
    data[i * 3 + 1] = triplets[i]![1]!;
    data[i * 3 + 2] = triplets[i]![2]!;
  }

  const normalizedData = normalizeIntegers(data, maxOut);
  const reordered = reorderRFastestToBFastest(normalizedData, size);

  return {
    title: 'Untitled MGA LUT',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data: reordered,
  } as LUT3D;
}

// ─── 8. RV 3D LUT (OpenRV native) ────────────────────────────────────

export function parseRV3DLUT(content: string): LUT3D {
  const lines = content.split(/\r?\n/).map((l) => l.trim());

  let cursor = 0;

  // Skip empty lines
  while (cursor < lines.length && lines[cursor]!.length === 0) cursor++;

  // Verify magic header
  if (cursor >= lines.length || lines[cursor] !== 'RV3DLUT') {
    throw new Error('RV3DLUT: Missing RV3DLUT magic header');
  }
  cursor++;

  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  let dataStarted = false;
  const dataLines: string[] = [];

  while (cursor < lines.length) {
    const line = lines[cursor]!;

    if (dataStarted) {
      if (line.length > 0) {
        dataLines.push(line);
      }
      cursor++;
      continue;
    }

    if (line.startsWith('size')) {
      const match = line.match(/size\s+(\d+)/);
      if (match) size = parseInt(match[1]!, 10);
      cursor++;
      continue;
    }

    if (line.startsWith('domain_min')) {
      const match = line.match(/domain_min\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
      if (match) {
        domainMin = [parseFloat(match[1]!), parseFloat(match[2]!), parseFloat(match[3]!)];
      }
      cursor++;
      continue;
    }

    if (line.startsWith('domain_max')) {
      const match = line.match(/domain_max\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
      if (match) {
        domainMax = [parseFloat(match[1]!), parseFloat(match[2]!), parseFloat(match[3]!)];
      }
      cursor++;
      continue;
    }

    if (line === 'data:') {
      dataStarted = true;
      cursor++;
      continue;
    }

    cursor++;
  }

  if (size === 0) {
    throw new Error('RV3DLUT: Missing size');
  }

  const expectedCount = size * size * size;
  if (dataLines.length !== expectedCount) {
    throw new Error(`RV3DLUT: Expected ${expectedCount} data entries, got ${dataLines.length}`);
  }

  const data = new Float32Array(expectedCount * 3);
  for (let i = 0; i < dataLines.length; i++) {
    const vals = parseFloats(dataLines[i]!);
    data[i * 3] = vals[0]!;
    data[i * 3 + 1] = vals[1]!;
    data[i * 3 + 2] = vals[2]!;
  }

  // No reordering needed - RV3DLUT already uses B-fastest order
  return {
    title: 'Untitled RV3D LUT',
    size,
    domainMin,
    domainMax,
    data,
  };
}

// ─── 9. RV Channel LUT (OpenRV native 1D) ────────────────────────────

export function parseRVChannelLUT(content: string): LUT1D {
  const lines = content.split(/\r?\n/).map((l) => l.trim());

  let cursor = 0;

  // Skip empty lines
  while (cursor < lines.length && lines[cursor]!.length === 0) cursor++;

  // Verify magic header
  if (cursor >= lines.length || lines[cursor] !== 'RVCHANNELLUT') {
    throw new Error('RVCHANNELLUT: Missing RVCHANNELLUT magic header');
  }
  cursor++;

  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];

  // Parse header
  while (cursor < lines.length) {
    const line = lines[cursor]!;

    if (line.startsWith('size')) {
      const match = line.match(/size\s+(\d+)/);
      if (match) size = parseInt(match[1]!, 10);
      cursor++;
      continue;
    }

    if (line.startsWith('channels')) {
      cursor++;
      continue;
    }

    if (line.startsWith('domain_min')) {
      const match = line.match(/domain_min\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
      if (match) {
        domainMin = [parseFloat(match[1]!), parseFloat(match[2]!), parseFloat(match[3]!)];
      }
      cursor++;
      continue;
    }

    if (line.startsWith('domain_max')) {
      const match = line.match(/domain_max\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
      if (match) {
        domainMax = [parseFloat(match[1]!), parseFloat(match[2]!), parseFloat(match[3]!)];
      }
      cursor++;
      continue;
    }

    if (line === 'data:' || line === 'red:') {
      break;
    }

    cursor++;
  }

  if (size === 0) {
    throw new Error('RVCHANNELLUT: Missing size');
  }

  const data = new Float32Array(size * 3);

  // Detect data layout
  if (lines[cursor] === 'data:') {
    // Interleaved triplets format
    cursor++;
    let idx = 0;
    while (cursor < lines.length && idx < size) {
      const line = lines[cursor]!;
      if (line.length === 0) {
        cursor++;
        continue;
      }
      const vals = parseFloats(line);
      if (vals.length >= 3) {
        data[idx * 3] = vals[0]!;
        data[idx * 3 + 1] = vals[1]!;
        data[idx * 3 + 2] = vals[2]!;
        idx++;
      }
      cursor++;
    }

    if (idx !== size) {
      throw new Error(`RVCHANNELLUT: Expected ${size} data entries, got ${idx}`);
    }
  } else if (lines[cursor] === 'red:') {
    // Per-channel layout: red:, green:, blue:
    const channelNames = ['red:', 'green:', 'blue:'];
    const channels: number[][] = [];

    for (const name of channelNames) {
      while (cursor < lines.length && lines[cursor] !== name) cursor++;
      if (cursor >= lines.length) {
        throw new Error(`RVCHANNELLUT: Missing ${name} section`);
      }
      cursor++; // skip marker line

      // Collect all values until next marker or end
      const vals: number[] = [];
      while (cursor < lines.length && !channelNames.includes(lines[cursor]!) && lines[cursor]!.length > 0) {
        const lineVals = parseFloats(lines[cursor]!);
        vals.push(...lineVals);
        cursor++;
      }
      channels.push(vals);
    }

    if (channels[0]!.length !== size || channels[1]!.length !== size || channels[2]!.length !== size) {
      throw new Error(`RVCHANNELLUT: Channel data length mismatch. Expected ${size} per channel.`);
    }

    // Interleave
    for (let i = 0; i < size; i++) {
      data[i * 3] = channels[0]![i]!;
      data[i * 3 + 1] = channels[1]![i]!;
      data[i * 3 + 2] = channels[2]![i]!;
    }
  } else {
    throw new Error('RVCHANNELLUT: Missing data: or red: marker');
  }

  return {
    title: 'Untitled RV Channel LUT',
    size,
    domainMin,
    domainMax,
    data,
  };
}
