import { describe, it, expect } from 'vitest';
import { TransformSerializer } from './TransformSerializer';
import { ObjectDTO } from 'gto-js';

// ===========================================================================
// buildDispTransform2DObject
// ===========================================================================
describe('TransformSerializer.buildDispTransform2DObject', () => {
  it('TS-001: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildDispTransform2DObject('disp_xform'),
    );
    expect(dto.name).toBe('disp_xform');
    expect(dto.protocol).toBe('RVDispTransform2D');
    expect(dto.protocolVersion).toBe(1);
  });

  it('TS-002: has a transform component with default values', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildDispTransform2DObject('dt'),
    );
    const t = dto.component('transform');
    expect(t.exists()).toBe(true);

    // active defaults to 1 (since active !== false)
    expect(t.prop('active')).toBe(1);
    // translate defaults to [0, 0]
    expect(t.property('translate').data).toEqual([0, 0]);
    // scale defaults to [1, 1]
    expect(t.property('scale').data).toEqual([1, 1]);
    // rotate defaults to 0
    expect(t.prop('rotate')).toBe(0);
  });

  it('TS-003: applies custom translate, scale, and rotate', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildDispTransform2DObject('dt', {
        translateX: 10,
        translateY: -5,
        scaleX: 2.0,
        scaleY: 0.5,
        rotate: 45,
      }),
    );
    const t = dto.component('transform');
    expect(t.property('translate').data).toEqual([10, -5]);
    expect(t.property('scale').data).toEqual([2.0, 0.5]);
    expect(t.prop('rotate')).toBe(45);
  });

  it('TS-004: active=false sets active to 0', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildDispTransform2DObject('dt', {
        active: false,
      }),
    );
    expect(dto.prop('transform', 'active')).toBe(0);
  });

  it('TS-005: active=true sets active to 1', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildDispTransform2DObject('dt', {
        active: true,
      }),
    );
    expect(dto.prop('transform', 'active')).toBe(1);
  });

  it('TS-006: property types are correct', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildDispTransform2DObject('dt'),
    );
    const t = dto.component('transform');
    expect(t.property('active').type).toBe('int');
    expect(t.property('translate').type).toBe('float');
    expect(t.property('scale').type).toBe('float');
    expect(t.property('rotate').type).toBe('float');
  });
});

