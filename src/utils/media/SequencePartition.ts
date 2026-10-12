/**
 * Grouping of dropped / picked files into image sequences.
 */

import { discoverSequences } from './SequenceLoader';

/**
 * Split a list of files into every detected image sequence (2+ frames) and
 * the remaining files. Sequences are ordered by the position of their first
 * frame in the input; remaining files keep their input order. Used by the
 * drop and file-picker handlers so several sequences loaded together each
 * become their own source.
 */
export function partitionSequences(files: File[]): { sequences: File[][]; others: File[] } {
  const sequences = Array.from(discoverSequences(files).values());
  const inSequence = new Set<File>();
  for (const seq of sequences) {
    for (const f of seq) inSequence.add(f);
  }
  return { sequences, others: files.filter((f) => !inSequence.has(f)) };
}
