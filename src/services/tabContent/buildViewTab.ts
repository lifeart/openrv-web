/**
 * Builds the View tab toolbar content.
 *
 * Organized into 3 logical groups: Navigation | Comparison | Display.
 */
import { ContextToolbar } from '../../ui/components/layout/ContextToolbar';
import { setButtonActive, applyA11yFocus } from '../../ui/components/shared/Button';
import { getIconSvg } from '../../ui/components/shared/Icons';
import type { Panel } from '../../ui/components/shared/Panel';
import type { AppControlRegistry } from '../../AppControlRegistry';
import type { Viewer } from '../../ui/components/Viewer';
import { TimecodeOverlaySettingsMenu } from '../../ui/components/TimecodeOverlaySettingsMenu';
import { FPSIndicatorSettingsMenu } from '../../ui/components/FPSIndicatorSettingsMenu';
import { InfoStripSettingsMenu } from '../../ui/components/InfoStripSettingsMenu';
import { EXRWindowOverlaySettingsMenu } from '../../ui/components/EXRWindowOverlaySettingsMenu';
import { BugOverlaySettingsMenu } from '../../ui/components/BugOverlaySettingsMenu';
import { MatteOverlaySettingsMenu } from '../../ui/components/MatteOverlaySettingsMenu';
import { ReferenceComparisonSettingsMenu } from '../../ui/components/ReferenceComparisonSettingsMenu';
import { SpotlightOverlaySettingsMenu } from '../../ui/components/SpotlightOverlaySettingsMenu';

export interface BuildViewTabDeps {
  registry: AppControlRegistry;
  viewer: Viewer;
  timelineEditorPanel: Panel;
  addUnsubscriber: (unsub: () => void) => void;
}

export interface BuildViewTabResult {
  element: HTMLElement;
  convergenceButton: HTMLButtonElement;
  floatingWindowButton: HTMLButtonElement;
}