// ===========================================================================
// buildTransform2DObject
// ===========================================================================
describe('TransformSerializer.buildTransform2DObject', () => {
  it('TS-007: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildTransform2DObject('src_xform'),
    );
    expect(dto.name).toBe('src_xform');
    expect(dto.protocol).toBe('RVTransform2D');
    expect(dto.protocolVersion).toBe(1);
  });

  it('TS-008: has transform component with default values', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildTransform2DObject('t2d'),
    );
    const t = dto.component('transform');
    expect(t.exists()).toBe(true);

    expect(t.prop('rotate')).toBe(0);
    expect(t.prop('flip')).toBe(0);
    expect(t.prop('flop')).toBe(0);
    // float2 wraps the pair in an array
    expect(t.property('scale').data).toEqual([[1.0, 1.0]]);
    expect(t.property('translate').data).toEqual([[0.0, 0.0]]);
  });

  it('TS-009: applies custom transform settings', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildTransform2DObject('t2d', {
        rotate: 90,
        flip: true,
        flop: true,
        scale: [2.0, 3.0],
        translate: [100, 200],
      }),
    );
    const t = dto.component('transform');
    expect(t.prop('rotate')).toBe(90);
    expect(t.prop('flip')).toBe(1);
    expect(t.prop('flop')).toBe(1);
    expect(t.property('scale').data).toEqual([[2.0, 3.0]]);
    expect(t.property('translate').data).toEqual([[100, 200]]);
  });

  it('TS-010: does not include visibleBox component when not provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildTransform2DObject('t2d'),
    );
    expect(dto.hasComponent('visibleBox')).toBe(false);
  });

  it('TS-011: does not include stencil component when not provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildTransform2DObject('t2d'),
    );
    expect(dto.hasComponent('stencil')).toBe(false);
  });

  it('TS-012: includes visibleBox component when provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildTransform2DObject('t2d', {
        visibleBox: {
          active: true,
          minX: 10,
          minY: 20,
          maxX: 100,
          maxY: 200,
        },
      }),
    );
    const vb = dto.component('visibleBox');
    expect(vb.exists()).toBe(true);
    expect(vb.prop('active')).toBe(1);
    expect(vb.prop('minX')).toBe(10);
    expect(vb.prop('minY')).toBe(20);
    expect(vb.prop('maxX')).toBe(100);
    expect(vb.prop('maxY')).toBe(200);
  });

  it('TS-013: visibleBox defaults when partially provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildTransform2DObject('t2d', {
        visibleBox: {},
      }),
    );
    const vb = dto.component('visibleBox');
    expect(vb.prop('active')).toBe(0); // active is falsy -> 0
    expect(vb.prop('minX')).toBe(0);
    expect(vb.prop('minY')).toBe(0);
    expect(vb.prop('maxX')).toBe(1);
    expect(vb.prop('maxY')).toBe(1);
  });

  it('TS-014: includes stencil component when provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildTransform2DObject('t2d', {
        stencil: {
          active: true,
          inverted: true,
          aspect: 1.85,
          softEdge: 0.05,
          ratio: 2.0,
        },
      }),
    );
    const st = dto.component('stencil');
    expect(st.exists()).toBe(true);
    expect(st.prop('active')).toBe(1);
    expect(st.prop('inverted')).toBe(1);
    expect(st.prop('aspect')).toBe(1.85);
    expect(st.prop('softEdge')).toBe(0.05);
    expect(st.prop('ratio')).toBe(2.0);
  });

  it('TS-015: stencil defaults when partially provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildTransform2DObject('t2d', {
        stencil: {},
      }),
    );
    const st = dto.component('stencil');
    expect(st.prop('active')).toBe(0);
    expect(st.prop('inverted')).toBe(0);
    expect(st.prop('aspect')).toBe(1.0);
    expect(st.prop('softEdge')).toBe(0);
    expect(st.prop('ratio')).toBe(1.0);
  });

  it('TS-016: stencil visibleBox is included when provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildTransform2DObject('t2d', {
        stencil: {
          visibleBox: [0.1, 0.9, 0.2, 0.8],
        },
      }),
    );
    const st = dto.component('stencil');
    expect(st.property('visibleBox').data).toEqual([0.1, 0.9, 0.2, 0.8]);
  });

  it('TS-017: stencil visibleBox is omitted when not provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildTransform2DObject('t2d', {
        stencil: { active: true },
      }),
    );
    const st = dto.component('stencil');
    expect(st.hasProperty('visibleBox')).toBe(false);
  });

  it('TS-018: flip=false and flop=false produce 0', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildTransform2DObject('t2d', {
        flip: false,
        flop: false,
      }),
    );
    const t = dto.component('transform');
    expect(t.prop('flip')).toBe(0);
    expect(t.prop('flop')).toBe(0);
  });
});

