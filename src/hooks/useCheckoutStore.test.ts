import type { CheckoutApi, CheckoutStore, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { useCheckoutStore } = await import('./useCheckoutStore');

const VIEW = {
  merchant: { name: 'Acme', logo: false },
  invoice: { status: 'open', locale: 'en', replacedBy: null },
  quote: null,
  buyer: { required: false },
};

const apiFor = (token: string) =>
  ({
    view: vi.fn().mockResolvedValue({ ...VIEW, invoice: { ...VIEW.invoice, id: token } } as unknown as CheckoutView),
    quote: vi.fn(),
    buyer: vi.fn(),
    locale: vi.fn(),
    submit: vi.fn(),
    relay: vi.fn(),
    permission: vi.fn(),
    url: (route: string) => `sim://${token}/${route}`,
  }) as unknown as CheckoutApi;

/** A component that only calls the hook, returning the store it gives. */
const Probe = (props: { token: string; api: CheckoutApi }) =>
  useCheckoutStore({ token: props.token, api: props.api, EventSource: null, pollMs: 60_000 }) as CheckoutStore;

describe('useCheckoutStore', () => {
  beforeEach(() => unmount());

  it('shows a loading store that makes no request until mounted, then creates and loads the real one', async () => {
    const api = apiFor('t1');
    const idle = render(Probe, { token: 't1', api }) as CheckoutStore;
    expect(idle.getState().phase).toBe('loading');
    expect(api.view).toHaveBeenCalledTimes(1);
    const store = render(Probe, { token: 't1', api }) as CheckoutStore;
    expect(store).not.toBe(idle);
    await vi.waitFor(() => expect(store.getState().phase).toBe('selectMethod'));
    expect(store.getState().logoUrl).toBeNull();
  });

  it('keeps the store while the token stays, and replaces it when the token changes', async () => {
    const first = apiFor('t1');
    render(Probe, { token: 't1', api: first });
    const store = render(Probe, { token: 't1', api: first }) as CheckoutStore;
    // A new api object with the same token creates nothing: options are read when the store is created
    expect(render(Probe, { token: 't1', api: apiFor('t1') })).toBe(store);
    const destroy = vi.spyOn(store.getState(), 'destroy');

    const second = apiFor('t2');
    render(Probe, { token: 't2', api: second });
    const next = render(Probe, { token: 't2', api: second }) as CheckoutStore;
    expect(destroy).toHaveBeenCalled();
    expect(next).not.toBe(store);
    expect(second.view).toHaveBeenCalledTimes(1);
  });

  it('destroys the store on unmount', () => {
    const api = apiFor('t1');
    render(Probe, { token: 't1', api });
    const store = render(Probe, { token: 't1', api }) as CheckoutStore;
    const destroy = vi.spyOn(store.getState(), 'destroy');
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
