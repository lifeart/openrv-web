import { describe, it, expect } from 'vitest';
import { ColorSerializer } from './ColorSerializer';
import { ObjectDTO } from 'gto-js';

// ===========================================================================
// buildColorExposureObject
// ===========================================================================
describe('ColorSerializer.buildColorExposureObject', () => {
  it('CS-001: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorExposureObject('exp'));
    expect(dto.name).toBe('exp');
    expect(dto.protocol).toBe('RVColorExposure');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-002: has color component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorExposureObject('exp'));
    const c = dto.component('color');
    expect(c.exists()).toBe(true);
    expect(c.prop('active')).toBe(1);
    expect(c.prop('exposure')).toBe(0.0);
  });

  it('CS-003: applies custom exposure value', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorExposureObject('exp', { exposure: 2.5 }));
    expect(dto.prop('color', 'exposure')).toBe(2.5);
  });

  it('CS-004: active=false sets active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorExposureObject('exp', { active: false }));
    expect(dto.prop('color', 'active')).toBe(0);
  });

  it('CS-005: active=true sets active to 1', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorExposureObject('exp', { active: true }));
    expect(dto.prop('color', 'active')).toBe(1);
  });
});

// ===========================================================================
// buildColorCurveObject
// ===========================================================================
describe('ColorSerializer.buildColorCurveObject', () => {
  it('CS-006: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorCurveObject('curve'));
    expect(dto.name).toBe('curve');
    expect(dto.protocol).toBe('RVColorCurve');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-007: has color component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorCurveObject('curve'));
    const c = dto.component('color');
    expect(c.exists()).toBe(true);
    expect(c.prop('active')).toBe(1);
    expect(c.prop('contrast')).toBe(0.0);
  });

  it('CS-008: applies custom contrast value', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorCurveObject('curve', { contrast: 0.75 }));
    expect(dto.prop('color', 'contrast')).toBe(0.75);
  });

  it('CS-009: active=false sets active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorCurveObject('curve', { active: false }));
    expect(dto.prop('color', 'active')).toBe(0);
  });
});

// ===========================================================================
// buildColorTemperatureObject
// ===========================================================================
describe('ColorSerializer.buildColorTemperatureObject', () => {
  it('CS-010: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorTemperatureObject('temp'));
    expect(dto.name).toBe('temp');
    expect(dto.protocol).toBe('RVColorTemperature');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-011: has color component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorTemperatureObject('temp'));
    const c = dto.component('color');
    expect(c.exists()).toBe(true);
    expect(c.prop('active')).toBe(1);
    expect(c.property('inWhitePrimary').data).toEqual([0.3457, 0.3585]);
    expect(c.prop('inTemperature')).toBe(6500.0);
    expect(c.prop('outTemperature')).toBe(6500.0);
    expect(c.prop('method')).toBe(2);
  });

  it('CS-012: applies custom temperature settings', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildColorTemperatureObject('temp', {
        inWhitePrimary: [0.31, 0.32],
        inTemperature: 5500,
        outTemperature: 7500,
        method: 0,
      }),
    );
    const c = dto.component('color');
    expect(c.property('inWhitePrimary').data).toEqual([0.31, 0.32]);
    expect(c.prop('inTemperature')).toBe(5500);
    expect(c.prop('outTemperature')).toBe(7500);
    expect(c.prop('method')).toBe(0);
  });

  it('CS-013: active=false sets active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorTemperatureObject('temp', { active: false }));
    expect(dto.prop('color', 'active')).toBe(0);
  });
});

// ===========================================================================
// buildColorSaturationObject
// ===========================================================================
describe('ColorSerializer.buildColorSaturationObject', () => {
  it('CS-014: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorSaturationObject('sat'));
    expect(dto.name).toBe('sat');
    expect(dto.protocol).toBe('RVColorSaturation');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-015: has color component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorSaturationObject('sat'));
    const c = dto.component('color');
    expect(c.exists()).toBe(true);
    expect(c.prop('active')).toBe(1);
    expect(c.prop('saturation')).toBe(1.0);
  });

  it('CS-016: applies custom saturation value', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorSaturationObject('sat', { saturation: 1.5 }));
    expect(dto.prop('color', 'saturation')).toBe(1.5);
  });

  it('CS-017: active=false sets active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorSaturationObject('sat', { active: false }));
    expect(dto.prop('color', 'active')).toBe(0);
  });
});

// ===========================================================================
// buildColorVibranceObject
// ===========================================================================
describe('ColorSerializer.buildColorVibranceObject', () => {
  it('CS-018: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorVibranceObject('vib'));
    expect(dto.name).toBe('vib');
    expect(dto.protocol).toBe('RVColorVibrance');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-019: has color component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorVibranceObject('vib'));
    const c = dto.component('color');
    expect(c.exists()).toBe(true);
    expect(c.prop('active')).toBe(1);
    expect(c.prop('vibrance')).toBe(0.0);
  });

  it('CS-020: applies custom vibrance value', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorVibranceObject('vib', { vibrance: 0.8 }));
    expect(dto.prop('color', 'vibrance')).toBe(0.8);
  });

  it('CS-021: active=false sets active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorVibranceObject('vib', { active: false }));
    expect(dto.prop('color', 'active')).toBe(0);
  });
});

// ===========================================================================
// buildColorShadowObject
// ===========================================================================
describe('ColorSerializer.buildColorShadowObject', () => {
  it('CS-022: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorShadowObject('shd'));
    expect(dto.name).toBe('shd');
    expect(dto.protocol).toBe('RVColorShadow');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-023: has color component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorShadowObject('shd'));
    const c = dto.component('color');
    expect(c.exists()).toBe(true);
    expect(c.prop('active')).toBe(1);
    expect(c.prop('shadow')).toBe(0.0);
  });

  it('CS-024: applies custom shadow value', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorShadowObject('shd', { shadow: -0.3 }));
    expect(dto.prop('color', 'shadow')).toBe(-0.3);
  });

  it('CS-025: active=false sets active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorShadowObject('shd', { active: false }));
    expect(dto.prop('color', 'active')).toBe(0);
  });
});

