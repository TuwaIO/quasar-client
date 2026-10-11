import type { CheckoutMethod, CheckoutState, CheckoutStore, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { createContext } from 'react';

import type { PaymentsAdapter } from '../adapters/types';
import type { NovaPaymentsLabels } from '../i18n';
import type { CheckoutScreen } from '../utils/checkout';
import type { SentPayment } from '../utils/handOver';
import type { CheckoutWallet, PaymentFamily } from '../utils/methods';

/** What the parts of a checkout share: its store and state, the screen, the language and its labels. */
export interface CheckoutContextValue {
  /** The checkout store of the invoice. */
  store: CheckoutStore;
  /** The state of the store. */
  state: CheckoutState;
  /** The checkout, once loaded. */
  checkout: CheckoutView | null;
  /** The screen shown. */
  screen: CheckoutScreen;
  /** The language of the checkout (a BCP 47 tag). */
  locale: string;
  /** The labels of that language. */
  labels: NovaPaymentsLabels;
  /** `Date.now()` of the latest second tick. */
  now: number;
  /** Closes the checkout; `undefined` when it cannot be closed (inline without `onClose`). */
  close?: () => void;
  /** The wallet connected through Satellite Connect, if any. */
  wallet: CheckoutWallet | null;
  /** How the buyer pays: from a wallet in this browser, or with a QR code on a phone. */
  payWith: 'wallet' | 'qr';
  /**
   * Sets how the buyer pays.
   *
   * @param payWith - `wallet` or `qr`.
   */
  setPayWith: (payWith: 'wallet' | 'qr') => void;
  /** The payment page of the invoice (its `payUrl`), for the QR code of an EVM method; `null` without one. */
  payUrl?: string | null;
  /**
   * Asks the buyer to connect a wallet of the method's chain family; the price is locked for it once connected.
   *
   * @param method - The chosen method.
   * @returns Whether the page can connect a wallet (Nova Connect or the app's handler).
   */
  connectWallet: (method: CheckoutMethod) => boolean;
  /**
   * The adapter that pays a chain family from the connected wallet.
   *
   * @param family - The family.
   * @returns The adapter of `NovaPaymentsProvider`, if any.
   */
  adapterFor: (family: PaymentFamily) => PaymentsAdapter | undefined;
  /** The buyer continues on a phone: the QR code of the payment page shows before any price. */
  handoff: boolean;
  /**
   * Shows or hides the QR code of the payment page.
   *
   * @param handoff - Whether it shows.
   */
  setHandoff: (handoff: boolean) => void;
  /** Goes back to the method step: forgets the locked price and the phone hand-off. */
  backToMethods: () => void;
  /**
   * Remembers the payment the wallet sent: the checkout tracks it while open, and hands it over to the app's Pulsar
   * store when it closes before Quasar settled it.
   *
   * @param payment - The transaction and what it pays.
   */
  onPaymentSent: (payment: SentPayment) => void;
  /** The buyer opened the automatic payments offer after paying a subscription period. */
  autoPay: boolean;
  /**
   * Opens or closes the automatic payments offer.
   *
   * @param autoPay - Whether it shows.
   */
  setAutoPay: (autoPay: boolean) => void;
  /**
   * Opens another invoice in this checkout: the one that replaced a corrected invoice.
   *
   * @param token - Its checkout token.
   */
  openInvoice: (token: string) => void;
  /** Replaces the link of "Contact <seller>", when the app handles it. */
  onContact?: () => void;
  /** Seconds before the paid outcome sends the buyer back to the seller; `0` for no automatic return. */
  autoReturnSeconds: number;
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

/** Gives the parts of a checkout what they share. @internal */
export const CheckoutContextProvider = CheckoutContext.Provider;

/** The context object, for {@link useCheckoutContext}. @internal */
export { CheckoutContext };
