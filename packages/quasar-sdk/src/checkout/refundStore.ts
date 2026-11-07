/**
 * @file The headless refund store: a merchant refunds a payment from a connected wallet in the browser.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

import { QuasarSDKError } from '../core/errors';
import type { Refund, RefundParams, RefundPreview, RefundStart, SubmitRefundParams } from '../modules/payments/types';
import { browserSessionStorage } from './browserStorage';
import type { CheckoutError, CheckoutHandOverStorage } from './store';

/**
 * Where a refund stands: `idle`; `requesting` (Quasar prices it); `awaitingTransfer` (send `instructions` from the
 * merchant's wallet, then {@link RefundState.submit}); `submitting`; `confirming` (Quasar follows the transaction);
 * `confirmed` (the credit note is issued) or `failed`.
 */
export type RefundPhase =
  'idle' | 'requesting' | 'awaitingTransfer' | 'submitting' | 'confirming' | 'confirmed' | 'failed';

/** A refund transaction the wallet sent, kept until Quasar takes it or refuses it for good. */
export interface SentRefundTransaction {
  /** The transaction (hash or Solana signature). */
  txHash: string;
  /** The wallet that sent it, which may not be the one connected now. */
  from: string;
}

/** The state and actions of {@link createRefundStore}. */
export interface RefundState {
  /** Where the refund stands. */
  phase: RefundPhase;
  /** The refund, once asked for. */
  refund: Refund | null;
  /** What to send where: chain, asset, recipient (the payer) and amount in base units. */
  instructions: RefundStart['instructions'] | null;
  /** Why the last action failed; cleared by the next one. */
  error: CheckoutError | null;
  /**
   * The transaction the wallet sent for this refund that Quasar has not taken yet. While it is set, never ask a wallet
   * again: hand it over with {@link RefundState.submit}, or the buyer is refunded twice.
   */
  sentTransaction: SentRefundTransaction | null;
  /**
   * What a refund would send, through the option `preview`: nothing is asked for.
   *
   * @param invoiceId - The paid or held invoice.
   * @param params - Amount (everything left when omitted), mode and reason.
   * @returns The preview; `null` without the option, or when it failed (`error` says why).
   */
  preview: (invoiceId: string, params?: RefundParams) => Promise<RefundPreview | null>;
  /**
   * Asks for a refund of an invoice through `request`. When a transaction sent for an earlier refund of the invoice was
   * not handed over, that refund comes back instead (`sentTransaction`), or is followed when Quasar took it after all, and
   * nothing new is asked for while Quasar does not say what became of it.
   *
   * @param invoiceId - The paid or held invoice.
   * @param params - Amount (everything left when omitted), mode and reason.
   * @returns Whether it was asked for or came back; `phase` is then `awaitingTransfer` (`confirming` when taken).
   */
  start: (invoiceId: string, params?: RefundParams) => Promise<boolean>;
  /**
   * Continues a refund that waits for its transaction (asked for earlier, or through the API).
   *
   * @param refund - The refund, `requested`.
   * @param instructions - What to send, as `request` returned it.
   */
  resume: (refund: Refund, instructions: RefundStart['instructions']) => void;
  /**
   * Reads the refund again before a wallet is asked to send it. A window can stay open while the refund is withdrawn or sent
   * elsewhere, and a wallet asked then would pay out money nobody asks for any more. What it finds shows in `phase`.
   *
   * Side effects: one `get`; follows a refund it finds submitted.
   *
   * @returns Whether a wallet may send the refund now: `false` when Quasar does not answer (`error` says so), as it cannot be
   * known then, and while `sentTransaction` holds a transaction already sent for it.
   */
  recheck: () => Promise<boolean>;
  /**
   * Hands over the refund transaction through `submit`, then follows the refund through `get` until it is final. The
   * transaction stays in `sentTransaction`, and in {@link RefundStoreOptions.handOverStorage}, until Quasar takes it or
   * refuses it for good: a refusal of 4xx, other than one that says nothing about it (401, 403, 408, 425, 429).
   *
   * @param params - The transaction and the merchant wallet it was sent from.
   * @returns Whether it was taken; `phase` is then `confirming`.
   */
  submit: (params: SubmitRefundParams) => Promise<boolean>;
  /** Stops reading the refund and keeps everything else, for when the window goes away. */
  stopFollowing: () => void;
  /** Reads the refund again after {@link RefundState.stopFollowing}, while it is `confirming`. */
  keepFollowing: () => void;
  /** Stops following and returns to `idle`. */
  reset: () => void;
}

