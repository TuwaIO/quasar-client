/**
 * @file Sponsored batches the wallet took, kept in the tab until their hash comes. The checkout store keeps what the wallet
 * sent by its hash, and a batch has none yet: without this a reload would offer Pay next to a batch that can still land.
 */

import type { PaymentInstructions } from '@tuwaio/quasar-sdk/checkout';

const KEY = 'nova-payments:sponsoredBatches';

/**
 * How long a batch counts after the wallet took it: as long as its transaction may still be found.
 *
 * @internal
 */
export const BATCH_HELD_MS = 35 * 60 * 1000;

/**
 * A batch as kept.
 *
 * @internal
 */
export interface KeptBatch {
  invoiceId: string;
  batchId: string;
  account: string;
  instructions: PaymentInstructions;
  connectorType: string;
  methodId?: string;
  at: number;
}

const storage = () => {
  try {
    return (
      (globalThis as { sessionStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> }).sessionStorage ?? null
    );
  } catch {
    // Blocked storage throws on access
    return null;
  }
};

const read = (): KeptBatch[] => {
  try {
    const kept: unknown = JSON.parse(storage()?.getItem(KEY) ?? '[]');
    return Array.isArray(kept) ? (kept as KeptBatch[]) : [];
  } catch {
    return [];
  }
};

const write = (entries: KeptBatch[]) => {
  try {
    if (entries.length > 0) storage()?.setItem(KEY, JSON.stringify(entries));
    else storage()?.removeItem(KEY);
  } catch {
    // A full or blocked storage: only a reload loses it
  }
};

/**
 * Forgets the batch of an invoice.
 *
 * Side effects: `sessionStorage`.
 *
 * @param invoiceId - The invoice.
 * @internal
 */
export const forgetBatch = (invoiceId: string) => write(read().filter((entry) => entry.invoiceId !== invoiceId));

/**
 * Keeps a batch the wallet took.
 *
 * Side effects: `sessionStorage` under `nova-payments:sponsoredBatches`.
 *
 * @param batch - The batch.
 * @internal
 */
export const keepBatch = (batch: KeptBatch) =>
  write([...read().filter((entry) => entry.invoiceId !== batch.invoiceId), batch]);

/**
 * The batch of an invoice that still counts.
 *
 * @param invoiceId - The invoice.
 * @returns The batch, or `null`.
 * @internal
 */
export const keptBatchOf = (invoiceId: string): KeptBatch | null =>
  read().find((entry) => entry.invoiceId === invoiceId && Date.now() - entry.at < BATCH_HELD_MS) ?? null;
