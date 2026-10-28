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
const { AmountStep, ConfirmStep, RefundButton, RefundDialog, RefundSteps } = await import('./RefundButton');

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

// Board RefundSendStates of the dashboard sketch: the steps of a refund from the merchant's wallet
describe('RefundButton', () => {
  it('asks what to refund: an amount of the invoice currency (everything left when empty) or everything received', () => {
    const flow = flowOf({ step: 'amount' });
    let tree = render(AmountStep, { flow, labels: defaultLabels, currency: 'USD', refundable: '20.00 USD' });
    const modes = button(tree, RadioCards).props.items as { title: string; hint: string }[];
    expect(modes.map((mode) => mode.title)).toEqual(['An amount', 'Everything received']);
    expect(modes[0].hint).toBe('In USD, converted at the rate of now');
    expect(textOf(tree)).toContain('Up to 20.00 USD');

    const amount = fixture.elements(tree).find((element) => element.props.inputMode === 'decimal')!;
    (amount.props.onChange as (event: unknown) => void)({ target: { value: '12,5' } });
    tree = render(AmountStep, { flow, labels: defaultLabels, currency: 'USD' });
    (button(tree, PrimaryButton).props.onClick as () => void)();
    expect(flow.start).toHaveBeenCalledWith({ mode: 'fiat_value', amount: '12.5' });
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

  it('asks for the same refund again after its transaction failed on-chain', () => {
    const flow = flowOf({ step: 'failed', phase: 'failed' });
    const tree = render(RefundSteps, { flow, labels: defaultLabels, locale: 'en', close: vi.fn() });
    expect(button(tree, ScreenContent).props.title).toBe('The refund failed');
    (button(tree, PrimaryButton).props.onClick as () => void)();
    expect(flow.start).toHaveBeenCalledWith({ mode: 'fiat_value', amount: '15.89', reason: 'Order cancelled' });
  });
});
