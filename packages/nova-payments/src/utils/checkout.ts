/**
 * @file What the checkout shows for the state of a checkout store: the screen, the steps, the payment methods by
 * token, and when to count down and warn about time.
 */

import type {
  CheckoutError,
  CheckoutMethod,
  CheckoutPhase,
  CheckoutQuote,
  CheckoutState,
  CheckoutView,
} from '@tuwaio/quasar-sdk/checkout';

/**
 * A screen of the checkout: the steps of a payment (`buyer`, `method`, `confirmWallet` — the paying wallet confirms the
 * invoice with a free signature before the price —, `pay` or `qr`, `confirm`, `autoPay`), a payment Quasar could not
 * confirm (`unconfirmed`: it may still arrive, so the buyer checks the wallet before paying again) or its outcome.
 */
export type CheckoutScreen =
  | 'loading'
  | 'error'
  | 'buyer'
  | 'method'
  | 'confirmWallet'
  | 'pay'
  | 'qr'
  | 'confirm'
  | 'unconfirmed'
  | 'paid'
  | 'autoPay'
  | 'autoPayOff'
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
  /** The buyer opened the screen that turns automatic payments off, while they are on. */
  autoPayOff?: boolean;
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
  /**
   * The buyer continued with a wallet that must confirm the invoice before the price (`payerProof` of the checkout
   * store is `required`): the step that confirms it shows while the store waits for the signature and locks the price
   * after it.
   */
  confirmWallet?: boolean;
}

/** The reason of a transaction the invoice refused because it takes no more of them. */
const INVOICE_FULL = 'too_many_payments';

/**
 * Whether the permission screen can open from this phase: another wallet takes over a permission from the steps before a
 * payment, not from an outcome that keeps its own screen.
 *
 * @param phase - The phase of the checkout store.
 * @returns Whether "Use this wallet" leads somewhere.
 */
export const takeOverOpens = (phase: string | undefined): boolean =>
  phase === 'selectMethod' || phase === 'awaitingPayment';

const replaceablePermission = (offer: CheckoutView['autoCharge'] | undefined) =>
  offer?.status === 'active' && Boolean(offer.replacement);

/**
 * The screen for the state of a checkout store.
 *
 * @param state - The `phase`, `checkout` and `quote` of the store.
 * @param state.phase - Where the payment stands.
 * @param state.checkout - What the checkout token opens; `null` until loaded.
 * @param state.quote - The locked price; while the first one is being locked the method screen stays, with its button
 * busy, so a refused payer or a failed request is shown where the buyer chose (the step that confirms the wallet, when
 * the price is locked after it).
 * @param state.payerProof - Whether the connected wallet must confirm the invoice (`payerProof` of the checkout store;
 * left out by older stores).
 * @param state.error - The store's last error: a price refused after the signature shows on the method step.
 * @param choices - What the buyer chose on the page.
 * @returns The screen: `confirmWallet` once the buyer continued (`choices.confirmWallet`) while the wallet must
 * confirm the invoice or confirms it, and after it until the price is locked (unless it was refused), also on an
 * underpaid invoice whose rest another wallet pays, `qr` instead of `pay` when the buyer pays
 * with a QR code (or the price was locked without a payer), `replaced` for an invoice the seller
 * corrected, `autoPay` after a paid subscription period while the automatic payments offer is open, `loading` until
 * the labels of the invoice's language are loaded, `unconfirmed` in the phase of that name of a current
 * `@tuwaio/quasar-sdk` (Quasar could not confirm the payment, which may still arrive).
 */
