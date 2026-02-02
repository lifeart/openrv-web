/**
 * EXR (OpenEXR) File Format Decoder
 *
 * Supports:
 * - Half-float (16-bit) and float (32-bit) pixel data
 * - RGBA, RGB, and Y (grayscale) channels
 * - Scanline images (tiled images not yet supported)
 * - Uncompressed (NONE), RLE, ZIP, and ZIPS compression
 * - Data window / display window handling
 *
 * Not yet supported:
 * - Tiled images
 * - Multi-part EXR files
 * - PIZ, PXR24, B44, B44A, DWAA, DWAB compression
 *
 * Based on the OpenEXR file format specification.
 */

import { IPImage, ImageMetadata } from '../core/image/Image';

// EXR magic number
const EXR_MAGIC = 0x01312f76;

// Compression types
export enum EXRCompression {
  NONE = 0,
  RLE = 1,
  ZIPS = 2,
  ZIP = 3,
  PIZ = 4,
  PXR24 = 5,
  B44 = 6,
  B44A = 7,
  DWAA = 8,
  DWAB = 9,
}

// Channel pixel types
export enum EXRPixelType {
  UINT = 0,
  HALF = 1,
  FLOAT = 2,
}

// Line order
export enum EXRLineOrder {
  INCREASING_Y = 0,
  DECREASING_Y = 1,
  RANDOM_Y = 2,
}

export interface EXRChannel {
  name: string;
  pixelType: EXRPixelType;
  pLinear: number;
  xSampling: number;
  ySampling: number;
}

export interface EXRBox2i {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface EXRHeader {
  version: number;
  tiled: boolean;
  longNames: boolean;
  nonImage: boolean;
  multiPart: boolean;

  // Standard attributes
  channels: EXRChannel[];
  compression: EXRCompression;
  dataWindow: EXRBox2i;
  displayWindow: EXRBox2i;
  lineOrder: EXRLineOrder;
  pixelAspectRatio: number;

  // Optional attributes
  chromaticities?: Float32Array;
  screenWindowCenter?: [number, number];
  screenWindowWidth?: number;

  // All attributes for metadata
  attributes: Map<string, { type: string; value: unknown }>;
}

export interface EXRDecodeResult {
  width: number;
  height: number;
  data: Float32Array;
  channels: number;
  header: EXRHeader;
}

// Maximum supported image dimensions (prevent memory exhaustion)
const MAX_IMAGE_DIMENSION = 65536;
const MAX_IMAGE_PIXELS = 268435456; // 256 megapixels

// Maximum string length in EXR header (prevent denial of service)
const MAX_STRING_LENGTH = 256;

// Maximum attribute size (prevent memory exhaustion)
const MAX_ATTRIBUTE_SIZE = 16777216; // 16 MB

/**
 * DataView wrapper with position tracking and bounds checking
 */
class EXRDataReader {
  private view: DataView;
  private pos: number = 0;
  private littleEndian: boolean = true;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  get position(): number {
    return this.pos;
  }

  set position(value: number) {
    if (value < 0 || value > this.view.byteLength) {
      throw new Error(`Invalid position: ${value} (buffer size: ${this.view.byteLength})`);
    }
    this.pos = value;
  }

  get remaining(): number {
    return this.view.byteLength - this.pos;
  }

  get byteLength(): number {
    return this.view.byteLength;
  }

  private checkBounds(bytesNeeded: number): void {
    if (this.pos + bytesNeeded > this.view.byteLength) {
      throw new Error(
        `Unexpected end of EXR data: need ${bytesNeeded} bytes at position ${this.pos}, but only ${this.remaining} bytes remaining`
      );
    }
  }

  readUint8(): number {
    this.checkBounds(1);
    const value = this.view.getUint8(this.pos);
    this.pos += 1;
    return value;
  }

  readInt32(): number {
    this.checkBounds(4);
    const value = this.view.getInt32(this.pos, this.littleEndian);
    this.pos += 4;
    return value;
  }

  readUint32(): number {
    this.checkBounds(4);
    const value = this.view.getUint32(this.pos, this.littleEndian);
    this.pos += 4;
    return value;
  }

