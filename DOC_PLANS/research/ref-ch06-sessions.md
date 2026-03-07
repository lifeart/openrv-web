# OpenRV Reference Chapter 6: Sessions -- Research Notes

## Source
- URL: https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-reference-manual/rv-reference-manual-chapter-six.md
- License: Apache 2.0

## Key Concepts to Reuse

### GTO File Format
- RV session files (.rv) are text-based GTO files
- GTO = open-source format for "arbitrary data -- mostly for use in computer graphics applications"
- Header: `GTOa (3)` indicates text format, version 3
- Three variants: text (UTF-8/ASCII), binary, compressed binary
- Text is default; compressed binary used when RVImageSource present

### File Structure
- Files comprise **objects** containing **components** containing **properties**
- Objects are not arbitrarily connected -- RV determines connections internally
- Object order within files is irrelevant

### Core Session Objects

**RVSession** (one per file, named "rv"):
- Frame ranges, marked frames, playback FPS, realtime mode
- `session.viewNode` - default viewing node
- `session.marks` - marked frame array
- `session.range` - frame range boundaries (int[2])
- `session.fps` - playback FPS (float)
- `session.realtime` - playback mode flag (int 0/1)

**RVFileSource**:
- `media.movie` - file path(s) (string or string array)
- Multiple instances within RVSourceGroup objects
- Supports single file or array (image sequences with audio)

**Group Nodes**: RVLayoutGroup, RVFolderGroup, RVSwitchGroup, RVSourceGroup, RVRetimeGroup, RVStackGroup, RVDisplayGroup, RVSequenceGroup

**RVColor** (member of RVSourceGroup):
- Color adjustments and LUT files per source

**RVFormat / RVChannelMap**: Within RVSourceGroup

**RVDisplayColor** (one per file, within RVDisplayGroup):
- Monitor gamma, display LUT references, LUT data

**Connections Object** (must be named "connections"):
- Stores relationships between top-level group nodes
- Structure: `evaluation { string lhs = [...]; string rhs = [...] }` and `top { string nodes = [...] }`
- lhs = connection origins, rhs = destinations

**RVOverlay**: Burned-in metadata rendering (rectangles, text)

### Naming Conventions
- RVDisplayGroup: must be named "displayGroup"
- RVFileSourceGroup: named `sourceGroupXXXXXX` (6-digit zero-padded)
- Connection object: must be named "connections"
- RVSession: any name, traditionally "rv"
- Group members: pattern `groupName_nodeName`
- User-visible names: `ui.name` string property on group nodes

### Property Types
- String: file paths, LUT references, object names
- Float: FPS, volume, audio offset, gamma, positions
- Integer: frame ranges, activation flags, booleans
- Float array: color vectors [R G B], matrices, coordinates
- Integer array: frame ranges, marked frame lists

### Key Properties
- `group.fps` - source framerate (0 = derive from media)
- `group.volume` - audio amplitude
- `group.audioOffset` - audio slip in seconds
- `cut.in / cut.out` - frame trim points
- `media.movie` - media file reference(s)

### Loading Behavior
- RV auto-generates missing objects (minimal files work)
- Properties omitted retain defaults or function-assigned values
- A file with just one RVFileSource triggers creation of all defaults
- Frame ranges should generally be omitted to let RV derive from media

### Saving
- RV outputs all objects by default
- Best practice: include only necessary info for forward compatibility
- Session file properties override function-assigned values

### EDL in Sessions
- RVSequenceGroup contains RVSequence member with edit lists
- autoEDL=1 for automatic generation, autoEDL=0 for manual
- Manual EDL: matrix with frame positions, source indices, in/out points

### Minimal Session Example
```
GTOa (3)
sourceGroup000000_source : RVFileSource (0)
{
    media { string movie = "test.mov" }
}
```

## What Does NOT Apply to OpenRV Web
- GTO file format (web does not use session files)
- Session save/load to disk
- RVOverlay burned-in metadata
- Audio synchronization model (audio slip, volume per source)
- Connection registry object format
- autoEDL / manual EDL matrix format
- Compressed binary GTO
- Object naming conventions (sourceGroupXXXXXX pattern)
- Frame range / marked frames session state
- RVRetimeGroup, RVFolderGroup, RVSwitchGroup

## Adaptation Notes
- The concept of session state (what's loaded, what settings are active) could map to a JSON-based web session format
- Property types (string, float, int, float array) map to standard JSON types
- The minimal-file approach (auto-generate defaults) is a good pattern for web: specify only what differs from defaults
- The media reference model (`media.movie` pointing to files) maps to URL-based media references in web
- Connection topology could be represented as a simple JSON adjacency list if needed
- The `ui.name` concept (user-visible name vs internal ID) is useful for any web session format
- Cut in/out points map to video trimming in the web player
