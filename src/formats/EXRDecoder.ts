/**
 * EXR (OpenEXR) File Format Decoder
 *
 * Supports:
 * - Half-float (16-bit) and float (32-bit) pixel data
 * - RGBA, RGB, and Y (grayscale) channels
 * - Scanline images (tiled images not yet supported)
 * - Uncompressed (NONE), RLE, ZIP, ZIPS, PIZ, DWAA, and DWAB compression
 * - Data window / display window handling
 * - Multi-part EXR files (scanline parts; part selection via partIndex)
 *
 * Not yet supported:
 * - Tiled images
 * - Deep data (deepscanline / deeptile)
 * - PXR24, B44, B44A compression
 *
 * Based on the OpenEXR file format specification.
 */

import { IPImage, ImageMetadata } from '../core/image/Image';
import { decompressPIZ } from './EXRPIZCodec';
import { decompressDWA } from './EXRDWACodec';
import { validateImageDimensions } from './shared';
import { DecoderError } from '../core/errors';

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

  // Multi-part: type attribute ("scanlineimage", "tiledimage", "deepscanline", "deeptile")
  type?: string;
  // Multi-part: name attribute
  name?: string;
  // Multi-part: view attribute (for stereo: "left" / "right")
  view?: string;

  // All attributes for metadata
  attributes: Map<string, { type: string; value: unknown }>;
}

export interface EXRDecodeResult {
  width: number;
  height: number;
  data: Float32Array;
  channels: number;
  header: EXRHeader;
  /** Available layers in this EXR file */
  layers?: EXRLayerInfo[];
  /** The layer that was decoded (undefined = default RGBA) */
  decodedLayer?: string;
  /** For multi-part files: info about all available parts */
  parts?: EXRPartInfo[];
  /** For multi-part files: which part index was decoded */
  decodedPartIndex?: number;
}

/**
 * Information about a part in a multi-part EXR file
 */
export interface EXRPartInfo {
  /** Part index (0-based) */
  index: number;
  /** Part name (from "name" attribute) */
  name?: string;
  /** Part type (e.g., "scanlineimage", "tiledimage") */
  type?: string;
  /** View name for stereo (e.g., "left", "right") */
  view?: string;
  /** Channel names in this part */
  channels: string[];
  /** Data window for this part */
  dataWindow: EXRBox2i;
  /** Compression used for this part */
  compression: string;
}

/**
 * Information about a layer/AOV in a multi-layer EXR file
 */
export interface EXRLayerInfo {
  /** Layer name (e.g., "diffuse", "specular", "beauty") */
  name: string;
  /** Channel names within this layer (e.g., ["R", "G", "B", "A"]) */
  channels: string[];
  /** Full channel names (e.g., ["diffuse.R", "diffuse.G", "diffuse.B"]) */
  fullChannelNames: string[];
}

/**
 * Channel remapping configuration
 * Allows mapping arbitrary EXR channels to RGBA output
 */
export interface EXRChannelRemapping {
  /** Source channel name to map to Red output (e.g., "diffuse.R" or "specular.G") */
  red?: string;
  /** Source channel name to map to Green output */
  green?: string;
  /** Source channel name to map to Blue output */
  blue?: string;
  /** Source channel name to map to Alpha output */
  alpha?: string;
}

/**
 * Options for decoding EXR files
 */
export interface EXRDecodeOptions {
  /** Specific layer to decode (e.g., "diffuse"). If not specified, decodes default RGBA. */
  layer?: string;
  /** Custom channel remapping configuration */
  channelRemapping?: EXRChannelRemapping;
  /** For multi-part EXR: index of the part to decode (0-based). Defaults to 0 (first part). */
  partIndex?: number;
}

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
      throw new DecoderError('EXR', `Invalid position: ${value} (buffer size: ${this.view.byteLength})`);
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
      throw new DecoderError('EXR',
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
        throw new DecoderError('EXR', `String exceeds maximum length of ${MAX_STRING_LENGTH} bytes`);
      }
    }

    if (this.pos >= this.view.byteLength) {
      throw new DecoderError('EXR', 'Unterminated string in EXR header');
    }

    const bytes = new Uint8Array(this.view.buffer, start, this.pos - start);
    this.pos++; // Skip null terminator
    return new TextDecoder().decode(bytes);
  }

  readBytes(length: number): Uint8Array {
    if (length < 0) {
      throw new DecoderError('EXR', `Invalid byte length: ${length}`);
    }
    this.checkBounds(length);
    const bytes = new Uint8Array(this.view.buffer, this.pos, length);
    this.pos += length;
    return bytes;
  }

  skip(bytes: number): void {
    if (bytes < 0) {
      throw new DecoderError('EXR', `Invalid skip size: ${bytes}`);
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
 * Read a string value attribute (null-terminated string within known size)
 */
function readStringValue(reader: EXRDataReader, size: number): string {
  const bytes = reader.readBytes(size);
  // Remove null terminator if present
  let end = bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) {
      end = i;
      break;
    }
  }
  return new TextDecoder().decode(bytes.subarray(0, end));
}

/**
 * Read the version/flags field from the EXR file and return parsed version info.
 */