  readUint64(): bigint {
    this.checkBounds(8);
    const lo = BigInt(this.view.getUint32(this.pos, this.littleEndian));
    const hi = BigInt(this.view.getUint32(this.pos + 4, this.littleEndian));
    this.pos += 8;
    return lo + (hi << 32n);
  }

  readFloat32(): number {
    this.checkBounds(4);
    const value = this.view.getFloat32(this.pos, this.littleEndian);
    this.pos += 4;
    return value;
  }

  readHalf(): number {
    this.checkBounds(2);
    const h = this.view.getUint16(this.pos, this.littleEndian);
    this.pos += 2;
    return halfToFloat(h);
  }

  readString(): string {
    const start = this.pos;
    let length = 0;

    while (this.pos < this.view.byteLength && this.view.getUint8(this.pos) !== 0) {
      this.pos++;
      length++;
      if (length > MAX_STRING_LENGTH) {
        throw new Error(`String exceeds maximum length of ${MAX_STRING_LENGTH} bytes`);
      }
    }

    if (this.pos >= this.view.byteLength) {
      throw new Error('Unterminated string in EXR header');
    }

    const bytes = new Uint8Array(this.view.buffer, start, this.pos - start);
    this.pos++; // Skip null terminator
    return new TextDecoder().decode(bytes);
  }

  readBytes(length: number): Uint8Array {
    if (length < 0) {
      throw new Error(`Invalid byte length: ${length}`);
    }
    this.checkBounds(length);
    const bytes = new Uint8Array(this.view.buffer, this.pos, length);
    this.pos += length;
    return bytes;
  }

  skip(bytes: number): void {
    if (bytes < 0) {
      throw new Error(`Invalid skip size: ${bytes}`);
    }
    this.checkBounds(bytes);
    this.pos += bytes;
  }

