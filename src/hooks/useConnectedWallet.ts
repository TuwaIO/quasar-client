import { SatelliteStoreContext } from '@tuwaio/satellite-react';
import { useContext, useMemo } from 'react';
import { type StoreApi, useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { type CheckoutWallet, connectedWallet } from '../utils/methods';

/** The part of the Satellite store the checkout reads. */
type ConnectionState = {
  activeConnection?: { address: string; chainId: string | number; connectorType: string };
};

/** A Satellite store without a connection, read when the app has no `SatelliteConnectProvider`. */
const NO_SATELLITE: StoreApi<ConnectionState> = createStore<ConnectionState>(() => ({}));

/**
 * The wallet connected through Satellite Connect (the active connection of `SatelliteConnectProvider` from
 * `@tuwaio/satellite-react`), in CAIP identifiers; `null` without a connection or without the provider, in which case
 * the checkout offers the QR code and the wallet connection only.
 *
 * @returns The wallet, or `null`.
 */
export function useConnectedWallet(): CheckoutWallet | null {
  const store = useContext(SatelliteStoreContext) as StoreApi<ConnectionState> | null;
  const connection = useStore(store ?? NO_SATELLITE, (state) => state.activeConnection);
  return useMemo(() => connectedWallet(connection), [connection]);
}
