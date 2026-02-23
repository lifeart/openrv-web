import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Session } from './Session';

const createMockDTO = (protocols: any) => {
  const mockObj = (data: any): any => ({
    exists: () => data !== undefined,
    property: (name: string) => ({
      value: () => data?.[name],
      exists: () => data && name in data
    }),
    component: (name: string) => mockObj(data?.[name]),
    name: 'mock',
    components: () => Object.entries(data || {}).map(([name, val]) => ({ name, ...mockObj(val) }))
  });

  return {
    byProtocol: (proto: string) => {
      const list = protocols[proto] || [];
      const results = list.map(mockObj);
      (results as any).first = () => results[0] || mockObj(undefined);
      return results;
    }
  } as any;
};

describe('Session', () => {
  let session: Session;

  beforeEach(() => {
    session = new Session();
  });

  describe('graph', () => {
    it('graph is null initially', () => {
      expect(session.graph).toBeNull();
      expect(session.graphParseResult).toBeNull();
    });
  });

  describe('loadFromGTO', () => {
    it('handles GTOa text format', async () => {
      // Minimal valid GTO text format
      const gtoText = 'GTOa 5\n\nRVSession : protocol\n{\n    session : component\n    {\n        int frame = 10\n    }\n}\n';
      const bytes = new TextEncoder().encode(gtoText);
      await expect(session.loadFromGTO(bytes.buffer)).resolves.not.toThrow();
    });

    it('throws error for invalid GTO', async () => {
      // SimpleReader inside gto-js might not throw but just log.
      // We force it to throw to test our catch block.
      const gtoJs = await import('gto-js');
      const openSpy = vi.spyOn(gtoJs.SimpleReader.prototype, 'open').mockImplementation(() => {
        throw new Error('Mock parse error');
      });

      try {
        await expect(session.loadFromGTO(new ArrayBuffer(10))).rejects.toThrow('Mock parse error');
      } finally {
        openSpy.mockRestore();
      }
    });

    it('handles text GTO input directly', async () => {
      const gtoText = 'GTOa 5\n\nRVSession : protocol\n{\n    session : component\n    {\n        int frame = 20\n    }\n}\n';
      await expect(session.loadFromGTO(gtoText)).resolves.not.toThrow();
    });
  });

  describe('GTO detailed parsing', () => {
    it('parseScopes handles all protocols', () => {
        const s = session as any;
        const testScope = (proto: string, key: string) => {
            const dto = createMockDTO({ [proto]: [{ node: { active: 1 } }] });
            const scopes = s.parseScopes(dto);
            expect(scopes[key]).toBe(true);
        };

        testScope('Histogram', 'histogram');
        testScope('RVHistogram', 'histogram');
        testScope('Waveform', 'waveform');
        testScope('RVWaveform', 'waveform');
        testScope('Vectorscope', 'vectorscope');
        testScope('RVVectorscope', 'vectorscope');

        expect(s.parseScopes(createMockDTO({}))).toBeNull();
    });

    it('parseInitialSettings handles various components', () => {
      const dto = createMockDTO({
        RVColor: [{ color: { exposure: 1.5, gamma: 2.2, contrast: 1.1, saturation: 0.9, offset: 0.1 }, CDL: { active: 1, slope: [1,1,1], offset: [0,0,0], power: [1,1,1], saturation: 1 } }],
        RVDisplayColor: [{ color: { brightness: 0.5, gamma: 2.4 } }],
        RVTransform2D: [{ transform: { active: 1, rotate: 180, flip: 1, flop: 1 } }],
        RVLensWarp: [{ node: { active: 1 }, warp: { k1: 0.2, k2: 0.1, center: [0.6, 0.6] } }],
        RVFormat: [{ crop: { active: 1, xmin: 10, ymin: 10, xmax: 90, ymax: 90 } }],
        ChannelSelect: [{ node: { active: 1 }, parameters: { channel: 0 } }],
        RVDisplayStereo: [{ stereo: { type: 'pair', swap: 1, relativeOffset: 0.05 } }],
        Histogram: [{ node: { active: 1 } }],
        Waveform: [{ node: { active: 0 } }],
      });

      const settings = (session as any).parseInitialSettings(dto, { width: 100, height: 100 });
      expect(settings.colorAdjustments.exposure).toBe(1.5);
      expect(settings.colorAdjustments.brightness).toBe(0.5);
      expect(settings.transform.rotation).toBe(180);
      expect(settings.transform.flipV).toBe(true);
      expect(settings.lens.k1).toBe(0.2);
      expect(settings.lens.centerX).toBeCloseTo(0.1);
      expect(settings.crop.enabled).toBe(true);
      expect(settings.channelMode).toBe('red');
      expect(settings.stereo.mode).toBe('side-by-side');
      expect(settings.scopes.histogram).toBe(true);
      expect(settings.scopes.waveform).toBe(false);
    });

    it('parseInitialSettings returns null if no settings', () => {
        const dto = createMockDTO({});
        expect((session as any).parseInitialSettings(dto, { width: 0, height: 0 })).toBeNull();
    });

    it('parsePaintAnnotations handles pen and text', () => {
        const dto = createMockDTO({
            RVPaint: [{
                'frame:1': { order: ['pen:1', 'text:1'] },
                'pen:1': { color: [1,0,0,1], width: 0.5, points: [0,0,1,1] },
                'text:1': { position: [0,0], text: 'hello' },
                paint: { ghost: 1, hold: 1 }
            }]
        });
        const emitSpy = vi.spyOn(session, 'emit');
        (session as any).parsePaintAnnotations(dto, 1);
        expect(emitSpy).toHaveBeenCalledWith('annotationsLoaded', expect.anything());
    });

    it('parsePaintTagEffects handles JSON and string tags', () => {
        const s = session as any;
        expect(s.parsePaintTagEffects('{"ghost": true}')).toEqual({ ghost: true });
        expect(s.parsePaintTagEffects('ghost:1, hold=0, ghostBefore:5')).toEqual({ ghost: true, hold: false, ghostBefore: 5 });
        expect(s.parsePaintTagEffects('ghost hold')).toEqual({ ghost: true, hold: true });
    });
  });

});
