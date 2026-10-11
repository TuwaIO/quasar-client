import type { CheckoutState, CheckoutStore, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { createContext } from 'react';

import type { NovaPaymentsLabels } from '../i18n';
import type { CheckoutScreen } from '../utils/checkout';

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
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

/** Gives the parts of a checkout what they share. @internal */
export const CheckoutContextProvider = CheckoutContext.Provider;

/** The context object, for {@link useCheckoutContext}. @internal */
export { CheckoutContext };
