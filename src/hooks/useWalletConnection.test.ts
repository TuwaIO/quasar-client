import { OrbitAdapter } from '@tuwaio/orbit-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

const novaConnect = vi.hoisted(() => ({ value: undefined as unknown }));
// The settings of NovaPaymentsProvider
const settings = vi.hoisted(() => ({ value: {} as { onConnectWallet?: (family: 'eip155' | 'solana') => void } }));
vi.mock('./useNovaPayments', () => ({ useNovaPayments: () => settings.value }));

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
  useContext: () => novaConnect.value,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { useWalletConnection } = await import('./useWalletConnection');

type Connection = ReturnType<typeof useWalletConnection>;
const renderHook = (onConnectWallet?: (family: 'eip155' | 'solana') => void) =>
  render(({ onConnect }: { onConnect?: typeof onConnectWallet }) => useWalletConnection(onConnect), {
    onConnect: onConnectWallet,
  }) as Connection;

afterEach(() => {
  unmount();
  novaConnect.value = undefined;
  settings.value = {};
});

describe('useWalletConnection', () => {
  it("opens Nova Connect on the wallets of the method's chain family", () => {
    const setIsConnectModalOpen = vi.fn();
    novaConnect.value = { setIsConnectModalOpen, isConnectModalOpen: false };
    const connection = renderHook();
    expect(connection.canConnect).toBe(true);
    expect(connection.connect('solana')).toBe(true);
    expect(setIsConnectModalOpen).toHaveBeenLastCalledWith(true, { adapter: OrbitAdapter.SOLANA });
    connection.connect('eip155');
    expect(setIsConnectModalOpen).toHaveBeenLastCalledWith(true, { adapter: OrbitAdapter.EVM });
  });

  it('says while the connect modal is open', () => {
    novaConnect.value = { setIsConnectModalOpen: vi.fn(), isConnectModalOpen: true };
    expect(renderHook().connecting).toBe(true);
  });

  it("asks the app without Nova Connect, and can't connect without either", () => {
    const onConnectWallet = vi.fn();
    expect(renderHook(onConnectWallet).connect('eip155')).toBe(true);
    expect(onConnectWallet).toHaveBeenCalledWith('eip155');
    unmount();
    const none = renderHook();
    expect(none.canConnect).toBe(false);
    expect(none.connect('eip155')).toBe(false);
    expect(none.connecting).toBe(false);
  });

  it("falls back to the handler of NovaPaymentsProvider, which the checkout's own handler overrides", () => {
    const fromProvider = vi.fn();
    settings.value = { onConnectWallet: fromProvider };
    const connection = renderHook();
    expect(connection.canConnect).toBe(true);
    expect(connection.connect('solana')).toBe(true);
    expect(fromProvider).toHaveBeenCalledWith('solana');
    unmount();

    const fromCheckout = vi.fn();
    renderHook(fromCheckout).connect('eip155');
    expect(fromCheckout).toHaveBeenCalledWith('eip155');
    expect(fromProvider).toHaveBeenCalledTimes(1);
  });

  it('opens Nova Connect over any handler', () => {
    const setIsConnectModalOpen = vi.fn();
    const fromProvider = vi.fn();
    novaConnect.value = { setIsConnectModalOpen, isConnectModalOpen: false };
    settings.value = { onConnectWallet: fromProvider };
    renderHook().connect('eip155');
    expect(setIsConnectModalOpen).toHaveBeenCalledWith(true, { adapter: OrbitAdapter.EVM });
    expect(fromProvider).not.toHaveBeenCalled();
  });
});
