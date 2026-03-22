/**
 * Node catalog documentation generator.
 *
 * Parses src/nodes/**\/*.ts to generate docs/generated/node-catalog.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { projectRoot, writeGeneratedFile, autoGenHeader, extractJSDoc } from './utils.js';

// ---- Types ----

interface PropertyInfo {
  name: string;
  defaultValue: string;
  min?: string;
  max?: string;
  step?: string;
}

interface NodeDescriptor {
  typeName: string;
  className: string;
  category: 'Source' | 'Group' | 'Effect' | 'Utility';
  parentClass: string;
  description: string;
  label: string;
  effectCategory: string;
  properties: PropertyInfo[];
  filePath: string;
}

// ---- Skip list for abstract base classes ----

const SKIP_CLASSES = new Set(['IPNode', 'BaseSourceNode', 'BaseGroupNode', 'EffectNode']);

// ---- Parser ----

function deriveCategory(filePath: string): NodeDescriptor['category'] {
  if (filePath.includes('/sources/')) return 'Source';
  if (filePath.includes('/groups/')) return 'Group';
  if (filePath.includes('/effects/')) return 'Effect';
  return 'Utility';
}

function parseNodeFile(relPath: string): NodeDescriptor | null {
  const source = fs.readFileSync(path.join(projectRoot, relPath), 'utf-8');

  // Extract class name and parent class
  const classMatch = source.match(/export\s+class\s+(\w+)\s+extends\s+(\w+)/);
  if (!classMatch) return null;

  const className = classMatch[1]!;
  const parentClass = classMatch[2]!;

  if (SKIP_CLASSES.has(className)) return null;

  // Extract type name from @RegisterNode('TypeName') or super('TypeName', ...)
  let typeName = '';
  const registerMatch = source.match(/@RegisterNode\('([^']+)'\)/);
  if (registerMatch) {
    typeName = registerMatch[1]!;
  } else {
    const superMatch = source.match(/super\('([^']+)'/);
    if (superMatch) typeName = superMatch[1]!;
  }

  if (!typeName) typeName = className;

  // Extract JSDoc before class declaration
  const description = extractJSDoc(source, `class\\s+${className}`);

  // Extract label
  const labelMatch = source.match(/readonly\s+label\s*=\s*'([^']+)'/);
  const label = labelMatch ? labelMatch[1]! : '';

  // Extract effect category
  const effectCatMatch = source.match(/readonly\s+category:\s*EffectCategory\s*=\s*'([^']+)'/);
  const effectCategory = effectCatMatch ? effectCatMatch[1]! : '';

  // Extract properties from this.properties.add(...)
  const properties: PropertyInfo[] = [];
  const propRegex = /this\.properties\.add\(\{([^}]+)\}\)/g;
  let propMatch: RegExpExecArray | null;
  while ((propMatch = propRegex.exec(source)) !== null) {
    const body = propMatch[1]!;
    const nameMatch = body.match(/name:\s*'([^']+)'/);
    const defaultMatch = body.match(/defaultValue:\s*([^,}]+)/);
    const minMatch = body.match(/min:\s*([^,}]+)/);
    const maxMatch = body.match(/max:\s*([^,}]+)/);
    const stepMatch = body.match(/step:\s*([^,}]+)/);

    if (nameMatch) {
      properties.push({
        name: nameMatch[1]!.trim(),
        defaultValue: defaultMatch ? defaultMatch[1]!.trim().replace(/\s+as\s+\w+$/, '') : '',
        min: minMatch ? minMatch[1]!.trim() : undefined,
        max: maxMatch ? maxMatch[1]!.trim() : undefined,
        step: stepMatch ? stepMatch[1]!.trim() : undefined,
      });
    }
  }

  const category = deriveCategory(relPath);

  return {
    typeName,
    className,
    category,
    parentClass,
    description,
    label,
    effectCategory,
    properties,
    filePath: relPath,
  };
}

export function parseNodes(): NodeDescriptor[] {
  const nodesDir = path.join(projectRoot, 'src', 'nodes');
  const nodes: NodeDescriptor[] = [];

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.startsWith('index.') &&
        entry.name !== 'NodeFactory.ts' &&
        entry.name !== 'NodeProcessor.ts'
      ) {
        const relPath = path.relative(projectRoot, fullPath);
        const node = parseNodeFile(relPath);
        if (node) nodes.push(node);
      }
    }
  }

  walkDir(nodesDir);

  // Sort by category then by typeName
  nodes.sort((a, b) => {
    const catOrder = { Source: 0, Group: 1, Effect: 2, Utility: 3 };
    const catDiff = catOrder[a.category] - catOrder[b.category];
    if (catDiff !== 0) return catDiff;
    return a.typeName.localeCompare(b.typeName);
  });

  return nodes;
}

// ---- Renderer ----

export function renderNodes(nodes: NodeDescriptor[]): string {
  let md = autoGenHeader('src/nodes/**/*.ts');
  md += '# Node Catalog\n\n';
  md += `OpenRV Web\'s processing pipeline is built from ${nodes.length} node types organized into categories.\n\n`;

  // Hierarchy diagram
  md += '## Node Hierarchy\n\n';
  md += '```\n';
  md += 'IPNode (abstract base)\n';
  md += '  +-- BaseSourceNode (abstract)\n';
  const sourceNodes = nodes.filter((n) => n.category === 'Source');
  for (const n of sourceNodes) {
    md += `  |     +-- ${n.className}\n`;
  }
  md += '  +-- BaseGroupNode (abstract)\n';
  const groupNodes = nodes.filter((n) => n.category === 'Group');
  for (const n of groupNodes) {
    md += `  |     +-- ${n.className}\n`;
  }
  md += '  +-- EffectNode (abstract)\n';
  const effectNodes = nodes.filter((n) => n.category === 'Effect' && n.parentClass === 'EffectNode');
  for (const n of effectNodes) {
    md += `  |     +-- ${n.className}\n`;
  }
  const utilityNodes = nodes.filter((n) => n.category === 'Utility');
  for (const n of utilityNodes) {
    md += `  +-- ${n.className}\n`;
  }
  md += '```\n\n';

  // Group by category
  const categories: Array<{ name: string; nodes: NodeDescriptor[] }> = [
    { name: 'Source Nodes', nodes: nodes.filter((n) => n.category === 'Source') },
    { name: 'Group Nodes', nodes: nodes.filter((n) => n.category === 'Group') },
    { name: 'Effect Nodes', nodes: nodes.filter((n) => n.category === 'Effect') },
    { name: 'Utility Nodes', nodes: nodes.filter((n) => n.category === 'Utility') },
  ];

  for (const cat of categories) {
    if (cat.nodes.length === 0) continue;

    md += `## ${cat.name}\n\n`;

    for (const node of cat.nodes) {
      md += `### ${node.typeName} (\`${node.className}\`)\n\n`;

      if (node.label) md += `**Label:** ${node.label}\n\n`;
      if (node.effectCategory) md += `**Effect Category:** ${node.effectCategory}\n\n`;
      if (node.description) md += `${node.description}\n\n`;
      md += `**File:** \`${node.filePath}\`\n\n`;

      if (node.properties.length > 0) {
        md += '**Properties:**\n\n';
        md += '| Property | Default | Min | Max | Step |\n';
        md += '|----------|---------|-----|-----|------|\n';
        for (const p of node.properties) {
          md += `| ${p.name} | ${p.defaultValue} | ${p.min ?? '-'} | ${p.max ?? '-'} | ${p.step ?? '-'} |\n`;
        }
        md += '\n';
      }
    }
  }

  return md;
}

// ---- Entry Point ----

export function generateNodes(): { count: number } {
  const nodes = parseNodes();
  const md = renderNodes(nodes);
  writeGeneratedFile('node-catalog.md', md);

  console.log(`Generated node-catalog.md with ${nodes.length} nodes`);
  return { count: nodes.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateNodes();
}
