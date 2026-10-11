import type { CheckoutMethod, CheckoutState, CheckoutStore, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { createContext } from 'react';

import type { NovaPaymentsLabels } from '../i18n';
import type { CheckoutScreen } from '../utils/checkout';
import type { CheckoutWallet } from '../utils/methods';

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
  /** The payment page of the invoice (its `payUrl`), for the QR code of an EVM method. */
  payUrl?: string;
  /**
   * Asks the buyer to connect a wallet of the method's chain family.
   *
   * @param method - The chosen method.
   */
  connectWallet: (method: CheckoutMethod) => void;
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

/** Gives the parts of a checkout what they share. @internal */
export const CheckoutContextProvider = CheckoutContext.Provider;

/** The context object, for {@link useCheckoutContext}. @internal */
export { CheckoutContext };
