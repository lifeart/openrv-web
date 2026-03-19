# Review Workflow

OpenRV Web supports structured review workflows for visual effects, animation, and post-production teams. The review tools cover shot status tracking, version management, a notes system, dailies reports, and dedicated presentation modes for client and internal review.

---

## Shot Status Tracking

Each media source loaded into OpenRV Web can be assigned a status that reflects its position in the review pipeline. Status tracking provides a clear, at-a-glance indication of whether a shot is approved, needs revision, or is still in progress.

### Status Values

| Status | Code | Color | Meaning |
|--------|------|-------|---------|
| Pending | `pending` | Gray | Not yet reviewed |
| In Review | `in-review` | Blue | Currently being evaluated |
| Approved | `approved` | Green | Accepted for delivery or next stage |
| Revisions Needed | `needs-work` | Orange | Feedback provided, artist needs to address notes |
| Could Be Better | `cbb` | Yellow | Acceptable but could be improved |
| Final | `final` | Gold | Locked, no further changes expected |
| On Hold | `on-hold` | Red | Work paused, awaiting decision |
| Omit | `omit` | Slate | Excluded from delivery |

Status is assigned from the Review panel or via the context menu on a source. When connected to ShotGrid or another production tracking system, status changes are propagated automatically.

### Status in the UI

The current shot status is displayed as a colored badge in the header bar next to the source name. The badge updates immediately when the status is changed. During playlist playback, the status badge reflects the status of the currently visible clip.

---

## Version Management

VFX shots typically go through multiple versions (v001, v002, v003, etc.) before reaching final approval. OpenRV Web provides tools for organizing and comparing versions efficiently.

### Loading Versions

When a file follows standard versioning naming conventions (e.g., `shot_010_comp_v003.exr`), OpenRV Web detects the version pattern and offers:

- **Version navigation**: Step forward or backward through available versions using the version selector in the header bar
- **Version list**: A dropdown showing all detected versions for the current shot, with quick-load buttons
- **Latest version indicator**: A badge highlighting when a newer version exists than the one currently loaded

### Comparing Versions

Load two versions of the same shot as A/B sources and use the comparison tools (wipe, split screen, difference matte, flicker) to evaluate changes between versions. The version labels appear in the comparison overlay to identify which version is on each side.

### Version Metadata

Each version carries metadata that is displayed in the info panel:

- Version number
- Creation date and time
- Artist name (from file metadata or ShotGrid)
- Render time (from EXR metadata headers)
- Frame range and resolution

---

## Notes System

The notes system provides a structured way to capture review feedback tied to specific frames, frame ranges, or the overall shot.

### Creating Notes

1. Navigate to the frame where the issue is visible
2. Press `M` to add a marker, or open the Notes panel
3. Enter the note text describing the feedback
4. Optionally assign a priority (low, medium, high, critical) and category (comp, lighting, anim, roto, paint, editorial)

Notes with frame ranges can be created by setting a start and end frame, covering a duration of screen time rather than a single moment.

### Reviewing Notes

The Notes panel lists all notes for the current source, sorted by frame number. Each entry shows:

- Frame number (or range)
- Note text
- Priority indicator
- Category tag
- Author and timestamp

Click any note to navigate to its associated frame. Notes with frame ranges highlight the range on the timeline.

### Exporting Notes

Notes can be exported in several formats:

- **HTML report**: A formatted document with timecodes and note text for distribution to artists and supervisors, viewable in any browser
- **CSV**: Spreadsheet-compatible format for production management and import into tracking systems
- **JSON**: Machine-readable format for session state exchange

---

## Dailies Reports

Dailies are structured review sessions where a supervisor evaluates the day's work across multiple shots. OpenRV Web supports this workflow with dedicated reporting features.

### Running a Dailies Session

1. Load the shots for review as a playlist (see [Playlist Management](playlist.md))
2. Enable the Notes panel and Status panel
3. Step through each shot, adding status updates and notes as needed
4. At the end of the session, generate a dailies report

### Dailies Report Contents

The generated report includes:

- Session date, supervisor name, and project identifier
- Shot-by-shot summary with status, version number, and all notes
- Timecodes and frame ranges for each clip
- Statistics: total shots reviewed, approval rate, revision counts by category

Reports are exported as HTML or CSV for distribution to the production team.

---

## Client Mode

Client mode simplifies the OpenRV Web interface for external stakeholders who need to review content without being exposed to the full toolset.

### What Changes in Client Mode

- All color correction controls are hidden
- Scope panels (histogram, waveform, vectorscope) are disabled
- Filter and transform controls are removed
- The annotation tools are available but limited to basic shapes and text
- Status options are reduced to Approved / Revisions Needed / Pending
- The Notes panel is available for feedback entry
- Playback controls remain fully functional

### Activating Client Mode

Enable client mode from the Settings panel or by appending `?mode=client` to the application URL. Client mode can be pre-configured for shared review links so that external reviewers receive a streamlined experience without manual setup.

---

## Presentation Mode

Presentation mode maximizes the viewer area by hiding all toolbars, panels, and UI chrome. This mode is designed for screening rooms, projection setups, and formal review sessions where the image should fill the display.

### Entering Presentation Mode

Press `F` for fullscreen mode, then press `Ctrl+Shift+P` to activate presentation mode. Alternatively, select **Presentation Mode** from the View tab in the toolbar.

In presentation mode:

- All toolbars and panels are hidden
- The viewer fills the entire browser window (or physical display in fullscreen)
- Mouse cursor hides automatically after 3 seconds of inactivity
- Playback controls are accessible via keyboard shortcuts only

### Exiting Presentation Mode

Press `Escape` or `Ctrl+Shift+P` to return to the normal interface. All previously open panels and toolbars are restored to their prior state.

---

## External Presentation

For remote reviews and client presentations, OpenRV Web supports sharing the viewer output to external participants through several methods:

### Secondary Browser Window

OpenRV Web can open a secondary browser window via the BroadcastChannel API. The secondary window displays text-only status information (frame number, playback state, and color setting values) synchronized with the primary window. It does not render the actual viewer image or mirror the rendered frame. This is useful for dual-monitor setups where a supervisor needs metadata visibility on a second screen while the review UI runs on the primary display. The secondary window updates are same-origin and require no network connection. Full viewer mirroring is tracked in issue #29.

### Screen Sharing

The browser tab running OpenRV Web can be shared through any screen-sharing application (Zoom, Teams, Google Meet, etc.). Presentation mode provides a clean, chrome-free view suitable for screen capture.

### Network Sync Sessions

For higher-fidelity remote reviews, use the [Network Sync](network-sync.md) feature to create a synchronized viewing session where all participants see the same content at the same frame, with independent local rendering quality.

### Exported Review Packages

Generate a self-contained review package that can be shared with external participants:

- A pre-rendered video file with frameburn overlay (timecode, shot name)
- An accompanying PDF report with notes and status
- A link to the OpenRV Web session for interactive review (if network access permits)

---

## Related Pages

- [Playlist Management](playlist.md) -- Building playlists for dailies sessions
- [Network Sync](network-sync.md) -- Collaborative remote review
- [DCC Integration](dcc-integration.md) -- ShotGrid and DCC application bridges
- [Overlays and Guides](overlays.md) -- Timecode, watermark, and bug overlays for review
- [Session Management](session-management.md) -- Saving review session state
- [Scripting API](scripting-api.md) -- Automating review workflows
- [Shape Tools](../annotations/shapes.md) -- Annotate shots during review
- [Exporting Annotations](../annotations/export.md) -- Export review annotations as JSON or PDF
