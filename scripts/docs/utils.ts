/**
 * Shared utilities for documentation generators.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Resolved path to the project root (two levels up from scripts/docs/) */
export const projectRoot = path.resolve(import.meta.dirname, '..', '..');

/**
 * Read a source file relative to the project root.
 */
export function readSourceFile(relativePath: string): string {
  const fullPath = path.join(projectRoot, relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

/**
 * Write a generated documentation file to docs/generated/.
 * Creates the directory if it doesn't exist.
 */
export function writeGeneratedFile(filename: string, content: string): void {
  const dir = path.join(projectRoot, 'docs', 'generated');
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, content, 'utf-8');
}

/**
 * Extract the JSDoc comment immediately preceding a pattern in source text.
 * Returns the comment body (without delimiters) or empty string if none found.
 */
export function extractJSDoc(source: string, beforePattern: string | RegExp): string {
  const patternStr =
    typeof beforePattern === 'string' ? beforePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : beforePattern.source;
  const re = new RegExp(`/\\*\\*([\\s\\S]*?)\\*/\\s*(?:export\\s+)?${patternStr}`);
  const match = source.match(re);
  if (!match || !match[1]) return '';
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .trim();
}

/**
 * Convert a kebab-case or dot-separated slug to Title Case.
 */
export function toTitleCase(slug: string): string {
  return slug.replace(/[-_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Returns the auto-generation comment header for a markdown file.
 */
export function autoGenHeader(sourceDescription: string): string {
  return `<!-- This file is auto-generated. Do not edit manually. -->\n<!-- Source: ${sourceDescription} -->\n\n`;
}
