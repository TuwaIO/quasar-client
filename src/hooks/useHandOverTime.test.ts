import type { CheckoutState, CheckoutStore } from '@tuwaio/quasar-sdk/checkout';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { useHandOverTime } = await import('./useHandOverTime');

/** A checkout store in `phase`. */
const storeIn = (phase: CheckoutState['phase']) => createStore(() => ({ phase }) as CheckoutState) as CheckoutStore;
const setPhase = (store: CheckoutStore, phase: CheckoutState['phase']) => store.setState({ phase });

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

// Owner, 2026-10-28: "sent before the deadline" only for a payment handed over before it. The store does not say when
// the payment was handed over, so the checkout notes the moment its phase becomes `confirming`
describe('useHandOverTime', () => {
  it('notes when the phase becomes confirming', () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-29T08:27:00Z') });
    const store = storeIn('submitting');
    expect(render(useHandOverTime, store)).toBeNull();
    setPhase(store, 'confirming');
    vi.setSystemTime(Date.parse('2026-10-29T08:29:00Z'));
    expect(render(useHandOverTime, store)).toBe(Date.parse('2026-10-29T08:27:00Z'));
  });

  it('forgets it when the payment failed, and notes the next hand-over', () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-29T08:20:00Z') });
    const store = storeIn('submitting');
    render(useHandOverTime, store);
    setPhase(store, 'confirming');
    setPhase(store, 'awaitingPayment');
    expect(render(useHandOverTime, store)).toBeNull();
    vi.setSystemTime(Date.parse('2026-10-29T08:31:00Z'));
    setPhase(store, 'submitting');
    setPhase(store, 'confirming');
    expect(render(useHandOverTime, store)).toBe(Date.parse('2026-10-29T08:31:00Z'));
  });

  it('knows no time for a payment already confirming when the checkout opened (a reload)', () => {
    const store = storeIn('confirming');
    render(useHandOverTime, store);
    expect(render(useHandOverTime, store)).toBeNull();
  });

  // M3: a payment of the invoice the store found on its way (a reopened page, another tab) was not handed over here
  it('knows no time for a payment the store found on its way when it loaded or while the page offered to pay', () => {
    const reopened = storeIn('loading');
    render(useHandOverTime, reopened);
    setPhase(reopened, 'confirming');
    expect(render(useHandOverTime, reopened)).toBeNull();
    const otherTab = storeIn('selectMethod');
    render(useHandOverTime, otherTab);
    setPhase(otherTab, 'confirming');
    expect(render(useHandOverTime, otherTab)).toBeNull();
  });

  it('starts again for another invoice', () => {
    const first = storeIn('submitting');
    render(useHandOverTime, first);
    setPhase(first, 'confirming');
    expect(render(useHandOverTime, first)).not.toBeNull();
    const second = storeIn('confirming');
    expect(render(useHandOverTime, second)).toBeNull();
  });
});
