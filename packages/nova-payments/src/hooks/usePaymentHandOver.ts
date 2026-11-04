import type { CheckoutState } from '@tuwaio/quasar-sdk/checkout';
import { useCallback, useEffect, useRef } from 'react';

import type { PaymentsAdapter } from '../adapters/types';
import type { NovaPaymentsLabels } from '../i18n';
import { formatTokenAmount } from '../utils/format';
import { handOverPayment, type PaymentsPulsar, type SentPayment, shouldHandOver } from '../utils/handOver';
import type { PaymentFamily } from '../utils/methods';

/** What {@link usePaymentHandOver} needs. */
export interface UsePaymentHandOverParams {
  /** The checkout store (its state is read when the payment is handed over). */
  store: { getState: () => Pick<CheckoutState, 'phase' | 'error' | 'checkout'> };
  /** Whether the checkout is open (a modal); an inline checkout stays open while it is shown. */
  open: boolean;
  /**
   * The adapter of a chain family.
   *
   * @param family - The family.
   * @returns The adapter, if any.
   */
  adapterFor: (family: PaymentFamily) => PaymentsAdapter | undefined;
  /** The app's Pulsar store, if any. */
  pulsar: PaymentsPulsar | undefined;
  /** The labels of the checkout language. */
  labels: NovaPaymentsLabels;
  /** The checkout language (a BCP 47 tag). */
  locale: string;
}

/**
 * Follows the payment the wallet sent until the checkout closes: while it is open the checkout tracks the payment
 * itself; when it closes (or goes away) before Quasar settled the payment, the payment is handed over to the app's
 * Pulsar store, where Nova Transactions shows its toast. A wallet that sends after the checkout closed hands its
 * payment over at once.
 *
 * Side effects: on hand-over, a pending transaction in the Pulsar store and its tracker.
 *
 * @param params - See {@link UsePaymentHandOverParams}.
 * @returns The function to call with the payment the wallet sent.
 */
export function usePaymentHandOver({
  store,
  open,
  adapterFor,
  pulsar,
  labels,
  locale,
}: UsePaymentHandOverParams): (payment: SentPayment) => void {
  const sent = useRef<SentPayment | null>(null);
  const closed = useRef(!open);
  // The settings of the latest render: a hand-over may happen after the checkout went away
  const settings = useRef({ adapterFor, pulsar, labels, locale });
  useEffect(() => {
    settings.current = { adapterFor, pulsar, labels, locale };
  });

  const handOver = useCallback(
    (payment: SentPayment) => {
      const { phase, error, checkout } = store.getState();
      if (!checkout || !shouldHandOver({ phase, error })) return;
      const { adapterFor: adapterOf, pulsar: target, labels: texts, locale: language } = settings.current;
      const { amount, decimals, symbol } = payment.instructions;
      void handOverPayment({
        adapter: adapterOf(payment.instructions.family),
        pulsar: target,
        payment,
        labels: texts,
        merchant: checkout.merchant.name,
        invoice: { id: checkout.invoice.id, number: checkout.invoice.number },
        amount: `${formatTokenAmount(amount, decimals, language)} ${symbol}`,
      }).catch(() => undefined);
    },
    [store],
  );

  const release = useCallback(() => {
    closed.current = true;
    if (sent.current) handOver(sent.current);
    sent.current = null;
  }, [handOver]);

  useEffect(() => {
    if (open) closed.current = false;
    else release();
  }, [open, release]);
  useEffect(() => release, [release]);

  return useCallback(
    (payment: SentPayment) => {
      if (closed.current) handOver(payment);
      else sent.current = payment;
    },
    [handOver],
  );
}
