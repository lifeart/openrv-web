/**
 * Factory for the AnalysisControlGroup.
 *
 * Histogram, Waveform, and Vectorscope are lazy-created on first access
 * to avoid unnecessary GPU resource allocation.
 */
import { ScopesControl } from '../../ui/components/ScopesControl';
import { SafeAreasControl } from '../../ui/components/SafeAreasControl';
import { FalseColorControl } from '../../ui/components/FalseColorControl';
import { LuminanceVisualizationControl } from '../../ui/components/LuminanceVisualizationControl';
import { ToneMappingControl } from '../../ui/components/ToneMappingControl';
import { ZebraControl } from '../../ui/components/ZebraControl';
import { HSLQualifierControl } from '../../ui/components/HSLQualifierControl';
import { GamutMappingControl } from '../../ui/components/GamutMappingControl';
import { Histogram } from '../../ui/components/Histogram';
import { Waveform } from '../../ui/components/Waveform';
import { Vectorscope } from '../../ui/components/Vectorscope';
import { GamutDiagram } from '../../ui/components/GamutDiagram';
import type { AnalysisControlGroup } from './ControlGroups';
import type { Viewer } from '../../ui/components/Viewer';
import type { DisplayCapabilities } from '../../color/DisplayCapabilities';

export interface AnalysisControlDeps {
  viewer: Viewer;
  displayCapabilities: DisplayCapabilities;
}

/**
 * Extended return type that includes disposal helpers for the lazy scopes.
 */
export interface AnalysisControlGroupInternal extends AnalysisControlGroup {
  /** Dispose lazy-created scopes (histogram, waveform, vectorscope) if they were accessed. */
  disposeLazyScopes(): void;
  /** Returns true if the private _histogram has been created. */
  isHistogramCreated(): boolean;
  /** Returns true if the private _waveform has been created. */
  isWaveformCreated(): boolean;
  /** Returns true if the private _vectorscope has been created. */
  isVectorscopeCreated(): boolean;
}

export function createAnalysisControls(deps: AnalysisControlDeps): AnalysisControlGroupInternal {
  const { viewer, displayCapabilities } = deps;

  // Eager controls
  const scopesControl = new ScopesControl();
  const safeAreasControl = new SafeAreasControl(viewer.getSafeAreasOverlay());
  const falseColorControl = new FalseColorControl(viewer.getFalseColor());
  const luminanceVisControl = new LuminanceVisualizationControl(viewer.getLuminanceVisualization());
  const toneMappingControl = new ToneMappingControl(displayCapabilities);
  const zebraControl = new ZebraControl(viewer.getZebraStripes());
  const hslQualifierControl = new HSLQualifierControl(viewer.getHSLQualifier());
  const gamutMappingControl = new GamutMappingControl();
  const gamutDiagram = new GamutDiagram();

  // Lazy scopes
  let _histogram: Histogram | null = null;
  let _waveform: Waveform | null = null;
  let _vectorscope: Vectorscope | null = null;

  return {
    scopesControl,
    safeAreasControl,
    falseColorControl,
    luminanceVisControl,
    toneMappingControl,
    zebraControl,
    hslQualifierControl,
    gamutMappingControl,
    gamutDiagram,

    get histogram(): Histogram {
      if (!_histogram) {
        _histogram = new Histogram();
      }
      return _histogram;
    },

    get waveform(): Waveform {
      if (!_waveform) {
        _waveform = new Waveform();
      }
      return _waveform;
    },

    get vectorscope(): Vectorscope {
      if (!_vectorscope) {
        _vectorscope = new Vectorscope();
      }
      return _vectorscope;
    },

    disposeLazyScopes() {
      _histogram?.dispose();
      _waveform?.dispose();
      _vectorscope?.dispose();
    },

    isHistogramCreated() {
      return _histogram !== null;
    },

    isWaveformCreated() {
      return _waveform !== null;
    },

    isVectorscopeCreated() {
      return _vectorscope !== null;
    },
  };
}
