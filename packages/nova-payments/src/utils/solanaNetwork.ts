/**
 * @file The network of a Solana payment: Solana wallets have no network switch an app can ask for, so the checkout
 * tells the buyer which cluster to choose in the wallet and keeps the app's Solana connection on the payment's cluster.
 */

import { getSolanaCluster } from '@tuwaio/orbit-core';

import { formatLabel } from '../i18n/formatLabel';
import type { NovaPaymentsLabels } from '../i18n/types';
import type { CheckoutWallet } from './methods';
import { networkName } from './methods';

/** The reminder about the network of a Solana payment. */
export interface SolanaNetworkHint {
  /** Its heading. */
  title: string;
  /** Why the buyer switches the network in the wallet. */
  text: string;
  /** Where the connected Solana wallet keeps its network; none without a Solana wallet. */
  hint?: string;
}

const capitalized = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * The reminder to switch the Solana wallet to the payment's cluster, for a payment on a cluster other than mainnet
 * (wallets are on mainnet unless the buyer changed it), with the steps of Phantom and Solflare.
 *
 * @param chainId - CAIP-2 chain of the payment.
 * @param wallet - The connected wallet, or `null`.
 * @param labels - The labels of the checkout.
 * @returns The reminder, or `null` for mainnet and for other chain families.
 */
export function solanaNetworkHint(
  chainId: string,
  wallet: CheckoutWallet | null,
  labels: NovaPaymentsLabels,
): SolanaNetworkHint | null {
  const cluster = chainId.startsWith('solana:') ? getSolanaCluster(chainId) : undefined;
  if (!cluster || cluster === 'mainnet') return null;
  const values = { network: networkName(chainId), cluster: capitalized(cluster), wallet: wallet?.name ?? '' };
  const hintLabel =
    wallet?.family !== 'solana'
      ? undefined
      : wallet.walletId === 'phantom'
        ? labels.pay.solanaHintPhantom
        : wallet.walletId === 'solflare'
          ? labels.pay.solanaHintSolflare
          : labels.pay.solanaHintOther;
  return {
    title: formatLabel(labels.pay.solanaNetwork, values),
    text: formatLabel(labels.pay.solanaNetworkText, values),
    ...(hintLabel ? { hint: formatLabel(hintLabel, values) } : {}),
  };
}

/**
 * The cluster to move the app's Solana connection to, so that the checkout and the app show the payment's network.
 * The move is the store's own (`switchNetwork` of `@tuwaio/satellite-core`), with no wallet request.
 *
 * @param chainId - CAIP-2 chain of the payment.
 * @param wallet - The connected wallet, or `null`.
 * @returns The payment's chain, or `null` when the connection is already on its cluster, is not a Solana one, or the
 * payment is not on Solana.
 */
export function solanaClusterToSync(chainId: string, wallet: CheckoutWallet | null): string | null {
  const cluster = chainId.startsWith('solana:') ? getSolanaCluster(chainId) : undefined;
  if (!cluster || wallet?.family !== 'solana' || getSolanaCluster(wallet.chainId) === cluster) return null;
  return chainId;
}
