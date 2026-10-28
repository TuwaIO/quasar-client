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
function paid(display: CheckoutContextValue['display'], autoReturnSeconds: number) {
  autoReturn.seconds = [];
  const checkout = {
    ...fixture.checkout,
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
      state: { ...fixture.checkoutContextValue({}).state, checkout, phase: 'paid' } as never,
    },
  );
  const tree = render(PaidScreen, {});
  const links = fixture.elements(tree).filter((element) => element.type === 'a' && element.props.href === SUCCESS);
  return { tree, close, links };
}

afterEach(() => unmount());

// Owner, 2026-10-28: after paying for quota in the dashboard, the checkout counted down and loaded the billing page again
// (its successUrl), closing everything at once. A checkout opened as a modal belongs to the page under it
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

  it('in a modal whose app asks for the return: back to the seller with the countdown', () => {
    const { links } = paid('modal', 5);
    expect(links).toHaveLength(1);
    expect(autoReturn.seconds).toContain(5);
  });
});
