/**
 * EXR (OpenEXR) File Format Decoder
 *
 * Supports:
 * - Half-float (16-bit) and float (32-bit) pixel data
 * - RGBA, RGB, and Y (grayscale) channels
 * - Luminance/chroma (Y, RY, BY) images, converted to RGB
 * - Subsampled channels (xSampling/ySampling > 1, scanline images), upsampled
 *   with nearest-neighbour replication
 * - INCREASING_Y and DECREASING_Y line order (chunks are placed by their own y)
 * - Scanline and ONE_LEVEL tiled images
 * - Deep scanline images (deepscanline) with front-to-back Over compositing
 * - Uncompressed (NONE), RLE, ZIP, ZIPS, PIZ, PXR24, DWAA, and DWAB compression
 * - Data window / display window handling
 * - Multi-part EXR files (scanline and tiled parts; part selection via partIndex)
 *
 * Not yet supported:
 * - MIPMAP and RIPMAP tiled images
 * - Deep tiled images (deeptile)
 * - B44, B44A compression
 * - DWAA/DWAB: the DWA codec does not implement the full OpenEXR DWA format
 *   (channel rules, CSC, non-linear quantisation tables), so lossy DWA blocks
 *   from real files fail to decode. Blocks stored uncompressed still work.
 *
 * Based on the OpenEXR file format specification.
 */

import { IPImage, type ImageMetadata, type ColorPrimaries } from '../core/image/Image';
import {
  CHROMATICITIES_LABELS,
  identifyChromaticities,
  isValidChromaticities,
  namedPrimariesForChromaticities,
} from '../color/ColorPrimariesMath';
import { decompressPIZ } from './EXRPIZCodec';
import { decompressDWA } from './EXRDWACodec';
import { validateImageDimensions } from './shared';
import { DecoderError } from '../core/errors';
import { Logger } from '../utils/Logger';

const logger = new Logger('EXRDecoder');

// EXR magic number
const EXR_MAGIC = 0x01312f76;

/**
 * Maximum number of tiles allowed in a single level of a tiled EXR image.
 * This prevents excessive memory allocation from malformed files.
 * A 65536x65536 image with 1x1 tiles would need ~4 billion tiles, which is
 * clearly malicious. Even a 65536x65536 image with 32x32 tiles needs ~4M tiles,
 * which is reasonable. We set the limit at 16 million tiles per level, which
 * accommodates any realistic tiled image within the IMAGE_LIMITS constraints.
 */
const MAX_TILES_PER_LEVEL = 16_777_216; // 2^24 = 16M tiles

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

// Tile level mode
export enum EXRLevelMode {
  ONE_LEVEL = 0,
  MIPMAP_LEVELS = 1,
  RIPMAP_LEVELS = 2,
}

// Tile rounding mode
export enum EXRRoundingMode {
  ROUND_DOWN = 0,
  ROUND_UP = 1,
}