// ===========================================================================
// buildColorHighlightObject
// ===========================================================================
describe('ColorSerializer.buildColorHighlightObject', () => {
  it('CS-026: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorHighlightObject('hlt'));
    expect(dto.name).toBe('hlt');
    expect(dto.protocol).toBe('RVColorHighlight');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-027: has color component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorHighlightObject('hlt'));
    const c = dto.component('color');
    expect(c.exists()).toBe(true);
    expect(c.prop('active')).toBe(1);
    expect(c.prop('highlight')).toBe(0.0);
  });

  it('CS-028: applies custom highlight value', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorHighlightObject('hlt', { highlight: 0.6 }));
    expect(dto.prop('color', 'highlight')).toBe(0.6);
  });

  it('CS-029: active=false sets active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorHighlightObject('hlt', { active: false }));
    expect(dto.prop('color', 'active')).toBe(0);
  });
});

// ===========================================================================
// buildColorGrayScaleObject
// ===========================================================================
describe('ColorSerializer.buildColorGrayScaleObject', () => {
  it('CS-030: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorGrayScaleObject('gray'));
    expect(dto.name).toBe('gray');
    expect(dto.protocol).toBe('RVColorGrayScale');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-031: has node component with active=0 by default (uses active ? 1 : 0)', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorGrayScaleObject('gray'));
    const n = dto.component('node');
    expect(n.exists()).toBe(true);
    // GrayScale uses `active ? 1 : 0`, so undefined -> 0
    expect(n.prop('active')).toBe(0);
  });

  it('CS-032: active=true sets active to 1', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorGrayScaleObject('gray', { active: true }));
    expect(dto.prop('node', 'active')).toBe(1);
  });

  it('CS-033: active=false sets active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorGrayScaleObject('gray', { active: false }));
    expect(dto.prop('node', 'active')).toBe(0);
  });
});

// ===========================================================================
// buildColorCDLObject
// ===========================================================================
describe('ColorSerializer.buildColorCDLObject', () => {
  it('CS-034: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorCDLObject('cdl'));
    expect(dto.name).toBe('cdl');
    expect(dto.protocol).toBe('RVColorCDL');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-035: has node component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorCDLObject('cdl'));
    const n = dto.component('node');
    expect(n.exists()).toBe(true);
    expect(n.prop('active')).toBe(1);
    expect(n.prop('colorspace')).toBe('rec709');
    expect(n.property('slope').data).toEqual([1, 1, 1]);
    expect(n.property('offset').data).toEqual([0, 0, 0]);
    expect(n.property('power').data).toEqual([1, 1, 1]);
    expect(n.prop('saturation')).toBe(1.0);
    expect(n.prop('noClamp')).toBe(0);
  });

  it('CS-036: applies custom CDL settings', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildColorCDLObject('cdl', {
        colorspace: 'aces',
        slope: [1.1, 1.2, 1.3],
        offset: [0.01, 0.02, 0.03],
        power: [0.9, 0.8, 0.7],
        saturation: 0.5,
        noClamp: true,
        file: '/path/to/cdl.ccc',
      }),
    );
    const n = dto.component('node');
    expect(n.prop('colorspace')).toBe('aces');
    expect(n.property('slope').data).toEqual([1.1, 1.2, 1.3]);
    expect(n.property('offset').data).toEqual([0.01, 0.02, 0.03]);
    expect(n.property('power').data).toEqual([0.9, 0.8, 0.7]);
    expect(n.prop('saturation')).toBe(0.5);
    expect(n.prop('noClamp')).toBe(1);
    expect(n.prop('file')).toBe('/path/to/cdl.ccc');
  });

  it('CS-037: active=false sets active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorCDLObject('cdl', { active: false }));
    expect(dto.prop('node', 'active')).toBe(0);
  });

  it('CS-038: file is omitted when not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorCDLObject('cdl'));
    const n = dto.component('node');
    expect(n.hasProperty('file')).toBe(false);
  });
});

// ===========================================================================
// buildColorLinearToSRGBObject
// ===========================================================================
describe('ColorSerializer.buildColorLinearToSRGBObject', () => {
  it('CS-039: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorLinearToSRGBObject('lin2srgb'));
    expect(dto.name).toBe('lin2srgb');
    expect(dto.protocol).toBe('RVColorLinearToSRGB');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-040: has node component with active=1 by default', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorLinearToSRGBObject('lin2srgb'));
    const n = dto.component('node');
    expect(n.exists()).toBe(true);
    expect(n.prop('active')).toBe(1);
  });

  it('CS-041: active=false sets active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorLinearToSRGBObject('lin2srgb', { active: false }));
    expect(dto.prop('node', 'active')).toBe(0);
  });
});

// ===========================================================================
// buildColorSRGBToLinearObject
// ===========================================================================
describe('ColorSerializer.buildColorSRGBToLinearObject', () => {
  it('CS-042: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorSRGBToLinearObject('srgb2lin'));
    expect(dto.name).toBe('srgb2lin');
    expect(dto.protocol).toBe('RVColorSRGBToLinear');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-043: has node component with active=1 by default', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorSRGBToLinearObject('srgb2lin'));
    const n = dto.component('node');
    expect(n.exists()).toBe(true);
    expect(n.prop('active')).toBe(1);
  });

  it('CS-044: active=false sets active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorSRGBToLinearObject('srgb2lin', { active: false }));
    expect(dto.prop('node', 'active')).toBe(0);
  });
});

// ===========================================================================
// buildPrimaryConvertObject
// ===========================================================================
describe('ColorSerializer.buildPrimaryConvertObject', () => {
  it('CS-045: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildPrimaryConvertObject('prim'));
    expect(dto.name).toBe('prim');
    expect(dto.protocol).toBe('RVPrimaryConvert');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-046: has node component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildPrimaryConvertObject('prim'));
    const n = dto.component('node');
    expect(n.exists()).toBe(true);
    expect(n.prop('active')).toBe(1);
    expect(n.prop('inPrimaries')).toBe('sRGB');
    expect(n.prop('outPrimaries')).toBe('sRGB');
    expect(n.prop('adaptationMethod')).toBe(0);
  });

  it('CS-047: applies custom primary convert settings', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildPrimaryConvertObject('prim', {
        inPrimaries: 'Rec2020',
        outPrimaries: 'P3',
        adaptationMethod: 1,
      }),
    );
    const n = dto.component('node');
    expect(n.prop('inPrimaries')).toBe('Rec2020');
    expect(n.prop('outPrimaries')).toBe('P3');
    expect(n.prop('adaptationMethod')).toBe(1);
  });

  it('CS-048: active=false sets active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildPrimaryConvertObject('prim', { active: false }));
    expect(dto.prop('node', 'active')).toBe(0);
  });
});

