import type { Transaction, UpdatableTransactionFields } from '@tuwaio/pulsar-core';
import type { CheckoutState } from '@tuwaio/quasar-sdk/checkout';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

import type { PaymentsAdapter } from '../adapters/types';
import { defaultLabels } from '../i18n/en';
import type { SentPayment } from '../utils/handOver';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { usePaymentHandOver } = await import('./usePaymentHandOver');

const instructions = {
  family: 'eip155' as const,
  chainId: 84532,
  to: '0x2222222222222222222222222222222222222222',
  token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  amount: '89540000',
  decimals: 6,
  symbol: 'USDC',
};
const payment: SentPayment = {
  txKey: '0xhash',
  instructions,
  account: '0x1111111111111111111111111111111111111111',
  connectorType: 'evm:metamask',
};
const PAYER = '0x3333333333333333333333333333333333333333';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The part of the checkout store the hook reads, as a real Zustand store. */
interface State {
  invoiceStatus: CheckoutState['invoiceStatus'];
  txHash: string | null;
  quote: { instructions: typeof instructions; payer: string | null } | null;
  checkout: {
    merchant: { name: string };
    invoice: {
      id: string;
      number: string | null;
      originWallet: string | null;
      payments?: object[];
      rejectedPayments?: object[];
    };
  } | null;
}

const setup = (initial: Partial<State> = {}) => {
  const store = createStore<State>(() => ({
    invoiceStatus: 'open',
    txHash: null,
    quote: { instructions, payer: null },
    checkout: {
      merchant: { name: 'Acme Labs' },
      invoice: { id: 'inv_1', number: 'INV-2026-42', originWallet: null },
    },
    ...initial,
  }));
  const adapter: PaymentsAdapter = {
    family: 'eip155',
    getBalance: vi.fn(async () => 0n),
    sendTransfer: vi.fn(async () => '0x'),
    pulsarTransaction: vi.fn((params) => params as unknown as Transaction),
  };
  const pulsar = {
    injectExternalPendingTxs: vi.fn<(transactions: Transaction[]) => Promise<void>>(async () => undefined),
    updateTxParams: vi.fn<(txKey: string, fields: UpdatableTransactionFields) => void>(),
  };
  const renderHook = (withPulsar = true) =>
    render(usePaymentHandOver, {
      store: store as never,
      adapterFor: () => adapter,
      pulsar: withPulsar ? pulsar : undefined,
      labels: defaultLabels,
      locale: 'en',
    }) as (payment: SentPayment) => void;
  const injected = () => pulsar.injectExternalPendingTxs.mock.calls.flatMap(([txs]) => txs as unknown as SentPayment[]);
  return { store, pulsar, renderHook, injected };
};

afterEach(unmount);

