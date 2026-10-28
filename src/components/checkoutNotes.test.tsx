import type { CheckoutView } from '@tuwaio/quasar-sdk/checkout';
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
vi.mock('../hooks/useAsyncValue', () => ({ useAsyncValue: () => null }));
vi.mock('../hooks/usePayment', () => ({
  usePayment: () => ({ status: 'idle', problem: null, pay: vi.fn(), switchNetwork: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('../hooks/useSolanaClusterSync', () => ({ useSolanaClusterSync: vi.fn() }));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { PayScreen } = await import('./PayScreen');
const { OutcomeScreen } = await import('./OutcomeScreen');
const { PrimaryButton, SecondaryButton } = await import('./ScreenParts');
const { AutoPayScreen } = await import('./AutoPayScreen');

const BASE = 'eip155:8453';
const PAYER = '0x1111111111111111111111111111111111111111';
const MERCHANT_WALLET = '0x2222222222222222222222222222222222222222';
const COLLECTOR = '0x3333333333333333333333333333333333333333';

/** The text of the rendered tree. */
const textOf = (node: unknown): string =>
  fixture
    .elements(node)
    .flatMap((element) => [element.props.children].flat())
    .filter((child): child is string => typeof child === 'string')
    .join(' ');

/** 80 USDC of 89.54 locked for the connected wallet on Base. */
const quote = {
  object: 'checkout_quote',
  methodId: 'usdc-base',
  payer: `${BASE}:${PAYER}`,
  cryptoAmountExpected: '89540000',
  amountToSend: '89540000',
  transferFee: null,
  decimals: 6,
  symbol: 'USDC',
  markupBps: 0,
  discountBps: 0,
  gasless: null,
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  instructions: {
    family: 'eip155',
    chainId: 8453,
    to: MERCHANT_WALLET,
    token: '0x3',
    amount: '89540000',
    decimals: 6,
    symbol: 'USDC',
  },
};

/** The checkout context on a screen, the invoice and view changed by `invoice` and `view`. */
function show(
  screen: CheckoutContextValue['screen'],
  invoice: Partial<CheckoutView['invoice']> = {},
  view: Record<string, unknown> = {},
  stateQuote: typeof quote | null = quote,
) {
  const checkout = {
    ...fixture.checkout,
    ...view,
    invoice: { ...fixture.checkout.invoice, dueAt: '2026-10-27T12:00:00.000Z', ...invoice },
  } as CheckoutView;
  ctx = fixture.checkoutContextValue(
    {},
    {
      checkout,
      screen,
      now: Date.now(),
      state: {
        phase: 'awaitingPayment',
        checkout,
        methodId: 'usdc-base',
        quote: stateQuote,
        error: null,
        paymasterUrl: null,
      } as never,
      wallet: { family: 'eip155', address: PAYER, chainId: BASE, name: 'MetaMask', walletId: 'metamask' } as never,
    },
  );
}

afterEach(() => unmount());

describe('the note under the pay button', () => {
  it("says that paying wallets are checked when the merchant screens them, in the merchant's name", () => {
    show('pay', {}, { amlScreening: true });
    const text = textOf(render(PayScreen, {}));
    expect(text).toContain(
      "Payments go straight to Cosmos and can't be reversed; refunds come from the seller. Cosmos checks paying wallets against sanctions lists and, where available, other risk signals.",
    );
  });

  it('says nothing about screening when the merchant turned it off', () => {
    show('pay', {}, { amlScreening: false });
    const text = textOf(render(PayScreen, {}));
    expect(text).toContain("Payments go straight to Cosmos and can't be reversed; refunds come from the seller.");
    expect(text).not.toMatch(/screen|checks paying wallets|sanctions/);
  });

  it('keeps the screening sentence for a Quasar version without the field', () => {
    show('pay');
    expect(textOf(render(PayScreen, {}))).toContain(
      'Cosmos checks paying wallets against sanctions lists and, where available, other risk signals.',
    );
  });

  it('joins the sentences without a space after a full-width stop', () => {
    show('pay', {}, { amlScreening: true });
    ctx = {
      ...ctx,
      labels: {
        ...ctx.labels,
        pay: { ...ctx.labels.pay, disclaimer: '款项直接付给 {merchant}。', disclaimerScreening: '{merchant} 会核查。' },
      },
    };
    expect(textOf(render(PayScreen, {}))).toContain('款项直接付给 Cosmos。Cosmos 会核查。');
  });
});

describe('a payment the seller reviews', () => {
  it('says that it arrived after the price lock ran out', () => {
    show('held', { status: 'held', amountPaid: '89540000', review: { reason: 'quote_expired' } as never });
    expect(textOf(OutcomeScreen({ kind: 'held' }))).toContain(
      'The payment arrived after the price lock ran out. Cosmos accepts it or returns it.',
    );
  });
});

describe('an expired invoice', () => {
  it('says that nothing was charged when nothing arrived', () => {
    show('expired', { status: 'expired', amountPaid: null });
    const text = textOf(OutcomeScreen({ kind: 'expired' }));
    expect(text).toContain('Ask Cosmos for a new one; nothing was charged.');
  });

  it('says what arrived before it expired, and that the seller can refund it, instead of "nothing was charged"', () => {
    show('expired', { status: 'expired', amountPaid: '80000000' });
    const text = textOf(OutcomeScreen({ kind: 'expired' }));
    expect(text).toContain('Part of the payment arrived: 80.00 USDC.');
    expect(text).toContain('Cosmos can refund it to the wallet that paid; contact Cosmos.');
    expect(text).not.toContain('nothing was charged');
  });

  it("formats what arrived with the invoice's locked quote when the buyer's quote is gone", () => {
    show('expired', { status: 'expired', amountPaid: '80000000' }, { quote }, null);
    expect(textOf(OutcomeScreen({ kind: 'expired' }))).toContain('Part of the payment arrived: 80.00 USDC.');
  });

  it('keeps the deadline and says that part of the payment arrived when no quote tells its token', () => {
    show('expired', { status: 'expired', amountPaid: '80000000' }, { quote: null }, null);
    const text = textOf(OutcomeScreen({ kind: 'expired' }));
    expect(text).toMatch(/It was payable until .+\. Part of the payment arrived\./);
    expect(text).not.toContain('80000000');
    expect(text).toContain('Cosmos can refund it to the wallet that paid; contact Cosmos.');
    expect(text).not.toContain('nothing was charged');
  });
});

// Owner, 2026-10-28: a payment sent before the deadline counts, but the invoice can still close while it confirms (the
// grace ran out, or Quasar never heard of it in time): the buyer whose payment is on its way never reads "nothing was
// charged"
describe('an invoice that expired while the payment of this page was confirming', () => {
  /** The expired outcome after this page sent `txKey`. */
  const expiredAfterSending = (amountPaid: string | null) => {
    show('expired', { status: 'expired', amountPaid });
    ctx = { ...ctx, state: { ...ctx.state, phase: 'expired', txKey: '0xabc' } as never };
  };

  it('says that the payment, if it arrives, is accepted or returned by the seller', () => {
    expiredAfterSending(null);
    const text = textOf(OutcomeScreen({ kind: 'expired' }));
    expect(text).toContain(
      'The invoice closed while your payment was confirming. If it arrives, Cosmos accepts it or returns it.',
    );
    expect(text).not.toContain('nothing was charged');
    expect(text).not.toContain('Ask Cosmos for a new one');
  });

  it('still says what arrived before', () => {
    expiredAfterSending('80000000');
    const text = textOf(OutcomeScreen({ kind: 'expired' }));
    expect(text).toContain('Part of the payment arrived: 80.00 USDC.');
    expect(text).toContain('The invoice closed while your payment was confirming.');
    expect(text).not.toContain('nothing was charged');
  });

  it('follows the store: a relay answered `sending` has no transaction key but is on its way', () => {
    show('expired', { status: 'expired', amountPaid: null });
    ctx = { ...ctx, state: { ...ctx.state, phase: 'expired', txKey: null, paymentOnTheWay: true } as never };
    const text = textOf(OutcomeScreen({ kind: 'expired' }));
    expect(text).toContain('The invoice closed while your payment was confirming.');
    expect(text).not.toContain('nothing was charged');
  });

  it('says that nothing was charged once Quasar says that the payment failed for good', () => {
    show('expired', { status: 'expired', amountPaid: null });
    const failed = { code: 'payment_failed', message: '', reason: 'reverted' };
    ctx = {
      ...ctx,
      state: { ...ctx.state, phase: 'expired', txKey: '0xabc', paymentOnTheWay: false, error: failed } as never,
    };
    const text = textOf(OutcomeScreen({ kind: 'expired' }));
    expect(text).toContain('Ask Cosmos for a new one; nothing was charged.');
    expect(text).not.toContain('The invoice closed while your payment was confirming.');
  });

  // M4: the store stops following an expired invoice 35 minutes past the deadline; Quasar may still settle the payment
  it('never says that nothing was charged after the store stopped following the payment', () => {
    show('expired', { status: 'expired', amountPaid: null });
    ctx = {
      ...ctx,
      paymentSent: true,
      state: { ...ctx.state, phase: 'expired', txKey: '0xabc', paymentOnTheWay: false } as never,
    };
    const text = textOf(OutcomeScreen({ kind: 'expired' }));
    expect(text).toContain('The invoice closed while your payment was confirming.');
    expect(text).not.toContain('nothing was charged');
  });

  it('says to check the wallet when Quasar could not confirm the payment', () => {
    show('expired', { status: 'expired', amountPaid: null });
    const unconfirmed = { code: 'payment_unconfirmed', message: '', reason: 'timeout' };
    ctx = {
      ...ctx,
      paymentSent: true,
      state: { ...ctx.state, phase: 'expired', paymentOnTheWay: false, error: unconfirmed } as never,
    };
    const text = textOf(OutcomeScreen({ kind: 'expired' }));
    expect(text).toContain(
      'Your payment could not be confirmed. Check your wallet: if the payment left it, Cosmos accepts it or returns it.',
    );
    expect(text).not.toContain('nothing was charged');
  });

  // M3: a page reopened on an invoice that expired while a payment of it is on its way
  it('never says that nothing was charged while Quasar reports a payment of the invoice on its way', () => {
    show('expired', { status: 'expired', amountPaid: null });
    ctx = { ...ctx, state: { ...ctx.state, phase: 'expired', invoicePaymentOnTheWay: true } as never };
    expect(textOf(OutcomeScreen({ kind: 'expired' }))).toContain(
      'The invoice closed while your payment was confirming.',
    );
    // An older store: the pending payments of the checkout it read
    show('expired', { status: 'expired', amountPaid: null, pendingPayments: 1 } as never);
    ctx = { ...ctx, state: { ...ctx.state, phase: 'expired' } as never };
    const text = textOf(OutcomeScreen({ kind: 'expired' }));
    expect(text).toContain('The invoice closed while your payment was confirming.');
    expect(text).not.toContain('nothing was charged');
  });
});

// H1, owner 2026-10-28: a payment Quasar could not confirm (not found, no receipt in time, replaced) may still reach the
// seller: the buyer checks the wallet before paying again, and the screen offers no payment
describe('a payment Quasar could not confirm', () => {
  const unconfirmedScreen = (payAgain?: () => void) => {
    show('unconfirmed');
    ctx = {
      ...ctx,
      store: { getState: () => ({ ...fixture.fakeStore().actions, payAgain }) } as never,
      state: {
        ...ctx.state,
        phase: 'unconfirmed',
        paymentOnTheWay: false,
        error: { code: 'payment_unconfirmed', message: '', reason: 'not_found' },
      } as never,
    };
    return OutcomeScreen({ kind: 'unconfirmed' });
  };

  it('asks the buyer to check the wallet before paying again', () => {
    const text = textOf(unconfirmedScreen());
    expect(text).toContain('We could not confirm your payment');
    expect(text).toContain('Check your wallet before paying again: your payment may still be on its way.');
    expect(text).not.toContain('nothing was charged');
  });

  it('offers no payment: no main button, and paying again only once the buyer checked the wallet', () => {
    const payAgain = vi.fn();
    const tree = unconfirmedScreen(payAgain);
    expect(fixture.ofType(tree, PrimaryButton)).toHaveLength(0);
    const checked = fixture.ofType(tree, SecondaryButton);
    expect(checked).toHaveLength(1);
    expect(checked[0].props.children).toBe('The payment did not leave my wallet');
    (checked[0].props.onClick as () => void)();
    expect(payAgain).toHaveBeenCalledOnce();
  });

  it('offers nothing to pay with a store that cannot go back to the payment', () => {
    expect(fixture.ofType(unconfirmedScreen(), SecondaryButton)).toHaveLength(0);
  });
});

// Owner, 2026-10-28: a QR code the page showed may have been paid from a phone, which this page does not see
describe('an invoice that expired after the page showed a QR code', () => {
  it('never says that nothing was charged, and says what happens to a payment made with it', () => {
    show('expired', { status: 'expired', amountPaid: null }, {}, null);
    ctx = { ...ctx, qrShown: true, state: { ...ctx.state, phase: 'expired' } as never };
    const text = textOf(OutcomeScreen({ kind: 'expired' }));
    expect(text).toContain('If you paid with the QR code, Cosmos accepts the payment when it arrives or returns it.');
    expect(text).not.toContain('nothing was charged');
    expect(text).not.toContain('A payment sent after the deadline is held');
  });

  it('still says what arrived before', () => {
    show('expired', { status: 'expired', amountPaid: '80000000' });
    ctx = { ...ctx, qrShown: true, state: { ...ctx.state, phase: 'expired' } as never };
    const text = textOf(OutcomeScreen({ kind: 'expired' }));
    expect(text).toContain('Part of the payment arrived: 80.00 USDC.');
    expect(text).toContain('If you paid with the QR code, Cosmos accepts the payment when it arrives or returns it.');
  });
});

describe('the automatic payments offer', () => {
  it('says that Quasar sends each charge for the merchant, and shows the merchant’s wallet as the recipient', () => {
    show(
      'autoPay',
      { status: 'paid', amountPaid: '89540000' },
      {
        autoCharge: {
          status: 'available',
          methodId: 'usdc-base',
          request: {
            chainId: '0x2105',
            to: COLLECTOR,
            permission: {
              type: 'erc20-token-periodic',
              isAdjustmentAllowed: false,
              data: {
                tokenAddress: '0x3',
                periodAmount: '0x2ebae40',
                periodDuration: 2_592_000,
                startTime: 1_791_000_000,
                justification: 'Pro plan',
              },
            },
            rules: [
              { type: 'payee', data: { addresses: [MERCHANT_WALLET] } },
              { type: 'redeemer', data: { addresses: [COLLECTOR] } },
            ],
          },
        },
      },
    );
    const tree = render(AutoPayScreen, {});
    const text = textOf(tree);
    expect(text).toContain("Quasar sends each charge for Cosmos, only to Cosmos's wallet and within this limit.");
    expect(text).toContain("Cosmos can't take more than this limit in a period.");
    expect(text).toContain('0x2222…2222');
    expect(text).not.toContain('0x3333…3333');
  });
});
