# OpenRV Web Documentation Generation Plan

Comprehensive plan for automatically generating user documentation for the OpenRV Web codebase.

## Plans

| # | File | Phase | Tasks | Time |
|---|------|-------|-------|------|
| 01 | [infrastructure-setup.md](01-infrastructure-setup.md) | VitePress + TypeDoc setup, CI/CD | 20 | ~6.5h |
| 02 | [auto-generation-scripts.md](02-auto-generation-scripts.md) | 6 parsers: shortcuts, formats, features, nodes, effects, events | 23 | ~8h |
| 03 | [screenshot-automation.md](03-screenshot-automation.md) | Playwright screenshots (30 UI states) | 31 | ~7.5h |
| 04 | [openrv-content-adaptation.md](04-openrv-content-adaptation.md) | Adapting original OpenRV docs (Apache 2.0) | 28 | ~15h |
| 05 | [ai-doc-generation.md](05-ai-doc-generation.md) | Claude API drafts from source code | 48 | ~12-26h |
| 06 | [user-guide-content.md](06-user-guide-content.md) | 45 user guide pages (~28K words) | 45 | ~20-30h |
| **Total** | | | **195** | **~70-95h** |

## Execution Strategy

### Parallel Tracks

These phases can run independently:

```
Track A: Infrastructure     01 ──────────────────────────────►
Track B: Auto-gen scripts         02 ────────────────────────►
Track C: Screenshots                   03 ──────────────────►
Track D: Content                            04 + 05 + 06 ──►
```

### Recommended Start Order

1. **Phase 01** (Infrastructure) -- everything else depends on having VitePress + TypeDoc running
2. **Phase 02** (Auto-gen scripts) -- can start as soon as `docs/` directory exists
3. **Phase 03** (Screenshots) -- can start as soon as npm scripts are added
4. **Phase 04** (OpenRV content) -- research-heavy, can start in parallel
5. **Phase 05** (AI generation) -- needs infrastructure + templates
6. **Phase 06** (User guide) -- benefits from screenshots + AI drafts being ready

### Key Dependencies

- Phase 02 needs Phase 01 (output directory)
- Phase 05 needs Phase 01 (VitePress for preview)
- Phase 06 references Phase 03 screenshots
- Phase 06 can use Phase 05 AI drafts as starting point

## Tech Stack

| Tool | Purpose |
|------|---------|
| VitePress | Documentation site (Markdown + Vue) |
| TypeDoc + typedoc-vitepress-theme | API reference auto-generation |
| Playwright | Screenshot automation (30 UI states) |
| tsx | TypeScript script execution for generators |
| Claude API (Sonnet/Opus) | AI-assisted doc drafts ($15-25 budget) |
| Lychee | Link checking in CI |
| GitHub Actions | CI/CD deployment |

## Output Summary

| Content Type | Source | Method | Volume |
|-------------|--------|--------|--------|
| API Reference | `src/api/*.ts` TSDoc | TypeDoc auto-gen | 8 classes |
| Keyboard Shortcuts | `KeyBindings.ts` | Script parser | 100+ shortcuts |
| Format Matrix | `DecoderRegistry.ts` | Script parser | 13 formats |
| Feature Comparison | `features/*.md` | Script parser | 38 features |
| Node Catalog | `src/nodes/**/*.ts` | Script parser | ~24 nodes |
| Effect Catalog | `src/effects/adapters/*.ts` | Script parser | 9 effects |
| Event Reference | `EventsAPI.ts` | Script parser | 12 events |
| Screenshots | Playwright E2E | Automated capture | 30 images |
| User Guide | Feature specs + OpenRV docs | AI draft + human edit | ~28K words |
