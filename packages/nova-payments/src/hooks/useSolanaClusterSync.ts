import { SatelliteStoreContext } from '@tuwaio/satellite-react';
import { useContext, useEffect } from 'react';
import type { StoreApi } from 'zustand';

import type { CheckoutWallet } from '../utils/methods';
import { solanaClusterToSync } from '../utils/solanaNetwork';

/** The part of the Satellite store the sync uses. */
type SwitchState = { switchNetwork?: (chainId: string) => Promise<void> };

/**
 * Keeps the app's Solana connection on the cluster of a Solana payment, so that the checkout and the app show the
 * payment's network: `switchNetwork` of the Satellite store (`@tuwaio/satellite-react`) only updates the connection's
 * cluster, with no wallet request (Solana wallets choose their network themselves). Does nothing without
 * `SatelliteConnectProvider`, for other chain families and when the connection is already on the cluster.
 *
 * Side effects: `switchNetwork` of the Satellite store, once per cluster.
 *
 * @param chainId - CAIP-2 chain of the payment.
 * @param wallet - The connected wallet, or `null`.
 */
export function useSolanaClusterSync(chainId: string, wallet: CheckoutWallet | null): void {
  const store = useContext(SatelliteStoreContext) as StoreApi<SwitchState> | null;
  const target = solanaClusterToSync(chainId, wallet);
  useEffect(() => {
    if (target) void store?.getState().switchNetwork?.(target);
  }, [store, target]);
}
