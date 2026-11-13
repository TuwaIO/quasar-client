import type { CheckoutState, PayerProofMessage } from '@tuwaio/quasar-sdk/checkout';
import { useEffect, useRef, useState } from 'react';

import type { PaymentsAdapter } from '../adapters/types';
import type { CheckoutWallet } from '../utils/methods';
import { PaymentWalletError, type PaymentWalletErrorKind, walletErrorKind } from '../utils/walletErrors';

/** Where the confirmation of the paying wallet stands: the wallet switches its network, then signs. */
export type PayerProofStep = 'idle' | 'switching' | 'signing';

/** Why the wallet did not confirm: its kind of failure, or a network switch the buyer refused, no signature being asked. */
export type PayerProofProblem = PaymentWalletErrorKind | 'switchDeclined';

/** What {@link usePayerProof} needs. */
export interface UsePayerProofParams {
  /** The adapter of the method's chain family; without `signMessage` the wallet cannot confirm the invoice. */
  adapter: PaymentsAdapter | undefined;
  /** The checkout store. */
  store: { getState: () => Pick<CheckoutState, 'confirmPayer' | 'requestQuote' | 'payer' | 'abandonConfirmation'> };
  /** The connected wallet. */
  wallet: CheckoutWallet | null;
  /** The CAIP-2 network of the method: a smart wallet's signature counts there only. */
  chainId: string;
}

/** What {@link usePayerProof} returns. */
export interface PayerProofFlow {
  /** Where the confirmation stands. */
  step: PayerProofStep;
  /** Why the wallet did not switch or sign, until the next try; `switchDeclined`: the buyer refused the network switch. */
  problem: PayerProofProblem | null;
  /** The message Quasar issued for the wallet to sign (its site, network, nonce), once Quasar answered. */
  request: PayerProofMessage | null;
  /**
   * Confirms the invoice from the wallet: switches the wallet to the method's network when it is on another one, then
   * has it sign Quasar's message (`confirmPayer` of the checkout store).
   *
   * @param options - `quote: true` locks the price once the wallet confirmed (the step before the price).
   * @param options.quote - Whether to lock the price after it.
   * @returns Whether the wallet confirmed the invoice.
   */
  confirm: (options?: { quote?: boolean }) => Promise<boolean>;
  /**
   * Closes the wallet window. The request stays open in the wallet: a signature it gives later still confirms the
   * invoice (and locks the price), a refusal is not shown. A cancel during the network switch asks for no signature.
   * {@link PayerProofFlow.confirm} can be called again at once: the new request replaces the open one, and signing
   * twice moves no money.
   */
  dismiss: () => void;
}

/**
 * Confirms that the connected wallet pays the invoice, for the step before the price and for a payment of a method the
 * gasless relay could pay: a free signature of Quasar's EIP-4361 message that moves no money, one per invoice and wallet.
 *
 * Side effects: wallet prompts (a network switch, the signature); `POST payer-proof/message` and `POST payer-proof`
 * through the checkout store, then `POST quote` with `quote: true`.
 *
 * @param params - See {@link UsePayerProofParams}.
 * @returns See {@link PayerProofFlow}.
 */
export function usePayerProof({ adapter, store, wallet, chainId }: UsePayerProofParams): PayerProofFlow {
  const [step, setStep] = useState<PayerProofStep>('idle');
  const [problem, setProblem] = useState<PayerProofProblem | null>(null);
  const [request, setRequest] = useState<PayerProofMessage | null>(null);
  // Each try gets a number; a dismissed one no longer changes the page
  const attempt = useRef(0);
  // Another wallet: what the last one refused or was asked is not about this one
  const address = wallet?.address;
  const shownAddress = useRef(address);
  useEffect(() => {
    if (shownAddress.current === address) return;
    shownAddress.current = address;
    attempt.current++;
    setStep('idle');
    setProblem(null);
    setRequest(null);
  }, [address]);
  // The buyer left the step: a late signature still counts, but moves nothing on the page
  const left = useRef(false);
  useEffect(() => {
    left.current = false;
    return () => {
      left.current = true;
    };
  }, []);

  const confirm = async ({ quote = false }: { quote?: boolean } = {}) => {
    const id = ++attempt.current;
    const isCurrent = () => attempt.current === id;
    setProblem(null);
    const signMessage = adapter?.signMessage;
    if (!signMessage || !wallet) {
      setProblem('unsupported');
      return false;
    }
    // A smart wallet signs for the network it is on: the one of the method, where the payment goes too
    if (wallet.chainId !== chainId && adapter.switchChain) {
      setStep('switching');
      try {
        await adapter.switchChain(chainId);
      } catch (error) {
        if (isCurrent()) {
          // Not a refusal of the signature, which was never asked for
          const kind = walletErrorKind(error);
          setProblem(kind === 'declined' ? 'switchDeclined' : kind === 'failed' ? 'switchFailed' : kind);
          setStep('idle');
        }
        return false;
      }
      // Cancelled while the wallet switched: no signature request the page no longer shows
      if (!isCurrent()) return false;
    }
    if (isCurrent()) setStep('signing');
    const askedFor = store.getState().payer;
    // Why the wallet did not sign: the store reports it as `payer_proof_declined` only
    let refusal: PayerProofProblem | null = null;
    const confirmed = await store.getState().confirmPayer(async (message, issued) => {
      if (isCurrent()) setRequest(issued);
      try {
        return await signMessage({ message, account: wallet.address, chainId: issued.chainId });
      } catch (error) {
        // A switch the adapter asked for before the signature: the buyer refused the switch, not the signature
        const kind = walletErrorKind(error);
        refusal =
          kind === 'declined' && error instanceof PaymentWalletError && error.step === 'switch'
            ? 'switchDeclined'
            : kind;
        throw error;
      }
    });
    if (isCurrent()) {
      setProblem(refusal);
      setStep('idle');
    }
    // The buyer signed, also after closing the window: the price follows, unless the buyer left this step or this wallet
    if (confirmed && quote && !left.current && store.getState().payer === askedFor)
      await store.getState().requestQuote();
    return confirmed;
  };

  return {
    step,
    problem,
    request,
    confirm,
    dismiss: () => {
      attempt.current++;
      setStep('idle');
      // The store's attempt ends too: a refusal the wallet gives later must not appear on the screen the buyer went to
      store.getState().abandonConfirmation();
    },
  };
}
