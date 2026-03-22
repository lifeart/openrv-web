/**
 * Event reference documentation generator.
 *
 * Parses src/api/EventsAPI.ts to generate docs/generated/event-reference.md
 */

import { readSourceFile, writeGeneratedFile, autoGenHeader } from './utils.js';

// ---- Types ----

interface EventField {
  name: string;
  type: string;
}

interface EventDescriptor {
  eventName: string;
  dataType: string;
  fields: EventField[];
  internalEvent: string;
  description: string;
}

// ---- Parser ----

export function parseEvents(): EventDescriptor[] {
  const source = readSourceFile('src/api/EventsAPI.ts');

  // 1. Extract OpenRVEventName union members (multi-line)
  const nameMatch = source.match(/type\s+OpenRVEventName\s*=\s*([\s\S]*?);/);
  if (!nameMatch) throw new Error('Could not find OpenRVEventName type');

  const eventNames = nameMatch[1]!
    .split('|')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter((s) => s.length > 0);

  // 2. Extract OpenRVEventData interface members
  const dataMatch = source.match(/interface\s+OpenRVEventData\s*\{([\s\S]*?)\n\}/);
  if (!dataMatch) throw new Error('Could not find OpenRVEventData interface');

  const dataBody = dataMatch[1]!;

  // Parse each member, handling nested braces (e.g., Array<{ frame: number }>)
  const dataTypes = new Map<string, { type: string; fields: EventField[] }>();

  // Line-by-line accumulation to handle multi-line entries
  const lines = dataBody.split('\n');
  let currentKey = '';
  let currentType = '';
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (braceDepth === 0) {
      // Check for start of new entry: eventName: type
      const entryMatch = trimmed.match(/^(\w+):\s*(.*)/);
      if (!entryMatch) continue;
      currentKey = entryMatch[1]!;
      const rest = entryMatch[2]!;

      // Count braces to detect multi-line
      braceDepth = (rest.match(/\{/g) || []).length - (rest.match(/\}/g) || []).length;

      if (braceDepth <= 0) {
        // Single-line entry
        currentType = rest.replace(/;$/, '').trim();
        braceDepth = 0;
        processEntry(currentKey, currentType, dataTypes);
        currentKey = '';
        currentType = '';
      } else {
        currentType = rest;
      }
    } else {
      // Continuing a multi-line entry
      currentType += ' ' + trimmed;
      braceDepth += (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;

      if (braceDepth <= 0) {
        currentType = currentType.replace(/;$/, '').trim();
        braceDepth = 0;
        processEntry(currentKey, currentType, dataTypes);
        currentKey = '';
        currentType = '';
      }
    }
  }

  // 3. Parse wireInternalEvents() for internal event mapping
  const internalMap = new Map<string, string>();

  // Match patterns like: this.session.on('eventName', ...)
  // followed by this.emit('publicName', ...)
  const wireMatch = source.match(
    /wireInternalEvents\(\)[\s\S]*?(?=\n  (?:\/\*\*|emitError|dispose|private\s|public\s|\}))/,
  );
  if (wireMatch) {
    const wireBody = wireMatch[0];
    // Match session.on('internalEvent', ...) blocks and find emit('publicEvent', ...)
    const blockRegex = /this\.session\.on\('(\w+)'[\s\S]*?this\.emit\('(\w+)'/g;
    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = blockRegex.exec(wireBody)) !== null) {
      internalMap.set(blockMatch[2]!, blockMatch[1]!);
    }
  }

  // Hardcoded mappings for events not wired via session
  if (!internalMap.has('stop')) internalMap.set('stop', '(not wired - manual)');
  if (!internalMap.has('error')) internalMap.set('error', '(emitError method)');

  // 4. Build descriptors
  const events: EventDescriptor[] = [];
  for (const name of eventNames) {
    const typeInfo = dataTypes.get(name);
    const dataType = typeInfo?.type ?? 'void';
    const fields = typeInfo?.fields ?? [];
    const internalEvent = internalMap.get(name) ?? '';

    // Generate description based on event name
    const description = generateDescription(name);

    events.push({
      eventName: name,
      dataType,
      fields,
      internalEvent,
      description,
    });
  }

  return events;
}

function processEntry(key: string, type: string, map: Map<string, { type: string; fields: EventField[] }>): void {
  const fields: EventField[] = [];

  if (type === 'void') {
    map.set(key, { type: 'void', fields: [] });
    return;
  }

  // Extract fields from { field: type; ... } pattern
  const objMatch = type.match(/^\{([\s\S]*)\}$/);
  if (objMatch) {
    const body = objMatch[1]!;
    // Split on semicolons but handle nested braces
    const fieldParts = splitFields(body);
    for (const part of fieldParts) {
      const fieldMatch = part.trim().match(/^(\w+)\??:\s*(.+)$/);
      if (fieldMatch) {
        fields.push({ name: fieldMatch[1]!, type: fieldMatch[2]!.trim() });
      }
    }
  }

  map.set(key, { type, fields });
}

