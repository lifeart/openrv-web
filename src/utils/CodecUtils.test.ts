/**
 * Unit tests for CodecUtils
 *
 * Tests video codec detection and error message generation
 * for professional codecs like ProRes and DNxHD.
 */

import { describe, it, expect } from 'vitest';
import {
  detectCodecFamily,
  parseCodecInfo,
  isBrowserSupportedCodec,
  isProfessionalCodec,
  getCodecSupportStatus,
  getTranscodingRecommendation,
  createUnsupportedCodecError,
  isCodecError,
  extractCodecFromError,
  type CodecFamily,
} from './CodecUtils';

describe('CodecUtils', () => {
  describe('detectCodecFamily', () => {
    it('CODEC-U001: should detect ProRes codec from various strings', () => {
      expect(detectCodecFamily('prores')).toBe('prores');
      expect(detectCodecFamily('ap4h')).toBe('prores');
      expect(detectCodecFamily('apch')).toBe('prores');
      expect(detectCodecFamily('apcn')).toBe('prores');
      expect(detectCodecFamily('apcs')).toBe('prores');
      expect(detectCodecFamily('apco')).toBe('prores');
      expect(detectCodecFamily('PRORES')).toBe('prores');
    });

    it('CODEC-U002: should detect DNxHD/DNxHR codec', () => {
      expect(detectCodecFamily('dnxhd')).toBe('dnxhd');
      expect(detectCodecFamily('dnxhr')).toBe('dnxhd');
      expect(detectCodecFamily('AVdn')).toBe('dnxhd');
      expect(detectCodecFamily('DNXHD')).toBe('dnxhd');
    });

    it('CODEC-U003: should detect H.264/AVC codec', () => {
      expect(detectCodecFamily('avc1')).toBe('h264');
      expect(detectCodecFamily('avc1.640028')).toBe('h264');
      expect(detectCodecFamily('h264')).toBe('h264');
      expect(detectCodecFamily('H.264')).toBe('h264');
    });

    it('CODEC-U004: should detect H.265/HEVC codec', () => {
      expect(detectCodecFamily('hevc')).toBe('h265');
      expect(detectCodecFamily('hvc1')).toBe('h265');
      expect(detectCodecFamily('h265')).toBe('h265');
      expect(detectCodecFamily('H.265')).toBe('h265');
    });

    it('CODEC-U005: should detect VP8/VP9 codecs', () => {
      expect(detectCodecFamily('vp8')).toBe('vp8');
      expect(detectCodecFamily('vp9')).toBe('vp9');
      expect(detectCodecFamily('vp09')).toBe('vp9');
      expect(detectCodecFamily('VP9')).toBe('vp9');
    });

    it('CODEC-U006: should detect AV1 codec', () => {
      expect(detectCodecFamily('av1')).toBe('av1');
      expect(detectCodecFamily('av01')).toBe('av1');
      expect(detectCodecFamily('AV1')).toBe('av1');
    });

    it('CODEC-U007: should detect MJPEG codec', () => {
      expect(detectCodecFamily('mjpeg')).toBe('mjpeg');
      expect(detectCodecFamily('mjp')).toBe('mjpeg');
    });

    it('CODEC-U008: should return unknown for null/undefined', () => {
      expect(detectCodecFamily(null)).toBe('unknown');
      expect(detectCodecFamily('')).toBe('unknown');
    });

    it('CODEC-U009: should return unknown for unrecognized codecs', () => {
      expect(detectCodecFamily('someunknowncodec')).toBe('unknown');
      expect(detectCodecFamily('xyz123')).toBe('unknown');
    });
  });

  describe('parseCodecInfo', () => {
    it('CODEC-U010: should parse ProRes info with correct variant', () => {
      const info = parseCodecInfo('ap4h');
      expect(info.family).toBe('prores');
      expect(info.displayName).toBe('Apple ProRes 4444');
      expect(info.variant).toBe('prores_4444');
      expect(info.isSupported).toBe(false);
      expect(info.bitDepth).toBe(12);
    });

    it('CODEC-U011: should parse ProRes HQ', () => {
      const info = parseCodecInfo('apch');
      expect(info.family).toBe('prores');
      expect(info.displayName).toBe('Apple ProRes HQ');
      expect(info.variant).toBe('prores_hq');
      expect(info.bitDepth).toBe(10);
    });

    it('CODEC-U012: should parse DNxHD info', () => {
      const info = parseCodecInfo('dnxhd');
      expect(info.family).toBe('dnxhd');
      expect(info.displayName).toBe('Avid DNxHD');
      expect(info.isSupported).toBe(false);
    });

    it('CODEC-U013: should parse H.264 as supported', () => {
      const info = parseCodecInfo('avc1');
      expect(info.family).toBe('h264');
      expect(info.displayName).toBe('H.264/AVC');
      expect(info.isSupported).toBe(true);
    });

    it('CODEC-U014: should parse VP9 as supported', () => {
      const info = parseCodecInfo('vp9');
      expect(info.family).toBe('vp9');
      expect(info.displayName).toBe('VP9');
      expect(info.isSupported).toBe(true);
    });

    it('CODEC-U015: should parse AV1 as supported', () => {
      const info = parseCodecInfo('av1');
      expect(info.family).toBe('av1');
      expect(info.displayName).toBe('AV1');
      expect(info.isSupported).toBe(true);
    });

    it('CODEC-U016: should handle unknown codec', () => {
      const info = parseCodecInfo('unknowncodec');
      expect(info.family).toBe('unknown');
      expect(info.displayName).toBe('Unknown Codec');
      expect(info.isSupported).toBe(false);
    });
  });

  describe('isBrowserSupportedCodec', () => {
    it('CODEC-U020: should mark H.264/H.265/VP8/VP9/AV1 as supported', () => {
      expect(isBrowserSupportedCodec('h264')).toBe(true);
      expect(isBrowserSupportedCodec('h265')).toBe(true);
      expect(isBrowserSupportedCodec('vp8')).toBe(true);
      expect(isBrowserSupportedCodec('vp9')).toBe(true);
      expect(isBrowserSupportedCodec('av1')).toBe(true);
    });

    it('CODEC-U021: should mark ProRes/DNxHD as unsupported', () => {
      expect(isBrowserSupportedCodec('prores')).toBe(false);
      expect(isBrowserSupportedCodec('dnxhd')).toBe(false);
    });

    it('CODEC-U022: should mark unknown as unsupported', () => {
      expect(isBrowserSupportedCodec('unknown')).toBe(false);
      expect(isBrowserSupportedCodec('mjpeg')).toBe(false);
    });
  });

  describe('isProfessionalCodec', () => {
    it('CODEC-U023: should identify ProRes as professional', () => {
      expect(isProfessionalCodec('prores')).toBe(true);
    });

    it('CODEC-U024: should identify DNxHD as professional', () => {
      expect(isProfessionalCodec('dnxhd')).toBe(true);
    });

    it('CODEC-U025: should not identify consumer codecs as professional', () => {
      expect(isProfessionalCodec('h264')).toBe(false);
      expect(isProfessionalCodec('vp9')).toBe(false);
      expect(isProfessionalCodec('av1')).toBe(false);
    });
  });

  describe('getCodecSupportStatus', () => {
    it('CODEC-U030: should return supported status for H.264', () => {
      const status = getCodecSupportStatus('avc1');
      expect(status.isSupported).toBe(true);
      expect(status.requiresTranscoding).toBe(false);
      expect(status.message).toContain('fully supported');
    });

    it('CODEC-U031: should return requires transcoding for ProRes', () => {
      const status = getCodecSupportStatus('apch');
      expect(status.isSupported).toBe(false);
      expect(status.requiresTranscoding).toBe(true);
      expect(status.message).toContain('not supported');
      expect(status.recommendation).toBeDefined();
    });

    it('CODEC-U032: should return requires transcoding for DNxHD', () => {
      const status = getCodecSupportStatus('dnxhd');
      expect(status.isSupported).toBe(false);
      expect(status.requiresTranscoding).toBe(true);
      expect(status.recommendation).toBeDefined();
    });
  });

  describe('getTranscodingRecommendation', () => {
    it('CODEC-U040: should provide FFmpeg command for ProRes', () => {
      const info = parseCodecInfo('apch');
      const recommendation = getTranscodingRecommendation(info);
      expect(recommendation).toContain('ffmpeg');
      expect(recommendation).toContain('libx264');
      expect(recommendation).toContain('.mov');
    });

    it('CODEC-U041: should provide FFmpeg command for DNxHD', () => {
      const info = parseCodecInfo('dnxhd');
      const recommendation = getTranscodingRecommendation(info);
      expect(recommendation).toContain('ffmpeg');
      expect(recommendation).toContain('libx264');
      expect(recommendation).toContain('.mxf');
    });
  });

  describe('createUnsupportedCodecError', () => {
    it('CODEC-U050: should create error with correct title for ProRes', () => {
      const error = createUnsupportedCodecError('apch', 'test.mov');
      expect(error.title).toBe('ProRes Format Not Supported');
      expect(error.message).toContain('ProRes');
      expect(error.details).toContain('test.mov');
      expect(error.recommendation).toContain('ffmpeg');
    });

    it('CODEC-U051: should create error with correct title for DNxHD', () => {
      const error = createUnsupportedCodecError('dnxhd', 'test.mxf');
      expect(error.title).toBe('DNxHD/DNxHR Format Not Supported');
      expect(error.message).toContain('DNxHD');
      expect(error.details).toContain('test.mxf');
    });

    it('CODEC-U052: should include codec info in error', () => {
      const error = createUnsupportedCodecError('ap4h', 'video.mov');
      expect(error.codecInfo.family).toBe('prores');
      expect(error.codecInfo.displayName).toBe('Apple ProRes 4444');
    });

    it('CODEC-U053: should handle null codec', () => {
      const error = createUnsupportedCodecError(null);
      expect(error.codecInfo.family).toBe('unknown');
      expect(error.title).toBe('Unsupported Video Codec');
    });
  });

  describe('isCodecError', () => {
    it('CODEC-U060: should detect codec error messages', () => {
      expect(isCodecError('Cannot decode video codec: prores')).toBe(true);
      expect(isCodecError('Unsupported codec: dnxhd')).toBe(true);
      expect(isCodecError('WebCodecs may not support this format')).toBe(true);
      expect(isCodecError('Failed to decode video')).toBe(true);
    });

    it('CODEC-U061: should not match unrelated errors', () => {
      expect(isCodecError('Network error')).toBe(false);
      expect(isCodecError('File not found')).toBe(false);
      expect(isCodecError('Permission denied')).toBe(false);
    });
  });

  describe('extractCodecFromError', () => {
    it('CODEC-U070: should extract codec from error message', () => {
      expect(extractCodecFromError('Cannot decode video codec: prores')).toBe('prores');
      expect(extractCodecFromError('codec: ap4h is not supported')).toBe('ap4h');
    });

    it('CODEC-U071: should detect ProRes in error message', () => {
      expect(extractCodecFromError('This video uses ProRes which is not supported')).toBe('prores');
    });

    it('CODEC-U072: should detect DNxHD in error message', () => {
      expect(extractCodecFromError('DNxHD format not available')).toBe('dnxhd');
    });

    it('CODEC-U073: should return null for messages without codec', () => {
      expect(extractCodecFromError('Unknown error occurred')).toBe(null);
    });
  });

  describe('ProRes variant detection', () => {
    it('CODEC-U080: should identify all ProRes variants', () => {
      const variants = [
        { fourcc: 'apco', expected: 'prores_proxy', name: 'Apple ProRes Proxy' },
        { fourcc: 'apcs', expected: 'prores_lt', name: 'Apple ProRes LT' },
        { fourcc: 'apcn', expected: 'prores_standard', name: 'Apple ProRes' },
        { fourcc: 'apch', expected: 'prores_hq', name: 'Apple ProRes HQ' },
        { fourcc: 'ap4h', expected: 'prores_4444', name: 'Apple ProRes 4444' },
        { fourcc: 'ap4x', expected: 'prores_4444_xq', name: 'Apple ProRes 4444 XQ' },
        { fourcc: 'aprn', expected: 'prores_raw', name: 'Apple ProRes RAW' },
        { fourcc: 'aprh', expected: 'prores_raw_hq', name: 'Apple ProRes RAW HQ' },
      ];

      for (const { fourcc, expected, name } of variants) {
        const info = parseCodecInfo(fourcc);
        expect(info.variant).toBe(expected);
        expect(info.displayName).toBe(name);
      }
    });

    it('CODEC-U081: should detect 12-bit depth for 4444 variants', () => {
      const info4444 = parseCodecInfo('ap4h');
      const info4444xq = parseCodecInfo('ap4x');

      expect(info4444.bitDepth).toBe(12);
      expect(info4444xq.bitDepth).toBe(12);
    });

    it('CODEC-U082: should detect 10-bit depth for non-4444 variants', () => {
      const infoHQ = parseCodecInfo('apch');
      const infoStandard = parseCodecInfo('apcn');
      const infoLT = parseCodecInfo('apcs');

      expect(infoHQ.bitDepth).toBe(10);
      expect(infoStandard.bitDepth).toBe(10);
      expect(infoLT.bitDepth).toBe(10);
    });
  });

  describe('Edge cases and corner cases', () => {
    it('CODEC-U090: should handle whitespace-only strings as unknown', () => {
      expect(detectCodecFamily('   ')).toBe('unknown');
      expect(detectCodecFamily('\t\n')).toBe('unknown');
    });

    it('CODEC-U091: should handle codec strings with leading/trailing whitespace', () => {
      expect(detectCodecFamily('  prores  ')).toBe('prores');
      expect(detectCodecFamily('\tavc1\n')).toBe('h264');
    });

    it('CODEC-U092: should detect JPEG2000 codec variants', () => {
      expect(detectCodecFamily('jpeg2000')).toBe('jpeg2000');
      expect(detectCodecFamily('jp2k')).toBe('jpeg2000');
      expect(detectCodecFamily('j2k')).toBe('jpeg2000');
      expect(detectCodecFamily('mjp2')).toBe('jpeg2000');
    });

    it('CODEC-U093: should detect raw video codec', () => {
      expect(detectCodecFamily('rawvideo')).toBe('rawvideo');
      expect(detectCodecFamily('raw')).toBe('rawvideo');
    });

    it('CODEC-U094: should identify JPEG2000 and rawvideo as professional codecs', () => {
      expect(isProfessionalCodec('jpeg2000')).toBe(true);
      expect(isProfessionalCodec('rawvideo')).toBe(true);
    });

    it('CODEC-U095: should parse JPEG2000 info correctly', () => {
      const info = parseCodecInfo('jpeg2000');
      expect(info.family).toBe('jpeg2000');
      expect(info.displayName).toBe('JPEG 2000');
      expect(info.isSupported).toBe(false);
    });

    it('CODEC-U096: should parse rawvideo info correctly', () => {
      const info = parseCodecInfo('rawvideo');
      expect(info.family).toBe('rawvideo');
      expect(info.displayName).toBe('Raw Video');
      expect(info.isSupported).toBe(false);
    });

    it('CODEC-U097: should provide transcoding recommendation for JPEG2000', () => {
      const info = parseCodecInfo('jpeg2000');
      const recommendation = getTranscodingRecommendation(info);
      expect(recommendation).toContain('ffmpeg');
      expect(recommendation).toContain('libx264');
      expect(recommendation).toContain('DCP');
    });

    it('CODEC-U098: should provide transcoding recommendation for rawvideo', () => {
      const info = parseCodecInfo('rawvideo');
      const recommendation = getTranscodingRecommendation(info);
      expect(recommendation).toContain('ffmpeg');
      expect(recommendation).toContain('libx264');
      expect(recommendation).toContain('pix_fmt');
    });

    it('CODEC-U099: should create error with correct title for JPEG2000', () => {
      const error = createUnsupportedCodecError('jpeg2000', 'test.mxf');
      expect(error.title).toBe('JPEG 2000 Format Not Supported');
      expect(error.message).toContain('JPEG 2000');
      expect(error.message).toContain('DCP');
    });

    it('CODEC-U100: should create error with correct title for rawvideo', () => {
      const error = createUnsupportedCodecError('rawvideo', 'test.avi');
      expect(error.title).toBe('Raw Video Format Not Supported');
      expect(error.message).toContain('Raw Video');
      expect(error.message).toContain('uncompressed');
    });

    it('CODEC-U101: should handle mixed case codec strings', () => {
      expect(detectCodecFamily('ProRes')).toBe('prores');
      expect(detectCodecFamily('PRORES')).toBe('prores');
      expect(detectCodecFamily('DnXhD')).toBe('dnxhd');
      expect(detectCodecFamily('H264')).toBe('h264');
      expect(detectCodecFamily('VP9')).toBe('vp9');
    });

    it('CODEC-U102: should handle codec strings embedded in longer text', () => {
      expect(detectCodecFamily('video/mp4; codecs="avc1.640028"')).toBe('h264');
      expect(detectCodecFamily('prores_hq variant')).toBe('prores');
    });
  });

  describe('Comprehensive codec support status', () => {
    it('CODEC-U110: should return correct status for all supported codecs', () => {
      const supportedCodecs = ['h264', 'avc1', 'hevc', 'vp8', 'vp9', 'av1'];
      for (const codec of supportedCodecs) {
        const status = getCodecSupportStatus(codec);
        expect(status.isSupported).toBe(true);
        expect(status.requiresTranscoding).toBe(false);
      }
    });

    it('CODEC-U111: should return correct status for all professional codecs', () => {
      const professionalCodecs = ['prores', 'apch', 'dnxhd', 'jpeg2000', 'rawvideo'];
      for (const codec of professionalCodecs) {
        const status = getCodecSupportStatus(codec);
        expect(status.isSupported).toBe(false);
        expect(status.requiresTranscoding).toBe(true);
        expect(status.recommendation).toBeDefined();
      }
    });
  });
});
