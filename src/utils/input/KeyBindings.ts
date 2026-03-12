/**
 * Default keyboard shortcuts configuration
 *
 * This file defines all keyboard shortcuts used in the application.
 * Each shortcut maps to an action name that the KeyboardManager will dispatch to.
 */

import { type KeyCombination } from './KeyboardManager';
import type { BindingContext } from './ActiveContextManager';

export interface KeyBindingEntry extends KeyCombination {
  description: string;
  /** The context in which this binding is active. Defaults to 'global'. */
  context?: BindingContext;
}

export interface KeyBindingConfig {
  [action: string]: KeyBindingEntry;
}

export type KeyBindingKeys = keyof typeof DEFAULT_KEY_BINDINGS;

export const DEFAULT_KEY_BINDINGS: KeyBindingConfig = {
  // Playback controls
  'playback.toggle': {
    code: 'Space',
    description: 'Toggle play/pause',
  },
  'playback.stepForward': {
    code: 'ArrowRight',
    description: 'Step forward one frame',
  },
  'playback.stepBackward': {
    code: 'ArrowLeft',
    description: 'Step backward one frame',
  },
  'playback.toggleDirection': {
    code: 'ArrowUp',
    description: 'Toggle play direction',
  },
  'playback.goToStart': {
    code: 'Home',
    description: 'Go to first frame',
  },
  'playback.goToEnd': {
    code: 'End',
    description: 'Go to last frame',
  },

  // Speed controls (JKL system)
  'playback.slower': {
    code: 'KeyJ',
    description: 'Decrease playback speed',
  },
  'playback.stop': {
    code: 'KeyK',
    description: 'Stop playback',
  },
  'playback.faster': {
    code: 'KeyL',
    description: 'Increase playback speed',
  },

  // Timeline controls
  'timeline.setInPoint': {
    code: 'KeyI',
    description: 'Set in point',
  },
  'timeline.setInPointAlt': {
    code: 'BracketLeft',
    description: 'Set in point (alternative)',
  },
  'timeline.setOutPoint': {
    code: 'KeyO',
    context: 'timeline',
    description: 'Set out point',
  },
  'timeline.setOutPointAlt': {
    code: 'BracketRight',
    description: 'Set out point (alternative)',
  },
  'timeline.toggleMark': {
    code: 'KeyM',
    description: 'Toggle mark at current frame',
  },
  'timeline.nextMarkOrBoundary': {
    code: 'ArrowRight',
    alt: true,
    description: 'Go to next mark or source boundary',
  },
  'timeline.previousMarkOrBoundary': {
    code: 'ArrowLeft',
    alt: true,
    description: 'Go to previous mark or source boundary',
  },
  'timeline.nextShot': {
    code: 'PageDown',
    description: 'Go to next shot in playlist',
  },
  'timeline.previousShot': {
    code: 'PageUp',
    description: 'Go to previous shot in playlist',
  },
  'timeline.resetInOut': {
    code: 'KeyR',
    context: 'timeline',
    description: 'Reset in/out points to full range',
  },
  'timeline.cycleLoopMode': {
    code: 'KeyL',
    ctrl: true,
    description: 'Cycle loop mode',
  },
  'timeline.toggleMagnifier': {
    code: 'F3',
    description: 'Toggle timeline magnifier',
  },
  // Range shifting - primary bindings (no OS-level conflicts)
  'timeline.shiftRangeNext': {
    code: 'ArrowDown',
    shift: true,
    description: 'Shift in/out range to next mark pair',
  },
  'timeline.shiftRangePrevious': {
    code: 'ArrowUp',
    shift: true,
    description: 'Shift in/out range to previous mark pair',
  },
  // Range shifting - secondary bindings (note: Ctrl+Arrow conflicts with macOS Spaces)
  'timeline.shiftRangeNextAlt': {
    code: 'ArrowRight',
    ctrl: true,
    description: 'Shift in/out range to next mark pair',
  },
  'timeline.shiftRangePreviousAlt': {
    code: 'ArrowLeft',
    ctrl: true,
    description: 'Shift in/out range to previous mark pair',
  },

  // View controls
  'view.fitToWindow': {
    code: 'KeyF',
    description: 'Fit image to window',
  },
  'view.fitToWindowAlt': {
    code: 'KeyF',
    shift: true,
    description: 'Fit image to window (alternative)',
  },
  'view.zoom50': {
    code: 'Digit0',
    description: 'Zoom to 50% (when on View tab)',
  },
  'view.cycleWipeMode': {
    code: 'KeyW',
    shift: true,
    description: 'Cycle wipe mode',
  },
  'view.fitToWidth': {
    code: 'KeyW',
    description: 'Fit image width to window',
  },
  'view.toggleWaveform': {
    code: 'KeyW',
    description: 'Toggle waveform scope',
  },
  'view.toggleAB': {
    code: 'Backquote',
    description: 'Toggle A/B source compare',
  },
  'view.toggleABAlt': {
    code: 'Backquote',
    shift: true,
    description: 'Toggle A/B source compare (alternative)',
  },
  'view.toggleDifferenceMatte': {
    code: 'KeyD',
    shift: true,
    description: 'Toggle difference matte mode',
  },
  'view.toggleSplitScreen': {
    code: 'KeyS',
    shift: true,
    alt: true,
    description: 'Toggle split screen A/B comparison',
  },

  // Panel toggles
  'panel.color': {
    code: 'KeyC',
    description: 'Toggle color controls panel',
  },
  'panel.effects': {
    code: 'KeyE',
    shift: true,
    alt: true,
    description: 'Toggle effects panel',
  },
  'panel.curves': {
    code: 'KeyU',
    description: 'Toggle curves panel',
  },
  'panel.crop': {
    code: 'KeyK',
    shift: true,
    description: 'Toggle crop mode',
  },
  'panel.waveform': {
    code: 'KeyW',
    ctrl: true,
    shift: true,
    description: 'Toggle waveform scope',
  },
  'panel.vectorscope': {
    code: 'KeyY',
    description: 'Toggle vectorscope',
  },
  'panel.gamutDiagram': {
    code: 'KeyG',
    ctrl: true,
    shift: true,
    description: 'Toggle CIE gamut diagram',
  },
  'view.fitToHeight': {
    code: 'KeyH',
    description: 'Fit image height to window',
  },
  'panel.histogram': {
    code: 'KeyH',
    ctrl: true,
    shift: true,
    description: 'Toggle histogram',
  },
  'panel.ocio': {
    code: 'KeyO',
    shift: true,
    description: 'Toggle OCIO color management panel',
  },

  // Transform controls
  'transform.rotateLeft': {
    code: 'KeyR',
    shift: true,
    context: 'transform',
    description: 'Rotate left 90 degrees',
  },
  'transform.rotateRight': {
    code: 'KeyR',
    alt: true,
    description: 'Rotate right 90 degrees',
  },
  'transform.flipHorizontal': {
    code: 'KeyH',
    alt: true,
    description: 'Flip horizontal',
  },
  'transform.flipVertical': {
    code: 'KeyV',
    shift: true,
    description: 'Flip vertical',
  },
  'transform.resetRotation': {
    code: 'Digit0',
    ctrl: true,
    description: 'Reset rotation to 0',
  },

  // Export controls
  'export.quickExport': {
    code: 'KeyS',
    ctrl: true,
    description: 'Quick export current frame',
  },
  'export.copyFrame': {
    code: 'KeyC',
    ctrl: true,
    description: 'Copy current frame to clipboard',
  },

  // Undo/Redo
  'edit.undo': {
    code: 'KeyZ',
    ctrl: true,
    description: 'Undo last action',
  },
  'edit.redo': {
    code: 'KeyY',
    ctrl: true,
    description: 'Redo last action',
  },
  'edit.redo-alt': {
    code: 'KeyZ',
    ctrl: true,
    shift: true,
    description: 'Redo last action (alternate)',
  },

  // Navigation
  'navigation.gotoFrame': {
    code: 'KeyG',
    description: 'Go to frame (open frame entry)',
  },

  // Annotation navigation
  'annotation.previous': {
    code: 'Comma',
    description: 'Go to previous annotated frame',
  },
  'annotation.next': {
    code: 'Period',
    description: 'Go to next annotated frame',
  },

  // Tab navigation
  'tab.view': {
    code: 'Digit1',
    description: 'Switch to View tab',
  },
  'tab.color': {
    code: 'Digit2',
    description: 'Switch to Color tab',
  },
  'tab.effects': {
    code: 'Digit3',
    description: 'Switch to Effects tab',
  },
  'tab.transform': {
    code: 'Digit4',
    description: 'Switch to Transform tab',
  },
  'tab.annotate': {
    code: 'Digit5',
    description: 'Switch to Annotate tab',
  },
  'tab.qc': {
    code: 'Digit6',
    description: 'Switch to QC tab',
  },

  // Paint tools (handled by PaintToolbar component)
  'paint.pan': {
    code: 'KeyV',
    description: 'Select pan tool',
  },
  'paint.pen': {
    code: 'KeyP',
    description: 'Select pen tool',
  },
  'paint.eraser': {
    code: 'KeyE',
    description: 'Select eraser tool',
  },
  'paint.text': {
    code: 'KeyT',
    description: 'Select text tool',
  },
  'paint.rectangle': {
    code: 'KeyR',
    context: 'paint',
    description: 'Select rectangle tool',
  },
  'paint.ellipse': {
    code: 'KeyO',
    context: 'paint',
    description: 'Select ellipse tool',
  },
  'paint.line': {
    code: 'KeyL',
    description: 'Select line tool',
  },
  'paint.arrow': {
    code: 'KeyA',
    description: 'Select arrow tool',
  },
  'paint.toggleBrush': {
    code: 'KeyB',
    description: 'Toggle brush type',
  },
  'paint.toggleGhost': {
    code: 'KeyG',
    context: 'paint',
    description: 'Toggle ghost mode',
  },
  'view.toggleGhostFrames': {
    code: 'KeyG',
    ctrl: true,
    description: 'Toggle ghost frames (onion skin)',
  },
  'view.togglePAR': {
    code: 'KeyP',
    shift: true,
    description: 'Toggle pixel aspect ratio correction',
  },
  'paint.toggleHold': {
    code: 'KeyX',
    description: 'Toggle hold mode',
  },
  'paint.textBold': {
    code: 'KeyB',
    ctrl: true,
    context: 'paint',
    description: 'Toggle bold on text annotation',
  },
  'paint.textItalic': {
    code: 'KeyI',
    ctrl: true,
    context: 'paint',
    description: 'Toggle italic on text annotation',
  },
  'paint.textUnderline': {
    code: 'KeyU',
    ctrl: true,
    context: 'paint',
    description: 'Toggle underline on text annotation',
  },

  // Channel selection (handled by ChannelSelect component)
  'channel.red': {
    code: 'KeyR',
    shift: true,
    context: 'viewer',
    description: 'Select red channel',
  },
  'channel.green': {
    code: 'KeyG',
    shift: true,
    description: 'Select green channel',
  },
  'channel.blue': {
    code: 'KeyB',
    shift: true,
    description: 'Select blue channel',
  },
  'channel.alpha': {
    code: 'KeyA',
    shift: true,
    description: 'Select alpha channel',
  },
  'channel.luminance': {
    code: 'KeyL',
    shift: true,
    context: 'viewer',
    description: 'Select luminance channel',
  },
  'lut.togglePanel': {
    code: 'KeyL',
    shift: true,
    context: 'global',
    description: 'Toggle LUT pipeline panel',
  },
  'channel.grayscale': {
    code: 'KeyY',
    shift: true,
    description: 'Toggle grayscale mode (alias for luminance)',
  },
  'channel.none': {
    code: 'KeyN',
    shift: true,
    description: 'Select no channel',
  },

  // Stereo controls (handled by StereoControl component)
  'stereo.toggle': {
    code: 'Digit3',
    shift: true,
    description: 'Toggle stereo viewing mode',
  },
  'stereo.eyeTransform': {
    code: 'KeyE',
    shift: true,
    description: 'Toggle per-eye transform panel',
  },
  'stereo.cycleAlign': {
    code: 'Digit4',
    shift: true,
    description: 'Cycle stereo alignment overlay mode',
  },

  // Safe areas / guides
  'view.toggleGuides': {
    code: 'Semicolon',
    description: 'Toggle safe areas and guides overlay',
  },

  'panel.close': {
    code: 'Escape',
    description: 'Close open panels',
  },

  // Pixel probe
  'view.togglePixelProbe': {
    code: 'KeyI',
    shift: true,
    description: 'Toggle pixel color probe',
  },

  // False color display
  'view.toggleFalseColor': {
    code: 'KeyF',
    shift: true,
    alt: true,
    description: 'Toggle false color exposure display',
  },

  // Timecode overlay
  'view.toggleTimecodeOverlay': {
    code: 'KeyT',
    shift: true,
    alt: true,
    description: 'Toggle timecode overlay on viewer',
  },

  // FPS indicator
  'view.toggleFPSIndicator': {
    code: 'KeyF',
    ctrl: true,
    shift: true,
    description: 'Toggle FPS indicator overlay',
  },

  // Zebra stripes
  'view.toggleZebraStripes': {
    code: 'KeyZ',
    shift: true,
    alt: true,
    description: 'Toggle zebra stripes exposure warning',
  },

  // Luminance visualization cycle
  'view.cycleLuminanceVis': {
    code: 'KeyV',
    shift: true,
    alt: true,
    description: 'Cycle luminance visualization modes',
  },

  // Color wheels
  'color.toggleColorWheels': {
    code: 'KeyW',
    shift: true,
    alt: true,
    description: 'Toggle Lift/Gamma/Gain color wheels',
  },

  // Spotlight / Focus tool
  'view.toggleSpotlight': {
    code: 'KeyQ',
    shift: true,
    description: 'Toggle spotlight focus tool',
  },

  // Tone mapping for HDR content
  'view.toggleToneMapping': {
    code: 'KeyJ',
    shift: true,
    alt: true,
    description: 'Toggle tone mapping for HDR content',
  },

  // Color inversion
  'color.toggleInversion': {
    code: 'KeyI',
    ctrl: true,
    description: 'Toggle color inversion',
  },

  // Display profile cycling
  'display.cycleProfile': {
    code: 'KeyD',
    shift: true,
    alt: true,
    description: 'Cycle display profile (Linear/sRGB/Rec.709/Gamma 2.2/Gamma 2.4)',
  },

  // HSL Qualifier (secondary color correction)
  'color.toggleHSLQualifier': {
    code: 'KeyH',
    shift: true,
    description: 'Toggle HSL Qualifier for secondary color correction',
  },

  // History panel
  'panel.history': {
    code: 'KeyH',
    shift: true,
    alt: true,
    description: 'Toggle undo/redo history panel',
  },

  // Snapshot controls
  'snapshot.create': {
    code: 'KeyS',
    ctrl: true,
    shift: true,
    description: 'Create quick snapshot of current session',
  },
  'panel.snapshots': {
    code: 'KeyS',
    ctrl: true,
    shift: true,
    alt: true,
    description: 'Toggle snapshots panel',
  },

  // Markers panel
  'panel.markers': {
    code: 'KeyM',
    shift: true,
    alt: true,
    description: 'Toggle markers list panel',
  },

  // Playlist panel
  'panel.playlist': {
    code: 'KeyP',
    shift: true,
    alt: true,
    description: 'Toggle playlist panel',
  },

  // Notes panel
  'panel.notes': {
    code: 'KeyN',
    shift: true,
    alt: true,
    description: 'Toggle notes panel',
  },

  // Texture filter mode toggle (N key, matching desktop OpenRV)
  'view.toggleFilterMode': {
    code: 'KeyN',
    description: 'Toggle nearest-neighbor / bilinear filtering',
  },

  // Notes quick-add + navigation
  'notes.addNote': {
    code: 'KeyN',
    context: 'annotate',
    description: 'Add note at current frame',
  },
  'notes.next': {
    code: 'BracketRight',
    alt: true,
    shift: true,
    description: 'Go to next note',
  },
  'notes.previous': {
    code: 'BracketLeft',
    alt: true,
    shift: true,
    description: 'Go to previous note',
  },

  // Info panel
  'view.toggleInfoPanel': {
    code: 'KeyI',
    shift: true,
    alt: true,
    description: 'Toggle info panel overlay',
  },

  // Theme control
  'theme.cycle': {
    code: 'KeyT',
    shift: true,
    description: 'Cycle theme',
  },

  // Background pattern
  'view.cycleBackgroundPattern': {
    code: 'KeyB',
    shift: true,
    description: 'Cycle background pattern (Black/Grey18/Grey50/Checker)',
  },
  'view.toggleCheckerboard': {
    code: 'KeyB',
    shift: true,
    alt: true,
    description: 'Toggle checkerboard background on/off',
  },

  // Fullscreen / Presentation mode
  'view.toggleFullscreen': {
    code: 'F11',
    description: 'Toggle fullscreen mode',
  },
  'view.togglePresentation': {
    code: 'KeyP',
    shift: true,
    ctrl: true,
    description: 'Toggle presentation mode',
  },

  // Network Sync
  'network.togglePanel': {
    code: 'KeyN',
    shift: true,
    description: 'Toggle network sync panel',
  },
  'network.disconnect': {
    code: 'KeyN',
    shift: true,
    ctrl: true,
    description: 'Quick disconnect from sync room',
  },

  // Layout presets
  'layout.default': {
    code: 'Digit1',
    alt: true,
    description: 'Switch to Default layout',
  },
  'layout.review': {
    code: 'Digit2',
    alt: true,
    description: 'Switch to Review layout',
  },
  'layout.color': {
    code: 'Digit3',
    alt: true,
    description: 'Switch to Color layout',
  },
  'layout.paint': {
    code: 'Digit4',
    alt: true,
    description: 'Switch to Paint layout',
  },

  // Focus zone navigation
  'focus.nextZone': {
    code: 'F6',
    description: 'Focus next zone',
  },
  'focus.previousZone': {
    code: 'F6',
    shift: true,
    description: 'Focus previous zone',
  },

  // External presentation window
  'view.openPresentationWindow': {
    code: 'KeyP',
    ctrl: true,
    shift: true,
    alt: true,
    description: 'Open external presentation window',
  },

  // Reference capture/toggle
  'view.captureReference': {
    code: 'KeyR',
    alt: true,
    shift: true,
    description: 'Capture current frame as reference',
  },
  'view.toggleReference': {
    code: 'KeyR',
    ctrl: true,
    shift: true,
    description: 'Toggle reference comparison overlay',
  },

  // Info strip overlay
  'view.toggleInfoStrip': {
    code: 'F7',
    description: 'Toggle info strip overlay',
  },
  'view.toggleInfoStripPath': {
    code: 'F7',
    shift: true,
    description: 'Toggle info strip full path',
  },

  // Help / cheat sheet
  'help.toggleCheatSheet': {
    code: 'Slash',
    shift: true,
    description: 'Toggle keyboard shortcuts cheat sheet',
  },

  // Audio mute toggle
  'audio.toggleMute': {
    code: 'KeyM',
    shift: true,
    description: 'Toggle audio mute',
  },

  // Playback mode toggle
  'playback.togglePlaybackMode': {
    code: 'KeyA',
    ctrl: true,
    shift: true,
    description: 'Toggle between Realtime and Play All Frames',
  },

  // Scale presets - magnification
  'view.zoom1to1': {
    code: 'Digit1',
    ctrl: true,
    description: 'Zoom to 1:1 (100%) pixel ratio',
  },
  'view.zoom2to1': {
    code: 'Digit2',
    ctrl: true,
    description: 'Zoom to 2:1 (200%) pixel ratio',
  },
  'view.zoom3to1': {
    code: 'Digit3',
    ctrl: true,
    description: 'Zoom to 3:1 (300%) pixel ratio',
  },
  'view.zoom4to1': {
    code: 'Digit4',
    ctrl: true,
    description: 'Zoom to 4:1 (400%) pixel ratio',
  },
  'view.zoom5to1': {
    code: 'Digit5',
    ctrl: true,
    description: 'Zoom to 5:1 (500%) pixel ratio',
  },
  'view.zoom6to1': {
    code: 'Digit6',
    ctrl: true,
    description: 'Zoom to 6:1 (600%) pixel ratio',
  },
  'view.zoom7to1': {
    code: 'Digit7',
    ctrl: true,
    description: 'Zoom to 7:1 (700%) pixel ratio',
  },
  'view.zoom8to1': {
    code: 'Digit8',
    ctrl: true,
    description: 'Zoom to 8:1 (800%) pixel ratio',
  },

  // Scale presets - reduction
  'view.zoom1to2': {
    code: 'Digit2',
    ctrl: true,
    shift: true,
    description: 'Zoom to 1:2 (50%) pixel ratio',
  },
  'view.zoom1to3': {
    code: 'Digit3',
    ctrl: true,
    shift: true,
    description: 'Zoom to 1:3 (~33%) pixel ratio',
  },
  'view.zoom1to4': {
    code: 'Digit4',
    ctrl: true,
    shift: true,
    description: 'Zoom to 1:4 (25%) pixel ratio',
  },
  'view.zoom1to5': {
    code: 'Digit5',
    ctrl: true,
    shift: true,
    description: 'Zoom to 1:5 (20%) pixel ratio',
  },
  'view.zoom1to6': {
    code: 'Digit6',
    ctrl: true,
    shift: true,
    description: 'Zoom to 1:6 (~17%) pixel ratio',
  },
  'view.zoom1to7': {
    code: 'Digit7',
    ctrl: true,
    shift: true,
    description: 'Zoom to 1:7 (~14%) pixel ratio',
  },
  'view.zoom1to8': {
    code: 'Digit8',
    ctrl: true,
    shift: true,
    description: 'Zoom to 1:8 (12.5%) pixel ratio',
  },
};
/**
 * Get a human-readable description of a key combination
 */
export function describeKeyCombo(combo: KeyCombination): string {
  const parts = [];
  if (combo.ctrl) parts.push('Ctrl');
  if (combo.shift) parts.push('Shift');
  if (combo.alt) parts.push('Alt');
  if (combo.meta) parts.push('Cmd');
  parts.push(codeToKey(combo.code));
  return parts.join('+');
}

/**
 * Convert a code back to its English key representation for display
 */
function codeToKey(code: string): string {
  // Handle special keys
  switch (code) {
    case 'Space':
      return 'Space';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'Home':
      return 'Home';
    case 'End':
      return 'End';
    case 'Escape':
      return 'Esc';
    case 'BracketLeft':
      return '[';
    case 'BracketRight':
      return ']';
    case 'Comma':
      return ',';
    case 'Period':
      return '.';
    case 'Backquote':
      return '`';
    case 'Semicolon':
      return ';';
    default:
      // For KeyX format, extract the X
      if (code.startsWith('Key')) {
        return code.slice(3);
      }
      // For DigitX format, extract the X
      if (code.startsWith('Digit')) {
        return code.slice(5);
      }
      return code;
  }
}
