import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RefundFlow } from '../hooks/useRefund';
import type { CheckoutWallet } from '../utils/methods';
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
const payment = vi.hoisted(() => ({ status: 'idle' }));
vi.mock('../hooks/usePayment', () => ({
  usePayment: () => ({ status: payment.status, problem: null, pay: vi.fn(), switchNetwork: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('../hooks/useSolanaClusterSync', () => ({ useSolanaClusterSync: vi.fn() }));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { defaultLabels } = await import('../i18n');
const { WalletIcon } = await import('@tuwaio/nova-core');
const { CheckoutWalletIcon } = await import('./ScreenParts');
const { WalletPrompt } = await import('./WalletPrompt');
const { PayScreen } = await import('./PayScreen');
const { MethodScreen } = await import('./MethodScreen');
const { RadioCards } = await import('./RadioCards');
const { RefundSteps } = await import('./RefundButton');

type Props = Record<string, unknown>;
const ICON = 'data:image/svg+xml;base64,PHN2Zy8+';
const PAYER = '0x1111111111111111111111111111111111111111';
const BASE = 'eip155:8453';

/** An EIP-6963 wallet that Nova has no icon or name of. */
const switchWallet: CheckoutWallet = {
  family: 'eip155',
  address: PAYER,
  chainId: BASE,
  connectorType: 'evm:switchwallet',
  walletId: 'switchwallet',
  name: 'Switch Wallet',
  icon: ICON,
  connection: null,
};

/** The text of the rendered tree. */
const textOf = (node: unknown): string =>
  fixture
    .elements(node)
    .flatMap((element) => [element.props.children].flat())
    .filter((child): child is string => typeof child === 'string')
    .join(' ');

/** The props of the wallet icons of the tree. */
const iconsOf = (tree: unknown) => fixture.ofType(tree, CheckoutWalletIcon).map((element) => element.props as Props);

afterEach(() => {
  unmount();
  payment.status = 'idle';
});

describe('the icon of the connected wallet', () => {
  it("shows the wallet's own icon", () => {
    const tree = render(CheckoutWalletIcon, { walletId: 'switchwallet', icon: ICON }) as {
      type: unknown;
      props: Props;
    };
    expect(tree.type).toBe('img');
    expect(tree.props.src).toBe(ICON);
    // The name is written next to it
    expect(tree.props.alt).toBe('');
  });

  it('shows the icon Nova has of the wallet id without an icon of its own, or with one that is not an image URL', () => {
    for (const icon of [undefined, '', 'javascript:alert(1)', 'data:text/html,<b>x</b>']) {
      unmount();
      const tree = render(CheckoutWalletIcon, { walletId: 'metamask', icon }) as { type: unknown; props: Props };
      expect(tree.type).toBe(WalletIcon);
      expect(tree.props.walletName).toBe('metamask');
    }
  });

  it('falls back to the icon Nova has when the image does not load', () => {
    const img = render(CheckoutWalletIcon, { walletId: 'metamask', icon: ICON }) as { props: Props };
    (img.props.onError as () => void)();
    const tree = render(CheckoutWalletIcon, { walletId: 'metamask', icon: ICON }) as { type: unknown };
    expect(tree.type).toBe(WalletIcon);
  });
});

describe('the checkout names and shows the wallet as it calls itself', () => {
  function payStep() {
    const quote = {
      methodId: 'usdc-base',
      payer: `${BASE}:${PAYER}`,
      instructions: {
        family: 'eip155',
        chainId: 'eip155:1',
        to: '0x7a0b0000000000000000000000000000000077e1',
        token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        amount: '2000000',
        decimals: 6,
        symbol: 'USDC',
        reference: 'r',
      },
      amountToSend: '2000000',
      cryptoAmountExpected: '2000000',
      amountDue: '2000000',
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
        screen: 'pay',
        now: Date.now(),
        state: {
          phase: 'awaitingPayment',
          checkout: fixture.checkout,
          methodId: 'usdc-base',
          quote,
          error: null,
          paymasterUrl: null,
        } as never,
        wallet: switchWallet,
        adapterFor: () => ({ family: 'eip155', switchChain: vi.fn() }) as never,
      },
    );
  }

  it('in the wallet card of the pay step', () => {
    payStep();
    const tree = render(PayScreen, {});
    expect(textOf(tree)).toContain('Switch Wallet');
    expect(iconsOf(tree)).toEqual([{ walletId: 'switchwallet', icon: ICON }]);
  });

  it('in the prompt while the wallet asks to switch the network', () => {
    payStep();
    payment.status = 'switching';
    const tree = render(PayScreen, {});
    const prompt = fixture.ofType(tree, WalletPrompt)[0].props as Props;
    expect(prompt).toMatchObject({ walletName: 'Switch Wallet', walletId: 'switchwallet', walletIcon: ICON });

    unmount();
    const window = render(WalletPrompt, prompt as never);
    expect(textOf(window)).toContain('Approve the switch in Switch Wallet');
    expect(iconsOf(window)).toEqual([{ walletId: 'switchwallet', icon: ICON }]);
  });

  it('under "Wallet" of the method step', () => {
    ctx = fixture.checkoutContextValue({}, { wallet: switchWallet });
    const tree = render(MethodScreen, {});
    const payWith = fixture
      .ofType(tree, RadioCards)
      .map((element) => element.props as Props)
      .find((props) => (props.items as unknown[]).includes('wallet'))!;
    const card = (payWith.children as (item: string) => unknown)('wallet');
    expect(textOf(card)).toContain('Switch Wallet');
    expect(iconsOf(card)).toEqual([{ walletId: 'switchwallet', icon: ICON }]);
  });

  it('in the refund window while the wallet asks', () => {
    const flow = { step: 'wallet', network: 'Base', amount: '1 USDC', wallet: switchWallet } as unknown as RefundFlow;
    const tree = render(RefundSteps as never, {
      flow,
      labels: defaultLabels,
      locale: 'en',
      close: vi.fn(),
    }) as { props: Props };
    expect(tree.props).toMatchObject({ walletId: 'switchwallet', walletIcon: ICON });
    expect(textOf(tree)).toContain('Switch Wallet');
  });
});
