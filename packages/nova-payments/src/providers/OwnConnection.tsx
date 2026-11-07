import { NovaConnectProvider } from '@tuwaio/nova-connect';
import { createSatelliteConnectStore } from '@tuwaio/satellite-core';
import { type Connection, type Connector, SatelliteStoreContext } from '@tuwaio/satellite-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import type { NovaPaymentsOwnConnection } from './NovaPaymentsProvider';

type OwnStore = ReturnType<typeof createSatelliteConnectStore<Connector, Connection>>;
type NovaConnectProps = NovaPaymentsOwnConnection['novaConnect'];

// Nova's own stores in the browser, one per Satellite adapter (the first of `adapter`), for the life of the page. The
// wagmi config and the wallets behind an adapter keep their connections when a provider unmounts, so a provider
// mounted again on them must find the store that knows those connections: a new, empty store would not show the
// wallet, and wagmi would refuse to connect it again (`ConnectorAlreadyConnectedError`)
const stores = new WeakMap<object, OwnStore>();
// The stores whose start-up ran
const started = new WeakSet<OwnStore>();

/**
 * The store of Nova's own connection: the one kept for its first Satellite adapter, else a new one (kept, except on
 * the server, where every render gets its own, so requests share nothing).
 *
 * @param own - The connection.
 * @returns The store.
 */
function ownStore(own: NovaPaymentsOwnConnection): OwnStore {
  const create = () =>
    createSatelliteConnectStore<Connector, Connection>({
      adapter: own.adapter,
      rememberWallet: own.rememberWallet ?? false,
    });
  const key: object | undefined = Array.isArray(own.adapter) ? own.adapter[0] : own.adapter;
  if (typeof window === 'undefined' || !key) return create();
  const kept = stores.get(key);
  if (kept) return kept;
  const store = create();
  stores.set(key, store);
  return store;
}

/**
 * The props of Nova's modal with "Remember this wallet" hidden, unless the app set `hidden` of that checkbox itself.
 *
 * @param props - The `novaConnect` of the connection.
 * @returns The props.
 */
function withRememberWalletHidden(props: NovaConnectProps): NovaConnectProps {
  const customization = props.customization;
  const connectModal = customization?.modals?.connectModal;
  const childComponents = connectModal?.childComponents;
  if (childComponents?.rememberWallet?.hidden !== undefined) return props;
  return {
    ...props,
    customization: {
      ...customization,
      modals: {
        ...customization?.modals,
        connectModal: {
          ...connectModal,
          childComponents: { ...childComponents, rememberWallet: { ...childComponents?.rememberWallet, hidden: true } },
        },
      },
    },
  };
}

/**
 * Nova's own wallet connection, for an app without a Satellite store: a Satellite store, the app's watchers and a
 * `NovaConnectProvider` without SIWX.
 *
 * It creates the store itself instead of rendering `SatelliteConnectProvider`, so its start-up runs only when asked:
 * before Satellite Connect 0.11.1 that start-up disconnected every wallet of its adapters first, which withdrew the
 * wallet's permission for the whole site and dropped the wallets of other tabs or of the host page. The store lives as
 * long as the page, one per Satellite adapter: mounted again (a checkout closed and opened again, another page), or
 * under a second provider on the same adapters, it is the same store, which knows the wallets wagmi and the Solana
 * wallets still hold. Its start-up runs once: with `autoConnect`, Satellite's (`initializeAutoConnect(true)`: from
 * 0.11.1 it reconnects only the last wallet, without a permission prompt, and disconnects only connections this page
 * opened); otherwise none.
 * Without `autoConnect`, the connect modal hides "Remember this wallet", since nothing would reconnect the wallet after
 * a load (unless `novaConnect` sets `hidden` of that checkbox).
 *
 * Side effects: those of the store (`orbit-core:lastConnectedConnector` and
 * `orbit-core:recentlyConnectedConnectorsListHelpers` in `sessionStorage` until the tab closes, or in `localStorage`
 * with `rememberWallet`), of the watchers and of Nova Connect; the store is kept in memory until the page unloads.
 *
 * @param props - The connection and the checkouts.
 * @param props.own - The connection (`ownConnection` of `NovaPaymentsProvider`).
 * @param props.children - The checkouts.
 * @returns The provider tree.
 * @internal
 */
export function OwnConnection({ own, children }: { own: NovaPaymentsOwnConnection; children: ReactNode }) {
  // `rememberWallet` and `autoConnect` are read on the first render, as `SatelliteConnectProvider` does
  const [store] = useState(() => ownStore(own));
  const [autoConnect] = useState(own.autoConnect ?? false);
  const adapter = own.adapter;
  const novaConnect = own.novaConnect;

  useEffect(() => {
    store.getState().updateParameters({ adapter });
  }, [store, adapter]);

  useEffect(() => {
    // Once per store: mounted again, it keeps the wallet it has
    if (started.has(store)) return;
    started.add(store);
    if (autoConnect) {
      void store
        .getState()
        .initializeAutoConnect(true)
        .catch(() => undefined);
      return;
    }
    // Nothing to restore: the watchers and Nova Connect do not wait for a reconnection
    store.setState({ isAutoConnectFinished: true });
  }, [store, autoConnect]);

  const modalProps = useMemo(
    () => (autoConnect ? novaConnect : withRememberWalletHidden(novaConnect)),
    [autoConnect, novaConnect],
  );

  return (
    <SatelliteStoreContext.Provider value={store}>
      {own.watchers}
      <NovaConnectProvider {...modalProps} siwx={undefined}>
        {children}
      </NovaConnectProvider>
    </SatelliteStoreContext.Provider>
  );
}
