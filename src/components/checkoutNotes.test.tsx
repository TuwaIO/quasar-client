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
