import type { CheckoutMethod, CheckoutState, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutContextValue } from './checkoutContext';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

let ctx: CheckoutContextValue;
vi.mock('../hooks/useCheckoutContext', () => ({ useCheckoutContext: () => ctx }));

const { render, unmount } = await import('../testing/hookHarness');
const { defaultLabels } = await import('../i18n');
const { PrimaryButton, SecondaryButton, ScreenContent, ScreenError, ScreenFooter, DetailRow, DetailsCard } =
  await import('./ScreenParts');
const { CheckoutFrame, ScreenBody } = await import('./PaymentCheckout');
const { CheckoutHeader, MobileSteps } = await import('./CheckoutHeader');
const { CheckoutStepper } = await import('./CheckoutStepper');
const { MethodScreen } = await import('./MethodScreen');
const { OutcomeScreen } = await import('./OutcomeScreen');
const { QrCode } = await import('./QrCode');
const { OrderTotal } = await import('./CheckoutSummary');
const { RadioCards } = await import('./RadioCards');

/** Every element of the tree (children and element props), depth first. */
function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...Object.values(element.props).flatMap(elements)];
}
const ofType = (node: unknown, type: unknown) => elements(node).filter((element) => element.type === type);
const classesOf = (node: unknown) => elements(node).map((element) => String(element.props.className ?? ''));
const hasClass = (node: unknown, name: string) => classesOf(node).some((classes) => classes.split(' ').includes(name));

const method = (id: string, symbol: string, chainId: string, featured = false): CheckoutMethod =>
  ({
    id,
    name: `${symbol} on ${chainId}`,
    symbol,
    chainId,
    assetId: null,
    decimals: 6,
    gasless: 'off',
    featured,
    markupBps: 0,
    discountBps: 0,
  }) as CheckoutMethod;

const methods = [method('usdc-base', 'USDC', 'eip155:8453', true), method('usdc-eth', 'USDC', 'eip155:1')];
const checkout = {
  invoice: {
    id: 'inv_1',
    number: 'INV-1',
    status: 'open',
    currency: 'USD',
    totalMinor: '200',
    lineItems: [],
    dueAt: null,
    environment: 'live',
    replacedBy: null,
  },
  merchant: {
    name: 'Cosmos',
    website: null,
    supportEmail: null,
    seller: null,
    fundingUrl: null,
    links: { terms: null, refundPolicy: null, privacy: null },
  },
  methods,
  quoteTtlSeconds: 900,
  autoCharge: null,
} as unknown as CheckoutView;

function context(customization: CheckoutContextValue['customization'], extra: Partial<CheckoutContextValue> = {}) {
  ctx = {
    store: { getState: () => ({ selectMethod: vi.fn() }) },
    state: {
      phase: 'selectMethod',
      checkout,
      methodId: 'usdc-base',
      quote: null,
      error: null,
    } as unknown as CheckoutState,
    checkout,
    screen: 'method',
    locale: 'en',
    labels: defaultLabels,
    now: 0,
    wallet: null,
    payWith: 'wallet',
    setPayWith: vi.fn(),
    payUrl: null,
    connectWallet: vi.fn(() => true),
    adapterFor: () => ({ family: 'eip155' }) as never,
    handoff: false,
    setHandoff: vi.fn(),
    backToMethods: vi.fn(),
    onPaymentSent: vi.fn(),
    autoPay: false,
    setAutoPay: vi.fn(),
    openInvoice: vi.fn(),
    autoReturnSeconds: 5,
    customization,
    ...extra,
  } as CheckoutContextValue;
  return ctx;
}

afterEach(() => unmount());

