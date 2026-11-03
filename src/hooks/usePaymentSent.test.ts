import type { CheckoutState, CheckoutStore } from '@tuwaio/quasar-sdk/checkout';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { usePaymentSent } = await import('./usePaymentSent');

const first = {} as CheckoutStore;
const second = {} as CheckoutStore;

/** A state of the checkout store; `extra` adds the fields of a current `@tuwaio/quasar-sdk`. */
const stateOf = (phase: string, extra: Record<string, unknown> = {}) =>
  ({ phase, checkout: null, txKey: null, txHash: null, error: null, ...extra }) as unknown as CheckoutState;

const sentOn = (store: CheckoutStore, state: CheckoutState, walletTxKey: string | null = null) =>
  render(usePaymentSent, { store, state, walletTxKey });

afterEach(() => unmount());

// Once this page handed a payment over, the buyer never reads "nothing was charged" while it may
// still arrive, also after the store stopped following it (its 35-minute cap) or Quasar could not confirm it
describe('usePaymentSent', () => {
  it('is false until a payment is on its way, then stays true for the invoice', () => {
    expect(sentOn(first, stateOf('awaitingPayment', { paymentOnTheWay: false }))).toBe(false);
    expect(sentOn(first, stateOf('confirming', { paymentOnTheWay: true }))).toBe(true);
    // The store stopped following the expired invoice: the payment may still arrive
    expect(sentOn(first, stateOf('expired', { paymentOnTheWay: false }))).toBe(true);
    // Quasar could not confirm it
    expect(
      sentOn(first, stateOf('expired', { error: { code: 'payment_unconfirmed', message: '', reason: 'timeout' } })),
    ).toBe(true);
  });

  it('counts a payment of the invoice the store found on its way (a reopened page)', () => {
    expect(sentOn(first, stateOf('confirming', { paymentOnTheWay: false, invoicePaymentOnTheWay: true }))).toBe(true);
    expect(sentOn(first, stateOf('expired', { paymentOnTheWay: false, invoicePaymentOnTheWay: false }))).toBe(true);
  });

  it('counts a transaction handed over to an older store without the fields', () => {
    expect(sentOn(first, stateOf('confirming', { txKey: '0xabc' }))).toBe(true);
  });

  it('is false again once Quasar says that the payment failed for good', () => {
    sentOn(first, stateOf('confirming', { paymentOnTheWay: true }));
    const failed = { code: 'payment_failed', message: '', reason: 'reverted' };
    expect(sentOn(first, stateOf('selectMethod', { paymentOnTheWay: false, error: failed }))).toBe(false);
    expect(sentOn(first, stateOf('expired', { paymentOnTheWay: false }))).toBe(false);
  });

  it('stays true after a failure without a reason (an older Quasar or store cannot tell that it is final)', () => {
    sentOn(first, stateOf('confirming', { paymentOnTheWay: true }));
    const failed = { code: 'payment_failed', message: '' };
    expect(sentOn(first, stateOf('awaitingPayment', { paymentOnTheWay: false, error: failed }))).toBe(true);
  });

  // F3: a payment Quasar reports as unresolved (stuck, or read again for 24 hours) may still arrive
  it('counts a payment Quasar reports as unresolved, also after it stops reporting it', () => {
    expect(sentOn(first, stateOf('expired', { paymentOnTheWay: false, invoicePaymentUnresolved: true }))).toBe(true);
    expect(sentOn(first, stateOf('expired', { paymentOnTheWay: false, invoicePaymentUnresolved: false }))).toBe(true);
  });

  // F9: a transaction that does not pay the invoice never will
  it('is false again once Quasar says that the transaction does not pay the invoice', () => {
    sentOn(first, stateOf('confirming', { paymentOnTheWay: true }));
    const mismatch = { code: 'payment_mismatch', message: '', reason: 'no_matching_transfer' };
    expect(sentOn(first, stateOf('awaitingPayment', { paymentOnTheWay: false, error: mismatch }))).toBe(false);
  });

  // The wallet sent the transaction, but the store says nothing of it yet (an invoice the seller cancelled meanwhile
  // keeps its outcome while Quasar takes the payment): it may arrive, so never "nothing was charged"
  it('counts a payment once the wallet returned its hash, before the store says anything', () => {
    expect(sentOn(first, stateOf('cancelled', { paymentOnTheWay: false }))).toBe(false);
    expect(sentOn(first, stateOf('cancelled', { paymentOnTheWay: false }), '0xsent')).toBe(true);
    expect(sentOn(first, stateOf('cancelled', { paymentOnTheWay: false }), '0xsent')).toBe(true);
  });

  it('counts the same hash once: a final failure of it ends it, the next hash counts again', () => {
    sentOn(first, stateOf('awaitingPayment', { paymentOnTheWay: false }), '0xsent');
    const failed = { code: 'payment_failed', message: '', reason: 'reverted' };
    expect(sentOn(first, stateOf('selectMethod', { paymentOnTheWay: false, error: failed }), '0xsent')).toBe(false);
    expect(sentOn(first, stateOf('selectMethod', { paymentOnTheWay: false, error: failed }), '0xsent')).toBe(false);
    expect(sentOn(first, stateOf('awaitingPayment', { paymentOnTheWay: false, error: failed }), '0xnext')).toBe(true);
  });

  // React renders again at once after the hook's updates: a failure of an earlier payment still shown (the store keeps
  // the outcome of a cancelled invoice) must not end the payment the wallet just sent
  it('keeps a new hash counted while the failure of an earlier payment is still shown', () => {
    const failed = { code: 'payment_failed', message: '', reason: 'reverted' };
    const cancelled = stateOf('cancelled', { paymentOnTheWay: false, error: failed });
    expect(sentOn(first, cancelled, '0xsent')).toBe(true);
    expect(sentOn(first, cancelled, '0xsent')).toBe(true);
  });

  it('starts again for another invoice', () => {
    sentOn(first, stateOf('confirming', { paymentOnTheWay: true }));
    expect(sentOn(second, stateOf('selectMethod', { paymentOnTheWay: false }))).toBe(false);
  });
});
