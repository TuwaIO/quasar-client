/**
 * @file What the checkout shows for the state of a checkout store: the screen, the steps, the payment methods by
 * token, and when to warn about time.
 */

import type { CheckoutMethod, CheckoutPhase, CheckoutQuote, CheckoutView } from '@tuwaio/quasar-sdk/checkout';

/**
 * A screen of the checkout: the steps of a payment (`buyer`, `method`, `pay` or `qr`, `confirm`, `autoPay`) or its
 * outcome.
 */
export type CheckoutScreen =
  | 'loading'
  | 'error'
  | 'buyer'
  | 'method'
  | 'pay'
  | 'qr'
  | 'confirm'
  | 'paid'
  | 'autoPay'
  | 'underpaid'
  | 'held'
  | 'refunded'
  | 'expired'
  | 'cancelled'
  | 'replaced'
  | 'blocked';

/** Choices of the buyer that the checkout store does not hold. */
export interface CheckoutScreenChoices {
  /** Pay from a wallet in this browser (default) or scan a QR code with a phone. */
  payWith?: 'wallet' | 'qr';
  /** The buyer opened the automatic payments offer after paying the first period of a subscription. */
  autoPay?: boolean;
  /**
   * The buyer continues on a phone: with `payWith` `qr`, the QR code of the payment page shows before any price is
   * locked (an EVM method, paid from the phone's wallet on that page).
   */
  handoff?: boolean;
  /**
   * The labels of the invoice's language are loaded (default `true`). Until then the checkout stays on `loading`, so
   * its first screen never shows in English before the buyer's language arrives.
   */
  labelsReady?: boolean;
}

/**
 * The screen for the state of a checkout store.
 *
 * @param state - The `phase`, `checkout` and `quote` of the store.
 * @param state.phase - Where the payment stands.
 * @param state.checkout - What the checkout token opens; `null` until loaded.
 * @param state.quote - The locked price; while the first one is being locked the method screen stays, with its button
 * busy, so a refused payer or a failed request is shown where the buyer chose.
 * @param choices - What the buyer chose on the page.
 * @returns The screen: `qr` instead of `pay` when the buyer pays with a QR code (or the price was locked without a
 * payer), `replaced` for an invoice the seller
 * corrected, `autoPay` after a paid subscription period while the automatic payments offer is open, `loading` until
 * the labels of the invoice's language are loaded.
 */
export function checkoutScreen(
  state: { phase: CheckoutPhase; checkout: CheckoutView | null; quote?: CheckoutQuote | null },
  choices: CheckoutScreenChoices = {},
): CheckoutScreen {
  if (choices.labelsReady === false && state.phase !== 'error') return 'loading';
  switch (state.phase) {
    case 'selectMethod':
      return choices.handoff && choices.payWith === 'qr' ? 'qr' : 'method';
    case 'quoting':
      if (!state.quote) return 'method';
      return choices.payWith === 'qr' || state.quote.payer === null ? 'qr' : 'pay';
    case 'awaitingPayment':
    case 'submitting':
      // A price locked without a payer is a Solana Pay QR code, also when the page was reloaded
      return choices.payWith === 'qr' || state.quote?.payer === null ? 'qr' : 'pay';
    case 'confirming':
      return 'confirm';
    case 'paid':
      return choices.autoPay && state.checkout?.autoCharge?.status === 'available' ? 'autoPay' : 'paid';
    case 'cancelled':
      return state.checkout?.invoice.replacedBy ? 'replaced' : 'cancelled';
    default:
      return state.phase;
  }
}

/** A step of the stepper in the checkout header. */
export interface CheckoutStep {
  /** `details` (buyer details), `method`, `pay`, `confirm`, `autoPay` (automatic payments of a subscription). */
  key: 'details' | 'method' | 'pay' | 'confirm' | 'autoPay';
  /** Before, at or after the current step. */
  state: 'done' | 'current' | 'upcoming';
}

const STEP_OF_SCREEN: Partial<Record<CheckoutScreen, CheckoutStep['key']>> = {
  buyer: 'details',
  method: 'method',
  pay: 'pay',
  qr: 'pay',
  underpaid: 'pay',
  confirm: 'confirm',
  autoPay: 'autoPay',
};

