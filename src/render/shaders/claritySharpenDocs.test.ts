/**
 * Documentation pin tests for LOW-07.
 *
 * The clarity and sharpen effects in the GLSL single-pass renderer
 * intentionally sample the RAW input texture (not the post-color-pipeline
 * result). Doing the "post-pipeline" version would require an extra FBO +
 * render pass; we accept the trade-off and document it inline. These tests
 * pin the documentation so it cannot be silently dropped during a future
 * refactor.
 *
 * If a future change removes the rationale comments above the clarity or
 * sharpen blocks, these tests fail loudly — preventing a reader from later
 * "fixing" the perceived bug and silently changing rendering output.
 *
 * Mirrors are also pinned for the WebGPU WGSL stage shaders (which have
 * different but related sampling semantics) and the CPU
 * EffectProcessor.applyClarity / applySharpenCPU sites.
 */

import { describe, expect, it } from 'vitest';

import viewerFragSrc from './viewer.frag.glsl?raw';
import spatialEffectsWgsl from '../webgpu/shaders/spatial_effects.wgsl?raw';
import spatialEffectsPostWgsl from '../webgpu/shaders/spatial_effects_post.wgsl?raw';
// Read the EffectProcessor source as text to assert the doc-block phrases.
import effectProcessorSrc from '../../utils/effects/EffectProcessor.ts?raw';

/**
 * Slice a window of `before` characters immediately preceding the FIRST
 * occurrence of `anchor` in `source`. The window is inclusive of the
 * comment block above the anchor (typically the JSDoc / inline comment we
 * want to pin), and conservative enough to span any nearby blank lines.
 */
function windowBefore(source: string, anchor: string, before = 2500): string {
  const idx = source.indexOf(anchor);
  if (idx === -1) {
    throw new Error(`Anchor not found in source: ${anchor}`);
  }
  return source.slice(Math.max(0, idx - before), idx);
}

/**
 * Find the Nth occurrence of `anchor` in `source`. Used when the same
 * substring appears in multiple places (e.g. callsite + definition) and
 * we want to pin a comment attached to a specific occurrence.
 */
function nthIndexOf(source: string, anchor: string, n: number): number {
  let pos = -1;
  for (let i = 0; i < n; i++) {
    pos = source.indexOf(anchor, pos + 1);
    if (pos === -1) return -1;
  }
  return pos;
}

describe('LOW-07: clarity/sharpen raw-texture sampling docs', () => {
  describe('GLSL viewer.frag.glsl', () => {
    it('pins the clarity rationale comment', () => {
      const block = windowBefore(viewerFragSrc, 'u_clarityEnabled && u_clarity != 0.0');
      // Issue tag must be present so future readers can find the audit ticket.
      expect(block).toContain('LOW-07');
      // The trade-off must be explicit in the wording.
      expect(block).toContain('TRADE-OFF');
      // Must explain WHAT it samples.
      expect(block.toLowerCase()).toMatch(/raw input texture|raw texture/);
      // Must explain WHY it isn't sampling post-pipeline.
      expect(block.toLowerCase()).toMatch(/color[ -]pipeline/);
      expect(block.toLowerCase()).toContain('fbo');
      expect(block.toLowerCase()).toMatch(/render pass|extra pass|second pass/);
      // Must mention quality implications.
      expect(block.toLowerCase()).toMatch(/input encoding|display-referred/);
    });

    it('pins the sharpen rationale comment', () => {
      const block = windowBefore(viewerFragSrc, 'u_sharpenEnabled && u_sharpenAmount > 0.0');
      expect(block).toContain('LOW-07');
      expect(block).toContain('TRADE-OFF');
      expect(block.toLowerCase()).toMatch(/raw input texture|raw texture/);
      expect(block.toLowerCase()).toMatch(/color[ -]pipeline/);
      expect(block.toLowerCase()).toContain('fbo');
      expect(block.toLowerCase()).toMatch(/render pass|extra pass|second pass/);
    });
  });

  describe('WGSL spatial_effects.wgsl (clarity)', () => {
    it('pins the clarity rationale comment', () => {
      const block = windowBefore(spatialEffectsWgsl, 'u.clarityEnabled == 1u && u.clarityValue != 0.0');
      expect(block).toContain('LOW-07');
      expect(block).toContain('TRADE-OFF');
      // WGSL is multi-pass: clarity samples the previous stage's output,
      // not raw, but the comment must still explain the relationship to
      // the GLSL trade-off.
      expect(block.toLowerCase()).toMatch(/color[ -]pipeline/);
      expect(block.toLowerCase()).toContain('fbo');
    });
  });

  describe('WGSL spatial_effects_post.wgsl (sharpen)', () => {
    it('pins the sharpen rationale comment', () => {
      const block = windowBefore(spatialEffectsPostWgsl, 'u.sharpenEnabled == 1u && u.sharpenAmount > 0.0');
      expect(block).toContain('LOW-07');
      expect(block).toContain('TRADE-OFF');
      expect(block.toLowerCase()).toMatch(/color[ -]pipeline/);
      expect(block.toLowerCase()).toMatch(/raw|fbo/);
    });
  });

  describe('CPU EffectProcessor', () => {
    it('pins the clarity sampling note', () => {
      // EffectProcessor.ts has THREE matches for `applyClarity(`:
      //   1. callsite in the sync entry point
      //   2. definition (the one with the JSDoc we are pinning)
      //   3. callsite reference inside the JSDoc of applyClarityChunked
      // We want match #2 (the definition).
      const defIdx = nthIndexOf(effectProcessorSrc, 'applyClarity(', 2);
      expect(defIdx).toBeGreaterThan(-1);
      const window = effectProcessorSrc.slice(Math.max(0, defIdx - 2500), defIdx);
      expect(window).toContain('LOW-07');
      expect(window.toLowerCase()).toMatch(/raw input texture|raw texture/);
      expect(window.toLowerCase()).toMatch(/color[ -]pipeline/);
    });

    it('pins the sharpen sampling note', () => {
      // applySharpenCPU has TWO occurrences:
      //   1. callsite
      //   2. definition (with JSDoc)
      const defIdx = nthIndexOf(effectProcessorSrc, 'applySharpenCPU(', 2);
      expect(defIdx).toBeGreaterThan(-1);
      const window = effectProcessorSrc.slice(Math.max(0, defIdx - 2500), defIdx);
      expect(window).toContain('LOW-07');
      expect(window.toLowerCase()).toMatch(/raw input texture|raw texture/);
      expect(window.toLowerCase()).toMatch(/color[ -]pipeline/);
    });
  });
});
