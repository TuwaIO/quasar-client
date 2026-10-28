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
const { defaultLabels } = await import('../i18n');
const { ConfirmScreen } = await import('./ConfirmScreen');
const { CheckoutFrame } = await import('./PaymentCheckout');

const DUE = '2026-10-29T08:28:00Z';

/** The confirm step of an open invoice due at {@link DUE}, at `now`. */
function confirmingAt(now: string, dueAt: string | null = DUE) {
  const checkout = {
    ...fixture.checkout,
    invoice: { ...fixture.checkout.invoice, status: 'open', dueAt },
  } as typeof fixture.checkout;
  ctx = fixture.checkoutContextValue({}, { checkout, screen: 'confirm', now: Date.parse(now) });
}

/** The text of the status note under the payment. */
const noteOf = (tree: unknown) =>
  fixture.elements(tree).find((element) => element.props.role === 'status')?.props.children;

afterEach(() => unmount());

// Owner, 2026-10-28: the countdown stays while the payment confirms. When it reaches zero then, the checkout says what is
// true instead of leaving the payer to think the payment failed: Quasar closes an open invoice at its deadline, and a
// payment that lands after that waits for the seller to accept or return it
describe('the confirm step at the deadline', () => {
  it('says the window may close while there is time', () => {
    confirmingAt('2026-10-29T08:20:00Z');
    expect(noteOf(render(ConfirmScreen, {}))).toBe(defaultLabels.confirm.canClose);
  });

  it('says what happens to the payment once the deadline passed while it confirms', () => {
    confirmingAt('2026-10-29T08:28:00Z');
    expect(noteOf(render(ConfirmScreen, {}))).toBe(
      defaultLabels.confirm.afterDeadline.replaceAll('{merchant}', fixture.checkout.merchant.name),
    );
  });

  it('keeps the usual note on an invoice without a deadline', () => {
    confirmingAt('2026-10-29T08:28:00Z', null);
    expect(noteOf(render(ConfirmScreen, {}))).toBe(defaultLabels.confirm.canClose);
  });
});

describe('the minutes left announced to screen readers', () => {
  /** What the live region of the frame says after the countdown crossed 10 minutes on `screen`. */
  const heardAt = (screen: 'method' | 'confirm') => {
    confirmingAt('2026-10-29T08:17:30Z');
    ctx = { ...ctx, screen };
    render(CheckoutFrame, { leave: null });
    ctx = { ...ctx, now: Date.parse('2026-10-29T08:18:30Z') };
    render(CheckoutFrame, { leave: null });
    const frame = render(CheckoutFrame, { leave: null });
    return fixture.elements(frame).find((element) => element.props['aria-live'] === 'polite')?.props.children;
  };

  it('are heard while the buyer can still pay', () => {
    expect(heardAt('method')).toBe('10 minutes left to pay');
  });

  // The countdown shows while the payment confirms, but "left to pay" would tell a buyer who paid to pay again
  it('are not heard once the payment is on its way', () => {
    expect(heardAt('confirm')).toBe('');
  });
});
