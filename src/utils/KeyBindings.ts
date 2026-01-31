/**
 * Default keyboard shortcuts configuration
 *
 * This file defines all keyboard shortcuts used in the application.
 * Each shortcut maps to an action name that the KeyboardManager will dispatch to.
 */

import { KeyCombination } from './KeyboardManager';

export interface KeyBindingConfig {
  [action: string]: KeyCombination & { description: string };
}

export type KeyBindingKeys = keyof typeof DEFAULT_KEY_BINDINGS;

export const DEFAULT_KEY_BINDINGS: KeyBindingConfig = {
  // Playback controls
  'playback.toggle': {
    code: 'Space',
    description: 'Toggle play/pause'
  },
  'playback.stepForward': {
    code: 'ArrowRight',
    description: 'Step forward one frame'
  },
  'playback.stepBackward': {
    code: 'ArrowLeft',
    description: 'Step backward one frame'
  },
  'playback.toggleDirection': {
    code: 'ArrowUp',
    description: 'Toggle play direction'
  },
  'playback.goToStart': {
    code: 'Home',
    description: 'Go to first frame'
  },
  'playback.goToEnd': {
    code: 'End',
    description: 'Go to last frame'
  },

  // Speed controls (JKL system)
  'playback.slower': {
    code: 'KeyJ',
    description: 'Decrease playback speed'
  },
  'playback.stop': {
    code: 'KeyK',
    description: 'Stop playback'
  },
  'playback.faster': {
    code: 'KeyL',
    description: 'Increase playback speed'
  },

  // Timeline controls
  'timeline.setInPoint': {
    code: 'KeyI',
    description: 'Set in point'
  },
  'timeline.setInPointAlt': {
    code: 'BracketLeft',
    description: 'Set in point (alternative)'
  },
  'timeline.setOutPoint': {
    code: 'KeyO',
    description: 'Set out point'
  },
  'timeline.setOutPointAlt': {
    code: 'BracketRight',
    description: 'Set out point (alternative)'
  },
  'timeline.toggleMark': {
    code: 'KeyM',
    description: 'Toggle mark at current frame'
  },
  'timeline.resetInOut': {
    code: 'KeyR',
    description: 'Reset in/out points to full range'
  },
  'timeline.cycleLoopMode': {
    code: 'KeyL',
    ctrl: true,
    description: 'Cycle loop mode'
  },

  // View controls
  'view.fitToWindow': {
    code: 'KeyF',
    description: 'Fit image to window'
  },
  'view.fitToWindowAlt': {
    code: 'KeyF',
    shift: true,
    description: 'Fit image to window (alternative)'
  },
  'view.zoom50': {
    code: 'Digit0',
    description: 'Zoom to 50% (when on View tab)'
  },
  'view.cycleWipeMode': {
    code: 'KeyW',
    shift: true,
    description: 'Cycle wipe mode'
  },
  'view.toggleWaveform': {
    code: 'KeyW',
    description: 'Toggle waveform scope'
  },
  'view.toggleAB': {
    code: 'Backquote',
    description: 'Toggle A/B source compare'
  },
  'view.toggleABAlt': {
    code: 'Backquote',
    shift: true,
    description: 'Toggle A/B source compare (alternative)'
  },
  'view.toggleDifferenceMatte': {
    code: 'KeyD',
    shift: true,
    description: 'Toggle difference matte mode'
  },
  'view.toggleSplitScreen': {
    code: 'KeyS',
    shift: true,
    alt: true,
    description: 'Toggle split screen A/B comparison'
  },

  // Panel toggles
  'panel.color': {
    code: 'KeyC',
    description: 'Toggle color controls panel'
  },
  'panel.effects': {
    code: 'KeyE',
    shift: true,
    alt: true,
    description: 'Toggle effects panel'
  },
  'panel.curves': {
    code: 'KeyU',
    description: 'Toggle curves panel'
  },
  'panel.crop': {
    code: 'KeyK',
    shift: true,
    description: 'Toggle crop mode'
  },
  'panel.waveform': {
    code: 'KeyW',
    description: 'Toggle waveform scope'
  },
  'panel.vectorscope': {
    code: 'KeyY',
    description: 'Toggle vectorscope'
  },
  'panel.histogram': {
    code: 'KeyH',
    description: 'Toggle histogram'
  },

  // Transform controls
  'transform.rotateLeft': {
    code: 'KeyR',
    shift: true,
    description: 'Rotate left 90 degrees'
  },
  'transform.rotateRight': {
    code: 'KeyR',
    alt: true,
    description: 'Rotate right 90 degrees'
  },
  'transform.flipHorizontal': {
    code: 'KeyH',
    alt: true,
    description: 'Flip horizontal'
  },
  'transform.flipVertical': {
    code: 'KeyV',
    shift: true,
    description: 'Flip vertical'
  },

  // Export controls
  'export.quickExport': {
    code: 'KeyS',
    ctrl: true,
    description: 'Quick export current frame'
  },
  'export.copyFrame': {
    code: 'KeyC',
    ctrl: true,
    description: 'Copy current frame to clipboard'
  },

  // Undo/Redo
  'edit.undo': {
    code: 'KeyZ',
    ctrl: true,
    description: 'Undo last action'
  },
  'edit.redo': {
    code: 'KeyY',
    ctrl: true,
    description: 'Redo last action'
  },

  // Annotation navigation
  'annotation.previous': {
    code: 'Comma',
    description: 'Go to previous annotated frame'
  },
  'annotation.next': {
    code: 'Period',
    description: 'Go to next annotated frame'
  },

  // Tab navigation
  'tab.view': {
    code: 'Digit1',
    description: 'Switch to View tab'
  },
  'tab.color': {
    code: 'Digit2',
    description: 'Switch to Color tab'
  },
  'tab.effects': {
    code: 'Digit3',
    description: 'Switch to Effects tab'
  },
  'tab.transform': {
    code: 'Digit4',
    description: 'Switch to Transform tab'
  },
  'tab.annotate': {
    code: 'Digit5',
    description: 'Switch to Annotate tab'
  },

  // Paint tools (handled by PaintToolbar component)
  'paint.pan': {
    code: 'KeyV',
    description: 'Select pan tool'
  },
  'paint.pen': {
    code: 'KeyP',
    description: 'Select pen tool'
  },
  'paint.eraser': {
    code: 'KeyE',
    description: 'Select eraser tool'
  },
  'paint.text': {
    code: 'KeyT',
    description: 'Select text tool'
  },
  'paint.rectangle': {
    code: 'KeyR',
    description: 'Select rectangle tool'
  },
  'paint.ellipse': {
    code: 'KeyO',
    description: 'Select ellipse tool'
  },
  'paint.line': {
    code: 'KeyL',
    description: 'Select line tool'
  },
  'paint.arrow': {
    code: 'KeyA',
    description: 'Select arrow tool'
  },
  'paint.toggleBrush': {
    code: 'KeyB',
    description: 'Toggle brush type'
  },
  'paint.toggleGhost': {
    code: 'KeyG',
    description: 'Toggle ghost mode'
  },
  'view.toggleGhostFrames': {
    code: 'KeyG',
    ctrl: true,
    description: 'Toggle ghost frames (onion skin)'
  },
  'paint.toggleHold': {
    code: 'KeyX',
    description: 'Toggle hold mode'
  },

  // Channel selection (handled by ChannelSelect component)
  'channel.red': {
    code: 'KeyR',
    shift: true,
    description: 'Select red channel'
  },
  'channel.green': {
    code: 'KeyG',
    shift: true,
    description: 'Select green channel'
  },
  'channel.blue': {
    code: 'KeyB',
    shift: true,
    description: 'Select blue channel'
  },
  'channel.alpha': {
    code: 'KeyA',
    shift: true,
    description: 'Select alpha channel'
  },
  'channel.luminance': {
    code: 'KeyL',
    shift: true,
    description: 'Select luminance channel'
  },
  'channel.grayscale': {
    code: 'KeyY',
    shift: true,
    description: 'Toggle grayscale mode (alias for luminance)'
  },
  'channel.none': {
    code: 'KeyN',
    shift: true,
    description: 'Select no channel'
  },

  // Stereo controls (handled by StereoControl component)
  'stereo.toggle': {
    code: 'KeyS',
    description: 'Toggle stereo viewing mode'
  },

  // Safe areas / guides
  'view.toggleGuides': {
    code: 'Semicolon',
    description: 'Toggle safe areas and guides overlay'
  },

  'panel.close': {
    code: 'Escape',
    description: 'Close open panels'
  },

  // Pixel probe
  'view.togglePixelProbe': {
    code: 'KeyI',
    shift: true,
    description: 'Toggle pixel color probe'
  },

  // False color display
  'view.toggleFalseColor': {
    code: 'KeyF',
    shift: true,
    alt: true,
    description: 'Toggle false color exposure display'
  },

  // Timecode overlay
  'view.toggleTimecodeOverlay': {
    code: 'KeyT',
    shift: true,
    alt: true,
    description: 'Toggle timecode overlay on viewer'
  },

  // Zebra stripes
  'view.toggleZebraStripes': {
    code: 'KeyZ',
    shift: true,
    alt: true,
    description: 'Toggle zebra stripes exposure warning'
  },

  // Color wheels
  'color.toggleColorWheels': {
    code: 'KeyW',
    shift: true,
    alt: true,
    description: 'Toggle Lift/Gamma/Gain color wheels'
  },

  // Spotlight / Focus tool
  'view.toggleSpotlight': {
    code: 'KeyQ',
    shift: true,
    description: 'Toggle spotlight focus tool'
  },

  // HSL Qualifier (secondary color correction)
  'color.toggleHSLQualifier': {
    code: 'KeyH',
    shift: true,
    description: 'Toggle HSL Qualifier for secondary color correction'
  },

  // History panel
  'panel.history': {
    code: 'KeyH',
    shift: true,
    alt: true,
    description: 'Toggle undo/redo history panel'
  },

  // Snapshot controls
  'snapshot.create': {
    code: 'KeyS',
    ctrl: true,
    shift: true,
    description: 'Create quick snapshot of current session'
  },
  'panel.snapshots': {
    code: 'KeyS',
    ctrl: true,
    shift: true,
    alt: true,
    description: 'Toggle snapshots panel'
  },

  // Markers panel
  'panel.markers': {
    code: 'KeyM',
    shift: true,
    alt: true,
    description: 'Toggle markers list panel'
  },

  // Playlist panel
  'panel.playlist': {
    code: 'KeyP',
    shift: true,
    alt: true,
    description: 'Toggle playlist panel'
  },

  // Info panel
  'view.toggleInfoPanel': {
    code: 'KeyI',
    shift: true,
    alt: true,
    description: 'Toggle info panel overlay'
  },

  // Theme control
  'theme.cycle': {
    code: 'KeyT',
    shift: true,
    description: 'Cycle theme'
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
    case 'Space': return 'Space';
    case 'ArrowUp': return '↑';
    case 'ArrowDown': return '↓';
    case 'ArrowLeft': return '←';
    case 'ArrowRight': return '→';
    case 'Home': return 'Home';
    case 'End': return 'End';
    case 'Escape': return 'Esc';
    case 'BracketLeft': return '[';
    case 'BracketRight': return ']';
    case 'Comma': return ',';
    case 'Period': return '.';
    case 'Backquote': return '`';
    case 'Semicolon': return ';';
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