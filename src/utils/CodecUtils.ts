/**
 * CodecUtils - Video codec detection and information utilities
 *
 * Provides detection for professional video codecs (ProRes, DNxHD)
 * and guidance for handling unsupported formats in browser environments.
 */

/**
 * Video codec families
 */
export type CodecFamily =
  | 'h264'
  | 'h265'
  | 'vp8'
  | 'vp9'
  | 'av1'
  | 'prores'
  | 'dnxhd'
  | 'mjpeg'
  | 'jpeg2000'
  | 'rawvideo'
  | 'unknown';

/**
 * Specific codec variants within families
 */
export type ProResVariant =
  | 'prores_proxy'
  | 'prores_lt'
  | 'prores_standard'
  | 'prores_hq'
  | 'prores_4444'
  | 'prores_4444_xq'
  | 'prores_raw'
  | 'prores_raw_hq';

export type DNxVariant =
  | 'dnxhd'
  | 'dnxhr_lb'
  | 'dnxhr_sq'
  | 'dnxhr_hq'
  | 'dnxhr_hqx'
  | 'dnxhr_444';

/**
 * Codec information structure
 */
export interface CodecInfo {
  family: CodecFamily;
  fourcc: string | null;
  displayName: string;
  isSupported: boolean;
  variant?: ProResVariant | DNxVariant | string;
  bitDepth?: number;
}

/**
 * Browser codec support status
 */
export interface CodecSupportStatus {
  isSupported: boolean;
  fallbackAvailable: boolean;
  requiresTranscoding: boolean;
  message: string;
  recommendation?: string;
}

/**
 * Codec strings from WebCodecs that indicate ProRes
 */
const PRORES_CODEC_STRINGS = [
  'prores',
  'ap4h',
  'ap4x',
  'apch',
  'apcn',
  'apcs',
  'apco',
  'aprn',
  'aprh',
];

/**
 * Codec strings from WebCodecs that indicate DNxHD/DNxHR
 */
const DNXHD_CODEC_STRINGS = [
  'dnxhd',
  'dnxhr',
  'avdn',
  'avdh',
];

/**
 * Map FourCC to ProRes variant
 */
function getProResVariant(fourcc: string): ProResVariant {
  const variants: Record<string, ProResVariant> = {
    apco: 'prores_proxy',
    apcs: 'prores_lt',
    apcn: 'prores_standard',
    apch: 'prores_hq',
    ap4h: 'prores_4444',
    ap4x: 'prores_4444_xq',
    aprn: 'prores_raw',
    aprh: 'prores_raw_hq',
  };
  return variants[fourcc.toLowerCase()] || 'prores_standard';
}

/**
 * Get display name for ProRes variant
 */
function getProResDisplayName(variant: ProResVariant): string {
  const names: Record<ProResVariant, string> = {
    prores_proxy: 'Apple ProRes Proxy',
    prores_lt: 'Apple ProRes LT',
    prores_standard: 'Apple ProRes',
    prores_hq: 'Apple ProRes HQ',
    prores_4444: 'Apple ProRes 4444',
    prores_4444_xq: 'Apple ProRes 4444 XQ',
    prores_raw: 'Apple ProRes RAW',
    prores_raw_hq: 'Apple ProRes RAW HQ',
  };
  return names[variant];
}

/**
 * Get display name for DNx variant
 */
function getDNxDisplayName(variant: DNxVariant): string {
  const names: Record<DNxVariant, string> = {
    dnxhd: 'Avid DNxHD',
    dnxhr_lb: 'Avid DNxHR LB',
    dnxhr_sq: 'Avid DNxHR SQ',
    dnxhr_hq: 'Avid DNxHR HQ',
    dnxhr_hqx: 'Avid DNxHR HQX',
    dnxhr_444: 'Avid DNxHR 444',
  };
  return names[variant];
}

/**
 * Detect codec family from codec string (from WebCodecs or mediabunny)
 */
export function detectCodecFamily(codecString: string | null): CodecFamily {
  if (!codecString || codecString.trim() === '') return 'unknown';

  const lowerCodec = codecString.toLowerCase().trim();

  // Check for ProRes
  if (PRORES_CODEC_STRINGS.some((s) => lowerCodec.includes(s))) {
    return 'prores';
  }

  // Check for DNxHD/DNxHR
  if (DNXHD_CODEC_STRINGS.some((s) => lowerCodec.includes(s))) {
    return 'dnxhd';
  }

  // Check for H.264/AVC
  if (lowerCodec.includes('avc') || lowerCodec.includes('h264') || lowerCodec.includes('h.264')) {
    return 'h264';
  }

  // Check for H.265/HEVC
  if (lowerCodec.includes('hevc') || lowerCodec.includes('h265') || lowerCodec.includes('h.265') || lowerCodec.includes('hvc1')) {
    return 'h265';
  }

  // Check for VP8
  if (lowerCodec.includes('vp8')) {
    return 'vp8';
  }

  // Check for VP9
  if (lowerCodec.includes('vp9') || lowerCodec.includes('vp09')) {
    return 'vp9';
  }

  // Check for AV1
  if (lowerCodec.includes('av1') || lowerCodec.includes('av01')) {
    return 'av1';
  }

  // Check for JPEG2000 (must come before MJPEG since mjp2 contains 'mjp')
  if (lowerCodec.includes('jpeg2000') || lowerCodec.includes('jp2k') || lowerCodec.includes('j2k') || lowerCodec.includes('mjp2')) {
    return 'jpeg2000';
  }

  // Check for MJPEG
  if (lowerCodec.includes('mjpeg') || lowerCodec.includes('mjp')) {
    return 'mjpeg';
  }

  // Check for raw video
  if (lowerCodec.includes('rawvideo') || lowerCodec.includes('raw ') || lowerCodec === 'raw') {
    return 'rawvideo';
  }

  return 'unknown';
}

