/**
 * AppWiringContext - Shared context type for wiring modules.
 *
 * Provides typed access to all components that wiring modules need
 * to connect via event subscriptions. Wiring modules receive this
 * context and wire up .on() subscriptions between components.
 */

import type { Session } from './core/session/Session';
import type { Viewer } from './ui/components/Viewer';
import type { PaintEngine } from './paint/PaintEngine';
import type { HeaderBar } from './ui/components/layout/HeaderBar';
import type { TabBar } from './ui/components/layout/TabBar';
import type { AppControlRegistry } from './AppControlRegistry';
import type { AppSessionBridge } from './AppSessionBridge';
import type { AppPersistenceManager } from './AppPersistenceManager';
import type { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';

/**
 * The wiring context provides all the components that event wiring modules
 * need to establish connections between controls, session, viewer, and bridges.
 */
export interface AppWiringContext {
  session: Session;
  viewer: Viewer;
  paintEngine: PaintEngine;
  headerBar: HeaderBar;
  tabBar: TabBar;
  controls: AppControlRegistry;
  sessionBridge: AppSessionBridge;
  persistenceManager: AppPersistenceManager;
}

/**
 * Standardized return type for stateless wiring modules.
 */
export interface WiringResult {
  subscriptions: DisposableSubscriptionManager;
}

/**
 * Standardized return type for wiring modules that maintain mutable state.
 */
export interface StatefulWiringResult<S> extends WiringResult {
  state: S;
}
