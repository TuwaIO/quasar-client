import type { CheckoutQuote, PaymentInstructions } from '@tuwaio/quasar-sdk/checkout';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import type { PaymentsAdapter } from '../adapters/types';
import type { SentPayment } from '../utils/handOver';
import { BATCH_HELD_MS, forgetBatch, keepBatch, keptBatchOf } from '../utils/keptBatches';
import type { CheckoutWallet } from '../utils/methods';
import { instructionsChainId, type PayPath } from '../utils/pay';
import { payInvoice, type PayInvoiceParams } from '../utils/payInvoice';
import { OPEN_REQUEST_MS } from '../utils/settlesWithin';
import { PaymentWalletError, type PaymentWalletErrorKind, walletErrorKind } from '../utils/walletErrors';

/** Where a payment from the wallet stands: `wallet` while the wallet asks the buyer, `submitting` while Quasar takes it. */
export type PaymentStatus = 'idle' | 'switching' | 'wallet' | 'submitting';

export { OPEN_REQUEST_MS };

/** What waits in the wallet, or may have gone out, for a checkout. */
interface OpenRequest {
  /** The wallet asked. */
  account: string;
  /** How it was asked: a signature can be asked for again, a transaction cannot. */
  path: PayPath;
  /** Settles when the wallet answers and Quasar took it. */
  paying: Promise<unknown>;
  /** Until when no other request goes to this wallet. */
  until: number;
  /** Whether the wallet took a payment that is not confirmed yet. */
  unconfirmed: boolean;
  /** What the wallet was asked to send: a new price on the page does not change it. */
  instructions: PaymentInstructions;
  /** Whether the wallet took a sponsored batch, whose hash comes later: money may be on its way with no key to show. */
  accepted: boolean;
}

// One per checkout store, not per pay step: the step unmounts on every screen change while the wallet keeps its request.
// A second request next to one that waits could be confirmed too, and the buyer pays twice
const openRequests = new WeakMap<object, OpenRequest>();

/**
 * Whether the wallet took a sponsored batch of this checkout that has no hash yet: nothing the store knows of, and still the
 * page must not say that nothing was sent.
 *
 * @param store - The checkout store.
 * @returns Whether such a batch may be on its way.
 * @internal
 */
export function isPaymentAccepted(store: object): boolean {
  const open = openRequests.get(store);
  return Boolean(open?.accepted && Date.now() < open.until);
}

/** What {@link usePayment} needs. */
export interface UsePaymentParams {
  /** The adapter of the quote's chain family; without it the wallet cannot pay. */
  adapter: PaymentsAdapter | undefined;
  /** The checkout store. */
  store: PayInvoiceParams['store'];
  /** The locked quote. */
  quote: CheckoutQuote | null;
  /** The wallet the quote is locked to. */
  wallet: CheckoutWallet | null;
  /** How the wallet pays. */
  path: PayPath;
  /** The checkout's ERC-7677 paymaster URL. */
  paymasterUrl: string | null;
  /** The invoice: a sponsored batch the wallet took is kept in the tab under it until its hash comes. */
  invoiceId?: string;
  /**
   * Called with the payment the wallet sent (not a gasless signature, whose transaction Quasar sends).
   *
   * @param payment - The transaction and what it pays.
   */
  onSent?: (payment: SentPayment) => void;
}

/** What {@link usePayment} returns. */
export interface Payment {
  /** Where the payment stands. */
  status: PaymentStatus;
  /** Why the wallet did not pay or switch, until the next try. */
  problem: PaymentWalletErrorKind | null;
  /** The wallet asked, for the window: it keeps its name when the buyer disconnects it while the request waits there. */
  askedWallet: CheckoutWallet | null;
  /** What the wallet was asked to send, for the window: a request that waits keeps its amount under a new price. */
  askedInstructions: PaymentInstructions | null;
  /** Pays the quote from the wallet; resolves when Quasar took it or the wallet refused. */
  pay: () => Promise<void>;
  /** Asks the wallet to switch to the quote's chain. */
  switchNetwork: () => Promise<void>;
  /**
   * Closes the wallet window. A request the wallet still shows stays open there: a transaction it sends later is
   * still handed to Quasar, a refusal is not shown.
   */
  dismiss: () => void;
}

/**
 * Pays a locked quote from the connected wallet and says where it stands, for the pay step.
 *
 * Side effects: wallet prompts; requests to the checkout routes of Quasar.
 *
 * @param params - See {@link UsePaymentParams}.
 * @returns See {@link Payment}.
 */
