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
const { ScreenBody } = await import('./PaymentCheckout');
const { defaultLabels, loadLabels } = await import('../i18n');

/** What the loading screen of a checkout in a language says. */
function loading(locale: string, labels = defaultLabels) {
  ctx = fixture.checkoutContextValue({}, { screen: 'loading', locale, labels });
  const screen = render(ScreenBody, {}) as ReactElement<object>;
  return fixture.text(render(screen.type as (props: object) => unknown, screen.props)).trim();
}

afterEach(() => unmount());

// The payment page of a Ukrainian invoice started with "Loading the checkout…"
describe('the loading screen', () => {
  it('says nothing in English while the language of the checkout loads, then speaks it', async () => {
    expect(loading('uk')).toBe('');
    const labels = await loadLabels('uk');
    expect(loading('uk', labels)).toBe(labels.common.loading);
    expect(labels.common.loading).not.toBe(defaultLabels.common.loading);
  });

  it('speaks English where the language is not known yet, or is not one of the checkout', () => {
    expect(loading('en')).toBe(defaultLabels.common.loading);
    expect(loading('pl')).toBe(defaultLabels.common.loading);
  });
});
