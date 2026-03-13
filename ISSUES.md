# Issues

This file tracks findings from exploratory review and targeted validation runs.

## Confirmed Issues

### 257. Mu compat playback-health commands are marked supported but only expose hardcoded or never-updated local state

- Severity: Medium
- Area: Mu compatibility / playback telemetry
- Evidence:
  - `skipped()` returns the private `_skippedFrames` field, but production source search finds no non-test code that ever increments or synchronizes that field; it is only initialized to `0` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L134) and read in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L301) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L304).
  - `mbps()` likewise returns the private `_mbps` field, and `resetMbps()` only sets that same local field back to `0` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L135) and [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L321) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L329); there is no non-test writer that records real throughput.
  - `isCurrentFrameIncomplete()`, `isCurrentFrameError()`, and `isBuffering()` are all marked supported in the command manifest in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L97) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L100), but their implementations are hardcoded `false` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L306) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L319) despite the real app having buffering state in [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L148), [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L371), and [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L616).
  - The compat tests explicitly validate the inert behavior: `skipped()` returns `0`, `mbps()` returns `0`, and the three health booleans return `false` in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L295) through [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L315).
- Impact:
  - Mu-compatible scripts can query playback health and receive clean-looking values even while the real player is buffering, skipping frames, or experiencing decode issues.
  - That is more misleading than an unsupported-path warning because the API reports a valid state snapshot that never came from the actual playback engine.

### 258. Mu compat media-representation node APIs return fabricated node names that are never created in a real graph

- Severity: Medium
- Area: Mu compatibility / source representations
- Evidence:
  - `addSourceMediaRep(...)` synthesizes `nodeName = \`${sourceName}_${repName}_source\`` and `switchNodeName = \`${sourceName}_switch\`` and stores them only inside the local representation record in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L573) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L595).
  - The method never creates corresponding nodes in a graph, never talks to `window.openrv`, and never wires representation switching into the live session.
  - `sourceMediaRepsAndNodes(...)`, `sourceMediaRepSwitchNode(...)`, and `sourceMediaRepSourceNode(...)` simply read back those stored string fields in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L635) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L660).
  - The tests only assert that the returned strings contain the rep or switch names, not that those nodes actually exist anywhere in a graph or session in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L507) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L615).
- Impact:
  - Mu-compatible scripts can receive plausible source-representation node names and then fail when they try to use them as real node identities.
  - That is especially misleading because the API shape implies graph-backed media-rep wiring, but the returned node IDs are only local placeholders.

### 262. Mu compat active media-representation selection never changes what `sourceMedia()` or `sourceMediaInfo()` report

- Severity: Medium
- Area: Mu compatibility / source representations
- Evidence:
  - `setActiveSourceMediaRep(...)` only updates `source.activeRep` in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L602) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L610).
  - `sourceMedia(...)` ignores `activeRep` and always returns `source.mediaPaths` from the base source record in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L341) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L344).
  - `sourceMediaInfo(...)` likewise ignores `activeRep` and always reports `file: source.mediaPaths[0]` plus the base source dimensions/range in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L350) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L381).
  - The tests confirm that active representation can be switched via `sourceMediaRep(name)` in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L524) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L538), but there is no test that `sourceMedia(...)` or `sourceMediaInfo(...)` reflect that switch.
- Impact:
  - Mu-compatible scripts can switch a source to `proxy` or another representation and still have follow-up media queries report the old base media.
  - That breaks representation-aware workflows because the bridge advertises rep switching while its own read APIs continue to describe a different source state.

### 264. Mu compat `imageGeometryByTag()` ignores the tag argument entirely

- Severity: Medium
- Area: Mu compatibility / image-query scripting
- Evidence:
  - `imageGeometryByTag(imageName, _tag)` explicitly comments that tags are not implemented and simply forwards to `imageGeometry(imageName)` in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L305) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L307).
  - That means the `tag` parameter never influences the selected geometry, even though the API name and signature imply tag-based selection.
  - The current test only verifies that the method falls back to name-based lookup and does not check any tag distinction in [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L420) through [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L426).
- Impact:
  - Mu-compatible scripts cannot query per-tag image geometry even though the command surface suggests they can.
  - This is another silent semantic mismatch because callers can vary the tag and receive the same answer every time.


### 307. The adaptive `FrameCacheController` subsystem is fully implemented but never instantiated in production

- Severity: Medium
- Area: Playback cache architecture
- Evidence:
  - `FrameCacheController` is described as the central frame-caching coordinator with region/lookahead modes, memory-pressure management, and pre-roll warm-up in [src/cache/FrameCacheController.ts](/Users/lifeart/Repos/openrv-web/src/cache/FrameCacheController.ts#L1) through [src/cache/FrameCacheController.ts](/Users/lifeart/Repos/openrv-web/src/cache/FrameCacheController.ts#L15).
  - Its companion config explicitly defines UI labels/tooltips and even a cache-mode cycle “for `Shift+C` keyboard shortcut” in [src/config/CacheConfig.ts](/Users/lifeart/Repos/openrv-web/src/config/CacheConfig.ts#L1) through [src/config/CacheConfig.ts](/Users/lifeart/Repos/openrv-web/src/config/CacheConfig.ts#L37) and [src/config/CacheConfig.ts](/Users/lifeart/Repos/openrv-web/src/config/CacheConfig.ts#L92) through [src/config/CacheConfig.ts](/Users/lifeart/Repos/openrv-web/src/config/CacheConfig.ts#L95).
  - A production-code search finds no `new FrameCacheController(...)` outside tests, and the shipped controls only create the simpler passive `CacheIndicator` in [src/services/controls/createPanelControls.ts](/Users/lifeart/Repos/openrv-web/src/services/controls/createPanelControls.ts#L71) through [src/services/controls/createPanelControls.ts](/Users/lifeart/Repos/openrv-web/src/services/controls/createPanelControls.ts#L72), which itself just reflects session/viewer cache stats and a clear button in [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L1) through [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L9) and [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L169) through [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L192).
- Impact:
  - The app carries a substantial adaptive frame-cache design, but the shipped runtime never actually turns it on.
  - That leaves cache modes, warm-up behavior, and memory-pressure coordination effectively test-only despite the surrounding config and UI-oriented metadata.

### 308. Collaboration permission roles affect sync behavior, but the shipped UI never reflects or enforces them locally

- Severity: Medium
- Area: Network sync / collaboration permissions
- Evidence:
  - `NetworkSyncManager` exposes real participant roles, defaults unknown users to `reviewer`, and uses `viewer` to suppress outgoing sync via `canUserSync(...)`, `sendAnnotationSync(...)`, and `sendNoteSync(...)` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L210) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L236) and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L547) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L594).
  - Incoming host permission changes are applied and emitted as `participantPermissionChanged` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1105) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1113).
  - A production-code search finds no `participantPermissionChanged` subscriber in app wiring, and the visible network panel only renders a `Host` badge with no reviewer/viewer state or permission controls in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1278) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1320).
- Impact:
  - A user can be downgraded to `viewer` and silently stop sending synced notes or annotations while the local UI still presents normal collaboration controls.
  - The permission system exists at the transport layer, but the shipped interface gives no clear indication of current role or why collaboration actions stopped propagating.

### 309. `SessionManager` is documented as a central session subsystem, but it is never instantiated in production

- Severity: Low
- Area: Session graph architecture
- Evidence:
  - `SessionManager` presents itself as the “Central orchestrator for graph mutations, view history, tree model, and media-graph bridge” in [src/core/session/SessionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionManager.ts#L1) through [src/core/session/SessionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionManager.ts#L7).
  - The docs-generation templates also present `SessionManager` as part of the session-system architecture and include its source file in the generated module set in [docs/scripts/lib/templates.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/lib/templates.ts#L288) through [docs/scripts/lib/templates.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/lib/templates.ts#L304) and [docs/scripts/modules.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/modules.ts#L46) through [docs/scripts/modules.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/modules.ts#L52).
  - A production-code search finds no `new SessionManager()` outside tests.
- Impact:
  - The repo carries a documented graph-mutation/view-history service that is effectively test-only in the shipped app.
  - That makes the published session architecture ahead of production wiring for any future graph-browser or view-history workflows that would depend on this manager.

### 313. Shot status tracking exists in session/export code, but the shipped app exposes no real status UI

- Severity: Medium
- Area: Review workflow / status tracking
- Evidence:
  - The session layer ships a real `StatusManager` with per-source status state, counts, colors, serialization, and change callbacks in [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L1) through [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L190).
  - Production consumers are effectively limited to export and ShotGrid integration: `generateReport(...)` reads `session.statusManager` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L293), and ShotGrid push/pull maps statuses through [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L182) through [src/integrations/ShotGridIntegrationBridge.ts#L247).
  - A production-code search finds no real UI code using `session.statusManager`, `getStatus(...)`, or `setStatus(...)` in the shipped header, QC tab, or source panels, while the QC toolbar itself only mounts scopes/analysis/pixel-probe controls in [src/services/tabContent/buildQCTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildQCTab.ts#L17) through [src/services/tabContent/buildQCTab.ts#L130).
  - The current docs and UI overview still describe shot-status controls as part of QC/review flow in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L22) through [docs/advanced/review-workflow.md#L26) and [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L71).
- Impact:
  - Users can load, save, export, and even sync status data indirectly, but they cannot actually set or inspect shot status through the shipped app UI.
  - That leaves a core review-workflow feature implemented underneath the app yet unavailable in the normal production workflow.

### 314. Version management is implemented underneath the session layer, but the shipped app never wires it to UI or auto-detection

- Severity: Medium
- Area: Review workflow / version management
- Evidence:
  - `VersionManager` implements grouping, next/previous navigation, active-version switching, and filename-based auto-detection in [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L1) through [src/core/session/VersionManager.ts#L349).
  - The auto-detection entry point `autoDetectGroups(...)` exists in [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L273) through [src/core/session/VersionManager.ts#L324), but a production-code search finds no caller outside the manager itself.
  - The only live consumers of version groups are export/report serialization paths such as [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L120) through [src/export/ReportExporter.ts#L129) and session save/load in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L372) through [src/core/session/SessionSerializer.ts#L376) and [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L574) through [src/core/session/SessionSerializer.ts#L577).
  - A production-code search finds no header/QC/source-panel UI that calls `getGroups()`, `getGroupForSource()`, `nextVersion()`, `previousVersion()`, or `setActiveVersion(...)`, even though the shipped docs still promise a header-bar version selector and version list in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L36) through [docs/advanced/review-workflow.md#L40).
- Impact:
  - Version groups can exist in saved state and reports, but the production app never auto-detects them from filenames and never exposes navigation or selection controls.
  - That makes version management effectively a persistence/export-only subsystem instead of a usable review feature.

### 316. Review notes do not support priority or category, so the richer dailies workflow is impossible in the shipped app

- Severity: Medium
- Area: Notes / review workflow
- Evidence:
  - The shipped review-workflow guide describes notes with priority, category, and category-based report statistics in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L64) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L68) and [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L106) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L111).
  - The actual `Note` model only stores `text`, `author`, frame range, status, reply parent, and color in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L8) through [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L23), and the CRUD surface only updates `text`, `status`, or `color` in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L71) through [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L120).
  - The shipped `NotePanel` only renders frame, status, author, text, and reply/edit/delete actions; there is no priority/category display or editor in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L522) through [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L728).
  - Report generation only pulls raw note text arrays per source in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L137) through [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L164), so there is no data available for category rollups.
- Impact:
  - Reviewers cannot tag notes by department/severity, and supervisors cannot produce the category-based dailies summaries the workflow describes.
  - The shipped note system is materially simpler than the advertised review process, which limits its usefulness in actual production review sessions.

### 317. Review-status semantics are lossy: several documented production states collapse into unrelated local values

- Severity: Medium
- Area: Review workflow / status semantics
- Evidence:
  - The review-workflow guide defines six user-meaningful states: `Pending`, `In Review`, `Revisions Needed`, `Approved`, `Final`, and `On Hold` in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L11) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L20).
  - The actual session layer only supports five different local values: `pending`, `approved`, `needs-work`, `cbb`, and `omit` in [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L4) through [src/core/session/StatusManager.ts#L37).
  - ShotGrid integration further collapses multiple upstream statuses into those local buckets in [src/integrations/ShotGridBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridBridge.ts#L93) through [src/integrations/ShotGridBridge.ts#L103):
    `fin -> approved`, `ip -> pending`, `hld -> pending`, `wtg -> pending`, and `vwd -> approved`.
- Impact:
  - Distinct production-review meanings like “final”, “in progress”, and “on hold” cannot survive a local OpenRV Web round-trip as distinct statuses.
  - That makes status-based review/export/sync workflows semantically weaker than the app and docs suggest, even before the missing status UI is addressed.

### 318. Dailies report export ignores playlist structure and always reports every loaded source

- Severity: Medium
- Area: Reports / playlist review workflow
- Evidence:
  - The documented dailies workflow says to load shots as a playlist, review them, then generate a report in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L97) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L113).
  - The production export path wires `reportExportRequested` straight to `generateReport(session, session.noteManager, session.statusManager, session.versionManager, ...)` with no playlist input in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L292) through [src/AppPlaybackWiring.ts#L300).
  - `buildReportRows(...)` then iterates `for (let i = 0; i < session.sourceCount; i++)` and builds one row per loaded source from `session.getSourceByIndex(i)` in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L105) through [src/export/ReportExporter.ts#L167).
- Impact:
  - A dailies report cannot honor playlist order, omitted shots, repeated comparison clips, or a curated review subset; it just exports the whole loaded source set.
  - That makes reports diverge from the actual session the reviewer just stepped through whenever playlist structure matters.

### 319. Dailies reports omit core session metadata and the category-based summary the workflow promises

- Severity: Medium
- Area: Reports / review workflow
- Evidence:
  - The review-workflow guide says dailies reports include “Session date, supervisor name, and project identifier” plus “Statistics: total shots reviewed, approval rate, revision counts by category” in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L106) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L111).
  - The actual `ReportOptions` only carry `title` and optional `dateRange` in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L30) through [src/export/ReportExporter.ts#L37), and the production call site passes only `format`, `include*` flags, and `title` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L292) through [src/AppPlaybackWiring.ts#L299).
  - HTML generation only renders the title, optional `dateRange`, and a simple count-by-status summary in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L239) through [src/export/ReportExporter.ts#L249) and [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L294) through [src/export/ReportExporter.ts#L296).
- Impact:
  - Exported dailies reports cannot capture who ran the session, what project it belonged to, or any category-based review statistics.
  - That makes the generated reports much less useful for real production circulation than the workflow suggests.

### 321. Version-manager navigation is a no-op at runtime because active-version changes never switch the session source

- Severity: Medium
- Area: Version management / session behavior
- Evidence:
  - `VersionManager.nextVersion(...)`, `previousVersion(...)`, and `setActiveVersion(...)` all invoke the `onActiveVersionChanged(...)` callback after updating internal state in [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L191) through [src/core/session/VersionManager.ts#L232).
  - `SessionAnnotations` wires that callback to an explicit no-op with the comment “Can be extended for source switching in future” in [src/core/session/SessionAnnotations.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionAnnotations.ts#L37) through [src/core/session/SessionAnnotations.ts#L42).
  - The session only re-emits a generic `versionsChanged` event in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L316) through [src/core/session/Session.ts#L329); there is no production caller that translates active-version changes into `session.setCurrentSource(...)`.
- Impact:
  - Even if version navigation were exposed through UI, scripting, or future automation, changing the active version group state would not actually change the displayed media.
  - That leaves the version subsystem internally inconsistent: it can record an “active” version without the viewer ever following it.

### 322. ShotGrid version loading never feeds the app’s own version-management system

- Severity: Medium
- Area: ShotGrid integration / version management
- Evidence:
  - When a ShotGrid version is loaded, the integration bridge only loads the media, records a panel-local `versionId -> sourceIndex` mapping, and applies status via `session.statusManager.setStatus(...)` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L171) through [src/integrations/ShotGridIntegrationBridge.ts#L184).
  - The `ShotGridPanel` stores those mappings only in its own `versionSourceMap` / `sourceVersionMap` in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L53) through [src/ui/components/ShotGridPanel.ts#L55) and [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L256) through [src/ui/components/ShotGridPanel.ts#L266).
  - A production-code search finds no call from the ShotGrid flow into `session.versionManager`, `createGroup(...)`, `addVersionToGroup(...)`, or `autoDetectGroups(...)`.
- Impact:
  - ShotGrid can surface and load multiple versions of the same shot, but those versions remain isolated inside the ShotGrid panel instead of becoming first-class OpenRV Web version groups.
  - That means report/export/version-navigation features built around `VersionManager` never benefit from the versions users actually loaded through the production tracking integration.

### 323. ShotGrid playlist loading is not real playlist sync; it only fills the browser panel

- Severity: Medium
- Area: ShotGrid integration / playlist workflow
- Evidence:
  - The integration guide says “ShotGrid playlists can be imported into OpenRV Web as review playlists, maintaining clip order and metadata” in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L104) through [docs/advanced/dcc-integration.md#L109).
  - The actual `loadPlaylist` flow only fetches versions and calls `panel.setVersions(versions)` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L115) through [src/integrations/ShotGridIntegrationBridge.ts#L131).
  - A production-code search finds no ShotGrid path that calls `playlistManager`, `replaceClips(...)`, `addClip(...)`, or similar playlist runtime APIs.
- Impact:
  - Entering a ShotGrid playlist ID does not build an OpenRV Web review playlist; it just populates the ShotGrid side panel with version rows.
  - Users still have to load versions manually one by one, so clip order and review-playlist semantics are not actually imported.

### 324. The ShotGrid panel does not support the advertised “paste a version URL” workflow

- Severity: Medium
- Area: ShotGrid integration / UX contract
- Evidence:
  - The integration guide says users can load versions “by pasting a version URL or using the ShotGrid panel” in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L102) through [docs/advanced/dcc-integration.md#L106).
  - The shipped `ShotGridPanel` only supports two query modes, `playlist` and `shot`, toggled in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L331) through [src/ui/components/ShotGridPanel.ts#L335).
  - Its load handler parses the input strictly as a positive integer ID and rejects anything else as invalid in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L337) through [src/ui/components/ShotGridPanel.ts#L359).
- Impact:
  - A real ShotGrid version URL cannot be pasted into the shipped panel even though that is presented as a supported workflow.
  - Users have to manually extract numeric IDs and also cannot query versions directly, only playlists or shots.

### 325. ShotGrid note publishing sends only plain note text, not annotations or thumbnails

- Severity: Medium
- Area: ShotGrid integration / note publishing
- Evidence:
  - The integration guide describes “Publish review notes and annotations ... with frame references and thumbnails” in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L104) through [docs/advanced/dcc-integration.md#L107).
  - The production `pushNotes` flow iterates `session.noteManager.getNotesForSource(sourceIndex)` and calls `bridge.pushNote(...)` with only `text` and an optional `frameRange` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L192) through [src/integrations/ShotGridIntegrationBridge.ts#L224).
  - `ShotGridBridge.pushNote(...)` only serializes `subject`, `content`, and `frame_range` into the REST payload in [src/integrations/ShotGridBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridBridge.ts#L266) through [src/integrations/ShotGridBridge.ts#L299).
  - The path never reads from the annotation store, never renders thumbnails, and never uploads attachments.
- Impact:
  - Users who rely on annotated frames or visual context cannot actually publish that review artifact back to ShotGrid from the shipped app.
  - The current integration behaves like plain text note posting, which is much less useful than the advertised review-to-tracking workflow.

### 326. The published DCC inbound command set overstates what the bridge actually understands

- Severity: Medium
- Area: DCC integration / protocol contract
- Evidence:
  - The DCC integration guide documents inbound commands `load`, `seek`, `setFrameRange`, `setMetadata`, `setColorSpace`, and `ping` in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L68) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L80).
  - The actual bridge protocol only defines inbound message types `loadMedia`, `syncFrame`, `syncColor`, and `ping` in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L11) through [src/integrations/DCCBridge.ts#L26).
  - Runtime dispatch in `DCCBridge.handleMessage(...)` only routes those four message types and rejects everything else as `UNKNOWN_TYPE` in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L395) through [src/integrations/DCCBridge.ts#L418).
  - `AppDCCWiring` likewise only subscribes to `loadMedia`, `syncFrame`, and `syncColor` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L84) through [src/AppDCCWiring.ts#L141).
- Impact:
  - Real DCC clients following the published contract for frame-range, metadata, or color-space commands will hit unsupported-message errors instead of getting the documented behavior.
  - That blocks several advertised roundtrip workflows such as pushing shot context, frame ranges, or input color metadata from Maya/Nuke/Houdini into the viewer.

### 327. DCC status roundtrip is documented, but the shipped bridge has no `statusChanged` message path

- Severity: Medium
- Area: DCC integration / status sync
- Evidence:
  - The DCC integration guide documents outbound `statusChanged` messages from the viewer in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L85) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L96).
  - The actual outbound protocol only defines `frameChanged`, `colorChanged`, `annotationAdded`, `pong`, and `error` in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L22) through [src/integrations/DCCBridge.ts#L27) and [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L75) through [src/integrations/DCCBridge.ts#L117).
  - `AppDCCWiring` only forwards `session.frameChanged` and `colorControls.adjustmentsChanged` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L143) through [src/AppDCCWiring.ts#L162); it never subscribes to `session.statusChanged`.
- Impact:
  - A DCC tool cannot rely on OpenRV Web to push review-status changes back over the live bridge, even though that workflow is presented as supported.
  - Any pipeline expecting browser-driven approval or needs-revision updates to flow back into a DCC-side review context will silently get nothing.


### 329. Dailies reports include only the current version label, not the version history they advertise

- Severity: Medium
- Area: Reports / version data
- Evidence:
  - The report docs describe “Version info | Version number and history” in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L86) through [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L96).
  - `buildReportRows(...)` looks up the version group for a source, then only extracts the single `label` for the current source’s matching entry in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L120) through [src/export/ReportExporter.ts#L129).
  - Neither the CSV nor HTML output adds any other version-group entries or history fields in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L196) through [src/export/ReportExporter.ts#L210) and [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L252) through [src/export/ReportExporter.ts#L269).
- Impact:
  - Review reports cannot show a shot’s version lineage or alternative versions, only the one label attached to the exported source row.
  - That makes the report less useful for production review trails where version progression itself matters.

### 330. ShotGrid note sync flattens local note threads and statuses into plain top-level comments

- Severity: Medium
- Area: ShotGrid integration / note round-trip fidelity
- Evidence:
  - Local notes support threaded replies via `parentId` and review state via `status: 'open' | 'resolved' | 'wontfix'` in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L11) through [src/core/session/NoteManager.ts#L23).
  - ShotGrid push iterates every local note for a source and sends only `text` plus optional `frameRange` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L197) through [src/integrations/ShotGridIntegrationBridge.ts#L215) and [src/integrations/ShotGridBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridBridge.ts#L266) through [src/integrations/ShotGridBridge.ts#L291).
  - ShotGrid pull reconstructs local notes with `addNote(...)` using source/frame/text/author only, with no reply linkage or restored note status in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L276) through [src/integrations/ShotGridIntegrationBridge.ts#L308).
- Impact:
  - A threaded review conversation or resolved/won’t-fix state in OpenRV Web cannot survive a ShotGrid sync round-trip as equivalent structured review data.
  - The integration reduces richer local note workflows to a flat list of plain comments, which weakens production review traceability.


### 333. Reference `toggle` mode is documented as a switch between live and reference, but the renderer only replaces the frame

- Severity: Medium
- Area: Reference comparison / API semantics
- Evidence:
  - The advanced compare docs describe reference `Toggle` mode as "Press to switch between reference and live" in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L21) through [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L29).
  - `ReferenceManager` treats `toggle` as a first-class view mode alongside `split-h`, `split-v`, `overlay`, and `side-by-side` in [src/ui/components/ReferenceManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ReferenceManager.ts#L13) through [src/ui/components/ReferenceManager.ts#L18) and [src/ui/components/ReferenceManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ReferenceManager.ts#L40) through [src/ui/components/ReferenceManager.ts#L46).
  - The shipped View tab still only exposes capture and a binary enable/disable button for reference comparison in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L85) through [src/services/tabContent/buildViewTab.ts#L117).
  - In the renderer, `viewMode === 'toggle'` just draws the reference image over the full frame once, the same way a static replacement would, in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3920) through [src/ui/components/Viewer.ts#L3925); there is no additional input path there that alternates between live and reference imagery.
- Impact:
  - Anyone using the documented/API-level `toggle` reference mode gets a latched full-frame reference display, not a real switch-back-and-forth comparison mode.
  - That makes one of the advertised reference comparison modes semantically misleading and less useful for quick before/after review.

### 334. Comparison annotations are tied to the `A/B` slot, not to the underlying source they were drawn on

- Severity: Medium
- Area: Paint / compare review data fidelity
- Evidence:
  - The advanced compare docs say comparison annotations are "tied to the source they were drawn on" so switching between A and B preserves each source's annotation layer independently in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L61) through [docs/compare/advanced-compare.md#L63).
  - The actual paint annotation model has no source identity field; it only stores `version?: 'A' | 'B' | 'all'` on annotations in [src/paint/types.ts](/Users/lifeart/Repos/openrv-web/src/paint/types.ts#L58) through [src/paint/types.ts](/Users/lifeart/Repos/openrv-web/src/paint/types.ts#L69) and [src/paint/types.ts](/Users/lifeart/Repos/openrv-web/src/paint/types.ts#L83) through [src/paint/types.ts](/Users/lifeart/Repos/openrv-web/src/paint/types.ts#L89).
  - When new paint data is created, `PaintEngine` writes only the current annotation version slot into the annotation payload in [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L237) through [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L254) and [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L291) through [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L299).
  - Display filtering also keys entirely off that `A/B` version tag, not a source index or media identifier, in [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L633) through [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L703).
- Impact:
  - If users redraw A/B assignments to different sources, the annotation layer follows the `A` or `B` slot rather than staying attached to the original media source.
  - That makes the shipped comparison-annotation workflow less reliable than documented for real version review, because annotation meaning can drift when compare assignments change.

### 335. Presentation mode does not provide the visual playback HUD that the review docs describe

- Severity: Medium
- Area: Presentation mode / review UX
- Evidence:
  - The review workflow docs say that in presentation mode "A minimal HUD appears briefly when playback state changes (play/pause indicator, frame counter)" in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L145) through [docs/advanced/review-workflow.md#L151).
  - `PresentationMode` itself only manages hidden elements and cursor auto-hide; its stated responsibility is to hide UI and show only the viewer canvas in [src/utils/ui/PresentationMode.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/PresentationMode.ts#L1) through [src/utils/ui/PresentationMode.ts#L5), and its enter/exit logic only hides/restores DOM elements plus cursor state in [src/utils/ui/PresentationMode.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/PresentationMode.ts#L111) through [src/utils/ui/PresentationMode.ts#L165).
  - The live playback-state hook in `LayoutOrchestrator` only announces play/pause changes to the screen-reader announcer in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L423) through [src/services/LayoutOrchestrator.ts#L428); it does not create any visual presentation HUD.
  - The nearest visual playback overlay, `FPSIndicator`, is a separate optional viewer overlay with its own enable flag and is not tied to presentation mode in [src/ui/components/FPSIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FPSIndicator.ts#L193) through [src/ui/components/FPSIndicator.ts#L215).
- Impact:
  - Users entering presentation mode get hidden chrome and cursor auto-hide, but not the transient play/pause plus frame-counter HUD the review workflow promises.
  - That makes playback-state feedback weaker than documented in screening-room or client-review usage, especially once normal UI chrome is hidden.


### 340. The session-management guide describes the History panel as snapshot/autosave recovery, but the shipped panel is only undo/redo action history

- Severity: Medium
- Area: Documentation / recovery workflow
- Evidence:
  - The session-management guide says the History Panel provides "a unified view of both manual snapshots and auto-save entries" with filtering by snapshot/checkpoint/autosave type and quick restore in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L190) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L199).
  - The shipped `HistoryPanel` source describes itself as a "Visual panel showing undo/redo history" in [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L1) through [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L7).
  - Its implementation is built entirely on `HistoryManager` action entries and exposes only entry selection plus clear-history behavior in [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L25) through [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L124) and [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L175) through [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L205).
  - Snapshot and autosave recovery are handled by separate systems (`SnapshotPanel`, `SnapshotManager`, `AutoSaveManager`, and `AppPersistenceManager`), not by `HistoryPanel`, as shown in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L1) through [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L8) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L2) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L6).
