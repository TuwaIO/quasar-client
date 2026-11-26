/**
 * @file What Quasar knows of how the payments of an invoice ended, as the app's Pulsar store keeps it.
 */

import { TransactionStatus, type UpdatableTransactionFields } from '@tuwaio/pulsar-core';
import type { CheckoutInvoice, CheckoutRejectedPayment } from '@tuwaio/quasar-sdk/checkout';

/** A transaction that ended, and what the store writes of it. */
export interface EndedPayment {
  /** The transaction: its hash, or its Solana signature. */
  txKey: string;
  /** How it ended. */
  fields: UpdatableTransactionFields;
}

/** Reasons of a rejection that say the transaction failed, or never reached the network. */
const FAILED_REASONS: ReadonlySet<string> = new Set(['reverted', 'expired', 'unresolved_after_24h']);

const succeeded = (txKey: string): EndedPayment => ({
  txKey,
  fields: { pending: false, isError: false, status: TransactionStatus.Success },
});

const replaced = (txKey: string, reason: 'repriced' | 'cancelled', by: string | undefined): EndedPayment => ({
  txKey,
  fields: {
    pending: false,
    status: TransactionStatus.Replaced,
    replacedReason: reason,
    ...(by && { replacedTxHash: by as `0x${string}` }),
  },
});

/** How a transaction that did not pay the invoice ended; `null` while nothing on the network says so. */
function endOf({ txKey, reason, final, movedMoney, replacedBy }: CheckoutRejectedPayment): EndedPayment | null {
  // Only lost sight of, or not recorded yet: its tracker goes on
  if (!final) return null;
  if (reason === 'cancelled') return replaced(txKey, 'cancelled', replacedBy);
  if (FAILED_REASONS.has(reason)) {
    return { txKey, fields: { pending: false, isError: true, status: TransactionStatus.Failed } };
  }
  // It went through and pays nothing, which the page tells: its toast speaks of the transfer alone
  return movedMoney ? succeeded(txKey) : null;
}

/**
 * The transactions of an invoice that ended, as Quasar knows them: those credited, those that did not pay it, and the ones a
 * wallet sped up into them, which come first (the store follows a speed-up under its new hash).
 *
 * @param invoice - The invoice, as the checkout reads it.
 * @returns The transactions.
 */
export function endedPayments(invoice: Pick<CheckoutInvoice, 'payments' | 'rejectedPayments'>): EndedPayment[] {
  const credited = (invoice.payments ?? []).map(({ txKey, original }) => ({ original, end: succeeded(txKey) }));
  const rejected = (invoice.rejectedPayments ?? []).map((payment) => ({
    original: payment.original,
    end: endOf(payment),
  }));
  return [...credited, ...rejected].flatMap(({ original, end }) =>
    end ? [...(original ? [replaced(original, 'repriced', end.txKey)] : []), end] : [],
  );
}
