import type { CheckoutMethod, CheckoutQuote, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it } from 'vitest';

import {
  checkoutScreen,
  checkoutSteps,
  deadlineAnnouncement,
  deadlineState,
  groupMethodsByToken,
  isFinalPaymentFailure,
  isInvoicePaymentOnTheWay,
  isInvoicePaymentUnresolved,
  isMovedMoneyFailure,
  isPaymentOnTheWay,
  isQuoteEnding,
  screensPayingWallets,
  sentBeforeDeadline,
} from './checkout';

const method = (id: string, symbol: string, chainId: string, featured = false): CheckoutMethod => ({
  id,
  name: `${symbol} on ${chainId}`,
  symbol,
  chainId,
  assetId: null,
  decimals: 6,
  gasless: 'off',
  featured,
  markupBps: 0,
  discountBps: 0,
});

const BASE = 'eip155:8453';
const ETH = 'eip155:1';
const SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

const QUOTE = { object: 'checkout_quote', payer: 'eip155:8453:0x1' } as CheckoutQuote;

const view = (invoice: Partial<CheckoutView['invoice']> = {}, extra: Partial<CheckoutView> = {}) =>
  ({ invoice: { replacedBy: null, ...invoice }, autoCharge: null, ...extra }) as CheckoutView;

describe('checkoutScreen', () => {
  it('shows the step the payment is at', () => {
    expect(checkoutScreen({ phase: 'loading', checkout: null })).toBe('loading');
    expect(checkoutScreen({ phase: 'buyer', checkout: view() })).toBe('buyer');
    expect(checkoutScreen({ phase: 'selectMethod', checkout: view() })).toBe('method');
    for (const phase of ['awaitingPayment', 'submitting'] as const) {
      expect(checkoutScreen({ phase, checkout: view() })).toBe('pay');
      expect(checkoutScreen({ phase, checkout: view() }, { payWith: 'qr' })).toBe('qr');
    }
    expect(checkoutScreen({ phase: 'confirming', checkout: view() })).toBe('confirm');
  });

  it('stays on loading until the labels of the language are loaded, but shows an error at once', () => {
    expect(checkoutScreen({ phase: 'selectMethod', checkout: view() }, { labelsReady: false })).toBe('loading');
    expect(checkoutScreen({ phase: 'paid', checkout: view() }, { labelsReady: false })).toBe('loading');
    expect(checkoutScreen({ phase: 'error', checkout: null }, { labelsReady: false })).toBe('error');
    expect(checkoutScreen({ phase: 'selectMethod', checkout: view() }, { labelsReady: true })).toBe('method');
  });

  it('shows the QR code of the payment page before any price when the buyer continues on a phone', () => {
    expect(checkoutScreen({ phase: 'selectMethod', checkout: view() }, { payWith: 'qr', handoff: true })).toBe('qr');
    expect(checkoutScreen({ phase: 'selectMethod', checkout: view() }, { payWith: 'wallet', handoff: true })).toBe(
      'method',
    );
    expect(checkoutScreen({ phase: 'selectMethod', checkout: view() }, { payWith: 'qr' })).toBe('method');
  });

  it('shows the Solana Pay QR code for a price locked without a payer, also after the page reloads', () => {
    const qr = { ...QUOTE, payer: null } as CheckoutQuote;
    expect(checkoutScreen({ phase: 'awaitingPayment', checkout: view(), quote: qr })).toBe('qr');
    expect(checkoutScreen({ phase: 'awaitingPayment', checkout: view(), quote: QUOTE })).toBe('pay');
  });

  it('stays on the method while the first price is locked, and on the payment while a price is renewed', () => {
    expect(checkoutScreen({ phase: 'quoting', checkout: view(), quote: null })).toBe('method');
    expect(checkoutScreen({ phase: 'quoting', checkout: view(), quote: null }, { payWith: 'qr' })).toBe('method');
    expect(checkoutScreen({ phase: 'quoting', checkout: view(), quote: QUOTE })).toBe('pay');
    expect(checkoutScreen({ phase: 'quoting', checkout: view(), quote: QUOTE }, { payWith: 'qr' })).toBe('qr');
  });

  it('ends on the outcome, a replaced invoice included, and offers automatic charges after a paid one', () => {
    for (const phase of [
      'paid',
      'underpaid',
      'held',
      'refunded',
      'expired',
      'cancelled',
      'blocked',
      'error',
    ] as const) {
      expect(checkoutScreen({ phase, checkout: view() })).toBe(phase);
    }
    expect(
      checkoutScreen({ phase: 'cancelled', checkout: view({ replacedBy: { number: 'INV-2', checkoutToken: 't' } }) }),
    ).toBe('replaced');
    const offer = view({}, { autoCharge: { status: 'available' } as CheckoutView['autoCharge'] });
    expect(checkoutScreen({ phase: 'paid', checkout: offer })).toBe('paid');
    expect(checkoutScreen({ phase: 'paid', checkout: offer }, { autoPay: true })).toBe('autoPay');
    expect(checkoutScreen({ phase: 'paid', checkout: view() }, { autoPay: true })).toBe('paid');
  });
});

