import type { StatusEdgeProps, StatusTone } from '@tuwaio/nova-core';
import type { HashLinkProps, TxProgressIndicatorProps, TxStatusVisualProps } from '@tuwaio/nova-transactions';
import type {
  CheckoutError,
  CheckoutMethod,
  CheckoutQuote,
  CheckoutState,
  CheckoutView,
} from '@tuwaio/quasar-sdk/checkout';
import type { ButtonHTMLAttributes, ComponentType } from 'react';

import type { CheckoutLocale } from '../i18n';
import type { CheckoutScreen, CheckoutStep, CheckoutTokenGroup } from '../utils/checkout';
import type { CheckoutContextValue } from './checkoutContext';
import type { CheckoutHeaderProps } from './CheckoutHeader';
import type { CheckoutStepperProps } from './CheckoutStepper';
import type { OutcomeKind } from './OutcomeScreen';

/** What every class name function of {@link PaymentCheckoutClassNames} receives. */
export interface CheckoutPartState {
  /** The screen shown. */
  screen: CheckoutScreen;
  /** The state of the checkout store: its phase, the chosen method, the locked price, the last error. */
  checkoutState: CheckoutState;
  /** The checkout, once loaded. */
  checkout: CheckoutView | null;
}

/**
 * Class name functions of the parts of {@link PaymentCheckout}. Each returns classes added after the default ones of
 * its part (or nothing), from the state of the checkout and what the part knows; `className` of a replacement
 * component (`PaymentCheckoutComponents`) gets them too. A color or size a part already sets is changed with the
 * `--tuwa-*` theme variables of `@tuwaio/nova-core`, or by replacing the part: which of two classes for the same
 * property wins depends on the order of the stylesheets.
 */
export interface PaymentCheckoutClassNames {
  /**
   * The checkout block with the order panel, the header and the screen (where `className` of `PaymentCheckout` goes:
   * inside the dialog, or the bordered block in the page).
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  container?: (params: CheckoutPartState) => string | undefined;
  /**
   * The order panel on the left (from 640 px).
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  summary?: (params: CheckoutPartState) => string | undefined;
  /**
   * The order above the steps on a phone.
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  compactSummary?: (params: CheckoutPartState) => string | undefined;
  /**
   * The header: the steps (or the heading of an outcome), the language menu and the close button.
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  header?: (params: CheckoutPartState) => string | undefined;
  /**
   * The list of steps.
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  stepper?: (params: CheckoutPartState) => string | undefined;
  /**
   * One step of the list.
   *
   * @param params - The state of the checkout and the step.
   * @param params.step - The step: its key and whether it is done, current or upcoming.
   * @param params.index - Its position, from 0.
   * @returns Classes to add.
   */
  step?: (params: CheckoutPartState & { step: CheckoutStep; index: number }) => string | undefined;
  /**
   * The area of the screen, under the header. It scrolls in a modal and inline; on a page the window does.
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  body?: (params: CheckoutPartState) => string | undefined;
  /**
   * The content of a step screen (buyer details, method, QR code, automatic payments), with its heading.
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  screen?: (params: CheckoutPartState) => string | undefined;
  /**
   * The bottom of a screen, with its main button.
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  footer?: (params: CheckoutPartState) => string | undefined;
  /**
   * The main button of a screen (Continue, Pay, Sign to pay, Pay the rest…).
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  primaryButton?: (params: CheckoutPartState) => string | undefined;
  /**
   * The second action under the main button (back, close, not now, contact).
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  secondaryButton?: (params: CheckoutPartState) => string | undefined;
  /**
   * A refusal or error message of a screen.
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  error?: (params: CheckoutPartState) => string | undefined;
  /**
   * A token card of the method step.
   *
   * @param params - The state of the checkout and the token.
   * @param params.group - The token and its methods.
   * @param params.selected - Whether it is selected.
   * @returns Classes to add.
   */
  tokenOption?: (params: CheckoutPartState & { group: CheckoutTokenGroup; selected: boolean }) => string | undefined;
  /**
   * A network option of the method step (when the token is on several networks).
   *
   * @param params - The state of the checkout and the method.
   * @param params.method - The method: the token on this network.
   * @param params.selected - Whether it is selected.
   * @returns Classes to add.
   */
  networkOption?: (params: CheckoutPartState & { method: CheckoutMethod; selected: boolean }) => string | undefined;
  /**
   * A "Pay with" option of the method step.
   *
   * @param params - The state of the checkout and the option.
   * @param params.payWith - `wallet` (a wallet in this browser) or `qr` (a QR code on a phone).
   * @param params.selected - Whether it is selected.
   * @returns Classes to add.
   */
  payWithOption?: (params: CheckoutPartState & { payWith: 'wallet' | 'qr'; selected: boolean }) => string | undefined;
  /**
   * The card of the seller's consent on the method step (`checkout.consent`): the box the buyer ticks and the seller's
   * words.
   *
   * @param params - The state of the checkout and the consent.
   * @param params.checked - Whether the buyer ticked it.
   * @param params.required - Whether the buyer cannot continue without ticking it.
   * @returns Classes to add.
   */
  consentOption?: (params: CheckoutPartState & { checked: boolean; required: boolean }) => string | undefined;
  /**
   * A card of grouped facts (the transaction, the rate and fees, the terms of automatic payments).
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  detailsCard?: (params: CheckoutPartState) => string | undefined;
  /**
   * A row of a card of facts (rate, network fee, recipient…).
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  detailRow?: (params: CheckoutPartState) => string | undefined;
  /**
   * The total of the order panel.
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  total?: (params: CheckoutPartState) => string | undefined;
  /**
   * A QR code (Solana Pay, or the payment page for a phone).
   *
   * @param params - The state of the checkout.
   * @returns Classes to add.
   */
  qrCode?: (params: CheckoutPartState) => string | undefined;
  /**
   * The icon of an outcome other than paid.
   *
   * @param params - The state of the checkout and the outcome.
   * @param params.kind - The outcome.
   * @returns Classes to add.
   */
  statusIcon?: (params: CheckoutPartState & { kind: OutcomeKind }) => string | undefined;
  /**
   * The chip over the heading of a status screen (Pending, Paid, Failed and the other outcomes).
   *
   * @param params - The state of the checkout, and `tone`, the state the chip shows.
   * @param params.tone - `pending`, `success`, `error` or `neutral`.
   * @returns Classes to add.
   */
  statusChip?: (
    params: CheckoutPartState & { tone: 'pending' | 'success' | 'error' | 'neutral' },
  ) => string | undefined;
  /**
   * The strip and the wash of the status color along the top of the checkout, on a payment on its way and its outcome.
   *
   * @param params - The state of the checkout, and `tone`, the state the strip shows.
   * @param params.tone - The state the strip shows.
   * @returns Classes to add.
   */
  statusEdge?: (params: CheckoutPartState & { tone: StatusTone }) => string | undefined;
}

