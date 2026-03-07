---
title: Documentation Style Guide
---

# Documentation Style Guide

This guide defines the conventions for all OpenRV Web documentation, both human-written and AI-generated.

## Terminology

Use these exact terms consistently:

| Term | Usage | Do NOT use |
|------|-------|------------|
| OpenRV Web | Product name (always capitalized) | openrv-web, OpenRV-Web, openRV |
| IPImage | Core image container class | IP Image, ipimage, IpImage |
| Session | Top-level media container | session (lowercase in prose) |
| node graph | The DAG of processing nodes | node tree, pipeline graph |
| source node | A node that loads media | input node, file node |
| group node | A node that arranges children | container node |
| CDL | ASC Color Decision List | cdl (lowercase in prose) |
| LUT | Lookup table | lut (lowercase in prose) |
| OCIO | OpenColorIO | ocio (lowercase in prose) |
| frame | A single image in a sequence | image (when referring to sequence elements) |
| viewport | The main display area | canvas, viewer (when referring to the display) |

## Tone and Voice

- **Professional and concise.** Write for VFX professionals who value precision.
- **Active voice.** "The renderer processes the frame" not "The frame is processed by the renderer."
- **No first person.** Do not use "I", "we", or "our."
- **No emoji.** Never use emoji in documentation.
- **Present tense.** "The method returns a promise" not "The method will return a promise."

## Headings

- Use heading levels h1 through h4 only. Never use h5 or h6.
- h1: Document title (one per document).
- h2: Major sections.
- h3: Subsections.
- h4: Only when absolutely necessary for sub-subsections.
- Do not skip heading levels (e.g., h2 followed directly by h4).

## Code Examples

- All API code examples must use `window.openrv.*` as the entry point.
- Use TypeScript syntax highlighting for code blocks.
- Keep examples minimal and focused on the concept being explained.
- Include expected output or result descriptions after code blocks.

```typescript
// Correct
const playback = window.openrv.playback;
playback.play();

// Incorrect - do not reference internal classes
const session = new Session();
```

## Method Documentation

When documenting methods, follow this structure:

1. Method name as h3 heading.
2. One-sentence description.
3. Signature in a TypeScript code block.
4. Parameters table (if any): Name, Type, Description columns.
5. Return value description.
6. Usage example.

## Formatting

- Use fenced code blocks with language identifiers (```typescript, ```mermaid).
- Use tables for structured data (parameters, options, comparisons).
- Use bullet lists for unordered information.
- Use numbered lists for sequential steps.
- One blank line before and after headings, code blocks, and lists.
- No trailing whitespace on any line.

## Diagrams

- Use Mermaid syntax for all diagrams.
- Prefer `graph LR` (left-to-right) for data flow diagrams.
- Prefer `sequenceDiagram` for interaction flows.
- Keep diagrams simple: 5-10 nodes maximum.
- Label all nodes and edges clearly.

## File Organization

- Generated docs go in `docs/generated/{category}/{module-name}.md`.
- Categories: api, core, render, color, formats, nodes, plugins.
- All generated files must have YAML front-matter with required fields.

## Review Status

- New generated docs have `reviewed: false` in front-matter.
- After human review and approval, set `reviewed: true`.
- Regenerated docs automatically reset to `reviewed: false`.