- Impact:
  - Users looking for crash recovery, auto-checkpoints, or snapshot restore in the History panel will land in the wrong tool entirely.
  - That makes the recovery workflow docs materially misleading, because the described panel does not match the shipped runtime behavior.

### 341. Network-sync docs promise participant avatars in the viewer, but presence only renders inside the connection panel

- Severity: Medium
- Area: Collaboration UI / documentation contract
- Evidence:
  - The network-sync docs say participants are visible "as avatar overlays in the viewer" and that presence avatars appear "in the top-right corner of the viewer" in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L41) through [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L47).
  - The shipped `NetworkControl` renders user avatars only inside `userListContainer` in the connection panel in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1273) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1325).
  - A production-code search finds no viewer-side presence overlay or avatar rendering path outside that panel list; the runtime matches are limited to `NetworkControl`'s panel DOM.
- Impact:
  - Users expecting live participant presence in the viewer itself will not get the on-image collaboration cue the docs describe.
  - That makes collaborative review feel less visible than documented, especially when the network panel is closed during playback.

### 342. Network-sync docs describe a dedicated conflict/warning header state that the shipped indicator cannot represent

- Severity: Medium
- Area: Collaboration status UI / documentation contract
- Evidence:
  - The network-sync guide says the header sync indicator shows a `Red warning` state for conflicts and manual intervention in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L139) through [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L143).
  - The runtime connection-state model only defines `disconnected`, `connecting`, `connected`, `reconnecting`, and `error` in [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L9).
  - `NetworkControl.updateButtonStyle()` only renders three visual cases: connected, connecting/reconnecting, and everything else muted; there is no separate conflict/manual-intervention styling path in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1133) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1148).
  - Conflict detection currently lives in `SyncStateManager` logic only, with no UI consumer found in the production indicator path.
- Impact:
  - Users cannot rely on the header control to distinguish a sync conflict from ordinary disconnection/reconnection states the way the docs describe.
  - That weakens trust in the collaboration status indicator during remote review, because one of the documented states is not actually expressible in the shipped UI.

### 345. Multi-view EXR and alternate stereo-input workflows are documented as integrated, but production hardcodes side-by-side stereo

- Severity: High
- Area: Stereo media workflow / documentation contract
- Evidence:
  - The docs say multi-view EXR "integrates with the stereo viewing system" and can be displayed via stereo mode in [docs/playback/exr-layers.md](/Users/lifeart/Repos/openrv-web/docs/playback/exr-layers.md#L72) through [docs/playback/exr-layers.md](/Users/lifeart/Repos/openrv-web/docs/playback/exr-layers.md#L76), and say separate stereo input plus automatic multi-view stereo-pair mapping are supported in [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L79) through [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L97) and [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L163) through [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L171).
  - The `MultiViewEXR` parser/helpers exist, but a production-code search finds no runtime consumer outside the format barrel export in [src/formats/index.ts](/Users/lifeart/Repos/openrv-web/src/formats/index.ts#L14) through [src/formats/index.ts](/Users/lifeart/Repos/openrv-web/src/formats/index.ts#L20).
  - The shipped viewer stereo path applies `StereoManager.applyStereoMode(...)` / `applyStereoModeWithEyeTransforms(...)` without any input-format argument in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2112) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2118), and `Viewer.getStereoPair()` explicitly hardcodes `'side-by-side'` in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3050) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3058).
  - `StereoManager` also calls the renderer helpers without supplying any alternate `StereoInputFormat`, so the default side-by-side path is used in [src/ui/components/StereoManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoManager.ts#L132) through [src/ui/components/StereoManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoManager.ts#L152).
- Impact:
  - Users are told to expect separate-input and multi-view stereo workflows that the shipped viewer does not actually wire end-to-end.
  - That makes stereo EXR review look supported on paper while production behavior remains side-by-side-centric.

### 346. The accessibility overview overclaims live announcements for frame navigation and tool selection

- Severity: Medium
- Area: Accessibility / documentation contract
- Evidence:
  - The UI overview says screen readers are notified for "playback start/stop, frame navigation, source loading, and tool selection" in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L234) through [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L236).
  - The production `AriaAnnouncer` wiring in `LayoutOrchestrator` only announces tab changes, file loads, playback start/pause, and playback speed changes in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L388) through [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L435).
  - `KeyboardActionMap` adds announcements for range-shift actions only, not ordinary frame stepping or generic tool selection, in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L343) through [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L366).
  - A source search for frame-announcement calls finds no production announcement path for normal frame stepping/seek events.
- Impact:
  - Assistive-technology users can rely on the docs for a level of navigation feedback that the shipped app does not consistently provide.
  - That makes the accessibility overview materially overstate what is currently announced at runtime.


### 348. The shortcut docs still advertise `H` and `W` for histogram and waveform even though those defaults are hidden by conflicts

- Severity: Medium
- Area: Documentation / scopes workflow
- Evidence:
  - The shortcut reference lists `H` for histogram and `W` for waveform in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L72) through [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L73).
  - The getting-started UI overview repeats those same shortcuts for the panels in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L203) through [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L204).
  - In production, `AppKeyboardHandler` marks both `panel.histogram` and `panel.waveform` as conflicting defaults because `H` and `W` are taken by fit-to-height and fit-to-width behavior in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L41) through [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L47).
  - The scopes actions still exist in `KeyboardActionMap`, but the conflict handling means the docs are describing shortcuts that are not normally registered for direct use in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L442) through [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L445).
- Impact:
  - Users can follow the official shortcut docs, press `H` or `W`, and get a different viewer action than the scopes panel they were promised.
  - That keeps the scopes area looking broken even when the underlying panels themselves still work through buttons or custom bindings.


### 351. The format-support reference overstates several partially supported formats as if they were fully usable

- Severity: Medium
- Area: Documentation / format support contract
- Evidence:
  - The quick format table presents `EXR` as supporting "multi-view stereo", `Float TIFF` as a supported HDR image format, and `MXF` as a supported video format in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L16), [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L20), and [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L59).
  - The FAQ likewise lists `MXF` among supported video formats in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L29).
  - Production stereo wiring is still side-by-side-centric: `Viewer.getStereoPair()` hardcodes `'side-by-side'`, and the `MultiViewEXR` helpers have no production consumer outside barrel exports in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3050) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3058) and [src/formats/index.ts](/Users/lifeart/Repos/openrv-web/src/formats/index.ts#L14) through [src/formats/index.ts](/Users/lifeart/Repos/openrv-web/src/formats/index.ts#L20).
  - The deeper technical guide already admits MXF is metadata-only with "No pixel decode" in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L262) through [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L269) and [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L418).
  - Existing decoder/runtime behavior also narrows the practical support envelope further than the top-level table suggests:
    - valid float TIFF layouts are rejected outside the decoder’s narrow accepted channel/compression cases
    - EXR multi-view stereo is parsed but not wired to real stereo playback
    - MXF registration does not mean usable frame decode
- Impact:
  - Users reading the top-level support table can assume they can review MXF media or multi-view stereo EXRs end-to-end when the shipped app only provides partial or metadata-level behavior.
  - That makes the support matrix look more complete than the runtime actually is, which is costly when teams plan media handoff formats around it.

### 352. The overlays guide relies on a non-existent `Overlays` submenu and a non-existent `Clear All Overlays` action

- Severity: Medium
- Area: Documentation / overlay controls
- Evidence:
  - The overlays guide tells users to toggle overlays from the `Overlays menu`, says the EXR window overlay is enabled from the `Overlays menu`, and claims all overlays live under an `Overlays` submenu in the View tab with a master `Clear All Overlays` option in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L20), [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L86), and [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L211) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L215).
  - A production-code search finds no `Overlays` menu/submenu and no `Clear All Overlays` implementation.
  - The shipped overlay entry points are scattered as individual buttons and controls instead, such as EXR window, info strip, spotlight, and FPS indicator toggles in the View tab and watermark in Effects, as shown in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L375) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L440) and [src/services/tabContent/buildEffectsTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildEffectsTab.ts#L53) through [src/services/tabContent/buildEffectsTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildEffectsTab.ts#L66).
- Impact:
  - Users following the overlays guide can waste time looking for a centralized menu and bulk-clear action that do not exist in the shipped app.
  - That also obscures the real control layout, because the actual overlay toggles are distributed across separate toolbar buttons and panels.

### 354. The overlays guide documents a viewer note overlay, but production `NoteOverlay` is only a timeline note-bar helper

- Severity: Medium
- Area: Documentation / notes UI
- Evidence:
  - The overlays guide describes a bottom-of-viewer note panel with frame text, authors, stacked notes, and navigation arrows in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L171) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L182).
  - The shipped `NoteOverlay` implementation explicitly "draws colored bars on the timeline canvas for notes" and contains only timeline draw logic, not viewer-overlay text UI, in [src/ui/components/NoteOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NoteOverlay.ts#L1) through [src/ui/components/NoteOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NoteOverlay.ts#L104).
  - App bootstrap wires that object into the timeline, not the viewer, in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L171) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L177).
  - `OverlayManager` enumerates the actual viewer overlays and does not include any viewer note overlay in [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L10) through [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L32) and [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L45) through [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L63).
- Impact:
  - Users looking for a live viewer note overlay will not find the panel, arrows, or automatic current-frame note text that the docs describe.
  - The only shipped "note overlay" is a compact timeline mark, so the documentation currently promises a different UI than the app provides.

### 355. The overlays guide documents a tiled text watermark system, but the shipped watermark is only a single positioned image overlay

- Severity: Medium
- Area: Documentation / watermark workflow
- Evidence:
  - The overlays guide says the watermark overlay tiles "a text string or image across the entire frame" and exposes text, rotation, and color controls in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L130) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L146).
  - The shipped `WatermarkOverlay` is defined as a "Static image overlay" whose state only contains image URL, position, scale, opacity, and margin in [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L1) through [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L31).
  - Rendering is a single `drawImage(...)` call at one calculated position, not a tiled text/image pattern, in [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L199) through [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L215).
  - The shipped `WatermarkControl` only exposes image upload/removal plus position, scale, opacity, and margin controls in [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L1) through [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L8) and [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L89) through [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L140).
- Impact:
  - Users expecting confidential tiled text watermarks or recipient-name overlays from the shipped UI will not be able to create them.
  - The current documentation describes a substantially broader watermark feature than the runtime actually implements.

### 356. The overlays guide's `Perspective Grid` section describes composition guides, but production splits those features between Safe Areas and a perspective-correction mesh

- Severity: Medium
- Area: Documentation / overlay feature model
- Evidence:
  - The overlays guide describes a configurable `Perspective Grid` with rule-of-thirds, golden-ratio, custom-grid, and crosshair modes plus color/line-width/diagonal options in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L150) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L167).
  - The shipped `PerspectiveGridOverlay` is actually a perspective-correction mesh with four draggable corner handles, a fixed 8x8 subdivision count, and fixed colors in [src/ui/components/PerspectiveGridOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PerspectiveGridOverlay.ts#L1) through [src/ui/components/PerspectiveGridOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PerspectiveGridOverlay.ts#L13) and [src/ui/components/PerspectiveGridOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PerspectiveGridOverlay.ts#L78) through [src/ui/components/PerspectiveGridOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PerspectiveGridOverlay.ts#L104).
  - The composition-guide pieces the docs mention are instead attached to `SafeAreasOverlay`, which implements rule-of-thirds, center crosshair, aspect-ratio guides, and configurable color/opacity in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L1) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L29), [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L151) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L201), and [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L307) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L380).
  - There is no production evidence for the documented golden-ratio, arbitrary row/column grid, diagonal-line, or line-width options.
- Impact:
  - Users are taught to look for one configurable perspective-grid feature, but the shipped app splits part of that into Safe Areas and omits the rest entirely.
  - That makes both the composition-guide workflow and the perspective-correction workflow harder to discover because the docs collapse them into a feature model the UI does not match.


### 359. The network-sync guide overstates generic one-click joining from share URLs

- Severity: Medium
- Area: Documentation / network sync onboarding
- Evidence:
  - The network-sync guide says opening a copied shareable URL "automatically populates the room code and initiates a join" in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L35), and later describes URL-based signaling as one-click joining without manual entry in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L88).
  - During URL bootstrap, production only auto-joins the normal room path when both `room` and `pin` are present, in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L295) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L299).
  - Plain room links without a PIN are only prefilled into the UI and do not auto-join, since `handleURLBootstrap()` sets the join field from `room` but skips `joinRoom(...)` unless `pinCode` is also present, in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L251) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L260) and [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L295) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L299).
  - Malformed WebRTC share links are also silently ignored during bootstrap because invalid decoded payloads never produce a UI error path in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L263) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L293).
- Impact:
  - Users can rely on the docs for generic one-click join behavior that only works for narrower URL shapes than the guide implies.
  - When a copied link does not auto-join or a malformed invite opens silently, the app appears unreliable instead of merely under-documented.

### 361. The stabilization docs describe controls and viewer progress UI that the shipped stabilization panel does not provide

- Severity: Medium
- Area: Documentation / stabilization workflow
- Evidence:
  - The effects guide describes a short pre-analysis pass with a progress indicator in the viewer, and lists translation and rotation enable/disable controls in [docs/advanced/filters-effects.md](/Users/lifeart/Repos/openrv-web/docs/advanced/filters-effects.md#L85) through [docs/advanced/filters-effects.md](/Users/lifeart/Repos/openrv-web/docs/advanced/filters-effects.md#L90).
  - The shipped `StabilizationControl` only exposes three user-facing controls: `Enabled`, `Smoothing Strength`, and `Crop Amount` in [src/ui/components/StabilizationControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StabilizationControl.ts#L158) through [src/ui/components/StabilizationControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StabilizationControl.ts#L203).
  - A production-code search finds no viewer-side stabilization progress indicator or progress UI path.
  - The underlying effect adapter does still mention `stabilizationAutoMotion`, but there is no corresponding shipped panel control for the documented translation/rotation toggles in [src/effects/adapters/StabilizationEffect.ts](/Users/lifeart/Repos/openrv-web/src/effects/adapters/StabilizationEffect.ts#L13) through [src/effects/adapters/StabilizationEffect.ts#L18).
- Impact:
  - Users following the stabilization docs can look for controls and progress feedback that the shipped panel never surfaces.
  - That makes stabilization feel incomplete or broken in production even when the simpler crop/smoothing implementation is working as designed.

### 362. The display-profile guide promises a viewer status-area profile indicator that production does not expose

- Severity: Low
- Area: Documentation / display-profile feedback
- Evidence:
  - The display-profile guide says `Shift+Alt+D` cycles display profiles and that "The active profile name appears in the viewer status area" in [docs/color/display-profiles.md](/Users/lifeart/Repos/openrv-web/docs/color/display-profiles.md#L22) through [docs/color/display-profiles.md](/Users/lifeart/Repos/openrv-web/docs/color/display-profiles.md#L24).
  - The shipped `DisplayProfileControl` does provide the `Shift+Alt+D` shortcut and the dropdown/button UI in [src/ui/components/DisplayProfileControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/DisplayProfileControl.ts#L56) through [src/ui/components/DisplayProfileControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/DisplayProfileControl.ts#L59), but it does not create any separate viewer status indicator.
  - A production-code search for display-profile status rendering only finds the control itself and its tests; there is no viewer HUD/status widget that displays the active profile name.
- Impact:
  - Users following the guide can look for an on-viewer status readout that never appears.
  - That makes profile cycling feel less observable than the docs imply, especially when using only the keyboard shortcut.

### 364. The annotation-import docs promise merge and frame-offset workflows, but the shipped UI always replaces in place

- Severity: Medium
- Area: Documentation / annotation import workflow
- Evidence:
  - The annotation export/import guide says annotation import supports `Merge` and `Frame offset` workflows in [docs/annotations/export.md](/Users/lifeart/Repos/openrv-web/docs/annotations/export.md#L25) through [docs/annotations/export.md#L31).
  - The shipped Export menu exposes only a single `Import Annotations (JSON)` action in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L205) through [src/ui/components/ExportControl.ts#L209).
  - Production import wiring always calls `applyAnnotationsJSON(...)` with `{ mode: 'replace' }` and tells the user "Existing annotations were replaced" in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L253) through [src/AppPlaybackWiring.ts#L274).
  - The lower-level utility still supports both `mode: 'merge'` and `frameOffset`, but the shipped UI never exposes either option in [src/utils/export/AnnotationJSONExporter.ts](/Users/lifeart/Repos/openrv-web/src/utils/export/AnnotationJSONExporter.ts#L199) through [src/utils/export/AnnotationJSONExporter.ts#L218).
- Impact:
  - Users following the docs can expect to merge imported annotations into an existing review or shift them for retimed media, but the live app only offers destructive replacement.
  - That turns a documented interchange workflow into a lossy overwrite operation unless the user writes code against the utility layer.

### 365. The session-management docs tell users to delete auto-save entries from the Snapshot Panel, but that panel does not manage auto-saves

- Severity: Medium
- Area: Documentation / session-storage cleanup
- Evidence:
  - The session-management guide says, "To free storage, delete old snapshots and auto-save entries from the Snapshot Panel" in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L180) through [docs/advanced/session-management.md#L186).
  - The shipped `SnapshotPanel` is a snapshot browser with `Create Snapshot`, `Import`, and per-snapshot restore/export/delete actions in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L1) through [src/ui/components/SnapshotPanel.ts#L10) and [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L187) through [src/ui/components/SnapshotPanel.ts#L249).
  - The underlying `SnapshotManager` models manual snapshots and auto-checkpoints, not `AutoSaveManager` entries, in [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L5) through [src/core/session/SnapshotManager.ts#L24) and [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L121) through [src/core/session/SnapshotManager.ts#L183).
  - The same docs page separately describes a `History Panel` as the place for auto-save history and recovery in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L190) through [docs/advanced/session-management.md#L199), which does not match the shipped history UI either.
- Impact:
  - Users trying to free storage via the documented panel cannot actually remove auto-save entries there, because that panel only manages snapshots and auto-checkpoints.
  - That makes a concrete maintenance workflow in the docs impossible to complete from the named UI.

### 368. The review docs promise a shot-status badge in the header, but production has no such header status UI

- Severity: Medium
- Area: Documentation / review workflow UI
- Evidence:
  - The review workflow guide says, "The current shot status is displayed as a colored badge in the header bar next to the source name" and that it follows the visible clip during playlist playback in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L26).
  - A production UI search finds status badges only in note and ShotGrid-related surfaces, such as [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L522) and [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L7), not in the main header bar.
  - There is no corresponding header-bar component or wiring path that reads `StatusManager` and renders a source-adjacent status badge in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts).
- Impact:
  - Users following the review docs can look for a persistent header-level status readout that never appears in the shipped app.
  - That makes shot-status tracking feel partially missing even before users hit the deeper limitation that there is no real production status-management UI.

### 371. The playback docs describe a labeled loop-mode button, but production renders an icon-only compact control

- Severity: Low
- Area: Documentation / playback controls
- Evidence:
  - The loop-mode guide says the header button "shows an icon and label (e.g., `Loop`, `Ping`, `Once`) and has a minimum width of 70px" in [docs/playback/loop-modes-stepping.md](/Users/lifeart/Repos/openrv-web/docs/playback/loop-modes-stepping.md#L39).
  - The UI overview likewise says the loop control "displays current mode (Loop, Ping, Once)" in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L84).
  - The shipped header creates the loop button with a `28px` minimum width in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L325) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L328).
  - Runtime updates replace the button contents with SVG only and move the text label into `aria-label`, not visible UI, in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1346) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1360).
- Impact:
  - Users following the docs can look for visible `Loop` / `Ping` / `Once` text in the header and instead find only a compact icon.
  - That makes the current mode less glanceable than the documentation implies, especially for users still learning the transport controls.

### 376. Auto-checkpoints are documented as broad safety nets before major operations, but production only creates them for restore and project-load flows

- Severity: Medium
- Area: Snapshots / recovery workflow / documentation
- Evidence:
  - The session-management guide says, "Auto-checkpoints are generated before major operations (e.g., loading new media, clearing annotations)" in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L96).
  - Production only defines checkpoint creation in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L194) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L212).
  - A production-code search shows live call sites only before snapshot restore and project/session load in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L227) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L234), [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L349) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L356), and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L385) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L393).
  - There is no corresponding checkpoint wiring around ordinary media loads, annotation clearing, or similar destructive editing paths.
