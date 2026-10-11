import type { CheckoutMethod, CheckoutQuote, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it } from 'vitest';

import { checkoutScreen, checkoutSteps, deadlineAnnouncement, groupMethodsByToken, isQuoteEnding } from './checkout';

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
