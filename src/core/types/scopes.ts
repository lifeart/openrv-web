export type ScopeType = 'histogram' | 'waveform' | 'vectorscope' | 'gamutDiagram';

export interface ScopesState {
  histogram: boolean;
  waveform: boolean;
  vectorscope: boolean;
  gamutDiagram: boolean;
}
