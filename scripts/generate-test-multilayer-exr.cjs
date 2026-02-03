/**
 * Generate a test multi-layer EXR file for E2E tests
 * This creates an EXR with RGBA + diffuse + specular layers
 */

const fs = require('fs');
const path = require('path');

// EXR constants
const EXR_MAGIC = 0x01312f76;
const EXR_PIXEL_TYPE_HALF = 1;
const EXR_COMPRESSION_NONE = 0;

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
 * Create a multi-layer EXR file buffer
 */
function createMultiLayerEXR(options = {}) {
  const {
    width = 4,
    height = 4,
  } = options;

  // Channels: RGBA (default) + diffuse.RGB + specular.RGB
  const channels = [
    'A',           // Default alpha
    'B',           // Default blue
    'G',           // Default green
    'R',           // Default red
    'diffuse.B',
    'diffuse.G',
    'diffuse.R',
    'specular.B',
    'specular.G',
    'specular.R',
  ].sort(); // EXR stores channels alphabetically

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
    parts.push(Buffer.from([value]));
    offset += 1;
  }

  function writeString(str) {
    const bytes = Buffer.from(str, 'utf8');
    parts.push(bytes);
    parts.push(Buffer.from([0])); // null terminator
    offset += bytes.length + 1;
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
    buf.writeBigUInt64LE(value, 0);
    parts.push(buf);
    offset += 8;
  }

  // Magic number
  writeUint32(EXR_MAGIC);

  // Version (2) with flags
  writeUint32(2);

  // === HEADER ATTRIBUTES ===

  // channels attribute
  writeString('channels');
  writeString('chlist');

  // Calculate channel list size
  let channelListSize = 1; // null terminator
  for (const ch of channels) {
    channelListSize += ch.length + 1 + 4 + 1 + 3 + 4 + 4;
  }
  writeInt32(channelListSize);

  // Write channels (already sorted)
  for (const ch of channels) {
    writeString(ch);
    writeInt32(EXR_PIXEL_TYPE_HALF);
    writeUint8(0); // pLinear
    parts.push(Buffer.from([0, 0, 0])); // reserved
    offset += 3;
    writeInt32(1); // xSampling
    writeInt32(1); // ySampling
  }
  writeUint8(0); // End of channel list

  // compression attribute
  writeString('compression');
  writeString('compression');
  writeInt32(1);
  writeUint8(EXR_COMPRESSION_NONE);

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

  // End of header
  writeUint8(0);

  // === OFFSET TABLE ===
  const bytesPerPixel = 2; // HALF
  const scanlineSize = channels.length * width * bytesPerPixel;

  const headerEnd = offset;
  const offsetTableSize = height * 8;
  const scanlineDataStart = headerEnd + offsetTableSize;

  for (let y = 0; y < height; y++) {
    const blockStart = BigInt(scanlineDataStart + y * (8 + scanlineSize));
    writeUint64(blockStart);
  }

  // === SCANLINE DATA ===
  for (let y = 0; y < height; y++) {
    writeInt32(y); // Y coordinate
    writeInt32(scanlineSize); // Packed size

    // Write pixel data - channels are stored separately, in sorted order
    for (const ch of channels) {
      for (let x = 0; x < width; x++) {
        // Generate test values based on channel and position
        let value = 0;
        const t = (x + y * width) / (width * height);

        if (ch === 'R') value = 0.8; // Default RGBA - reddish
        else if (ch === 'G') value = 0.2;
        else if (ch === 'B') value = 0.2;
        else if (ch === 'A') value = 1.0;
        else if (ch === 'diffuse.R') value = 0.2; // Diffuse - greenish
        else if (ch === 'diffuse.G') value = 0.8;
        else if (ch === 'diffuse.B') value = 0.2;
        else if (ch === 'specular.R') value = 0.2; // Specular - bluish
        else if (ch === 'specular.G') value = 0.2;
        else if (ch === 'specular.B') value = 0.8;

        writeHalf(value);
      }
    }
  }

  // Combine all parts
  return Buffer.concat(parts);
}

// Generate the file
const outputPath = path.join(__dirname, '..', 'sample', 'test_multilayer.exr');
const buffer = createMultiLayerEXR({ width: 8, height: 8 });
fs.writeFileSync(outputPath, buffer);

console.log(`Created multi-layer EXR test file: ${outputPath}`);
console.log(`File size: ${buffer.length} bytes`);
console.log('Channels: R, G, B, A, diffuse.R, diffuse.G, diffuse.B, specular.R, specular.G, specular.B');
