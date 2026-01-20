import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    SessionGTOExporter,
    generateSourceGroupName,
    type GTOProperty,
    type GTOComponent
} from './SessionGTOExporter';
import { Session, type MediaSource } from './Session';
import { PaintEngine } from '../../paint/PaintEngine';
import type { GTOData, ObjectData } from 'gto-js';
import { Graph } from '../graph/Graph';
import { LineJoin, LineCap, BrushType, StrokeMode, type PenStroke } from '../../paint/types';

class TestSession extends Session {
    public setMockGraph(g: Graph) {
        this._graph = g;
    }
    public setSources(s: MediaSource[]) {
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

describe('generateSourceGroupName', () => {
    it('generates zero-padded source group names', () => {
        expect(generateSourceGroupName(0)).toBe('sourceGroup000000');
        expect(generateSourceGroupName(1)).toBe('sourceGroup000001');
        expect(generateSourceGroupName(42)).toBe('sourceGroup000042');
        expect(generateSourceGroupName(999999)).toBe('sourceGroup999999');
    });
});

describe('SessionGTOExporter.buildConnectionObject', () => {
    it('creates connection object with proper structure', () => {
        const sourceGroups = ['sourceGroup000000', 'sourceGroup000001'];
        const viewNode = 'defaultSequence';

        const result = SessionGTOExporter.buildConnectionObject(sourceGroups, viewNode);

        expect(result.name).toBe('connections');
        expect(result.protocol).toBe('connection');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates correct lhs/rhs connections', () => {
        const sourceGroups = ['sourceGroup000000', 'sourceGroup000001'];
        const viewNode = 'defaultSequence';

        const result = SessionGTOExporter.buildConnectionObject(sourceGroups, viewNode);
        const components = result.components as Record<string, any>;

        const evalComp = components['evaluation'];
        expect(evalComp).toBeDefined();

        const lhsProp = evalComp.properties.lhs;
        const rhsProp = evalComp.properties.rhs;

        expect(lhsProp.data).toEqual(['sourceGroup000000', 'sourceGroup000001']);
        expect(rhsProp.data).toEqual(['defaultSequence', 'defaultSequence']);
    });

    it('creates top.nodes with view node', () => {
        const sourceGroups = ['sourceGroup000000'];
        const viewNode = 'defaultSequence';

        const result = SessionGTOExporter.buildConnectionObject(sourceGroups, viewNode);
        const components = result.components as Record<string, any>;

        const topComp = components['top'];
        expect(topComp).toBeDefined();

        const nodesProp = topComp.properties.nodes;
        expect(nodesProp.data).toEqual(['defaultSequence']);
    });

    it('handles empty source groups', () => {
        const result = SessionGTOExporter.buildConnectionObject([], 'defaultSequence');
        const components = result.components as Record<string, any>;

        const evalComp = components['evaluation'];
        expect(evalComp.properties.lhs.data).toEqual([]);
        expect(evalComp.properties.rhs.data).toEqual([]);
    });
});

describe('SessionGTOExporter.buildSourceGroupObjects', () => {
    const mockSource: MediaSource = {
        type: 'video',
        name: 'test_video',
        url: '/path/to/video.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24
    };

    it('creates RVSourceGroup and RVFileSource objects', () => {
        const objects = SessionGTOExporter.buildSourceGroupObjects(mockSource, 'sourceGroup000000');

        expect(objects).toHaveLength(2);
        expect(objects[0]?.protocol).toBe('RVSourceGroup');
        expect(objects[1]?.protocol).toBe('RVFileSource');
    });

    it('creates RVSourceGroup with correct name', () => {
        const objects = SessionGTOExporter.buildSourceGroupObjects(mockSource, 'sourceGroup000000');
        const group = objects[0]!;

        expect(group.name).toBe('sourceGroup000000');
        expect(group.protocolVersion).toBe(1);

        const components = group.components as Record<string, any>;
        const uiComp = components['ui'];
        expect(uiComp.properties.name.data).toEqual(['test_video']);
    });

    it('creates RVFileSource with media properties', () => {
        const objects = SessionGTOExporter.buildSourceGroupObjects(mockSource, 'sourceGroup000000');
        const source = objects[1]!;

        expect(source.name).toBe('sourceGroup000000_source');

        const components = source.components as Record<string, any>;
        const mediaComp = components['media'];

        expect(mediaComp.properties.movie.data).toEqual(['/path/to/video.mp4']);
        expect(mediaComp.properties.name.data).toEqual(['test_video']);
    });

    it('creates RVFileSource with group properties', () => {
        const objects = SessionGTOExporter.buildSourceGroupObjects(mockSource, 'sourceGroup000000');
        const source = objects[1]!;
        const components = source.components as Record<string, any>;
        const groupComp = components['group'];

        expect(groupComp.properties.fps.data).toEqual([24]);
        expect(groupComp.properties.volume.data).toEqual([1.0]);
        expect(groupComp.properties.audioOffset.data).toEqual([0.0]);
    });

    it('creates RVFileSource with cut properties', () => {
        const objects = SessionGTOExporter.buildSourceGroupObjects(mockSource, 'sourceGroup000000');
        const source = objects[1]!;
        const components = source.components as Record<string, any>;
        const cutComp = components['cut'];

        expect(cutComp.properties.in.data).toEqual([-2147483648]);
        expect(cutComp.properties.out.data).toEqual([2147483647]);
    });

    it('creates RVFileSource with proxy dimensions', () => {
        const objects = SessionGTOExporter.buildSourceGroupObjects(mockSource, 'sourceGroup000000');
        const source = objects[1]!;
        const components = source.components as Record<string, any>;
        const proxyComp = components['proxy'];

        expect(proxyComp).toBeDefined();
        expect(proxyComp.properties.size.data).toEqual([[1920, 1080]]);
    });

    it('uses RVImageSource protocol for image type', () => {
        const imageSource: MediaSource = {
            ...mockSource,
            type: 'image'
        };
        const objects = SessionGTOExporter.buildSourceGroupObjects(imageSource, 'sourceGroup000000');

        expect(objects[1]?.protocol).toBe('RVImageSource');
    });

    it('omits proxy component when dimensions are zero', () => {
        const sourceWithoutDimensions: MediaSource = {
            ...mockSource,
            width: 0,
            height: 0
        };
        const objects = SessionGTOExporter.buildSourceGroupObjects(sourceWithoutDimensions, 'sourceGroup000000');
        const source = objects[1]!;
        const components = source.components as Record<string, any>;

        expect(components['proxy']).toBeUndefined();
    });
});

describe('SessionGTOExporter.buildSequenceGroupObjects', () => {
    let session: TestSession;

    beforeEach(() => {
        session = new TestSession();
        session.setSources([{
            type: 'video' as const,
            name: 'test',
            url: 'test.mp4',
            width: 1920,
            height: 1080,
            duration: 100,
            fps: 24
        }]);
        session.fps = 30;
    });

    it('creates RVSequenceGroup and RVSequence objects', () => {
        const objects = SessionGTOExporter.buildSequenceGroupObjects('defaultSequence', session);

        expect(objects).toHaveLength(2);
        expect(objects[0]?.protocol).toBe('RVSequenceGroup');
        expect(objects[1]?.protocol).toBe('RVSequence');
    });

    it('creates RVSequenceGroup with correct structure', () => {
        const objects = SessionGTOExporter.buildSequenceGroupObjects('defaultSequence', session);
        const group = objects[0]!;

        expect(group.name).toBe('defaultSequence');
        expect(group.protocolVersion).toBe(1);

        const components = group.components as Record<string, any>;
        expect(components['ui'].properties.name.data).toEqual(['Default Sequence']);
    });

    it('creates RVSequence with output properties', () => {
        const objects = SessionGTOExporter.buildSequenceGroupObjects('defaultSequence', session);
        const sequence = objects[1]!;

        expect(sequence.name).toBe('defaultSequence_sequence');

        const components = sequence.components as Record<string, any>;
        const outputComp = components['output'];

        expect(outputComp.properties.fps.data).toEqual([30]);
        expect(outputComp.properties.autoSize.data).toEqual([1]);
    });

    it('creates RVSequence with mode properties', () => {
        const objects = SessionGTOExporter.buildSequenceGroupObjects('defaultSequence', session);
        const sequence = objects[1]!;
        const components = sequence.components as Record<string, any>;
        const modeComp = components['mode'];

        expect(modeComp.properties.autoEDL.data).toEqual([1]);
        expect(modeComp.properties.useCutInfo.data).toEqual([1]);
    });
});

describe('SessionGTOExporter.buildSessionObject', () => {
    let session: TestSession;

    beforeEach(() => {
        session = new TestSession();
        session.setSources([{
            type: 'video' as const,
            name: 'test',
            url: 'test.mp4',
            width: 1920,
            height: 1080,
            duration: 100,
            fps: 24
        }]);
        session.fps = 24;
        session.goToFrame(50);
        session.toggleMark(10);
        session.toggleMark(20);
    });

    it('creates RVSession with session component', () => {
        const result = SessionGTOExporter.buildSessionObject(session, 'mySession', 'defaultSequence');

        expect(result.name).toBe('mySession');
        expect(result.protocol).toBe('RVSession');
        expect(result.protocolVersion).toBe(1);

        const components = result.components as Record<string, any>;
        const sessionComp = components['session'];

        expect(sessionComp.properties.viewNode.data).toEqual(['defaultSequence']);
        expect(sessionComp.properties.fps.data).toEqual([24]);
        expect(sessionComp.properties.frame.data).toEqual([50]);
        expect(sessionComp.properties.currentFrame.data).toEqual([50]);
    });

    it('includes marks in session component', () => {
        const result = SessionGTOExporter.buildSessionObject(session, 'mySession', 'defaultSequence');
        const components = result.components as Record<string, any>;
        const marksProp = components['session'].properties.marks;

        expect(marksProp.data).toContain(10);
        expect(marksProp.data).toContain(20);
    });

    it('includes root component with name and comment', () => {
        const result = SessionGTOExporter.buildSessionObject(
            session,
            'mySession',
            'defaultSequence',
            'Test comment'
        );
        const components = result.components as Record<string, any>;
        const rootComp = components['root'];

        expect(rootComp.properties.name.data).toEqual(['mySession']);
        expect(rootComp.properties.comment.data).toEqual(['Test comment']);
    });

    it('includes matte component with defaults', () => {
        const result = SessionGTOExporter.buildSessionObject(session, 'mySession', 'defaultSequence');
        const components = result.components as Record<string, any>;
        const matteComp = components['matte'];

        expect(matteComp.properties.show.data).toEqual([0]);
        expect(matteComp.properties.aspect.data).toEqual([1.78]);
        expect(matteComp.properties.opacity.data).toEqual([0.66]);
    });

    it('includes paintEffects component with defaults', () => {
        const result = SessionGTOExporter.buildSessionObject(session, 'mySession', 'defaultSequence');
        const components = result.components as Record<string, any>;
        const paintEffectsComp = components['paintEffects'];

        expect(paintEffectsComp.properties.hold.data).toEqual([0]);
        expect(paintEffectsComp.properties.ghost.data).toEqual([0]);
        expect(paintEffectsComp.properties.ghostBefore.data).toEqual([5]);
        expect(paintEffectsComp.properties.ghostAfter.data).toEqual([5]);
    });
});

describe('SessionGTOExporter.toGTOData (complete export)', () => {
    let session: TestSession;
    let paintEngine: PaintEngine;

    beforeEach(() => {
        session = new TestSession();
        session.setSources([
            {
                type: 'video' as const,
                name: 'shot_001',
                url: '/path/to/shot001.mp4',
                width: 1920,
                height: 1080,
                duration: 100,
                fps: 24
            },
            {
                type: 'image' as const,
                name: 'reference',
                url: '/path/to/reference.jpg',
                width: 1920,
                height: 1080,
                duration: 1,
                fps: 24
            }
        ]);
        session.fps = 24;
        paintEngine = new PaintEngine();
    });

    it('creates complete GTO structure with all required objects', () => {
        const gto = SessionGTOExporter.toGTOData(session, paintEngine);

        expect(gto.version).toBe(4);

        // Check for required objects
        const protocols = gto.objects.map(o => o.protocol);
        expect(protocols).toContain('RVSession');
        expect(protocols).toContain('RVSourceGroup');
        expect(protocols).toContain('RVFileSource');
        expect(protocols).toContain('RVSequenceGroup');
        expect(protocols).toContain('RVSequence');
        expect(protocols).toContain('connection');
        expect(protocols).toContain('RVPaint');
    });

    it('creates source groups for each media source', () => {
        const gto = SessionGTOExporter.toGTOData(session, paintEngine);

        const sourceGroups = gto.objects.filter(o => o.protocol === 'RVSourceGroup');
        expect(sourceGroups).toHaveLength(2);
        expect(sourceGroups[0]?.name).toBe('sourceGroup000000');
        expect(sourceGroups[1]?.name).toBe('sourceGroup000001');

        const fileSources = gto.objects.filter(o =>
            o.protocol === 'RVFileSource' || o.protocol === 'RVImageSource'
        );
        expect(fileSources).toHaveLength(2);
    });

    it('creates correct connections for all sources', () => {
        const gto = SessionGTOExporter.toGTOData(session, paintEngine);

        const connectionObj = gto.objects.find(o => o.protocol === 'connection');
        expect(connectionObj).toBeDefined();

        const components = connectionObj?.components as Record<string, any>;
        const evalComp = components['evaluation'];

        expect(evalComp.properties.lhs.data).toEqual([
            'sourceGroup000000',
            'sourceGroup000001'
        ]);
        expect(evalComp.properties.rhs.data).toEqual([
            'defaultSequence',
            'defaultSequence'
        ]);
    });

    it('respects includeSources option', () => {
        const gto = SessionGTOExporter.toGTOData(session, paintEngine, { includeSources: false });

        const sourceGroups = gto.objects.filter(o => o.protocol === 'RVSourceGroup');
        expect(sourceGroups).toHaveLength(0);

        const connectionObj = gto.objects.find(o => o.protocol === 'connection');
        const components = connectionObj?.components as Record<string, any>;
        expect(components['evaluation'].properties.lhs.data).toEqual([]);
    });

    it('uses custom session name and comment', () => {
        const gto = SessionGTOExporter.toGTOData(session, paintEngine, {
            name: 'MyProject',
            comment: 'Review session for shot 001'
        });

        const sessionObj = gto.objects.find(o => o.protocol === 'RVSession');
        expect(sessionObj?.name).toBe('MyProject');

        const components = sessionObj?.components as Record<string, any>;
        expect(components['root'].properties.name.data).toEqual(['MyProject']);
        expect(components['root'].properties.comment.data).toEqual(['Review session for shot 001']);
    });
});
