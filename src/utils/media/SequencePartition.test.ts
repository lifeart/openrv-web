import { describe, it, expect } from 'vitest';
import { partitionSequences } from './SequencePartition';

describe('partitionSequences', () => {
  it('SLD-PART-001: returns every sequence plus the files outside them', () => {
    const a1 = new File([''], 'shot_001.exr');
    const a2 = new File([''], 'shot_002.exr');
    const b1 = new File([''], 'plate.0001.dpx');
    const b2 = new File([''], 'plate.0002.dpx');
    const b3 = new File([''], 'plate.0003.dpx');
    const movie = new File([''], 'ref.mov');
    const lone = new File([''], 'slate.png');

    const { sequences, others } = partitionSequences([b2, a1, movie, b1, a2, lone, b3]);

    expect(sequences).toEqual([
      [b1, b2, b3],
      [a1, a2],
    ]);
    expect(others).toEqual([movie, lone]);
  });

  it('SLD-PART-002: returns no sequences for unrelated files', () => {
    const files = [new File([''], 'a.png'), new File([''], 'b.jpg')];
    expect(partitionSequences(files)).toEqual({ sequences: [], others: files });
  });
});
