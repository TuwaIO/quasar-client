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
const { PrimaryButton } = await import('./ScreenParts');
const { MethodScreen } = await import('./MethodScreen');

type Props = Record<string, unknown>;

/** The method step with USDC on Base chosen to be paid by QR code on a phone (no wallet adapter in this page). */
function qrStep(ownAddress: boolean | undefined, payUrl: string | null = null) {
  const { actions, store } = fixture.fakeStore();
  const base = { ...fixture.method('usdc-base', 'USDC', 'eip155:8453', true), ownAddress };
  const checkout = { ...fixture.checkout, methods: [base] } as typeof fixture.checkout;
  const setHandoff = vi.fn();
  ctx = fixture.checkoutContextValue(
    {},
    {
      checkout,
      store,
      payWith: 'qr',
      payUrl,
      setHandoff,
      adapterFor: () => undefined,
      state: { ...fixture.checkoutContextValue({}).state, checkout, methodId: base.id },
    },
  );
  const tree = render(MethodScreen, {});
  const button = fixture.ofType(tree, PrimaryButton)[0] as ReactElement<Props>;
  return { button, actions, setHandoff };
}

afterEach(() => unmount());

describe('paying a method by QR code on a phone', () => {
  // The phone wallet or the exchange pays the address: no wallet in this page, and no page to open on the phone
  it("locks a price with no wallet for an invoice's own address", async () => {
    const { button, actions, setHandoff } = qrStep(true);
    expect(button.props.disabled).toBe(false);
    await (button.props.onClick as () => Promise<void>)();
    expect(actions.setPayer).toHaveBeenCalledWith(null);
    expect(actions.requestQuote).toHaveBeenCalledTimes(1);
    expect(setHandoff).not.toHaveBeenCalled();
  });

  it('hands another EVM method over to the payment page on the phone, before any price', async () => {
    const { button, actions, setHandoff } = qrStep(undefined, 'https://quasar.example/pay/token');
    await (button.props.onClick as () => Promise<void>)();
    expect(setHandoff).toHaveBeenCalledWith(true);
    expect(actions.requestQuote).not.toHaveBeenCalled();
  });
});