- Impact:
  - Users can trust auto-checkpoints to protect routine destructive actions that the shipped app never checkpoints.
  - That makes the documented safety net much narrower than it sounds, especially during active review/editing work where people are not explicitly loading projects.

### 383. The file-reload docs promise a real Cancel path, but production treats close and Escape the same as Skip

- Severity: Medium
- Area: Session restore / blob reload workflow
- Evidence:
  - The session export guide says the user can "select the original file, skip the reference, or cancel" in [docs/export/sessions.md](/Users/lifeart/Repos/openrv-web/docs/export/sessions.md#L39) through [docs/export/sessions.md](/Users/lifeart/Repos/openrv-web/docs/export/sessions.md#L45).
  - The shipped file-reload dialog only renders `Browse`, `Load`, and `Skip` actions in [src/ui/components/shared/Modal.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Modal.ts#L724) through [src/ui/components/shared/Modal.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Modal.ts#L742).
  - Closing the dialog or pressing `Escape` resolves `null` through the same code path as Skip in [src/ui/components/shared/Modal.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Modal.ts#L588) through [src/ui/components/shared/Modal.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Modal.ts#L595) and [src/ui/components/shared/Modal.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Modal.ts#L709) through [src/ui/components/shared/Modal.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Modal.ts#L715).
  - `SessionSerializer.fromJSON()` treats any `null` result as a skipped reload and continues loading with a warning in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L475) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L489).
- Impact:
  - Users cannot actually cancel the whole restore/reload flow from that dialog even though the docs say they can.
  - Dismissing the prompt can silently degrade the restored session instead of aborting the operation, which is materially different from a true cancel action.

### 387. The RV/GTO companion-file resolution path is effectively unreachable from the shipped Open Project picker

- Severity: Medium
- Area: Project loading / session sidecars
- Evidence:
  - `openProject(file, companionFiles)` explicitly supports additional media/CDL sidecar files for `.rv` / `.gto` resolution in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L339) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L341) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L396) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L402).
  - The header wiring forwards all selected files from the hidden project input to that API in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L60) through [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L61).
  - But the shipped project input only accepts `.orvproject,.rv,.gto,.rvedl` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L226) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L231), so users cannot normally select the non-session media/CDL companion files that the resolver expects.
- Impact:
  - The code supports basename-based RV/GTO sidecar recovery, but the primary shipped Open Project picker does not let users provide the needed sidecar files.
  - In practice that leaves drag-and-drop as the only obvious path for companion resolution, which makes the “Open Project” flow less capable than the underlying implementation suggests.

### 388. The Open Project picker allows multiple files, but the app still treats only the first selected file as the real project

- Severity: Low
- Area: Project loading / picker behavior
- Evidence:
  - The shipped hidden project input is configured with `multiple = true` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L226) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L229).
  - `handleProjectOpen(...)` forwards the entire `FileList` as-is in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1503) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1508).
  - But production wiring always calls `openProject(files[0]!, files.slice(1))`, so only the first selected file is treated as the actual project/session and every remaining file is demoted to a companion slot in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L60) through [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L61).
  - In the `.orvproject` branch, those extra selected files are ignored entirely because `companionFiles` are only used for `.rv` / `.gto` handling in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L348) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L384) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L396) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L402).
- Impact:
  - The picker UI suggests multi-file project opening is meaningful, but selecting multiple project/session files has ambiguous or ignored results.
  - That makes the Open Project affordance less predictable than the single-project mental model the runtime actually implements.

### 389. The `Open project` picker also accepts `.rvedl`, even though that path does not open a project

- Severity: Low
- Area: Project loading UI / EDL workflow
- Evidence:
  - The shipped project input accepts `.orvproject,.rv,.gto,.rvedl` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L226) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L229).
  - The same button is presented simply as `Open project` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L243).
  - But the `.rvedl` branch in `openProject(...)` only parses EDL text and calls `session.loadEDL(text)`; it does not restore project/session state in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L418) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L423).
- Impact:
  - The project-opening affordance bundles a timeline-import format that behaves fundamentally differently from a real project/session load.
  - That makes the button’s semantics fuzzy and increases the chance that users expect a session replacement when they are really just importing an edit list.

### 393. The `Open media file` control is also a session and EDL importer, not just a media picker

- Severity: Low
- Area: Header file-open UI semantics
- Evidence:
  - The header button is titled `Open media file` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L234) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L235).
  - But its hidden input accepts not just supported media formats, but also `.rv`, `.gto`, and `.rvedl` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L216) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L220).
  - The same handler explicitly branches into RV/GTO session import and RVEDL import before ordinary media loading in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1382) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1439).
- Impact:
  - The shipped main file-open affordance does more than its label suggests, which makes session import paths harder to discover correctly and easier to misunderstand.
  - That overlaps awkwardly with the separate `Open project` affordance, since both buttons can open non-media session-like files through different semantics.

### 394. Locally loaded image sequences do not round-trip through project save/load with a real reload path

- Severity: High
- Area: Project persistence / image sequences
- Evidence:
  - Sequence sources are created with `url: ''` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L691) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L700).
  - `serializeMedia(...)` only marks media as `requiresReload` when `source.url` is a blob URL in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L388) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L407), so locally loaded sequences with an empty URL are saved without a reload prompt marker.
  - On load, `fromJSON()` does not reconstruct sequences; it just warns `Sequence "<name>" requires manual file selection` in the `ref.type === 'sequence'` branch in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L509) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L512).
  - The docs, however, say that media references which cannot be automatically reloaded trigger a file reload dialog and that locally loaded media can be re-selected so the session resumes intact in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L57) and [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L174).
- Impact:
  - A locally loaded image sequence cannot come back through normal project load/recovery with the same guided reload experience as other local media.
  - Instead the sequence effectively degrades into a warning-only manual reconstruction problem, which is a significant persistence gap for review sessions built around sequences.

### 395. `.rv` / `.gto` imports behave differently depending on whether users choose `Open media file` or `Open project`

- Severity: Medium
- Area: Session import workflow consistency
- Evidence:
  - The `Open media file` path loads RV/GTO sessions directly via `session.loadFromGTO(...)` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1419) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1436).
  - The `Open project` path routes the same file types through `AppPersistenceManager.openProject(...)`, which first creates a safety checkpoint and then performs extra control resync after `loadFromGTO(...)` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L385) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L413).
  - So the same `.rv` / `.gto` payload goes through materially different runtime steps depending on which header button the user used.
- Impact:
  - Users can get different rollback safety and different post-load UI truthfulness for the same session file based solely on which affordance they clicked.
  - That makes session import behavior less predictable than it should be and increases the chance of subtle “works one way but not the other” reports.


### 401. Multi-select session import from `Open media file` only honors the first `.rv` / `.gto` file and silently demotes the rest to sidecars

- Severity: Medium
- Area: Session import / file-open workflow
- Evidence:
  - The shipped `Open media file` input explicitly enables multi-select in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L217) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L222).
  - But the loader only picks a single session file via `fileArray.find(...)` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1420) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1424), then drops every other selected file into the `availableFiles` sidecar map in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1425) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1435).
  - The viewer drag-and-drop path uses the same first-match behavior in [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L743) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L758).
- Impact:
  - Selecting multiple RV/GTO sessions does not import multiple sessions or ask the user which one to open; only the first one wins.
  - The remaining session files are silently treated like companion assets, which makes the multi-select affordance misleading and can hide user error during session import.

### 403. Mixed `.rvedl` plus `.rv` or `.gto` selections always load only the EDL and silently ignore the session file

- Severity: Medium
- Area: Session import / file-open precedence
- Evidence:
  - Both main ingest paths check for `.rvedl` before they check for `.rv` / `.gto` and return immediately after the EDL branch in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1382) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1416) and [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L709) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L739).
  - The `.rv` / `.gto` session-file branches only run afterward in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1420) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1443) and [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L743) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L763).
- Impact:
  - Selecting or dropping an EDL together with the RV/GTO session it belongs to does not give the user both pieces of the workflow; the session file is silently skipped.
  - That makes mixed review-bundle imports less predictable and increases the chance that users think they opened a full session when they only imported cut metadata.


### 417. RV/GTO restore contract includes `filterSettings`, but the parser never populates them

- Severity: Medium
- Area: RV/GTO import / filter-state restore
- Evidence:
  - `GTOViewSettings` includes `filterSettings?: FilterSettings` in [src/core/session/SessionTypes.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionTypes.ts#L54) through [src/core/session/SessionTypes.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionTypes.ts#L67).
  - The live `settingsLoaded` handler has a real `if (settings.filterSettings)` branch that pushes that state into the filter control in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L82) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L83).
  - But `parseInitialSettings(...)` has no `parseFilterSettings(...)` step at all; it parses color, CDL, transform, lens, crop, channel mode, stereo, scopes, linearize, noise reduction, uncrop, out-of-range, and channel swizzle only in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L24) through [src/core/session/GTOSettingsParser.ts#L95).
- Impact:
  - The restore pipeline advertises filter-state restore, but RV/GTO import never supplies that state to the live handler.
  - That leaves imported filter behavior dependent on other side effects instead of the documented settings-restore path.

### 418. RV/GTO restore contract includes stereo eye transforms and stereo align mode, but the parser never populates them

- Severity: Medium
- Area: RV/GTO import / stereo-state restore
- Evidence:
  - `GTOViewSettings` includes both `stereoEyeTransform` and `stereoAlignMode` in [src/core/session/SessionTypes.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionTypes.ts#L61) through [src/core/session/SessionTypes.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionTypes.ts#L65).
  - The live `settingsLoaded` handler has corresponding restore branches that call `context.getStereoEyeTransformControl().setState(...)` and `context.getStereoAlignControl().setMode(...)` in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L128) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L132).
  - But `parseInitialSettings(...)` never parses or assigns either field; the parser only handles `stereo` and then moves on to scopes and other settings in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L60) through [src/core/session/GTOSettingsParser.ts#L92).
  - A production-code search found no other non-test parser path that fills `settings.stereoEyeTransform` or `settings.stereoAlignMode`.
- Impact:
  - Even where the app has live restore plumbing for advanced stereo state, RV/GTO import never feeds it.
  - That makes stereo session interchange less complete than the restore contract and handler structure suggest.

### 421. RV/GTO settings restore ignores standalone RVColorCDL nodes and only reads embedded CDL components

- Severity: Medium
- Area: RV/GTO import / CDL restore coverage
- Evidence:
  - `parseCDL(...)` only reads CDL data from `RVColor` and `RVLinearize` protocol nodes in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L323) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L367).
  - The repo’s own serializer/exporter defines standalone `RVColorCDL` objects as a first-class GTO shape via `ColorSerializer.buildColorCDLObject(...)` in [src/core/session/serializers/ColorSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.ts#L581) through [src/core/session/serializers/ColorSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.ts#L604) and `SessionGTOExporter.buildColorCDLObject(...)` in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1082) through [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1085).
  - The graph loader also recognizes both `RVColorCDL` and `RVColorACESLogCDL` as real import protocols and parses their properties in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L1987) through [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L2007).
  - The live restore path does have a real `if (settings.cdl)` branch that would apply parsed CDL values through `context.getCDLControl().setCDL(...)` in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L89) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L90).
- Impact:
  - RV/GTO files that express CDL as standalone `RVColorCDL` or `RVColorACESLogCDL` nodes can be recognized by the loader layer but still fail to restore grading through the live `settingsLoaded` path.
  - That leaves CDL interchange narrower than the repo’s own serializer, exporter, and graph-loader contracts imply.

### 422. RV/GTO settings restore only understands embedded RVColor data and ignores most standalone color-node protocols

- Severity: Medium
- Area: RV/GTO import / color interchange coverage
- Evidence:
  - The repo exposes standalone GTO builders for `RVColorExposure`, `RVColorCurve`, `RVColorSaturation`, `RVColorVibrance`, `RVColorShadow`, `RVColorHighlight`, `RVColorGrayScale`, `RVColorLinearToSRGB`, `RVColorSRGBToLinear`, and `RVPrimaryConvert` in [src/core/session/serializers/ColorSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.ts#L443) through [src/core/session/serializers/ColorSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/serializers/ColorSerializer.ts#L654), re-exported through [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1026) through [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1106).
  - `GTOGraphLoader` also treats those protocols as real importable node types and parses their properties in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L1888) through [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L2138).
  - But the live settings parser only restores color adjustments from `RVColor` and `RVDisplayColor`, plus the narrower dedicated parsers for CDL and linearize in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L24) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L95) and [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L238) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L317).
  - The app’s live grading model is broader than that parser surface: `ColorAdjustments` still includes fields like `vibrance`, `highlights`, and `shadows` in [src/core/types/color.ts](/Users/lifeart/Repos/openrv-web/src/core/types/color.ts#L3) through [src/core/types/color.ts](/Users/lifeart/Repos/openrv-web/src/core/types/color.ts#L18), and the restore handler would apply any parsed adjustments via `setAdjustments(...)` in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L79) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L81).
- Impact:
  - RV/GTO files that represent grading with standalone color nodes can be recognized by the loader layer yet still lose exposure/curve/vibrance/shadow/highlight/grayscale/conversion intent in the live restore path.
  - That leaves color interchange materially narrower than the repo’s own serializer/exporter/loader surface suggests.

### 424. RV/GTO crop restore derives source dimensions from RVFileSource only, so still-image sessions can import with a full-frame crop

- Severity: Medium
- Area: RV/GTO import / crop restore
- Evidence:
  - `SessionGTOExporter.buildSourceGroupObjects(...)` emits still sources as `RVImageSource`, not `RVFileSource`, while still attaching the same `proxy.size` dimensions in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L597) through [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L635).
  - `SessionGraph.parseSession(...)` derives `sourceWidth` and `sourceHeight` only from `dto.byProtocol('RVFileSource')` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L515) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L547).
  - `parseCrop(...)` needs non-zero source dimensions to convert pixel crop bounds into normalized region values; otherwise it falls back to `{ x: 0, y: 0, width: 1, height: 1 }` even when crop coordinates are present in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L568) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L585).
  - `SessionGraph.parseSession(...)` feeds those derived dimensions directly into `_parseInitialSettings(dto, { width: sourceWidth, height: sourceHeight })` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L552).
- Impact:
  - RV/GTO sessions built around still images can carry a valid crop but restore it as an enabled full-frame region because the parser never discovers the image dimensions.
  - Crop behavior therefore differs by source protocol, even though the exporter writes the same `proxy.size` data for both still and file/video sources.

### 425. RV/GTO paint-annotation import uses a default 1.0 aspect ratio for RVImageSource sessions

- Severity: Medium
- Area: RV/GTO import / annotation geometry
- Evidence:
  - `SessionGraph.parseSession(...)` computes `aspectRatio` only while iterating `dto.byProtocol('RVFileSource')` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L515) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L547).
  - Still-image sessions are exported as `RVImageSource` objects, not `RVFileSource`, in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L597) through [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L635).
  - `SessionGraph.parseSession(...)` then passes the derived `aspectRatio` into `annotationStore.parsePaintAnnotations(dto, aspectRatio)` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L549) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L550).
  - `AnnotationStore` uses that aspect ratio directly when converting OpenRV coordinates for pen strokes and text annotations in [src/core/session/AnnotationStore.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AnnotationStore.ts#L440) through [src/core/session/AnnotationStore.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AnnotationStore.ts#L465) and [src/core/session/AnnotationStore.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AnnotationStore.ts#L537) through [src/core/session/AnnotationStore.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AnnotationStore.ts#L554).
- Impact:
  - Paint annotations imported from still-image RV/GTO sessions can be placed incorrectly whenever the image aspect ratio is not 1:1.
  - The same annotation payload therefore restores differently depending on whether the source was serialized as `RVImageSource` or `RVFileSource`.

### 427. RV/GTO multi-source imports derive crop and annotation geometry from inconsistent source dimensions

- Severity: Medium
- Area: RV/GTO import / multi-source restore
- Evidence:
  - `SessionGraph.parseSession(...)` walks every `RVFileSource`, but only records `sourceWidth` / `sourceHeight` from the first source while overwriting `aspectRatio` on every later source in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L515) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L535).
  - It then feeds the first source dimensions into `_parseInitialSettings(dto, { width: sourceWidth, height: sourceHeight })` for crop parsing in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L552).
  - The same method passes the last-seen `aspectRatio` into `annotationStore.parsePaintAnnotations(dto, aspectRatio)` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L549) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L550).
  - `parseCrop(...)` converts crop bounds using the supplied width/height in [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L568) through [src/core/session/GTOSettingsParser.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOSettingsParser.ts#L579), while `AnnotationStore` converts paint coordinates using the supplied aspect ratio in [src/core/session/AnnotationStore.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AnnotationStore.ts#L440) through [src/core/session/AnnotationStore.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AnnotationStore.ts#L465).
- Impact:
  - In multi-source RV/GTO sessions with differing source sizes or aspect ratios, crop restore is normalized against the first source while paint annotations are normalized against the last one.
  - That makes imported geometry depend on source ordering rather than the authored session state.

### 429. Share links claim to share comparison state, but clean recipients can only reconstruct one media source

- Severity: Medium
- Area: URL sharing / compare-state interoperability
- Evidence:
  - The share-link subsystem explicitly describes URL sharing as including “comparison state” in [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L1) through [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L6).
  - But `SessionURLState` carries only a single `sourceUrl`, not a source list, in [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L16) through [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L39).
  - Capture fills that field from only `session.currentSource?.url` in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L120) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L145).
  - On a clean recipient, apply will load at most that one URL before restoring compare state in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L152) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L189).
  - A/B compare only becomes available when a valid B source exists, as enforced by [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L76) through [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L79) and [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L379) through [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L382).
- Impact:
  - A share link from a multi-source A/B review can carry compare indices and wipe state but still fail to reconstruct the compared media on a clean recipient.
  - The receiver ends up with partial compare state and only one loaded source, which undermines the feature's stated “comparison state” promise.

### 431. Media-bearing share links only load the shared media on an empty session

- Severity: High
- Area: URL sharing / session bootstrap
- Evidence:
  - `applySessionURLState(...)` attempts `loadSourceFromUrl(...)` only behind `if (session.sourceCount === 0 && state.sourceUrl && session.loadSourceFromUrl)` in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L148) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L164).
  - When the recipient already has any media loaded, the same method skips `sourceUrl` entirely and proceeds to apply frame/source/view state to the existing session in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L166) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L220).
  - Share-link capture still records the sender's current `sourceUrl` in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L122) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L145), so the shared media identity is available but intentionally ignored once the receiver is not on a blank session.
- Impact:
  - Opening a media-bearing share link while you already have anything loaded can apply the sender's frame/view/compare state to the wrong local media instead of the shared media.
  - That makes share links context-sensitive: the same link behaves differently depending on whether the recipient opens it in a fresh app state or not.

### 434. Malformed WebSocket sync messages are dropped silently with no error path

- Severity: Medium
- Area: Collaboration / WebSocket protocol handling
- Evidence:
  - `WebSocketClient.handleMessage(...)` deserializes incoming strings and immediately returns when `deserializeMessage(...)` fails, under the explicit comment `Reject malformed messages silently`, in [src/network/WebSocketClient.ts](/Users/lifeart/Repos/openrv-web/src/network/WebSocketClient.ts#L196) through [src/network/WebSocketClient.ts#L203).
  - `NetworkSyncManager` depends on the client's `message` and `error` events for protocol handling and user-facing error propagation in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L759) through [src/network/NetworkSyncManager.ts#L806).
  - The current tests codify the silent-drop behavior by asserting malformed messages do not reach any handler in [src/network/WebSocketClient.test.ts](/Users/lifeart/Repos/openrv-web/src/network/WebSocketClient.test.ts#L194) through [src/network/WebSocketClient.test.ts#L205).
- Impact:
  - A server/proxy that sends malformed or truncated sync payloads can cause missed collaboration updates with no toast, no error event, and no visible explanation.
  - That makes protocol corruption look like random state drift rather than a diagnosable network failure.

### 436. Outbound collaboration updates can be dropped silently when realtime transport send fails

- Severity: Medium
- Area: Collaboration / outbound transport reliability
- Evidence:
  - `WebSocketClient.send(...)` explicitly returns `false` when the socket is not open or serialization/send throws in [src/network/WebSocketClient.ts](/Users/lifeart/Repos/openrv-web/src/network/WebSocketClient.ts#L109) through [src/network/WebSocketClient.ts#L124).
  - `NetworkSyncManager.dispatchRealtimeMessage(...)` only checks that WebSocket return value, then tries the serverless data channel once and ignores whether that fallback also returned `false` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1221) through [src/network/NetworkSyncManager.ts#L1238).
  - All of the live sync senders (`sendPlaybackSync`, `sendFrameSync`, `sendViewSync`, `sendColorSync`, `sendAnnotationSync`, `sendNoteSync`, `sendCursorPosition`, media-sync messages, and permission changes) route through that same helper in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L463) through [src/network/NetworkSyncManager.ts#L742).
- Impact:
  - During transport flaps or serialization failures, local sync changes can be treated as sent even though neither WebSocket nor serverless peer transport accepted the message.
  - From the user’s perspective, collaboration can drift silently instead of surfacing an actionable transport failure.

### 439. DCC LUT sync requests can apply out of order when multiple LUT URLs arrive quickly

- Severity: Medium
- Area: DCC integration / color sync ordering
- Evidence:
  - Each inbound `syncColor` with `lutPath` kicks off `fetchAndApplyLUT(...)` without awaiting or cancelling prior requests in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L228) through [src/AppDCCWiring.ts#L242).
  - `fetchAndApplyLUT(...)` is asynchronous and applies its result directly to `colorControls.setLUT(...)` and `viewer.setLUT(...)` when the fetch/parse completes in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L95) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L119).
  - There is no generation token, cancellation, or “latest request wins” check anywhere in the DCC LUT-sync path.
- Impact:
  - Inference: if a slower older LUT request resolves after a newer one, it can overwrite the newer DCC color state and leave the viewer on stale LUT content.
  - That makes rapid DCC-driven look switching race-sensitive instead of deterministic.

### 440. URL-based media loading bypasses the app's decoder stack and breaks remote EXR or other decoder-backed images

- Severity: Medium
- Area: Share links / DCC integration / URL media loading
- Evidence:
  - `Session.loadSourceFromUrl(...)` classifies URL media only as “known video extension” vs “everything else,” and routes every non-video URL into `loadImage(...)` in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1119) through [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1139).
  - `SessionMedia.loadImage(...)` then loads the URL through a plain `HTMLImageElement` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L400) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L434), bypassing the `FileSourceNode` and decoder-backed file pipeline used for EXR, TIFF, RAW previews, and other advanced formats in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L437) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L515).
  - Share-link bootstrap uses `session.loadSourceFromUrl(...)` for `sourceUrl` reconstruction in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L152) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L157), and DCC `loadMedia` sends non-video URLs through `session.loadImage(...)` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L184) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L221).
