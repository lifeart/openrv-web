/**
 * Output validation script for generated documentation.
 *
 * Validates:
 * - YAML front-matter (required fields, correct types)
 * - Markdown structure (heading hierarchy, no skipped levels)
 * - Mermaid block syntax (basic validation)
 * - Internal link targets (cross-reference against existing files)
 *
 * Usage:
 *   npx tsx docs/scripts/validate-output.ts [--file <path>] [--all]
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { MODULE_CONFIGS } from './modules.js';
import { getOutputPath, getGeneratedDir } from './lib/output.js';

const ROOT = resolve(import.meta.dirname, '../..');

interface ValidationIssue {
  file: string;
  line: number;
  severity: 'error' | 'warning';
  message: string;
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
 * Validate YAML front-matter.
 */
function validateFrontMatter(content: string, filePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const relPath = relative(ROOT, filePath);

  if (!content.startsWith('---\n')) {
    issues.push({
      file: relPath,
      line: 1,
      severity: 'error',
      message: 'Missing YAML front-matter (must start with ---)',
    });
    return issues;
  }

  const endIndex = content.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    issues.push({
      file: relPath,
      line: 1,
      severity: 'error',
      message: 'Unterminated YAML front-matter (missing closing ---)',
    });
    return issues;
  }

  const fmContent = content.slice(4, endIndex);

  // Check required fields
  const requiredFields = ['generated', 'source_files', 'template', 'generated_at', 'model', 'reviewed'];
  for (const field of requiredFields) {
    if (!fmContent.includes(`${field}:`)) {
      const line = 1; // Approximate
      issues.push({ file: relPath, line, severity: 'error', message: `Missing required front-matter field: ${field}` });
    }
  }

  // Check generated: true
  if (fmContent.includes('generated:') && !fmContent.includes('generated: true')) {
    issues.push({ file: relPath, line: 2, severity: 'error', message: 'Front-matter "generated" must be true' });
  }

  // Check reviewed is boolean
  const reviewedMatch = fmContent.match(/reviewed:\s*(.+)/);
  if (reviewedMatch && !['true', 'false'].includes(reviewedMatch[1].trim())) {
    issues.push({
      file: relPath,
      line: 2,
      severity: 'error',
      message: 'Front-matter "reviewed" must be true or false',
    });
  }

  return issues;
}

/**
 * Validate markdown heading hierarchy (no skipped levels, max h4).
 */
function validateHeadings(content: string, filePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const relPath = relative(ROOT, filePath);
  const lines = content.split('\n');

  let lastLevel = 0;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track code blocks to skip headings inside them
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headingMatch = line.match(/^(#{1,6})\s+/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const lineNum = i + 1;

      if (level > 4) {
        issues.push({
          file: relPath,
          line: lineNum,
          severity: 'warning',
          message: `Heading level h${level} exceeds max depth h4`,
        });
      }

      if (lastLevel > 0 && level > lastLevel + 1) {
        issues.push({
          file: relPath,
          line: lineNum,
          severity: 'warning',
          message: `Skipped heading level: h${lastLevel} -> h${level}`,
        });
      }

      lastLevel = level;
    }
  }

  return issues;
}

/**
 * Validate Mermaid diagram blocks (basic syntax check).
 */
function validateMermaid(content: string, filePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const relPath = relative(ROOT, filePath);
  const lines = content.split('\n');

  let inMermaid = false;
  let mermaidStart = 0;
  let mermaidContent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimStart();

    if (line.startsWith('```mermaid')) {
      inMermaid = true;
      mermaidStart = i + 1;
      mermaidContent = '';
      continue;
    }

    if (inMermaid && line.startsWith('```')) {
      inMermaid = false;

      // Basic validation of mermaid content
      const trimmed = mermaidContent.trim();
      if (trimmed.length === 0) {
        issues.push({ file: relPath, line: mermaidStart, severity: 'error', message: 'Empty Mermaid diagram block' });
      } else {
        // Check for valid diagram type
        const validTypes = [
          'graph',
          'flowchart',
          'sequenceDiagram',
          'classDiagram',
          'stateDiagram',
          'erDiagram',
          'gantt',
          'pie',
          'gitgraph',
          'journey',
          'mindmap',
          'timeline',
          'block-beta',
          'stateDiagram-v2',
        ];
        const firstLine = trimmed.split('\n')[0].trim();
        const hasValidType = validTypes.some((t) => firstLine.startsWith(t));
        if (!hasValidType) {
          issues.push({
            file: relPath,
            line: mermaidStart,
            severity: 'warning',
            message: `Mermaid block may have invalid diagram type: "${firstLine.slice(0, 30)}"`,
          });
        }
      }
      continue;
    }

    if (inMermaid) {
      mermaidContent += line + '\n';
    }
  }

  if (inMermaid) {
    issues.push({ file: relPath, line: mermaidStart, severity: 'error', message: 'Unterminated Mermaid code block' });
  }

  return issues;
}

