# OpenRV Reference Chapter 2: DAG/Nodes -- Research Notes

## Source
- URL: https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-reference-manual/rv-reference-manual-chapter-two.md
- License: Apache 2.0

## Key Concepts to Reuse

### DAG Concept
- RV uses a **directed acyclic graph (DAG)** as the core architecture
- Each session contains a single DAG determining "how images and audio will be evaluated for display"
- The DAG represents the complete state of an RV session
- "To change anything in RV that affects how an image looks, you must change a property in some node in its DAG"
- The DAG cannot contain cycles (acyclic constraint)
- All visual modifications occur through property adjustments on existing nodes

### Node Types

**Top-Level Group Nodes:**
- **RVSourceGroup**: Encapsulates media sources with three modifiable pipeline groups. Linearizes pixel data, applies color correction, implements looks. Output pixels expected in working space (typically linear).
- **RVLayoutGroup**: Arranges multiple inputs in grids, rows, or columns. Distributes inputs spatially.
- **RVSequenceGroup**: Renders inputs sequentially through time using EDL structure. Contains per-input paint nodes, optional retime nodes for FPS sync.
- **RVStackGroup**: Superimposes inputs with per-input crop control. Paint nodes store annotations after stacking.
- **RVViewGroup**: Applies viewing transforms, final audio destination. Contains insertable pipeline (empty by default) for QC/visualization.
- **RVDisplayGroup**: One per video device. Prepares working-space pixels for display, manages stereo modes via RVDisplayColor node.

**Internal/Member Nodes:**
- **RVFileSource**: Contains media file paths
- **RVImageSource**: Holds raw pixel data (from renderers)
- **RVColor**: Modifies hue, saturation, exposure, contrast
- **RVDisplayColor**: Color correction for display devices
- **RVPaint**: Per-input annotations in sequence/stack groups
- **RVSequence**: EDL structure (input order, frame ranges)
- **RVLinearizePipelineGroup**: Default pipeline with two nodes
- **RVLinearize**, **RVLookPipeline**, **RVSourcePipeline**: Specialized pipeline groups

### Property System

**Fundamentals:**
- Properties are state variables determining node behavior
- "A property is a state variable. The node's properties as a whole determine how the node will change its inputs to produce its outputs."
- ALL properties are arrays, even single-value properties
- Get/set functions work with arrays of numbers

**Three-Part Addressing:** `nodename.componentname.propertyname`
- Direct: `color.color.exposure`
- Type-based: `#RVColor.color.exposure` (all currently active nodes of type)
- Single instance: `@RVDisplayColor.color.brightness` (first node only)

**Typed Access Functions:**
- `setFloatProperty`, `setStringProperty`, etc.
- Type matching mandatory -- incorrect accessors cause failures
- Example: `setFloatProperty("#RVColor.color.exposure", [2.0, 2.0, 2.0], True)`

**User-Defined Properties:**
- `newProperty()` function for custom properties
- Saved in session files
- Used for production metadata and application-specific annotations

### Connection Rules
- Nodes within groups connect exclusively to sibling members
- Top-level nodes connect only to other top-level nodes
- Connections are unidirectional (inputs -> node -> outputs)
- `testNodeInputs()` validates before establishing connections

### Pipeline Groups
- Serialize members into single linear chains
- `pipeline.nodes` property (string array) specifies member types and order
- Modifying this property reconfigures the pipeline dynamically
- All node types except view/display groups are valid pipeline members

### Evaluation Order
- "Active nodes are those which contribute to the rendered view at any given frame"
- **Sequence mode**: One source branch active per frame
- **Stack mode**: All source branches active simultaneously
- **Layout mode**: All inputs process and arrange spatially
- **View Group**: Always active, applies final viewing transforms
- Type-addressed properties (`#RVColor`) affect only active nodes

### Processing Flow
Working-space pixels exit source groups -> traverse layout/sequence/stack -> pass through view group pipelines -> reach display groups for device-specific preparation

### Default Graph Structure
When RV starts with two sources:
- Two RVSourceGroup nodes (one per source)
- One RVLayoutGroup (default layout)
- One RVSequenceGroup (default sequence)
- One RVStackGroup (default stack)
- One RVViewGroup
- One RVDisplayGroup per active display device

### Source Group Internals
- RVFileSource or RVImageSource (media leaf node)
- RVLinearizePipelineGroup (linearization)
- RVSourcePipeline (color management)
- RVLookPipeline (artistic looks)
- Annotation and transform nodes

## What Does NOT Apply to OpenRV Web
- Full DAG architecture with dynamic topology (web has simpler fixed pipeline)
- RVPaint / annotation nodes
- RVSequence / EDL structure
- RVStackGroup compositing
- RVLayoutGroup spatial arrangement
- Multiple RVDisplayGroup per video device
- Progressive source loading with movieProxy
- Session file saving/loading as GTO
- Dynamic pipeline reconfiguration via `pipeline.nodes` property
- `testNodeInputs()` validation
- Type-addressed property syntax (`#`, `@` prefixes)

## Adaptation Notes
- The DAG concept maps loosely to the web version's simpler architecture: FileSourceNode (source) -> IPImage (pixel container) -> Renderer (display)
- The property system concept is valuable: each web component has configurable state that determines output
- The separation of linearization -> color correction -> look -> display is preserved in the web shader pipeline
- RVSourceGroup's three pipeline stages (linearize, color, look) map to the web renderer's shader stages
- The web version's `Renderer.ts` effectively combines RVColor + RVDisplayColor into a single shader
- Node naming and property addressing don't apply (no scripting API in web)
- The concept of "working space" (linear) as the intermediate representation is preserved
- Display group concept maps to the web renderer's output stage (tone mapping, gamma, output mode)
