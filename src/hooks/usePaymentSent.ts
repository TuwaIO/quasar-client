import type { CheckoutError, CheckoutState, CheckoutStore } from '@tuwaio/quasar-sdk/checkout';
import { useState } from 'react';

import {
  isFinalPaymentFailure,
  isInvoicePaymentOnTheWay,
  isInvoicePaymentUnresolved,
  isPaymentOnTheWay,
} from '../utils/checkout';

/** What {@link usePaymentSent} reads of the checkout. */
export interface UsePaymentSentParams {
  /** The checkout store of the invoice. */
  store: CheckoutStore;
  /** Its state. */
  state: CheckoutState;
  /**
   * The transaction the wallet last returned on this page for the invoice of the store (its hash or Solana signature),
   * before or whatever the store says of it: `onSent` of the payment. `null` (default) when the wallet returned none.
   */
  walletTxKey?: string | null;
}

/**
 * Whether this page sent or handed a payment of the invoice over, or saw one on its way or unresolved (the page was
 * reopened, another tab paid, Quasar reads a payment again whose result it did not see): once `true` it stays `true` for
 * the invoice of the store, also after the store stopped following the payment (35 minutes past the deadline) or Quasar
 * could not confirm it, so an invoice that expires or is cancelled afterwards never says that nothing was charged. A
 * payment counts as sent as soon as the wallet returned its hash (`walletTxKey`), before Quasar took it: an invoice the
 * seller cancelled meanwhile keeps its outcome in the store while Quasar records the payment. It is `false` again only
 * when Quasar says that the payment failed for good or does not pay the invoice (`isFinalPaymentFailure`), until the
 * next one (a new hash counts again).
 *
 * @param params - See {@link UsePaymentSentParams}.
 * @returns Whether a payment of this invoice may still arrive although the store no longer follows it.
 */
export function usePaymentSent({ store, state, walletTxKey = null }: UsePaymentSentParams): boolean {
  // The store whose invoice has a payment sent, with the error shown when it last counted: only a final failure that
  // came after it ends it (React renders again at once after the updates below, with the same error)
  const [sent, setSent] = useState<{ store: CheckoutStore; error: CheckoutError | null } | null>(null);
  // The hash of the wallet already counted: it counts once, so a final failure of it ends it
  const [counted, setCounted] = useState<string | null>(null);
  const walletSent = walletTxKey !== null && walletTxKey !== counted;
  if (walletSent) setCounted(walletTxKey);
  const phase: string = state.phase;
  const onItsWay =
    walletSent ||
    isPaymentOnTheWay(state) ||
    isInvoicePaymentOnTheWay(state, state.checkout) ||
    isInvoicePaymentUnresolved(state, state.checkout) ||
    phase === 'confirming' ||
    phase === 'unconfirmed';
  const own = sent?.store === store ? sent : null;
  const next = onItsWay
    ? own && own.error === state.error
      ? own
      : { store, error: state.error }
    : own && isFinalPaymentFailure(state.error) && state.error !== own.error
      ? null
      : sent;
  if (next !== sent) setSent(next);
  return next?.store === store;
}
