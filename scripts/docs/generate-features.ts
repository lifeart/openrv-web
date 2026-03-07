/**
 * Feature comparison matrix documentation generator.
 *
 * Parses features/*.md spec files to generate docs/generated/feature-comparison.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { projectRoot, writeGeneratedFile, autoGenHeader } from './utils.js';

// ---- Types ----

interface FeatureInfo {
  name: string;
  slug: string;
  status: 'fully' | 'partially' | 'not';
  requirementsTotal: number;
  requirementsDone: number;
}

// ---- Parser ----

function parseStatus(content: string): 'fully' | 'partially' | 'not' {
  // Look for ## Status section and find checked checkbox
  const statusMatch = content.match(/## Status[\s\S]*?(?=\n## |\n---|\n$)/);
  if (!statusMatch) return 'not';

  const statusSection = statusMatch[0];

  if (/- \[x\]\s*Fully implemented/i.test(statusSection)) return 'fully';
  if (/- \[x\]\s*Partially implemented/i.test(statusSection)) return 'partially';
  if (/- \[x\]\s*Not implemented/i.test(statusSection)) return 'not';

  return 'not';
}

function countRequirements(content: string): { total: number; done: number } {
  // Find sections starting with ## Requirements (various suffixes)
  // Must handle: ## Requirements, ## Requirements Analysis, ## Requirements Checklist, etc.
  // Use indexOf-based approach to avoid multiline $ issues
  const reqIdx = content.search(/^## Requirements/m);
  if (reqIdx === -1) return { total: 0, done: 0 };

  // Find the next ## heading that is NOT Requirements
  const afterReq = content.substring(reqIdx);
  const nextHeadingMatch = afterReq.match(/\n## (?!Requirements)/);
  const reqSection = nextHeadingMatch
    ? afterReq.substring(0, nextHeadingMatch.index!)
    : afterReq;

  let total = 0;
  let done = 0;

  // Format 1: Checkbox lists - [x] or - [ ]
  const checkboxChecked = reqSection.match(/- \[x\]/g);
  const checkboxUnchecked = reqSection.match(/- \[ \]/g);

  if (checkboxChecked || checkboxUnchecked) {
    done += checkboxChecked ? checkboxChecked.length : 0;
    total += done + (checkboxUnchecked ? checkboxUnchecked.length : 0);
  }

  // Format 1b: Plain list items without checkboxes (count as unchecked requirements)
  if (total === 0) {
    const plainListItems = reqSection.match(/^- [^\[]/gm);
    if (plainListItems) {
      total += plainListItems.length;
    }
  }

  // Format 2: Tables with Status column
  // Look for table rows and check status values
  const tableLines = reqSection.split('\n').filter(line => line.startsWith('|') && !line.match(/^\|[\s-|]+$/));
  if (tableLines.length > 1) {
    // Find header row to locate Status column
    const headerLine = tableLines[0]!;
    const headers = headerLine.split('|').map(h => h.trim().toLowerCase());
    const statusCol = headers.findIndex(h => h === 'status' || h === 'implementation');

    if (statusCol >= 0) {
      // Skip header row
      for (let i = 1; i < tableLines.length; i++) {
        const cells = tableLines[i]!.split('|');
        const statusCell = cells[statusCol]?.trim().toLowerCase() ?? '';
        total++;
        if (statusCell.includes('implemented') && !statusCell.includes('not implemented')) {
          done++;
        } else if (statusCell.includes('done') || statusCell.includes('complete') || statusCell.includes('yes')) {
          done++;
        }
      }
    }
  }

  return { total, done };
}

export function parseFeatures(): FeatureInfo[] {
  const featuresDir = path.join(projectRoot, 'features');
  const files = fs.readdirSync(featuresDir)
    .filter(f => f.endsWith('.md'))
    .sort();

  const features: FeatureInfo[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(featuresDir, file), 'utf-8');
    const slug = file.replace(/\.md$/, '');

    // Extract name from # Title on first line
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const name = titleMatch ? titleMatch[1]!.trim() : slug;

    const status = parseStatus(content);
    const { total, done } = countRequirements(content);

    features.push({
      name,
      slug,
      status,
      requirementsTotal: total,
      requirementsDone: done,
    });
  }

  return features;
}

// ---- Renderer ----

function statusIcon(status: 'fully' | 'partially' | 'not'): string {
  switch (status) {
    case 'fully': return 'Implemented';
    case 'partially': return 'Partial';
    case 'not': return 'Not Implemented';
  }
}

function webIcon(status: 'fully' | 'partially' | 'not'): string {
  switch (status) {
    case 'fully': return 'Yes';
    case 'partially': return 'Partial';
    case 'not': return 'No';
  }
}

export function renderFeatures(features: FeatureInfo[]): string {
  const sorted = [...features].sort((a, b) => a.name.localeCompare(b.name));

  let md = autoGenHeader('features/*.md');
  md += '# Feature Comparison Matrix\n\n';
  md += 'Comparison of features between OpenRV (desktop) and OpenRV Web.\n\n';

  md += '| Feature | OpenRV (Desktop) | OpenRV Web | Status | Progress |\n';
  md += '|---------|-----------------|------------|--------|----------|\n';

  for (const f of sorted) {
    const progress = f.requirementsTotal > 0
      ? `${f.requirementsDone}/${f.requirementsTotal}`
      : 'N/A';
    md += `| ${f.name} | Yes | ${webIcon(f.status)} | ${statusIcon(f.status)} | ${progress} |\n`;
  }

  md += '\n';

  // Summary stats
  const fullyCount = sorted.filter(f => f.status === 'fully').length;
  const partialCount = sorted.filter(f => f.status === 'partially').length;
  const notCount = sorted.filter(f => f.status === 'not').length;

  md += '## Summary\n\n';
  md += `- **Total features:** ${sorted.length}\n`;
  md += `- **Fully implemented:** ${fullyCount}\n`;
  md += `- **Partially implemented:** ${partialCount}\n`;
  md += `- **Not implemented:** ${notCount}\n`;

  return md;
}

// ---- Entry Point ----

export function generateFeatures(): { count: number } {
  const features = parseFeatures();
  const md = renderFeatures(features);
  writeGeneratedFile('feature-comparison.md', md);

  console.log(`Generated feature-comparison.md with ${features.length} features`);
  return { count: features.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateFeatures();
}
