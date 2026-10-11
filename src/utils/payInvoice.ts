/**
 * @file Paying a locked price from the connected wallet, without React: the wallet prompt, then the hand-over to
 * Quasar.
 */

import type { CheckoutQuote, CheckoutState } from '@tuwaio/quasar-sdk/checkout';

import type { PaymentsAdapter } from '../adapters/types';
import type { CheckoutWallet } from './methods';
import { instructionsChainId, type PayPath } from './pay';
import { PaymentWalletError } from './walletErrors';

/** What {@link payInvoice} needs. */
export interface PayInvoiceParams {
  /** The adapter of the quote's chain family. */
  adapter: PaymentsAdapter;
  /** The checkout store (only `submit` and `relay` are used). */
  store: { getState: () => Pick<CheckoutState, 'submit' | 'relay'> };
  /** The locked quote. */
  quote: CheckoutQuote;
  /** The wallet the quote is locked to. */
  wallet: CheckoutWallet;
  /** How the wallet pays, from `payPath`. */
  path: PayPath;
  /** The checkout's ERC-7677 paymaster URL, for the `paymaster` path. */
  paymasterUrl: string | null;
  /** Called when the wallet answered, before the payment is handed to Quasar. */
  onWalletDone?: () => void;
  /**
   * Called with the transaction the wallet sent (its hash), before Quasar takes it; not for a gasless signature, whose
   * transaction Quasar sends.
   *
   * @param txKey - The transaction hash (EVM) or signature (Solana).
   */
  onSent?: (txKey: string) => void;
}

const unsupported = (what: string) => new PaymentWalletError('unsupported', `${what} is not available`);

/**
 * Pays a locked quote: `transfer` sends the transfer and hands its key to Quasar (`submit`), `relay` signs the
 * authorization for Quasar to send (`relay`), `paymaster` sends the sponsored calls and hands their transaction hash
 * to Quasar. A transaction the wallet sent is always handed over, whatever the page shows meanwhile.
 *
 * Side effects: a wallet prompt; requests to the checkout routes of Quasar.
 *
 * @param params - See {@link PayInvoiceParams}.
 * @returns Whether Quasar took the payment (the store's `error` says why not).
 * @throws {@link PaymentWalletError} `unsupported` when the adapter or the quote cannot take the path; the wallet's
 *   error when it refuses or fails.
 */
export async function payInvoice({
  adapter,
  store,
  quote,
  wallet,
  path,
  paymasterUrl,
  onWalletDone,
  onSent,
}: PayInvoiceParams): Promise<boolean> {
  const account = wallet.address;
  if (path === 'relay') {
    const typedData = quote.gasless?.relay?.typedData;
    if (!typedData || !adapter.signTransferAuthorization) throw unsupported('A gasless signature');
    const signature = await adapter.signTransferAuthorization({ typedData, account });
    onWalletDone?.();
    return store.getState().relay(signature);
  }
  if (path === 'paymaster') {
    const calls = quote.gasless?.paymaster?.calls;
    if (!calls || !paymasterUrl || !adapter.sendSponsoredCalls) throw unsupported('A sponsored payment');
    const chainId = instructionsChainId(quote.instructions);
    const txKey = await adapter.sendSponsoredCalls({ calls, paymasterUrl, chainId, account, onSent: onWalletDone });
    onWalletDone?.();
    onSent?.(txKey);
    return store.getState().submit({ txKey, connectorType: wallet.connectorType });
  }
  const txKey = await adapter.sendTransfer({
    instructions: quote.instructions,
    account,
    connection: wallet.connection,
  });
  onWalletDone?.();
  onSent?.(txKey);
  return store.getState().submit({ txKey, connectorType: wallet.connectorType });
}
