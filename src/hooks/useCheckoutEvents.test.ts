import type { CheckoutError, CheckoutQuote, CheckoutState, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { useCheckoutEvents } = await import('./useCheckoutEvents');
type Params = Parameters<typeof useCheckoutEvents>[0];

const view = (status: string) => ({ invoice: { status } }) as unknown as CheckoutView;
const state = (phase: CheckoutState['phase'], extra: Partial<CheckoutState> = {}) =>
  ({ phase, checkout: view('open'), quote: null, error: null, ...extra }) as CheckoutState;
const renderEvents = (params: Params) => render(useCheckoutEvents, params);

afterEach(() => unmount());

describe('useCheckoutEvents', () => {
  it('tells the phase and the invoice status once they are known, and on every change', () => {
    const onStatusChange = vi.fn();
    const handlers = { onStatusChange };
    renderEvents({ state: state('loading', { checkout: null }), screen: 'loading', now: 0, handlers });
    renderEvents({ state: state('selectMethod'), screen: 'method', now: 0, handlers });
    renderEvents({ state: state('selectMethod'), screen: 'method', now: 1000, handlers });
    renderEvents({ state: state('confirming'), screen: 'confirm', now: 2000, handlers });

    expect(onStatusChange.mock.calls.map(([params]) => params)).toEqual([
      { phase: 'loading', status: null, screen: 'loading' },
      { phase: 'selectMethod', status: 'open', screen: 'method' },
      { phase: 'confirming', status: 'open', screen: 'confirm' },
    ]);
  });

  it('tells each new error once', () => {
    const onError = vi.fn();
    const error: CheckoutError = { code: 'payer_blocked', message: 'Blocked' };
    renderEvents({ state: state('selectMethod', { error }), screen: 'method', now: 0, handlers: { onError } });
    renderEvents({ state: state('selectMethod', { error }), screen: 'method', now: 1000, handlers: { onError } });

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith({ error, screen: 'method' });
  });

  it('tells when the price lock runs out and when the invoice expires', () => {
    const onExpire = vi.fn();
    const quote = { expiresAt: new Date(10_000).toISOString() } as CheckoutQuote;
    const handlers = { onExpire };
    renderEvents({ state: state('awaitingPayment', { quote }), screen: 'pay', now: 9_000, handlers });
    renderEvents({ state: state('awaitingPayment', { quote }), screen: 'pay', now: 10_000, handlers });
    renderEvents({ state: state('awaitingPayment', { quote }), screen: 'pay', now: 11_000, handlers });
    renderEvents({
      state: state('expired', { checkout: view('expired') }),
      screen: 'expired',
      now: 12_000,
      handlers,
    });

    expect(onExpire.mock.calls.map(([params]) => params)).toEqual([
      { kind: 'quote', paymentOnTheWay: false },
      { kind: 'invoice', paymentOnTheWay: false },
    ]);
  });

  // Owner, 2026-10-28: Quasar keeps an invoice open while a payment sent before the deadline confirms, and the invoice
  // may still close meanwhile: the app hears that a payment is on its way, so it does not offer a new invoice at once
  it('tells that the invoice expired while a payment of this page is on its way', () => {
    const onExpire = vi.fn();
    const handlers = { onExpire };
    const sending = { txKey: null, paymentOnTheWay: true } as unknown as Partial<CheckoutState>;
    renderEvents({ state: state('confirming', sending), screen: 'confirm', now: 0, handlers });
    renderEvents({
      state: state('expired', { ...sending, checkout: view('expired') }),
      screen: 'expired',
      now: 1000,
      handlers,
    });

    expect(onExpire).toHaveBeenCalledExactlyOnceWith({ kind: 'invoice', paymentOnTheWay: true });
  });

  // M3: a reopened page whose invoice expires while a payment of it, handed over before the reload, is on its way
  it('tells that a payment of the invoice that the store found on its way may still arrive', () => {
    const onExpire = vi.fn();
    const handlers = { onExpire };
    const found = {
      txKey: null,
      paymentOnTheWay: false,
      invoicePaymentOnTheWay: true,
    } as unknown as Partial<CheckoutState>;
    renderEvents({ state: state('confirming', found), screen: 'confirm', now: 0, handlers });
    renderEvents({
      state: state('expired', { ...found, checkout: view('expired') }),
      screen: 'expired',
      now: 0,
      handlers,
    });

    expect(onExpire).toHaveBeenCalledExactlyOnceWith({ kind: 'invoice', paymentOnTheWay: true });
  });
});