// ===========================================================================
// buildLensWarpObject
// ===========================================================================
describe('TransformSerializer.buildLensWarpObject', () => {
  it('TS-019: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildLensWarpObject('lens'),
    );
    expect(dto.name).toBe('lens');
    expect(dto.protocol).toBe('RVLensWarp');
    expect(dto.protocolVersion).toBe(1);
  });

  it('TS-020: has node component with active=1 by default', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildLensWarpObject('lens'),
    );
    const node = dto.component('node');
    expect(node.exists()).toBe(true);
    expect(node.prop('active')).toBe(1);
  });

  it('TS-021: has warp component with default values', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildLensWarpObject('lens'),
    );
    const w = dto.component('warp');
    expect(w.exists()).toBe(true);

    expect(w.prop('model')).toBe('brown');
    expect(w.prop('k1')).toBe(0);
    expect(w.prop('k2')).toBe(0);
    expect(w.prop('k3')).toBe(0);
    expect(w.prop('p1')).toBe(0);
    expect(w.prop('p2')).toBe(0);
    expect(w.prop('d')).toBe(1.0);
    expect(w.property('center').data).toEqual([[0.5, 0.5]]);
    expect(w.property('offset').data).toEqual([[0, 0]]);
    expect(w.prop('pixelAspectRatio')).toBe(1.0);
    expect(w.prop('fx')).toBe(1.0);
    expect(w.prop('fy')).toBe(1.0);
    expect(w.prop('cropRatioX')).toBe(1.0);
    expect(w.prop('cropRatioY')).toBe(1.0);
  });

  it('TS-022: applies custom warp settings', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildLensWarpObject('lens', {
        model: 'opencv',
        k1: 0.1,
        k2: -0.05,
        k3: 0.002,
        p1: 0.001,
        p2: -0.003,
        d: 1.2,
        center: [0.48, 0.52],
        offset: [5, -3],
        pixelAspectRatio: 2.0,
        fx: 1000,
        fy: 1000,
        cropRatioX: 0.9,
        cropRatioY: 0.95,
      }),
    );
    const w = dto.component('warp');
    expect(w.prop('model')).toBe('opencv');
    expect(w.prop('k1')).toBe(0.1);
    expect(w.prop('k2')).toBe(-0.05);
    expect(w.prop('k3')).toBe(0.002);
    expect(w.prop('p1')).toBe(0.001);
    expect(w.prop('p2')).toBe(-0.003);
    expect(w.prop('d')).toBe(1.2);
    expect(w.property('center').data).toEqual([[0.48, 0.52]]);
    expect(w.property('offset').data).toEqual([[5, -3]]);
    expect(w.prop('pixelAspectRatio')).toBe(2.0);
    expect(w.prop('fx')).toBe(1000);
    expect(w.prop('fy')).toBe(1000);
    expect(w.prop('cropRatioX')).toBe(0.9);
    expect(w.prop('cropRatioY')).toBe(0.95);
  });

  it('TS-023: active=false sets node active to 0', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildLensWarpObject('lens', {
        active: false,
      }),
    );
    expect(dto.prop('node', 'active')).toBe(0);
  });

  it('TS-024: anamorphic properties are omitted when not provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildLensWarpObject('lens'),
    );
    const w = dto.component('warp');
    expect(w.hasProperty('squeeze')).toBe(false);
    expect(w.hasProperty('squeezeX')).toBe(false);
    expect(w.hasProperty('squeezeY')).toBe(false);
    expect(w.hasProperty('anamorphicRotation')).toBe(false);
    expect(w.hasProperty('lensRotation')).toBe(false);
    expect(w.hasProperty('cx02')).toBe(false);
    expect(w.hasProperty('cy02')).toBe(false);
    expect(w.hasProperty('cx22')).toBe(false);
    expect(w.hasProperty('cy22')).toBe(false);
    expect(w.hasProperty('cx04')).toBe(false);
    expect(w.hasProperty('cy04')).toBe(false);
    expect(w.hasProperty('cx24')).toBe(false);
    expect(w.hasProperty('cy24')).toBe(false);
    expect(w.hasProperty('cx44')).toBe(false);
    expect(w.hasProperty('cy44')).toBe(false);
  });

  it('TS-025: anamorphic properties are included when provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildLensWarpObject('lens', {
        model: '3de4_anamorphic',
        anamorphic: {
          squeeze: 1.3,
          squeezeX: 0.95,
          squeezeY: 1.05,
          anamorphicRotation: 2.5,
          lensRotation: -1.0,
          cx02: 0.01,
          cy02: 0.02,
          cx22: 0.03,
          cy22: 0.04,
          cx04: 0.05,
          cy04: 0.06,
          cx24: 0.07,
          cy24: 0.08,
          cx44: 0.09,
          cy44: 0.10,
        },
      }),
    );
    const w = dto.component('warp');
    expect(w.prop('squeeze')).toBe(1.3);
    expect(w.prop('squeezeX')).toBe(0.95);
    expect(w.prop('squeezeY')).toBe(1.05);
    expect(w.prop('anamorphicRotation')).toBe(2.5);
    expect(w.prop('lensRotation')).toBe(-1.0);
    expect(w.prop('cx02')).toBe(0.01);
    expect(w.prop('cy02')).toBe(0.02);
    expect(w.prop('cx22')).toBe(0.03);
    expect(w.prop('cy22')).toBe(0.04);
    expect(w.prop('cx04')).toBe(0.05);
    expect(w.prop('cy04')).toBe(0.06);
    expect(w.prop('cx24')).toBe(0.07);
    expect(w.prop('cy24')).toBe(0.08);
    expect(w.prop('cx44')).toBe(0.09);
    expect(w.prop('cy44')).toBe(0.10);
  });

  it('TS-026: partial anamorphic only includes provided fields', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildLensWarpObject('lens', {
        anamorphic: {
          squeeze: 1.5,
          cx02: 0.01,
        },
      }),
    );
    const w = dto.component('warp');
    expect(w.prop('squeeze')).toBe(1.5);
    expect(w.prop('cx02')).toBe(0.01);
    // Not provided anamorphic fields should be absent
    expect(w.hasProperty('squeezeX')).toBe(false);
    expect(w.hasProperty('squeezeY')).toBe(false);
    expect(w.hasProperty('anamorphicRotation')).toBe(false);
    expect(w.hasProperty('lensRotation')).toBe(false);
    expect(w.hasProperty('cy02')).toBe(false);
  });

  it('TS-027: empty anamorphic object adds no extra properties', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildLensWarpObject('lens', {
        anamorphic: {},
      }),
    );
    const w = dto.component('warp');
    expect(w.hasProperty('squeeze')).toBe(false);
    expect(w.hasProperty('squeezeX')).toBe(false);
  });
});