/**
 * Validate internal markdown links.
 */
function validateLinks(content: string, filePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const relPath = relative(ROOT, filePath);
  const lines = content.split('\n');
  const fileDir = dirname(filePath);

  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Match markdown links: [text](path)
    const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;

    while ((match = linkPattern.exec(line)) !== null) {
      const linkTarget = match[2];

      // Skip external links, anchors, and mailto
      if (
        linkTarget.startsWith('http://') ||
        linkTarget.startsWith('https://') ||
        linkTarget.startsWith('#') ||
        linkTarget.startsWith('mailto:')
      ) {
        continue;
      }

      // Strip anchor from path
      const pathOnly = linkTarget.split('#')[0];
      if (!pathOnly) continue;

      // Resolve relative to file's directory
      const resolvedPath = resolve(fileDir, pathOnly);
      if (!existsSync(resolvedPath)) {
        issues.push({
          file: relPath,
          line: i + 1,
          severity: 'warning',
          message: `Broken internal link: ${linkTarget}`,
        });
      }
    }
  }

  return issues;
}

/**
 * Check for trailing whitespace.
 */
function validateTrailingWhitespace(content: string, filePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const relPath = relative(ROOT, filePath);
  const lines = content.split('\n');

  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== lines[i].trimEnd()) {
      count++;
    }
  }

  if (count > 0) {
    issues.push({ file: relPath, line: 0, severity: 'warning', message: `${count} line(s) with trailing whitespace` });
  }

  return issues;
}

/**
 * Validate a single file.
 */
function validateFile(filePath: string): ValidationIssue[] {
  const content = readFileSync(filePath, 'utf-8');
  return [
    ...validateFrontMatter(content, filePath),
    ...validateHeadings(content, filePath),
    ...validateMermaid(content, filePath),
    ...validateLinks(content, filePath),
    ...validateTrailingWhitespace(content, filePath),
  ];
}

/**
 * Recursively find all .md files in a directory.
 */
function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function showHelp(): void {
  console.log(`Output Validation Script for Generated Documentation

Usage:
  npx tsx docs/scripts/validate-output.ts [options]

Options:
  --file <path>   Validate a specific markdown file
  --all           Validate all generated documentation
  --help, -h      Show this help

Validates:
  - YAML front-matter (required fields, correct types)
  - Heading hierarchy (no skipped levels, max h4)
  - Mermaid diagram syntax
  - Internal link targets
  - Trailing whitespace
`);
}

// --- Main ---
function main(): void {
  const opts = parseArgs();

  if (opts.help) {
    showHelp();
    process.exit(0);
  }

  let files: string[] = [];

  if (opts.file) {
    const absPath = resolve(opts.file);
    if (!existsSync(absPath)) {
      console.error(`File not found: ${opts.file}`);
      process.exit(1);
    }
    files = [absPath];
  } else if (opts.all) {
    const generatedDir = getGeneratedDir();
    files = findMarkdownFiles(generatedDir);

    if (files.length === 0) {
      console.log('No generated documentation files found.');
      process.exit(0);
    }
  } else {
    console.error('Error: specify --file <path> or --all.');
    process.exit(1);
  }

  let allIssues: ValidationIssue[] = [];

  for (const file of files) {
    const issues = validateFile(file);
    allIssues.push(...issues);
  }

  // Print issues grouped by file
  const byFile = new Map<string, ValidationIssue[]>();
  for (const issue of allIssues) {
    const list = byFile.get(issue.file) || [];
    list.push(issue);
    byFile.set(issue.file, list);
  }

  for (const [file, issues] of byFile) {
    console.log(`\n${file}:`);
    for (const issue of issues) {
      const prefix = issue.severity === 'error' ? 'ERROR' : 'WARN';
      const lineRef = issue.line > 0 ? `:${issue.line}` : '';
      console.log(`  [${prefix}]${lineRef} ${issue.message}`);
    }
  }

  // Summary
  const errors = allIssues.filter((i) => i.severity === 'error');
  const warnings = allIssues.filter((i) => i.severity === 'warning');

  console.log(`\n--- Validation Summary ---`);
  console.log(`  Files:    ${files.length}`);
  console.log(`  Errors:   ${errors.length}`);
  console.log(`  Warnings: ${warnings.length}`);

  if (errors.length > 0) {
    process.exit(1);
  }

  if (allIssues.length === 0 && files.length > 0) {
    console.log('\nAll files passed validation.');
  }
}

main();