- Impact:
  - Remote EXR plates, float TIFFs, and other formats that only work through the decoder/file pipeline cannot be reconstructed from share links or loaded via URL-based DCC commands even though the app broadly advertises support for those formats.
  - URL workflows are materially less capable than file workflows, which makes remote review/integration flows unreliable for high-end image formats.

### 441. URL-based media loading cannot detect extensionless or routed video URLs and falls back to the image path

- Severity: Medium
- Area: Share links / DCC integration / URL media detection
- Evidence:
  - `Session.loadSourceFromUrl(...)` extracts the media type only from the last pathname extension in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1131) through [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1137); if there is no recognizable extension, it unconditionally calls `loadImage(...)` in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1139).
  - DCC `loadMedia` uses the same extension-only heuristic with `path.split('.').pop()?.toLowerCase()` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L186) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L190).
  - The file-loading side of the app explicitly documents a more reliable magic-number-first detection strategy for real files in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L11), but the URL path never gets equivalent sniffing or content-type-based detection.
- Impact:
  - CDN or API-style video URLs such as `/media/12345`, `/stream/latest`, or signed routes without a terminal extension can be treated as still images and fail to load correctly.
  - The app's URL-based loading is weaker than its file-loading path in a way that is hard for integrators and share-link users to predict from the UI.

### 443. Outbound DCC sync events can be dropped silently when the bridge is not writable

- Severity: Medium
- Area: DCC integration / outbound reliability
- Evidence:
  - `DCCBridge.send(...)` returns `false` immediately when no WebSocket is open, and only emits an `error` event when a `ws.send(...)` call itself throws in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L266) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L280).
  - The app-level outbound DCC wiring ignores those return values for frame sync, color sync, and annotation sync in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L246) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L276).
  - That means the `frameChanged`, `colorChanged`, and `annotationAdded` paths have no retry, queue, or user/tool feedback when the bridge is temporarily disconnected or otherwise unwritable.
- Impact:
  - DCC-driven review sync can quietly stop propagating outbound viewer changes even though the local app continues to behave normally.
  - From the DCC side, lost updates look like random desynchronization rather than an explicit transport failure.

### 444. The DCC guide promises a configurable bridge endpoint, but production only supports `?dcc=` URL bootstrap

- Severity: Low
- Area: Documentation / DCC connection setup
- Evidence:
  - The DCC guide says the browser connects to `ws://localhost:9200` and that for remote setups “the bridge server address can be configured in the OpenRV Web settings” in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L24) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L27).
  - Production bootstrap only creates the bridge when a `dcc` query parameter is present in the page URL, in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L603) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L617).
  - A production-code search finds no DCC settings panel, no persisted DCC endpoint preference, and no other runtime entry point for configuring a bridge URL outside that query-param path.
- Impact:
  - Users following the guide can look for a settings-driven DCC connection flow that the shipped app does not provide.
  - Remote or repeated DCC setups are less usable than documented because the endpoint must be supplied out-of-band in the launch URL.

### 445. The DCC guide promises browser review notes back to the DCC, but the shipped bridge only reports paint annotations

- Severity: Low
- Area: Documentation / DCC review roundtrip
- Evidence:
  - The DCC guide says artists can “push review notes and status updates back to the DCC” and that outbound viewer messages include `annotationCreated` in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L3) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L4) and [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L89) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L96).
  - The actual outbound protocol defines `annotationAdded`, not `annotationCreated`, and it has no note message type at all in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L26) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L27) and [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L91) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L117).
  - Production wiring only forwards `paintEngine.strokeAdded` through `sendAnnotationAdded(...)` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L267) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L276), and there is no runtime subscriber to note-manager changes in the DCC path.
- Impact:
  - Users and integrators can expect note-level review roundtrip from the guide, but the shipped bridge only reports paint annotations.
  - That makes the documented DCC review loop sound richer than the real protocol and can mislead pipeline implementers about what feedback types they will receive.

### 446. The DCC guide overstates app-specific Nuke, Maya, and Houdini workflows that the shipped bridge does not model

- Severity: Medium
- Area: Documentation / DCC feature scope
- Evidence:
  - The DCC guide presents concrete app-specific features such as Nuke node-selection sync and flipbook replacement, Maya camera sync and shot-context push, and Houdini flipbook/MPlay integration in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L33) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L61).
  - The actual shipped bridge protocol only exposes four inbound message types (`loadMedia`, `syncFrame`, `syncColor`, `ping`) and a small outbound set (`frameChanged`, `colorChanged`, `annotationAdded`, `pong`, `error`) in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L23) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L27) and [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L112) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L117).
  - App wiring only connects those generic media/frame/color/annotation paths in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L172) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L280), and a production-code search finds no Nuke-, Maya-, or Houdini-specific bridge module or runtime feature layer.
- Impact:
  - Pipeline teams reading the guide can expect first-class DCC-specific workflows that the shipped browser app does not actually expose as protocol or UI features.
  - The real integration surface is a generic WebSocket media/frame/color bridge, not the richer per-application workflow the docs currently imply.

### 447. The network-sync guide promises a manual reconnect option after retry exhaustion, but the shipped UI exposes none

- Severity: Low
- Area: Documentation / collaboration recovery UX
- Evidence:
  - The network-sync guide says that after 10 failed reconnect attempts, "the system stops retrying and presents a manual reconnect option" in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L133) through [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L137).
  - When reconnect attempts are exhausted, `NetworkSyncManager` only emits a toast/error pair with `Failed to reconnect. Please try again.` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L785) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L794).
  - The shipped `NetworkControl` has disconnected, connecting, and connected panels, but no reconnect button or dedicated retry action; the disconnected panel only offers create/join flows in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L350) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L544).
- Impact:
  - Users following the guide can expect an explicit reconnect affordance that never appears after retry exhaustion.
  - In practice, recovery falls back to manually recreating or rejoining the room through the generic disconnected UI rather than a dedicated reconnect path.

### 448. Cursor sharing is active in the collaboration stack, but the shipped sync-settings UI gives users no cursor toggle

- Severity: Medium
- Area: Collaboration UI / settings completeness
- Evidence:
  - The live sync model defines `cursor` as a first-class sync category and enables it by default in [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L30) through [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L48).
  - The runtime has a dedicated `sendCursorPosition(...)` path gated by `syncSettings.cursor` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L521) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L538).
  - The shipped Network Sync panel only renders checkboxes for `playback`, `view`, `color`, and `annotations`; it never exposes `cursor` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L787) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L821).
  - The FAQ still advertises cursor-position sync as part of collaboration in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L73) through [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L79), but the main Network Sync guide's settings table likewise omits any cursor toggle in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L52) through [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L68).
- Impact:
  - Users can have remote cursor sharing turned on by default without any shipped UI to inspect or disable it.
  - The collaboration docs describe cursor sync as part of the product, but the actual settings surface makes it look like only four categories are controllable.

### 449. Remote cursor sync is transported and tracked, but the shipped app never renders or consumes it

- Severity: Medium
- Area: Collaboration runtime wiring
- Evidence:
  - Incoming `sync.cursor` messages are handled, sanitized, stored in `_remoteCursors`, and emitted as `syncCursor` events in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L870) and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1091) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1099).
  - `NetworkSyncManager` also exposes `remoteCursors` as public state in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L226) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L228).
  - A production-code search finds `syncCursor` subscribers only in tests; there is no live subscriber in app wiring, viewer code, or UI components outside [src/network/CollaborationEnhancements.test.ts](/Users/lifeart/Repos/openrv-web/src/network/CollaborationEnhancements.test.ts#L269), [src/network/CollaborationEnhancements.test.ts](/Users/lifeart/Repos/openrv-web/src/network/CollaborationEnhancements.test.ts#L717), and [src/network/CollaborationEnhancements.test.ts](/Users/lifeart/Repos/openrv-web/src/network/CollaborationEnhancements.test.ts#L791).
  - Likewise, a production-code search finds no use of `remoteCursors` outside `NetworkSyncManager` itself.
  - The FAQ still tells users that collaboration syncs cursor position in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L73) through [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L79).
- Impact:
  - Cursor-sharing traffic can flow over the collaboration stack without producing any visible or actionable result in the shipped app.
  - Users and integrators can expect shared remote cursors from the advertised feature set, but production stops at transport/state bookkeeping.

### 452. The FAQ says collaboration data stays peer-to-peer, but production falls back to WebSocket for state and media transfer

- Severity: Medium
- Area: Documentation / collaboration data path
- Evidence:
  - The FAQ says "No media passes through any server -- all data flows directly between peers" in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L79).
  - `sendSessionStateResponse(...)` is explicitly implemented to try WebRTC first and then fall back to realtime transport in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L642) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L668).
  - That realtime path routes through `dispatchRealtimeMessage(...)`, which prefers `wsClient.send(message)` before any serverless peer channel in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1222) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1232).
  - Media transfer requests are also sent through that same realtime/WebSocket path by default in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L670) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L681).
- Impact:
  - The FAQ overstates the privacy and deployment model of collaboration by implying that shared state and media bytes never traverse a server-backed transport.
  - In production, state/media exchange can use the WebSocket path when peer transport is unavailable, so the all-peer-to-peer claim is false.

### 453. The FAQ says locally loaded files never leave the machine, but collaboration media sync can transmit them to other participants

- Severity: Medium
- Area: Documentation / privacy and data movement
- Evidence:
  - The FAQ says files loaded through drag-and-drop or the file picker "never leave the machine" in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L15).
  - The collaboration bridge can request local media from another participant through `requestMediaSync(...)` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L670) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L681).
  - The app wiring responds to those requests by reading local file data and sending chunk payloads back through `sendMediaChunk(...)` / `sendMediaComplete(...)` in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L292) through [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L391) and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L723) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L746).
  - Those media chunks are sent over the same realtime transport helper in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1222) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1232).
- Impact:
  - The FAQ understates how collaboration can move user-selected local media off the originating machine.
  - Users relying on that privacy statement can miss the fact that review peers may receive transferred file contents during sync workflows.

### 454. The self-hosting docs present static hosting as sufficient, but the shipped collaboration flow still expects separate signaling infrastructure

- Severity: Low
- Area: Documentation / deployment requirements
- Evidence:
  - The FAQ says users can self-host by deploying the built `dist/` files "to any web server or static hosting service" in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L21) through [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L23).
  - The installation guide likewise says the production build is "a collection of static files" and that "No server-side runtime is required" in [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L55) through [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L68).
  - The same installation guide exposes `VITE_NETWORK_SIGNALING_SERVERS` as an environment variable for collaborative review sessions in [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L90) through [docs/getting-started/installation.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/installation.md#L96).
  - Production collaboration config ships with a WebSocket signaling URL in [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L445) through [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L453), and normal room create/join still go through `wsClient.connect(...)` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L380) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L426).
- Impact:
  - The deployment docs make the full app sound entirely static-hosted even though the advertised collaboration feature still has external signaling/runtime dependencies in normal operation.
  - Self-hosters can deploy the static app successfully and still be surprised when collaborative review is unavailable or misconfigured.

### 456. The browser-requirements guide says Presentation Mode depends on the Fullscreen API, but the runtime mode is separate

- Severity: Low
- Area: Documentation / browser feature requirements
- Evidence:
  - The browser-requirements guide says "Presentation mode (clean display with cursor auto-hide) also depends on this API" under the Fullscreen API section in [docs/getting-started/browser-requirements.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/browser-requirements.md#L71) through [docs/getting-started/browser-requirements.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/browser-requirements.md#L73).
  - `PresentationMode` is implemented as a DOM/UI-hiding mode with cursor auto-hide in [src/utils/ui/PresentationMode.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/PresentationMode.ts#L1) through [src/utils/ui/PresentationMode.ts#L17), and its state transitions only hide/restore elements and cursor behavior in [src/utils/ui/PresentationMode.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/PresentationMode.ts#L52) through [src/utils/ui/PresentationMode.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/PresentationMode.ts#L89).
  - A production-code search of the PresentationMode implementation finds no Fullscreen API call or dependency.
- Impact:
  - The docs overstate the browser requirement for Presentation Mode and make the feature sound unavailable without Fullscreen support.
  - In production, fullscreen and presentation are separate behaviors, so troubleshooting/browser-support guidance becomes less accurate than it should be.

### 457. The image-sequences guide says the detected pattern is shown in sequence information, but the shipped UI never surfaces `sequenceInfo.pattern`

- Severity: Low
- Area: Documentation / image-sequence UI
- Evidence:
  - The image-sequences guide says "The detected pattern is displayed using hash notation ... in the sequence information" in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L35).
  - Production code does store the pattern in sequence state and serialization, for example in [src/core/session/loaders/SequenceRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/SequenceRepresentationLoader.ts#L59) and [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L411).
  - A production-code search finds no UI consumer of `sequenceInfo.pattern` or `sequencePattern`; outside persistence/internal loaders, those fields are not rendered anywhere in the shipped interface.
- Impact:
  - Users reading the sequence docs can expect a visible sequence-pattern readout that never appears in the actual UI.
  - The runtime keeps the pattern as internal metadata, but the documented “sequence information” surface is not real.

### 458. The image-sequences guide presents `detectMissingFrames()` and `isFrameMissing()` as programmatic affordances, but they are internal utilities, not public API

- Severity: Low
- Area: Documentation / scripting surface
- Evidence:
  - The image-sequences guide says missing frames can be queried programmatically via `detectMissingFrames()` and `isFrameMissing(frame)` in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L43) through [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L44).
  - Those functions exist only as exports from the internal utility module [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L268) and [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L290).
  - The shipped public API surface in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L42) through [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L98) exposes no sequence/missing-frame module or helper methods for those calls.
- Impact:
  - The docs make internal loader helpers sound like supported scripting features even though end users do not get them through `window.openrv`.
  - That can mislead automation/integration users who treat the page as public-app behavior rather than internal source layout.

### 459. The image-sequences guide says sequence FPS can be configured, but its example only calls `getFPS()` and omits the real public setter

- Severity: Low
- Area: Documentation / scripting surface
- Evidence:
  - The image-sequences guide says "The session FPS can be configured" but the code sample only calls `window.openrv.media.getFPS()` in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L56) through [docs/playback/image-sequences.md#L60).
  - The public API does expose `getPlaybackFPS()` and `setPlaybackFPS(...)` for this purpose in [src/api/MediaAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MediaAPI.ts#L86) through [src/api/MediaAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MediaAPI.ts#L119).
  - The same page's scripting section never mentions those methods and instead only documents `getFPS()` in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L84) through [docs/playback/image-sequences.md#L88).
- Impact:
  - Readers get told that sequence FPS is configurable but are not shown the public method that actually does it.
  - That makes the page's scripting guidance incomplete and nudges users toward the wrong API surface.

### 460. The browser-support docs present External Presentation as a working BroadcastChannel feature, but the shipped feature is already broken at runtime

- Severity: Low
- Area: Documentation / browser compatibility
- Evidence:
  - The browser-requirements page says BroadcastChannel "enables the External Presentation feature, which synchronizes frame, playback, and color state" in [docs/getting-started/browser-requirements.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/browser-requirements.md#L65) through [docs/getting-started/browser-requirements.md#L67).
  - The browser-compatibility matrix likewise lists `BroadcastChannel (ext. presentation)` as an available feature by browser in [docs/reference/browser-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/reference/browser-compatibility.md#L34) through [docs/reference/browser-compatibility.md#L38).
  - The runtime problem is already visible in production code: the external presentation window is a blank shell that only updates frame text while ignoring real viewer rendering/playback/color state, as documented in issue `29` with evidence in [src/ui/components/ExternalPresentation.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExternalPresentation.ts#L132) through [src/ui/components/ExternalPresentation.ts#L244) and [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L546) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L566).
- Impact:
  - The compatibility docs make External Presentation sound like a reliable browser-capability question, when the stronger limitation is that the shipped feature itself is not functionally complete.
  - Users can spend time diagnosing browser support for a feature that is already broken independent of API availability.

### 461. The browser-requirements page presents WebRTC as required for network sync, but the normal collaboration path is WebSocket-based

- Severity: Low
- Area: Documentation / browser feature requirements
- Evidence:
  - The browser-requirements page says "WebRTC powers peer-to-peer connections for collaborative review sessions ... Required only for network sync features" in [docs/getting-started/browser-requirements.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/browser-requirements.md#L77) through [docs/getting-started/browser-requirements.md#L79).
  - Normal room create/join flows do not require `RTCPeerConnection`; they go straight through `wsClient.connect(...)` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L377) through [src/network/NetworkSyncManager.ts#L418).
  - `canUseWebRTC()` is only checked for the serverless/WebRTC-specific paths and peer-transfer helpers in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L275), [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L668), and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1542) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1547).
- Impact:
  - The page overstates WebRTC as a baseline requirement for collaboration when the shipped app’s ordinary room/sync path is primarily WebSocket-driven.
  - Browser-support guidance becomes less accurate, especially for deployments that use collaboration without peer-to-peer fallback paths.

### 462. The UI overview says all interactive controls are semantic and properly labeled, but the shipped UI still has mouse-only/non-semantic interactions

- Severity: Low
- Area: Documentation / accessibility claims
- Evidence:
  - The UI overview says "All interactive controls use semantic HTML elements with appropriate ARIA labels and roles" in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L236) through [docs/getting-started/ui-overview.md#L238).
  - The shipped Pixel Probe exposes copyable value rows as mouse-only `div`s rather than real buttons in [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L358) through [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L403), which is already captured as issue `75`.
  - The left/right inspector accordion headers are still mouse-only click targets rather than keyboard-operable disclosure controls in [src/ui/layout/panels/LeftPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/LeftPanelContent.ts#L169) through [src/ui/layout/panels/LeftPanelContent.ts#L206) and [src/ui/layout/panels/RightPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/RightPanelContent.ts#L178) through [src/ui/layout/panels/RightPanelContent.ts#L214), already captured as issue `65`.
- Impact:
  - The overview overstates the current accessibility quality of the shipped UI.
  - Users and auditors can infer a more consistently semantic control surface than the runtime actually provides.

### 463. The UI overview advertises the Info panel as a metadata panel, but production wiring only keeps cursor-color updates alive

- Severity: Low
- Area: Documentation / UI capability description
- Evidence:
  - The UI overview panel table describes `Info panel` as `Filename, resolution, frame, FPS` in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L207) through [docs/getting-started/ui-overview.md#L213).
  - The `InfoPanel` component is implemented to show that richer metadata in [src/ui/components/InfoPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/InfoPanel.ts#L1) through [src/ui/components/InfoPanel.ts#L301).
  - In production wiring, the only live update path is the viewer cursor-color callback in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L569) through [src/services/LayoutOrchestrator.ts#L576), which is already captured as issue `101`.
- Impact:
  - The getting-started docs make the Info panel sound far more useful than it is in the shipped app.
  - Users can open that panel expecting source/frame metadata and instead get a mostly cursor-color readout.

### 464. The UI overview still teaches `H` and `W` as direct Histogram/Waveform shortcuts even though those defaults are hidden by conflicts

- Severity: Low
- Area: Documentation / keyboard shortcuts
- Evidence:
  - The UI overview panel table still lists `Histogram | H` and `Waveform | W` in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L200) through [docs/getting-started/ui-overview.md#L205).
  - In production, those direct defaults are hidden from registration because `H` and `W` are reserved by other actions in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L43) through [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L45).
  - The underlying runtime conflict is already confirmed in issues `1` and `2`.
- Impact:
  - New users can learn broken shortcuts directly from the getting-started overview page.
  - That increases first-use friction for scopes and makes the UI overview less trustworthy as a quick reference.

### 465. The EDL/OTIO guide overstates the main-app import/export paths; those workflows are still mostly confined to the Playlist panel

- Severity: Low
- Area: Documentation / editorial workflow UX
- Evidence:
  - The EDL/OTIO guide says users can export EDL "from the Playlist panel or the Export menu" in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L7) through [docs/export/edl-otio.md#L9).
  - The shipped main `ExportControl` has no EDL or OTIO actions; its menu sections are frame/sequence/video/session/annotations/reports only in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L170) through [src/ui/components/ExportControl.ts#L220).
  - The same guide says OTIO files can be imported by loading them "through the file picker or drag and drop" in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L59) through [docs/export/edl-otio.md#L67).
  - The normal header file picker and viewer drag-drop paths only special-case `.rvedl`, `.rv`, and `.gto` before falling back to ordinary media loading in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1382) through [src/ui/components/layout/HeaderBar.ts#L1455) and [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L709) through [src/ui/components/ViewerInputHandler.ts#L761).
  - OTIO import is actually wired through the Playlist panel’s dedicated import input in [src/ui/components/PlaylistPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts#L795) through [src/ui/components/PlaylistPanel.ts#L830).
- Impact:
  - Editorial users following the guide can look for EDL export in the header Export menu and generic OTIO drag/drop import, then conclude the app ignored them.
  - The real workflow is narrower and more panel-specific than the guide currently suggests.

### 466. The EDL/OTIO guide presents the Conform/Re-link panel as a working local-file relinker, but its browse actions are still production stubs

- Severity: Low
- Area: Documentation / editorial relink workflow
- Evidence:
  - The EDL/OTIO guide says the Conform/Re-link panel allows "Selecting replacement files from the local filesystem" and that once media is relinked the timeline plays correctly in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L67) through [docs/export/edl-otio.md#L74).
  - `ConformPanel` does implement UI affordances for per-clip browse and folder browse, but those buttons only dispatch `conform-browse` and `conform-browse-folder` custom events in [src/ui/components/ConformPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ConformPanel.ts#L363) through [src/ui/components/ConformPanel.ts#L376).
  - A production-code search finds no app-level handler for those custom events, which is already captured as issue `51`.
  - The fuzzy filename suggestion logic is real inside the panel in [src/ui/components/ConformPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ConformPanel.ts#L71) through [src/ui/components/ConformPanel.ts#L186), but the local-file browsing workflow described by the docs is not actually wired through the app.
- Impact:
  - The guide makes the conform workflow sound end-to-end usable when the most important relink entry points still dead-end in production.
  - Editorial users can reach the panel, see browse actions, and assume they missed something when the app simply does not handle them.

### 467. The OTIO import docs claim markers are imported, but the shipped parser does not read OTIO marker data at all

- Severity: Low
- Area: Documentation / OTIO feature coverage
- Evidence:
  - The EDL/OTIO guide's supported-elements table lists `Markers | Imported as timeline markers` in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L49) through [docs/export/edl-otio.md#L56).
  - The shipped OTIO parser only models clips, gaps, transitions, tracks, stacks, timelines, media references, and metadata in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L9) through [src/utils/media/OTIOParser.ts#L155).
  - `parseTrack(...)` only handles `Clip.1`, `Gap.1`, and `Transition.1` children in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L217) through [src/utils/media/OTIOParser.ts#L286), and `PlaylistManager.fromOTIO(...)` only consumes the parser's clips/transitions output in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L674) through [src/core/session/PlaylistManager.ts#L703).
- Impact:
  - Editorial users can expect OTIO note/marker round-trip that the shipped importer simply does not perform.
  - That makes the supported-elements table materially richer than the real OTIO ingest path.

### 468. The OTIO import docs say metadata is preserved for display, but the live playlist import path drops OTIO metadata

- Severity: Low
- Area: Documentation / OTIO feature coverage
- Evidence:
  - The OTIO guide's supported-elements table says `Metadata | Preserved for display` in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L49) through [docs/export/edl-otio.md#L56).
  - `OTIOParser` does capture clip/transition metadata in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L242) and [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L267).
  - But `PlaylistManager.fromOTIO(...)` only imports clip names, source resolution, and frame ranges; it never stores or forwards `clip.metadata` into playlist/UI state in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L674) through [src/core/session/PlaylistManager.ts#L703).
  - A production-code search finds no playlist/timeline UI path that renders OTIO metadata after import.
- Impact:
  - The docs promise richer editorial context than the shipped OTIO workflow actually preserves.
  - Users can expect imported metadata to remain inspectable in the app when it is currently discarded during import.

### 469. The OTIO import docs say gaps and transitions are recognized, but the shipped playlist import path linearizes clips and drops both structures

- Severity: Low
- Area: Documentation / OTIO feature coverage
- Evidence:
  - The OTIO guide says `Gaps` are recognized as empty regions and `Transitions` are recognized during import in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L49) through [docs/export/edl-otio.md#L56).
  - The single-track parser used by live import returns only `clips`, `fps`, and `totalFrames`; it does not expose transitions in the `OTIOParseResult` returned by `parseOTIO(...)` in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L315) through [src/utils/media/OTIOParser.ts#L337).
  - `PlaylistManager.fromOTIO(...)` consumes only `result.clips` and calls `addClip(...)` for each one in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L674) through [src/core/session/PlaylistManager.ts#L703).
  - `addClip(...)` rebuilds a simple sequential playlist with contiguous `globalStartFrame` values in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L133) through [src/core/session/PlaylistManager.ts#L159), so OTIO gap spacing and transition overlap data are not preserved in the imported playlist.
- Impact:
  - The docs make OTIO import sound structurally richer than the runtime actually is.
  - Users can expect editorial gaps and transitions to survive import semantics when the shipped workflow collapses them into a plain cut list.

### 470. OTIO import is lossy: the live playlist import path collapses editorial structure into a plain clip list

- Severity: Medium
- Area: OTIO import / editorial fidelity
- Evidence:
  - The only production OTIO import path is `PlaylistManager.fromOTIO(...)`, which uses the backward-compatible single-track `parseOTIO(...)` helper in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L674) through [src/core/session/PlaylistManager.ts#L703) and [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L315) through [src/utils/media/OTIOParser.ts#L337).
  - That single-track parse result returns only clips plus timing, not transition objects, even though the richer `parseOTIOMultiTrack(...)` path exists separately in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L347) through [src/utils/media/OTIOParser.ts#L382).
  - `fromOTIO(...)` then imports each resolved clip via `addClip(...)`, which rebuilds a contiguous cut-only playlist with fresh sequential `globalStartFrame` values in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L133) through [src/core/session/PlaylistManager.ts#L159).
  - OTIO parser metadata is captured transiently, but `fromOTIO(...)` drops it; OTIO markers are not parsed at all.
- Impact:
  - Importing OTIO into the shipped app silently degrades the editorial timeline into a much simpler playlist model.
  - Gaps, transitions, markers, and metadata context can disappear without any explicit warning that the import was lossy.

### 472. The advanced-compare docs present Quad View as a shipped feature, but the live UI itself marks it as preview-only and unwired

- Severity: Low
- Area: Documentation / compare workflow
- Evidence:
  - The advanced-compare page describes Quad View as a working mode where four quadrants each display a different source and stay in sync during playback in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L7) through [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L11).
  - The shipped Compare dropdown now labels Quad View with a `preview` badge and an explicit tooltip saying it is “not yet connected to the viewer rendering pipeline” in [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L585) through [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L593).
  - Production view wiring still only subscribes to wipe, A/B, difference matte, and blend-mode events; quad-view changes only produce a warning in [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L87) through [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L143).
- Impact:
  - The docs teach Quad View as ready for real multi-version review even though the shipped UI itself warns that it is only a preview surface.
  - That makes the comparison docs more optimistic than the app and sets users up to trust a mode that is still non-functional in production.

### 473. The advanced-compare docs teach a full Reference Image Manager workflow, but the shipped UI only exposes capture plus a binary toggle

- Severity: Low
- Area: Documentation / compare workflow
- Evidence:
  - The advanced-compare page presents five reference comparison modes and describes overlay opacity as part of the user-facing workflow in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L13) through [docs/compare/advanced-compare.md#L31).
  - The shipped View tab only mounts two reference actions: `Capture reference frame` and `Toggle reference comparison` in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L85) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L117).
  - `ReferenceManager` still carries `viewMode`, `opacity`, and `wipePosition` as real state in [src/ui/components/ReferenceManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ReferenceManager.ts#L25) through [src/ui/components/ReferenceManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ReferenceManager.ts#L30), but there is no shipped UI for changing those fields.
- Impact:
  - The docs make reference comparison look like a configurable end-user tool when the shipped interface only exposes the narrowest on/off subset.
  - Users following the page will look for mode and opacity controls that do not exist in the real app.

### 474. The advanced-compare docs present Matte Overlay as part of the review toolkit even though the shipped compare/view UI never exposes it

- Severity: Low
- Area: Documentation / compare workflow
- Evidence:
  - The advanced-compare page lists Matte Overlay as one of the core advanced comparison capabilities and describes aspect, opacity, and center-point configuration in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L33) through [docs/compare/advanced-compare.md#L47).
  - The viewer does implement a matte overlay and exposes it through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3792) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3795), with overlay creation in [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L111) through [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L113).
  - The shipped View tab control surface contains compare, layout, stereo, ghost, reference, stack, PAR, background-pattern, and other display buttons, but no matte-overlay entry in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L31) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L439).
