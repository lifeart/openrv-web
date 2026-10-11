/**
 * AppViewerLoadStateWiring - mount the viewer's empty-state and loading
 * overlays and connect them to the session and the header "open file" action.
 */

import type { AppWiringContext, WiringResult } from './AppWiringContext';
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';
import { ViewerLoadStateOverlay } from './ui/components/ViewerLoadStateOverlay';

export function wireViewerLoadState(ctx: Pick<AppWiringContext, 'session' | 'viewer' | 'headerBar'>): WiringResult {
  const { session, viewer, headerBar } = ctx;
  const subs = new DisposableSubscriptionManager();

  const overlay = new ViewerLoadStateOverlay({
    container: viewer.getContainer(),
    session,
    onOpenFile: () => headerBar.openMediaFileDialog(),
  });
  subs.add(() => overlay.dispose());

  return { subscriptions: subs };
}
