/**
 * Control group interfaces for AppControlRegistry decomposition.
 *
 * Each interface groups related UI controls by domain. The AppControlRegistry
 * composes these groups internally and exposes permanent compatibility getters
 * for every original property.
 */

import type { ColorControls } from '../../ui/components/ColorControls';
import type { ColorInversionToggle } from '../../ui/components/ColorInversionToggle';
import type { PremultControl } from '../../ui/components/PremultControl';
import type { CDLControl } from '../../ui/components/CDLControl';
import type { CurvesControl } from '../../ui/components/CurvesControl';
import type { OCIOControl } from '../../ui/components/OCIOControl';
import type { LUTPipelinePanel } from '../../ui/components/LUTPipelinePanel';

import type { ZoomControl } from '../../ui/components/ZoomControl';
import type { ChannelSelect } from '../../ui/components/ChannelSelect';
import type { CompareControl } from '../../ui/components/CompareControl';
import type { ReferenceManager } from '../../ui/components/ReferenceManager';
import type { StereoControl } from '../../ui/components/StereoControl';
import type { StereoEyeTransformControl } from '../../ui/components/StereoEyeTransformControl';
import type { StereoAlignControl } from '../../ui/components/StereoAlignControl';
import type { GhostFrameControl } from '../../ui/components/GhostFrameControl';
import type { ConvergenceMeasure } from '../../ui/components/ConvergenceMeasure';
import type { FloatingWindowControl } from '../../ui/components/FloatingWindowControl';
import type { SphericalProjection } from '../../render/SphericalProjection';
import type { StackControl } from '../../ui/components/StackControl';
import type { PARControl } from '../../ui/components/PARControl';
import type { BackgroundPatternControl } from '../../ui/components/BackgroundPatternControl';
import type { DisplayProfileControl } from '../../ui/components/DisplayProfileControl';

import type { FilterControl } from '../../ui/components/FilterControl';
import type { SlateEditor } from '../../ui/components/SlateEditor';
import type { LensControl } from '../../ui/components/LensControl';
import type { DeinterlaceControl } from '../../ui/components/DeinterlaceControl';
import type { FilmEmulationControl } from '../../ui/components/FilmEmulationControl';
import type { PerspectiveCorrectionControl } from '../../ui/components/PerspectiveCorrectionControl';
import type { StabilizationControl } from '../../ui/components/StabilizationControl';
import type { NoiseReductionControl } from '../../ui/components/NoiseReductionControl';
import type { WatermarkControl } from '../../ui/components/WatermarkControl';
import type { TimelineEditor } from '../../ui/components/TimelineEditor';

import type { TransformControl } from '../../ui/components/TransformControl';
import type { CropControl } from '../../ui/components/CropControl';

import type { PaintToolbar } from '../../ui/components/PaintToolbar';
import type { TextFormattingToolbar } from '../../ui/components/TextFormattingToolbar';

import type { ScopesControl } from '../../ui/components/ScopesControl';
import type { SafeAreasControl } from '../../ui/components/SafeAreasControl';
import type { FalseColorControl } from '../../ui/components/FalseColorControl';
import type { LuminanceVisualizationControl } from '../../ui/components/LuminanceVisualizationControl';
import type { ToneMappingControl } from '../../ui/components/ToneMappingControl';
import type { ZebraControl } from '../../ui/components/ZebraControl';
import type { HSLQualifierControl } from '../../ui/components/HSLQualifierControl';
import type { GamutMappingControl } from '../../ui/components/GamutMappingControl';
import type { Histogram } from '../../ui/components/Histogram';
import type { Waveform } from '../../ui/components/Waveform';
import type { Vectorscope } from '../../ui/components/Vectorscope';
import type { GamutDiagram } from '../../ui/components/GamutDiagram';

import type { HistoryPanel } from '../../ui/components/HistoryPanel';
import type { InfoPanel } from '../../ui/components/InfoPanel';
import type { MarkerListPanel } from '../../ui/components/MarkerListPanel';
import type { NotePanel } from '../../ui/components/NotePanel';
import type { RightPanelContent } from '../../ui/layout/panels/RightPanelContent';
import type { LeftPanelContent } from '../../ui/layout/panels/LeftPanelContent';
import type { CacheIndicator } from '../../ui/components/CacheIndicator';
import type { SnapshotPanel } from '../../ui/components/SnapshotPanel';
import type { PlaylistPanel } from '../../ui/components/PlaylistPanel';
import type { ShotGridConfigUI } from '../../integrations/ShotGridConfig';
import type { ShotGridPanel } from '../../ui/components/ShotGridPanel';
import type { ConformPanel } from '../../ui/components/ConformPanel';

