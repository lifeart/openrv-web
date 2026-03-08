import { describe, it, expect, vi } from 'vitest';
import { withSideEffects, type WiringSideEffects } from './WiringHelpers';

function createMockEffects(): WiringSideEffects {
  return {
    scheduleUpdateScopes: vi.fn(),
    syncGTOStore: vi.fn(),
  };
}

describe('withSideEffects', () => {
  it('calls primary action with the value', () => {
    const fx = createMockEffects();
    const action = vi.fn();
    const handler = withSideEffects(fx, action);

    handler(42);

    expect(action).toHaveBeenCalledWith(42);
  });

  it('calls scheduleUpdateScopes by default', () => {
    const fx = createMockEffects();
    const handler = withSideEffects(fx, vi.fn());

    handler('test');

    expect(fx.scheduleUpdateScopes).toHaveBeenCalledTimes(1);
  });

  it('does not call syncGTOStore by default', () => {
    const fx = createMockEffects();
    const handler = withSideEffects(fx, vi.fn());

    handler('test');

    expect(fx.syncGTOStore).not.toHaveBeenCalled();
  });

  it('calls syncGTOStore when gto: true', () => {
    const fx = createMockEffects();
    const handler = withSideEffects(fx, vi.fn(), { gto: true });

    handler('test');

    expect(fx.syncGTOStore).toHaveBeenCalledTimes(1);
  });

  it('skips scheduleUpdateScopes when scopes: false', () => {
    const fx = createMockEffects();
    const handler = withSideEffects(fx, vi.fn(), { scopes: false });

    handler('test');

    expect(fx.scheduleUpdateScopes).not.toHaveBeenCalled();
  });

  it('calls both side effects when scopes: true, gto: true', () => {
    const fx = createMockEffects();
    const handler = withSideEffects(fx, vi.fn(), { scopes: true, gto: true });

    handler('test');

    expect(fx.scheduleUpdateScopes).toHaveBeenCalledTimes(1);
    expect(fx.syncGTOStore).toHaveBeenCalledTimes(1);
  });

  it('skips both side effects when scopes: false, gto: false', () => {
    const fx = createMockEffects();
    const handler = withSideEffects(fx, vi.fn(), { scopes: false, gto: false });

    handler('test');

    expect(fx.scheduleUpdateScopes).not.toHaveBeenCalled();
    expect(fx.syncGTOStore).not.toHaveBeenCalled();
  });

  it('calls primary action before side effects', () => {
    const order: string[] = [];
    const fx: WiringSideEffects = {
      scheduleUpdateScopes: () => order.push('scopes'),
      syncGTOStore: () => order.push('gto'),
    };
    const handler = withSideEffects(fx, () => order.push('action'), { scopes: true, gto: true });

    handler('test');

    expect(order).toEqual(['action', 'scopes', 'gto']);
  });

  it('passes complex objects through to action', () => {
    const fx = createMockEffects();
    const action = vi.fn();
    const handler = withSideEffects(fx, action);

    const value = { exposure: 1.5, gamma: 2.2 };
    handler(value);

    expect(action).toHaveBeenCalledWith(value);
  });

  it('works with void value', () => {
    const fx = createMockEffects();
    const action = vi.fn();
    const handler = withSideEffects<void>(fx, action, { scopes: true, gto: true });

    handler(undefined);

    expect(action).toHaveBeenCalledWith(undefined);
    expect(fx.scheduleUpdateScopes).toHaveBeenCalledTimes(1);
    expect(fx.syncGTOStore).toHaveBeenCalledTimes(1);
  });
});
