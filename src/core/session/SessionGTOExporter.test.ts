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

describe('SessionGTOExporter.buildStackGroupObjects', () => {
    it('creates RVStackGroup and RVStack objects', () => {
        const objects = SessionGTOExporter.buildStackGroupObjects('myStack');

        expect(objects).toHaveLength(2);
        expect(objects[0]?.protocol).toBe('RVStackGroup');
        expect(objects[1]?.protocol).toBe('RVStack');
    });

    it('creates RVStackGroup with correct name', () => {
        const objects = SessionGTOExporter.buildStackGroupObjects('myStack');
        const group = objects[0]!;

        expect(group.name).toBe('myStack');
        expect(group.protocolVersion).toBe(1);
    });

    it('creates RVStack with default composite settings', () => {
        const objects = SessionGTOExporter.buildStackGroupObjects('myStack');
        const stack = objects[1]!;

        expect(stack.name).toBe('myStack_stack');

        const components = stack.components as Record<string, any>;
        const stackComp = components['stack'];

        expect(stackComp.properties.composite.data).toEqual(['replace']);
        expect(stackComp.properties.mode.data).toEqual(['replace']);
    });

    it('creates RVStack with custom settings', () => {
        const objects = SessionGTOExporter.buildStackGroupObjects('myStack', {
            compositeType: 'over',
            mode: 'wipe',
            wipeX: 0.3,
            wipeY: 0.7,
            wipeAngle: 45,
        });
        const stack = objects[1]!;
        const components = stack.components as Record<string, any>;

        const stackComp = components['stack'];
        expect(stackComp.properties.composite.data).toEqual(['over']);
        expect(stackComp.properties.mode.data).toEqual(['wipe']);

        const wipeComp = components['wipe'];
        expect(wipeComp.properties.x.data).toEqual([0.3]);
        expect(wipeComp.properties.y.data).toEqual([0.7]);
        expect(wipeComp.properties.angle.data).toEqual([45]);
    });

    it('creates RVStack with per-layer blend modes', () => {
        const objects = SessionGTOExporter.buildStackGroupObjects('myStack', {
            layerBlendModes: ['normal', 'multiply', 'screen'],
        });
        const stack = objects[1]!;
        const components = stack.components as Record<string, any>;

        const compositeComp = components['composite'];
        expect(compositeComp.properties.type.data).toEqual(['normal', 'multiply', 'screen']);
    });

    it('creates RVStack with output settings', () => {
        const objects = SessionGTOExporter.buildStackGroupObjects('myStack', {
            chosenAudioInput: 1,
            outOfRangePolicy: 'black',
        });
        const stack = objects[1]!;
        const components = stack.components as Record<string, any>;

        const outputComp = components['output'];
        expect(outputComp.properties.chosenAudioInput.data).toEqual([1]);
        expect(outputComp.properties.outOfRangePolicy.data).toEqual(['black']);
    });

    it('creates RVStack with mode settings', () => {
        const objects = SessionGTOExporter.buildStackGroupObjects('myStack', {
            alignStartFrames: true,
            strictFrameRanges: true,
        });
        const stack = objects[1]!;
        const components = stack.components as Record<string, any>;

        const modeComp = components['mode'];
        expect(modeComp.properties.alignStartFrames.data).toEqual([1]);
        expect(modeComp.properties.strictFrameRanges.data).toEqual([1]);
    });
});

