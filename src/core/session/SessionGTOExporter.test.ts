import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    SessionGTOExporter,
    generateSourceGroupName,
    type GTOProperty,
    type GTOComponent
} from './SessionGTOExporter';
import { Session, type MediaSource } from './Session';
import { PaintEngine } from '../../paint/PaintEngine';
import type { GTOData } from 'gto-js';
import { Graph } from '../graph/Graph';
import { LineJoin, LineCap, BrushType, StrokeMode, type PenStroke } from '../../paint/types';

class TestSession extends Session {
    public setMockGraph(g: Graph) {
        this._graph = g;
    }
    public setSources(s: MediaSource[]) {
        this.sources = s;
    }
    public setMatteSettingsForTest(matte: {
        show: boolean;
        aspect: number;
        opacity: number;
        heightVisible: number;
        centerPoint: [number, number];
    }) {
        (this.annotationStore as any)._matteSettings = matte;
    }
    public setSessionPaintEffectsForTest(effects: {
        hold?: boolean;
        ghost?: boolean;
        ghostBefore?: number;
        ghostAfter?: number;
    }) {
        (this.annotationStore as any)._sessionPaintEffects = effects;
    }
    public setMetadataForTest(metadata: {
        displayName: string;
        comment: string;
        version: number;
        origin: string;
        creationContext: number;
        clipboard: number;
        membershipContains: string[];
    }) {
        (this as any)._metadata = metadata;
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
    let paintEngine: PaintEngine;

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
        paintEngine = new PaintEngine();
    });

    it('creates RVSession with session component', () => {
        const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'mySession', 'defaultSequence');

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
        const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'mySession', 'defaultSequence');
        const components = result.components as Record<string, any>;
        const marksProp = components['session'].properties.marks;

        expect(marksProp.data).toContain(10);
        expect(marksProp.data).toContain(20);
    });

    it('GTO-MRK-U003: includes markerNotes and markerColors in session component', () => {
        // Set up markers with notes and colors
        session.setMarker(10, 'Note for frame 10', '#ff0000');
        session.setMarker(20, 'Note for frame 20', '#00ff00');

        const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'mySession', 'defaultSequence');
        const components = result.components as Record<string, any>;
        const sessionComp = components['session'];

        const markerNotesProp = sessionComp.properties.markerNotes;
        const markerColorsProp = sessionComp.properties.markerColors;

        expect(markerNotesProp).toBeDefined();
        expect(markerColorsProp).toBeDefined();
        expect(markerNotesProp.data).toContain('Note for frame 10');
        expect(markerNotesProp.data).toContain('Note for frame 20');
        expect(markerColorsProp.data).toContain('#ff0000');
        expect(markerColorsProp.data).toContain('#00ff00');
    });

    it('GTO-MRK-U004: exports default values for markers without explicit notes/colors', () => {
        // Default markers from beforeEach (frames 10 and 20) have no explicit notes/colors
        const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'mySession', 'defaultSequence');
        const components = result.components as Record<string, any>;
        const sessionComp = components['session'];

        const markerNotesProp = sessionComp.properties.markerNotes;
        const markerColorsProp = sessionComp.properties.markerColors;

        // Should have empty strings for notes (defaults)
        expect(markerNotesProp.data).toEqual(['', '']);
        // Should have default color for colors
        expect(markerColorsProp.data[0]).toBe('#ff4444');
        expect(markerColorsProp.data[1]).toBe('#ff4444');
    });

    it('includes root component with name and comment', () => {
        const result = SessionGTOExporter.buildSessionObject(
            session,
            paintEngine,
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
        const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'mySession', 'defaultSequence');
        const components = result.components as Record<string, any>;
        const matteComp = components['matte'];

        expect(matteComp.properties.show.data).toEqual([0]);
        expect(matteComp.properties.aspect.data).toEqual([1.78]);
        expect(matteComp.properties.opacity.data).toEqual([0.66]);
    });

    it('includes paintEffects component with defaults', () => {
        const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'mySession', 'defaultSequence');
        const components = result.components as Record<string, any>;
        const paintEffectsComp = components['paintEffects'];

        expect(paintEffectsComp.properties.hold.data).toEqual([0]);
        expect(paintEffectsComp.properties.ghost.data).toEqual([0]);
        // PaintEngine defaults: ghostBefore=3, ghostAfter=3
        expect(paintEffectsComp.properties.ghostBefore.data).toEqual([3]);
        expect(paintEffectsComp.properties.ghostAfter.data).toEqual([3]);
    });

    it('includes internal component with creationContext', () => {
        const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'mySession', 'defaultSequence');
        const components = result.components as Record<string, any>;
        const internalComp = components['internal'];

        expect(internalComp).toBeDefined();
        expect(internalComp.properties.creationContext.data).toEqual([0]);
    });

    it('includes node component with origin', () => {
        const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'mySession', 'defaultSequence');
        const components = result.components as Record<string, any>;
        const nodeComp = components['node'];

        expect(nodeComp).toBeDefined();
        expect(nodeComp.properties.origin.data).toEqual(['openrv-web']);
    });

    it('includes membership component with contains', () => {
        const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'mySession', 'defaultSequence');
        const components = result.components as Record<string, any>;
        const membershipComp = components['membership'];

        expect(membershipComp).toBeDefined();
        expect(membershipComp.properties.contains.data).toEqual([]);
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

    it('exports RVFormat object with uncrop state when session has active uncrop', () => {
        session.uncropState = { active: true, x: 100, y: 50, width: 2120, height: 1180 };

        const gto = SessionGTOExporter.toGTOData(session, paintEngine);

        const formatObj = gto.objects.find(o => o.protocol === 'RVFormat');
        expect(formatObj).toBeDefined();
        expect(formatObj?.name).toBe('sourceGroup000000_format');

        const components = formatObj?.components as Record<string, any>;
        const uncropComp = components['uncrop'];
        expect(uncropComp).toBeDefined();
        expect(uncropComp.properties.active.data).toEqual([1]);
        expect(uncropComp.properties.x.data).toEqual([100]);
        expect(uncropComp.properties.y.data).toEqual([50]);
        expect(uncropComp.properties.width.data).toEqual([2120]);
        expect(uncropComp.properties.height.data).toEqual([1180]);
    });

    it('does not export RVFormat object when session has no uncrop state', () => {
        session.uncropState = null;

        const gto = SessionGTOExporter.toGTOData(session, paintEngine);

        const formatObj = gto.objects.find(o => o.protocol === 'RVFormat');
        expect(formatObj).toBeUndefined();
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

    it('creates CDL component when cdl settings provided', () => {
        const result = SessionGTOExporter.buildLinearizeObject('linearize', {
            cdl: {
                active: true,
                slope: [1.1, 1.0, 0.9],
                offset: [0.01, 0.0, -0.01],
                power: [1.0, 1.1, 1.0],
                saturation: 0.9,
                noClamp: true,
            },
        });
        const components = result.components as Record<string, any>;
        const cdlComp = components['CDL'];

        expect(cdlComp.properties.active.data).toEqual([1]);
        expect(cdlComp.properties.slope.data).toEqual([[1.1, 1.0, 0.9]]);
        expect(cdlComp.properties.offset.data).toEqual([[0.01, 0.0, -0.01]]);
        expect(cdlComp.properties.power.data).toEqual([[1.0, 1.1, 1.0]]);
        expect(cdlComp.properties.saturation.data).toEqual([0.9]);
        expect(cdlComp.properties.noClamp.data).toEqual([1]);
    });

    it('does not create CDL component when cdl settings not provided', () => {
        const result = SessionGTOExporter.buildLinearizeObject('linearize');
        const components = result.components as Record<string, any>;

        expect(components['CDL']).toBeUndefined();
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

    it('creates matrix:output component with flat array', () => {
        const testMatrix = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        ];
        const result = SessionGTOExporter.buildColorObject('colorNode', {
            outputMatrix: testMatrix,
        });
        const components = result.components as Record<string, any>;
        const matrixComp = components['matrix:output'];

        expect(matrixComp).toBeDefined();
        expect(matrixComp.properties.RGBA.data).toEqual(testMatrix);
    });

    it('creates matrix:output component with 2D array', () => {
        const testMatrix2D = [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
        ];
        const result = SessionGTOExporter.buildColorObject('colorNode', {
            outputMatrix: testMatrix2D,
        });
        const components = result.components as Record<string, any>;
        const matrixComp = components['matrix:output'];

        expect(matrixComp).toBeDefined();
        // Should be flattened
        expect(matrixComp.properties.RGBA.data).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    });

    it('does not create matrix:output component when not provided', () => {
        const result = SessionGTOExporter.buildColorObject('colorNode');
        const components = result.components as Record<string, any>;

        expect(components['matrix:output']).toBeUndefined();
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

    // OOR-EXP-001: Export outOfRange mode 2 → GTO value 1 (highlight mode maps to boolean true)
    it('OOR-EXP-001: exports outOfRange highlight mode (2) as GTO value 1', () => {
        // Internal mode 2 (highlight) should be exported as GTO value 1 (boolean true)
        // The caller is responsible for mapping mode 2 → 1 before passing to the exporter
        const result = SessionGTOExporter.buildDisplayColorObject('displayColorNode', {
            outOfRange: 1,
        });
        const components = result.components as Record<string, any>;
        const colorComp = components['color'];

        expect(colorComp.properties.outOfRange.data).toEqual([1]);
    });

    // OOR-EXP-002: Export outOfRange mode 0 → GTO value 0 (off mode maps to boolean false)
    it('OOR-EXP-002: exports outOfRange off mode (0) as GTO value 0', () => {
        const result = SessionGTOExporter.buildDisplayColorObject('displayColorNode', {
            outOfRange: 0,
        });
        const components = result.components as Record<string, any>;
        const colorComp = components['color'];

        expect(colorComp.properties.outOfRange.data).toEqual([0]);
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

describe('SessionGTOExporter.buildLayoutGroupObjects', () => {
    it('creates RVLayoutGroup and RVLayout objects', () => {
        const result = SessionGTOExporter.buildLayoutGroupObjects('layoutGroup');

        expect(result).toHaveLength(2);
        expect(result[0]!.name).toBe('layoutGroup');
        expect(result[0]!.protocol).toBe('RVLayoutGroup');
        expect(result[1]!.name).toBe('layoutGroup_layout');
        expect(result[1]!.protocol).toBe('RVLayout');
    });

    it('sets display name in ui component', () => {
        const result = SessionGTOExporter.buildLayoutGroupObjects('layoutGroup', {
            name: 'My Layout',
        });

        const groupComponents = result[0]!.components as Record<string, any>;
        expect(groupComponents['ui'].properties.name.data).toEqual(['My Layout']);
    });

    it('creates layout component with mode and spacing', () => {
        const result = SessionGTOExporter.buildLayoutGroupObjects('layoutGroup', {
            mode: 'grid',
            spacing: 2.0,
            gridRows: 2,
            gridColumns: 3,
        });

        const layoutComponents = result[1]!.components as Record<string, any>;
        const layoutComp = layoutComponents['layout'];

        expect(layoutComp.properties.mode.data).toEqual(['grid']);
        expect(layoutComp.properties.spacing.data).toEqual([2.0]);
        expect(layoutComp.properties.gridRows.data).toEqual([2]);
        expect(layoutComp.properties.gridColumns.data).toEqual([3]);
    });

    it('creates timing component with retimeInputs', () => {
        const result = SessionGTOExporter.buildLayoutGroupObjects('layoutGroup', {
            retimeInputs: true,
        });

        const layoutComponents = result[1]!.components as Record<string, any>;
        const timingComp = layoutComponents['timing'];

        expect(timingComp.properties.retimeInputs.data).toEqual([1]);
    });

    it('uses default values when settings not provided', () => {
        const result = SessionGTOExporter.buildLayoutGroupObjects('layoutGroup');

        const layoutComponents = result[1]!.components as Record<string, any>;
        const layoutComp = layoutComponents['layout'];

        expect(layoutComp.properties.mode.data).toEqual(['packed']);
        expect(layoutComp.properties.spacing.data).toEqual([1.0]);
        expect(layoutComp.properties.gridRows.data).toEqual([0]);
        expect(layoutComp.properties.gridColumns.data).toEqual([0]);
    });
});

describe('SessionGTOExporter.buildRetimeGroupObjects', () => {
    it('creates RVRetimeGroup and RVRetime objects', () => {
        const result = SessionGTOExporter.buildRetimeGroupObjects('retimeGroup');

        expect(result).toHaveLength(2);
        expect(result[0]!.name).toBe('retimeGroup');
        expect(result[0]!.protocol).toBe('RVRetimeGroup');
        expect(result[1]!.name).toBe('retimeGroup_retime');
        expect(result[1]!.protocol).toBe('RVRetime');
    });

    it('sets display name in ui component', () => {
        const result = SessionGTOExporter.buildRetimeGroupObjects('retimeGroup', {
            name: 'My Retime',
        });

        const groupComponents = result[0]!.components as Record<string, any>;
        expect(groupComponents['ui'].properties.name.data).toEqual(['My Retime']);
    });

    it('creates visual and audio components with scale and offset', () => {
        const result = SessionGTOExporter.buildRetimeGroupObjects('retimeGroup', {
            visualScale: 2.0,
            visualOffset: 10,
            audioScale: 1.5,
            audioOffset: 5,
        });

        const retimeComponents = result[1]!.components as Record<string, any>;

        expect(retimeComponents['visual'].properties.scale.data).toEqual([2.0]);
        expect(retimeComponents['visual'].properties.offset.data).toEqual([10]);
        expect(retimeComponents['audio'].properties.scale.data).toEqual([1.5]);
        expect(retimeComponents['audio'].properties.offset.data).toEqual([5]);
    });

    it('creates output component when outputFps provided', () => {
        const result = SessionGTOExporter.buildRetimeGroupObjects('retimeGroup', {
            outputFps: 30,
        });

        const retimeComponents = result[1]!.components as Record<string, any>;
        expect(retimeComponents['output'].properties.fps.data).toEqual([30]);
    });

    it('does not create output component when outputFps not provided', () => {
        const result = SessionGTOExporter.buildRetimeGroupObjects('retimeGroup');

        const retimeComponents = result[1]!.components as Record<string, any>;
        expect(retimeComponents['output']).toBeUndefined();
    });

    it('uses default values when settings not provided', () => {
        const result = SessionGTOExporter.buildRetimeGroupObjects('retimeGroup');

        const retimeComponents = result[1]!.components as Record<string, any>;

        expect(retimeComponents['visual'].properties.scale.data).toEqual([1.0]);
        expect(retimeComponents['visual'].properties.offset.data).toEqual([0.0]);
        expect(retimeComponents['audio'].properties.scale.data).toEqual([1.0]);
        expect(retimeComponents['audio'].properties.offset.data).toEqual([0.0]);
    });
});

describe('SessionGTOExporter.buildDisplayGroupObject', () => {
    it('creates RVDisplayGroup object with default name', () => {
        const result = SessionGTOExporter.buildDisplayGroupObject();

        expect(result.name).toBe('displayGroup');
        expect(result.protocol).toBe('RVDisplayGroup');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates RVDisplayGroup with custom name', () => {
        const result = SessionGTOExporter.buildDisplayGroupObject('myDisplayGroup', 'My Display');

        expect(result.name).toBe('myDisplayGroup');
        const components = result.components as Record<string, any>;
        expect(components['ui'].properties.name.data).toEqual(['My Display']);
    });

    it('creates ui component with display name', () => {
        const result = SessionGTOExporter.buildDisplayGroupObject('displayGroup', 'Main Display');

        const components = result.components as Record<string, any>;
        expect(components['ui']).toBeDefined();
        expect(components['ui'].properties.name.data).toEqual(['Main Display']);
    });
});

describe('SessionGTOExporter.buildHistogramObject', () => {
    it('creates Histogram object with default settings', () => {
        const result = SessionGTOExporter.buildHistogramObject('histogramNode');

        expect(result.name).toBe('histogramNode');
        expect(result.protocol).toBe('Histogram');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates Histogram with active state', () => {
        const result = SessionGTOExporter.buildHistogramObject('histogramNode', true);

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
    });

    it('creates Histogram with inactive state', () => {
        const result = SessionGTOExporter.buildHistogramObject('histogramNode', false);

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([0]);
    });
});

describe('SessionGTOExporter.buildSwitchGroupObjects', () => {
    it('creates RVSwitchGroup and RVSwitch objects', () => {
        const result = SessionGTOExporter.buildSwitchGroupObjects('switchGroup');

        expect(result).toHaveLength(2);
        expect(result[0]!.name).toBe('switchGroup');
        expect(result[0]!.protocol).toBe('RVSwitchGroup');
        expect(result[1]!.name).toBe('switchGroup_switch');
        expect(result[1]!.protocol).toBe('RVSwitch');
    });

    it('sets display name in ui component', () => {
        const result = SessionGTOExporter.buildSwitchGroupObjects('switchGroup', {
            name: 'My Switch',
        });

        const groupComponents = result[0]!.components as Record<string, any>;
        expect(groupComponents['ui'].properties.name.data).toEqual(['My Switch']);
    });

    it('creates output component with fps and autoSize', () => {
        const result = SessionGTOExporter.buildSwitchGroupObjects('switchGroup', {
            fps: 30.0,
            autoSize: false,
        });

        const switchComponents = result[1]!.components as Record<string, any>;
        const outputComp = switchComponents['output'];

        expect(outputComp.properties.fps.data).toEqual([30.0]);
        expect(outputComp.properties.autoSize.data).toEqual([0]);
    });

    it('creates output component with size and input', () => {
        const result = SessionGTOExporter.buildSwitchGroupObjects('switchGroup', {
            size: [1920, 1080],
            input: 'sourceGroup000000',
        });

        const switchComponents = result[1]!.components as Record<string, any>;
        const outputComp = switchComponents['output'];

        expect(outputComp.properties.input.data).toEqual(['sourceGroup000000']);
    });

    it('creates mode component with settings', () => {
        const result = SessionGTOExporter.buildSwitchGroupObjects('switchGroup', {
            useCutInfo: false,
            autoEDL: false,
            alignStartFrames: true,
        });

        const switchComponents = result[1]!.components as Record<string, any>;
        const modeComp = switchComponents['mode'];

        expect(modeComp.properties.useCutInfo.data).toEqual([0]);
        expect(modeComp.properties.autoEDL.data).toEqual([0]);
        expect(modeComp.properties.alignStartFrames.data).toEqual([1]);
    });

    it('uses default values when settings not provided', () => {
        const result = SessionGTOExporter.buildSwitchGroupObjects('switchGroup');

        const switchComponents = result[1]!.components as Record<string, any>;

        expect(switchComponents['output'].properties.fps.data).toEqual([0.0]);
        expect(switchComponents['output'].properties.autoSize.data).toEqual([1]);
        expect(switchComponents['mode'].properties.useCutInfo.data).toEqual([1]);
        expect(switchComponents['mode'].properties.autoEDL.data).toEqual([1]);
        expect(switchComponents['mode'].properties.alignStartFrames.data).toEqual([0]);
    });
});

describe('SessionGTOExporter.buildFolderGroupObjects', () => {
    it('creates RVFolderGroup object', () => {
        const result = SessionGTOExporter.buildFolderGroupObjects('folderGroup');

        expect(result).toHaveLength(1);
        expect(result[0]!.name).toBe('folderGroup');
        expect(result[0]!.protocol).toBe('RVFolderGroup');
    });

    it('sets display name in ui component', () => {
        const result = SessionGTOExporter.buildFolderGroupObjects('folderGroup', {
            name: 'My Folder',
        });

        const components = result[0]!.components as Record<string, any>;
        expect(components['ui'].properties.name.data).toEqual(['My Folder']);
    });

    it('sets viewType in mode component', () => {
        const result = SessionGTOExporter.buildFolderGroupObjects('folderGroup', {
            viewType: 'layout',
        });

        const components = result[0]!.components as Record<string, any>;
        expect(components['mode'].properties.viewType.data).toEqual(['layout']);
    });

    it('uses default values when settings not provided', () => {
        const result = SessionGTOExporter.buildFolderGroupObjects('folderGroup');

        const components = result[0]!.components as Record<string, any>;

        expect(components['ui'].properties.name.data).toEqual(['Folder']);
        expect(components['mode'].properties.viewType.data).toEqual(['switch']);
    });
});

describe('SessionGTOExporter.buildWaveformObject', () => {
    it('creates Waveform object with default settings', () => {
        const result = SessionGTOExporter.buildWaveformObject('waveformNode');

        expect(result.name).toBe('waveformNode');
        expect(result.protocol).toBe('Waveform');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates Waveform with active state', () => {
        const result = SessionGTOExporter.buildWaveformObject('waveformNode', true);

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
    });

    it('creates Waveform with inactive state', () => {
        const result = SessionGTOExporter.buildWaveformObject('waveformNode', false);

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([0]);
    });
});

describe('SessionGTOExporter.buildViewGroupObject', () => {
    it('creates RVViewGroup object with default name', () => {
        const result = SessionGTOExporter.buildViewGroupObject();

        expect(result.name).toBe('viewGroup');
        expect(result.protocol).toBe('RVViewGroup');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates RVViewGroup with custom name', () => {
        const result = SessionGTOExporter.buildViewGroupObject('myViewGroup', 'My View');

        expect(result.name).toBe('myViewGroup');
        const components = result.components as Record<string, any>;
        expect(components['ui'].properties.name.data).toEqual(['My View']);
    });
});

describe('SessionGTOExporter.buildSoundTrackObject', () => {
    it('creates RVSoundTrack object with default settings', () => {
        const result = SessionGTOExporter.buildSoundTrackObject('soundTrackNode');

        expect(result.name).toBe('soundTrackNode');
        expect(result.protocol).toBe('RVSoundTrack');
        expect(result.protocolVersion).toBe(1);
    });

    it('creates audio component with volume and balance', () => {
        const result = SessionGTOExporter.buildSoundTrackObject('soundTrackNode', {
            volume: 0.8,
            balance: -0.5,
            offset: 1.5,
        });

        const components = result.components as Record<string, any>;
        const audioComp = components['audio'];

        expect(audioComp.properties.volume.data).toEqual([0.8]);
        expect(audioComp.properties.balance.data).toEqual([-0.5]);
        expect(audioComp.properties.offset.data).toEqual([1.5]);
    });

    it('creates audio component with mute and softClamp', () => {
        const result = SessionGTOExporter.buildSoundTrackObject('soundTrackNode', {
            mute: true,
            softClamp: true,
        });

        const components = result.components as Record<string, any>;
        const audioComp = components['audio'];

        expect(audioComp.properties.mute.data).toEqual([1]);
        expect(audioComp.properties.softClamp.data).toEqual([1]);
    });

    it('creates visual component with waveform dimensions', () => {
        const result = SessionGTOExporter.buildSoundTrackObject('soundTrackNode', {
            waveformWidth: 800,
            waveformHeight: 200,
        });

        const components = result.components as Record<string, any>;
        const visualComp = components['visual'];

        expect(visualComp.properties.width.data).toEqual([800]);
        expect(visualComp.properties.height.data).toEqual([200]);
    });

    it('uses default values when settings not provided', () => {
        const result = SessionGTOExporter.buildSoundTrackObject('soundTrackNode');

        const components = result.components as Record<string, any>;

        expect(components['audio'].properties.volume.data).toEqual([1.0]);
        expect(components['audio'].properties.balance.data).toEqual([0.0]);
        expect(components['audio'].properties.mute.data).toEqual([0]);
        expect(components['visual'].properties.width.data).toEqual([0]);
        expect(components['visual'].properties.height.data).toEqual([0]);
    });
});

describe('SessionGTOExporter.buildOCIOObject', () => {
    it('creates RVOCIO object with default settings', () => {
        const result = SessionGTOExporter.buildOCIOObject('ocioNode');

        expect(result.name).toBe('ocioNode');
        expect(result.protocol).toBe('RVOCIO');

        const components = result.components as Record<string, any>;
        expect(components['ocio']).toBeDefined();
        expect(components['ocio'].properties.active.data).toEqual([1]);
        expect(components['color']).toBeDefined();
        expect(components['color'].properties.dither.data).toEqual([0]);
        expect(components['color'].properties.channelOrder.data).toEqual(['RGBA']);
    });

    it('creates RVOCIO object with colorspace settings', () => {
        const result = SessionGTOExporter.buildOCIOObject('ocioNode', {
            inColorSpace: 'ACES - ACEScg',
            outColorSpace: 'sRGB',
            function: 'color',
            lut3DSize: 64,
        });

        const components = result.components as Record<string, any>;
        expect(components['ocio'].properties.function.data).toEqual(['color']);
        expect(components['ocio'].properties.inColorSpace.data).toEqual(['ACES - ACEScg']);
        expect(components['ocio'].properties.lut3DSize.data).toEqual([64]);
        expect(components['ocio_color'].properties.outColorSpace.data).toEqual(['sRGB']);
    });

    it('creates RVOCIO object with look settings', () => {
        const result = SessionGTOExporter.buildOCIOObject('ocioNode', {
            look: 'FilmLook',
            lookDirection: 1,
            outColorSpace: 'Output - Rec.709',
        });

        const components = result.components as Record<string, any>;
        expect(components['ocio_look'].properties.look.data).toEqual(['FilmLook']);
        expect(components['ocio_look'].properties.direction.data).toEqual([1]);
        expect(components['ocio_look'].properties.outColorSpace.data).toEqual(['Output - Rec.709']);
    });

    it('creates RVOCIO object with display settings', () => {
        const result = SessionGTOExporter.buildOCIOObject('ocioNode', {
            display: 'sRGB',
            view: 'Standard',
            dither: true,
            channelOrder: 'BGRA',
        });

        const components = result.components as Record<string, any>;
        expect(components['ocio_display'].properties.display.data).toEqual(['sRGB']);
        expect(components['ocio_display'].properties.view.data).toEqual(['Standard']);
        expect(components['color'].properties.dither.data).toEqual([1]);
        expect(components['color'].properties.channelOrder.data).toEqual(['BGRA']);
    });

    it('creates RVOCIO object with transform URLs', () => {
        const result = SessionGTOExporter.buildOCIOObject('ocioNode', {
            inTransformUrl: '/path/to/input.csp',
            outTransformUrl: '/path/to/output.csp',
        });

        const components = result.components as Record<string, any>;
        expect(components['inTransform'].properties.url.data).toEqual(['/path/to/input.csp']);
        expect(components['outTransform'].properties.url.data).toEqual(['/path/to/output.csp']);
    });

    it('creates RVOCIO object with config settings', () => {
        const result = SessionGTOExporter.buildOCIOObject('ocioNode', {
            configDescription: 'ACES 1.2',
            workingDir: '/studio/ocio',
        });

        const components = result.components as Record<string, any>;
        expect(components['config'].properties.description.data).toEqual(['ACES 1.2']);
        expect(components['config'].properties.workingDir.data).toEqual(['/studio/ocio']);
    });

    it('disables OCIO when active is false', () => {
        const result = SessionGTOExporter.buildOCIOObject('ocioNode', {
            active: false,
        });

        const components = result.components as Record<string, any>;
        expect(components['ocio'].properties.active.data).toEqual([0]);
    });
});

describe('SessionGTOExporter.buildICCObject', () => {
    it('creates RVICCTransform object with default settings', () => {
        const result = SessionGTOExporter.buildICCObject('iccNode');

        expect(result.name).toBe('iccNode');
        expect(result.protocol).toBe('RVICCTransform');

        const components = result.components as Record<string, any>;
        expect(components['node']).toBeDefined();
        expect(components['node'].properties.active.data).toEqual([1]);
        expect(components['node'].properties.samples2D.data).toEqual([256]);
        expect(components['node'].properties.samples3D.data).toEqual([32]);
    });

    it('creates RVICCTransform object with custom samples', () => {
        const result = SessionGTOExporter.buildICCObject('iccNode', {
            samples2D: 512,
            samples3D: 64,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.samples2D.data).toEqual([512]);
        expect(components['node'].properties.samples3D.data).toEqual([64]);
    });

    it('creates RVICCTransform object with input profile', () => {
        const result = SessionGTOExporter.buildICCObject('iccNode', {
            inProfileUrl: '/path/to/input.icc',
            inProfileDescription: 'sRGB IEC61966-2.1',
        });

        const components = result.components as Record<string, any>;
        expect(components['inProfile'].properties.url.data).toEqual(['/path/to/input.icc']);
        expect(components['inProfile'].properties.description.data).toEqual(['sRGB IEC61966-2.1']);
    });

    it('creates RVICCTransform object with output profile', () => {
        const result = SessionGTOExporter.buildICCObject('iccNode', {
            outProfileUrl: '/path/to/output.icc',
            outProfileDescription: 'Display P3',
        });

        const components = result.components as Record<string, any>;
        expect(components['outProfile'].properties.url.data).toEqual(['/path/to/output.icc']);
        expect(components['outProfile'].properties.description.data).toEqual(['Display P3']);
    });

    it('creates RVICCTransform object with both profiles', () => {
        const result = SessionGTOExporter.buildICCObject('iccNode', {
            inProfileUrl: '/profiles/sRGB.icc',
            inProfileDescription: 'sRGB',
            outProfileUrl: '/profiles/P3.icc',
            outProfileDescription: 'Display P3',
        });

        const components = result.components as Record<string, any>;
        expect(components['inProfile'].properties.url.data).toEqual(['/profiles/sRGB.icc']);
        expect(components['inProfile'].properties.description.data).toEqual(['sRGB']);
        expect(components['outProfile'].properties.url.data).toEqual(['/profiles/P3.icc']);
        expect(components['outProfile'].properties.description.data).toEqual(['Display P3']);
    });

    it('disables ICC when active is false', () => {
        const result = SessionGTOExporter.buildICCObject('iccNode', {
            active: false,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([0]);
    });
});

describe('SessionGTOExporter.buildColorExposureObject', () => {
    it('creates RVColorExposure object with default settings', () => {
        const result = SessionGTOExporter.buildColorExposureObject('exposureNode');

        expect(result.name).toBe('exposureNode');
        expect(result.protocol).toBe('RVColorExposure');

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.active.data).toEqual([1]);
        expect(components['color'].properties.exposure.data).toEqual([0.0]);
    });

    it('creates RVColorExposure object with custom exposure', () => {
        const result = SessionGTOExporter.buildColorExposureObject('exposureNode', {
            exposure: 1.5,
        });

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.exposure.data).toEqual([1.5]);
    });
});

describe('SessionGTOExporter.buildColorCurveObject', () => {
    it('creates RVColorCurve object with default settings', () => {
        const result = SessionGTOExporter.buildColorCurveObject('curveNode');

        expect(result.name).toBe('curveNode');
        expect(result.protocol).toBe('RVColorCurve');

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.active.data).toEqual([1]);
        expect(components['color'].properties.contrast.data).toEqual([0.0]);
    });

    it('creates RVColorCurve object with custom contrast', () => {
        const result = SessionGTOExporter.buildColorCurveObject('curveNode', {
            contrast: 0.5,
        });

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.contrast.data).toEqual([0.5]);
    });
});

describe('SessionGTOExporter.buildColorTemperatureObject', () => {
    it('creates RVColorTemperature object with default settings', () => {
        const result = SessionGTOExporter.buildColorTemperatureObject('tempNode');

        expect(result.name).toBe('tempNode');
        expect(result.protocol).toBe('RVColorTemperature');

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.active.data).toEqual([1]);
        expect(components['color'].properties.inTemperature.data).toEqual([6500.0]);
        expect(components['color'].properties.outTemperature.data).toEqual([6500.0]);
        expect(components['color'].properties.method.data).toEqual([2]);
    });

    it('creates RVColorTemperature object with custom temperature', () => {
        const result = SessionGTOExporter.buildColorTemperatureObject('tempNode', {
            inTemperature: 5500,
            outTemperature: 7000,
            method: 1,
        });

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.inTemperature.data).toEqual([5500]);
        expect(components['color'].properties.outTemperature.data).toEqual([7000]);
        expect(components['color'].properties.method.data).toEqual([1]);
    });
});

describe('SessionGTOExporter.buildColorSaturationObject', () => {
    it('creates RVColorSaturation object with default settings', () => {
        const result = SessionGTOExporter.buildColorSaturationObject('satNode');

        expect(result.name).toBe('satNode');
        expect(result.protocol).toBe('RVColorSaturation');

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.saturation.data).toEqual([1.0]);
    });

    it('creates RVColorSaturation object with custom saturation', () => {
        const result = SessionGTOExporter.buildColorSaturationObject('satNode', {
            saturation: 1.5,
        });

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.saturation.data).toEqual([1.5]);
    });
});

describe('SessionGTOExporter.buildColorVibranceObject', () => {
    it('creates RVColorVibrance object with default settings', () => {
        const result = SessionGTOExporter.buildColorVibranceObject('vibNode');

        expect(result.name).toBe('vibNode');
        expect(result.protocol).toBe('RVColorVibrance');

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.vibrance.data).toEqual([0.0]);
    });

    it('creates RVColorVibrance object with custom vibrance', () => {
        const result = SessionGTOExporter.buildColorVibranceObject('vibNode', {
            vibrance: 0.7,
        });

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.vibrance.data).toEqual([0.7]);
    });
});

describe('SessionGTOExporter.buildColorShadowObject', () => {
    it('creates RVColorShadow object with default settings', () => {
        const result = SessionGTOExporter.buildColorShadowObject('shadowNode');

        expect(result.name).toBe('shadowNode');
        expect(result.protocol).toBe('RVColorShadow');

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.shadow.data).toEqual([0.0]);
    });

    it('creates RVColorShadow object with custom shadow', () => {
        const result = SessionGTOExporter.buildColorShadowObject('shadowNode', {
            shadow: -0.3,
        });

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.shadow.data).toEqual([-0.3]);
    });
});

