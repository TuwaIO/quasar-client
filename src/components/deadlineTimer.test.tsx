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

// Owner, 2026-10-28: the countdown stays through every step of the payment (signing, handing it over, confirming) and
// goes only once the payment succeeded (paid), or with an outcome in which a deadline means nothing (held, refunded,
// expired, cancelled, replaced)
describe('the countdown to the deadline', () => {
  it.each([
    ['open', 'loading'],
    ['open', 'buyer'],
    ['open', 'method'],
    ['open', 'pay'],
    ['open', 'qr'],
    ['open', 'confirm'],
    ['processing', 'confirm'],
    ['open', 'blocked'],
    ['underpaid', 'underpaid'],
  ] as const)('counts on an invoice %s at the %s step', (status, screen) => {
    at(status, screen);
    expect(hasTimer(render(DeadlineTimer, {}))).toBe(true);
    expect(hasTimer(render(CompactSummary, {}))).toBe(true);
  });

  it.each([
    ['open', 'paid'],
    ['processing', 'paid'],
    ['paid', 'paid'],
    ['paid', 'autoPay'],
    ['held', 'held'],
    ['refunded', 'refunded'],
    ['expired', 'expired'],
    ['cancelled', 'cancelled'],
    ['cancelled', 'replaced'],
  ] as const)('is gone on an invoice %s at the %s step', (status, screen) => {
    at(status, screen);
    expect(render(DeadlineTimer, {})).toBeNull();
    expect(hasTimer(render(CompactSummary, {}))).toBe(false);
  });

  it('stays at 00:00 when the deadline passes while the payment is confirming', () => {
    at('open', 'confirm');
    ctx = { ...ctx, now: Date.parse('2026-10-29T08:29:00Z') };
    const timer = fixture.elements(render(DeadlineTimer, {})).find((element) => element.props.role === 'timer');
    expect(timer?.props.children).toBe('00:00');
  });
});
