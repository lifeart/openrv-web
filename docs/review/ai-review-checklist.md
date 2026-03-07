---
title: AI-Generated Documentation Review Checklist
---

# AI-Generated Documentation Review Checklist

Use this checklist when reviewing any AI-generated documentation before marking it as `reviewed: true`.

## Factual Accuracy

- [ ] All method names exist in the source code
- [ ] All method signatures match the actual TypeScript signatures
- [ ] All parameter names and types are correct
- [ ] All return types are correct
- [ ] No hallucinated features, methods, or properties
- [ ] Default values mentioned match the source code
- [ ] Error handling descriptions match actual behavior

## Code Examples

- [ ] All code examples use `window.openrv.*` as the entry point
- [ ] Code examples are syntactically valid TypeScript
- [ ] Code examples would actually work against the real API
- [ ] No references to internal classes or implementation details in user-facing docs
- [ ] Import statements (if any) are correct

## Completeness

- [ ] All public methods and properties are documented (for API reference)
- [ ] No significant features or behaviors are omitted
- [ ] Edge cases and limitations are mentioned where relevant
- [ ] Related methods or features are cross-referenced

## Consistency

- [ ] Terminology matches the style guide (see `docs/style-guide.md`)
- [ ] Tone is professional, concise, and uses active voice
- [ ] No first-person language ("I", "we", "our")
- [ ] No emoji
- [ ] Heading hierarchy follows style guide (h1-h4 only, no skipped levels)

## Technical Accuracy

- [ ] Mermaid diagrams accurately represent the architecture or data flow
- [ ] Pipeline descriptions match the actual processing order
- [ ] Performance characteristics (if mentioned) are accurate
- [ ] Browser compatibility notes (if any) are correct
- [ ] No internal implementation details leaked in user-facing guides

## Formatting

- [ ] Valid YAML front-matter with all required fields
- [ ] Proper markdown formatting (code blocks, tables, lists)
- [ ] No broken internal links
- [ ] No trailing whitespace or formatting artifacts
- [ ] Code blocks have correct language identifiers

## Final Steps

- [ ] Run `npx tsx docs/scripts/fact-check.ts --file <path>` and resolve any issues
- [ ] Run `npx tsx docs/scripts/validate-output.ts --file <path>` and resolve any issues
- [ ] Update front-matter: set `reviewed: true`
- [ ] If significant edits were made, note them for future regeneration context