// ===========================================================================
// buildOCIOObject
// ===========================================================================
describe('ColorSerializer.buildOCIOObject', () => {
  it('CS-049: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio'));
    expect(dto.name).toBe('ocio');
    expect(dto.protocol).toBe('RVOCIO');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-050: has ocio component with active=1 by default', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio'));
    const o = dto.component('ocio');
    expect(o.exists()).toBe(true);
    expect(o.prop('active')).toBe(1);
  });

  it('CS-051: has color component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio'));
    const c = dto.component('color');
    expect(c.exists()).toBe(true);
    expect(c.prop('dither')).toBe(0);
    expect(c.prop('channelOrder')).toBe('RGBA');
  });

  it('CS-052: ocio_color component is omitted when outColorSpace not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio'));
    expect(dto.hasComponent('ocio_color')).toBe(false);
  });

  it('CS-053: ocio_color component is included when outColorSpace provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio', { outColorSpace: 'scene_linear' }));
    const oc = dto.component('ocio_color');
    expect(oc.exists()).toBe(true);
    expect(oc.prop('outColorSpace')).toBe('scene_linear');
  });

  it('CS-054: ocio_look component is omitted when look not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio'));
    expect(dto.hasComponent('ocio_look')).toBe(false);
  });

  it('CS-055: ocio_look component is included when look provided', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildOCIOObject('ocio', {
        look: 'shot_look',
        lookDirection: 1,
        outColorSpace: 'ACEScg',
      }),
    );
    const lk = dto.component('ocio_look');
    expect(lk.exists()).toBe(true);
    expect(lk.prop('look')).toBe('shot_look');
    expect(lk.prop('direction')).toBe(1);
    expect(lk.prop('outColorSpace')).toBe('ACEScg');
  });

  it('CS-056: ocio_look component is included when lookDirection provided without look', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio', { lookDirection: 0 }));
    const lk = dto.component('ocio_look');
    expect(lk.exists()).toBe(true);
    expect(lk.prop('direction')).toBe(0);
  });

  it('CS-057: ocio_display component is omitted when display/view not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio'));
    expect(dto.hasComponent('ocio_display')).toBe(false);
  });

  it('CS-058: ocio_display component is included when display provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio', { display: 'sRGB', view: 'Film' }));
    const d = dto.component('ocio_display');
    expect(d.exists()).toBe(true);
    expect(d.prop('display')).toBe('sRGB');
    expect(d.prop('view')).toBe('Film');
  });

  it('CS-059: inTransform component is omitted when url not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio'));
    expect(dto.hasComponent('inTransform')).toBe(false);
  });

  it('CS-060: inTransform component is included when url provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio', { inTransformUrl: '/path/to/lut.cube' }));
    const it_ = dto.component('inTransform');
    expect(it_.exists()).toBe(true);
    expect(it_.prop('url')).toBe('/path/to/lut.cube');
  });

  it('CS-061: outTransform component is omitted when url not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio'));
    expect(dto.hasComponent('outTransform')).toBe(false);
  });

  it('CS-062: outTransform component is included when url provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio', { outTransformUrl: '/path/to/out.cube' }));
    const ot = dto.component('outTransform');
    expect(ot.exists()).toBe(true);
    expect(ot.prop('url')).toBe('/path/to/out.cube');
  });

  it('CS-063: config component is omitted when no config settings provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio'));
    expect(dto.hasComponent('config')).toBe(false);
  });

  it('CS-064: config component is included with description and workingDir', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildOCIOObject('ocio', {
        configDescription: 'ACES 1.2',
        workingDir: '/show/config',
      }),
    );
    const cfg = dto.component('config');
    expect(cfg.exists()).toBe(true);
    expect(cfg.prop('description')).toBe('ACES 1.2');
    expect(cfg.prop('workingDir')).toBe('/show/config');
  });

  it('CS-065: active=false sets ocio active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio', { active: false }));
    expect(dto.prop('ocio', 'active')).toBe(0);
  });

  it('CS-066: function property is included when provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio', { function: 'color' }));
    expect(dto.prop('ocio', 'function')).toBe('color');
  });

  it('CS-067: function property is omitted when not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio'));
    const o = dto.component('ocio');
    expect(o.hasProperty('function')).toBe(false);
  });

  it('CS-068: inColorSpace is included when provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio', { inColorSpace: 'ACEScg' }));
    expect(dto.prop('ocio', 'inColorSpace')).toBe('ACEScg');
  });

  it('CS-069: lut3DSize is included when provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio', { lut3DSize: 64 }));
    expect(dto.prop('ocio', 'lut3DSize')).toBe(64);
  });

  it('CS-070: dither=true sets dither to 1', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio', { dither: true }));
    expect(dto.prop('color', 'dither')).toBe(1);
  });

  it('CS-071: custom channelOrder is applied', () => {
    const dto = new ObjectDTO(ColorSerializer.buildOCIOObject('ocio', { channelOrder: 'BGRA' }));
    expect(dto.prop('color', 'channelOrder')).toBe('BGRA');
  });

  it('CS-072: full OCIO settings produce all components', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildOCIOObject('ocio', {
        function: 'color',
        active: true,
        inColorSpace: 'Linear',
        outColorSpace: 'sRGB',
        lut3DSize: 32,
        look: 'my_look',
        lookDirection: 0,
        display: 'ACES',
        view: 'Rec.709',
        dither: true,
        channelOrder: 'RGBA',
        inTransformUrl: '/in.lut',
        outTransformUrl: '/out.lut',
        configDescription: 'Studio Config',
        workingDir: '/studio',
      }),
    );
    expect(dto.hasComponent('ocio')).toBe(true);
    expect(dto.hasComponent('ocio_color')).toBe(true);
    expect(dto.hasComponent('ocio_look')).toBe(true);
    expect(dto.hasComponent('ocio_display')).toBe(true);
    expect(dto.hasComponent('color')).toBe(true);
    expect(dto.hasComponent('inTransform')).toBe(true);
    expect(dto.hasComponent('outTransform')).toBe(true);
    expect(dto.hasComponent('config')).toBe(true);
  });
});

