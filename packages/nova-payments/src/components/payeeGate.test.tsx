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
let paymentStatus = 'idle';
vi.mock('../hooks/usePayment', () => ({
  usePayment: () => ({ status: paymentStatus, problem: null, pay: vi.fn(), switchNetwork: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('../hooks/useSolanaClusterSync', () => ({ useSolanaClusterSync: vi.fn() }));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { PayScreen } = await import('./PayScreen');
const { QrScreen } = await import('./QrScreen');
const { PayeeScreen } = await import('./PayeeScreen');

const BASE = 'eip155:8453';
const SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const PAYER = '0x1111111111111111111111111111111111111111';
const MERCHANT = '0x52908400098527886E0F7030069857D2E4169EE7';
const SOL_MERCHANT = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

/** Every string and prop value of the rendered tree, to look for the address in. */
const everything = (node: unknown): string =>
  fixture
    .elements(node)
    .flatMap((element) => Object.values(element.props).flat())
    .filter((value): value is string => typeof value === 'string')
    .join(' ');

/** A locked price of USDC on Base (EVM) or SOL (Solana Pay), with the store's check of its payee. */
function show(family: 'eip155' | 'solana', payeeCheck: (quote: object) => unknown, phase = 'awaitingPayment') {
  const solana = family === 'solana';
  const method = solana ? fixture.method('sol', 'SOL', SOLANA) : fixture.method('usdc-base', 'USDC', BASE);
  const checkout = { ...fixture.checkout, methods: [method] } as typeof fixture.checkout;
  const quote = {
    methodId: method.id,
    payer: solana ? null : `${BASE}:${PAYER}`,
    instructions: solana
      ? {
          family: 'solana',
          chainId: SOLANA,
          to: SOL_MERCHANT,
          token: 'native',
          amount: '1',
          decimals: 9,
          symbol: 'SOL',
          reference: 'r',
          solanaPayUrl: `solana:${SOL_MERCHANT}?amount=1&reference=r`,
        }
      : {
          family: 'eip155',
          chainId: 8453,
          to: MERCHANT,
          token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          amount: '1000000',
          decimals: 6,
          symbol: 'USDC',
        },
    amountToSend: '1000000',
    cryptoAmountExpected: '1000000',
    amountDue: '1000000',
    decimals: 6,
    markupBps: 0,
    discountBps: 0,
    gasless: null,
    transferFee: null,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
  ctx = fixture.checkoutContextValue(
    {},
    {
      checkout,
      screen: solana ? 'qr' : 'pay',
      now: Date.now(),
      state: {
        phase,
        checkout,
        methodId: method.id,
        quote,
        error: null,
        paymasterUrl: null,
        payeeCheck: payeeCheck(quote),
      } as never,
      wallet: { family: 'eip155', address: PAYER, chainId: BASE, name: 'MetaMask', walletId: 'metamask' } as never,
    },
  );
}

afterEach(() => {
  unmount();
  paymentStatus = 'idle';
});

describe('the pay step until the payee of the price is verified', () => {
  it('shows neither the address nor the button while the store checks the payee, or holds the check of another price', () => {
    for (const check of [
      (quote: object) => ({ quote, status: 'checking' }),
      () => null,
      (quote: object) => ({ quote: { ...quote }, status: 'verified', signed: true }),
    ]) {
      show('eip155', check);
      const tree = render(PayScreen, {});
      expect(fixture.ofType(tree, PayeeScreen).map((element) => element.props.payee)).toEqual([{ status: 'checking' }]);
      expect(everything(tree).toLowerCase()).not.toContain(MERCHANT.toLowerCase());
      unmount();
    }
  });

  it('refuses the price when the store refused its payee, and names why for the integrator', () => {
    show('eip155', (quote) => ({ quote, status: 'refused', reason: 'payee_not_pinned' }));
    const tree = render(PayScreen, {});
    expect(fixture.ofType(tree, PayeeScreen).map((element) => element.props.payee)).toEqual([
      { status: 'refused', reason: 'payee_not_pinned' },
    ]);
    expect(everything(tree).toLowerCase()).not.toContain(MERCHANT.toLowerCase());
  });

  it('shows the price once the store verified the payee of this very price', () => {
    show('eip155', (quote) => ({ quote, status: 'verified', signed: true }));
    const tree = render(PayScreen, {});
    expect(fixture.ofType(tree, PayeeScreen)).toHaveLength(0);
  });

  // A payment under way keeps its step: the wallet was asked already, and the buyer follows what it sent
  it('keeps the step of a payment under way', () => {
    show('eip155', (quote) => ({ quote, status: 'checking' }), 'submitting');
    expect(fixture.ofType(render(PayScreen, {}), PayeeScreen)).toHaveLength(0);
    unmount();
    show('eip155', (quote) => ({ quote, status: 'checking' }));
    paymentStatus = 'wallet';
    expect(fixture.ofType(render(PayScreen, {}), PayeeScreen)).toHaveLength(0);
  });
});

describe('the Solana Pay code until the payee of the price is verified', () => {
  it('shows neither the code nor the address before the store verified the payee', () => {
    show('solana', (quote) => ({ quote, status: 'checking' }));
    let tree = render(QrScreen, {});
    expect(fixture.ofType(tree, PayeeScreen)).toHaveLength(1);
    expect(everything(tree)).not.toContain(SOL_MERCHANT);
    unmount();
    show('solana', (quote) => ({ quote, status: 'refused', reason: 'payee_unverified' }));
    tree = render(QrScreen, {});
    expect(fixture.ofType(tree, PayeeScreen).map((element) => element.props.payee)).toEqual([
      { status: 'refused', reason: 'payee_unverified' },
    ]);
    expect(everything(tree)).not.toContain(SOL_MERCHANT);
  });

  it('shows the code once the payee of this very price is verified', () => {
    show('solana', (quote) => ({ quote, status: 'verified', signed: true }));
    const tree = render(QrScreen, {});
    expect(fixture.ofType(tree, PayeeScreen)).toHaveLength(0);
    expect(everything(tree)).toContain(SOL_MERCHANT);
  });
});

describe('PayeeScreen', () => {
  it('says that the address is checked, as a status', () => {
    show('eip155', (quote) => ({ quote, status: 'checking' }));
    const tree = render(PayeeScreen, { payee: { status: 'checking' } });
    expect(fixture.elements(tree).some((element) => element.props.role === 'status')).toBe(true);
    expect(fixture.text(tree)).toContain('Checking the receiving address…');
  });

  it('stops the payment in the merchant’s name, sends the buyer back and names the reason for the integrator', () => {
    show('eip155', (quote) => ({ quote, status: 'refused', reason: 'payee_mismatch' }));
    const tree = render(PayeeScreen, { payee: { status: 'refused', reason: 'payee_mismatch' } });
    const props = fixture.elements(tree).map((element) => element.props);
    expect(props.some((value) => value['data-payee-refusal'] === 'payee_mismatch')).toBe(true);
    expect(everything(tree)).toContain('Payment stopped');
    const back = props.find((value) => value.onClick === ctx.backToMethods);
    expect(back?.children).toBe('Back to methods');
  });
});
