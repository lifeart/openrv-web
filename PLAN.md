# OpenRV Web — Architecture Improvement Plan

## Overview

This document links to 8 detailed improvement plans identified by a 3-expert architecture assessment (Domain Expert, QA Expert, Software Architect). Each plan underwent **2 rounds of review** by Expert + QA reviewers (32 total reviews).

## Overall Score: 7.5/10

**Strengths**: Exceptional test coverage (7600+ tests), production-quality color science, strong domain model, comprehensive format support, strict TypeScript.

**Key Weaknesses**: God objects (Session/App), monolithic shader, silent error handling, resource lifecycle risks, no plugin system.

---

## Review Process Summary

- **Round 1**: 16 agents (Expert + QA per plan) — validated claims against codebase, identified gaps
- **Round 2**: 16 agents (Expert + QA per plan) — consolidated feedback, final verdicts
- **Result**: All 8 plans received **APPROVE WITH CHANGES**

---

## Improvement Plans

### P0 — Critical (Affects Correctness)

| # | Plan | Effort | Risk | Readiness | Required Changes |
|---|------|--------|------|-----------|-----------------|
| 4 | [Silent Promise Failure Fixes](./IMPROVEMENT_4_PLAN.md) | **4 hours** | LOW | READY | 5 changes (add 19th catch, idempotency guard, log level fix) |
| 6 | [Signal Connection Leak Fixes](./IMPROVEMENT_6_PLAN.md) | **15-17 hours** | LOW | READY | 12 changes (remove convenience methods, fix IPNode.dispose, add listenerCount) |
| 5 | [VideoFrame VRAM Leak Prevention](./IMPROVEMENT_5_PLAN.md) | **5-6 days** | MEDIUM | READY | 11 changes (fix `__DEV__`, getter/setter migration, double-wrap guard) |

### P1 — High (Affects Maintainability)

| # | Plan | Effort | Risk | Readiness | Required Changes |
|---|------|--------|------|-----------|-----------------|
| 1 | ~~Session God Object Refactoring~~ | **14 days** | MEDIUM | **DONE** | Completed: Session decomposed into SessionAnnotations, SessionGraph, SessionMedia, SessionPlayback. Session.ts reduced from ~2450 to ~1210 lines. 2 rounds of code review + fixes. 17448 tests passing. |
| 3 | [App Class Decomposition](./IMPROVEMENT_3_PLAN.md) | **14-18 days** | MEDIUM | READY | All 7 changes incorporated |
| 2 | [Monolithic Shader Modularization](./IMPROVEMENT_2_PLAN.md) | **35 days** | MEDIUM | READY | All 11 changes incorporated (now 11 stages) |

### P2 — Medium (Affects Extensibility)

| # | Plan | Effort | Risk | Readiness | Required Changes |
|---|------|--------|------|-----------|-----------------|
| 7 | [Plugin Architecture](./IMPROVEMENT_7_PLAN.md) | **12-16 days** | MEDIUM | READY | All 13 changes incorporated |
| 8 | [Effect Nodes Implementation](./IMPROVEMENT_8_PLAN.md) | **4-5 weeks** | MEDIUM | READY | All 7 changes incorporated |

---

## Recommended Execution Order

```
Phase 1 (Weeks 1-2):  #4 Silent Promises  →  #6 Signals  →  #5 VideoFrame
Phase 2 (Weeks 3-4):  #1 Session Refactor
Phase 3 (Weeks 5-8):  #3 App Decomposition  (parallel with)  #8 Effect Nodes
Phase 4 (Weeks 9-14): #2 Shader Modularization
Phase 5 (Weeks 15-17):#7 Plugin Architecture
```

## Dependencies

```
#6 Signals  ──blocks──▶  #1 Session (clean subscriptions needed first)
#1 Session  ──blocks──▶  #3 App (Session facades needed before App DI)
#2 Shader   ──blocks──▶  #8 Effects (multi-pass needed for GPU effect nodes)
#1 Session  ──enables──▶ #7 Plugins (clean service interfaces enable plugin hooks)
```

## Total Estimated Effort

~95-115 engineering days across all 8 plans (revised upward from initial 80-110 based on review feedback).

---

## Review Verdicts Summary

| Plan | R1 Expert | R1 QA | R2 Expert | R2 QA |
|------|-----------|-------|-----------|-------|
| #1 Session | Approve w/ changes | Approve w/ changes | Approve w/ changes | Approve w/ changes |
| #2 Shader | Approve w/ changes | Approve w/ changes | Approve w/ changes | Approve w/ changes |
| #3 App | Approve w/ changes | Approve w/ changes | Approve w/ changes | Approve w/ changes |
| #4 Promises | Approve w/ changes | Approve w/ changes | Approve w/ changes | Approve w/ changes |
| #5 VideoFrame | Approve w/ changes | Approve w/ changes | Approve w/ changes | Approve w/ changes |
| #6 Signals | Approve w/ changes | Approve w/ changes | Approve w/ changes | Approve w/ changes |
| #7 Plugins | Approve w/ changes | Approve w/ changes | Approve w/ changes | Approve w/ changes |
| #8 Effects | Approve w/ changes | Approve w/ changes | Approve w/ changes | Approve w/ changes |

---

*Generated: 2026-02-25 by 3-expert architecture assessment panel*
*Review status: 2 rounds complete (32 reviews total). All plans approved and updated. All 8 plans now READY.*

---

## Implementation Progress

| # | Plan | Status | Date |
|---|------|--------|------|
| 1 | Session God Object Refactoring | **DONE** | 2026-02-25 |

### Improvement 1 Summary

Session.ts (~2450 lines) decomposed into 4 focused services via host interfaces:

- **SessionAnnotations.ts** (96 lines) — markers, notes, versions, statuses, annotation store
- **SessionGraph.ts** (498 lines) — GTO graph, metadata, EDL, property resolution
- **SessionMedia.ts** (800 lines) — media sources, loading, frame cache
- **SessionPlayback.ts** (482 lines) — playback engine, volume, A/B compare, audio coordinator
- **Session.ts** (1210 lines) — composition root/facade, backward-compat proxies

New test files: SessionAnnotations.test.ts (33), SessionGraph.test.ts (19), SessionMedia.test.ts (74), SessionPlayback.test.ts (63). Total: 411 test files, 17448 tests passing. 2 rounds of code review (domain expert + QA) with all issues resolved.
