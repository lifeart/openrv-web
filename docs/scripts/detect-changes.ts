/**
 * Git-based change detection for incremental documentation regeneration.
 *
 * Detects which source files have changed since the last documentation generation,
 * and maps them to documentation modules that need regeneration.
 *
 * Usage:
 *   npx tsx docs/scripts/detect-changes.ts [--since <sha>]
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODULE_CONFIGS, type ModuleConfig } from './modules.js';

const LAST_GEN_SHA_FILE = resolve(import.meta.dirname, '../generated/.last-gen-sha');

function parseArgs(): { since?: string } {
  const args = process.argv.slice(2);
  const result: { since?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--since' && args[i + 1]) {
      result.since = args[i + 1];
      i++;
    }
    if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: npx tsx docs/scripts/detect-changes.ts [options]

Options:
  --since <sha>   Git SHA to compare against (default: stored in .last-gen-sha)
  --help, -h      Show this help message
`);
      process.exit(0);
    }
  }

  return result;
}

/**
 * Get the SHA to compare against.
 */
function getBaseSha(overrideSha?: string): string | null {
  if (overrideSha) return overrideSha;
  if (existsSync(LAST_GEN_SHA_FILE)) {
    return readFileSync(LAST_GEN_SHA_FILE, 'utf-8').trim();
  }
  return null;
}

/**
 * Get list of changed files since a given SHA.
 */
function getChangedFiles(baseSha: string): string[] {
  try {
    const output = execSync(`git diff --name-only ${baseSha}..HEAD -- src/`, {
      encoding: 'utf-8',
      cwd: resolve(import.meta.dirname, '../..'),
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    console.error(`Failed to run git diff from ${baseSha}. Is this a valid SHA?`);
    return [];
  }
}

/**
 * Map changed files to affected doc modules.
 */
export function mapChangedFilesToModules(changedFiles: string[]): ModuleConfig[] {
  const affected = new Set<string>();

  for (const changedFile of changedFiles) {
    for (const mod of MODULE_CONFIGS) {
      for (const sourceFile of mod.sourceFiles) {
        if (changedFile === sourceFile || changedFile.endsWith(sourceFile)) {
          affected.add(mod.key);
        }
      }
    }
  }

  return MODULE_CONFIGS.filter((m) => affected.has(m.key));
}

/**
 * Save the current HEAD SHA as the last generation point.
 */
export function saveCurrentSha(): void {
  const sha = execSync('git rev-parse HEAD', {
    encoding: 'utf-8',
    cwd: resolve(import.meta.dirname, '../..'),
  }).trim();

  const dir = resolve(import.meta.dirname, '../generated');
  if (!existsSync(dir)) {
    const { mkdirSync } = require('node:fs');
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(LAST_GEN_SHA_FILE, sha, 'utf-8');
  console.log(`Saved current SHA: ${sha}`);
}

// --- Main ---
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('detect-changes.ts')) {
  const opts = parseArgs();
  const baseSha = getBaseSha(opts.since);

  if (!baseSha) {
    console.log('No base SHA found. Run a full generation first, or use --since <sha>.');
    console.log(`All ${MODULE_CONFIGS.length} modules would need generation.`);
    process.exit(0);
  }

  console.log(`Comparing against: ${baseSha}`);
  const changedFiles = getChangedFiles(baseSha);

  if (changedFiles.length === 0) {
    console.log('No source files changed.');
    process.exit(0);
  }

  console.log(`\nChanged source files (${changedFiles.length}):`);
  for (const f of changedFiles) {
    console.log(`  ${f}`);
  }

  const affectedModules = mapChangedFilesToModules(changedFiles);

  if (affectedModules.length === 0) {
    console.log('\nNo documentation modules affected by these changes.');
  } else {
    console.log(`\nAffected documentation modules (${affectedModules.length}):`);
    for (const mod of affectedModules) {
      console.log(`  ${mod.key} (${mod.template}) -> ${mod.category}/${mod.outputName}.md`);
    }
  }
}
