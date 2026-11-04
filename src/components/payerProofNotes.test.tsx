import type { CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PayerProofFlow } from '../hooks/usePayerProof';
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
const pay = vi.fn();
vi.mock('../hooks/usePayment', () => ({
  usePayment: () => ({ status: 'idle', problem: null, pay, switchNetwork: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('../hooks/useSolanaClusterSync', () => ({ useSolanaClusterSync: vi.fn() }));
const flow: PayerProofFlow = {
  step: 'idle',
  problem: null,
  request: null,
  confirm: vi.fn(async () => true),
  dismiss: vi.fn(),
};
vi.mock('../hooks/usePayerProof', () => ({ usePayerProof: () => flow }));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { defaultLabels } = await import('../i18n');
const { PayScreen } = await import('./PayScreen');
const { OutcomeScreen } = await import('./OutcomeScreen');
const { MethodScreen } = await import('./MethodScreen');
const { QrScreen } = await import('./QrScreen');
const { PrimaryButton, ScreenError } = await import('./ScreenParts');
const { WalletPrompt } = await import('./WalletPrompt');

type Props = Record<string, unknown>;
const BASE = 'eip155:8453';
const PAYER = '0x1111111111111111111111111111111111111111';

/** The text of the rendered tree. */
const textOf = (node: unknown): string =>
  fixture
    .elements(node)
    .flatMap((element) => [element.props.children].flat())
    .filter((child): child is string => typeof child === 'string')
    .join(' ');

/** A price of 89.54 USDC on Base for MetaMask, gasless by the relay unless `gasless` is `null`. */
const quoteOf = (gasless: unknown) => ({
  object: 'checkout_quote',
  methodId: 'usdc-base',
  payer: `${BASE}:${PAYER}`,
  cryptoAmountExpected: '89540000',
  amountDue: '89540000',
  amountToSend: '89540000',
  transferFee: null,
  decimals: 6,
  symbol: 'USDC',
  markupBps: 0,
  discountBps: 0,
  gasless,
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  instructions: {
    family: 'eip155',
    chainId: 8453,
    to: '0x2222222222222222222222222222222222222222',
    token: '0x3',
    amount: '89540000',
    decimals: 6,
    symbol: 'USDC',
  },
});

/** The checkout context on a screen. */
function show(
  screen: CheckoutContextValue['screen'],
  state: Record<string, unknown>,
  invoice: Partial<CheckoutView['invoice']> = {},
) {
  const checkout = {
    ...fixture.checkout,
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
        error: null,
        paymasterUrl: null,
        ...state,
      } as never,
      wallet: {
        family: 'eip155',
        address: PAYER,
        chainId: BASE,
        name: 'MetaMask',
        walletId: 'metamask',
        connectorType: 'evm:metamask',
      } as never,
    },
  );
}

afterEach(() => {
  unmount();
  flow.step = 'idle';
  flow.request = null;
});

describe('the pay step of a method the gasless relay may pay', () => {
  it('pays by the relay at once: its signed authorization confirms the wallet', () => {
    show('pay', {
      quote: quoteOf({ relay: { typedData: {} }, paymaster: null }),
      payerProof: 'unless_relayed',
    });
    const button = fixture.ofType(render(PayScreen, {}), PrimaryButton)[0] as ReactElement<Props>;
    expect(button.props.children).toBe('Sign to pay 89.54 USDC');
  });

  it('asks for the free confirmation before the buyer pays the gas instead', () => {
    show('pay', { quote: quoteOf(null), payerProof: 'unless_relayed' });
    const tree = render(PayScreen, {});
    const button = fixture.ofType(tree, PrimaryButton)[0] as ReactElement<Props>;
    expect(button.props.children).toBe(defaultLabels.payerProof.confirmToPay);
    (button.props.onClick as () => void)();
    expect(flow.confirm).toHaveBeenCalledWith();
    expect(pay).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain(defaultLabels.payerProof.payNote);
  });

  it('lets the buyer confirm again once the wallet window is closed', () => {
    show('pay', { quote: quoteOf(null), payerProof: 'confirming' });
    const button = fixture.ofType(render(PayScreen, {}), PrimaryButton)[0] as ReactElement<Props>;
    expect(button.props.busy).toBe(false);
    expect(button.props.children).toBe(defaultLabels.payerProof.confirmToPay);
  });

  it('offers "Try again" in the wallet window of the confirmation', () => {
    show('pay', { quote: quoteOf(null), payerProof: 'confirming' });
    flow.step = 'signing';
    flow.request = { domain: 'shop.example' } as PayerProofFlow['request'];
    const prompt = fixture.ofType(render(PayScreen, {}), WalletPrompt)[0] as ReactElement<Props>;
    expect(prompt.props.kind).toBe('proof');
    vi.mocked(flow.confirm).mockClear();
    (prompt.props.onRetry as () => void)();
    expect(flow.confirm).toHaveBeenCalledWith();
    expect(prompt.props.hint).toBe('MetaMask may show it as a sign-in request for shop.example.');
  });

  it("shows only the confirmation's own refusals as its error", () => {
    for (const code of ['request_failed', 'price_unavailable']) {
      show('pay', { quote: quoteOf(null), payerProof: 'unless_relayed', error: { code, message: '' } });
      const errors = (fixture.ofType(render(PayScreen, {}), ScreenError) as ReactElement<Props>[]).map(
        (error) => error.props.children,
      );
      expect(errors).not.toContain(defaultLabels.error.generic);
      expect(errors.filter((text) => text === defaultLabels.pay.noAnswer).length).toBeLessThanOrEqual(1);
    }
    show('pay', {
      quote: quoteOf(null),
      payerProof: 'unless_relayed',
      error: { code: 'payer_proof_invalid', message: '' },
    });
    const errors = fixture.ofType(render(PayScreen, {}), ScreenError) as ReactElement<Props>[];
    expect(errors.map((error) => error.props.children)).toContain(defaultLabels.payerProof.invalid);
  });

  it('pays once the wallet confirmed the invoice', () => {
    show('pay', { quote: quoteOf(null), payerProof: 'confirmed' });
    const button = fixture.ofType(render(PayScreen, {}), PrimaryButton)[0] as ReactElement<Props>;
    expect(button.props.children).toBe('Pay 89.54 USDC');
  });
});

describe('the method step', () => {
  it('locks the price through the confirmation of the wallet', async () => {
    show('method', { phase: 'selectMethod', quote: null, payer: null });
    ctx = { ...ctx, lockPrice: vi.fn(async () => undefined) };
    const tree = render(MethodScreen, {});
    const button = fixture.ofType(tree, PrimaryButton)[0] as ReactElement<Props>;
    (button.props.onClick as () => void)();
    await vi.waitFor(() => expect(ctx.lockPrice).toHaveBeenCalledOnce());
  });
});

// The rest of an underpaid invoice is paid from the wallet that paid first only
describe('the rest of an underpaid invoice', () => {
  const FIRST = '0x3333333333333333333333333333333333333333';
  const REFUSAL = 'Only the wallet that paid first, 0x3333…3333, can pay the rest. Connect that wallet to pay it.';

  it('offers the rest only to the wallet that paid first', () => {
    show(
      'underpaid',
      { phase: 'underpaid', quote: { ...quoteOf(null), payer: `${BASE}:${FIRST}` } },
      { status: 'underpaid', amountPaid: '80000000' },
    );
    ctx = { ...ctx, lockPrice: vi.fn(async () => undefined) };
    const tree = OutcomeScreen({ kind: 'underpaid' });
    expect(textOf(tree)).toContain(REFUSAL);
    const button = fixture.ofType(tree, PrimaryButton)[0] as ReactElement<Props>;
    (button.props.onClick as () => void)();
    expect(ctx.lockPrice).not.toHaveBeenCalled();
    expect(ctx.connectWallet).toHaveBeenCalled();
  });

  it("names the first wallet when Quasar refuses the rest from another one, and pays it from the first one's page", () => {
    show(
      'underpaid',
      {
        phase: 'underpaid',
        quote: quoteOf(null),
        error: { code: 'payer_mismatch', message: '', status: 409, originWallet: `${BASE}:${FIRST}` },
      },
      { status: 'underpaid', amountPaid: '80000000' },
    );
    expect(textOf(OutcomeScreen({ kind: 'underpaid' }))).toContain(REFUSAL);

    // The wallet that paid first sees no refusal and pays the rest
    show('underpaid', { phase: 'underpaid', quote: quoteOf(null) }, { status: 'underpaid', amountPaid: '80000000' });
    ctx = { ...ctx, lockPrice: vi.fn(async () => undefined) };
    const tree = OutcomeScreen({ kind: 'underpaid' });
    expect(textOf(tree)).not.toContain('paid first');
    ((fixture.ofType(tree, PrimaryButton)[0] as ReactElement<Props>).props.onClick as () => void)();
    expect(ctx.lockPrice).toHaveBeenCalledOnce();
  });

  it('offers no rest once it cannot be paid, and says the merchant can refund what arrived', () => {
    const closed = 'The rest of this invoice can no longer be paid here. Cosmos can refund what arrived.';
    const received = { status: 'underpaid', amountPaid: '80000000' } as const;
    const expectClosed = () => {
      const tree = OutcomeScreen({ kind: 'underpaid' });
      expect(textOf(tree)).toContain(closed);
      expect(textOf(tree)).toContain('80.00 USDC of 89.54 USDC received.');
      expect(textOf(tree)).not.toContain('Send the rest');
      expect(textOf(tree)).not.toContain('It stays payable');
      expect(fixture.ofType(tree, PrimaryButton)).toHaveLength(0);
    };
    // As the checkout reads it
    show('underpaid', { phase: 'underpaid', quote: quoteOf(null) }, { ...received, restPayable: false });
    expectClosed();
    // Refused meanwhile, on a page read while the rate still held
    show(
      'underpaid',
      { phase: 'underpaid', quote: quoteOf(null), error: { code: 'rest_rate_expired', message: '', status: 409 } },
      { ...received, restPayable: true },
    );
    expectClosed();
  });

  it('names the rest on the payment step, without the total of the invoice', () => {
    const rest = { ...quoteOf(null), amountDue: '9540000', amountToSend: '9540000' };
    show(
      'pay',
      { phase: 'awaitingPayment', invoiceStatus: 'underpaid', quote: rest },
      { status: 'underpaid', amountPaid: '80000000', totalMinor: '8954' },
    );
    const text = textOf(render(PayScreen, {}));
    expect(text).toContain('You send the rest');
    expect(text).toContain('9.54');
    expect(text).not.toContain('89.54');
    expect(text).toContain('Back');
    expect(text).not.toContain('Back to methods');
  });

  it('names the rest on the QR code of a rest too', () => {
    const rest = {
      ...quoteOf(null),
      payer: null,
      amountDue: '9540000',
      amountToSend: '9540000',
      instructions: {
        family: 'solana',
        chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        to: 'x',
        token: 'native',
        amount: '9540000',
        decimals: 6,
        symbol: 'USDC',
        reference: 'r',
        solanaPayUrl: 'solana:x',
      },
    };
    show(
      'qr',
      { phase: 'awaitingPayment', invoiceStatus: 'underpaid', quote: rest },
      { status: 'underpaid', amountPaid: '80000000' },
    );
    const text = textOf(render(QrScreen, {}));
    expect(text).toContain('You send the rest');
    expect(text).not.toContain('Back to methods');
  });

  it("adds the token's transfer fee to the rest as a rest of the invoice, not its total", () => {
    const rest = {
      ...quoteOf(null),
      amountDue: '9540000',
      amountToSend: '9559118',
      transferFee: { bps: 20, maxFee: null, source: 'contract' },
    };
    show(
      'pay',
      { phase: 'awaitingPayment', invoiceStatus: 'underpaid', quote: rest },
      { status: 'underpaid', amountPaid: '80000000', totalMinor: '8954' },
    );
    const rows = fixture.elements(render(PayScreen, {})).map((element) => element.props.name);
    expect(rows).toContain('Rest of the invoice');
    expect(rows).not.toContain('Invoice total');
  });
});

describe('the follow window of an expired or cancelled invoice', () => {
  it('says until when this page follows the payment, from the store', () => {
    show(
      'expired',
      { phase: 'expired', quote: null, paymentOnTheWay: true, followingUntil: '2026-10-27T12:35:00.000Z' },
      { status: 'expired' },
    );
    const text = textOf(OutcomeScreen({ kind: 'expired' }));
    expect(text).toMatch(/This page follows the payment until .+\. Later, reload it to see the outcome\./);
    show(
      'cancelled',
      { phase: 'cancelled', quote: null, paymentOnTheWay: true, followingUntil: '2026-10-27T12:35:00.000Z' },
      { status: 'cancelled' },
    );
    expect(textOf(OutcomeScreen({ kind: 'cancelled' }))).toMatch(/This page follows the payment until /);
  });

  it('promises nothing once the page no longer follows it', () => {
    show(
      'expired',
      { phase: 'expired', quote: null, paymentOnTheWay: true, followingUntil: null },
      { status: 'expired' },
    );
    expect(textOf(OutcomeScreen({ kind: 'expired' }))).not.toMatch(/follows the payment until/);
  });
});