/**
 * The steps of the stepper for a screen.
 *
 * @param screen - The current screen.
 * @param options - Steps that apply to this invoice.
 * @param options.withDetails - The checkout asked for the buyer details first.
 * @returns The steps, or `null` on an outcome screen, whose header shows its title instead.
 */
export function checkoutSteps(screen: CheckoutScreen, options: { withDetails?: boolean } = {}): CheckoutStep[] | null {
  const current = STEP_OF_SCREEN[screen];
  if (!current) return null;
  const keys: CheckoutStep['key'][] = [
    ...(options.withDetails || current === 'details' ? (['details'] as const) : []),
    'method',
    'pay',
    'confirm',
    ...(current === 'autoPay' ? (['autoPay'] as const) : []),
  ];
  const index = keys.indexOf(current);
  return keys.map((key, i) => ({ key, state: i < index ? 'done' : i === index ? 'current' : 'upcoming' }));
}

/** The methods of one token, as the method step shows it: the token first, then its network. */
export interface CheckoutTokenGroup {
  /** Token symbol. */
  symbol: string;
  /** Its methods, one per network: the connected wallet's network first, then the Popular ones. */
  methods: CheckoutMethod[];
  /** The merchant marks one of its methods Popular. */
  featured: boolean;
  /** One of its methods is on the network of the connected wallet. */
  inWallet: boolean;
}

/**
 * Groups payment methods by token: the token picked first, then its network (decision of 2026-10-10). Groups with a
 * method on the connected wallet's network come first, then those the merchant marks Popular; otherwise the
 * merchant's order stays.
 *
 * @param methods - The methods of the checkout, in the merchant's order.
 * @param walletChainId - CAIP-2 chain of the connected wallet, if any.
 * @returns The groups.
 */
export function groupMethodsByToken(methods: CheckoutMethod[], walletChainId?: string | null): CheckoutTokenGroup[] {
  const rank = (method: CheckoutMethod) => (method.chainId === walletChainId ? 0 : method.featured ? 1 : 2);
  const groups = new Map<string, CheckoutMethod[]>();
  for (const method of methods) groups.set(method.symbol, [...(groups.get(method.symbol) ?? []), method]);
  const list = [...groups].map(([symbol, items]) => {
    const sorted = [...items].sort((a, b) => rank(a) - rank(b));
    return {
      symbol,
      methods: sorted,
      featured: items.some((method) => method.featured),
      inWallet: Boolean(walletChainId) && items.some((method) => method.chainId === walletChainId),
    };
  });
  const groupRank = (group: CheckoutTokenGroup) => (group.inWallet ? 0 : group.featured ? 1 : 2);
  return list.sort((a, b) => groupRank(a) - groupRank(b));
}

/** Minutes before the invoice deadline at which screen readers hear how much time is left. */
export const DEADLINE_ANNOUNCEMENTS = [10, 5, 1] as const;

/**
 * Whether a tick of the invoice countdown crossed one of the announcement minutes ({@link DEADLINE_ANNOUNCEMENTS} by
 * default): the checkout announces the time left then (WCAG 2.2.1), not every second.
 *
 * @param previousMs - Time left at the previous tick; `null` on the first one.
 * @param ms - Time left now.
 * @param announcements - The minutes before the deadline to announce at.
 * @returns The minutes to announce (the nearest when several were crossed at once), or `null`.
 */
export function deadlineAnnouncement(
  previousMs: number | null,
  ms: number,
  announcements: readonly number[] = DEADLINE_ANNOUNCEMENTS,
): number | null {
  if (previousMs === null || ms <= 0) return null;
  const crossed = announcements.filter((minutes) => previousMs > minutes * 60_000 && ms <= minutes * 60_000);
  return crossed.length ? Math.min(...crossed) : null;
}

/** How long before a locked price ends the checkout offers to keep it (WCAG 2.2.1: 20 seconds at least). */
export const QUOTE_WARNING_MS = 60_000;

/**
 * Whether a locked price is in its last minute, when the checkout offers to keep it.
 *
 * @param ms - Time left of the price lock.
 * @returns `true` from {@link QUOTE_WARNING_MS} down to the end.
 */
export function isQuoteEnding(ms: number): boolean {
  return ms > 0 && ms <= QUOTE_WARNING_MS;
}
