import type { CheckoutMethod, CheckoutState, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import type { ButtonHTMLAttributes, ComponentType } from 'react';

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
   * The scrolling area of the screen, under the header.
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
  /** The action is running: the default button shows a spinner and is disabled. */
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
  /** The content of the order panel on the left (from 640 px; `classNames.summary` styles the panel around it). */
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
  /** Whole screens, by the screen they replace (for example `paid` or `loading`). */
  screens?: Partial<Record<CheckoutScreen, ComponentType<CheckoutScreenProps>>>;
}

/** Class name functions and replacement components of {@link PaymentCheckout} (`customization`). */
export interface PaymentCheckoutCustomization {
  /** Classes added to the parts, from the state of the checkout. */
  classNames?: PaymentCheckoutClassNames;
  /** Components that replace parts. */
  components?: PaymentCheckoutComponents;
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
