import type { ReactElement } from 'react';
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

const facts = {
  network: 'Base',
  amount: '2.00 USDC',
  txKey: '0xabc',
  explorerUrl: 'https://scan/tx/0xabc',
  from: '0x1',
};
vi.mock('../hooks/usePaymentFacts', () => ({ usePaymentFacts: () => facts }));

// The pay step reads balances and pays through these hooks: record the reads, spy on the payment
const asyncKeys: (string | null)[] = [];
vi.mock('../hooks/useAsyncValue', () => ({
  useAsyncValue: (key: string | null) => {
    asyncKeys.push(key);
    return null;
  },
}));
const pay = vi.fn(async () => undefined);
vi.mock('../hooks/usePayment', () => ({
  usePayment: () => ({ status: 'idle', problem: null, pay, switchNetwork: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('../hooks/useSolanaClusterSync', () => ({ useSolanaClusterSync: vi.fn() }));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { MethodScreen } = await import('./MethodScreen');
const { CheckoutHeader, MobileSteps } = await import('./CheckoutHeader');
const { CheckoutStepper } = await import('./CheckoutStepper');
const { LocaleSwitcher } = await import('./LocaleSwitcher');
const { ConfirmScreen } = await import('./ConfirmScreen');
const { PayScreen } = await import('./PayScreen');
const { PrimaryButton } = await import('./ScreenParts');
const { RadioCards } = await import('./RadioCards');
const { HashLink, TxProgressIndicator, TxStatusVisual } = await import('@tuwaio/nova-transactions');

const { ofType } = fixture;

afterEach(() => unmount());

describe('handlers of the checkout', () => {
  it('lets the app decide whether a picked method is chosen', () => {
    const { actions, store } = fixture.fakeStore();
    const onMethodSelect = vi.fn();
    ctx = fixture.checkoutContextValue({ handlers: { onMethodSelect } }, { store });

    const [tokens] = ofType(render(MethodScreen, {}), RadioCards) as ReactElement<{
      onChange: (key: string) => void;
    }>[];
    tokens.props.onChange('SOL');

    expect(onMethodSelect).toHaveBeenCalledWith({ method: fixture.methods[2], select: expect.any(Function) });
    expect(actions.selectMethod).not.toHaveBeenCalled();
    onMethodSelect.mock.calls[0][0].select();
    expect(actions.selectMethod).toHaveBeenCalledWith('sol');
  });

  it('wraps "Continue": nothing happens until the app proceeds', async () => {
    const connectWallet = vi.fn(() => true);
    const onQuote = vi.fn();
    ctx = fixture.checkoutContextValue({ handlers: { onQuote } }, { connectWallet });

    const [button] = ofType(render(MethodScreen, {}), PrimaryButton) as ReactElement<{ onClick: () => void }>[];
    button.props.onClick();

    expect(onQuote).toHaveBeenCalledWith({
      method: fixture.methods[0],
      payWith: 'wallet',
      proceed: expect.any(Function),
    });
    expect(connectWallet).not.toHaveBeenCalled();
    await onQuote.mock.calls[0][0].proceed();
    expect(connectWallet).toHaveBeenCalledWith(fixture.methods[0]);
  });

  it('wraps the language change: the invoice keeps its language until the app proceeds', async () => {
    const { actions, store } = fixture.fakeStore();
    const onLocaleChange = vi.fn();
    ctx = fixture.checkoutContextValue({ handlers: { onLocaleChange } }, { store });

    const [switcher] = ofType(CheckoutHeader({}), LocaleSwitcher) as ReactElement<{
      onSelect: (code: string) => void;
    }>[];
    switcher.props.onSelect('es');

    expect(onLocaleChange).toHaveBeenCalledWith({ locale: 'es', proceed: expect.any(Function) });
    expect(actions.setLocale).not.toHaveBeenCalled();
    await onLocaleChange.mock.calls[0][0].proceed();
    expect(actions.setLocale).toHaveBeenCalledWith('es');
  });
});

/** The pay step of USDC on Base, the price locked for the connected MetaMask. */
function payContext(customization: CheckoutContextValue['customization']) {
  const address = '0x1111111111111111111111111111111111111111';
  const quote = {
    methodId: 'usdc-base',
    payer: `eip155:8453:${address}`,
    instructions: { family: 'eip155', chainId: 8453, token: '0xusdc', symbol: 'USDC', to: `0x${'2'.repeat(40)}` },
    amountToSend: '2000000',
    cryptoAmountExpected: '2000000',
    decimals: 6,
    markupBps: 0,
    discountBps: 0,
    gasless: null,
    transferFee: null,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
  return fixture.checkoutContextValue(customization, {
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
    wallet: { family: 'eip155', address, chainId: 'eip155:8453', name: 'MetaMask', walletId: 'metamask' } as never,
  });
}

describe('handlers of the pay step', () => {
  it('wraps the pay button: the wallet prompt opens when the app proceeds', async () => {
    pay.mockClear();
    const onSubmit = vi.fn();
    ctx = payContext({ handlers: { onSubmit } });

    const [button] = ofType(render(PayScreen, {}), PrimaryButton) as ReactElement<{ onClick: () => void }>[];
    button.props.onClick();

    expect(onSubmit).toHaveBeenCalledWith({
      quote: ctx.state.quote,
      method: fixture.methods[0],
      proceed: expect.any(Function),
    });
    expect(pay).not.toHaveBeenCalled();
    await onSubmit.mock.calls[0][0].proceed();
    expect(pay).toHaveBeenCalledOnce();
  });

  it('reads the balance of the wallet unless the app turns the check off', () => {
    const readsBalance = () => asyncKeys.some((key) => key?.endsWith(':0xusdc'));
    asyncKeys.length = 0;
    ctx = payContext({});
    render(PayScreen, {});
    expect(readsBalance()).toBe(true);

    unmount();
    asyncKeys.length = 0;
    ctx = payContext({ config: { balanceCheck: false } });
    render(PayScreen, {});
    expect(readsBalance()).toBe(false);
  });
});

describe('config of the checkout', () => {
  it('hides the steps', () => {
    ctx = fixture.checkoutContextValue({ config: { showSteps: false } });

    expect(ofType(CheckoutHeader({}), CheckoutStepper)).toHaveLength(0);
    expect(MobileSteps({})).toBeNull();
  });
});

describe('child customizations of the checkout', () => {
  it('passes the customization of the Nova Transactions parts to the confirm step', () => {
    const iconClassNames = { icon: 'brand-icon' };
    const stepClassNames = { circle: 'brand-circle' };
    const hashClassNames = { hash: 'brand-hash' };
    ctx = fixture.checkoutContextValue(
      {
        childCustomizations: {
          statusVisual: { className: 'brand-status', iconClassNames },
          progressIndicator: { className: 'brand-progress', stepClassNames },
          hashLink: { className: 'brand-link', classNames: hashClassNames },
        },
      },
      { screen: 'confirm' },
    );

    const screen = ConfirmScreen();
    expect(ofType(screen, TxStatusVisual)[0].props).toMatchObject({ className: 'brand-status', iconClassNames });
    expect(ofType(screen, TxProgressIndicator)[0].props).toMatchObject({
      className: expect.stringContaining('brand-progress'),
      stepClassNames,
    });
    expect(ofType(screen, HashLink)[0].props).toMatchObject({ className: 'brand-link', classNames: hashClassNames });
  });
});
