/**
 * Effect catalog documentation generator.
 *
 * Parses src/effects/adapters/*.ts to generate docs/generated/effect-catalog.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { projectRoot, writeGeneratedFile, autoGenHeader, extractJSDoc } from './utils.js';

// ---- Types ----

interface EffectDescriptor {
  name: string;
  label: string;
  category: string;
  description: string;
  parameters: string;
  filePath: string;
}

// ---- Parser ----

function parseEffectFile(relPath: string): EffectDescriptor | null {
  const source = fs.readFileSync(path.join(projectRoot, relPath), 'utf-8');

  // Extract name, label, category from the effect object
  const nameMatch = source.match(/name:\s*'([^']+)'/);
  const labelMatch = source.match(/label:\s*'([^']+)'/);
  const categoryMatch = source.match(/category:\s*'([^']+)'/);

  if (!nameMatch || !labelMatch || !categoryMatch) return null;

  // Extract description from top-level JSDoc (file comment)
  const fileDocMatch = source.match(/^\/\*\*([\s\S]*?)\*\//);
  let description = '';
  if (fileDocMatch && fileDocMatch[1]) {
    // Extract the "Adapter: wraps ..." description line
    const lines = fileDocMatch[1]
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(line => line.length > 0 && !line.startsWith('Expected params'));
    description = lines.join(' ').trim();
  }

  // Extract expected params from JSDoc
  const paramsMatch = source.match(/Expected params key[s]?:\s*\n([\s\S]*?)(?=\*\/)/);
  let parameters = '';
  if (paramsMatch && paramsMatch[1]) {
    parameters = paramsMatch[1]
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(line => line.length > 0)
      .join(', ');
  }

  return {
    name: nameMatch[1]!,
    label: labelMatch[1]!,
    category: categoryMatch[1]!,
    description,
    parameters,
    filePath: relPath,
  };
}

export function parseEffects(): EffectDescriptor[] {
  const adaptersDir = path.join(projectRoot, 'src', 'effects', 'adapters');
  const files = fs.readdirSync(adaptersDir)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .sort();

  const effects: EffectDescriptor[] = [];
  for (const file of files) {
    const relPath = `src/effects/adapters/${file}`;
    const effect = parseEffectFile(relPath);
    if (effect) effects.push(effect);
  }

  // Sort by category then name
  effects.sort((a, b) => {
    const catDiff = a.category.localeCompare(b.category);
    if (catDiff !== 0) return catDiff;
    return a.name.localeCompare(b.name);
  });

  return effects;
}

// ---- Renderer ----

export function renderEffects(effects: EffectDescriptor[]): string {
  let md = autoGenHeader('src/effects/adapters/*.ts');
  md += '# Effect Catalog\n\n';
  md += `OpenRV Web provides ${effects.length} image effects through its unified effect pipeline.\n\n`;

  // ImageEffect interface explanation
  md += '## Architecture\n\n';
  md += 'Effects implement the `ImageEffect` interface:\n\n';
  md += '```typescript\n';
  md += 'interface ImageEffect {\n';
  md += '  readonly name: string;      // Unique identifier\n';
  md += '  readonly label: string;     // UI display name\n';
  md += '  readonly category: EffectCategory; // color | tone | spatial | diagnostic\n';
  md += '  apply(imageData: ImageData, params: Record<string, unknown>): void;\n';
  md += '  isActive(params: Record<string, unknown>): boolean;\n';
  md += '}\n';
  md += '```\n\n';
  md += 'Effects are registered with the `EffectRegistry` and applied in pipeline order. ';
  md += 'Each effect operates on `ImageData` in-place and declares its own activation logic ';
  md += 'so inactive effects are automatically skipped.\n\n';

  // Summary table
  md += '## Summary\n\n';
  md += '| Name | Label | Category | Parameters |\n';
  md += '|------|-------|----------|------------|\n';
  for (const e of effects) {
    md += `| ${e.name} | ${e.label} | ${e.category} | ${e.parameters || '-'} |\n`;
  }
  md += '\n';

  // Group by category
  const groups = new Map<string, EffectDescriptor[]>();
  for (const e of effects) {
    if (!groups.has(e.category)) groups.set(e.category, []);
    groups.get(e.category)!.push(e);
  }

  const categoryOrder = ['color', 'tone', 'spatial', 'diagnostic'];
  const categoryLabels: Record<string, string> = {
    color: 'Color Effects',
    tone: 'Tone Effects',
    spatial: 'Spatial Effects',
    diagnostic: 'Diagnostic Effects',
  };

  for (const cat of categoryOrder) {
    const items = groups.get(cat);
    if (!items || items.length === 0) continue;

    md += `## ${categoryLabels[cat] ?? cat}\n\n`;

    for (const e of items) {
      md += `### ${e.label}\n\n`;
      if (e.description) md += `${e.description}\n\n`;
      md += `- **Name:** \`${e.name}\`\n`;
      md += `- **Category:** ${e.category}\n`;
      if (e.parameters) md += `- **Parameters:** ${e.parameters}\n`;
      md += `- **Source:** \`${e.filePath}\`\n\n`;
    }
  }

  return md;
}

// ---- Entry Point ----

export function generateEffects(): { count: number } {
  const effects = parseEffects();
  const md = renderEffects(effects);
  writeGeneratedFile('effect-catalog.md', md);

  console.log(`Generated effect-catalog.md with ${effects.length} effects`);
  return { count: effects.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateEffects();
}
