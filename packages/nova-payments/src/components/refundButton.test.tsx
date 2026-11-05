import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RefundFlow } from '../hooks/useRefund';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));
vi.mock('../hooks/useCheckoutContext', () => ({
  useCheckoutContext: () => null,
  useOptionalCheckoutContext: () => null,
}));
// The window's hooks: the labels of the language, and the flow it asks `useRefund` for (the steps take a flow)
vi.mock('../hooks/usePaymentsLabels', async () => {
  const { defaultLabels } = await import('../i18n');
  return { usePaymentsLabels: () => defaultLabels };
});
const refundHook = vi.hoisted(() => ({ params: [] as unknown[] }));
vi.mock('../hooks/useRefund', () => ({
  useRefund: (params: unknown) => {
    refundHook.params.push(params);
    return { step: 'connect', phase: 'awaitingTransfer', refund: null };
  },
}));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { defaultLabels } = await import('../i18n');
const { PrimaryButton, SecondaryButton, ScreenContent, ScreenError } = await import('./ScreenParts');
const { RadioCards } = await import('./RadioCards');
const { AmountStep, ConfirmStep, FailedStep, RefundButton, RefundDialog, RefundSteps } = await import('./RefundButton');
const { refundRateMoved } = await import('../utils/outcome');

type Props = Record<string, unknown>;
const PAYER = '0x9c1e000000000000000000000000000000004f02';
const MERCHANT = '0x7a0b0000000000000000000000000000000077e1';

const flowOf = (extra: Partial<RefundFlow> = {}): RefundFlow => ({
  step: 'confirm',
  phase: 'awaitingTransfer',
  refund: {
    id: 'rf_1',
    mode: 'fiat_value',
    amount: '15.89',
    reason: 'Order cancelled',
    creditNoteNumber: null,
  } as never,
  error: null,
  transfer: {
    family: 'eip155',
    chainId: 8453,
    to: PAYER,
    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    amount: '15890000',
    decimals: 6,
    symbol: 'USDC',
  },
  chainId: 'eip155:8453',
  network: 'Base',
  amount: '15.89 USDC',
  wallet: {
    address: MERCHANT,
    chainId: 'eip155:8453',
    family: 'eip155',
    connectorType: 'evm:metamask',
    walletId: 'metamask',
    name: 'MetaMask',
    connection: null,
  },
  wrongNetwork: false,
  balance: 4_210_000_000n,
  fee: null,
  problem: null,
  txKey: null,
  canConnect: true,
  connecting: false,
  preview: vi.fn(async () => null),
  start: vi.fn(async () => undefined),
  connect: vi.fn(),
  switchNetwork: vi.fn(async () => undefined),
  send: vi.fn(async () => undefined),
  ...extra,
});

/** Every text of the tree: children, headings and their subtitles. */
const textOf = (node: unknown): string =>
  fixture
    .elements(node)
    .flatMap((element) => [element.props.children, element.props.title, element.props.subtitle].flat())
    .filter((child): child is string => typeof child === 'string')
    .join(' ');
const button = (tree: unknown, type: unknown, index = 0) => fixture.ofType(tree, type)[index] as ReactElement<Props>;
const confirm = (flow: RefundFlow, extra: Props = {}) =>
  render(ConfirmStep, {
    flow,
    labels: defaultLabels,
    locale: 'en',
    values: { network: 'Base', symbol: 'USDC', amount: '15.89 USDC', wallet: 'MetaMask' },
    recordAction: extra.onRecord ? (
      <SecondaryButton onClick={extra.onRecord as () => void}>Record refund</SecondaryButton>
    ) : null,
    ...extra,
  });

afterEach(() => {
  unmount();
  refundHook.params.length = 0;
});

// What Quasar answers about a refund of 100.00 USD paid with 0.04 ETH
const PREVIEW = {
  amount: '100.00',
  currency: 'USD',
  symbol: 'ETH',
  decimals: 18,
  received: '40000000000000000',
  atPaymentRate: '40000000000000000',
  exactPossible: true,
};

