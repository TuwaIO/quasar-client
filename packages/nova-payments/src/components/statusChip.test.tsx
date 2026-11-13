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
const { chipTone } = await import('./classes');
const { StatusChip } = await import('./StatusChip');

type Chip = ReactElement<{ className: string }>;
const wordOf = (tree: unknown) => (fixture.ofType(tree, MorphText)[0].props as { children: string }).children;
const hasTone = (tree: unknown, tone: keyof typeof chipTone) =>
  chipTone[tone].split(' ').every((name) => (tree as Chip).props.className.split(' ').includes(name));

afterEach(() => unmount());

describe('StatusChip', () => {
  it('names the state in its color: a wait, a success, a failure, or neither', () => {
    for (const tone of ['pending', 'success', 'error', 'neutral'] as const) {
      ctx = { ...fixture.checkoutContextValue({}), store: { tone } as never };
      const tree = render(StatusChip, { tone, children: 'State' });
      expect(hasTone(tree, tone), tone).toBe(true);
      expect(wordOf(tree)).toBe('State');
      unmount();
    }
  });

  it('goes on from the chip of the status screen before it, then turns into its own', () => {
    ctx = { ...fixture.checkoutContextValue({}), store: { next: true } as never };
    render(StatusChip, { tone: 'pending', children: 'Pending' });
    unmount();

    const first = render(StatusChip, { tone: 'success', children: 'Paid' });
    expect(wordOf(first)).toBe('Pending');
    expect(hasTone(first, 'pending')).toBe(true);
    const then = render(StatusChip, { tone: 'success', children: 'Paid' });
    expect(wordOf(then)).toBe('Paid');
    expect(hasTone(then, 'success')).toBe(true);
    // Its color changes over a moment, and at once for a reader who asks for less motion
    expect((then as Chip).props.className).toContain('novapay:transition-colors');
    expect((then as Chip).props.className).toContain('novapay:motion-reduce:transition-none');
  });

  it('takes the classes of `classNames.statusChip` with the state it shows', () => {
    ctx = {
      ...fixture.checkoutContextValue({ classNames: { statusChip: ({ tone }) => `brand-chip-${tone}` } }),
      store: { styled: true } as never,
    };
    expect((render(StatusChip, { tone: 'error', children: 'Failed' }) as Chip).props.className).toContain(
      'brand-chip-error',
    );
  });
});