/**
 * Options of {@link createRefundStore}: the three calls, which the app runs on its server with the secret key. A call refuses by
 * throwing: the `QuasarSDKError` of the SDK, or from an app's own route an `Error` with the `code` of the refusal, its `status`
 * and optionally `text`, what to show in the reader's language. Any other error reads as `request_failed`: Quasar did not answer.
 */
export interface RefundStoreOptions {
  /** Asks for the refund, for example a Server Action that calls `quasar.payments.refund`. */
  request: (invoiceId: string, params: RefundParams) => Promise<RefundStart>;
  /** Shows what a refund would send, for example through `quasar.payments.previewRefund`. Optional. */
  preview?: (invoiceId: string, params: RefundParams) => Promise<RefundPreview>;
  /** Hands over its transaction, for example through `quasar.payments.submitRefund`. */
  submit: (refundId: string, params: SubmitRefundParams) => Promise<Refund>;
  /** Reads the refund, for example through `quasar.payments.getRefund`. */
  get: (refundId: string) => Promise<Refund>;
  /** How often to read a refund being confirmed, in milliseconds. Defaults to `5000`. */
  pollMs?: number;
  /**
   * Where a transaction the wallet sent is kept until Quasar takes or refuses it, so that a page closed or reloaded meanwhile
   * hands it over instead of having the wallet send the refund again. Defaults to the browser's `sessionStorage` (the tab,
   * until it closes); `null` keeps it in memory only.
   */
  handOverStorage?: CheckoutHandOverStorage | null;
}

/** The store {@link createRefundStore} returns: a vanilla Zustand store. */
export type RefundStore = StoreApi<RefundState>;

/** The `sessionStorage` entry of the refund transactions Quasar has not taken yet. */
const HAND_OVERS_KEY = 'quasar-sdk:refundHandOvers';

/** How long a submitted refund is read every `pollMs`. */
const FOLLOW_CALMLY_AFTER_MS = 5 * 60_000;
/** How often it is read after that, in milliseconds. */
const CALM_READ_MS = 30_000;

/** A sent transaction as kept, with what it takes to show its refund again after a reload. */
interface KeptRefundTransaction extends SentRefundTransaction {
  refundId: string;
  invoiceId: string;
  instructions: RefundStart['instructions'];
}

/** Statuses that say nothing about the transaction: the session, a limit or a wait. It may still be taken. */
const NOT_ABOUT_THE_TRANSACTION = new Set([401, 403, 408, 425, 429]);

/** Whether Quasar refused a transaction for good, so that handing it over again cannot help. */
const refusedForGood = ({ status }: CheckoutError) =>
  status !== undefined && status >= 400 && status < 500 && !NOT_ABOUT_THE_TRANSACTION.has(status);

function errorOf(error: unknown): CheckoutError {
  if (error instanceof QuasarSDKError) {
    const other = error.details?.invoice;
    return {
      code: error.code ?? 'request_failed',
      message: error.message,
      status: error.status,
      issues: error.issues,
      ...(typeof other === 'string' ? { otherInvoice: other } : {}),
    };
  }
  const told = error as Partial<Pick<CheckoutError, 'code' | 'status' | 'text'>> | null | undefined;
  return {
    code: typeof told?.code === 'string' ? told.code : 'request_failed',
    message: error instanceof Error ? error.message : String(error),
    ...(typeof told?.status === 'number' && { status: told.status }),
    ...(typeof told?.text === 'string' && { text: told.text }),
  };
}

