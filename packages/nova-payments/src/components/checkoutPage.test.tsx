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

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { paidSteps, checkoutSteps } = await import('../utils/checkout');
const { heroAmountClass } = await import('./classes');
const { CheckoutHeader } = await import('./CheckoutHeader');
const { CheckoutSummary } = await import('./CheckoutSummary');
const { ConfirmScreen } = await import('./ConfirmScreen');
const { MethodScreen } = await import('./MethodScreen');
const { RadioCards } = await import('./RadioCards');
const { CheckoutStepper } = await import('./CheckoutStepper');
const { DetailRow } = await import('./ScreenParts');
const { StatusHead } = await import('./StatusHead');
const { WalletPrompt } = await import('./WalletPrompt');

afterEach(() => unmount());

const classesOf = (element: unknown) =>
  String((element as ReactElement<{ className?: string }>).props.className ?? '').split(' ');
const allClasses = (tree: unknown) => fixture.elements(tree).flatMap(classesOf);
const line = (name: string, quantity = '1', unitPrice = '2.00', netMinor = '200') => ({
  name,
  quantity,
  unitPrice,
  unitMinor: '200',
  netMinor,
  taxRate: '0',
});
const onPage = (invoice: object = {}, checkout: object = {}, values: object = {}) => {
  ctx = fixture.checkoutContextValue(
    {},
    {
      display: 'page',
      checkout: {
        ...fixture.checkout,
        ...checkout,
        invoice: { ...fixture.checkout.invoice, ...invoice },
      } as typeof fixture.checkout,
      ...values,
    },
  );
};

/** What a component element renders: these parts read the context and hold no state. */
const inside = (element: ReactElement<Record<string, unknown>>) =>
  (element.type as (props: unknown) => unknown)(element.props);
const named = (tree: unknown, name: string) =>
  fixture.elements(tree).find((element) => (element.type as { name?: string }).name === name)!;
/** The order panel of a page. */
const panel = () => inside(render(CheckoutSummary, {}) as ReactElement<Record<string, unknown>>);
const textOf = (nodes: unknown[]) =>
  nodes
    .flatMap((node) => {
      const children = (node as ReactElement<{ children?: unknown }>).props?.children;
      return Array.isArray(children) ? children : [children];
    })
    .filter((child) => typeof child === 'string' || typeof child === 'number')
    .join(' ');

describe('the order on its own page', () => {
  it('shows the total, then the lines, then the deadline at the bottom', () => {
    onPage();
    const names = fixture.elements(panel()).map((element) => (element.type as { name?: string }).name);
    expect(names.indexOf('HeroTotal')).toBeLessThan(names.indexOf('PageOrderCard'));
    expect(names.indexOf('PageOrderCard')).toBeLessThan(names.indexOf('DeadlineTimer'));
  });

  it('puts classNames.total on the total', () => {
    onPage();
    ctx = { ...ctx, customization: { classNames: { total: () => 'mine' } } } as CheckoutContextValue;
    expect(allClasses(inside(named(panel(), 'HeroTotal')))).toContain('mine');
  });

  it.each([
    [6, false, '+2 · Details'],
    [5, false, null],
    [5, true, '+2 · Details'],
  ])('with %i lines (tax: %s) folds what does not fit, without a scroll', (count, tax, label) => {
    const lines = Array.from({ length: count }, (_, i) => line(`Line ${i}`));
    onPage({ lineItems: lines, totalMinor: String(count * 200 + (tax ? 40 : 0)) });
    const inner = inside(named(panel(), 'PageOrderCard'));
    const labels = fixture
      .elements(inner)
      .map((element) => element.props.label)
      .filter((value) => typeof value === 'string');
    expect(labels[0] ?? null).toBe(label);
    expect(allClasses(inner).some((name) => name.includes('overflow'))).toBe(false);
  });

  it('hides the quantity only when it says nothing more than the amount', () => {
    onPage();
    const lineOf = (item: ReturnType<typeof line>) => {
      onPage({ lineItems: [item], totalMinor: item.netMinor });
      unmount();
      const row = named(inside(named(panel(), 'PageOrderCard')), 'PageOrderLine');
      return textOf(fixture.elements(inside(row)));
    };
    expect(lineOf(line('Plain'))).not.toContain('×');
    expect(lineOf(line('Two', '2', '1.00', '200'))).toContain('2 × 1.00');
    // A discount: one piece whose amount differs from its price keeps the row
    expect(lineOf(line('Discount', '1', '3.00', '200'))).toContain('1 × 3.00');
  });

  it('steps the total down as it grows', () => {
    expect(heroAmountClass('3.00')).toBe('novapay:text-[36px]');
    expect(heroAmountClass('1,234.50')).toBe('novapay:text-[30px]');
    expect(heroAmountClass('123,456.00')).toBe('novapay:text-[30px]');
    expect(heroAmountClass('1,234,567.00')).toBe('novapay:text-[24px]');
    expect(heroAmountClass('123,456,789,012.00')).toBe('novapay:text-[20px]');
  });
});