/**
 * Parse detailed codec information from codec string
 */
export function parseCodecInfo(codecString: string | null): CodecInfo {
  const family = detectCodecFamily(codecString);

  const baseInfo: CodecInfo = {
    family,
    fourcc: extractFourCC(codecString),
    displayName: 'Unknown Codec',
    isSupported: isBrowserSupportedCodec(family),
  };

  // Add specific information based on codec family
  switch (family) {
    case 'prores': {
      const fourcc = baseInfo.fourcc?.toLowerCase() || 'apcn';
      const variant = getProResVariant(fourcc);
      return {
        ...baseInfo,
        variant,
        displayName: getProResDisplayName(variant),
        bitDepth: variant.includes('4444') ? 12 : 10,
      };
    }

    case 'dnxhd': {
      const variant: DNxVariant = 'dnxhd';
      return {
        ...baseInfo,
        variant,
        displayName: getDNxDisplayName(variant),
        bitDepth: 8,
      };
    }

    case 'h264':
      return {
        ...baseInfo,
        displayName: 'H.264/AVC',
        bitDepth: 8,
      };

    case 'h265':
      return {
        ...baseInfo,
        displayName: 'H.265/HEVC',
        bitDepth: 10,
      };

    case 'vp8':
      return {
        ...baseInfo,
        displayName: 'VP8',
        bitDepth: 8,
      };

    case 'vp9':
      return {
        ...baseInfo,
        displayName: 'VP9',
        bitDepth: 10,
      };

    case 'av1':
      return {
        ...baseInfo,
        displayName: 'AV1',
        bitDepth: 10,
      };

    case 'mjpeg':
      return {
        ...baseInfo,
        displayName: 'Motion JPEG',
        bitDepth: 8,
      };

    case 'jpeg2000':
      return {
        ...baseInfo,
        displayName: 'JPEG 2000',
        isSupported: false, // Not typically supported in browsers
      };

    case 'rawvideo':
      return {
        ...baseInfo,
        displayName: 'Raw Video',
        isSupported: false, // Raw video is not supported in browsers
      };

    default:
      return baseInfo;
  }
}

/**
 * Extract FourCC from codec string if present
 */
function extractFourCC(codecString: string | null): string | null {
  if (!codecString) return null;

  // Try to find a 4-character FourCC code
  const fourccMatch = codecString.match(/\b([a-zA-Z0-9]{4})\b/);
  return fourccMatch?.[1] ?? null;
}

/**
 * Check if a codec family is supported by browsers via WebCodecs
 */
export function isBrowserSupportedCodec(family: CodecFamily): boolean {
  const supportedFamilies: CodecFamily[] = ['h264', 'h265', 'vp8', 'vp9', 'av1'];
  return supportedFamilies.includes(family);
}

/**
 * Check if codec is a professional codec that typically requires transcoding
 */
export function isProfessionalCodec(family: CodecFamily): boolean {
  return family === 'prores' || family === 'dnxhd' || family === 'jpeg2000' || family === 'rawvideo';
}

/**
 * Get comprehensive support status for a codec
 */
export function getCodecSupportStatus(codecString: string | null): CodecSupportStatus {
  const info = parseCodecInfo(codecString);

  if (info.isSupported) {
    return {
      isSupported: true,
      fallbackAvailable: true,
      requiresTranscoding: false,
      message: `${info.displayName} is fully supported for playback.`,
    };
  }

  if (isProfessionalCodec(info.family)) {
    return {
      isSupported: false,
      fallbackAvailable: false,
      requiresTranscoding: true,
      message: `${info.displayName} is not supported in web browsers.`,
      recommendation: getTranscodingRecommendation(info),
    };
  }

  return {
    isSupported: false,
    fallbackAvailable: false,
    requiresTranscoding: true,
    message: `${info.displayName} (${info.family}) is not supported in this browser.`,
    recommendation:
      'Please transcode to H.264 (MP4), VP9 (WebM), or AV1 for web playback.',
  };
}

/**
 * Get transcoding recommendation for a specific codec
 */