export function buildViewTab(deps: BuildViewTabDeps): BuildViewTabResult {
  const { registry, viewer, timelineEditorPanel, addUnsubscriber } = deps;
  const bugOverlay = viewer.getBugOverlay();
  const matteOverlay = viewer.getMatteOverlay();
  const exrWindowOverlay = viewer.getEXRWindowOverlay();
  const infoStripOverlay = viewer.getInfoStripOverlay();
  const timecodeOverlay = viewer.getTimecodeOverlay();
  const fpsIndicator = viewer.getFPSIndicator();

  const viewContent = document.createElement('div');
  viewContent.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-shrink: 0;';

  // --- GROUP 1: Navigation (Zoom + Channel) ---
  viewContent.appendChild(registry.zoomControl.render());
  viewContent.appendChild(registry.channelSelect.render());
  viewContent.appendChild(ContextToolbar.createDivider());

  // --- GROUP 2: Comparison (Compare + Layout + Stereo + Ghost) ---
  viewContent.appendChild(registry.compareControl.render());
  viewContent.appendChild(registry.layoutControl.render());
  viewContent.appendChild(registry.stereoControl.render());
  viewContent.appendChild(registry.stereoEyeTransformControl.render());
  viewContent.appendChild(registry.stereoAlignControl.render());

  // Convergence measurement button (stereo QC)
  const convergenceButton = ContextToolbar.createIconButton(
    'crosshair',
    () => {
      registry.convergenceMeasure.setEnabled(!registry.convergenceMeasure.isEnabled());
    },
    { title: 'Toggle convergence measurement' },
  );
  convergenceButton.dataset.testid = 'convergence-measure-btn';
  viewContent.appendChild(convergenceButton);

  addUnsubscriber(
    registry.convergenceMeasure.on('stateChanged', (state) => {
      setButtonActive(convergenceButton, state.enabled, 'icon');
    }),
  );

  // Floating window violation detection button (stereo QC)
  const floatingWindowButton = ContextToolbar.createIconButton(
    'maximize',
    () => {
      const pair = viewer.getStereoPair();
      if (pair) {
        const result = registry.floatingWindowControl.detect(pair.left, pair.right);
        floatingWindowButton.title = registry.floatingWindowControl.formatResult(result);
      }
    },
    { title: 'Detect floating window violations' },
  );
  floatingWindowButton.dataset.testid = 'floating-window-detect-btn';
  viewContent.appendChild(floatingWindowButton);

  addUnsubscriber(
    registry.floatingWindowControl.on('stateChanged', (state) => {
      const hasViolation = state.lastResult?.hasViolation ?? false;
      setButtonActive(floatingWindowButton, hasViolation, 'icon');
    }),
  );

  viewContent.appendChild(registry.ghostFrameControl.render());

  // Reference capture/toggle buttons
  const captureRefButton = ContextToolbar.createIconButton(
    'camera',
    () => {
      const imageData = viewer.getImageData();
      if (imageData) {
        registry.referenceManager.captureReference({
          width: imageData.width,
          height: imageData.height,
          data: imageData.data,
          channels: 4,
        });
        registry.referenceManager.enable();
      }
    },
    { title: 'Capture reference frame (Alt+Shift+R)' },
  );
  captureRefButton.dataset.testid = 'capture-reference-btn';
  viewContent.appendChild(captureRefButton);

  const toggleRefButton = ContextToolbar.createIconButton(
    'layers',
    () => {
      registry.referenceManager.toggle();
    },
    { title: 'Toggle reference comparison (Ctrl+Shift+R) — Right-click for settings' },
  );
  toggleRefButton.dataset.testid = 'toggle-reference-btn';
  viewContent.appendChild(toggleRefButton);

  const referenceComparisonSettingsMenu = new ReferenceComparisonSettingsMenu(registry.referenceManager);
  toggleRefButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    referenceComparisonSettingsMenu.show(e.clientX, e.clientY);
  });
  addUnsubscriber(() => referenceComparisonSettingsMenu.dispose());

  // --- Reference view mode dropdown ---
  type RefViewMode = 'split-h' | 'split-v' | 'overlay' | 'side-by-side' | 'toggle';
  const refViewModes: Array<{ label: string; value: RefViewMode }> = [
    { label: 'Split H', value: 'split-h' },
    { label: 'Split V', value: 'split-v' },
    { label: 'Overlay', value: 'overlay' },
    { label: 'Side by Side', value: 'side-by-side' },
    { label: 'Toggle', value: 'toggle' },
  ];
  let currentRefViewMode: RefViewMode = registry.referenceManager.getState().viewMode as RefViewMode;
  let isRefModeDropdownOpen = false;

  const refModeContainer = document.createElement('div');
  refModeContainer.dataset.testid = 'ref-view-mode-select';
  refModeContainer.style.cssText = 'display: flex; align-items: center; position: relative;';

  const refModeButton = document.createElement('button');
  refModeButton.type = 'button';
  refModeButton.title = 'Reference comparison mode';
  refModeButton.setAttribute('aria-haspopup', 'true');
  refModeButton.setAttribute('aria-expanded', 'false');
  refModeButton.style.cssText = `
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.12s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 80px;
    gap: 4px;
    outline: none;
  `;

  const updateRefModeLabel = () => {
    const current = refViewModes.find((m) => m.value === currentRefViewMode);
    refModeButton.innerHTML = `${getIconSvg('layers', 'sm')}<span style="margin-left: 4px;">Ref: ${current?.label ?? 'Split H'}</span><span style="margin-left: 4px; font-size: 8px;">&#9660;</span>`;
  };
  updateRefModeLabel();

  const refModeDropdown = document.createElement('div');
  refModeDropdown.dataset.testid = 'ref-view-mode-dropdown';
  refModeDropdown.style.cssText = `
    position: fixed;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    padding: 4px;
    z-index: 9999;
    display: none;
    flex-direction: column;
    min-width: 140px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  `;

  const updateRefModeOptionStyles = () => {
    refModeDropdown.querySelectorAll<HTMLButtonElement>('button').forEach((opt) => {
      if (opt.dataset.value === currentRefViewMode) {
        opt.style.background = 'rgba(var(--accent-primary-rgb), 0.2)';
        opt.style.color = 'var(--accent-primary)';
      } else {
        opt.style.background = 'transparent';
        opt.style.color = 'var(--text-primary)';
      }
    });
  };

  const positionRefModeDropdown = () => {
    if (!isRefModeDropdownOpen) return;
    const rect = refModeButton.getBoundingClientRect();
    refModeDropdown.style.top = `${rect.bottom + 4}px`;
    refModeDropdown.style.left = `${rect.left}px`;
  };

  const closeRefModeDropdown = () => {
    isRefModeDropdownOpen = false;
    refModeDropdown.style.display = 'none';
    refModeButton.setAttribute('aria-expanded', 'false');
    refModeButton.style.background = 'transparent';
    refModeButton.style.borderColor = 'transparent';
    refModeButton.style.color = 'var(--text-muted)';
    document.removeEventListener('click', handleRefModeOutsideClick);
    window.removeEventListener('scroll', positionRefModeDropdown, true);
    window.removeEventListener('resize', positionRefModeDropdown);
  };

  const openRefModeDropdown = () => {
    if (!document.body.contains(refModeDropdown)) {
      document.body.appendChild(refModeDropdown);
    }
    isRefModeDropdownOpen = true;
    positionRefModeDropdown();
    refModeDropdown.style.display = 'flex';
    refModeButton.setAttribute('aria-expanded', 'true');
    refModeButton.style.background = 'var(--bg-hover)';
    refModeButton.style.borderColor = 'var(--border-primary)';
    document.addEventListener('click', handleRefModeOutsideClick);
    window.addEventListener('scroll', positionRefModeDropdown, true);
    window.addEventListener('resize', positionRefModeDropdown);
  };

  const handleRefModeOutsideClick = (e: MouseEvent) => {
    if (!refModeButton.contains(e.target as Node) && !refModeDropdown.contains(e.target as Node)) {
      closeRefModeDropdown();
    }
  };

  /** Update slider visibility based on the current reference view mode. */
  const updateRefSliderVisibility = (mode: RefViewMode) => {
    // Opacity is relevant for overlay and toggle modes
    refOpacitySlider.style.display = mode === 'overlay' || mode === 'toggle' ? 'flex' : 'none';
    // Wipe position is relevant for split-h and split-v modes
    refWipeSlider.style.display = mode === 'split-h' || mode === 'split-v' ? 'flex' : 'none';
  };

  for (const mode of refViewModes) {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.dataset.value = mode.value;
    opt.textContent = mode.label;
    opt.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-primary);
      padding: 6px 10px;
      text-align: left;
      cursor: pointer;
      font-size: 12px;
      border-radius: 3px;
      transition: background 0.12s ease;
    `;
    if (mode.value === currentRefViewMode) {
      opt.style.background = 'rgba(var(--accent-primary-rgb), 0.2)';
      opt.style.color = 'var(--accent-primary)';
    }
    opt.addEventListener('pointerenter', () => {
      opt.style.background = 'var(--bg-hover)';
    });
    opt.addEventListener('pointerleave', () => {
      if (mode.value !== currentRefViewMode) {
        opt.style.background = 'transparent';
      }
    });
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      currentRefViewMode = mode.value;
      registry.referenceManager.setViewMode(mode.value);
      updateRefModeLabel();
      updateRefModeOptionStyles();
      updateRefSliderVisibility(mode.value);
      closeRefModeDropdown();
    });
    refModeDropdown.appendChild(opt);
  }

  refModeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isRefModeDropdownOpen) closeRefModeDropdown();
    else openRefModeDropdown();
  });
  refModeButton.addEventListener('pointerenter', () => {
    if (!isRefModeDropdownOpen) {
      refModeButton.style.background = 'var(--bg-hover)';
      refModeButton.style.borderColor = 'var(--border-primary)';
      refModeButton.style.color = 'var(--text-primary)';
    }
  });
  refModeButton.addEventListener('pointerleave', () => {
    if (!isRefModeDropdownOpen) {
      refModeButton.style.background = 'transparent';
      refModeButton.style.borderColor = 'transparent';
      refModeButton.style.color = 'var(--text-muted)';
    }
  });
  applyA11yFocus(refModeButton);

  refModeContainer.appendChild(refModeButton);
  viewContent.appendChild(refModeContainer);

  // Cleanup: close the dropdown (removes window/document listeners) and remove from DOM
  addUnsubscriber(() => {
    closeRefModeDropdown();
    refModeDropdown.remove();
  });

  // --- Reference opacity slider (for overlay / toggle modes) ---
  const refOpacitySlider = ContextToolbar.createSlider('Opacity', {
    min: 0,
    max: 100,
    step: 1,
    value: Math.round(registry.referenceManager.getState().opacity * 100),
    width: '70px',
    onChange: (value) => {
      registry.referenceManager.setOpacity(value / 100);
    },
  });
  refOpacitySlider.dataset.testid = 'ref-opacity-slider';
  viewContent.appendChild(refOpacitySlider);

  // --- Reference wipe position slider (for split-h / split-v modes) ---
  const refWipeSlider = ContextToolbar.createSlider('Wipe', {
    min: 0,
    max: 100,
    step: 1,
    value: Math.round(registry.referenceManager.getState().wipePosition * 100),
    width: '70px',
    onChange: (value) => {
      registry.referenceManager.setWipePosition(value / 100);
    },
  });
  refWipeSlider.dataset.testid = 'ref-wipe-slider';
  viewContent.appendChild(refWipeSlider);

  // Set initial slider visibility
  updateRefSliderVisibility(currentRefViewMode);

  addUnsubscriber(
    registry.referenceManager.on('stateChanged', (state) => {
      setButtonActive(toggleRefButton, state.enabled, 'icon');

      // Keep dropdown label and slider visibility in sync with external state changes
      if (state.viewMode !== currentRefViewMode) {
        currentRefViewMode = state.viewMode as RefViewMode;
        updateRefModeLabel();
        updateRefModeOptionStyles();
        updateRefSliderVisibility(currentRefViewMode);
      }

      if (state.enabled && state.referenceImage) {
        const ref = state.referenceImage;
        let refImageData: ImageData;
        if (ref.data instanceof Uint8ClampedArray) {
          refImageData = new ImageData(new Uint8ClampedArray(ref.data), ref.width, ref.height);
        } else {
          const u8 = new Uint8ClampedArray(ref.width * ref.height * 4);
          for (let i = 0; i < ref.data.length; i++) {
            u8[i] = Math.round(Math.max(0, Math.min(1, ref.data[i]!)) * 255);
          }
          refImageData = new ImageData(u8, ref.width, ref.height);
        }
        viewer.setReferenceImage(
          refImageData,
          state.viewMode,
          state.opacity,
          state.wipePosition,
          state.showingReference,
        );
      } else {
        viewer.setReferenceImage(null, 'off', 0);
      }
    }),
  );

  viewContent.appendChild(ContextToolbar.createDivider());

  // --- GROUP 3: Display (Stack, PAR, Background Pattern, Spotlight) ---
  viewContent.appendChild(registry.stackControl.render());
  viewContent.appendChild(registry.parControl.render());
  viewContent.appendChild(registry.backgroundPatternControl.render());

  // 360 spherical projection toggle
  const updateSphericalUniforms = () => {
    const w = viewer.getDisplayWidth() || 1920;
    const h = viewer.getDisplayHeight() || 1080;
    const uniforms = registry.sphericalProjection.getProjectionUniforms(w, h);
    viewer.setSphericalProjection({
      enabled: uniforms.u_sphericalEnabled === 1,
      fov: uniforms.u_fov,
      aspect: uniforms.u_aspect,
      yaw: uniforms.u_yaw,
      pitch: uniforms.u_pitch,
    });
  };

  viewer.setSphericalProjectionRef(registry.sphericalProjection, updateSphericalUniforms);

  const sphericalButton = ContextToolbar.createIconButton(
    'aperture',
    () => {
      if (registry.sphericalProjection.enabled) {
        registry.sphericalProjection.disable();
      } else {
        registry.sphericalProjection.enable();
      }
      updateSphericalUniforms();
    },
    { title: '360 View' },
  );
  sphericalButton.dataset.testid = 'spherical-projection-btn';
  viewContent.appendChild(sphericalButton);

  // Subscribe to spherical projection state changes so the button reflects
  // the actual state even when toggled externally (e.g. auto-detect on source load).
  addUnsubscriber(
    registry.sphericalProjection.onEnabledChange((enabled) => {
      setButtonActive(sphericalButton, enabled, 'icon');
    }),
  );

  // Missing-frame mode dropdown
  const missingFrameContainer = document.createElement('div');
  missingFrameContainer.dataset.testid = 'missing-frame-mode-select';
  missingFrameContainer.style.cssText = `
    display: flex; align-items: center; position: relative;
  `;

  type MissingFrameMode = 'off' | 'show-frame' | 'hold' | 'black';
  const missingModes: Array<{ label: string; value: MissingFrameMode }> = [
    { label: 'Off', value: 'off' },
    { label: 'Frame', value: 'show-frame' },
    { label: 'Hold', value: 'hold' },
    { label: 'Black', value: 'black' },
  ];
  let currentMissingMode: MissingFrameMode = viewer.getMissingFrameMode() as MissingFrameMode;
  let isMissingDropdownOpen = false;

  const missingButton = document.createElement('button');
  missingButton.type = 'button';
  missingButton.title = 'Missing frame mode';
  missingButton.setAttribute('aria-haspopup', 'true');
  missingButton.setAttribute('aria-expanded', 'false');
  missingButton.style.cssText = `
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.12s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 80px;
    gap: 4px;
    outline: none;
  `;

  const updateMissingLabel = () => {
    const current = missingModes.find((m) => m.value === currentMissingMode);
    missingButton.innerHTML = `${getIconSvg('image', 'sm')}<span style="margin-left: 4px;">Missing: ${current?.label ?? 'Off'}</span><span style="margin-left: 4px; font-size: 8px;">&#9660;</span>`;
  };
  updateMissingLabel();

  const missingDropdown = document.createElement('div');
  missingDropdown.dataset.testid = 'missing-frame-mode-dropdown';
  missingDropdown.style.cssText = `
    position: fixed;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    padding: 4px;
    z-index: 9999;
    display: none;
    flex-direction: column;
    min-width: 140px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  `;

  const updateMissingOptionStyles = () => {
    missingDropdown.querySelectorAll<HTMLButtonElement>('button').forEach((opt) => {
      if (opt.dataset.value === currentMissingMode) {
        opt.style.background = 'rgba(var(--accent-primary-rgb), 0.2)';
        opt.style.color = 'var(--accent-primary)';
      } else {
        opt.style.background = 'transparent';
        opt.style.color = 'var(--text-primary)';
      }
    });
  };

  const positionMissingDropdown = () => {
    if (!isMissingDropdownOpen) return;
    const rect = missingButton.getBoundingClientRect();
    missingDropdown.style.top = `${rect.bottom + 4}px`;
    missingDropdown.style.left = `${rect.left}px`;
  };

  const closeMissingDropdown = () => {
    isMissingDropdownOpen = false;
    missingDropdown.style.display = 'none';
    missingButton.setAttribute('aria-expanded', 'false');
    missingButton.style.background = 'transparent';
    missingButton.style.borderColor = 'transparent';
    missingButton.style.color = 'var(--text-muted)';
    document.removeEventListener('click', handleMissingOutsideClick);
    window.removeEventListener('scroll', positionMissingDropdown, true);
    window.removeEventListener('resize', positionMissingDropdown);
  };

  const openMissingDropdown = () => {
    if (!document.body.contains(missingDropdown)) {
      document.body.appendChild(missingDropdown);
    }
    isMissingDropdownOpen = true;
    positionMissingDropdown();
    missingDropdown.style.display = 'flex';
    missingButton.setAttribute('aria-expanded', 'true');
    missingButton.style.background = 'var(--bg-hover)';
    missingButton.style.borderColor = 'var(--border-primary)';
    document.addEventListener('click', handleMissingOutsideClick);
    window.addEventListener('scroll', positionMissingDropdown, true);
    window.addEventListener('resize', positionMissingDropdown);
  };

  const handleMissingOutsideClick = (e: MouseEvent) => {
    if (!missingButton.contains(e.target as Node) && !missingDropdown.contains(e.target as Node)) {
      closeMissingDropdown();
    }
  };

  for (const mode of missingModes) {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.dataset.value = mode.value;
    opt.textContent = mode.label;
    opt.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-primary);
      padding: 6px 10px;
      text-align: left;
      cursor: pointer;
      font-size: 12px;
      border-radius: 3px;
      transition: background 0.12s ease;
    `;
    if (mode.value === currentMissingMode) {
      opt.style.background = 'rgba(var(--accent-primary-rgb), 0.2)';
      opt.style.color = 'var(--accent-primary)';
    }
    opt.addEventListener('pointerenter', () => {
      opt.style.background = 'var(--bg-hover)';
    });
    opt.addEventListener('pointerleave', () => {
      if (mode.value !== currentMissingMode) {
        opt.style.background = 'transparent';
      }
    });
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      currentMissingMode = mode.value;
      viewer.setMissingFrameMode(mode.value);
      updateMissingLabel();
      updateMissingOptionStyles();
      closeMissingDropdown();
    });
    missingDropdown.appendChild(opt);
  }

  missingButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isMissingDropdownOpen) closeMissingDropdown();
    else openMissingDropdown();
  });
  missingButton.addEventListener('pointerenter', () => {
    if (currentMissingMode === 'off' && !isMissingDropdownOpen) {
      missingButton.style.background = 'var(--bg-hover)';
      missingButton.style.borderColor = 'var(--border-primary)';
      missingButton.style.color = 'var(--text-primary)';
    }
  });
  missingButton.addEventListener('pointerleave', () => {
    if (currentMissingMode === 'off' && !isMissingDropdownOpen) {
      missingButton.style.background = 'transparent';
      missingButton.style.borderColor = 'transparent';
      missingButton.style.color = 'var(--text-muted)';
    }
  });
  applyA11yFocus(missingButton);

  missingFrameContainer.appendChild(missingButton);
  viewContent.appendChild(missingFrameContainer);

  // Cleanup: close the dropdown (removes window/document listeners) and remove from DOM
  addUnsubscriber(() => {
    closeMissingDropdown();
    missingDropdown.remove();
  });

  // Timeline editor toggle button
  const timelineEditorButton = ContextToolbar.createIconButton(
    'edit',
    () => {
      timelineEditorPanel.toggle(timelineEditorButton);
    },
    { title: 'Toggle visual timeline editor' },
  );
  timelineEditorButton.dataset.testid = 'timeline-editor-toggle-button';
  addUnsubscriber(
    timelineEditorPanel.onVisibilityChange((visible) => {
      setButtonActive(timelineEditorButton, visible, 'icon');
    }),
  );
  viewContent.appendChild(timelineEditorButton);

  // Spotlight Tool toggle button
  const spotlightButton = ContextToolbar.createIconButton(
    'sun',
    () => {
      viewer.getSpotlightOverlay().toggle();
    },
    { title: 'Spotlight (Shift+Q) — Right-click for settings' },
  );
  spotlightButton.dataset.testid = 'spotlight-toggle-btn';
  viewContent.appendChild(spotlightButton);

  const spotlightSettingsMenu = new SpotlightOverlaySettingsMenu(viewer.getSpotlightOverlay());
  spotlightButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    spotlightSettingsMenu.show(e.clientX, e.clientY);
  });
  addUnsubscriber(() => spotlightSettingsMenu.dispose());

  addUnsubscriber(
    viewer.getSpotlightOverlay().on('stateChanged', (state) => {
      setButtonActive(spotlightButton, state.enabled, 'icon');
    }),
  );

  const matteOverlayButton = ContextToolbar.createIconButton(
    'crop',
    () => {
      matteOverlay.toggle();
    },
    { title: 'Toggle matte overlay — Right-click for settings' },
  );
  matteOverlayButton.dataset.testid = 'matte-overlay-toggle-btn';
  viewContent.appendChild(matteOverlayButton);

  const matteOverlaySettingsMenu = new MatteOverlaySettingsMenu(matteOverlay);
  matteOverlayButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    matteOverlaySettingsMenu.show(e.clientX, e.clientY);
  });
  addUnsubscriber(() => matteOverlaySettingsMenu.dispose());

  addUnsubscriber(
    matteOverlay.on('settingsChanged', (settings) => {
      setButtonActive(matteOverlayButton, settings.show, 'icon');
    }),
  );

  const bugOverlayButton = ContextToolbar.createIconButton(
    'flag',
    () => {
      if (!bugOverlay.hasImage()) {
        const rect = bugOverlayButton.getBoundingClientRect();
        bugOverlaySettingsMenu.show(rect.left, rect.bottom + 4);
        return;
      }
      bugOverlay.toggle();
    },
    { title: 'Toggle bug overlay — Click to configure when empty, right-click for settings' },
  );
  bugOverlayButton.dataset.testid = 'bug-overlay-toggle-btn';
  viewContent.appendChild(bugOverlayButton);

  const bugOverlaySettingsMenu = new BugOverlaySettingsMenu(bugOverlay);
  bugOverlayButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    bugOverlaySettingsMenu.show(e.clientX, e.clientY);
  });
  addUnsubscriber(() => bugOverlaySettingsMenu.dispose());

  addUnsubscriber(
    bugOverlay.on('stateChanged', (state) => {
      setButtonActive(bugOverlayButton, state.enabled, 'icon');
    }),
  );

  // EXR Window Overlay toggle button
  const exrWindowButton = ContextToolbar.createIconButton(
    'grid',
    () => {
      exrWindowOverlay.toggle();
    },
    { title: 'Toggle EXR window overlay — Right-click for settings' },
  );
  exrWindowButton.dataset.testid = 'exr-window-overlay-toggle-btn';
  viewContent.appendChild(exrWindowButton);

  const exrWindowSettingsMenu = new EXRWindowOverlaySettingsMenu(exrWindowOverlay);
  exrWindowButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    exrWindowSettingsMenu.show(e.clientX, e.clientY);
  });
  addUnsubscriber(() => exrWindowSettingsMenu.dispose());

  addUnsubscriber(
    exrWindowOverlay.on('stateChanged', (state) => {
      setButtonActive(exrWindowButton, state.enabled, 'icon');
    }),
  );

  // Info Strip overlay toggle button
  const infoStripButton = ContextToolbar.createIconButton(
    'info',
    () => {
      infoStripOverlay.toggle();
    },
    { title: 'Toggle info strip overlay (F7) — Right-click for settings' },
  );
  infoStripButton.dataset.testid = 'info-strip-toggle-btn';
  viewContent.appendChild(infoStripButton);

  const infoStripSettingsMenu = new InfoStripSettingsMenu(infoStripOverlay);
  infoStripButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    infoStripSettingsMenu.show(e.clientX, e.clientY);
  });
  addUnsubscriber(() => infoStripSettingsMenu.dispose());

  addUnsubscriber(
    infoStripOverlay.on('stateChanged', (state) => {
      setButtonActive(infoStripButton, state.enabled, 'icon');
    }),
  );

  const timecodeOverlayButton = ContextToolbar.createIconButton(
    'clock',
    () => {
      timecodeOverlay.toggle();
    },
    { title: 'Toggle timecode overlay (Alt+Shift+T) — Right-click for settings' },
  );
  timecodeOverlayButton.dataset.testid = 'timecode-overlay-toggle-btn';
  viewContent.appendChild(timecodeOverlayButton);

  const timecodeOverlaySettingsMenu = new TimecodeOverlaySettingsMenu(timecodeOverlay);
  timecodeOverlayButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    timecodeOverlaySettingsMenu.show(e.clientX, e.clientY);
  });
  addUnsubscriber(() => timecodeOverlaySettingsMenu.dispose());

  addUnsubscriber(
    timecodeOverlay.on('stateChanged', (state) => {
      setButtonActive(timecodeOverlayButton, state.enabled, 'icon');
    }),
  );

  // FPS Indicator toggle button
  const fpsIndicatorButton = ContextToolbar.createIconButton(
    'activity',
    () => {
      fpsIndicator.toggle();
    },
    { title: 'Toggle FPS indicator (Ctrl+Shift+F) — Right-click for settings' },
  );
  fpsIndicatorButton.dataset.testid = 'fps-indicator-toggle-btn';
  viewContent.appendChild(fpsIndicatorButton);

  const fpsIndicatorSettingsMenu = new FPSIndicatorSettingsMenu(fpsIndicator);
  fpsIndicatorButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    fpsIndicatorSettingsMenu.show(e.clientX, e.clientY);
  });
  addUnsubscriber(() => fpsIndicatorSettingsMenu.dispose());

  addUnsubscriber(
    fpsIndicator.on('stateChanged', (state) => {
      setButtonActive(fpsIndicatorButton, state.enabled, 'icon');
    }),
  );

  return { element: viewContent, convergenceButton, floatingWindowButton };
}