function parseVersionField(reader: EXRDataReader): {
  version: number;
  tiled: boolean;
  longNames: boolean;
  nonImage: boolean;
  multiPart: boolean;
} {
  const magic = reader.readUint32();
  if (magic !== EXR_MAGIC) {
    throw new DecoderError('EXR', 'Invalid EXR file: wrong magic number');
  }

  const versionField = reader.readUint32();
  const version = versionField & 0xff;
  const tiled = (versionField & 0x200) !== 0;
  const longNames = (versionField & 0x400) !== 0;
  const nonImage = (versionField & 0x800) !== 0;
  const multiPart = (versionField & 0x1000) !== 0;

  if (version !== 2) {
    throw new DecoderError('EXR', `Unsupported EXR version: ${version}`);
  }

  return { version, tiled, longNames, nonImage, multiPart };
}

/**
 * Parse attributes for one header (single-part or one part of multi-part).
 * Reads until the empty-string terminator.
 * Returns a partially-populated EXRHeader (without version flags).
 */
function parseHeaderAttributes(reader: EXRDataReader): {
  header: Omit<EXRHeader, 'version' | 'tiled' | 'longNames' | 'nonImage' | 'multiPart'>;
  hasChannels: boolean;
  hasDataWindow: boolean;
  hasDisplayWindow: boolean;
} {
  const header: Omit<EXRHeader, 'version' | 'tiled' | 'longNames' | 'nonImage' | 'multiPart'> = {
    channels: [],
    compression: EXRCompression.NONE,
    dataWindow: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
    displayWindow: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
    lineOrder: EXRLineOrder.INCREASING_Y,
    pixelAspectRatio: 1,
    attributes: new Map(),
  };

  let hasChannels = false;
  let hasDataWindow = false;
  let hasDisplayWindow = false;

  while (true) {
    const attrName = reader.readString();
    if (attrName === '') {
      break; // End of this header
    }

    const attrType = reader.readString();
    const attrSize = reader.readInt32();

    if (attrSize < 0) {
      throw new DecoderError('EXR', `Invalid negative attribute size for '${attrName}': ${attrSize}`);
    }
    if (attrSize > MAX_ATTRIBUTE_SIZE) {
      throw new DecoderError('EXR',
        `Attribute '${attrName}' size ${attrSize} exceeds maximum of ${MAX_ATTRIBUTE_SIZE}`
      );
    }

    const attrStart = reader.position;

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
      case 'type':
        header.type = readStringValue(reader, attrSize);
        break;
      case 'name':
        header.name = readStringValue(reader, attrSize);
        break;
      case 'view':
        header.view = readStringValue(reader, attrSize);
        break;
      default:
        header.attributes.set(attrName, {
          type: attrType,
          value: reader.readBytes(attrSize),
        });
        break;
    }

    reader.position = attrStart + attrSize;
  }

  return { header, hasChannels, hasDataWindow, hasDisplayWindow };
}

/**
 * Validate a parsed header has the required attributes and valid dimensions.
 */
function validateHeaderAttributes(
  header: Omit<EXRHeader, 'version' | 'tiled' | 'longNames' | 'nonImage' | 'multiPart'>,
  hasChannels: boolean,
  hasDataWindow: boolean,
  hasDisplayWindow: boolean,
  partLabel?: string
): void {
  const prefix = partLabel ? `Part '${partLabel}': ` : '';

  if (!hasChannels) {
    throw new DecoderError('EXR', `${prefix}Missing required EXR attribute: channels`);
  }
  if (!hasDataWindow) {
    throw new DecoderError('EXR', `${prefix}Missing required EXR attribute: dataWindow`);
  }
  if (!hasDisplayWindow) {
    throw new DecoderError('EXR', `${prefix}Missing required EXR attribute: displayWindow`);
  }

  const dw = header.dataWindow;
  const width = dw.xMax - dw.xMin + 1;
  const height = dw.yMax - dw.yMin + 1;

  if (width <= 0 || height <= 0) {
    throw new DecoderError('EXR', `${prefix}Invalid EXR dimensions: ${width}x${height} (dataWindow: ${dw.xMin},${dw.yMin} to ${dw.xMax},${dw.yMax})`);
  }

  validateImageDimensions(width, height, 'EXR');

  if (header.channels.length === 0) {
    throw new DecoderError('EXR', `${prefix}EXR file has no channels`);
  }
}

/**
 * Parse EXR header (single-part file)
 */
function parseHeader(reader: EXRDataReader): EXRHeader {
  const versionInfo = parseVersionField(reader);

  const { header: attrs, hasChannels, hasDataWindow, hasDisplayWindow } = parseHeaderAttributes(reader);

  validateHeaderAttributes(attrs, hasChannels, hasDataWindow, hasDisplayWindow);

  const header: EXRHeader = {
    ...versionInfo,
    ...attrs,
  };

  return header;
}

/**
 * Maximum number of parts allowed in a multi-part EXR file
 */
const MAX_MULTI_PART_COUNT = 1024;

/**
 * Parse all part headers from a multi-part EXR file.
 * The reader should be positioned right after the version field.
 * Returns the version info and an array of per-part headers.
 */
