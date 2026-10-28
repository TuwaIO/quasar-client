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

/** When the payment of most tests was handed over: before {@link DUE}. */
const HANDED_OVER = '2026-10-29T08:25:00Z';

/**
 * The confirm step of an invoice in `status` due at {@link DUE}, at `now`; `txKey` is the payment this page sent,
 * `paymentOnTheWay` what a current store says of it (absent in an older one), `handedOverAt` when the page handed it
 * over and `invoiceStatus` the newest status the store heard of.
 */
function confirmingAt(
  now: string,
  dueAt: string | null = DUE,
  {
    status = 'open',
    txKey = '0xabc',
    paymentOnTheWay,
    handedOverAt = HANDED_OVER,
    invoiceStatus = null,
  }: {
    status?: string;
    txKey?: string | null;
    paymentOnTheWay?: boolean;
    handedOverAt?: string | null;
    invoiceStatus?: string | null;
  } = {},
) {
  const checkout = {
    ...fixture.checkout,
    invoice: { ...fixture.checkout.invoice, status, dueAt },
  } as typeof fixture.checkout;
  const state = {
    phase: 'confirming',
    checkout,
    quote: null,
    error: null,
    txKey,
    txHash: null,
    invoiceStatus,
    ...(paymentOnTheWay === undefined ? {} : { paymentOnTheWay }),
  } as never;
  ctx = fixture.checkoutContextValue(
    {},
    {
      checkout,
      state,
      screen: 'confirm',
      now: Date.parse(now),
      handedOverAt: handedOverAt === null ? null : Date.parse(handedOverAt),
    },
  );
}

/** The neutral note of a payment not known to be handed over before the deadline, for Cosmos. */
const NEUTRAL =
  'Your payment is being confirmed. If it arrives after the invoice closes, Cosmos accepts it or returns it.';

/** The text of the status note under the payment. */
const noteOf = (tree: unknown) =>
  fixture.elements(tree).find((element) => element.props.role === 'status')?.props.children;

afterEach(() => unmount());

// Owner, 2026-10-28: "a payment sent before the deadline counts". Quasar keeps an open invoice for a payment it learned
// of before the deadline while that payment confirms, so the confirm step past the deadline says so instead of leaving
// the payer to think the payment failed
describe('the confirm step at the deadline', () => {
  it('says the window may close while there is time', () => {
    confirmingAt('2026-10-29T08:20:00Z');
    expect(noteOf(render(ConfirmScreen, {}))).toBe(defaultLabels.confirm.canClose);
  });

  it('says that the payment sent in time is being confirmed once the deadline passed', () => {
    confirmingAt('2026-10-29T08:28:00Z');
    expect(noteOf(render(ConfirmScreen, {}))).toBe('Your payment was sent before the deadline and is being confirmed.');
  });

  it('says the same on an underpaid invoice whose rest this page sent', () => {
    confirmingAt('2026-10-29T08:40:00Z', DUE, { status: 'underpaid' });
    expect(noteOf(render(ConfirmScreen, {}))).toBe(defaultLabels.confirm.afterDeadline);
  });

  it('fills {merchant} in a custom text', () => {
    confirmingAt('2026-10-29T08:28:00Z');
    ctx = { ...ctx, labels: { ...ctx.labels, confirm: { ...ctx.labels.confirm, afterDeadline: '{merchant} waits.' } } };
    expect(noteOf(render(ConfirmScreen, {}))).toBe(`${fixture.checkout.merchant.name} waits.`);
  });

  it('keeps the usual note when this page sent no payment', () => {
    confirmingAt('2026-10-29T08:28:00Z', DUE, { txKey: null });
    expect(noteOf(render(ConfirmScreen, {}))).toBe(defaultLabels.confirm.canClose);
  });

  it('keeps the usual note once the payment arrived and the invoice is processing', () => {
    confirmingAt('2026-10-29T08:28:00Z', DUE, { status: 'processing' });
    expect(noteOf(render(ConfirmScreen, {}))).toBe(defaultLabels.confirm.canClose);
  });

  it('reads the newest status the store heard of, not only the loaded invoice', () => {
    confirmingAt('2026-10-29T08:28:00Z', DUE, { invoiceStatus: 'processing' });
    expect(noteOf(render(ConfirmScreen, {}))).toBe(defaultLabels.confirm.canClose);
  });

  it('keeps the usual note on an invoice without a deadline', () => {
    confirmingAt('2026-10-29T08:28:00Z', null);
    expect(noteOf(render(ConfirmScreen, {}))).toBe(defaultLabels.confirm.canClose);
  });
});

// Owner, 2026-10-28: the deadline notes follow the payment's real state — handed over in time, failed, or after the
// deadline
describe("the confirm step follows the payment's real state", () => {
  it('says "sent before the deadline" for a relay answered `sending`, which has no transaction key yet', () => {
    confirmingAt('2026-10-29T08:28:00Z', DUE, { txKey: null, paymentOnTheWay: true });
    expect(noteOf(render(ConfirmScreen, {}))).toBe(defaultLabels.confirm.afterDeadline);
  });

  it('keeps the usual note once the store says that the payment is no longer on its way', () => {
    confirmingAt('2026-10-29T08:28:00Z', DUE, { paymentOnTheWay: false });
    expect(noteOf(render(ConfirmScreen, {}))).toBe(defaultLabels.confirm.canClose);
  });

  it('gives the neutral note for a payment handed over at or after the deadline', () => {
    confirmingAt('2026-10-29T08:29:00Z', DUE, { handedOverAt: DUE });
    expect(noteOf(render(ConfirmScreen, {}))).toBe(NEUTRAL);
    confirmingAt('2026-10-29T08:35:00Z', DUE, { handedOverAt: '2026-10-29T08:30:00Z' });
    expect(noteOf(render(ConfirmScreen, {}))).toBe(NEUTRAL);
  });

  it('gives the neutral note when the page does not know when the payment was handed over (a reload)', () => {
    confirmingAt('2026-10-29T08:29:00Z', DUE, { handedOverAt: null });
    expect(noteOf(render(ConfirmScreen, {}))).toBe(NEUTRAL);
  });

  it('keeps the usual note before the deadline, whenever the payment was handed over', () => {
    confirmingAt('2026-10-29T08:27:00Z', DUE, { handedOverAt: null });
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