// ===========================================================================
// buildRotateCanvasObject
// ===========================================================================
describe('TransformSerializer.buildRotateCanvasObject', () => {
  it('TS-028: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildRotateCanvasObject('rot'),
    );
    expect(dto.name).toBe('rot');
    expect(dto.protocol).toBe('RVRotateCanvas');
    expect(dto.protocolVersion).toBe(1);
  });

  it('TS-029: has node component with default values', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildRotateCanvasObject('rot'),
    );
    const node = dto.component('node');
    expect(node.exists()).toBe(true);

    expect(node.prop('active')).toBe(1);
    expect(node.prop('degrees')).toBe(0.0);
    expect(node.prop('flipH')).toBe(0);
    expect(node.prop('flipV')).toBe(0);
  });

  it('TS-030: applies custom rotation settings', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildRotateCanvasObject('rot', {
        active: true,
        degrees: 180,
        flipH: true,
        flipV: true,
      }),
    );
    const node = dto.component('node');
    expect(node.prop('active')).toBe(1);
    expect(node.prop('degrees')).toBe(180);
    expect(node.prop('flipH')).toBe(1);
    expect(node.prop('flipV')).toBe(1);
  });

  it('TS-031: active=false sets active to 0', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildRotateCanvasObject('rot', {
        active: false,
      }),
    );
    expect(dto.prop('node', 'active')).toBe(0);
  });

  it('TS-032: property types are correct', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildRotateCanvasObject('rot'),
    );
    const node = dto.component('node');
    expect(node.property('active').type).toBe('int');
    expect(node.property('degrees').type).toBe('float');
    expect(node.property('flipH').type).toBe('int');
    expect(node.property('flipV').type).toBe('int');
  });

  it('TS-033: flipH and flipV default to false (0) when not provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildRotateCanvasObject('rot', {
        degrees: 90,
      }),
    );
    const node = dto.component('node');
    expect(node.prop('flipH')).toBe(0);
    expect(node.prop('flipV')).toBe(0);
  });
});

// ===========================================================================
// buildResizeObject
// ===========================================================================
describe('TransformSerializer.buildResizeObject', () => {
  it('TS-034: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildResizeObject('resize'),
    );
    expect(dto.name).toBe('resize');
    expect(dto.protocol).toBe('RVResize');
    expect(dto.protocolVersion).toBe(1);
  });

  it('TS-035: has node component with default values', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildResizeObject('resize'),
    );
    const node = dto.component('node');
    expect(node.exists()).toBe(true);

    expect(node.prop('active')).toBe(1);
    expect(node.prop('width')).toBe(0);
    expect(node.prop('height')).toBe(0);
    expect(node.prop('mode')).toBe(0);
    expect(node.prop('filter')).toBe(1);
  });

  it('TS-036: applies custom resize settings', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildResizeObject('resize', {
        active: true,
        width: 1920,
        height: 1080,
        mode: 2,
        filter: 3,
      }),
    );
    const node = dto.component('node');
    expect(node.prop('active')).toBe(1);
    expect(node.prop('width')).toBe(1920);
    expect(node.prop('height')).toBe(1080);
    expect(node.prop('mode')).toBe(2);
    expect(node.prop('filter')).toBe(3);
  });

  it('TS-037: active=false sets active to 0', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildResizeObject('resize', {
        active: false,
      }),
    );
    expect(dto.prop('node', 'active')).toBe(0);
  });

  it('TS-038: all properties are int type', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildResizeObject('resize'),
    );
    const node = dto.component('node');
    expect(node.property('active').type).toBe('int');
    expect(node.property('width').type).toBe('int');
    expect(node.property('height').type).toBe('int');
    expect(node.property('mode').type).toBe('int');
    expect(node.property('filter').type).toBe('int');
  });

  it('TS-039: filter defaults to 1 (bilinear) when not specified', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildResizeObject('resize', {
        width: 640,
        height: 480,
      }),
    );
    expect(dto.prop('node', 'filter')).toBe(1);
  });
});