describe('SessionGTOExporter.buildColorHighlightObject', () => {
    it('creates RVColorHighlight object with default settings', () => {
        const result = SessionGTOExporter.buildColorHighlightObject('highlightNode');

        expect(result.name).toBe('highlightNode');
        expect(result.protocol).toBe('RVColorHighlight');

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.highlight.data).toEqual([0.0]);
    });

    it('creates RVColorHighlight object with custom highlight', () => {
        const result = SessionGTOExporter.buildColorHighlightObject('highlightNode', {
            highlight: 0.4,
        });

        const components = result.components as Record<string, any>;
        expect(components['color'].properties.highlight.data).toEqual([0.4]);
    });
});

describe('SessionGTOExporter.buildColorGrayScaleObject', () => {
    it('creates RVColorGrayScale object with default (inactive)', () => {
        const result = SessionGTOExporter.buildColorGrayScaleObject('grayNode');

        expect(result.name).toBe('grayNode');
        expect(result.protocol).toBe('RVColorGrayScale');

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([0]);
    });

    it('creates RVColorGrayScale object when active', () => {
        const result = SessionGTOExporter.buildColorGrayScaleObject('grayNode', {
            active: true,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
    });
});

describe('SessionGTOExporter.buildColorCDLObject', () => {
    it('creates RVColorCDL object with default settings', () => {
        const result = SessionGTOExporter.buildColorCDLObject('cdlNode');

        expect(result.name).toBe('cdlNode');
        expect(result.protocol).toBe('RVColorCDL');

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
        expect(components['node'].properties.colorspace.data).toEqual(['rec709']);
        expect(components['node'].properties.slope.data).toEqual([1, 1, 1]);
        expect(components['node'].properties.offset.data).toEqual([0, 0, 0]);
        expect(components['node'].properties.power.data).toEqual([1, 1, 1]);
        expect(components['node'].properties.saturation.data).toEqual([1.0]);
    });

    it('creates RVColorCDL object with custom CDL values', () => {
        const result = SessionGTOExporter.buildColorCDLObject('cdlNode', {
            slope: [1.1, 1.0, 0.9],
            offset: [0.01, 0, -0.01],
            power: [1.0, 1.1, 1.0],
            saturation: 0.95,
            colorspace: 'aceslog',
            noClamp: true,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.slope.data).toEqual([1.1, 1.0, 0.9]);
        expect(components['node'].properties.offset.data).toEqual([0.01, 0, -0.01]);
        expect(components['node'].properties.power.data).toEqual([1.0, 1.1, 1.0]);
        expect(components['node'].properties.saturation.data).toEqual([0.95]);
        expect(components['node'].properties.colorspace.data).toEqual(['aceslog']);
        expect(components['node'].properties.noClamp.data).toEqual([1]);
    });

    it('creates RVColorCDL object with file reference', () => {
        const result = SessionGTOExporter.buildColorCDLObject('cdlNode', {
            file: '/path/to/grade.cdl',
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.file.data).toEqual(['/path/to/grade.cdl']);
    });
});

describe('SessionGTOExporter.buildColorLinearToSRGBObject', () => {
    it('creates RVColorLinearToSRGB object with default settings', () => {
        const result = SessionGTOExporter.buildColorLinearToSRGBObject('linearToSRGBNode');

        expect(result.name).toBe('linearToSRGBNode');
        expect(result.protocol).toBe('RVColorLinearToSRGB');

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
    });

    it('creates RVColorLinearToSRGB object when disabled', () => {
        const result = SessionGTOExporter.buildColorLinearToSRGBObject('linearToSRGBNode', {
            active: false,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([0]);
    });
});

describe('SessionGTOExporter.buildColorSRGBToLinearObject', () => {
    it('creates RVColorSRGBToLinear object with default settings', () => {
        const result = SessionGTOExporter.buildColorSRGBToLinearObject('srgbToLinearNode');

        expect(result.name).toBe('srgbToLinearNode');
        expect(result.protocol).toBe('RVColorSRGBToLinear');

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
    });

    it('creates RVColorSRGBToLinear object when disabled', () => {
        const result = SessionGTOExporter.buildColorSRGBToLinearObject('srgbToLinearNode', {
            active: false,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([0]);
    });
});

describe('SessionGTOExporter.buildFilterGaussianObject', () => {
    it('creates RVFilterGaussian object with default settings', () => {
        const result = SessionGTOExporter.buildFilterGaussianObject('gaussianNode');

        expect(result.name).toBe('gaussianNode');
        expect(result.protocol).toBe('RVFilterGaussian');

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.sigma.data).toEqual([0.03]);
        expect(components['node'].properties.radius.data).toEqual([10.0]);
    });

    it('creates RVFilterGaussian object with custom settings', () => {
        const result = SessionGTOExporter.buildFilterGaussianObject('gaussianNode', {
            sigma: 0.1,
            radius: 20.0,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.sigma.data).toEqual([0.1]);
        expect(components['node'].properties.radius.data).toEqual([20.0]);
    });
});

describe('SessionGTOExporter.buildUnsharpMaskObject', () => {
    it('creates RVUnsharpMask object with default settings', () => {
        const result = SessionGTOExporter.buildUnsharpMaskObject('unsharpNode');

        expect(result.name).toBe('unsharpNode');
        expect(result.protocol).toBe('RVUnsharpMask');

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
        expect(components['node'].properties.amount.data).toEqual([1.0]);
        expect(components['node'].properties.threshold.data).toEqual([5.0]);
        expect(components['node'].properties.unsharpRadius.data).toEqual([5.0]);
    });

    it('creates RVUnsharpMask object with custom settings', () => {
        const result = SessionGTOExporter.buildUnsharpMaskObject('unsharpNode', {
            amount: 2.0,
            threshold: 10.0,
            unsharpRadius: 8.0,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.amount.data).toEqual([2.0]);
        expect(components['node'].properties.threshold.data).toEqual([10.0]);
        expect(components['node'].properties.unsharpRadius.data).toEqual([8.0]);
    });
});

describe('SessionGTOExporter.buildNoiseReductionObject', () => {
    it('creates RVNoiseReduction object with default settings', () => {
        const result = SessionGTOExporter.buildNoiseReductionObject('noiseNode');

        expect(result.name).toBe('noiseNode');
        expect(result.protocol).toBe('RVNoiseReduction');

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
        expect(components['node'].properties.amount.data).toEqual([0.0]);
        expect(components['node'].properties.radius.data).toEqual([0.0]);
        expect(components['node'].properties.threshold.data).toEqual([5.0]);
    });

    it('creates RVNoiseReduction object with custom settings', () => {
        const result = SessionGTOExporter.buildNoiseReductionObject('noiseNode', {
            amount: 0.5,
            radius: 3.0,
            threshold: 8.0,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.amount.data).toEqual([0.5]);
        expect(components['node'].properties.radius.data).toEqual([3.0]);
        expect(components['node'].properties.threshold.data).toEqual([8.0]);
    });
});

describe('SessionGTOExporter.buildClarityObject', () => {
    it('creates RVClarity object with default settings', () => {
        const result = SessionGTOExporter.buildClarityObject('clarityNode');

        expect(result.name).toBe('clarityNode');
        expect(result.protocol).toBe('RVClarity');

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
        expect(components['node'].properties.amount.data).toEqual([0.0]);
        expect(components['node'].properties.radius.data).toEqual([20.0]);
    });

    it('creates RVClarity object with custom settings', () => {
        const result = SessionGTOExporter.buildClarityObject('clarityNode', {
            amount: 0.6,
            radius: 30.0,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.amount.data).toEqual([0.6]);
        expect(components['node'].properties.radius.data).toEqual([30.0]);
    });
});

describe('SessionGTOExporter.buildRotateCanvasObject', () => {
    it('creates RVRotateCanvas object with default settings', () => {
        const result = SessionGTOExporter.buildRotateCanvasObject('rotateNode');

        expect(result.name).toBe('rotateNode');
        expect(result.protocol).toBe('RVRotateCanvas');

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
        expect(components['node'].properties.degrees.data).toEqual([0.0]);
        expect(components['node'].properties.flipH.data).toEqual([0]);
        expect(components['node'].properties.flipV.data).toEqual([0]);
    });

    it('creates RVRotateCanvas object with rotation and flip', () => {
        const result = SessionGTOExporter.buildRotateCanvasObject('rotateNode', {
            degrees: 90,
            flipH: true,
            flipV: true,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.degrees.data).toEqual([90]);
        expect(components['node'].properties.flipH.data).toEqual([1]);
        expect(components['node'].properties.flipV.data).toEqual([1]);
    });
});

describe('SessionGTOExporter.buildResizeObject', () => {
    it('creates RVResize object with default settings', () => {
        const result = SessionGTOExporter.buildResizeObject('resizeNode');

        expect(result.name).toBe('resizeNode');
        expect(result.protocol).toBe('RVResize');

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
        expect(components['node'].properties.width.data).toEqual([0]);
        expect(components['node'].properties.height.data).toEqual([0]);
        expect(components['node'].properties.mode.data).toEqual([0]);
        expect(components['node'].properties.filter.data).toEqual([1]);
    });

    it('creates RVResize object with custom dimensions', () => {
        const result = SessionGTOExporter.buildResizeObject('resizeNode', {
            width: 1920,
            height: 1080,
            mode: 1,
            filter: 3,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.width.data).toEqual([1920]);
        expect(components['node'].properties.height.data).toEqual([1080]);
        expect(components['node'].properties.mode.data).toEqual([1]);
        expect(components['node'].properties.filter.data).toEqual([3]);
    });
});

describe('SessionGTOExporter.buildPrimaryConvertObject', () => {
    it('creates RVPrimaryConvert object with default settings', () => {
        const result = SessionGTOExporter.buildPrimaryConvertObject('primaryNode');

        expect(result.name).toBe('primaryNode');
        expect(result.protocol).toBe('RVPrimaryConvert');

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
        expect(components['node'].properties.inPrimaries.data).toEqual(['sRGB']);
        expect(components['node'].properties.outPrimaries.data).toEqual(['sRGB']);
    });

    it('creates RVPrimaryConvert object with custom primaries', () => {
        const result = SessionGTOExporter.buildPrimaryConvertObject('primaryNode', {
            inPrimaries: 'Rec709',
            outPrimaries: 'P3',
            adaptationMethod: 1,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.inPrimaries.data).toEqual(['Rec709']);
        expect(components['node'].properties.outPrimaries.data).toEqual(['P3']);
        expect(components['node'].properties.adaptationMethod.data).toEqual([1]);
    });
});

describe('SessionGTOExporter.buildDispTransform2DObject', () => {
    it('creates RVDispTransform2D object with default settings', () => {
        const result = SessionGTOExporter.buildDispTransform2DObject('transformNode');

        expect(result.name).toBe('transformNode');
        expect(result.protocol).toBe('RVDispTransform2D');

        const components = result.components as Record<string, any>;
        expect(components['transform'].properties.active.data).toEqual([1]);
        expect(components['transform'].properties.translate.data).toEqual([0, 0]);
        expect(components['transform'].properties.scale.data).toEqual([1, 1]);
        expect(components['transform'].properties.rotate.data).toEqual([0]);
    });

    it('creates RVDispTransform2D object with custom transform', () => {
        const result = SessionGTOExporter.buildDispTransform2DObject('transformNode', {
            translateX: 100,
            translateY: 50,
            scaleX: 2.0,
            scaleY: 1.5,
            rotate: 45,
        });

        const components = result.components as Record<string, any>;
        expect(components['transform'].properties.translate.data).toEqual([100, 50]);
        expect(components['transform'].properties.scale.data).toEqual([2.0, 1.5]);
        expect(components['transform'].properties.rotate.data).toEqual([45]);
    });
});

describe('SessionGTOExporter.buildTransform2DObject', () => {
    it('creates RVTransform2D object with default settings', () => {
        const result = SessionGTOExporter.buildTransform2DObject('transformNode');

        expect(result.name).toBe('transformNode');
        expect(result.protocol).toBe('RVTransform2D');

        const components = result.components as Record<string, any>;
        expect(components['transform'].properties.rotate.data).toEqual([0]);
        expect(components['transform'].properties.flip.data).toEqual([0]);
        expect(components['transform'].properties.flop.data).toEqual([0]);
        expect(components['transform'].properties.scale.data).toEqual([[1.0, 1.0]]);
        expect(components['transform'].properties.translate.data).toEqual([[0.0, 0.0]]);
    });

    it('creates RVTransform2D object with transform settings', () => {
        const result = SessionGTOExporter.buildTransform2DObject('transformNode', {
            rotate: 90,
            flip: true,
            flop: false,
            scale: [2.0, 1.5],
            translate: [0.1, -0.2],
        });

        const components = result.components as Record<string, any>;
        expect(components['transform'].properties.rotate.data).toEqual([90]);
        expect(components['transform'].properties.flip.data).toEqual([1]);
        expect(components['transform'].properties.flop.data).toEqual([0]);
        expect(components['transform'].properties.scale.data).toEqual([[2.0, 1.5]]);
        expect(components['transform'].properties.translate.data).toEqual([[0.1, -0.2]]);
    });

    it('creates visibleBox component when settings provided', () => {
        const result = SessionGTOExporter.buildTransform2DObject('transformNode', {
            visibleBox: {
                active: true,
                minX: 0.1,
                minY: 0.2,
                maxX: 0.9,
                maxY: 0.8,
            },
        });

        const components = result.components as Record<string, any>;
        expect(components['visibleBox'].properties.active.data).toEqual([1]);
        expect(components['visibleBox'].properties.minX.data).toEqual([0.1]);
        expect(components['visibleBox'].properties.minY.data).toEqual([0.2]);
        expect(components['visibleBox'].properties.maxX.data).toEqual([0.9]);
        expect(components['visibleBox'].properties.maxY.data).toEqual([0.8]);
    });

    it('creates stencil component when settings provided', () => {
        const result = SessionGTOExporter.buildTransform2DObject('transformNode', {
            stencil: {
                active: true,
                inverted: true,
                aspect: 1.778,
                softEdge: 0.05,
                ratio: 0.75,
            },
        });

        const components = result.components as Record<string, any>;
        expect(components['stencil'].properties.active.data).toEqual([1]);
        expect(components['stencil'].properties.inverted.data).toEqual([1]);
        expect(components['stencil'].properties.aspect.data).toEqual([1.778]);
        expect(components['stencil'].properties.softEdge.data).toEqual([0.05]);
        expect(components['stencil'].properties.ratio.data).toEqual([0.75]);
    });

    it('does not create visibleBox component when not provided', () => {
        const result = SessionGTOExporter.buildTransform2DObject('transformNode');
        const components = result.components as Record<string, any>;
        expect(components['visibleBox']).toBeUndefined();
    });

    it('does not create stencil component when not provided', () => {
        const result = SessionGTOExporter.buildTransform2DObject('transformNode');
        const components = result.components as Record<string, any>;
        expect(components['stencil']).toBeUndefined();
    });
});

describe('SessionGTOExporter.buildLensWarpObject', () => {
    it('creates RVLensWarp object with default settings', () => {
        const result = SessionGTOExporter.buildLensWarpObject('lensWarp');

        expect(result.name).toBe('lensWarp');
        expect(result.protocol).toBe('RVLensWarp');

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
        expect(components['warp'].properties.model.data).toEqual(['brown']);
        expect(components['warp'].properties.k1.data).toEqual([0]);
        expect(components['warp'].properties.k2.data).toEqual([0]);
        expect(components['warp'].properties.k3.data).toEqual([0]);
    });

    it('creates RVLensWarp object with basic distortion settings', () => {
        const result = SessionGTOExporter.buildLensWarpObject('lensWarp', {
            model: 'opencv',
            k1: 0.1,
            k2: 0.05,
            k3: 0.01,
            p1: 0.001,
            p2: 0.002,
            d: 1.1,
            pixelAspectRatio: 1.0,
            fx: 1.5,
            fy: 1.5,
        });

        const components = result.components as Record<string, any>;
        expect(components['warp'].properties.model.data).toEqual(['opencv']);
        expect(components['warp'].properties.k1.data).toEqual([0.1]);
        expect(components['warp'].properties.k2.data).toEqual([0.05]);
        expect(components['warp'].properties.k3.data).toEqual([0.01]);
        expect(components['warp'].properties.p1.data).toEqual([0.001]);
        expect(components['warp'].properties.p2.data).toEqual([0.002]);
        expect(components['warp'].properties.d.data).toEqual([1.1]);
        expect(components['warp'].properties.fx.data).toEqual([1.5]);
        expect(components['warp'].properties.fy.data).toEqual([1.5]);
    });

    it('creates RVLensWarp object with 3DE4 anamorphic settings', () => {
        const result = SessionGTOExporter.buildLensWarpObject('lensWarp', {
            model: '3de4_anamorphic',
            anamorphic: {
                squeeze: 2.0,
                squeezeX: 1.8,
                squeezeY: 1.0,
                anamorphicRotation: 0.5,
                lensRotation: 1.2,
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
        });

        const components = result.components as Record<string, any>;
        expect(components['warp'].properties.model.data).toEqual(['3de4_anamorphic']);
        expect(components['warp'].properties.squeeze.data).toEqual([2.0]);
        expect(components['warp'].properties.squeezeX.data).toEqual([1.8]);
        expect(components['warp'].properties.squeezeY.data).toEqual([1.0]);
        expect(components['warp'].properties.anamorphicRotation.data).toEqual([0.5]);
        expect(components['warp'].properties.lensRotation.data).toEqual([1.2]);
        expect(components['warp'].properties.cx02.data).toEqual([0.01]);
        expect(components['warp'].properties.cy02.data).toEqual([0.02]);
        expect(components['warp'].properties.cx22.data).toEqual([0.03]);
        expect(components['warp'].properties.cy22.data).toEqual([0.04]);
        expect(components['warp'].properties.cx04.data).toEqual([0.05]);
        expect(components['warp'].properties.cy04.data).toEqual([0.06]);
        expect(components['warp'].properties.cx24.data).toEqual([0.07]);
        expect(components['warp'].properties.cy24.data).toEqual([0.08]);
        expect(components['warp'].properties.cx44.data).toEqual([0.09]);
        expect(components['warp'].properties.cy44.data).toEqual([0.10]);
    });

    it('does not include anamorphic properties when not provided', () => {
        const result = SessionGTOExporter.buildLensWarpObject('lensWarp');
        const components = result.components as Record<string, any>;

        // Basic properties should exist
        expect(components['warp'].properties.model).toBeDefined();
        expect(components['warp'].properties.k1).toBeDefined();

        // Anamorphic properties should not exist
        expect(components['warp'].properties.squeeze).toBeUndefined();
        expect(components['warp'].properties.cx02).toBeUndefined();
    });
});

describe('SessionGTOExporter.buildPaintNodeObject', () => {
    it('creates RVPaint object with default settings', () => {
        const result = SessionGTOExporter.buildPaintNodeObject('paintNode');

        expect(result.name).toBe('paintNode');
        expect(result.protocol).toBe('RVPaint');

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
        expect(components['paint'].properties.show.data).toEqual([1]);
        expect(components['paint'].properties.nextId.data).toEqual([0]);
    });

    it('creates RVPaint object with frame filters', () => {
        const result = SessionGTOExporter.buildPaintNodeObject('paintNode', {
            active: true,
            show: true,
            nextId: 42,
            exclude: [10, 20, 30],
            include: [1, 5, 15],
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([1]);
        expect(components['paint'].properties.show.data).toEqual([1]);
        expect(components['paint'].properties.nextId.data).toEqual([42]);
        expect(components['paint'].properties.exclude.data).toEqual([10, 20, 30]);
        expect(components['paint'].properties.include.data).toEqual([1, 5, 15]);
    });

    it('does not include empty exclude/include arrays', () => {
        const result = SessionGTOExporter.buildPaintNodeObject('paintNode');
        const components = result.components as Record<string, any>;

        expect(components['paint'].properties.exclude).toBeUndefined();
        expect(components['paint'].properties.include).toBeUndefined();
    });

    it('creates inactive paint node when specified', () => {
        const result = SessionGTOExporter.buildPaintNodeObject('paintNode', {
            active: false,
            show: false,
        });

        const components = result.components as Record<string, any>;
        expect(components['node'].properties.active.data).toEqual([0]);
        expect(components['paint'].properties.show.data).toEqual([0]);
    });
});

describe('SessionGTOExporter.buildImageSourceObject', () => {
    it('creates RVImageSource object with default settings', () => {
        const result = SessionGTOExporter.buildImageSourceObject('imageSource');

        expect(result.name).toBe('imageSource');
        expect(result.protocol).toBe('RVImageSource');

        const components = result.components as Record<string, any>;
        expect(components['media'].properties.location.data).toEqual(['image']);
        expect(components['image'].properties.width.data).toEqual([640]);
        expect(components['image'].properties.height.data).toEqual([480]);
        expect(components['image'].properties.pixelAspect.data).toEqual([1.0]);
        expect(components['image'].properties.channels.data).toEqual(['RGBA']);
    });

    it('creates RVImageSource object with custom settings', () => {
        const result = SessionGTOExporter.buildImageSourceObject('imageSource', {
            name: 'Test Image',
            movie: '/path/to/image.exr',
            width: 1920,
            height: 1080,
            fps: 24,
            start: 1,
            end: 100,
            channels: 'RGB',
            bitsPerChannel: 16,
            isFloat: true,
        });

        const components = result.components as Record<string, any>;
        expect(components['media'].properties.name.data).toEqual(['Test Image']);
        expect(components['media'].properties.movie.data).toEqual(['/path/to/image.exr']);
        expect(components['image'].properties.width.data).toEqual([1920]);
        expect(components['image'].properties.height.data).toEqual([1080]);
        expect(components['image'].properties.fps.data).toEqual([24]);
        expect(components['image'].properties.start.data).toEqual([1]);
        expect(components['image'].properties.end.data).toEqual([100]);
        expect(components['image'].properties.channels.data).toEqual(['RGB']);
        expect(components['image'].properties.bitsPerChannel.data).toEqual([16]);
        expect(components['image'].properties.float.data).toEqual([1]);
    });

    it('creates RVImageSource object with cut points', () => {
        const result = SessionGTOExporter.buildImageSourceObject('imageSource', {
            cutIn: 10,
            cutOut: 50,
        });

        const components = result.components as Record<string, any>;
        expect(components['cut'].properties.in.data).toEqual([10]);
        expect(components['cut'].properties.out.data).toEqual([50]);
    });
});

describe('SessionGTOExporter.buildMovieSourceObject', () => {
    it('creates RVMovieSource object with default settings', () => {
        const result = SessionGTOExporter.buildMovieSourceObject('movieSource');

        expect(result.name).toBe('movieSource');
        expect(result.protocol).toBe('RVMovieSource');

        const components = result.components as Record<string, any>;
        expect(components['group'].properties.fps.data).toEqual([0.0]);
        expect(components['group'].properties.volume.data).toEqual([1.0]);
        expect(components['group'].properties.audioOffset.data).toEqual([0.0]);
        expect(components['group'].properties.balance.data).toEqual([0.0]);
        expect(components['group'].properties.noMovieAudio.data).toEqual([0]);
    });

    it('creates RVMovieSource object with custom settings', () => {
        const result = SessionGTOExporter.buildMovieSourceObject('movieSource', {
            name: 'Test Movie',
            movie: '/path/to/movie.mov',
            fps: 29.97,
            volume: 0.8,
            audioOffset: 0.5,
            balance: -0.3,
            noMovieAudio: true,
        });

        const components = result.components as Record<string, any>;
        expect(components['media'].properties.name.data).toEqual(['Test Movie']);
        expect(components['media'].properties.movie.data).toEqual(['/path/to/movie.mov']);
        expect(components['group'].properties.fps.data).toEqual([29.97]);
        expect(components['group'].properties.volume.data).toEqual([0.8]);
        expect(components['group'].properties.audioOffset.data).toEqual([0.5]);
        expect(components['group'].properties.balance.data).toEqual([-0.3]);
        expect(components['group'].properties.noMovieAudio.data).toEqual([1]);
    });

    it('creates RVMovieSource object with cut points', () => {
        const result = SessionGTOExporter.buildMovieSourceObject('movieSource', {
            cutIn: 100,
            cutOut: 500,
        });

        const components = result.components as Record<string, any>;
        expect(components['cut'].properties.in.data).toEqual([100]);
        expect(components['cut'].properties.out.data).toEqual([500]);
    });
});

describe('SessionGTOExporter Round-trip Export Tests', () => {
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
        paintEngine = new PaintEngine();
    });

    describe('Frame Increment export', () => {
        it('exports custom frameIncrement value', () => {
            session.frameIncrement = 5;

            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'testSession', 'defaultSequence');
            const components = result.components as Record<string, any>;

            expect(components['session'].properties.inc.data).toEqual([5]);
        });

        it('exports frameIncrement of 1 by default', () => {
            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'testSession', 'defaultSequence');
            const components = result.components as Record<string, any>;

            expect(components['session'].properties.inc.data).toEqual([1]);
        });

        it('exports high frameIncrement values', () => {
            session.frameIncrement = 50;

            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'testSession', 'defaultSequence');
            const components = result.components as Record<string, any>;

            expect(components['session'].properties.inc.data).toEqual([50]);
        });
    });

    describe('Matte Settings export', () => {
        it('exports matte settings when configured', () => {
            session.setMatteSettingsForTest({
                show: true,
                aspect: 2.35,
                opacity: 0.8,
                heightVisible: 0.5,
                centerPoint: [0.1, -0.2]
            });

            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'testSession', 'defaultSequence');
            const components = result.components as Record<string, any>;
            const matteComp = components['matte'];

            expect(matteComp.properties.show.data).toEqual([1]);
            expect(matteComp.properties.aspect.data).toEqual([2.35]);
            expect(matteComp.properties.opacity.data).toEqual([0.8]);
            expect(matteComp.properties.heightVisible.data).toEqual([0.5]);
            expect(matteComp.properties.centerPoint.data).toEqual([[0.1, -0.2]]);
        });

        it('exports matte show=false correctly', () => {
            session.setMatteSettingsForTest({
                show: false,
                aspect: 1.78,
                opacity: 0.66,
                heightVisible: -1.0,
                centerPoint: [0, 0]
            });

            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'testSession', 'defaultSequence');
            const components = result.components as Record<string, any>;

            expect(components['matte'].properties.show.data).toEqual([0]);
        });

        it('exports default matte values when not set', () => {
            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'testSession', 'defaultSequence');
            const components = result.components as Record<string, any>;
            const matteComp = components['matte'];

            expect(matteComp.properties.show.data).toEqual([0]);
            expect(matteComp.properties.aspect.data).toEqual([1.78]);
            expect(matteComp.properties.opacity.data).toEqual([0.66]);
            expect(matteComp.properties.heightVisible.data).toEqual([-1.0]);
            expect(matteComp.properties.centerPoint.data).toEqual([[0, 0]]);
        });
    });

    describe('Paint Effects export', () => {
        it('exports paint effects when configured', () => {
            // Set paint effects on the paint engine (source of truth for export)
            paintEngine.setGhostMode(true, 7, 10);
            paintEngine.setHoldMode(true);

            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'testSession', 'defaultSequence');
            const components = result.components as Record<string, any>;
            const paintComp = components['paintEffects'];

            expect(paintComp.properties.hold.data).toEqual([1]);
            expect(paintComp.properties.ghost.data).toEqual([1]);
            expect(paintComp.properties.ghostBefore.data).toEqual([7]);
            expect(paintComp.properties.ghostAfter.data).toEqual([10]);
        });

        it('exports paint effects disabled state', () => {
            // Set paint effects on the paint engine (source of truth for export)
            paintEngine.setGhostMode(false, 3, 3);
            paintEngine.setHoldMode(false);

            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'testSession', 'defaultSequence');
            const components = result.components as Record<string, any>;
            const paintComp = components['paintEffects'];

            expect(paintComp.properties.hold.data).toEqual([0]);
            expect(paintComp.properties.ghost.data).toEqual([0]);
        });

        it('exports default paint effects when not set', () => {
            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'testSession', 'defaultSequence');
            const components = result.components as Record<string, any>;
            const paintComp = components['paintEffects'];

            expect(paintComp.properties.hold.data).toEqual([0]);
            expect(paintComp.properties.ghost.data).toEqual([0]);
            // PaintEngine defaults: ghostBefore=3, ghostAfter=3
            expect(paintComp.properties.ghostBefore.data).toEqual([3]);
            expect(paintComp.properties.ghostAfter.data).toEqual([3]);
        });
    });

    describe('Session Metadata export', () => {
        it('exports custom metadata values', () => {
            session.setMetadataForTest({
                displayName: 'My Custom Session',
                comment: 'Test comment for round-trip',
                version: 3,
                origin: 'custom-tool',
                creationContext: 42,
                clipboard: 7,
                membershipContains: ['node1', 'node2']
            });

            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'testSession', 'defaultSequence');
            const components = result.components as Record<string, any>;

            expect(components['session'].properties.version.data).toEqual([3]);
            expect(components['session'].properties.clipboard.data).toEqual([7]);
            expect(components['root'].properties.name.data).toEqual(['My Custom Session']);
            expect(components['root'].properties.comment.data).toEqual(['Test comment for round-trip']);
            expect(components['internal'].properties.creationContext.data).toEqual([42]);
            expect(components['node'].properties.origin.data).toEqual(['custom-tool']);
            expect(components['membership'].properties.contains.data).toEqual(['node1', 'node2']);
        });

        it('exports default metadata values', () => {
            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'testSession', 'defaultSequence');
            const components = result.components as Record<string, any>;

            expect(components['session'].properties.version.data).toEqual([2]);
            expect(components['session'].properties.clipboard.data).toEqual([0]);
            expect(components['root'].properties.name.data).toEqual(['testSession']);
            expect(components['internal'].properties.creationContext.data).toEqual([0]);
            expect(components['node'].properties.origin.data).toEqual(['openrv-web']);
        });

        it('uses name parameter when displayName is empty', () => {
            session.setMetadataForTest({
                displayName: '',
                comment: '',
                version: 2,
                origin: 'openrv-web',
                creationContext: 0,
                clipboard: 0,
                membershipContains: []
            });

            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'fallbackName', 'defaultSequence');
            const components = result.components as Record<string, any>;

            expect(components['root'].properties.name.data).toEqual(['fallbackName']);
        });

        it('uses comment parameter when metadata comment is empty', () => {
            session.setMetadataForTest({
                displayName: 'Test',
                comment: '',
                version: 2,
                origin: 'openrv-web',
                creationContext: 0,
                clipboard: 0,
                membershipContains: []
            });

            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'testSession', 'defaultSequence', 'fallback comment');
            const components = result.components as Record<string, any>;

            expect(components['root'].properties.comment.data).toEqual(['fallback comment']);
        });
    });

    describe('Complete round-trip simulation', () => {
        it('exports all custom values correctly for a complete session', () => {
            // Set up session with all custom values
            session.frameIncrement = 8;
            session.goToFrame(42);
            session.toggleMark(10);
            session.toggleMark(90);

            session.setMatteSettingsForTest({
                show: true,
                aspect: 2.39,
                opacity: 0.75,
                heightVisible: 0.9,
                centerPoint: [0.05, 0.1]
            });

            // Set paint effects on the paint engine (source of truth for export)
            paintEngine.setGhostMode(true, 4, 6);
            paintEngine.setHoldMode(true);

            session.setMetadataForTest({
                displayName: 'Complete Test Session',
                comment: 'Testing full round-trip export',
                version: 5,
                origin: 'test-suite',
                creationContext: 99,
                clipboard: 3,
                membershipContains: ['group1', 'group2', 'group3']
            });

            const result = SessionGTOExporter.buildSessionObject(session, paintEngine, 'exportTest', 'defaultSequence');
            const components = result.components as Record<string, any>;

            // Verify session component
            expect(components['session'].properties.inc.data).toEqual([8]);
            expect(components['session'].properties.frame.data).toEqual([42]);
            expect(components['session'].properties.currentFrame.data).toEqual([42]);
            expect(components['session'].properties.version.data).toEqual([5]);
            expect(components['session'].properties.clipboard.data).toEqual([3]);

            // Verify marks
            const marksData = components['session'].properties.marks.data;
            expect(marksData).toContain(10);
            expect(marksData).toContain(90);

            // Verify root component
            expect(components['root'].properties.name.data).toEqual(['Complete Test Session']);
            expect(components['root'].properties.comment.data).toEqual(['Testing full round-trip export']);

            // Verify matte component
            expect(components['matte'].properties.show.data).toEqual([1]);
            expect(components['matte'].properties.aspect.data).toEqual([2.39]);
            expect(components['matte'].properties.opacity.data).toEqual([0.75]);
            expect(components['matte'].properties.heightVisible.data).toEqual([0.9]);
            expect(components['matte'].properties.centerPoint.data).toEqual([[0.05, 0.1]]);

            // Verify paintEffects component
            expect(components['paintEffects'].properties.hold.data).toEqual([1]);
            expect(components['paintEffects'].properties.ghost.data).toEqual([1]);
            expect(components['paintEffects'].properties.ghostBefore.data).toEqual([4]);
            expect(components['paintEffects'].properties.ghostAfter.data).toEqual([6]);

            // Verify internal component
            expect(components['internal'].properties.creationContext.data).toEqual([99]);

            // Verify node component
            expect(components['node'].properties.origin.data).toEqual(['test-suite']);

            // Verify membership component
            expect(components['membership'].properties.contains.data).toEqual(['group1', 'group2', 'group3']);
        });

        it('preserves session values through export when session has loaded values', () => {
            // Simulate a session that was loaded from a file with specific values
            session.frameIncrement = 10;
            session.setMatteSettingsForTest({
                show: true,
                aspect: 1.85,
                opacity: 0.5,
                heightVisible: -1,
                centerPoint: [-0.1, 0.2]
            });
            // Set paint effects on the paint engine (source of truth for export)
            paintEngine.setGhostMode(true, 2, 8);
            paintEngine.setHoldMode(false);
            session.setMetadataForTest({
                displayName: 'Loaded Session',
                comment: 'This was loaded from a file',
                version: 4,
                origin: 'rv-desktop',
                creationContext: 1,
                clipboard: 0,
                membershipContains: []
            });

            // Export the session
            const exported = SessionGTOExporter.buildSessionObject(session, paintEngine, 'loadedSession', 'defaultSequence');
            const components = exported.components as Record<string, any>;

            // Verify the exported data matches what was loaded
            expect(components['session'].properties.inc.data).toEqual([10]);
            expect(components['matte'].properties.show.data).toEqual([1]);
            expect(components['matte'].properties.aspect.data).toEqual([1.85]);
            expect(components['matte'].properties.centerPoint.data).toEqual([[-0.1, 0.2]]);
            expect(components['paintEffects'].properties.ghost.data).toEqual([1]);
            expect(components['paintEffects'].properties.ghostBefore.data).toEqual([2]);
            expect(components['paintEffects'].properties.ghostAfter.data).toEqual([8]);
            expect(components['root'].properties.name.data).toEqual(['Loaded Session']);
            expect(components['node'].properties.origin.data).toEqual(['rv-desktop']);
        });
    });
});
