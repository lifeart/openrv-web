#!/usr/bin/env node
/**
 * Generate a test EXR file for E2E testing
 *
 * This creates a minimal valid EXR file with HDR gradient patterns
 * that can be used to verify EXR loading and HDR display.
 *
 * Run: node scripts/generate-test-exr.js
 */

const fs = require('fs');
const path = require('path');

// EXR magic number
const EXR_MAGIC = 0x01312f76;

// Compression types
const COMPRESSION_NONE = 0;

// Pixel type: HALF (16-bit float)
const PIXEL_TYPE_HALF = 1;

/**
 * Convert float to half-precision float (16-bit)
 */
function floatToHalf(value) {
  const floatView = new Float32Array(1);
  const int32View = new Int32Array(floatView.buffer);

  floatView[0] = value;
  const f = int32View[0];

  const sign = (f >> 16) & 0x8000;
  let exponent = ((f >> 23) & 0xff) - 127 + 15;
  let mantissa = (f >> 13) & 0x3ff;

  if (exponent <= 0) {
    if (exponent < -10) {
      return sign;
    }
    mantissa = ((f & 0x7fffff) | 0x800000) >> (1 - exponent);
    return sign | mantissa;
  }

  if (exponent >= 31) {
    return sign | 0x7c00;
  }

  return sign | (exponent << 10) | mantissa;
}

/**
 * Create a test EXR file
 */
function createTestEXR(width, height) {
  const parts = [];
  let offset = 0;

  function writeUint32(value) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value, 0);
    parts.push(buf);
    offset += 4;
  }

  function writeInt32(value) {
    const buf = Buffer.alloc(4);
    buf.writeInt32LE(value, 0);
    parts.push(buf);
    offset += 4;
  }

  function writeUint8(value) {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(value, 0);
    parts.push(buf);
    offset += 1;
  }

  function writeString(str) {
    const buf = Buffer.from(str + '\0', 'utf8');
    parts.push(buf);
    offset += buf.length;
  }

  function writeFloat32(value) {
    const buf = Buffer.alloc(4);
    buf.writeFloatLE(value, 0);
    parts.push(buf);
    offset += 4;
  }

  function writeHalf(value) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(floatToHalf(value), 0);
    parts.push(buf);
    offset += 2;
  }

  function writeUint64(value) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(value), 0);
    parts.push(buf);
    offset += 8;
  }

  // Magic number
  writeUint32(EXR_MAGIC);

  // Version (2) with no flags
  writeUint32(2);

  // === HEADER ATTRIBUTES ===
  const channels = ['A', 'B', 'G', 'R']; // Sorted alphabetically

  // channels attribute
  writeString('channels');
  writeString('chlist');
  let channelListSize = 1; // null terminator
  for (const ch of channels) {
    channelListSize += ch.length + 1 + 4 + 1 + 3 + 4 + 4;
  }
  writeInt32(channelListSize);

  for (const ch of channels) {
    writeString(ch);
    writeInt32(PIXEL_TYPE_HALF);
    writeUint8(0); // pLinear
    parts.push(Buffer.alloc(3)); // reserved
    offset += 3;
    writeInt32(1); // xSampling
    writeInt32(1); // ySampling
  }
  writeUint8(0); // End of channel list

  // compression attribute
  writeString('compression');
  writeString('compression');
  writeInt32(1);
  writeUint8(COMPRESSION_NONE);

  // dataWindow attribute
  writeString('dataWindow');
  writeString('box2i');
  writeInt32(16);
  writeInt32(0); // xMin
  writeInt32(0); // yMin
  writeInt32(width - 1); // xMax
  writeInt32(height - 1); // yMax

  // displayWindow attribute
  writeString('displayWindow');
  writeString('box2i');
  writeInt32(16);
  writeInt32(0);
  writeInt32(0);
  writeInt32(width - 1);
  writeInt32(height - 1);

  // lineOrder attribute
  writeString('lineOrder');
  writeString('lineOrder');
  writeInt32(1);
  writeUint8(0); // INCREASING_Y

  // pixelAspectRatio attribute
  writeString('pixelAspectRatio');
  writeString('float');
  writeInt32(4);
  writeFloat32(1.0);

  // screenWindowCenter attribute
  writeString('screenWindowCenter');
  writeString('v2f');
  writeInt32(8);
  writeFloat32(0.0);
  writeFloat32(0.0);

  // screenWindowWidth attribute
  writeString('screenWindowWidth');
  writeString('float');
  writeInt32(4);
  writeFloat32(1.0);

  // End of header
  writeUint8(0);

  // === OFFSET TABLE ===
  const bytesPerPixel = 2; // HALF
  const scanlineSize = channels.length * width * bytesPerPixel;
  const headerEnd = offset;
  const offsetTableSize = height * 8;
  const scanlineDataStart = headerEnd + offsetTableSize;

  for (let y = 0; y < height; y++) {
    const blockStart = scanlineDataStart + y * (8 + scanlineSize);
    writeUint64(blockStart);
  }

  // === SCANLINE DATA ===
  for (let y = 0; y < height; y++) {
    writeInt32(y); // Y coordinate
    writeInt32(scanlineSize); // Packed size

    // Generate HDR test pattern
    // Channels stored in alphabetical order: A, B, G, R
    for (const ch of channels) {
      for (let x = 0; x < width; x++) {
        let value = 0;
        const normalizedX = x / (width - 1);
        const normalizedY = y / (height - 1);

        switch (ch) {
          case 'R':
            // Red: horizontal gradient with HDR values (0 to 2.0)
            value = normalizedX * 2.0;
            break;
          case 'G':
            // Green: vertical gradient (0 to 1.5)
            value = normalizedY * 1.5;
            break;
          case 'B':
            // Blue: diagonal gradient (0 to 1.0)
            value = (normalizedX + normalizedY) / 2;
            break;
          case 'A':
            // Alpha: always 1.0
            value = 1.0;
            break;
        }

        writeHalf(value);
      }
    }
  }

  // Combine all parts
  return Buffer.concat(parts);
}

// Generate test EXR files
const outputDir = path.join(__dirname, '..', 'sample');

// Main test EXR (32x32 with HDR gradient)
const testExr = createTestEXR(32, 32);
fs.writeFileSync(path.join(outputDir, 'test_hdr.exr'), testExr);
console.log('Created sample/test_hdr.exr (32x32 HDR gradient)');

// Small test EXR for unit tests (4x4)
const smallExr = createTestEXR(4, 4);
fs.writeFileSync(path.join(outputDir, 'test_small.exr'), smallExr);
console.log('Created sample/test_small.exr (4x4)');

console.log('Done! EXR test files generated.');
