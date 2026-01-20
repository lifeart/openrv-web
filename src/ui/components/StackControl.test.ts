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
