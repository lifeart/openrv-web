/**
 * MXF (Material eXchange Format) Demuxer
 *
 * Parses MXF OP1a containers to extract video/audio essence metadata.
 * This is a parser/demuxer, not a full decoder -- it reads the MXF container
 * structure to identify what's inside (codec, resolution, frame rate, etc.).
 *
 * MXF is the standard container for broadcast and post-production video.
 * It wraps video essence (commonly JPEG 2000, ProRes, DNxHD/HR, or
 * uncompressed), audio, and metadata using KLV (Key-Length-Value) encoding.
 *
 * Based on SMPTE ST 377-1 (MXF File Format), ST 379-2 (MXF Generic Container),
 * and related standards.
 */

import { DecoderError } from '../core/errors';

// ---------------------------------------------------------------------------
// Constants -- SMPTE Universal Labels
// ---------------------------------------------------------------------------

/**
 * Partition Pack UL prefix (bytes 0-12).
 * Byte 13 distinguishes header (0x02), body (0x03), footer (0x04).
 * Byte 14 is the partition status (open/closed/complete).
 * Byte 15 is always 0x00.
 */
const PARTITION_PACK_UL_PREFIX = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x05, 0x01, 0x01,
  0x0d, 0x01, 0x02, 0x01, 0x01,
] as const;

/** Essence Element UL prefix (bytes 0-8) */
const ESSENCE_ELEMENT_UL_PREFIX = [
  0x06, 0x0e, 0x2b, 0x34, 0x01, 0x02, 0x01, 0x01,
  0x0d, 0x01, 0x03, 0x01,
] as const;

// Descriptor ULs (bytes 0-12 are the set UL, bytes 13-15 identify the set type)
/** CDCI (Component-Depth Color Image) Descriptor */
const CDCI_DESCRIPTOR_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x28, 0x00,
] as const;

/** RGBA Descriptor */
const RGBA_DESCRIPTOR_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x29, 0x00,
] as const;

/** JPEG 2000 Sub-Descriptor */
const JPEG2000_SUB_DESCRIPTOR_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x5a, 0x00,
] as const;

/** Wave (PCM) Audio Descriptor */
const WAVE_AUDIO_DESCRIPTOR_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x48, 0x00,
] as const;

/** Preface set UL (contains OperationalPattern property) */
const PREFACE_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x2f, 0x00,
] as const;

/** Material Package UL */
const MATERIAL_PACKAGE_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x36, 0x00,
] as const;

/** Sequence UL */
const SEQUENCE_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x0f, 0x00,
] as const;

/** Timeline Track UL */
const TIMELINE_TRACK_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x11, 0x00,
] as const;

/** Timecode Component UL (byte 14 = 0x14) */
const TIMECODE_COMPONENT_UL = [
  0x06, 0x0e, 0x2b, 0x34, 0x02, 0x53, 0x01, 0x01,
  0x0d, 0x01, 0x01, 0x01, 0x01, 0x01, 0x14, 0x00,
] as const;

// ---------------------------------------------------------------------------
// Known local tag IDs (from primer pack, or well-known SMPTE tags)
// These are 2-byte local tags used within MXF local sets.
// ---------------------------------------------------------------------------

/** Tag: Operational Pattern (in Preface set) */
const TAG_OPERATIONAL_PATTERN = 0x3b09;

/** Tag: Edit Rate (in Track) */
const TAG_EDIT_RATE = 0x4801;

/** Tag: Container Duration (in various descriptors) */
const TAG_CONTAINER_DURATION = 0x3002;

/** Tag: Sample Rate (in File Descriptor) */
const TAG_SAMPLE_RATE = 0x3001;

/** Tag: Stored Width */
const TAG_STORED_WIDTH = 0x3203;

/** Tag: Stored Height */
const TAG_STORED_HEIGHT = 0x3202;

/** Tag: Aspect Ratio */
const TAG_ASPECT_RATIO = 0x320e;

/** Tag: Component Depth (bit depth for CDCI) */
const TAG_COMPONENT_DEPTH = 0x3301;

/** Tag: Essence Container (UL identifying the codec/container) */
const TAG_ESSENCE_CONTAINER = 0x3004;

/** Tag: Audio Channels (ChannelCount) */
const TAG_CHANNEL_COUNT = 0x3d07;

/** Tag: Audio Sampling Rate */
const TAG_AUDIO_SAMPLING_RATE = 0x3d03;

/** Tag: Audio Quantization Bits */
const TAG_QUANTIZATION_BITS = 0x3d01;

