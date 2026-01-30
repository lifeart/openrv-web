import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DropdownMenu, closeAllDropdowns, getOpenDropdownCount, _resetDropdownState } from './DropdownMenu';

describe('DropdownMenu', () => {
  let dropdown: DropdownMenu;
  let anchor: HTMLButtonElement;

  beforeEach(() => {
    // Create anchor element
    anchor = document.createElement('button');
    anchor.style.cssText = 'position: fixed; top: 100px; left: 100px; width: 100px; height: 30px;';
    document.body.appendChild(anchor);

    dropdown = new DropdownMenu();
    dropdown.setItems([
      { value: 'item1', label: 'Item 1' },
      { value: 'item2', label: 'Item 2' },
      { value: 'item3', label: 'Item 3' },
    ]);
  });

  afterEach(() => {
    dropdown.dispose();
    closeAllDropdowns();
    _resetDropdownState();
    document.body.innerHTML = '';
  });

  describe('initialization', () => {
    it('DM-001: creates dropdown element', () => {
      const element = dropdown.getElement();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.classList.contains('dropdown-menu')).toBe(true);
    });

    it('DM-002: sets items correctly', () => {
      const items = dropdown.getItems();
      expect(items.length).toBe(3);
      expect(items[0]?.value).toBe('item1');
      expect(items[1]?.label).toBe('Item 2');
    });

    it('DM-003: starts closed', () => {
      expect(dropdown.isVisible()).toBe(false);
    });
  });

  describe('open/close', () => {
    it('DM-010: opens dropdown', () => {
      dropdown.open(anchor);
      expect(dropdown.isVisible()).toBe(true);
      expect(dropdown.getElement().style.display).toBe('flex');
    });

    it('DM-011: closes dropdown', () => {
      dropdown.open(anchor);
      dropdown.close();
      expect(dropdown.isVisible()).toBe(false);
      expect(dropdown.getElement().style.display).toBe('none');
    });

    it('DM-012: toggles dropdown', () => {
      dropdown.toggle(anchor);
      expect(dropdown.isVisible()).toBe(true);

      dropdown.toggle(anchor);
      expect(dropdown.isVisible()).toBe(false);
    });

    it('DM-013: adds element to document body when opened', () => {
      dropdown.open(anchor);
      expect(document.body.contains(dropdown.getElement())).toBe(true);
    });

    it('DM-014: calls onClose callback', () => {
      const onClose = vi.fn();
      const dropdownWithCallback = new DropdownMenu({ onClose });
      dropdownWithCallback.setItems([{ value: 'test', label: 'Test' }]);

      dropdownWithCallback.open(anchor);
      dropdownWithCallback.close();

      expect(onClose).toHaveBeenCalled();
      dropdownWithCallback.dispose();
    });
  });

  describe('item selection', () => {
    it('DM-020: calls onSelect when item clicked', () => {
      const onSelect = vi.fn();
      const dropdownWithCallback = new DropdownMenu({ onSelect });
      dropdownWithCallback.setItems([
        { value: 'item1', label: 'Item 1' },
        { value: 'item2', label: 'Item 2' },
      ]);

      dropdownWithCallback.open(anchor);

      const buttons = dropdownWithCallback.getElement().querySelectorAll('button');
      (buttons[1] as HTMLButtonElement).click();

      expect(onSelect).toHaveBeenCalledWith('item2');
      dropdownWithCallback.dispose();
    });

    it('DM-021: closes after selection', () => {
      const onSelect = vi.fn();
      const dropdownWithCallback = new DropdownMenu({ onSelect });
      dropdownWithCallback.setItems([{ value: 'item1', label: 'Item 1' }]);

      dropdownWithCallback.open(anchor);
      const button = dropdownWithCallback.getElement().querySelector('button');
      (button as HTMLButtonElement).click();

      expect(dropdownWithCallback.isVisible()).toBe(false);
      dropdownWithCallback.dispose();
    });

    it('DM-022: setSelectedValue highlights item', () => {
      dropdown.open(anchor);
      dropdown.setSelectedValue('item2');

      const buttons = dropdown.getElement().querySelectorAll('button');
      expect((buttons[1] as HTMLButtonElement).style.background).toContain('rgba');
    });
  });

  describe('keyboard navigation', () => {
    it('DM-030: ArrowDown moves to next item', () => {
      dropdown.open(anchor);

      // First item should be highlighted by default
      const buttons = dropdown.getElement().querySelectorAll('button');
      expect((buttons[0] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');

      // Press ArrowDown
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      expect((buttons[1] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    });

    it('DM-031: ArrowUp moves to previous item', () => {
      dropdown.open(anchor);

      // Move down first
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      // Then move up
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

      const buttons = dropdown.getElement().querySelectorAll('button');
      expect((buttons[0] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    });

    it('DM-032: Enter selects highlighted item', () => {
      const onSelect = vi.fn();
      const dropdownWithCallback = new DropdownMenu({ onSelect });
      dropdownWithCallback.setItems([
        { value: 'item1', label: 'Item 1' },
        { value: 'item2', label: 'Item 2' },
      ]);

      dropdownWithCallback.open(anchor);

      // Move to second item
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      // Press Enter
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(onSelect).toHaveBeenCalledWith('item2');
      dropdownWithCallback.dispose();
    });

    it('DM-033: Escape closes dropdown', () => {
      dropdown.open(anchor);
      expect(dropdown.isVisible()).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(dropdown.isVisible()).toBe(false);
    });

    it('DM-034: skips disabled items during navigation', () => {
      dropdown.setItems([
        { value: 'item1', label: 'Item 1' },
        { value: 'item2', label: 'Item 2', disabled: true },
        { value: 'item3', label: 'Item 3' },
      ]);

      dropdown.open(anchor);

      // Move down - should skip item2 and go to item3
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      const buttons = dropdown.getElement().querySelectorAll('button');
      expect((buttons[2] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    });

    it('DM-035: Home key navigates to first enabled item', () => {
      dropdown.setItems([
        { value: 'item1', label: 'Item 1', disabled: true },
        { value: 'item2', label: 'Item 2' },
        { value: 'item3', label: 'Item 3' },
        { value: 'item4', label: 'Item 4' },
      ]);

      dropdown.open(anchor);

      // Move to last item
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      expect(dropdown.getHighlightedIndex()).toBe(3);

      // Press Home - should go to first enabled (item2, index 1)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));

      expect(dropdown.getHighlightedIndex()).toBe(1);
      const buttons = dropdown.getElement().querySelectorAll('button');
      expect((buttons[1] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    });

    it('DM-036: End key navigates to last enabled item', () => {
      dropdown.setItems([
        { value: 'item1', label: 'Item 1' },
        { value: 'item2', label: 'Item 2' },
        { value: 'item3', label: 'Item 3' },
        { value: 'item4', label: 'Item 4', disabled: true },
      ]);

      dropdown.open(anchor);

      expect(dropdown.getHighlightedIndex()).toBe(0);

      // Press End - should go to last enabled (item3, index 2)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));

      expect(dropdown.getHighlightedIndex()).toBe(2);
      const buttons = dropdown.getElement().querySelectorAll('button');
      expect((buttons[2] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('z-index stacking', () => {
    it('DM-040: closes other dropdowns when opening new one', () => {
      const dropdown2 = new DropdownMenu();
      dropdown2.setItems([{ value: 'test', label: 'Test' }]);

      dropdown.open(anchor);
      expect(dropdown.isVisible()).toBe(true);
      expect(getOpenDropdownCount()).toBe(1);

      dropdown2.open(anchor);
      expect(dropdown.isVisible()).toBe(false);
      expect(dropdown2.isVisible()).toBe(true);
      expect(getOpenDropdownCount()).toBe(1);

      dropdown2.dispose();
    });

    it('DM-041: newer dropdown has higher z-index', () => {
      const dropdown2 = new DropdownMenu({ closeOthers: false });
      dropdown2.setItems([{ value: 'test', label: 'Test' }]);

      dropdown.open(anchor);
      const zIndex1 = parseInt(dropdown.getElement().style.zIndex);

      dropdown2.open(anchor);
      const zIndex2 = parseInt(dropdown2.getElement().style.zIndex);

      expect(zIndex2).toBeGreaterThan(zIndex1);

      dropdown2.dispose();
    });

    it('DM-042: closeAllDropdowns closes all', () => {
      const dropdown2 = new DropdownMenu({ closeOthers: false });
      dropdown2.setItems([{ value: 'test', label: 'Test' }]);

      dropdown.open(anchor);
      dropdown2.open(anchor);

      expect(getOpenDropdownCount()).toBe(2);

      closeAllDropdowns();

      expect(getOpenDropdownCount()).toBe(0);
      expect(dropdown.isVisible()).toBe(false);
      expect(dropdown2.isVisible()).toBe(false);

      dropdown2.dispose();
    });
  });

  describe('item rendering', () => {
    it('DM-050: renders color indicator', () => {
      dropdown.setItems([
        { value: 'red', label: 'Red', color: '#ff0000' },
      ]);

      dropdown.open(anchor);
      const colorDot = dropdown.getElement().querySelector('span[style*="border-radius: 50%"]');
      expect(colorDot).not.toBeNull();
      expect((colorDot as HTMLElement).style.background).toBe('rgb(255, 0, 0)');
    });

    it('DM-053: renders text/emoji icon', () => {
      dropdown.setItems([
        { value: 'star', label: 'Star', icon: '⭐' },
      ]);

      dropdown.open(anchor);
      expect(dropdown.getElement().textContent).toContain('⭐');
      expect(dropdown.getElement().textContent).toContain('Star');
    });

    it('DM-054: icon is rendered as text content (not HTML) for security', () => {
      dropdown.setItems([
        { value: 'test', label: 'Test', icon: '<script>alert("xss")</script>' },
      ]);

      dropdown.open(anchor);
      // The malicious script should be rendered as text, not executed
      expect(dropdown.getElement().textContent).toContain('<script>');
      // No script element should be created
      const scripts = dropdown.getElement().querySelectorAll('script');
      expect(scripts.length).toBe(0);
    });

    it('DM-051: renders shortcut hint', () => {
      dropdown.setItems([
        { value: 'item1', label: 'Item 1', shortcut: 'Ctrl+1' },
      ]);

      dropdown.open(anchor);
      expect(dropdown.getElement().textContent).toContain('Ctrl+1');
    });

    it('DM-052: disabled items are not clickable', () => {
      const onSelect = vi.fn();
      const dropdownWithCallback = new DropdownMenu({ onSelect });
      dropdownWithCallback.setItems([
        { value: 'item1', label: 'Item 1', disabled: true },
      ]);

      dropdownWithCallback.open(anchor);
      const button = dropdownWithCallback.getElement().querySelector('button');
      (button as HTMLButtonElement).click();

      expect(onSelect).not.toHaveBeenCalled();
      dropdownWithCallback.dispose();
    });
  });

  describe('dispose', () => {
    it('DM-060: removes element from DOM', () => {
      dropdown.open(anchor);
      expect(document.body.contains(dropdown.getElement())).toBe(true);

      dropdown.dispose();
      expect(document.body.contains(dropdown.getElement())).toBe(false);
    });

    it('DM-061: closes dropdown on dispose', () => {
      dropdown.open(anchor);
      dropdown.dispose();
      expect(dropdown.isVisible()).toBe(false);
    });
  });

  describe('selection/deselection - keyboard', () => {
    it('DM-070: first item is highlighted on open', () => {
      dropdown.open(anchor);

      const buttons = dropdown.getElement().querySelectorAll('button');
      expect((buttons[0] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
      expect((buttons[1] as HTMLButtonElement).getAttribute('aria-selected')).toBe('false');
      expect((buttons[2] as HTMLButtonElement).getAttribute('aria-selected')).toBe('false');
      expect(dropdown.getHighlightedIndex()).toBe(0);
    });

    it('DM-071: ArrowDown deselects previous and selects next', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // First item highlighted
      expect((buttons[0] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');

      // Move down
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      // First item deselected, second selected
      expect((buttons[0] as HTMLButtonElement).getAttribute('aria-selected')).toBe('false');
      expect((buttons[1] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
      expect(dropdown.getHighlightedIndex()).toBe(1);
    });

    it('DM-072: ArrowUp deselects previous and selects previous item', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Move down twice to get to item 3
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      expect((buttons[2] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');

      // Move up
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

      // Third item deselected, second selected
      expect((buttons[2] as HTMLButtonElement).getAttribute('aria-selected')).toBe('false');
      expect((buttons[1] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
      expect(dropdown.getHighlightedIndex()).toBe(1);
    });

    it('DM-073: only one item is selected at a time during keyboard navigation', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Navigate through all items
      for (let i = 0; i < 3; i++) {
        const selectedCount = Array.from(buttons).filter(
          (b) => b.getAttribute('aria-selected') === 'true'
        ).length;
        expect(selectedCount).toBe(1);

        if (i < 2) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        }
      }
    });

    it('DM-074: ArrowDown at end of list does not change selection', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Move to last item
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      expect(dropdown.getHighlightedIndex()).toBe(2);

      // Try to move past end
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      // Should still be on last item
      expect(dropdown.getHighlightedIndex()).toBe(2);
      expect((buttons[2] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    });

    it('DM-075: ArrowUp at start of list does not change selection', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      expect(dropdown.getHighlightedIndex()).toBe(0);

      // Try to move before start
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

      // Should still be on first item
      expect(dropdown.getHighlightedIndex()).toBe(0);
      expect((buttons[0] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    });

    it('DM-076: Space key selects highlighted item', () => {
      const onSelect = vi.fn();
      const dropdownWithCallback = new DropdownMenu({ onSelect });
      dropdownWithCallback.setItems([
        { value: 'item1', label: 'Item 1' },
        { value: 'item2', label: 'Item 2' },
      ]);

      dropdownWithCallback.open(anchor);

      // Move to second item
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      // Press Space
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

      expect(onSelect).toHaveBeenCalledWith('item2');
      dropdownWithCallback.dispose();
    });
  });

  describe('selection/deselection - mouse', () => {
    it('DM-080: mouseenter highlights item', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Hover over second item
      (buttons[1] as HTMLButtonElement).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      expect((buttons[1] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
      expect(dropdown.getHighlightedIndex()).toBe(1);
    });

    it('DM-081: mouseenter deselects previous item', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // First item is selected by default
      expect((buttons[0] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');

      // Hover over second item
      (buttons[1] as HTMLButtonElement).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      // First item should be deselected
      expect((buttons[0] as HTMLButtonElement).getAttribute('aria-selected')).toBe('false');
      expect((buttons[1] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    });

    it('DM-082: clicking item selects it and closes dropdown', () => {
      const onSelect = vi.fn();
      const dropdownWithCallback = new DropdownMenu({ onSelect });
      dropdownWithCallback.setItems([
        { value: 'item1', label: 'Item 1' },
        { value: 'item2', label: 'Item 2' },
        { value: 'item3', label: 'Item 3' },
      ]);

      dropdownWithCallback.open(anchor);
      const buttons = dropdownWithCallback.getElement().querySelectorAll('button');

      // Click third item
      (buttons[2] as HTMLButtonElement).click();

      expect(onSelect).toHaveBeenCalledWith('item3');
      expect(dropdownWithCallback.isVisible()).toBe(false);
      dropdownWithCallback.dispose();
    });

    it('DM-083: only one item is selected during mouse hover', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Hover over each item
      for (let i = 0; i < buttons.length; i++) {
        (buttons[i] as HTMLButtonElement).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

        const selectedCount = Array.from(buttons).filter(
          (b) => b.getAttribute('aria-selected') === 'true'
        ).length;
        expect(selectedCount).toBe(1);
        expect((buttons[i] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
      }
    });

    it('DM-084: disabled items do not respond to mouseenter', () => {
      dropdown.setItems([
        { value: 'item1', label: 'Item 1' },
        { value: 'item2', label: 'Item 2', disabled: true },
        { value: 'item3', label: 'Item 3' },
      ]);

      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // First item selected by default
      expect(dropdown.getHighlightedIndex()).toBe(0);

      // Hover over disabled item
      (buttons[1] as HTMLButtonElement).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      // Should still be on first item (disabled items don't respond)
      expect(dropdown.getHighlightedIndex()).toBe(0);
    });
  });

  describe('selection/deselection - keyboard and mouse interaction', () => {
    it('DM-090: mouse hover after keyboard navigation updates selection', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Navigate with keyboard to second item
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(dropdown.getHighlightedIndex()).toBe(1);

      // Hover over third item
      (buttons[2] as HTMLButtonElement).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      // Mouse takes over
      expect(dropdown.getHighlightedIndex()).toBe(2);
      expect((buttons[1] as HTMLButtonElement).getAttribute('aria-selected')).toBe('false');
      expect((buttons[2] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    });

    it('DM-091: keyboard navigation after mouse hover updates selection', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Hover over third item
      (buttons[2] as HTMLButtonElement).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      expect(dropdown.getHighlightedIndex()).toBe(2);

      // Navigate with keyboard up
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

      // Keyboard takes over
      expect(dropdown.getHighlightedIndex()).toBe(1);
      expect((buttons[2] as HTMLButtonElement).getAttribute('aria-selected')).toBe('false');
      expect((buttons[1] as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    });

    it('DM-092: Enter selects mouse-hovered item', () => {
      const onSelect = vi.fn();
      const dropdownWithCallback = new DropdownMenu({ onSelect });
      dropdownWithCallback.setItems([
        { value: 'item1', label: 'Item 1' },
        { value: 'item2', label: 'Item 2' },
        { value: 'item3', label: 'Item 3' },
      ]);

      dropdownWithCallback.open(anchor);
      const buttons = dropdownWithCallback.getElement().querySelectorAll('button');

      // Hover over third item
      (buttons[2] as HTMLButtonElement).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      // Press Enter
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(onSelect).toHaveBeenCalledWith('item3');
      dropdownWithCallback.dispose();
    });

    it('DM-093: multiple keyboard-mouse-keyboard switches maintain correct state', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Keyboard: move to second item
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(dropdown.getHighlightedIndex()).toBe(1);

      // Mouse: hover third item
      (buttons[2] as HTMLButtonElement).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      expect(dropdown.getHighlightedIndex()).toBe(2);

      // Keyboard: move up
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(dropdown.getHighlightedIndex()).toBe(1);

      // Mouse: hover first item
      (buttons[0] as HTMLButtonElement).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      expect(dropdown.getHighlightedIndex()).toBe(0);

      // Keyboard: move down
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(dropdown.getHighlightedIndex()).toBe(1);

      // Verify only one selected
      const selectedCount = Array.from(buttons).filter(
        (b) => b.getAttribute('aria-selected') === 'true'
      ).length;
      expect(selectedCount).toBe(1);
    });
  });

  describe('selection styling', () => {
    it('DM-095: highlighted item has correct background style', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // First item should have highlight background
      expect((buttons[0] as HTMLButtonElement).style.background).toBe('var(--bg-hover)'); // #3a3a3a
    });

    it('DM-096: non-highlighted items have transparent background', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Other items should have transparent background
      expect((buttons[1] as HTMLButtonElement).style.background).toBe('transparent');
      expect((buttons[2] as HTMLButtonElement).style.background).toBe('transparent');
    });

    it('DM-097: setSelectedValue applies special selected styling', () => {
      dropdown.open(anchor);
      dropdown.setSelectedValue('item2');

      const buttons = dropdown.getElement().querySelectorAll('button');

      // Should have special selected styling (blue tint)
      expect((buttons[1] as HTMLButtonElement).style.background).toContain('rgba');
      expect((buttons[1] as HTMLButtonElement).style.color).toBe('var(--accent-primary)'); // #4a9eff
    });
  });

  describe('accessibility enhancements', () => {
    it('DM-100: dropdown has unique ID', () => {
      const element = dropdown.getElement();
      expect(element.id).toMatch(/^dropdown-menu-\d+$/);
    });

    it('DM-101: items have unique IDs based on dropdown ID', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');
      const dropdownId = dropdown.getElement().id;

      buttons.forEach((button, index) => {
        expect(button.id).toBe(`${dropdownId}-item-${index}`);
      });
    });

    it('DM-102: aria-activedescendant updates on navigation', () => {
      dropdown.open(anchor);
      const element = dropdown.getElement();
      const buttons = element.querySelectorAll('button');

      // First item should be active
      expect(element.getAttribute('aria-activedescendant')).toBe(buttons[0]!.id);

      // Navigate down
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      // Second item should be active
      expect(element.getAttribute('aria-activedescendant')).toBe(buttons[1]!.id);
    });

    it('DM-103: maxHeight option is applied', () => {
      const dropdownWithMaxHeight = new DropdownMenu({ maxHeight: '200px' });
      dropdownWithMaxHeight.setItems([{ value: 'test', label: 'Test' }]);

      expect(dropdownWithMaxHeight.getElement().style.maxHeight).toBe('200px');
      expect(dropdownWithMaxHeight.getElement().style.overflowY).toBe('auto');

      dropdownWithMaxHeight.dispose();
    });
  });

  describe('multiselect mode', () => {
    let multiDropdown: DropdownMenu;
    let onSelectionChange: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      onSelectionChange = vi.fn();
      multiDropdown = new DropdownMenu({
        multiSelect: true,
        onSelectionChange,
      });
      multiDropdown.setItems([
        { value: 'item1', label: 'Item 1' },
        { value: 'item2', label: 'Item 2' },
        { value: 'item3', label: 'Item 3' },
      ]);
    });

    afterEach(() => {
      multiDropdown.dispose();
    });

    it('DM-110: multiselect dropdown shows checkmarks', () => {
      multiDropdown.open(anchor);
      const checkmarks = multiDropdown.getElement().querySelectorAll('.dropdown-checkmark');
      expect(checkmarks.length).toBe(3);
    });

    it('DM-111: Space toggles selection without closing in multiselect mode', () => {
      multiDropdown.open(anchor);
      expect(multiDropdown.isVisible()).toBe(true);

      // Press Space to select first item
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

      // Dropdown should still be open
      expect(multiDropdown.isVisible()).toBe(true);
      expect(multiDropdown.getSelectedValues()).toContain('item1');
    });

    it('DM-112: Space deselects previously selected item in multiselect mode', () => {
      multiDropdown.open(anchor);

      // Select first item
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(multiDropdown.getSelectedValues()).toContain('item1');

      // Press Space again to deselect
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(multiDropdown.getSelectedValues()).not.toContain('item1');
      expect(multiDropdown.isVisible()).toBe(true);
    });

    it('DM-113: Enter always closes dropdown in multiselect mode', () => {
      multiDropdown.open(anchor);

      // Press Enter
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      // Dropdown should close
      expect(multiDropdown.isVisible()).toBe(false);
    });

    it('DM-114: clicking item toggles selection without closing in multiselect mode', () => {
      multiDropdown.open(anchor);
      const buttons = multiDropdown.getElement().querySelectorAll('button');

      // Click first item
      (buttons[0] as HTMLButtonElement).click();

      // Dropdown should still be open
      expect(multiDropdown.isVisible()).toBe(true);
      expect(multiDropdown.getSelectedValues()).toContain('item1');

      // Click again to deselect
      (buttons[0] as HTMLButtonElement).click();
      expect(multiDropdown.getSelectedValues()).not.toContain('item1');
      expect(multiDropdown.isVisible()).toBe(true);
    });

    it('DM-115: multiple items can be selected in multiselect mode', () => {
      multiDropdown.open(anchor);
      const buttons = multiDropdown.getElement().querySelectorAll('button');

      // Click multiple items
      (buttons[0] as HTMLButtonElement).click();
      (buttons[1] as HTMLButtonElement).click();
      (buttons[2] as HTMLButtonElement).click();

      expect(multiDropdown.getSelectedValues()).toEqual(['item1', 'item2', 'item3']);
      expect(multiDropdown.isVisible()).toBe(true);
    });

    it('DM-116: onSelectionChange callback is called with current selections', () => {
      multiDropdown.open(anchor);
      const buttons = multiDropdown.getElement().querySelectorAll('button');

      // Click first item
      (buttons[0] as HTMLButtonElement).click();
      expect(onSelectionChange).toHaveBeenLastCalledWith(['item1']);

      // Click second item
      (buttons[1] as HTMLButtonElement).click();
      expect(onSelectionChange).toHaveBeenLastCalledWith(['item1', 'item2']);

      // Deselect first item
      (buttons[0] as HTMLButtonElement).click();
      expect(onSelectionChange).toHaveBeenLastCalledWith(['item2']);
    });

    it('DM-117: checkmark updates visually when selection changes', () => {
      multiDropdown.open(anchor);
      const buttons = multiDropdown.getElement().querySelectorAll('button');
      const checkmarks = multiDropdown.getElement().querySelectorAll('.dropdown-checkmark');

      // Initially no checkmarks
      expect((checkmarks[0] as HTMLElement).textContent).toBe('');

      // Select first item
      (buttons[0] as HTMLButtonElement).click();
      expect((checkmarks[0] as HTMLElement).textContent).toBe('\u2713');

      // Deselect first item
      (buttons[0] as HTMLButtonElement).click();
      expect((checkmarks[0] as HTMLElement).textContent).toBe('');
    });

    it('DM-118: setSelectedValues pre-selects multiple values', () => {
      multiDropdown.setSelectedValues(['item1', 'item3']);
      multiDropdown.open(anchor);

      expect(multiDropdown.getSelectedValues()).toEqual(['item1', 'item3']);

      const checkmarks = multiDropdown.getElement().querySelectorAll('.dropdown-checkmark');
      expect((checkmarks[0] as HTMLElement).textContent).toBe('\u2713');
      expect((checkmarks[1] as HTMLElement).textContent).toBe('');
      expect((checkmarks[2] as HTMLElement).textContent).toBe('\u2713');
    });

    it('DM-119: clearSelection removes all selections', () => {
      multiDropdown.setSelectedValues(['item1', 'item2']);
      expect(multiDropdown.getSelectedValues().length).toBe(2);

      multiDropdown.clearSelection();
      expect(multiDropdown.getSelectedValues().length).toBe(0);
    });

    it('DM-120: isValueSelected returns correct state', () => {
      multiDropdown.setSelectedValues(['item2']);

      expect(multiDropdown.isValueSelected('item1')).toBe(false);
      expect(multiDropdown.isValueSelected('item2')).toBe(true);
      expect(multiDropdown.isValueSelected('item3')).toBe(false);
    });

    it('DM-121: Space on keyboard-navigated item toggles its selection', () => {
      multiDropdown.open(anchor);

      // Navigate to second item
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(multiDropdown.getHighlightedIndex()).toBe(1);

      // Toggle second item with Space
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(multiDropdown.getSelectedValues()).toContain('item2');
      expect(multiDropdown.isVisible()).toBe(true);

      // Toggle again to deselect
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(multiDropdown.getSelectedValues()).not.toContain('item2');
    });
  });

  describe('single-select mode behavior', () => {
    it('DM-130: Space selects and closes in single-select mode', () => {
      const onSelect = vi.fn();
      const singleDropdown = new DropdownMenu({ onSelect });
      singleDropdown.setItems([
        { value: 'item1', label: 'Item 1' },
        { value: 'item2', label: 'Item 2' },
      ]);

      singleDropdown.open(anchor);
      expect(singleDropdown.isVisible()).toBe(true);

      // Press Space
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

      // Should close and call onSelect
      expect(singleDropdown.isVisible()).toBe(false);
      expect(onSelect).toHaveBeenCalledWith('item1');

      singleDropdown.dispose();
    });

    it('DM-131: single-select mode does not show checkmarks', () => {
      dropdown.open(anchor);
      const checkmarks = dropdown.getElement().querySelectorAll('.dropdown-checkmark');
      expect(checkmarks.length).toBe(0);
    });

    it('DM-132: getSelectedValues works in single-select mode', () => {
      const onSelect = vi.fn();
      const singleDropdown = new DropdownMenu({ onSelect });
      singleDropdown.setItems([
        { value: 'item1', label: 'Item 1' },
        { value: 'item2', label: 'Item 2' },
      ]);

      singleDropdown.open(anchor);
      const buttons = singleDropdown.getElement().querySelectorAll('button');
      (buttons[1] as HTMLButtonElement).click();

      expect(singleDropdown.getSelectedValues()).toEqual(['item2']);

      singleDropdown.dispose();
    });
  });

  describe('visual deselection in single-select mode', () => {
    it('DM-140: setSelectedValue resets previous selection styling', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Select first item
      dropdown.setSelectedValue('item1');
      expect((buttons[0] as HTMLButtonElement).style.background).toContain('rgba');
      expect((buttons[0] as HTMLButtonElement).style.color).toBe('var(--accent-primary)');

      // Select second item - first should be reset
      dropdown.setSelectedValue('item2');

      // First item should have transparent background (deselected)
      expect((buttons[0] as HTMLButtonElement).style.background).toBe('transparent');
      expect((buttons[0] as HTMLButtonElement).style.color).toBe('var(--text-primary)'); // #ccc

      // Second item should have selected styling
      expect((buttons[1] as HTMLButtonElement).style.background).toContain('rgba');
      expect((buttons[1] as HTMLButtonElement).style.color).toBe('var(--accent-primary)');
    });

    it('DM-141: only one item has selected styling after multiple selections', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Select each item in sequence
      dropdown.setSelectedValue('item1');
      dropdown.setSelectedValue('item2');
      dropdown.setSelectedValue('item3');

      // Count items with selected styling (accent color)
      let selectedCount = 0;
      buttons.forEach((button) => {
        if ((button as HTMLButtonElement).style.color === 'var(--accent-primary)') {
          selectedCount++;
        }
      });

      expect(selectedCount).toBe(1);
      // Only item3 should have selected styling
      expect((buttons[2] as HTMLButtonElement).style.color).toBe('var(--accent-primary)');
    });

    it('DM-142: previous selection is visually reset when dropdown reopens after new selection', () => {
      // Select item1
      dropdown.setSelectedValue('item1');

      // Open, verify item1 is selected
      dropdown.open(anchor);
      let buttons = dropdown.getElement().querySelectorAll('button');
      expect((buttons[0] as HTMLButtonElement).style.color).toBe('var(--accent-primary)');
      dropdown.close();

      // Select item2 (while closed)
      dropdown.setSelectedValue('item2');

      // Reopen and verify only item2 has selected styling
      dropdown.open(anchor);
      buttons = dropdown.getElement().querySelectorAll('button');

      // item1 should NOT have selected styling
      expect((buttons[0] as HTMLButtonElement).style.color).not.toBe('var(--accent-primary)');
      // item2 should have selected styling (might be overwritten by highlight on open)
      // but selectedValues should only contain item2
      expect(dropdown.getSelectedValues()).toEqual(['item2']);
    });

    it('DM-143: clicking different items updates selection styling correctly', () => {
      const onSelect = vi.fn();
      const testDropdown = new DropdownMenu({ onSelect });
      testDropdown.setItems([
        { value: 'red', label: 'Red' },
        { value: 'green', label: 'Green' },
        { value: 'blue', label: 'Blue' },
      ]);

      testDropdown.open(anchor);
      let buttons = testDropdown.getElement().querySelectorAll('button');

      // Click red
      (buttons[0] as HTMLButtonElement).click();
      expect(onSelect).toHaveBeenLastCalledWith('red');

      // Simulate what ChannelSelect does - call setSelectedValue
      testDropdown.setSelectedValue('red');

      // Reopen and click green
      testDropdown.open(anchor);
      buttons = testDropdown.getElement().querySelectorAll('button');
      (buttons[1] as HTMLButtonElement).click();
      expect(onSelect).toHaveBeenLastCalledWith('green');

      // Simulate setSelectedValue for green
      testDropdown.setSelectedValue('green');

      // Verify red is no longer selected, only green
      expect(testDropdown.getSelectedValues()).toEqual(['green']);

      // Reopen and check visual state
      testDropdown.open(anchor);
      buttons = testDropdown.getElement().querySelectorAll('button');

      // Red should not have accent color
      expect((buttons[0] as HTMLButtonElement).style.color).not.toBe('var(--accent-primary)');

      testDropdown.dispose();
    });

    it('DM-144: keyboard selection followed by mouse selection resets previous styling', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Keyboard navigate to item2 and select
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      // Simulate setSelectedValue call
      dropdown.setSelectedValue('item2');

      // Reopen and mouse click item3
      dropdown.open(anchor);
      (buttons[2] as HTMLButtonElement).click();
      dropdown.setSelectedValue('item3');

      // Reopen and verify styling
      dropdown.open(anchor);

      // item2 should not have selected styling
      expect((buttons[1] as HTMLButtonElement).style.color).not.toBe('var(--accent-primary)');
      // Only item3 should be in selectedValues
      expect(dropdown.getSelectedValues()).toEqual(['item3']);
    });

    it('DM-145: mouse selection followed by keyboard selection resets previous styling', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Mouse click item1
      (buttons[0] as HTMLButtonElement).click();
      dropdown.setSelectedValue('item1');

      // Reopen, keyboard navigate to item3 and select
      dropdown.open(anchor);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      dropdown.setSelectedValue('item3');

      // Reopen and verify styling
      dropdown.open(anchor);

      // item1 should not have selected styling
      expect((buttons[0] as HTMLButtonElement).style.color).not.toBe('var(--accent-primary)');
      // Only item3 should be in selectedValues
      expect(dropdown.getSelectedValues()).toEqual(['item3']);
    });

    it('DM-146: rapid selection changes maintain correct visual state', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Rapidly change selections
      dropdown.setSelectedValue('item1');
      dropdown.setSelectedValue('item2');
      dropdown.setSelectedValue('item1');
      dropdown.setSelectedValue('item3');
      dropdown.setSelectedValue('item2');

      // Only item2 should have selected styling
      let selectedCount = 0;
      buttons.forEach((button) => {
        if ((button as HTMLButtonElement).style.color === 'var(--accent-primary)') {
          selectedCount++;
        }
      });

      expect(selectedCount).toBe(1);
      expect((buttons[1] as HTMLButtonElement).style.color).toBe('var(--accent-primary)');
      expect(dropdown.getSelectedValues()).toEqual(['item2']);
    });

    it('DM-147: clearSelection resets visual styling in single-select mode', () => {
      dropdown.open(anchor);
      const buttons = dropdown.getElement().querySelectorAll('button');

      // Select an item
      dropdown.setSelectedValue('item2');
      expect((buttons[1] as HTMLButtonElement).style.color).toBe('var(--accent-primary)');

      // Clear selection
      dropdown.clearSelection();

      // item2 should no longer have selected styling
      expect((buttons[1] as HTMLButtonElement).style.color).not.toBe('var(--accent-primary)');
      expect((buttons[1] as HTMLButtonElement).style.background).toBe('transparent');
      expect(dropdown.getSelectedValues()).toEqual([]);
    });
  });
});