// ===========================================================================
// buildICCObject
// ===========================================================================
describe('ColorSerializer.buildICCObject', () => {
  it('CS-073: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildICCObject('icc'));
    expect(dto.name).toBe('icc');
    expect(dto.protocol).toBe('RVICCTransform');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-074: has node component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildICCObject('icc'));
    const n = dto.component('node');
    expect(n.exists()).toBe(true);
    expect(n.prop('active')).toBe(1);
    expect(n.prop('samples2D')).toBe(256);
    expect(n.prop('samples3D')).toBe(32);
  });

  it('CS-075: applies custom ICC settings', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildICCObject('icc', {
        samples2D: 512,
        samples3D: 64,
      }),
    );
    const n = dto.component('node');
    expect(n.prop('samples2D')).toBe(512);
    expect(n.prop('samples3D')).toBe(64);
  });

  it('CS-076: inProfile component is omitted when not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildICCObject('icc'));
    expect(dto.hasComponent('inProfile')).toBe(false);
  });

  it('CS-077: inProfile component is included when url provided', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildICCObject('icc', {
        inProfileUrl: '/profiles/sRGB.icc',
        inProfileDescription: 'sRGB IEC61966-2.1',
      }),
    );
    const ip = dto.component('inProfile');
    expect(ip.exists()).toBe(true);
    expect(ip.prop('url')).toBe('/profiles/sRGB.icc');
    expect(ip.prop('description')).toBe('sRGB IEC61966-2.1');
  });

  it('CS-078: outProfile component is omitted when not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildICCObject('icc'));
    expect(dto.hasComponent('outProfile')).toBe(false);
  });

  it('CS-079: outProfile component is included when url provided', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildICCObject('icc', {
        outProfileUrl: '/profiles/AdobeRGB.icc',
        outProfileDescription: 'Adobe RGB (1998)',
      }),
    );
    const op = dto.component('outProfile');
    expect(op.exists()).toBe(true);
    expect(op.prop('url')).toBe('/profiles/AdobeRGB.icc');
    expect(op.prop('description')).toBe('Adobe RGB (1998)');
  });

  it('CS-080: active=false sets active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildICCObject('icc', { active: false }));
    expect(dto.prop('node', 'active')).toBe(0);
  });

  it('CS-081: inProfile with only description (no url)', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildICCObject('icc', {
        inProfileDescription: 'Test Profile',
      }),
    );
    const ip = dto.component('inProfile');
    expect(ip.exists()).toBe(true);
    expect(ip.hasProperty('url')).toBe(false);
    expect(ip.prop('description')).toBe('Test Profile');
  });
});

// ===========================================================================
// buildLinearizeObject
// ===========================================================================
describe('ColorSerializer.buildLinearizeObject', () => {
  it('CS-082: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildLinearizeObject('lin'));
    expect(dto.name).toBe('lin');
    expect(dto.protocol).toBe('RVLinearize');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-083: has node component with active=1 by default', () => {
    const dto = new ObjectDTO(ColorSerializer.buildLinearizeObject('lin'));
    expect(dto.prop('node', 'active')).toBe(1);
  });

  it('CS-084: has color component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildLinearizeObject('lin'));
    const c = dto.component('color');
    expect(c.exists()).toBe(true);
    expect(c.prop('active')).toBe(1);
    expect(c.prop('lut')).toBe('');
    expect(c.prop('alphaType')).toBe(0);
    expect(c.prop('logtype')).toBe(0);
    expect(c.prop('YUV')).toBe(0);
    expect(c.prop('invert')).toBe(0);
    expect(c.prop('sRGB2linear')).toBe(0);
    expect(c.prop('Rec709ToLinear')).toBe(0);
    expect(c.prop('fileGamma')).toBe(1.0);
    expect(c.prop('ignoreChromaticities')).toBe(0);
  });

  it('CS-085: has cineon component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildLinearizeObject('lin'));
    const cin = dto.component('cineon');
    expect(cin.exists()).toBe(true);
    expect(cin.prop('whiteCodeValue')).toBe(685);
    expect(cin.prop('blackCodeValue')).toBe(95);
    expect(cin.prop('breakPointValue')).toBe(685);
  });

  it('CS-086: has lut component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildLinearizeObject('lin'));
    const l = dto.component('lut');
    expect(l.exists()).toBe(true);
    expect(l.prop('active')).toBe(0);
    expect(l.prop('file')).toBe('');
    expect(l.prop('name')).toBe('');
    expect(l.prop('type')).toBe('Luminance');
    expect(l.prop('scale')).toBe(1.0);
    expect(l.prop('offset')).toBe(0.0);
    expect(l.property('size').data).toEqual([0, 0, 0]);
  });

  it('CS-087: applies custom color settings', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildLinearizeObject('lin', {
        colorActive: false,
        lut: 'my_lut',
        alphaType: 1,
        logtype: 1,
        yuv: true,
        invert: true,
        sRGB2linear: true,
        rec709ToLinear: true,
        fileGamma: 2.2,
        ignoreChromaticities: true,
      }),
    );
    const c = dto.component('color');
    expect(c.prop('active')).toBe(0);
    expect(c.prop('lut')).toBe('my_lut');
    expect(c.prop('alphaType')).toBe(1);
    expect(c.prop('logtype')).toBe(1);
    expect(c.prop('YUV')).toBe(1);
    expect(c.prop('invert')).toBe(1);
    expect(c.prop('sRGB2linear')).toBe(1);
    expect(c.prop('Rec709ToLinear')).toBe(1);
    expect(c.prop('fileGamma')).toBe(2.2);
    expect(c.prop('ignoreChromaticities')).toBe(1);
  });

  it('CS-088: applies custom cineon settings', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildLinearizeObject('lin', {
        cineon: {
          whiteCodeValue: 700,
          blackCodeValue: 100,
          breakPointValue: 690,
        },
      }),
    );
    const cin = dto.component('cineon');
    expect(cin.prop('whiteCodeValue')).toBe(700);
    expect(cin.prop('blackCodeValue')).toBe(100);
    expect(cin.prop('breakPointValue')).toBe(690);
  });

  it('CS-089: applies custom LUT settings', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildLinearizeObject('lin', {
        lutSettings: {
          active: true,
          file: '/path/to/lut.3dl',
          name: 'MyLUT',
          type: 'RGB',
          scale: 2.0,
          offset: 0.5,
          size: [32, 32, 32],
        },
      }),
    );
    const l = dto.component('lut');
    expect(l.prop('active')).toBe(1);
    expect(l.prop('file')).toBe('/path/to/lut.3dl');
    expect(l.prop('name')).toBe('MyLUT');
    expect(l.prop('type')).toBe('RGB');
    expect(l.prop('scale')).toBe(2.0);
    expect(l.prop('offset')).toBe(0.5);
    expect(l.property('size').data).toEqual([32, 32, 32]);
  });

  it('CS-090: CDL component is omitted when not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildLinearizeObject('lin'));
    expect(dto.hasComponent('CDL')).toBe(false);
  });

  it('CS-091: CDL component is included when provided', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildLinearizeObject('lin', {
        cdl: {
          active: true,
          slope: [1.1, 1.0, 0.9],
          offset: [0.01, 0.0, -0.01],
          power: [1.0, 1.1, 1.2],
          saturation: 0.8,
          noClamp: true,
        },
      }),
    );
    const cdl = dto.component('CDL');
    expect(cdl.exists()).toBe(true);
    expect(cdl.prop('active')).toBe(1);
    expect(cdl.prop('saturation')).toBe(0.8);
    expect(cdl.prop('noClamp')).toBe(1);
  });

  it('CS-092: CDL component defaults when partially provided', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildLinearizeObject('lin', {
        cdl: {},
      }),
    );
    const cdl = dto.component('CDL');
    expect(cdl.exists()).toBe(true);
    expect(cdl.prop('active')).toBe(0);
    expect(cdl.prop('saturation')).toBe(1.0);
    expect(cdl.prop('noClamp')).toBe(0);
  });

  it('CS-093: active=false sets node active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildLinearizeObject('lin', { active: false }));
    expect(dto.prop('node', 'active')).toBe(0);
  });
});