export function usePayment({
  adapter,
  store,
  quote,
  wallet,
  path,
  paymasterUrl,
  invoiceId,
  onSent,
}: UsePaymentParams): Payment {
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [problem, setProblem] = useState<PaymentWalletErrorKind | null>(() => {
    const kept = openRequests.get(store);
    const stillHeld = kept?.unconfirmed && kept.account === wallet?.address && Date.now() < kept.until;
    const fromBeforeReload = invoiceId ? keptBatchOf(invoiceId) : null;
    return stillHeld || fromBeforeReload ? 'sentUnconfirmed' : null;
  });
  const reportLate = useEffectEvent((payment: SentPayment) => onSent?.(payment));

  // The page was reloaded after the wallet took a batch: it can still land, so Pay stays shut, and its hash reaches Quasar
  useEffect(() => {
    if (!invoiceId || openRequests.has(store)) return;
    const kept = keptBatchOf(invoiceId);
    if (!kept) return;
    const paying = Promise.reject(
      new PaymentWalletError('sentUnconfirmed', 'The sponsored payment is not confirmed yet'),
    );
    paying.catch(() => undefined);
    const until = kept.at + BATCH_HELD_MS;
    openRequests.set(store, {
      account: kept.account,
      path: 'paymaster',
      paying,
      until,
      unconfirmed: true,
      instructions: kept.instructions,
      accepted: true,
    });
    adapter?.followSponsoredCalls?.({
      batchId: kept.batchId,
      until,
      onLate: (txKey) => {
        forgetBatch(invoiceId);
        reportLate({
          txKey,
          instructions: kept.instructions,
          account: kept.account,
          connectorType: kept.connectorType,
        });
        void store.getState().submit({ txKey, connectorType: kept.connectorType, methodId: kept.methodId });
      },
    });
  }, [invoiceId, adapter, store]);
  // Each request gets a number; a dismissed or replaced one no longer changes the page
  const request = useRef(0);
  const [askedWallet, setAskedWallet] = useState<CheckoutWallet | null>(null);
  const [askedInstructions, setAskedInstructions] = useState<PaymentInstructions | null>(null);

  const run = async (next: PaymentStatus, action: (isCurrent: () => boolean) => Promise<unknown>) => {
    const id = ++request.current;
    const isCurrent = () => request.current === id;
    setProblem(null);
    setStatus(next);
    try {
      await action(isCurrent);
    } catch (error) {
      if (isCurrent()) setProblem(walletErrorKind(error));
    } finally {
      if (isCurrent()) setStatus('idle');
    }
  };

  return {
    status,
    problem,
    askedWallet,
    askedInstructions,
    pay: () =>
      run('wallet', async (isCurrent) => {
        if (!adapter || !quote || !wallet) return setProblem('unsupported');
        setAskedWallet(wallet);
        // Closing our window leaves the request open in the wallet. Only a repeat of a signature (`relay`) may be asked
        // again: it pays once however often it is signed. Who pays the gas changes nothing about the rest, both move money
        const waiting = openRequests.get(store);
        const repeatsSignature = waiting?.path === 'relay' && path === 'relay';
        if (waiting?.account === wallet.address && !repeatsSignature && Date.now() < waiting.until) {
          // The window shows again and says that the request waits in the wallet, with what that request sends
          setAskedInstructions(waiting.instructions);
          await waiting.paying;
          return;
        }
        setAskedInstructions(quote.instructions);
        const entry: OpenRequest = {
          account: wallet.address,
          path,
          paying: Promise.resolve(),
          until: Date.now() + OPEN_REQUEST_MS,
          unconfirmed: false,
          instructions: quote.instructions,
          accepted: false,
        };
        openRequests.set(store, entry);
        const paying = payInvoice({
          adapter,
          store,
          quote,
          wallet,
          path,
          paymasterUrl,
          onWalletDone: () => {
            if (path === 'paymaster') entry.accepted = true;
            if (isCurrent()) setStatus('submitting');
          },
          onBatchAccepted: (batchId) => {
            if (!invoiceId) return;
            keepBatch({
              invoiceId,
              batchId,
              account: wallet.address,
              instructions: quote.instructions,
              connectorType: wallet.connectorType,
              methodId: quote.methodId,
              at: Date.now(),
            });
          },
          // Reported even after a cancel: the checkout follows the transaction until Quasar settles it
          onSent: (txKey) => {
            if (invoiceId) forgetBatch(invoiceId);
            onSent?.({
              txKey,
              instructions: quote.instructions,
              account: wallet.address,
              connectorType: wallet.connectorType,
            });
          },
        });
        entry.paying = paying;
        const settled = () => {
          if (openRequests.get(store) === entry) openRequests.delete(store);
          if (invoiceId) forgetBatch(invoiceId);
        };
        paying.then(settled, (error: unknown) => {
          if (walletErrorKind(error) !== 'sentUnconfirmed') return settled();
          // The wallet took it and it may still land: "do not pay again" holds after Back and a new price too
          entry.unconfirmed = true;
          entry.until = Date.now() + BATCH_HELD_MS;
        });
        await paying;
      }),
    switchNetwork: () =>
      run('switching', async () => {
        if (!adapter?.switchChain || !quote) return setProblem('unsupported');
        await adapter.switchChain(instructionsChainId(quote.instructions));
      }),
    dismiss: () => {
      request.current++;
      setStatus('idle');
    },
  };
}
