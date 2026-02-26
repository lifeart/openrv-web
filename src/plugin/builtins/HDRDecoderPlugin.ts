/**
 * HDR Decoder Plugin - Example built-in plugin migration.
 *
 * Demonstrates how the existing Radiance HDR decoder can be expressed
 * as a plugin. The built-in DecoderRegistry constructor continues to
 * register the HDR decoder directly for zero-overhead startup; this
 * plugin form is for reference and testing.
 */

import type { Plugin, PluginManifest, PluginContext } from '../types';
import type { FormatDecoder, DecodeResult } from '../../formats/DecoderRegistry';

const manifest: PluginManifest = {
  id: 'openrv.builtin.hdr-decoder',
  name: 'Radiance HDR Decoder',
  version: '1.0.0',
  description: 'Decodes Radiance .hdr files',
  author: 'OpenRV Team',
  license: 'Apache-2.0',
  contributes: ['decoder'],
};

const hdrDecoder: FormatDecoder = {
  formatName: 'hdr',
  canDecode(buffer: ArrayBuffer): boolean {
    if (buffer.byteLength < 6) return false;
    const len = Math.min(buffer.byteLength, 10);
    const bytes = new Uint8Array(buffer, 0, len);
    const header = String.fromCharCode(...bytes);
    return header.startsWith('#?RADIANCE') || header.startsWith('#?RGBE');
  },
  async decode(buffer: ArrayBuffer): Promise<DecodeResult> {
    const { decodeHDR } = await import('../../formats/HDRDecoder');
    const result = await decodeHDR(buffer);
    return {
      width: result.width,
      height: result.height,
      data: result.data,
      channels: result.channels,
      colorSpace: result.colorSpace,
      metadata: result.metadata,
    };
  },
};

const HDRDecoderPlugin: Plugin = {
  manifest,
  activate(context: PluginContext) {
    context.registerDecoder(hdrDecoder);
    context.log.info('HDR decoder registered');
  },
  deactivate() {
    // Decoder will be unregistered by the registry via tracked registrations
  },
};

export default HDRDecoderPlugin;
