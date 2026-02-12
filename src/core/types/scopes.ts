export type ScopeType = 'histogram' | 'waveform' | 'vectorscope';

export interface ScopesState {
  histogram: boolean;
  waveform: boolean;
  vectorscope: boolean;
}