/** Tag: Package Name */
const TAG_PACKAGE_NAME = 0x4402;

/** Tag: Package Creation Date */
const TAG_CREATION_DATE = 0x3b02;

/** Tag: Package Modified Date */
const TAG_MODIFIED_DATE = 0x3b03;

/** Tag: Duration (in structural metadata, e.g. Sequence) */
const TAG_DURATION = 0x0202;

/** Tag: Start Timecode */
const TAG_START_TIMECODE = 0x1501;

/** Tag: DropFrame flag (in Timecode Component set) */
const TAG_DROP_FRAME = 0x1502;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface MXFPartition {
  type: 'header' | 'body' | 'footer';
  offset: number;
  headerByteCount: number;
  indexByteCount: number;
  bodyOffset: number;
}

export interface MXFEssenceDescriptor {
  type: 'video' | 'audio' | 'data';
  codec: string;
  containerDuration?: number;
  sampleRate?: { num: number; den: number };
  // Video-specific
  width?: number;
  height?: number;
  aspectRatio?: { num: number; den: number };
  bitDepth?: number;
  colorSpace?: string;
  // Audio-specific
  audioChannels?: number;
  audioSampleRate?: number;
  audioBitDepth?: number;
}

export interface MXFMetadata {
  operationalPattern: string;
  essenceDescriptors: MXFEssenceDescriptor[];
  duration?: number;
  editRate?: { num: number; den: number };
  startTimecode?: string;
  materialPackageInfo?: {
    name?: string;
    creationDate?: string;
    modifiedDate?: string;
  };
}

export interface MXFDemuxResult {
  metadata: MXFMetadata;
  essenceOffsets: Array<{ offset: number; length: number; trackIndex: number }>;
}

// ---------------------------------------------------------------------------
// KLV Parsing
// ---------------------------------------------------------------------------

export interface KLVTriplet {
  key: Uint8Array;
  length: number;
  valueOffset: number;
}

/**
 * Parse a KLV (Key-Length-Value) triplet at the given offset.
 *
 * KLV is the fundamental building block of MXF:
 * - Key: 16 bytes (SMPTE Universal Label)
 * - Length: BER-encoded (1-9 bytes)
 *   - If first byte < 0x80: short form, length = that byte
 *   - If first byte = 0x80: indefinite length (not supported)
 *   - If first byte = 0x80 + N (N=1..8): long form, next N bytes are the length (big-endian)
 * - Value: `length` bytes of payload
 *
 * @throws DecoderError if the buffer is truncated or BER encoding is invalid
 */
export function parseKLV(view: DataView, offset: number): KLVTriplet {
  const bufLen = view.byteLength;

  // Need at least 16 bytes for the key
  if (offset + 16 > bufLen) {
    throw new DecoderError('MXF', `Truncated KLV key at offset ${offset}`);
  }

  // Extract the 16-byte key
  const key = new Uint8Array(view.buffer, view.byteOffset + offset, 16);

  // Parse BER-encoded length starting at offset + 16
  const berStart = offset + 16;
  if (berStart >= bufLen) {
    throw new DecoderError('MXF', `Truncated BER length at offset ${berStart}`);
  }

  const firstByte = view.getUint8(berStart);
  let length: number;
  let valueOffset: number;

  if (firstByte < 0x80) {
    // Short form: length is the byte itself
    length = firstByte;
    valueOffset = berStart + 1;
  } else if (firstByte === 0x80) {
    // Indefinite length -- not supported in MXF
    throw new DecoderError('MXF', `Indefinite BER length at offset ${berStart} is not supported`);
  } else {
    // Long form: lower 7 bits = number of following length bytes
    const numBytes = firstByte & 0x7f;
    if (numBytes > 8) {
      throw new DecoderError('MXF', `Invalid BER length encoding at offset ${berStart}: ${numBytes} length bytes exceeds maximum of 8`);
    }
    if (berStart + 1 + numBytes > bufLen) {
      throw new DecoderError('MXF', `Truncated BER long-form length at offset ${berStart}`);
    }

    length = 0;
    for (let i = 0; i < numBytes; i++) {
      length = length * 256 + view.getUint8(berStart + 1 + i);
    }
    if (length > Number.MAX_SAFE_INTEGER) {
      throw new DecoderError('MXF', `KLV length exceeds safe integer range`);
    }
    valueOffset = berStart + 1 + numBytes;
  }

  return { key: new Uint8Array(key), length, valueOffset };
}