// ===========================================================================
// buildLookLUTObject
// ===========================================================================
describe('ColorSerializer.buildLookLUTObject', () => {
  it('CS-094: returns correct name and protocol with defaults (RVLookLUT)', () => {
    const dto = new ObjectDTO(ColorSerializer.buildLookLUTObject('llut'));
    expect(dto.name).toBe('llut');
    expect(dto.protocol).toBe('RVLookLUT');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-095: uses RVCacheLUT protocol when specified', () => {
    const dto = new ObjectDTO(ColorSerializer.buildLookLUTObject('clut', {}, 'RVCacheLUT'));
    expect(dto.protocol).toBe('RVCacheLUT');
  });

  it('CS-096: has node and lut components with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildLookLUTObject('llut'));
    const n = dto.component('node');
    expect(n.exists()).toBe(true);
    expect(n.prop('active')).toBe(1);

    const l = dto.component('lut');
    expect(l.exists()).toBe(true);
    expect(l.prop('active')).toBe(0);
    expect(l.prop('file')).toBe('');
    expect(l.prop('name')).toBe('');
    expect(l.prop('type')).toBe('Luminance');
    expect(l.prop('scale')).toBe(1.0);
    expect(l.prop('offset')).toBe(0.0);
    expect(l.prop('conditioningGamma')).toBe(1.0);
    expect(l.property('size').data).toEqual([0, 0, 0]);
    expect(l.prop('preLUTSize')).toBe(0);
  });

  it('CS-097: applies custom LUT settings', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildLookLUTObject('llut', {
        lutActive: true,
        file: '/path/to/lut.cube',
        name: 'TestLUT',
        type: '3D',
        scale: 1.5,
        offset: 0.1,
        conditioningGamma: 2.2,
        size: [33, 33, 33],
        preLUTSize: 1024,
      }),
    );
    const l = dto.component('lut');
    expect(l.prop('active')).toBe(1);
    expect(l.prop('file')).toBe('/path/to/lut.cube');
    expect(l.prop('name')).toBe('TestLUT');
    expect(l.prop('type')).toBe('3D');
    expect(l.prop('scale')).toBe(1.5);
    expect(l.prop('offset')).toBe(0.1);
    expect(l.prop('conditioningGamma')).toBe(2.2);
    expect(l.property('size').data).toEqual([33, 33, 33]);
    expect(l.prop('preLUTSize')).toBe(1024);
  });

  it('CS-098: active=false sets node active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildLookLUTObject('llut', { active: false }));
    expect(dto.prop('node', 'active')).toBe(0);
  });

  it('CS-099: inMatrix and outMatrix are omitted when not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildLookLUTObject('llut'));
    const l = dto.component('lut');
    expect(l.hasProperty('inMatrix')).toBe(false);
    expect(l.hasProperty('outMatrix')).toBe(false);
  });

  it('CS-100: inMatrix is flattened and included when provided', () => {
    const matrix = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    const dto = new ObjectDTO(ColorSerializer.buildLookLUTObject('llut', { inMatrix: matrix }));
    const l = dto.component('lut');
    expect(l.hasProperty('inMatrix')).toBe(true);
    expect(l.property('inMatrix').data).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('CS-101: lut:output component is included for RVCacheLUT with data', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildLookLUTObject(
        'clut',
        {
          lutData: [0.1, 0.2, 0.3],
          prelutData: [0.5, 0.6],
        },
        'RVCacheLUT',
      ),
    );
    const output = dto.component('lut:output');
    expect(output.exists()).toBe(true);
    expect(output.property('lut').data).toEqual([0.1, 0.2, 0.3]);
    expect(output.property('prelut').data).toEqual([0.5, 0.6]);
  });

  it('CS-102: lut:output component is omitted for RVLookLUT even with data', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildLookLUTObject(
        'llut',
        {
          lutData: [0.1, 0.2, 0.3],
        },
        'RVLookLUT',
      ),
    );
    expect(dto.hasComponent('lut:output')).toBe(false);
  });

  it('CS-103: lut:output component is omitted for RVCacheLUT without data', () => {
    const dto = new ObjectDTO(ColorSerializer.buildLookLUTObject('clut', {}, 'RVCacheLUT'));
    expect(dto.hasComponent('lut:output')).toBe(false);
  });
});

