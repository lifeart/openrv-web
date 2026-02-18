/**
 * Session GTO Settings Round Trip Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Session, type GTOViewSettings } from './Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { Viewer } from '../../ui/components/Viewer';
import { SessionSerializer } from './SessionSerializer';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../../ui/components/ColorControls';
import { DEFAULT_CDL } from '../../color/CDL';
import { DEFAULT_TRANSFORM } from '../../ui/components/TransformControl';
import { DEFAULT_CROP_STATE, DEFAULT_CROP_REGION } from '../../ui/components/CropControl';
import { DEFAULT_LENS_PARAMS } from '../../transform/LensDistortion';

vi.mock('../../color/WebGLLUT', () => ({
  WebGLLUTProcessor: vi.fn().mockImplementation(() => ({
    setLUT: vi.fn(),
    hasLUT: vi.fn().mockReturnValue(false),
    applyToCanvas: vi.fn(),
    dispose: vi.fn(),
  })),
}));

const GTO_TEXT = `GTOa (4)

rv : RVSession (4)
{
    session
    {
        string viewNode = "defaultSequence"
        int[2] range = [ [ 10 20 ] ]
        int[2] region = [ [ 11 19 ] ]
        float fps = 24
        int realtime = 0
        int currentFrame = 12
        int marks = [ 12 15 ]
    }
}

sourceNode : RVFileSource (1)
{
    proxy
    {
        int[2] size = [ [ 1000 500 ] ]
    }

    media
    {
        string movie = "file.mov"
    }
}

colorNode : RVColor (2)
{
    color
    {
        float exposure = 1.5
        float gamma = 2.2
        float contrast = 1.2
        float saturation = 0.8
        float offset = 0.1
    }

    CDL
    {
        int active = 1
        float[3] slope = [ [ 1.1 1.2 1.3 ] ]
        float[3] offset = [ [ 0.01 0.02 0.03 ] ]
        float[3] power = [ [ 1.05 1.1 1.15 ] ]
        float saturation = 0.9
    }
}

displayColorNode : RVDisplayColor (1)
{
    color
    {
        float brightness = 0.2
        float gamma = 1.8
    }
}

transformNode : RVTransform2D (1)
{
    transform
    {
        int flip = 1
        int flop = 1
        float rotate = 90
        int active = 1
    }
}

lensNode : RVLensWarp (1)
{
    node
    {
        int active = 1
    }

    warp
    {
        float k1 = 0.1
        float k2 = -0.05
        float[2] center = [ [ 0.6 0.4 ] ]
    }
}

formatNode : RVFormat (1)
{
    crop
    {
        int active = 1
        int xmin = 100
        int ymin = 50
        int xmax = 900
        int ymax = 450
    }
}

channelSelectNode : ChannelSelect (1)
{
    node
    {
        int active = 1
    }

    parameters
    {
        int channel = 2
    }
}

stereoNode : RVDisplayStereo (1)
{
    stereo
    {
        int swap = 1
        float relativeOffset = 0.1
        string type = "anaglyph"
    }
}

histNode : RVHistogram (1)
{
    node
    {
        int active = 1
    }
}
`;

describe('Session GTO settings round-trip', () => {
  let session: Session;
  let paintEngine: PaintEngine;
  let viewer: Viewer;

  beforeEach(() => {
    session = new Session();
    paintEngine = new PaintEngine();
    viewer = new Viewer({ session, paintEngine });
  });

  afterEach(() => {
    viewer.dispose();
  });

  it('SES-GTO-001: loads settings, applies updates, and serializes', async () => {
    let capturedSettings: GTOViewSettings | null = null;

    session.on('settingsLoaded', (settings) => {
      capturedSettings = settings;

      if (settings.colorAdjustments) {
        viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, ...settings.colorAdjustments });
      }
      if (settings.cdl) {
        viewer.setCDL(settings.cdl);
      }
      if (settings.transform) {
        viewer.setTransform(settings.transform);
      }
      if (settings.lens) {
        viewer.setLensParams(settings.lens);
      }
      if (settings.crop) {
        viewer.setCropState(settings.crop);
      }
      if (settings.channelMode) {
        viewer.setChannelMode(settings.channelMode);
      }
      if (settings.stereo) {
        viewer.setStereoState(settings.stereo);
      }
    });

    await session.loadFromGTO(GTO_TEXT);

    expect(capturedSettings).not.toBeNull();
    expect(session.currentFrame).toBe(12);
    expect(session.inPoint).toBe(11);
    expect(session.outPoint).toBe(19);
    expect(session.marks).toEqual(new Map([
      [12, { frame: 12, note: '', color: '#ff4444' }],
      [15, { frame: 15, note: '', color: '#ff4444' }],
    ]));

    expect(viewer.getColorAdjustments()).toEqual({
      ...DEFAULT_COLOR_ADJUSTMENTS,
      exposure: 1.5,
      gamma: 2.2,
      contrast: 1.2,
      saturation: 0.8,
      brightness: 0.2,
      offset: 0.1,
    });
    expect(viewer.getCDL()).toEqual({
      slope: { r: 1.1, g: 1.2, b: 1.3 },
      offset: { r: 0.01, g: 0.02, b: 0.03 },
      power: { r: 1.05, g: 1.1, b: 1.15 },
      saturation: 0.9,
    });
    expect(viewer.getTransform()).toEqual({
      rotation: 90,
      flipH: true,
      flipV: true,
      scale: { x: 1, y: 1 },
      translate: { x: 0, y: 0 },
    });
    const lensParams = viewer.getLensParams();
    expect(lensParams.k1).toBeCloseTo(0.1, 6);
    expect(lensParams.k2).toBeCloseTo(-0.05, 6);
    expect(lensParams.centerX).toBeCloseTo(0.1, 6);
    expect(lensParams.centerY).toBeCloseTo(-0.1, 6);
    expect(lensParams.scale).toBeCloseTo(1, 6);
    expect(viewer.getCropState()).toEqual({
      enabled: true,
      region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      aspectRatio: null,
    });
    expect(viewer.getChannelMode()).toBe('blue');
    expect(viewer.getStereoState()).toEqual({ mode: 'anaglyph', eyeSwap: true, offset: 10 });

    const updatedColor = {
      ...DEFAULT_COLOR_ADJUSTMENTS,
      exposure: 0.5,
      gamma: 1.4,
      contrast: 1.3,
      saturation: 1.1,
      brightness: -0.1,
    };
    viewer.setColorAdjustments(updatedColor);

    const updatedCDL = {
      ...DEFAULT_CDL,
      slope: { r: 1.2, g: 1.0, b: 0.9 },
      offset: { r: 0.02, g: 0.01, b: 0.0 },
      power: { r: 0.9, g: 1.05, b: 1.1 },
      saturation: 1.2,
    };
    viewer.setCDL(updatedCDL);

    const updatedTransform = { ...DEFAULT_TRANSFORM, rotation: 180 as const, flipH: true };
    viewer.setTransform(updatedTransform);

    const updatedLens = { ...DEFAULT_LENS_PARAMS, k1: -0.2, k2: 0.15, centerX: 0.05, centerY: 0.05, scale: 1.1 };
    viewer.setLensParams(updatedLens);

    const updatedCrop = {
      ...DEFAULT_CROP_STATE,
      enabled: true,
      region: { ...DEFAULT_CROP_REGION, x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
    };
    viewer.setCropState(updatedCrop);

    const serialized = SessionSerializer.toJSON({ session, paintEngine, viewer }, 'RoundTrip');

    expect(serialized.color).toEqual(updatedColor);
    expect(serialized.cdl).toEqual(updatedCDL);
    expect(serialized.transform).toEqual(updatedTransform);
    expect(serialized.lens).toEqual(updatedLens);
    expect(serialized.crop).toEqual(updatedCrop);
  });
});