/** Props of a replacement token card content (`PaymentCheckoutComponents.TokenOption`). */
export interface CheckoutTokenOptionProps {
  /** The token and its methods, one per network. */
  group: CheckoutTokenGroup;
  /** Whether the token is selected. */
  selected: boolean;
}

/** Props of a replacement network option content (`PaymentCheckoutComponents.NetworkOption`). */
export interface CheckoutNetworkOptionProps {
  /** The method: the token on this network. */
  method: CheckoutMethod;
  /** Whether it is selected. */
  selected: boolean;
}

/** Props of a replacement main button (`PaymentCheckoutComponents.PrimaryButton`): a `<button>`'s props and `busy`. */
export type CheckoutPrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** The action is running: the default button shows the Quasar loader and is disabled. */
  busy?: boolean;
};

/** Props of a replacement QR code (`PaymentCheckoutComponents.QrCode`). */
export interface CheckoutQrCodeProps {
  /** The text the code holds (a Solana Pay URL, or the payment page). */
  value: string;
  /** The text alternative of the code (WCAG 1.1.1). */
  label: string;
  /** The classes of the code: its size, and those of `classNames.qrCode`. */
  className?: string;
}

/** Props of a replacement outcome icon (`PaymentCheckoutComponents.StatusIcon`). */
export interface CheckoutStatusIconProps {
  /** The outcome. */
  kind: OutcomeKind;
  /** The classes of `classNames.statusIcon`. */
  className?: string;
}

/** Props of a replacement screen (`PaymentCheckoutComponents.screens`). */
export interface CheckoutScreenProps {
  /** The screen it replaces. */
  screen: CheckoutScreen;
}

/**
 * Components that replace parts of {@link PaymentCheckout}. A replacement reads the checkout with
 * {@link useCheckoutContext} (the store, its state, the labels of the checkout language, the connected wallet and the
 * actions of the steps).
 */
