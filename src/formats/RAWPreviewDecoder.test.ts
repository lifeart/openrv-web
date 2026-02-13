/**
 * RAW Preview Decoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isRAWExtension,
  isRAWFile,
  extractRAWPreview,
} from './RAWPreviewDecoder';

const TIFF_LE = 0x4949; // "II"
const TIFF_BE = 0x4d4d; // "MM"
const TIFF_MAGIC = 42;

// JPEG SOI marker bytes
const JPEG_SOI_HI = 0xff;
const JPEG_SOI_LO = 0xd8;

// Tag IDs
const TAG_IMAGE_WIDTH = 256;
const TAG_IMAGE_LENGTH = 257;
const TAG_COMPRESSION = 259;
const TAG_MAKE = 271;
const TAG_MODEL = 272;
const TAG_STRIP_OFFSETS = 273;
const TAG_ORIENTATION = 274;
const TAG_STRIP_BYTE_COUNTS = 279;
const TAG_SUB_IFDS = 330;
const TAG_DATE_TIME = 306;
const TAG_JPEG_INTERCHANGE_FORMAT = 513;
const TAG_JPEG_INTERCHANGE_FORMAT_LENGTH = 514;
const TAG_SAMPLE_FORMAT = 339;

/**
 * Helper to write a TIFF IFD tag entry into a DataView.
 * Each tag is 12 bytes: id(2) + type(2) + count(4) + value/offset(4)
 */
function writeTag(
  view: DataView,
  offset: number,
  le: boolean,
  id: number,
  type: number,
  count: number,
  value: number
): void {
  view.setUint16(offset, id, le);
  view.setUint16(offset + 2, type, le);
  view.setUint32(offset + 4, count, le);
  // For SHORT (type 3), value is written as uint16 at offset+8
  // For LONG (type 4), value is written as uint32 at offset+8
  if (type === 3) {
    view.setUint16(offset + 8, value, le);
  } else {
    view.setUint32(offset + 8, value, le);
  }
}

/**
 * Create a minimal TIFF buffer with optional IFD entries.
 * Returns the buffer along with metadata about layout.
 */
interface IFDEntry {
  id: number;
  type: number;
  count: number;
  value: number;
}

interface IFDConfig {
  offset: number;
  entries: IFDEntry[];
  nextIFD: number;
}

function createTIFFBuffer(options: {
  bigEndian?: boolean;
  totalSize: number;
  ifds: IFDConfig[];
  extraData?: Array<{ offset: number; data: Uint8Array }>;
}): ArrayBuffer {
  const { bigEndian = false, totalSize, ifds, extraData } = options;
  const le = !bigEndian;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // TIFF header
  view.setUint16(0, bigEndian ? TIFF_BE : TIFF_LE, false);
  view.setUint16(2, TIFF_MAGIC, le);
  view.setUint32(4, ifds[0]?.offset ?? 8, le);

  // Write IFDs
  for (const ifd of ifds) {
    const numEntries = ifd.entries.length;
    view.setUint16(ifd.offset, numEntries, le);

    let pos = ifd.offset + 2;
    for (const entry of ifd.entries) {
      writeTag(view, pos, le, entry.id, entry.type, entry.count, entry.value);
      pos += 12;
    }

    // Next IFD offset
    view.setUint32(pos, ifd.nextIFD, le);
  }

  // Write extra data
  if (extraData) {
    for (const { offset, data } of extraData) {
      bytes.set(data, offset);
    }
  }

  return buffer;
}

/**
 * Create a fake JPEG blob (SOI marker + some data)
 */
function fakeJPEGData(size: number): Uint8Array {
  const data = new Uint8Array(size);
  data[0] = JPEG_SOI_HI;
  data[1] = JPEG_SOI_LO;
  // Fill rest with non-zero data to simulate JPEG content
  for (let i = 2; i < size; i++) {
    data[i] = (i % 254) + 1;
  }
  return data;
}

/**
 * Create a test RAW buffer with a JPEG preview embedded via JPEGInterchangeFormat tags.
 */
