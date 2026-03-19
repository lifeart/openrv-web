/**
 * Regression tests for Issue #494:
 * The gamut-diagram docs described a target-gamut compliance tool, but the
 * shipped diagram only overlays scatter against fixed input/working/display
 * triangles. These tests verify:
 * 1. GamutDiagram has no target-gamut selection property or method
 * 2. The three gamut spaces (input/working/display) are the only gamut state
 * 3. The docs accurately reflect the actual behavior (no compliance language)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-ignore -- Node modules available in test environment
import { readFileSync } from 'fs';
// @ts-ignore -- Node modules available in test environment
import { resolve } from 'path';
import type { DraggableContainer } from './shared/DraggableContainer';
import * as DraggableContainerModule from './shared/DraggableContainer';
import * as ThemeManagerModule from '../../utils/ui/ThemeManager';
import { GamutDiagram } from './GamutDiagram';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function createMockContainer(): DraggableContainer {
  const content = document.createElement('div');
  const element = document.createElement('div');
  const header = document.createElement('div');
  const controls = document.createElement('div');
  element.appendChild(header);
  element.appendChild(content);
  return {
    element,
    header,
    controls,
    content,
    footer: null,
    show: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => false),
    setFooter: vi.fn(),
    getPosition: vi.fn(() => ({ x: 0, y: 0 })),
    setPosition: vi.fn(),
    resetPosition: vi.fn(),
    dispose: vi.fn(),
  };
}

// --------------------------------------------------------------------------
// Source-code tests: GamutDiagram has no target-gamut concept
// --------------------------------------------------------------------------

describe('Issue #494 – GamutDiagram has no target-gamut selection', () => {
  let diagram: GamutDiagram;

  beforeEach(() => {
    vi.spyOn(DraggableContainerModule, 'createDraggableContainer').mockImplementation(createMockContainer);
    vi.spyOn(ThemeManagerModule.getThemeManager(), 'on');
    vi.spyOn(ThemeManagerModule.getThemeManager(), 'off');
    diagram = new GamutDiagram();
  });

  afterEach(() => {
    diagram.dispose();
    vi.restoreAllMocks();
  });

  it('has no "targetGamut" property', () => {
    expect('targetGamut' in diagram).toBe(false);
  });

  it('has no "targetColorSpace" property', () => {
    expect('targetColorSpace' in diagram).toBe(false);
  });

  it('has no "setTargetGamut" method', () => {
    expect('setTargetGamut' in diagram).toBe(false);
  });

  it('has no "setTargetColorSpace" method', () => {
    expect('setTargetColorSpace' in diagram).toBe(false);
  });

  it('has no "compliance" property or method', () => {
    expect('compliance' in diagram).toBe(false);
    expect('getCompliance' in diagram).toBe(false);
    expect('checkCompliance' in diagram).toBe(false);
  });

  it('has no "outOfGamut" or "inGamut" classification methods', () => {
    expect('outOfGamut' in diagram).toBe(false);
    expect('inGamut' in diagram).toBe(false);
    expect('classifyPixels' in diagram).toBe(false);
    expect('getOutOfGamutCount' in diagram).toBe(false);
  });

  it('has no gamut mapping mode (clip/compress) property', () => {
    expect('gamutMapping' in diagram).toBe(false);
    expect('setGamutMapping' in diagram).toBe(false);
    expect('mappingMode' in diagram).toBe(false);
  });
});

// --------------------------------------------------------------------------
// Source-code tests: the three color spaces are the only gamut state
// --------------------------------------------------------------------------

describe('Issue #494 – three gamut spaces are the only gamut state', () => {
  let diagram: GamutDiagram;

  beforeEach(() => {
    vi.spyOn(DraggableContainerModule, 'createDraggableContainer').mockImplementation(createMockContainer);
    vi.spyOn(ThemeManagerModule.getThemeManager(), 'on');
    vi.spyOn(ThemeManagerModule.getThemeManager(), 'off');
    diagram = new GamutDiagram();
  });

  afterEach(() => {
    diagram.dispose();
    vi.restoreAllMocks();
  });

  it('exposes setColorSpaces accepting exactly three arguments (input, working, display)', () => {
    expect(typeof diagram.setColorSpaces).toBe('function');
    expect(diagram.setColorSpaces.length).toBe(3);
  });

  it('setColorSpaces is the only color-space setter on the public API', () => {
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(diagram));
    const colorSpaceSetters = proto.filter((name) => /color/i.test(name) && /set/i.test(name));
    expect(colorSpaceSetters).toEqual(['setColorSpaces']);
  });

  it('public API consists only of lifecycle and update methods, no gamut analysis', () => {
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(diagram));
    // Filter out EventEmitter inherited methods and constructor
    const publicMethods = proto.filter(
      (name) => name !== 'constructor' && typeof (diagram as unknown as Record<string, unknown>)[name] === 'function',
    );

    // The public methods should be limited to: show, hide, toggle, isVisible,
    // render, dispose, update, updateFloat, setColorSpaces, and EventEmitter methods.
    // None should relate to target-gamut analysis or compliance.
    const gamutAnalysisMethods = publicMethods.filter(
      (name) => /target/i.test(name) || /compliance/i.test(name) || /classify/i.test(name) || /outOfGamut/i.test(name),
    );
    expect(gamutAnalysisMethods).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// Documentation tests: docs accurately reflect shipped behavior
// --------------------------------------------------------------------------

describe('Issue #494 – gamut-diagram docs match shipped behavior', () => {
  // @ts-ignore -- __dirname available in test environment
  const docPath = resolve(__dirname, '..', '..', '..', 'docs', 'scopes', 'gamut-diagram.md');
  const content = readFileSync(docPath, 'utf-8');

  it('does not mention "target color gamut" or "target gamut"', () => {
    expect(content.toLowerCase()).not.toContain('target color gamut');
    expect(content.toLowerCase()).not.toContain('target gamut');
  });

  it('does not describe inside/outside compliance classification', () => {
    // The old docs said "within or outside a target color gamut"
    expect(content).not.toMatch(/within or outside a target/i);
    expect(content).not.toMatch(/out-of-gamut colors are clipped or compressed/i);
  });

  it('does not mention gamut mapping modes (clip/compress)', () => {
    expect(content.toLowerCase()).not.toContain('gamut mapping setting');
    expect(content.toLowerCase()).not.toContain('clip or soft compress');
  });

  it('does not have a "Gamut Compliance" section', () => {
    expect(content).not.toMatch(/^## Gamut Compliance$/m);
  });

  it('mentions all three color space roles: input, working, display', () => {
    expect(content.toLowerCase()).toContain('input');
    expect(content.toLowerCase()).toContain('working');
    expect(content.toLowerCase()).toContain('display');
  });

  it('describes the diagram as showing scatter against gamut triangles', () => {
    expect(content.toLowerCase()).toContain('scatter');
    expect(content.toLowerCase()).toContain('gamut triangle');
  });

  it('mentions setColorSpaces as the programmatic API', () => {
    expect(content).toContain('setColorSpaces');
  });

  it('explicitly states there is no target-gamut selector or compliance classification', () => {
    expect(content).toMatch(/no.+target.gamut selector/i);
    expect(content).toMatch(/no.+compliance classification/i);
  });

  it('describes the three triangle visual styles (cyan dashed, amber dashed, white solid)', () => {
    expect(content.toLowerCase()).toContain('cyan');
    expect(content.toLowerCase()).toContain('amber');
    expect(content.toLowerCase()).toContain('white');
    expect(content.toLowerCase()).toContain('dashed');
    expect(content.toLowerCase()).toContain('solid');
  });
});
