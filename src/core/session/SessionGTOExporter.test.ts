import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionGTOExporter } from './SessionGTOExporter';
import { Session } from './Session';
import { PaintEngine } from '../../paint/PaintEngine';
import type { GTOData } from 'gto-js';
import { Graph } from '../graph/Graph';

describe('SessionGTOExporter', () => {
    let mockSession: Session;
    let mockPaintEngine: PaintEngine;
    let mockGraph: Graph;

    beforeEach(() => {
        // Mock Session
         const mockPlayback = {
            currentFrame: 10,
            inPoint: 1,
            outPoint: 100,
            fps: 24,
            marks: new Set([5, 15]),
            isPlaying: false
        };

        mockSession = {
            getPlaybackState: vi.fn().mockReturnValue(mockPlayback),
            allSources: [{ width: 1920, height: 1080 }],
            graph: {
                getNode: vi.fn(),
                nodes: { get: vi.fn() } // fallback if private access
            } as unknown as Graph
        } as unknown as Session;

        // Mock PaintEngine
         mockPaintEngine = {
            toJSON: vi.fn().mockReturnValue({
                nextId: 1,
                show: true,
                frames: {},
                effects: { ghost: false }
            })
        } as unknown as PaintEngine;
    });

    it('updates original GTO data with preserved paths', () => {
        // Original GTO structure mimicking a loaded file
        const originalGTO: GTOData = {
            version: 4,
            objects: [
                {
                    name: 'sourceNode',
                    protocol: 'RVFileSource',
                    components: [
                        {
                            name: 'media',
                            properties: [
                                { name: 'movie', value: '/old/path.mp4' }
                            ]
                        }
                    ]
                },
                {
                    name: 'session',
                    protocol: 'RVSession',
                    components: [
                        {
                            name: 'session',
                            properties: [
                                { name: 'frame', value: 1 }
                            ]
                        }
                    ]
                }
            ]
        };

        // Setup session with updated path
        const mockNode = {
            type: 'RVFileSource',
            properties: {
                getValue: vi.fn((key) => {
                    if (key === 'originalUrl') return '/new/preserved/path.mp4';
                    return undefined;
                })
            }
        };

        vi.mocked(mockSession.graph!.getNode).mockReturnValue(mockNode as any);

        const updatedGTO = SessionGTOExporter.updateGTOData(originalGTO, mockSession, mockPaintEngine);

        // Check RVFileSource update
        const sourceObj = updatedGTO.objects.find(o => o.name === 'sourceNode');
        expect(sourceObj).toBeDefined();
        const mediaComp = sourceObj?.components.find(c => c.name === 'media');
        const movieProp = mediaComp?.properties.find(p => p.name === 'movie');
        
        expect(movieProp?.value).toBe('/new/preserved/path.mp4');

        // Check RVSession update
        const sessionObj = updatedGTO.objects.find(o => o.protocol === 'RVSession');
        const sessionComp = sessionObj?.components.find(c => c.name === 'session');
        const frameProp = sessionComp?.properties.find(p => p.name === 'frame');
        
        expect(frameProp?.value).toBe(10); // Updated to currentFrame from mockPlayback
    });
});
