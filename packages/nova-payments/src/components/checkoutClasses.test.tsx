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
const { CheckoutFrame } = await import('./PaymentCheckout');
const { CheckoutHeader, MobileSteps } = await import('./CheckoutHeader');
const { CheckoutSummary, OrderLines, OrderTotal, CompactSummary } = await import('./CheckoutSummary');
const { DetailRow, GroupLabel, ScreenContent, ScreenFooter } = await import('./ScreenParts');
const { MethodScreen } = await import('./MethodScreen');
const { ConfirmScreen } = await import('./ConfirmScreen');
const { PaidScreen } = await import('./PaidScreen');
const { QrScreen } = await import('./QrScreen');
const { BuyerScreen } = await import('./BuyerScreen');
const { OutcomeScreen } = await import('./OutcomeScreen');
const { WalletPrompt } = await import('./WalletPrompt');

/** Every class string of a part: the modal and the inline checkout must keep theirs when the page changes. */
function classesOf(tree: unknown) {
  return fixture
    .elements(tree)
    .map((element) => (element as ReactElement<{ className?: string }>).props.className)
    .filter((name): name is string => typeof name === 'string');
}

const PARTS: [string, (...args: never[]) => unknown, Record<string, unknown>][] = [
  ['frame', CheckoutFrame, { leave: null }],
  ['header', CheckoutHeader, {}],
  ['mobile steps', MobileSteps, {}],
  ['summary', CheckoutSummary, {}],
  ['compact summary', CompactSummary, {}],
  ['order lines', OrderLines, {}],
  ['order total', OrderTotal, {}],
  ['screen', ScreenContent, { title: 'Title', subtitle: 'Subtitle', children: 'Body' }],
  ['footer', ScreenFooter, { children: 'Button' }],
  ['group', GroupLabel, { children: 'Group' }],
  ['row', DetailRow, { name: 'Name', children: 'Value' }],
  ['method', MethodScreen, {}],
  ['confirm', ConfirmScreen, {}],
  ['paid', PaidScreen, {}],
  ['qr', QrScreen, {}],
  ['buyer', BuyerScreen, {}],
  ['outcome', OutcomeScreen, { kind: 'expired' }],
  ['prompt', WalletPrompt, { title: 'Title', text: 'Text', stepHeight: 400 }],
];

afterEach(() => unmount());

// Only `display="page"` changes: a modal or an inline checkout an app already shows must not move by a class
describe.each(['modal', 'inline'] as const)('the classes of the %s checkout', (display) => {
  it.each(PARTS)('%s', (_name, part, props) => {
    const checkout = {
      ...fixture.checkout,
      buyer: { collect: 'full', buyer: null },
    } as unknown as typeof fixture.checkout;
    ctx = fixture.checkoutContextValue({}, { display, ...(part === BuyerScreen ? { checkout } : {}) });
    const classes = classesOf(render(part as never, props as never));
    expect(classes).toMatchSnapshot();
    expect(classes.join(' ')).not.toContain('novapay-page');
  });
});
