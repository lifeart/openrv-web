/**
 * OCIOPresets - Workflow presets for common camera-to-display pipelines.
 *
 * Each preset configures the full OCIO pipeline (config, input, working,
 * display, view, look) with a single click. Presets are grouped by category.
 */

/**
 * A workflow preset that configures the full OCIO pipeline
 */
export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  category: 'camera' | 'aces' | 'display' | 'hdr';
  state: {
    configName: string;
    inputColorSpace: string;
    workingColorSpace: string;
    display: string;
    view: string;
    look: string;
  };
}

/**
 * Built-in workflow presets
 */
export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: 'arri-logc3-709',
    name: 'ARRI LogC3 \u2192 709',
    description: 'ARRI ALEXA LogC3 footage to Rec.709 display via ACES',
    category: 'camera',
    state: {
      configName: 'aces_1.2',
      inputColorSpace: 'ARRI LogC3 (EI 800)',
      workingColorSpace: 'ACEScg',
      display: 'Rec.709',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
    },
  },
  {
    id: 'arri-logc4-709',
    name: 'ARRI LogC4 \u2192 709',
    description: 'ARRI ALEXA 35 LogC4 footage to Rec.709 display via ACES',
    category: 'camera',
    state: {
      configName: 'aces_1.2',
      inputColorSpace: 'ARRI LogC4',
      workingColorSpace: 'ACEScg',
      display: 'Rec.709',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
    },
  },
  {
    id: 'sony-slog3-709',
    name: 'S-Log3 \u2192 709',
    description: 'Sony S-Log3 footage to Rec.709 display via ACES',
    category: 'camera',
    state: {
      configName: 'aces_1.2',
      inputColorSpace: 'Sony S-Log3',
      workingColorSpace: 'ACEScg',
      display: 'Rec.709',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
    },
  },
  {
    id: 'red-log3g10-709',
    name: 'RED Log \u2192 709',
    description: 'RED Log3G10 footage to Rec.709 display via ACES',
    category: 'camera',
    state: {
      configName: 'aces_1.2',
      inputColorSpace: 'RED Log3G10',
      workingColorSpace: 'ACEScg',
      display: 'Rec.709',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
    },
  },
  {
    id: 'acescct-srgb',
    name: 'ACEScct \u2192 sRGB',
    description: 'ACEScct grading space to sRGB display via ACES',
    category: 'aces',
    state: {
      configName: 'aces_1.2',
      inputColorSpace: 'ACEScct',
      workingColorSpace: 'ACEScg',
      display: 'sRGB',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
    },
  },
  {
    id: 'linear-srgb',
    name: 'Linear \u2192 sRGB',
    description: 'Linear sRGB to sRGB display (standard gamma)',
    category: 'display',
    state: {
      configName: 'srgb',
      inputColorSpace: 'Linear sRGB',
      workingColorSpace: 'Linear sRGB',
      display: 'sRGB',
      view: 'Standard',
      look: 'None',
    },
  },
  {
    id: 'rec2020-srgb',
    name: 'Rec.2020 \u2192 sRGB',
    description: 'Rec.2020 wide gamut to sRGB display via ACES',
    category: 'display',
    state: {
      configName: 'aces_1.2',
      inputColorSpace: 'Rec.2020',
      workingColorSpace: 'ACEScg',
      display: 'sRGB',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
    },
  },
  {
    id: 'dcip3-srgb',
    name: 'DCI-P3 \u2192 sRGB',
    description: 'DCI-P3 cinema gamut to sRGB display via ACES',
    category: 'display',
    state: {
      configName: 'aces_1.2',
      inputColorSpace: 'DCI-P3',
      workingColorSpace: 'ACEScg',
      display: 'sRGB',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
    },
  },
  // --- HDR presets ---
  {
    id: 'arri-logc3-p3',
    name: 'LogC3 \u2192 P3',
    description: 'ARRI ALEXA LogC3 to DCI-P3 wide gamut display via ACES',
    category: 'hdr',
    state: {
      configName: 'aces_1.2',
      inputColorSpace: 'ARRI LogC3 (EI 800)',
      workingColorSpace: 'ACEScg',
      display: 'DCI-P3',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
    },
  },
  {
    id: 'arri-logc4-rec2020',
    name: 'LogC4 \u2192 2020',
    description: 'ARRI ALEXA 35 LogC4 to Rec.2020 wide gamut display via ACES',
    category: 'hdr',
    state: {
      configName: 'aces_1.2',
      inputColorSpace: 'ARRI LogC4',
      workingColorSpace: 'ACEScg',
      display: 'Rec.2020',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
    },
  },
  {
    id: 'slog3-p3',
    name: 'S-Log3 \u2192 P3',
    description: 'Sony S-Log3 to DCI-P3 wide gamut display via ACES',
    category: 'hdr',
    state: {
      configName: 'aces_1.2',
      inputColorSpace: 'Sony S-Log3',
      workingColorSpace: 'ACEScg',
      display: 'DCI-P3',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
    },
  },
  {
    id: 'rec2020-p3',
    name: 'Rec.2020 \u2192 P3',
    description: 'Rec.2020 wide gamut to DCI-P3 display via ACES',
    category: 'hdr',
    state: {
      configName: 'aces_1.2',
      inputColorSpace: 'Rec.2020',
      workingColorSpace: 'ACEScg',
      display: 'DCI-P3',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
    },
  },
];

/**
 * Get presets filtered by category
 */
export function getPresetsByCategory(category: WorkflowPreset['category']): WorkflowPreset[] {
  return WORKFLOW_PRESETS.filter((p) => p.category === category);
}

/**
 * Get a preset by its ID
 */
export function getPresetById(id: string): WorkflowPreset | undefined {
  return WORKFLOW_PRESETS.find((p) => p.id === id);
}
