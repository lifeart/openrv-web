# OpenRV Web — Architecture Improvement Plan

## Overview

This document links to 8 detailed improvement plans identified by a 3-expert architecture assessment (Domain Expert, QA Expert, Software Architect). Plans are ordered by priority.

## Overall Score: 7.5/10

**Strengths**: Exceptional test coverage (7600+ tests), production-quality color science, strong domain model, comprehensive format support, strict TypeScript.

**Key Weaknesses**: God objects (Session/App), monolithic shader, silent error handling, resource lifecycle risks, no plugin system.

---

## Improvement Plans

### P0 — Critical (Affects Correctness)

| # | Plan | Focus | Effort | Status |
|---|------|-------|--------|--------|
| 5 | [VideoFrame VRAM Leak Prevention](./IMPROVEMENT_5_PLAN.md) | Manual `close()` causes VRAM exhaustion | 5-9 days | Planned |
| 6 | [Signal Connection Leak Fixes](./IMPROVEMENT_6_PLAN.md) | ~120+ leaked subscriptions | 13-14 hours | Planned |
| 4 | [Silent Promise Failure Fixes](./IMPROVEMENT_4_PLAN.md) | ~18 silent `.catch(() => {})` patterns | 4 hours | Planned |

### P1 — High (Affects Maintainability)

| # | Plan | Focus | Effort | Status |
|---|------|-------|--------|--------|
| 1 | [Session God Object Refactoring](./IMPROVEMENT_1_PLAN.md) | 2,450-line Session with ~160 public methods | 10 days | Planned |
| 3 | [App Class Decomposition](./IMPROVEMENT_3_PLAN.md) | 1,875-line App with 400-line constructor | 17-22 days | Planned |
| 2 | [Monolithic Shader Modularization](./IMPROVEMENT_2_PLAN.md) | 1,444-line fragment shader, 125 uniforms, 34 phases | 30 days | Planned |

### P2 — Medium (Affects Extensibility)

| # | Plan | Focus | Effort | Status |
|---|------|-------|--------|--------|
| 7 | [Plugin Architecture](./IMPROVEMENT_7_PLAN.md) | No runtime extensibility | 10-15 days | Planned |
| 8 | [Effect Nodes Implementation](./IMPROVEMENT_8_PLAN.md) | Effects not composable in node graph | 3-4 weeks | Planned |

---

## Recommended Execution Order

```
Phase 1 (Weeks 1-2):  #4 Silent Promises  →  #5 VideoFrame  →  #6 Signals
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

~80-110 engineering days across all 8 plans.

---

*Generated: 2026-02-25 by 3-expert architecture assessment panel*
*Review status: Round 1 in progress*
