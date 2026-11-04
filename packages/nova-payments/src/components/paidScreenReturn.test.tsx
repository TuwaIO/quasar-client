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
const autoReturn = vi.hoisted(() => ({ seconds: [] as number[] }));
vi.mock('../hooks/useOutcomeEffects', async () => ({
  ...(await vi.importActual<object>('../hooks/useOutcomeEffects')),
  useAutoReturn: ({ seconds }: { seconds: number }) => {
    autoReturn.seconds.push(seconds);
    return { left: seconds > 0 ? seconds : null, stay: vi.fn() };
  },
}));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { PrimaryButton, SecondaryButton } = await import('./ScreenParts');
const { PaidScreen } = await import('./PaidScreen');

type Props = Record<string, unknown>;
const SUCCESS = 'https://shop.example/billing';

/** The paid outcome of an invoice with a way back to the seller, shown as `display`. */
function paid(
  display: CheckoutContextValue['display'],
  autoReturnSeconds: number,
  options: { openedPaid?: boolean; checkoutOverrides?: object } = {},
) {
  autoReturn.seconds = [];
  const checkout = {
    ...fixture.checkout,
    ...options.checkoutOverrides,
    invoice: { ...fixture.checkout.invoice, status: 'paid', successUrl: SUCCESS },
  } as typeof fixture.checkout;
  const close = vi.fn();
  ctx = fixture.checkoutContextValue(
    {},
    {
      checkout,
      display,
      close,
      autoReturnSeconds,
      openedPaid: options.openedPaid ?? false,
      state: { ...fixture.checkoutContextValue({}).state, checkout, phase: 'paid' } as never,
    },
  );
  const tree = render(PaidScreen, {});
  const links = fixture.elements(tree).filter((element) => element.type === 'a' && element.props.href === SUCCESS);
  return { tree, close, links };
}

afterEach(() => unmount());

// After paying for quota in the dashboard, the checkout counted down and loaded the billing page again
// (its successUrl), closing everything at once. A checkout opened as a modal belongs to the page under it
describe('the amount of a paid invoice', () => {
  const rest = {
    methodId: 'usdc-base',
    payer: null,
    cryptoAmountExpected: '89540000',
    amountDue: '9540000',
    amountToSend: '9540000',
    decimals: 6,
    instructions: { family: 'eip155', chainId: 8453, symbol: 'USDC' },
  };

  it('is the whole invoice after a rest, not only the last transfer', () => {
    paid('page', 0);
    ctx = { ...ctx, state: { ...ctx.state, quote: rest } as never };
    const text = fixture
      .elements(render(PaidScreen, {}))
      .flatMap((element) => [element.props.children].flat())
      .filter((child): child is string => typeof child === 'string')
      .join(' ');
    expect(text).toContain('89.54 USDC');
    expect(text).not.toMatch(/(^|\s)9\.54 USDC/);
  });
});

describe('the way back after paying', () => {
  it('in a modal: Close, no countdown and no link that loads the page again', () => {
    const { tree, close, links } = paid('modal', 0);
    expect(links).toHaveLength(0);
    expect(autoReturn.seconds.every((seconds) => seconds === 0)).toBe(true);
    const buttons = [
      ...fixture.ofType(tree, PrimaryButton),
      ...fixture.ofType(tree, SecondaryButton),
    ] as ReactElement<Props>[];
    const closeButton = buttons.find((button) => button.props.onClick === close);
    expect(closeButton).toBeDefined();
    expect(closeButton?.type).toBe(PrimaryButton);
  });

  it('on the payment page: back to the seller with the countdown, as before', () => {
    const { links } = paid('page', 5);
    expect(links).toHaveLength(1);
    expect(autoReturn.seconds).toContain(5);
  });

  it('opened on an invoice already paid: its receipt stays, the link in the email leads nowhere else', () => {
    const { links } = paid('page', 5, { openedPaid: true });
    expect(links).toHaveLength(1);
    expect(autoReturn.seconds.every((seconds) => seconds === 0)).toBe(true);
  });

  it('with automatic payments on: no countdown over the control that turns them off', () => {
    paid('page', 5, { checkoutOverrides: { autoCharge: { status: 'active', permission: null, revocation: null } } });
    expect(autoReturn.seconds.every((seconds) => seconds === 0)).toBe(true);
  });

  it('in a modal whose app asks for the return: back to the seller with the countdown', () => {
    const { links } = paid('modal', 5);
    expect(links).toHaveLength(1);
    expect(autoReturn.seconds).toContain(5);
  });
});