// Owner, 2026-10-28: the buyer is never invited to pay twice. A store of a current `@tuwaio/quasar-sdk` has the phase
// `unconfirmed` when Quasar could not confirm the payment (not found, no receipt in time…) but it may still arrive
describe('checkoutScreen of a payment that may still arrive', () => {
  it('shows the unconfirmed screen, not the payment', () => {
    expect(checkoutScreen({ phase: 'unconfirmed' as never, checkout: view(), quote: QUOTE })).toBe('unconfirmed');
    expect(checkoutScreen({ phase: 'unconfirmed' as never, checkout: view() }, { payWith: 'qr' })).toBe('unconfirmed');
  });
});

describe('checkoutSteps', () => {
  it('marks the steps before the current one done, and adds the details and automatic payments when they apply', () => {
    expect(checkoutSteps('method')).toEqual([
      { key: 'method', state: 'current' },
      { key: 'pay', state: 'upcoming' },
      { key: 'confirm', state: 'upcoming' },
    ]);
    expect(checkoutSteps('qr')?.map((step) => step.state)).toEqual(['done', 'current', 'upcoming']);
    expect(checkoutSteps('underpaid')?.map((step) => step.state)).toEqual(['done', 'current', 'upcoming']);
    expect(checkoutSteps('method', { withDetails: true })?.map((step) => `${step.key}:${step.state}`)).toEqual([
      'details:done',
      'method:current',
      'pay:upcoming',
      'confirm:upcoming',
    ]);
    expect(checkoutSteps('autoPay')?.map((step) => `${step.key}:${step.state}`)).toEqual([
      'method:done',
      'pay:done',
      'confirm:done',
      'autoPay:current',
    ]);
  });

  // H1: a payment Quasar could not confirm stands at the confirm step, not at an outcome
  it('keeps the confirm step current while the payment could not be confirmed', () => {
    expect(checkoutSteps('unconfirmed')?.map((step) => `${step.key}:${step.state}`)).toEqual([
      'method:done',
      'pay:done',
      'confirm:current',
    ]);
  });

  it('has no steps on an outcome: the header names it instead', () => {
    for (const screen of ['loading', 'paid', 'held', 'expired', 'replaced', 'error'] as const) {
      expect(checkoutSteps(screen)).toBeNull();
    }
  });
});

describe('groupMethodsByToken', () => {
  it('groups the methods by token, keeping the merchant order', () => {
    const groups = groupMethodsByToken([
      method('a', 'USDC', ETH),
      method('b', 'SOL', SOLANA),
      method('c', 'USDC', SOLANA),
    ]);
    expect(groups.map((group) => [group.symbol, group.methods.map((m) => m.id)])).toEqual([
      ['USDC', ['a', 'c']],
      ['SOL', ['b']],
    ]);
  });

  it("puts the connected wallet's network first, then what the merchant marks Popular", () => {
    const groups = groupMethodsByToken(
      [
        method('a', 'USDC', ETH),
        method('b', 'USDT', BASE, true),
        method('c', 'SOL', SOLANA),
        method('d', 'USDC', BASE),
      ],
      SOLANA,
    );
    expect(groups.map((group) => group.symbol)).toEqual(['SOL', 'USDT', 'USDC']);
    expect(groups[0]).toMatchObject({ inWallet: true, featured: false });
    expect(groups[1]).toMatchObject({ inWallet: false, featured: true });

    const usdc = groupMethodsByToken(
      [method('a', 'USDC', ETH), method('d', 'USDC', BASE, true), method('e', 'USDC', SOLANA)],
      SOLANA,
    )[0];
    expect(usdc.methods.map((m) => m.id)).toEqual(['e', 'd', 'a']);
  });
});