// Tile description
export interface EXRTileDesc {
  xSize: number;
  ySize: number;
  levelMode: EXRLevelMode;
  roundingMode: EXRRoundingMode;
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
  // Tile description (present for tiled images)
  tileDesc?: EXRTileDesc;
  // Multi-view: list of view names (e.g., ["left", "right"])
  multiView?: string[];

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
      throw new DecoderError(
        'EXR',
        `Unexpected end of EXR data: need ${bytesNeeded} bytes at position ${this.pos}, but only ${this.remaining} bytes remaining`,
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
 * Parse a stringVector attribute value.
 * Format: total byte count (int32), then for each string: int32 length + chars (no null terminator).
 * The total byte count is the sum of all (4 + len) for each string.
 */
export function parseStringVector(reader: EXRDataReader, attrSize: number): string[] {
  const strings: string[] = [];
  const endPos = reader.position + attrSize;
  const decoder = new TextDecoder();

  while (reader.position < endPos) {
    if (reader.remaining < 4) break;
    const strLen = reader.readInt32();
    if (strLen < 0 || strLen > MAX_STRING_LENGTH) {
      throw new DecoderError('EXR', `Invalid string length in stringVector: ${strLen}`);
    }
    if (reader.remaining < strLen) {
      throw new DecoderError(
        'EXR',
        `Truncated stringVector: need ${strLen} bytes but only ${reader.remaining} remaining`,
      );
    }
    const bytes = reader.readBytes(strLen);
    strings.push(decoder.decode(bytes));
  }

  return strings;
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
      throw new DecoderError(
        'EXR',
        `Attribute '${attrName}' size ${attrSize} exceeds maximum of ${MAX_ATTRIBUTE_SIZE}`,
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
      case 'multiView':
        header.multiView = parseStringVector(reader, attrSize);
        break;
      case 'tiles': {
        const xSize = reader.readInt32();
        const ySize = reader.readInt32();
        const modeByte = reader.readUint8();
        const levelMode = modeByte & 0xf;
        const roundingMode = (modeByte >> 4) & 0xf;
        if (levelMode < 0 || levelMode > 2) {
          throw new DecoderError('EXR', `Invalid tile level mode: ${levelMode}`);
        }
        if (roundingMode < 0 || roundingMode > 1) {
          throw new DecoderError('EXR', `Invalid tile rounding mode: ${roundingMode}`);
        }
        if (xSize <= 0 || ySize <= 0) {
          throw new DecoderError('EXR', `Invalid tile size: ${xSize}x${ySize}`);
        }
        header.tileDesc = {
          xSize,
          ySize,
          levelMode: levelMode as EXRLevelMode,
          roundingMode: roundingMode as EXRRoundingMode,
        };
        break;
      }
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
  partLabel?: string,
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
    throw new DecoderError(
      'EXR',
      `${prefix}Invalid EXR dimensions: ${width}x${height} (dataWindow: ${dw.xMin},${dw.yMin} to ${dw.xMax},${dw.yMax})`,
    );
  }

  validateImageDimensions(width, height, 'EXR');

  if (header.channels.length === 0) {
    throw new DecoderError('EXR', `${prefix}EXR file has no channels`);
  }

  // Check that at least some channels are decodable (HALF or FLOAT).
  // UINT channels are valid per the EXR spec but are skipped during decoding.
  const decodableChannels = header.channels.filter(
    (ch) => ch.pixelType === EXRPixelType.HALF || ch.pixelType === EXRPixelType.FLOAT,
  );
  if (decodableChannels.length === 0) {
    const uintNames = header.channels.map((ch) => ch.name).join(', ');
    throw new DecoderError(
      'EXR',
      `${prefix}All channels are UINT pixel type (${uintNames}). Only HALF and FLOAT channels can be decoded.`,
    );
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

    // Validate pixel type
    // UINT (type 0), HALF (type 1), and FLOAT (type 2) are the three EXR spec pixel types.
    // UINT channels are parsed but skipped during decoding (only HALF and FLOAT are decoded).
    if (pixelType !== EXRPixelType.UINT && pixelType !== EXRPixelType.HALF && pixelType !== EXRPixelType.FLOAT) {
      throw new DecoderError('EXR', `Invalid pixel type ${pixelType} for channel '${name}'`);
    }

    const pLinear = reader.readUint8();
    reader.skip(3); // Reserved
    const xSampling = reader.readInt32();
    const ySampling = reader.readInt32();

    // Validate sampling (must be positive)
    if (xSampling <= 0 || ySampling <= 0) {
      throw new DecoderError(
        'EXR',
        `Invalid sampling for channel '${name}': xSampling=${xSampling}, ySampling=${ySampling}`,
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
    case EXRCompression.PXR24:
      return 16;
    case EXRCompression.DWAB:
      return 256;
    default:
      return 1;
  }
}

/** Floor division (OpenEXR `divp`). */
function divp(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Modulo with the sign of the divisor (OpenEXR `modp`). */
function modp(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/** Number of samples of a channel with sampling `s` in the inclusive range [a, b] (OpenEXR `numSamples`). */
function numSamples(s: number, a: number, b: number): number {
  const a1 = divp(a, s);
  const b1 = divp(b, s);
  return b1 - a1 + (a1 * s < a ? 0 : 1);
}

function pixelTypeSize(pixelType: EXRPixelType): number {
  return pixelType === EXRPixelType.HALF ? 2 : 4;
}

/** Per-channel layout of one decoded block (scanline block or tile). */
interface BlockChannel {
  pixelType: EXRPixelType;
  /** Bytes per sample */
  size: number;
  xSampling: number;
  ySampling: number;
  /** Samples per line inside the block */
  nx: number;
}

/** Geometry of one block, used by all codecs to size and lay out decompressed data. */
interface BlockContext {
  /** Absolute x of the first pixel column */
  xMin: number;
  /** Pixel width of the block */
  width: number;
  /** Absolute y of the first line */
  y0: number;
  /** Number of lines in the block */
  numLines: number;
  channels: BlockChannel[];
}

function makeBlockContext(
  channels: EXRChannel[],
  xMin: number,
  width: number,
  y0: number,
  numLines: number,
  ignoreSampling = false,
): BlockContext {
  return {
    xMin,
    width,
    y0,
    numLines,
    channels: channels.map((ch) => {
      const xSampling = ignoreSampling ? 1 : ch.xSampling;
      const ySampling = ignoreSampling ? 1 : ch.ySampling;
      return {
        pixelType: ch.pixelType,
        size: pixelTypeSize(ch.pixelType),
        xSampling,
        ySampling,
        nx: numSamples(xSampling, xMin, xMin + width - 1),
      };
    }),
  };
}

/** Uncompressed byte size of a block in standard EXR scanline layout. */
function blockByteSize(ctx: BlockContext): number {
  let total = 0;
  for (let line = 0; line < ctx.numLines; line++) {
    const y = ctx.y0 + line;
    for (const ch of ctx.channels) {
      if (modp(y, ch.ySampling) === 0) total += ch.nx * ch.size;
    }
  }
  return total;
}

function isSubsampled(ctx: BlockContext): boolean {
  return ctx.channels.some((ch) => ch.xSampling !== 1 || ch.ySampling !== 1);
}

/**
 * Decompress one block (scanline block or tile) into standard EXR scanline layout:
 * for each line, for each channel present on that line, `nx` little-endian samples.
 *
 * Per OpenEXR, a chunk whose packed size is not smaller than its unpacked
 * size is stored uncompressed regardless of the compression attribute.
 */
async function decompressBlock(
  packedData: Uint8Array,
  compression: EXRCompression,
  ctx: BlockContext,
): Promise<Uint8Array> {
  const uncompressedSize = blockByteSize(ctx);
  if (compression === EXRCompression.NONE || packedData.length >= uncompressedSize) {
    return packedData;
  }

  switch (compression) {
    case EXRCompression.ZIPS:
    case EXRCompression.ZIP:
      return await decompressZlib(packedData, uncompressedSize);

    case EXRCompression.RLE:
      return decompressRLE(packedData, uncompressedSize);

    case EXRCompression.PIZ:
      return decompressPIZ(
        packedData,
        uncompressedSize,
        ctx.channels.map((ch) => ({
          size: ch.size,
          nx: ch.nx,
          ny: numSamples(ch.ySampling, ctx.y0, ctx.y0 + ctx.numLines - 1),
          ySampling: ch.ySampling,
        })),
        ctx.y0,
        ctx.numLines,
      );

    case EXRCompression.PXR24:
      return await decompressPXR24(packedData, uncompressedSize, ctx);

    case EXRCompression.DWAA:
    case EXRCompression.DWAB:
      if (isSubsampled(ctx)) {
        throw new DecoderError('EXR', 'DWA compression with subsampled channels is not supported');
      }
      return decompressDWA(
        packedData,
        uncompressedSize,
        ctx.width,
        ctx.numLines,
        ctx.channels.map((ch) => ch.size),
      );

    default:
      throw new DecoderError('EXR', `Unsupported EXR compression: ${compression}`);
  }
}

/**
 * Inflate zlib/deflate compressed data.
 * Shared by ZIP and PXR24 decompression.
 *
 * Uses Node.js zlib.inflateSync when available (avoids stray Z_BUF_ERROR
 * from DecompressionStream in some Node.js versions), falls back to
 * DecompressionStream for browser environments.
 */
async function inflateRaw(compressedData: Uint8Array): Promise<Uint8Array> {
  // Prefer Node.js synchronous inflate to avoid DecompressionStream Z_BUF_ERROR
  const nodeProcess = (globalThis as { process?: { versions?: { node?: string } } }).process;
  if (nodeProcess?.versions?.node) {
    try {
      // Dynamic import to keep browser bundle clean
      const zlib = await (Function('return import("node:zlib")')() as Promise<{
        inflateSync: (buf: Uint8Array) => Uint8Array;
      }>);
      return new Uint8Array(zlib.inflateSync(compressedData));
    } catch (error) {
      // Fall through to DecompressionStream
      logger.debug('Node zlib inflate failed; falling back to DecompressionStream', { error });
    }
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new DecoderError('EXR', 'Decompression requires DecompressionStream support');
  }

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

  return result;
}

/**
 * Decompress ZIP/ZIPS data: inflate, then undo the EXR byte predictor and interleave.
 */
async function decompressZlib(compressedData: Uint8Array, uncompressedSize: number): Promise<Uint8Array> {
  const result = await inflateRaw(compressedData);
  if (result.length !== uncompressedSize) {
    throw new DecoderError('EXR', `ZIP: inflated ${result.length} bytes, expected ${uncompressedSize}`);
  }
  return reconstructPredictor(result);
}

/**
 * Undo the byte predictor and byte-interleaving applied by OpenEXR's ZIP and
 * RLE compressors (ImfZip.cpp `reconstruct` + `interleave`):
 *
 * 1. Predictor: `t[i] = t[i-1] + t[i] - 128` (mod 256).
 * 2. Interleave: the first ceil(n/2) bytes hold the even output bytes and the
 *    remaining bytes the odd ones.
 */
function reconstructPredictor(data: Uint8Array): Uint8Array {
  const n = data.length;
  const t = new Uint8Array(data);
  for (let i = 1; i < n; i++) {
    t[i] = ((t[i - 1] ?? 0) + (t[i] ?? 0) - 128) & 0xff;
  }

  const out = new Uint8Array(n);
  const half = (n + 1) >> 1;
  let s1 = 0;
  let s2 = half;
  let o = 0;
  while (o < n) {
    out[o++] = t[s1++] ?? 0;
    if (o < n) out[o++] = t[s2++] ?? 0;
  }
  return out;
}

/**
 * Decompress PXR24 data (ImfPxr24Compressor.cpp).
 *
 * After zlib inflation, each line stores, for every channel present on that
 * line, its samples split into byte planes (most significant first). Each
 * plane set holds deltas of the (possibly truncated) sample bit patterns:
 *   - HALF:  2 planes (16-bit words)
 *   - FLOAT: 3 planes (upper 24 bits; low 8 bits are lost)
 *   - UINT:  4 planes
 * The running sum restarts at zero for every channel on every line.
 */
async function decompressPXR24(
  compressedData: Uint8Array,
  uncompressedSize: number,
  ctx: BlockContext,
): Promise<Uint8Array> {
  const inflated = await inflateRaw(compressedData);
  const result = new Uint8Array(uncompressedSize);
  const out = new DataView(result.buffer);

  let src = 0;
  let dst = 0;
  for (let line = 0; line < ctx.numLines; line++) {
    const y = ctx.y0 + line;
    for (const ch of ctx.channels) {
      if (modp(y, ch.ySampling) !== 0) continue;
      const n = ch.nx;
      if (ch.pixelType === EXRPixelType.HALF) {
        if (src + n * 2 > inflated.length) throw new DecoderError('EXR', 'PXR24: truncated data');
        const p0 = src;
        const p1 = src + n;
        src += n * 2;
        let pixel = 0;
        for (let j = 0; j < n; j++) {
          const diff = ((inflated[p0 + j] ?? 0) << 8) | (inflated[p1 + j] ?? 0);
          pixel = (pixel + diff) & 0xffff;
          out.setUint16(dst, pixel, true);
          dst += 2;
        }
      } else if (ch.pixelType === EXRPixelType.FLOAT) {
        if (src + n * 3 > inflated.length) throw new DecoderError('EXR', 'PXR24: truncated data');
        const p0 = src;
        const p1 = src + n;
        const p2 = src + n * 2;
        src += n * 3;
        let pixel = 0;
        for (let j = 0; j < n; j++) {
          const diff =
            (((inflated[p0 + j] ?? 0) << 24) | ((inflated[p1 + j] ?? 0) << 16) | ((inflated[p2 + j] ?? 0) << 8)) >>> 0;
          pixel = (pixel + diff) >>> 0;
          out.setUint32(dst, pixel, true);
          dst += 4;
        }
      } else {
        if (src + n * 4 > inflated.length) throw new DecoderError('EXR', 'PXR24: truncated data');
        const p0 = src;
        const p1 = src + n;
        const p2 = src + n * 2;
        const p3 = src + n * 3;
        src += n * 4;
        let pixel = 0;
        for (let j = 0; j < n; j++) {
          const diff =
            (((inflated[p0 + j] ?? 0) << 24) |
              ((inflated[p1 + j] ?? 0) << 16) |
              ((inflated[p2 + j] ?? 0) << 8) |
              (inflated[p3 + j] ?? 0)) >>>
            0;
          pixel = (pixel + diff) >>> 0;
          out.setUint32(dst, pixel, true);
          dst += 4;
        }
      }
    }
  }

  return result;
}

/**
 * Decompress RLE data (ImfRle.cpp `rleUncompress`), then undo the byte
 * predictor/interleave like ZIP. A negative (signed) count byte introduces
 * `-count` literal bytes; a non-negative count repeats the next byte
 * `count + 1` times.
 */
function decompressRLE(compressedData: Uint8Array, uncompressedSize: number): Uint8Array {
  const raw = new Uint8Array(uncompressedSize);
  let srcPos = 0;
  let dstPos = 0;

  while (srcPos < compressedData.length) {
    const count = ((compressedData[srcPos++] ?? 0) << 24) >> 24; // signed byte
    if (count < 0) {
      const n = -count;
      if (dstPos + n > uncompressedSize || srcPos + n > compressedData.length) {
        throw new DecoderError('EXR', 'RLE: literal run overflows block');
      }
      raw.set(compressedData.subarray(srcPos, srcPos + n), dstPos);
      srcPos += n;
      dstPos += n;
    } else {
      const n = count + 1;
      if (dstPos + n > uncompressedSize || srcPos >= compressedData.length) {
        throw new DecoderError('EXR', 'RLE: repeat run overflows block');
      }
      raw.fill(compressedData[srcPos++] ?? 0, dstPos, dstPos + n);
      dstPos += n;
    }
  }

  if (dstPos !== uncompressedSize) {
    throw new DecoderError('EXR', `RLE: decoded ${dstPos} bytes, expected ${uncompressedSize}`);
  }
  return reconstructPredictor(raw);
}

/** Destination for one source channel: `buf[pixelIndex * stride + offset]`. */
interface ChannelTarget {
  buf: Float32Array;
  stride: number;
  offset: number;
}

/** Output buffers and channel routing shared by the scanline decoders. */
interface ScanlineOutput {
  width: number;
  height: number;
  output: Float32Array;
  targets: Map<string, ChannelTarget[]>;
  /** Present when the image is luminance/chroma (Y, RY, BY) and is converted to RGB. */
  chroma?: Float32Array;
  lumaWeights?: [number, number, number];
}

const OUTPUT_CHANNEL_INDEX: Record<string, number> = { R: 0, G: 1, B: 2, A: 3 };

/**
 * Luminance weights (the Y row of the RGB->XYZ matrix) for the given
 * chromaticities, as OpenEXR's `computeYw`. Defaults to Rec.709 primaries.
 */
export function computeLuminanceWeights(chromaticities?: Float32Array): [number, number, number] {
  const c = chromaticities && chromaticities.length >= 8 ? chromaticities : REC709_CHROMATICITIES;
  const rx = c[0] ?? 0;
  const ry = c[1] ?? 0;
  const gx = c[2] ?? 0;
  const gy = c[3] ?? 0;
  const bx = c[4] ?? 0;
  const by = c[5] ?? 0;
  const wx = c[6] ?? 0;
  const wy = c[7] ?? 0;
  const fallback: [number, number, number] = [0.2126, 0.7152, 0.0722];
  if (!ry || !gy || !by || !wy) return fallback;
  // Columns: XYZ of each primary scaled to Y = 1; solve M * s = W (white XYZ, Y = 1)
  type V3 = [number, number, number];
  const col: [V3, V3, V3] = [
    [rx / ry, 1, (1 - rx - ry) / ry],
    [gx / gy, 1, (1 - gx - gy) / gy],
    [bx / by, 1, (1 - bx - by) / by],
  ];
  const w: V3 = [wx / wy, 1, (1 - wx - wy) / wy];
  const det = (a: V3, b: V3, d: V3): number =>
    a[0] * (b[1] * d[2] - b[2] * d[1]) - b[0] * (a[1] * d[2] - a[2] * d[1]) + d[0] * (a[1] * b[2] - a[2] * b[1]);
  const D = det(col[0], col[1], col[2]);
  if (!D) return fallback;
  const s0 = det(w, col[1], col[2]) / D;
  const s1 = det(col[0], w, col[2]) / D;
  const s2 = det(col[0], col[1], w) / D;
  // Y of each primary is s_i (Y row of the matrix is all ones times s)
  const sum = s0 + s1 + s2;
  if (!sum) return fallback;
  return [s0 / sum, s1 / sum, s2 / sum];
}

const REC709_CHROMATICITIES = new Float32Array([0.64, 0.33, 0.3, 0.6, 0.15, 0.06, 0.3127, 0.329]);

function createScanlineOutput(header: EXRHeader, outputMapping: Map<string, string>): ScanlineOutput {
  const dataWindow = header.dataWindow;
  const width = dataWindow.xMax - dataWindow.xMin + 1;
  const height = dataWindow.yMax - dataWindow.yMin + 1;
  const output = new Float32Array(width * height * 4);

  if (!outputMapping.has('A')) {
    for (let i = 3; i < output.length; i += 4) output[i] = 1.0;
  }

  const targets = new Map<string, ChannelTarget[]>();
  const addTarget = (name: string, t: ChannelTarget): void => {
    const list = targets.get(name) ?? [];
    list.push(t);
    targets.set(name, list);
  };
  for (const [outputCh, sourceCh] of outputMapping.entries()) {
    const idx = OUTPUT_CHANNEL_INDEX[outputCh];
    if (idx !== undefined) addTarget(sourceCh, { buf: output, stride: 4, offset: idx });
  }

  const result: ScanlineOutput = { width, height, output, targets };

  // Luminance/chroma: R, G and B all come from the same "<prefix>Y" channel and
  // "<prefix>RY"/"<prefix>BY" exist -> decode chroma too and convert to RGB.
  const rSrc = outputMapping.get('R');
  if (rSrc && rSrc === outputMapping.get('G') && rSrc === outputMapping.get('B') && /(^|\.)Y$/.test(rSrc)) {
    const prefix = rSrc.slice(0, -1);
    const names = new Set(header.channels.filter((ch) => ch.pixelType !== EXRPixelType.UINT).map((ch) => ch.name));
    if (names.has(prefix + 'RY') && names.has(prefix + 'BY')) {
      const chroma = new Float32Array(width * height * 2);
      addTarget(prefix + 'RY', { buf: chroma, stride: 2, offset: 0 });
      addTarget(prefix + 'BY', { buf: chroma, stride: 2, offset: 1 });
      result.chroma = chroma;
      result.lumaWeights = computeLuminanceWeights(header.chromaticities);
    }
  }

  return result;
}

/** Convert decoded Y/RY/BY to RGB in place (OpenEXR RgbaYca::YCAtoRGBA). */
function finishScanlineOutput(out: ScanlineOutput): Float32Array {
  const { output, chroma, lumaWeights } = out;
  if (chroma && lumaWeights) {
    const [yr, yg, yb] = lumaWeights;
    const n = out.width * out.height;
    for (let i = 0; i < n; i++) {
      const Y = output[i * 4] ?? 0;
      const ry = chroma[i * 2] ?? 0;
      const by = chroma[i * 2 + 1] ?? 0;
      if (ry === 0 && by === 0) {
        output[i * 4] = Y;
        output[i * 4 + 1] = Y;
        output[i * 4 + 2] = Y;
        continue;
      }
      const r = (ry + 1) * Y;
      const b = (by + 1) * Y;
      const g = (Y - r * yr - b * yb) / yg;
      output[i * 4] = r;
      output[i * 4 + 1] = g;
      output[i * 4 + 2] = b;
    }
  }
  return output;
}

/**
 * Write one decompressed scanline block into the output buffers.
 * Subsampled channels are upsampled with nearest-neighbour replication.
 */
function writeScanlineBlock(unpacked: Uint8Array, header: EXRHeader, ctx: BlockContext, out: ScanlineOutput): void {
  const { xMin, yMin, xMax, yMax } = header.dataWindow;
  const width = out.width;
  const view = new DataView(unpacked.buffer, unpacked.byteOffset, unpacked.byteLength);
  let pos = 0;

  for (let line = 0; line < ctx.numLines; line++) {
    const y = ctx.y0 + line;
    for (let c = 0; c < ctx.channels.length; c++) {
      const ch = ctx.channels[c];
      const name = header.channels[c]?.name;
      if (!ch || modp(y, ch.ySampling) !== 0) continue;
      const lineBytes = ch.nx * ch.size;
      const targets = name !== undefined ? out.targets.get(name) : undefined;

      if (
        targets &&
        ch.pixelType !== EXRPixelType.UINT &&
        pos + lineBytes <= unpacked.length &&
        y >= yMin &&
        y <= yMax
      ) {
        // Rows covered by this sample line
        const firstSampleY = divp(yMin + ch.ySampling - 1, ch.ySampling) * ch.ySampling;
        const rowStart = y === firstSampleY ? yMin : y;
        const rowEnd = Math.min(y + ch.ySampling - 1, yMax);
        const firstSampleX = divp(xMin + ch.xSampling - 1, ch.xSampling) * ch.xSampling;

        for (let i = 0; i < ch.nx; i++) {
          const off = pos + i * ch.size;
          const value = ch.size === 2 ? halfToFloat(view.getUint16(off, true)) : view.getFloat32(off, true);
          const sx = firstSampleX + i * ch.xSampling;
          const colStart = i === 0 ? xMin : sx;
          const colEnd = Math.min(sx + ch.xSampling - 1, xMax);
          for (let oy = rowStart; oy <= rowEnd; oy++) {
            const rowBase = (oy - yMin) * width;
            for (let ox = colStart; ox <= colEnd; ox++) {
              const pixel = rowBase + (ox - xMin);
              for (const t of targets) t.buf[pixel * t.stride + t.offset] = value;
            }
          }
        }
      }
      pos += lineBytes;
    }
  }
}

/**
 * Decode one scanline chunk (y + packed data) into the output.
 */
async function decodeScanlineChunk(
  header: EXRHeader,
  y: number,
  packedData: Uint8Array,
  out: ScanlineOutput,
): Promise<void> {
  const { xMin, xMax, yMin, yMax } = header.dataWindow;
  const linesPerBlock = getLinesPerBlock(header.compression);
  // The chunk's own y coordinate identifies its lines; never assume file order
  // (DECREASING_Y files store the last block first).
  if (y < yMin || y > yMax) {
    throw new DecoderError('EXR', `Scanline chunk y=${y} outside data window [${yMin}, ${yMax}]`);
  }
  const numLines = Math.min(linesPerBlock, yMax - y + 1);
  const ctx = makeBlockContext(header.channels, xMin, xMax - xMin + 1, y, numLines);
  const unpacked = await decompressBlock(packedData, header.compression, ctx);
  writeScanlineBlock(unpacked, header, ctx, out);
}

/**
 * Check that every offset-table entry points inside the file (past `minOffset`).
 * Incomplete files may contain zero entries; callers fall back to sequential reads.
 */
function isOffsetTableUsable(offsets: bigint[], minOffset: number, byteLength: number): boolean {
  return offsets.every((o) => o >= BigInt(minOffset) && o + 8n <= BigInt(byteLength));
}

/**
 * Decode scanline image data with optional channel mapping
 */
async function decodeScanlineImage(
  reader: EXRDataReader,
  header: EXRHeader,
  channelMapping?: Map<string, string>,
): Promise<Float32Array> {
  const outputMapping = resolveOutputMapping(header, channelMapping);
  const out = createScanlineOutput(header, outputMapping);

  const linesPerBlock = getLinesPerBlock(header.compression);
  const numBlocks = Math.ceil(out.height / linesPerBlock);
  const offsets: bigint[] = [];
  for (let i = 0; i < numBlocks; i++) {
    offsets.push(reader.readUint64());
  }

  const useOffsets = isOffsetTableUsable(offsets, reader.position, reader.byteLength);
  for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
    if (useOffsets) reader.position = Number(offsets[blockIdx] ?? 0n);
    const y = reader.readInt32();
    const packedSize = reader.readInt32();
    const packedData = reader.readBytes(packedSize);
    await decodeScanlineChunk(header, y, packedData, out);
  }

  return finishScanlineOutput(out);
}

/**
 * Resolve the output RGBA -> source channel mapping (default RGBA / Y grayscale).
 */
function resolveOutputMapping(header: EXRHeader, channelMapping?: Map<string, string>): Map<string, string> {
  if (channelMapping && channelMapping.size > 0) return channelMapping;

  const names = new Set(header.channels.filter((ch) => ch.pixelType !== EXRPixelType.UINT).map((ch) => ch.name));
  const outputMapping = new Map<string, string>();
  if (names.has('R')) outputMapping.set('R', 'R');
  if (names.has('G')) outputMapping.set('G', 'G');
  if (names.has('B')) outputMapping.set('B', 'B');
  if (names.has('A')) outputMapping.set('A', 'A');
  if (names.has('Y') && !names.has('R')) {
    outputMapping.set('R', 'Y');
    outputMapping.set('G', 'Y');
    outputMapping.set('B', 'Y');
  }
  if (outputMapping.size === 0) {
    throw new DecoderError('EXR', 'No supported channels found in EXR file');
  }
  return outputMapping;
}

/**
 * Compute the dimension of a mip level, respecting the rounding mode.
 * Per the OpenEXR spec: ROUND_DOWN uses floor, ROUND_UP uses ceil.
 * The minimum dimension at any level is 1.
 */
function levelSize(fullSize: number, level: number, roundingMode: EXRRoundingMode): number {
  if (level === 0) return fullSize;
  let size = fullSize;
  for (let i = 0; i < level; i++) {
    if (roundingMode === EXRRoundingMode.ROUND_UP) {
      size = Math.ceil(size / 2);
    } else {
      size = Math.max(1, Math.floor(size / 2));
    }
  }
  return Math.max(1, size);
}

/**
 * Compute the number of mip levels for a given dimension.
 */
function numMipLevels(size: number, roundingMode: EXRRoundingMode): number {
  let count = 1;
  let s = size;
  while (s > 1) {
    if (roundingMode === EXRRoundingMode.ROUND_UP) {
      s = Math.ceil(s / 2);
    } else {
      s = Math.max(1, Math.floor(s / 2));
    }
    count++;
  }
  return count;
}

/**
 * Validate that a tile grid does not exceed the maximum allowed tile count.
 * Throws a DecoderError if the total number of tiles for a given level
 * would be unreasonably large, indicating a malformed or malicious file.
 *
 * @param numXTiles - Number of tiles along the X axis
 * @param numYTiles - Number of tiles along the Y axis
 * @param context - Description of where this check is happening (for error messages)
 */
function validateTileCount(numXTiles: number, numYTiles: number, context: string): void {
  if (numXTiles <= 0 || numYTiles <= 0) {
    throw new DecoderError('EXR', `Invalid tile grid dimensions: ${numXTiles}x${numYTiles} tiles (${context})`);
  }
  const totalTiles = numXTiles * numYTiles;
  if (totalTiles > MAX_TILES_PER_LEVEL) {
    throw new DecoderError(
      'EXR',
      `Tile count ${numXTiles}x${numYTiles} = ${totalTiles} exceeds maximum of ${MAX_TILES_PER_LEVEL} (${context}). File may be malformed.`,
    );
  }
}

/**
 * Compute total number of offset table entries for a tiled image,
 * accounting for level mode (ONE_LEVEL, MIPMAP_LEVELS, RIPMAP_LEVELS).
 */
function computeTotalTileOffsets(width: number, height: number, tileDesc: EXRTileDesc): number {
  const { xSize, ySize, levelMode, roundingMode } = tileDesc;

  if (levelMode === EXRLevelMode.ONE_LEVEL) {
    const nx = Math.ceil(width / xSize);
    const ny = Math.ceil(height / ySize);
    validateTileCount(nx, ny, 'ONE_LEVEL offset table');
    return nx * ny;
  }

  if (levelMode === EXRLevelMode.MIPMAP_LEVELS) {
    // Validate level 0 (largest level) — smaller levels will always have fewer tiles
    validateTileCount(Math.ceil(width / xSize), Math.ceil(height / ySize), 'MIPMAP_LEVELS level 0 offset table');
    const nLevels = numMipLevels(Math.max(width, height), roundingMode);
    let total = 0;
    for (let l = 0; l < nLevels; l++) {
      const lw = levelSize(width, l, roundingMode);
      const lh = levelSize(height, l, roundingMode);
      total += Math.ceil(lw / xSize) * Math.ceil(lh / ySize);
    }
    return total;
  }

  // RIPMAP_LEVELS
  // Validate level 0 (largest level) — smaller levels will always have fewer tiles
  validateTileCount(Math.ceil(width / xSize), Math.ceil(height / ySize), 'RIPMAP_LEVELS level 0 offset table');
  const nXLevels = numMipLevels(width, roundingMode);
  const nYLevels = numMipLevels(height, roundingMode);
  let total = 0;
  for (let ly = 0; ly < nYLevels; ly++) {
    for (let lx = 0; lx < nXLevels; lx++) {
      const lw = levelSize(width, lx, roundingMode);
      const lh = levelSize(height, ly, roundingMode);
      total += Math.ceil(lw / xSize) * Math.ceil(lh / ySize);
    }
  }
  return total;
}

/**
 * Decode tiled image data. For multi-level (mipmap/ripmap) files,
 * only level 0 (full resolution) is decoded.
 */
async function decodeTiledImage(
  reader: EXRDataReader,
  header: EXRHeader,
  channelMapping?: Map<string, string>,
): Promise<Float32Array> {
  const dataWindow = header.dataWindow;
  const width = dataWindow.xMax - dataWindow.xMin + 1;
  const height = dataWindow.yMax - dataWindow.yMin + 1;
  const tileDesc = header.tileDesc;
  if (!tileDesc) {
    throw new DecoderError('EXR', 'Tiled EXR file missing tiles attribute');
  }
  const tileXSize = tileDesc.xSize;
  const tileYSize = tileDesc.ySize;

  // Same output routing as scanline images, including Y/RY/BY -> RGB.
  const out = createScanlineOutput(header, resolveOutputMapping(header, channelMapping));

  // Compute tile grid for level 0 (full resolution)
  const numXTiles = Math.ceil(width / tileXSize);
  const numYTiles = Math.ceil(height / tileYSize);
  validateTileCount(numXTiles, numYTiles, 'tiled image level 0');
  const level0Tiles = numXTiles * numYTiles;

  // Read offset table - for multi-level images, this includes all levels
  const totalOffsets = computeTotalTileOffsets(width, height, tileDesc);
  const offsets: bigint[] = [];
  for (let i = 0; i < totalOffsets; i++) {
    offsets.push(reader.readUint64());
  }

  // Read and decode tiles - only process level 0 tiles, skip others
  let level0Decoded = 0;
  for (let tileIdx = 0; level0Decoded < level0Tiles; tileIdx++) {
    const tileX = reader.readInt32();
    const tileY = reader.readInt32();
    const tileLevelX = reader.readInt32();
    const tileLevelY = reader.readInt32();
    const packedSize = reader.readInt32();

    // Skip non-level-0 tiles (mipmap/ripmap lower resolution levels)
    if (tileLevelX !== 0 || tileLevelY !== 0) {
      reader.skip(packedSize);
      continue;
    }
    level0Decoded++;

    // Compute actual tile pixel position and dimensions
    const tilePixelX = tileX * tileXSize;
    const tilePixelY = tileY * tileYSize;
    const actualTileWidth = Math.min(tileXSize, width - tilePixelX);
    const actualTileHeight = Math.min(tileYSize, height - tilePixelY);

    if (actualTileWidth <= 0 || actualTileHeight <= 0) {
      reader.skip(packedSize);
      continue;
    }

    // Calculate tile scanline size for decompression
    const tileScanlineBytes = header.channels.reduce(
      (sum, ch) => sum + pixelTypeSize(ch.pixelType) * actualTileWidth,
      0,
    );

    const packedData = reader.readBytes(packedSize);

    // Tiles never use channel subsampling; tile lines are relative to the tile.
    const tileCtx = makeBlockContext(header.channels, 0, actualTileWidth, 0, actualTileHeight, true);
    const unpackedData = await decompressBlock(packedData, header.compression, tileCtx);

    // Parse channel data from unpacked tile data
    const dataView = new DataView(unpackedData.buffer, unpackedData.byteOffset, unpackedData.byteLength);

    for (let line = 0; line < actualTileHeight; line++) {
      const outputY = tilePixelY + line;
      if (outputY < 0 || outputY >= height) continue;

      let channelOffset = 0;

      for (const ch of header.channels) {
        const channelBytes = ch.pixelType === EXRPixelType.HALF ? 2 : 4;
        const lineDataOffset = line * tileScanlineBytes + channelOffset;

        const targets = out.targets.get(ch.name);

        if (targets) {
          for (let x = 0; x < actualTileWidth; x++) {
            const outputX = tilePixelX + x;
            if (outputX >= width) continue;

            const srcOffset = lineDataOffset + x * channelBytes;

            let value: number;
            if (ch.pixelType === EXRPixelType.HALF) {
              const half = dataView.getUint16(srcOffset, true);
              value = halfToFloat(half);
            } else {
              value = dataView.getFloat32(srcOffset, true);
            }

            const pixel = outputY * width + outputX;
            for (const t of targets) t.buf[pixel * t.stride + t.offset] = value;
          }
        }

        channelOffset += actualTileWidth * channelBytes;
      }
    }
  }

  return finishScanlineOutput(out);
}

/**
 * Decode tiled image data from a multi-part EXR file.
 * Multi-part chunks have an extra part number field before each tile block.
 */
async function decodeMultiPartTiledImage(
  reader: EXRDataReader,
  header: EXRHeader,
  targetPartIndex: number,
  channelMapping?: Map<string, string>,
): Promise<Float32Array> {
  const dataWindow = header.dataWindow;
  const width = dataWindow.xMax - dataWindow.xMin + 1;
  const height = dataWindow.yMax - dataWindow.yMin + 1;
  const tileDesc = header.tileDesc;
  if (!tileDesc) {
    throw new DecoderError('EXR', 'Tiled EXR file missing tiles attribute');
  }
  const tileXSize = tileDesc.xSize;
  const tileYSize = tileDesc.ySize;

  // Same output routing as scanline images, including Y/RY/BY -> RGB.
  const out = createScanlineOutput(header, resolveOutputMapping(header, channelMapping));

  // Level 0 tile count (full resolution)
  const numXTiles = Math.ceil(width / tileXSize);
  const numYTiles = Math.ceil(height / tileYSize);
  validateTileCount(numXTiles, numYTiles, 'multi-part tiled image level 0');
  const level0Tiles = numXTiles * numYTiles;

  const MAX_CHUNKS = level0Tiles * 1024 * 2;
  let totalChunksRead = 0;
  let level0Decoded = 0;

  for (let tileIdx = 0; level0Decoded < level0Tiles; tileIdx++) {
    if (++totalChunksRead > MAX_CHUNKS) {
      throw new DecoderError('EXR', 'Too many chunks read while seeking target part, file may be corrupt');
    }

    const partNumber = reader.readInt32();
    if (partNumber !== targetPartIndex) {
      // Skip this tile - belongs to different part
      reader.readInt32(); // tileX
      reader.readInt32(); // tileY
      reader.readInt32(); // levelX
      reader.readInt32(); // levelY
      const packedSize = reader.readInt32();
      reader.skip(packedSize);
      continue;
    }

    const tileX = reader.readInt32();
    const tileY = reader.readInt32();
    const tileLevelX = reader.readInt32();
    const tileLevelY = reader.readInt32();
    const packedSize = reader.readInt32();

    // Skip non-level-0 tiles (mipmap/ripmap lower resolution levels)
    if (tileLevelX !== 0 || tileLevelY !== 0) {
      reader.skip(packedSize);
      continue;
    }
    level0Decoded++;

    const tilePixelX = tileX * tileXSize;
    const tilePixelY = tileY * tileYSize;
    const actualTileWidth = Math.min(tileXSize, width - tilePixelX);
    const actualTileHeight = Math.min(tileYSize, height - tilePixelY);

    if (actualTileWidth <= 0 || actualTileHeight <= 0) {
      reader.skip(packedSize);
      continue;
    }

    const tileScanlineBytes = header.channels.reduce(
      (sum, ch) => sum + pixelTypeSize(ch.pixelType) * actualTileWidth,
      0,
    );

    const packedData = reader.readBytes(packedSize);

    // Tiles never use channel subsampling; tile lines are relative to the tile.
    const tileCtx = makeBlockContext(header.channels, 0, actualTileWidth, 0, actualTileHeight, true);
    const unpackedData = await decompressBlock(packedData, header.compression, tileCtx);

    const dataView = new DataView(unpackedData.buffer, unpackedData.byteOffset, unpackedData.byteLength);

    for (let line = 0; line < actualTileHeight; line++) {
      const outputY = tilePixelY + line;
      if (outputY < 0 || outputY >= height) continue;

      let channelOffset = 0;

      for (const ch of header.channels) {
        const channelBytes = ch.pixelType === EXRPixelType.HALF ? 2 : 4;
        const lineDataOffset = line * tileScanlineBytes + channelOffset;

        const targets = out.targets.get(ch.name);

        if (targets) {
          for (let x = 0; x < actualTileWidth; x++) {
            const outputX = tilePixelX + x;
            if (outputX >= width) continue;

            const srcOffset = lineDataOffset + x * channelBytes;

            let value: number;
            if (ch.pixelType === EXRPixelType.HALF) {
              const half = dataView.getUint16(srcOffset, true);
              value = halfToFloat(half);
            } else {
              value = dataView.getFloat32(srcOffset, true);
            }

            const pixel = outputY * width + outputX;
            for (const t of targets) t.buf[pixel * t.stride + t.offset] = value;
          }
        }

        channelOffset += actualTileWidth * channelBytes;
      }
    }
  }

  return finishScanlineOutput(out);
}

/**
 * Decode scanline image data from a multi-part EXR file.
 * Multi-part chunks carry a part number before the y coordinate. When the
 * part's offset table is usable, each chunk is read via its offset (so line
 * order does not matter); otherwise chunks are scanned sequentially.
 */
async function decodeMultiPartScanlineImage(
  reader: EXRDataReader,
  header: EXRHeader,
  targetPartIndex: number,
  channelMapping?: Map<string, string>,
  partOffsets?: bigint[],
): Promise<Float32Array> {
  const outputMapping = resolveOutputMapping(header, channelMapping);
  const out = createScanlineOutput(header, outputMapping);

  const linesPerBlock = getLinesPerBlock(header.compression);
  const numBlocks = Math.ceil(out.height / linesPerBlock);
  const startPosition = reader.position;

  const useOffsets =
    partOffsets !== undefined &&
    partOffsets.length === numBlocks &&
    isOffsetTableUsable(partOffsets, 0, reader.byteLength) &&
    partOffsets.every((o) => {
      reader.position = Number(o);
      return reader.readInt32() === targetPartIndex;
    });

  if (useOffsets && partOffsets) {
    for (const offset of partOffsets) {
      reader.position = Number(offset) + 4; // skip part number
      const y = reader.readInt32();
      const packedSize = reader.readInt32();
      await decodeScanlineChunk(header, y, reader.readBytes(packedSize), out);
    }
    return finishScanlineOutput(out);
  }

  reader.position = startPosition;
  const MAX_CHUNKS = numBlocks * 1024 * 2; // generous upper bound for interleaved parts
  let totalChunksRead = 0;
  let decoded = 0;
  while (decoded < numBlocks) {
    if (++totalChunksRead > MAX_CHUNKS) {
      throw new DecoderError('EXR', 'Too many chunks read while seeking target part, file may be corrupt');
    }
    const partNumber = reader.readInt32();
    const y = reader.readInt32();
    const packedSize = reader.readInt32();
    if (partNumber !== targetPartIndex) {
      reader.skip(packedSize);
      continue;
    }
    await decodeScanlineChunk(header, y, reader.readBytes(packedSize), out);
    decoded++;
  }

  return finishScanlineOutput(out);
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
  EXRCompression.PXR24,
  EXRCompression.DWAA,
  EXRCompression.DWAB,
];

/**
 * Deep data types that we don't yet support (deeptile).
 * deepscanline IS supported via compositeDeepScanline().
 */
const UNSUPPORTED_DEEP_DATA_TYPES = ['deeptile'];

/**
 * Validate compression type is supported
 */
function validateCompression(compression: EXRCompression, partLabel?: string): void {
  if (!SUPPORTED_COMPRESSION.includes(compression)) {
    const compressionName = EXRCompression[compression] || `unknown(${compression})`;
    const prefix = partLabel ? `Part '${partLabel}': ` : '';
    throw new DecoderError(
      'EXR',
      `${prefix}Unsupported EXR compression type: ${compressionName}. Supported types: NONE, RLE, ZIP, ZIPS, PIZ, PXR24, DWAA, DWAB`,
    );
  }
}

/**
 * Supported compression types for deep data.
 * Deep images only support NONE, RLE, ZIPS, and ZIP.
 */
const SUPPORTED_DEEP_COMPRESSION = [EXRCompression.NONE, EXRCompression.RLE, EXRCompression.ZIPS, EXRCompression.ZIP];

/**
 * Validate compression type is supported for deep data
 */
function validateDeepCompression(compression: EXRCompression, partLabel?: string): void {
  if (!SUPPORTED_DEEP_COMPRESSION.includes(compression)) {
    const compressionName = EXRCompression[compression] || `unknown(${compression})`;
    const prefix = partLabel ? `Part '${partLabel}': ` : '';
    throw new DecoderError(
      'EXR',
      `${prefix}Unsupported compression for deep data: ${compressionName}. Deep images support: NONE, RLE, ZIP, ZIPS`,
    );
  }
}

/**
 * Decode a deep scanline EXR image and composite it into a flat RGBA image.
 *
 * Deep scanline data format (per block):
 *   - y coordinate (int32): first scanline Y in block
 *   - packed sample offset table size (uint64): byte count of packed sample count data
 *   - packed data size (uint64): byte count of packed pixel sample data
 *   - unpacked data size (uint64): byte count of unpacked pixel sample data
 *   - sample count table: one int32 per pixel per scanline (cumulative offsets or counts)
 *   - sample data: packed channel data for all samples
 *
 * After decompression (if compressed), the sample count table has one int entry
 * per pixel in the block.  These entries are cumulative sample counts: entry[i]
 * gives the total number of samples for pixels 0..i.  The sample data for each
 * pixel starts at count[i-1] (or 0 for the first pixel) and ends at count[i]-1.
 *
 * Each sample has values for every channel in the channel list.  Channels are
 * stored in alphabetical order (as per EXR spec).  Within a single scanline,
 * all samples for all pixels for one channel are contiguous, then the next channel.
 *
 * Compositing: front-to-back Over operator:
 *   C_out = C_front + (1 - A_front) * C_back
 *   A_out = A_front + (1 - A_front) * A_back
 */
async function decodeDeepScanlineImage(reader: EXRDataReader, header: EXRHeader): Promise<Float32Array> {
  const dataWindow = header.dataWindow;
  const width = dataWindow.xMax - dataWindow.xMin + 1;
  const height = dataWindow.yMax - dataWindow.yMin + 1;

  // Build channel info - channels are sorted alphabetically in EXR
  const sortedChannels = [...header.channels].sort((a, b) => a.name.localeCompare(b.name));

  // Find RGBA channel indices in the sorted channel list, skipping UINT channels
  let rIdx = -1,
    gIdx = -1,
    bIdx = -1,
    aIdx = -1;
  for (const [i, ch] of sortedChannels.entries()) {
    if (ch.pixelType === EXRPixelType.UINT) continue;
    const name = ch.name;
    if (name === 'R') rIdx = i;
    else if (name === 'G') gIdx = i;
    else if (name === 'B') bIdx = i;
    else if (name === 'A') aIdx = i;
  }

  // Support Y (grayscale) channel
  let yIdx = -1;
  if (rIdx === -1) {
    for (const [i, ch] of sortedChannels.entries()) {
      if (ch.pixelType === EXRPixelType.UINT) continue;
      if (ch.name === 'Y') {
        yIdx = i;
        break;
      }
    }
  }

  // Calculate bytes per sample for each channel
  const channelByteSizes = sortedChannels.map((ch) => (ch.pixelType === EXRPixelType.HALF ? 2 : 4));
  const bytesPerSample = channelByteSizes.reduce((sum, b) => sum + b, 0);

  // Output: 4-channel RGBA float
  const numOutputChannels = 4;
  const output = new Float32Array(width * height * numOutputChannels);

  // Initialize alpha to 1 if no A channel is present (opaque output)
  if (aIdx === -1) {
    for (let i = 3; i < output.length; i += 4) {
      output[i] = 1.0;
    }
  }

  // Lines per block depends on compression
  const linesPerBlock = getLinesPerBlock(header.compression);
  const numBlocks = Math.ceil(height / linesPerBlock);

  // Read offset table
  const offsets: bigint[] = [];
  for (let i = 0; i < numBlocks; i++) {
    offsets.push(reader.readUint64());
  }

  // Read each deep scanline block
  for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
    const y = reader.readInt32(); // Y coordinate of first scanline in block
    const packedSampleOffsetsSize = Number(reader.readUint64()); // packed size of sample count table
    const packedDataSize = Number(reader.readUint64()); // packed size of sample data
    const unpackedDataSize = Number(reader.readUint64()); // unpacked size of sample data

    // Lines are identified by the chunk's own y (DECREASING_Y stores the last block first)
    const blockLines = Math.max(0, Math.min(linesPerBlock, dataWindow.yMax - y + 1));
    const pixelsInBlock = blockLines * width;

    // Read packed sample count table
    const packedSampleCounts = reader.readBytes(packedSampleOffsetsSize);

    // Read packed sample data
    const packedSampleData = reader.readBytes(packedDataSize);

    // Decompress sample count table (always 4 bytes per pixel - int32)
    const uncompressedCountSize = pixelsInBlock * 4;
    let sampleCountBytes: Uint8Array;
    if (header.compression === EXRCompression.NONE || packedSampleCounts.length >= uncompressedCountSize) {
      sampleCountBytes = packedSampleCounts;
    } else if (header.compression === EXRCompression.ZIPS || header.compression === EXRCompression.ZIP) {
      sampleCountBytes = await decompressZlib(packedSampleCounts, uncompressedCountSize);
    } else if (header.compression === EXRCompression.RLE) {
      sampleCountBytes = decompressRLE(packedSampleCounts, uncompressedCountSize);
    } else {
      throw new DecoderError('EXR', `Unsupported compression for deep data: ${header.compression}`);
    }

    // Parse cumulative sample counts
    const countView = new DataView(sampleCountBytes.buffer, sampleCountBytes.byteOffset, sampleCountBytes.byteLength);
    const cumulativeCounts = new Uint32Array(pixelsInBlock);
    for (let i = 0; i < pixelsInBlock; i++) {
      cumulativeCounts[i] = countView.getUint32(i * 4, true);
    }

    // Total number of samples in this block
    const totalSamples = pixelsInBlock > 0 ? (cumulativeCounts[pixelsInBlock - 1] ?? 0) : 0;

    if (totalSamples === 0) {
      // No samples in this block - output stays at zero (transparent)
      continue;
    }

    // Decompress sample data
    let sampleData: Uint8Array;
    if (header.compression === EXRCompression.NONE || packedSampleData.length >= unpackedDataSize) {
      sampleData = packedSampleData;
    } else if (header.compression === EXRCompression.ZIPS || header.compression === EXRCompression.ZIP) {
      sampleData = await decompressZlib(packedSampleData, unpackedDataSize);
    } else if (header.compression === EXRCompression.RLE) {
      sampleData = decompressRLE(packedSampleData, unpackedDataSize);
    } else {
      throw new DecoderError('EXR', `Unsupported compression for deep data: ${header.compression}`);
    }

    const sampleView = new DataView(sampleData.buffer, sampleData.byteOffset, sampleData.byteLength);

    // Process each scanline in the block
    for (let line = 0; line < blockLines; line++) {
      const outputY = y - dataWindow.yMin + line;
      if (outputY < 0 || outputY >= height) continue;

      for (let x = 0; x < width; x++) {
        const pixelIndexInBlock = line * width + x;

        // Get sample range for this pixel
        const sampleEnd = cumulativeCounts[pixelIndexInBlock] ?? 0;
        const sampleStart = pixelIndexInBlock > 0 ? (cumulativeCounts[pixelIndexInBlock - 1] ?? 0) : 0;
        const numSamples = sampleEnd - sampleStart;

        if (numSamples === 0) continue;

        // Composite samples front-to-back using the Over operator
        let compR = 0,
          compG = 0,
          compB = 0,
          compA = 0;

        for (let s = 0; s < numSamples; s++) {
          const sampleOffset = (sampleStart + s) * bytesPerSample;

          // Read sample values for each channel
          let sR = 0,
            sG = 0,
            sB = 0,
            sA = 1.0;
          let channelByteOffset = sampleOffset;

          for (let ci = 0; ci < sortedChannels.length; ci++) {
            let value: number;
            if (sortedChannels[ci]?.pixelType === EXRPixelType.HALF) {
              if (channelByteOffset + 2 <= sampleData.length) {
                const h = sampleView.getUint16(channelByteOffset, true);
                value = halfToFloat(h);
              } else {
                value = 0;
              }
              channelByteOffset += 2;
            } else {
              if (channelByteOffset + 4 <= sampleData.length) {
                value = sampleView.getFloat32(channelByteOffset, true);
              } else {
                value = 0;
              }
              channelByteOffset += 4;
            }

            if (ci === rIdx) sR = value;
            else if (ci === gIdx) sG = value;
            else if (ci === bIdx) sB = value;
            else if (ci === aIdx) sA = value;
            else if (ci === yIdx) {
              sR = value;
              sG = value;
              sB = value;
            }
          }

          // Clamp sample alpha to [0,1] to prevent incorrect compositing from non-conforming data
          sA = Math.max(0, Math.min(1, sA));

          // Front-to-back Over compositing (assumes pre-multiplied alpha)
          const oneMinusA = 1.0 - compA;
          compR += oneMinusA * sR;
          compG += oneMinusA * sG;
          compB += oneMinusA * sB;
          compA += oneMinusA * sA;

          // Early out if fully opaque
          if (compA >= 1.0) {
            compA = 1.0;
            break;
          }
        }

        const dstIdx = (outputY * width + x) * numOutputChannels;
        output[dstIdx] = compR;
        output[dstIdx + 1] = compG;
        output[dstIdx + 2] = compB;
        output[dstIdx + 3] = aIdx >= 0 ? compA : 1.0;
      }
    }
  }

  return output;
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
      `applyUncrop: data length ${data.length} does not match expected ${expectedLength} (${dwWidth}x${dwHeight}x${numChannels})`,
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
  options?: EXRDecodeOptions,
): Promise<EXRDecodeResult> {
  // Check for deep data
  const isDeepScanline = header.type === 'deepscanline' || (header.nonImage && !header.tiled);
  const isDeepTile = header.type === 'deeptile';

  if (isDeepTile) {
    throw new DecoderError(
      'EXR',
      'This file contains deep tiled image data (deeptile) which cannot be decoded. ' +
        'Deep tiled images store per-pixel depth samples that require specialized rendering. ' +
        'Only flat (scanline/tiled) and deep scanline EXR formats are currently supported.',
    );
  }

  if (isDeepScanline) {
    validateDeepCompression(header.compression);

    const rawData = await decodeDeepScanlineImage(reader, header);

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

  if (header.tiled) {
    if (!header.tileDesc) {
      throw new DecoderError('EXR', 'Tiled EXR file missing tiles attribute');
    }

    validateCompression(header.compression);

    const channelMapping = resolveChannelMapping(header, options);
    const rawData = await decodeTiledImage(reader, header, channelMapping);

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
  options?: EXRDecodeOptions,
): Promise<EXRDecodeResult> {
  let partIndex = options?.partIndex ?? 0;
  const explicitPartIndex = options?.partIndex !== undefined;

  if (typeof partIndex !== 'number' || !Number.isFinite(partIndex) || !Number.isInteger(partIndex)) {
    throw new DecoderError('EXR', `Invalid part index: ${partIndex}. Must be a non-negative integer.`);
  }

  if (partIndex < 0 || partIndex >= partHeaders.length) {
    throw new DecoderError(
      'EXR',
      `Part index ${partIndex} is out of range. File has ${partHeaders.length} part(s) (indices 0-${partHeaders.length - 1}).`,
    );
  }

  // If the selected part is a deeptile and no explicit part was requested,
  // try to find the first non-deeptile part to decode instead.
  if (
    !explicitPartIndex &&
    partHeaders[partIndex]?.type &&
    UNSUPPORTED_DEEP_DATA_TYPES.includes(partHeaders[partIndex]?.type ?? '')
  ) {
    const fallbackIndex = partHeaders.findIndex((ph) => !ph.type || !UNSUPPORTED_DEEP_DATA_TYPES.includes(ph.type));
    if (fallbackIndex >= 0) {
      partIndex = fallbackIndex;
    }
  }

  const selectedHeader = partHeaders[partIndex];
  if (!selectedHeader) {
    throw new DecoderError('EXR', `Invalid part index ${partIndex}`);
  }
  const partLabel = selectedHeader.name || `part ${partIndex}`;

  // Check for unsupported deep data types
  if (selectedHeader.type && UNSUPPORTED_DEEP_DATA_TYPES.includes(selectedHeader.type)) {
    const decodableParts = partHeaders
      .map((ph, idx) => ({ idx, name: ph.name, type: ph.type }))
      .filter((p) => !p.type || !UNSUPPORTED_DEEP_DATA_TYPES.includes(p.type));

    if (decodableParts.length > 0) {
      const suggestions = decodableParts
        .map((p) => `part ${p.idx}${p.name ? ` ('${p.name}')` : ''} [${p.type || 'unknown'}]`)
        .join(', ');
      throw new DecoderError(
        'EXR',
        `Part '${partLabel}' has type '${selectedHeader.type}' which is deep tiled data and cannot be decoded. ` +
          `Deep tiled images require per-pixel depth samples that are not yet supported. ` +
          `This file has decodable parts: ${suggestions}. ` +
          `Use the partIndex option to select one of them.`,
      );
    }

    throw new DecoderError(
      'EXR',
      `Part '${partLabel}' has type '${selectedHeader.type}' which is deep tiled data and cannot be decoded. ` +
        `Deep tiled images require per-pixel depth samples that are not yet supported. ` +
        `All parts in this file use unsupported deep tile format.`,
    );
  }

  // Check for tiled parts
  const isTiledPart = selectedHeader.type === 'tiledimage' || selectedHeader.tiled;
  if (isTiledPart) {
    if (!selectedHeader.tileDesc) {
      throw new DecoderError('EXR', `Part '${partLabel}': Tiled EXR part missing tiles attribute`);
    }
  }

  validateCompression(selectedHeader.compression, partLabel);

  // Build part info for all parts
  const partsInfo: EXRPartInfo[] = partHeaders.map((ph, idx) => ({
    index: idx,
    name: ph.name,
    type: ph.type,
    view: ph.view,
    channels: ph.channels.map((ch) => ch.name),
    dataWindow: ph.dataWindow,
    compression: EXRCompression[ph.compression] || `unknown(${ph.compression})`,
  }));

  // In multi-part EXR, after all part headers, offset tables come for each part.
  // Each part has its own offset table, and the data for each part follows.
  // We need to read the offset tables for all parts to find where our part's data starts.

  // Read offset tables for all parts
  const partOffsetTables: bigint[][] = [];
  for (const ph of partHeaders) {
    const dw = ph.dataWindow;
    const partHeight = dw.yMax - dw.yMin + 1;

    let numBlocks: number;
    const isTiledPartEntry = ph.type === 'tiledimage' || ph.tiled;
    if (isTiledPartEntry && ph.tileDesc) {
      const partWidth = dw.xMax - dw.xMin + 1;
      numBlocks = computeTotalTileOffsets(partWidth, partHeight, ph.tileDesc);
    } else {
      const linesPerBlock = getLinesPerBlock(ph.compression);
      numBlocks = Math.ceil(partHeight / linesPerBlock);
    }

    const offsets: bigint[] = [];
    for (let i = 0; i < numBlocks; i++) {
      offsets.push(reader.readUint64());
    }
    partOffsetTables.push(offsets);
  }

  // Position reader to the start of the selected part's data using offset table.
  // In multi-part EXR, each chunk starts with: partNumber (int32) + y (int32) + packedSize (int32) + data
  // The offset table entries point to the start of each chunk (at the partNumber field).
  const selectedOffsets = partOffsetTables[partIndex] ?? [];
  if (selectedOffsets.length > 0) {
    reader.position = Number(selectedOffsets[0] ?? 0n);
  }

  // Decode data for the selected part
  const channelMapping = resolveChannelMapping(selectedHeader, options);
  const isDeepScanlinePart = selectedHeader.type === 'deepscanline';

  let rawData: Float32Array;
  if (isDeepScanlinePart) {
    validateDeepCompression(selectedHeader.compression, partLabel);
    // For deep scanline in multi-part, we need to use the offset table to find the data
    // and handle the part number prefix. For now, use the positioned reader.
    rawData = await decodeDeepScanlineImage(reader, selectedHeader);
  } else if (isTiledPart) {
    rawData = await decodeMultiPartTiledImage(reader, selectedHeader, partIndex, channelMapping);
  } else {
    rawData = await decodeMultiPartScanlineImage(
      reader,
      selectedHeader,
      partIndex,
      channelMapping,
      partOffsetTables[partIndex],
    );
  }

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
export async function decodeEXR(buffer: ArrayBuffer, options?: EXRDecodeOptions): Promise<EXRDecodeResult> {
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
 * Detect named color primaries from EXR chromaticities header attribute.
 * Matches against known CIE xy values for BT.709, BT.2020, and Display-P3 (the
 * renderer's named fast paths). Returns undefined for anything else (e.g. ACES
 * AP0/AP1, DCI-P3), which exrToIPImage passes on as raw chromaticities.
 *
 * @param chromaticities - Float32Array of 8 values: [Rx, Ry, Gx, Gy, Bx, By, Wx, Wy]
 * @param tolerance - Maximum deviation per coordinate (default 0.005)
 */
export function detectColorPrimariesFromChromaticities(
  chromaticities: Float32Array,
  tolerance = 0.005,
): ColorPrimaries | undefined {
  return namedPrimariesForChromaticities(chromaticities, tolerance);
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
      exrChannels: result.header.channels.map((ch) => ch.name),
      // Multi-part info
      exrParts: result.parts,
      exrDecodedPartIndex: result.decodedPartIndex,
    },
  };

  const chroma = result.header.chromaticities;
  if (chroma) {
    if (metadata.attributes) {
      metadata.attributes.chromaticities = Array.from(chroma);
      const known = identifyChromaticities(chroma);
      if (known) metadata.attributes.primaries = CHROMATICITIES_LABELS[known];
    }
    const detected = detectColorPrimariesFromChromaticities(chroma);
    if (detected) {
      if (detected !== 'bt709') metadata.colorPrimaries = detected;
    } else if (isValidChromaticities(chroma)) {
      // Any other primaries (ACES AP0/AP1, DCI-P3, custom): the renderer
      // derives the matrix to BT.709/D65 from the chromaticities.
      metadata.chromaticities = Array.from(chroma);
    }
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
  /** Aggregated channels from all parts (for multi-part files). Equals channels for single-part. */
  allChannels?: string[];
  compression: string;
  layers: EXRLayerInfo[];
  /** Number of parts (1 for single-part, >1 for multi-part) */
  partCount?: number;
  /** Part info for multi-part files */
  parts?: EXRPartInfo[];
  /** Multi-view attribute (e.g., ["left", "right"]) */
  multiView?: string[];
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
      const firstHeader = partHeaders[0];
      if (!firstHeader) return null;
      const dataWindow = firstHeader.dataWindow;
      const layers = extractLayerInfo(firstHeader.channels);

      const parts: EXRPartInfo[] = partHeaders.map((ph, idx) => ({
        index: idx,
        name: ph.name,
        type: ph.type,
        view: ph.view,
        channels: ph.channels.map((ch) => ch.name),
        dataWindow: ph.dataWindow,
        compression: EXRCompression[ph.compression] || 'UNKNOWN',
      }));

      // Aggregate channels from ALL parts for multi-part files.
      // Each part may have its own set of channels; for multi-view files
      // different parts may hold different views' channels.
      const allChannelSet = new Set<string>();
      for (const ph of partHeaders) {
        for (const ch of ph.channels) {
          allChannelSet.add(ch.name);
        }
      }
      const allChannels = Array.from(allChannelSet);

      return {
        width: dataWindow.xMax - dataWindow.xMin + 1,
        height: dataWindow.yMax - dataWindow.yMin + 1,
        channels: firstHeader.channels.map((ch) => ch.name),
        allChannels,
        compression: EXRCompression[firstHeader.compression] || 'UNKNOWN',
        layers,
        partCount: partHeaders.length,
        parts,
        multiView: firstHeader.multiView,
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
        multiView: header.multiView,
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
export function getChannelsForLayer(allChannels: EXRChannel[], layerName: string): EXRChannel[] {
  if (layerName === 'RGBA') {
    // Return channels without a dot prefix (default layer)
    return allChannels.filter((ch) => !ch.name.includes('.'));
  }

  // Return channels that match the layer prefix
  const prefix = layerName + '.';
  return allChannels.filter((ch) => ch.name.startsWith(prefix));
}

/**
 * Parse channel remapping or layer selection to get the channels to extract
 * Returns a mapping of output channel (R/G/B/A) to input channel name
 */
export function resolveChannelMapping(header: EXRHeader, options?: EXRDecodeOptions): Map<string, string> {
  const mapping = new Map<string, string>();
  const channelMap = new Map<string, EXRChannel>();

  // Build channel lookup, excluding UINT channels (not decodable)
  for (const ch of header.channels) {
    if (ch.pixelType === EXRPixelType.UINT) continue;
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
    const layerChannels = header.channels.filter(
      (ch) => ch.name.startsWith(prefix) && ch.pixelType !== EXRPixelType.UINT,
    );

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
    const onlyChannel = layerChannels.length === 1 ? layerChannels[0] : undefined;
    if (onlyChannel && mapping.size === 0) {
      const ch = onlyChannel;
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
