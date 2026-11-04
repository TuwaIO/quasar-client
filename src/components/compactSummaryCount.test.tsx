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
const { loadLabels } = await import('../i18n');
const { CompactSummary } = await import('./CheckoutSummary');

const line = { name: 'Hoodie', quantity: '1', unitMinor: '100', netMinor: '100', taxRate: '0' };

/** The label of the order's disclosure on a phone, for an invoice with `count` lines. */
async function compactLabel(locale: string, count: number) {
  const checkout = {
    ...fixture.checkout,
    invoice: { ...fixture.checkout.invoice, lineItems: Array.from({ length: count }, () => line) },
  } as unknown as typeof fixture.checkout;
  ctx = fixture.checkoutContextValue({}, { checkout, locale, labels: await loadLabels(locale) });
  const labels = fixture
    .elements(render(CompactSummary, {}))
    .map((element) => element.props.label)
    .filter((label): label is string => typeof label === 'string');
  return labels[0];
}

afterEach(() => unmount());

describe('the compact order on a phone', () => {
  it('counts one line in the singular and more in the plural', async () => {
    expect(await compactLabel('en', 1)).toMatch(/^1 item · incl\. VAT/);
    expect(await compactLabel('en', 2)).toMatch(/^2 items · incl\. VAT/);
    expect(await compactLabel('es', 1)).toMatch(/^1 artículo · /);
    expect(await compactLabel('it', 1)).toMatch(/^1 articolo · /);
    expect(await compactLabel('uk', 1)).toMatch(/^1 позиція · /);
    expect(await compactLabel('de', 1)).toMatch(/^1 Position · /);
    expect(await compactLabel('zh-CN', 1)).toMatch(/^1 件商品 · /);
  });
});
