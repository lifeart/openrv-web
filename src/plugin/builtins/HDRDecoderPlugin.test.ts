/**
 * HDRDecoderPlugin Example Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PluginRegistry } from '../PluginRegistry';
import HDRDecoderPlugin from './HDRDecoderPlugin';
import { decoderRegistry } from '../../formats/DecoderRegistry';

describe('HDRDecoderPlugin', () => {
  let registry: PluginRegistry;
  let activated = false;

  beforeEach(() => {
    registry = new PluginRegistry();
    activated = false;
  });

  afterEach(async () => {
    // Clean up: deactivate the plugin to restore the original HDR decoder
    // The built-in HDR decoder is already in the decoderRegistry from its constructor,
    // and registerDecoder replaces by formatName. Deactivation calls unregisterDecoder
    // which removes the plugin's version. Since the built-in was replaced (not removed),
    // we need to re-verify the built-in is still in the chain.
    if (activated) {
      await registry.deactivate('openrv.builtin.hdr-decoder');
    }
  });

  it('HDRP-001: has correct manifest', () => {
    expect(HDRDecoderPlugin.manifest.id).toBe('openrv.builtin.hdr-decoder');
    expect(HDRDecoderPlugin.manifest.contributes).toContain('decoder');
    expect(HDRDecoderPlugin.manifest.version).toBe('1.0.0');
  });

  it('HDRP-002: registers HDR decoder on activate', async () => {
    registry.register(HDRDecoderPlugin);
    await registry.activate('openrv.builtin.hdr-decoder');
    activated = true;

    // The HDR decoder should be findable via its magic bytes
    const hdrMagic = new Uint8Array([
      0x23, 0x3F, 0x52, 0x41, 0x44, 0x49, 0x41, 0x4E, 0x43, 0x45
    ]); // "#?RADIANCE"
    const decoder = decoderRegistry.getDecoder(hdrMagic.buffer);
    expect(decoder).not.toBeNull();
    expect(decoder?.formatName).toBe('hdr');
  });
});
