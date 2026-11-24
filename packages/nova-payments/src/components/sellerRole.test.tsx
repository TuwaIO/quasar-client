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
const { defaultLabels, loadLabels } = await import('../i18n');
const { CheckoutSummary, CompactSummary, Disclosure, SellerDetailsContent, SellerRole, SummaryFooter } =
  await import('./CheckoutSummary');
const { CheckoutFrame } = await import('./PaymentCheckout');

afterEach(() => unmount());

const ROLE =
  'Cosmos is the seller. Quasar is the payment software: it never holds your funds and is not a party to this purchase.';

const show = (merchant: object = {}, values: object = {}) => {
  ctx = fixture.checkoutContextValue(
    {},
    {
      checkout: {
        ...fixture.checkout,
        merchant: { ...fixture.checkout.merchant, ...merchant },
      } as typeof fixture.checkout,
      ...values,
    },
  );
};

/** What a component element renders: these parts read the context and hold no state. */
const inside = (element: ReactElement<Record<string, unknown>>) =>
  (element.type as (props: unknown) => unknown)(element.props);
/** The order panel: the page has one of its own. */
const panel = (display: 'page' | 'modal') => {
  const tree = render(CheckoutSummary, {});
  return display === 'page' ? inside(tree as ReactElement<Record<string, unknown>>) : tree;
};
/** The elements of a tree that stand outside its disclosures. */
const unfolded = (node: unknown): ReactElement<Record<string, unknown>>[] =>
  fixture
    .elements(node)
    .filter(
      (element) =>
        !fixture
          .ofType(node, Disclosure)
          .some((part) => part !== element && fixture.elements(part.props.children).includes(element)),
    );

// What Quasar is and is not stood behind "Seller details", and "Secured by Quasar" with a lock showed at all times: in a
// dispute a buyer could take Quasar for the guarantor of the purchase or for the one who holds the money
describe('who sells, and what Quasar is', () => {
  it.each(['page', 'modal'] as const)('is said in the order panel without a click: %s', (display) => {
    show({}, { display });
    const footer = unfolded(panel(display)).find((element) => element.type === SummaryFooter)!;
    expect(footer).toBeTruthy();
    expect(fixture.ofType(inside(footer), SellerRole)).toHaveLength(1);
    expect(fixture.text(SellerRole({}))).toBe(ROLE);
  });

  it('is said on a phone without a click, under every step', () => {
    show({}, { display: 'modal' });
    const tree = render(CheckoutFrame, { className: undefined, withDetails: false, leave: null });
    const role = fixture.ofType(tree, SellerRole);
    expect(role).toHaveLength(1);
    // The order panel, which says it too, is hidden on a phone
    expect(
      fixture
        .elements(tree)
        .some(
          (element) =>
            String(element.props.className ?? '').includes('sm:hidden') &&
            fixture.ofType(element.props.children, SellerRole).length > 0,
        ),
    ).toBe(true);
  });

  it('names the seller as the invoice does', () => {
    show({ seller: { legalName: 'Cosmos LLC' } });
    expect(fixture.text(SellerRole({}))).toContain('Cosmos LLC is the seller.');
  });

  it('is said once: the seller details hold what the invoice says of the seller', () => {
    show({ seller: { legalName: 'Cosmos LLC' }, supportEmail: 'help@cosmos.example' });
    const details = SellerDetailsContent({ checkout: ctx.checkout!, labels: defaultLabels });
    expect(fixture.text(details)).toContain('Cosmos LLC');
    expect(fixture.text(details)).not.toContain('payment software');
  });

  // Only what Quasar is stood there for a seller who gave nothing: an empty card would unfold now
  it.each(['page', 'modal'] as const)('offers no seller details of a seller who gave none: %s', (display) => {
    show({}, { display });
    expect(fixture.ofType(panel(display), Disclosure).map((part) => part.props.label)).not.toContain(
      defaultLabels.summary.sellerDetails,
    );
    expect(SellerDetailsContent({ checkout: ctx.checkout!, labels: defaultLabels })).toBeNull();
    unmount();
    show({ links: { terms: 'https://cosmos.example/terms', refundPolicy: null, privacy: null } }, { display });
    expect(fixture.ofType(panel(display), Disclosure).map((part) => part.props.label)).toContain(
      defaultLabels.summary.sellerDetails,
    );
  });

  it('promises no security of the payment', async () => {
    show();
    expect(fixture.text(SummaryFooter())).toContain('Powered by Quasar');
    for (const locale of ['en', 'uk', 'de', 'es', 'it', 'zh-CN']) {
      const { summary } = await loadLabels(locale);
      expect(summary.poweredBy).toContain('Quasar');
      expect(JSON.stringify(summary)).not.toMatch(/Secured|захист|Gesichert|Protegido|Protetto|保障/);
    }
  });

  it('keeps the order of a phone to the lines and the details', () => {
    show({ seller: { legalName: 'Cosmos LLC' } });
    const tree = render(CompactSummary, {});
    expect(fixture.ofType(tree, SellerDetailsContent)).toHaveLength(1);
    expect(fixture.ofType(tree, SellerRole)).toHaveLength(0);
  });
});
