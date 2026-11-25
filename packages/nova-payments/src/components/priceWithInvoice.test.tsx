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
vi.mock('../hooks/useAsyncValue', () => ({ useAsyncValue: () => null, useRereadValue: () => null }));
vi.mock('../hooks/usePayment', () => ({
  usePayment: () => ({ status: 'idle', problem: null, pay: vi.fn(), switchNetwork: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('../hooks/useSolanaClusterSync', () => ({ useSolanaClusterSync: vi.fn() }));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { MethodScreen } = await import('./MethodScreen');
const { PayScreen } = await import('./PayScreen');
const { ScreenContent } = await import('./ScreenParts');
const { CapsLabel } = await import('./CapsLabel');

const MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const NOW = Date.parse('2026-11-25T08:00:00Z');
const inSeconds = (seconds: number) => new Date(NOW + seconds * 1000).toISOString();

const checkoutDue = (dueAt: string | null) =>
  ({
    ...fixture.checkout,
    methods: [fixture.method('sol-pay', 'SOL', MAINNET)],
    invoice: { ...fixture.checkout.invoice, dueAt },
  }) as typeof fixture.checkout;

/** The pay step of SOL in the last half a minute of its price, and what it offers to keep. */
function keepOffer(dueAt: string | null) {
  const checkout = checkoutDue(dueAt);
  const quote = {
    methodId: 'sol-pay',
    payer: null,
    instructions: {
      family: 'solana',
      chainId: MAINNET,
      to: 'x',
      token: 'native',
      amount: '1',
      decimals: 9,
      symbol: 'SOL',
      reference: 'r',
    },
    amountToSend: '1000000000',
    cryptoAmountExpected: '1000000000',
    amountDue: '1000000000',
    decimals: 9,
    markupBps: 0,
    discountBps: 0,
    gasless: null,
    transferFee: null,
    expiresAt: inSeconds(30),
  };
  ctx = fixture.checkoutContextValue(
    {},
    {
      checkout,
      screen: 'pay',
      now: NOW,
      state: {
        phase: 'awaitingPayment',
        checkout,
        methodId: 'sol-pay',
        quote,
        error: null,
        paymasterUrl: null,
      } as never,
      wallet: { family: 'solana', address: 'x', chainId: MAINNET, name: 'Phantom', walletId: 'phantom' } as never,
      adapterFor: () => ({ family: 'solana' }) as never,
    },
  );
  const tree = render(PayScreen, {});
  const offer = fixture.ofType(tree, CapsLabel).find((element) => element.props.label === ctx.labels.pay.keepPrice);
  const warned = fixture
    .elements(tree)
    .some((element) => fixture.text(element).includes('This price ends in') && element.type === 'span');
  return { offer: offer && fixture.text(offer), warned };
}

/** The line of the method step that says how long the price is locked for. */
function lockLine(dueAt: string | null) {
  const checkout = checkoutDue(dueAt);
  ctx = fixture.checkoutContextValue(
    {},
    {
      checkout,
      now: NOW,
      state: { ...fixture.checkoutContextValue({}).state, checkout, methodId: 'sol-pay' },
    },
  );
  return fixture.ofType(render(MethodScreen, {}), ScreenContent)[0].props.subtitle;
}

afterEach(() => unmount());

// An invoice due in two minutes said that its price locks for fifteen, and offered fifteen more when both were about to
// end: a press that could change nothing
describe('a price that ends with its invoice', () => {
  it('is offered no more minutes once both end together', () => {
    expect(keepOffer(inSeconds(30))).toEqual({ offer: undefined, warned: false });
  });

  it('is offered what is left of an invoice due a little later', () => {
    expect(keepOffer(inSeconds(300))).toEqual({ offer: 'Keep this price · +5 min', warned: true });
  });

  it('is offered the whole time of the seller when the invoice is due much later, or never', () => {
    expect(keepOffer(inSeconds(86_400)).offer).toBe('Keep this price · +15 min');
    expect(keepOffer(null).offer).toBe('Keep this price · +15 min');
  });

  it('is told, before it locks, for the minutes it is really held', () => {
    expect(lockLine(inSeconds(120))).toBe('The price locks for 2 minutes when you continue.');
    expect(lockLine(inSeconds(86_400))).toBe('The price locks for 15 minutes when you continue.');
    expect(lockLine(null)).toBe('The price locks for 15 minutes when you continue.');
  });
});
