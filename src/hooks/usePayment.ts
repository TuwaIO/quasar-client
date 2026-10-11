import type { CheckoutQuote } from '@tuwaio/quasar-sdk/checkout';
import { useRef, useState } from 'react';

import type { PaymentsAdapter } from '../adapters/types';
import type { CheckoutWallet } from '../utils/methods';
import { instructionsChainId, type PayPath } from '../utils/pay';
import { payInvoice, type PayInvoiceParams } from '../utils/payInvoice';
import { type PaymentWalletErrorKind, walletErrorKind } from '../utils/walletErrors';

/** Where a payment from the wallet stands: `wallet` while the wallet asks the buyer, `submitting` while Quasar takes it. */
export type PaymentStatus = 'idle' | 'switching' | 'wallet' | 'submitting';

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
}

/** What {@link usePayment} returns. */
export interface Payment {
  /** Where the payment stands. */
  status: PaymentStatus;
  /** Why the wallet did not pay or switch, until the next try. */
  problem: PaymentWalletErrorKind | null;
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
export function usePayment({ adapter, store, quote, wallet, path, paymasterUrl }: UsePaymentParams): Payment {
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [problem, setProblem] = useState<PaymentWalletErrorKind | null>(null);
  // Each request gets a number; a dismissed or replaced one no longer changes the page
  const request = useRef(0);

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
    pay: () =>
      run('wallet', async (isCurrent) => {
        if (!adapter || !quote || !wallet) return setProblem('unsupported');
        await payInvoice({
          adapter,
          store,
          quote,
          wallet,
          path,
          paymasterUrl,
          onWalletDone: () => isCurrent() && setStatus('submitting'),
        });
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
