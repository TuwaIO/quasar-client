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

const { TxProgressIndicator } = await import('@tuwaio/nova-transactions');
const { AnimatePresence } = await import('framer-motion');
const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { StatusSteps } = await import('./StatusSteps');

type Steps = { isProcessing: boolean; isSucceed: boolean; isConfirmed: boolean; isFailed: boolean };
const stepsOf = (tree: unknown) => fixture.ofType(tree, TxProgressIndicator)[0].props as Steps;
const on = (store: object) => (ctx = { ...fixture.checkoutContextValue({}), store: store as never });

afterEach(() => unmount());

describe('StatusSteps', () => {
  it('shows how far the payment is: on its way, paid with the step before it confirmed, or failed', () => {
    on({});
    expect(stepsOf(render(StatusSteps, { state: 'processing' }))).toMatchObject({
      isProcessing: true,
      isSucceed: false,
    });
    unmount();
    on({});
    expect(stepsOf(render(StatusSteps, { state: 'succeed' }))).toMatchObject({ isSucceed: true, isConfirmed: true });
    unmount();
    on({});
    expect(stepsOf(render(StatusSteps, { state: 'failed' }))).toMatchObject({ isFailed: true, isConfirmed: false });
  });

  it('draws the first steps of a payment from the start', () => {
    on({});
    expect(fixture.ofType(render(StatusSteps, { state: 'processing' }), AnimatePresence)).toHaveLength(0);
  });

  // The paid step drew all three steps again from nothing: the line that had stood for a minute ran in once more
  it('goes on from the steps of the status screen before: they stand as they were, and only what changes moves', () => {
    const store = {};
    on(store);
    render(StatusSteps, { state: 'processing' });
    unmount();

    on(store);
    const first = render(StatusSteps, { state: 'succeed' });
    // No drawing of what is there already, and the state the steps were left in
    expect((fixture.ofType(first, AnimatePresence)[0].props as { initial: boolean }).initial).toBe(false);
    expect(stepsOf(first)).toMatchObject({ isProcessing: true, isSucceed: false });
    expect(stepsOf(render(StatusSteps, { state: 'succeed' }))).toMatchObject({ isProcessing: false, isSucceed: true });
  });
});
