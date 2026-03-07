/**
 * Output manager for generated documentation files.
 *
 * Writes markdown with YAML front-matter to docs/generated/{category}/{module-name}.md.
 * Auto-creates directories as needed.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const GENERATED_DIR = resolve(import.meta.dirname, '../../generated');

export interface FrontMatter {
  generated: true;
  source_files: string[];
  template: string;
  generated_at: string;
  model: string;
  reviewed: boolean;
  regenerated_at?: string;
}

function formatFrontMatter(fm: FrontMatter): string {
  const lines = [
    '---',
    `generated: ${fm.generated}`,
    'source_files:',
    ...fm.source_files.map((f) => `  - "${f}"`),
    `template: "${fm.template}"`,
    `generated_at: "${fm.generated_at}"`,
    `model: "${fm.model}"`,
    `reviewed: ${fm.reviewed}`,
  ];
  if (fm.regenerated_at) {
    lines.push(`regenerated_at: "${fm.regenerated_at}"`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

export interface WriteOutputOptions {
  category: string;
  moduleName: string;
  content: string;
  sourceFiles: string[];
  template: string;
  model: string;
  /** If true, mark as regenerated rather than new. */
  isRegeneration?: boolean;
}

/**
 * Compute the output file path for a given category and module name.
 */
export function getOutputPath(category: string, moduleName: string): string {
  return join(GENERATED_DIR, category, `${moduleName}.md`);
}

/**
 * Write generated markdown to the output directory with YAML front-matter.
 */
export function writeOutput(options: WriteOutputOptions): string {
  const { category, moduleName, content, sourceFiles, template, model, isRegeneration } = options;

  const outputPath = getOutputPath(category, moduleName);
  const dir = dirname(outputPath);

  // Auto-create directories
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const now = new Date().toISOString();
  const frontMatter: FrontMatter = {
    generated: true,
    source_files: sourceFiles,
    template,
    generated_at: now,
    model,
    reviewed: false,
  };

  if (isRegeneration) {
    // Try to preserve original generated_at from existing file
    if (existsSync(outputPath)) {
      const existing = readFileSync(outputPath, 'utf-8');
      const match = existing.match(/generated_at:\s*"([^"]+)"/);
      if (match) {
        frontMatter.generated_at = match[1];
      }
    }
    frontMatter.regenerated_at = now;
  }

  const fullContent = formatFrontMatter(frontMatter) + content;
  writeFileSync(outputPath, fullContent, 'utf-8');

  console.log(`  Written: ${outputPath}`);
  return outputPath;
}

/**
 * Get the root generated directory path.
 */
export function getGeneratedDir(): string {
  return GENERATED_DIR;
}
