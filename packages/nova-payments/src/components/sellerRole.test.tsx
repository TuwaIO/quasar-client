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
const { CHECKOUT_LOCALES, defaultLabels, loadLabels } = await import('../i18n');
const { CheckoutSummary, CompactSummary, Disclosure, SellerDetailsContent, SellerRole, SummaryFooter } =
  await import('./CheckoutSummary');
const { CheckoutFrame } = await import('./PaymentCheckout');

afterEach(() => unmount());

const ROLE =
  'Cosmos is the seller. Quasar is the payment software: it never holds your funds and is not a party to this purchase.';

const show = (merchant: object = {}, values: object = {}, customization: object = {}) => {
  ctx = fixture.checkoutContextValue(customization as CheckoutContextValue['customization'], {
    checkout: {
      ...fixture.checkout,
      merchant: { ...fixture.checkout.merchant, ...merchant },
    } as typeof fixture.checkout,
    ...values,
  });
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

/** The frame of the checkout as a page or a dialog draws it, with the parts it draws itself. */
const frame = () => render(CheckoutFrame, { className: undefined, withDetails: false, leave: null });
/** Whether a part of the tree that holds the line is hidden on some width. */
const hiddenOnSomeWidth = (tree: unknown) =>
  fixture
    .elements(tree)
    .some(
      (element) =>
        /(^|\s)novapay:(sm:|md:|lg:)?hidden(\s|$)/.test(String(element.props.className ?? '')) &&
        fixture.ofType(element.props.children, SellerRole).length > 0,
    );

// What Quasar is and is not stood behind "Seller details", and "Secured by Quasar" with a lock showed at all times: in a
// dispute a buyer could take Quasar for the guarantor of the purchase or for the one who holds the money. A page that
// embeds the checkout could also take the line away with its labels or with an order panel of its own: the frame draws
// it under every step, from a text of the package that no label replaces
describe('who sells, and what Quasar is', () => {
  it.each(['page', 'modal'] as const)('is said under every step on every width, without a click: %s', (display) => {
    show({}, { display });
    const tree = frame();
    expect(fixture.ofType(tree, SellerRole)).toHaveLength(1);
    expect(hiddenOnSomeWidth(tree)).toBe(false);
    expect(fixture.text(SellerRole({}))).toBe(ROLE);
  });

  it('stays where the page replaces the order panel, the header, the summary of a phone and the screens', () => {
    const Replaced = () => null;
    show(
      {},
      { display: 'modal' },
      { components: { Summary: Replaced, Header: Replaced, CompactSummary: Replaced, screens: { pay: Replaced } } },
    );
    const tree = frame();
    expect(fixture.ofType(tree, SellerRole)).toHaveLength(1);
    expect(hiddenOnSomeWidth(tree)).toBe(false);
  });

  it('is no label: what the page does to the labels leaves it as it is', () => {
    show();
    ctx = {
      ...ctx,
      labels: {
        ...ctx.labels,
        summary: { ...ctx.labels.summary, poweredBy: 'Powered by us', sellerRole: 'We are the seller and the bank.' },
      } as typeof ctx.labels,
    };
    expect(fixture.text(SellerRole({}))).toBe(ROLE);
    expect(Object.keys(defaultLabels.summary)).not.toContain('sellerRole');
  });

  it('speaks the language of the checkout, and English for a language the package does not have', async () => {
    const said = new Set<string>();
    for (const { code } of CHECKOUT_LOCALES) {
      show({}, { locale: code });
      const text = fixture.text(SellerRole({}));
      expect(text, code).toContain('Cosmos');
      expect(text, code).toContain('Quasar');
      said.add(text);
      expect(Object.keys((await loadLabels(code)).summary), code).not.toContain('sellerRole');
    }
    expect(said.size).toBe(CHECKOUT_LOCALES.length);
    show({}, { locale: 'pt-BR' });
    expect(fixture.text(SellerRole({}))).toBe(ROLE);
    show({}, { locale: 'zh-CN' });
    expect(fixture.text(SellerRole({}))).toBe(
      'Cosmos 是卖方。Quasar 是付款软件：它从不持有您的资金，也不是此次购买的一方。',
    );
  });

  it('names the seller as the invoice does', () => {
    show({ seller: { legalName: 'Cosmos LLC' } });
    expect(fixture.text(SellerRole({}))).toContain('Cosmos LLC is the seller.');
  });

  it('is said once: the seller details hold what the invoice says of the seller, the order panel the rest', () => {
    show({ seller: { legalName: 'Cosmos LLC' }, supportEmail: 'help@cosmos.example' });
    const details = SellerDetailsContent({ checkout: ctx.checkout!, labels: defaultLabels });
    expect(fixture.text(details)).toContain('Cosmos LLC');
    expect(fixture.text(details)).not.toContain('payment software');
    for (const display of ['page', 'modal'] as const) {
      show({}, { display });
      const footer = unfolded(panel(display)).find((element) => element.type === SummaryFooter)!;
      expect(footer).toBeTruthy();
      expect(fixture.ofType(inside(footer), SellerRole)).toHaveLength(0);
    }
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
