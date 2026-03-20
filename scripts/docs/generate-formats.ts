/**
 * Format support matrix documentation generator.
 *
 * Parses src/formats/DecoderRegistry.ts to generate docs/generated/format-support.md
 */

import { readSourceFile, writeGeneratedFile, autoGenHeader } from './utils.js';

// ---- Types ----

interface FormatDescriptor {
  formatName: string;
  extensions: string[];
  hdr: boolean | 'varies';
  colorSpace: string;
  type: 'image' | 'video' | 'session';
  notes: string;
}

// ---- Parser ----

export function parseFormats(): FormatDescriptor[] {
  // Read source to verify the format names exist
  const source = readSourceFile('src/formats/DecoderRegistry.ts');

  // Extract BuiltinFormatName union members
  const unionMatch = source.match(/type\s+BuiltinFormatName\s*=\s*([^;]+);/);
  if (!unionMatch) throw new Error('Could not find BuiltinFormatName type');

  const formatNames = unionMatch[1]!
    .split('|')
    .map(s => s.trim().replace(/^'|'$/g, ''))
    .filter(s => s.length > 0);

  // Static metadata map (derived from source analysis)
  const metadata: Record<string, Omit<FormatDescriptor, 'formatName'>> = {
    'exr': {
      extensions: ['.exr', '.sxr'],
      hdr: true,
      colorSpace: 'linear',
      type: 'image',
      notes: 'OpenEXR format, most common in VFX',
    },
    'DPX': {
      extensions: ['.dpx'],
      hdr: false,
      colorSpace: 'log/linear',
      type: 'image',
      notes: 'Digital Picture Exchange format',
    },
    'Cineon': {
      extensions: ['.cin', '.cineon'],
      hdr: false,
      colorSpace: 'log/linear',
      type: 'image',
      notes: 'Kodak Cineon format',
    },
    'TIFF': {
      extensions: ['.tif', '.tiff'],
      hdr: true,
      colorSpace: 'linear',
      type: 'image',
      notes: 'Float 32-bit TIFF only',
    },
    'jpeg-gainmap': {
      extensions: ['.jpg', '.jpeg', '.jpe'],
      hdr: true,
      colorSpace: 'linear',
      type: 'image',
      notes: 'JPEG with MPF gainmap for HDR reconstruction',
    },
    'heic-gainmap': {
      extensions: ['.heic'],
      hdr: true,
      colorSpace: 'linear',
      type: 'image',
      notes: 'HEIC with gainmap for HDR reconstruction',
    },
    'avif-gainmap': {
      extensions: ['.avif'],
      hdr: true,
      colorSpace: 'linear',
      type: 'image',
      notes: 'AVIF with gainmap for HDR reconstruction',
    },
    'avif': {
      extensions: ['.avif'],
      hdr: false,
      colorSpace: 'sRGB',
      type: 'image',
      notes: 'Standard AVIF (non-gainmap)',
    },
    'raw-preview': {
      extensions: ['.cr2', '.nef', '.arw', '.dng', '.orf', '.pef', '.srw'],
      hdr: false,
      colorSpace: 'sRGB',
      type: 'image',
      notes: 'Embedded JPEG preview from camera RAW files',
    },
    'hdr': {
      extensions: ['.hdr', '.pic'],
      hdr: true,
      colorSpace: 'linear',
      type: 'image',
      notes: 'Radiance HDR (RGBE) format',
    },
    'jxl': {
      extensions: ['.jxl'],
      hdr: true,
      colorSpace: 'varies',
      type: 'image',
      notes: 'JPEG XL format',
    },
    'jp2': {
      extensions: ['.jp2', '.j2k', '.j2c'],
      hdr: true,
      colorSpace: 'varies',
      type: 'image',
      notes: 'JPEG 2000 / HTJ2K format',
    },
    'mxf': {
      extensions: ['.mxf'],
      hdr: 'varies',
      colorSpace: 'varies',
      type: 'video',
      notes: 'MXF container (metadata-only, no pixel decoding)',
    },
  };

  const formats: FormatDescriptor[] = [];
  for (const name of formatNames) {
    const meta = metadata[name];
    if (meta) {
      formats.push({ formatName: name, ...meta });
    } else {
      // Fallback for unknown formats
      formats.push({
        formatName: name,
        extensions: [],
        hdr: false,
        colorSpace: 'unknown',
        type: 'image',
        notes: '',
      });
    }
  }

  return formats;
}

// ---- Renderer ----

function hdrBadge(hdr: boolean | 'varies'): string {
  if (hdr === true) return 'Yes';
  if (hdr === 'varies') return 'Varies';
  return 'No';
}

export function renderFormats(formats: FormatDescriptor[]): string {
  let md = autoGenHeader('src/formats/DecoderRegistry.ts');
  md += '# Format Support Matrix\n\n';
  md += `OpenRV Web supports ${formats.length} image and video formats through its decoder registry.\n\n`;

  const imageFormats = formats.filter(f => f.type === 'image');
  const videoFormats = formats.filter(f => f.type === 'video');
  const sessionFormats = formats.filter(f => f.type === 'session');

  if (imageFormats.length > 0) {
    md += '## Image Formats\n\n';
    md += '| Format | Extensions | Color Space | HDR | Notes |\n';
    md += '|--------|-----------|-------------|-----|-------|\n';
    for (const f of imageFormats) {
      md += `| ${f.formatName} | ${f.extensions.join(', ')} | ${f.colorSpace} | ${hdrBadge(f.hdr)} | ${f.notes} |\n`;
    }
    md += '\n';
  }

  if (videoFormats.length > 0) {
    md += '## Video/Container Formats\n\n';
    md += '| Format | Extensions | Color Space | HDR | Notes |\n';
    md += '|--------|-----------|-------------|-----|-------|\n';
    for (const f of videoFormats) {
      md += `| ${f.formatName} | ${f.extensions.join(', ')} | ${f.colorSpace} | ${hdrBadge(f.hdr)} | ${f.notes} |\n`;
    }
    md += '\n';
  }

  if (sessionFormats.length > 0) {
    md += '## Session Formats\n\n';
    md += '| Format | Extensions | Color Space | HDR | Notes |\n';
    md += '|--------|-----------|-------------|-----|-------|\n';
    for (const f of sessionFormats) {
      md += `| ${f.formatName} | ${f.extensions.join(', ')} | ${f.colorSpace} | ${hdrBadge(f.hdr)} | ${f.notes} |\n`;
    }
    md += '\n';
  }

  md += '## Detection\n\n';
  md += 'Format detection uses magic bytes (file signatures) rather than file extensions. ';
  md += 'The `DecoderRegistry` iterates registered decoders in priority order, calling each decoder\'s ';
  md += '`canDecode()` check until a match is found. This ensures correct identification even when ';
  md += 'file extensions are missing or incorrect.\n';

  return md;
}

// ---- Entry Point ----

export function generateFormats(): { count: number } {
  const formats = parseFormats();
  const md = renderFormats(formats);
  writeGeneratedFile('format-support.md', md);

  console.log(`Generated format-support.md with ${formats.length} formats`);
  return { count: formats.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateFormats();
}
