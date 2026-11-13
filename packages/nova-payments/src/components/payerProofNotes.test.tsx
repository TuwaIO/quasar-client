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
const asyncValue = vi.hoisted(() => ({ balance: null as bigint | null, balances: null as bigint[] | null }));
vi.mock('../hooks/useAsyncValue', () => ({
  useAsyncValue: (key: string | null) => (key ? asyncValue.balances : null),
  useRereadValue: () => asyncValue.balance,
}));
const pay = vi.fn();
const paymentProblem = vi.hoisted(() => ({ current: null as string | null }));
vi.mock('../hooks/usePayment', () => ({
  usePayment: () => ({
    status: 'idle',
    problem: paymentProblem.current,
    askedWallet: null,
    pay,
    switchNetwork: vi.fn(),
    dismiss: vi.fn(),
  }),
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
const { FailedTransaction, PrimaryButton, ScreenError, SecondaryButton } = await import('./ScreenParts');
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
  paymentProblem.current = null;
  asyncValue.balance = null;
  asyncValue.balances = null;
  flow.step = 'idle';
  flow.request = null;
});

// The page said that a payment failed and left the same "Pay 89.54 USDC": nothing to look at, and no word that the next
// press pays again
describe('the pay step after a payment that ended without paying the invoice', () => {
  const ended = (error: Record<string, unknown>) => {
    show('pay', { quote: quoteOf(null), error });
    const tree = render(PayScreen, {});
    return {
      button: fixture.ofType(tree, PrimaryButton)[0] as ReactElement<Props>,
      transaction: fixture.ofType(tree, FailedTransaction)[0] as ReactElement<Props> | undefined,
      errors: fixture.ofType(tree, ScreenError).map((element) => (element as ReactElement<Props>).props.children),
    };
  };

  it('offers to pay again and hands the error to the row with its transaction', () => {
    const error = { code: 'payment_failed', message: 'raw', reason: 'reverted', txKey: '0xfeed' };
    const { button, transaction, errors } = ended(error);
    expect(fixture.text(button.props.children)).toBe(defaultLabels.pay.payAgain);
    expect(transaction?.props.error).toEqual(error);
    expect(errors).toEqual(['The payment failed on Base. Only the network fee was spent; the invoice is still open.']);
  });

  it('says of a transaction that expired that nothing was sent, with no word about a fee', () => {
    const { button, errors } = ended({ code: 'payment_failed', message: 'raw', reason: 'expired' });
    expect(errors).toEqual([defaultLabels.pay.failedExpired]);
    expect(fixture.text(button.props.children)).toBe(defaultLabels.pay.payAgain);
  });

  it('keeps the usual button while nothing has ended', () => {
    show('pay', { quote: quoteOf(null) });
    const button = fixture.ofType(render(PayScreen, {}), PrimaryButton)[0] as ReactElement<Props>;
    expect(fixture.text(button.props.children)).toBe('Pay 89.54 USDC');
  });
});

describe('the pay step of a method the gasless relay may pay', () => {
  it('pays by the relay at once: its signed authorization confirms the wallet', () => {
    show('pay', {
      quote: quoteOf({ relay: { typedData: {} }, paymaster: null }),
      payerProof: 'unless_relayed',
    });
    const button = fixture.ofType(render(PayScreen, {}), PrimaryButton)[0] as ReactElement<Props>;
    expect(fixture.text(button.props.children)).toBe('Sign to pay 89.54 USDC');
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

  // "The payment failed, only the fee was spent", about requests that never left the wallet
  it.each([
    ['failed', 'walletFailed'],
    ['switchFailed', 'switchFailed'],
    ['notAuthorized', 'notAuthorized'],
    ['sentUnconfirmed', 'sentUnconfirmed'],
  ] as const)('says what happened when the wallet answers %s', (kind, label) => {
    paymentProblem.current = kind;
    show('pay', { quote: quoteOf(null), payerProof: 'confirmed' });
    const errors = fixture.ofType(render(PayScreen, {}), ScreenError) as ReactElement<Props>[];
    expect(errors.map((error) => error.props.children)).toEqual([
      defaultLabels.pay[label].replace(/\{wallet\}/g, 'MetaMask').replace('{network}', 'Base'),
    ]);
  });

  it('offers no second payment while the first is not confirmed', () => {
    paymentProblem.current = 'sentUnconfirmed';
    show('pay', { quote: quoteOf(null), payerProof: 'confirmed' });
    const button = fixture.ofType(render(PayScreen, {}), PrimaryButton)[0] as ReactElement<Props>;
    expect(button.props.disabled).toBe(true);
  });

  // The same button came back with no text at all
  it('says why a new price was refused', () => {
    show('pay', { quote: quoteOf(null), payerProof: 'confirmed', error: { code: 'rate_limited', message: '' } });
    const errors = fixture.ofType(render(PayScreen, {}), ScreenError) as ReactElement<Props>[];
    expect(errors.map((error) => error.props.children)).toEqual([defaultLabels.method.rateLimited]);
  });

  // Quasar takes the rest only in the method that paid first: the offer led to a refusal and to the same refusal again
  it('offers another method when the wallet is short, but not on a rest', () => {
    asyncValue.balance = 0n;
    asyncValue.balances = fixture.checkout.methods.map(() => 5n);
    show('pay', { quote: quoteOf(null), payerProof: 'confirmed' });
    expect(JSON.stringify(render(PayScreen, {}))).toContain(defaultLabels.pay.payFromBalance);
    unmount();
    show('pay', { quote: quoteOf(null), payerProof: 'confirmed', invoiceStatus: 'underpaid' });
    expect(JSON.stringify(render(PayScreen, {}))).not.toContain(defaultLabels.pay.payFromBalance);
  });

  // It read as a failed sanctions check of a wallet that only is not the one the seller asked for
  it('says that the seller asked for another wallet, on the refused screen', () => {
    show('blocked', {
      phase: 'blocked',
      payer: `${BASE}:${PAYER}`,
      error: { code: 'payer_not_expected', message: '' },
    });
    expect(JSON.stringify(render(OutcomeScreen, { kind: 'blocked' }))).toContain(defaultLabels.method.payerNotExpected);
  });

  it('says the check did not pass for a blocked wallet', () => {
    show('blocked', { phase: 'blocked', payer: `${BASE}:${PAYER}`, error: { code: 'payer_blocked', message: '' } });
    expect(JSON.stringify(render(OutcomeScreen, { kind: 'blocked' }))).not.toContain(
      defaultLabels.method.payerNotExpected,
    );
  });

  it('does not go back while a new price is on its way', () => {
    show('pay', { phase: 'quoting', quote: quoteOf(null), payerProof: 'confirmed' });
    const back = fixture.ofType(render(PayScreen, {}), SecondaryButton)[0] as ReactElement<Props>;
    expect(back.props.disabled).toBe(true);
  });

  it('pays once the wallet confirmed the invoice', () => {
    show('pay', { quote: quoteOf(null), payerProof: 'confirmed' });
    const button = fixture.ofType(render(PayScreen, {}), PrimaryButton)[0] as ReactElement<Props>;
    expect(fixture.text(button.props.children)).toBe('Pay 89.54 USDC');
  });
});

// The price is locked for the wallet it was quoted for: another one neither asks for a new price nor pays this one
describe('the pay step after the buyer switched wallets', () => {
  it('keeps the price and asks for the wallet it was locked for', () => {
    const quote = quoteOf(null);
    show('pay', { quote, payerProof: 'confirmed' });
    const requestQuote = vi.fn();
    const connectWallet = vi.fn(async () => undefined);
    ctx = {
      ...ctx,
      connectWallet,
      store: { getState: () => ({ ...ctx.state, requestQuote }) },
      wallet: { ...(ctx.wallet as object), address: '0x9999999999999999999999999999999999999999' },
    } as never;

    const tree = render(PayScreen, {});

    expect(textOf(tree)).toContain('89.54');
    const button = fixture.ofType(tree, PrimaryButton)[0] as ReactElement<Props>;
    expect(button.props.children).toBe(defaultLabels.pay.connect);
    (button.props.onClick as () => void)();
    expect(connectWallet).toHaveBeenCalledOnce();
    expect(requestQuote).not.toHaveBeenCalled();
    expect(pay).not.toHaveBeenCalled();
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

  it('offers no rest once it cannot be paid, and says when the merchant can refund what arrived', () => {
    const received = { status: 'underpaid', amountPaid: '80000000' } as const;
    const expectClosed = () => {
      const tree = OutcomeScreen({ kind: 'underpaid' });
      expect(textOf(tree)).toContain('The rest of this invoice can no longer be paid here.');
      expect(textOf(tree)).toMatch(/After .*2026.*, Cosmos can refund what arrived\./);
      expect(textOf(tree)).toContain('80.00 USDC of 89.54 USDC received.');
      expect(textOf(tree)).not.toContain('Send the rest');
      expect(textOf(tree)).not.toContain('It stays payable');
      expect(fixture.ofType(tree, PrimaryButton)).toHaveLength(0);
    };
    // As the checkout reads it
    show('underpaid', { phase: 'underpaid', quote: quoteOf(null) }, { ...received, restPayable: false });
    expectClosed();
    // Refused meanwhile, on a page read while the method was on
    show(
      'underpaid',
      { phase: 'underpaid', quote: quoteOf(null), error: { code: 'method_not_found', message: '', status: 404 } },
      { ...received, restPayable: true },
    );
    expectClosed();
  });

  it('keeps the rest open while the checkout on the page is the read from before the part arrived', () => {
    show(
      'underpaid',
      { phase: 'underpaid', invoiceStatus: 'underpaid', quote: quoteOf(null) },
      { status: 'open', amountPaid: '80000000', restPayable: false },
    );
    const tree = OutcomeScreen({ kind: 'underpaid' });
    expect(textOf(tree)).toContain('Send the rest');
    expect(fixture.ofType(tree, PrimaryButton)).toHaveLength(1);
  });

  it('says why "Pay the rest" did nothing, and keeps the button for another try', () => {
    show(
      'underpaid',
      { phase: 'underpaid', quote: quoteOf(null), error: { code: 'rate_limited', message: '', status: 429 } },
      { status: 'underpaid', amountPaid: '80000000', restPayable: true },
    );
    const tree = OutcomeScreen({ kind: 'underpaid' });
    expect(fixture.ofType(tree, ScreenError).map((e) => (e as ReactElement<Props>).props.children)).toEqual([
      defaultLabels.method.rateLimited,
    ]);
    expect(fixture.ofType(tree, PrimaryButton)).toHaveLength(1);
  });

  it('says what a rest that moved money without counting means, instead of only offering it again', () => {
    show(
      'underpaid',
      {
        phase: 'underpaid',
        quote: quoteOf(null),
        error: { code: 'payment_mismatch', message: '', reason: 'no_matching_transfer' },
      },
      { status: 'underpaid', amountPaid: '80000000', restPayable: true },
    );
    const errors = fixture
      .ofType(OutcomeScreen({ kind: 'underpaid' }), ScreenError)
      .map((e) => (e as ReactElement<Props>).props.children);
    expect(errors).toEqual([defaultLabels.pay.mismatch.replace('{merchant}', 'Cosmos')]);
  });

  it('names the wallet that paid first from the checkout, as an address or an account, with no quote on the page', () => {
    for (const originWallet of [FIRST, `${BASE}:${FIRST}`]) {
      show(
        'underpaid',
        { phase: 'underpaid', quote: null },
        { status: 'underpaid', amountPaid: '80000000', restPayable: true, originWallet },
      );
      expect(textOf(OutcomeScreen({ kind: 'underpaid' }))).toContain(REFUSAL);
    }
    // Quasar refuses it with the bare address it keeps
    show(
      'underpaid',
      {
        phase: 'underpaid',
        quote: quoteOf(null),
        error: { code: 'payer_mismatch', message: '', status: 409, originWallet: FIRST },
      },
      { status: 'underpaid', amountPaid: '80000000' },
    );
    expect(textOf(OutcomeScreen({ kind: 'underpaid' }))).toContain(REFUSAL);
  });

  it('reads the amounts from the checkout when the page holds no quote', () => {
    show(
      'underpaid',
      { phase: 'underpaid', quote: null },
      { status: 'underpaid', amountPaid: '80000000', restPayable: true },
    );
    ctx = { ...ctx, checkout: { ...ctx.checkout!, quote: quoteOf(null) } as CheckoutView };
    expect(textOf(OutcomeScreen({ kind: 'underpaid' }))).toContain('80.00 USDC of 89.54 USDC received.');
  });

  it('says until when the rate of a moving asset holds, on the outcome and the payment step', () => {
    const heldUntil = new Date(Date.now() + 300_000).toISOString();
    const rest = { ...quoteOf(null), amountDue: '9540000', amountToSend: '9540000', rateHeldUntil: heldUntil };
    const received = { status: 'underpaid', amountPaid: '80000000', restPayable: true } as const;
    show('underpaid', { phase: 'underpaid', quote: rest }, received);
    expect(textOf(OutcomeScreen({ kind: 'underpaid' }))).toMatch(
      /This rate holds until .+\. A payment after that waits for Cosmos to accept it\./,
    );
    show('pay', { phase: 'awaitingPayment', invoiceStatus: 'underpaid', quote: rest }, received);
    expect(textOf(render(PayScreen, {}))).toContain('A payment after that waits for Cosmos to accept it.');
    unmount();

    // Past that time the buyer can still pay, and knows the merchant decides
    const ended = { ...rest, rateHeldUntil: new Date(Date.now() - 60_000).toISOString() };
    show('pay', { phase: 'awaitingPayment', invoiceStatus: 'underpaid', quote: ended }, received);
    expect(textOf(render(PayScreen, {}))).toContain(
      'This rate was locked earlier, so this payment waits for Cosmos to accept it.',
    );
  });

  it('says nothing of a rate on a rest in a stablecoin of the invoice currency', () => {
    const rest = { ...quoteOf(null), amountDue: '9540000', amountToSend: '9540000', rateHeldUntil: null };
    show(
      'pay',
      { phase: 'awaitingPayment', invoiceStatus: 'underpaid', quote: rest },
      { status: 'underpaid', amountPaid: '80000000', restPayable: true },
    );
    expect(textOf(render(PayScreen, {}))).not.toContain('This rate');
  });

  it('offers no new price on a rest: the amount stays, only its time runs out', () => {
    const rest = { ...quoteOf(null), amountDue: '9540000', amountToSend: '9540000' };
    show(
      'pay',
      { phase: 'awaitingPayment', invoiceStatus: 'underpaid', quote: rest },
      { status: 'underpaid', amountPaid: '80000000', restPayable: true },
    );
    expect(textOf(render(PayScreen, {}))).not.toContain(defaultLabels.pay.refreshPrice);
    unmount();

    const ended = { ...rest, expiresAt: new Date(Date.now() - 1_000).toISOString() };
    show(
      'pay',
      { phase: 'awaitingPayment', invoiceStatus: 'underpaid', quote: ended },
      { status: 'underpaid', amountPaid: '80000000', restPayable: true },
    );
    const text = textOf(render(PayScreen, {}));
    expect(text).toContain(defaultLabels.outcome.payRest);
    expect(text).not.toContain(defaultLabels.pay.newPrice);
  });

  it('gets the QR of the rest of a QR payment with another wallet connected: the first wallet is on a phone', () => {
    const qr = { ...quoteOf(null), payer: null, amountDue: '9540000', amountToSend: '9540000' };
    show(
      'underpaid',
      { phase: 'underpaid', quote: qr },
      { status: 'underpaid', amountPaid: '80000000', restPayable: true, originWallet: FIRST },
    );
    ctx = { ...ctx, lockPrice: vi.fn(async () => undefined) };
    const tree = OutcomeScreen({ kind: 'underpaid' });
    expect(textOf(tree)).not.toContain('paid first');
    ((fixture.ofType(tree, PrimaryButton)[0] as ReactElement<Props>).props.onClick as () => void)();
    expect(ctx.connectWallet).not.toHaveBeenCalled();
    expect(ctx.lockPrice).toHaveBeenCalledOnce();
  });

  it('says the first wallet did not pass the check, not that nothing was sent', () => {
    show(
      'underpaid',
      { phase: 'underpaid', quote: quoteOf(null), error: { code: 'payer_blocked', message: '', status: 403 } },
      { status: 'underpaid', amountPaid: '80000000', restPayable: true },
    );
    const errors = fixture
      .ofType(OutcomeScreen({ kind: 'underpaid' }), ScreenError)
      .map((e) => (e as ReactElement<Props>).props.children);
    expect(errors).toEqual(['This wallet did not pass the wallet check, so it cannot pay the rest. Contact Cosmos.']);
  });

  it('says a rest paid now waits for the merchant, not the part that arrived, on the outcome', () => {
    const late = { ...quoteOf(null), rateHeldUntil: new Date(Date.now() - 60_000).toISOString() };
    show(
      'underpaid',
      { phase: 'underpaid', quote: late },
      { status: 'underpaid', amountPaid: '80000000', restPayable: true },
    );
    const text = textOf(OutcomeScreen({ kind: 'underpaid' }));
    expect(text).toContain('The rate of this invoice has ended, so a rest paid now waits for Cosmos to accept it.');
    expect(text).not.toContain('this payment waits');
  });

  it('promises no locked price on a rest in a moving asset: it counts the time to send and says what the rate does', () => {
    const rest = {
      ...quoteOf(null),
      amountDue: '9540000',
      amountToSend: '9540000',
      rateHeldUntil: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };
    show(
      'pay',
      { phase: 'awaitingPayment', invoiceStatus: 'underpaid', quote: rest },
      { status: 'underpaid', amountPaid: '80000000', restPayable: true },
    );
    const text = textOf(render(PayScreen, {}));
    expect(text).toMatch(/Time left to send: /);
    expect(text).not.toMatch(/Price locked for/);
    expect(text).not.toMatch(/Keep this price/);
    expect(text).not.toMatch(/This price ends/);
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
      {
        status: 'underpaid',
        amountPaid: '80000000',
        originWallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      },
    );
    const tree = render(QrScreen, {});
    const text = textOf(tree);
    expect(text).toContain('You send the rest');
    expect(text).not.toContain('Back to methods');
    expect(fixture.elements(tree).map((element) => element.props.subtitle)).toContain(
      'Scan with the wallet that paid first, 9WzD…AWWM.',
    );
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
