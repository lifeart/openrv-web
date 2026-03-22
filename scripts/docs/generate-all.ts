/**
 * Main documentation generation orchestrator.
 *
 * Runs all 6 documentation generators and prints a summary report.
 */

import * as fs from 'fs';
import * as path from 'path';
import { projectRoot } from './utils.js';
import { generateShortcuts } from './generate-shortcuts.js';
import { generateFormats } from './generate-formats.js';
import { generateFeatures } from './generate-features.js';
import { generateNodes } from './generate-nodes.js';
import { generateEffects } from './generate-effects.js';
import { generateEvents } from './generate-events.js';

interface GeneratorResult {
  name: string;
  file: string;
  count: number;
  label: string;
  ok: boolean;
  error?: string;
}

async function main() {
  const isCheck = process.argv.includes('--check');

  // Ensure output directory exists
  const outDir = path.join(projectRoot, 'docs', 'generated');
  fs.mkdirSync(outDir, { recursive: true });

  const results: GeneratorResult[] = [];

  // Define generators
  const generators: Array<{
    name: string;
    file: string;
    label: string;
    run: () => { count: number };
  }> = [
    { name: 'Keyboard Shortcuts', file: 'keyboard-shortcuts.md', label: 'shortcuts', run: generateShortcuts },
    { name: 'Format Support', file: 'format-support.md', label: 'formats', run: generateFormats },
    { name: 'Feature Comparison', file: 'feature-comparison.md', label: 'features', run: generateFeatures },
    { name: 'Node Catalog', file: 'node-catalog.md', label: 'nodes', run: generateNodes },
    { name: 'Effect Catalog', file: 'effect-catalog.md', label: 'effects', run: generateEffects },
    { name: 'Event Reference', file: 'event-reference.md', label: 'events', run: generateEvents },
  ];

  for (const gen of generators) {
    try {
      const result = gen.run();
      results.push({
        name: gen.name,
        file: gen.file,
        count: result.count,
        label: gen.label,
        ok: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[FAIL] ${gen.name}: ${message}`);
      results.push({
        name: gen.name,
        file: gen.file,
        count: 0,
        label: gen.label,
        ok: false,
        error: message,
      });
    }
  }

  // Print summary
  console.log('\n');
  console.log('Documentation Generation Complete');
  console.log('==================================');
  for (const r of results) {
    const status = r.ok ? '[OK]  ' : '[FAIL]';
    const padFile = r.file.padEnd(28);
    const countStr = r.ok ? `(${r.count} ${r.label})` : `(${r.error})`;
    console.log(`${status} ${padFile} ${countStr}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`\n${failed.length} generator(s) failed.`);
    process.exit(1);
  }

  if (isCheck) {
    console.log('\n--check mode: all generators completed successfully.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