function parseMultiPartHeaders(reader: EXRDataReader): {
  versionInfo: { version: number; tiled: boolean; longNames: boolean; nonImage: boolean; multiPart: boolean };
  partHeaders: EXRHeader[];
} {
  const versionInfo = parseVersionField(reader);

  const partHeaders: EXRHeader[] = [];

  // Read part headers. Each part header is terminated by an empty attribute name.
  // The list of part headers is terminated by another empty attribute name (empty header).
  while (partHeaders.length < MAX_MULTI_PART_COUNT) {
    // Peek at the next byte: if it's a null byte, we've reached the end of all headers
    const nextByte = reader.readUint8();
    if (nextByte === 0) {
      // Empty header = end of part headers
      break;
    }
    // Put back the byte by rewinding - we need to re-read it as part of the attribute name
    reader.position = reader.position - 1;

    const { header: attrs, hasChannels, hasDataWindow, hasDisplayWindow } = parseHeaderAttributes(reader);
    const partLabel = attrs.name || `part ${partHeaders.length}`;

    validateHeaderAttributes(attrs, hasChannels, hasDataWindow, hasDisplayWindow, partLabel);

    partHeaders.push({
      ...versionInfo,
      ...attrs,
    });
  }

  if (partHeaders.length === 0) {
    throw new DecoderError('EXR', 'Multi-part EXR file contains no parts');
  }

  return { versionInfo, partHeaders };
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
      throw new DecoderError('EXR', `Unsupported pixel type UINT for channel '${name}'. Only HALF and FLOAT are supported.`);
    }
    if (pixelType !== EXRPixelType.HALF && pixelType !== EXRPixelType.FLOAT) {
      throw new DecoderError('EXR', `Invalid pixel type ${pixelType} for channel '${name}'`);
    }

    const pLinear = reader.readUint8();
    reader.skip(3); // Reserved
    const xSampling = reader.readInt32();
    const ySampling = reader.readInt32();

    // Validate sampling (must be positive)
    if (xSampling <= 0 || ySampling <= 0) {
      throw new DecoderError('EXR',
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
 * Lines per scanline block for each compression type.
 */
function getLinesPerBlock(compression: EXRCompression): number {
  switch (compression) {
    case EXRCompression.PIZ:
    case EXRCompression.DWAA:
      return 32;
    case EXRCompression.ZIP:
      return 16;
    case EXRCompression.DWAB:
      return 256;
    default:
      return 1;
  }
}

/**
 * Decompress data based on compression type
 */
async function decompressData(
  compressedData: Uint8Array,
  compression: EXRCompression,
  uncompressedSize: number,
  pizContext?: { width: number; numChannels: number; numLines: number; channelSizes: number[] }
): Promise<Uint8Array> {
  switch (compression) {
    case EXRCompression.NONE:
      return compressedData;

    case EXRCompression.ZIPS:
    case EXRCompression.ZIP:
      return await decompressZlib(compressedData, uncompressedSize);

    case EXRCompression.PIZ: {
      if (!pizContext) {
        throw new DecoderError('EXR', 'PIZ decompression requires channel context information');
      }
      return decompressPIZ(
        compressedData,
        uncompressedSize,
        pizContext.width,
        pizContext.numChannels,
        pizContext.numLines,
        pizContext.channelSizes
      );
    }

    case EXRCompression.RLE:
      return decompressRLE(compressedData, uncompressedSize);

    case EXRCompression.DWAA:
    case EXRCompression.DWAB: {
      if (!pizContext) {
        throw new DecoderError('EXR', 'DWA decompression requires channel context information');
      }
      return decompressDWA(
        compressedData,
        uncompressedSize,
        pizContext.width,
        pizContext.numLines,
        pizContext.channelSizes,
      );
    }

    default:
      throw new DecoderError('EXR', `Unsupported EXR compression: ${compression}`);
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
  throw new DecoderError('EXR', 'ZIP decompression requires DecompressionStream support');
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
 * Decode scanline image data with optional channel mapping
 */
async function decodeScanlineImage(
  reader: EXRDataReader,
  header: EXRHeader,
  channelMapping?: Map<string, string>
): Promise<Float32Array> {
  const dataWindow = header.dataWindow;
  const width = dataWindow.xMax - dataWindow.xMin + 1;
  const height = dataWindow.yMax - dataWindow.yMin + 1;

  // Build channel lookup
  const channelLookup = new Map<string, EXRChannel>();
  for (const ch of header.channels) {
    channelLookup.set(ch.name, ch);
  }

  // Determine output channel mapping
  // If channelMapping provided, use it; otherwise use default RGBA
  let outputMapping: Map<string, string>;
  if (channelMapping && channelMapping.size > 0) {
    outputMapping = channelMapping;
  } else {
    // Default mapping: R -> R, G -> G, B -> B, A -> A, or Y -> grayscale
    outputMapping = new Map();
    if (channelLookup.has('R')) outputMapping.set('R', 'R');
    if (channelLookup.has('G')) outputMapping.set('G', 'G');
    if (channelLookup.has('B')) outputMapping.set('B', 'B');
    if (channelLookup.has('A')) outputMapping.set('A', 'A');
    if (channelLookup.has('Y') && !channelLookup.has('R')) {
      // Grayscale
      outputMapping.set('R', 'Y');
      outputMapping.set('G', 'Y');
      outputMapping.set('B', 'Y');
    }
  }

  if (outputMapping.size === 0) {
    throw new DecoderError('EXR', 'No supported channels found in EXR file');
  }

  // Always output 4 channels (RGBA)
  const numOutputChannels = 4;
  const output = new Float32Array(width * height * numOutputChannels);

  // Initialize alpha to 1 if not mapped
  if (!outputMapping.has('A')) {
    for (let i = 3; i < output.length; i += 4) {
      output[i] = 1.0;
    }
  }

  // Create mapping from source channel name to output channel indices
  // One source channel can map to multiple output channels (e.g., grayscale)
  const sourceToOutputIndices = new Map<string, number[]>();
  const outputChannelIndices: Record<string, number> = { R: 0, G: 1, B: 2, A: 3 };

  for (const [outputCh, sourceCh] of outputMapping.entries()) {
    const outputIdx = outputChannelIndices[outputCh];
    if (outputIdx !== undefined) {
      const existing = sourceToOutputIndices.get(sourceCh) || [];
      existing.push(outputIdx);
      sourceToOutputIndices.set(sourceCh, existing);
    }
  }

  // Calculate scanline size in bytes
  const scanlineBytes = header.channels.reduce((sum, ch) => {
    const bytes = ch.pixelType === EXRPixelType.HALF ? 2 : 4;
    return sum + bytes * width;
  }, 0);

  // Lines per block depends on compression
  const linesPerBlock = getLinesPerBlock(header.compression);

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
      const needsChannelCtx =
        header.compression === EXRCompression.PIZ ||
        header.compression === EXRCompression.DWAA ||
        header.compression === EXRCompression.DWAB;
      const channelCtx = needsChannelCtx
        ? {
            width,
            numChannels: header.channels.length,
            numLines: blockLines,
            channelSizes: header.channels.map(ch =>
              ch.pixelType === EXRPixelType.HALF ? 2 : 4
            ),
          }
        : undefined;
      unpackedData = await decompressData(packedData, header.compression, uncompressedSize, channelCtx);
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

        // Check if this source channel maps to any output channels
        const outputIndices = sourceToOutputIndices.get(ch.name);

        if (outputIndices && outputIndices.length > 0) {
          for (let x = 0; x < width; x++) {
            const srcOffset = lineDataOffset + x * channelBytes;

            let value: number;
            if (ch.pixelType === EXRPixelType.HALF) {
              const half = dataView.getUint16(srcOffset, true);
              value = halfToFloat(half);
            } else {
              value = dataView.getFloat32(srcOffset, true);
            }

            // Write to all mapped output channels
            for (const outputIdx of outputIndices) {
              const dstIdx = (outputY * width + x) * numOutputChannels + outputIdx;
              output[dstIdx] = value;
            }
          }
        }

        channelOffset += width * channelBytes;
      }
    }
  }

  return output;
}

/**
 * Decode scanline image data from a multi-part EXR file.
 * Multi-part chunks have an extra part number field before each scanline block.
 */
async function decodeMultiPartScanlineImage(
  reader: EXRDataReader,
  header: EXRHeader,
  targetPartIndex: number,
  channelMapping?: Map<string, string>
): Promise<Float32Array> {
  const dataWindow = header.dataWindow;
  const width = dataWindow.xMax - dataWindow.xMin + 1;
  const height = dataWindow.yMax - dataWindow.yMin + 1;

  // Build channel lookup
  const channelLookup = new Map<string, EXRChannel>();
  for (const ch of header.channels) {
    channelLookup.set(ch.name, ch);
  }

  // Determine output channel mapping
  let outputMapping: Map<string, string>;
  if (channelMapping && channelMapping.size > 0) {
    outputMapping = channelMapping;
  } else {
    outputMapping = new Map();
    if (channelLookup.has('R')) outputMapping.set('R', 'R');
    if (channelLookup.has('G')) outputMapping.set('G', 'G');
    if (channelLookup.has('B')) outputMapping.set('B', 'B');
    if (channelLookup.has('A')) outputMapping.set('A', 'A');
    if (channelLookup.has('Y') && !channelLookup.has('R')) {
      outputMapping.set('R', 'Y');
      outputMapping.set('G', 'Y');
      outputMapping.set('B', 'Y');
    }
  }

  if (outputMapping.size === 0) {
    throw new DecoderError('EXR', 'No supported channels found in EXR file');
  }

  const numOutputChannels = 4;
  const output = new Float32Array(width * height * numOutputChannels);

  if (!outputMapping.has('A')) {
    for (let i = 3; i < output.length; i += 4) {
      output[i] = 1.0;
    }
  }

  const sourceToOutputIndices = new Map<string, number[]>();
  const outputChannelIndices: Record<string, number> = { R: 0, G: 1, B: 2, A: 3 };

  for (const [outputCh, sourceCh] of outputMapping.entries()) {
    const outputIdx = outputChannelIndices[outputCh];
    if (outputIdx !== undefined) {
      const existing = sourceToOutputIndices.get(sourceCh) || [];
      existing.push(outputIdx);
      sourceToOutputIndices.set(sourceCh, existing);
    }
  }

  const scanlineBytes = header.channels.reduce((sum, ch) => {
    const bytes = ch.pixelType === EXRPixelType.HALF ? 2 : 4;
    return sum + bytes * width;
  }, 0);

  const linesPerBlock = getLinesPerBlock(header.compression);

  const numBlocks = Math.ceil(height / linesPerBlock);

  // Read each scanline block (multi-part has part_number prefix on each chunk)
  const MAX_CHUNKS = numBlocks * 1024 * 2; // generous upper bound for interleaved parts
  let totalChunksRead = 0;
  for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
    if (++totalChunksRead > MAX_CHUNKS) {
      throw new DecoderError('EXR', 'Too many chunks read while seeking target part, file may be corrupt');
    }
    const partNumber = reader.readInt32(); // Part number (multi-part specific)
    if (partNumber !== targetPartIndex) {
      // Skip this block - it belongs to a different part
      // We still need to read past it
      reader.readInt32(); // y coordinate
      const packedSize = reader.readInt32();
      reader.skip(packedSize);
      // Re-decrement blockIdx since we didn't process a block for our part
      blockIdx--;
      continue;
    }

    const y = reader.readInt32();
    const packedSize = reader.readInt32();

    const blockLines = Math.min(linesPerBlock, height - blockIdx * linesPerBlock);
    const uncompressedSize = blockLines * scanlineBytes;

    const packedData = reader.readBytes(packedSize);

    let unpackedData: Uint8Array;
    if (header.compression === EXRCompression.NONE) {
      unpackedData = packedData;
    } else {
      const needsChannelCtx =
        header.compression === EXRCompression.PIZ ||
        header.compression === EXRCompression.DWAA ||
        header.compression === EXRCompression.DWAB;
      const channelCtx = needsChannelCtx
        ? {
            width,
            numChannels: header.channels.length,
            numLines: blockLines,
            channelSizes: header.channels.map(ch =>
              ch.pixelType === EXRPixelType.HALF ? 2 : 4
            ),
          }
        : undefined;
      unpackedData = await decompressData(packedData, header.compression, uncompressedSize, channelCtx);
    }

    const dataView = new DataView(unpackedData.buffer, unpackedData.byteOffset, unpackedData.byteLength);

    for (let line = 0; line < blockLines; line++) {
      const outputY = y - dataWindow.yMin + line;
      if (outputY < 0 || outputY >= height) continue;

      let channelOffset = 0;

      for (const ch of header.channels) {
        const channelBytes = ch.pixelType === EXRPixelType.HALF ? 2 : 4;
        const lineDataOffset = line * scanlineBytes + channelOffset;

        const outputIndices = sourceToOutputIndices.get(ch.name);

        if (outputIndices && outputIndices.length > 0) {
          for (let x = 0; x < width; x++) {
            const srcOffset = lineDataOffset + x * channelBytes;

            let value: number;
            if (ch.pixelType === EXRPixelType.HALF) {
              const half = dataView.getUint16(srcOffset, true);
              value = halfToFloat(half);
            } else {
              value = dataView.getFloat32(srcOffset, true);
            }

            for (const outputIdx of outputIndices) {
              const dstIdx = (outputY * width + x) * numOutputChannels + outputIdx;
              output[dstIdx] = value;
            }
          }
        }

        channelOffset += width * channelBytes;
      }
    }
  }

  return output;
}