  getBuffer(): ArrayBuffer {
    return this.view.buffer as ArrayBuffer;
  }
}

/**
 * Convert half-precision float (16-bit) to single-precision float (32-bit)
 */
function halfToFloat(h: number): number {
  const sign = (h & 0x8000) >> 15;
  const exponent = (h & 0x7c00) >> 10;
  const fraction = h & 0x03ff;

  if (exponent === 0) {
    if (fraction === 0) {
      // Zero
      return sign === 0 ? 0 : -0;
    }
    // Subnormal number
    const value = fraction / 1024;
    return sign === 0 ? value * Math.pow(2, -14) : -value * Math.pow(2, -14);
  }

  if (exponent === 31) {
    if (fraction === 0) {
      // Infinity
      return sign === 0 ? Infinity : -Infinity;
    }
    // NaN
    return NaN;
  }

  // Normalized number
  const value = 1 + fraction / 1024;
  const result = value * Math.pow(2, exponent - 15);
  return sign === 0 ? result : -result;
}

/**
 * Parse EXR header
 */
function parseHeader(reader: EXRDataReader): EXRHeader {
  // Read and verify magic number
  const magic = reader.readUint32();
  if (magic !== EXR_MAGIC) {
    throw new Error('Invalid EXR file: wrong magic number');
  }

  // Read version field
  const versionField = reader.readUint32();
  const version = versionField & 0xff;
  const tiled = (versionField & 0x200) !== 0;
  const longNames = (versionField & 0x400) !== 0;
  const nonImage = (versionField & 0x800) !== 0;
  const multiPart = (versionField & 0x1000) !== 0;

  if (version !== 2) {
    throw new Error(`Unsupported EXR version: ${version}`);
  }

  const header: EXRHeader = {
    version,
    tiled,
    longNames,
    nonImage,
    multiPart,
    channels: [],
    compression: EXRCompression.NONE,
    dataWindow: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
    displayWindow: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
    lineOrder: EXRLineOrder.INCREASING_Y,
    pixelAspectRatio: 1,
    attributes: new Map(),
  };

  // Track which required attributes we've seen
  let hasChannels = false;
  let hasDataWindow = false;
  let hasDisplayWindow = false;

  // Read attributes
  while (true) {
    const attrName = reader.readString();
    if (attrName === '') {
      break; // End of header
    }

    const attrType = reader.readString();
    const attrSize = reader.readInt32();

    // Validate attribute size
    if (attrSize < 0) {
      throw new Error(`Invalid negative attribute size for '${attrName}': ${attrSize}`);
    }
    if (attrSize > MAX_ATTRIBUTE_SIZE) {
      throw new Error(
        `Attribute '${attrName}' size ${attrSize} exceeds maximum of ${MAX_ATTRIBUTE_SIZE}`
      );
    }

    const attrStart = reader.position;

    // Parse known attributes
    switch (attrName) {
      case 'channels':
        header.channels = parseChannels(reader, attrSize);
        hasChannels = true;
        break;
      case 'compression':
        header.compression = reader.readUint8() as EXRCompression;
        break;
      case 'dataWindow':
        header.dataWindow = parseBox2i(reader);
        hasDataWindow = true;
        break;
      case 'displayWindow':
        header.displayWindow = parseBox2i(reader);
        hasDisplayWindow = true;
        break;
      case 'lineOrder':
        header.lineOrder = reader.readUint8() as EXRLineOrder;
        break;
      case 'pixelAspectRatio':
        header.pixelAspectRatio = reader.readFloat32();
        break;
      case 'screenWindowCenter':
        header.screenWindowCenter = [reader.readFloat32(), reader.readFloat32()];
        break;
      case 'screenWindowWidth':
        header.screenWindowWidth = reader.readFloat32();
        break;
      case 'chromaticities':
        header.chromaticities = new Float32Array(8);
        for (let i = 0; i < 8; i++) {
          header.chromaticities[i] = reader.readFloat32();
        }
        break;
      default:
        // Store unknown attributes as raw data
        header.attributes.set(attrName, {
          type: attrType,
          value: reader.readBytes(attrSize),
        });
        break;
    }

    // Ensure we've read the correct number of bytes
    reader.position = attrStart + attrSize;
  }

  // Validate required attributes are present
  if (!hasChannels) {
    throw new Error('Missing required EXR attribute: channels');
  }
  if (!hasDataWindow) {
    throw new Error('Missing required EXR attribute: dataWindow');
  }
  if (!hasDisplayWindow) {
    throw new Error('Missing required EXR attribute: displayWindow');
  }

  // Validate dataWindow dimensions
  const dw = header.dataWindow;
  const width = dw.xMax - dw.xMin + 1;
  const height = dw.yMax - dw.yMin + 1;

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid EXR dimensions: ${width}x${height} (dataWindow: ${dw.xMin},${dw.yMin} to ${dw.xMax},${dw.yMax})`);
  }

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new Error(
      `EXR dimensions ${width}x${height} exceed maximum of ${MAX_IMAGE_DIMENSION}x${MAX_IMAGE_DIMENSION}`
    );
  }

  const totalPixels = width * height;
  if (totalPixels > MAX_IMAGE_PIXELS) {
    throw new Error(
      `EXR image has ${totalPixels} pixels, exceeding maximum of ${MAX_IMAGE_PIXELS}`
    );
  }

  // Validate channels
  if (header.channels.length === 0) {
    throw new Error('EXR file has no channels');
  }

  // NOTE: Do NOT sort header.channels - they must remain in file order
  // because EXR stores pixel data in alphabetical channel order.
  // The output channel mapping is handled in decodeScanlineImage.

  return header;
}

/**
 * Parse channels attribute
 */
function parseChannels(reader: EXRDataReader, size: number): EXRChannel[] {
  const channels: EXRChannel[] = [];
  const endPos = reader.position + size;

  // Sanity check: limit number of channels
  const MAX_CHANNELS = 128;

  while (reader.position < endPos && channels.length < MAX_CHANNELS) {
    const name = reader.readString();
    if (name === '' || reader.position >= endPos) {
      break;
    }

    const pixelType = reader.readInt32();

    // Validate pixel type - only HALF and FLOAT are supported
    // UINT (type 0) is defined in EXR spec but not supported by this decoder
    if (pixelType === EXRPixelType.UINT) {
      throw new Error(`Unsupported pixel type UINT for channel '${name}'. Only HALF and FLOAT are supported.`);
    }
    if (pixelType !== EXRPixelType.HALF && pixelType !== EXRPixelType.FLOAT) {
      throw new Error(`Invalid pixel type ${pixelType} for channel '${name}'`);
    }

    const pLinear = reader.readUint8();
    reader.skip(3); // Reserved
    const xSampling = reader.readInt32();
    const ySampling = reader.readInt32();

    // Validate sampling (must be positive)
    if (xSampling <= 0 || ySampling <= 0) {
      throw new Error(
        `Invalid sampling for channel '${name}': xSampling=${xSampling}, ySampling=${ySampling}`
      );
    }

    channels.push({
      name,
      pixelType: pixelType as EXRPixelType,
      pLinear,
      xSampling,
      ySampling,
    });
  }

  return channels;
}

/**
 * Parse Box2i (bounding box)
 */
function parseBox2i(reader: EXRDataReader): EXRBox2i {
  return {
    xMin: reader.readInt32(),
    yMin: reader.readInt32(),
    xMax: reader.readInt32(),
    yMax: reader.readInt32(),
  };
}

/**
 * Decompress data based on compression type
 */
async function decompressData(
  compressedData: Uint8Array,
  compression: EXRCompression,
  uncompressedSize: number
): Promise<Uint8Array> {
  switch (compression) {
    case EXRCompression.NONE:
      return compressedData;

    case EXRCompression.ZIPS:
    case EXRCompression.ZIP:
      return await decompressZlib(compressedData, uncompressedSize);

    case EXRCompression.PIZ:
      return decompressPIZ(compressedData, uncompressedSize);

    case EXRCompression.RLE:
      return decompressRLE(compressedData, uncompressedSize);

    default:
      throw new Error(`Unsupported EXR compression: ${compression}`);
  }
}

/**
 * Decompress zlib/deflate data using DecompressionStream
 */
async function decompressZlib(
  compressedData: Uint8Array,
  _uncompressedSize: number
): Promise<Uint8Array> {
  // Try using DecompressionStream if available
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();

      // Write compressed data - need to create a new Uint8Array to ensure ArrayBuffer type
      writer.write(new Uint8Array(compressedData));
      writer.close();

      // Read decompressed data
      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
      }

      // Combine chunks
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      // Apply EXR's predictor reconstruction
      return reconstructPredictor(result);
    } catch {
      // Fall through to manual decompression
    }
  }

  // Fallback: simple deflate implementation for small files
  // For production, you'd want a proper zlib library
  throw new Error('ZIP decompression requires DecompressionStream support');
}

/**
 * Reconstruct data after zip decompression (predictor/delta decoding)
 */
function reconstructPredictor(data: Uint8Array): Uint8Array {
  // EXR uses a predictor to improve compression
  // After decompression, we need to undo the prediction
  const result = new Uint8Array(data.length);

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result[i] = data[i]!;
    } else {
      result[i] = (data[i]! + result[i - 1]!) & 0xff;
    }
  }

  // Interleave reconstruction
  const half = Math.floor(result.length / 2);
  const final = new Uint8Array(result.length);

  for (let i = 0; i < half; i++) {
    final[i * 2] = result[i]!;
    final[i * 2 + 1] = result[half + i]!;
  }

  if (result.length % 2 === 1) {
    final[final.length - 1] = result[result.length - 1]!;
  }

  return final;
}

/**
 * Decompress RLE data
 */
function decompressRLE(compressedData: Uint8Array, uncompressedSize: number): Uint8Array {
  const result = new Uint8Array(uncompressedSize);
  let srcPos = 0;
  let dstPos = 0;

  while (srcPos < compressedData.length && dstPos < uncompressedSize) {
    const count = compressedData[srcPos]!;
    srcPos++;

    if (count > 127) {
      // Run of same value
      const runLength = count - 127;
      if (srcPos >= compressedData.length) {
        // Corrupted RLE data - missing value byte
        break;
      }
      const value = compressedData[srcPos]!;
      srcPos++;

      for (let i = 0; i < runLength && dstPos < uncompressedSize; i++) {
        result[dstPos++] = value;
      }
    } else {
      // Literal run
      const runLength = count + 1;

      for (let i = 0; i < runLength && dstPos < uncompressedSize && srcPos < compressedData.length; i++) {
        result[dstPos++] = compressedData[srcPos++]!;
      }
    }
  }

  return result;
}

/**
 * Decompress PIZ data (Wavelet compression)
 * This is a simplified implementation - PIZ uses Huffman + wavelet transform
 */
function decompressPIZ(_compressedData: Uint8Array, _uncompressedSize: number): Uint8Array {
  // PIZ compression is complex - it involves:
  // 1. Huffman decoding
  // 2. LUT lookup
  // 3. Wavelet reconstruction

  // For a complete implementation, you would need to port the OpenEXR PIZ codec
  // This is a placeholder that indicates PIZ support is needed
  throw new Error('PIZ compression support requires full wavelet decoder implementation. Please use uncompressed or ZIP compressed EXR files.');
}

/**
 * Decode scanline image data
 */
async function decodeScanlineImage(
  reader: EXRDataReader,
  header: EXRHeader
): Promise<Float32Array> {
  const dataWindow = header.dataWindow;
  const width = dataWindow.xMax - dataWindow.xMin + 1;
  const height = dataWindow.yMax - dataWindow.yMin + 1;

  // Determine channels to extract (prioritize R, G, B, A)
  const channelMap = new Map<string, EXRChannel>();
  for (const ch of header.channels) {
    channelMap.set(ch.name, ch);
  }

  const outputChannels = ['R', 'G', 'B', 'A'].filter((name) => channelMap.has(name));
  if (outputChannels.length === 0) {
    // Try Y for grayscale
    if (channelMap.has('Y')) {
      outputChannels.push('Y');
    } else {
      throw new Error('No supported channels found in EXR file');
    }
  }

  const numOutputChannels = outputChannels.length >= 3 ? 4 : outputChannels.length; // Always output RGBA
  const output = new Float32Array(width * height * numOutputChannels);

  // Initialize alpha to 1 if not present
  if (!channelMap.has('A') && numOutputChannels === 4) {
    for (let i = 3; i < output.length; i += 4) {
      output[i] = 1.0;
    }
  }

  // Calculate bytes per pixel for each channel
  const bytesPerChannel: number[] = [];
  for (const name of outputChannels) {
    const ch = channelMap.get(name)!;
    bytesPerChannel.push(ch.pixelType === EXRPixelType.HALF ? 2 : 4);
  }

  // Calculate scanline size in bytes
  const scanlineBytes = header.channels.reduce((sum, ch) => {
    const bytes = ch.pixelType === EXRPixelType.HALF ? 2 : 4;
    return sum + bytes * width;
  }, 0);

  // Lines per block depends on compression
  const linesPerBlock =
    header.compression === EXRCompression.ZIP ||
    header.compression === EXRCompression.PIZ
      ? 16
      : 1;

  // Read offset table (for scanline images)
  const numBlocks = Math.ceil(height / linesPerBlock);
  const offsets: bigint[] = [];

  for (let i = 0; i < numBlocks; i++) {
    offsets.push(reader.readUint64());
  }

  // Read each scanline block
  for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
    const y = reader.readInt32(); // Y coordinate of first scanline in block
    const packedSize = reader.readInt32(); // Size of packed data

    const blockLines = Math.min(linesPerBlock, height - blockIdx * linesPerBlock);
    const uncompressedSize = blockLines * scanlineBytes;

    const packedData = reader.readBytes(packedSize);

    let unpackedData: Uint8Array;
    if (header.compression === EXRCompression.NONE) {
      unpackedData = packedData;
    } else {
      unpackedData = await decompressData(packedData, header.compression, uncompressedSize);
    }

    // Parse channel data from unpacked scanlines
    const dataView = new DataView(unpackedData.buffer, unpackedData.byteOffset, unpackedData.byteLength);

    for (let line = 0; line < blockLines; line++) {
      const outputY = y - dataWindow.yMin + line;
      if (outputY < 0 || outputY >= height) continue;

      // Each scanline stores all channels sequentially
      let channelOffset = 0;

      for (const ch of header.channels) {
        const channelBytes = ch.pixelType === EXRPixelType.HALF ? 2 : 4;
        const lineDataOffset = line * scanlineBytes + channelOffset;

        // Find output channel index
        const outputChIdx = outputChannels.indexOf(ch.name);

        if (outputChIdx !== -1) {
          for (let x = 0; x < width; x++) {
            const srcOffset = lineDataOffset + x * channelBytes;
            const dstIdx = (outputY * width + x) * numOutputChannels + outputChIdx;

            let value: number;
            if (ch.pixelType === EXRPixelType.HALF) {
              const half = dataView.getUint16(srcOffset, true);
              value = halfToFloat(half);
            } else {
              value = dataView.getFloat32(srcOffset, true);
            }

            output[dstIdx] = value;
          }
        }

        channelOffset += width * channelBytes;
      }
    }
  }

  return output;
}

/**
 * Main EXR decode function
 */
export async function decodeEXR(buffer: ArrayBuffer): Promise<EXRDecodeResult> {
  // Validate buffer size
  if (!buffer || buffer.byteLength < 8) {
    throw new Error('Invalid EXR file: buffer too small (minimum 8 bytes for magic + version)');
  }

  const reader = new EXRDataReader(buffer);

  // Parse header
  const header = parseHeader(reader);

  // Validate
  if (header.tiled) {
    throw new Error('Tiled EXR images are not yet supported');
  }

  if (header.multiPart) {
    throw new Error('Multi-part EXR files are not yet supported');
  }

  // Validate compression type is supported
  const supportedCompression = [
    EXRCompression.NONE,
    EXRCompression.RLE,
    EXRCompression.ZIPS,
    EXRCompression.ZIP,
  ];
  if (!supportedCompression.includes(header.compression)) {
    const compressionName = EXRCompression[header.compression] || `unknown(${header.compression})`;
    throw new Error(
      `Unsupported EXR compression type: ${compressionName}. Supported types: NONE, RLE, ZIP, ZIPS`
    );
  }

  // Decode image data
  const data = await decodeScanlineImage(reader, header);

  const dataWindow = header.dataWindow;
  const width = dataWindow.xMax - dataWindow.xMin + 1;
  const height = dataWindow.yMax - dataWindow.yMin + 1;

  return {
    width,
    height,
    data,
    channels: 4, // Always output RGBA
    header,
  };
}

/**
 * Convert EXR decode result to IPImage
 */
export function exrToIPImage(result: EXRDecodeResult, sourcePath?: string): IPImage {
  const metadata: ImageMetadata = {
    colorSpace: 'linear', // EXR is typically linear
    sourcePath,
    attributes: {
      compression: EXRCompression[result.header.compression],
      pixelAspectRatio: result.header.pixelAspectRatio,
      dataWindow: result.header.dataWindow,
      displayWindow: result.header.displayWindow,
    },
  };

  if (result.header.chromaticities) {
    metadata.attributes!.chromaticities = Array.from(result.header.chromaticities);
  }

  return new IPImage({
    width: result.width,
    height: result.height,
    channels: result.channels,
    dataType: 'float32',
    data: result.data.buffer as ArrayBuffer,
    metadata,
  });
}

/**
 * Check if a file is an EXR file by checking magic number
 */
export function isEXRFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) {
    return false;
  }
  const view = new DataView(buffer);
  return view.getUint32(0, true) === EXR_MAGIC;
}

/**
 * Get basic info from EXR header without fully decoding
 */
export function getEXRInfo(buffer: ArrayBuffer): {
  width: number;
  height: number;
  channels: string[];
  compression: string;
} | null {
  try {
    const reader = new EXRDataReader(buffer);
    const header = parseHeader(reader);

    const dataWindow = header.dataWindow;
    return {
      width: dataWindow.xMax - dataWindow.xMin + 1,
      height: dataWindow.yMax - dataWindow.yMin + 1,
      channels: header.channels.map((ch) => ch.name),
      compression: EXRCompression[header.compression] || 'UNKNOWN',
    };
  } catch {
    return null;
  }
}