// ---------------------------------------------------------------------------
// UL Matching
// ---------------------------------------------------------------------------

/**
 * Compare a SMPTE Universal Label (16 bytes) against a target pattern.
 * The target array can be shorter than 16 bytes -- only the specified
 * prefix bytes are compared.
 */
export function matchUL(key: Uint8Array, target: readonly number[]): boolean {
  if (key.length < target.length) return false;
  for (let i = 0; i < target.length; i++) {
    if (key[i] !== target[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a buffer contains an MXF file.
 *
 * Checks for the SMPTE UL prefix (bytes 0-3: 06 0E 2B 34) which begins
 * every MXF file's header partition pack.
 */
export function isMXFFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 14) return false;
  const bytes = new Uint8Array(buffer, 0, 14);
  // Check SMPTE UL prefix
  if (bytes[0] !== 0x06 || bytes[1] !== 0x0e || bytes[2] !== 0x2b || bytes[3] !== 0x34) return false;
  // Check partition pack identification
  if (bytes[4] !== 0x02 || bytes[5] !== 0x05 || bytes[6] !== 0x01 || bytes[7] !== 0x01) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Partition Pack Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a Partition Pack from the KLV value.
 *
 * Partition Pack structure (after KLV key+length):
 *   - Major Version (2 bytes)
 *   - Minor Version (2 bytes)
 *   - KAG Size (4 bytes)
 *   - This Partition (8 bytes)
 *   - Previous Partition (8 bytes)
 *   - Footer Partition (8 bytes)
 *   - Header Byte Count (8 bytes)
 *   - Index Byte Count (8 bytes)
 *   - Index SID (4 bytes)
 *   - Body Offset (8 bytes)
 *   - Body SID (4 bytes)
 *   - Operational Pattern (16 bytes)
 *   - Essence Containers batch (variable)
 */
export function parsePartitionPack(
  view: DataView,
  klvOffset: number,
  klv: KLVTriplet,
): MXFPartition {
  // Determine partition type from byte 13 of the key
  const partitionTypeByte = klv.key[13];
  let type: 'header' | 'body' | 'footer';
  if (partitionTypeByte === 0x02) {
    type = 'header';
  } else if (partitionTypeByte === 0x03) {
    type = 'body';
  } else if (partitionTypeByte === 0x04) {
    type = 'footer';
  } else {
    type = 'header'; // fallback
  }

  const valueStart = klv.valueOffset;
  const available = view.byteLength - valueStart;

  // We need at least 56 bytes to read through Index Byte Count
  // (2+2+4+8+8+8+8+8 = 48), plus Body Offset at offset 56 (4+8 = 12 more = 60 total)
  let headerByteCount = 0;
  let indexByteCount = 0;
  let bodyOffset = 0;

  if (available >= 48) {
    // Header Byte Count at offset 28 from value start (2+2+4+8+8+8 = 32... let's be precise)
    // Offset within value:
    //   0: Major Version (2)
    //   2: Minor Version (2)
    //   4: KAG Size (4)
    //   8: This Partition (8)
    //  16: Previous Partition (8)
    //  24: Footer Partition (8)
    //  32: Header Byte Count (8)
    //  40: Index Byte Count (8)
    //  48: Index SID (4)
    //  52: Body Offset (8)
    //  60: Body SID (4)

    // Read as two 32-bit values (hi, lo) for 64-bit fields
    // For simplicity, use only the low 32 bits (safe for files < 4 GB)
    headerByteCount = readUint64AsNumber(view, valueStart + 32);
    indexByteCount = readUint64AsNumber(view, valueStart + 40);
  }

  if (available >= 60) {
    bodyOffset = readUint64AsNumber(view, valueStart + 52);
  }

  return {
    type,
    offset: klvOffset,
    headerByteCount,
    indexByteCount,
    bodyOffset,
  };
}

// ---------------------------------------------------------------------------
// Codec Detection
// ---------------------------------------------------------------------------

/**
 * Identify the codec from an Essence Container UL.
 *
 * Known patterns (checking byte 12 onward of the UL):
 * - JPEG 2000:  0D 01 03 01 02 0C
 * - ProRes:     0D 01 03 01 02 1C
 * - DNxHD:      0D 01 03 01 02 11 01 00
 * - PCM Audio:  0D 01 03 01 02 06
 * - Uncompressed: 0D 01 03 01 02 01
 */
function detectCodecFromEssenceContainerUL(ul: Uint8Array): string {
  // We expect the UL to start with the SMPTE prefix
  if (ul.length < 14) return 'unknown';

  // Check bytes 8-11 match the essence container registry
  if (ul[8] !== 0x0d || ul[9] !== 0x01 || ul[10] !== 0x03 || ul[11] !== 0x01) {
    return 'unknown';
  }

  // Byte 12 should be 0x02 (MXF-GC mappings)
  if (ul[12] !== 0x02) return 'unknown';

  const codecByte = ul[13];

  switch (codecByte) {
    case 0x01: return 'uncompressed';
    case 0x02: return 'mpeg2-d10';
    case 0x04: return 'mpeg2';
    case 0x06: return 'pcm';
    case 0x0c: return 'jpeg2000';
    case 0x10: return 'avc';
    case 0x11: return 'dnxhd';
    case 0x1c: return 'prores';
    case 0x1e: return 'hevc';
    default: return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Operational Pattern Detection
// ---------------------------------------------------------------------------

/**
 * Identify the Operational Pattern from its UL.
 *
 * OP ULs have the structure:
 *   06 0E 2B 34 04 01 01 01 0D 01 02 01 01 xx yy 00
 * where xx = item complexity, yy = package complexity
 *
 * Common patterns:
 *   01 01 = OP1a, 01 02 = OP1b, 01 03 = OP1c
 *   02 01 = OP2a, 02 02 = OP2b, 02 03 = OP2c
 *   03 01 = OP3a, 03 02 = OP3b, 03 03 = OP3c
 *   10 xx = OPAtom
 */
function identifyOperationalPattern(ul: Uint8Array): string {
  if (ul.length < 16) return 'unknown';

  // Check the OP UL prefix (skip ul[7] -- version byte varies across MXF versions)
  if (
    ul[0] !== 0x06 || ul[1] !== 0x0e || ul[2] !== 0x2b || ul[3] !== 0x34 ||
    ul[4] !== 0x04 || ul[5] !== 0x01 || ul[6] !== 0x01 ||
    // Skip ul[7] (version byte)
    ul[8] !== 0x0d || ul[9] !== 0x01 || ul[10] !== 0x02 || ul[11] !== 0x01
  ) {
    return 'unknown';
  }

  const itemComplexity = ul[12] ?? 0;
  const packageComplexity = ul[13] ?? 0;

  if (itemComplexity === 0x10) return 'OPAtom';

  const complexityNames = ['', 'a', 'b', 'c'];
  const complexitySuffix = complexityNames[packageComplexity] ?? '';

  if (itemComplexity >= 1 && itemComplexity <= 3) {
    return `OP${itemComplexity}${complexitySuffix}`;
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Local Set Parsing Helpers
// ---------------------------------------------------------------------------

/**
 * Read a 64-bit big-endian value as a JavaScript number.
 * Only the low 32 bits are used (safe for values < 4 GB).
 * For very large values, combines hi and lo parts.
 */
function readUint64AsNumber(view: DataView, offset: number): number {
  if (offset + 8 > view.byteLength) return 0;
  const hi = view.getUint32(offset, false);
  const lo = view.getUint32(offset + 4, false);
  // Combine safely (JavaScript numbers have 53 bits of integer precision)
  return hi * 0x100000000 + lo;
}

/**
 * Read a rational number (two 32-bit big-endian integers: numerator, denominator).
 */
function readRational(view: DataView, offset: number): { num: number; den: number } | undefined {
  if (offset + 8 > view.byteLength) return undefined;
  const num = view.getUint32(offset, false);
  const den = view.getUint32(offset + 4, false);
  return { num, den };
}

/**
 * Read a UTF-16BE string from the view.
 */
function readUTF16BE(view: DataView, offset: number, length: number): string {
  const chars: string[] = [];
  const end = Math.min(offset + length, view.byteLength);
  for (let i = offset; i + 1 < end; i += 2) {
    const code = view.getUint16(i, false);
    if (code === 0) break; // null terminator
    chars.push(String.fromCharCode(code));
  }
  return chars.join('');
}

/**
 * Read an MXF timestamp (a SMPTE 377 Date struct: 8 bytes).
 * Format: year(2) month(1) day(1) hour(1) minute(1) second(1) quarter_ms(1)
 */
function readTimestamp(view: DataView, offset: number): string | undefined {
  if (offset + 8 > view.byteLength) return undefined;
  const year = view.getUint16(offset, false);
  const month = view.getUint8(offset + 2);
  const day = view.getUint8(offset + 3);
  const hour = view.getUint8(offset + 4);
  const minute = view.getUint8(offset + 5);
  const second = view.getUint8(offset + 6);

  if (year === 0 && month === 0 && day === 0) return undefined;

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

// ---------------------------------------------------------------------------
// Local Set (Metadata Set) Parsing
// ---------------------------------------------------------------------------

interface LocalTagEntry {
  tag: number;
  offset: number;
  length: number;
}

/**
 * Parse the local tag entries from a local set (KLV value).
 * Local sets use 2-byte tags + 2-byte lengths (SMPTE 377 2-byte local set).
 */
function parseLocalSetTags(view: DataView, valueOffset: number, valueLength: number): LocalTagEntry[] {
  const entries: LocalTagEntry[] = [];
  const end = Math.min(valueOffset + valueLength, view.byteLength);
  let pos = valueOffset;

  // Skip the 16-byte Instance UID (first entry in a local set is always the instance UID)
  // Actually, the set starts with tag-length pairs immediately.

  while (pos + 4 <= end) {
    const tag = view.getUint16(pos, false);
    const len = view.getUint16(pos + 2, false);
    pos += 4;

    if (tag === 0 && len === 0) break; // end of set

    if (pos + len > end) break; // truncated

    entries.push({ tag, offset: pos, length: len });
    pos += len;
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Descriptor Parsing
// ---------------------------------------------------------------------------

function parseVideoDescriptor(
  view: DataView,
  valueOffset: number,
  valueLength: number,
  descriptorType: 'cdci' | 'rgba',
): MXFEssenceDescriptor {
  const descriptor: MXFEssenceDescriptor = {
    type: 'video',
    codec: 'uncompressed',
    colorSpace: descriptorType === 'cdci' ? 'YCbCr' : 'RGBA',
  };

  const tags = parseLocalSetTags(view, valueOffset, valueLength);

  for (const entry of tags) {
    switch (entry.tag) {
      case TAG_STORED_WIDTH:
        if (entry.length >= 4) {
          descriptor.width = view.getUint32(entry.offset, false);
        }
        break;
      case TAG_STORED_HEIGHT:
        if (entry.length >= 4) {
          descriptor.height = view.getUint32(entry.offset, false);
        }
        break;
      case TAG_ASPECT_RATIO:
        descriptor.aspectRatio = readRational(view, entry.offset);
        break;
      case TAG_COMPONENT_DEPTH:
        if (entry.length >= 4) {
          descriptor.bitDepth = view.getUint32(entry.offset, false);
        }
        break;
      case TAG_CONTAINER_DURATION:
        if (entry.length >= 8) {
          descriptor.containerDuration = readUint64AsNumber(view, entry.offset);
        }
        break;
      case TAG_SAMPLE_RATE:
        descriptor.sampleRate = readRational(view, entry.offset);
        break;
      case TAG_ESSENCE_CONTAINER: {
        if (entry.length >= 16) {
          const ul = new Uint8Array(view.buffer, view.byteOffset + entry.offset, 16);
          const codec = detectCodecFromEssenceContainerUL(ul);
          if (codec !== 'unknown') {
            descriptor.codec = codec;
          }
        }
        break;
      }
    }
  }

  return descriptor;
}

function parseAudioDescriptor(
  view: DataView,
  valueOffset: number,
  valueLength: number,
): MXFEssenceDescriptor {
  const descriptor: MXFEssenceDescriptor = {
    type: 'audio',
    codec: 'pcm',
  };

  const tags = parseLocalSetTags(view, valueOffset, valueLength);

  for (const entry of tags) {
    switch (entry.tag) {
      case TAG_CHANNEL_COUNT:
        if (entry.length >= 4) {
          descriptor.audioChannels = view.getUint32(entry.offset, false);
        }
        break;
      case TAG_AUDIO_SAMPLING_RATE:
        descriptor.sampleRate = readRational(view, entry.offset);
        if (descriptor.sampleRate) {
          descriptor.audioSampleRate =
            descriptor.sampleRate.den !== 0
              ? descriptor.sampleRate.num / descriptor.sampleRate.den
              : 0;
        }
        break;
      case TAG_QUANTIZATION_BITS:
        if (entry.length >= 4) {
          descriptor.audioBitDepth = view.getUint32(entry.offset, false);
        }
        break;
      case TAG_CONTAINER_DURATION:
        if (entry.length >= 8) {
          descriptor.containerDuration = readUint64AsNumber(view, entry.offset);
        }
        break;
      case TAG_SAMPLE_RATE:
        if (!descriptor.sampleRate) {
          descriptor.sampleRate = readRational(view, entry.offset);
        }
        break;
      case TAG_ESSENCE_CONTAINER: {
        if (entry.length >= 16) {
          const ul = new Uint8Array(view.buffer, view.byteOffset + entry.offset, 16);
          const codec = detectCodecFromEssenceContainerUL(ul);
          if (codec !== 'unknown') {
            descriptor.codec = codec;
          }
        }
        break;
      }
    }
  }

  return descriptor;
}

// ---------------------------------------------------------------------------
// Header Partition Parsing
// ---------------------------------------------------------------------------

/**
 * Parse just the header partition of an MXF file to extract metadata.
 *
 * Walks KLV triplets in the header partition, looking for:
 * - Partition Pack (operational pattern from the pack itself)
 * - Preface set (operational pattern UL)
 * - Material Package (name, creation/modified dates)
 * - Timeline Tracks (edit rate)
 * - Sequences (duration)
 * - CDCI/RGBA Descriptors (video metadata)
 * - Wave Audio Descriptors (audio metadata)
 * - JPEG2000 Sub-Descriptors (codec hint)
 *
 * @throws DecoderError if the buffer is not a valid MXF file
 */
export function parseMXFHeader(buffer: ArrayBuffer): MXFMetadata {
  if (!isMXFFile(buffer)) {
    throw new DecoderError('MXF', 'Not a valid MXF file');
  }

  const view = new DataView(buffer);
  const metadata: MXFMetadata = {
    operationalPattern: 'unknown',
    essenceDescriptors: [],
  };

  let offset = 0;
  let headerPartitionEnd = buffer.byteLength; // default: scan entire buffer
  let firstPartitionParsed = false;
  let hasJPEG2000SubDescriptor = false;

  // Walk KLV triplets
  while (offset + 17 <= buffer.byteLength) {
    let klv: KLVTriplet;
    try {
      klv = parseKLV(view, offset);
    } catch {
      break; // can't parse further
    }

    const klvEnd = klv.valueOffset + klv.length;

    // Parse the header partition pack
    if (!firstPartitionParsed && matchUL(klv.key, PARTITION_PACK_UL_PREFIX)) {
      firstPartitionParsed = true;
      const partition = parsePartitionPack(view, offset, klv);
      if (partition.type === 'header' && partition.headerByteCount > 0) {
        headerPartitionEnd = klvEnd + partition.headerByteCount;
      }

      // Extract OP from partition pack value (bytes 64-79 from value start)
      if (klv.length >= 80) {
        const opUL = new Uint8Array(view.buffer, view.byteOffset + klv.valueOffset + 64, 16);
        metadata.operationalPattern = identifyOperationalPattern(opUL);
      }
    }

    // Preface set -- may contain OperationalPattern property
    if (matchUL(klv.key, PREFACE_UL)) {
      const tags = parseLocalSetTags(view, klv.valueOffset, klv.length);
      for (const entry of tags) {
        if (entry.tag === TAG_OPERATIONAL_PATTERN && entry.length >= 16) {
          const opUL = new Uint8Array(view.buffer, view.byteOffset + entry.offset, 16);
          metadata.operationalPattern = identifyOperationalPattern(opUL);
        }
        if (entry.tag === TAG_CREATION_DATE && entry.length >= 8) {
          const date = readTimestamp(view, entry.offset);
          if (date) {
            if (!metadata.materialPackageInfo) {
              metadata.materialPackageInfo = {};
            }
            metadata.materialPackageInfo.creationDate = date;
          }
        }
        if (entry.tag === TAG_MODIFIED_DATE && entry.length >= 8) {
          const date = readTimestamp(view, entry.offset);
          if (date) {
            if (!metadata.materialPackageInfo) {
              metadata.materialPackageInfo = {};
            }
            metadata.materialPackageInfo.modifiedDate = date;
          }
        }
      }
    }

    // Material Package
    if (matchUL(klv.key, MATERIAL_PACKAGE_UL)) {
      const tags = parseLocalSetTags(view, klv.valueOffset, klv.length);
      for (const entry of tags) {
        if (entry.tag === TAG_PACKAGE_NAME && entry.length >= 2) {
          const name = readUTF16BE(view, entry.offset, entry.length);
          if (name) {
            if (!metadata.materialPackageInfo) {
              metadata.materialPackageInfo = {};
            }
            metadata.materialPackageInfo.name = name;
          }
        }
        if (entry.tag === TAG_CREATION_DATE && entry.length >= 8) {
          const date = readTimestamp(view, entry.offset);
          if (date) {
            if (!metadata.materialPackageInfo) {
              metadata.materialPackageInfo = {};
            }
            metadata.materialPackageInfo.creationDate = date;
          }
        }
        if (entry.tag === TAG_MODIFIED_DATE && entry.length >= 8) {
          const date = readTimestamp(view, entry.offset);
          if (date) {
            if (!metadata.materialPackageInfo) {
              metadata.materialPackageInfo = {};
            }
            metadata.materialPackageInfo.modifiedDate = date;
          }
        }
      }
    }

    // Timeline Track -- extract edit rate
    if (matchUL(klv.key, TIMELINE_TRACK_UL)) {
      const tags = parseLocalSetTags(view, klv.valueOffset, klv.length);
      for (const entry of tags) {
        if (entry.tag === TAG_EDIT_RATE && entry.length >= 8) {
          const rate = readRational(view, entry.offset);
          if (rate && !metadata.editRate) {
            metadata.editRate = rate;
          }
        }
      }
    }

    // Sequence -- extract duration
    if (matchUL(klv.key, SEQUENCE_UL)) {
      const tags = parseLocalSetTags(view, klv.valueOffset, klv.length);
      for (const entry of tags) {
        if (entry.tag === TAG_DURATION && entry.length >= 8) {
          const dur = readUint64AsNumber(view, entry.offset);
          if (dur > 0 && metadata.duration === undefined) {
            metadata.duration = dur;
          }
        }
      }
    }

    // Source Clip -- source reference info (StartPosition tag 0x1201, NOT timecode)
    // Timecode lives in the Timecode Component set, not here.

    // Timecode Component -- contains start timecode and drop-frame flag
    if (matchUL(klv.key, TIMECODE_COMPONENT_UL)) {
      const tags = parseLocalSetTags(view, klv.valueOffset, klv.length);
      let startTC = -1;
      let dropFrame = false;
      for (const entry of tags) {
        if (entry.tag === TAG_START_TIMECODE && entry.length >= 8) {
          startTC = readUint64AsNumber(view, entry.offset);
        }
        if (entry.tag === TAG_DROP_FRAME && entry.length >= 1) {
          dropFrame = view.getUint8(entry.offset) !== 0;
        }
      }
      if (startTC >= 0 && !metadata.startTimecode) {
        // Convert frame count to timecode string (assuming 24fps as fallback)
        const fps = metadata.editRate
          ? metadata.editRate.den !== 0
            ? metadata.editRate.num / metadata.editRate.den
            : 24
          : 24;
        if (dropFrame) {
          metadata.startTimecode = framesToTimecodeDF(startTC, fps);
        } else {
          metadata.startTimecode = framesToTimecode(startTC, fps);
        }
      }
    }

    // CDCI Descriptor
    if (matchUL(klv.key, CDCI_DESCRIPTOR_UL)) {
      const desc = parseVideoDescriptor(view, klv.valueOffset, klv.length, 'cdci');
      metadata.essenceDescriptors.push(desc);
    }

    // RGBA Descriptor
    if (matchUL(klv.key, RGBA_DESCRIPTOR_UL)) {
      const desc = parseVideoDescriptor(view, klv.valueOffset, klv.length, 'rgba');
      metadata.essenceDescriptors.push(desc);
    }

    // JPEG 2000 Sub-Descriptor
    if (matchUL(klv.key, JPEG2000_SUB_DESCRIPTOR_UL)) {
      hasJPEG2000SubDescriptor = true;
    }

    // Wave Audio Descriptor
    if (matchUL(klv.key, WAVE_AUDIO_DESCRIPTOR_UL)) {
      const desc = parseAudioDescriptor(view, klv.valueOffset, klv.length);
      metadata.essenceDescriptors.push(desc);
    }

    // Advance to the next KLV
    const nextOffset = klv.valueOffset + klv.length;
    if (nextOffset <= offset) break; // prevent infinite loop
    offset = nextOffset;

    // Don't scan past the header partition
    if (offset >= headerPartitionEnd) break;
  }

  // If a JPEG 2000 sub-descriptor was found, update the video descriptor codec
  if (hasJPEG2000SubDescriptor) {
    for (const desc of metadata.essenceDescriptors) {
      if (desc.type === 'video' && (desc.codec === 'uncompressed' || desc.codec === 'unknown')) {
        desc.codec = 'jpeg2000';
      }
    }
  }

  return metadata;
}

// ---------------------------------------------------------------------------
// Full Demux
// ---------------------------------------------------------------------------

/**
 * Full demux: parse all partitions and locate essence data offsets.
 *
 * Walks the entire file to find:
 * 1. All partition packs (header, body, footer)
 * 2. All essence elements (video/audio data chunks)
 * 3. All metadata (via parseMXFHeader for the header partition)
 *
 * @throws DecoderError if the buffer is not a valid MXF file
 */
export function demuxMXF(buffer: ArrayBuffer): MXFDemuxResult {
  // Parse header metadata first
  const metadata = parseMXFHeader(buffer);

  const view = new DataView(buffer);
  const essenceOffsets: Array<{ offset: number; length: number; trackIndex: number }> = [];

  let offset = 0;
  let trackIndex = 0;

  // Walk all KLV triplets to find essence elements
  while (offset + 17 <= buffer.byteLength) {
    let klv: KLVTriplet;
    try {
      klv = parseKLV(view, offset);
    } catch {
      break;
    }

    // Check if this is an essence element
    if (matchUL(klv.key, ESSENCE_ELEMENT_UL_PREFIX)) {
      // Byte 15 of the key identifies the track number within the essence container
      const elementTrackNumber = klv.key[15] ?? 0;
      // Use the element's track number, or increment if it's 0
      const essenceTrackIndex = elementTrackNumber > 0 ? elementTrackNumber - 1 : trackIndex;

      essenceOffsets.push({
        offset: klv.valueOffset,
        length: klv.length,
        trackIndex: essenceTrackIndex,
      });
      trackIndex++;
    }

    // Advance to the next KLV
    const nextOffset = klv.valueOffset + klv.length;
    if (nextOffset <= offset) break;
    offset = nextOffset;
  }

  return { metadata, essenceOffsets };
}

// ---------------------------------------------------------------------------
// Timecode Helpers
// ---------------------------------------------------------------------------

/** Pad a number to 2 digits. */
function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Convert a frame count to a non-drop-frame timecode string (HH:MM:SS:FF).
 */
export function framesToTimecode(frames: number, fps: number): string {
  if (fps <= 0) return '00:00:00:00';
  const totalFrames = Math.floor(frames);
  const fpsInt = Math.round(fps);

  const ff = totalFrames % fpsInt;
  const totalSeconds = Math.floor(totalFrames / fpsInt);
  const ss = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mm = totalMinutes % 60;
  const hh = Math.floor(totalMinutes / 60);

  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}:${pad2(ff)}`;
}

/**
 * Convert a frame count to a drop-frame timecode string (HH:MM:SS;FF).
 * Uses `;` as the frames separator per SMPTE convention for DF timecodes.
 */
export function framesToTimecodeDF(totalFrames: number, fps: number): string {
  if (fps <= 0) return '00:00:00;00';
  const fpsInt = Math.round(fps);
  const dropFrames = Math.round(fps * 0.066666); // 2 for 29.97, 4 for 59.94
  const framesPerMin = fpsInt * 60 - dropFrames;
  const framesPer10Min = framesPerMin * 10 + dropFrames;

  // Decompose into 10-minute blocks and remainder
  const d = Math.floor(totalFrames / framesPer10Min);
  const m = totalFrames % framesPer10Min;

  // Adjust frame number to account for dropped frame numbers.
  // Each complete 10-minute block has 9 drops (at minutes 1-9).
  // Within the current block:
  //   - The first minute (10-minute mark) has fpsInt*60 frames with no drop
  //   - Each subsequent minute has framesPerMin real frames and drops `dropFrames` TC numbers
  const firstMinuteFrames = fpsInt * 60; // 1800 for 29.97fps
  let f: number;
  if (m < firstMinuteFrames) {
    // In the first minute of the 10-minute block (no drops in this minute)
    f = totalFrames + d * 9 * dropFrames;
  } else {
    const mAdjusted = m - firstMinuteFrames;
    const minutesCrossed = Math.floor(mAdjusted / framesPerMin) + 1;
    f = totalFrames + d * 9 * dropFrames + dropFrames * minutesCrossed;
  }

  const ff = f % fpsInt;
  f = Math.floor(f / fpsInt);
  const ss = f % 60;
  f = Math.floor(f / 60);
  const mm = f % 60;
  const hh = Math.floor(f / 60);

  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)};${pad2(ff)}`;
}