export function checkoutScreen(
  state: {
    phase: CheckoutPhase;
    checkout: CheckoutView | null;
    quote?: CheckoutQuote | null;
    readonly payerProof?: string;
    error?: CheckoutError | null;
  },
  choices: CheckoutScreenChoices = {},
): CheckoutScreen {
  if (choices.labelsReady === false && state.phase !== 'error') return 'loading';
  if (choices.autoPayOff && state.checkout?.autoCharge?.status === 'active') return 'autoPayOff';
  // `unconfirmed` is newer than some `@tuwaio/quasar-sdk` alphas: compare it as a string
  if ((state.phase as string) === 'unconfirmed') return 'unconfirmed';
  // The wallet the buyer continued with confirms the invoice, then the price is locked on the same step: the step stays
  // between the signature and the price, unless the price was refused
  const proving =
    state.payerProof === 'required' ||
    state.payerProof === 'confirming' ||
    (state.payerProof === 'confirmed' && !state.error);
  const confirmingWallet = Boolean(choices.confirmWallet && proving);
  switch (state.phase) {
    case 'selectMethod':
      // Another wallet takes over a permission that holds nothing: from an invoice that still takes one
      if (choices.autoPay && replaceablePermission(state.checkout?.autoCharge)) return 'autoPay';
      if (confirmingWallet && !(choices.handoff && choices.payWith === 'qr')) return 'confirmWallet';
      return choices.handoff && choices.payWith === 'qr' ? 'qr' : 'method';
    case 'underpaid':
      // Another wallet pays the rest: it confirms the invoice first
      return confirmingWallet ? 'confirmWallet' : 'underpaid';
    case 'quoting':
      if (!state.quote) return choices.confirmWallet ? 'confirmWallet' : 'method';
      return choices.payWith === 'qr' || state.quote.payer === null ? 'qr' : 'pay';
    case 'awaitingPayment':
      if (choices.autoPay && replaceablePermission(state.checkout?.autoCharge)) return 'autoPay';
    // falls through
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
  confirmWallet: 'method',
  pay: 'pay',
  qr: 'pay',
  underpaid: 'pay',
  confirm: 'confirm',
  unconfirmed: 'confirm',
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
 * Groups payment methods by token: the token picked first, then its network. Groups with a
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

/** Invoice states in which the invoice can still be paid, so its deadline counts. */
const PAYABLE_STATUSES: ReadonlySet<string> = new Set(['open', 'processing', 'underpaid']);
/** Screens on which the buyer can still pay; `confirm` comes after them, and the outcomes end the countdown. */
const PAYING_SCREENS: ReadonlySet<CheckoutScreen> = new Set([
  'loading',
  'error',
  'buyer',
  'method',
  'confirmWallet',
  'pay',
  'qr',
  'underpaid',
  'blocked',
]);

/**
 * Where the invoice deadline stands for the checkout: the countdown shows through every step of the payment, also while
 * the wallet signs, the payment is handed to Quasar and it confirms, and on a payer the wallet check refused
 * (`blocked`, where the buyer can pay with another wallet); it ends with the paid outcome and with the outcomes in which
 * a deadline means nothing. A payment sent before the deadline counts: Quasar keeps an `open` or `underpaid` invoice
 * while a payment it learned of before the deadline confirms (for a limited time), and holds a payment that lands after
 * the invoice closed for the seller to accept or return.
 *
 * @param status - The invoice state (`checkout.invoice.status`).
 * @param screen - The screen shown.
 * @param restPayable - Whether the rest of an underpaid invoice can be paid (`invoice.restPayable`).
 * @returns `paying` while the buyer can still pay (the countdown shows and screen readers hear the minutes left),
 * `confirming` while the payment is on its way (the countdown shows; at zero the confirm step says that the payment
 * sent in time is being confirmed) and while Quasar could not confirm it (`unconfirmed`: the buyer checks the wallet
 * before paying again, so no minutes left to pay are announced), or `null` once the payment succeeded (`paid`,
 * `autoPay`), on the outcomes in
 * which a deadline means nothing (`held`, `refunded`, `expired`, `cancelled`, `replaced`) and for an invoice that can
 * no longer be paid. `closed` while part of an underpaid invoice arrived and its rest cannot be paid: the countdown still
 * shows, as the time after which the seller can refund, and no minutes left to pay are announced.
 */
export function deadlineState(
  status: string,
  screen: CheckoutScreen,
  restPayable?: boolean,
): 'paying' | 'confirming' | 'closed' | null {
  if (!PAYABLE_STATUSES.has(status)) return null;
  if (screen === 'confirm' || screen === 'unconfirmed') return 'confirming';
  if (!PAYING_SCREENS.has(screen)) return null;
  return status === 'underpaid' && restPayable === false ? 'closed' : 'paying';
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
 * What the active wallet changing does to a locked price. A wallet connected to turn automatic payments off pays
 * nothing, so it changes nothing while that screen is open; back on the payment, what follows applies.
 *
 * @param params - What the change happens over.
 * @param params.autoPayOffOpen - The screen that turns automatic payments off is open.
 * @param params.phase - The phase of the payment; a price is locked only in `awaitingPayment`.
 * @param params.quotePayer - The payer the price is locked for.
 * @param params.payer - The payer the active wallet gives for the method of that price, or `null`.
 * @returns `keep`: nothing changes; `lock`: lock the price again for `payer`; `release`: release it, back to the methods.
 */
export function lockedPriceOnWallet(params: {
  autoPayOffOpen: boolean;
  phase: string;
  quotePayer: string | null | undefined;
  payer: string | null;
}): 'keep' | 'lock' | 'release' {
  const { autoPayOffOpen, phase, quotePayer, payer } = params;
  if (autoPayOffOpen || phase !== 'awaitingPayment' || !quotePayer || payer === quotePayer) return 'keep';
  return payer ? 'lock' : 'release';
}

/**
 * Whether a locked price is in its last minute, when the checkout offers to keep it.
 *
 * @param ms - Time left of the price lock.
 * @returns `true` from {@link QUOTE_WARNING_MS} down to the end.
 */
export function isQuoteEnding(ms: number): boolean {
  return ms > 0 && ms <= QUOTE_WARNING_MS;
}

/**
 * Whether the merchant checks paying wallets before payment: `amlScreening` of the checkout, `true` when its AML mode
 * is `block` or `flag`. The pay step says so only then. A checkout of a Quasar version without the field counts as
 * checking, as the pay step always said before.
 *
 * @param checkout - What the checkout token opens.
 * @returns `false` only when the checkout says that the merchant does not check paying wallets.
 */
export function screensPayingWallets(checkout: CheckoutView): boolean {
  // `amlScreening` is newer than some Quasar versions and `@tuwaio/quasar-sdk` alphas: read it as optional
  return (checkout as CheckoutView & { amlScreening?: boolean }).amlScreening !== false;
}

/**
 * Whether a payment this page handed over is on its way: `paymentOnTheWay` of the checkout store of a current
 * `@tuwaio/quasar-sdk` (`true` from a successful submit or relay, also a relay answered `sending`, which has no
 * transaction key, until the payment settles or fails), else, with an older store without the field, whether the page
 * handed over a transaction (`txKey` or `txHash`).
 *
 * @param state - The state of the checkout store.
 * @param state.paymentOnTheWay - What the store says, when it has the field.
 * @param state.txKey - The transaction this page submitted.
 * @param state.txHash - The transaction of the payment, once known.
 * @returns Whether a payment of this page may still arrive.
 */
export function isPaymentOnTheWay(
  state: Pick<CheckoutState, 'txKey' | 'txHash'> & { readonly paymentOnTheWay?: boolean },
): boolean {
  return state.paymentOnTheWay ?? Boolean(state.txKey || state.txHash);
}

/**
 * Whether Quasar reports a payment of the invoice on its way, whoever handed it over (another tab, the page before it
 * was reloaded, a Solana Pay transfer Quasar found): `invoicePaymentOnTheWay` of the checkout store of a current
 * `@tuwaio/quasar-sdk`, else, with an older store without the field, the `pendingPayments` of the checkout it read.
 *
 * @param state - The state of the checkout store.
 * @param state.invoicePaymentOnTheWay - What the store says, when it has the field.
 * @param checkout - What the checkout token opens; `null` until loaded.
 * @returns Whether a payment of the invoice may still arrive.
 */
export function isInvoicePaymentOnTheWay(
  state: object & { readonly invoicePaymentOnTheWay?: boolean },
  checkout: CheckoutView | null,
): boolean {
  // `pendingPayments` is newer than some `@tuwaio/quasar-sdk` alphas: read it as optional
  const pending = (checkout?.invoice as { pendingPayments?: number } | undefined)?.pendingPayments ?? 0;
  return state.invoicePaymentOnTheWay ?? pending > 0;
}

/** What {@link sentBeforeDeadline} decides with. */
export interface SentBeforeDeadlineParams {
  /**
   * The state of the checkout store: `paymentCountsUntil`, `paymentSentInTime` and `paymentOnTheWay` of a current
   * `@tuwaio/quasar-sdk` (`txKey`/`txHash` with an older one).
   */
  state: object & {
    readonly paymentCountsUntil?: string | null;
    readonly paymentSentInTime?: boolean | null;
    readonly paymentOnTheWay?: boolean;
    readonly txKey?: string | null;
    readonly txHash?: string | null;
  };
  /** The checkout: its invoice's `paymentCountsUntil` tells whether Quasar reports it, and is read with an older store. */
  checkout: CheckoutView;
  /** When this page handed its payment over, by its clock; `null` when it does not know (a reload, another tab). */
  handedOverAt: number | null;
  /** The invoice deadline (`dueAt`) in milliseconds. */
  dueAt: number;
}

/**
 * Whether the payment on its way counts as sent before the invoice deadline. For a payment this page handed over that
 * Quasar already reported on, Quasar's word on that payment decides (`paymentSentInTime` of the checkout store: its keys
 * are among the `onTimeTxKeys` Quasar learned of before `dueAt`), whatever the clock of the page says. Otherwise Quasar
 * says it for the invoice with `paymentCountsUntil` (it learned of a payment of the invoice before `dueAt` and waits for
 * it): its word decides, except for a payment this page handed over at or after the deadline by its clock, which Quasar
 * holds even while it waits for another one. A Quasar that does not report the field leaves the clock of the page: a
 * payment this page handed over before the deadline.
 *
 * @param params - See {@link SentBeforeDeadlineParams}.
 * @returns `true` to say that the payment was sent in time and is being confirmed.
 */
export function sentBeforeDeadline({ state, checkout, handedOverAt, dueAt }: SentBeforeDeadlineParams): boolean {
  // `paymentSentInTime` is newer than some `@tuwaio/quasar-sdk` alphas; it speaks of this page's payment only
  const own = state.paymentSentInTime;
  const ownOnItsWay = isPaymentOnTheWay({
    paymentOnTheWay: state.paymentOnTheWay,
    txKey: state.txKey ?? null,
    txHash: state.txHash ?? null,
  });
  if (typeof own === 'boolean' && ownOnItsWay) return own;
  // `paymentCountsUntil` is newer than some `@tuwaio/quasar-sdk` alphas and Quasar versions: read it as optional
  const reported = (checkout.invoice as { paymentCountsUntil?: string | null }).paymentCountsUntil;
  if (reported === undefined) return handedOverAt !== null && handedOverAt < dueAt;
  if (handedOverAt !== null && handedOverAt >= dueAt) return false;
  const countsUntil = state.paymentCountsUntil === undefined ? reported : state.paymentCountsUntil;
  return countsUntil !== null;
}

/**
 * The reason of a payment the network confirmed that Quasar could not record yet and settles again daily: the money
 * reached the seller's address, so it is never a failure or a transaction that does not pay the invoice (an older
 * `@tuwaio/quasar-sdk` reports it as `payment_mismatch`).
 */
const SETTLEMENT_FAILED = 'settlement_failed';

/**
 * The reason of a transaction Quasar tracks for another invoice of the seller, whose page handed it over first: with
 * `payment_unconfirmed` Quasar decides which invoice it pays, with `payment_mismatch` it paid another one.
 */
const TAKEN_ELSEWHERE = 'tx_already_used';

/**
 * Whether the last error says that the payment can never pay the invoice: `payment_failed` (reverted, cancelled…) or
 * `payment_mismatch` (it does not pay the invoice: a wrong amount or recipient…), with the reason Quasar gave. A failure
 * without a reason comes from a Quasar or a `@tuwaio/quasar-sdk` that cannot tell a final failure from a payment that
 * may still arrive, so it does not count, nor does `settlement_failed` (a payment the network confirmed that Quasar has
 * not recorded yet, which an older store reports as `payment_mismatch`).
 *
 * @param error - The store's error.
 * @returns `true` when the payment failed for good.
 */
export function isFinalPaymentFailure(error: CheckoutError | null | undefined): boolean {
  // `reason` and `payment_mismatch` are newer than some `@tuwaio/quasar-sdk` alphas: read them as strings
  const code: string | undefined = error?.code;
  const reason = (error as (CheckoutError & { reason?: string }) | null | undefined)?.reason;
  // A confirmed payment Quasar has not recorded yet (an older store calls it a mismatch) is not over
  return (code === 'payment_failed' || code === 'payment_mismatch') && Boolean(reason) && reason !== SETTLEMENT_FAILED;
}

/**
 * Rejection reasons of a transaction that succeeded on chain without paying the invoice, which Quasar marks
 * `movedMoney`: an older `@tuwaio/quasar-sdk` reports them as `payment_failed`.
 */
const MOVED_MONEY_REASONS: ReadonlySet<string> = new Set([
  'no_matching_transfer',
  'reference_missing',
  'too_early',
  'tx_already_used',
  'payer_mismatch',
  'payer_unconfirmed',
  'quote_changed',
  'too_many_parts',
  'too_many_transfers',
  'below_minimum',
  'native_from_contract_unverifiable',
  'invoice_not_payable',
]);

/**
 * Whether the last error says that the transaction succeeded on chain but does not pay the invoice (a wrong amount,
 * asset or recipient, no Solana Pay reference, sent before the price was locked…): `payment_mismatch` of a current
 * `@tuwaio/quasar-sdk`, or `payment_failed` with such a reason from an older one. It may have moved money, so the
 * checkout never says that it did not go through or that nothing was charged: it says that the transaction does not pay
 * the invoice, and to contact the seller if money left the wallet. A payment the network confirmed that Quasar has not
 * recorded yet (`settlement_failed`, which an older store reports as `payment_mismatch`) is not one: it pays the
 * invoice once Quasar records it.
 *
 * @param error - The store's error.
 * @returns `true` for a transaction that does not pay the invoice.
 */
export function isMovedMoneyFailure(error: CheckoutError | null | undefined): boolean {
  // `payment_mismatch` and `reason` are newer than some `@tuwaio/quasar-sdk` alphas: read them as strings
  const code: string | undefined = error?.code;
  const reason = (error as (CheckoutError & { reason?: string }) | null | undefined)?.reason;
  // Confirmed on chain and not recorded yet: it pays the invoice once Quasar records it
  if (reason === SETTLEMENT_FAILED) return false;
  if (code === 'payment_mismatch') return true;
  return code === 'payment_failed' && reason !== undefined && MOVED_MONEY_REASONS.has(reason);
}

/**
 * Whether the last error says that Quasar credited the transaction to another invoice of the seller, the one the
 * wallet that sent it confirmed or whose mark it carries (`tx_already_used` of a transaction that does not pay this
 * invoice): the buyer names it to the seller if it was the payment of this invoice.
 *
 * @param error - The store's error.
 * @returns `true` for a transaction that pays another invoice.
 */
export function isPaidElsewhere(error: CheckoutError | null | undefined): boolean {
  const reason = (error as (CheckoutError & { reason?: string }) | null | undefined)?.reason;
  return isMovedMoneyFailure(error) && reason === TAKEN_ELSEWHERE;
}

/**
 * Whether Quasar reports a payment of the invoice that may still arrive, with no time limit (one stuck past the minutes
 * `pendingPayments` counts, or one whose result Quasar did not see and reads again for 24 hours):
 * `invoicePaymentUnresolved` of the checkout store of a current `@tuwaio/quasar-sdk`, else the `unresolvedPayments` of
 * the checkout it read. While it is `true` the checkout never says that nothing was charged.
 *
 * @param state - The state of the checkout store.
 * @param state.invoicePaymentUnresolved - What the store says, when it has the field.
 * @param checkout - What the checkout token opens; `null` until loaded.
 * @returns Whether a payment of the invoice may still arrive.
 */
export function isInvoicePaymentUnresolved(
  state: object & { readonly invoicePaymentUnresolved?: boolean },
  checkout: CheckoutView | null,
): boolean {
  // `unresolvedPayments` is newer than some `@tuwaio/quasar-sdk` alphas and Quasar versions: read it as optional
  const unresolved = (checkout?.invoice as { unresolvedPayments?: number } | undefined)?.unresolvedPayments ?? 0;
  return state.invoicePaymentUnresolved ?? unresolved > 0;
}

/**
 * What the checkout tells the buyer about a payment that may have left the wallet and that Quasar did not confirm:
 * `rechecked` (Quasar still reads it again, for up to 24 hours after it learned of it, and records it for the seller if
 * it arrives), `retrying` (the checkout store keeps handing over a transaction the wallet sent, which Quasar has not
 * received yet: keep the page open), `notReceived` (the store gave up handing it over after an hour: Quasar never
 * received it), `contact` (a reason Quasar never reads again: a relay operation lost, `transaction_failed`, a Quasar
 * or a store that does not say), `closed` (Quasar saw no result on chain within 24 hours and closed it),
 * `takenElsewhere` (the page of another invoice handed the transaction over first: Quasar credits it to the invoice
 * that the wallet that sent it confirmed, and the page shows the result while it follows the payment),
 * `settlementRetrying` (the network confirmed it, but Quasar has not recorded it yet and settles it again daily, for 30
 * days after it learned of it: `rechecked`), `settlementFailed` (the same, without Quasar saying that it still
 * tries) and `invoiceFull` (the invoice takes no more payments: Quasar keeps the hash for the seller and follows nothing). For all but `rechecked` and `retrying` the buyer contacts the seller with the transaction hash; after
 * `takenElsewhere`, `settlementRetrying` and `settlementFailed` the payment left the wallet, so the checkout offers no
 * payment.
 */
export type UnconfirmedFollowUp =
  | 'rechecked'
  | 'retrying'
  | 'notReceived'
  | 'contact'
  | 'closed'
  | 'takenElsewhere'
  | 'settlementRetrying'
  | 'settlementFailed'
  | 'invoiceFull';

/**
 * What to tell the buyer about a payment Quasar did not confirm, from the store's error: `payment_unconfirmed` with
 * `rechecked` (set by a current `@tuwaio/quasar-sdk` only while Quasar reads the payment again) promises the 24-hour
 * re-check, its `submit_retrying` and `submit_failed` reasons are the store's hand-over, `tx_already_used` a transaction
 * another invoice handed over first, any other is for the seller; `payment_failed` with the reason
 * `unresolved_after_24h` is a payment Quasar closed without a result; the reason `settlement_failed` (`payment_mismatch`
 * of an older store) a confirmed payment Quasar has not recorded yet, which Quasar settles again daily only while
 * `rechecked` (for 30 days after it learned of it).
 *
 * @param error - The store's error.
 * @returns See {@link UnconfirmedFollowUp}; `null` for any other error, or none.
 */
export function unconfirmedFollowUp(error: CheckoutError | null | undefined): UnconfirmedFollowUp | null {
  // `payment_unconfirmed`, `reason` and `rechecked` are newer than some `@tuwaio/quasar-sdk` alphas: read them as such
  const code: string | undefined = error?.code;
  const { reason, rechecked } = (error ?? {}) as { reason?: string; rechecked?: boolean };
  if (code === 'payment_failed' && reason === 'unresolved_after_24h') return 'closed';
  if (reason === SETTLEMENT_FAILED && (code === 'payment_unconfirmed' || code === 'payment_mismatch')) {
    return rechecked === true ? 'settlementRetrying' : 'settlementFailed';
  }
  if (code !== 'payment_unconfirmed') return null;
  if (reason === TAKEN_ELSEWHERE) return 'takenElsewhere';
  if (reason === 'submit_retrying') return 'retrying';
  if (reason === 'submit_failed') return 'notReceived';
  if (reason === INVOICE_FULL) return 'invoiceFull';
  return rechecked === true ? 'rechecked' : 'contact';
}

/**
 * The transaction the buyer names to the seller about a payment Quasar did not confirm: the one this page handed over
 * (`txHash`, else `txKey` of the checkout store), else, on a reopened page, the newest one Quasar rejected.
 *
 * @param state - The state of the checkout store.
 * @param state.txKey - The transaction this page submitted.
 * @param state.txHash - The transaction of the payment, once known.
 * @param checkout - What the checkout token opens; `null` until loaded.
 * @returns The transaction hash (EVM) or signature (Solana), or `null` when the page does not know it.
 */
export function unconfirmedTxKey(
  state: Pick<CheckoutState, 'txKey' | 'txHash'>,
  checkout: CheckoutView | null,
): string | null {
  // `rejectedPayments` is newer than some `@tuwaio/quasar-sdk` alphas and Quasar versions: read it as optional; Quasar
  // lists the newest first
  const rejected = (checkout?.invoice as { rejectedPayments?: { txKey: string }[] } | undefined)?.rejectedPayments;
  return state.txHash ?? state.txKey ?? rejected?.[0]?.txKey ?? null;
}
