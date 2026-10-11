import type { Transaction } from '@tuwaio/pulsar-core';
import { describe, expect, it, vi } from 'vitest';

import type { PaymentsAdapter, PulsarTransactionParams } from '../adapters/types';
import { defaultLabels } from '../i18n/en';
import { handOverPayment, type SentPayment, shouldHandOver } from './handOver';

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

const setup = () => {
  const adapter: PaymentsAdapter = {
    family: 'eip155',
    getBalance: vi.fn(async () => 0n),
    sendTransfer: vi.fn(async () => '0x'),
    pulsarTransaction: vi.fn((params: PulsarTransactionParams) => params as unknown as Transaction),
  };
  const pulsar = { injectExternalPendingTxs: vi.fn(async () => undefined) };
  return { adapter, pulsar };
};

const context = {
  labels: defaultLabels,
  merchant: 'Acme Labs',
  invoice: { id: 'inv_1', number: 'INV-2026-42' },
  amount: '89.54 USDC',
};

describe('handOverPayment', () => {
  it("gives the app's Pulsar store the payment as a pending transaction, named for its toast", async () => {
    const { adapter, pulsar } = setup();
    await expect(handOverPayment({ adapter, pulsar, payment, ...context })).resolves.toBe(true);
    const params = {
      ...payment,
      title: 'Payment to Acme Labs',
      description: '89.54 USDC · INV-2026-42',
      payload: { quasarInvoice: 'inv_1' },
    };
    expect(adapter.pulsarTransaction).toHaveBeenCalledWith(params);
    expect(pulsar.injectExternalPendingTxs).toHaveBeenCalledWith([params]);
  });

  it("keeps the title and description within Pulsar's limits", async () => {
    const { adapter, pulsar } = setup();
    await handOverPayment({
      adapter,
      pulsar,
      payment,
      ...context,
      merchant: 'A'.repeat(140),
      invoice: { id: 'inv_1', number: null },
    });
    const params = vi.mocked(adapter.pulsarTransaction!).mock.calls[0][0];
    expect(params.title.length).toBe(100);
    expect(params.title.endsWith('…')).toBe(true);
    expect(params.description).toBe('89.54 USDC');
  });

  it('does nothing without a Pulsar store or an adapter that builds its transactions', async () => {
    const { adapter, pulsar } = setup();
    await expect(handOverPayment({ adapter, pulsar: undefined, payment, ...context })).resolves.toBe(false);
    const bare: PaymentsAdapter = { ...adapter, pulsarTransaction: undefined };
    await expect(handOverPayment({ adapter: bare, pulsar, payment, ...context })).resolves.toBe(false);
    expect(pulsar.injectExternalPendingTxs).not.toHaveBeenCalled();
  });
});

describe('shouldHandOver', () => {
  it('hands over a payment Quasar has not settled yet', () => {
    for (const phase of ['submitting', 'confirming', 'awaitingPayment', 'quoting', 'error'] as const) {
      expect(shouldHandOver({ phase, error: null })).toBe(true);
    }
  });

  it('keeps a settled or failed payment', () => {
    for (const phase of ['paid', 'underpaid', 'held', 'refunded', 'expired', 'cancelled', 'blocked'] as const) {
      expect(shouldHandOver({ phase, error: null })).toBe(false);
    }
    expect(
      shouldHandOver({ phase: 'awaitingPayment', error: { code: 'payment_failed', message: 'The payment failed' } }),
    ).toBe(false);
  });
});
