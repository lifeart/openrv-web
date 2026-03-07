# openrv-web

## Classes

- [AudioAPI](classes/AudioAPI.md)
- [ColorAPI](classes/ColorAPI.md)
- [EventsAPI](classes/EventsAPI.md)
- [LoopAPI](classes/LoopAPI.md)
- [MarkersAPI](classes/MarkersAPI.md)
- [MediaAPI](classes/MediaAPI.md)
- [OpenRVAPI](classes/OpenRVAPI.md)
- [PlaybackAPI](classes/PlaybackAPI.md)
- [ViewAPI](classes/ViewAPI.md)

## Interfaces

- [BlendModeContribution](interfaces/BlendModeContribution.md)
- [CDLProvider](interfaces/CDLProvider.md)
- [ColorAdjustmentProvider](interfaces/ColorAdjustmentProvider.md)
- [CurvesProvider](interfaces/CurvesProvider.md)
- [MarkerInfo](interfaces/MarkerInfo.md)
- [OpenRVAPIConfig](interfaces/OpenRVAPIConfig.md)
- [OpenRVEventData](interfaces/OpenRVEventData.md)
- [Plugin](interfaces/Plugin.md)
- [PluginContext](interfaces/PluginContext.md)
- [PluginManifest](interfaces/PluginManifest.md)
- [PublicColorAdjustments](interfaces/PublicColorAdjustments.md)
- [PublicColorCurvesData](interfaces/PublicColorCurvesData.md)
- [PublicColorCurvesUpdate](interfaces/PublicColorCurvesUpdate.md)
- [SourceInfo](interfaces/SourceInfo.md)
- [UIPanelContribution](interfaces/UIPanelContribution.md)
- [ViewerProvider](interfaces/ViewerProvider.md)

## Type Aliases

### ExporterContribution

> **ExporterContribution** = `BlobExporterContribution` \| `TextExporterContribution`

Defined in: [plugin/types.ts:178](https://github.com/lifeart/openrv-web/blob/1a639a6456288bd6da9a39eeb935d000c0167630/src/plugin/types.ts#L178)

Union of all exporter contribution types

***

### OpenRVEventName

> **OpenRVEventName** = `"frameChange"` \| `"play"` \| `"pause"` \| `"stop"` \| `"speedChange"` \| `"volumeChange"` \| `"muteChange"` \| `"audioScrubEnabledChange"` \| `"loopModeChange"` \| `"inOutChange"` \| `"markerChange"` \| `"sourceLoaded"` \| `"error"`

Defined in: [api/EventsAPI.ts:15](https://github.com/lifeart/openrv-web/blob/1a639a6456288bd6da9a39eeb935d000c0167630/src/api/EventsAPI.ts#L15)

Events that can be subscribed to via the public API

***

### PluginContributionType

> **PluginContributionType** = `"decoder"` \| `"node"` \| `"processor"` \| `"tool"` \| `"exporter"` \| `"blendMode"` \| `"uiPanel"`

Defined in: [plugin/types.ts:44](https://github.com/lifeart/openrv-web/blob/1a639a6456288bd6da9a39eeb935d000c0167630/src/plugin/types.ts#L44)

***

### PluginId

> **PluginId** = `string`

Defined in: [plugin/types.ts:17](https://github.com/lifeart/openrv-web/blob/1a639a6456288bd6da9a39eeb935d000c0167630/src/plugin/types.ts#L17)

Unique plugin identifier, reverse-domain style: "com.example.myformat"

***

### PluginState

> **PluginState** = `"registered"` \| `"initialized"` \| `"active"` \| `"inactive"` \| `"disposed"` \| `"error"`

Defined in: [plugin/types.ts:57](https://github.com/lifeart/openrv-web/blob/1a639a6456288bd6da9a39eeb935d000c0167630/src/plugin/types.ts#L57)
