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

const { MorphText } = await import('@tuwaio/nova-core');
const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { StatusChip } = await import('./StatusChip');
const { StatusHead } = await import('./StatusHead');
const { StatusMark } = await import('./StatusMark');
const { StatusTitle } = await import('./StatusTitle');

type Props = Record<string, unknown>;
const pending = {
  mark: 'waiting',
  tone: 'pending',
  chip: 'Pending',
  title: 'Confirming',
  amount: '89.54 USDC',
} as const;

/** The head as `display` shows it, for a store of its own: status screens of one store go on from one another. */
function head(display: CheckoutContextValue['display'], props: Parameters<typeof StatusHead>[0], store: object = {}) {
  ctx = { ...fixture.checkoutContextValue({}), display, store: store as never };
  return render(StatusHead, props);
}
const texts = (tree: unknown) =>
  (fixture.ofType(tree, MorphText) as ReactElement<{ children: string }>[]).map((text) => text.props.children);

afterEach(() => unmount());

// The mark, the chip, the heading and the amount stood in other places on the confirm step and on its outcomes, and the
// amount was a row of the details in a modal: nothing could go on from one screen into the next
describe('the head of a status screen', () => {
  it('shows the mark, the chip, the heading, the amount and the line under it, in that order', () => {
    const tree = head('inline', { ...pending, note: 'Usually under two minutes on Base.' });
    const parts = fixture.elements(tree).filter((element) => typeof element.type === 'function');
    expect(parts.map((element) => element.type).filter((type) => type !== MorphText)).toEqual([
      StatusMark,
      StatusChip,
      StatusTitle,
    ]);
    expect((fixture.ofType(tree, StatusMark)[0].props as Props).kind).toBe('waiting');
    expect(fixture.ofType(tree, StatusChip)[0].props).toMatchObject({ tone: 'pending', children: 'Pending' });
    expect((fixture.ofType(tree, StatusTitle)[0].props as Props).children).toBe('Confirming');
    expect(texts(tree)).toEqual(['89.54 USDC', 'Usually under two minutes on Base.']);
  });

  it('shows the amount in the same place on every display, large on a page', () => {
    for (const display of ['inline', 'modal', 'page'] as const) {
      const tree = head(display, pending);
      const amount = fixture.elements(tree).find((element) => element.props['aria-label'] === '89.54 USDC');
      expect(amount, display).toBeDefined();
      expect(fixture.hasClass(amount, 'novapay-page-amount'), display).toBe(display === 'page');
      expect((fixture.ofType(tree, StatusMark)[0].props as Props).className, display).toBe(
        display === 'page' ? 'novapay-page-visual' : undefined,
      );
      unmount();
    }
  });

  it('invents no amount and no line for a screen that has none', () => {
    const tree = head('inline', {
      mark: 'expired',
      tone: 'neutral',
      chip: 'Expired',
      title: 'This invoice has expired',
    });
    expect(texts(tree)).toEqual([]);
  });

  it('goes on from the head of the status screen before it: its line and its amount morph into their own', () => {
    const store = {};
    head('inline', { ...pending, note: 'Usually under two minutes on Base.' }, store);
    unmount();

    const paid = {
      mark: 'paid',
      tone: 'success',
      chip: 'Paid',
      title: 'Payment received',
      amount: '89.54 USDC',
    } as const;
    const first = head('inline', { ...paid, note: 'on Base · Oct 8' }, store);
    expect(texts(first)).toEqual(['89.54 USDC', 'Usually under two minutes on Base.']);
    expect(texts(render(StatusHead, { ...paid, note: 'on Base · Oct 8' }))).toEqual(['89.54 USDC', 'on Base · Oct 8']);
  });
});
