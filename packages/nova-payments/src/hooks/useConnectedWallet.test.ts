import { afterEach, describe, expect, it, vi } from 'vitest';

const context = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
  useContext: () => context.store,
}));
// The store is read as it is now; a test renders again after a change
vi.mock('zustand', async () => ({
  ...(await vi.importActual<object>('zustand')),
  useStore: (store: { getState: () => unknown }, selector: (state: unknown) => unknown) => selector(store.getState()),
}));

const { render, unmount } = await import('../testing/hookHarness');
const { useConnectedWallet } = await import('./useConnectedWallet');

const ICON = 'data:image/svg+xml;base64,PHN2Zy8+';
const connection = {
  address: '0x1111111111111111111111111111111111111111',
  chainId: 8453,
  connectorType: 'evm:switchwallet',
};

/** A Satellite store with the connection, its wallet list and the subscription to it. */
function satellite(wallets: Array<{ name: string; icon?: string }>) {
  const listeners = new Set<() => void>();
  const state = {
    activeConnection: connection,
    getConnectors: vi.fn(() => ({ evm: wallets })),
    watchConnectors: vi.fn((onChange: () => void) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    }),
  };
  context.store = { getState: () => state };
  return { state, listeners };
}

afterEach(() => {
  unmount();
  context.store = null;
});

describe('the connected wallet of the Satellite store', () => {
  it('is named and shown as the wallet of the store with its connector type calls itself', () => {
    satellite([{ name: 'Switch Wallet', icon: ICON }]);
    expect(render(useConnectedWallet, undefined)).toMatchObject({
      walletId: 'switchwallet',
      name: 'Switch Wallet',
      icon: ICON,
    });
  });

  it('follows the wallet list of the store, and stops when it unmounts', () => {
    const wallets: Array<{ name: string; icon?: string }> = [];
    const { listeners } = satellite(wallets);
    expect(render(useConnectedWallet, undefined)).toMatchObject({ name: 'Switchwallet', icon: undefined });
    expect(listeners.size).toBe(1);

    // The wallet announces itself after the checkout read the list
    wallets.push({ name: 'Switch Wallet', icon: ICON });
    listeners.forEach((onChange) => onChange());
    const first = render(useConnectedWallet, undefined);
    expect(first).toMatchObject({ name: 'Switch Wallet', icon: ICON });
    // The same wallet while nothing about it changes
    listeners.forEach((onChange) => onChange());
    expect(render(useConnectedWallet, undefined)).toBe(first);

    unmount();
    expect(listeners.size).toBe(0);
  });

  it('is null without SatelliteConnectProvider', () => {
    expect(render(useConnectedWallet, undefined)).toBeNull();
  });
});
