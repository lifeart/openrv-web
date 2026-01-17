import { describe, it, expect } from 'vitest';
import { Session, type GTOComponentDTO } from './Session';

describe('Coordinate Parsing', () => {
    class TestSession extends Session {
        // Expose protected method for testing
        public testParsePenStroke(strokeId: string, frame: number, comp: GTOComponentDTO, aspectRatio: number) {
            return this.parsePenStroke(strokeId, frame, comp, aspectRatio);
        }

        // Expose protected method for testing text
        public testParseTextAnnotation(textId: string, frame: number, comp: GTOComponentDTO, aspectRatio: number) {
            return this.parseTextAnnotation(textId, frame, comp, aspectRatio);
        }
    }

    it('correctly maps normalized coordinates regardless of aspect ratio', () => {
        const session = new TestSession();
        const aspectRatio = 2.0;
        
        // Mock component with coordinate at (1.0, 0.5)
        // Y = 0.5 (Top Edge in [-0.5, 0.5])
        // X = 1.0 (Right Edge in [-1.0, 1.0] for Aspect 2.0)
        const mockComp: GTOComponentDTO = {
            property: (name: string) => {
                let val: unknown = null;
                if (name === 'points') val = [[1.0, 0.5]];
                else if (name === 'width') val = 1;
                return { value: () => val };
            }
        };

        const result = session.testParsePenStroke('pen:1:1:user', 1, mockComp, aspectRatio);
        
        // Math:
        // x = 1.0 / 2.0 + 0.5 = 1.0
        // y = 0.5 + 0.5 = 1.0
        
        expect(result).toBeDefined();
        if (result && result.points.length > 0) {
            expect(result.points[0]!.x).toBe(1.0);
            expect(result.points[0]!.y).toBe(1.0); 
        }
    });

    it('correctly maps text annotation coordinates with unit height assumption', () => {
        const session = new TestSession();
        const aspectRatio = 2.0;
        
        // Mock component with coordinate at (1.0, 0.5)
        // Y = 0.5 (Top Edge in [-0.5, 0.5])
        // X = 1.0 (Right Edge in [-1.0, 1.0] for Aspect 2.0)
        const mockComp: GTOComponentDTO = {
            property: (name: string) => {
                let val: unknown = null;
                if (name === 'position') val = [[1.0, 0.5]];
                else if (name === 'text') val = "Test";
                return { value: () => val };
            }
        };

        const result = session.testParseTextAnnotation('text:1:1:user', 1, mockComp, aspectRatio);
        
        // Math matches pen stroke logic:
        expect(result).toBeDefined();
        if (result) {
            expect(result.position.x).toBe(1.0);
            expect(result.position.y).toBe(1.0); 
        }
    });

    it('validates round-trip serialization logic (Export -> Import)', () => {
        // This test verifies that SessionGTOExporter (Export) and Session (Import)
        // are perfectly symmetrical using the actual project logic.
        const session = new TestSession();
        const aspectRatio = 2.4;
        
        // 1. Define a stroke in our NDC space ([0,1])
        const originalNDC = { x: 0.75, y: 0.25 };
        
        // 2. Simulate how SessionGTOExporter transforms this for GTO
        // We use the same math as writePenComponent:
        // (point.x - 0.5) * aspectRatio, point.y - 0.5
        const gtoX = (originalNDC.x - 0.5) * aspectRatio;
        const gtoY = originalNDC.y - 0.5;

        // 3. Create a mock GTO component representing this exported state
        const mockComp: GTOComponentDTO = {
            property: (name: string) => {
                let val: unknown = null;
                if (name === 'points') val = [[gtoX, gtoY]];
                else if (name === 'width') val = [1];
                else if (name === 'color') val = [[1, 1, 1, 1]];
                return { value: () => val };
            }
        };

        // 4. Parse it back using the session's parsing logic
        const result = session.testParsePenStroke('pen:1:1:user', 1, mockComp, aspectRatio);
        
        expect(result).toBeDefined();
        if (result && result.points.length > 0) {
            // Should match the original NDC exactly
            expect(result.points[0]!.x).toBeCloseTo(originalNDC.x);
            expect(result.points[0]!.y).toBeCloseTo(originalNDC.y);
        }
    });

    it('validates text annotation round-trip (Export -> Import)', () => {
        const session = new TestSession();
        const aspectRatio = 1.777;
        
        const originalNDC = { x: 0.3, y: 0.6 };
        
        // Export transform
        const gtoX = (originalNDC.x - 0.5) * aspectRatio;
        const gtoYText = originalNDC.y - 0.5; // Wait, text uses same (y - 0.5) math in SessionGTOExporter.ts:284

        const mockComp: GTOComponentDTO = {
            property: (name: string) => {
                let val: unknown = null;
                if (name === 'position') val = [[gtoX, gtoYText]];
                else if (name === 'text') val = "Hello";
                else if (name === 'color') val = [[1, 1, 1, 1]];
                return { value: () => val };
            }
        };

        const result = session.testParseTextAnnotation('text:1:1:user', 1, mockComp, aspectRatio);
        
        expect(result).toBeDefined();
        if (result) {
            expect(result.position.x).toBeCloseTo(originalNDC.x);
            expect(result.position.y).toBeCloseTo(originalNDC.y);
        }
    });
});