/**
 * Supported compression types for validation
 */
const SUPPORTED_COMPRESSION = [
  EXRCompression.NONE,
  EXRCompression.RLE,
  EXRCompression.ZIPS,
  EXRCompression.ZIP,
  EXRCompression.PIZ,
  EXRCompression.DWAA,
  EXRCompression.DWAB,
];

/**
 * Deep data types that we don't yet support
 */
const DEEP_DATA_TYPES = ['deepscanline', 'deeptile'];

/**
 * Validate compression type is supported
 */
function validateCompression(compression: EXRCompression, partLabel?: string): void {
  if (!SUPPORTED_COMPRESSION.includes(compression)) {
    const compressionName = EXRCompression[compression] || `unknown(${compression})`;
    const prefix = partLabel ? `Part '${partLabel}': ` : '';
    throw new DecoderError('EXR',
      `${prefix}Unsupported EXR compression type: ${compressionName}. Supported types: NONE, RLE, ZIP, ZIPS, PIZ, DWAA, DWAB`
    );
  }
}

/**
 * Apply uncrop: expand pixel buffer from dataWindow to displayWindow dimensions.
 *
 * When the EXR data window is smaller than (or offset from) the display window,
 * the decoded data covers only the data window region.  This function creates a
 * new buffer with the display window dimensions, fills it with transparent black
 * (0,0,0,0), and copies the data window pixels at the correct offset.
 *
 * @param data        Decoded pixel data (Float32Array, 4 channels RGBA)
 * @param dataWindow  The EXR data window box
 * @param displayWindow The EXR display window box
 * @returns           { data, width, height } expanded to display window size,
 *                    or the original data unchanged if no uncrop is needed.
 */
