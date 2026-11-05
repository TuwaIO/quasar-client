import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { Disclosure } = await import('./CheckoutSummary');

type ButtonProps = { onClick: () => void };
const chevronOf = (tree: unknown) => fixture.ofType(tree, ChevronDownIcon)[0].props as { className: string };
const buttonOf = (tree: unknown) =>
  fixture.elements(tree).find((element) => element.type === 'button')!.props as ButtonProps;

describe('the arrow of a part that shows or hides', () => {
  it('points down to a part that opens under it, and up once it is open', () => {
    const props = { label: 'Details', children: 'Body' };
    const closed = render(Disclosure, props);
    expect(chevronOf(closed).className).not.toContain('rotate-180');
    buttonOf(closed).onClick();
    expect(chevronOf(render(Disclosure, props)).className).toContain('rotate-180');
    unmount();
  });

  it('points up to a part that pushes it upwards, as the seller details at the bottom of the panel on the page', () => {
    const props = { label: 'Seller details', children: 'Body', growsUp: true };
    const closed = render(Disclosure, props);
    expect(chevronOf(closed).className).toContain('rotate-180');
    buttonOf(closed).onClick();
    expect(chevronOf(render(Disclosure, props)).className).not.toContain('rotate-180');
    unmount();
  });
});
