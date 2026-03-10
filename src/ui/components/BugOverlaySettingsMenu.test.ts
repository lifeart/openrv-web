import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BugOverlaySettingsMenu } from './BugOverlaySettingsMenu';

function createOverlayMock() {
  let state = {
    enabled: false,
    imageUrl: null as string | null,
    position: 'bottom-right' as const,
    size: 0.08,
    opacity: 0.8,
    margin: 12,
  };

  return {
    getState: vi.fn(() => ({ ...state })),
    hasImage: vi.fn(() => state.imageUrl !== null),
    loadImage: vi.fn(async (imageUrl: string) => {
      state = { ...state, imageUrl, enabled: true };
    }),
    removeImage: vi.fn(() => {
      state = { ...state, imageUrl: null, enabled: false };
    }),
    setPosition: vi.fn((position) => {
      state = { ...state, position };
    }),
    setSize: vi.fn((size) => {
      state = { ...state, size };
    }),
    setOpacity: vi.fn((opacity) => {
      state = { ...state, opacity };
    }),
    setMargin: vi.fn((margin) => {
      state = { ...state, margin };
    }),
  };
}

describe('BugOverlaySettingsMenu', () => {
  let overlay: ReturnType<typeof createOverlayMock>;
  let menu: BugOverlaySettingsMenu;

  beforeEach(() => {
    overlay = createOverlayMock();
    menu = new BugOverlaySettingsMenu(overlay as any);
  });

  afterEach(() => {
    menu.dispose();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('BOM-001: shows a settings menu with expected aria label', () => {
    menu.show(100, 120);
    const el = document.querySelector('.bug-overlay-settings-menu');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-label')).toBe('Bug Overlay settings');
    expect(menu.isVisible()).toBe(true);
  });

  it('BOM-002: load button triggers the hidden file input', () => {
    menu.show(100, 120);

    const input = document.querySelector<HTMLInputElement>('[data-testid="bug-overlay-file-input"]')!;
    const clickSpy = vi.spyOn(input, 'click');
    document.querySelector<HTMLElement>('[data-testid="bug-overlay-load-button"]')?.click();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('BOM-003: file selection loads the image through the overlay', async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;

      readAsDataURL(): void {
        this.result = 'data:image/png;base64,Zm9v';
        this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
      }
    }

    vi.stubGlobal('FileReader', MockFileReader);

    menu.show(100, 120);
    const input = document.querySelector<HTMLInputElement>('[data-testid="bug-overlay-file-input"]')!;
    const file = new File(['test'], 'bug.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    input.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();

    expect(overlay.loadImage).toHaveBeenCalledWith('data:image/png;base64,Zm9v');
  });

  it('BOM-004: position and sliders update the overlay', () => {
    menu.show(100, 120);

    document.querySelector<HTMLElement>('[data-position="top-left"]')?.click();

    const sizeSlider = document.querySelector<HTMLInputElement>('[data-testid="bug-size-slider"]')!;
    sizeSlider.value = '20';
    sizeSlider.dispatchEvent(new Event('input', { bubbles: true }));

    const opacitySlider = document.querySelector<HTMLInputElement>('[data-testid="bug-opacity-slider"]')!;
    opacitySlider.value = '50';
    opacitySlider.dispatchEvent(new Event('input', { bubbles: true }));

    const marginSlider = document.querySelector<HTMLInputElement>('[data-testid="bug-margin-slider"]')!;
    marginSlider.value = '30';
    marginSlider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(overlay.setPosition).toHaveBeenCalledWith('top-left');
    expect(overlay.setSize).toHaveBeenCalledWith(0.2);
    expect(overlay.setOpacity).toHaveBeenCalledWith(0.5);
    expect(overlay.setMargin).toHaveBeenCalledWith(30);
  });

  it('BOM-005: remove button clears the current image', () => {
    overlay.getState.mockReturnValue({
      enabled: true,
      imageUrl: 'data:image/png;base64,Zm9v',
      position: 'bottom-right',
      size: 0.08,
      opacity: 0.8,
      margin: 12,
    });

    menu.show(100, 120);
    document.querySelector<HTMLElement>('[data-testid="bug-overlay-remove-button"]')?.click();

    expect(overlay.removeImage).toHaveBeenCalledTimes(1);
  });

  it('BOM-006: hides on outside click and Escape', () => {
    menu.show(100, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.isVisible()).toBe(false);

    menu.show(100, 120);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isVisible()).toBe(false);
  });
});
