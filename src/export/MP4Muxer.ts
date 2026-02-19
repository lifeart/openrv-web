/**
 * Minimal MP4 (ISO BMFF) Muxer for H.264 video
 *
 * Produces a valid MP4 file from encoded video chunks. Supports H.264 (AVC)
 * with Annex B → AVCC conversion. This is a lightweight muxer sufficient for
 * single-track video without audio.
 *
 * For VP9/AV1, the encoded chunks are stored raw and the container signals
 * the appropriate codec via the sample entry box.
 *
 * Reference: ISO 14496-12 (ISOBMFF), ISO 14496-15 (AVC file format)
 */

import type { EncodedChunk, VideoCodec } from './VideoExporter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MuxerConfig {
  codec: VideoCodec;
  width: number;
  height: number;
  fps: number;
}

// ---------------------------------------------------------------------------
// MP4 Box writer utilities
// ---------------------------------------------------------------------------

/** Write a big-endian 32-bit unsigned integer */
function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, false);
}

/** Write a big-endian 16-bit unsigned integer */
function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, false);
}

/** Write a 4-character box type */
function writeType(buf: Uint8Array, offset: number, type: string): void {
  for (let i = 0; i < 4; i++) {
    buf[offset + i] = type.charCodeAt(i);
  }
}

/** Build an MP4 box: [size:4][type:4][payload] */
function box(type: string, ...payloads: Uint8Array[]): Uint8Array {
  let payloadSize = 0;
  for (const p of payloads) payloadSize += p.length;
  const size = 8 + payloadSize;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  writeU32(view, 0, size);
  writeType(result, 4, type);
  let offset = 8;
  for (const p of payloads) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

/** Build a fullbox: [size:4][type:4][version:1][flags:3][payload] */
function fullbox(type: string, version: number, flags: number, ...payloads: Uint8Array[]): Uint8Array {
  let payloadSize = 0;
  for (const p of payloads) payloadSize += p.length;
  const size = 12 + payloadSize;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  writeU32(view, 0, size);
  writeType(result, 4, type);
  result[8] = version;
  result[9] = (flags >> 16) & 0xff;
  result[10] = (flags >> 8) & 0xff;
  result[11] = flags & 0xff;
  let offset = 12;
  for (const p of payloads) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

/** Encode a string as UTF-8 bytes */
function strBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Create a buffer from a DataView builder */
function u32(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, value, false);
  return buf;
}


// ---------------------------------------------------------------------------
// AVCC helpers (H.264 Annex B → AVCC conversion)
// ---------------------------------------------------------------------------

interface NALUnit {
  type: number;
  data: Uint8Array;
}

/**
 * Extract NAL units from Annex B byte stream.
 * Handles both 3-byte (0x000001) and 4-byte (0x00000001) start codes.
 */
function extractNALUnits(data: Uint8Array): NALUnit[] {
  const units: NALUnit[] = [];
  let i = 0;

  while (i < data.length) {
    // Find start code
    let startCodeLen = 0;
    if (i + 3 < data.length && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
      startCodeLen = 4;
    } else if (i + 2 < data.length && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      startCodeLen = 3;
    } else {
      i++;
      continue;
    }

    const nalStart = i + startCodeLen;

    // Find next start code or end
    let nalEnd = data.length;
    for (let j = nalStart + 1; j < data.length - 2; j++) {
      if (data[j] === 0 && data[j + 1] === 0 && (data[j + 2] === 1 || (data[j + 2] === 0 && j + 3 < data.length && data[j + 3] === 1))) {
        nalEnd = j;
        break;
      }
    }

    if (nalStart < nalEnd) {
      const nalData = data.slice(nalStart, nalEnd);
      const nalType = nalData[0]! & 0x1f;
      units.push({ type: nalType, data: nalData });
    }

    i = nalEnd;
  }

  return units;
}

/**
 * Check if the data uses AVCC format (length-prefixed NAL units)
 * vs Annex B (start code prefixed).
 */
function isAVCCFormat(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  // AVCC starts with a 4-byte length, not 0x00000001
  const firstU32 = (data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!;
  // If first 4 bytes look like a plausible NAL length (not a start code)
  return firstU32 !== 1 && !(data[0] === 0 && data[1] === 0 && data[2] === 1);
}

/**
 * Extract NAL units from AVCC-formatted data (length-prefixed).
 */
function extractNALUnitsAVCC(data: Uint8Array, nalLengthSize: number = 4): NALUnit[] {
  const units: NALUnit[] = [];
  let offset = 0;

  while (offset + nalLengthSize <= data.length) {
    let nalLength = 0;
    for (let i = 0; i < nalLengthSize; i++) {
      nalLength = (nalLength << 8) | data[offset + i]!;
    }
    offset += nalLengthSize;

    if (nalLength <= 0 || offset + nalLength > data.length) break;

    const nalData = data.slice(offset, offset + nalLength);
    const nalType = nalData[0]! & 0x1f;
    units.push({ type: nalType, data: nalData });
    offset += nalLength;
  }

  return units;
}

/**
 * Convert Annex B encoded data to AVCC format (4-byte length prefix).
 */
function annexBToAVCC(data: Uint8Array): Uint8Array {
  const nals = extractNALUnits(data);
  // Filter out SPS/PPS from stream data (they go in the decoder config)
  const streamNals = nals.filter(n => n.type !== 7 && n.type !== 8);

  let totalSize = 0;
  for (const nal of streamNals) totalSize += 4 + nal.data.length;

  const result = new Uint8Array(totalSize);
  const view = new DataView(result.buffer);
  let offset = 0;
  for (const nal of streamNals) {
    writeU32(view, offset, nal.data.length);
    offset += 4;
    result.set(nal.data, offset);
    offset += nal.data.length;
  }
  return result;
}

/**
 * Extract SPS and PPS NAL units from the first keyframe.
 * Returns null if not found (non-H.264 codec).
 */
function extractSPSPPS(chunks: EncodedChunk[]): { sps: Uint8Array; pps: Uint8Array } | null {
  for (const chunk of chunks) {
    if (chunk.type !== 'key') continue;

    let nals: NALUnit[];
    if (isAVCCFormat(chunk.data)) {
      nals = extractNALUnitsAVCC(chunk.data);
    } else {
      nals = extractNALUnits(chunk.data);
    }

    const sps = nals.find(n => n.type === 7);
    const pps = nals.find(n => n.type === 8);
    if (sps && pps) {
      return { sps: sps.data, pps: pps.data };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an AVC Decoder Configuration Record (for avcC box).
 */
export function buildAVCDecoderConfig(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  const config = new Uint8Array(11 + sps.length + pps.length);
  const view = new DataView(config.buffer);
  let offset = 0;

  config[offset++] = 1;                      // configurationVersion
  config[offset++] = sps[1]!;                // AVCProfileIndication
  config[offset++] = sps[2]!;                // profile_compatibility
  config[offset++] = sps[3]!;                // AVCLevelIndication
  config[offset++] = 0xff;                   // lengthSizeMinusOne = 3 (4 bytes)
  config[offset++] = 0xe1;                   // numOfSequenceParameterSets = 1

  // SPS
  writeU16(view, offset, sps.length);
  offset += 2;
  config.set(sps, offset);
  offset += sps.length;

  // PPS
  config[offset++] = 1;                      // numOfPictureParameterSets = 1
  writeU16(view, offset, pps.length);
  offset += 2;
  config.set(pps, offset);

  return config;
}

/**
 * Mux encoded video chunks into an MP4 file blob.
 *
 * @param chunks - Encoded video chunks from VideoExporter
 * @param config - Muxer configuration
 * @returns MP4 file as a Uint8Array
 */
export function muxToMP4(chunks: EncodedChunk[], config: MuxerConfig): Uint8Array {
  if (chunks.length === 0) {
    throw new Error('muxToMP4: no chunks to mux');
  }
  const { width, height, fps } = config;
  if (width > 65535 || height > 65535) {
    throw new Error(`muxToMP4: dimensions ${width}x${height} exceed 65535 max`);
  }
  const timescale = 90000; // Standard video timescale
  const sampleDuration = Math.round(timescale / fps);
  const isH264 = config.codec.startsWith('avc1');

  // Extract SPS/PPS for H.264
  const spsPps = isH264 ? extractSPSPPS(chunks) : null;

  // Convert chunk data to sample format
  const samples: Uint8Array[] = [];
  const sampleSizes: number[] = [];
  const syncSamples: number[] = []; // 1-based indices of keyframes

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    let sampleData: Uint8Array;

    if (isH264 && !isAVCCFormat(chunk.data)) {
      // Convert Annex B to AVCC
      sampleData = annexBToAVCC(chunk.data);
    } else {
      sampleData = chunk.data;
    }

    samples.push(sampleData);
    sampleSizes.push(sampleData.length);
    if (chunk.type === 'key') {
      syncSamples.push(i + 1);
    }
  }

  // Compute mdat size
  let mdatPayloadSize = 0;
  for (const s of sampleSizes) mdatPayloadSize += s;

  // Build sample entry
  let sampleEntry: Uint8Array;
  if (isH264 && spsPps) {
    const avccData = buildAVCDecoderConfig(spsPps.sps, spsPps.pps);
    const avccBox = box('avcC', avccData);
    sampleEntry = buildVisualSampleEntry('avc1', width, height, avccBox);
  } else {
    // For VP9/AV1 or H.264 without SPS/PPS, use codec-appropriate box
    const codecType = isH264 ? 'avc1' : config.codec.startsWith('vp09') ? 'vp09' : 'av01';
    sampleEntry = buildVisualSampleEntry(codecType, width, height);
  }

  // Build stbl (Sample Table) children
  const stsdBox = fullbox('stsd', 0, 0, u32(1), sampleEntry); // 1 entry

  // stts — decoding time to sample (constant duration)
  const sttsPayload = new Uint8Array(12);
  const sttsView = new DataView(sttsPayload.buffer);
  writeU32(sttsView, 0, 1);                // entry_count
  writeU32(sttsView, 4, chunks.length);     // sample_count
  writeU32(sttsView, 8, sampleDuration);    // sample_delta
  const sttsBox = fullbox('stts', 0, 0, sttsPayload);

  // stsc — sample to chunk (all in one chunk)
  const stscPayload = new Uint8Array(16);
  const stscView = new DataView(stscPayload.buffer);
  writeU32(stscView, 0, 1);                // entry_count
  writeU32(stscView, 4, 1);                // first_chunk
  writeU32(stscView, 8, chunks.length);     // samples_per_chunk
  writeU32(stscView, 12, 1);               // sample_description_index
  const stscBox = fullbox('stsc', 0, 0, stscPayload);

  // stsz — sample sizes
  const stszPayload = new Uint8Array(8 + chunks.length * 4);
  const stszView = new DataView(stszPayload.buffer);
  writeU32(stszView, 0, 0);                // sample_size = 0 (variable)
  writeU32(stszView, 4, chunks.length);     // sample_count
  for (let i = 0; i < sampleSizes.length; i++) {
    writeU32(stszView, 8 + i * 4, sampleSizes[i]!);
  }
  const stszBox = fullbox('stsz', 0, 0, stszPayload);

  // stco — chunk offsets (single chunk, offset will be computed)
  // We track the stco payload so we can patch the chunk_offset after computing moov size
  const stcoPayload = new Uint8Array(8);
  const stcoPayloadView = new DataView(stcoPayload.buffer);
  writeU32(stcoPayloadView, 0, 1);                // entry_count
  writeU32(stcoPayloadView, 4, 0);                // chunk_offset (placeholder — patched below)
  const stcoBox = fullbox('stco', 0, 0, stcoPayload);

  // stss — sync samples (keyframes)
  let stssBox: Uint8Array | undefined;
  if (syncSamples.length > 0 && syncSamples.length < chunks.length) {
    const stssPayload = new Uint8Array(4 + syncSamples.length * 4);
    const stssViewPayload = new DataView(stssPayload.buffer);
    writeU32(stssViewPayload, 0, syncSamples.length);
    for (let i = 0; i < syncSamples.length; i++) {
      writeU32(stssViewPayload, 4 + i * 4, syncSamples[i]!);
    }
    stssBox = fullbox('stss', 0, 0, stssPayload);
  }

  // Build stbl
  const stblChildren = stssBox
    ? [stsdBox, sttsBox, stscBox, stszBox, stcoBox, stssBox]
    : [stsdBox, sttsBox, stscBox, stszBox, stcoBox];
  const stblBox = box('stbl', ...stblChildren);

  // dinf + dref
  const drefEntry = fullbox('url ', 0, 1); // self-contained flag
  const drefBox = fullbox('dref', 0, 0, u32(1), drefEntry);
  const dinfBox = box('dinf', drefBox);

  // minf
  const vmhdBox = fullbox('vmhd', 0, 1, new Uint8Array(8)); // graphicsmode + opcolor
  const minfBox = box('minf', vmhdBox, dinfBox, stblBox);

  // mdhd
  const totalDuration = chunks.length * sampleDuration;
  const mdhdPayload = new Uint8Array(20);
  const mdhdView = new DataView(mdhdPayload.buffer);
  writeU32(mdhdView, 0, 0);                // creation_time
  writeU32(mdhdView, 4, 0);                // modification_time
  writeU32(mdhdView, 8, timescale);         // timescale
  writeU32(mdhdView, 12, totalDuration);    // duration
  writeU16(mdhdView, 16, 0x55c4);          // language (undetermined)
  writeU16(mdhdView, 18, 0);               // pre_defined
  const mdhdBox = fullbox('mdhd', 0, 0, mdhdPayload);

  // hdlr
  const hdlrPayload = concat(
    new Uint8Array(4),                      // pre_defined
    strBytes('vide'),                       // handler_type
    new Uint8Array(12),                     // reserved
    strBytes('VideoHandler\0'),             // name
  );
  const hdlrBox = fullbox('hdlr', 0, 0, hdlrPayload);

  // mdia
  const mdiaBox = box('mdia', mdhdBox, hdlrBox, minfBox);

  // tkhd
  const tkhdPayload = new Uint8Array(80);
  const tkhdView = new DataView(tkhdPayload.buffer);
  writeU32(tkhdView, 0, 0);                // creation_time
  writeU32(tkhdView, 4, 0);                // modification_time
  writeU32(tkhdView, 8, 1);                // track_ID
  writeU32(tkhdView, 12, 0);               // reserved
  const mvTimescale = 1000;
  const mvDuration = Math.round((chunks.length / fps) * mvTimescale);
  writeU32(tkhdView, 16, mvDuration);       // duration (in movie timescale)
  // bytes 20-27: reserved
  // bytes 28-29: layer
  // bytes 30-31: alternate_group
  // bytes 32-33: volume (0 for video)
  // bytes 34-35: reserved
  // bytes 36-71: matrix (identity)
  const matrixOffset = 36;
  writeU32(tkhdView, matrixOffset, 0x00010000);      // a = 1.0
  writeU32(tkhdView, matrixOffset + 16, 0x00010000); // d = 1.0
  writeU32(tkhdView, matrixOffset + 32, 0x40000000); // w = 1.0
  // bytes 72-75: width (16.16 fixed-point)
  writeU32(tkhdView, 72, (width * 0x10000) >>> 0);
  // bytes 76-79: height (16.16 fixed-point)
  writeU32(tkhdView, 76, (height * 0x10000) >>> 0);
  const tkhdBox = fullbox('tkhd', 0, 3, tkhdPayload); // flags=3 (track_enabled | track_in_movie)

  // trak
  const trakBox = box('trak', tkhdBox, mdiaBox);

  // mvhd
  const mvhdPayload = new Uint8Array(96);
  const mvhdViewData = new DataView(mvhdPayload.buffer);
  writeU32(mvhdViewData, 0, 0);             // creation_time
  writeU32(mvhdViewData, 4, 0);             // modification_time
  writeU32(mvhdViewData, 8, mvTimescale);    // timescale
  writeU32(mvhdViewData, 12, mvDuration);    // duration
  writeU32(mvhdViewData, 16, 0x00010000);    // rate = 1.0
  writeU16(mvhdViewData, 20, 0x0100);        // volume = 1.0
  // reserved: 10 bytes at offset 22
  // matrix: 36 bytes at offset 32
  writeU32(mvhdViewData, 32, 0x00010000);    // a = 1.0
  writeU32(mvhdViewData, 48, 0x00010000);    // d = 1.0
  writeU32(mvhdViewData, 64, 0x40000000);    // w = 1.0
  // pre_defined: 24 bytes at offset 68
  writeU32(mvhdViewData, 92, 2);             // next_track_ID
  const mvhdBox = fullbox('mvhd', 0, 0, mvhdPayload);

  // moov
  const moovBox = box('moov', mvhdBox, trakBox);

  // ftyp
  const ftypPayload = concat(
    strBytes('isom'),                       // major_brand
    u32(0x200),                             // minor_version
    strBytes('isomiso2'),                   // compatible_brands
    isH264 ? strBytes('avc1mp41') : new Uint8Array(0),
  );
  const ftypBox = box('ftyp', ftypPayload);

  // Now compute the actual mdat offset and patch stco chunk_offset.
  // stcoBox is embedded in moov; we find its position by searching for the stcoBox
  // bytes within moovBox, then patch the chunk_offset field.
  const mdatHeaderSize = 8;
  const mdatOffset = ftypBox.length + moovBox.length + mdatHeaderSize;
  patchStcoOffset(moovBox, stcoBox, mdatOffset);

  // Build mdat
  const mdatSize = mdatHeaderSize + mdatPayloadSize;
  const mdatHeader = new Uint8Array(8);
  const mdatHView = new DataView(mdatHeader.buffer);
  writeU32(mdatHView, 0, mdatSize);
  writeType(mdatHeader, 4, 'mdat');

  // Combine all parts into a single buffer
  const parts: Uint8Array[] = [ftypBox, moovBox, mdatHeader, ...samples];
  return concat(...parts);
}

/**
 * Convenience: mux and return as a Blob with video/mp4 MIME type.
 */
export function muxToMP4Blob(chunks: EncodedChunk[], config: MuxerConfig): Blob {
  const data = muxToMP4(chunks, config);
  const buffer: ArrayBuffer =
    typeof SharedArrayBuffer !== 'undefined' && data.buffer instanceof SharedArrayBuffer
      ? data.slice().buffer as ArrayBuffer
      : data.buffer as ArrayBuffer;
  return new Blob([buffer], { type: 'video/mp4' });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildVisualSampleEntry(
  codecType: string,
  width: number,
  height: number,
  ...extensions: Uint8Array[]
): Uint8Array {
  // VisualSampleEntry is 86 bytes (header + fixed fields) + extensions
  let extSize = 0;
  for (const e of extensions) extSize += e.length;
  const entrySize = 86 + extSize;
  const entry = new Uint8Array(entrySize);
  const view = new DataView(entry.buffer);

  writeU32(view, 0, entrySize);            // size
  writeType(entry, 4, codecType);           // type
  // 6 bytes reserved (8-13)
  writeU16(view, 14, 1);                   // data_reference_index
  // 16 bytes pre_defined + reserved (16-31)
  writeU16(view, 32, width);               // width
  writeU16(view, 34, height);              // height
  writeU32(view, 36, 0x00480000);          // horizresolution = 72 dpi
  writeU32(view, 40, 0x00480000);          // vertresolution = 72 dpi
  // 4 bytes reserved (44-47)
  writeU16(view, 48, 1);                   // frame_count
  // 32 bytes compressorname (50-81) — zero-filled
  writeU16(view, 82, 0x0018);             // depth = 24
  writeU16(view, 84, 0xffff);             // pre_defined = -1

  let offset = 86;
  for (const ext of extensions) {
    entry.set(ext, offset);
    offset += ext.length;
  }

  return entry;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const a of arrays) totalLength += a.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

/**
 * Patch the stco chunk_offset inside moovData.
 *
 * Locates the stco box by matching the exact stcoBox byte sequence within
 * moovData, then overwrites the chunk_offset field. This avoids fragile
 * ASCII substring scanning.
 */
function patchStcoOffset(moovData: Uint8Array, stcoBox: Uint8Array, offset: number): void {
  // The stco fullbox layout:
  //   [0..3] size  [4..7] 'stco'  [8..11] version+flags  [12..15] entry_count  [16..19] chunk_offset
  // We need to find where stcoBox is embedded in moovData and patch byte 16-19.
  const stcoSize = stcoBox.length;
  for (let i = 0; i <= moovData.length - stcoSize; i++) {
    // Quick check: match first 8 bytes (size + type) of stcoBox
    if (
      moovData[i] === stcoBox[0] &&
      moovData[i + 1] === stcoBox[1] &&
      moovData[i + 2] === stcoBox[2] &&
      moovData[i + 3] === stcoBox[3] &&
      moovData[i + 4] === stcoBox[4] &&  // 's'
      moovData[i + 5] === stcoBox[5] &&  // 't'
      moovData[i + 6] === stcoBox[6] &&  // 'c'
      moovData[i + 7] === stcoBox[7]     // 'o'
    ) {
      // Patch the chunk_offset at position i + 16
      const view = new DataView(moovData.buffer, moovData.byteOffset + i + 16, 4);
      writeU32(view, 0, offset);
      return;
    }
  }
  throw new Error('patchStcoOffset: stco box not found in moov');
}
