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
const { StatusTitle } = await import('./StatusTitle');

type Props = { children: string; 'aria-label'?: string };
const shownText = (tree: unknown) => (fixture.ofType(tree, MorphText)[0].props as Props).children;

describe('StatusTitle', () => {
  afterEach(() => {
    unmount();
    vi.useRealTimers();
  });

  it('the first status screen starts with its own title', () => {
    ctx = { ...fixture.checkoutContextValue({}), store: { first: true } as never };
    expect(shownText(render(StatusTitle, { children: 'Confirming' }))).toBe('Confirming');
  });

  it('the next one starts from the title before it and morphs on: each screen is a component of its own', () => {
    ctx = { ...fixture.checkoutContextValue({}), store: { next: true } as never };
    render(StatusTitle, { children: 'Confirming' });
    unmount();

    const tree = render(StatusTitle, { children: 'Paid' }) as { props: Props };
    expect(shownText(tree)).toBe('Confirming');
    // A screen reader that gets the focus now hears the real title
    expect(tree.props['aria-label']).toBe('Paid');
    expect(shownText(render(StatusTitle, { children: 'Paid' }))).toBe('Paid');
  });

  it('a title after a pause starts as it is: the buyer went back to pay again', () => {
    vi.useFakeTimers();
    ctx = { ...fixture.checkoutContextValue({}), store: { pause: true } as never };
    render(StatusTitle, { children: 'We could not confirm it' });
    unmount();

    vi.advanceTimersByTime(60_000);
    expect(shownText(render(StatusTitle, { children: 'Confirming' }))).toBe('Confirming');
  });
});