/**
 * Creates the headless refund of a payment from the merchant's connected wallet: ask for the refund, send its
 * `instructions` with the wallet (Pulsar or the wallet itself; the store sends nothing on-chain), hand over the
 * transaction, then follow the refund until Quasar confirms it and issues the credit note. The secret key never
 * reaches the browser: the store calls `request`, `submit` and `get`, which the app runs on its server (Server
 * Actions or its own routes calling `quasar.payments`).
 *
 * Side effects: the calls the app supplies; while `confirming`, `get` every `pollMs` for five minutes and every 30 seconds
 * after that, until the refund is final, `reset` or `stopFollowing` is called, or a read answers 401, 403 or 404; `sessionStorage` under `quasar-sdk:refundHandOvers` for a sent transaction Quasar has not taken
 * ({@link RefundStoreOptions.handOverStorage}).
 *
 * @param options - The three calls and the poll interval.
 * @returns The store.
 *
 * @example
 * ```ts
 * import { createRefundStore } from '@tuwaio/quasar-sdk/checkout';
 *
 * // refundInvoice, submitRefund and getRefund are Server Actions calling quasar.payments
 * const refunds = createRefundStore({ request: refundInvoice, submit: submitRefund, get: getRefund });
 * await refunds.getState().start(invoiceId, { reason: 'Order cancelled' });
 * // Send refunds.getState().instructions with the wallet, then:
 * await refunds.getState().submit({ txHash, from: address });
 * ```
 */
