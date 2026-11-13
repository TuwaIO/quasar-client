import { HashLink } from '@tuwaio/nova-transactions';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutContextValue } from './checkoutContext';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

let ctx: CheckoutContextValue | null;
vi.mock('../hooks/useCheckoutContext', () => ({
  useCheckoutContext: () => ctx,
  useOptionalCheckoutContext: () => ctx,
}));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { FailedTransaction } = await import('./ScreenParts');

type Props = Record<string, unknown>;
const TX = '0x9a3f000000000000000000000000000000000000000000000000000000004be2';
const QUOTE = { instructions: { family: 'eip155', chainId: 8453, to: '0x2222', amount: '1' } };
const explorerUrl = vi.fn(
  ({ chainId, txKey }: { chainId: string; txKey: string }) => `https://scan/${chainId}/${txKey}`,
);

/** The row a pay or method step draws for the store's error, with or without a locked price. */
function row(error: Props | null, quote: unknown = QUOTE) {
  const state = { ...fixture.checkoutContextValue({}).state, quote };
  ctx = fixture.checkoutContextValue(
    {},
    { state: state as never, adapterFor: () => ({ family: 'eip155', explorerUrl }) as never },
  );
  const tree = render(FailedTransaction, { error: error as never });
  return fixture.ofType(tree, HashLink)[0] as ReactElement<Props> | undefined;
}

afterEach(() => {
  unmount();
  explorerUrl.mockClear();
});

// The page said that a transaction did not pay the invoice, or that it failed, and showed nothing to look at
describe('the transaction of a failed payment under what the screen says of it', () => {
  it('is linked to the explorer of the network of the locked price', () => {
    const link = row({ code: 'payment_mismatch', message: '', reason: 'no_matching_transfer', txKey: TX });
    expect(link?.props).toMatchObject({ hash: TX, explorerUrl: `https://scan/eip155:8453/${TX}`, variant: 'compact' });
    expect(explorerUrl).toHaveBeenCalledWith({ chainId: 'eip155:8453', txKey: TX });
  });

  it('shows its hash without a link when no price is locked: the page does not know its network', () => {
    const link = row({ code: 'payment_failed', message: '', reason: 'reverted', txKey: TX }, null);
    expect(link?.props).toMatchObject({ hash: TX, explorerUrl: undefined });
    expect(explorerUrl).not.toHaveBeenCalled();
  });

  it('is not shown for an error that names no transaction, for another error, or outside a checkout', () => {
    expect(row({ code: 'payment_failed', message: '', reason: 'expired' })).toBeUndefined();
    expect(row({ code: 'request_failed', message: '', txKey: TX })).toBeUndefined();
    expect(row(null)).toBeUndefined();
    ctx = null;
    expect(
      render(FailedTransaction, { error: { code: 'payment_failed', message: '', txKey: TX } as never }),
    ).toBeNull();
  });
});