function splitFields(body: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of body) {
    if (char === '{' || char === '<') depth++;
    else if (char === '}' || char === '>') depth--;
    else if (char === ';' && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function generateDescription(eventName: string): string {
  const descriptions: Record<string, string> = {
    frameChange: 'Fired when the current frame number changes during playback or scrubbing.',
    play: 'Fired when playback starts.',
    pause: 'Fired when playback pauses.',
    stop: 'Fired when playback stops.',
    speedChange: 'Fired when the playback speed changes.',
    volumeChange: 'Fired when the audio volume level changes.',
    muteChange: 'Fired when the audio mute state changes.',
    audioScrubEnabledChange: 'Fired when the audio scrubbing enabled state changes.',
    loopModeChange: 'Fired when the loop mode changes (e.g., loop, once, ping-pong).',
    inOutChange: 'Fired when the in/out point range changes.',
    markerChange: 'Fired when markers are added, removed, or modified.',
    sourceLoaded: 'Fired when a new source file is loaded and ready for playback.',
    error: 'Fired when an error occurs in the API.',
  };
  return descriptions[eventName] ?? '';
}

// ---- Renderer ----

export function renderEvents(events: EventDescriptor[]): string {
  let md = autoGenHeader('src/api/EventsAPI.ts');
  md += '# Event Reference\n\n';
  md += `OpenRV Web exposes ${events.length} events through its public API for integration and scripting.\n\n`;

  // Overview
  md += '## Usage Pattern\n\n';
  md += 'Events follow the standard `on/off/once` subscription pattern:\n\n';
  md += '```typescript\n';
  md += '// Subscribe to an event\n';
  md += "const unsub = openrv.events.on('frameChange', (data) => {\n";
  md += "  console.log('Frame:', data.frame);\n";
  md += '});\n\n';
  md += '// Unsubscribe\n';
  md += 'unsub();\n\n';
  md += '// One-time listener\n';
  md += "openrv.events.once('sourceLoaded', (data) => {\n";
  md += "  console.log('Loaded:', data.name);\n";
  md += '});\n';
  md += '```\n\n';

  // Summary table
  md += '## Event Summary\n\n';
  md += '| Event Name | Data Type | Description |\n';
  md += '|------------|-----------|-------------|\n';
  for (const e of events) {
    const typeStr = e.dataType === 'void' ? '`void`' : '`object`';
    md += `| \`${e.eventName}\` | ${typeStr} | ${e.description} |\n`;
  }
  md += '\n';

  // Detailed sections
  md += '## Event Details\n\n';
  for (const e of events) {
    md += `### \`${e.eventName}\`\n\n`;
    md += `${e.description}\n\n`;

    if (e.internalEvent) {
      md += `**Internal event:** \`${e.internalEvent}\`\n\n`;
    }

    if (e.fields.length > 0) {
      md += '**Data fields:**\n\n';
      md += '| Field | Type |\n';
      md += '|-------|------|\n';
      for (const f of e.fields) {
        md += `| \`${f.name}\` | \`${f.type}\` |\n`;
      }
      md += '\n';
    } else if (e.dataType === 'void') {
      md += '*No data payload.*\n\n';
    }

    // Code example
    md += '**Example:**\n\n';
    md += '```typescript\n';
    if (e.dataType === 'void') {
      md += `openrv.events.on('${e.eventName}', () => {\n`;
      md += `  console.log('${e.eventName} fired');\n`;
      md += '});\n';
    } else if (e.fields.length > 0) {
      const firstField = e.fields[0]!;
      md += `openrv.events.on('${e.eventName}', (data) => {\n`;
      md += `  console.log('${firstField.name}:', data.${firstField.name});\n`;
      md += '});\n';
    } else {
      md += `openrv.events.on('${e.eventName}', (data) => {\n`;
      md += `  console.log(data);\n`;
      md += '});\n';
    }
    md += '```\n\n';
  }

  return md;
}

// ---- Entry Point ----

export function generateEvents(): { count: number } {
  const events = parseEvents();
  const md = renderEvents(events);
  writeGeneratedFile('event-reference.md', md);

  console.log(`Generated event-reference.md with ${events.length} events`);
  return { count: events.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateEvents();
}
