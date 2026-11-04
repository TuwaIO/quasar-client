import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutWallet } from '../utils/methods';

let satellite: unknown = null;
vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
  useContext: () => satellite,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { useSolanaClusterSync } = await import('./useSolanaClusterSync');

const MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

const phantom = (chainId: string) =>
  ({ family: 'solana', chainId, address: 'payer', walletId: 'phantom', name: 'Phantom' }) as CheckoutWallet;

afterEach(() => unmount());

describe('useSolanaClusterSync', () => {
  it("moves the app's Solana connection to the payment's cluster once, with the store's own switch", () => {
    const switchNetwork = vi.fn(async () => undefined);
    satellite = { getState: () => ({ switchNetwork }) };
    const ClusterSync = (props: { chainId: string; wallet: CheckoutWallet | null }) =>
      useSolanaClusterSync(props.chainId, props.wallet);

    render(ClusterSync, { chainId: DEVNET, wallet: phantom(MAINNET) });
    render(ClusterSync, { chainId: DEVNET, wallet: phantom(MAINNET) });
    expect(switchNetwork).toHaveBeenCalledTimes(1);
    expect(switchNetwork).toHaveBeenCalledWith(DEVNET);

    // On the cluster, nothing more
    render(ClusterSync, { chainId: DEVNET, wallet: phantom(DEVNET) });
    expect(switchNetwork).toHaveBeenCalledTimes(1);
  });

  it('does nothing without Satellite Connect', () => {
    satellite = null;
    expect(() =>
      render((props: { wallet: CheckoutWallet }) => useSolanaClusterSync(DEVNET, props.wallet), {
        wallet: phantom(MAINNET),
      }),
    ).not.toThrow();
  });
});