function createTestRAWBuffer(options: {
  bigEndian?: boolean;
  jpegSize?: number;
  previewWidth?: number;
  previewHeight?: number;
  make?: string;
  model?: string;
  orientation?: number;
  dateTime?: string;
} = {}): ArrayBuffer {
  const {
    bigEndian = false,
    jpegSize = 100,
    previewWidth = 640,
    previewHeight = 480,
    make,
    model,
    orientation,
    dateTime,
  } = options;

  // Layout:
  // [0..7]   TIFF header
  // [8..N]   IFD0 (main IFD with EXIF + JPEG pointer)
  // [N..M]   String data area (make, model, dateTime)
  // [M..end] JPEG data

  const entries: IFDEntry[] = [
    { id: TAG_IMAGE_WIDTH, type: 4, count: 1, value: previewWidth },
    { id: TAG_IMAGE_LENGTH, type: 4, count: 1, value: previewHeight },
    { id: TAG_COMPRESSION, type: 3, count: 1, value: 6 }, // JPEG old-style
  ];

  // Extra data for strings
  const extraData: Array<{ offset: number; data: Uint8Array }> = [];

  // String data starts after IFD. We'll calculate later.
  let stringOffset = 0; // Will be set below

  // Calculate IFD size first to know where strings go
  // We add make, model, orientation, dateTime as additional entries
  if (make) entries.push({ id: TAG_MAKE, type: 2, count: make.length + 1, value: 0 }); // placeholder
  if (model) entries.push({ id: TAG_MODEL, type: 2, count: model.length + 1, value: 0 });
  if (orientation) entries.push({ id: TAG_ORIENTATION, type: 3, count: 1, value: orientation });
  if (dateTime) entries.push({ id: TAG_DATE_TIME, type: 2, count: dateTime.length + 1, value: 0 });

  // JPEG pointer tags (will set values after layout)
  entries.push({ id: TAG_JPEG_INTERCHANGE_FORMAT, type: 4, count: 1, value: 0 });
  entries.push({ id: TAG_JPEG_INTERCHANGE_FORMAT_LENGTH, type: 4, count: 1, value: jpegSize });

  // Sort entries by tag ID (TIFF spec requires sorted tags)
  entries.sort((a, b) => a.id - b.id);

  const ifdOffset = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  stringOffset = ifdOffset + ifdSize;

  // Now fixup string offsets and JPEG offset
  let currentStringOffset = stringOffset;

  for (const entry of entries) {
    if (entry.id === TAG_MAKE && make) {
      entry.value = currentStringOffset;
      const strData = new Uint8Array(make.length + 1);
      for (let i = 0; i < make.length; i++) strData[i] = make.charCodeAt(i);
      strData[make.length] = 0;
      extraData.push({ offset: currentStringOffset, data: strData });
      currentStringOffset += make.length + 1;
    } else if (entry.id === TAG_MODEL && model) {
      entry.value = currentStringOffset;
      const strData = new Uint8Array(model.length + 1);
      for (let i = 0; i < model.length; i++) strData[i] = model.charCodeAt(i);
      strData[model.length] = 0;
      extraData.push({ offset: currentStringOffset, data: strData });
      currentStringOffset += model.length + 1;
    } else if (entry.id === TAG_DATE_TIME && dateTime) {
      entry.value = currentStringOffset;
      const strData = new Uint8Array(dateTime.length + 1);
      for (let i = 0; i < dateTime.length; i++) strData[i] = dateTime.charCodeAt(i);
      strData[dateTime.length] = 0;
      extraData.push({ offset: currentStringOffset, data: strData });
      currentStringOffset += dateTime.length + 1;
    }
  }

  // JPEG data offset - align to 4 bytes
  const jpegOffset = Math.ceil(currentStringOffset / 4) * 4;

  // Fix up JPEG offset in entries
  for (const entry of entries) {
    if (entry.id === TAG_JPEG_INTERCHANGE_FORMAT) {
      entry.value = jpegOffset;
    }
  }

  // Create JPEG data
  const jpegData = fakeJPEGData(jpegSize);
  extraData.push({ offset: jpegOffset, data: jpegData });

  const totalSize = jpegOffset + jpegSize;

  return createTIFFBuffer({
    bigEndian,
    totalSize,
    ifds: [{ offset: ifdOffset, entries, nextIFD: 0 }],
    extraData,
  });
}

