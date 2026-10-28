import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutScreen } from '../utils/checkout';
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
const { DeadlineTimer, CompactSummary } = await import('./CheckoutSummary');

/** The summary of an invoice in `status`, on the `screen` of the checkout. */
function at(status: string, screen: CheckoutScreen) {
  const checkout = {
    ...fixture.checkout,
    invoice: { ...fixture.checkout.invoice, status, dueAt: '2026-10-29T08:28:00Z' },
  } as typeof fixture.checkout;
  ctx = fixture.checkoutContextValue({}, { checkout, screen, now: Date.parse('2026-10-28T10:00:00Z') });
}

const hasTimer = (tree: unknown) => fixture.elements(tree).some((element) => element.props.role === 'timer');

afterEach(() => unmount());

// Owner, 2026-10-28: after paying, the "Pay within" countdown stayed in the checkout. It counts only while the buyer
// can still pay: not once the payment is sent and being confirmed, nor after it
describe('the countdown to the deadline', () => {
  it.each([
    ['open', 'method'],
    ['open', 'pay'],
    ['open', 'qr'],
    ['underpaid', 'underpaid'],
  ] as const)('counts on an invoice %s at the %s step', (status, screen) => {
    at(status, screen);
    expect(hasTimer(render(DeadlineTimer, {}))).toBe(true);
  });

  it.each([
    ['processing', 'confirm'],
    ['open', 'confirm'],
    ['open', 'paid'],
    ['processing', 'paid'],
    ['paid', 'paid'],
    ['held', 'held'],
  ] as const)('is gone on an invoice %s at the %s step', (status, screen) => {
    at(status, screen);
    expect(render(DeadlineTimer, {})).toBeNull();
    expect(hasTimer(render(CompactSummary, {}))).toBe(false);
  });
});