export function createRefundStore(options: RefundStoreOptions): RefundStore {
  const pollMs = options.pollMs ?? 5_000;
  let poll: ReturnType<typeof setTimeout> | null = null;
  const storage = options.handOverStorage !== undefined ? options.handOverStorage : browserSessionStorage();

  const stop = () => {
    if (poll) clearTimeout(poll);
    poll = null;
  };

  const keptTransactions = (): KeptRefundTransaction[] => {
    try {
      const kept: unknown = JSON.parse(storage?.getItem(HAND_OVERS_KEY) ?? '[]');
      return Array.isArray(kept) ? (kept as KeptRefundTransaction[]) : [];
    } catch {
      return [];
    }
  };
  const writeKept = (entries: KeptRefundTransaction[]) => {
    try {
      if (entries.length > 0) storage?.setItem(HAND_OVERS_KEY, JSON.stringify(entries));
      else storage?.removeItem(HAND_OVERS_KEY);
    } catch {
      // A full or blocked storage: the transaction is kept while the page lives
    }
  };
  const forgetTransaction = (refundId: string) =>
    writeKept(keptTransactions().filter((entry) => entry.refundId !== refundId));

  return createStore<RefundState>()((set, get) => {
    const follow = (refundId: string) => {
      stop();
      const since = Date.now();
      const readNext = () => {
        // A refund with no result yet can stay for days: past the first minutes a later answer costs the page nothing
        const wait = Date.now() - since < FOLLOW_CALMLY_AFTER_MS ? pollMs : Math.max(pollMs, CALM_READ_MS);
        const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
          void options.get(refundId).then(
            (refund) => {
              if (poll !== timer || get().refund?.id !== refundId) return;
              if (refund.status === 'confirmed' || refund.status === 'failed') {
                stop();
                set({ refund, phase: refund.status });
              } else {
                set({ refund });
                readNext();
              }
            },
            (error: unknown) => {
              if (poll !== timer) return;
              // A session that ended or a refund that is gone: reading again cannot help
              const { status } = errorOf(error);
              if (status === 401 || status === 403 || status === 404) stop();
              else readNext();
            },
          );
        }, wait);
        poll = timer;
      };
      readNext();
    };

    return {
      phase: 'idle',
      refund: null,
      instructions: null,
      error: null,
      sentTransaction: null,

      preview: async (invoiceId, params = {}) => {
        // A refusal of an earlier try is over, whether or not this store can look first
        set({ error: null });
        if (!options.preview) return null;
        try {
          return await options.preview(invoiceId, params);
        } catch (error) {
          set({ error: errorOf(error) });
          return null;
        }
      },

      start: async (invoiceId, params = {}) => {
        stop();
        set({ phase: 'requesting', error: null, refund: null, instructions: null, sentTransaction: null });
        // A transaction went out for an earlier refund of this invoice and Quasar never took it. Quasar still holds that
        // refund open and knows nothing of the transaction, so a new one would refund the buyer twice
        const kept = keptTransactions().find((entry) => entry.invoiceId === invoiceId);
        if (kept) {
          try {
            const refund = await options.get(kept.refundId);
            if (refund.status === 'requested') {
              const { txHash, from, instructions } = kept;
              set({ phase: 'awaitingTransfer', refund, instructions, sentTransaction: { txHash, from } });
              return true;
            }
            forgetTransaction(kept.refundId);
            if (refund.status === 'submitted') {
              set({ phase: 'confirming', refund });
              follow(refund.id);
              return true;
            }
          } catch (error) {
            const told = errorOf(error);
            if (told.status !== 404) {
              set({ phase: 'idle', error: told });
              return false;
            }
            forgetTransaction(kept.refundId);
          }
        }
        try {
          const { refund, instructions } = await options.request(invoiceId, params);
          set({ phase: 'awaitingTransfer', refund, instructions });
          return true;
        } catch (error) {
          set({ phase: 'idle', error: errorOf(error) });
          return false;
        }
      },

      resume: (refund, instructions) => {
        stop();
        const kept = keptTransactions().find((entry) => entry.refundId === refund.id);
        const sentTransaction = kept
          ? { txHash: kept.txHash, from: kept.from }
          : get().refund?.id === refund.id
            ? get().sentTransaction
            : null;
        set({ phase: 'awaitingTransfer', refund, instructions, error: null, sentTransaction });
      },

      recheck: async () => {
        const asked = get().refund;
        if (!asked) return false;
        try {
          const refund = await options.get(asked.id);
          if (get().refund?.id !== asked.id) return false;
          if (refund.status === 'requested') {
            // Another tab continued it and Quasar priced it again: the wallet would send the old amount. The page shows the
            // new one, and the next press sends it
            const instructions = get().instructions;
            if (
              instructions &&
              refund.cryptoAmount &&
              refund.cryptoAmount !== instructions.amount &&
              !get().sentTransaction
            ) {
              set({
                refund,
                instructions: { ...instructions, amount: refund.cryptoAmount },
                error: { code: 'refund_repriced', message: 'Quasar priced this refund again: check the new amount' },
              });
              return false;
            }
            set({ refund, error: null });
            // A transaction already went out for it, which Quasar does not know yet: a wallet asked now sends a second one
            return !get().sentTransaction;
          }
          forgetTransaction(asked.id);
          if (refund.status === 'submitted') {
            set({ phase: 'confirming', refund, error: null, sentTransaction: null });
            follow(asked.id);
          } else {
            set({ phase: refund.status, refund, error: null, sentTransaction: null });
          }
          return false;
        } catch (error) {
          set({ error: errorOf(error) });
          return false;
        }
      },

      submit: async (params) => {
        const refund = get().refund;
        if (!refund) {
          set({ error: { code: 'refund_required', message: 'Ask for the refund first' } });
          return false;
        }
        const sentTransaction = { txHash: params.txHash, from: params.from };
        // Kept before the call: a tab closed on the way must not lose the only record of money that left the wallet
        const instructions = get().instructions;
        if (instructions) {
          writeKept([
            ...keptTransactions().filter((entry) => entry.refundId !== refund.id),
            { refundId: refund.id, invoiceId: refund.invoiceId, instructions, ...sentTransaction },
          ]);
        }
        set({ phase: 'submitting', error: null, sentTransaction });
        try {
          const submitted = await options.submit(refund.id, params);
          forgetTransaction(refund.id);
          set({ phase: 'confirming', refund: submitted, sentTransaction: null });
          follow(refund.id);
          return true;
        } catch (error) {
          const refused = errorOf(error);
          if (refusedForGood(refused)) {
            forgetTransaction(refund.id);
            set({ phase: 'awaitingTransfer', error: refused, sentTransaction: null });
          } else {
            set({ phase: 'awaitingTransfer', error: refused });
          }
          return false;
        }
      },

      stopFollowing: stop,

      keepFollowing: () => {
        const { phase, refund } = get();
        if (phase === 'confirming' && refund && !poll) follow(refund.id);
      },

      reset: () => {
        stop();
        set({ phase: 'idle', refund: null, instructions: null, error: null, sentTransaction: null });
      },
    };
  });
}
