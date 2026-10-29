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
const { PrimaryButton } = await import('./ScreenParts');

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

afterEach(() => unmount());

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

// N2 of the round-6 review: a transfer Quasar ties to no invoice is held for a refund only
describe('a payment held for a refund only', () => {
  it('says that it came from another wallet and that the seller returns it, never that the seller checks it', () => {
    show('held', { quote: null }, { status: 'held', review: { reason: 'payer_mismatch', refundOnly: true } as never });
    const text = textOf(OutcomeScreen({ kind: 'held' }));
    expect(text).toContain('Cosmos returns this payment');
    expect(text).toContain(
      'The payment came from another wallet than the one that confirmed this invoice. Cosmos returns it to the wallet that sent it.',
    );
    expect(text).toContain(
      'This invoice takes no other payment: ask Cosmos for a new invoice and pay it from the confirmed wallet.',
    );
    expect(text).not.toMatch(/is checking it|checks the payment/);
  });

  it('says the same of a wallet that never confirmed the invoice', () => {
    show(
      'held',
      { quote: null },
      { status: 'held', review: { reason: 'payer_unconfirmed', refundOnly: true } as never },
    );
    expect(textOf(OutcomeScreen({ kind: 'held' }))).toContain(
      'The payment came from a wallet that did not confirm this invoice. Cosmos returns it to the wallet that sent it.',
    );
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