// Board RefundSendStates of the dashboard sketch: the steps of a refund from the merchant's wallet
describe('RefundButton', () => {
  it('asks what to refund: an amount of the invoice currency (everything left when empty) or everything received', async () => {
    const flow = flowOf({ step: 'amount' });
    let tree = render(AmountStep, {
      flow,
      labels: defaultLabels,
      locale: 'en',
      currency: 'USD',
      refundable: '20.00 USD',
    });
    const modes = button(tree, RadioCards).props.items as { title: string; hint: string }[];
    expect(modes.map((mode) => mode.title)).toEqual(['An amount', 'Everything received']);
    expect(modes[0].hint).toBe('In USD, converted at the rate of now');
    expect(textOf(tree)).toContain('Up to 20.00 USD');

    const amount = fixture.elements(tree).find((element) => element.props.inputMode === 'decimal')!;
    (amount.props.onChange as (event: unknown) => void)({ target: { value: '12,5' } });
    tree = render(AmountStep, { flow, labels: defaultLabels, locale: 'en', currency: 'USD' });
    (button(tree, PrimaryButton).props.onClick as () => void)();
    await vi.waitFor(() => expect(flow.start).toHaveBeenCalledWith({ mode: 'fiat_value', amount: '12.5' }));
    expect(flow.preview).toHaveBeenCalledWith({ mode: 'fiat_value', amount: '12.5' });
  });

  describe('before a refund is asked for, since it then holds its amount', () => {
    const amountStep = (flow: ReturnType<typeof flowOf>) =>
      render(AmountStep, { flow, labels: defaultLabels, locale: 'en', currency: 'USD' });
    const proceed = (tree: unknown) => (button(tree as never, PrimaryButton).props.onClick as () => void)();

    it('shows how many tokens go out against what came in when the price moved, and goes on only when asked', async () => {
      const flow = flowOf({
        step: 'amount',
        preview: vi.fn(async () => ({ ...PREVIEW, cryptoAmount: '52000000000000000' })),
      });
      proceed(amountStep(flow));
      await vi.waitFor(() => expect(flow.preview).toHaveBeenCalled());
      await Promise.resolve();
      expect(flow.start).not.toHaveBeenCalled();
      const tree = amountStep(flow);
      expect(textOf(tree)).toContain(defaultLabels.refund.movedTitle);
      expect(textOf(tree)).toContain('0.052 ETH');
      expect(textOf(tree)).toContain('0.04 ETH');
      proceed(tree);
      await vi.waitFor(() => expect(flow.start).toHaveBeenCalledOnce());
    });

    it('prices it again before it goes on: a price that moved meanwhile shows its new amount first', async () => {
      const preview = vi
        .fn()
        .mockResolvedValueOnce({ ...PREVIEW, cryptoAmount: '52000000000000000' })
        .mockResolvedValueOnce({ ...PREVIEW, cryptoAmount: '60000000000000000' })
        .mockResolvedValueOnce({ ...PREVIEW, cryptoAmount: '60000000000000000' });
      const flow = flowOf({ step: 'amount', preview });
      proceed(amountStep(flow));
      await vi.waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
      await Promise.resolve();
      proceed(amountStep(flow));
      await vi.waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
      await Promise.resolve();
      expect(flow.start).not.toHaveBeenCalled();
      const tree = amountStep(flow);
      expect(textOf(tree)).toContain('0.06 ETH');
      proceed(tree);
      await vi.waitFor(() => expect(flow.start).toHaveBeenCalledOnce());
    });

    it('asks for nothing when the window closed while it looked: nothing could cancel the refund', async () => {
      let answer: (preview: unknown) => void = () => undefined;
      const preview = vi.fn(() => new Promise((resolve) => (answer = resolve)));
      const flow = flowOf({ step: 'amount', preview: preview as never });
      proceed(amountStep(flow));
      unmount();
      answer({ ...PREVIEW, cryptoAmount: '40100000000000000' });
      await Promise.resolve();
      await Promise.resolve();
      expect(flow.start).not.toHaveBeenCalled();
    });

    it('offers the tokens as they came only while nothing was refunded: the engine refuses them after that', async () => {
      const flow = flowOf({
        step: 'amount',
        preview: vi.fn(async () => ({ ...PREVIEW, cryptoAmount: '52000000000000000', exactPossible: false })),
      });
      proceed(amountStep(flow));
      await vi.waitFor(() => expect(flow.preview).toHaveBeenCalled());
      await Promise.resolve();
      expect(textOf(amountStep(flow))).not.toContain(defaultLabels.refund.modeExact);
    });

    it('holds the fields while it looks: what is asked for is what was typed', async () => {
      let answer: (preview: unknown) => void = () => undefined;
      const flow = flowOf({
        step: 'amount',
        preview: vi.fn(() => new Promise((resolve) => (answer = resolve))) as never,
      });
      proceed(amountStep(flow));
      const fieldset = fixture.elements(amountStep(flow)).find((element) => element.type === 'fieldset');
      expect(fieldset?.props.disabled).toBe(true);
      answer(null);
    });

    it('goes back only when nothing is being asked: a look under way would ask for what was left behind', async () => {
      let answer: (preview: unknown) => void = () => undefined;
      const preview = vi
        .fn()
        .mockResolvedValueOnce({ ...PREVIEW, cryptoAmount: '52000000000000000' })
        .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
      const flow = flowOf({ step: 'amount', preview });
      proceed(amountStep(flow));
      await vi.waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
      await Promise.resolve();
      proceed(amountStep(flow));
      await vi.waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
      expect(button(amountStep(flow), SecondaryButton).props.disabled).toBe(true);
      answer({ ...PREVIEW, cryptoAmount: '52000000000000000' });
    });

    it('says why when Quasar refused what was asked after the look', async () => {
      const flow = flowOf({
        step: 'amount',
        preview: vi.fn(async () => ({ ...PREVIEW, cryptoAmount: '52000000000000000' })),
        error: { code: 'refund_may_have_landed', message: 'Check the wallet first' } as never,
      });
      proceed(amountStep(flow));
      await vi.waitFor(() => expect(flow.preview).toHaveBeenCalled());
      await Promise.resolve();
      expect(textOf(amountStep(flow))).toContain('Check the wallet first');
    });

    it('asks nothing when the price held: a stablecoin at par goes straight on', async () => {
      const flow = flowOf({
        step: 'amount',
        preview: vi.fn(async () => ({ ...PREVIEW, cryptoAmount: '40100000000000000' })),
      });
      proceed(amountStep(flow));
      await vi.waitFor(() => expect(flow.start).toHaveBeenCalledOnce());
    });

    it('asks for nothing when Quasar would refuse it: the error shows', async () => {
      const flow = flowOf({ step: 'amount', preview: vi.fn(async () => 'refused' as const) });
      proceed(amountStep(flow));
      await vi.waitFor(() => expect(flow.preview).toHaveBeenCalled());
      await Promise.resolve();
      expect(flow.start).not.toHaveBeenCalled();
    });

    it('takes half a percent as a move', () => {
      // More goes out than came in, whatever the rate says: the discount of a method, an accepted underpayment
      expect(refundRateMoved({ cryptoAmount: '1000', atPaymentRate: '1000', received: '980' })).toBe(true);
      expect(refundRateMoved({ cryptoAmount: '980', atPaymentRate: '980', received: '980' })).toBe(false);
      expect(refundRateMoved({ cryptoAmount: '1005', atPaymentRate: '1000' })).toBe(true);
      expect(refundRateMoved({ cryptoAmount: '995', atPaymentRate: '1000' })).toBe(true);
      expect(refundRateMoved({ cryptoAmount: '1004', atPaymentRate: '1000' })).toBe(false);
      expect(refundRateMoved({ cryptoAmount: '1000', atPaymentRate: null })).toBe(false);
    });
  });

  it("connects the wallet through the app's handler, for apps without Nova Connect", () => {
    const onConnectWallet = vi.fn();
    const store = {} as never;
    const tree = render(RefundButton, { store, invoiceId: 'inv_1', onConnectWallet });
    const dialog = fixture.ofType(tree, RefundDialog)[0] as ReactElement<Props>;
    expect(dialog.props.onConnectWallet).toBe(onConnectWallet);
    unmount();

    render(RefundDialog, { ...dialog.props, open: true, onOpenChange: vi.fn() } as never);
    expect(refundHook.params.at(-1)).toMatchObject({ store, invoiceId: 'inv_1', onConnectWallet });
  });

  it('has the merchant connect a wallet of the network of the payment', () => {
    const flow = flowOf({ step: 'connect', wallet: null });
    const tree = render(RefundSteps, { flow, labels: defaultLabels, locale: 'en', close: vi.fn() });
    const content = button(tree, ScreenContent);
    expect(content.props.title).toBe('Connect a wallet');
    expect(content.props.subtitle).toBe(
      'The refund goes out on Base, the network of the payment. Any wallet that holds USDC there can send it.',
    );
    (button(tree, PrimaryButton).props.onClick as () => void)();
    expect(flow.connect).toHaveBeenCalled();
  });

  it('shows what goes where before the wallet asks, with the rows of the app', () => {
    const flow = flowOf({ fee: { amount: 12_000_000_000_000n, decimals: 18, symbol: 'ETH' } });
    const tree = confirm(flow, { details: <span>Frozen 7,950 units</span> });
    const text = textOf(tree);
    expect(button(tree, ScreenContent).props.title).toBe('Confirm the refund');
    expect(text).toContain('15.89 USDC on Base');
    expect(text).toContain('the payer');
    expect(text).toContain('Holds 4,210.00 USDC');
    expect(text).toContain('≈ 0.000012 ETH · from your wallet');
    expect(text).toContain('Frozen 7,950 units');
    (button(tree, PrimaryButton).props.onClick as () => void)();
    expect(flow.send).toHaveBeenCalled();
  });

  it('names the sender of a held transfer as the one its refund goes back to', () => {
    const flow = flowOf({ refund: { ...(flowOf().refund as object), heldTransfer: 'ht_1' } as never });
    const text = textOf(confirm(flow));
    expect(text).toContain('the sender of this transfer');
    expect(text).not.toContain('the payer');
  });

  it('asks a wallet on another network to switch first, as the checkout does', () => {
    const flow = flowOf({ wrongNetwork: true });
    const tree = confirm(flow);
    expect(button(tree, PrimaryButton).props.children).toBe('Switch to Base');
    (button(tree, PrimaryButton).props.onClick as () => void)();
    expect(flow.switchNetwork).toHaveBeenCalled();
    expect(flow.send).not.toHaveBeenCalled();
  });

  it('says why a refund was not sent, and offers to send it again or record it', () => {
    const onRecord = vi.fn();
    const tree = confirm(flowOf({ problem: 'notEnough', balance: 1_000_000n }), { onRecord });
    expect(button(tree, ScreenContent).props.title).toBe('Not sent');
    expect(textOf(button(tree, ScreenError))).toBe('Not enough USDC on 0x7a0b…77e1: it holds 1.00 USDC.');
    expect(button(tree, PrimaryButton).props.children).toBe('Send refund');
    (button(tree, SecondaryButton).props.onClick as () => void)();
    expect(onRecord).toHaveBeenCalled();
  });

  it('hands a sent refund over again instead of sending it twice', () => {
    const tree = confirm(flowOf({ txKey: '0xrefund', error: { code: 'request_failed', message: 'x' } }));
    expect(button(tree, PrimaryButton).props.children).toBe('Hand it over again');
    expect(textOf(tree)).toContain("Quasar hasn't taken its transaction yet");
  });

  it('follows the refund, then shows its credit note and the rows of the app', () => {
    const close = vi.fn();
    const confirming = render(RefundSteps, {
      flow: flowOf({ step: 'confirming', txKey: '0x41be00000000009a07' }),
      labels: defaultLabels,
      locale: 'en',
      close,
    });
    expect(button(confirming, ScreenContent).props.title).toBe('On its way');
    expect(textOf(confirming)).toContain('Base · waiting for confirmation');

    const refund = { id: 'rf_1', creditNoteNumber: 'CN-2026-000004', txHash: '0x41be00000000009a07' } as never;
    const done = render(RefundSteps, {
      flow: flowOf({ step: 'confirmed', phase: 'confirmed', refund }),
      labels: defaultLabels,
      locale: 'en',
      close,
      details: { done: <span>Removed 7,950 units</span> },
    });
    expect(button(done, ScreenContent).props.title).toBe('Refunded');
    expect(textOf(done)).toContain('CN-2026-000004');
    expect(textOf(done)).toContain('Removed 7,950 units');
    (button(done, PrimaryButton).props.onClick as () => void)();
    expect(close).toHaveBeenCalled();
  });

  describe('after its transaction failed on-chain', () => {
    const failed = (flow: RefundFlow) =>
      render(FailedStep, { flow, labels: defaultLabels, locale: 'en', values: {}, recordAction: null, close: vi.fn() });

    it("sends a held transfer's refund back to its row: asked again here it would refund the whole invoice", () => {
      const flow = flowOf({
        step: 'failed',
        phase: 'failed',
        refund: { id: 'rf_2', mode: 'exact_received', heldTransfer: 'ht_1', creditNoteNumber: null } as never,
      });
      const close = vi.fn();
      const tree = render(FailedStep, {
        flow,
        labels: defaultLabels,
        locale: 'en',
        values: {},
        recordAction: 'record',
        close,
      });
      expect(textOf(tree)).toContain(defaultLabels.refund.failedHeldNote);
      expect(fixture.ofType(tree, SecondaryButton)).toHaveLength(0);
      (button(tree, PrimaryButton).props.onClick as () => void)();
      expect(close).toHaveBeenCalledOnce();
      expect(flow.start).not.toHaveBeenCalled();
      expect(flow.preview).not.toHaveBeenCalled();
    });

    it('tells a refund that arrived short in words, and asks for the same refund: the engine sends only the rest', () => {
      const flow = flowOf({
        step: 'failed',
        phase: 'failed',
        refund: {
          id: 'rf_3',
          mode: 'fiat_value',
          amount: '30.00',
          failureReason: 'amount_short',
          creditNoteNumber: null,
        } as never,
      });
      const tree = render(FailedStep, {
        flow,
        labels: defaultLabels,
        locale: 'en',
        values: {},
        recordAction: 'record',
        close: vi.fn(),
      });
      expect(textOf(tree)).toContain(defaultLabels.refund.failedShort);
      expect(textOf(tree)).not.toContain('amount_short');
    });

    it('says why when Quasar refused the refund asked again', () => {
      const flow = flowOf({
        step: 'failed',
        phase: 'failed',
        error: { code: 'refund_may_have_landed', message: 'Check the wallet first' } as never,
      });
      expect(textOf(failed(flow))).toContain('Check the wallet first');
    });

    it('asks for the same refund again', async () => {
      const flow = flowOf({ step: 'failed', phase: 'failed' });
      const steps = render(RefundSteps, { flow, labels: defaultLabels, locale: 'en', close: vi.fn() });
      expect(fixture.ofType(steps, FailedStep)).toHaveLength(1);
      unmount();
      const tree = failed(flow);
      expect(button(tree, ScreenContent).props.title).toBe('The refund failed');
      (button(tree, PrimaryButton).props.onClick as () => void)();
      await vi.waitFor(() =>
        expect(flow.start).toHaveBeenCalledWith({ mode: 'fiat_value', amount: '15.89', reason: 'Order cancelled' }),
      );
    });

    it('shows what goes out first when the price moved since it was asked for', async () => {
      const flow = flowOf({
        step: 'failed',
        phase: 'failed',
        preview: vi.fn(async () => ({ ...PREVIEW, cryptoAmount: '52000000000000000' })),
      });
      (button(failed(flow), PrimaryButton).props.onClick as () => void)();
      await vi.waitFor(() => expect(flow.preview).toHaveBeenCalled());
      await Promise.resolve();
      expect(flow.start).not.toHaveBeenCalled();
      const tree = failed(flow);
      expect(textOf(tree)).toContain(defaultLabels.refund.movedTitle);
      // That way there is no choice of the exact mode to go back to
      expect(textOf(tree)).not.toContain(defaultLabels.refund.modeExact);
    });
  });
});
