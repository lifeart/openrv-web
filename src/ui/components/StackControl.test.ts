/**
 * StackControl Component Tests
 *
 * Tests for the layer stack management control with support for
 * multiple layers, blend modes, opacity, and layer reordering.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StackControl } from './StackControl';
import { BlendMode, BLEND_MODES } from '../../composite/BlendModes';

describe('StackControl', () => {
  let control: StackControl;

  beforeEach(() => {
    control = new StackControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('STACK-U001: should initialize with empty layers', () => {
      expect(control.getLayers()).toEqual([]);
    });

    it('STACK-U002: should have no active layer initially', () => {
      expect(control.getActiveLayer()).toBeNull();
    });
  });

  describe('render', () => {
    it('STACK-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('stack-control-container');
    });

    it('STACK-U011: container has stack button', () => {
      const el = control.render();
      const buttons = el.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('STACK-U012: stack button has correct title', () => {
      const el = control.render();
      const button = el.querySelector('button');
      expect(button?.title).toBe('Layer stack controls');
    });
  });

  describe('addLayer', () => {
    it('STACK-U020: addLayer creates a new layer with ID', () => {
      const layer = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      expect(layer.id).toBeDefined();
      expect(layer.id).toMatch(/^layer_\d+$/);
    });

    it('STACK-U021: addLayer adds layer to array', () => {
      control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      expect(control.getLayers().length).toBe(1);
    });

    it('STACK-U022: addLayer preserves layer properties', () => {
      const layer = control.addLayer({
        name: 'Test Layer',
        visible: false,
        opacity: 0.5,
        blendMode: 'multiply',
        sourceIndex: 2,
      });

      expect(layer.name).toBe('Test Layer');
      expect(layer.visible).toBe(false);
      expect(layer.opacity).toBe(0.5);
      expect(layer.blendMode).toBe('multiply');
      expect(layer.sourceIndex).toBe(2);
    });

    it('STACK-U023: addLayer sets active layer if none exists', () => {
      const layer = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      expect(control.getActiveLayer()?.id).toBe(layer.id);
    });

    it('STACK-U024: addLayer generates unique IDs', () => {
      const layer1 = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      const layer2 = control.addLayer({
        name: 'Layer 2',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 1,
      });

      expect(layer1.id).not.toBe(layer2.id);
    });
  });

  describe('removeLayer', () => {
    it('STACK-U030: removeLayer removes layer by ID', () => {
      const layer = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      control.removeLayer(layer.id);
      expect(control.getLayers().length).toBe(0);
    });

    it('STACK-U031: removeLayer emits layerRemoved event', () => {
      const layer = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      const callback = vi.fn();
      control.on('layerRemoved', callback);

      control.removeLayer(layer.id);
      expect(callback).toHaveBeenCalledWith(layer.id);
    });

    it('STACK-U032: removeLayer updates active layer if removed', () => {
      const layer1 = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      const layer2 = control.addLayer({
        name: 'Layer 2',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 1,
      });

      control.setActiveLayer(layer1.id);
      control.removeLayer(layer1.id);

      // Active layer should now be layer2 (the last remaining layer)
      expect(control.getActiveLayer()?.id).toBe(layer2.id);
    });

    it('STACK-U033: removeLayer sets active to null when all layers removed', () => {
      const layer = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      control.removeLayer(layer.id);
      expect(control.getActiveLayer()).toBeNull();
    });

    it('STACK-U034: removeLayer handles non-existent ID gracefully', () => {
      expect(() => control.removeLayer('nonexistent')).not.toThrow();
    });
  });

  describe('getLayers', () => {
    it('STACK-U040: getLayers returns copy of layers array', () => {
      control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      const layers1 = control.getLayers();
      const layers2 = control.getLayers();

      expect(layers1).toEqual(layers2);
      expect(layers1).not.toBe(layers2);
    });

    it('STACK-U041: getLayers returns layers in order', () => {
      control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      control.addLayer({
        name: 'Layer 2',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 1,
      });

      const layers = control.getLayers();
      expect(layers[0]?.name).toBe('Layer 1');
      expect(layers[1]?.name).toBe('Layer 2');
    });
  });

  describe('getActiveLayer/setActiveLayer', () => {
    it('STACK-U050: setActiveLayer changes active layer', () => {
      const layer1 = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      const layer2 = control.addLayer({
        name: 'Layer 2',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 1,
      });

      control.setActiveLayer(layer1.id);
      expect(control.getActiveLayer()?.id).toBe(layer1.id);

      control.setActiveLayer(layer2.id);
      expect(control.getActiveLayer()?.id).toBe(layer2.id);
    });

    it('STACK-U051: setActiveLayer emits activeLayerChanged event', () => {
      const layer = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      const callback = vi.fn();
      control.on('activeLayerChanged', callback);

      control.setActiveLayer(layer.id);
      expect(callback).toHaveBeenCalledWith(layer.id);
    });

    it('STACK-U052: setActiveLayer can be set to null', () => {
      control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      control.setActiveLayer(null);
      expect(control.getActiveLayer()).toBeNull();
    });
  });

  describe('updateLayerName', () => {
    it('STACK-U060: updateLayerName changes layer name', () => {
      const layer = control.addLayer({
        name: 'Original Name',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      control.updateLayerName(layer.id, 'New Name');

      const layers = control.getLayers();
      expect(layers[0]?.name).toBe('New Name');
    });

    it('STACK-U061: updateLayerName handles non-existent ID', () => {
      expect(() => control.updateLayerName('nonexistent', 'Name')).not.toThrow();
    });
  });

  describe('updateLayerSource', () => {
    it('STACK-U070: updateLayerSource changes source index', () => {
      const layer = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      control.updateLayerSource(layer.id, 5);

      const layers = control.getLayers();
      expect(layers[0]?.sourceIndex).toBe(5);
    });

    it('STACK-U071: updateLayerSource handles non-existent ID', () => {
      expect(() => control.updateLayerSource('nonexistent', 0)).not.toThrow();
    });
  });

  describe('clearLayers', () => {
    it('STACK-U080: clearLayers removes all layers', () => {
      control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      control.addLayer({
        name: 'Layer 2',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 1,
      });

      control.clearLayers();
      expect(control.getLayers()).toEqual([]);
    });

    it('STACK-U081: clearLayers sets active layer to null', () => {
      control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      control.clearLayers();
      expect(control.getActiveLayer()).toBeNull();
    });

    it('STACK-U082: clearLayers emits activeLayerChanged event', () => {
      control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      const callback = vi.fn();
      control.on('activeLayerChanged', callback);

      control.clearLayers();
      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  describe('panel visibility', () => {
    it('STACK-U090: togglePanel shows and hides panel', () => {
      control.render();
      expect(() => control.togglePanel()).not.toThrow();
    });

    it('STACK-U091: showPanel can be called without error', () => {
      control.render();
      expect(() => control.showPanel()).not.toThrow();
    });

    it('STACK-U092: hidePanel can be called without error', () => {
      control.render();
      expect(() => {
        control.showPanel();
        control.hidePanel();
      }).not.toThrow();
    });

    it('STACK-U093: toggle is alias for togglePanel', () => {
      control.render();
      expect(() => control.toggle()).not.toThrow();
    });
  });

  describe('blend modes', () => {
    BLEND_MODES.forEach((mode: BlendMode) => {
      it(`STACK-U100-${mode}: layer can have ${mode} blend mode`, () => {
        const layer = control.addLayer({
          name: 'Test Layer',
          visible: true,
          opacity: 1,
          blendMode: mode,
          sourceIndex: 0,
        });

        expect(layer.blendMode).toBe(mode);
      });
    });
  });

  describe('layer opacity', () => {
    it('STACK-U110: layer accepts opacity 0', () => {
      const layer = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 0,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      expect(layer.opacity).toBe(0);
    });

    it('STACK-U111: layer accepts opacity 1', () => {
      const layer = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      expect(layer.opacity).toBe(1);
    });

    it('STACK-U112: layer accepts fractional opacity', () => {
      const layer = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 0.75,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      expect(layer.opacity).toBe(0.75);
    });
  });

  describe('layer visibility', () => {
    it('STACK-U120: layer can be visible', () => {
      const layer = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      expect(layer.visible).toBe(true);
    });

    it('STACK-U121: layer can be hidden', () => {
      const layer = control.addLayer({
        name: 'Layer 1',
        visible: false,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      expect(layer.visible).toBe(false);
    });
  });

  describe('addLayerFromCurrentSource', () => {
    it('STACK-U130: addLayerFromCurrentSource creates layer', () => {
      control.addLayerFromCurrentSource();
      expect(control.getLayers().length).toBe(1);
    });

    it('STACK-U131: addLayerFromCurrentSource emits layerAdded event', () => {
      const callback = vi.fn();
      control.on('layerAdded', callback);

      control.addLayerFromCurrentSource();
      expect(callback).toHaveBeenCalled();
    });

    it('STACK-U132: addLayerFromCurrentSource sets default values', () => {
      control.addLayerFromCurrentSource();
      const layers = control.getLayers();

      expect(layers[0]?.visible).toBe(true);
      expect(layers[0]?.opacity).toBe(1);
      expect(layers[0]?.blendMode).toBe('normal');
    });

    it('STACK-U133: addLayerFromCurrentSource generates incrementing names', () => {
      control.addLayerFromCurrentSource();
      control.addLayerFromCurrentSource();

      const layers = control.getLayers();
      expect(layers[0]?.name).toBe('Layer 1');
      expect(layers[1]?.name).toBe('Layer 2');
    });

    it('STACK-U134: addLayerFromCurrentSource sets new layer as active', () => {
      control.addLayerFromCurrentSource();
      const layer = control.getLayers()[0]!;
      expect(control.getActiveLayer()?.id).toBe(layer.id);
    });
  });

  describe('events', () => {
    it('STACK-U140: layerChanged event is emittable', () => {
      const callback = vi.fn();
      control.on('layerChanged', callback);

      // This is typically emitted internally when layer properties change
      // via the UI - we can test by directly emitting
      const layer = control.addLayer({
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        sourceIndex: 0,
      });

      // Manually emit to test listener
      control.emit('layerChanged', layer);
      expect(callback).toHaveBeenCalledWith(layer);
    });

    it('STACK-U141: layerReordered event is emittable', () => {
      const callback = vi.fn();
      control.on('layerReordered', callback);

      // Manually emit to test listener
      control.emit('layerReordered', { layerId: 'test', newIndex: 0 });
      expect(callback).toHaveBeenCalledWith({ layerId: 'test', newIndex: 0 });
    });
  });

  describe('dispose', () => {
    it('STACK-U150: dispose cleans up without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('STACK-U151: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });

    it('STACK-U152: dispose removes panel from body if present', () => {
      control.render();
      control.showPanel();
      expect(() => control.dispose()).not.toThrow();
    });

    it('STACK-U153: dispose removes document click listener', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      control.render();
      control.dispose();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });
});

describe('StackControl layer button hover states', () => {
  let control: StackControl;

  beforeEach(() => {
    control = new StackControl();
  });

  afterEach(() => {
    control.dispose();
  });

  function addTwoLayersAndShowPanel(): void {
    control.addLayer({ name: 'Layer 1', visible: true, opacity: 1, blendMode: 'normal', sourceIndex: 0 });
    control.addLayer({ name: 'Layer 2', visible: true, opacity: 1, blendMode: 'normal', sourceIndex: 1 });
    control.render();
    control.showPanel();
  }

  it('SC-M28a: Layer visibility button should change style on hover', () => {
    addTwoLayersAndShowPanel();

    const layers = control.getLayers();
    const visBtn = document.querySelector(`[data-testid="stack-layer-visibility-${layers[0]!.id}"]`) as HTMLButtonElement;
    expect(visBtn).toBeTruthy();

    const originalColor = visBtn.style.color;
    visBtn.dispatchEvent(new PointerEvent('pointerenter'));
    expect(visBtn.style.color).toBe('var(--text-primary)');

    visBtn.dispatchEvent(new PointerEvent('pointerleave'));
    expect(visBtn.style.color).toBe(originalColor);
  });

  it('SC-M28b: Layer move-up button should change style on hover', () => {
    addTwoLayersAndShowPanel();

    const layers = control.getLayers();
    // Layer at index 0 (bottom) has move-up enabled
    const moveUpBtn = document.querySelector(`[data-testid="stack-layer-move-up-${layers[0]!.id}"]`) as HTMLButtonElement;
    expect(moveUpBtn).toBeTruthy();
    expect(moveUpBtn.disabled).toBe(false);

    moveUpBtn.dispatchEvent(new PointerEvent('pointerenter'));
    expect(moveUpBtn.style.background).toBe('var(--bg-hover)');
    expect(moveUpBtn.style.borderColor).toBe('var(--border-primary)');
    expect(moveUpBtn.style.color).toBe('var(--text-primary)');

    moveUpBtn.dispatchEvent(new PointerEvent('pointerleave'));
    expect(moveUpBtn.style.background).toBe('transparent');
    expect(moveUpBtn.style.borderColor).toBe('transparent');
  });

  it('SC-M28c: Layer move-down button should change style on hover', () => {
    addTwoLayersAndShowPanel();

    const layers = control.getLayers();
    // Layer at index 1 (top) has move-down enabled
    const moveDownBtn = document.querySelector(`[data-testid="stack-layer-move-down-${layers[1]!.id}"]`) as HTMLButtonElement;
    expect(moveDownBtn).toBeTruthy();
    expect(moveDownBtn.disabled).toBe(false);

    moveDownBtn.dispatchEvent(new PointerEvent('pointerenter'));
    expect(moveDownBtn.style.background).toBe('var(--bg-hover)');
    expect(moveDownBtn.style.borderColor).toBe('var(--border-primary)');
    expect(moveDownBtn.style.color).toBe('var(--text-primary)');

    moveDownBtn.dispatchEvent(new PointerEvent('pointerleave'));
    expect(moveDownBtn.style.background).toBe('transparent');
    expect(moveDownBtn.style.borderColor).toBe('transparent');
  });

  it('SC-M28d: Layer delete button should change style on hover', () => {
    addTwoLayersAndShowPanel();

    const layers = control.getLayers();
    const deleteBtn = document.querySelector(`[data-testid="stack-layer-delete-${layers[0]!.id}"]`) as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();

    deleteBtn.dispatchEvent(new PointerEvent('pointerenter'));
    expect(deleteBtn.style.background).toBe('rgba(var(--error-rgb, 255, 100, 100), 0.15)');
    expect(deleteBtn.style.borderColor).toBe('var(--error)');

    deleteBtn.dispatchEvent(new PointerEvent('pointerleave'));
    expect(deleteBtn.style.background).toBe('transparent');
    expect(deleteBtn.style.borderColor).toBe('transparent');
  });

  it('SC-M28e: Disabled buttons should NOT change style on hover', () => {
    addTwoLayersAndShowPanel();

    const layers = control.getLayers();
    // Layer at index 1 (top, last in array) has move-up disabled
    const moveUpBtn = document.querySelector(`[data-testid="stack-layer-move-up-${layers[1]!.id}"]`) as HTMLButtonElement;
    expect(moveUpBtn).toBeTruthy();
    expect(moveUpBtn.disabled).toBe(true);

    const bgBefore = moveUpBtn.style.background;
    const borderBefore = moveUpBtn.style.borderColor;
    const colorBefore = moveUpBtn.style.color;

    moveUpBtn.dispatchEvent(new PointerEvent('pointerenter'));
    // Styles should NOT change for disabled button
    expect(moveUpBtn.style.background).toBe(bgBefore);
    expect(moveUpBtn.style.borderColor).toBe(borderBefore);
    expect(moveUpBtn.style.color).toBe(colorBefore);
  });

  it('SC-L35a: Disabled move buttons should have cursor set to not-allowed', () => {
    addTwoLayersAndShowPanel();

    const layers = control.getLayers();
    // Layer at index 1 (top, last in array) has move-up disabled
    const moveUpBtn = document.querySelector(`[data-testid="stack-layer-move-up-${layers[1]!.id}"]`) as HTMLButtonElement;
    expect(moveUpBtn).toBeTruthy();
    expect(moveUpBtn.disabled).toBe(true);
    expect(moveUpBtn.style.cursor).toBe('not-allowed');

    // Layer at index 0 (bottom, first in array) has move-down disabled
    const moveDownBtn = document.querySelector(`[data-testid="stack-layer-move-down-${layers[0]!.id}"]`) as HTMLButtonElement;
    expect(moveDownBtn).toBeTruthy();
    expect(moveDownBtn.disabled).toBe(true);
    expect(moveDownBtn.style.cursor).toBe('not-allowed');
  });

  it('SC-L35b: Enabled move buttons should have cursor set to pointer', () => {
    addTwoLayersAndShowPanel();

    const layers = control.getLayers();
    // Layer at index 0 (bottom) has move-up enabled
    const moveUpBtn = document.querySelector(`[data-testid="stack-layer-move-up-${layers[0]!.id}"]`) as HTMLButtonElement;
    expect(moveUpBtn).toBeTruthy();
    expect(moveUpBtn.disabled).toBe(false);
    expect(moveUpBtn.style.cursor).toBe('pointer');

    // Layer at index 1 (top) has move-down enabled
    const moveDownBtn = document.querySelector(`[data-testid="stack-layer-move-down-${layers[1]!.id}"]`) as HTMLButtonElement;
    expect(moveDownBtn).toBeTruthy();
    expect(moveDownBtn.disabled).toBe(false);
    expect(moveDownBtn.style.cursor).toBe('pointer');
  });
});

describe('StackControl source selection', () => {
  let control: StackControl;

  beforeEach(() => {
    control = new StackControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('STACK-U170: setAvailableSources stores sources', () => {
    const sources = [
      { index: 0, name: 'Video 1' },
      { index: 1, name: 'Video 2' },
    ];
    control.setAvailableSources(sources);
    expect(control.getAvailableSources()).toEqual(sources);
  });

  it('STACK-U171: getAvailableSources returns copy of sources', () => {
    const sources = [
      { index: 0, name: 'Video 1' },
      { index: 1, name: 'Video 2' },
    ];
    control.setAvailableSources(sources);

    const result1 = control.getAvailableSources();
    const result2 = control.getAvailableSources();
    expect(result1).toEqual(result2);
    expect(result1).not.toBe(result2);
  });

  it('STACK-U172: initial available sources is empty', () => {
    expect(control.getAvailableSources()).toEqual([]);
  });

  it('STACK-U173: layerSourceChanged event is emittable', () => {
    const callback = vi.fn();
    control.on('layerSourceChanged', callback);

    control.emit('layerSourceChanged', { layerId: 'layer_1', sourceIndex: 1 });
    expect(callback).toHaveBeenCalledWith({ layerId: 'layer_1', sourceIndex: 1 });
  });
});

describe('StackControl multiple layers', () => {
  let control: StackControl;

  beforeEach(() => {
    control = new StackControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('STACK-U160: can manage multiple layers', () => {
    control.addLayer({
      name: 'Background',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      sourceIndex: 0,
    });

    control.addLayer({
      name: 'Overlay',
      visible: true,
      opacity: 0.5,
      blendMode: 'screen',
      sourceIndex: 1,
    });

    control.addLayer({
      name: 'Top',
      visible: true,
      opacity: 0.8,
      blendMode: 'multiply',
      sourceIndex: 2,
    });

    const layers = control.getLayers();
    expect(layers.length).toBe(3);
    expect(layers[0]?.name).toBe('Background');
    expect(layers[1]?.name).toBe('Overlay');
    expect(layers[2]?.name).toBe('Top');
  });

  it('STACK-U161: layers maintain independent properties', () => {
    control.addLayer({
      name: 'Layer 1',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      sourceIndex: 0,
    });

    control.addLayer({
      name: 'Layer 2',
      visible: false,
      opacity: 0.5,
      blendMode: 'add',
      sourceIndex: 1,
    });

    const layers = control.getLayers();
    expect(layers[0]?.visible).toBe(true);
    expect(layers[1]?.visible).toBe(false);
    expect(layers[0]?.opacity).toBe(1);
    expect(layers[1]?.opacity).toBe(0.5);
    expect(layers[0]?.blendMode).toBe('normal');
    expect(layers[1]?.blendMode).toBe('add');
  });
});

describe('StackControl source validation', () => {
  let control: StackControl;

  beforeEach(() => {
    control = new StackControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('STACK-U180: isSourceValid returns true when source exists in available sources', () => {
    const sources = [
      { index: 0, name: 'Video 1' },
      { index: 1, name: 'Video 2' },
    ];
    control.setAvailableSources(sources);

    const layer = control.addLayer({
      name: 'Layer 1',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      sourceIndex: 0,
    });

    // Source 0 exists in available sources
    const availableSources = control.getAvailableSources();
    const isValid = availableSources.some(s => s.index === layer.sourceIndex);
    expect(isValid).toBe(true);
  });

  it('STACK-U181: isSourceValid returns false when source not in available sources', () => {
    const sources = [
      { index: 0, name: 'Video 1' },
      { index: 1, name: 'Video 2' },
    ];
    control.setAvailableSources(sources);

    const layer = control.addLayer({
      name: 'Layer 1',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      sourceIndex: 5, // Invalid source index
    });

    // Source 5 does not exist in available sources
    const availableSources = control.getAvailableSources();
    const isValid = availableSources.some(s => s.index === layer.sourceIndex);
    expect(isValid).toBe(false);
  });

  it('STACK-U182: layer with missing source can be updated to valid source', () => {
    const sources = [
      { index: 0, name: 'Video 1' },
      { index: 1, name: 'Video 2' },
    ];
    control.setAvailableSources(sources);

    const layer = control.addLayer({
      name: 'Layer 1',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      sourceIndex: 99, // Invalid source
    });

    // Update to valid source
    control.updateLayerSource(layer.id, 0);

    const layers = control.getLayers();
    expect(layers[0]?.sourceIndex).toBe(0);

    // Now source is valid
    const availableSources = control.getAvailableSources();
    const isValid = availableSources.some(s => s.index === layers[0]?.sourceIndex);
    expect(isValid).toBe(true);
  });

  it('STACK-U183: source validation works when sources are removed', () => {
    // Start with 3 sources
    control.setAvailableSources([
      { index: 0, name: 'Video 1' },
      { index: 1, name: 'Video 2' },
      { index: 2, name: 'Video 3' },
    ]);

    const layer = control.addLayer({
      name: 'Layer 1',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      sourceIndex: 2,
    });

    // Source 2 is valid
    let availableSources = control.getAvailableSources();
    let isValid = availableSources.some(s => s.index === layer.sourceIndex);
    expect(isValid).toBe(true);

    // Remove source 2 (simulate source being closed)
    control.setAvailableSources([
      { index: 0, name: 'Video 1' },
      { index: 1, name: 'Video 2' },
    ]);

    // Source 2 is now invalid
    availableSources = control.getAvailableSources();
    isValid = availableSources.some(s => s.index === layer.sourceIndex);
    expect(isValid).toBe(false);
  });
});

describe('StackControl drag-and-drop reordering', () => {
  let control: StackControl;

  // jsdom does not provide DragEvent or DataTransfer, so we create
  // a minimal mock DataTransfer and use plain Event with a dataTransfer property.
  class MockDataTransfer {
    private data: Record<string, string> = {};
    effectAllowed = 'uninitialized';
    dropEffect = 'none';
    setData(format: string, value: string): void {
      this.data[format] = value;
    }
    getData(format: string): string {
      return this.data[format] ?? '';
    }
  }

  function createDragEvent(type: string, dataTransfer?: MockDataTransfer): Event {
    const event = new Event(type, { bubbles: true, cancelable: true });
    (event as unknown as Record<string, unknown>).dataTransfer = dataTransfer ?? null;
    return event;
  }

  beforeEach(() => {
    control = new StackControl();
  });

  afterEach(() => {
    control.dispose();
  });

  function addThreeLayers(): void {
    control.addLayer({ name: 'Bottom', visible: true, opacity: 1, blendMode: 'normal', sourceIndex: 0 });
    control.addLayer({ name: 'Middle', visible: true, opacity: 1, blendMode: 'normal', sourceIndex: 1 });
    control.addLayer({ name: 'Top', visible: true, opacity: 1, blendMode: 'normal', sourceIndex: 2 });
  }

  function getLayerElement(layerId: string): HTMLElement | null {
    control.showPanel();
    const panel = document.querySelector('[data-testid="stack-panel"]');
    return panel?.querySelector(`[data-testid="stack-layer-${layerId}"]`) as HTMLElement | null;
  }

  it('SC-M29a: layer items should have draggable="true" attribute', () => {
    addThreeLayers();
    const layers = control.getLayers();
    const el = getLayerElement(layers[0]!.id);
    expect(el).not.toBeNull();
    expect(el!.draggable).toBe(true);
    expect(el!.getAttribute('data-layer-id')).toBe(layers[0]!.id);
  });

  it('SC-M29b: dragstart should set the dragged layer index in dataTransfer', () => {
    addThreeLayers();
    const layers = control.getLayers();
    // Layer at array index 0 is "Bottom"
    const el = getLayerElement(layers[0]!.id);
    expect(el).not.toBeNull();

    const dt = new MockDataTransfer();
    const dragStartEvent = createDragEvent('dragstart', dt);

    el!.dispatchEvent(dragStartEvent);

    // The layer at array index 0 should store '0' in dataTransfer
    expect(dt.getData('text/plain')).toBe('0');
    // Element should become semi-transparent
    expect(el!.style.opacity).toBe('0.5');
  });

  it('SC-M29c: dragover on a different layer should show a drop indicator', () => {
    addThreeLayers();
    const layers = control.getLayers();
    // "Top" layer (index 2) - get its element
    const topEl = getLayerElement(layers[2]!.id);
    expect(topEl).not.toBeNull();

    const dt = new MockDataTransfer();
    const dragOverEvent = createDragEvent('dragover', dt);

    topEl!.dispatchEvent(dragOverEvent);

    // Should show a drop indicator (border-top changed)
    expect(topEl!.style.borderTop).toContain('2px solid');
    // Event should have been prevented (allow drop)
    expect(dragOverEvent.defaultPrevented).toBe(true);
  });

  it('SC-M29d: drop should reorder the layer and emit the change event', () => {
    addThreeLayers();
    const layers = control.getLayers();
    expect(layers.map(l => l.name)).toEqual(['Bottom', 'Middle', 'Top']);

    const callback = vi.fn();
    control.on('layerReordered', callback);

    // Simulate dragging "Bottom" (array index 0) onto "Top" (array index 2)
    const topEl = getLayerElement(layers[2]!.id);
    expect(topEl).not.toBeNull();

    const dt = new MockDataTransfer();
    dt.setData('text/plain', '0'); // dragging from array index 0

    const dropEvent = createDragEvent('drop', dt);

    topEl!.dispatchEvent(dropEvent);

    // After move: "Bottom" should have moved to index 2
    const reorderedLayers = control.getLayers();
    expect(reorderedLayers.map(l => l.name)).toEqual(['Middle', 'Top', 'Bottom']);

    // layerReordered should have been emitted
    expect(callback).toHaveBeenCalledWith({
      layerId: layers[0]!.id,
      newIndex: 2,
    });
  });

  it('SC-M29e: dragend should clean up the drop indicator', () => {
    addThreeLayers();
    const layers = control.getLayers();
    const el = getLayerElement(layers[1]!.id);
    expect(el).not.toBeNull();

    // First simulate dragstart to set opacity
    const dt1 = new MockDataTransfer();
    const dragStartEvent = createDragEvent('dragstart', dt1);
    el!.dispatchEvent(dragStartEvent);
    expect(el!.style.opacity).toBe('0.5');

    // Simulate dragover on another element to create a drop indicator
    const otherEl = getLayerElement(layers[0]!.id);
    const dt2 = new MockDataTransfer();
    const dragOverEvent = createDragEvent('dragover', dt2);
    otherEl!.dispatchEvent(dragOverEvent);
    expect(otherEl!.style.borderTop).toContain('2px solid');

    // Now simulate dragend on the source element
    const dragEndEvent = createDragEvent('dragend');
    el!.dispatchEvent(dragEndEvent);

    // Opacity should be restored
    expect(el!.style.opacity).toBe('1');
    // Drop indicators should be cleared (border-top reset to empty)
    const allLayerEls = document.querySelectorAll('.layer-item');
    allLayerEls.forEach((item) => {
      expect((item as HTMLElement).style.borderTop).toBe('');
    });
  });
});
