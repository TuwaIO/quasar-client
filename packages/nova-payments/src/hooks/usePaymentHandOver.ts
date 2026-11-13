import type { CheckoutState } from '@tuwaio/quasar-sdk/checkout';
import { useCallback, useEffect, useRef } from 'react';

import type { PaymentsAdapter } from '../adapters/types';
import type { NovaPaymentsLabels } from '../i18n';
import { formatTokenAmount } from '../utils/format';
import { handOverPayment, type PaymentsPulsar, type SentPayment } from '../utils/handOver';
import type { PaymentFamily } from '../utils/methods';

/**
 * The part of the checkout store {@link usePaymentHandOver} reads: the invoice's state, its payment's hash, the price
 * and the checkout.
 */
export type PaymentHandOverState = Pick<CheckoutState, 'invoiceStatus' | 'txHash' | 'quote' | 'checkout'>;

/** What {@link usePaymentHandOver} needs. */
export interface UsePaymentHandOverParams {
  /** The checkout store: read when a payment is handed over, and followed for the payments Quasar finds. */
  store: {
    getState: () => PaymentHandOverState;
    subscribe: (listener: (state: PaymentHandOverState, previous: PaymentHandOverState) => void) => () => void;
  };
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

/** States of an invoice that takes a payment: a hash Quasar records from one of them is a payment of the page's time. */
const TAKES_PAYMENT: ReadonlySet<CheckoutState['invoiceStatus']> = new Set<CheckoutState['invoiceStatus']>([
  'open',
  'processing',
  'underpaid',
]);

/** The payments of a checkout store handed over, and whether the wallet sent one from the page; one per store. */
const handedByStore = new WeakMap<object, { keys: Set<string>; sentHere: boolean }>();
const handedOf = (store: object) => {
  let handed = handedByStore.get(store);
  if (!handed) handedByStore.set(store, (handed = { keys: new Set<string>(), sentHere: false }));
  return handed;
};

/** The address of a CAIP-10 account, or the address itself. */
const addressOf = (account: string) => account.split(':').at(-1) ?? account;

/**
 * Hands the invoice's payments to the app's Pulsar store, where Nova Transactions shows their toasts (owner test
 * 2026-11-09, finding 3: no toast for any crypto payment, as a payment went over only when the checkout closed before
 * Quasar settled it). A payment the wallet sends goes over at once, the checkout open or not. A payment the page did not
 * send (a QR code, a relayed signature, another tab) goes over once Quasar records it, with its hash and the wallet that
 * paid: only while the page watched the invoice take it, never for an invoice paid before the page opened it, and not
 * when this page sent a payment of its own (a new hash is a speed-up, which Pulsar's tracker of that payment follows).
 * Each payment goes over once.
 *
 * Side effects: on hand-over, a pending transaction in the Pulsar store and its tracker.
 *
 * @param params - See {@link UsePaymentHandOverParams}.
 * @returns The function to call with the payment the wallet sent.
 */
export function usePaymentHandOver({
  store,
  adapterFor,
  pulsar,
  labels,
  locale,
}: UsePaymentHandOverParams): (payment: SentPayment) => void {
  // The settings of the latest render: a payment Quasar finds is handed over from the store's listener
  const settings = useRef({ adapterFor, pulsar, labels, locale });
  useEffect(() => {
    settings.current = { adapterFor, pulsar, labels, locale };
  });
  const handOver = useCallback(
    (payment: SentPayment) => {
      const { checkout } = store.getState();
      const { adapterFor: adapterOf, pulsar: target, labels: texts, locale: language } = settings.current;
      const handed = handedOf(store);
      if (!checkout || !target || handed.keys.has(payment.txKey)) return;
      handed.keys.add(payment.txKey);
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

  useEffect(
    () =>
      store.subscribe((state, previous) => {
        const { txHash, quote, checkout } = state;
        if (!txHash || txHash === previous.txHash || !quote || !checkout) return;
        if (!TAKES_PAYMENT.has(previous.invoiceStatus) || handedOf(store).sentHere) return;
        const payer = checkout.invoice.originWallet ?? quote.payer;
        handOver({
          txKey: txHash,
          instructions: quote.instructions,
          account: payer ? addressOf(payer) : '',
          connectorType: '',
        });
      }),
    [store, handOver],
  );

  return useCallback(
    (payment: SentPayment) => {
      handedOf(store).sentHere = true;
      handOver(payment);
    },
    [store, handOver],
  );
}
