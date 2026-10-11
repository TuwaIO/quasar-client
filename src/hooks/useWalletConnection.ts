import { NovaConnectProviderContext } from '@tuwaio/nova-connect/hooks';
import { OrbitAdapter } from '@tuwaio/orbit-core';
import { useContext } from 'react';

import type { PaymentFamily } from '../utils/methods';

/** What {@link useWalletConnection} returns. */
export interface WalletConnection {
  /** Whether the page can connect a wallet: Nova Connect is set up, or the app handles it. */
  canConnect: boolean;
  /** Whether the connect modal of Nova Connect is open. */
  connecting: boolean;
  /**
   * Asks the buyer to connect a wallet of a chain family.
   *
   * @param family - The family of the chosen method.
   * @returns Whether the request went anywhere.
   */
  connect: (family: PaymentFamily) => boolean;
}

/**
 * Connects a wallet for a payment: opens the connect modal of Nova Connect on the wallets of the method's chain family
 * when the checkout is inside `NovaConnectProvider` of `@tuwaio/nova-connect`, else calls the app's handler.
 *
 * @param onConnectWallet - The app's handler, for apps that connect wallets without Nova Connect.
 * @returns See {@link WalletConnection}.
 */
export function useWalletConnection(onConnectWallet?: (family: PaymentFamily) => void): WalletConnection {
  const novaConnect = useContext(NovaConnectProviderContext);
  return {
    canConnect: Boolean(novaConnect || onConnectWallet),
    connecting: novaConnect?.isConnectModalOpen ?? false,
    connect: (family) => {
      if (novaConnect) {
        novaConnect.setIsConnectModalOpen(true, {
          adapter: family === 'solana' ? OrbitAdapter.SOLANA : OrbitAdapter.EVM,
        });
        return true;
      }
      if (!onConnectWallet) return false;
      onConnectWallet(family);
      return true;
    },
  };
}