export function applyUncrop(
  data: Float32Array,
  dataWindow: EXRBox2i,
  displayWindow: EXRBox2i,
): { data: Float32Array; width: number; height: number } {
  const dwWidth = dataWindow.xMax - dataWindow.xMin + 1;
  const dwHeight = dataWindow.yMax - dataWindow.yMin + 1;
  const dispWidth = displayWindow.xMax - displayWindow.xMin + 1;
  const dispHeight = displayWindow.yMax - displayWindow.yMin + 1;

  const numChannels = 4;
  const expectedLength = dwWidth * dwHeight * numChannels;
  if (data.length !== expectedLength) {
    throw new DecoderError(
      'EXR',
      `applyUncrop: data length ${data.length} does not match expected ${expectedLength} (${dwWidth}x${dwHeight}x${numChannels})`
    );
  }

  // No uncrop needed if windows are identical
  if (
    dataWindow.xMin === displayWindow.xMin &&
    dataWindow.yMin === displayWindow.yMin &&
    dataWindow.xMax === displayWindow.xMax &&
    dataWindow.yMax === displayWindow.yMax
  ) {
    return { data, width: dwWidth, height: dwHeight };
  }

  // New buffer initialized to zero (transparent black)
  const output = new Float32Array(dispWidth * dispHeight * numChannels);

  // Compute the offset of the data window inside the display window
  const offsetX = dataWindow.xMin - displayWindow.xMin;
  const offsetY = dataWindow.yMin - displayWindow.yMin;

  // Copy rows from the data window into the correct position
  for (let row = 0; row < dwHeight; row++) {
    const dstY = offsetY + row;
    if (dstY < 0 || dstY >= dispHeight) continue;

    // Compute horizontal clipping
    const srcXStart = Math.max(0, -offsetX);
    const dstXStart = Math.max(0, offsetX);
    const copyWidth = Math.min(dwWidth - srcXStart, dispWidth - dstXStart);
    if (copyWidth <= 0) continue;

    const srcOffset = (row * dwWidth + srcXStart) * numChannels;
    const dstOffset = (dstY * dispWidth + dstXStart) * numChannels;
    const count = copyWidth * numChannels;

    output.set(data.subarray(srcOffset, srcOffset + count), dstOffset);
  }

  return { data: output, width: dispWidth, height: dispHeight };
}

