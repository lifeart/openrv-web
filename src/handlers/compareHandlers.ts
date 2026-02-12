/**
 * A/B compare handlers: availability updates and source switching.
 */

import type { Session } from '../core/session/Session';
import type { SessionEvents } from '../core/session/Session';
import type { SessionBridgeContext } from '../AppSessionBridge';

/**
 * Bind A/B compare event handlers.
 */
export function bindCompareHandlers(
  context: SessionBridgeContext,
  session: Session,
  on: <K extends keyof SessionEvents>(
    session: Session,
    event: K,
    handler: (data: SessionEvents[K]) => void
  ) => void,
  updateEXRLayers: () => void
): void {
  const updateABAvailability = (): void => {
    context.getCompareControl().setABAvailable(session.abCompareAvailable);
  };
  updateABAvailability();
  on(session, 'sourceLoaded', updateABAvailability);
  on(session, 'abSourceChanged', () => {
    const current = session.currentAB;
    context.getCompareControl().setABSource(current);
    // Update EXR layer selector when switching between A/B sources
    // since each source may have different layers (or none)
    updateEXRLayers();
  });
}