describe('timers', () => {
  it('announces the deadline at the minutes the app sets', () => {
    expect(deadlineAnnouncement(16 * 60_000, 15 * 60_000, [15, 2])).toBe(15);
    expect(deadlineAnnouncement(11 * 60_000, 10 * 60_000, [15, 2])).toBeNull();
  });

  it('announces the invoice deadline once at 10, 5 and 1 minutes', () => {
    expect(deadlineAnnouncement(null, 3_600_000)).toBeNull();
    expect(deadlineAnnouncement(601_000, 599_000)).toBe(10);
    expect(deadlineAnnouncement(599_000, 598_000)).toBeNull();
    expect(deadlineAnnouncement(301_000, 300_000)).toBe(5);
    expect(deadlineAnnouncement(61_000, 59_000)).toBe(1);
    // A tab that slept past two thresholds announces the nearest one
    expect(deadlineAnnouncement(700_000, 50_000)).toBe(1);
    expect(deadlineAnnouncement(10_000, -1_000)).toBeNull();
  });

  it('warns that the price ends in its last minute', () => {
    expect(isQuoteEnding(61_000)).toBe(false);
    expect(isQuoteEnding(60_000)).toBe(true);
    expect(isQuoteEnding(1)).toBe(true);
    expect(isQuoteEnding(0)).toBe(false);
  });
});

describe('deadlineState', () => {
  it('counts while the buyer can pay, and while the payment confirms, until it succeeded', () => {
    for (const screen of ['loading', 'error', 'buyer', 'method', 'pay', 'qr', 'blocked'] as const) {
      expect(deadlineState('open', screen), screen).toBe('paying');
    }
    expect(deadlineState('underpaid', 'underpaid')).toBe('paying');
    expect(deadlineState('open', 'confirm')).toBe('confirming');
    expect(deadlineState('processing', 'confirm')).toBe('confirming');
  });

  it('keeps counting, without the minutes left to pay, while a payment could not be confirmed', () => {
    expect(deadlineState('open', 'unconfirmed')).toBe('confirming');
    expect(deadlineState('underpaid', 'unconfirmed')).toBe('confirming');
    expect(deadlineState('expired', 'unconfirmed')).toBeNull();
  });

  it('is over once paid, and on an outcome in which a deadline means nothing', () => {
    for (const screen of ['paid', 'autoPay', 'held', 'refunded', 'expired', 'cancelled', 'replaced'] as const) {
      expect(deadlineState('open', screen), screen).toBeNull();
    }
    for (const status of ['paid', 'held', 'expired', 'cancelled', 'refunded', 'partially_refunded']) {
      expect(deadlineState(status, 'method'), status).toBeNull();
    }
  });
});

describe('screensPayingWallets', () => {
  it("follows the merchant's AML screening, and counts a checkout without the field as screening", () => {
    expect(screensPayingWallets({ ...view(), amlScreening: true } as CheckoutView)).toBe(true);
    expect(screensPayingWallets({ ...view(), amlScreening: false } as CheckoutView)).toBe(false);
    // A Quasar version before the field always said that it screens
    expect(screensPayingWallets(view())).toBe(true);
  });
});

// Owner, 2026-10-28: the notes about the deadline follow the payment's real state. The store of a current
// `@tuwaio/quasar-sdk` says whether a payment of this page is on its way (also a relay answered `sending`, which has no
// transaction key, and no longer once it failed or settled); an older store only has the transaction it was given
describe('isPaymentOnTheWay', () => {
  it("follows the store's paymentOnTheWay when it has one", () => {
    expect(isPaymentOnTheWay({ paymentOnTheWay: true, txKey: null, txHash: null })).toBe(true);
    // Failed or settled: the transaction key stays, the payment is no longer on its way
    expect(isPaymentOnTheWay({ paymentOnTheWay: false, txKey: '0xabc', txHash: '0xabc' })).toBe(false);
  });

  it('falls back to the transaction this page handed over with a store without the field', () => {
    expect(isPaymentOnTheWay({ txKey: '0xabc', txHash: null })).toBe(true);
    expect(isPaymentOnTheWay({ txKey: null, txHash: '0xdef' })).toBe(true);
    expect(isPaymentOnTheWay({ txKey: null, txHash: null })).toBe(false);
  });
});