// Owner test 2026-11-09, finding 3: no Pulsar toast for any crypto payment. A payment went to Pulsar only when the
// checkout closed before Quasar settled it, and a QR payment never did
describe('usePaymentHandOver', () => {
  it('hands a payment to Pulsar as soon as the wallet sends it, with the checkout open', async () => {
    const { renderHook, injected } = setup();
    renderHook()(payment);
    await flush();
    expect(injected()).toEqual([
      expect.objectContaining({
        txKey: '0xhash',
        account: payment.account,
        // The transfer in each state of its toast, not "Payment to": it may go through and pay nothing
        title: [
          'Sending a transfer to Acme Labs',
          'Transfer to Acme Labs confirmed',
          'Transfer to Acme Labs failed',
          'Transfer to Acme Labs replaced',
        ],
        description: '89.54 USDC · INV-2026-42',
      }),
    ]);
  });

  it('hands the same payment over once', async () => {
    const { renderHook, injected } = setup();
    const onSent = renderHook();
    onSent(payment);
    onSent(payment);
    await flush();
    expect(injected()).toHaveLength(1);
  });

  it('hands over a payment Quasar found that the page did not send, a QR one, with its hash once Quasar records it', async () => {
    const { store, renderHook, injected } = setup();
    renderHook();
    store.setState({ invoiceStatus: 'processing' });
    expect(injected()).toEqual([]);
    const checkout = store.getState().checkout!;
    store.setState({
      invoiceStatus: 'paid',
      txHash: '5sigOfThePayment',
      checkout: { ...checkout, invoice: { ...checkout.invoice, originWallet: PAYER } },
    });
    await flush();
    expect(injected()).toEqual([
      expect.objectContaining({ txKey: '5sigOfThePayment', account: PAYER, instructions, connectorType: '' }),
    ]);
  });

  it('hands over each part of an invoice paid in parts', async () => {
    const { store, renderHook, injected } = setup();
    renderHook();
    store.setState({ invoiceStatus: 'underpaid', txHash: '0xpart1' });
    store.setState({ invoiceStatus: 'paid', txHash: '0xpart2' });
    await flush();
    expect(injected().map((tx) => tx.txKey)).toEqual(['0xpart1', '0xpart2']);
  });

  it('hands over nothing for an invoice paid before the page opened it', async () => {
    const { store, renderHook, injected } = setup({ invoiceStatus: null, checkout: null });
    renderHook();
    store.setState({
      invoiceStatus: 'paid',
      txHash: '0xold',
      checkout: {
        merchant: { name: 'Acme Labs' },
        invoice: { id: 'inv_1', number: 'INV-2026-42', originWallet: PAYER },
      },
    });
    await flush();
    expect(injected()).toEqual([]);
  });

  // A speed-up in the wallet gives the payment a new hash: Pulsar's own tracker follows the replacement
  it('leaves the new hash of a payment this page sent to the tracker that follows it', async () => {
    const { store, renderHook, injected } = setup();
    renderHook()(payment);
    store.setState({ invoiceStatus: 'paid', txHash: '0xspedUp' });
    await flush();
    expect(injected().map((tx) => tx.txKey)).toEqual(['0xhash']);
  });

  it('hands nothing over without a Pulsar store', async () => {
    const { store, pulsar, renderHook } = setup();
    renderHook(false)(payment);
    store.setState({ invoiceStatus: 'paid', txHash: '0xother' });
    await flush();
    expect(pulsar.injectExternalPendingTxs).not.toHaveBeenCalled();
  });

  // The page's nodes may not answer: its toast went on spinning beside "Payment received", with a speed-up to press
  it('ends the transactions of the payments whose end Quasar knows, when it tells and once they are in the pool', async () => {
    const { store, pulsar, renderHook } = setup();
    const onSent = renderHook();
    expect(pulsar.updateTxParams).not.toHaveBeenCalled();
    const checkout = store.getState().checkout!;
    store.setState({
      checkout: { ...checkout, invoice: { ...checkout.invoice, payments: [{ txKey: '0xhash', at: '' }] } },
    });
    expect(pulsar.updateTxParams.mock.calls).toEqual([['0xhash', expect.objectContaining({ status: 'Success' })]]);

    // A payment Quasar settled before it reached the pool, as one it found itself does
    pulsar.updateTxParams.mockClear();
    onSent(payment);
    await flush();
    expect(pulsar.injectExternalPendingTxs).toHaveBeenCalledTimes(1);
    expect(pulsar.updateTxParams).toHaveBeenCalledWith('0xhash', expect.objectContaining({ status: 'Success' }));
    expect(pulsar.updateTxParams.mock.invocationCallOrder[0]).toBeGreaterThan(
      pulsar.injectExternalPendingTxs.mock.invocationCallOrder[0],
    );
  });

  it('ends those of a page opened again, and follows nothing once it is gone', () => {
    const { store, pulsar, renderHook } = setup();
    const checkout = store.getState().checkout!;
    const rejectedPayments = [{ txKey: '0xcancelled', reason: 'cancelled', final: true }];
    store.setState({ checkout: { ...checkout, invoice: { ...checkout.invoice, rejectedPayments } } });
    renderHook();
    expect(pulsar.updateTxParams.mock.calls).toEqual([
      ['0xcancelled', expect.objectContaining({ status: 'Replaced', replacedReason: 'cancelled' })],
    ]);
    unmount();
    pulsar.updateTxParams.mockClear();
    store.setState({
      checkout: { ...checkout, invoice: { ...checkout.invoice, rejectedPayments: [...rejectedPayments] } },
    });
    expect(pulsar.updateTxParams).not.toHaveBeenCalled();
  });

  it('ends nothing with a store that gives only what the checkout needed before', () => {
    const { store, pulsar, renderHook } = setup();
    delete (pulsar as { updateTxParams?: unknown }).updateTxParams;
    renderHook();
    const checkout = store.getState().checkout!;
    expect(() =>
      store.setState({
        checkout: { ...checkout, invoice: { ...checkout.invoice, payments: [{ txKey: '0xhash', at: '' }] } },
      }),
    ).not.toThrow();
  });
});