/**
 * Decode a single-part EXR file
 */
async function decodeSinglePart(
  reader: EXRDataReader,
  header: EXRHeader,
  options?: EXRDecodeOptions
): Promise<EXRDecodeResult> {
  if (header.tiled) {
    throw new DecoderError('EXR', 'Tiled EXR images are not yet supported');
  }

  validateCompression(header.compression);

  const channelMapping = resolveChannelMapping(header, options);
  const rawData = await decodeScanlineImage(reader, header, channelMapping);

  // Apply uncrop: expand data window to display window if they differ
  const uncropped = applyUncrop(rawData, header.dataWindow, header.displayWindow);

  const layers = extractLayerInfo(header.channels);

  return {
    width: uncropped.width,
    height: uncropped.height,
    data: uncropped.data,
    channels: 4,
    header,
    layers,
    decodedLayer: options?.layer,
  };
}

/**
 * Decode a multi-part EXR file
 */
async function decodeMultiPart(
  reader: EXRDataReader,
  partHeaders: EXRHeader[],
  options?: EXRDecodeOptions
): Promise<EXRDecodeResult> {
  const partIndex = options?.partIndex ?? 0;

  if (typeof partIndex !== 'number' || !Number.isFinite(partIndex) || !Number.isInteger(partIndex)) {
    throw new DecoderError('EXR', `Invalid part index: ${partIndex}. Must be a non-negative integer.`);
  }

  if (partIndex < 0 || partIndex >= partHeaders.length) {
    throw new DecoderError('EXR',
      `Part index ${partIndex} is out of range. File has ${partHeaders.length} part(s) (indices 0-${partHeaders.length - 1}).`
    );
  }

  const selectedHeader = partHeaders[partIndex]!;
  const partLabel = selectedHeader.name || `part ${partIndex}`;

  // Check for deep data types
  if (selectedHeader.type && DEEP_DATA_TYPES.includes(selectedHeader.type)) {
    throw new DecoderError('EXR',
      `Part '${partLabel}' has type '${selectedHeader.type}' which is deep data. ` +
      `Deep data (deepscanline/deeptile) is not yet supported. ` +
      `Only scanline image parts can be decoded.`
    );
  }

  // Check for tiled parts
  if (selectedHeader.type === 'tiledimage' || selectedHeader.tiled) {
    throw new DecoderError('EXR',
      `Part '${partLabel}' is a tiled image. Tiled EXR images are not yet supported.`
    );
  }

  validateCompression(selectedHeader.compression, partLabel);

  // Build part info for all parts
  const partsInfo: EXRPartInfo[] = partHeaders.map((ph, idx) => ({
    index: idx,
    name: ph.name,
    type: ph.type,
    view: ph.view,
    channels: ph.channels.map(ch => ch.name),
    dataWindow: ph.dataWindow,
    compression: EXRCompression[ph.compression] || `unknown(${ph.compression})`,
  }));

  // In multi-part EXR, after all part headers, offset tables come for each part.
  // Each part has its own offset table, and the data for each part follows.
  // We need to read the offset tables for all parts to find where our part's data starts.

  // Read offset tables for all parts
  const partOffsetTables: bigint[][] = [];
  for (let p = 0; p < partHeaders.length; p++) {
    const ph = partHeaders[p]!;
    const dw = ph.dataWindow;
    const partHeight = dw.yMax - dw.yMin + 1;

    const linesPerBlock = getLinesPerBlock(ph.compression);
    const numBlocks = Math.ceil(partHeight / linesPerBlock);

    const offsets: bigint[] = [];
    for (let i = 0; i < numBlocks; i++) {
      offsets.push(reader.readUint64());
    }
    partOffsetTables.push(offsets);
  }

  // Position reader to the start of the selected part's data using offset table.
  // In multi-part EXR, each chunk starts with: partNumber (int32) + y (int32) + packedSize (int32) + data
  // The offset table entries point to the start of each chunk (at the partNumber field).
  if (partOffsetTables[partIndex]!.length > 0) {
    reader.position = Number(partOffsetTables[partIndex]![0]!);
  }

  // Decode scanlines for the selected part
  const channelMapping = resolveChannelMapping(selectedHeader, options);
  const rawData = await decodeMultiPartScanlineImage(reader, selectedHeader, partIndex, channelMapping);

  // Apply uncrop: expand data window to display window if they differ
  const uncropped = applyUncrop(rawData, selectedHeader.dataWindow, selectedHeader.displayWindow);

  const layers = extractLayerInfo(selectedHeader.channels);

  return {
    width: uncropped.width,
    height: uncropped.height,
    data: uncropped.data,
    channels: 4,
    header: selectedHeader,
    layers,
    decodedLayer: options?.layer,
    parts: partsInfo,
    decodedPartIndex: partIndex,
  };
}