describe('customization of the checkout parts', () => {
  it('adds the classes of the screen parts and the main button', () => {
    context({
      classNames: {
        screen: () => 'brand-screen',
        footer: () => 'brand-footer',
        error: () => 'brand-error',
        detailRow: () => 'brand-row',
        primaryButton: ({ screen }) => `brand-button-${screen}`,
      },
    });

    expect(hasClass(ScreenContent({ title: 'Title', children: null }), 'brand-screen')).toBe(true);
    expect(hasClass(ScreenFooter({ children: null }), 'brand-footer')).toBe(true);
    expect(hasClass(ScreenError({ children: 'No' }), 'brand-error')).toBe(true);
    expect(hasClass(DetailRow({ name: 'Rate', children: '1' }), 'brand-row')).toBe(true);
    expect(hasClass(PrimaryButton({ children: 'Pay' }), 'brand-button-method')).toBe(true);
  });

  it('adds the classes of the details cards and the second button', () => {
    const onClick = vi.fn();
    context({ classNames: { detailsCard: () => 'brand-card', secondaryButton: () => 'brand-secondary' } });

    expect(hasClass(DetailsCard({ children: null }), 'brand-card')).toBe(true);
    const button = SecondaryButton({ onClick, children: 'Close' }) as ReactElement<Record<string, unknown>>;
    expect(button.props).toMatchObject({
      type: 'button',
      onClick,
      className: expect.stringContaining('brand-secondary'),
    });
  });

  it('replaces the main button with the props of the default one', () => {
    const Button = (props: { children?: ReactNode }) => props.children;
    const onClick = vi.fn();
    context({ components: { PrimaryButton: Button }, classNames: { primaryButton: () => 'brand-button' } });

    const element = PrimaryButton({ busy: true, onClick, children: 'Pay' }) as ReactElement<Record<string, unknown>>;
    expect(element.type).toBe(Button);
    expect(element.props).toMatchObject({ busy: true, onClick, children: 'Pay', className: 'brand-button' });
  });

  it('replaces a whole screen', () => {
    const Paid = () => null;
    context({ components: { screens: { paid: Paid } } }, { screen: 'paid' });

    expect(ScreenBody()).toMatchObject({ type: Paid, props: { screen: 'paid' } });
    context({ components: { screens: { paid: Paid } } }, { screen: 'method' });
    expect(ofType(ScreenBody(), Paid)).toHaveLength(0);
  });

  it('adds the classes of the order and the screen area and replaces the header, the order panel and the phone order', () => {
    const Header = () => null;
    const Summary = () => null;
    const CompactSummary = () => null;
    context({
      classNames: {
        summary: () => 'brand-summary',
        compactSummary: () => 'brand-compact',
        body: () => 'brand-body',
      },
      components: { Header, Summary, CompactSummary },
    });

    const frame = render(CheckoutFrame, { leave: null });
    for (const name of ['brand-summary', 'brand-body']) expect(hasClass(frame, name)).toBe(true);
    expect(ofType(frame, Header)).toHaveLength(1);
    expect(ofType(frame, Summary)).toHaveLength(1);
    expect(ofType(frame, CompactSummary)).toHaveLength(1);
    expect(ofType(frame, CompactSummary)[0].props.className).toBe('brand-compact');
  });

  it('gives the steps their classes and lets the stepper be replaced, also on a phone', () => {
    const Stepper = () => null;
    context({ classNames: { header: () => 'brand-header', stepper: () => 'brand-steps' }, components: { Stepper } });

    const header = CheckoutHeader({});
    expect(hasClass(header, 'brand-header')).toBe(true);
    expect(ofType(header, Stepper)[0].props).toMatchObject({ className: 'brand-steps' });
    expect(MobileSteps({})).toMatchObject({ type: Stepper });

    const step = vi.fn(({ step: current, index }: { step: { state: string }; index: number }) =>
      current.state === 'current' ? `brand-current-${index}` : undefined,
    );
    const steps = CheckoutStepper({
      steps: [
        { key: 'method', state: 'done' },
        { key: 'pay', state: 'current' },
      ],
      labels: defaultLabels,
      stepClassName: (current, index) => step({ step: current, index }),
    });
    expect(hasClass(steps, 'brand-current-1')).toBe(true);
    expect(hasClass(steps, 'brand-current-0')).toBe(false);
  });

  it('gives the options of the method step their classes and lets their content be replaced', () => {
    const TokenOption = () => null;
    const NetworkOption = () => null;
    context({
      classNames: {
        tokenOption: ({ group, selected }) => `token-${group.symbol}-${selected}`,
        networkOption: ({ method: option, selected }) => `network-${option.id}-${selected}`,
        payWithOption: ({ payWith, selected }) => `pay-${payWith}-${selected}`,
      },
      components: { TokenOption, NetworkOption },
    });

    const groups = ofType(render(MethodScreen, {}), RadioCards) as ReactElement<{
      items: unknown[];
      itemClassName: (selected: boolean, item: unknown) => string;
      children: (item: unknown, selected: boolean) => unknown;
    }>[];
    const [tokens, networks, payWith] = groups;
    expect(tokens.props.itemClassName(true, tokens.props.items[0])).toContain('token-USDC-true');
    expect(tokens.props.children(tokens.props.items[0], true)).toMatchObject({
      type: TokenOption,
      props: { group: tokens.props.items[0], selected: true },
    });
    expect(networks.props.itemClassName(false, methods[1])).toContain('network-usdc-eth-false');
    expect(networks.props.children(methods[1], false)).toMatchObject({
      type: NetworkOption,
      props: { method: methods[1], selected: false },
    });
    expect(payWith.props.itemClassName(true, 'wallet')).toContain('pay-wallet-true');
  });

  it('lets the outcome icon, the QR code and the total be styled or replaced', () => {
    const StatusIcon = () => null;
    const Qr = () => null;
    context(
      {
        classNames: { statusIcon: ({ kind }) => `icon-${kind}`, qrCode: () => 'brand-qr', total: () => 'brand-total' },
        components: { StatusIcon, QrCode: Qr },
      },
      { screen: 'expired' },
    );

    expect(ofType(OutcomeScreen({ kind: 'expired' }), StatusIcon)[0].props).toMatchObject({
      kind: 'expired',
      className: 'icon-expired',
    });
    expect(render(QrCode, { value: 'solana:pay', label: 'Pay', className: 'novapay:h-44' })).toMatchObject({
      type: Qr,
      props: { value: 'solana:pay', label: 'Pay', className: expect.stringContaining('brand-qr') },
    });
    expect(hasClass(OrderTotal(), 'brand-total')).toBe(true);
  });
});
