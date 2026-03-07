---
title: Documentation Review Workflow
---

# Documentation Review Workflow

This document describes the end-to-end workflow for generating, reviewing, and maintaining AI-generated documentation.

## Overview

```
Generate -> Auto-check -> Human review -> Edit -> Mark reviewed -> Merge -> Track
```

## Step 1: Generate

Run the AI documentation generator for the target module(s):

```bash
# Single module
npx tsx docs/scripts/ai-generate.ts --module api-playback

# All modules
npx tsx docs/scripts/ai-generate.ts --all

# Only modules with changed source files
npx tsx docs/scripts/ai-generate.ts --changed-only

# Cost estimation (no API calls)
npx tsx docs/scripts/ai-generate.ts --all --dry-run
```

Generated files are written to `docs/generated/{category}/{module-name}.md` with `reviewed: false` in front-matter.

## Step 2: Automated Checks

Run the automated validation and fact-checking scripts:

```bash
# Validate markdown structure, front-matter, links
npx tsx docs/scripts/validate-output.ts --all

# Fact-check method names against source code
npx tsx docs/scripts/fact-check.ts --all
```

Fix any errors reported by these scripts before proceeding to human review.

## Step 3: Human Review

Open the generated file and work through the review checklist (`docs/review/ai-review-checklist.md`):

1. **Factual accuracy** -- Verify every method name, signature, and parameter.
2. **Code examples** -- Confirm examples use `window.openrv.*` and would actually work.
3. **Completeness** -- Check that all public API surface is covered.
4. **Consistency** -- Ensure terminology and tone match the style guide.
5. **Technical accuracy** -- Verify diagrams and pipeline descriptions.
6. **Formatting** -- Check markdown structure and links.

## Step 4: Edit

Make corrections directly in the generated file:

- Fix hallucinated methods or incorrect signatures.
- Add missing context or clarifications.
- Improve code examples.
- Adjust tone or terminology to match the style guide.

## Step 5: Mark Reviewed

After completing the review and edits, update the YAML front-matter:

```yaml
reviewed: true
```

## Step 6: Merge

Commit the reviewed documentation and merge via the standard PR process.

## Step 7: Track Status

The `reviewed` field in front-matter tracks the review status of each file.

When source files change and documentation is regenerated:
- The `reviewed` field is automatically reset to `false`.
- A `regenerated_at` timestamp is added to front-matter.
- The file requires re-review.

## Incremental Updates

When source code changes, use the change detection workflow:

```bash
# Detect which modules need regeneration
npx tsx docs/scripts/detect-changes.ts

# Regenerate only affected modules
npx tsx docs/scripts/ai-generate.ts --changed-only
```

The system tracks the last generation SHA and only regenerates modules whose source files have changed.

## Content-Hash Caching

The generator maintains a content hash cache (`docs/generated/.cache.json`). Even during `--all` runs, modules whose template and source files have not changed are skipped automatically. Use `--no-cache` to force regeneration.
