import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionGTOExporter, type GTOProperty, type GTOComponent } from './SessionGTOExporter';
import { Session } from './Session';
import { PaintEngine } from '../../paint/PaintEngine';
import type { GTOData } from 'gto-js';
import { Graph } from '../graph/Graph';
import { LineJoin, LineCap, BrushType, StrokeMode, type PenStroke } from '../../paint/types';

class TestSession extends Session {
    public setMockGraph(g: Graph) {
        this._graph = g;
    }
    public setSources(s: any[]) {
        this.sources = s;
    }
}

describe('SessionGTOExporter', () => {
    let session: TestSession;
    let paintEngine: PaintEngine;

    beforeEach(() => {
        session = new TestSession();
        session.setSources([{ 
            width: 1920, 
            height: 1080, 
            duration: 100, 
            fps: 24,
            type: 'image',
            name: 'test',
            url: 'test.png'
        }]);
        session.fps = 24;
        session.toggleMark(5);
        session.toggleMark(15);
        session.goToFrame(10);
        
        paintEngine = new PaintEngine();
    });

    it('updates original GTO data with preserved paths', () => {
        // Original GTO structure mimicking a loaded file
        const originalGTO: GTOData = {
            version: 4,
            objects: [
                {
                    name: 'sourceNode',
                    protocol: 'RVFileSource',
                    components: {
                        'media': {
                            name: 'media',
                            properties: [
                                { name: 'movie', value: '/old/path.mp4' } as any
                            ]
                        }
                    }
                },
                {
                    name: 'session',
                    protocol: 'RVSession',
                    components: {
                        'session': {
                            name: 'session',
                            properties: [
                                { name: 'frame', value: 1 } as any
                            ]
                        }
                    }
                }
            ]
        } as any;

        // Since Graph is hard to fully instantiate without DOM or complex mocks, 
        // we'll cast it safely or use a mock that implements the needed parts.
        const mockNode = {
            type: 'RVFileSource',
            properties: {
                getValue: vi.fn((key) => {
                    if (key === 'originalUrl') return '/new/preserved/path.mp4';
                    return undefined;
                })
            }
        } as any; // Still using any here because we are mocking a node property

        session.setMockGraph({
            getNode: vi.fn().mockReturnValue(mockNode),
            nodes: new Map()
        } as unknown as Graph);

        const updatedGTO = SessionGTOExporter.updateGTOData(originalGTO, session, paintEngine);

        // Check RVFileSource update
        const sourceObj = updatedGTO.objects.find(o => o.name === 'sourceNode');
        expect(sourceObj).toBeDefined();
        const components = (sourceObj?.components as unknown) as Record<string, any>;
        const mediaComp = components['media'];
        const movieProp = mediaComp?.properties.find((p: any) => p.name === 'movie');
        
        expect(movieProp?.value).toBe('/new/preserved/path.mp4');

        // Check RVSession update
        const sessionObj = updatedGTO.objects.find(o => o.protocol === 'RVSession');
        const sessionComp = sessionObj?.components?.['session'] as unknown as GTOComponent;
        const frameProp = sessionComp?.properties?.find((p: GTOProperty) => p.name === 'frame');
        
        expect(frameProp?.value).toBe(10); // Updated to currentFrame from session
    });

    it('exports pen stroke with specific join and cap styles', () => {
        const stroke: PenStroke = {
            type: 'pen',
            id: 'test-stroke',
            frame: 10,
            user: 'test-user',
            color: [1, 1, 1, 1],
            width: 5,
            brush: BrushType.Circle,
            points: [{ x: 0.1, y: 0.1 }],
            join: LineJoin.Bevel,
            cap: LineCap.Square,
            splat: false,
            mode: StrokeMode.Draw,
            startFrame: -1,
            duration: -1
        };
        paintEngine.addAnnotation(stroke);

        const gto = SessionGTOExporter.updateGTOData({ version: 4, objects: [] } as any, session, paintEngine);
        
        const paintObj = gto.objects.find(o => o.name === 'annotations');
        expect(paintObj).toBeDefined();

        const components = paintObj?.components as any;
        const penComp = components?.['pen:test-stroke:10:test-user'];
        expect(penComp).toBeDefined();

        const joinProp = penComp.properties.join;
        const capProp = penComp.properties.cap;

        // Based on SessionGTOExporter.ts mappings:
        // Bevel (1) -> 2
        // Square (1) -> 2
        expect(joinProp.data).toEqual([2]);
        expect(capProp.data).toEqual([2]);
    });
});
