#!/usr/bin/env node
/**
 * Generate a test image sequence for E2E testing
 *
 * This creates a series of PNG images with different colors per frame
 * that can be used to verify sequence detection and playback.
 *
 * Run: node scripts/generate-test-sequence.cjs
 */

const fs = require('fs');
const path = require('path');

// Output directory
const outputDir = path.join(__dirname, '..', 'sample', 'sequence');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Sequence parameters
const WIDTH = 64;
const HEIGHT = 64;
const START_FRAME = 1;
const END_FRAME = 10;
const PADDING = 4; // Zero-padded to 4 digits

// Colors for each frame (cycling through)
const COLORS = [
  '#ff0000', // Red
  '#ff7f00', // Orange
  '#ffff00', // Yellow
  '#00ff00', // Green
  '#0000ff', // Blue
  '#4b0082', // Indigo
  '#9400d3', // Violet
  '#ff1493', // Pink
  '#00ffff', // Cyan
  '#ffffff', // White
];

/**
 * Create a simple PNG using pure JavaScript (no external dependencies)
 * This is a minimal PNG encoder for test purposes
 */
function createSimplePNG(width, height, r, g, b) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // Bit depth
  ihdrData.writeUInt8(2, 9); // Color type (RGB)
  ihdrData.writeUInt8(0, 10); // Compression
  ihdrData.writeUInt8(0, 11); // Filter
  ihdrData.writeUInt8(0, 12); // Interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk (image data)
  // Create raw pixel data with filter bytes
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // Filter type: None
    for (let x = 0; x < width; x++) {
      rawData.push(r, g, b);
    }
  }

  // Compress with zlib (simple store - no compression for simplicity)
  const compressed = deflateStore(Buffer.from(rawData));
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * Create a PNG chunk
 */
function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBytes = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBytes, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBytes, data, crcBuf]);
}

/**
 * Simple deflate store (no compression)
 */
function deflateStore(data) {
  // zlib header
  const header = Buffer.from([0x78, 0x01]);

  // Split data into blocks (max 65535 bytes each)
  const blocks = [];
  let offset = 0;
  while (offset < data.length) {
    const remaining = data.length - offset;
    const blockSize = Math.min(remaining, 65535);
    const isLast = offset + blockSize >= data.length;

    const blockHeader = Buffer.alloc(5);
    blockHeader.writeUInt8(isLast ? 1 : 0, 0);
    blockHeader.writeUInt16LE(blockSize, 1);
    blockHeader.writeUInt16LE(blockSize ^ 0xffff, 3);

    blocks.push(blockHeader);
    blocks.push(data.slice(offset, offset + blockSize));
    offset += blockSize;
  }

  // Adler-32 checksum (stored as big-endian unsigned 32-bit)
  const adler = adler32(data) >>> 0; // Ensure unsigned
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(adler, 0);

  return Buffer.concat([header, ...blocks, checksum]);
}

/**
 * CRC-32 calculation
 */
function crc32(data) {
  let crc = 0xffffffff;
  const table = makeCrcTable();

  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }

  return crc ^ 0xffffffff;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
}

/**
 * Adler-32 calculation
 */
function adler32(data) {
  let a = 1;
  let b = 0;
  const MOD_ADLER = 65521;

  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % MOD_ADLER;
    b = (b + a) % MOD_ADLER;
  }

  return (b << 16) | a;
}

/**
 * Parse hex color to RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

// Generate sequence frames
console.log('Generating test image sequence...');

for (let frame = START_FRAME; frame <= END_FRAME; frame++) {
  const colorIndex = (frame - START_FRAME) % COLORS.length;
  const color = COLORS[colorIndex];
  const rgb = hexToRgb(color);

  // Create frame number with zero padding
  const frameStr = String(frame).padStart(PADDING, '0');
  const filename = `frame_${frameStr}.png`;
  const filepath = path.join(outputDir, filename);

  // Create the PNG
  const png = createSimplePNG(WIDTH, HEIGHT, rgb.r, rgb.g, rgb.b);
  fs.writeFileSync(filepath, png);

  console.log(`Created ${filename} (color: ${color})`);
}

console.log(`\nDone! Created ${END_FRAME - START_FRAME + 1} frames in sample/sequence/`);
console.log('Pattern: frame_####.png (frames 0001-0010)');
