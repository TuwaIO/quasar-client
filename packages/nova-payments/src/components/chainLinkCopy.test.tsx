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
const Provider = vi.fn();
vi.mock('@tuwaio/nova-transactions/providers', () => ({
  NovaTransactionsLabelsProvider: Provider,
  useLabels: () => ({ stepper: {}, statuses: {}, actions: {}, txError: {} }),
}));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { ChainLink } = await import('./ScreenParts');
const { TxLabels } = await import('./TxLabels');
const { CHECKOUT_LOCALES, defaultLabels, loadLabels } = await import('../i18n');

/** What the copy button of the link is called. */
function copyName(props: Parameters<typeof ChainLink>[0]) {
  ctx = fixture.checkoutContextValue({});
  const link = fixture.ofType(render(ChainLink, props), TxLabels)[0];
  unmount();
  const provider = fixture.ofType(render(TxLabels, link.props as never), Provider)[0];
  return (provider.props.labels as { actions: { copy: string } }).actions.copy;
}

afterEach(() => unmount());

// The copy button of the seller's address said "Copy the transaction hash" to a screen reader
describe('the copy button of an address and of a transaction', () => {
  it('is named after what it copies', () => {
    expect(copyName({ hash: '0xb8d9', chainId: 'eip155:8453' })).toBe(defaultLabels.pay.copyAddress);
    // The wallet that paid, its network unknown
    expect(copyName({ hash: '0xb8d9', chainId: null })).toBe(defaultLabels.pay.copyAddress);
    // The refund window has the link of the address, not its network
    expect(copyName({ hash: '0xb8d9', explorerUrl: 'https://x', labels: defaultLabels, address: true })).toBe(
      defaultLabels.pay.copyAddress,
    );
    expect(copyName({ hash: '0x55', explorerUrl: 'https://x', labels: defaultLabels })).toBe(
      defaultLabels.confirm.copyHash,
    );
  });

  it('has a name of its own in every language', async () => {
    for (const { code } of CHECKOUT_LOCALES) {
      const labels = await loadLabels(code);
      expect(labels.pay.copyAddress, code).not.toBe(labels.confirm.copyHash);
      if (code !== 'en') expect(labels.pay.copyAddress, code).not.toBe(defaultLabels.pay.copyAddress);
    }
  });
});
