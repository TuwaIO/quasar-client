/**
 * @file Paying a locked price from the connected wallet, without React: the wallet prompt, then the hand-over to
 * Quasar.
 */

import type { CheckoutQuote, CheckoutState } from '@tuwaio/quasar-sdk/checkout';

import type { PaymentsAdapter } from '../adapters/types';
import type { CheckoutWallet } from './methods';
import { instructionsChainId, type PayPath } from './pay';
import { payeeVerified } from './payee';
import { PaymentWalletError } from './walletErrors';

/** What {@link payInvoice} needs. */
export interface PayInvoiceParams {
  /** The adapter of the quote's chain family. */
  adapter: PaymentsAdapter;
  /** The checkout store (only `submit`, `relay`, `relayFromPage` and `payeeCheck` are used). */
  store: {
    getState: () => Pick<CheckoutState, 'submit' | 'relay' | 'payeeCheck'> &
      Partial<Pick<CheckoutState, 'relayFromPage'>>;
  };
  /** The locked quote. */
  quote: CheckoutQuote;
  /** The wallet the quote is locked to. */
  wallet: CheckoutWallet;
  /** How the wallet pays, from `payPath`. */
  path: PayPath;
  /**
   * The checkout's ERC-7677 paymaster URL: the `paymaster` path sends through it, and the `relay` path sends the
   * authorized call from a one-time account through it when the adapter can (`sendOneTimeRelay`).
   */
  paymasterUrl: string | null;
  /** Called when the wallet answered, before the payment is handed to Quasar. */
  onWalletDone?: () => void;
  /**
   * Called with the ID of a sponsored batch as soon as the wallet took it, before it has a transaction.
   *
   * @param batchId - The ID of the batch.
   */
  onBatchAccepted?: (batchId: string) => void;
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
 * authorization and the page sends the call Quasar answers for it from a one-time account (`relayFromPage` with the
 * adapter's `sendOneTimeRelay`; without them, or with no paymaster URL, Quasar sends it: `relay`), `paymaster` sends
 * the sponsored calls and hands their transaction hash to Quasar. A transaction the wallet sent is always handed over, whatever the page shows meanwhile, with the method it
 * was quoted for: the buyer may have gone on to a price on another network while the wallet asked.
 *
 * Side effects: a wallet prompt; requests to the checkout routes of Quasar.
 *
 * @param params - See {@link PayInvoiceParams}.
 * @returns Whether Quasar took the payment (the store's `error` says why not).
 * @throws {@link PaymentWalletError} `unsupported` when the store has not verified the payee of this quote
 *   (`payeeCheck`), or the adapter or the quote cannot take the path; the wallet's error when it refuses or fails.
 */
export async function payInvoice({
  adapter,
  store,
  quote,
  wallet,
  path,
  paymasterUrl,
  onWalletDone,
  onBatchAccepted,
  onSent,
}: PayInvoiceParams): Promise<boolean> {
  // The steps show a price only once its payee is verified; nothing is sent for one that is not, whatever shows it
  if (!payeeVerified(store.getState(), quote)) {
    throw new PaymentWalletError('unsupported', 'The payee of the quote is not verified');
  }
  const account = wallet.address;
  if (path === 'relay') {
    const typedData = quote.gasless?.relay?.typedData;
    if (!typedData || !adapter.signTransferAuthorization) throw unsupported('A gasless signature');
    const signature = await adapter.signTransferAuthorization({ typedData, account });
    onWalletDone?.();
    const { relayFromPage, relay } = store.getState();
    const sendOneTimeRelay = adapter.sendOneTimeRelay;
    if (relayFromPage && sendOneTimeRelay && paymasterUrl) {
      return relayFromPage(signature, (authorized) =>
        sendOneTimeRelay({ chainId: authorized.chainId, call: authorized.call, paymasterUrl }),
      );
    }
    return relay(signature);
  }
  if (path === 'paymaster') {
    const calls = quote.gasless?.paymaster?.calls;
    if (!calls || !paymasterUrl || !adapter.sendSponsoredCalls) throw unsupported('A sponsored payment');
    const chainId = instructionsChainId(quote.instructions);
    const txKey = await adapter.sendSponsoredCalls({
      calls,
      paymasterUrl,
      chainId,
      account,
      onSent: onWalletDone,
      onAccepted: onBatchAccepted,
      // It landed after the adapter gave up waiting: Quasar still gets it, and the page follows the invoice
      onLate: (late) => {
        onSent?.(late);
        void store.getState().submit({ txKey: late, connectorType: wallet.connectorType, methodId: quote.methodId });
      },
    });
    onWalletDone?.();
    onSent?.(txKey);
    return store.getState().submit({ txKey, connectorType: wallet.connectorType, methodId: quote.methodId });
  }
  const txKey = await adapter.sendTransfer({
    instructions: quote.instructions,
    account,
    connection: wallet.connection,
  });
  onWalletDone?.();
  onSent?.(txKey);
  return store.getState().submit({ txKey, connectorType: wallet.connectorType, methodId: quote.methodId });
}
