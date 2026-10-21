import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PaymentWalletErrorKind } from '../utils/walletErrors';
import type { CheckoutContextValue } from './checkoutContext';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

let ctx: CheckoutContextValue;
vi.mock('../hooks/useCheckoutContext', () => ({ useCheckoutContext: () => ctx }));
vi.mock('../hooks/useAsyncValue', () => ({ useAsyncValue: () => null }));
let problem: PaymentWalletErrorKind | null = null;
vi.mock('../hooks/usePayment', () => ({
  usePayment: () => ({ status: 'idle', problem, pay: vi.fn(), switchNetwork: vi.fn(), dismiss: vi.fn() }),
}));
const sync = vi.fn();
vi.mock('../hooks/useSolanaClusterSync', () => ({ useSolanaClusterSync: sync }));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { PayScreen } = await import('./PayScreen');

const MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const PAYER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

/** The text of the rendered tree. */
const textOf = (node: unknown): string =>
  fixture
    .elements(node)
    .flatMap((element) => [element.props.children].flat())
    .filter((child): child is string => typeof child === 'string')
    .join(' ');

/** The pay step of SOL on a cluster, the price locked for the connected Phantom. */
function solanaPay(chainId: string, walletChainId: string) {
  const method = fixture.method('sol-pay', 'SOL', chainId);
  const checkout = { ...fixture.checkout, methods: [method] } as typeof fixture.checkout;
  const quote = {
    methodId: 'sol-pay',
    payer: `${chainId}:${PAYER}`,
    instructions: {
      family: 'solana',
      chainId,
      to: 'x',
      token: 'native',
      amount: '1',
      decimals: 9,
      symbol: 'SOL',
      reference: 'r',
    },
    amountToSend: '1000000000',
    cryptoAmountExpected: '1000000000',
    decimals: 9,
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
      screen: 'pay',
      now: Date.now(),
      state: {
        phase: 'awaitingPayment',
        checkout,
        methodId: 'sol-pay',
        quote,
        error: null,
        paymasterUrl: null,
      } as never,
      wallet: {
        family: 'solana',
        address: PAYER,
        chainId: walletChainId,
        name: 'Phantom',
        walletId: 'phantom',
      } as never,
      adapterFor: () => ({ family: 'solana' }) as never,
    },
  );
}

afterEach(() => {
  unmount();
  problem = null;
});

describe('the pay step of a Solana payment', () => {
  it('reminds the buyer to switch the wallet to a cluster other than mainnet, with the steps of the wallet', () => {
    solanaPay(DEVNET, MAINNET);
    const text = textOf(render(PayScreen, {}));

    expect(text).toContain('Pay on Solana Devnet');
    expect(text).toContain('switch yours to Solana Devnet before you pay');
    expect(text).toContain('In Phantom: Settings › Developer Settings › Testnet Mode, then Solana Devnet.');
    // The app's Solana connection follows the payment's cluster
    expect(sync).toHaveBeenLastCalledWith(DEVNET, ctx.wallet);
  });

  it('says nothing about the network of a mainnet payment', () => {
    solanaPay(MAINNET, MAINNET);
    expect(textOf(render(PayScreen, {}))).not.toContain('choose their network');
  });

  it('tells that nothing was paid when the wallet sent it on another network', () => {
    solanaPay(MAINNET, MAINNET);
    problem = 'wrongNetwork';
    expect(textOf(render(PayScreen, {}))).toContain(
      'Phantom is on another network, so nothing was paid. Switch it to Solana and pay again.',
    );
  });
});
