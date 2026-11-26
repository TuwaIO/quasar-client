import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutContextValue } from './checkoutContext';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

let ctx: CheckoutContextValue;
vi.mock('../hooks/useCheckoutContext', () => ({
  useCheckoutContext: () => ctx,
  useOptionalCheckoutContext: () => ctx,
}));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { FailedTransaction, ScreenError } = await import('./ScreenParts');
const { QrScreen } = await import('./QrScreen');
const { formatLabel } = await import('../i18n');

const DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const NOW = Date.parse('2026-11-25T07:53:10Z');

/** The QR step of SOL with a locked price, after what the store says of the last payment. */
function qr(error: Record<string, unknown> | null, phase = 'awaitingPayment') {
  const method = fixture.method('sol-pay', 'SOL', DEVNET);
  const checkout = { ...fixture.checkout, methods: [method] } as typeof fixture.checkout;
  const quote = {
    methodId: 'sol-pay',
    payer: null,
    instructions: {
      family: 'solana',
      chainId: DEVNET,
      to: 'AobnbeZ6',
      token: 'native',
      amount: '5903676',
      decimals: 9,
      symbol: 'SOL',
      reference: 'r',
      solanaPayUrl: 'solana:AobnbeZ6?amount=0.005903676',
    },
    amountToSend: '5903676',
    cryptoAmountExpected: '5903676',
    amountDue: '5903676',
    decimals: 9,
    expiresAt: new Date(NOW + 600_000).toISOString(),
  };
  ctx = fixture.checkoutContextValue(
    {},
    {
      checkout,
      now: NOW,
      payWith: 'qr',
      state: { ...fixture.checkoutContextValue({}).state, phase, checkout, methodId: method.id, quote, error } as never,
    },
  );
  return render(QrScreen, {});
}
const errors = (tree: unknown) => fixture.ofType(tree, ScreenError).map((element) => fixture.text(element));

afterEach(() => unmount());

// A transfer sent by hand without the reference came back to the code with "Waiting for the payment…" and no word of what
// became of it: the buyer would have sent it again
describe('what the QR step says of a payment that did not pay the invoice', () => {
  const held = {
    code: 'payment_mismatch',
    message: '',
    reason: 'reference_missing',
    unmatched: true,
    txKey: '5LhP7PKS',
  };

  it('names a transfer without the reference that the seller returns, with its transaction', () => {
    const tree = qr(held);
    expect(errors(tree)).toEqual([formatLabel(ctx.labels.pay.mismatchNoReferenceUnmatched, { merchant: 'Cosmos' })]);
    expect(fixture.ofType(tree, FailedTransaction)[0].props.error).toEqual(held);
  });

  it('says that a new price was refused', () => {
    expect(errors(qr({ code: 'price_unavailable', message: '' }))).toEqual([ctx.labels.method.priceUnavailable]);
  });

  it('says nothing without an error, nor while a new price is on its way', () => {
    expect(errors(qr(null))).toEqual([]);
    expect(errors(qr(held, 'quoting'))).toEqual([]);
  });
});
