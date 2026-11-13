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
const { rememberShown } = await import('./statusMemory');
const { StatusReveal } = await import('./StatusReveal');

const comesIn = (customization: CheckoutContextValue['customization'], store: object) => {
  ctx = { ...fixture.checkoutContextValue(customization), store: store as never };
  const tree = render(StatusReveal, { children: 'Receipt', className: 'own' }) as ReactElement<{ className: string }>;
  return tree.props.className.split(' ').includes('novapay-status-reveal');
};

afterEach(() => unmount());

describe('StatusReveal', () => {
  it('lets what a result adds come in when the screen goes on from a status screen', () => {
    const store = {};
    // The confirm step is still on the page as the paid one renders
    rememberShown(store, 'title', 'Confirming', false);
    expect(comesIn({}, store)).toBe(true);
  });

  it('just shows it on the first status screen: a receipt opened from its link', () => {
    expect(comesIn({}, {})).toBe(false);
  });

  it('just shows it with the animations of the checkout off', () => {
    const store = {};
    rememberShown(store, 'title', 'Confirming', false);
    expect(comesIn({ config: { animation: { disabled: true } } }, store)).toBe(false);
  });
});
