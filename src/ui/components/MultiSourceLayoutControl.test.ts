/**
 * MultiSourceLayoutControl Tests
 *
 * Tests for the multi-source layout dropdown UI, including
 * current source tracking, tile source reassignment, and add behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MultiSourceLayoutControl } from './MultiSourceLayoutControl';
import { MultiSourceLayoutManager } from '../multisource/MultiSourceLayoutManager';
import { MultiSourceLayoutStore } from '../multisource/MultiSourceLayoutStore';

describe('MultiSourceLayoutControl', () => {
  let store: MultiSourceLayoutStore;
  let manager: MultiSourceLayoutManager;
  let control: MultiSourceLayoutControl;

  beforeEach(() => {
    store = new MultiSourceLayoutStore();
    manager = new MultiSourceLayoutManager(store);
    control = new MultiSourceLayoutControl(manager);
  });

  afterEach(() => {
    control.dispose();
    manager.dispose();
  });

  describe('initialization', () => {
    it('MSL-U001: should render a container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.dataset.testid).toBe('layout-control');
    });

    it('MSL-U002: should have the layout button', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="layout-control-button"]');
      expect(button).not.toBeNull();
    });

    it('MSL-U003: should default currentSourceIndex to 0', () => {
      expect(control.getCurrentSourceIndex()).toBe(0);
    });

    it('MSL-U004: should default sourceCount to 1', () => {
      expect(control.getSourceCount()).toBe(1);
    });
  });

  describe('current source tracking', () => {
    it('MSL-U010: setCurrentSourceIndex updates the tracked index', () => {
      control.setCurrentSourceIndex(3);
      expect(control.getCurrentSourceIndex()).toBe(3);
    });

    it('MSL-U011: setSourceCount updates the available source count', () => {
      control.setSourceCount(5);
      expect(control.getSourceCount()).toBe(5);
    });

    it('MSL-U012: setSourceCount clamps to at least 1', () => {
      control.setSourceCount(0);
      expect(control.getSourceCount()).toBe(1);
    });
  });

  describe('add current source', () => {
    it('MSL-U020: adding source uses the actual current source index, not hardcoded 0', () => {
      control.setCurrentSourceIndex(2);

      // Open dropdown and click add button
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const addBtn = document.querySelector('[data-testid="layout-add-source"]') as HTMLButtonElement;
      expect(addBtn).not.toBeNull();
      addBtn.click();

      const tiles = manager.getTiles();
      expect(tiles).toHaveLength(1);
      expect(tiles[0]!.sourceIndex).toBe(2);

      document.body.removeChild(el);
    });

    it('MSL-U021: adding source with index 0 works when currentSourceIndex is 0', () => {
      control.setCurrentSourceIndex(0);

      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const addBtn = document.querySelector('[data-testid="layout-add-source"]') as HTMLButtonElement;
      addBtn.click();

      const tiles = manager.getTiles();
      expect(tiles).toHaveLength(1);
      expect(tiles[0]!.sourceIndex).toBe(0);

      document.body.removeChild(el);
    });

    it('MSL-U022: adding multiple sources uses the current source index each time', () => {
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      // Add source with index 1
      control.setCurrentSourceIndex(1);
      let addBtn = document.querySelector('[data-testid="layout-add-source"]') as HTMLButtonElement;
      addBtn.click();

      // Change source index and add again
      control.setCurrentSourceIndex(3);
      addBtn = document.querySelector('[data-testid="layout-add-source"]') as HTMLButtonElement;
      addBtn.click();

      const tiles = manager.getTiles();
      expect(tiles).toHaveLength(2);
      expect(tiles[0]!.sourceIndex).toBe(1);
      expect(tiles[1]!.sourceIndex).toBe(3);

      document.body.removeChild(el);
    });
  });

  describe('tile source selector', () => {
    it('MSL-U030: tile rows contain a source selector dropdown', () => {
      // Add a tile first
      manager.addSource(0);

      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const tiles = manager.getTiles();
      const selectTestId = `layout-tile-source-select-${tiles[0]!.id}`;
      const select = document.querySelector(`[data-testid="${selectTestId}"]`) as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.tagName).toBe('SELECT');

      document.body.removeChild(el);
    });

    it('MSL-U031: source selector reflects the tile current source index', () => {
      manager.addSource(2);
      control.setSourceCount(4);

      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const tiles = manager.getTiles();
      const select = document.querySelector(
        `[data-testid="layout-tile-source-select-${tiles[0]!.id}"]`,
      ) as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.value).toBe('2');

      document.body.removeChild(el);
    });

    it('MSL-U032: source selector has options for all available sources', () => {
      manager.addSource(0);
      control.setSourceCount(4);

      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const tiles = manager.getTiles();
      const select = document.querySelector(
        `[data-testid="layout-tile-source-select-${tiles[0]!.id}"]`,
      ) as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.options).toHaveLength(4);
      expect(select.options[0]!.textContent).toBe('Source 1');
      expect(select.options[1]!.textContent).toBe('Source 2');
      expect(select.options[2]!.textContent).toBe('Source 3');
      expect(select.options[3]!.textContent).toBe('Source 4');

      document.body.removeChild(el);
    });

    it('MSL-U033: changing source selector updates the tile source assignment', () => {
      manager.addSource(0);
      control.setSourceCount(4);

      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const tiles = manager.getTiles();
      const tileId = tiles[0]!.id;
      const select = document.querySelector(`[data-testid="layout-tile-source-select-${tileId}"]`) as HTMLSelectElement;

      // Change the source to index 3
      select.value = '3';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      // Verify the store was updated
      const updatedTile = store.getTile(tileId);
      expect(updatedTile).toBeDefined();
      expect(updatedTile!.sourceIndex).toBe(3);

      document.body.removeChild(el);
    });

    it('MSL-U034: multiple tiles each have independent source selectors', () => {
      manager.addSource(0);
      manager.addSource(1);
      control.setSourceCount(3);

      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const tiles = manager.getTiles();
      const select0 = document.querySelector(
        `[data-testid="layout-tile-source-select-${tiles[0]!.id}"]`,
      ) as HTMLSelectElement;
      const select1 = document.querySelector(
        `[data-testid="layout-tile-source-select-${tiles[1]!.id}"]`,
      ) as HTMLSelectElement;

      expect(select0).not.toBeNull();
      expect(select1).not.toBeNull();
      expect(select0.value).toBe('0');
      expect(select1.value).toBe('1');

      // Change second tile to source 2
      select1.value = '2';
      select1.dispatchEvent(new Event('change', { bubbles: true }));

      const updatedTile = store.getTile(tiles[1]!.id);
      expect(updatedTile!.sourceIndex).toBe(2);

      // First tile should still be source 0
      const firstTile = store.getTile(tiles[0]!.id);
      expect(firstTile!.sourceIndex).toBe(0);

      document.body.removeChild(el);
    });
  });

  describe('store setTileSourceIndex', () => {
    it('MSL-U040: setTileSourceIndex updates source index and label', () => {
      store.addSource(0, 'Source 1');
      const tiles = store.getTiles();
      const tileId = tiles[0]!.id;

      store.setTileSourceIndex(tileId, 3);

      const updated = store.getTile(tileId);
      expect(updated!.sourceIndex).toBe(3);
      expect(updated!.label).toBe('Source 4');
    });

    it('MSL-U041: setTileSourceIndex with custom label preserves it', () => {
      store.addSource(0);
      const tiles = store.getTiles();
      const tileId = tiles[0]!.id;

      store.setTileSourceIndex(tileId, 2, 'My Custom Source');

      const updated = store.getTile(tileId);
      expect(updated!.sourceIndex).toBe(2);
      expect(updated!.label).toBe('My Custom Source');
    });

    it('MSL-U042: setTileSourceIndex emits layoutChanged when source changes', () => {
      store.addSource(0);
      const tiles = store.getTiles();
      const tileId = tiles[0]!.id;

      let emitted = false;
      store.on('layoutChanged', () => {
        emitted = true;
      });

      store.setTileSourceIndex(tileId, 2);
      expect(emitted).toBe(true);
    });

    it('MSL-U043: setTileSourceIndex does not emit when source is unchanged', () => {
      store.addSource(0);
      const tiles = store.getTiles();
      const tileId = tiles[0]!.id;

      let emitCount = 0;
      store.on('layoutChanged', () => {
        emitCount++;
      });

      store.setTileSourceIndex(tileId, 0);
      expect(emitCount).toBe(0);
    });

    it('MSL-U044: setTileSourceIndex ignores invalid tile ID', () => {
      store.addSource(0);

      // Should not throw
      store.setTileSourceIndex('nonexistent-tile', 2);

      const tiles = store.getTiles();
      expect(tiles[0]!.sourceIndex).toBe(0);
    });
  });

  describe('manager setTileSourceIndex', () => {
    it('MSL-U050: manager delegates setTileSourceIndex to store', () => {
      manager.addSource(0);
      const tiles = manager.getTiles();
      const tileId = tiles[0]!.id;

      manager.setTileSourceIndex(tileId, 5);

      const updated = store.getTile(tileId);
      expect(updated!.sourceIndex).toBe(5);
    });
  });

  describe('add source at max capacity', () => {
    it('MSL-U060: add button is disabled when tile count reaches MAX_TILE_COUNT', () => {
      // Fill to max capacity
      for (let i = 0; i < 16; i++) {
        manager.addSource(i);
      }

      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const addBtn = document.querySelector('[data-testid="layout-add-source"]') as HTMLButtonElement;
      expect(addBtn).not.toBeNull();
      expect(addBtn.disabled).toBe(true);

      document.body.removeChild(el);
    });

    it('MSL-U061: store addSource returns null at max capacity', () => {
      for (let i = 0; i < 16; i++) {
        store.addSource(i);
      }

      const result = store.addSource(99);
      expect(result).toBeNull();
      expect(store.getTileCount()).toBe(16);
    });
  });

  describe('tile removal via UI', () => {
    it('MSL-U070: clicking remove button removes the tile from store', () => {
      manager.addSource(0);
      manager.addSource(1);

      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const tiles = manager.getTiles();
      const tileRow = document.querySelector(`[data-testid="layout-tile-${tiles[1]!.id}"]`);
      expect(tileRow).not.toBeNull();

      const removeBtn = tileRow!.querySelector('button[title]') as HTMLButtonElement;
      expect(removeBtn).not.toBeNull();
      removeBtn.click();

      expect(manager.getTileCount()).toBe(1);
      expect(manager.getTiles()[0]!.sourceIndex).toBe(0);

      document.body.removeChild(el);
    });
  });

  describe('source count change refreshes dropdown', () => {
    it('MSL-U080: setSourceCount while dropdown is open updates selector options', () => {
      manager.addSource(0);
      control.setSourceCount(2);

      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const tiles = manager.getTiles();
      const selectTestId = `layout-tile-source-select-${tiles[0]!.id}`;

      // Initially 2 options
      let select = document.querySelector(`[data-testid="${selectTestId}"]`) as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.options).toHaveLength(2);

      // Update source count while open
      control.setSourceCount(5);

      // The dropdown should have been refreshed
      select = document.querySelector(`[data-testid="${selectTestId}"]`) as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.options).toHaveLength(5);

      document.body.removeChild(el);
    });
  });

  describe('setTileSourceIndex label change detection', () => {
    it('MSL-U045: setTileSourceIndex emits when only label changes', () => {
      store.addSource(0, 'Source 1');
      const tiles = store.getTiles();
      const tileId = tiles[0]!.id;

      let emitted = false;
      store.on('layoutChanged', () => {
        emitted = true;
      });

      // Same sourceIndex (0), different label
      store.setTileSourceIndex(tileId, 0, 'Custom Label');
      expect(emitted).toBe(true);

      const updated = store.getTile(tileId);
      expect(updated!.label).toBe('Custom Label');
      expect(updated!.sourceIndex).toBe(0);
    });

    it('MSL-U046: setTileSourceIndex does not emit when both source and label unchanged', () => {
      store.addSource(0, 'Source 1');
      const tiles = store.getTiles();
      const tileId = tiles[0]!.id;

      let emitCount = 0;
      store.on('layoutChanged', () => {
        emitCount++;
      });

      // Same sourceIndex AND same label (auto-generated: "Source 1")
      store.setTileSourceIndex(tileId, 0);
      expect(emitCount).toBe(0);
    });
  });

  describe('accessibility', () => {
    it('MSL-U090: source selector has aria-label', () => {
      manager.addSource(0);

      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const tiles = manager.getTiles();
      const select = document.querySelector(
        `[data-testid="layout-tile-source-select-${tiles[0]!.id}"]`,
      ) as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.getAttribute('aria-label')).toBe(`Source for ${tiles[0]!.label}`);

      document.body.removeChild(el);
    });
  });

  describe('keyboard navigation (#80)', () => {
    it('MSL-U060: ArrowDown moves focus between dropdown items', () => {
      const el = control.render();
      document.body.appendChild(el);

      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const dropdown = document.querySelector('[data-testid="layout-control-dropdown"]') as HTMLElement;
      const focusable = Array.from(
        dropdown.querySelectorAll<HTMLElement>('button, select, input, [tabindex="0"]'),
      ).filter((el) => !(el as HTMLButtonElement).disabled);
      expect(focusable.length).toBeGreaterThan(1);

      focusable[0]!.focus();
      expect(document.activeElement).toBe(focusable[0]);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(focusable[1]);

      document.body.removeChild(el);
    });

    it('MSL-U061: ArrowUp moves focus to previous item', () => {
      const el = control.render();
      document.body.appendChild(el);

      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const dropdown = document.querySelector('[data-testid="layout-control-dropdown"]') as HTMLElement;
      const focusable = Array.from(
        dropdown.querySelectorAll<HTMLElement>('button, select, input, [tabindex="0"]'),
      ).filter((el) => !(el as HTMLButtonElement).disabled);

      focusable[1]!.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(focusable[0]);

      document.body.removeChild(el);
    });

    it('MSL-U062: Home and End navigate to first and last items', () => {
      const el = control.render();
      document.body.appendChild(el);

      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const dropdown = document.querySelector('[data-testid="layout-control-dropdown"]') as HTMLElement;
      const focusable = Array.from(
        dropdown.querySelectorAll<HTMLElement>('button, select, input, [tabindex="0"]'),
      ).filter((el) => !(el as HTMLButtonElement).disabled);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      expect(document.activeElement).toBe(focusable[focusable.length - 1]);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      expect(document.activeElement).toBe(focusable[0]);

      document.body.removeChild(el);
    });

    it('MSL-U063: Escape closes the dropdown', () => {
      const el = control.render();
      document.body.appendChild(el);

      const button = el.querySelector('[data-testid="layout-control-button"]') as HTMLButtonElement;
      button.click();

      const dropdown = document.querySelector('[data-testid="layout-control-dropdown"]') as HTMLElement;
      expect(dropdown.style.display).toBe('flex');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(dropdown.style.display).toBe('none');

      document.body.removeChild(el);
    });
  });
});