export interface PaymentCheckoutComponents {
  /** The header: the steps (or the heading of an outcome), the language menu and the close button; on a phone too. */
  Header?: ComponentType<CheckoutHeaderProps>;
  /**
   * The content of the order panel on the left (from 640 px; `classNames.summary` styles the panel around it). On a page
   * the panel is a flex column as tall as the sheet.
   */
  Summary?: ComponentType;
  /** The order above the steps on a phone; `className` holds the classes of `classNames.compactSummary`. */
  CompactSummary?: ComponentType<{ className?: string }>;
  /** The list of steps, in the header and, on a phone, under the order. */
  Stepper?: ComponentType<CheckoutStepperProps>;
  /** The content of a token card of the method step (the card itself stays a radio button). */
  TokenOption?: ComponentType<CheckoutTokenOptionProps>;
  /** The content of a network option of the method step (the option itself stays a radio button). */
  NetworkOption?: ComponentType<CheckoutNetworkOptionProps>;
  /** The main button of every screen. */
  PrimaryButton?: ComponentType<CheckoutPrimaryButtonProps>;
  /** A QR code. Keep it dark on light: scanners read inverted codes badly. */
  QrCode?: ComponentType<CheckoutQrCodeProps>;
  /** The icon of an outcome other than paid. */
  StatusIcon?: ComponentType<CheckoutStatusIconProps>;
  /** The strip and the wash of the status color along the top of the checkout (`StatusEdge` of `@tuwaio/nova-core`). */
  StatusEdge?: ComponentType<StatusEdgeProps>;
  /** Whole screens, by the screen they replace (for example `paid` or `loading`). */
  screens?: Partial<Record<CheckoutScreen, ComponentType<CheckoutScreenProps>>>;
}

/**
 * Handlers of {@link PaymentCheckout}: some wrap an action of the buyer (call `proceed()` or `select()` to run it, or
 * do something else instead), the others tell the app what happened. `onPaid`, `onClose` and `onContact` are props of
 * the checkout.
 */
export interface PaymentCheckoutHandlers {
  /**
   * The buyer picked a token or a network. Without the handler the method is chosen.
   *
   * @param params - The pick.
   * @param params.method - The method picked.
   * @param params.select - Chooses it.
   */
  onMethodSelect?: (params: { method: CheckoutMethod; select: () => void }) => void;
  /**
   * The buyer pressed "Continue" on the method step. Without the handler the checkout locks the price for the
   * connected wallet (or connects one first), or shows the QR code.
   *
   * @param params - The step.
   * @param params.method - The chosen method.
   * @param params.payWith - `wallet` or `qr`.
   * @param params.proceed - Goes on as the checkout would.
   */
  onQuote?: (params: {
    method: CheckoutMethod;
    payWith: 'wallet' | 'qr';
    proceed: () => Promise<void>;
  }) => void | Promise<void>;
  /**
   * The buyer pressed the pay button ("Pay", "Sign to pay"). Without the handler the wallet prompt opens.
   *
   * @param params - The payment.
   * @param params.quote - The locked price: amount, recipient, network.
   * @param params.method - The method.
   * @param params.proceed - Opens the wallet prompt.
   */
  onSubmit?: (params: {
    quote: CheckoutQuote;
    method: CheckoutMethod;
    proceed: () => Promise<void>;
  }) => void | Promise<void>;
  /**
   * The buyer picked a language. Without the handler the checkout switches to it and saves it on the invoice.
   *
   * @param params - The language.
   * @param params.locale - The language picked.
   * @param params.proceed - Switches and saves it.
   */
  onLocaleChange?: (params: { locale: CheckoutLocale; proceed: () => Promise<void> }) => void | Promise<void>;
  /**
   * The language the checkout is shown in: called once it is known (the invoice is read, or the app gave the language of
   * its page with `locale`) and on every change, whoever made it: the buyer in the menu, the page with a new `locale`,
   * or the invoice. For a page that keeps `<html lang>`, the labels of Nova or its own texts on the language of the
   * checkout.
   *
   * @param params - The language.
   * @param params.locale - The language shown, a BCP 47 tag: one of the checkout's, or the language of an invoice the
   * checkout has no labels for (it shows English then).
   */
  onLocaleShown?: (params: { locale: string }) => void;
  /**
   * The phase of the checkout or the status of the invoice changed; also called once with the first ones.
   *
   * @param params - The state.
   * @param params.phase - The phase of the checkout store.
   * @param params.status - The invoice status, `null` before the invoice loads.
   * @param params.screen - The screen shown.
   */
  onStatusChange?: (params: {
    phase: CheckoutState['phase'];
    status: CheckoutView['invoice']['status'] | null;
    screen: CheckoutScreen;
  }) => void;
  /**
   * The checkout got a new error (Quasar refused an action, or did not answer); the screen shows it.
   *
   * @param params - The error.
   * @param params.error - Its code and message.
   * @param params.screen - The screen shown.
   */
  onError?: (params: { error: CheckoutError; screen: CheckoutScreen }) => void;
  /**
   * The locked price ran out (`quote`), or the invoice expired (`invoice`). Either can happen while a payment is on its
   * way: the invoice can still close while it confirms (Quasar waits for a payment it learned of
   * before the deadline only for a limited time, and holds a payment that lands later for the seller to accept or
   * return), so do not offer a new invoice at once when `paymentOnTheWay` is `true`; the checkout keeps following the
   * invoice and shows a paid or held outcome if it changes.
   *
   * @param params - What expired.
   * @param params.kind - `quote` or `invoice`.
   * @param params.paymentOnTheWay - A payment is on its way: one this page handed over (`paymentOnTheWay` of the
   * checkout store, or, with an older `@tuwaio/quasar-sdk`, a transaction handed over), one of the invoice Quasar
   * reports (`invoicePaymentOnTheWay`: the page was reopened while it was on its way, another tab paid), or one Quasar
   * could not confirm yet and reads again (`invoicePaymentUnresolved`).
   */
  onExpire?: (params: { kind: 'quote' | 'invoice'; paymentOnTheWay: boolean }) => void;
}