/**
 * Main EXR decode function
 *
 * @param buffer - The EXR file data
 * @param options - Optional decode settings for layer selection, channel remapping, and part selection
 */
export async function decodeEXR(
  buffer: ArrayBuffer,
  options?: EXRDecodeOptions
): Promise<EXRDecodeResult> {
  // Validate buffer size
  if (!buffer || buffer.byteLength < 8) {
    throw new DecoderError('EXR', 'Invalid EXR file: buffer too small (minimum 8 bytes for magic + version)');
  }

  const reader = new EXRDataReader(buffer);

  // Peek at the version field to check if this is multi-part
  const magic = reader.readUint32();
  if (magic !== EXR_MAGIC) {
    throw new DecoderError('EXR', 'Invalid EXR file: wrong magic number');
  }
  const versionField = reader.readUint32();
  const isMultiPart = (versionField & 0x1000) !== 0;

  // Reset reader to start for full parsing
  reader.position = 0;

  if (isMultiPart) {
    const { partHeaders } = parseMultiPartHeaders(reader);
    return decodeMultiPart(reader, partHeaders, options);
  } else {
    const header = parseHeader(reader);
    return decodeSinglePart(reader, header, options);
  }
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
      // Include layer information for UI
      exrLayers: result.layers,
      exrDecodedLayer: result.decodedLayer,
      // Include all available channels
      exrChannels: result.header.channels.map(ch => ch.name),
      // Multi-part info
      exrParts: result.parts,
      exrDecodedPartIndex: result.decodedPartIndex,
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
  layers: EXRLayerInfo[];
  /** Number of parts (1 for single-part, >1 for multi-part) */
  partCount?: number;
  /** Part info for multi-part files */
  parts?: EXRPartInfo[];
} | null {
  try {
    const reader = new EXRDataReader(buffer);

    // Peek at multi-part flag
    reader.readUint32(); // magic
    const versionField = reader.readUint32();
    const isMultiPart = (versionField & 0x1000) !== 0;
    reader.position = 0;

    if (isMultiPart) {
      const { partHeaders } = parseMultiPartHeaders(reader);
      const firstHeader = partHeaders[0]!;
      const dataWindow = firstHeader.dataWindow;
      const layers = extractLayerInfo(firstHeader.channels);

      const parts: EXRPartInfo[] = partHeaders.map((ph, idx) => ({
        index: idx,
        name: ph.name,
        type: ph.type,
        view: ph.view,
        channels: ph.channels.map(ch => ch.name),
        dataWindow: ph.dataWindow,
        compression: EXRCompression[ph.compression] || 'UNKNOWN',
      }));

      return {
        width: dataWindow.xMax - dataWindow.xMin + 1,
        height: dataWindow.yMax - dataWindow.yMin + 1,
        channels: firstHeader.channels.map((ch) => ch.name),
        compression: EXRCompression[firstHeader.compression] || 'UNKNOWN',
        layers,
        partCount: partHeaders.length,
        parts,
      };
    } else {
      const header = parseHeader(reader);
      const dataWindow = header.dataWindow;
      const layers = extractLayerInfo(header.channels);
      return {
        width: dataWindow.xMax - dataWindow.xMin + 1,
        height: dataWindow.yMax - dataWindow.yMin + 1,
        channels: header.channels.map((ch) => ch.name),
        compression: EXRCompression[header.compression] || 'UNKNOWN',
        layers,
        partCount: 1,
      };
    }
  } catch {
    return null;
  }
}

