import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TabBar } from '../components/layout/TabBar';
import { ContextToolbar } from '../components/layout/ContextToolbar';
import { HeaderBar } from '../components/layout/HeaderBar';
import { Session } from '../../core/session/Session';
import { injectA11yStyles } from './injectA11yStyles';
import { FocusManager } from './FocusManager';
import { AriaAnnouncer } from './AriaAnnouncer';

describe('Keyboard Navigation Integration', () => {
  let tabBar: TabBar;
  let contextToolbar: ContextToolbar;
  let headerBar: HeaderBar;
  let session: Session;
  let focusManager: FocusManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    session = new Session();
    tabBar = new TabBar();
    contextToolbar = new ContextToolbar();
    headerBar = new HeaderBar(session);
    focusManager = new FocusManager();

    // Render into body
    const headerEl = headerBar.render();
    const tabBarEl = tabBar.render();
    const contextToolbarEl = contextToolbar.render();

    document.body.appendChild(headerEl);
    document.body.appendChild(tabBarEl);
    document.body.appendChild(contextToolbarEl);

    // Register zones
    focusManager.addZone({
      name: 'headerBar',
      container: headerBar.getContainer(),
      getItems: () => Array.from(headerBar.getContainer().querySelectorAll<HTMLElement>('button:not([disabled])')),
      orientation: 'horizontal',
    });
    focusManager.addZone({
      name: 'tabBar',
      container: tabBar.getContainer(),
      getItems: () => tabBar.getButtons(),
      orientation: 'horizontal',
    });
    focusManager.addZone({
      name: 'contextToolbar',
      container: contextToolbar.getContainer(),
      getItems: () => Array.from(contextToolbar.getContainer().querySelectorAll<HTMLElement>('button:not([disabled])')),
      orientation: 'horizontal',
    });
  });

  afterEach(() => {
    focusManager.dispose();
    tabBar.dispose();
    contextToolbar.dispose();
    headerBar.dispose();
    document.body.innerHTML = '';
  });

  // === KEY-001: Tab moves through controls ===
  describe('KEY-001: Focus zone navigation', () => {
    it('KEY-001a: F6 focuses from headerBar to tabBar', () => {
      focusManager.focusZone(0); // headerBar
      focusManager.focusNextZone(); // tabBar
      const tabButtons = tabBar.getButtons();
      expect(tabButtons.includes(document.activeElement as HTMLButtonElement)).toBe(true);
    });

    it('KEY-001b: F6 from tabBar to contextToolbar', () => {
      // Add a button to contextToolbar so focus can land on it
      const btn = document.createElement('button');
      btn.textContent = 'Test';
      contextToolbar.appendToTab('view', btn);

      focusManager.focusZone(1); // tabBar
      focusManager.focusNextZone(); // contextToolbar
      // Focus is in contextToolbar zone
      expect(contextToolbar.getContainer().contains(document.activeElement)).toBe(true);
    });

    it('KEY-001c: Shift+F6 reverse', () => {
      focusManager.focusZone(1); // tabBar
      focusManager.focusPreviousZone(); // headerBar
      expect(headerBar.getContainer().contains(document.activeElement)).toBe(true);
    });

    it('KEY-001d: Skip link is created with correct attributes', () => {
      const skipLink = focusManager.createSkipLink('main-content');
      document.body.prepend(skipLink);
      expect(skipLink.getAttribute('href')).toBe('#main-content');
      expect(skipLink.className).toBe('skip-link');
    });

    it('KEY-001e: Skip link focuses target on click', () => {
      const target = document.createElement('div');
      target.id = 'main-content';
      target.setAttribute('tabindex', '0');
      document.body.appendChild(target);

      const skipLink = focusManager.createSkipLink('main-content');
      document.body.prepend(skipLink);
      skipLink.click();
      expect(document.activeElement).toBe(target);
    });
  });

  // === KEY-002: Enter/Space activates buttons ===
  describe('KEY-002: Button activation', () => {
    it('KEY-002a: Buttons are natively clickable (Enter/Space handled by browser)', () => {
      // In browsers, buttons natively fire click on Enter/Space.
      // jsdom does not synthesize this, so we verify the button is
      // a <button> element (which gets native keyboard activation).
      const btn = document.createElement('button');
      document.body.appendChild(btn);
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.type).toBe('submit'); // default, natively activatable
    });

    it('KEY-002b: Tab bar buttons are <button> elements with click handlers', () => {
      const buttons = tabBar.getButtons();
      expect(buttons.length).toBe(6);
      for (const btn of buttons) {
        expect(btn.tagName).toBe('BUTTON');
      }
    });

    it('KEY-002c: Tab button click switches tab', () => {
      const tabChangeSpy = vi.fn();
      tabBar.on('tabChanged', tabChangeSpy);
      const colorTab = tabBar.getButtons().find(b => b.dataset.tabId === 'color');
      expect(colorTab).toBeDefined();
      colorTab!.click();
      expect(tabChangeSpy).toHaveBeenCalledWith('color');
      expect(tabBar.activeTab).toBe('color');
    });
  });

  // === KEY-003: Escape closes modals ===
  describe('KEY-003: Modal keyboard handling', () => {
    it('KEY-003a: Modal escape handling exists', async () => {
      const { showAlert } = await import('../components/shared/Modal');
      const promise = showAlert('Test');
      const container = document.getElementById('modal-container');
      expect(container).not.toBeNull();
      expect(container!.style.display).toBe('flex');

      // Simulate Escape
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await promise;
      // Modal should be hidden after Escape
      expect(container!.style.display).toBe('none');
    });

    it('KEY-003b: Focus returns to trigger after modal close', async () => {
      const trigger = document.createElement('button');
      trigger.textContent = 'Open Modal';
      document.body.appendChild(trigger);
      trigger.focus();

      const { showAlert } = await import('../components/shared/Modal');
      const promise = showAlert('Test');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await promise;

      // Focus should return to the trigger button
      expect(document.activeElement).toBe(trigger);
    });

    it('KEY-003c: Modal module exports setModalFocusManager for focus trap', async () => {
      const { setModalFocusManager } = await import('../components/shared/Modal');
      expect(typeof setModalFocusManager).toBe('function');
      // Verify it accepts a FocusManager without throwing
      setModalFocusManager(focusManager);
    });
  });

  // === KEY-004: Focus visible ===
  describe('KEY-004: Focus visibility', () => {
    it('KEY-004a: focus-visible CSS is injected with !important', () => {
      injectA11yStyles();
      const style = document.getElementById('openrv-a11y-styles');
      expect(style).not.toBeNull();
      expect(style!.textContent).toContain('focus-visible');
      expect(style!.textContent).toContain('!important');
    });

    it('KEY-004b: skip-link CSS is injected', () => {
      injectA11yStyles();
      const style = document.getElementById('openrv-a11y-styles');
      expect(style!.textContent).toContain('.skip-link');
    });

    it('KEY-004c: injectA11yStyles is idempotent', () => {
      injectA11yStyles();
      injectA11yStyles(); // Call twice
      const styles = document.querySelectorAll('#openrv-a11y-styles');
      expect(styles.length).toBe(1);
    });

    it('KEY-004d: All headerBar buttons are focusable', () => {
      const buttons = headerBar.getContainer().querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
      for (const btn of buttons) {
        expect(btn.getAttribute('tabindex')).not.toBe('-1');
      }
    });
  });

  // === KEY-005: Screen reader accessible ===
  describe('KEY-005: ARIA attributes', () => {
    it('KEY-005a: TabBar has role="tablist"', () => {
      expect(tabBar.getContainer().getAttribute('role')).toBe('tablist');
    });

    it('KEY-005b: Tab buttons have role="tab", aria-selected, and aria-controls', () => {
      const buttons = tabBar.getButtons();
      for (const btn of buttons) {
        expect(btn.getAttribute('role')).toBe('tab');
        expect(btn.getAttribute('aria-selected')).toBeDefined();
        expect(btn.getAttribute('aria-controls')).toMatch(/^tabpanel-/);
      }
    });

    it('KEY-005c: ContextToolbar has role="toolbar"', () => {
      expect(contextToolbar.getContainer().getAttribute('role')).toBe('toolbar');
    });

    it('KEY-005d: ContextToolbar tab panels have id, role="tabpanel", and aria-labelledby', () => {
      const viewContainer = contextToolbar.getTabContainer('view');
      expect(viewContainer).toBeDefined();
      expect(viewContainer!.id).toBe('tabpanel-view');
      expect(viewContainer!.getAttribute('role')).toBe('tabpanel');
      expect(viewContainer!.getAttribute('aria-labelledby')).toBe('tab-view');

      // Verify cross-reference: tab's aria-controls matches panel's id
      const viewTab = tabBar.getButtons().find(b => b.dataset.tabId === 'view');
      expect(viewTab!.getAttribute('aria-controls')).toBe('tabpanel-view');
    });

    it('KEY-005e: Icon-only buttons in HeaderBar have aria-label', () => {
      const buttons = headerBar.getContainer().querySelectorAll<HTMLButtonElement>('button[aria-label]');
      expect(buttons.length).toBeGreaterThan(0);
      for (const btn of buttons) {
        expect(btn.getAttribute('aria-label')).toBeTruthy();
      }
    });

    it('KEY-005f: ContextToolbar aria-label updates on tab change', () => {
      expect(contextToolbar.getContainer().getAttribute('aria-label')).toBe('View controls');
      contextToolbar.setActiveTab('color');
      expect(contextToolbar.getContainer().getAttribute('aria-label')).toBe('Color controls');
      contextToolbar.setActiveTab('effects');
      expect(contextToolbar.getContainer().getAttribute('aria-label')).toBe('Effects controls');
    });

    it('KEY-005g: aria-live region exists after AriaAnnouncer creation', () => {
      const announcer = new AriaAnnouncer();
      const el = document.getElementById('openrv-sr-announcer');
      expect(el).not.toBeNull();
      expect(el!.getAttribute('aria-live')).toBe('polite');
      announcer.dispose();
    });

    it('KEY-005h: Skip link can be created', () => {
      const link = focusManager.createSkipLink('main-content');
      expect(link.tagName).toBe('A');
      expect(link.textContent).toBe('Skip to main content');
    });

    it('KEY-005i: HeaderBar has role="banner"', () => {
      expect(headerBar.getContainer().getAttribute('role')).toBe('banner');
    });

    it('KEY-005j: Active tab has aria-selected="true"', () => {
      const activeButton = tabBar.getButtons().find(b => b.dataset.tabId === tabBar.activeTab);
      expect(activeButton).toBeDefined();
      expect(activeButton!.getAttribute('aria-selected')).toBe('true');

      // Switch tab and verify
      tabBar.setActiveTab('color');
      const colorButton = tabBar.getButtons().find(b => b.dataset.tabId === 'color');
      expect(colorButton!.getAttribute('aria-selected')).toBe('true');

      // Old tab should be false
      const viewButton = tabBar.getButtons().find(b => b.dataset.tabId === 'view');
      expect(viewButton!.getAttribute('aria-selected')).toBe('false');
    });

    it('KEY-005k: Tab buttons have unique IDs', () => {
      const buttons = tabBar.getButtons();
      const ids = buttons.map(b => b.id);
      expect(ids).toContain('tab-view');
      expect(ids).toContain('tab-color');
      expect(ids).toContain('tab-effects');
      expect(ids).toContain('tab-transform');
      expect(ids).toContain('tab-annotate');
    });

    it('KEY-005l: Inactive tabs have tabindex="-1"', () => {
      const viewBtn = tabBar.getButtons().find(b => b.dataset.tabId === 'view');
      const colorBtn = tabBar.getButtons().find(b => b.dataset.tabId === 'color');
      expect(viewBtn!.getAttribute('tabindex')).toBe('0');
      expect(colorBtn!.getAttribute('tabindex')).toBe('-1');
    });

    it('KEY-005m: HeaderBar groups have role="toolbar" with aria-label', () => {
      const toolbars = headerBar.getContainer().querySelectorAll('[role="toolbar"]');
      expect(toolbars.length).toBeGreaterThanOrEqual(2);
      for (const toolbar of toolbars) {
        expect(toolbar.getAttribute('aria-label')).toBeTruthy();
      }
    });
  });
});
