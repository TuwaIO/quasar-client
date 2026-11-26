/**
 * @file Sponsored batches the wallet took, kept in the browser until their hash comes. The checkout store keeps what the
 * wallet sent by its hash, and a batch has none yet: without this a reload, or the link opened again in another tab,
 * would offer Pay next to a batch that can still land, and its hash would never reach Quasar.
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

// The browser's, not the tab's: a tab closed while the batch was on its way took its `sessionStorage` along
const storage = () => {
  try {
    return (globalThis as { localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> }).localStorage ?? null;
  } catch {
    // Blocked storage throws on access
    return null;
  }
};

const counts = (entry: KeptBatch) => Date.now() - entry.at < BATCH_HELD_MS;

/** A batch as written: anything else in the entry is skipped, since the browser keeps it across tabs and sessions. */
const isBatch = (entry: unknown): entry is KeptBatch =>
  typeof entry === 'object' &&
  entry !== null &&
  typeof (entry as KeptBatch).invoiceId === 'string' &&
  typeof (entry as KeptBatch).batchId === 'string' &&
  typeof (entry as KeptBatch).at === 'number';

const read = (): KeptBatch[] => {
  try {
    const kept: unknown = JSON.parse(storage()?.getItem(KEY) ?? '[]');
    return Array.isArray(kept) ? kept.filter(isBatch) : [];
  } catch {
    return [];
  }
};

/** Writes the batches that still count: one that no longer does leaves the browser with the next write. */
const write = (entries: KeptBatch[]) => {
  try {
    const counting = entries.filter(counts);
    if (counting.length > 0) storage()?.setItem(KEY, JSON.stringify(counting));
    else storage()?.removeItem(KEY);
  } catch {
    // A full or blocked storage: only a reload loses it
  }
};

/**
 * Forgets the batch of an invoice, and every batch that no longer counts.
 *
 * Side effects: `localStorage` under `nova-payments:sponsoredBatches`.
 *
 * @param invoiceId - The invoice.
 * @internal
 */
export const forgetBatch = (invoiceId: string) => write(read().filter((entry) => entry.invoiceId !== invoiceId));

/**
 * Keeps a batch the wallet took, for {@link BATCH_HELD_MS}.
 *
 * Side effects: `localStorage` under `nova-payments:sponsoredBatches`.
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
  read().find((entry) => entry.invoiceId === invoiceId && counts(entry)) ?? null;
