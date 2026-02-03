/**
 * OCIOConfigParser - Parse simplified .ocio config files (YAML-based)
 *
 * Provides parsing of OCIO config text into OCIOConfigDefinition objects
 * that can be registered and used with the existing OCIO infrastructure.
 *
 * This is a simplified parser that handles the standard OCIO YAML format
 * but does not implement a full YAML parser. It supports the subset of
 * YAML used in OCIO config files.
 */

import type {
  OCIOConfigDefinition,
  ColorSpaceDefinition,
  DisplayDefinition,
  LookDefinition,
} from './OCIOConfig';

/**
 * Validation result from config parsing
 */
export interface OCIOConfigValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Parse an OCIO config file text into an OCIOConfigDefinition.
 *
 * @param configText - The raw text content of the .ocio config file
 * @param configName - Name to assign to this config (defaults to extracted name or 'custom')
 * @returns Parsed OCIOConfigDefinition
 * @throws Error if the config is invalid or cannot be parsed
 */
export function parseOCIOConfig(configText: string, configName?: string): OCIOConfigDefinition {
  const validation = validateOCIOConfig(configText);
  if (!validation.valid) {
    throw new Error(`Invalid OCIO config: ${validation.errors.join('; ')}`);
  }

  const lines = configText.split('\n');

  // Extract top-level fields
  const version = extractTopLevelValue(lines, 'ocio_profile_version') ?? '1.0';
  const description = extractTopLevelValue(lines, 'description') ?? '';
  const name = configName ?? extractTopLevelValue(lines, 'name') ?? 'custom';

  // Extract roles
  const roles = parseRolesSection(lines);

  // Extract displays
  const displays = parseDisplaysSection(lines);

  // Extract color spaces
  const colorSpaces = parseColorSpacesSection(lines);

  // Extract looks
  const looks = parseLooksSection(lines);

  // Ensure 'None' look is always present
  if (!looks.some((l) => l.name === 'None')) {
    looks.unshift({ name: 'None', description: 'No look applied' });
  }

  return {
    name,
    version,
    description,
    colorSpaces,
    displays,
    looks,
    roles: {
      default: roles.default ?? 'sRGB',
      reference: roles.reference ?? colorSpaces[0]?.name ?? 'sRGB',
      colorPicking: roles.color_picking ?? roles.colorPicking ?? 'sRGB',
      data: roles.data ?? 'Raw',
    },
  };
}

/**
 * Validate OCIO config text structure before parsing.
 *
 * @param configText - The raw text content of the .ocio config file
 * @returns Validation result with errors and warnings
 */