/**
 * Options of {@link PaymentCheckout}. Every text and accessible name comes from the labels, and amounts and dates
 * follow the language of the checkout.
 */
export interface PaymentCheckoutConfig {
  /** Animations. They always follow `prefers-reduced-motion`; `disabled: true` turns them off for everyone. */
  animation?: {
    /** Turns the animations off. */
    disabled?: boolean;
  };
  /** Whether the header shows the steps of the payment (default `true`). */
  showSteps?: boolean;
  /**
   * Whether the pay step reads the wallet's balance (through the chain adapter) and, when it is short, offers what the
   * wallet can pay with (default `true`).
   */
  balanceCheck?: boolean;
  /**
   * Minutes before the invoice deadline at which screen readers hear the time left, while the buyer can still pay (not
   * once the payment is on its way) (default `[10, 5, 1]`).
   */
  deadlineAnnouncements?: readonly number[];
}

/** Customization of the Nova Transactions parts the confirm and paid steps show. */
export interface PaymentCheckoutChildCustomizations {
  /** The status icon (`TxStatusVisual` of `@tuwaio/nova-transactions`). */
  statusVisual?: Pick<TxStatusVisualProps, 'className' | 'iconClassNames'>;
  /** The steps Sent, Confirming, Paid (`TxProgressIndicator` of `@tuwaio/nova-transactions`). */
  progressIndicator?: Pick<TxProgressIndicatorProps, 'className' | 'stepClassNames' | 'StepComponent'>;
  /** The transaction with its explorer link (`HashLink` of `@tuwaio/nova-transactions`). */
  hashLink?: Pick<HashLinkProps, 'className' | 'classNames'>;
}

/** Customization of {@link PaymentCheckout} (`customization`). */
export interface PaymentCheckoutCustomization {
  /** Classes added to the parts, from the state of the checkout. */
  classNames?: PaymentCheckoutClassNames;
  /** Components that replace parts. */
  components?: PaymentCheckoutComponents;
  /** Handlers that wrap the actions of the buyer or tell what happened. */
  handlers?: PaymentCheckoutHandlers;
  /** Options: animations, steps, the balance check, the deadline announcements. */
  config?: PaymentCheckoutConfig;
  /** Customization of the Nova Transactions parts of the confirm and paid steps. */
  childCustomizations?: PaymentCheckoutChildCustomizations;
}

/** What a part adds to {@link CheckoutPartState} for its class name function. */
type PartExtra<K extends keyof PaymentCheckoutClassNames> = Omit<
  Parameters<NonNullable<PaymentCheckoutClassNames[K]>>[0],
  keyof CheckoutPartState
>;

/**
 * The classes `customization.classNames` adds to a part of the checkout.
 *
 * @param context - The checkout context (its customization, screen, store state and checkout).
 * @param part - The part.
 * @param extra - What the part adds to the state, such as the method of an option.
 * @returns The classes, or `undefined`.
 * @internal
 */
export function checkoutClassName<K extends keyof PaymentCheckoutClassNames>(
  context: Pick<CheckoutContextValue, 'customization' | 'screen' | 'state' | 'checkout'>,
  part: K,
  extra?: PartExtra<K>,
): string | undefined {
  const fn = context.customization.classNames?.[part] as
    ((params: CheckoutPartState) => string | undefined) | undefined;
  return fn?.({ screen: context.screen, checkoutState: context.state, checkout: context.checkout, ...extra });
}