// Owner, 2026-10-28: a reopened page with a payment on its way shows it, never the payment screen or "nothing was
// charged". A current store says so (`invoicePaymentOnTheWay`); an older one only has the checkout it read
describe('isInvoicePaymentOnTheWay', () => {
  it("follows the store's invoicePaymentOnTheWay when it has one", () => {
    expect(isInvoicePaymentOnTheWay({ invoicePaymentOnTheWay: true }, view())).toBe(true);
    expect(isInvoicePaymentOnTheWay({ invoicePaymentOnTheWay: false }, view({ pendingPayments: 1 } as never))).toBe(
      false,
    );
  });

  it('falls back to the pending payments of the checkout with a store without the field', () => {
    expect(isInvoicePaymentOnTheWay({}, view({ pendingPayments: 2 } as never))).toBe(true);
    expect(isInvoicePaymentOnTheWay({}, view({ pendingPayments: 0 } as never))).toBe(false);
    expect(isInvoicePaymentOnTheWay({}, view())).toBe(false);
    expect(isInvoicePaymentOnTheWay({}, null)).toBe(false);
  });
});

// L3: "sent before the deadline" comes from Quasar (`paymentCountsUntil`: it learned of a payment before `dueAt` and
// waits for it), not from the page's clock; a Quasar without the field keeps the clock rule
describe('sentBeforeDeadline', () => {
  const DUE = Date.parse('2026-10-29T08:28:00Z');
  const BEFORE = Date.parse('2026-10-29T08:25:00Z');
  const AFTER = Date.parse('2026-10-29T08:30:00Z');
  const UNTIL = '2026-10-29T08:58:00Z';
  /** A checkout whose Quasar reports `paymentCountsUntil` (`undefined`: an older Quasar). */
  const reporting = (paymentCountsUntil?: string | null) =>
    view(paymentCountsUntil === undefined ? {} : ({ paymentCountsUntil } as never));

  it("takes Quasar's word, also for a payment whose hand-over this page does not know (a reload)", () => {
    expect(sentBeforeDeadline({ state: {}, checkout: reporting(UNTIL), handedOverAt: null, dueAt: DUE })).toBe(true);
    expect(
      sentBeforeDeadline({
        state: { paymentCountsUntil: UNTIL },
        checkout: reporting(null),
        handedOverAt: null,
        dueAt: DUE,
      }),
    ).toBe(true);
  });

  it('says no when Quasar waits for no payment, whatever the clock of the page says', () => {
    expect(
      sentBeforeDeadline({
        state: { paymentCountsUntil: null },
        checkout: reporting(UNTIL),
        handedOverAt: BEFORE,
        dueAt: DUE,
      }),
    ).toBe(false);
    expect(sentBeforeDeadline({ state: {}, checkout: reporting(null), handedOverAt: BEFORE, dueAt: DUE })).toBe(false);
  });

  // M1: Quasar may wait for another payment learned of in time while this page's own payment, handed over after the
  // deadline, will be held
  it('says no for a payment this page handed over at or after the deadline', () => {
    expect(
      sentBeforeDeadline({
        state: { paymentCountsUntil: UNTIL },
        checkout: reporting(UNTIL),
        handedOverAt: AFTER,
        dueAt: DUE,
      }),
    ).toBe(false);
  });

  it('keeps the clock rule with a Quasar that does not report it', () => {
    expect(
      sentBeforeDeadline({
        state: { paymentCountsUntil: null },
        checkout: reporting(),
        handedOverAt: BEFORE,
        dueAt: DUE,
      }),
    ).toBe(true);
    expect(sentBeforeDeadline({ state: {}, checkout: reporting(), handedOverAt: AFTER, dueAt: DUE })).toBe(false);
    expect(sentBeforeDeadline({ state: {}, checkout: reporting(), handedOverAt: null, dueAt: DUE })).toBe(false);
  });

  // F7: Quasar says per payment whether it counts as sent in time (`onTimeTxKeys`, matched by the store as
  // `paymentSentInTime`); its word on this page's payment decides over the clock of the page
  it("takes Quasar's word on this page's payment over the clock of the page", () => {
    const own = (paymentSentInTime: boolean | null) => ({
      paymentOnTheWay: true,
      paymentSentInTime,
      paymentCountsUntil: UNTIL,
    });
    expect(sentBeforeDeadline({ state: own(true), checkout: reporting(UNTIL), handedOverAt: AFTER, dueAt: DUE })).toBe(
      true,
    );
    expect(
      sentBeforeDeadline({ state: own(false), checkout: reporting(UNTIL), handedOverAt: BEFORE, dueAt: DUE }),
    ).toBe(false);
    // Not reported yet: the rules above
    expect(sentBeforeDeadline({ state: own(null), checkout: reporting(UNTIL), handedOverAt: AFTER, dueAt: DUE })).toBe(
      false,
    );
    expect(sentBeforeDeadline({ state: own(null), checkout: reporting(UNTIL), handedOverAt: BEFORE, dueAt: DUE })).toBe(
      true,
    );
  });

  it('reads the flag only while a payment of this page is on its way, not for one the store found', () => {
    expect(
      sentBeforeDeadline({
        state: { paymentOnTheWay: false, paymentSentInTime: true, paymentCountsUntil: null },
        checkout: reporting(null),
        handedOverAt: null,
        dueAt: DUE,
      }),
    ).toBe(false);
  });
});