describe('SessionGTOExporter.buildSequenceGroupObjects with EDL', () => {
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
    });

    it('creates sequence without EDL by default (autoEDL=1)', () => {
        const objects = SessionGTOExporter.buildSequenceGroupObjects('defaultSequence', session);
        const sequence = objects[1]!;
        const components = sequence.components as Record<string, any>;

        const modeComp = components['mode'];
        expect(modeComp.properties.autoEDL.data).toEqual([1]);

        // Should not have EDL component
        expect(components['edl']).toBeUndefined();
    });

    it('creates sequence with EDL data when provided', () => {
        const edl = {
            frames: [1, 25, 73],
            sources: [0, 1, 0],
            inPoints: [1, 1, 25],
            outPoints: [24, 48, 48],
        };

        const objects = SessionGTOExporter.buildSequenceGroupObjects('defaultSequence', session, edl);
        const sequence = objects[1]!;
        const components = sequence.components as Record<string, any>;

        // autoEDL should be 0 when explicit EDL is provided
        const modeComp = components['mode'];
        expect(modeComp.properties.autoEDL.data).toEqual([0]);

        // Should have EDL component
        const edlComp = components['edl'];
        expect(edlComp).toBeDefined();
        expect(edlComp.properties.frame.data).toEqual([1, 25, 73]);
        expect(edlComp.properties.source.data).toEqual([0, 1, 0]);
        expect(edlComp.properties.in.data).toEqual([1, 1, 25]);
        expect(edlComp.properties.out.data).toEqual([24, 48, 48]);
    });

    it('does not create EDL component when EDL data is empty', () => {
        const edl = {
            frames: [],
            sources: [],
            inPoints: [],
            outPoints: [],
        };

        const objects = SessionGTOExporter.buildSequenceGroupObjects('defaultSequence', session, edl);
        const sequence = objects[1]!;
        const components = sequence.components as Record<string, any>;

        expect(components['edl']).toBeUndefined();
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

describe('SessionGTOExporter.buildLinearizeObject', () => {
    it('creates RVLinearize object with default settings', () => {
        const result = SessionGTOExporter.buildLinearizeObject('sourceGroup000000_RVLinearize');

        expect(result.name).toBe('sourceGroup000000_RVLinearize');
        expect(result.protocol).toBe('RVLinearize');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates node component with active state', () => {
        const result = SessionGTOExporter.buildLinearizeObject('linearize', { active: true });
        const components = result.components as Record<string, any>;

        expect(components['node'].properties.active.data).toEqual([1]);
    });

    it('creates node component with inactive state', () => {
        const result = SessionGTOExporter.buildLinearizeObject('linearize', { active: false });
        const components = result.components as Record<string, any>;

        expect(components['node'].properties.active.data).toEqual([0]);
    });

    it('creates color component with transfer functions', () => {
        const result = SessionGTOExporter.buildLinearizeObject('linearize', {
            sRGB2linear: true,
            rec709ToLinear: false,
            fileGamma: 2.2,
        });
        const components = result.components as Record<string, any>;
        const colorComp = components['color'];

        expect(colorComp.properties.sRGB2linear.data).toEqual([1]);
        expect(colorComp.properties.Rec709ToLinear.data).toEqual([0]);
        expect(colorComp.properties.fileGamma.data).toEqual([2.2]);
    });

    it('creates color component with log type and alpha settings', () => {
        const result = SessionGTOExporter.buildLinearizeObject('linearize', {
            logtype: 1, // cineon
            alphaType: 1, // premult
            yuv: true,
            invert: true,
        });
        const components = result.components as Record<string, any>;
        const colorComp = components['color'];

        expect(colorComp.properties.logtype.data).toEqual([1]);
        expect(colorComp.properties.alphaType.data).toEqual([1]);
        expect(colorComp.properties.YUV.data).toEqual([1]);
        expect(colorComp.properties.invert.data).toEqual([1]);
    });

    it('creates cineon component with default values', () => {
        const result = SessionGTOExporter.buildLinearizeObject('linearize');
        const components = result.components as Record<string, any>;
        const cineonComp = components['cineon'];

        expect(cineonComp.properties.whiteCodeValue.data).toEqual([685]);
        expect(cineonComp.properties.blackCodeValue.data).toEqual([95]);
        expect(cineonComp.properties.breakPointValue.data).toEqual([685]);
    });

    it('creates cineon component with custom values', () => {
        const result = SessionGTOExporter.buildLinearizeObject('linearize', {
            cineon: {
                whiteCodeValue: 700,
                blackCodeValue: 100,
                breakPointValue: 680,
            },
        });
        const components = result.components as Record<string, any>;
        const cineonComp = components['cineon'];

        expect(cineonComp.properties.whiteCodeValue.data).toEqual([700]);
        expect(cineonComp.properties.blackCodeValue.data).toEqual([100]);
        expect(cineonComp.properties.breakPointValue.data).toEqual([680]);
    });

    it('creates LUT component with settings', () => {
        const result = SessionGTOExporter.buildLinearizeObject('linearize', {
            lutSettings: {
                active: true,
                file: '/path/to/lut.cube',
                name: 'MyLUT',
                type: 'RGB',
                scale: 1.5,
                offset: 0.1,
            },
        });
        const components = result.components as Record<string, any>;
        const lutComp = components['lut'];

        expect(lutComp.properties.active.data).toEqual([1]);
        expect(lutComp.properties.file.data).toEqual(['/path/to/lut.cube']);
        expect(lutComp.properties.name.data).toEqual(['MyLUT']);
        expect(lutComp.properties.type.data).toEqual(['RGB']);
        expect(lutComp.properties.scale.data).toEqual([1.5]);
        expect(lutComp.properties.offset.data).toEqual([0.1]);
    });

    it('creates LUT component with inactive state by default', () => {
        const result = SessionGTOExporter.buildLinearizeObject('linearize');
        const components = result.components as Record<string, any>;
        const lutComp = components['lut'];

        expect(lutComp.properties.active.data).toEqual([0]);
    });
});

describe('SessionGTOExporter.buildColorObject', () => {
    it('creates RVColor object with default settings', () => {
        const result = SessionGTOExporter.buildColorObject('sourceGroup000000_RVColor');

        expect(result.name).toBe('sourceGroup000000_RVColor');
        expect(result.protocol).toBe('RVColor');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates color component with basic settings', () => {
        const result = SessionGTOExporter.buildColorObject('colorNode', {
            active: true,
            exposure: 0.5,
            gamma: 1.2,
            saturation: 1.1,
            contrast: 0.1,
            hue: 15.0,
        });
        const components = result.components as Record<string, any>;
        const colorComp = components['color'];

        expect(colorComp.properties.active.data).toEqual([1]);
        expect(colorComp.properties.exposure.data).toEqual([0.5, 0.5, 0.5]);
        expect(colorComp.properties.gamma.data).toEqual([1.2, 1.2, 1.2]);
        expect(colorComp.properties.saturation.data).toEqual([1.1]);
        expect(colorComp.properties.contrast.data).toEqual([0.1, 0.1, 0.1]);
        expect(colorComp.properties.hue.data).toEqual([15.0]);
    });

    it('creates color component with per-channel values', () => {
        const result = SessionGTOExporter.buildColorObject('colorNode', {
            exposure: [0.2, 0.3, 0.4],
            gamma: [1.1, 1.2, 1.3],
            offset: [0.01, 0.02, 0.03],
            contrast: [0.1, 0.15, 0.2],
        });
        const components = result.components as Record<string, any>;
        const colorComp = components['color'];

        expect(colorComp.properties.exposure.data).toEqual([0.2, 0.3, 0.4]);
        expect(colorComp.properties.gamma.data).toEqual([1.1, 1.2, 1.3]);
        expect(colorComp.properties.offset.data).toEqual([0.01, 0.02, 0.03]);
        expect(colorComp.properties.contrast.data).toEqual([0.1, 0.15, 0.2]);
    });

    it('creates color component with invert, normalize, unpremult flags', () => {
        const result = SessionGTOExporter.buildColorObject('colorNode', {
            invert: true,
            normalize: true,
            unpremult: true,
            lut: 'custom_lut',
        });
        const components = result.components as Record<string, any>;
        const colorComp = components['color'];

        expect(colorComp.properties.invert.data).toEqual([1]);
        expect(colorComp.properties.normalize.data).toEqual([1]);
        expect(colorComp.properties.unpremult.data).toEqual([1]);
        expect(colorComp.properties.lut.data).toEqual(['custom_lut']);
    });

    it('creates CDL component when cdl settings provided', () => {
        const result = SessionGTOExporter.buildColorObject('colorNode', {
            cdl: {
                active: true,
                colorspace: 'aceslog',
                slope: [1.1, 1.0, 0.9],
                offset: [0.01, 0.0, -0.01],
                power: [1.0, 1.0, 1.05],
                saturation: 0.95,
                noClamp: true,
            },
        });
        const components = result.components as Record<string, any>;
        const cdlComp = components['CDL'];

        expect(cdlComp).toBeDefined();
        expect(cdlComp.properties.active.data).toEqual([1]);
        expect(cdlComp.properties.colorspace.data).toEqual(['aceslog']);
        expect(cdlComp.properties.slope.data).toEqual([1.1, 1.0, 0.9]);
        expect(cdlComp.properties.offset.data).toEqual([0.01, 0.0, -0.01]);
        expect(cdlComp.properties.power.data).toEqual([1.0, 1.0, 1.05]);
        expect(cdlComp.properties.saturation.data).toEqual([0.95]);
        expect(cdlComp.properties.noClamp.data).toEqual([1]);
    });

    it('creates luminanceLUT component when settings provided', () => {
        const result = SessionGTOExporter.buildColorObject('colorNode', {
            luminanceLUT: {
                active: true,
                lut: [0, 0.5, 1.0],
                max: 2.0,
                size: 256,
                name: 'TestLumLUT',
            },
        });
        const components = result.components as Record<string, any>;
        const lumLutComp = components['luminanceLUT'];

        expect(lumLutComp).toBeDefined();
        expect(lumLutComp.properties.active.data).toEqual([1]);
        expect(lumLutComp.properties.lut.data).toEqual([0, 0.5, 1.0]);
        expect(lumLutComp.properties.max.data).toEqual([2.0]);
        expect(lumLutComp.properties.size.data).toEqual([256]);
        expect(lumLutComp.properties.name.data).toEqual(['TestLumLUT']);
    });

    it('does not create CDL component when cdl settings not provided', () => {
        const result = SessionGTOExporter.buildColorObject('colorNode');
        const components = result.components as Record<string, any>;

        expect(components['CDL']).toBeUndefined();
    });

    it('does not create luminanceLUT component when settings not provided', () => {
        const result = SessionGTOExporter.buildColorObject('colorNode');
        const components = result.components as Record<string, any>;

        expect(components['luminanceLUT']).toBeUndefined();
    });
});

describe('SessionGTOExporter.buildLookLUTObject', () => {
    it('creates RVLookLUT object with default settings', () => {
        const result = SessionGTOExporter.buildLookLUTObject('sourceGroup000000_RVLookLUT');

        expect(result.name).toBe('sourceGroup000000_RVLookLUT');
        expect(result.protocol).toBe('RVLookLUT');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates RVCacheLUT object when specified', () => {
        const result = SessionGTOExporter.buildLookLUTObject(
            'cacheLut',
            {},
            'RVCacheLUT'
        );

        expect(result.protocol).toBe('RVCacheLUT');
    });

    it('creates node component with active state', () => {
        const result = SessionGTOExporter.buildLookLUTObject('lookLut', { active: true });
        const components = result.components as Record<string, any>;

        expect(components['node'].properties.active.data).toEqual([1]);
    });

    it('creates node component with inactive state', () => {
        const result = SessionGTOExporter.buildLookLUTObject('lookLut', { active: false });
        const components = result.components as Record<string, any>;

        expect(components['node'].properties.active.data).toEqual([0]);
    });

    it('creates LUT component with file and settings', () => {
        const result = SessionGTOExporter.buildLookLUTObject('lookLut', {
            lutActive: true,
            file: '/path/to/lut.cube',
            name: 'TestLUT',
            type: 'RGB',
            scale: 1.5,
            offset: 0.1,
            conditioningGamma: 2.2,
            size: [33, 33, 33],
            preLUTSize: 256,
        });
        const components = result.components as Record<string, any>;
        const lutComp = components['lut'];

        expect(lutComp.properties.active.data).toEqual([1]);
        expect(lutComp.properties.file.data).toEqual(['/path/to/lut.cube']);
        expect(lutComp.properties.name.data).toEqual(['TestLUT']);
        expect(lutComp.properties.type.data).toEqual(['RGB']);
        expect(lutComp.properties.scale.data).toEqual([1.5]);
        expect(lutComp.properties.offset.data).toEqual([0.1]);
        expect(lutComp.properties.conditioningGamma.data).toEqual([2.2]);
        expect(lutComp.properties.size.data).toEqual([33, 33, 33]);
        expect(lutComp.properties.preLUTSize.data).toEqual([256]);
    });

    it('creates LUT component with default values', () => {
        const result = SessionGTOExporter.buildLookLUTObject('lookLut');
        const components = result.components as Record<string, any>;
        const lutComp = components['lut'];

        expect(lutComp.properties.active.data).toEqual([0]);
        expect(lutComp.properties.file.data).toEqual(['']);
        expect(lutComp.properties.name.data).toEqual(['']);
        expect(lutComp.properties.type.data).toEqual(['Luminance']);
        expect(lutComp.properties.scale.data).toEqual([1.0]);
        expect(lutComp.properties.offset.data).toEqual([0.0]);
        expect(lutComp.properties.conditioningGamma.data).toEqual([1.0]);
        expect(lutComp.properties.size.data).toEqual([0, 0, 0]);
        expect(lutComp.properties.preLUTSize.data).toEqual([0]);
    });
});

describe('SessionGTOExporter.buildRetimeObject', () => {
    it('creates RVRetime object with default settings', () => {
        const result = SessionGTOExporter.buildRetimeObject('sourceGroup000000_RVRetime');

        expect(result.name).toBe('sourceGroup000000_RVRetime');
        expect(result.protocol).toBe('RVRetime');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates visual and audio components with scale and offset', () => {
        const result = SessionGTOExporter.buildRetimeObject('retimeNode', {
            visualScale: 2.0,
            visualOffset: 10,
            audioScale: 1.5,
            audioOffset: 5,
        });
        const components = result.components as Record<string, any>;

        expect(components['visual'].properties.scale.data).toEqual([2.0]);
        expect(components['visual'].properties.offset.data).toEqual([10]);
        expect(components['audio'].properties.scale.data).toEqual([1.5]);
        expect(components['audio'].properties.offset.data).toEqual([5]);
    });

    it('creates output component with fps', () => {
        const result = SessionGTOExporter.buildRetimeObject('retimeNode', {
            outputFps: 30,
        });
        const components = result.components as Record<string, any>;

        expect(components['output'].properties.fps.data).toEqual([30]);
    });

    it('creates warp component when warp settings provided', () => {
        const result = SessionGTOExporter.buildRetimeObject('retimeNode', {
            warp: {
                active: true,
                style: 1,
                keyFrames: [1, 50, 100],
                keyRates: [1.0, 2.0, 0.5],
            },
        });
        const components = result.components as Record<string, any>;
        const warpComp = components['warp'];

        expect(warpComp).toBeDefined();
        expect(warpComp.properties.active.data).toEqual([1]);
        expect(warpComp.properties.style.data).toEqual([1]);
        expect(warpComp.properties.keyFrames.data).toEqual([1, 50, 100]);
        expect(warpComp.properties.keyRates.data).toEqual([1.0, 2.0, 0.5]);
    });

    it('creates explicit component when explicit settings provided', () => {
        const result = SessionGTOExporter.buildRetimeObject('retimeNode', {
            explicit: {
                active: true,
                firstOutputFrame: 10,
                inputFrames: [5, 10, 15, 20, 25],
            },
        });
        const components = result.components as Record<string, any>;
        const explicitComp = components['explicit'];

        expect(explicitComp).toBeDefined();
        expect(explicitComp.properties.active.data).toEqual([1]);
        expect(explicitComp.properties.firstOutputFrame.data).toEqual([10]);
        expect(explicitComp.properties.inputFrames.data).toEqual([5, 10, 15, 20, 25]);
    });

    it('does not create warp component when not provided', () => {
        const result = SessionGTOExporter.buildRetimeObject('retimeNode');
        const components = result.components as Record<string, any>;

        expect(components['warp']).toBeUndefined();
    });

    it('does not create explicit component when not provided', () => {
        const result = SessionGTOExporter.buildRetimeObject('retimeNode');
        const components = result.components as Record<string, any>;

        expect(components['explicit']).toBeUndefined();
    });
});

describe('SessionGTOExporter.buildDisplayColorObject', () => {
    it('creates RVDisplayColor object with default settings', () => {
        const result = SessionGTOExporter.buildDisplayColorObject('displayColorNode');

        expect(result.name).toBe('displayColorNode');
        expect(result.protocol).toBe('RVDisplayColor');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates color component with all settings', () => {
        const result = SessionGTOExporter.buildDisplayColorObject('displayColorNode', {
            active: true,
            channelOrder: 'BGRA',
            channelFlood: 1,
            premult: true,
            gamma: 2.4,
            sRGB: true,
            Rec709: false,
            brightness: 0.5,
            outOfRange: 1,
            dither: 1,
            ditherLast: false,
        });
        const components = result.components as Record<string, any>;
        const colorComp = components['color'];

        expect(colorComp.properties.active.data).toEqual([1]);
        expect(colorComp.properties.channelOrder.data).toEqual(['BGRA']);
        expect(colorComp.properties.channelFlood.data).toEqual([1]);
        expect(colorComp.properties.premult.data).toEqual([1]);
        expect(colorComp.properties.gamma.data).toEqual([2.4]);
        expect(colorComp.properties.sRGB.data).toEqual([1]);
        expect(colorComp.properties.Rec709.data).toEqual([0]);
        expect(colorComp.properties.brightness.data).toEqual([0.5]);
        expect(colorComp.properties.outOfRange.data).toEqual([1]);
        expect(colorComp.properties.dither.data).toEqual([1]);
        expect(colorComp.properties.ditherLast.data).toEqual([0]);
    });

    it('creates chromaticities component when settings provided', () => {
        const result = SessionGTOExporter.buildDisplayColorObject('displayColorNode', {
            chromaticities: {
                active: true,
                adoptedNeutral: true,
                white: [0.3127, 0.329],
                red: [0.64, 0.33],
                green: [0.3, 0.6],
                blue: [0.15, 0.06],
                neutral: [0.3127, 0.329],
            },
        });
        const components = result.components as Record<string, any>;
        const chromComp = components['chromaticities'];

        expect(chromComp).toBeDefined();
        expect(chromComp.properties.active.data).toEqual([1]);
        expect(chromComp.properties.adoptedNeutral.data).toEqual([1]);
    });

    it('does not create chromaticities component when not provided', () => {
        const result = SessionGTOExporter.buildDisplayColorObject('displayColorNode');
        const components = result.components as Record<string, any>;

        expect(components['chromaticities']).toBeUndefined();
    });
});

describe('SessionGTOExporter.buildDisplayStereoObject', () => {
    it('creates RVDisplayStereo object with default settings', () => {
        const result = SessionGTOExporter.buildDisplayStereoObject('displayStereoNode');

        expect(result.name).toBe('displayStereoNode');
        expect(result.protocol).toBe('RVDisplayStereo');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates stereo component with settings', () => {
        const result = SessionGTOExporter.buildDisplayStereoObject('displayStereoNode', {
            type: 'pair',
            swap: true,
            relativeOffset: 0.05,
            rightOffset: [10, 0],
        });
        const components = result.components as Record<string, any>;
        const stereoComp = components['stereo'];

        expect(stereoComp.properties.type.data).toEqual(['pair']);
        expect(stereoComp.properties.swap.data).toEqual([1]);
        expect(stereoComp.properties.relativeOffset.data).toEqual([0.05]);
    });

    it('creates stereo component with default values', () => {
        const result = SessionGTOExporter.buildDisplayStereoObject('displayStereoNode');
        const components = result.components as Record<string, any>;
        const stereoComp = components['stereo'];

        expect(stereoComp.properties.type.data).toEqual(['off']);
        expect(stereoComp.properties.swap.data).toEqual([0]);
        expect(stereoComp.properties.relativeOffset.data).toEqual([0.0]);
    });
});

describe('SessionGTOExporter.buildSourceStereoObject', () => {
    it('creates RVSourceStereo object with default settings', () => {
        const result = SessionGTOExporter.buildSourceStereoObject('sourceGroup000000_RVSourceStereo');

        expect(result.name).toBe('sourceGroup000000_RVSourceStereo');
        expect(result.protocol).toBe('RVSourceStereo');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates stereo component with settings', () => {
        const result = SessionGTOExporter.buildSourceStereoObject('sourceStereoNode', {
            swap: true,
            relativeOffset: 0.1,
            rightOffset: 5.0,
        });
        const components = result.components as Record<string, any>;
        const stereoComp = components['stereo'];

        expect(stereoComp.properties.swap.data).toEqual([1]);
        expect(stereoComp.properties.relativeOffset.data).toEqual([0.1]);
        expect(stereoComp.properties.rightOffset.data).toEqual([5.0]);
    });

    it('creates rightTransform component when settings provided', () => {
        const result = SessionGTOExporter.buildSourceStereoObject('sourceStereoNode', {
            rightTransform: {
                flip: true,
                flop: false,
                rotate: 90.0,
                translate: [10, 20],
            },
        });
        const components = result.components as Record<string, any>;
        const rtComp = components['rightTransform'];

        expect(rtComp).toBeDefined();
        expect(rtComp.properties.flip.data).toEqual([1]);
        expect(rtComp.properties.flop.data).toEqual([0]);
        expect(rtComp.properties.rotate.data).toEqual([90.0]);
    });

    it('does not create rightTransform component when not provided', () => {
        const result = SessionGTOExporter.buildSourceStereoObject('sourceStereoNode');
        const components = result.components as Record<string, any>;

        expect(components['rightTransform']).toBeUndefined();
    });

    it('creates stereo component with default values', () => {
        const result = SessionGTOExporter.buildSourceStereoObject('sourceStereoNode');
        const components = result.components as Record<string, any>;
        const stereoComp = components['stereo'];

        expect(stereoComp.properties.swap.data).toEqual([0]);
        expect(stereoComp.properties.relativeOffset.data).toEqual([0.0]);
        expect(stereoComp.properties.rightOffset.data).toEqual([0.0]);
    });
});

describe('SessionGTOExporter.buildFormatObject', () => {
    it('creates RVFormat object with default settings', () => {
        const result = SessionGTOExporter.buildFormatObject('sourceGroup000000_RVFormat');

        expect(result.name).toBe('sourceGroup000000_RVFormat');
        expect(result.protocol).toBe('RVFormat');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates crop component with all settings', () => {
        const result = SessionGTOExporter.buildFormatObject('formatNode', {
            crop: {
                active: true,
                xmin: 10,
                ymin: 20,
                xmax: 100,
                ymax: 80,
            },
        });
        const components = result.components as Record<string, any>;
        const cropComp = components['crop'];

        expect(cropComp).toBeDefined();
        expect(cropComp.properties.active.data).toEqual([1]);
        expect(cropComp.properties.xmin.data).toEqual([10]);
        expect(cropComp.properties.ymin.data).toEqual([20]);
        expect(cropComp.properties.xmax.data).toEqual([100]);
        expect(cropComp.properties.ymax.data).toEqual([80]);
    });

    it('creates crop component with disabled crop', () => {
        const result = SessionGTOExporter.buildFormatObject('formatNode', {
            crop: {
                active: false,
                xmin: 0,
                ymin: 0,
                xmax: 1920,
                ymax: 1080,
            },
        });
        const components = result.components as Record<string, any>;
        const cropComp = components['crop'];

        expect(cropComp.properties.active.data).toEqual([0]);
    });

    it('creates format component with channel mapping', () => {
        const result = SessionGTOExporter.buildFormatObject('formatNode', {
            channels: ['R', 'G', 'B', 'A'],
        });
        const components = result.components as Record<string, any>;
        const formatComp = components['format'];

        expect(formatComp).toBeDefined();
        expect(formatComp.properties.channels.data).toEqual(['R', 'G', 'B', 'A']);
    });

    it('creates both crop and format components', () => {
        const result = SessionGTOExporter.buildFormatObject('formatNode', {
            crop: {
                active: true,
                xmin: 50,
                ymin: 50,
                xmax: 1870,
                ymax: 1030,
            },
            channels: ['R', 'G', 'B'],
        });
        const components = result.components as Record<string, any>;

        expect(components['crop']).toBeDefined();
        expect(components['format']).toBeDefined();
        expect(components['crop'].properties.xmin.data).toEqual([50]);
        expect(components['format'].properties.channels.data).toEqual(['R', 'G', 'B']);
    });

    it('does not create crop component when not provided', () => {
        const result = SessionGTOExporter.buildFormatObject('formatNode');
        const components = result.components as Record<string, any>;

        expect(components['crop']).toBeUndefined();
    });

    it('does not create format component when channels not provided', () => {
        const result = SessionGTOExporter.buildFormatObject('formatNode', {
            crop: { active: true },
        });
        const components = result.components as Record<string, any>;

        expect(components['format']).toBeUndefined();
    });

    it('does not create format component when channels array is empty', () => {
        const result = SessionGTOExporter.buildFormatObject('formatNode', {
            channels: [],
        });
        const components = result.components as Record<string, any>;

        expect(components['format']).toBeUndefined();
    });
});

describe('SessionGTOExporter.buildOverlayObject', () => {
    it('creates RVOverlay object with default settings', () => {
        const result = SessionGTOExporter.buildOverlayObject('overlayNode');

        expect(result.name).toBe('overlayNode');
        expect(result.protocol).toBe('RVOverlay');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates overlay component with metadata', () => {
        const result = SessionGTOExporter.buildOverlayObject('overlayNode', {
            show: true,
        });
        const components = result.components as Record<string, any>;
        const overlayComp = components['overlay'];

        expect(overlayComp).toBeDefined();
        expect(overlayComp.properties.nextRectId.data).toEqual([0]);
        expect(overlayComp.properties.nextTextId.data).toEqual([0]);
        expect(overlayComp.properties.show.data).toEqual([1]);
    });

    it('creates matte component when provided', () => {
        const result = SessionGTOExporter.buildOverlayObject('overlayNode', {
            matte: {
                show: true,
                opacity: 0.8,
                aspect: 2.35,
                heightVisible: 0.9,
                centerPoint: [0.5, 0.6],
            },
        });
        const components = result.components as Record<string, any>;
        const matteComp = components['matte'];

        expect(matteComp).toBeDefined();
        expect(matteComp.properties.show.data).toEqual([1]);
        expect(matteComp.properties.opacity.data).toEqual([0.8]);
        expect(matteComp.properties.aspect.data).toEqual([2.35]);
        expect(matteComp.properties.heightVisible.data).toEqual([0.9]);
    });

    it('creates rectangle overlays', () => {
        const result = SessionGTOExporter.buildOverlayObject('overlayNode', {
            rectangles: [
                { id: 0, width: 0.2, height: 0.1, color: [1, 0, 0, 1], position: [0.1, 0.2], active: true },
                { id: 1, width: 0.3, height: 0.15, color: [0, 1, 0, 0.5], position: [0.5, 0.5] },
            ],
        });
        const components = result.components as Record<string, any>;

        const rect0 = components['rect:0'];
        expect(rect0).toBeDefined();
        expect(rect0.properties.width.data).toEqual([0.2]);
        expect(rect0.properties.height.data).toEqual([0.1]);
        expect(rect0.properties.active.data).toEqual([1]);

        const rect1 = components['rect:1'];
        expect(rect1).toBeDefined();
        expect(rect1.properties.width.data).toEqual([0.3]);
        expect(rect1.properties.height.data).toEqual([0.15]);
    });

    it('creates text overlays', () => {
        const result = SessionGTOExporter.buildOverlayObject('overlayNode', {
            texts: [
                {
                    id: 0,
                    position: [0.1, 0.9],
                    color: [1, 1, 1, 1],
                    size: 32,
                    text: 'Hello World',
                    font: 'Arial',
                    active: true,
                },
            ],
        });
        const components = result.components as Record<string, any>;

        const text0 = components['text:0'];
        expect(text0).toBeDefined();
        expect(text0.properties.size.data).toEqual([32]);
        expect(text0.properties.text.data).toEqual(['Hello World']);
        expect(text0.properties.font.data).toEqual(['Arial']);
        expect(text0.properties.active.data).toEqual([1]);
    });

    it('creates window overlays', () => {
        const result = SessionGTOExporter.buildOverlayObject('overlayNode', {
            windows: [
                {
                    id: 0,
                    windowActive: true,
                    outlineActive: true,
                    outlineWidth: 2.0,
                    outlineColor: [1, 1, 0, 1],
                    windowColor: [0, 0, 0, 0.3],
                    upperLeft: [0.1, 0.1],
                    upperRight: [0.9, 0.1],
                    lowerLeft: [0.1, 0.9],
                    lowerRight: [0.9, 0.9],
                },
            ],
        });
        const components = result.components as Record<string, any>;

        const win0 = components['window:0'];
        expect(win0).toBeDefined();
        expect(win0.properties.windowActive.data).toEqual([1]);
        expect(win0.properties.outlineActive.data).toEqual([1]);
        expect(win0.properties.outlineWidth.data).toEqual([2.0]);
        expect(win0.properties.windowULx.data).toEqual([0.1]);
        expect(win0.properties.windowULy.data).toEqual([0.1]);
        expect(win0.properties.windowLRx.data).toEqual([0.9]);
        expect(win0.properties.windowLRy.data).toEqual([0.9]);
    });

    it('updates nextRectId and nextTextId based on elements', () => {
        const result = SessionGTOExporter.buildOverlayObject('overlayNode', {
            rectangles: [{ id: 0 }, { id: 1 }, { id: 2 }],
            texts: [{ id: 0 }, { id: 1 }],
        });
        const components = result.components as Record<string, any>;
        const overlayComp = components['overlay'];

        expect(overlayComp.properties.nextRectId.data).toEqual([3]);
        expect(overlayComp.properties.nextTextId.data).toEqual([2]);
    });

    it('creates overlay with show disabled', () => {
        const result = SessionGTOExporter.buildOverlayObject('overlayNode', {
            show: false,
        });
        const components = result.components as Record<string, any>;

        expect(components['overlay'].properties.show.data).toEqual([0]);
    });
});

describe('SessionGTOExporter.buildChannelMapObject', () => {
    it('creates RVChannelMap object with default settings', () => {
        const result = SessionGTOExporter.buildChannelMapObject('channelMapNode');

        expect(result.name).toBe('channelMapNode');
        expect(result.protocol).toBe('RVChannelMap');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates format component with channel mapping', () => {
        const result = SessionGTOExporter.buildChannelMapObject('channelMapNode', {
            channels: ['R', 'G', 'B', 'A'],
        });
        const components = result.components as Record<string, any>;
        const formatComp = components['format'];

        expect(formatComp).toBeDefined();
        expect(formatComp.properties.channels.data).toEqual(['R', 'G', 'B', 'A']);
    });

    it('creates format component with remapped channels', () => {
        const result = SessionGTOExporter.buildChannelMapObject('channelMapNode', {
            channels: ['G', 'R', 'B'],
        });
        const components = result.components as Record<string, any>;
        const formatComp = components['format'];

        expect(formatComp.properties.channels.data).toEqual(['G', 'R', 'B']);
    });

    it('does not create format component when channels not provided', () => {
        const result = SessionGTOExporter.buildChannelMapObject('channelMapNode');
        const components = result.components as Record<string, any>;

        expect(components['format']).toBeUndefined();
    });

    it('does not create format component when channels array is empty', () => {
        const result = SessionGTOExporter.buildChannelMapObject('channelMapNode', {
            channels: [],
        });
        const components = result.components as Record<string, any>;

        expect(components['format']).toBeUndefined();
    });
});