- Impact:
  - The compare docs make Matte Overlay sound like part of the normal review toolbox when the shipped UI still provides no way to enable or configure it.
  - That sends users to the comparison docs for a feature they cannot actually reach from the app.

### 475. The advanced-compare docs say comparison annotations follow the underlying source, but production still keys them to the active `A/B` slot

- Severity: Low
- Area: Documentation / compare annotations
- Evidence:
  - The advanced-compare page says “Annotations are tied to the source they were drawn on” and that switching between A and B preserves each source’s annotation layer independently in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L61) through [docs/compare/advanced-compare.md#L63).
  - Production paint wiring still forwards `session.currentAB` into the annotation version selector in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L645).
  - The underlying compare state that drives that routing is only `A` or `B`, not a stable source identity, in [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L26) through [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L43).
- Impact:
  - The docs imply source-stable comparison annotations, but the shipped behavior can drift when A/B assignments change.
  - Reviewers can trust the docs and assume an annotation belongs to a media source when production is still anchoring it to the compare slot instead.

### 476. The overlays guide says embedded source timecode is shown alongside session timecode, but the shipped overlay only renders one timecode plus a frame counter

- Severity: Low
- Area: Documentation / timecode overlay
- Evidence:
  - The overlays guide says that for sources with embedded timecode metadata, “the source timecode is displayed alongside the session timecode” in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L18).
  - The shipped `TimecodeOverlay` only renders two text rows: a single formatted timecode string and an optional `Frame N / total` counter in [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L73) through [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L97) and [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L119) through [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L129).
  - The overlay state only supports position, font size, frame-counter visibility, and background opacity in [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L18) through [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L33); there is no second source-timecode field or metadata binding in the component.
- Impact:
  - The docs promise a richer review overlay than the shipped implementation actually provides.
  - Users expecting both session and embedded source timecode on screen will only get a single timecode readout.

### 477. The overlays guide documents adjustable clipping thresholds, but the shipped clipping overlay hardcodes its trigger values

- Severity: Low
- Area: Documentation / clipping overlay
- Evidence:
  - The overlays guide says clipping thresholds can be adjusted away from the default `0.0/1.0` positions and gives `0.95` as a practical example in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L56) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L58).
  - The shipped `ClippingOverlayState` has no threshold fields; it only carries enable/show-highlights/show-shadows/color/opacity in [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L12) through [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L29).
  - The actual clip checks are hardcoded to `r/g/b <= 1` for shadows and `r/g/b >= 254` or `luma >= 254` for highlights in [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L63) through [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L72).
- Impact:
  - The docs present an early-warning threshold workflow that the shipped overlay simply cannot perform.
  - Users looking for configurable near-clipping detection will find only a fixed binary implementation.

### 478. The overlays guide describes a single “missing frame indicator” behavior, but production ships multiple modes and the default does not replace the viewer content

- Severity: Low
- Area: Documentation / missing-frame behavior
- Evidence:
  - The overlays guide says the missing-frame indicator “replaces the viewer content” with a red-X warning state and highlights the missing frame on the timeline in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L62) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L70).
  - The shipped View tab exposes four distinct missing-frame modes, `Off`, `Frame`, `Hold`, and `Black`, in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L191) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L199).
  - In the renderer, only `black` truly replaces the viewed image; `hold` reuses a nearby frame and the default `show-frame` path continues drawing the current source image while separately showing the overlay in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1521) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1558).
  - The shipped `MissingFrameOverlay` itself is a centered warning icon plus frame number, not a red-X fill pattern, in [src/ui/components/MissingFrameOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MissingFrameOverlay.ts#L31) through [src/ui/components/MissingFrameOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MissingFrameOverlay.ts#L69).
- Impact:
  - The docs describe one fixed missing-frame experience, but the real app exposes multiple viewer behaviors and defaults to a much less destructive overlay mode.
  - That can mislead users about what will happen during sequence review and what the current missing-frame setting actually controls.

### 479. The overlays guide advertises timecode “format” modes, but the shipped overlay cannot switch to frame-only display

- Severity: Low
- Area: Documentation / timecode overlay
- Evidence:
  - The overlays guide says the timecode overlay supports “SMPTE timecode, frame number, or both” in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L12) through [docs/advanced/overlays.md#L16).
  - The shipped `TimecodeOverlayState` has no format enum; it only exposes `showFrameCounter` alongside the always-rendered timecode row in [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L18) through [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L33).
  - `update()` always writes a formatted timecode string and only conditionally shows the extra frame-counter row in [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L119) through [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L129).
- Impact:
  - The docs promise a frame-only display mode that the shipped overlay does not actually support.
  - Users can hide the frame counter, but they cannot replace timecode with frame numbers the way the page describes.

### 480. The overlays guide says safe areas respect crop, but the shipped safe-areas overlay is still driven by uncropped display dimensions

- Severity: Low
- Area: Documentation / safe-areas behavior
- Evidence:
  - The overlays guide says that when crop is active, safe areas “are calculated relative to the cropped region rather than the full image” in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L40) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L42).
  - `SafeAreasOverlay` itself only draws against `offsetX`, `offsetY`, `displayWidth`, and `displayHeight`; it has no crop-state input or crop-rectangle logic in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L137) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L239).
  - `OverlayManager.updateDimensions(...)` always feeds the safe-areas overlay raw viewer width/height with zero offsets, not a cropped sub-rectangle, in [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L127) through [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L137).
  - By contrast, crop is applied later in the viewer image pipeline via `cropManager.clearOutsideCropRegion(...)` in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2012) and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2213), not through overlay-dimension remapping.
- Impact:
  - The docs describe crop-aware framing guides, but the shipped safe-areas overlay is still positioned against the full display box.
  - Reviewers relying on safe areas after cropping can trust the guides more than the runtime wiring actually justifies.

### 481. The overlays guide says the timeline highlights missing-frame positions, but the shipped timeline has no missing-frame rendering path

- Severity: Low
- Area: Documentation / sequence review UX
- Evidence:
  - The overlays guide says the missing-frame indicator includes a timeline highlight for the missing-frame position in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L64) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L70).
  - A production-code search finds missing-frame handling in the viewer and overlay components, but no missing-frame rendering or highlight logic in `Timeline.ts`; the relevant matches are limited to [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1521) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1558) and [src/ui/components/MissingFrameOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MissingFrameOverlay.ts#L1) through [src/ui/components/MissingFrameOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MissingFrameOverlay.ts#L108).
  - The timeline-related repo hits for “missing frame” are tests and the View-tab mode selector, not a shipped timeline highlight implementation, as shown by [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L185) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L357).
- Impact:
  - The docs promise a second visual cue in the timeline that the shipped app does not provide.
  - Sequence reviewers can search for a timeline indicator that simply is not implemented in production.

### 482. The overlays guide publishes industry-safe percentages that do not match the shipped safe-areas overlay

- Severity: Low
- Area: Documentation / safe-areas behavior
- Evidence:
  - The overlays guide says Action Safe is `93%` and Title Safe is `90%` in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L30) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L33).
  - The shipped overlay implementation documents and draws Action Safe at `90%` and Title Safe at `80%` in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L3) through [src/ui/components/SafeAreasOverlay.ts#L9) and [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L154) through [src/ui/components/SafeAreasOverlay.ts#L160).
  - The shipped control labels also say `Action Safe (90%)` and `Title Safe (80%)` in [src/ui/components/SafeAreasControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts#L129) through [src/ui/components/SafeAreasControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts#L133).
- Impact:
  - The docs teach a different framing geometry than the actual overlay draws.
  - Reviewers can rely on the written percentages and assume the on-screen guides follow them when production uses materially smaller safe boxes instead.

### 483. The overlays guide describes custom per-zone safe areas and distinct colors, but the shipped safe-areas overlay only has fixed title/action boxes with one shared color

- Severity: Low
- Area: Documentation / safe-areas feature coverage
- Evidence:
  - The overlays guide says there is a `Custom` safe area where users can “specify any percentage” and that multiple safe zones each use “a distinct color for clarity” in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L30) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L39).
  - The shipped `SafeAreasState` has only two safe-zone toggles, `titleSafe` and `actionSafe`; there is no custom-percentage field in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L16) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L24).
  - The overlay also has a single `guideColor` applied to all guides in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L22) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L24) and [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L148) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L160).
  - The shipped control surface only exposes binary toggles for the fixed safe boxes plus composition guides in [src/ui/components/SafeAreasControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts#L127) through [src/ui/components/SafeAreasControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts#L151).
- Impact:
  - The docs promise a more flexible broadcast-safe workflow than the runtime actually supports.
  - Users can look for user-defined percentages or color-coded zones that simply are not part of the shipped overlay model.

### 484. The overlays guide says “both clipping” gets its own distinct highlight, but the shipped clipping overlay only chooses highlight-or-shadow coloring

- Severity: Low
- Area: Documentation / clipping overlay
- Evidence:
  - The overlays guide says pixels that clip in all channels simultaneously receive “a distinct highlight” in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L48) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L52).
  - The shipped `ClippingOverlay` only checks two branches: highlight-clipped pixels are blended with `highlightColor`, otherwise shadow-clipped pixels are blended with `shadowColor`, in [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L63) through [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L79).
  - There is no third “both clipped” state or separate color in `ClippingOverlayState`, which only carries highlight and shadow colors in [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L12) through [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L29).
- Impact:
  - The docs describe a richer clipping diagnostic than the shipped overlay can render.
  - Users can expect a special simultaneous-clipping signal, but production collapses that case into the ordinary highlight path.

### 485. The overlays guide says overlay states are preserved in session files and snapshots, but the `.orvproject` serializer only persists watermark among the viewer overlays

- Severity: Low
- Area: Documentation / overlay persistence
- Evidence:
  - The overlays guide says “All overlay settings are saved with the session state” and that overlay states are preserved in `.orvproject` files and snapshots in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L3) and [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L215).
  - The serialized session schema only contains an explicit overlay field for `watermark` in [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L131) through [src/core/session/SessionState.ts#L132).
  - `SessionSerializer.toJSON()` saves `watermark`, but does not read `getTimecodeOverlay()`, `getSafeAreasOverlay()`, `getClippingOverlay()`, `getInfoStripOverlay()`, `getFPSIndicator()`, `getEXRWindowOverlay()`, `getSpotlightOverlay()`, or `getBugOverlay()` anywhere in the serialization path in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L338) through [src/core/session/SessionSerializer.ts#L368).
  - Snapshots and auto-saves reuse the same lossy serializer through `AppPersistenceManager`, so this persistence gap is not limited to `.orvproject` files, as already established by issues `138` and `139`.
- Impact:
  - The overlays guide makes the session system sound much more complete for viewer overlays than the shipped persistence model actually is.
  - Users can save a review session expecting overlay state to round-trip when most overlay toggles and settings are still omitted from the serialized payload.

### 486. The overlays guide says bug overlays are burned into video export, but the shipped export flow never consults bug-overlay state

- Severity: Low
- Area: Documentation / export workflow
- Evidence:
  - The overlays guide says “The bug overlay is also used during video export to burn the logo into the output file” in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L126).
  - The only production bug-overlay wiring is viewer-side through `OverlayManager.getBugOverlay()` and `Viewer.getBugOverlay()` in [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L246) through [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L252) and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3858) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3859).
  - A production-code search finds no video-export path that reads bug-overlay state; the export-side logo handling that does exist belongs to slate rendering in [src/export/SlateRenderer.ts](/Users/lifeart/Repos/openrv-web/src/export/SlateRenderer.ts#L45) through [src/export/SlateRenderer.ts](/Users/lifeart/Repos/openrv-web/src/export/SlateRenderer.ts#L50) and [src/export/SlateRenderer.ts](/Users/lifeart/Repos/openrv-web/src/export/SlateRenderer.ts#L304) through [src/export/SlateRenderer.ts](/Users/lifeart/Repos/openrv-web/src/export/SlateRenderer.ts#L316).
- Impact:
  - The docs promise a broadcast-logo export workflow that is not connected to the shipped bug-overlay feature.
  - Users can set up a viewer bug/logo expecting it to burn into exports, then discover that the export pipeline ignores it entirely.

### 487. The false-color docs advertise custom presets, but the shipped false-color system exposes no way to define them

- Severity: Low
- Area: Documentation / false-color workflow
- Evidence:
  - The false-color guide says “Custom false color presets allow defining specific color-to-exposure mappings” in [docs/scopes/false-color-zebra.md](/Users/lifeart/Repos/openrv-web/docs/scopes/false-color-zebra.md#L38) through [docs/scopes/false-color-zebra.md#L39).
  - The runtime type does include a `custom` preset key in [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L23), but it is just aliased to `STANDARD_PALETTE` in [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L134) through [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L138).
  - The shipped preset UI only exposes `Standard`, `ARRI`, and `RED` in [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L262) through [src/ui/components/FalseColor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts#L268), and `FalseColorControl` simply renders that list in [src/ui/components/FalseColorControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColorControl.ts#L184) through [src/ui/components/FalseColorControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColorControl.ts#L212).
- Impact:
  - The docs promise a studio-customizable false-color workflow that the shipped app does not implement.
  - Users can look for custom mapping controls or APIs that simply are not present in production.

### 490. The histogram docs still say pixel analysis runs on the GPU, but the shipped histogram always computes bins on the CPU

- Severity: Low
- Area: Documentation / histogram implementation
- Evidence:
  - The histogram guide says “Pixel analysis runs on the GPU” in [docs/scopes/histogram.md](/Users/lifeart/Repos/openrv-web/docs/scopes/histogram.md#L68).
  - The shipped `Histogram.update()` path explicitly says histogram data is “always” calculated on the CPU, then only uses GPU acceleration for bar rendering in [src/ui/components/Histogram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.ts#L291) through [src/ui/components/Histogram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.ts#L306).
  - The core histogram calculation itself is the CPU `calculateHistogram(imageData)` call in [src/ui/components/Histogram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.ts#L281) through [src/ui/components/Histogram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.ts#L284).
- Impact:
  - The docs overstate the shipped histogram pipeline and performance model.
  - Users reading the guide can expect GPU-side analysis behavior that production does not implement.

### 491. The waveform docs describe WebGL computation as the runtime model, but the shipped scope still has full CPU fallback paths

- Severity: Low
- Area: Documentation / waveform implementation
- Evidence:
  - The waveform guide says “The waveform is computed using WebGL” in [docs/scopes/waveform.md](/Users/lifeart/Repos/openrv-web/docs/scopes/waveform.md#L59).
  - The shipped `Waveform.update()` only tries the GPU processor first, then falls back to CPU rendering with `this.draw(imageData)` when WebGL scopes are unavailable in [src/ui/components/Waveform.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Waveform.ts#L247) through [src/ui/components/Waveform.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Waveform.ts#L266).
  - The HDR float path also has an explicit CPU fallback that converts float data back to `ImageData` and draws it on the CPU in [src/ui/components/Waveform.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Waveform.ts#L288) through [src/ui/components/Waveform.ts#L293).
- Impact:
  - The docs present the scope as WebGL-computed when the shipped implementation still depends on non-WebGL fallback behavior.
  - That is misleading for users trying to understand degraded behavior on browsers or devices where GPU scopes are unavailable.

### 492. The pixel-probe docs say probe state is exposed through the public view API, but the shipped API has no pixel-probe methods at all

- Severity: Low
- Area: Documentation / public scripting API
- Evidence:
  - The pixel-probe guide says “Pixel probe state is accessible through the view API” in [docs/scopes/pixel-probe.md](/Users/lifeart/Repos/openrv-web/docs/scopes/pixel-probe.md#L82).
  - The same section contains only an empty placeholder snippet instead of an actual method example in [docs/scopes/pixel-probe.md](/Users/lifeart/Repos/openrv-web/docs/scopes/pixel-probe.md#L84) through [docs/scopes/pixel-probe.md](/Users/lifeart/Repos/openrv-web/docs/scopes/pixel-probe.md#L87).
  - The shipped `ViewAPI` exposes zoom, fit, pan, channel, texture filtering, background pattern, and viewport-size methods, but nothing for pixel-probe enable/state/lock/readback in [src/api/ViewAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/ViewAPI.ts#L33) through [src/api/ViewAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/ViewAPI.ts#L284).
  - The broader public scripting guide likewise documents `window.openrv.view` without any probe methods in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L17) through [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L180).
- Impact:
  - The docs promise probe automation that plugin authors and pipeline users cannot actually call.
  - Readers can spend time looking for a public probe API surface that is not shipped.

### 493. The vectorscope docs describe WebGL rendering as the runtime model, but the shipped vectorscope still has a complete CPU fallback path

- Severity: Low
- Area: Documentation / vectorscope implementation
- Evidence:
  - The vectorscope guide says “The vectorscope is rendered using WebGL for real-time performance” in [docs/scopes/vectorscope.md](/Users/lifeart/Repos/openrv-web/docs/scopes/vectorscope.md#L39) through [docs/scopes/vectorscope.md](/Users/lifeart/Repos/openrv-web/docs/scopes/vectorscope.md#L41).
  - The shipped `Vectorscope.update()` tries the shared GPU scopes processor first, but falls back to `drawCPU(imageData)` when GPU scopes are unavailable in [src/ui/components/Vectorscope.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Vectorscope.ts#L246) through [src/ui/components/Vectorscope.ts#L272).
  - The HDR float path follows the same pattern and also converts float data back to `ImageData` for CPU rendering when the GPU scopes processor is unavailable in [src/ui/components/Vectorscope.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Vectorscope.ts#L278) through [src/ui/components/Vectorscope.ts#L314).
- Impact:
  - The docs overstate the runtime architecture of the shipped vectorscope.
  - Users investigating performance or degraded behavior on non-WebGL scope paths are told the wrong implementation story.

### 494. The gamut-diagram docs describe a target-gamut compliance tool, but the shipped diagram only overlays scatter against fixed input/working/display triangles

- Severity: Low
- Area: Documentation / gamut diagram behavior
- Evidence:
  - The gamut-diagram guide says pixels are shown relative to “a target color gamut,” and frames the scope around whether colors fall “within or outside a target color gamut” in [docs/scopes/gamut-diagram.md](/Users/lifeart/Repos/openrv-web/docs/scopes/gamut-diagram.md#L3) through [docs/scopes/gamut-diagram.md](/Users/lifeart/Repos/openrv-web/docs/scopes/gamut-diagram.md#L29).
  - The shipped `GamutDiagram` has no target-gamut selection or compliance state. Its only gamut state is the trio `inputColorSpace`, `workingColorSpace`, and `displayColorSpace` in [src/ui/components/GamutDiagram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/GamutDiagram.ts#L48) through [src/ui/components/GamutDiagram.ts#L50).
  - The rendered overlay simply draws up to three gamut triangles and a neutral white scatter plot in [src/ui/components/GamutDiagram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/GamutDiagram.ts#L307) through [src/ui/components/GamutDiagram.ts#L347) and [src/ui/components/GamutDiagram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/GamutDiagram.ts#L349) through [src/ui/components/GamutDiagram.ts#L474).
  - There is no production path that classifies samples as “inside/outside target gamut,” colors out-of-gamut points differently, or exposes the clip-vs-compress compliance workflow the docs describe.
- Impact:
  - The guide makes the gamut diagram sound like an explicit compliance checker when the shipped visualization is just an unclassified chromaticity scatter over multiple triangles.
  - Users can expect target-gamut diagnostics and out-of-gamut identification that the runtime does not provide.

### 497. The browser-compatibility guide overstates mobile support as “touch-optimized” even though parts of the shipped UI still depend on hover-only or non-touch interaction models

- Severity: Low
- Area: Documentation / mobile support
- Evidence:
  - The browser-compatibility matrix marks iOS Safari and Android Chrome as `Functional (touch-optimized)` in [docs/reference/browser-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/reference/browser-compatibility.md#L66) through [docs/reference/browser-compatibility.md#L71).
  - The same guide immediately admits the interface is still desktop-optimized in [docs/reference/browser-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/reference/browser-compatibility.md#L72).
  - The shipped volume control is explicitly hover-based and only exposes its slider on `pointerenter` / `pointerleave` in [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L88) and [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L154) through [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L174), with the non-hover workaround already captured as issue `116`.
  - The generic virtual-slider interaction helper also bails out for `pointerType === 'touch'` in [src/ui/components/VirtualSliderController.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VirtualSliderController.ts#L245) through [src/ui/components/VirtualSliderController.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VirtualSliderController.ts#L266), which means at least some slider-style interactions are intentionally not touch-driven.
- Impact:
  - The docs make the mobile experience sound more intentionally touch-adapted than the shipped UI actually is.
  - Users evaluating tablet/mobile review workflows can expect a more polished touch-first control model than production currently provides.

### 498. The file-format guide promises magic-number-first file detection, but the shipped file-loading path still rejects misnamed or extensionless files before any decoder sniffing runs

- Severity: Low
- Area: Documentation / file loading
- Evidence:
  - The file-format guide says format detection uses a “magic-number-first” strategy and “handles misnamed or extensionless files correctly” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L11).
  - The real session file-loading entrypoint first calls `detectMediaTypeFromFile(file)` and immediately rejects `unknown` files before any decoder-registry inspection in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L382) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L393).
  - `detectMediaTypeFromFile(...)` is MIME/extension-based only: it checks `video/*`, `image/*`, and known extension sets, then returns `unknown` with no binary sniffing path in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L76) through [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L98).
  - The same guide later admits browser-native formats bypass `DecoderRegistry` entirely and are handled at `Session.loadImage()` level in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L199).
- Impact:
  - The docs describe a more robust file-identification path than the shipped open-file flow actually provides.
  - Misnamed or extensionless local media can still be rejected up front even if the decoder layer would have recognized the bytes.

### 499. The format docs overstate GIF and animated WebP support as if the app treated them like real animated media, but the shipped loader still models them as single-frame image sources

- Severity: Low
- Area: Documentation / animated browser-native image formats
- Evidence:
  - The top-level format reference explicitly advertises `GIF` with “Animated GIF support” in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L12).
  - The deeper file-format guide also describes browser-native `WebP` and `GIF` as supporting “animation” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L190) through [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L193).
  - The shipped media-type layer still classifies both `.gif` and `.webp` as plain image formats, not video/timeline media, in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L8) through [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L31).
  - Both `loadImage(...)` and `loadImageFile(...)` create `MediaSource` entries with `type: 'image'` and hardcoded `duration: 1` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L409) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L417) and [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L449) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L456).
- Impact:
  - The docs make animated GIF/WebP sound like proper reviewable moving-image formats, but the shipped session/timeline model still treats them as single-frame stills.
  - Users can expect timeline duration, frame stepping, and normal playback semantics that production does not actually wire for those formats.

### 500. The file-format guide says browser-native images are handled at `Session.loadImage()` level, but real local-file opens route through `FileSourceNode` first

- Severity: Low
- Area: Documentation / image-loading architecture
- Evidence:
  - The file-format guide says browser-native formats are “handled at the `Session.loadImage()` level using the browser’s `<img>` element, bypassing the `DecoderRegistry` entirely” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L199).
  - The real local-file path in `SessionMedia.loadImageFile(...)` first creates a `FileSourceNode` and calls `fileSourceNode.loadFile(file)` for ordinary image files in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L441) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L456).
  - `FileSourceNode.loadFile(...)` then does its own format branching for EXR/DPX/TIFF/JPEG/AVIF/JXL/HEIC/JP2/RAW before falling back to standard image loading in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1858) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L2045).
  - `Session.loadImage(...)` is instead the URL/image-element path, not the main local-file entrypoint, in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L399) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L431).
- Impact:
  - The guide explains the shipped architecture incorrectly for ordinary local image loads.
  - That makes the format docs misleading for anyone debugging load behavior, decoder fallbacks, or source-node state in production.

### 501. The file-format guide advertises `.ico` support, but the shipped supported-format lists and picker accept string do not include it

- Severity: Low
- Area: Documentation / browser-native image format support
- Evidence:
  - The browser-native formats table lists `ICO | .ico | Icon format` in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L197).
  - The shipped supported image-extension list includes `svg` but does not include `ico` in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L9) through [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L33).
  - The extension-based classifier therefore has no `.ico` fallback in `detectMediaTypeFromFile(...)` in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L76) through [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L98).
  - The hidden `Open media file` input uses `SUPPORTED_MEDIA_ACCEPT`, which is built from that same extension list and therefore does not include `.ico`, in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L100) through [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L121) and [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L217) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L221).
