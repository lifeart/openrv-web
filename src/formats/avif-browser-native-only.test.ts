/**
 * Regression tests for Issue #504:
 * Plain AVIF decoding is browser-native only (no WASM fallback).
 *
 * These tests validate that:
 * 1. avif.ts only uses createImageBitmap (no WASM decoder)
 * 2. FileSourceNode's AVIF path uses blob URL + Image element (no WASM fallback)
 * 3. The docs accurately reflect browser-native-only behavior
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore -- Node modules available in test environment
import { readFileSync } from 'fs';
// @ts-ignore -- Node modules available in test environment
import { resolve } from 'path';

describe('Issue #504: Plain AVIF is browser-native only (no WASM fallback)', () => {
  describe('avif.ts source analysis', () => {
    // @ts-ignore -- __dirname available in test environment
    const avifSource = readFileSync(resolve(__dirname, 'avif.ts'), 'utf-8');

    it('uses createImageBitmap for decoding', () => {
      expect(avifSource).toContain('createImageBitmap');
    });

    it('does not import or reference any WASM decoder', () => {
      expect(avifSource).not.toMatch(/wasm/i);
      expect(avifSource).not.toMatch(/WebAssembly/i);
    });

    it('does not import or reference libavif or any AVIF WASM library', () => {
      expect(avifSource).not.toMatch(/libavif/i);
      expect(avifSource).not.toMatch(/avif-dec/i);
      expect(avifSource).not.toMatch(/avif\.wasm/i);
    });

    it('does not have any fallback decode path', () => {
      const lines = avifSource.split('\n');
      const decodeLines = lines.filter(
        (line: string) =>
          line.includes('decode') && !line.includes('decodeAvif') && !line.includes('//') && !line.includes('*'),
      );
      for (const line of decodeLines) {
        expect(line).not.toMatch(/fallback|wasm|alternative/i);
      }
    });

    it('only exports isAvifFile and decodeAvif', () => {
      const exportMatches = avifSource.match(/export\s+(async\s+)?function\s+(\w+)/g) ?? [];
      const exportedNames = exportMatches.map((m: string) => {
        const match = m.match(/function\s+(\w+)/);
        return match?.[1];
      });
      expect(exportedNames).toContain('isAvifFile');
      expect(exportedNames).toContain('decodeAvif');
      expect(exportedNames).toHaveLength(2);
    });
  });

  describe('FileSourceNode AVIF path analysis', () => {
    // @ts-ignore -- __dirname available in test environment
    const fsNodeSource = readFileSync(resolve(__dirname, '../nodes/sources/FileSourceNode.ts'), 'utf-8');

    it('loads non-HDR AVIF via blob URL and Image element (not WASM)', () => {
      expect(fsNodeSource).toContain("new Blob([buffer], { type: 'image/avif' })");
      expect(fsNodeSource).toContain('URL.createObjectURL');
    });

    it('does not reference a WASM AVIF decoder for plain AVIF', () => {
      expect(fsNodeSource).not.toMatch(/avif.*wasm/i);
      expect(fsNodeSource).not.toMatch(/wasm.*avif/i);
      expect(fsNodeSource).not.toContain("from '../../formats/avif'");
      expect(fsNodeSource).not.toContain("import('../../formats/avif')");
    });

    it('SDR AVIF path uses HTMLImageElement (img.src = blobUrl pattern)', () => {
      expect(fsNodeSource).toContain('const img = new Image()');
      expect(fsNodeSource).toContain('img.src = blobUrl');
    });
  });

  describe('documentation accuracy', () => {
    // @ts-ignore -- __dirname available in test environment
    const docsSource = readFileSync(resolve(__dirname, '../../docs/guides/file-formats.md'), 'utf-8');

    it('does not claim WASM fallback for plain AVIF', () => {
      const plainAvifSection = docsSource.slice(
        docsSource.indexOf('### Plain AVIF'),
        docsSource.indexOf('###', docsSource.indexOf('### Plain AVIF') + 1),
      );
      expect(plainAvifSection).not.toMatch(/WASM fallback/i);
      expect(plainAvifSection).not.toMatch(/with WASM/i);
    });

    it('states that plain AVIF is browser-native only', () => {
      const plainAvifSection = docsSource.slice(
        docsSource.indexOf('### Plain AVIF'),
        docsSource.indexOf('###', docsSource.indexOf('### Plain AVIF') + 1),
      );
      expect(plainAvifSection).toMatch(/[Bb]rowser-native only/);
    });

    it('mentions that browsers without native AVIF support cannot decode', () => {
      const plainAvifSection = docsSource.slice(
        docsSource.indexOf('### Plain AVIF'),
        docsSource.indexOf('###', docsSource.indexOf('### Plain AVIF') + 1),
      );
      expect(plainAvifSection).toMatch(/without native AVIF support/i);
      expect(plainAvifSection).toMatch(/cannot decode/i);
    });

    it('mentions createImageBitmap as the decode mechanism', () => {
      const plainAvifSection = docsSource.slice(
        docsSource.indexOf('### Plain AVIF'),
        docsSource.indexOf('###', docsSource.indexOf('### Plain AVIF') + 1),
      );
      expect(plainAvifSection).toContain('createImageBitmap()');
    });

    it('format comparison table lists AVIF decoder type as Native (not Native/WASM)', () => {
      const avifRow = docsSource
        .split('\n')
        .find((line: string) => line.includes('| AVIF') && line.includes('.avif') && !line.includes('Gainmap'));
      expect(avifRow).toBeDefined();
      expect(avifRow).toContain('| Native |');
      expect(avifRow).not.toContain('Native/WASM');
    });
  });
});
