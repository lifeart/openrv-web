#!/usr/bin/env node
/**
 * Generate minimal valid binary test fixture files for DPX, Cineon, and Float TIFF formats.
 * These are used by e2e/hdr-format-loading.spec.ts tests.
 *
 * Usage: node scripts/generate-test-fixtures.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleDir = join(__dirname, '..', 'sample');

// Ensure sample directory exists
mkdirSync(sampleDir, { recursive: true });

// ============================================================================
// DPX Generator (adapted from DPXDecoder.test.ts createTestDPX)
// ============================================================================

const DPX_MAGIC_BE = 0x53445058; // "SDPX"

function createTestDPX(options = {}) {
  const {
    width = 4,
    height = 4,
    bitDepth = 10,
    bigEndian = true,
    transfer = 0, // 0=linear
    channels = 3,
    dataOffset = 2048,
  } = options;

  const componentsPerRow = width * channels;
  const totalComponents = width * height * channels;
  let pixelDataSize;
  if (bitDepth === 10) {
    const wordsPerRow = Math.ceil(componentsPerRow / 3);
    pixelDataSize = wordsPerRow * height * 4;
  } else if (bitDepth === 8) {
    pixelDataSize = totalComponents;
  } else if (bitDepth === 12 || bitDepth === 16) {
    pixelDataSize = totalComponents * 2;
  } else {
    pixelDataSize = totalComponents * 2;
  }

  const totalSize = dataOffset + pixelDataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const le = !bigEndian;

  // Magic number (offset 0)
  view.setUint32(0, DPX_MAGIC_BE, false);

  // Image data offset (offset 4)
  view.setUint32(4, dataOffset, le);

  // File size (offset 16)
  view.setUint32(16, totalSize, le);

  // Number of image elements (offset 768)
  view.setUint16(768, 1, le);

  // Width (offset 772)
  view.setUint32(772, width, le);

  // Height (offset 776)
  view.setUint32(776, height, le);

  // Descriptor (offset 800): 50=RGB, 51=RGBA
  view.setUint8(800, channels === 4 ? 51 : 50);

  // Transfer function (offset 801)
  view.setUint8(801, transfer);

  // Bit depth (offset 803)
  view.setUint8(803, bitDepth);

  // Packing (offset 804): 1 = Method A
  view.setUint16(804, 1, le);

  // Fill pixel data with test values (gradient pattern)
  if (bitDepth === 10) {
    const pixelView = new DataView(buffer, dataOffset);
    const wordsPerRow = Math.ceil(componentsPerRow / 3);
    let componentIdx = 0;
    for (let row = 0; row < height; row++) {
      for (let w = 0; w < wordsPerRow; w++) {
        const c0 = componentIdx < componentsPerRow * (row + 1) ? Math.min(1023, (componentIdx * 64) % 1024) : 0;
        componentIdx++;
        const c1 = componentIdx < componentsPerRow * (row + 1) ? Math.min(1023, (componentIdx * 64) % 1024) : 0;
        componentIdx++;
        const c2 = componentIdx < componentsPerRow * (row + 1) ? Math.min(1023, (componentIdx * 64) % 1024) : 0;
        componentIdx++;
        const word = (c0 << 22) | (c1 << 12) | (c2 << 2);
        pixelView.setUint32((row * wordsPerRow + w) * 4, word, le);
      }
      componentIdx = componentsPerRow * (row + 1);
    }
  }

  return buffer;
}

// ============================================================================
// Cineon Generator (adapted from CineonDecoder.test.ts createTestCineon)
// ============================================================================

const CINEON_MAGIC = 0x802a5fd7;

function createTestCineon(options = {}) {
  const {
    width = 4,
    height = 4,
    dataOffset = 1024,
  } = options;

  const channels = 3;
  const totalComponents = width * height * channels;
  const totalWords = Math.ceil(totalComponents / 3);
  const pixelDataSize = totalWords * 4;
  const totalSize = dataOffset + pixelDataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Magic number (offset 0) - big endian
  view.setUint32(0, CINEON_MAGIC, false);

  // Image data offset (offset 4) - big endian
  view.setUint32(4, dataOffset, false);

  // Total file size (offset 20) - big endian
  view.setUint32(20, totalSize, false);

  // Width (offset 200) - big endian
  view.setUint32(200, width, false);

  // Height (offset 204) - big endian
  view.setUint32(204, height, false);

  // Bit depth (offset 213) - always 10
  view.setUint8(213, 10);

  // Fill pixel data with test values (10-bit packed, big-endian)
  const pixelView = new DataView(buffer, dataOffset);
  for (let w = 0; w < totalWords; w++) {
    const c0 = Math.min(1023, (w * 3 + 100) % 1024);
    const c1 = Math.min(1023, (w * 3 + 200) % 1024);
    const c2 = Math.min(1023, (w * 3 + 300) % 1024);
    const word = (c0 << 22) | (c1 << 12) | (c2 << 2);
    pixelView.setUint32(w * 4, word, false);
  }

  return buffer;
}

// ============================================================================
// Float TIFF Generator (adapted from TIFFFloatDecoder.test.ts createTestFloatTIFF)
// ============================================================================

const TIFF_LE = 0x4949; // "II"
const TIFF_MAGIC = 42;

function createTestFloatTIFF(options = {}) {
  const {
    width = 4,
    height = 4,
    channels = 3,
    bigEndian = false,
    sampleFormat = 3, // float
    bitsPerSample = 32,
    compression = 1, // uncompressed
  } = options;

  const le = !bigEndian;
  const bytesPerSample = bitsPerSample / 8;
  const pixelDataSize = width * height * channels * bytesPerSample;

  const numTags = 10;
  const ifdOffset = 8;
  const ifdSize = 2 + numTags * 12 + 4;
  const extraDataStart = ifdOffset + ifdSize;

  const needsBPSArray = channels > 2;
  const bpsArrayOffset = extraDataStart;
  const bpsArraySize = needsBPSArray ? channels * 2 : 0;

  const pixelDataOffset = extraDataStart + bpsArraySize;
  const totalSize = pixelDataOffset + pixelDataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // TIFF Header
  view.setUint16(0, bigEndian ? 0x4d4d : TIFF_LE, false);
  view.setUint16(2, TIFF_MAGIC, le);
  view.setUint32(4, ifdOffset, le);

  // Write IFD
  let pos = ifdOffset;
  view.setUint16(pos, numTags, le);
  pos += 2;

  function writeTag(id, type, count, value) {
    view.setUint16(pos, id, le);
    view.setUint16(pos + 2, type, le);
    view.setUint32(pos + 4, count, le);
    if (type === 3 && count <= 2) {
      view.setUint16(pos + 8, value, le);
    } else if (type === 4 && count === 1) {
      view.setUint32(pos + 8, value, le);
    } else {
      view.setUint32(pos + 8, value, le);
    }
    pos += 12;
  }

  // Tags in ascending order
  writeTag(256, 4, 1, width);          // ImageWidth
  writeTag(257, 4, 1, height);         // ImageLength
  writeTag(258, 3, needsBPSArray ? channels : 1, needsBPSArray ? bpsArrayOffset : bitsPerSample); // BitsPerSample
  writeTag(259, 3, 1, compression);    // Compression
  writeTag(262, 3, 1, 2);             // PhotometricInterpretation = RGB
  writeTag(273, 4, 1, pixelDataOffset); // StripOffsets
  writeTag(277, 3, 1, channels);       // SamplesPerPixel
  writeTag(278, 4, 1, height);         // RowsPerStrip
  writeTag(279, 4, 1, pixelDataSize);  // StripByteCounts
  writeTag(339, 3, 1, sampleFormat);   // SampleFormat

  // Next IFD offset (0 = no more)
  view.setUint32(pos, 0, le);

  // Write BitsPerSample array
  if (needsBPSArray) {
    for (let i = 0; i < channels; i++) {
      view.setUint16(bpsArrayOffset + i * 2, bitsPerSample, le);
    }
  }

  // Write pixel data with HDR gradient pattern
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIdx = (y * width + x) * channels;
      for (let c = 0; c < channels; c++) {
        // Create values that span HDR range (0.0 to ~2.0)
        const value = (x + y * width + c) / (width * height * channels) * 2.0;
        view.setFloat32(pixelDataOffset + (pixelIdx + c) * 4, value, le);
      }
    }
  }

  return buffer;
}

// ============================================================================
// Generate and write files
// ============================================================================

const dpxBuffer = createTestDPX({ width: 4, height: 4, bitDepth: 10 });
const dpxPath = join(sampleDir, 'test.dpx');
writeFileSync(dpxPath, Buffer.from(dpxBuffer));
console.log(`Created ${dpxPath} (${dpxBuffer.byteLength} bytes)`);

const cineonBuffer = createTestCineon({ width: 4, height: 4 });
const cineonPath = join(sampleDir, 'test.cin');
writeFileSync(cineonPath, Buffer.from(cineonBuffer));
console.log(`Created ${cineonPath} (${cineonBuffer.byteLength} bytes)`);

const tiffBuffer = createTestFloatTIFF({ width: 4, height: 4, channels: 3 });
const tiffPath = join(sampleDir, 'test_float.tif');
writeFileSync(tiffPath, Buffer.from(tiffBuffer));
console.log(`Created ${tiffPath} (${tiffBuffer.byteLength} bytes)`);

console.log('\nAll test fixtures generated successfully.');