- Impact:
  - The docs present `.ico` as a supported browser-native format, but the shipped open-media flow does not consistently treat it as one.
  - Users can expect `.ico` files to appear and classify like other listed image formats when the real picker/runtime support is narrower.

### 502. The JPEG gainmap guide documents the wrong HDR reconstruction formula for the shipped decoder

- Severity: Low
- Area: Documentation / JPEG gainmap HDR behavior
- Evidence:
  - The file-format guide says JPEG gainmap reconstruction uses `hdr = sdr_linear * (1 + gainMap * headroom)` in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L123).
  - The shipped JPEG gainmap decoder documents and implements the simplified ISO 21496-1-style exponential model `HDR_linear = sRGB_to_linear(base) * exp2(gainmap * headroom)` in [src/formats/JPEGGainmapDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JPEGGainmapDecoder.ts#L15) through [src/formats/JPEGGainmapDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JPEGGainmapDecoder.ts#L17).
  - The shared gain-map reconstruction path also precomputes gain factors with `Math.exp((i / 255.0) * headroom * Math.LN2)`, which is the same exponential formulation, in [src/formats/GainMapMetadata.ts](/Users/lifeart/Repos/openrv-web/src/formats/GainMapMetadata.ts#L284) through [src/formats/GainMapMetadata.ts](/Users/lifeart/Repos/openrv-web/src/formats/GainMapMetadata.ts#L288).
- Impact:
  - The docs explain the shipped HDR reconstruction math incorrectly.
  - Anyone using the guide to reason about highlight scaling, parity checks, or external reimplementation of the decoder will get the wrong model.

### 503. The file-format guide says all image decoding yields `Float32Array` RGBA data, but standard browser-native image loads still stay as `HTMLImageElement` sources

- Severity: Low
- Area: Documentation / image decode architecture
- Evidence:
  - The guide claims “All image decoding produces **Float32Array** pixel data in RGBA layout” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L9).
  - The normal `FileSourceNode.load(...)` path for standard JPEG/AVIF and other browser-native images stores the decoded result as `this.image = img` and explicitly leaves `this.cachedIPImage = null` in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L655) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L679) and [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L725) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L749).
  - The URL/image-element path likewise resolves ordinary images into `HTMLImageElement`-backed `MediaSource` objects in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L399) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L431).
  - By contrast, the real `Float32Array` / `IPImage` path is only used for specific HDR/decoder-backed formats such as EXR, gainmap HDR, JXL/HEIC SDR fallback, and other explicit buffer decodes in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L989) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1049) and [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1764) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1782).
- Impact:
  - The docs overstate how uniform the shipped decode pipeline really is.
  - Anyone reading the guide to understand memory behavior, plugin integration, or browser-native image handling will expect a Float32 decode stage that standard images do not actually use.

### 504. The plain-AVIF docs promise a WASM fallback, but the shipped AVIF path is browser-native only

- Severity: Low
- Area: Documentation / AVIF support
- Evidence:
  - The file-format guide says plain AVIF uses “Browser-native decode via `createImageBitmap()` with WASM fallback (`avif.ts`)" in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L156).
  - The actual `avif.ts` module only implements browser-native decode through `createImageBitmap(blob)` and contains no alternate WASM decoder path in [src/formats/avif.ts](/Users/lifeart/Repos/openrv-web/src/formats/avif.ts#L4) through [src/formats/avif.ts](/Users/lifeart/Repos/openrv-web/src/formats/avif.ts#L65).
  - The live `FileSourceNode` path for non-HDR AVIF likewise checks gainmap/HDR markers and then falls back to a blob-backed `Image` load, not a WASM AVIF decoder, in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L696) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L760).
- Impact:
  - The docs imply broader plain-AVIF compatibility than the shipped runtime actually provides on browsers without native AVIF support.
  - Readers can expect a decode fallback path that production does not implement.

### 505. The JPEG XL guide promises original color-space metadata, but the shipped SDR JXL decoder always reports `srgb` and only returns format/container metadata

- Severity: Low
- Area: Documentation / JPEG XL metadata
- Evidence:
  - The JPEG XL guide says JXL color space “Varies (sRGB, linear, Display P3, Rec.2020, etc.). Decoded to Float32 with metadata indicating the original color space” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L113).
  - The shipped SDR JXL decoder hardcodes `colorSpace: 'srgb'` in its return value in [src/formats/JXLDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JXLDecoder.ts#L103) through [src/formats/JXLDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JXLDecoder.ts#L109).
  - The same decoder’s metadata payload only includes `format` and `container`, with no original color-space field, in [src/formats/JXLDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JXLDecoder.ts#L105) through [src/formats/JXLDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JXLDecoder.ts#L109).
  - The runtime only parses JXL container color info for the separate HDR path in `FileSourceNode`, not for the normal SDR WASM decode in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L765) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L788).
- Impact:
  - The docs overstate how much original JXL color-space metadata the shipped SDR decode path preserves.
  - Users or integrators can expect richer color metadata from JXL loads than production currently exposes.

### 506. The top-level file-format reference presents HEIC/HEIF as a pure WASM decode path, but the shipped runtime uses native Safari decode first and WASM only as fallback elsewhere

- Severity: Low
- Area: Documentation / HEIC support
- Evidence:
  - The top-level format table says `HEIC/HEIF | .heic, .heif | libheif WASM` in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L15).
  - The deeper file-format guide says browser-native HEIC is used on Safari and WASM is the non-Safari fallback in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L195).
  - The live `FileSourceNode` path matches the deeper guide: it first tries `tryLoadHEICNative(...)` and only then falls back to `loadHEICSDRWasm(...)` in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1993) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L2002).
  - The HEIC WASM decoder itself is documented as a cross-browser fallback for Chrome/Firefox/Edge because Safari already has native HEIC support in [src/formats/HEICWasmDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/HEICWasmDecoder.ts#L2) through [src/formats/HEICWasmDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/HEICWasmDecoder.ts#L5).
- Impact:
  - The top-level reference misstates how HEIC actually loads in production.
  - Readers can come away with the wrong performance and compatibility expectations for Safari versus other browsers.

### 507. The file-format and image-sequence guides describe missing-frame playback as always “hold last frame,” but the shipped viewer exposes four modes and defaults to `show-frame`

- Severity: Low
- Area: Documentation / image-sequence playback behavior
- Evidence:
  - The file-format guide says that when a sequence has gaps, the viewer “Holds the last available frame during playback when a gap is encountered” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L324) through [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L326).
  - The image-sequences guide makes the same fixed-behavior claim in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L46).
  - The shipped View tab exposes four selectable missing-frame modes, `Off`, `Frame`, `Hold`, and `Black`, in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L198) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L208).
  - The viewer’s live default is `show-frame`, not `hold`, in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L311).
  - The missing-frame render path branches by mode: `black` forces a black frame, `hold` reuses the previous frame, and the remaining modes use the current-frame path in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1522) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1553).
- Impact:
  - The sequence docs present one fixed playback response to gaps, but the shipped app treats missing frames as a user-selectable viewer policy.
  - Users reading those guides can expect hold-last-frame playback even when the default runtime behavior is different.

### 508. The file-format guide still says RV/GTO import reconstructs the complete node graph, but the live importer remains lossy

- Severity: Medium
- Area: Documentation / RV-GTO compatibility
- Evidence:
  - The file-format guide says OpenRV Web can “load and reconstruct the complete node graph” from RV/GTO files in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L342).
  - The same section presents “Graph reconstruction” as a supported capability in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L344).
  - The live importer still records skipped nodes and degraded modes during RV/GTO load in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L396) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L412).
  - `GTOGraphLoader` only maps a limited subset of node protocols, and unsupported-but-recognized nodes are explicitly skipped in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L474) through [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L606).
  - The current issue inventory already has concrete runtime losses from that path, including skipped mapped nodes in [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L227), downgraded stack modes in [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L279), and unsurfaced import diagnostics in [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L3425).
- Impact:
  - The guide overstates RV/GTO interchange fidelity and makes the import path sound lossless.
  - Users can trust imported sessions more than the runtime actually warrants, especially when complex RV graphs are involved.

### 509. The file-format guide still describes `.orvproject` as complete viewer state with node-graph topology, but the serializer tracks known gaps and leaves `graph` unwired

- Severity: Medium
- Area: Documentation / native session format
- Evidence:
  - The file-format guide says `.orvproject` is “a JSON-based file containing the complete viewer state” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L367).
  - The same section lists `node graph topology` in the serialized content in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L371).
  - `SessionSerializer` explicitly tracks multiple viewer-state serialization gaps, including OCIO, display profile, gamut mapping, curves, tone mapping, stereo state, compare state, and several Effects-tab controls, in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L67) through [src/core/session/SessionSerializer.ts#L220).
  - The live serializer also documents that the `graph` field exists in the schema but is still unwired in `.orvproject` save/load in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L328) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L333).
  - The current issue inventory already contains the corresponding runtime defects: known serialization gaps in [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L3374), and missing graph persistence in [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L1467) and [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L3388).
- Impact:
  - The docs present `.orvproject` as a fuller fidelity format than the serializer actually implements.
  - Users can save projects expecting complete state recovery, then reopen into a materially reduced session.

### 510. The file-format guide still presents OTIO import as clips, gaps, transitions, and track mapping, but the live app flattens it to the first video track’s clip list

- Severity: Medium
- Area: Documentation / OTIO import fidelity
- Evidence:
  - The file-format guide says OTIO import supports “clips, gaps, and transitions” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L359).
  - The same section says “OTIO tracks map to sequence groups” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L362).
  - The shipped `parseOTIO(...)` helper is explicitly “single-track, backward-compatible” and “returns clips from the first video track only” in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L315) through [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L333).
  - The only production import path, `PlaylistManager.fromOTIO(...)`, consumes that single-track parse result and imports each clip via `addClip(...)` into a linear playlist in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L671) through [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L703).
  - The richer `parseOTIOMultiTrack(...)` path exists separately, but the live import path does not use it in [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L340) through [src/utils/media/OTIOParser.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOParser.ts#L382).
- Impact:
  - The guide makes OTIO ingest sound structurally richer than the shipped import path actually is.
  - Editorial users can expect gaps, transitions, and multi-track layout to survive import when production still collapses them into a simple clip sequence.

### 511. The EXR docs still describe a WASM / compiled OpenEXR decoder, but the shipped `EXRDecoder.ts` is a pure TypeScript implementation with custom codec helpers

- Severity: Low
- Area: Documentation / EXR implementation details
- Evidence:
  - The file-format guide says EXR uses a “WebAssembly-compiled OpenEXR library (`EXRDecoder.ts`)" in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L25).
  - The top-level format reference also labels EXR as a `WASM decoder` in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L16).
  - The shipped EXR decoder file is a large TypeScript implementation that directly parses headers and decodes scanline/tiled data in [src/formats/EXRDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.ts#L1) through [src/formats/EXRDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.ts#L2420).
  - Compression handling is provided by local TypeScript codec modules such as [src/formats/EXRPIZCodec.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRPIZCodec.ts) and [src/formats/EXRDWACodec.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDWACodec.ts), not a compiled OpenEXR WASM module.
  - The decoder registry imports `decodeEXR` directly from that TS path, unlike the JP2 path which explicitly acquires a WASM decoder instance in [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L487) and [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L753) through [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L754).
- Impact:
  - The docs misstate how EXR decode is implemented in production.
  - That gives readers the wrong expectations about bundle composition, performance characteristics, and the decoder’s maintenance surface.

### 514. The image-sequence workflow only recognizes a narrow legacy extension subset, even though the docs say sequences can use any supported image format

- Severity: Medium
- Area: Image sequences / format coverage
- Evidence:
  - The image-sequences guide says sequences can consist of files in “any supported image format,” explicitly listing JPEG XL, JPEG 2000, AVIF, and HEIC in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L77) through [docs/playback/image-sequences.md#L85).
  - The sequence loader’s `IMAGE_EXTENSIONS` set only includes `png`, `jpg`, `jpeg`, `webp`, `gif`, `bmp`, `tiff`, `tif`, `exr`, `dpx`, `cin`, and `cineon` in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L33) through [src/utils/media/SequenceLoader.ts#L46).
  - Sequence detection and inference both run through `filterImageFiles(...)` in the normal open flows in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1449) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1477) and [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L773) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L799).
  - `createSequenceInfo(...)` also filters by that same subset before building sequence metadata in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L227) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L235).
- Impact:
  - Multi-file and inferred-sequence workflows do not treat many documented “supported” image families as sequence candidates at all.
  - Users can select AVIF, HEIC, JXL, or JPEG 2000 frame sets and get single-file loading or outright non-sequence behavior instead of the documented sequence workflow.

### 515. The sequence-loading path bypasses the custom decoder stack and decodes frames with `createImageBitmap()`, so documented EXR/DPX/Cineon/HDR sequence workflows are not actually backed by the pro-format loaders

- Severity: High
- Area: Image sequences / decode pipeline
- Evidence:
  - The image-sequences guide says sequences can use professional formats including EXR, DPX, Cineon, Radiance HDR, JPEG XL, JPEG 2000, AVIF, and HEIC in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L77) through [docs/playback/image-sequences.md#L86).
  - The same page claims EXR sequences “benefit from the full HDR pipeline including WebAssembly decoding, Float32 precision, and layer/AOV selection” in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L87).
  - The actual sequence frame loader always calls `createImageBitmap(frame.file, ...)` in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L126) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L144).
  - `SessionMedia.loadSequence(...)`, `MediaManager.loadSequence(...)`, and `SequenceSourceNode.loadFiles(...)` all depend on `createSequenceInfo(...)` / `loadFrameImage(...)` from that same loader in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L737) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L765), [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L791) through [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L845), and [src/nodes/sources/SequenceSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/SequenceSourceNode.ts#L45) through [src/nodes/sources/SequenceSourceNode.ts#L80).
  - By contrast, the dedicated pro-format decoders live elsewhere in the file-loading stack, such as `decodeEXR(...)` in [src/formats/EXRDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.ts#L2420) and the JPEG 2000 family branch in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L2017) through [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L2024).
- Impact:
  - The shipped sequence workflow does not actually route professional image sequences through the documented decoder/HDR pipeline.
  - That can turn EXR/DPX/Cineon/HDR sequence review into browser-native decode failures or materially different behavior from single-frame loads, while the docs promise full pro-format handling.

### 516. Sequence loads collapse the numeric frame range down to `frames.length`, so missing-frame positions are not preserved as real timeline frames

- Severity: High
- Area: Image sequences / frame-range semantics
- Evidence:
  - `SequenceInfo` separately tracks `startFrame`, `endFrame`, and `missingFrames`, so the loader does know the original numbered range in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L14) through [src/utils/media/SequenceLoader.ts#L23) and [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L250) through [src/utils/media/SequenceLoader.ts#L261).
  - Despite that, both `SessionMedia.loadSequence(...)` and `MediaManager.loadSequence(...)` set source duration and out-point to `sequenceInfo.frames.length`, not to the numeric frame range, in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L754) through [src/core/session/SessionMedia.ts#L769) and [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L804) through [src/core/session/MediaManager.ts#L821).
  - The viewer then detects “missing frames” by comparing adjacent loaded frame numbers inside that shortened frame list in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1198) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1225).
  - The image-sequences guide says the sequence range runs from the lowest to highest frame number and that the timeline displays that total frame count in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L50).
- Impact:
  - A gapped sequence like `1001, 1002, 1004` becomes a 3-frame timeline instead of a 4-frame numeric range with an actual missing-frame slot.
  - That makes timeline duration, in/out behavior, and frame-based review semantics drift away from the source numbering the app is simultaneously trying to report.

### 517. The image-sequences guide still describes per-frame blob-URL lifecycle, but the live sequence loader decodes files directly and never creates `frame.url`

- Severity: Low
- Area: Documentation / sequence memory model
- Evidence:
  - The image-sequences guide says sequence memory management includes “Blob URL lifecycle -- blob URLs are created when a frame loads and revoked when released” in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L71).
  - The actual sequence frame loader decodes each file directly via `createImageBitmap(frame.file, ...)` in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L126) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L144).
  - `SequenceFrame` still has an optional `url` field, but a repo search finds no production assignment to `frame.url`; only cleanup paths revoke it if present in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L10), [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L217) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L219), and [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L312) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L314).
- Impact:
  - The guide describes an older or different sequence-frame memory model than the one the shipped app actually uses.
  - That can mislead anyone debugging sequence memory behavior or trying to understand the current loader’s lifecycle costs.

### 518. The plain-AVIF docs say detection excludes gainmap AVIFs, but `isAvifFile(...)` still returns `true` for any AVIF-brand file and relies on registry ordering instead

- Severity: Low
- Area: Documentation / AVIF detection semantics
- Evidence:
  - The file-format guide says plain AVIF detection is an `ftyp` box with AVIF brands “without gain map auxiliary items” in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L157).
  - The same section separately says gainmap AVIFs are matched first because the plain AVIF decoder is placed later in the registry chain in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L158).
  - The shipped `isAvifFile(...)` implementation explicitly says it “Returns true for any AVIF file, including gainmap AVIFs” in [src/formats/avif.ts](/Users/lifeart/Repos/openrv-web/src/formats/avif.ts#L13) and only checks the `ftyp` brand in [src/formats/avif.ts](/Users/lifeart/Repos/openrv-web/src/formats/avif.ts#L16) through [src/formats/avif.ts](/Users/lifeart/Repos/openrv-web/src/formats/avif.ts#L25).
  - The registry comment matches the implementation: plain AVIF is placed after `avifGainmapDecoder` so ordering, not the detector itself, prevents misclassification in [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L825).
- Impact:
  - The docs describe the plain AVIF detector as semantically stricter than it really is.
  - That can mislead anyone reasoning about format identification or trying to reuse `isAvifFile(...)` outside the exact registry ordering the app depends on.

### 519. ShotGrid frame-sequence paths are still routed through `session.loadImage(...)`, so `shot.####.exr` is treated like a single image URL instead of a sequence

- Severity: Medium
- Area: ShotGrid integration / sequence loading
- Evidence:
  - The ShotGrid panel now resolves `sg_path_to_frames` as the media URL when that path is present in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L306) through [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L307), and the `Load` action is enabled whenever `mediaUrl` exists in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L497).
  - `ShotGridIntegrationBridge` explicitly detects the “frame sequence path” case, logs it, and still routes every non-video URL into `this.session.loadImage(version.code, mediaUrl)` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L162) through [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L174).
  - `SessionMedia.loadImage(...)` loads that URL through a plain `HTMLImageElement` and creates a single-frame `MediaSource` with `duration: 1` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L429) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L456).
  - There is no sequence-pattern expansion or sequence-loader handoff in that path; the real sequence flow depends on file batches and `SequenceLoader` helpers instead in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1449) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1477).