// ===========================================================================
// buildFormatObject
// ===========================================================================
describe('TransformSerializer.buildFormatObject', () => {
  it('TS-040: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(TransformSerializer.buildFormatObject('fmt'));
    expect(dto.name).toBe('fmt');
    expect(dto.protocol).toBe('RVFormat');
    expect(dto.protocolVersion).toBe(1);
  });

  it('TS-041: has no crop, uncrop, or format components when settings are empty', () => {
    const dto = new ObjectDTO(TransformSerializer.buildFormatObject('fmt'));
    expect(dto.hasComponent('crop')).toBe(false);
    expect(dto.hasComponent('uncrop')).toBe(false);
    expect(dto.hasComponent('format')).toBe(false);
  });

  it('TS-042: includes crop component when provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        crop: { active: true, xmin: 10, ymin: 20, xmax: 1910, ymax: 1060 },
      }),
    );
    const c = dto.component('crop');
    expect(c.exists()).toBe(true);
    expect(c.prop('active')).toBe(1);
    expect(c.prop('xmin')).toBe(10);
    expect(c.prop('ymin')).toBe(20);
    expect(c.prop('xmax')).toBe(1910);
    expect(c.prop('ymax')).toBe(1060);
  });

  it('TS-043: crop defaults when partially provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        crop: {},
      }),
    );
    const c = dto.component('crop');
    // active !== false -> 1
    expect(c.prop('active')).toBe(1);
    expect(c.prop('xmin')).toBe(0);
    expect(c.prop('ymin')).toBe(0);
    expect(c.prop('xmax')).toBe(0);
    expect(c.prop('ymax')).toBe(0);
  });

  it('TS-044: crop active=false sets active to 0', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        crop: { active: false },
      }),
    );
    expect(dto.prop('crop', 'active')).toBe(0);
  });

  it('TS-045: includes uncrop component when provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        uncrop: { active: true, x: 50, y: 100, width: 2048, height: 1024 },
      }),
    );
    const uc = dto.component('uncrop');
    expect(uc.exists()).toBe(true);
    expect(uc.prop('active')).toBe(1);
    expect(uc.prop('x')).toBe(50);
    expect(uc.prop('y')).toBe(100);
    expect(uc.prop('width')).toBe(2048);
    expect(uc.prop('height')).toBe(1024);
  });

  it('TS-046: uncrop defaults when partially provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        uncrop: {},
      }),
    );
    const uc = dto.component('uncrop');
    // active !== false -> 1
    expect(uc.prop('active')).toBe(1);
    expect(uc.prop('x')).toBe(0);
    expect(uc.prop('y')).toBe(0);
    expect(uc.prop('width')).toBe(0);
    expect(uc.prop('height')).toBe(0);
  });

  it('TS-047: uncrop active=false sets active to 0', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        uncrop: { active: false },
      }),
    );
    expect(dto.prop('uncrop', 'active')).toBe(0);
  });

  it('TS-048: includes format component with channels when provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        channels: ['R', 'G', 'B', 'A'],
      }),
    );
    const f = dto.component('format');
    expect(f.exists()).toBe(true);
    expect(f.property('channels').data).toEqual(['R', 'G', 'B', 'A']);
  });

  it('TS-049: format component is omitted when channels is empty array', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        channels: [],
      }),
    );
    expect(dto.hasComponent('format')).toBe(false);
  });

  it('TS-050: format component is omitted when channels is not provided', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        crop: { active: true },
      }),
    );
    expect(dto.hasComponent('format')).toBe(false);
  });

  it('TS-051: crop and uncrop can coexist', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        crop: { xmin: 5, ymin: 10, xmax: 100, ymax: 200 },
        uncrop: { x: 0, y: 0, width: 1920, height: 1080 },
      }),
    );
    expect(dto.hasComponent('crop')).toBe(true);
    expect(dto.hasComponent('uncrop')).toBe(true);
  });

  it('TS-052: all three components can coexist', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        crop: { xmin: 5, ymin: 10, xmax: 100, ymax: 200 },
        uncrop: { x: 0, y: 0, width: 1920, height: 1080 },
        channels: ['R', 'G', 'B'],
      }),
    );
    expect(dto.hasComponent('crop')).toBe(true);
    expect(dto.hasComponent('uncrop')).toBe(true);
    expect(dto.hasComponent('format')).toBe(true);
  });

  it('TS-053: crop property types are correct', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        crop: { xmin: 0, ymin: 0, xmax: 100, ymax: 100 },
      }),
    );
    const c = dto.component('crop');
    expect(c.property('active').type).toBe('int');
    expect(c.property('xmin').type).toBe('float');
    expect(c.property('ymin').type).toBe('float');
    expect(c.property('xmax').type).toBe('float');
    expect(c.property('ymax').type).toBe('float');
  });

  it('TS-054: uncrop property types are correct', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        uncrop: { x: 0, y: 0, width: 100, height: 100 },
      }),
    );
    const uc = dto.component('uncrop');
    expect(uc.property('active').type).toBe('int');
    expect(uc.property('x').type).toBe('int');
    expect(uc.property('y').type).toBe('int');
    expect(uc.property('width').type).toBe('int');
    expect(uc.property('height').type).toBe('int');
  });

  it('TS-055: channels property type is string', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildFormatObject('fmt', {
        channels: ['R'],
      }),
    );
    const f = dto.component('format');
    expect(f.property('channels').type).toBe('string');
  });
});