describe('the method step on its own page', () => {
  it('shows the one network of a token too, so that "Pay with" stays, and no copy of it holds a place', () => {
    onPage({}, { methods: [fixture.method('m1', 'ETH', 'eip155:1')] });
    ctx = { ...ctx, state: { ...ctx.state, methodId: 'm1' } } as CheckoutContextValue;
    const tree = render(MethodScreen, {});
    expect(fixture.ofType(tree, RadioCards).length).toBeGreaterThanOrEqual(3);
    expect(allClasses(tree)).not.toContain('novapay:invisible');
  });

  it('holds the place of the longest list under a token with fewer networks, out of reach', () => {
    const methods = [
      fixture.method('m1', 'USDC', 'eip155:1'),
      fixture.method('m2', 'USDC', 'eip155:8453'),
      fixture.method('m3', 'ETH', 'eip155:1'),
    ];
    onPage({}, { methods });
    ctx = { ...ctx, state: { ...ctx.state, methodId: 'm3' } } as CheckoutContextValue;
    const tree = render(MethodScreen, {});
    const sizer = fixture.elements(tree).find((element) => classesOf(element).includes('novapay:invisible'))!;
    expect(sizer.props.inert).toBe(true);
    expect(sizer.props['aria-hidden']).toBe(true);
  });

  it('keeps a token with one network out of a phone, and leaves the other displays as they were', () => {
    onPage({}, { methods: [fixture.method('m1', 'ETH', 'eip155:1')] });
    ctx = { ...ctx, state: { ...ctx.state, methodId: 'm1' } } as CheckoutContextValue;
    expect(allClasses(render(MethodScreen, {}))).toContain('novapay:max-sm:hidden');
    unmount();
    ctx = { ...ctx, display: 'inline' } as CheckoutContextValue;
    const radios = fixture.ofType(render(MethodScreen, {}), RadioCards);
    expect(radios).toHaveLength(2);
  });
});

describe('the confirm step on its own page', () => {
  const quote = {
    amountToSend: '1000000',
    amountDue: '1000000',
    cryptoAmountExpected: '1000000',
    decimals: 6,
    payer: null,
    instructions: { family: 'evm', chainId: 'eip155:8453', symbol: 'USDC', amount: '1000000', to: '0x1', token: '0x2' },
  };
  const rows = (tree: unknown) => fixture.ofType(tree, DetailRow).map((row) => row.props.name);

  const headOf = (tree: unknown) => fixture.ofType(tree, StatusHead)[0].props as { amount?: string | null };

  it('shows the amount in the head, where the paid screen does, and no row of it', () => {
    onPage();
    ctx = { ...ctx, state: { ...ctx.state, quote, txKey: '0xabc' } } as unknown as CheckoutContextValue;
    const tree = render(ConfirmScreen, {});
    expect(headOf(tree).amount).toBe('1.00 USDC');
    expect(rows(tree)).toEqual([ctx.labels.confirm.network, ctx.labels.confirm.transaction]);
  });

  it('invents no amount for a payment it only found', () => {
    onPage();
    ctx = { ...ctx, state: { ...ctx.state, quote: null, txKey: '0xabc' } } as unknown as CheckoutContextValue;
    expect(headOf(render(ConfirmScreen, {})).amount).toBeNull();
  });

  // In a modal and inline the amount was a row of the details and jumped up to the head when the payment confirmed
  it('shows it in the same place in the other displays', () => {
    for (const display of ['inline', 'modal'] as const) {
      onPage();
      ctx = { ...ctx, display, state: { ...ctx.state, quote, txKey: '0xabc' } } as unknown as CheckoutContextValue;
      const tree = render(ConfirmScreen, {});
      expect(headOf(tree).amount, display).toBe('1.00 USDC');
      expect(rows(tree), display).toEqual([ctx.labels.confirm.network, ctx.labels.confirm.transaction]);
      unmount();
    }
  });
});

describe('the steps of a page', () => {
  it('stay on the paid screen, all done', () => {
    expect(checkoutSteps('paid')).toBeNull();
    expect(paidSteps().map((step) => step.state)).toEqual(['done', 'done', 'done']);
    expect(paidSteps({ withDetails: true }).map((step) => step.key)).toEqual(['details', 'method', 'pay', 'confirm']);
  });

  // In a modal and inline the row went away as the payment confirmed: on a phone it stands over the status, whose
  // heading jumped up by its height
  it('show in the header of a paid checkout on every display, and of no other outcome', () => {
    const stepper = (tree: unknown) => fixture.elements(tree).some((element) => element.type === CheckoutStepper);
    for (const display of ['page', 'inline', 'modal'] as const) {
      onPage({}, {}, { screen: 'paid' });
      ctx = { ...ctx, display } as CheckoutContextValue;
      expect(stepper(render(CheckoutHeader, {})), display).toBe(true);
      unmount();
    }
    onPage({}, {}, { screen: 'expired' });
    expect(stepper(render(CheckoutHeader, {}))).toBe(false);
  });
});

describe('the wallet prompt on its own page', () => {
  it('keeps the height of the step at every width', () => {
    onPage();
    const classes = classesOf(render(WalletPrompt, { title: 'T', text: 'x', stepHeight: 400 } as never));
    expect(classes).toContain('novapay:min-h-[var(--novapay-step-height)]');
    expect(classes).not.toContain('novapay:max-sm:min-h-[var(--novapay-step-height)]');
  });
});
