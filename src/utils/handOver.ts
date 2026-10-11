/**
 * @file Handing a payment the wallet sent over to the app's Pulsar store when the checkout closes before Quasar
 * settled it: Pulsar keeps tracking it, and Nova Transactions shows its toast.
 */

import type { Transaction } from '@tuwaio/pulsar-core';
import type { CheckoutError, CheckoutPhase, PaymentInstructions } from '@tuwaio/quasar-sdk/checkout';

import type { PaymentsAdapter } from '../adapters/types';
import { formatLabel, type NovaPaymentsLabels } from '../i18n';

/** A payment the wallet sent, as the checkout remembers it until Quasar settles it. */
export interface SentPayment {
  /** The transaction hash (EVM) or signature (Solana). */
  txKey: string;
  /** What the wallet sent. */
  instructions: PaymentInstructions;
  /** The sender. */
  account: string;
  /** The connector of the wallet. */
  connectorType: string;
}

/**
 * The part of the app's Pulsar store (`createPulsarStore` of `@tuwaio/pulsar-core`) the checkout uses: pass
 * `injectExternalPendingTxs` of the store, as `pulsar` of `NovaPaymentsProvider`.
 */
export interface PaymentsPulsar {
  /**
   * Adds pending transactions to the pool and tracks them.
   *
   * @param transactions - The pending transactions.
   * @returns Resolves when their trackers started.
   */
  injectExternalPendingTxs(transactions: Transaction[]): Promise<void>;
}

/** Pulsar's limits for the texts of a transaction. */
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 300;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Phases in which Quasar settled the payment, or the invoice no longer takes one. */
const SETTLED: CheckoutPhase[] = ['paid', 'underpaid', 'held', 'refunded', 'expired', 'cancelled', 'blocked'];

/**
 * Whether a sent payment still needs tracking when the checkout closes: Quasar has not settled it, and it did not
 * fail on-chain.
 *
 * @param state - The `phase` and `error` of the checkout store.
 * @param state.phase - Where the payment stands.
 * @param state.error - The last failure; `payment_failed` means the transaction failed on-chain.
 * @returns `true` to hand it over.
 */
export function shouldHandOver(state: { phase: CheckoutPhase; error: CheckoutError | null }): boolean {
  return !SETTLED.includes(state.phase) && state.error?.code !== 'payment_failed';
}

/** What {@link handOverPayment} needs. */
export interface HandOverParams {
  /** The adapter of the payment's chain family. */
  adapter: PaymentsAdapter | undefined;
  /** The app's Pulsar store, if any. */
  pulsar: PaymentsPulsar | undefined;
  /** The sent payment. */
  payment: SentPayment;
  /** The labels of the checkout language. */
  labels: NovaPaymentsLabels;
  /** The seller's name. */
  merchant: string;
  /** The invoice: its ID and number (`null` before its document is issued). */
  invoice: { id: string; number: string | null };
  /** The amount sent, with its symbol. */
  amount: string;
}

/**
 * Hands a sent payment over to the app's Pulsar store as a pending transaction: Pulsar tracks it and keeps it in the
 * history, and Nova Transactions shows its toast. Without a Pulsar store, or an adapter that describes its
 * transactions, nothing happens.
 *
 * Side effects: writes the transaction to the Pulsar store (persisted to `localStorage` by `createPulsarStore`) and
 * starts its tracker (network reads).
 *
 * @param params - See {@link HandOverParams}.
 * @returns Whether the payment was handed over.
 */
export async function handOverPayment({
  adapter,
  pulsar,
  payment,
  labels,
  merchant,
  invoice,
  amount,
}: HandOverParams): Promise<boolean> {
  if (!pulsar || !adapter?.pulsarTransaction) return false;
  const description = invoice.number
    ? formatLabel(labels.pay.txDescription, { amount, invoice: invoice.number })
    : amount;
  const transaction = adapter.pulsarTransaction({
    ...payment,
    title: clip(formatLabel(labels.pay.txTitle, { merchant }), TITLE_MAX),
    description: clip(description, DESCRIPTION_MAX),
    payload: { quasarInvoice: invoice.id },
  });
  await pulsar.injectExternalPendingTxs([transaction]);
  return true;
}
