# EDL and OTIO

OpenRV Web supports exporting Edit Decision Lists (EDL) in CMX 3600 format and importing OpenTimelineIO (OTIO) editorial timelines. These features bridge OpenRV Web with editorial and conform workflows.

## EDL Export (CMX 3600)

Export the current playlist as an EDL file from the Playlist panel or the Export menu.

### Format

The exported EDL uses the CMX 3600 standard format:

```
TITLE: OpenRV Playlist
FCM: NON-DROP FRAME

001  SourceA  V     C        00:00:00:01 00:00:04:01 00:00:00:01 00:00:04:01
* FROM CLIP NAME: SourceA

002  SourceB  V     C        00:00:00:01 00:00:02:01 00:00:04:01 00:00:06:01
* FROM CLIP NAME: SourceB
```

### Timecode

Timecodes use the SMPTE format (HH:MM:SS:FF) at the session frame rate (default 24 fps). Each entry includes:

- **Source in/out** -- the frame range within the source clip
- **Record in/out** -- the position in the output timeline

### Drop Frame Support

The EDL writer supports drop-frame timecode for frame rates that require it (29.97 fps). Non-drop frame is the default.

### How to Export

1. Open the Playlist panel (`Shift+Alt+P`)
2. Add clips to the playlist using "Add Current"
3. Configure in/out points for each clip
4. Click the EDL export button (download icon) in the panel footer
5. The EDL file downloads to the browser

## OTIO Import

OpenTimelineIO (OTIO) files can be imported to reconstruct editorial timelines within OpenRV Web.

### Supported OTIO Elements

| Element | Support |
|---------|---------|
| Clips | Imported with source references |
| Gaps | Recognized as empty regions |
| Transitions | Recognized (visual transition not applied) |
| Markers | Imported as timeline markers |
| Metadata | Preserved for display |

### Import Process

1. Load an OTIO file through the file picker or drag and drop
2. OpenRV Web parses the timeline structure
3. Clips are mapped to available media sources

### Conform / Re-link Panel

When OTIO clips reference media files that are not yet loaded, the Conform/Re-link panel appears. This panel allows:

- Viewing unresolved media references
- Selecting replacement files from the local filesystem
- Fuzzy filename matching to suggest likely matches
- Skipping unresolved references

Once media is re-linked, the timeline plays back with the correct content at the specified frame ranges.

## Dailies Reports

The Report Exporter generates review session reports in CSV and HTML formats. Reports include:

| Field | Description |
|-------|-------------|
| Shot name | Clip or source identifier |
| Status | Per-source review status (pending, approved, needs-work, etc.) |
| Notes | Review notes and comments |
| Version info | Version number and history |
| Frame range | In/out points for each clip |
| Timecodes | SMPTE timecodes for each clip |

### Exporting Reports

Reports are available from the Export menu:

- **CSV** -- tabular data suitable for import into spreadsheets or production tracking tools
- **HTML** -- formatted report suitable for printing or sharing via email

## Playlist Integration

EDL export and OTIO import are tightly integrated with the Playlist Manager. The playlist stores clips with source indices, in/out points, and global timeline positions. The EDL writer serializes this data, and the OTIO importer creates playlist entries from the imported timeline.

---

## Related Pages

- [Frame Export](frame-export.md) -- export individual frames
- [Video Export](video-export.md) -- encode video files
- [Sessions](sessions.md) -- save and load full project state
