import { SatelliteStoreContext } from '@tuwaio/satellite-react';
import { useContext, useEffect, useMemo, useState } from 'react';
import { type StoreApi, useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { type CheckoutWallet, connectedWallet } from '../utils/methods';

/** The part of the Satellite store the checkout reads. */
type ConnectionState = {
  activeConnection?: { address: string; chainId: string | number; connectorType: string; icon?: string };
  getConnectors?: () => Partial<Record<string, unknown[]>>;
  // `@tuwaio/satellite-core` versions without it are still supported
  watchConnectors?: (onChange: () => void) => () => void;
};

/** A Satellite store without a connection, read when the app has no `SatelliteConnectProvider`. */
const NO_SATELLITE: StoreApi<ConnectionState> = createStore<ConnectionState>(() => ({}));

/**
 * The wallet connected through Satellite Connect (the active connection of `SatelliteConnectProvider` from
 * `@tuwaio/satellite-react`), in CAIP identifiers, named and shown as the wallet calls itself: the name and icon of
 * its wallet in the wallet lists of the store (`getConnectors()`, the wallet with exactly the connector type of the
 * connection), as Nova Connect lists it; `null` without a connection or without the provider, in which case the
 * checkout offers the QR code and the wallet connection only.
 *
 * Side effects: while mounted in the browser, a subscription to the wallet lists of the store (`watchConnectors` of
 * `@tuwaio/satellite-core`, when the store has it), so a wallet that announces itself later is named too.
 *
 * @returns The wallet, or `null`. The same object while the connection, the name and the icon stay the same.
 */
export function useConnectedWallet(): CheckoutWallet | null {
  const store = (useContext(SatelliteStoreContext) as StoreApi<ConnectionState> | null) ?? NO_SATELLITE;
  const connection = useStore(store, (state) => state.activeConnection);
  const getConnectors = useStore(store, (state) => state.getConnectors);
  const watchConnectors = useStore(store, (state) => state.watchConnectors);
  // Counts the changes of the wallet lists the store reported
  const [listVersion, setListVersion] = useState(0);
  useEffect(() => watchConnectors?.(() => setListVersion((version) => version + 1)), [watchConnectors]);
  // The wallet as it calls itself; a new wallet object only when its name or icon changed
  const read = useMemo(
    () => connectedWallet(connection, getConnectors?.()),
    // `listVersion` reads the lists again after a change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connection, getConnectors, listVersion],
  );
  const name = read?.name;
  const icon = read?.icon;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => read, [connection, name, icon]);
}
