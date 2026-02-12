/**
 * Compare Handlers Tests
 *
 * Tests for bindCompareHandlers: A/B availability updates and source switching.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindCompareHandlers } from './compareHandlers';
import type { SessionBridgeContext } from '../AppSessionBridge';
import type { Session, SessionEvents } from '../core/session/Session';

type EventHandlers = Partial<Record<keyof SessionEvents, (data: any) => void>>;

function createMockSession(overrides: {
  abCompareAvailable?: boolean;
  currentAB?: 'A' | 'B';
} = {}): Session {
  return {
    abCompareAvailable: overrides.abCompareAvailable ?? false,
    currentAB: overrides.currentAB ?? 'A',
  } as unknown as Session;
}

function createMockOn(): {
  on: <K extends keyof SessionEvents>(
    session: Session,
    event: K,
    handler: (data: SessionEvents[K]) => void
  ) => void;
  handlers: EventHandlers;
} {
  const handlers: EventHandlers = {};
  const on = <K extends keyof SessionEvents>(
    _session: Session,
    event: K,
    handler: (data: SessionEvents[K]) => void
  ): void => {
    handlers[event] = handler as (data: any) => void;
  };
  return { on, handlers };
}

function createMockContext(): SessionBridgeContext {
  const compareControl = {
    setABAvailable: vi.fn(),
    setABSource: vi.fn(),
  };

  return {
    getCompareControl: () => compareControl,
  } as unknown as SessionBridgeContext;
}

describe('bindCompareHandlers', () => {
  let context: SessionBridgeContext;
  let session: Session;
  let handlers: EventHandlers;
  let updateEXRLayers: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    context = createMockContext();
    session = createMockSession({ abCompareAvailable: true });
    const mockOn = createMockOn();
    handlers = mockOn.handlers;
    updateEXRLayers = vi.fn();

    bindCompareHandlers(context, session, mockOn.on, updateEXRLayers);
  });

  it('CMPH-U001: sets initial AB availability on bind', () => {
    expect(context.getCompareControl().setABAvailable).toHaveBeenCalledWith(true);
  });

  it('CMPH-U002: sets initial AB availability to false when not available', () => {
    const ctx = createMockContext();
    const sess = createMockSession({ abCompareAvailable: false });
    const mockOn = createMockOn();

    bindCompareHandlers(ctx, sess, mockOn.on, vi.fn());

    expect(ctx.getCompareControl().setABAvailable).toHaveBeenCalledWith(false);
  });

  it('CMPH-U003: registers sourceLoaded handler', () => {
    expect(handlers.sourceLoaded).toBeDefined();
  });

  it('CMPH-U004: sourceLoaded updates AB availability', () => {
    // Reset from initial call
    (context.getCompareControl().setABAvailable as ReturnType<typeof vi.fn>).mockClear();

    handlers.sourceLoaded!(undefined as any);

    expect(context.getCompareControl().setABAvailable).toHaveBeenCalledWith(true);
  });

  it('CMPH-U005: registers abSourceChanged handler', () => {
    expect(handlers.abSourceChanged).toBeDefined();
  });

  it('CMPH-U006: abSourceChanged sets AB source on control', () => {
    (session as any).currentAB = 'B';

    handlers.abSourceChanged!({ current: 'B', sourceIndex: 1 });

    expect(context.getCompareControl().setABSource).toHaveBeenCalledWith('B');
  });

  it('CMPH-U007: abSourceChanged updates EXR layers', () => {
    handlers.abSourceChanged!({ current: 'A', sourceIndex: 0 });

    expect(updateEXRLayers).toHaveBeenCalled();
  });
});