/**
 * Extract layer information from EXR channels
 *
 * EXR files can have layered channels in the format "layer.channel"
 * e.g., "diffuse.R", "diffuse.G", "diffuse.B", "specular.R", etc.
 *
 * Channels without a dot are considered part of the default layer
 */
export function extractLayerInfo(channels: EXRChannel[]): EXRLayerInfo[] {
  const layerMap = new Map<string, EXRLayerInfo>();

  for (const channel of channels) {
    const dotIndex = channel.name.lastIndexOf('.');

    let layerName: string;
    let channelName: string;

    if (dotIndex > 0) {
      // Has layer prefix (e.g., "diffuse.R")
      layerName = channel.name.substring(0, dotIndex);
      channelName = channel.name.substring(dotIndex + 1);
    } else {
      // No layer prefix - this is the default/RGBA layer
      layerName = 'RGBA';
      channelName = channel.name;
    }

    let layerInfo = layerMap.get(layerName);
    if (!layerInfo) {
      layerInfo = {
        name: layerName,
        channels: [],
        fullChannelNames: [],
      };
      layerMap.set(layerName, layerInfo);
    }

    layerInfo.channels.push(channelName);
    layerInfo.fullChannelNames.push(channel.name);
  }

  // Sort layers alphabetically, but put RGBA first
  const sortedLayers = Array.from(layerMap.values()).sort((a, b) => {
    if (a.name === 'RGBA') return -1;
    if (b.name === 'RGBA') return 1;
    return a.name.localeCompare(b.name);
  });

  return sortedLayers;
}

/**
 * Get channels for a specific layer
 */
export function getChannelsForLayer(
  allChannels: EXRChannel[],
  layerName: string
): EXRChannel[] {
  if (layerName === 'RGBA') {
    // Return channels without a dot prefix (default layer)
    return allChannels.filter(ch => !ch.name.includes('.'));
  }

  // Return channels that match the layer prefix
  const prefix = layerName + '.';
  return allChannels.filter(ch => ch.name.startsWith(prefix));
}

/**
 * Parse channel remapping or layer selection to get the channels to extract
 * Returns a mapping of output channel (R/G/B/A) to input channel name
 */
export function resolveChannelMapping(
  header: EXRHeader,
  options?: EXRDecodeOptions
): Map<string, string> {
  const mapping = new Map<string, string>();
  const channelMap = new Map<string, EXRChannel>();

  // Build channel lookup
  for (const ch of header.channels) {
    channelMap.set(ch.name, ch);
  }

  if (options?.channelRemapping) {
    // Custom channel remapping
    const remap = options.channelRemapping;
    if (remap.red && channelMap.has(remap.red)) mapping.set('R', remap.red);
    if (remap.green && channelMap.has(remap.green)) mapping.set('G', remap.green);
    if (remap.blue && channelMap.has(remap.blue)) mapping.set('B', remap.blue);
    if (remap.alpha && channelMap.has(remap.alpha)) mapping.set('A', remap.alpha);
  } else if (options?.layer && options.layer !== 'RGBA') {
    // Layer selection - map layer.R -> R, layer.G -> G, etc.
    const prefix = options.layer + '.';
    const layerChannels = header.channels.filter(ch => ch.name.startsWith(prefix));

    for (const ch of layerChannels) {
      const suffix = ch.name.substring(prefix.length).toUpperCase();
      // Map common suffixes to output channels
      if (suffix === 'R' || suffix === 'RED') mapping.set('R', ch.name);
      else if (suffix === 'G' || suffix === 'GREEN') mapping.set('G', ch.name);
      else if (suffix === 'B' || suffix === 'BLUE') mapping.set('B', ch.name);
      else if (suffix === 'A' || suffix === 'ALPHA') mapping.set('A', ch.name);
      else if (suffix === 'Y' || suffix === 'LUMINANCE') {
        // Grayscale - map to all RGB
        mapping.set('R', ch.name);
        mapping.set('G', ch.name);
        mapping.set('B', ch.name);
      }
    }

    // If layer has only one channel, treat it as grayscale
    if (layerChannels.length === 1 && mapping.size === 0) {
      const ch = layerChannels[0]!;
      mapping.set('R', ch.name);
      mapping.set('G', ch.name);
      mapping.set('B', ch.name);
    }
  } else {
    // Default RGBA mapping
    if (channelMap.has('R')) mapping.set('R', 'R');
    if (channelMap.has('G')) mapping.set('G', 'G');
    if (channelMap.has('B')) mapping.set('B', 'B');
    if (channelMap.has('A')) mapping.set('A', 'A');
    if (channelMap.has('Y') && !channelMap.has('R')) {
      // Grayscale image
      mapping.set('R', 'Y');
      mapping.set('G', 'Y');
      mapping.set('B', 'Y');
    }
  }

  return mapping;
}