- Impact:
  - ShotGrid versions backed only by frame-sequence paths can reach a loadable UI state and still fail to behave like sequences in production.
  - That leaves one of the app’s main review integrations unable to turn a standard `####` frame path into an actual timeline-backed source.

### 520. The docs present `####` / `%04d` / `@@@@` pattern strings as supported sequence formats, but production does not have a live loader for literal pattern strings

- Severity: Medium
- Area: Documentation / sequence-pattern workflow
- Evidence:
  - The file-format reference lists `Printf`, `Hash`, and `At-sign` entries under `Sequence Formats` in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L69) through [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L75).
  - The image-sequences guide and file-format guide both present those same notations as supported pattern forms in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L21) through [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L33) and [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L301) through [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L309).
  - The only production sequence-ingest path uses numbered files plus `extractPatternFromFilename(...)`, `discoverSequences(...)`, and `inferSequenceFromSingleFile(...)` in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L479) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L644) and is wired from file-batch UI flows in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1449) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1477) and [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L773) through [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L799).
  - The parser helpers for literal pattern strings, `parsePatternNotation(...)`, `toHashNotation(...)`, and `toPrintfNotation(...)`, have no production callers outside tests in [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L426) through [src/utils/media/SequenceLoader.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts#L457), with repo hits limited to [src/utils/media/SequenceLoader.test.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.test.ts#L631) through [src/utils/media/SequenceLoader.test.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.test.ts#L700).
- Impact:
  - The docs make literal pattern strings look like a real ingest format when the shipped app still expects concrete numbered files.
  - Integrations or users that hand the app `shot.####.exr` or `frame.%04d.exr` can reasonably expect sequence loading and instead hit unrelated image-URL or unsupported-file behavior.

### 521. `.orvproject` still serializes `sequencePattern` and `frameRange` for sequences, but the restore path never consumes them

- Severity: Medium
- Area: Project persistence / dead sequence metadata
- Evidence:
  - The session-state schema reserves `sequencePattern` and `frameRange` on `MediaReference` for sequences in [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L31) through [src/core/session/SessionState.ts#L54).
  - `SessionSerializer.serializeMedia(...)` populates both fields for sequence sources in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L409) through [src/core/session/SessionSerializer.ts#L414).
  - The corresponding load path never consults `ref.sequencePattern` or `ref.frameRange`; for `ref.type === 'sequence'` it only emits `Sequence \"<name>\" requires manual file selection` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L509) through [src/core/session/SessionSerializer.ts#L512).
  - A repo search shows no production consumer of those restored sequence fields outside serialization/tests; the remaining hits are schema definitions and assertions in [src/core/session/SessionSerializer.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.test.ts#L278) through [src/core/session/SessionSerializer.test.ts#L279).
- Impact:
  - Sequence-specific metadata is written into project files without contributing anything to real restore behavior.
  - That makes the saved project format look more sequence-aware than the load path actually is and leaves dead state in the schema that users cannot benefit from.

### 522. ShotGrid media loading only recognizes `mp4|mov|webm|mkv` as video, so other otherwise-supported containers are misrouted into `loadImage(...)`

- Severity: Medium
- Area: ShotGrid integration / media type detection
- Evidence:
  - `ShotGridIntegrationBridge` decides whether a version URL is video using `\\.(mp4|mov|webm|mkv)(\\?|$)` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L170).
  - Every non-matching URL is routed into `this.session.loadImage(...)` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L171) through [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L174).
  - The app’s broader supported video-extension set is materially wider and includes `m4v`, `3gp`, `3g2`, `qt`, `mk3d`, `ogg`, `ogv`, `ogm`, `ogx`, and `avi` in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L39) through [src/utils/media/SupportedMediaFormats.ts#L63).
- Impact:
  - ShotGrid versions that point at otherwise-supported containers can still be treated like image URLs and fail to load through the correct video path.
  - That makes ShotGrid media support narrower than the rest of the app, even for formats the main file-open flow can already classify as video.

### 523. DCC media loading also uses a narrower hardcoded video-extension list than the rest of the app

- Severity: Medium
- Area: DCC integration / media type detection
- Evidence:
  - `AppDCCWiring` classifies video paths using `VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv']` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L85).
  - The incoming `loadMedia` handler routes any extension outside that list into `session.loadImage(...)` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L184) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L221).
  - The app’s broader supported video-extension set is wider and includes `m4v`, `3gp`, `3g2`, `qt`, `mk3d`, `ogg`, `ogm`, and `ogx` in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L39) through [src/utils/media/SupportedMediaFormats.ts#L63), and `Session.loadSourceFromUrl(...)` likewise recognizes those extra extensions in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1141).
- Impact:
  - DCC clients can send clean, extension-bearing video paths that the main app would otherwise accept and still have them misrouted into the image path.
  - That makes DCC media loading less capable than the normal URL/file workflows for several already-supported video containers.

### 524. `.orvproject` restore reloads saved image URLs through `session.loadImage(...)`, so remote decoder-backed images do not round-trip through the project path

- Severity: Medium
- Area: Project persistence / URL-backed media restore
- Evidence:
  - During project load, `SessionSerializer.fromJSON(...)` restores every saved `ref.type === 'image'` entry by calling `await session.loadImage(ref.name, ref.path)` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L510) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L513).
  - `session.loadImage(...)` uses the plain `HTMLImageElement` URL path rather than the decoder-backed `FileSourceNode` pipeline, as shown in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L429) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L456).
  - The decoder-backed image path lives in `loadImageFile(...)` / `FileSourceNode.loadFile(...)` instead in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L468) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L515).
  - This is the same underlying capability gap already recorded for share-link and DCC URL loading in [ISSUES.md](/Users/lifeart/Repos/openrv-web/ISSUES.md#L5160), but project restore hardcodes that same weaker path inside the persistence layer.
- Impact:
  - A project file that references remote EXR, float TIFF, RAW-preview, or other decoder-backed image URLs can reopen through a different and weaker load path than the original session used.
  - That makes `.orvproject` URL-backed media restore less faithful than users would expect from a save/load round-trip.

### 525. The DCC `loadMedia` protocol advertises “file path or URL,” but the browser-side loader just forwards raw paths into `img.src` / `video.src`

- Severity: Medium
- Area: DCC integration / protocol contract
- Evidence:
  - The DCC protocol defines inbound `loadMedia.path` as a “File path or URL” in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L38) through [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L43).
  - `AppDCCWiring` forwards that `path` string directly into `session.loadVideo(name, path)` or `session.loadImage(name, path)` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L184) through [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L221).
  - Those session URL loaders then assign the raw string to browser media elements, with `img.src = url` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L429) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L456) and the corresponding video path in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L640) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L689).
  - Elsewhere in the docs, the app already acknowledges the browser sandbox cannot directly access local filesystems, for example in [docs/guides/session-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/guides/session-compatibility.md#L210).
- Impact:
  - A DCC tool that sends an ordinary host filesystem path can follow the advertised protocol and still fail because the browser cannot resolve that path as a meaningful media URL.
  - That makes the live DCC load contract narrower than the protocol/type comments imply unless the sender converts paths into browser-reachable URLs first.

### 526. The image-sequences guide still presents fixed `5`-frame preload and `20`-frame retention windows, but the live sequence stack now mixes multiple larger cache policies

- Severity: Low
- Area: Documentation / sequence memory behavior
- Evidence:
  - The image-sequences guide says the preload window is “5 frames ahead and behind” and the keep window is “up to 20 frames” in [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L66) through [docs/playback/image-sequences.md](/Users/lifeart/Repos/openrv-web/docs/playback/image-sequences.md#L72).
  - The direct session/media sequence path does still use `preloadFrames(..., 5)` plus `releaseDistantFrames(..., 20)` during normal fetches in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L932) through [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L939) and [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L842) through [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L848).
  - But the same runtime also does a wider initial preload of `10` frames on sequence load in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L771) and [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L824).
  - The node-graph sequence path uses `FramePreloadManager` defaults of `maxCacheSize: 100`, `preloadAhead: 30`, `preloadBehind: 5`, and `scrubWindow: 10` in [src/utils/media/FramePreloadManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/FramePreloadManager.ts#L24) through [src/utils/media/FramePreloadManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/FramePreloadManager.ts#L34).
- Impact:
  - The guide presents sequence caching as one simple fixed policy, but the shipped runtime now uses different preload/retention behaviors depending on the path and playback state.
  - That can mislead anyone trying to reason about memory usage, hitching, or cache tuning from the docs alone.

### 527. Sequence-style media representations can never use `SequenceRepresentationLoader`, because the live switch path never passes the `isSequence` flag to the loader factory

- Severity: Medium
- Area: Media representations / sequence variants
- Evidence:
  - `RepresentationLoaderFactory` can return `SequenceRepresentationLoader` for `kind === 'frames'`, but only when its third `isSequence` parameter is `true` in [src/core/session/loaders/RepresentationLoaderFactory.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/RepresentationLoaderFactory.ts#L24) through [src/core/session/loaders/RepresentationLoaderFactory.ts#L36).
  - The live representation switch path calls `createRepresentationLoader(representation.kind, hdrResizeTier)` with no `isSequence` argument in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L182), so `frames` representations always get `FileRepresentationLoader`.
  - `FileRepresentationLoader` requires a single `loaderConfig.file` and throws if one is not present in [src/core/session/loaders/FileRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/FileRepresentationLoader.ts#L13) through [src/core/session/loaders/FileRepresentationLoader.ts#L20).
  - The separate `SequenceRepresentationLoader` expects `loaderConfig.files` and constructs sequence metadata from that array in [src/core/session/loaders/SequenceRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/SequenceRepresentationLoader.ts#L72) through [src/core/session/loaders/SequenceRepresentationLoader.ts#L89).
- Impact:
  - Any representation intended to model an alternate image-sequence variant is routed into the wrong loader and can fail before it ever gets sequence-aware handling.
  - That leaves the representation system effectively biased toward single-file frame reps even though the codebase contains a dedicated sequence representation loader.

### 528. Sequence representations also cannot round-trip through serialization, because the serialized loader config omits `files` while `SequenceRepresentationLoader` requires them

- Severity: Medium
- Area: Media representations / project persistence
- Evidence:
  - `RepresentationLoaderConfig` supports runtime-only `files?: File[]` for sequence representations in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L64) through [src/core/types/representation.ts#L79).
  - The serialized representation format explicitly omits `file` and `files` from `loaderConfig` in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L93) through [src/core/types/representation.ts#L107).
  - `SessionSerializer.fromJSON(...)` restores representations from that serialized loader config and passes it straight into `addRepresentationToSource(...)` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L527) through [src/core/session/SessionSerializer.ts#L547).
  - `SequenceRepresentationLoader` then throws `SequenceRepresentationLoader: no files provided` whenever `loaderConfig.files` is absent in [src/core/session/loaders/SequenceRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/SequenceRepresentationLoader.ts#L72) through [src/core/session/loaders/SequenceRepresentationLoader.ts#L80).
- Impact:
  - Sequence-based alternate representations cannot be faithfully restored from saved project state.
  - The representation serialization format carries enough metadata to look sequence-aware, but not enough runtime data for the actual sequence representation loader to work.

### 529. The representation system still advertises a `streaming` kind, but the live loader factory throws for it

- Severity: Medium
- Area: Media representations / unsupported kind
- Evidence:
  - The shared representation model still defines `RepresentationKind = 'frames' | 'movie' | 'proxy' | 'streaming'` and documents representations as things like “full-res frames, proxy video, streaming URL” in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L4) through [src/core/types/representation.ts#L12).
  - `getDefaultPriority(...)` also treats `streaming` as a normal representation kind in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L216) through [src/core/types/representation.ts#L227).
  - The live loader factory throws `Streaming representations are not yet supported` for `kind === 'streaming'` in [src/core/session/loaders/RepresentationLoaderFactory.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/RepresentationLoaderFactory.ts#L38) through [src/core/session/loaders/RepresentationLoaderFactory.ts#L39).
  - `MediaRepresentationManager.switchRepresentation(...)` calls that factory directly during normal representation activation in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L182) through [src/core/session/MediaRepresentationManager.ts#L197).
- Impact:
  - A representation kind that the shared model treats as valid still fails at the point of actual use.
  - That leaves the representation contract broader than the shipped runtime and makes `streaming` look supported until activation time.

### 530. Non-sequence file, movie, and proxy representations also cannot round-trip through serialization, because the saved loader config strips the `File` objects their live loaders require

- Severity: Medium
- Area: Media representations / project persistence
- Evidence:
  - Representation serialization removes both `file` and `files` from `loaderConfig` before save in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L234) through [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L246).
  - `SessionSerializer.fromJSON(...)` restores representations from that stripped `loaderConfig` and feeds it straight back into `addRepresentationToSource(...)`, then tries to reactivate the saved `activeRepresentationId` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L527) through [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L560).
  - The normal single-image representation path still uses `FileRepresentationLoader`, which throws `FileRepresentationLoader: no file provided` when `loaderConfig.file` is absent in [src/core/session/loaders/FileRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/FileRepresentationLoader.ts#L15) through [src/core/session/loaders/FileRepresentationLoader.ts#L22).
  - The normal `movie` / `proxy` path still uses `VideoRepresentationLoader`, which likewise throws `VideoRepresentationLoader: no file provided` when `loaderConfig.file` is absent in [src/core/session/loaders/VideoRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/VideoRepresentationLoader.ts#L21) through [src/core/session/loaders/VideoRepresentationLoader.ts#L29).
- Impact:
  - Saved projects can preserve alternate representation metadata and IDs, but any restored non-sequence representation that still depends on a runtime `File` object can fail as soon as activation is attempted.
  - That leaves representation persistence broken more broadly than the already-logged sequence case: metadata round-trips, but the real loadable media payload does not.

### 531. The shared representation loader contract advertises `path` and `url` configs, but live representation activation still hard-fails unless an in-memory `File` object is present

- Severity: Medium
- Area: Media representations / runtime contract
- Evidence:
  - `RepresentationLoaderConfig` explicitly documents `path` for file-based representations and `url` for URL-based representations in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L69) through [src/core/types/representation.ts#L85).
  - The shared type tests also treat those fields as normal inputs, for example creating reps with `loaderConfig: { url: 'http://example.com/video.mp4' }` and `loaderConfig: { path: '/path/to/file.exr' }` in [src/core/types/representation.test.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.test.ts#L25) through [src/core/types/representation.test.ts#L56).
  - But the live `frames` loader ignores `url` and requires `loaderConfig.file`, throwing `FileRepresentationLoader: no file provided` when it is missing in [src/core/session/loaders/FileRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/FileRepresentationLoader.ts#L15) through [src/core/session/loaders/FileRepresentationLoader.ts#L22).
  - The live `movie` / `proxy` loader does the same, throwing `VideoRepresentationLoader: no file provided` whenever `loaderConfig.file` is absent in [src/core/session/loaders/VideoRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/VideoRepresentationLoader.ts#L21) through [src/core/session/loaders/VideoRepresentationLoader.ts#L29).
- Impact:
  - A representation config that looks valid by shared types, comments, and tests can still fail at first real activation if it was built from a path or URL instead of a `File`.
  - That leaves the published representation contract broader than the shipped runtime and makes URL-based or path-only variants look supported when they are not.

### 532. Representation-level `opfsCacheKey` is serialized and tested, but no live representation loader or restore path ever uses it

- Severity: Medium
- Area: Media representations / resilience contract
- Evidence:
  - `RepresentationLoaderConfig` explicitly includes `opfsCacheKey` for “resilience against File reference invalidation,” and `SerializedRepresentation` preserves it in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L73) through [src/core/types/representation.ts#L113).
  - The shared representation tests also assert that `serializeRepresentation(...)` keeps `loaderConfig.opfsCacheKey` in [src/core/types/representation.test.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.test.ts#L124) through [src/core/types/representation.test.ts#L167).
  - But the actual OPFS restore logic in `SessionSerializer.fromJSON(...)` only checks the top-level media reference `ref.opfsCacheKey` before reloading the base source in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L387) through [src/core/session/SessionSerializer.ts#L408) and [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L458) through [src/core/session/SessionSerializer.ts#L476).
  - The live representation loaders still only read `loaderConfig.file` and throw if it is missing, with no `opfsCacheKey` lookup path in [src/core/session/loaders/FileRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/FileRepresentationLoader.ts#L15) through [src/core/session/loaders/FileRepresentationLoader.ts#L25) and [src/core/session/loaders/VideoRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/VideoRepresentationLoader.ts#L21) through [src/core/session/loaders/VideoRepresentationLoader.ts#L32).
- Impact:
  - Representation configs can carry an `opfsCacheKey` that appears to promise resilient reload behavior, but losing the original `File` handle still leaves those variants unloadable.
  - That makes the representation persistence model look more fault-tolerant than the real runtime actually is.

### 533. Representation switching claims frame-accurate remapping via `startFrame`, but the live switch path never uses the remap logic

- Severity: Medium
- Area: Media representations / playback continuity
- Evidence:
  - The shared representation model says `startFrame` is “Used for frame-accurate switching” between editorial-offset variants in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L51) through [src/core/types/representation.ts#L55).
  - `MediaRepresentationManager` does implement `mapFrame(currentFrame, fromRep, toRep, maxFrame?)` for exactly that purpose in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L297) through [src/core/session/MediaRepresentationManager.ts#L315).
  - But the real `switchRepresentation(...)` path only swaps the active representation, applies the shim, and emits `representationChanged`; it never calls `mapFrame(...)` or updates the host’s current frame in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L133) through [src/core/session/MediaRepresentationManager.ts#L229).
  - Production subscribers to `representationChanged` only resync timecode offsets and audio-scrub availability in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L198) and [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L218); a repo search finds no live caller that remaps the current frame through `mapFrame(...)`.
- Impact:
  - Switching between representations with different start-frame offsets can leave playback on the wrong relative frame even though the type/model explicitly promises frame-accurate switching.
  - That is especially damaging for EXR-vs-proxy editorial workflows, where the whole point of the stored offset is to preserve shot alignment across representation changes.

### 535. Even if a sequence representation loaded successfully, the shim path would still discard the sequence metadata that the rest of the app expects

- Severity: Medium
- Area: Media representations / sequence runtime wiring
- Evidence:
  - The normal sequence load path builds a `MediaSource` with `sequenceInfo`, `sequenceFrames`, `duration`, `fps`, and the first frame element, then updates host FPS and out-point accordingly in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L743) through [src/core/session/SessionMedia.ts#L771).
  - `SequenceRepresentationLoader` does preserve `SequenceInfo` and frame data inside `SequenceSourceNodeWrapper` via its `sequenceInfo` and `frames` accessors in [src/core/session/loaders/SequenceRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/SequenceRepresentationLoader.ts#L21) through [src/core/session/loaders/SequenceRepresentationLoader.ts#L49).
  - But `SessionMedia.applyRepresentationShim(...)` clears `source.sequenceInfo` and `source.sequenceFrames`, and for non-file/non-video sources it only copies `getElement(1)` plus `type = 'sequence'` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L1180) through [src/core/session/SessionMedia.ts#L1214).
- Impact:
  - A sequence-based alternate representation would still be only partially wired even after the loader problems were fixed.
  - Existing sequence-aware playback and UI paths would lose access to frame lists, sequence metadata, and the normal source-level sequence state they depend on.

### 536. Representation switches only update width and height on the active source, leaving source-level duration/FPS state stale

- Severity: Medium
- Area: Media representations / source metadata consistency
- Evidence:
  - `MediaSource` exposes `duration` and `fps` alongside `width` and `height` as the canonical source-level metadata read throughout the app in [src/core/session/SessionTypes.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionTypes.ts#L191) through [src/core/session/SessionTypes.ts#L217).
  - Normal media load paths update those fields and emit the matching host/session events, for example video load sets detected FPS and duration and then calls `setFps(...)`, `emitFpsChanged(...)`, `setOutPoint(...)`, and `emitDurationChanged(...)` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L709) through [src/core/session/SessionMedia.ts#L728).
  - But `SessionMedia.applyRepresentationShim(...)` only copies `representation.resolution.width` and `representation.resolution.height`, clears node-specific fields, and never updates `source.duration`, `source.fps`, or any host playback bounds/events in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L1180) through [src/core/session/SessionMedia.ts#L1216).
  - Large parts of the runtime still read `source.duration` and `source.fps` directly after source changes, including public API/event payloads and timeline/viewer UI in [src/api/MediaAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MediaAPI.ts#L52) through [src/api/MediaAPI.ts#L55), [src/ui/components/Timeline.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts#L408) through [src/ui/components/Timeline.ts#L417), and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1682) through [src/ui/components/Viewer.ts#L1683).
- Impact:
  - Switching to a representation with different duration or FPS can leave the app reporting and using stale source metadata from the previous variant.
  - That undermines timeline bounds, public media-info APIs, and any UI that assumes representation switches keep the source metadata coherent.

### 537. Removing the last active representation can leave the source shim pointing at a disposed node

- Severity: Medium
- Area: Media representations / removal edge case
- Evidence:
  - `removeRepresentation(...)` disposes the loader for the removed representation and deletes it from the internal map in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L96) through [src/core/session/MediaRepresentationManager.ts#L101).
  - If that removed representation was active and there is no ready fallback, the code only sets `activeRepresentationIndex` to `-1`; it does not call `applyRepresentationShim(...)` or otherwise clear the source-level node fields in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L103) through [src/core/session/MediaRepresentationManager.ts#L116).
  - The actual clearing of `source.videoSourceNode`, `source.fileSourceNode`, `source.sequenceInfo`, `source.sequenceFrames`, and `source.element` lives inside `SessionMedia.applyRepresentationShim(...)` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L1188) through [src/core/session/SessionMedia.ts#L1194).
  - Both file and video representation loaders dispose their held source nodes when removed in [src/core/session/loaders/FileRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/FileRepresentationLoader.ts#L42) through [src/core/session/loaders/FileRepresentationLoader.ts#L46) and [src/core/session/loaders/VideoRepresentationLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/loaders/VideoRepresentationLoader.ts#L51) through [src/core/session/loaders/VideoRepresentationLoader.ts#L55).
- Impact:
  - After removing the last active representation, the source can still hold legacy pointers to a node that has already been disposed.
  - That leaves the app in a stale half-switched state instead of clearly falling back or clearly clearing the active media variant.

### 538. Switching representations while playing pauses playback and never resumes it

- Severity: Medium
- Area: Media representations / playback interaction
- Evidence:
  - `SessionMedia.switchRepresentation(...)` unconditionally pauses the host when playback is active before delegating to the representation manager in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L1153) through [src/core/session/SessionMedia.ts#L1164).
  - The rest of the representation-switch path only changes the active representation and emits representation events; there is no matching resume call in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L133) through [src/core/session/MediaRepresentationManager.ts#L229).
  - A repo search finds no production subscriber on `representationChanged` or `fallbackActivated` that restarts playback after a successful switch.
- Impact:
  - A user who changes representation during playback can end up unexpectedly paused even when the switch succeeds.
  - That makes representation changes disrupt review flow instead of behaving like a transparent quality/source swap.

### 539. Video representations are not promoted to full video sources, so they lose the `HTMLVideoElement` and audio wiring that normal video playback paths still rely on

- Severity: High
- Area: Media representations / video runtime wiring
- Evidence:
  - Normal video file loads build both a `VideoSourceNode` and an `HTMLVideoElement`, store both on the active `MediaSource`, and call `loadAudioFromVideo(...)` for audio sync/playback in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L621) through [src/core/session/SessionMedia.ts#L672).
  - The representation shim clears `source.element` and, for `VideoSourceNode` representations, restores only `source.videoSourceNode` plus `type = 'video'` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L1188) through [src/core/session/SessionMedia.ts#L1203).
  - No representation-switch path recreates an `HTMLVideoElement`, calls `initVideoPreservesPitch(...)`, or calls `loadAudioFromVideo(...)`; a repo search finds those only in the normal media-load paths.
  - Large parts of playback and export still branch on `source.element instanceof HTMLVideoElement`, including current-time sync and native video playback/audio sync in [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L486) through [src/core/session/SessionPlayback.ts#L499) and [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L536) through [src/core/session/PlaybackEngine.ts#L553), plus export/render fallbacks in [src/ui/components/ViewerExport.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerExport.ts#L102) through [src/ui/components/ViewerExport.ts#L114).
- Impact:
  - Switching into a video/proxy representation does not give the app the same runtime shape as loading that video normally.
  - That can break audio sync/playback and any native-video/export path that still expects an `HTMLVideoElement` on video sources.

### 540. Representation switches leave `source.name` and `source.url` pinned to the base media, even when the active variant is different

- Severity: Medium
- Area: Media representations / source identity
- Evidence:
  - `SessionMedia.applyRepresentationShim(...)` updates only resolution and node-specific fields; it never rewrites `source.name` or `source.url` from the active representation’s label/path/url in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L1180) through [src/core/session/SessionMedia.ts#L1216).
  - The representation model does carry alternate identity fields such as `label` plus `loaderConfig.path` / `loaderConfig.url` in [src/core/types/representation.ts](/Users/lifeart/Repos/openrv-web/src/core/types/representation.ts#L24) through [src/core/types/representation.ts#L90).
  - Public/source-facing runtime code continues to read `source.name` and `source.url` directly after switches, including `openrv.media.getCurrentSource()` in [src/api/MediaAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MediaAPI.ts#L44) through [src/api/MediaAPI.ts#L54), session save/export in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L390) through [src/core/session/SessionSerializer.ts#L395) and [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L606) through [src/core/session/SessionGTOExporter.ts#L607), and UI surfaces like [InfoStripOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/InfoStripOverlay.ts#L172) through [src/ui/components/InfoStripOverlay.ts#L179) and [RightPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/RightPanelContent.ts).
- Impact:
  - After switching to a proxy or alternate file/video representation, the app can still present, serialize, and reason about the base source identity instead of the actually active media variant.
  - That makes public media info, exports, and on-screen source labeling drift away from what the viewer is really showing.

### 542. Async idle-fallbacks are reported as successful before they actually load, so callers can miss real representation-restore failures

- Severity: Medium
- Area: Media representations / error reporting contract
- Evidence:
  - `switchRepresentation(...)` returns the boolean result of `handleRepresentationError(...)` after a system-initiated load failure in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L210) through [src/core/session/MediaRepresentationManager.ts#L228).
  - In the idle-fallback branch, `handleRepresentationError(...)` starts `void this.switchRepresentation(...)` asynchronously and immediately returns `true`, with an inline comment calling that “Optimistically true” in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L268) through [src/core/session/MediaRepresentationManager.ts#L273).
  - The current test suite explicitly codifies that optimistic `true` behavior in [src/core/session/MediaRepresentationManager.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.test.ts#L424) through [src/core/session/MediaRepresentationManager.test.ts#L444).
  - `SessionSerializer.fromJSON(...)` treats the awaited boolean from `session.switchRepresentation(...)` as authoritative when deciding whether to warn about a failed active-representation restore in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L550) through [src/core/session/SessionSerializer.ts#L560).
- Impact:
  - A representation restore can be reported as successful to its caller even though the fallback path is still unresolved and may fail moments later.
  - That makes restore/reporting logic undercount real failures and leaves error visibility dependent on later side effects instead of the original operation result.

### 543. The multiple-representation subsystem is effectively unwired in the shipped app outside save/load internals

- Severity: Medium
- Area: Media representations / production reachability
- Evidence:
  - A repo search finds no production UI, app-shell, service, plugin, or public-API caller for `session.switchRepresentation(...)`, `addRepresentationToSource(...)`, or `removeRepresentationFromSource(...)`; outside tests, the only live caller is `SessionSerializer.fromJSON(...)` during restore in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L534) through [src/core/session/SessionSerializer.ts#L552).
  - The public API layer exposes representation-related error events, but no matching user-facing or scripting methods to manage representations; the search over [src/api](/Users/lifeart/Repos/openrv-web/src/api) only finds `representationError` event bridging in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L351) through [src/api/EventsAPI.ts#L359).
  - The UI/app-shell search over `src/ui`, `src/App.ts`, `src/AppPlaybackWiring.ts`, and `src/services` does not find any shipped control path that switches or edits representations.
- Impact:
  - The app contains a substantial media-representation system, but in production it is mostly reachable only indirectly through project/session restore.
  - That leaves the feature set largely untestable by real users, and it helps explain why multiple restore/runtime edge cases can exist without an everyday UI path exposing them earlier.

### 544. The heavily tested legacy `MediaManager` is effectively dead in production; the shipped app runs through `SessionMedia` instead

- Severity: Medium
- Area: Media loading / test-to-runtime coverage
- Evidence:
  - The real session runtime instantiates `SessionMedia` as its media subsystem in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L81) through [src/core/session/Session.ts#L92).
  - A repo search finds `new MediaManager(...)` only inside [src/core/session/MediaManager.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.test.ts), while production code does instantiate `SessionMedia` in [src/core/session/SessionMedia.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.test.ts#L111) and the main runtime through `Session`.
  - The codebase therefore carries two large, similarly named media stacks, but only one of them is actually on the app’s execution path.
- Impact:
  - Passing `MediaManager` tests can give false confidence about the shipped app’s media behavior, because production requests and state mutations go through different code.
  - That increases the chance of media-loading regressions surviving despite strong-looking unit coverage on the wrong subsystem.

### 545. Public source/rendered-image events stay stale across representation switches because the API bridge ignores `representationChanged`

- Severity: Medium
- Area: Public API / event consistency
- Evidence:
  - `EventsAPI` updates its public `sourceLoaded` payloads and `_lastLoadedSource` cache only from `session.on('sourceLoaded', ...)` and `session.on('currentSourceChanged', ...)` in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L315) through [src/api/EventsAPI.ts#L322) and [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L392) through [src/api/EventsAPI.ts#L404).
  - The same bridge subscribes to `representationError`, but not to `representationChanged` or `fallbackActivated`, in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L351) through [src/api/EventsAPI.ts#L359).
  - Representation switches in the session emit `representationChanged` and `fallbackActivated`, not `sourceLoaded`, in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L145) through [src/core/session/SessionMedia.ts#L152) and [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L167) through [src/core/session/MediaRepresentationManager.ts#L202).
- Impact:
  - Scripting consumers listening for public source/rendered-image state can miss real active-media changes when the viewer switches representations.
  - That leaves the public event surface lagging behind the actual viewer state even when the internal session correctly changes variants.

### 546. `currentSourceChanged` is not emitted for representation switches, so active-source listeners can keep stale per-source state

- Severity: Medium
- Area: Session events / state invalidation
- Evidence:
  - `SessionMedia` emits `currentSourceChanged` only from `setCurrentSource(...)` when the source index changes in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L290).
  - Representation switching emits `representationChanged` / `fallbackActivated`, but not `currentSourceChanged`, in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L145) through [src/core/session/SessionMedia.ts#L152) and [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L167) through [src/core/session/MediaRepresentationManager.ts#L202).
  - Production code does treat `currentSourceChanged` as the signal for clearing source-specific state, for example floating-window QC results are cleared only on that event in [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L318) through [src/AppViewWiring.ts#L323).
  - The public API bridge also depends on `currentSourceChanged` for part of its rendered-image refresh path in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L399) through [src/api/EventsAPI.ts#L404).
- Impact:
  - Switching the active media variant in place can leave source-scoped UI and API consumers behaving as if nothing changed, because the session never emits the broader “active source changed” signal they subscribe to.
  - That makes representation changes a blind spot for invalidation logic that was written around source changes rather than source indices alone.

### 547. The public scripting event surface exposes representation failures, but not successful representation changes or fallbacks

- Severity: Medium
- Area: Public API / observability
- Evidence:
  - The internal session emits `representationChanged` and `fallbackActivated` events in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L167) through [src/core/session/MediaRepresentationManager.ts#L202) and [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L258) through [src/core/session/MediaRepresentationManager.ts#L263).
  - `EventsAPI` only bridges the failure side of that subsystem via `representationError`, mapping it onto the generic public `error` channel in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L351) through [src/api/EventsAPI.ts#L359).
  - The public `OpenRVEventName` union has no `representationChanged` or fallback event at all in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L14) through [src/api/EventsAPI.ts#L29).
- Impact:
  - Script/plugin authors can be told when representation switching fails, but they have no first-class way to observe when the active variant changes successfully or silently falls back.
  - That makes representation-aware automation asymmetric and forces consumers to infer state changes indirectly from other stale or incomplete signals.

### 549. URL/session sharing has no representation awareness, so active alternate variants cannot round-trip through share links or collaboration state

- Severity: Medium
- Area: Session URL sharing / media representations
- Evidence:
  - `SessionURLService.captureSessionURLState()` stores only the current source index, base `sourceUrl`, A/B indices, frame, transform, wipe, and OCIO state in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L105) through [src/services/SessionURLService.ts#L132).
  - Its `URLSession` dependency contract exposes no representation fields or methods at all beyond the base current source and source indices in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L17) through [src/services/SessionURLService.ts#L35).
  - On apply, the service can reload only `state.sourceUrl` on a clean session and then set current source / A-B / view state; there is no path to restore active representation IDs or alternate representation definitions in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L135) through [src/services/SessionURLService.ts#L223).
- Impact:
  - A shared URL can reconstruct only the base media plus viewer state, not the actual active representation/variant a user was reviewing.
  - That makes representation-based review state non-shareable across the app’s URL and collaboration entry points even though project save/load tries to preserve it.

### 550. Public `renderedImagesChanged` payloads are hardcoded to one synthetic image from the last loaded source, not the actual current render set

- Severity: Medium
- Area: Public API / rendered-image model
- Evidence:
  - `EventsAPI.emitCurrentRenderedImages()` always emits a single-item `images` array, with `index: 0` and `nodeName: name`, derived only from `_lastLoadedSource` in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L408) through [src/api/EventsAPI.ts#L422).
  - `_lastLoadedSource` itself stores only `{ name, width, height }`, not a real render list, node graph identity, compare overlays, or multiple active images in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L104) through [src/api/EventsAPI.ts#L105).
  - The same public event type is described as `images: Array<...>` and is consumed by compatibility code that expects it to reflect the current render set in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L62) through [src/api/EventsAPI.ts#L70) and [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L114) through [src/compat/MuEvalBridge.ts#L128).
- Impact:
  - Public/compat consumers can be told there is exactly one rendered image even when the viewer is in compare or other multi-image states.
  - That makes the rendered-image event payload a lossy approximation of viewer output rather than a trustworthy description of the current render graph.

### 552. Mu compat `remoteContacts()` returns the locally supplied connection labels instead of the peer contact names received on handshake

- Severity: Medium
- Area: Mu compatibility / remote networking
- Evidence:
  - `MuNetworkBridge.remoteContacts()` simply maps `connectionInfo.values()` to `info.name` in [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L258) through [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L260).
  - That `name` field comes from the caller-supplied `remoteConnect(name, host, port)` argument when the connection record is created in [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L88) through [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L111).
  - The bridge separately stores the actual peer identity in `peerContactName` when the handshake arrives in [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L404) through [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L411), and the type contract explicitly describes that field as “Peer's contact name received via handshake” in [src/compat/types.ts](/Users/lifeart/Repos/openrv-web/src/compat/types.ts#L95) through [src/compat/types.ts](/Users/lifeart/Repos/openrv-web/src/compat/types.ts#L104).
- Impact:
  - Mu-compatible scripts asking for remote contacts get back whatever local label was passed into `remoteConnect(...)`, not the actual contact names advertised by the remote peers.
  - That makes peer identity unreliable for collaboration/integration code that needs to distinguish real remote users from local aliases.

### 554. The public playback/event API stays clip-local in playlist mode and never exposes the global playlist timeline the UI is actually using

- Severity: Medium
- Area: Public API / playlist runtime
- Evidence:
  - When the app jumps within a playlist, it stores the playlist-global frame in `playlistManager.setCurrentFrame(globalFrame)` but seeks the session to the clip-local frame via `session.goToFrame(mapping.localFrame)` in [src/services/FrameNavigationService.ts](/Users/lifeart/Repos/openrv-web/src/services/FrameNavigationService.ts#L225) through [src/services/FrameNavigationService.ts#L235) and [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L875) through [src/AppPlaybackWiring.ts#L885).
  - `PlaybackAPI.getCurrentFrame()` returns `this.session.currentFrame` and `PlaybackAPI.getTotalFrames()` returns `this.session.currentSource?.duration`, both of which are clip-local values in that runtime model, in [src/api/PlaybackAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/PlaybackAPI.ts#L253) through [src/api/PlaybackAPI.ts#L270).
  - The public `frameChange` event is likewise bridged directly from `session.on('frameChanged', ...)` in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L234) through [src/api/EventsAPI.ts#L237), so event consumers also see only the clip-local frame domain.
  - The real playlist-global frame lives only in `PlaylistManager.getCurrentFrame()` / `getTotalDuration()` in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L427) through [src/core/session/PlaylistManager.ts#L511), and the public API has no playlist module that exposes those values.
- Impact:
  - Automation or external review tools querying `openrv.playback` during playlist review get per-clip frame numbers and durations even while the UI/timeline is operating in playlist-global frame space.
  - That makes scripting against playlist sessions fundamentally ambiguous: external code cannot reconstruct the same frame position the user is actually seeing from the public API alone.

### 556. The generated public API reference under-documents the live event surface by omitting several valid `openrv.events` names

- Severity: Medium
- Area: Public API documentation / scripting events
- Evidence:
  - The live `OpenRVEventName` union includes `sourceLoadingStarted`, `sourceLoadFailed`, `viewTransformChanged`, and `renderedImagesChanged` in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L16) through [src/api/EventsAPI.ts#L29), and `getEventNames()` returns the full `VALID_EVENTS` set in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L78) through [src/api/EventsAPI.ts#L83) and [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L199) through [src/api/EventsAPI.ts#L202).
  - The generated API index still documents `OpenRVEventName` as only `"frameChange" | "play" | "pause" | "stop" | "speedChange" | "volumeChange" | "muteChange" | "audioScrubEnabledChange" | "loopModeChange" | "inOutChange" | "markerChange" | "sourceLoaded" | "error"` in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L46) through [docs/api/index.md#L55).
  - The same generated reference also publishes plugin-visible `app:` events only for that narrower subset in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L99) through [docs/api/index.md#L115), so the omission propagates into plugin-facing documentation too.
- Impact:
  - Script and plugin authors reading the generated API reference can conclude that several real runtime events do not exist and avoid subscribing to them.
  - That makes the documented scripting surface narrower than the actual shipped API, which is the opposite of the other docs-drift problems already logged.

### 557. The generated API index is full of dead local links because it advertises class/interface pages that do not exist in the shipped docs tree

- Severity: Medium
- Area: API documentation / discoverability
- Evidence:
  - `docs/api/index.md` links to local pages such as `classes/AudioAPI.md`, `classes/OpenRVAPI.md`, and `interfaces/OpenRVEventData.md` in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L3) through [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L28).
  - The actual docs tree in this checkout contains only a single file, [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md), with no `docs/api/classes/` or `docs/api/interfaces/` directories.
- Impact:
  - Readers can see a full API table of contents and then immediately hit dead links for most of the advertised reference pages.
  - That makes the generated API area look complete while failing at the first level of navigation.

### 558. Plugin `onApp(...)` subscriptions only cover an older subset of public events, so plugins cannot observe newer `openrv.events` signals through the advertised bridge

- Severity: Medium
- Area: Plugin API / event bridging
- Evidence:
  - The public event layer exposes `sourceLoadingStarted`, `sourceLoadFailed`, `viewTransformChanged`, and `renderedImagesChanged` as valid `OpenRVEventName` values in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L16) through [src/api/EventsAPI.ts#L29).
  - `PluginEventBus.AppEventName` and `APP_EVENT_TO_API` only include the older subset through `app:sourceLoaded` plus `app:error`, with no plugin-visible equivalents for those newer events, in [src/plugin/PluginEventBus.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginEventBus.ts#L19) through [src/plugin/PluginEventBus.ts#L49) and [src/plugin/PluginEventBus.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginEventBus.ts#L79) through [src/plugin/PluginEventBus.ts#L92).
  - Plugin authors are told that `onApp(...)` subscribes to “application events” mapped from the public API surface in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L92) through [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L115), but the runtime bridge does not actually provide parity with the live `EventsAPI`.
- Impact:
  - A plugin can subscribe to public app-state events only if they happen to be in the reduced plugin bridge subset; newer loading/view/render events are unavailable even though external scripts can subscribe to them directly.
  - That makes plugin automation less observant than plain `window.openrv.events` consumers for no obvious reason.

### 559. The main scripting guide also under-documents the live event surface, so script authors are steered away from valid `openrv.events` subscriptions

- Severity: Medium
- Area: Public API documentation / scripting guide
- Evidence:
  - The live `EventsAPI` exposes `sourceLoadingStarted`, `sourceLoadFailed`, `viewTransformChanged`, and `renderedImagesChanged` in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L16) through [src/api/EventsAPI.ts#L32).
  - The “Available Events” table in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L303) through [docs/advanced/scripting-api.md#L317) lists only the narrower subset ending at `sourceLoaded` and `error`.
  - The same page explicitly tells users to call `openrv.events.getEventNames()` for the available set in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L298), but the written table still omits several names that `getEventNames()` would return at runtime.
- Impact:
  - Script authors reading the primary scripting guide can conclude that loading-progress, view-transform, and rendered-image events are unavailable when they are actually live.
  - That makes the human-facing guide lag behind the real event API even for users who never consult the generated reference.

### 560. `openrv.dispose()` does not detach the singleton plugin registry, so active plugin contexts keep a dead API/events bridge after disposal

- Severity: Medium
- Area: Public API lifecycle / plugins
- Evidence:
  - `OpenRVAPI.dispose()` only marks the API unready and disposes its own submodules in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L166) through [src/api/OpenRVAPI.ts#L175); it never informs `pluginRegistry`, clears `pluginRegistry.apiRef`, or resets the plugin event bus.
  - The singleton `PluginRegistry` stores both an `apiRef` and a bridged `eventsAPI` reference set during bootstrap in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L95) through [src/plugin/PluginRegistry.ts#L109).
  - Plugin contexts expose `context.api` by returning that stored `apiRef` directly in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L442) through [src/plugin/PluginRegistry.ts#L445), and app-event subscriptions continue to route through the stored `eventsAPI` in [src/plugin/PluginEventBus.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginEventBus.ts#L119) through [src/plugin/PluginEventBus.ts#L120) and [src/plugin/PluginEventBus.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginEventBus.ts#L240) through [src/plugin/PluginEventBus.ts#L257).
  - The scripting docs describe `dispose()` as cleaning up the API instance while also presenting plugins as part of the same public surface in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L156) through [src/api/OpenRVAPI.ts#L175) and [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L21) through [docs/advanced/scripting-api.md#L23).
- Impact:
  - After `openrv.dispose()`, already-activated plugins can still hold `context.api` and event subscriptions that point at a disposed API object rather than being torn down or explicitly invalidated.
  - That leaves the plugin layer in a half-alive state where host-side scripting is “disposed” but plugin-side integrations can still try to operate against stale references and fail later at call time.

### 561. Every plugin gets `context.settings`, even without a `settingsSchema`, so the API degrades into a trap object instead of a clearly absent capability

- Severity: Medium
- Area: Plugin API / settings lifecycle
- Evidence:
  - `PluginRegistry.createContext()` injects `settings: registry.settingsStore.createAccessor(manifest.id)` for every plugin with no guard on `manifest.settingsSchema` in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L395) through [src/plugin/PluginRegistry.ts#L449).
  - The settings store only registers schemas when `manifest.settingsSchema` exists in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L167) through [src/plugin/PluginRegistry.ts#L169).
  - That accessor is only partially usable without a schema: `get()` falls through to `undefined`, `getAll()` returns an empty object, but `set()` throws `No settings schema registered for plugin ...` in [src/plugin/PluginSettingsStore.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginSettingsStore.ts#L110) through [src/plugin/PluginSettingsStore.ts#L114), [src/plugin/PluginSettingsStore.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginSettingsStore.ts#L129) through [src/plugin/PluginSettingsStore.ts#L131), and [src/plugin/PluginSettingsStore.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginSettingsStore.ts#L260) through [src/plugin/PluginSettingsStore.ts#L276).
  - The published API docs describe `context.settings` as requiring a `settingsSchema` in the manifest in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L129), but the runtime still exposes it unconditionally.
- Impact:
  - Plugin authors can reasonably treat `context.settings` as a supported capability because it is always present, then hit runtime-only failures on first write if their plugin has no schema.
  - That makes the plugin context harder to reason about than either alternative: omitting `settings` entirely when unsupported, or making it fully no-op and explicit.

### 562. The published plugin-settings API still claims `set()` is `void` and always persists, hiding the real success/failure signal from plugin authors

- Severity: Medium
- Area: Plugin API documentation / settings persistence
- Evidence:
  - The real `PluginSettingsAccessor` contract defines `set(key, value): boolean` and documents that it returns `true` when persisted and `false` when the update only landed in memory in [src/plugin/PluginSettingsStore.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginSettingsStore.ts#L49) through [src/plugin/PluginSettingsStore.ts#L58).
  - The generated API reference still publishes `set(key: string, value: unknown): void` and says it “persists to localStorage” in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L136) through [docs/api/index.md#L141).
  - The main scripting guide makes the same unconditional persistence claim and shows `context.settings.set(...)` without any returned status handling in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L403) through [docs/advanced/scripting-api.md#L443).
  - The runtime already has a real failure mode where settings updates can remain in-memory only, which is why the boolean exists in the first place, as captured in issue `211`.
- Impact:
  - Plugin authors reading the shipped docs can conclude there is no reason to check for persistence failure, even though the live API was explicitly designed to report it.
  - That turns the existing partial-persistence behavior into a documentation trap instead of a documented recovery path.

### 563. The generated API reference is pinned to an old GitHub commit, so its “Defined in” links can disagree with the checked-in source tree

- Severity: Medium
- Area: API documentation / source traceability
- Evidence:
  - The current checkout is at commit `947e3067bd8fb58079981ef7fc78d98ca117799f`.
  - `docs/api/index.md` still points every “Defined in” source link at GitHub blob `c0dd53144dcb872c686e6581e476322380198403`, for example in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L40) through [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L50) and [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L131) through [docs/api/index.md#L162).
  - The same generated page is already drifting from the live tree in content, such as the stale `OpenRVEventName` union documented there versus the current source, as captured in issue `556`.
- Impact:
  - A reader following the generated reference can land on a different historical version of the code than the one actually shipped in the repo.
  - That makes the API docs harder to audit and amplifies other documentation drift because the linked source is itself frozen at an older snapshot.

## Validation Notes

- `pnpm typecheck`: passed
- `pnpm lint`: failed
- `pnpm build`: failed under the current `pnpm` Node runtime
- Targeted Chromium init/layout/mobile checks: passed
- Smoke subset: reproduced `WORKFLOW-001`, `HG-E002`, and `HG-E003`
- Browser spot-check: pressing `G` in QC opens goto-frame instead of the gamut diagram
- Browser spot-check: `Shift+R` / `Shift+B` / `Shift+N` do not activate red / blue / none channel selection
- Browser spot-check: `Shift+L` on Color opens the LUT pipeline panel instead of switching to luminance
- Browser spot-check: `Shift+G` and `Shift+A` still work, so the channel shortcut breakage is selective rather than universal
- Isolated reruns of `CS-030`, `EXR-011`, and `SEQ-012`: passed
