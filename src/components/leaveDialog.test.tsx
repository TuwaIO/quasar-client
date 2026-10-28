import { Dialog, DialogContent } from '@tuwaio/nova-core';
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
const { PrimaryButton, SecondaryButton } = await import('./ScreenParts');
const { LeaveDialog } = await import('./LeaveDialog');

type Props = Record<string, unknown>;

function question() {
  ctx = fixture.checkoutContextValue({});
  const onStay = vi.fn();
  const onLeave = vi.fn();
  const tree = render(LeaveDialog, { onStay, onLeave });
  return { tree, onStay, onLeave };
}

afterEach(() => unmount());

// Owner, 2026-10-28: the question showed inside the checkout modal, so the checkout's frame stayed sharp around the
// blurred checkout. It is a Nova dialog of its own now: one backdrop over the whole screen, the checkout under it
describe('the question to leave the checkout', () => {
  it('is a dialog of its own, open, over the checkout and its frame', () => {
    const { tree } = question();
    const dialog =
      (tree as ReactElement<Props>).type === Dialog ? (tree as ReactElement<Props>) : fixture.ofType(tree, Dialog)[0];
    expect(dialog?.props.open).toBe(true);
    const content = fixture.ofType(tree, DialogContent)[0] as ReactElement<Props>;
    expect(content.props.role).toBe('alertdialog');
    // Nothing is drawn over the checkout from inside it any more
    expect(fixture.hasClass(tree, 'novapay:absolute')).toBe(false);
  });

  it('stays on Escape or a click outside, and leaves only on Leave', () => {
    const { tree, onStay, onLeave } = question();
    const dialog = (
      (tree as ReactElement<Props>).type === Dialog ? tree : fixture.ofType(tree, Dialog)[0]
    ) as ReactElement<{ onOpenChange: (open: boolean) => void }>;
    dialog.props.onOpenChange(false);
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
    (fixture.ofType(tree, SecondaryButton)[0] as ReactElement<{ onClick: () => void }>).props.onClick();
    expect(onLeave).toHaveBeenCalledTimes(1);
    (fixture.ofType(tree, PrimaryButton)[0] as ReactElement<{ onClick: () => void }>).props.onClick();
    expect(onStay).toHaveBeenCalledTimes(2);
  });

  it('gives the focus to its heading when it opens', () => {
    const { tree } = question();
    const content = fixture.ofType(tree, DialogContent)[0] as ReactElement<{
      onOpenAutoFocus: (event: { preventDefault: () => void }) => void;
    }>;
    const preventDefault = vi.fn();
    content.props.onOpenAutoFocus({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
  });
});
