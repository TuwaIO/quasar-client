import type { Transaction } from '@tuwaio/pulsar-core';
import { describe, expect, it, vi } from 'vitest';

import type { PaymentsAdapter, PulsarTransactionParams } from '../adapters/types';
import { defaultLabels } from '../i18n/en';
import { handOverPayment, type SentPayment } from './handOver';

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
      title: 'Transfer to Acme Labs confirmed',
      description: '89.54 USDC · INV-2026-42',
      payload: { quasarInvoice: 'inv_1' },
    };
    expect(adapter.pulsarTransaction).toHaveBeenCalledWith(params);
    expect(pulsar.injectExternalPendingTxs).toHaveBeenCalledWith([
      {
        ...params,
        title: [
          'Sending a transfer to Acme Labs',
          'Transfer to Acme Labs confirmed',
          'Transfer to Acme Labs failed',
          'Transfer to Acme Labs replaced',
        ],
      },
    ]);
  });

  // The owner's pass of the stand: a transfer from a wallet that had not confirmed the invoice went through and paid
  // nothing, and its toast read "Success · Payment to TUWA" beside the page's "Your payment could not be confirmed". The
  // toast names the transfer in each of its states; the page tells what it did to the invoice
  it('names the transfer, not the payment, in each state of its toast, in the language of the checkout', async () => {
    const { ukLabels } = await import('../i18n/uk');
    const { adapter, pulsar } = setup();
    await handOverPayment({ adapter, pulsar, payment, ...context, labels: ukLabels, merchant: 'TUWA' });
    const [[[transaction]]] = vi.mocked(pulsar.injectExternalPendingTxs).mock.calls as unknown as [[[Transaction]]];
    expect(transaction.title).toEqual([
      'Надсилаємо переказ для TUWA',
      'Переказ для TUWA підтверджено',
      'Переказ для TUWA не пройшов',
      'Переказ для TUWA замінено',
    ]);
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
