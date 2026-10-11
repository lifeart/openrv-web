import { describe, it, expect, vi } from 'vitest';
import { wireViewerLoadState } from './AppViewerLoadStateWiring';
import { EventEmitter } from './utils/EventEmitter';
import type { SessionEvents } from './core/session/SessionTypes';
import type { AppWiringContext } from './AppWiringContext';

class FakeSession extends EventEmitter<SessionEvents> {
  sourceCount = 0;
}

function createCtx() {
  const container = document.createElement('div');
  const session = new FakeSession();
  const openMediaFileDialog = vi.fn();
  const ctx = {
    session,
    viewer: { getContainer: () => container },
    headerBar: { openMediaFileDialog },
  } as unknown as Pick<AppWiringContext, 'session' | 'viewer' | 'headerBar'>;
  return { ctx, container, session, openMediaFileDialog };
}

describe('wireViewerLoadState', () => {
  it('mounts the empty state in the viewer and routes "Open file…" to the header open action', () => {
    const { ctx, container, openMediaFileDialog } = createCtx();
    const result = wireViewerLoadState(ctx);

    const button = container.querySelector('[data-testid="viewer-empty-state-open"]') as HTMLButtonElement;
    expect(button).toBeTruthy();
    button.click();
    expect(openMediaFileDialog).toHaveBeenCalledTimes(1);

    result.subscriptions.dispose();
    expect(container.querySelector('[data-testid="viewer-empty-state"]')).toBeNull();
  });

  it('shows the loading indicator for session loads', () => {
    const { ctx, container, session } = createCtx();
    const result = wireViewerLoadState(ctx);

    session.emit('sourceLoadingStarted', { name: 'clip.mov' });
    const hud = container.querySelector('[data-testid="viewer-loading-indicator"]') as HTMLElement;
    expect(hud.style.display).toBe('flex');
    expect(hud.textContent).toContain('clip.mov');

    result.subscriptions.dispose();
  });
});
