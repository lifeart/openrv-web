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
});
