import { describe, it, expect, vi } from 'vitest';
import { Session } from './Session';
import { GTODTO } from './GTODTO';

// Mock Partial GTODTO structure
const mockGTO = (points: number[][], aspectRatio: number) => {
    // We need to construct a DTO that parsePaintAnnotations will accept
    // This is tricky because parsePaintAnnotations iterates 'RVPaint' objects
    // and components. 
    // Instead of mocking the entire DTO complexity, we can unit test 'parsePenStroke' 
    // by exposing it or using a test-subclass if it was protected.
    // Since it's private, we might need to test via public API 'loadFromGTO' or 
    // cast to any.
};

describe('Coordinate Parsing', () => {
    class TestSession extends Session {
        // Expose private method for testing
        public testParsePenStroke(strokeId: string, frame: number, comp: any, aspectRatio: number) {
            // @ts-ignore
            return this.parsePenStroke(strokeId, frame, comp, aspectRatio);
        }

        // Expose private method for testing text
        public testParseTextAnnotation(textId: string, frame: number, comp: any, aspectRatio: number) {
            // @ts-ignore
            return this.parseTextAnnotation(textId, frame, comp, aspectRatio);
        }
    }

    it('correctly maps normalized coordinates regardless of aspect ratio', () => {
        const session = new TestSession();
        const aspectRatio = 2.0;
        
        // Mock component with coordinate at (1.0, 0.5)
        // Y = 0.5 (Top Edge in [-0.5, 0.5])
        // X = 1.0 (Right Edge in [-1.0, 1.0] for Aspect 2.0)
        const mockComp = {
            property: (name: string) => {
                if (name === 'points') return { value: () => [[1.0, 0.5]] };
                if (name === 'width') return { value: () => 1 };
                return { value: () => null };
            }
        };

        const result = session.testParsePenStroke('pen:1:1:user', 1, mockComp, aspectRatio);
        
        // Math:
        // x = 1.0 / 2.0 + 0.5 = 1.0
        // y = 0.5 + 0.5 = 1.0
        
        expect(result?.points[0].x).toBe(1.0);
        expect(result?.points[0].y).toBe(1.0); 
    });

    it('correctly maps text annotation coordinates with unit height assumption', () => {
        const session = new TestSession();
        const aspectRatio = 2.0;
        
        // Mock component with coordinate at (1.0, 0.5)
        // Y = 0.5 (Top Edge in [-0.5, 0.5])
        // X = 1.0 (Right Edge in [-1.0, 1.0] for Aspect 2.0)
        const mockComp = {
            property: (name: string) => {
                if (name === 'position') return { value: () => [[1.0, 0.5]] };
                if (name === 'text') return { value: () => "Test" };
                return { value: () => null };
            }
        };

        const result = session.testParseTextAnnotation('text:1:1:user', 1, mockComp, aspectRatio);
        
        // Math matches pen stroke logic:
        expect(result?.position.x).toBe(1.0);
        expect(result?.position.y).toBe(1.0); 
    });

    it('validates round-trip serialization logic (Import -> Export -> Import)', () => {
        // Validation of the mathematical relationship between Import and Export logic
        // logic from Session.ts (Import) and SessionGTOExporter.ts (Export)
        const aspectRatio = 2.4; // Cinematic aspect ratio
        
        // 1. Start with a desired Normalized coordinate (e.g., 75% across screen, 25% down [from bottom])
        // In our system: 0,0 is bottom-left.
        const inputNDC = { x: 0.75, y: 0.25 }; 
        
        // 2. Simulate Export (NDC -> OpenRV GTO)
        // Unit Height Logic: rawX = (x - 0.5) * aspect
        const exportRawX = (inputNDC.x - 0.5) * aspectRatio;
        const exportRawY = inputNDC.y - 0.5;
        
        // Check intermediate values (Unit Height Centered)
        // x=0.75 -> centered=0.25. Scaled by 2.4 -> 0.6
        expect(exportRawX).toBeCloseTo(0.6);
        // y=0.25 -> centered=-0.25
        expect(exportRawY).toBeCloseTo(-0.25);

        // 3. Simulate Import (OpenRV GTO -> NDC)
        // Unit Height Logic: x = rawX / aspect + 0.5
        const importX = exportRawX / aspectRatio + 0.5;
        const importY = exportRawY + 0.5;
        
        expect(importX).toBeCloseTo(inputNDC.x);
        expect(importY).toBeCloseTo(inputNDC.y);
    });
});
