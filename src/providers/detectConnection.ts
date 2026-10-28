import { NovaConnectProviderContext } from '@tuwaio/nova-connect/hooks';
import { SatelliteStoreContext } from '@tuwaio/satellite-react';
import { useContext } from 'react';

import type { PaymentsConnectionMode } from './novaPaymentsContext';

/**
 * Whose wallet connection the checkouts use, from what is above them: the app's Satellite store and Nova Connect
 * (`app`), its store only (`appStore`), else Nova's own connection when there is one (`own`) or none (`none`).
 *
 * @param found - What is above.
 * @param found.appStore - Whether a Satellite store (`SatelliteConnectProvider`) is above.
 * @param found.novaConnect - Whether `NovaConnectProvider` is above.
 * @param found.ownConnection - Whether `NovaPaymentsProvider` got an `ownConnection`.
 * @returns The mode.
 * @internal
 */
export function paymentsConnectionMode(found: {
  appStore: boolean;
  novaConnect: boolean;
  ownConnection: boolean;
}): PaymentsConnectionMode {
  if (found.appStore) return found.novaConnect ? 'app' : 'appStore';
  return found.ownConnection ? 'own' : 'none';
}

/**
 * The mode the providers above call for now, read from the contexts of `@tuwaio/satellite-react` and
 * `@tuwaio/nova-connect` (both kept on `globalThis`, so copies of the packages see the same ones).
 *
 * @param ownConnection - Whether `NovaPaymentsProvider` got an `ownConnection`.
 * @returns The mode.
 * @internal
 */
export function useDetectedPaymentsConnection(ownConnection: boolean): PaymentsConnectionMode {
  const store = useContext(SatelliteStoreContext);
  const novaConnect = useContext(NovaConnectProviderContext);
  return paymentsConnectionMode({
    appStore: store !== null && store !== undefined,
    novaConnect: novaConnect !== undefined,
    ownConnection,
  });
}