export function getTranscodingRecommendation(codecInfo: CodecInfo): string {
  const recommendations: string[] = [];

  if (codecInfo.family === 'prores') {
    recommendations.push(
      'To view this file in the browser, please transcode to one of these formats:',
      '',
      'For quality preservation:',
      '  ffmpeg -i input.mov -c:v libx264 -crf 18 -preset slow -c:a aac output.mp4',
      '',
      'For smaller file size:',
      '  ffmpeg -i input.mov -c:v libx264 -crf 23 -preset medium -c:a aac output.mp4',
      '',
      'For modern browsers (best quality/size):',
      '  ffmpeg -i input.mov -c:v libsvtav1 -crf 30 -c:a libopus output.webm'
    );
  } else if (codecInfo.family === 'dnxhd') {
    recommendations.push(
      'To view this file in the browser, please transcode to one of these formats:',
      '',
      'For quality preservation:',
      '  ffmpeg -i input.mxf -c:v libx264 -crf 18 -preset slow -c:a aac output.mp4',
      '',
      'For smaller file size:',
      '  ffmpeg -i input.mxf -c:v libx264 -crf 23 -preset medium -c:a aac output.mp4'
    );
  } else if (codecInfo.family === 'jpeg2000') {
    recommendations.push(
      'To view this JPEG 2000 file in the browser, please transcode:',
      '',
      'For quality preservation:',
      '  ffmpeg -i input.mxf -c:v libx264 -crf 18 -preset slow -c:a aac output.mp4',
      '',
      'For DCP content:',
      '  ffmpeg -i input.mxf -c:v libx264 -crf 20 -preset slow -c:a aac output.mp4'
    );
  } else if (codecInfo.family === 'rawvideo') {
    recommendations.push(
      'To view this raw video file in the browser, please transcode:',
      '',
      'For quality preservation:',
      '  ffmpeg -i input -c:v libx264 -crf 18 -preset slow -c:a aac output.mp4',
      '',
      'Note: Raw video files can be very large. Consider using appropriate',
      'input pixel format options (-pix_fmt) if the video appears incorrect.'
    );
  } else {
    recommendations.push(
      'Please transcode to H.264 (MP4) or VP9 (WebM) for web playback:',
      '',
      '  ffmpeg -i input -c:v libx264 -crf 23 -c:a aac output.mp4'
    );
  }

  return recommendations.join('\n');
}

/**
 * Error information for unsupported codecs
 */
export interface UnsupportedCodecError {
  codecInfo: CodecInfo;
  title: string;
  message: string;
  details: string;
  recommendation: string;
}

/**
 * Create a structured error for unsupported codec
 */
export function createUnsupportedCodecError(
  codecString: string | null,
  filename?: string
): UnsupportedCodecError {
  const codecInfo = parseCodecInfo(codecString);
  const status = getCodecSupportStatus(codecString);

  let title = 'Unsupported Video Codec';
  let message = status.message;

  if (codecInfo.family === 'prores') {
    title = 'ProRes Format Not Supported';
    message = `This video uses ${codecInfo.displayName}, which is a professional editing codec not supported by web browsers.`;
  } else if (codecInfo.family === 'dnxhd') {
    title = 'DNxHD/DNxHR Format Not Supported';
    message = `This video uses ${codecInfo.displayName}, which is a professional editing codec not supported by web browsers.`;
  } else if (codecInfo.family === 'jpeg2000') {
    title = 'JPEG 2000 Format Not Supported';
    message = `This video uses ${codecInfo.displayName}, which is commonly used in DCP (Digital Cinema Package) content and is not supported by web browsers.`;
  } else if (codecInfo.family === 'rawvideo') {
    title = 'Raw Video Format Not Supported';
    message = `This video uses ${codecInfo.displayName}, which is an uncompressed format not supported by web browsers.`;
  }

  const details = [
    filename ? `File: ${filename}` : '',
    `Codec: ${codecInfo.displayName}`,
    codecInfo.fourcc ? `FourCC: ${codecInfo.fourcc}` : '',
    '',
    'Why this happens:',
    '- Professional codecs (ProRes, DNxHD, JPEG 2000, Raw) require specialized decoders',
    '- Browsers support consumer codecs (H.264, VP9, AV1)',
    '- Professional codecs require native applications or transcoding',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    codecInfo,
    title,
    message,
    details,
    recommendation: status.recommendation || getTranscodingRecommendation(codecInfo),
  };
}

/**
 * Check if an error message indicates an unsupported codec
 */
export function isCodecError(errorMessage: string): boolean {
  const codecErrorPatterns = [
    /cannot decode.*codec/i,
    /unsupported.*codec/i,
    /codec.*not supported/i,
    /webcodecs.*not support/i,
    /failed to decode/i,
  ];

  return codecErrorPatterns.some((pattern) => pattern.test(errorMessage));
}

/**
 * Extract codec information from an error message
 */
export function extractCodecFromError(errorMessage: string): string | null {
  // Try to extract codec string from error message
  const codecMatch = errorMessage.match(/codec[:\s]+([a-zA-Z0-9_.-]+)/i);
  if (codecMatch?.[1]) {
    return codecMatch[1];
  }

  // Check for specific codec mentions
  const specificCodecs = ['prores', 'dnxhd', 'dnxhr', 'ap4h', 'apch', 'apcn', 'avdn'];
  for (const codec of specificCodecs) {
    if (errorMessage.toLowerCase().includes(codec)) {
      return codec;
    }
  }

  return null;
}
