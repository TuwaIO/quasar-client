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
// What the chain adapter tells of a transaction that reverted, and what the step asked of it
const gas = vi.hoisted(() => ({ told: null as unknown, asked: [] as unknown[][] }));
vi.mock('../hooks/useOutOfGas', () => ({
  useOutOfGas: (...args: unknown[]) => {
    gas.asked.push(args);
    return gas.told;
  },
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

afterEach(() => {
  unmount();
  gas.told = null;
  gas.asked = [];
});

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

// A wallet on the phone set a gas limit of its own, below what the transfer to an invoice's own address took: the code
// came back saying only that the payment failed
describe('what the QR step says of a payment by code that ran out of gas', () => {
  const TX = `0x${'d'.repeat(64)}`;
  /** The EIP-681 code of ETH on Sepolia to the invoice's own address, after `error`. */
  const byCode = (error: Record<string, unknown>) => {
    const method = fixture.method('eth-own', 'ETH', 'eip155:11155111');
    const checkout = { ...fixture.checkout, methods: [method] } as typeof fixture.checkout;
    const quote = {
      methodId: 'eth-own',
      payer: null,
      instructions: {
        family: 'eip155',
        chainId: 11155111,
        to: '0xd03a000000000000000000000000000000001ba8',
        token: 'native',
        amount: '600000000000000',
        decimals: 18,
        symbol: 'ETH',
      },
      invoiceAddress: { record: { address: '0x2222' }, signature: '0x00', index: '0', ephemeralPrivateKey: '0x01' },
      amountToSend: '600000000000000',
      cryptoAmountExpected: '600000000000000',
      amountDue: '600000000000000',
      decimals: 18,
      expiresAt: new Date(NOW + 600_000).toISOString(),
    };
    const state = { ...fixture.checkoutContextValue({}).state, phase: 'awaitingPayment', checkout, quote, error };
    ctx = fixture.checkoutContextValue({}, { checkout, now: NOW, payWith: 'qr', state: state as never });
    return render(QrScreen, {});
  };

  it('says what gas limit to set before paying again', () => {
    const error = { code: 'payment_failed', message: '', reason: 'reverted', txKey: TX };
    gas.told = { needed: 30_492n };
    expect(errors(byCode(error))).toEqual([
      'The payment failed on Sepolia Testnet. Only the network fee was spent; the invoice is still open. The transaction ran out of gas: the wallet set its gas limit too low. Before you pay again, set the gas limit in the wallet to at least 31000.',
    ]);
    expect(gas.asked.at(-1)).toEqual([error, TX]);
  });
});
