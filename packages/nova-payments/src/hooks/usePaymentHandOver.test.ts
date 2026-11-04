import type { Transaction } from '@tuwaio/pulsar-core';
import type { CheckoutPhase } from '@tuwaio/quasar-sdk/checkout';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PaymentsAdapter } from '../adapters/types';
import { defaultLabels } from '../i18n/en';
import type { SentPayment } from '../utils/handOver';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { usePaymentHandOver } = await import('./usePaymentHandOver');

const payment: SentPayment = {
  txKey: '0xhash',
  instructions: {
    family: 'eip155',
    chainId: 84532,
    to: '0x2222222222222222222222222222222222222222',
    token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    amount: '89540000',
    decimals: 6,
    symbol: 'USDC',
  },
  account: '0x1111111111111111111111111111111111111111',
  connectorType: 'evm:metamask',
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = (phase: CheckoutPhase = 'confirming') => {
  const state = {
    phase,
    error: null,
    checkout: { merchant: { name: 'Acme Labs' }, invoice: { id: 'inv_1', number: 'INV-2026-42' } },
  };
  const store = { getState: () => state };
  const adapter: PaymentsAdapter = {
    family: 'eip155',
    getBalance: vi.fn(async () => 0n),
    sendTransfer: vi.fn(async () => '0x'),
    pulsarTransaction: vi.fn((params) => params as unknown as Transaction),
  };
  const pulsar = { injectExternalPendingTxs: vi.fn(async () => undefined) };
  const renderHook = (open: boolean) =>
    render(usePaymentHandOver, {
      store: store as never,
      open,
      adapterFor: () => adapter,
      pulsar,
      labels: defaultLabels,
      locale: 'en',
    }) as (payment: SentPayment) => void;
  return { state, pulsar, renderHook };
};

afterEach(unmount);

describe('usePaymentHandOver', () => {
  it('keeps a sent payment while the checkout is open, and hands it to Pulsar when it closes', async () => {
    const { pulsar, renderHook } = setup();
    renderHook(true)(payment);
    await flush();
    expect(pulsar.injectExternalPendingTxs).not.toHaveBeenCalled();
    renderHook(false);
    await flush();
    expect(pulsar.injectExternalPendingTxs).toHaveBeenCalledTimes(1);
    expect(pulsar.injectExternalPendingTxs).toHaveBeenCalledWith([
      expect.objectContaining({
        txKey: '0xhash',
        title: 'Payment to Acme Labs',
        description: '89.54 USDC · INV-2026-42',
      }),
    ]);
    // Opening and closing again does not hand it over twice
    renderHook(true);
    renderHook(false);
    await flush();
    expect(pulsar.injectExternalPendingTxs).toHaveBeenCalledTimes(1);
  });

  it('hands it over when the checkout goes away', async () => {
    const { pulsar, renderHook } = setup();
    renderHook(true)(payment);
    unmount();
    await flush();
    expect(pulsar.injectExternalPendingTxs).toHaveBeenCalledTimes(1);
  });

  it('hands over at once a payment the wallet sends after the checkout closed', async () => {
    const { pulsar, renderHook } = setup();
    renderHook(true);
    const onSent = renderHook(false);
    onSent(payment);
    await flush();
    expect(pulsar.injectExternalPendingTxs).toHaveBeenCalledTimes(1);
  });

  it('keeps a payment Quasar already settled', async () => {
    const { pulsar, renderHook } = setup('paid');
    renderHook(true)(payment);
    renderHook(false);
    await flush();
    expect(pulsar.injectExternalPendingTxs).not.toHaveBeenCalled();
  });
});
