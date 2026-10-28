import type { CheckoutState, CheckoutStore } from '@tuwaio/quasar-sdk/checkout';
import { useState } from 'react';

import { isFinalPaymentFailure, isInvoicePaymentOnTheWay, isPaymentOnTheWay } from '../utils/checkout';

/** What {@link usePaymentSent} reads of the checkout. */
export interface UsePaymentSentParams {
  /** The checkout store of the invoice. */
  store: CheckoutStore;
  /** Its state. */
  state: CheckoutState;
}

/**
 * Whether this page handed a payment of the invoice over, or saw one on its way (the page was reopened, another tab
 * paid): once `true` it stays `true` for the invoice of the store, also after the store stopped following the payment
 * (35 minutes past the deadline) or Quasar could not confirm it, so an invoice that expires afterwards never says that
 * nothing was charged. It is `false` again only when Quasar says that the payment failed for good
 * (`isFinalPaymentFailure`), until the next one.
 *
 * @param params - See {@link UsePaymentSentParams}.
 * @returns Whether a payment of this invoice may still arrive although the store no longer follows it.
 */
export function usePaymentSent({ store, state }: UsePaymentSentParams): boolean {
  const [sent, setSent] = useState<CheckoutStore | null>(null);
  const phase: string = state.phase;
  const onItsWay =
    isPaymentOnTheWay(state) ||
    isInvoicePaymentOnTheWay(state, state.checkout) ||
    phase === 'confirming' ||
    phase === 'unconfirmed';
  const next = onItsWay ? store : isFinalPaymentFailure(state.error) && sent === store ? null : sent;
  if (next !== sent) setSent(next);
  return next === store;
}