export function validateOCIOConfig(configText: string): OCIOConfigValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!configText || typeof configText !== 'string') {
    errors.push('Config text is empty or not a string');
    return { valid: false, errors, warnings };
  }

  const trimmed = configText.trim();
  if (trimmed.length === 0) {
    errors.push('Config text is empty');
    return { valid: false, errors, warnings };
  }

  const lines = trimmed.split('\n');

  // Check for ocio_profile_version (required)
  const hasVersion = lines.some((line) =>
    line.trim().startsWith('ocio_profile_version')
  );
  if (!hasVersion) {
    errors.push('Missing required field: ocio_profile_version');
  }

  // Check for colorspaces section (required)
  const hasColorSpaces = lines.some((line) =>
    line.trim().startsWith('colorspaces:')
  );
  if (!hasColorSpaces) {
    errors.push('Missing required section: colorspaces');
  }

  // Check for displays section (optional but warn)
  const hasDisplays = lines.some((line) =>
    line.trim().startsWith('displays:')
  );
  if (!hasDisplays) {
    warnings.push('Missing displays section - no display transforms will be available');
  }

  // Check for roles section (optional but warn)
  const hasRoles = lines.some((line) =>
    line.trim().startsWith('roles:')
  );
  if (!hasRoles) {
    warnings.push('Missing roles section - defaults will be used');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Extract a top-level key: value from config lines.
 * Handles both `key: value` and `key: "value"` formats.
 * Only matches lines with no indentation (truly top-level).
 */
function extractTopLevelValue(lines: string[], key: string): string | null {
  for (const line of lines) {
    // Only match lines with no leading whitespace (top-level)
    if (line.length > 0 && (line[0] === ' ' || line[0] === '\t')) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}:`)) {
      let value = trimmed.substring(key.length + 1).trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return value || null;
    }
  }
  return null;
}

/**
 * Find the start and end line indices for a top-level section.
 * A section starts with `sectionName:` at indent level 0
 * and ends when another top-level key is found (or EOF).
 */
function findSection(lines: string[], sectionName: string): { start: number; end: number } | null {
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Only match section headers at top level (no leading whitespace)
    if (start < 0 && trimmed.startsWith(`${sectionName}:`) && line.length > 0 && line[0] !== ' ' && line[0] !== '\t') {
      start = i + 1;
      continue;
    }

    // If we're inside the section, check if this line is a new top-level key
    if (start >= 0 && trimmed.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
      return { start, end: i };
    }
  }

  if (start >= 0) {
    return { start, end: lines.length };
  }

  return null;
}

/**
 * Get the indentation level of a line (number of leading spaces).
 */
function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1]!.replace(/\t/g, '  ').length : 0;
}

/**
 * Parse the roles section of the config.
 */
function parseRolesSection(lines: string[]): Record<string, string> {
  const roles: Record<string, string> = {};
  const section = findSection(lines, 'roles');
  if (!section) return roles;

  for (let i = section.start; i < section.end; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.substring(0, colonIdx).trim();
      let value = trimmed.substring(colonIdx + 1).trim();
      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      roles[key] = value;
    }
  }

  return roles;
}

/**
 * Parse the displays section of the config.
 *
 * Supports format:
 * displays:
 *   sRGB:
 *     - !<View> {name: ACES 1.0 SDR-video, colorspace: ...}
 *     - !<View> {name: Raw, colorspace: Raw}
 *
 * Also supports simpler format:
 * displays:
 *   sRGB:
 *     - ACES 1.0 SDR-video
 *     - Raw
 */
function parseDisplaysSection(lines: string[]): DisplayDefinition[] {
  const displays: DisplayDefinition[] = [];
  const section = findSection(lines, 'displays');
  if (!section) return displays;

  let currentDisplay: DisplayDefinition | null = null;

  for (let i = section.start; i < section.end; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = getIndent(line);

    // Display name (indent level 2, ends with colon)
    if (indent >= 2 && indent <= 4 && trimmed.endsWith(':') && !trimmed.startsWith('-')) {
      if (currentDisplay) {
        displays.push(currentDisplay);
      }
      const displayName = trimmed.slice(0, -1).trim();
      currentDisplay = { name: displayName, views: [] };
      continue;
    }

    // View entry (starts with -)
    if (currentDisplay && trimmed.startsWith('-')) {
      const viewEntry = trimmed.substring(1).trim();

      // Handle !<View> {name: ..., colorspace: ...} format
      const viewNameMatch = viewEntry.match(/name:\s*([^,}]+)/);
      if (viewNameMatch) {
        currentDisplay.views.push(viewNameMatch[1]!.trim());
      } else {
        // Simple format: just the view name
        let viewName = viewEntry;
        // Remove quotes
        if ((viewName.startsWith('"') && viewName.endsWith('"')) ||
            (viewName.startsWith("'") && viewName.endsWith("'"))) {
          viewName = viewName.slice(1, -1);
        }
        if (viewName) {
          currentDisplay.views.push(viewName);
        }
      }
    }
  }

  if (currentDisplay) {
    displays.push(currentDisplay);
  }

  return displays;
}

/**
 * Parse the colorspaces section of the config.
 *
 * Supports format:
 * colorspaces:
 *   - !<ColorSpace>
 *     name: ACEScg
 *     description: ACES CG working space
 *     family: ACES
 *     encoding: scene-linear
 */
function parseColorSpacesSection(lines: string[]): ColorSpaceDefinition[] {
  const colorSpaces: ColorSpaceDefinition[] = [];
  const section = findSection(lines, 'colorspaces');
  if (!section) return colorSpaces;

  let current: Partial<ColorSpaceDefinition> | null = null;

  for (let i = section.start; i < section.end; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // New color space entry
    if (trimmed.startsWith('- !<ColorSpace>') || (trimmed === '-' && i + 1 < section.end)) {
      if (current && current.name) {
        colorSpaces.push(buildColorSpaceDefinition(current));
      }
      current = {};
      continue;
    }

    // Also handle "- name: ..." as a new entry start
    if (trimmed.startsWith('- name:')) {
      if (current && current.name) {
        colorSpaces.push(buildColorSpaceDefinition(current));
      }
      current = {};
      const value = extractInlineValue(trimmed.substring(2));
      if (value) {
        current.name = value;
      }
      continue;
    }

    // Parse key: value pairs for current color space
    if (current !== null) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.substring(0, colonIdx).trim();
        let value = trimmed.substring(colonIdx + 1).trim();
        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        switch (key) {
          case 'name':
            current.name = value;
            break;
          case 'description':
            current.description = value;
            break;
          case 'family':
            current.family = value;
            break;
          case 'encoding':
            // Only set encoding if isdata hasn't already set it to 'data'
            if ((current as Record<string, unknown>)._isdata !== true) {
              current.encoding = normalizeEncoding(value);
            }
            break;
          case 'isdata':
            if (value === 'true' || value === 'yes') {
              current.encoding = 'data';
              (current as Record<string, unknown>)._isdata = true;
            }
            break;
        }
      }
    }
  }

  // Push last entry
  if (current && current.name) {
    colorSpaces.push(buildColorSpaceDefinition(current));
  }

  return colorSpaces;
}

/**
 * Parse the looks section of the config.
 *
 * Supports format:
 * looks:
 *   - !<Look>
 *     name: Filmic
 *     description: Filmic contrast look
 *     process_space: ACEScg
 */
function parseLooksSection(lines: string[]): LookDefinition[] {
  const looks: LookDefinition[] = [];
  const section = findSection(lines, 'looks');
  if (!section) return looks;

  let current: Partial<LookDefinition> | null = null;

  for (let i = section.start; i < section.end; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // New look entry
    if (trimmed.startsWith('- !<Look>') || trimmed.startsWith('- name:')) {
      if (current && current.name) {
        looks.push({ name: current.name, description: current.description ?? '' });
      }
      current = {};

      // Handle inline "- name: value"
      if (trimmed.startsWith('- name:')) {
        const value = extractInlineValue(trimmed.substring(2));
        if (value) {
          current.name = value;
        }
      }
      continue;
    }

    if (current !== null) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.substring(0, colonIdx).trim();
        let value = trimmed.substring(colonIdx + 1).trim();
        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        switch (key) {
          case 'name':
            current.name = value;
            break;
          case 'description':
            current.description = value;
            break;
        }
      }
    }
  }

  // Push last entry
  if (current && current.name) {
    looks.push({ name: current.name, description: current.description ?? '' });
  }

  return looks;
}

/**
 * Extract a value from a "key: value" string.
 */
function extractInlineValue(text: string): string | null {
  const colonIdx = text.indexOf(':');
  if (colonIdx < 0) return null;
  let value = text.substring(colonIdx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value || null;
}

/**
 * Normalize encoding strings from OCIO configs to our encoding type.
 */
function normalizeEncoding(encoding: string): ColorSpaceDefinition['encoding'] {
  const lower = encoding.toLowerCase().trim();
  if (lower === 'scene-linear' || lower === 'scene_linear' || lower === 'linear') {
    return 'scene-linear';
  }
  if (lower === 'log' || lower === 'logarithmic') {
    return 'log';
  }
  if (lower === 'sdr-video' || lower === 'sdr_video' || lower === 'video' || lower === 'display') {
    return 'sdr-video';
  }
  if (lower === 'data' || lower === 'raw') {
    return 'data';
  }
  // Default to sdr-video for unknown encodings
  return 'sdr-video';
}

/**
 * Build a complete ColorSpaceDefinition from partial data.
 */
function buildColorSpaceDefinition(partial: Partial<ColorSpaceDefinition>): ColorSpaceDefinition {
  const encoding = partial.encoding ?? 'sdr-video';
  const isWorkingSpace = encoding === 'scene-linear';
  const isDisplaySpace = encoding === 'sdr-video' &&
    (partial.family?.toLowerCase() === 'display' || partial.family?.toLowerCase() === 'output');

  return {
    name: partial.name ?? 'Unknown',
    description: partial.description ?? '',
    family: partial.family ?? 'Utility',
    encoding,
    ...(isWorkingSpace ? { isWorkingSpace: true } : {}),
    ...(isDisplaySpace ? { isDisplaySpace: true } : {}),
  };
}