// ===========================================================================
// buildColorObject
// ===========================================================================
describe('ColorSerializer.buildColorObject', () => {
  it('CS-104: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorObject('color'));
    expect(dto.name).toBe('color');
    expect(dto.protocol).toBe('RVColor');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-105: has color component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorObject('color'));
    const c = dto.component('color');
    expect(c.exists()).toBe(true);
    expect(c.prop('active')).toBe(1);
    expect(c.prop('invert')).toBe(0);
    expect(c.property('gamma').data).toEqual([1, 1, 1]);
    expect(c.prop('lut')).toBe('default');
    expect(c.property('offset').data).toEqual([0, 0, 0]);
    expect(c.property('scale').data).toEqual([1, 1, 1]);
    expect(c.property('exposure').data).toEqual([0, 0, 0]);
    expect(c.property('contrast').data).toEqual([0, 0, 0]);
    expect(c.prop('saturation')).toBe(1.0);
    expect(c.prop('normalize')).toBe(0);
    expect(c.prop('hue')).toBe(0.0);
    expect(c.prop('unpremult')).toBe(0);
  });

  it('CS-106: applies custom color settings with single values (expanded to arrays)', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildColorObject('color', {
        gamma: 2.2,
        offset: 0.1,
        exposure: 1.5,
        contrast: 0.5,
      }),
    );
    const c = dto.component('color');
    expect(c.property('gamma').data).toEqual([2.2, 2.2, 2.2]);
    expect(c.property('offset').data).toEqual([0.1, 0.1, 0.1]);
    expect(c.property('exposure').data).toEqual([1.5, 1.5, 1.5]);
    expect(c.property('contrast').data).toEqual([0.5, 0.5, 0.5]);
  });

  it('CS-107: applies custom color settings with array values', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildColorObject('color', {
        gamma: [1.0, 1.5, 2.0],
        offset: [0.1, 0.2, 0.3],
        exposure: [1.0, 2.0, 3.0],
        contrast: [0.1, 0.2, 0.3],
        scale: [0.9, 1.0, 1.1],
      }),
    );
    const c = dto.component('color');
    expect(c.property('gamma').data).toEqual([1.0, 1.5, 2.0]);
    expect(c.property('offset').data).toEqual([0.1, 0.2, 0.3]);
    expect(c.property('exposure').data).toEqual([1.0, 2.0, 3.0]);
    expect(c.property('contrast').data).toEqual([0.1, 0.2, 0.3]);
    expect(c.property('scale').data).toEqual([0.9, 1.0, 1.1]);
  });

  it('CS-108: applies boolean flags', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildColorObject('color', {
        invert: true,
        normalize: true,
        unpremult: true,
      }),
    );
    const c = dto.component('color');
    expect(c.prop('invert')).toBe(1);
    expect(c.prop('normalize')).toBe(1);
    expect(c.prop('unpremult')).toBe(1);
  });

  it('CS-109: applies saturation and hue', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildColorObject('color', {
        saturation: 1.5,
        hue: 45.0,
        lut: 'my_lut',
      }),
    );
    const c = dto.component('color');
    expect(c.prop('saturation')).toBe(1.5);
    expect(c.prop('hue')).toBe(45.0);
    expect(c.prop('lut')).toBe('my_lut');
  });

  it('CS-110: CDL component is omitted when not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorObject('color'));
    expect(dto.hasComponent('CDL')).toBe(false);
  });

  it('CS-111: CDL component is included when provided', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildColorObject('color', {
        cdl: {
          active: true,
          colorspace: 'aces',
          slope: [1.1, 1.0, 0.9],
          offset: [0.01, 0.0, -0.01],
          power: [1.0, 1.1, 1.2],
          saturation: 0.8,
          noClamp: true,
        },
      }),
    );
    const cdl = dto.component('CDL');
    expect(cdl.exists()).toBe(true);
    expect(cdl.prop('active')).toBe(1);
    expect(cdl.prop('colorspace')).toBe('aces');
    expect(cdl.property('slope').data).toEqual([1.1, 1.0, 0.9]);
    expect(cdl.property('offset').data).toEqual([0.01, 0.0, -0.01]);
    expect(cdl.property('power').data).toEqual([1.0, 1.1, 1.2]);
    expect(cdl.prop('saturation')).toBe(0.8);
    expect(cdl.prop('noClamp')).toBe(1);
  });

  it('CS-112: CDL defaults use active !== false pattern', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildColorObject('color', {
        cdl: {},
      }),
    );
    const cdl = dto.component('CDL');
    expect(cdl.prop('active')).toBe(1);
    expect(cdl.prop('colorspace')).toBe('rec709');
    expect(cdl.property('slope').data).toEqual([1, 1, 1]);
    expect(cdl.property('offset').data).toEqual([0, 0, 0]);
    expect(cdl.property('power').data).toEqual([1, 1, 1]);
    expect(cdl.prop('saturation')).toBe(1.0);
    expect(cdl.prop('noClamp')).toBe(0);
  });

  it('CS-113: luminanceLUT component is omitted when not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorObject('color'));
    expect(dto.hasComponent('luminanceLUT')).toBe(false);
  });

  it('CS-114: luminanceLUT component is included when provided', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildColorObject('color', {
        luminanceLUT: {
          active: true,
          lut: [0.0, 0.5, 1.0],
          max: 2.0,
          size: 256,
          name: 'test_lut',
        },
      }),
    );
    const lum = dto.component('luminanceLUT');
    expect(lum.exists()).toBe(true);
    expect(lum.prop('active')).toBe(1);
    expect(lum.property('lut').data).toEqual([0.0, 0.5, 1.0]);
    expect(lum.prop('max')).toBe(2.0);
    expect(lum.prop('size')).toBe(256);
    expect(lum.prop('name')).toBe('test_lut');
  });

  it('CS-115: luminanceLUT defaults when partially provided', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildColorObject('color', {
        luminanceLUT: {},
      }),
    );
    const lum = dto.component('luminanceLUT');
    expect(lum.prop('active')).toBe(0);
    expect(lum.property('lut').data).toEqual([]);
    expect(lum.prop('max')).toBe(1.0);
    expect(lum.prop('size')).toBe(0);
    expect(lum.prop('name')).toBe('');
  });

  it('CS-116: outputMatrix component is omitted when not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorObject('color'));
    expect(dto.hasComponent('matrix:output')).toBe(false);
  });

  it('CS-117: outputMatrix component is included with 2D array (flattened)', () => {
    const matrix = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    const dto = new ObjectDTO(ColorSerializer.buildColorObject('color', { outputMatrix: matrix }));
    const m = dto.component('matrix:output');
    expect(m.exists()).toBe(true);
    expect(m.property('RGBA').data).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('CS-118: outputMatrix component is included with flat array', () => {
    const flat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const dto = new ObjectDTO(ColorSerializer.buildColorObject('color', { outputMatrix: flat }));
    const m = dto.component('matrix:output');
    expect(m.exists()).toBe(true);
    expect(m.property('RGBA').data).toEqual(flat);
  });

  it('CS-119: active=false sets color active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorObject('color', { active: false }));
    expect(dto.prop('color', 'active')).toBe(0);
  });
});

