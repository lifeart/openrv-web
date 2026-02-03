/**
 * LUT Format Detection and Unified Parser
 *
 * Auto-detects LUT format from file extension and/or content sniffing,
 * then delegates to the appropriate parser.
 */

import type { LUT } from './LUTLoader';
import { parseCubeLUT } from './LUTLoader';
import {
  parse3DLLUT,
  parseCSPLUT,
  parseITXLUT,
  parseLookLUT,
  parseHoudiniLUT,
  parseNukeLUT,
  parseMGALUT,
  parseRV3DLUT,
  parseRVChannelLUT,
} from './LUTFormats';

export type LUTFormat =
  | 'cube'
  | '3dl'
  | 'csp'
  | 'itx'
  | 'look'
  | 'houdini_lut'
  | 'nuke_nk'
  | 'mga'
  | 'rv3d'
  | 'rv_channel';

/**
 * Detect LUT format from file extension and/or content sniffing
 */
export function detectLUTFormat(filename: string, content?: string): LUTFormat | null {
  const ext = filename.toLowerCase().split('.').pop();

  switch (ext) {
    case 'cube':
      return 'cube';
    case '3dl':
      return '3dl';
    case 'csp':
      return 'csp';
    case 'itx':
      return 'itx';
    case 'look':
      return 'look';
    case 'lut':
      return 'houdini_lut';
    case 'nk':
      return 'nuke_nk';
    case 'mga':
      return 'mga';
    default:
      break;
  }

  // Content sniffing for extensionless files or ambiguous extensions
  if (content) {
    const firstLine = content.trim().split(/\r?\n/)[0]?.trim() ?? '';
    if (firstLine === 'CSPLUTV100') return 'csp';
    if (firstLine === 'MGA') return 'mga';
    if (firstLine === 'RV3DLUT') return 'rv3d';
    if (firstLine === 'RVCHANNELLUT') return 'rv_channel';
    if (firstLine.startsWith('Vectorfield')) return 'nuke_nk';
    if (firstLine.startsWith('<?xml') && content.includes('<look>')) return 'look';
    if (content.includes('LUT_3D_SIZE') || content.includes('LUT_1D_SIZE')) return 'cube';
    if (/^Version\s+\d+/m.test(content)) return 'houdini_lut';
  }

  return null;
}

/**
 * Universal LUT parser - detects format and delegates to the appropriate parser
 */
export function parseLUT(filename: string, content: string): LUT {
  const format = detectLUTFormat(filename, content);

  if (!format) {
    throw new Error(`Unsupported LUT format: ${filename}`);
  }

  switch (format) {
    case 'cube':
      return parseCubeLUT(content);
    case '3dl':
      return parse3DLLUT(content);
    case 'csp':
      return parseCSPLUT(content);
    case 'itx':
      return parseITXLUT(content);
    case 'look':
      return parseLookLUT(content);
    case 'houdini_lut':
      return parseHoudiniLUT(content);
    case 'nuke_nk':
      return parseNukeLUT(content);
    case 'mga':
      return parseMGALUT(content);
    case 'rv3d':
      return parseRV3DLUT(content);
    case 'rv_channel':
      return parseRVChannelLUT(content);
  }
}
