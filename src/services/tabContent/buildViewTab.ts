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

  const viewContent = document.createElement('div');
  viewContent.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-shrink: 0;';

  // --- GROUP 1: Navigation (Zoom + Channel) ---
  viewContent.appendChild(registry.zoomControl.render());
  viewContent.appendChild(registry.channelSelect.render());
  viewContent.appendChild(ContextToolbar.createDivider());

  // --- GROUP 2: Comparison (Compare + Stereo + Ghost) ---
  viewContent.appendChild(registry.compareControl.render());
  viewContent.appendChild(registry.stereoControl.render());
  viewContent.appendChild(registry.stereoEyeTransformControl.render());
  viewContent.appendChild(registry.stereoAlignControl.render());

  // Convergence measurement button (stereo QC)
  const convergenceButton = ContextToolbar.createIconButton('crosshair', () => {
    registry.convergenceMeasure.setEnabled(!registry.convergenceMeasure.isEnabled());
  }, { title: 'Toggle convergence measurement' });
  convergenceButton.dataset.testid = 'convergence-measure-btn';
  viewContent.appendChild(convergenceButton);

  addUnsubscriber(registry.convergenceMeasure.on('stateChanged', (state) => {
    setButtonActive(convergenceButton, state.enabled, 'icon');
  }));

  // Floating window violation detection button (stereo QC)
  const floatingWindowButton = ContextToolbar.createIconButton('maximize', () => {
    const pair = viewer.getStereoPair();
    if (pair) {
      const result = registry.floatingWindowControl.detect(pair.left, pair.right);
      floatingWindowButton.title = registry.floatingWindowControl.formatResult(result);
    }
  }, { title: 'Detect floating window violations' });
  floatingWindowButton.dataset.testid = 'floating-window-detect-btn';
  viewContent.appendChild(floatingWindowButton);

  addUnsubscriber(registry.floatingWindowControl.on('stateChanged', (state) => {
    const hasViolation = state.lastResult?.hasViolation ?? false;
    setButtonActive(floatingWindowButton, hasViolation, 'icon');
  }));

  viewContent.appendChild(registry.ghostFrameControl.render());

  // Reference capture/toggle buttons
  const captureRefButton = ContextToolbar.createIconButton('camera', () => {
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
  }, { title: 'Capture reference frame (Alt+Shift+R)' });
  captureRefButton.dataset.testid = 'capture-reference-btn';
  viewContent.appendChild(captureRefButton);

  const toggleRefButton = ContextToolbar.createIconButton('layers', () => {
    registry.referenceManager.toggle();
  }, { title: 'Toggle reference comparison (Ctrl+Shift+R)' });
  toggleRefButton.dataset.testid = 'toggle-reference-btn';
  viewContent.appendChild(toggleRefButton);

  addUnsubscriber(registry.referenceManager.on('stateChanged', (state) => {
    setButtonActive(toggleRefButton, state.enabled, 'icon');

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
      viewer.setReferenceImage(refImageData, state.viewMode, state.opacity);
    } else {
      viewer.setReferenceImage(null, 'off', 0);
    }
  }));

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

  const sphericalButton = ContextToolbar.createIconButton('aperture', () => {
    if (registry.sphericalProjection.enabled) {
      registry.sphericalProjection.disable();
    } else {
      registry.sphericalProjection.enable();
    }
    updateSphericalUniforms();
    setButtonActive(sphericalButton, registry.sphericalProjection.enabled, 'icon');
  }, { title: '360 View' });
  sphericalButton.dataset.testid = 'spherical-projection-btn';
  viewContent.appendChild(sphericalButton);

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
    const current = missingModes.find(m => m.value === currentMissingMode);
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
    missingDropdown.querySelectorAll<HTMLButtonElement>('button').forEach(opt => {
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

  // Timeline editor toggle button
  const timelineEditorButton = ContextToolbar.createIconButton('edit', () => {
    timelineEditorPanel.toggle(timelineEditorButton);
    setButtonActive(timelineEditorButton, timelineEditorPanel.isVisible(), 'icon');
  }, { title: 'Toggle visual timeline editor' });
  timelineEditorButton.dataset.testid = 'timeline-editor-toggle-button';
  viewContent.appendChild(timelineEditorButton);

  // Spotlight Tool toggle button
  const spotlightButton = ContextToolbar.createIconButton('sun', () => {
    viewer.getSpotlightOverlay().toggle();
  }, { title: 'Spotlight (Shift+Q)' });
  spotlightButton.dataset.testid = 'spotlight-toggle-btn';
  viewContent.appendChild(spotlightButton);

  addUnsubscriber(viewer.getSpotlightOverlay().on('stateChanged', (state) => {
    setButtonActive(spotlightButton, state.enabled, 'icon');
  }));

  // EXR Window Overlay toggle button
  const exrWindowButton = ContextToolbar.createIconButton('grid', () => {
    viewer.getEXRWindowOverlay().toggle();
  }, { title: 'Toggle EXR window overlay' });
  exrWindowButton.dataset.testid = 'exr-window-overlay-toggle-btn';
  viewContent.appendChild(exrWindowButton);

  addUnsubscriber(viewer.getEXRWindowOverlay().on('stateChanged', (state) => {
    setButtonActive(exrWindowButton, state.enabled, 'icon');
  }));

  return { element: viewContent, convergenceButton, floatingWindowButton };
}