// ===========================================================================
// buildDisplayColorObject
// ===========================================================================
describe('ColorSerializer.buildDisplayColorObject', () => {
  it('CS-120: returns correct name and protocol with defaults', () => {
    const dto = new ObjectDTO(ColorSerializer.buildDisplayColorObject('disp'));
    expect(dto.name).toBe('disp');
    expect(dto.protocol).toBe('RVDisplayColor');
    expect(dto.protocolVersion).toBe(1);
  });

  it('CS-121: has color component with default values', () => {
    const dto = new ObjectDTO(ColorSerializer.buildDisplayColorObject('disp'));
    const c = dto.component('color');
    expect(c.exists()).toBe(true);
    expect(c.prop('active')).toBe(1);
    expect(c.prop('channelOrder')).toBe('RGBA');
    expect(c.prop('channelFlood')).toBe(0);
    expect(c.prop('premult')).toBe(0);
    expect(c.prop('gamma')).toBe(1.0);
    expect(c.prop('sRGB')).toBe(0);
    expect(c.prop('Rec709')).toBe(0);
    expect(c.prop('brightness')).toBe(0.0);
    expect(c.prop('outOfRange')).toBe(0);
    expect(c.prop('dither')).toBe(0);
    expect(c.prop('ditherLast')).toBe(1);
  });

  it('CS-122: applies custom display color settings', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildDisplayColorObject('disp', {
        channelOrder: 'BGRA',
        channelFlood: 1,
        premult: true,
        gamma: 2.2,
        sRGB: true,
        Rec709: true,
        brightness: 0.5,
        outOfRange: 1,
        dither: 2,
        ditherLast: false,
      }),
    );
    const c = dto.component('color');
    expect(c.prop('channelOrder')).toBe('BGRA');
    expect(c.prop('channelFlood')).toBe(1);
    expect(c.prop('premult')).toBe(1);
    expect(c.prop('gamma')).toBe(2.2);
    expect(c.prop('sRGB')).toBe(1);
    expect(c.prop('Rec709')).toBe(1);
    expect(c.prop('brightness')).toBe(0.5);
    expect(c.prop('outOfRange')).toBe(1);
    expect(c.prop('dither')).toBe(2);
    expect(c.prop('ditherLast')).toBe(0);
  });

  it('CS-123: matrix is omitted when not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildDisplayColorObject('disp'));
    const c = dto.component('color');
    expect(c.hasProperty('matrix')).toBe(false);
  });

  it('CS-124: matrix is included and flattened when provided', () => {
    const matrix = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    const dto = new ObjectDTO(ColorSerializer.buildDisplayColorObject('disp', { matrix }));
    const c = dto.component('color');
    expect(c.property('matrix').data).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('CS-125: overrideColorspace is omitted when not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildDisplayColorObject('disp'));
    const c = dto.component('color');
    expect(c.hasProperty('overrideColorspace')).toBe(false);
  });

  it('CS-126: overrideColorspace is included when provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildDisplayColorObject('disp', { overrideColorspace: 'linear' }));
    const c = dto.component('color');
    expect(c.prop('overrideColorspace')).toBe('linear');
  });

  it('CS-127: chromaticities component is omitted when not provided', () => {
    const dto = new ObjectDTO(ColorSerializer.buildDisplayColorObject('disp'));
    expect(dto.hasComponent('chromaticities')).toBe(false);
  });

  it('CS-128: chromaticities component is included when provided', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildDisplayColorObject('disp', {
        chromaticities: {
          active: true,
          adoptedNeutral: true,
          white: [0.3127, 0.329],
          red: [0.64, 0.33],
          green: [0.3, 0.6],
          blue: [0.15, 0.06],
          neutral: [0.3127, 0.329],
        },
      }),
    );
    const ch = dto.component('chromaticities');
    expect(ch.exists()).toBe(true);
    expect(ch.prop('active')).toBe(1);
    expect(ch.prop('adoptedNeutral')).toBe(1);
    expect(ch.property('white').data).toEqual([[0.3127, 0.329]]);
    expect(ch.property('red').data).toEqual([[0.64, 0.33]]);
    expect(ch.property('green').data).toEqual([[0.3, 0.6]]);
    expect(ch.property('blue').data).toEqual([[0.15, 0.06]]);
    expect(ch.property('neutral').data).toEqual([[0.3127, 0.329]]);
  });

  it('CS-129: chromaticities defaults when partially provided', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildDisplayColorObject('disp', {
        chromaticities: {},
      }),
    );
    const ch = dto.component('chromaticities');
    expect(ch.prop('active')).toBe(0);
    expect(ch.prop('adoptedNeutral')).toBe(1);
    expect(ch.property('white').data).toEqual([[0.3127, 0.329]]);
    expect(ch.property('red').data).toEqual([[0.64, 0.33]]);
    expect(ch.property('green').data).toEqual([[0.3, 0.6]]);
    expect(ch.property('blue').data).toEqual([[0.15, 0.06]]);
    expect(ch.property('neutral').data).toEqual([[0.3127, 0.329]]);
  });

  it('CS-130: chromaticities adoptedNeutral=false sets to 0', () => {
    const dto = new ObjectDTO(
      ColorSerializer.buildDisplayColorObject('disp', {
        chromaticities: { adoptedNeutral: false },
      }),
    );
    expect(dto.prop('chromaticities', 'adoptedNeutral')).toBe(0);
  });

  it('CS-131: active=false sets color active to 0', () => {
    const dto = new ObjectDTO(ColorSerializer.buildDisplayColorObject('disp', { active: false }));
    expect(dto.prop('color', 'active')).toBe(0);
  });
});

