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
    key: ' ',
    description: 'Toggle play/pause'
  },
  'playback.stepForward': {
    key: 'ArrowRight',
    description: 'Step forward one frame'
  },
  'playback.stepBackward': {
    key: 'ArrowLeft',
    description: 'Step backward one frame'
  },
  'playback.toggleDirection': {
    key: 'ArrowUp',
    description: 'Toggle play direction'
  },
  'playback.goToStart': {
    key: 'Home',
    description: 'Go to first frame'
  },
  'playback.goToEnd': {
    key: 'End',
    description: 'Go to last frame'
  },

  // Timeline controls
  'timeline.setInPoint': {
    key: 'i',
    description: 'Set in point'
  },
  'timeline.setInPointAlt': {
    key: '[',
    description: 'Set in point (alternative)'
  },
  'timeline.setOutPoint': {
    key: 'o',
    description: 'Set out point'
  },
  'timeline.setOutPointAlt': {
    key: ']',
    description: 'Set out point (alternative)'
  },
  'timeline.toggleMark': {
    key: 'm',
    description: 'Toggle mark at current frame'
  },
  'timeline.resetInOut': {
    key: 'r',
    description: 'Reset in/out points to full range'
  },
  'timeline.cycleLoopMode': {
    key: 'l',
    description: 'Cycle loop mode'
  },

  // View controls
  'view.fitToWindow': {
    key: 'f',
    description: 'Fit image to window'
  },
  'view.fitToWindowAlt': {
    key: 'F',
    description: 'Fit image to window (alternative)'
  },
  'view.zoom50': {
    key: '0',
    description: 'Zoom to 50% (when on View tab)'
  },
  'view.cycleWipeMode': {
    key: 'W',
    description: 'Cycle wipe mode'
  },
  'view.toggleWaveform': {
    key: 'w',
    description: 'Toggle waveform scope'
  },
  'view.toggleAB': {
    key: '`',
    description: 'Toggle A/B source compare'
  },
  'view.toggleABAlt': {
    key: '~',
    description: 'Toggle A/B source compare (alternative)'
  },

  // Panel toggles
  'panel.color': {
    key: 'c',
    description: 'Toggle color controls panel'
  },
  'panel.effects': {
    key: 'g',
    description: 'Toggle effects panel'
  },
  'panel.curves': {
    key: 'u',
    description: 'Toggle curves panel'
  },
  'panel.crop': {
    key: 'k',
    description: 'Toggle crop mode'
  },
  'panel.waveform': {
    key: 'w',
    description: 'Toggle waveform scope'
  },
  'panel.vectorscope': {
    key: 'y',
    description: 'Toggle vectorscope'
  },
  'panel.histogram': {
    key: 'h',
    description: 'Toggle histogram'
  },

  // Transform controls
  'transform.rotateLeft': {
    key: 'r',
    shift: true,
    description: 'Rotate left 90 degrees'
  },
  'transform.rotateRight': {
    key: 'r',
    alt: true,
    description: 'Rotate right 90 degrees'
  },
  'transform.flipHorizontal': {
    key: 'h',
    shift: true,
    description: 'Flip horizontal'
  },
  'transform.flipVertical': {
    key: 'v',
    shift: true,
    description: 'Flip vertical'
  },

  // Export controls
  'export.quickExport': {
    key: 's',
    ctrl: true,
    description: 'Quick export current frame'
  },
  'export.copyFrame': {
    key: 'c',
    ctrl: true,
    description: 'Copy current frame to clipboard'
  },

  // Undo/Redo
  'edit.undo': {
    key: 'z',
    ctrl: true,
    description: 'Undo last action'
  },
  'edit.redo': {
    key: 'y',
    ctrl: true,
    description: 'Redo last action'
  },

  // Annotation navigation
  'annotation.previous': {
    key: ',',
    description: 'Go to previous annotated frame'
  },
  'annotation.next': {
    key: '.',
    description: 'Go to next annotated frame'
  },

  // Tab navigation
  'tab.view': {
    key: '1',
    description: 'Switch to View tab'
  },
  'tab.color': {
    key: '2',
    description: 'Switch to Color tab'
  },
  'tab.effects': {
    key: '3',
    description: 'Switch to Effects tab'
  },
  'tab.transform': {
    key: '4',
    description: 'Switch to Transform tab'
  },
  'tab.annotate': {
    key: '5',
    description: 'Switch to Annotate tab'
  },

  // Paint tools (handled by PaintToolbar component)
  'paint.pan': {
    key: 'v',
    description: 'Select pan tool'
  },
  'paint.pen': {
    key: 'p',
    description: 'Select pen tool'
  },
  'paint.eraser': {
    key: 'e',
    description: 'Select eraser tool'
  },
  'paint.text': {
    key: 't',
    description: 'Select text tool'
  },
  'paint.toggleBrush': {
    key: 'b',
    description: 'Toggle brush type'
  },
  'paint.toggleGhost': {
    key: 'g',
    description: 'Toggle ghost mode'
  },

  // Channel selection (handled by ChannelSelect component)
  'channel.red': {
    key: 'R',
    shift: true,
    description: 'Select red channel'
  },
  'channel.green': {
    key: 'G',
    shift: true,
    description: 'Select green channel'
  },
  'channel.blue': {
    key: 'B',
    shift: true,
    description: 'Select blue channel'
  },
  'channel.alpha': {
    key: 'A',
    shift: true,
    description: 'Select alpha channel'
  },
  'channel.luminance': {
    key: 'L',
    shift: true,
    description: 'Select luminance channel'
  },
  'channel.none': {
    key: 'N',
    shift: true,
    description: 'Select no channel'
  },

  // Stereo controls (handled by StereoControl component)
  'stereo.toggle': {
    key: 's',
    description: 'Toggle stereo viewing mode'
  },
  'panel.close': {
    key: 'Escape',
    description: 'Close open panels'
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
  parts.push(combo.key === ' ' ? 'Space' : combo.key);
  return parts.join('+');
}