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
const payment = vi.hoisted(() => ({ status: 'idle' }));
vi.mock('../hooks/usePayment', () => ({
  usePayment: () => ({ status: payment.status, problem: null, pay: vi.fn(), switchNetwork: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('../hooks/useSolanaClusterSync', () => ({ useSolanaClusterSync: vi.fn() }));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { PayScreen } = await import('./PayScreen');
const { AutoPayScreen } = await import('./AutoPayScreen');
const { WalletPrompt } = await import('./WalletPrompt');
const { PrimaryButton } = await import('./ScreenParts');

const PAYER = '0x1111111111111111111111111111111111111111';
const BASE = 'eip155:8453';
const wallet = {
  family: 'eip155',
  address: PAYER,
  chainId: 'eip155:1',
  connectorType: 'evm:metamask',
  walletId: 'metamask',
  name: 'MetaMask',
  connection: null,
} as const;

/** The pay step of USDC on Base for MetaMask, which is on Ethereum: "Switch to Base". */
function payOnBase() {
  const quote = {
    methodId: 'usdc-base',
    payer: `${BASE}:${PAYER}`,
    instructions: {
      family: 'eip155',
      chainId: BASE,
      to: '0x7a0b0000000000000000000000000000000077e1',
      token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: '2000000',
      decimals: 6,
      symbol: 'USDC',
      reference: 'r',
    },
    amountToSend: '2000000',
    cryptoAmountExpected: '2000000',
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
      wallet: wallet as never,
      adapterFor: () => ({ family: 'eip155', switchChain: vi.fn() }) as never,
    },
  );
}

/** The step under the prompt: the element made inert while the wallet asks. */
const stepOf = (tree: unknown) => fixture.elements(tree).find((element) => 'inert' in element.props)!;
const classesOf = (element: { props: Record<string, unknown> }) => String(element.props.className).split(' ');

afterEach(() => {
  unmount();
  payment.status = 'idle';
  vi.unstubAllGlobals();
});

describe('a wallet prompt over a step', () => {
  it('takes the pay step out of the layout while the wallet asks, so the prompt fills the pane without a scrollbar', () => {
    payOnBase();
    payment.status = 'switching';
    const tree = render(PayScreen, {});

    expect(fixture.ofType(tree, WalletPrompt)).toHaveLength(1);
    const step = stepOf(tree);
    expect(step.props.inert).toBe(true);
    expect(classesOf(step)).toContain('novapay:hidden');
  });

  it('brings the pay step back as it was when the prompt goes', () => {
    payOnBase();
    payment.status = 'switching';
    render(PayScreen, {});
    payment.status = 'idle';
    const tree = render(PayScreen, {});

    expect(fixture.ofType(tree, WalletPrompt)).toHaveLength(0);
    const step = stepOf(tree);
    expect(step.props.inert).toBe(false);
    expect(classesOf(step)).not.toContain('novapay:hidden');
  });

  it('takes the automatic payments offer out of the layout while the wallet asks for the permission', () => {
    const offer = {
      status: 'available',
      methodId: 'usdc-base',
      request: {
        chainId: '0x2105',
        to: '0x7a0b0000000000000000000000000000000077e1',
        permission: { data: { periodAmount: '0x989680', periodDuration: 2_592_000 } },
        rules: [],
      },
    };
    const checkout = { ...fixture.checkout, autoCharge: offer } as unknown as typeof fixture.checkout;
    ctx = fixture.checkoutContextValue(
      {},
      {
        checkout,
        screen: 'autoPay',
        wallet: wallet as never,
        // The wallet keeps the request open
        adapterFor: () => ({ family: 'eip155', requestPermission: () => new Promise(() => undefined) }) as never,
      },
    );
    let tree = render(AutoPayScreen, {});
    expect(classesOf(stepOf(tree))).not.toContain('novapay:hidden');

    const allow = fixture.ofType(tree, PrimaryButton)[0];
    (allow.props.onClick as () => void)();
    tree = render(AutoPayScreen, {});
    const prompt = fixture.ofType(tree, WalletPrompt);
    expect(prompt).toHaveLength(1);
    expect(classesOf(stepOf(tree))).toContain('novapay:hidden');

    // Cancel: the offer comes back
    (prompt[0].props.onCancel as () => void)();
    tree = render(AutoPayScreen, {});
    expect(fixture.ofType(tree, WalletPrompt)).toHaveLength(0);
    expect(classesOf(stepOf(tree))).not.toContain('novapay:hidden');
  });
});

describe('the wallet prompt', () => {
  const promptProps = {
    kind: 'switch' as const,
    walletName: 'MetaMask',
    walletId: 'metamask',
    amount: '2 USDC',
    merchant: 'Cosmos',
    network: 'Base',
    to: '0x7a0b…77e1',
    priceTime: '9:59',
    onCancel: vi.fn(),
  };

  /** A document whose focus is on `active`, and a button that can take the focus. */
  function page() {
    const body = { tagName: 'BODY' };
    const doc: { body: object; activeElement: object | null } = { body, activeElement: body };
    const button = { isConnected: true, ownerDocument: doc, focus: vi.fn(() => (doc.activeElement = button)) };
    vi.stubGlobal('document', doc);
    return { doc, body, button };
  }

  it('fills the place of the step it stands for, in the flow, centered', () => {
    const tree = render(WalletPrompt, promptProps) as { props: Record<string, unknown> };
    const classes = classesOf(tree);
    expect(classes).not.toContain('novapay:absolute');
    expect(classes).toContain('novapay:flex-1');
    expect(classes).toContain('novapay:justify-center-safe');
  });

  it('gives the focus back to the button that opened it when it closes', () => {
    const { doc, body, button } = page();
    // "Switch to Base" was pressed
    doc.activeElement = button;
    render(WalletPrompt, promptProps);
    // The heading took the focus; the prompt goes and the focus with it
    doc.activeElement = body;
    unmount();

    expect(button.focus).toHaveBeenCalledOnce();
  });

  it('takes the focus back from the window frame, where a dialog puts it when the focused prompt goes', () => {
    const { doc, button } = page();
    doc.activeElement = button;
    render(WalletPrompt, promptProps);
    // The dialog of the modal checkout focuses its frame, which holds the button
    doc.activeElement = { contains: (node: unknown) => node === button };
    unmount();

    expect(button.focus).toHaveBeenCalledOnce();
  });

  it('leaves the focus where the buyer moved it, and never focuses a button that is gone', () => {
    const { doc, body, button } = page();
    doc.activeElement = button;
    render(WalletPrompt, promptProps);
    const elsewhere = { contains: () => false };
    doc.activeElement = elsewhere;
    unmount();
    expect(button.focus).not.toHaveBeenCalled();

    doc.activeElement = button;
    render(WalletPrompt, promptProps);
    doc.activeElement = body;
    button.isConnected = false;
    unmount();
    expect(button.focus).not.toHaveBeenCalled();
  });
});