// ===========================================================================
// Cross-cutting / edge-case tests
// ===========================================================================
describe('ColorSerializer cross-cutting tests', () => {
  it('CS-132: each method returns a standalone ObjectData (not shared state)', () => {
    const a = new ObjectDTO(ColorSerializer.buildColorExposureObject('a', { exposure: 1.0 }));
    const b = new ObjectDTO(ColorSerializer.buildColorExposureObject('b', { exposure: 2.0 }));
    expect(a.name).toBe('a');
    expect(b.name).toBe('b');
    expect(a.prop('color', 'exposure')).toBe(1.0);
    expect(b.prop('color', 'exposure')).toBe(2.0);
  });

  it('CS-133: object names with special characters are preserved', () => {
    const dto = new ObjectDTO(ColorSerializer.buildColorExposureObject('source_group000000_exposure'));
    expect(dto.name).toBe('source_group000000_exposure');
  });

  it('CS-134: active=undefined defaults to 1 for methods using active !== false', () => {
    const exp = new ObjectDTO(ColorSerializer.buildColorExposureObject('e', {}));
    expect(exp.prop('color', 'active')).toBe(1);

    const curve = new ObjectDTO(ColorSerializer.buildColorCurveObject('c', {}));
    expect(curve.prop('color', 'active')).toBe(1);

    const temp = new ObjectDTO(ColorSerializer.buildColorTemperatureObject('t', {}));
    expect(temp.prop('color', 'active')).toBe(1);

    const sat = new ObjectDTO(ColorSerializer.buildColorSaturationObject('s', {}));
    expect(sat.prop('color', 'active')).toBe(1);

    const cdl = new ObjectDTO(ColorSerializer.buildColorCDLObject('d', {}));
    expect(cdl.prop('node', 'active')).toBe(1);

    const lin2s = new ObjectDTO(ColorSerializer.buildColorLinearToSRGBObject('l', {}));
    expect(lin2s.prop('node', 'active')).toBe(1);

    const s2lin = new ObjectDTO(ColorSerializer.buildColorSRGBToLinearObject('s', {}));
    expect(s2lin.prop('node', 'active')).toBe(1);

    const prim = new ObjectDTO(ColorSerializer.buildPrimaryConvertObject('p', {}));
    expect(prim.prop('node', 'active')).toBe(1);

    const ocio = new ObjectDTO(ColorSerializer.buildOCIOObject('o', {}));
    expect(ocio.prop('ocio', 'active')).toBe(1);

    const icc = new ObjectDTO(ColorSerializer.buildICCObject('i', {}));
    expect(icc.prop('node', 'active')).toBe(1);

    const lin = new ObjectDTO(ColorSerializer.buildLinearizeObject('l', {}));
    expect(lin.prop('node', 'active')).toBe(1);

    const llut = new ObjectDTO(ColorSerializer.buildLookLUTObject('l', {}));
    expect(llut.prop('node', 'active')).toBe(1);

    const col = new ObjectDTO(ColorSerializer.buildColorObject('c', {}));
    expect(col.prop('color', 'active')).toBe(1);

    const disp = new ObjectDTO(ColorSerializer.buildDisplayColorObject('d', {}));
    expect(disp.prop('color', 'active')).toBe(1);
  });

  it('CS-135: GrayScale uses active ? 1 : 0 (undefined defaults to 0)', () => {
    const gray = new ObjectDTO(ColorSerializer.buildColorGrayScaleObject('g', {}));
    expect(gray.prop('node', 'active')).toBe(0);
  });

  it('CS-136: all methods accept empty settings object', () => {
    expect(() => ColorSerializer.buildColorExposureObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildColorCurveObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildColorTemperatureObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildColorSaturationObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildColorVibranceObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildColorShadowObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildColorHighlightObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildColorGrayScaleObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildColorCDLObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildColorLinearToSRGBObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildColorSRGBToLinearObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildPrimaryConvertObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildOCIOObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildICCObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildLinearizeObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildLookLUTObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildColorObject('a', {})).not.toThrow();
    expect(() => ColorSerializer.buildDisplayColorObject('a', {})).not.toThrow();
  });

  it('CS-137: all methods work with no settings argument', () => {
    expect(() => ColorSerializer.buildColorExposureObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildColorCurveObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildColorTemperatureObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildColorSaturationObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildColorVibranceObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildColorShadowObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildColorHighlightObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildColorGrayScaleObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildColorCDLObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildColorLinearToSRGBObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildColorSRGBToLinearObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildPrimaryConvertObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildOCIOObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildICCObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildLinearizeObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildLookLUTObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildColorObject('a')).not.toThrow();
    expect(() => ColorSerializer.buildDisplayColorObject('a')).not.toThrow();
  });
});
