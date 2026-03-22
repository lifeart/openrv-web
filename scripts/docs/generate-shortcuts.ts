/**
 * Keyboard shortcuts documentation generator.
 *
 * Parses src/utils/input/KeyBindings.ts and generates docs/generated/keyboard-shortcuts.md
 */

import { readSourceFile, writeGeneratedFile, autoGenHeader, toTitleCase } from './utils.js';

// ---- Types ----

interface KeyBinding {
  action: string;
  shortcut: string;
  description: string;
  category: string;
  context: string;
}

// ---- Parser ----

/**
 * Reimplementation of codeToKey() from KeyBindings.ts for use in Node.js context.
 */
function codeToKey(code: string): string {
  switch (code) {
    case 'Space':
      return 'Space';
    case 'ArrowUp':
      return '\u2191';
    case 'ArrowDown':
      return '\u2193';
    case 'ArrowLeft':
      return '\u2190';
    case 'ArrowRight':
      return '\u2192';
    case 'Home':
      return 'Home';
    case 'End':
      return 'End';
    case 'Escape':
      return 'Esc';
    case 'BracketLeft':
      return '[';
    case 'BracketRight':
      return ']';
    case 'Comma':
      return ',';
    case 'Period':
      return '.';
    case 'Backquote':
      return '`';
    case 'Semicolon':
      return ';';
    case 'Slash':
      return '/';
    case 'PageUp':
      return 'PageUp';
    case 'PageDown':
      return 'PageDown';
    default:
      if (code.startsWith('Key')) return code.slice(3);
      if (code.startsWith('Digit')) return code.slice(5);
      return code;
  }
}

export function parseKeyBindings(): KeyBinding[] {
  const source = readSourceFile('src/utils/input/KeyBindings.ts');

  // Match entries in the DEFAULT_KEY_BINDINGS object
  const bindings: KeyBinding[] = [];

  // Extract the object body between the first { after DEFAULT_KEY_BINDINGS and its closing }
  const objMatch = source.match(/DEFAULT_KEY_BINDINGS:\s*KeyBindingConfig\s*=\s*\{([\s\S]*?)\n\};/);
  if (!objMatch || !objMatch[1]) {
    throw new Error('Could not find DEFAULT_KEY_BINDINGS object');
  }
  const objBody = objMatch[1];

  // Match each entry: 'action.name': { code: 'X', ... }
  const entryRegex = /'([^']+)':\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(objBody)) !== null) {
    const action = match[1]!;
    const body = match[2]!;

    // Extract fields
    const codeMatch = body.match(/code:\s*'([^']+)'/);
    const descMatch = body.match(/description:\s*'([^']+)'/);
    const ctrlMatch = body.match(/ctrl:\s*true/);
    const shiftMatch = body.match(/shift:\s*true/);
    const altMatch = body.match(/alt:\s*true/);
    const metaMatch = body.match(/meta:\s*true/);
    const contextMatch = body.match(/context:\s*'([^']+)'/);

    if (!codeMatch || !descMatch) continue;

    const code = codeMatch[1]!;
    const description = descMatch[1]!;

    // Build shortcut string
    const parts: string[] = [];
    if (ctrlMatch) parts.push('Ctrl');
    if (shiftMatch) parts.push('Shift');
    if (altMatch) parts.push('Alt');
    if (metaMatch) parts.push('Cmd');
    parts.push(codeToKey(code));
    const shortcut = parts.join('+');

    // Derive category from action prefix
    const dotIndex = action.indexOf('.');
    const category = dotIndex > 0 ? action.substring(0, dotIndex) : 'general';

    const context = contextMatch ? contextMatch[1]! : 'global';

    bindings.push({ action, shortcut, description, category, context });
  }

  return bindings;
}

// ---- Renderer ----

export function renderShortcuts(bindings: KeyBinding[]): string {
  let md = autoGenHeader('src/utils/input/KeyBindings.ts');
  md += '# Keyboard Shortcuts Reference\n\n';
  md += `This page lists all ${bindings.length} keyboard shortcuts available in OpenRV Web.\n\n`;

  // Group by category
  const groups = new Map<string, KeyBinding[]>();
  for (const b of bindings) {
    if (!groups.has(b.category)) groups.set(b.category, []);
    groups.get(b.category)!.push(b);
  }

  // Sort categories alphabetically
  const sortedCategories = Array.from(groups.keys()).sort();

  for (const cat of sortedCategories) {
    const items = groups.get(cat)!;
    items.sort((a, b) => a.action.localeCompare(b.action));

    md += `## ${toTitleCase(cat)}\n\n`;
    md += '| Action | Shortcut | Description |\n';
    md += '|--------|----------|-------------|\n';
    for (const item of items) {
      md += `| \`${item.action}\` | \`${item.shortcut}\` | ${item.description} |\n`;
    }
    md += '\n';
  }

  return md;
}

// ---- Entry Point ----

export function generateShortcuts(): { count: number; categories: number } {
  const bindings = parseKeyBindings();
  const md = renderShortcuts(bindings);
  writeGeneratedFile('keyboard-shortcuts.md', md);

  const categories = new Set(bindings.map((b) => b.category)).size;
  console.log(`Generated keyboard-shortcuts.md with ${bindings.length} shortcuts in ${categories} categories`);
  return { count: bindings.length, categories };
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateShortcuts();
}
