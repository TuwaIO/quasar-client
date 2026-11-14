import type { CheckoutMethod, CheckoutState, CheckoutStore, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { createContext } from 'react';

import type { PaymentsAdapter } from '../adapters/types';
import type { CheckoutLocale, NovaPaymentsLabels } from '../i18n';
import type { CheckoutScreen } from '../utils/checkout';
import type { SentPayment } from '../utils/handOver';
import type { CheckoutWallet, PaymentFamily } from '../utils/methods';
import type { PaymentCheckoutCustomization } from './customization';
import type { PaymentCheckoutDisplay } from './PaymentCheckout';

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
  /**
   * Switches the checkout to the language the buyer picked in the menu and saves it on the invoice, for the documents
   * still to be issued (`setLocale` of the checkout store). The pick stays the language shown, also over the language of
   * the page (`locale` of `PaymentCheckout`), until that page changes its language; a pick Quasar did not save is undone.
   *
   * @param locale - The language picked.
   */
  setLocale: (locale: CheckoutLocale) => Promise<void>;
  /** `Date.now()` of the latest second tick. */
  now: number;
  /**
   * When this page handed its current payment over (the phase became `confirming`), by the clock of the page; `null`
   * while no payment of it is confirming, or when it was already confirming as the checkout opened.
   */
  handedOverAt: number | null;
  /** The checkout showed a QR code for the invoice, which the buyer may have paid with from a phone. */
  qrShown: boolean;
  /**
   * This page handed a payment of the invoice over, or saw one on its way, and Quasar did not say that it failed for
   * good: it may still arrive, also after the store stopped following it.
   */
  paymentSent: boolean;
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
   * Asks the buyer to connect a wallet of a chain family and nothing more: no price is locked for it.
   *
   * @param family - The chain family.
   * @returns Whether the page can connect a wallet.
   */
  connectFamily: (family: 'eip155' | 'solana') => boolean;
  /** Whether the page opened on an invoice already paid: the buyer reads its receipt, nothing was just paid. */
  openedPaid: boolean;
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
   * Leaves the failed step for the step that pays again (the locked price while it holds, else the methods), and drops
   * the failure it showed: the buyer has read it.
   */
  payAfterFailure: () => void;
  /**
   * Whether the buyer continued with a wallet that must confirm the invoice before the price: the step that confirms
   * it shows while the checkout store waits for the signature (`ConfirmWalletScreen`).
   */
  confirmWallet: boolean;
  /**
   * Shows or leaves the step that confirms the wallet ("Back to methods").
   *
   * @param show - Whether it shows.
   */
  setConfirmWallet: (show: boolean) => void;
  /**
   * Locks the price for the wallet set on the checkout store, or shows the step that confirms the wallet first while
   * the store says it must (before the price).
   *
   * @returns Resolves when the price is locked, refused, or the step shows.
   */
  lockPrice: () => Promise<void>;
  /**
   * Takes the payment the wallet sent: the checkout follows it, and hands it over to the app's Pulsar store at once,
   * where Nova Transactions shows its toast.
   *
   * @param payment - The transaction and what it pays.
   */
  onPaymentSent: (payment: SentPayment) => void;
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
  /**
   * How the checkout shows (`display` of `PaymentCheckout`): a modal belongs to the page under it, so its paid outcome
   * closes it instead of sending the buyer back to the seller's page.
   */
  display: PaymentCheckoutDisplay;
  /** Class name functions and replacement components of the parts (`customization` of `PaymentCheckout`). */
  customization: PaymentCheckoutCustomization;
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

/** Gives the parts of a checkout what they share. @internal */
export const CheckoutContextProvider = CheckoutContext.Provider;

/** The context object, for {@link useCheckoutContext}. @internal */
export { CheckoutContext };
