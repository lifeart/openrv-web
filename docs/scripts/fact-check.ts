/**
 * Fact-checking script for generated documentation.
 *
 * Extracts method/property names from generated markdown documents (backtick-wrapped
 * identifiers) and verifies they exist in the corresponding source files.
 *
 * Usage:
 *   npx tsx docs/scripts/fact-check.ts [--file <path>] [--all]
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { MODULE_CONFIGS } from './modules.js';
import { getOutputPath } from './lib/output.js';

const ROOT = resolve(import.meta.dirname, '../..');

interface FactCheckResult {
  file: string;
  totalIdentifiers: number;
  verified: number;
  notFound: string[];
}

function parseArgs(): { file?: string; all: boolean; help: boolean } {
  const args = process.argv.slice(2);
  const result = { file: undefined as string | undefined, all: false, help: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
        result.file = args[++i];
        break;
      case '--all':
        result.all = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }

  return result;
}

/**
 * Extract identifiers from markdown: backtick-wrapped words that look like
 * method/property names (e.g., `play()`, `isPlaying`, `setFPS`).
 */
function extractIdentifiers(markdown: string): string[] {
  const identifiers = new Set<string>();

  // Match backtick-wrapped identifiers: `methodName`, `methodName()`, `obj.method()`
  const backtickPattern = /`([a-zA-Z_]\w*(?:\.\w+)*)\s*\(`/g;
  let match: RegExpExecArray | null;

  while ((match = backtickPattern.exec(markdown)) !== null) {
    const id = match[1];
    // Extract the last part (method name) from dotted paths
    const parts = id.split('.');
    const methodName = parts[parts.length - 1];
    if (methodName && methodName.length > 1) {
      identifiers.add(methodName);
    }
  }

  // Also match property-style identifiers in headings: ### methodName
  const headingPattern = /^#{2,4}\s+`?([a-zA-Z_]\w+)`?\s*$/gm;
  while ((match = headingPattern.exec(markdown)) !== null) {
    const id = match[1];
    // Skip generic words
    if (
      ![
        'Quick',
        'Start',
        'Best',
        'Practices',
        'Methods',
        'Properties',
        'Overview',
        'Parameters',
        'Returns',
        'Examples',
        'Usage',
        'Description',
        'Notes',
        'Troubleshooting',
        'Prerequisites',
        'Summary',
        'FAQ',
        'Steps',
      ].includes(id)
    ) {
      identifiers.add(id);
    }
  }

  // Match **Signature:** blocks: methodName(params): ReturnType
  const sigPattern = /^\s*(\w+)\s*\(/gm;
  // Too noisy -- skip this pattern

  return Array.from(identifiers);
}

/**
 * Check if an identifier exists in any of the given source files.
 */
function identifierExistsInSources(identifier: string, sourceFiles: string[]): boolean {
  for (const relPath of sourceFiles) {
    const absPath = resolve(ROOT, relPath);
    if (!existsSync(absPath)) continue;

    const content = readFileSync(absPath, 'utf-8');
    // Check for the identifier as a method/property/function name
    if (content.includes(identifier)) {
      return true;
    }
  }
  return false;
}

/**
 * Fact-check a single generated doc file against its source files.
 */
function factCheckFile(docPath: string, sourceFiles: string[]): FactCheckResult {
  const markdown = readFileSync(docPath, 'utf-8');
  const identifiers = extractIdentifiers(markdown);

  let verified = 0;
  const notFound: string[] = [];

  for (const id of identifiers) {
    if (identifierExistsInSources(id, sourceFiles)) {
      verified++;
    } else {
      notFound.push(id);
    }
  }

  return {
    file: relative(ROOT, docPath),
    totalIdentifiers: identifiers.length,
    verified,
    notFound,
  };
}

function showHelp(): void {
  console.log(`Fact-Check Script for Generated Documentation

Usage:
  npx tsx docs/scripts/fact-check.ts [options]

Options:
  --file <path>   Check a specific generated markdown file
  --all           Check all generated documentation
  --help, -h      Show this help
`);
}

// --- Main ---
function main(): void {
  const opts = parseArgs();

  if (opts.help) {
    showHelp();
    process.exit(0);
  }

  const results: FactCheckResult[] = [];

  if (opts.file) {
    const absPath = resolve(opts.file);
    if (!existsSync(absPath)) {
      console.error(`File not found: ${opts.file}`);
      process.exit(1);
    }

    // Find matching module config
    const mod = MODULE_CONFIGS.find((m) => {
      const outputPath = getOutputPath(m.category, m.outputName);
      return absPath === outputPath;
    });

    const sourceFiles = mod?.sourceFiles || [];
    if (sourceFiles.length === 0) {
      console.warn('Warning: no source files found for this document. Checking against all src/.');
    }

    results.push(factCheckFile(absPath, sourceFiles));
  } else if (opts.all) {
    for (const mod of MODULE_CONFIGS) {
      const outputPath = getOutputPath(mod.category, mod.outputName);
      if (existsSync(outputPath)) {
        results.push(factCheckFile(outputPath, mod.sourceFiles));
      }
    }

    if (results.length === 0) {
      console.log('No generated documentation files found. Run ai-generate.ts first.');
      process.exit(0);
    }
  } else {
    console.error('Error: specify --file <path> or --all.');
    process.exit(1);
  }

  // Print results
  let hasErrors = false;

  for (const result of results) {
    const status = result.notFound.length === 0 ? 'PASS' : 'WARN';
    console.log(`\n[${status}] ${result.file}`);
    console.log(`  ${result.verified} of ${result.totalIdentifiers} identifiers verified`);

    if (result.notFound.length > 0) {
      hasErrors = true;
      console.log(`  NOT FOUND (${result.notFound.length}):`);
      for (const id of result.notFound) {
        console.log(`    - ${id}`);
      }
    }
  }

  // Summary
  const totalChecked = results.reduce((sum, r) => sum + r.totalIdentifiers, 0);
  const totalVerified = results.reduce((sum, r) => sum + r.verified, 0);
  const totalNotFound = results.reduce((sum, r) => sum + r.notFound.length, 0);

  console.log(`\n--- Fact-Check Summary ---`);
  console.log(`  Files checked:      ${results.length}`);
  console.log(`  Identifiers total:  ${totalChecked}`);
  console.log(`  Verified:           ${totalVerified}`);
  console.log(`  Not found:          ${totalNotFound}`);

  if (hasErrors) {
    console.log(`\nWarning: ${totalNotFound} identifier(s) not found in source files.`);
    console.log('These may be hallucinated methods -- review manually.');
    process.exit(1);
  } else if (totalChecked > 0) {
    console.log('\nAll identifiers verified successfully.');
  }
}

main();