// M4: only a rejection Quasar calls final (it carries its reason) means that the payment can never arrive
describe('isFinalPaymentFailure', () => {
  it('is true for a failed payment with the reason Quasar gave', () => {
    expect(isFinalPaymentFailure({ code: 'payment_failed', message: '', reason: 'reverted' } as never)).toBe(true);
  });

  it('is false when Quasar did not say why (an older Quasar or store), and for any other error', () => {
    expect(isFinalPaymentFailure({ code: 'payment_failed', message: '' })).toBe(false);
    expect(isFinalPaymentFailure({ code: 'payment_unconfirmed', message: '', reason: 'not_found' } as never)).toBe(
      false,
    );
    expect(isFinalPaymentFailure(null)).toBe(false);
  });

  // F9: a transaction that does not pay the invoice can never pay it either
  it('is true for a transaction that does not pay the invoice', () => {
    expect(
      isFinalPaymentFailure({ code: 'payment_mismatch', message: '', reason: 'no_matching_transfer' } as never),
    ).toBe(true);
  });
});

// F9: a transaction that succeeded on chain without paying the invoice may have moved money
describe('isMovedMoneyFailure', () => {
  it('is true for payment_mismatch, and for a moved-money reason an older store reports as payment_failed', () => {
    expect(isMovedMoneyFailure({ code: 'payment_mismatch', message: '' } as never)).toBe(true);
    for (const reason of [
      'no_matching_transfer',
      'reference_missing',
      'too_early',
      'tx_already_used',
      'payer_mismatch',
      'native_from_contract_unverifiable',
      'invoice_not_payable',
    ]) {
      expect(isMovedMoneyFailure({ code: 'payment_failed', message: '', reason } as never)).toBe(true);
    }
  });

  it('is false for a transaction that did not go through, and for any other error', () => {
    expect(isMovedMoneyFailure({ code: 'payment_failed', message: '', reason: 'reverted' } as never)).toBe(false);
    expect(isMovedMoneyFailure({ code: 'payment_failed', message: '' })).toBe(false);
    expect(isMovedMoneyFailure({ code: 'payment_unconfirmed', message: '', reason: 'timeout' } as never)).toBe(false);
    expect(isMovedMoneyFailure(null)).toBe(false);
  });
});

// F3: Quasar reports payments that may still arrive with no time limit (`unresolvedPayments`)
describe('isInvoicePaymentUnresolved', () => {
  it("takes the store's field, else the checkout's unresolvedPayments", () => {
    expect(isInvoicePaymentUnresolved({ invoicePaymentUnresolved: true }, view())).toBe(true);
    expect(
      isInvoicePaymentUnresolved({ invoicePaymentUnresolved: false }, view({ unresolvedPayments: 1 } as never)),
    ).toBe(false);
    expect(isInvoicePaymentUnresolved({}, view({ unresolvedPayments: 2 } as never))).toBe(true);
    expect(isInvoicePaymentUnresolved({}, view({ unresolvedPayments: 0 } as never))).toBe(false);
    expect(isInvoicePaymentUnresolved({}, view())).toBe(false);
    expect(isInvoicePaymentUnresolved({}, null)).toBe(false);
  });
});