describe('RAWPreviewDecoder', () => {
  describe('isRAWExtension', () => {
    it('RAW-T001: returns true for RAW extensions', () => {
      expect(isRAWExtension('.cr2')).toBe(true);
      expect(isRAWExtension('.nef')).toBe(true);
      expect(isRAWExtension('.arw')).toBe(true);
      expect(isRAWExtension('.dng')).toBe(true);
      expect(isRAWExtension('cr2')).toBe(true);
      expect(isRAWExtension('CR2')).toBe(true);
      expect(isRAWExtension('.CR3')).toBe(true);
      expect(isRAWExtension('.raf')).toBe(true);
      expect(isRAWExtension('.orf')).toBe(true);
      expect(isRAWExtension('.rw2')).toBe(true);
      expect(isRAWExtension('.pef')).toBe(true);
      expect(isRAWExtension('.srw')).toBe(true);
    });

    it('RAW-T002: returns false for non-RAW extensions', () => {
      expect(isRAWExtension('.jpg')).toBe(false);
      expect(isRAWExtension('.tiff')).toBe(false);
      expect(isRAWExtension('.exr')).toBe(false);
      expect(isRAWExtension('.png')).toBe(false);
      expect(isRAWExtension('.dpx')).toBe(false);
      expect(isRAWExtension('')).toBe(false);
    });

    it('RAW-T015: handles full filenames (not just bare extensions)', () => {
      expect(isRAWExtension('IMG_1234.CR2')).toBe(true);
      expect(isRAWExtension('photo.nef')).toBe(true);
      expect(isRAWExtension('DSC_0001.ARW')).toBe(true);
      expect(isRAWExtension('image.DNG')).toBe(true);
      expect(isRAWExtension('path/to/file.cr2')).toBe(true);
      expect(isRAWExtension('photo.jpg')).toBe(false);
      expect(isRAWExtension('file.tiff')).toBe(false);
    });
  });

  describe('isRAWFile', () => {
    it('RAW-T003: returns true for non-float TIFF', () => {
      // Create a minimal TIFF with uint sample format (no float)
      const buffer = createTIFFBuffer({
        totalSize: 100,
        ifds: [{
          offset: 8,
          entries: [
            { id: TAG_IMAGE_WIDTH, type: 4, count: 1, value: 100 },
            { id: TAG_IMAGE_LENGTH, type: 4, count: 1, value: 100 },
          ],
          nextIFD: 0,
        }],
      });
      expect(isRAWFile(buffer)).toBe(true);
    });

    it('RAW-T004: returns false for float TIFF', () => {
      // Create a TIFF with float32 sample format
      const buffer = createTIFFBuffer({
        totalSize: 200,
        ifds: [{
          offset: 8,
          entries: [
            { id: TAG_IMAGE_WIDTH, type: 4, count: 1, value: 2 },
            { id: TAG_IMAGE_LENGTH, type: 4, count: 1, value: 2 },
            { id: TAG_SAMPLE_FORMAT, type: 3, count: 1, value: 3 }, // float
            { id: 258, type: 3, count: 1, value: 32 }, // BitsPerSample = 32
          ],
          nextIFD: 0,
        }],
      });
      expect(isRAWFile(buffer)).toBe(false);
    });

    it('RAW-T005: returns false for non-TIFF buffer', () => {
      const buffer = new ArrayBuffer(10);
      const view = new DataView(buffer);
      view.setUint8(0, 0x89); // PNG magic
      view.setUint8(1, 0x50);
      expect(isRAWFile(buffer)).toBe(false);
    });
  });

  describe('extractRAWPreview', () => {
    it('RAW-T006: extracts JPEG via JPEGInterchangeFormat tags', () => {
      const buffer = createTestRAWBuffer({
        jpegSize: 200,
        previewWidth: 1920,
        previewHeight: 1080,
      });

      const result = extractRAWPreview(buffer);
      expect(result).not.toBeNull();
      expect(result!.jpegBlob).toBeInstanceOf(Blob);
      expect(result!.jpegBlob.type).toBe('image/jpeg');
      expect(result!.jpegBlob.size).toBe(200);
      expect(result!.previewWidth).toBe(1920);
      expect(result!.previewHeight).toBe(1080);
    });

    it('RAW-T007: extracts JPEG via StripOffsets fallback', () => {
      const jpegSize = 150;
      const jpegOffset = 200;
      const jpegData = fakeJPEGData(jpegSize);

      const buffer = createTIFFBuffer({
        totalSize: jpegOffset + jpegSize,
        ifds: [{
          offset: 8,
          entries: [
            { id: TAG_IMAGE_WIDTH, type: 4, count: 1, value: 800 },
            { id: TAG_IMAGE_LENGTH, type: 4, count: 1, value: 600 },
            { id: TAG_COMPRESSION, type: 3, count: 1, value: 6 },
            { id: TAG_STRIP_OFFSETS, type: 4, count: 1, value: jpegOffset },
            { id: TAG_STRIP_BYTE_COUNTS, type: 4, count: 1, value: jpegSize },
          ],
          nextIFD: 0,
        }],
        extraData: [{ offset: jpegOffset, data: jpegData }],
      });

      const result = extractRAWPreview(buffer);
      expect(result).not.toBeNull();
      expect(result!.jpegBlob.size).toBe(jpegSize);
      expect(result!.previewWidth).toBe(800);
      expect(result!.previewHeight).toBe(600);
    });

    it('RAW-T008: picks largest JPEG across multiple IFDs', () => {
      // IFD0 has small JPEG (100 bytes), IFD1 has large JPEG (500 bytes)
      const smallJPEGOffset = 300;
      const smallJPEGSize = 100;
      const largeJPEGOffset = 500;
      const largeJPEGSize = 500;

      const smallJPEG = fakeJPEGData(smallJPEGSize);
      const largeJPEG = fakeJPEGData(largeJPEGSize);

      // IFD0 at offset 8, IFD1 at offset 160
      const ifd1Offset = 160;

      const buffer = createTIFFBuffer({
        totalSize: largeJPEGOffset + largeJPEGSize,
        ifds: [
          {
            offset: 8,
            entries: [
              { id: TAG_IMAGE_WIDTH, type: 4, count: 1, value: 160 },
              { id: TAG_IMAGE_LENGTH, type: 4, count: 1, value: 120 },
              { id: TAG_COMPRESSION, type: 3, count: 1, value: 6 },
              { id: TAG_JPEG_INTERCHANGE_FORMAT, type: 4, count: 1, value: smallJPEGOffset },
              { id: TAG_JPEG_INTERCHANGE_FORMAT_LENGTH, type: 4, count: 1, value: smallJPEGSize },
            ],
            nextIFD: ifd1Offset,
          },
          {
            offset: ifd1Offset,
            entries: [
              { id: TAG_IMAGE_WIDTH, type: 4, count: 1, value: 1920 },
              { id: TAG_IMAGE_LENGTH, type: 4, count: 1, value: 1080 },
              { id: TAG_COMPRESSION, type: 3, count: 1, value: 6 },
              { id: TAG_JPEG_INTERCHANGE_FORMAT, type: 4, count: 1, value: largeJPEGOffset },
              { id: TAG_JPEG_INTERCHANGE_FORMAT_LENGTH, type: 4, count: 1, value: largeJPEGSize },
            ],
            nextIFD: 0,
          },
        ],
        extraData: [
          { offset: smallJPEGOffset, data: smallJPEG },
          { offset: largeJPEGOffset, data: largeJPEG },
        ],
      });

      const result = extractRAWPreview(buffer);
      expect(result).not.toBeNull();
      expect(result!.jpegBlob.size).toBe(largeJPEGSize);
      expect(result!.previewWidth).toBe(1920);
      expect(result!.previewHeight).toBe(1080);
    });

    it('RAW-T009: follows SubIFD pointers', () => {
      const jpegSize = 200;
      const jpegOffset = 400;
      const jpegData = fakeJPEGData(jpegSize);

      // IFD0 at offset 8, SubIFD at offset 200
      // IFD0 has SubIFD pointer (tag 330) to SubIFD
      // SubIFD has the JPEG

      const subIFDOffset = 200;

      const buffer = createTIFFBuffer({
        totalSize: jpegOffset + jpegSize,
        ifds: [
          {
            offset: 8,
            entries: [
              { id: TAG_IMAGE_WIDTH, type: 4, count: 1, value: 100 },
              { id: TAG_IMAGE_LENGTH, type: 4, count: 1, value: 100 },
              { id: TAG_SUB_IFDS, type: 4, count: 1, value: subIFDOffset },
            ],
            nextIFD: 0,
          },
          {
            offset: subIFDOffset,
            entries: [
              { id: TAG_IMAGE_WIDTH, type: 4, count: 1, value: 1600 },
              { id: TAG_IMAGE_LENGTH, type: 4, count: 1, value: 1200 },
              { id: TAG_COMPRESSION, type: 3, count: 1, value: 7 }, // new-style JPEG
              { id: TAG_JPEG_INTERCHANGE_FORMAT, type: 4, count: 1, value: jpegOffset },
              { id: TAG_JPEG_INTERCHANGE_FORMAT_LENGTH, type: 4, count: 1, value: jpegSize },
            ],
            nextIFD: 0,
          },
        ],
        extraData: [{ offset: jpegOffset, data: jpegData }],
      });

      const result = extractRAWPreview(buffer);
      expect(result).not.toBeNull();
      expect(result!.jpegBlob.size).toBe(jpegSize);
      expect(result!.previewWidth).toBe(1600);
      expect(result!.previewHeight).toBe(1200);
    });

    it('RAW-T010: extracts EXIF metadata', () => {
      const buffer = createTestRAWBuffer({
        jpegSize: 100,
        make: 'Canon',
        model: 'EOS 5D Mark IV',
        orientation: 1,
        dateTime: '2024:01:15 10:30:00',
      });

      const result = extractRAWPreview(buffer);
      expect(result).not.toBeNull();
      expect(result!.exif.make).toBe('Canon');
      expect(result!.exif.model).toBe('EOS 5D Mark IV');
      expect(result!.exif.orientation).toBe(1);
      expect(result!.exif.dateTime).toBe('2024:01:15 10:30:00');
    });

    it('RAW-T011: returns null for buffer with no JPEG IFDs', () => {
      // TIFF with no JPEG compression IFDs
      const buffer = createTIFFBuffer({
        totalSize: 100,
        ifds: [{
          offset: 8,
          entries: [
            { id: TAG_IMAGE_WIDTH, type: 4, count: 1, value: 100 },
            { id: TAG_IMAGE_LENGTH, type: 4, count: 1, value: 100 },
            { id: TAG_COMPRESSION, type: 3, count: 1, value: 1 }, // uncompressed, not JPEG
          ],
          nextIFD: 0,
        }],
      });

      const result = extractRAWPreview(buffer);
      expect(result).toBeNull();
    });

    it('RAW-T012: handles IFD chain cycle gracefully', () => {
      // Create a TIFF where IFD0 points back to itself via nextIFD
      const jpegSize = 100;
      const jpegOffset = 200;
      const jpegData = fakeJPEGData(jpegSize);

      const ifdOffset = 8;

      const buffer = createTIFFBuffer({
        totalSize: jpegOffset + jpegSize,
        ifds: [{
          offset: ifdOffset,
          entries: [
            { id: TAG_IMAGE_WIDTH, type: 4, count: 1, value: 320 },
            { id: TAG_IMAGE_LENGTH, type: 4, count: 1, value: 240 },
            { id: TAG_COMPRESSION, type: 3, count: 1, value: 6 },
            { id: TAG_JPEG_INTERCHANGE_FORMAT, type: 4, count: 1, value: jpegOffset },
            { id: TAG_JPEG_INTERCHANGE_FORMAT_LENGTH, type: 4, count: 1, value: jpegSize },
          ],
          nextIFD: ifdOffset, // cycle: points back to self
        }],
        extraData: [{ offset: jpegOffset, data: jpegData }],
      });

      // Should not hang, should still return the JPEG it found
      const result = extractRAWPreview(buffer);
      expect(result).not.toBeNull();
      expect(result!.jpegBlob.size).toBe(jpegSize);
    });

    it('RAW-T013: rejects data without JPEG SOI marker', () => {
      // Create a TIFF with JPEG compression tag but invalid data (no SOI marker)
      const badDataOffset = 200;
      const badDataSize = 100;
      const badData = new Uint8Array(badDataSize);
      badData[0] = 0x00; // NOT 0xFF
      badData[1] = 0x00; // NOT 0xD8

      const buffer = createTIFFBuffer({
        totalSize: badDataOffset + badDataSize,
        ifds: [{
          offset: 8,
          entries: [
            { id: TAG_IMAGE_WIDTH, type: 4, count: 1, value: 320 },
            { id: TAG_IMAGE_LENGTH, type: 4, count: 1, value: 240 },
            { id: TAG_COMPRESSION, type: 3, count: 1, value: 6 },
            { id: TAG_JPEG_INTERCHANGE_FORMAT, type: 4, count: 1, value: badDataOffset },
            { id: TAG_JPEG_INTERCHANGE_FORMAT_LENGTH, type: 4, count: 1, value: badDataSize },
          ],
          nextIFD: 0,
        }],
        extraData: [{ offset: badDataOffset, data: badData }],
      });

      const result = extractRAWPreview(buffer);
      expect(result).toBeNull();
    });

    it('RAW-T014: handles truncated buffer gracefully', () => {
      // Buffer too small for even a TIFF header
      expect(extractRAWPreview(new ArrayBuffer(4))).toBeNull();
      expect(extractRAWPreview(new ArrayBuffer(0))).toBeNull();

      // Valid TIFF header but IFD offset points beyond buffer
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_LE, false);
      view.setUint16(2, TIFF_MAGIC, true);
      view.setUint32(4, 9999, true); // IFD offset beyond buffer
      expect(extractRAWPreview(buffer)).toBeNull();
    });

    it('handles big-endian TIFF correctly', () => {
      const buffer = createTestRAWBuffer({
        bigEndian: true,
        jpegSize: 150,
        previewWidth: 1024,
        previewHeight: 768,
      });

      const result = extractRAWPreview(buffer);
      expect(result).not.toBeNull();
      expect(result!.jpegBlob.size).toBe(150);
      expect(result!.previewWidth).toBe(1024);
      expect(result!.previewHeight).toBe(768);
    });

    it('returns default EXIF when no EXIF tags present', () => {
      const jpegSize = 100;
      const jpegOffset = 200;
      const jpegData = fakeJPEGData(jpegSize);

      const buffer = createTIFFBuffer({
        totalSize: jpegOffset + jpegSize,
        ifds: [{
          offset: 8,
          entries: [
            { id: TAG_IMAGE_WIDTH, type: 4, count: 1, value: 640 },
            { id: TAG_IMAGE_LENGTH, type: 4, count: 1, value: 480 },
            { id: TAG_COMPRESSION, type: 3, count: 1, value: 6 },
            { id: TAG_JPEG_INTERCHANGE_FORMAT, type: 4, count: 1, value: jpegOffset },
            { id: TAG_JPEG_INTERCHANGE_FORMAT_LENGTH, type: 4, count: 1, value: jpegSize },
          ],
          nextIFD: 0,
        }],
        extraData: [{ offset: jpegOffset, data: jpegData }],
      });

      const result = extractRAWPreview(buffer);
      expect(result).not.toBeNull();
      expect(result!.exif.make).toBeNull();
      expect(result!.exif.model).toBeNull();
      expect(result!.exif.iso).toBeNull();
      expect(result!.exif.exposureTime).toBeNull();
      expect(result!.exif.fNumber).toBeNull();
      expect(result!.exif.focalLength).toBeNull();
      expect(result!.exif.dateTime).toBeNull();
      expect(result!.exif.orientation).toBeNull();
    });
  });
});