// ===========================================================================
// Cross-cutting / edge-case tests
// ===========================================================================
describe('TransformSerializer cross-cutting tests', () => {
  it('TS-056: each method returns a standalone ObjectData (not shared state)', () => {
    const a = new ObjectDTO(
      TransformSerializer.buildDispTransform2DObject('a'),
    );
    const b = new ObjectDTO(
      TransformSerializer.buildDispTransform2DObject('b', { rotate: 45 }),
    );
    expect(a.name).toBe('a');
    expect(b.name).toBe('b');
    // They should not share the same component references
    const aRotate = a.prop('transform', 'rotate');
    const bRotate = b.prop('transform', 'rotate');
    expect(aRotate).toBe(0);
    expect(bRotate).toBe(45);
  });

  it('TS-057: object names with special characters are preserved', () => {
    const dto = new ObjectDTO(
      TransformSerializer.buildResizeObject('source_group000000_resize'),
    );
    expect(dto.name).toBe('source_group000000_resize');
  });

  it('TS-058: active=undefined defaults to active=1 (active !== false)', () => {
    // Tests all methods that use the "active !== false" pattern
    const disp = new ObjectDTO(
      TransformSerializer.buildDispTransform2DObject('d', {}),
    );
    expect(disp.prop('transform', 'active')).toBe(1);

    const lens = new ObjectDTO(
      TransformSerializer.buildLensWarpObject('l', {}),
    );
    expect(lens.prop('node', 'active')).toBe(1);

    const rot = new ObjectDTO(
      TransformSerializer.buildRotateCanvasObject('r', {}),
    );
    expect(rot.prop('node', 'active')).toBe(1);

    const resize = new ObjectDTO(
      TransformSerializer.buildResizeObject('s', {}),
    );
    expect(resize.prop('node', 'active')).toBe(1);
  });

  it('TS-059: all methods accept empty settings object', () => {
    expect(() =>
      TransformSerializer.buildDispTransform2DObject('a', {}),
    ).not.toThrow();
    expect(() =>
      TransformSerializer.buildTransform2DObject('a', {}),
    ).not.toThrow();
    expect(() =>
      TransformSerializer.buildLensWarpObject('a', {}),
    ).not.toThrow();
    expect(() =>
      TransformSerializer.buildRotateCanvasObject('a', {}),
    ).not.toThrow();
    expect(() =>
      TransformSerializer.buildResizeObject('a', {}),
    ).not.toThrow();
    expect(() =>
      TransformSerializer.buildFormatObject('a', {}),
    ).not.toThrow();
  });

  it('TS-060: all methods work with no settings argument', () => {
    expect(() =>
      TransformSerializer.buildDispTransform2DObject('a'),
    ).not.toThrow();
    expect(() =>
      TransformSerializer.buildTransform2DObject('a'),
    ).not.toThrow();
    expect(() => TransformSerializer.buildLensWarpObject('a')).not.toThrow();
    expect(() =>
      TransformSerializer.buildRotateCanvasObject('a'),
    ).not.toThrow();
    expect(() => TransformSerializer.buildResizeObject('a')).not.toThrow();
    expect(() => TransformSerializer.buildFormatObject('a')).not.toThrow();
  });
});