import type { AutoSaveManager } from '../../core/session/AutoSaveManager';
import type { AutoSaveIndicator } from '../../ui/components/AutoSaveIndicator';
import type { SnapshotManager } from '../../core/session/SnapshotManager';
import type { PlaylistManager } from '../../core/session/PlaylistManager';
import type { TransitionManager } from '../../core/session/TransitionManager';
import type { PresentationMode } from '../../utils/ui/PresentationMode';
import type { NetworkSyncManager } from '../../network/NetworkSyncManager';
import type { NetworkControl } from '../../ui/components/NetworkControl';

/** Color-related controls: color grading, CDL, curves, OCIO, LUT pipeline. */
export interface ColorControlGroup {
  readonly colorControls: ColorControls;
  readonly colorInversionToggle: ColorInversionToggle;
  readonly premultControl: PremultControl;
  readonly cdlControl: CDLControl;
  readonly curvesControl: CurvesControl;
  readonly ocioControl: OCIOControl;
  readonly lutPipelinePanel: LUTPipelinePanel;
}

/** View/zoom/compare/stereo controls. */
export interface ViewControlGroup {
  readonly zoomControl: ZoomControl;
  readonly channelSelect: ChannelSelect;
  readonly compareControl: CompareControl;
  readonly referenceManager: ReferenceManager;
  readonly stereoControl: StereoControl;
  readonly stereoEyeTransformControl: StereoEyeTransformControl;
  readonly stereoAlignControl: StereoAlignControl;
  readonly ghostFrameControl: GhostFrameControl;
  readonly convergenceMeasure: ConvergenceMeasure;
  readonly floatingWindowControl: FloatingWindowControl;
  readonly sphericalProjection: SphericalProjection;
  readonly stackControl: StackControl;
  readonly parControl: PARControl;
  readonly backgroundPatternControl: BackgroundPatternControl;
  readonly displayProfileControl: DisplayProfileControl;
}

/** Filter/lens/deinterlace/effects controls. */
export interface EffectsControlGroup {
  readonly filterControl: FilterControl;
  readonly slateEditor: SlateEditor;
  readonly lensControl: LensControl;
  readonly deinterlaceControl: DeinterlaceControl;
  readonly filmEmulationControl: FilmEmulationControl;
  readonly perspectiveCorrectionControl: PerspectiveCorrectionControl;
  readonly stabilizationControl: StabilizationControl;
  readonly noiseReductionControl: NoiseReductionControl;
  readonly watermarkControl: WatermarkControl;
  readonly timelineEditor: TimelineEditor;
}

/** Transform/crop controls. */
export interface TransformControlGroup {
  readonly transformControl: TransformControl;
  readonly cropControl: CropControl;
}

/** Paint/text toolbar controls. */
export interface AnnotateControlGroup {
  readonly paintToolbar: PaintToolbar;
  readonly textFormattingToolbar: TextFormattingToolbar;
}

/** Scopes/histogram/waveform/vectorscope/analysis controls. */
export interface AnalysisControlGroup {
  readonly scopesControl: ScopesControl;
  readonly safeAreasControl: SafeAreasControl;
  readonly falseColorControl: FalseColorControl;
  readonly luminanceVisControl: LuminanceVisualizationControl;
  readonly toneMappingControl: ToneMappingControl;
  readonly zebraControl: ZebraControl;
  readonly hslQualifierControl: HSLQualifierControl;
  readonly gamutMappingControl: GamutMappingControl;
  readonly gamutDiagram: GamutDiagram;
  /** Lazy-created on first access to avoid unnecessary GPU resource allocation. */
  readonly histogram: Histogram;
  /** Lazy-created on first access to avoid unnecessary GPU resource allocation. */
  readonly waveform: Waveform;
  /** Lazy-created on first access to avoid unnecessary GPU resource allocation. */
  readonly vectorscope: Vectorscope;
}

/** Panels: history, info, marker, note, snapshot, playlist, shotgrid, conform, layout panels. */
export interface PanelControlGroup {
  readonly historyPanel: HistoryPanel;
  readonly infoPanel: InfoPanel;
  readonly markerListPanel: MarkerListPanel;
  readonly notePanel: NotePanel;
  readonly rightPanelContent: RightPanelContent;
  readonly leftPanelContent: LeftPanelContent;
  readonly cacheIndicator: CacheIndicator;
  readonly snapshotPanel: SnapshotPanel;
  readonly playlistPanel: PlaylistPanel;
  readonly shotGridConfig: ShotGridConfigUI;
  readonly shotGridPanel: ShotGridPanel;
  readonly conformPanel: ConformPanel;
}

/** Auto-save, snapshot manager, playlist manager, transitions, network, presentation. */
export interface PlaybackControlGroup {
  readonly autoSaveManager: AutoSaveManager;
  readonly autoSaveIndicator: AutoSaveIndicator;
  readonly snapshotManager: SnapshotManager;
  readonly playlistManager: PlaylistManager;
  readonly transitionManager: TransitionManager;
  readonly presentationMode: PresentationMode;
  readonly networkSyncManager: NetworkSyncManager;
  readonly networkControl: NetworkControl;
}
