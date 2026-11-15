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
  methods: [],
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

  // A page can have a closed window per row of a list, and each would hold an event stream on the server
  it('reads nothing until enabled, and stays once it was', async () => {
    const api = apiFor('t1');
    const Off = (props: { enabled: boolean }) =>
      useCheckoutStore({
        token: 't1',
        api,
        EventSource: null,
        pollMs: 60_000,
        enabled: props.enabled,
      }) as CheckoutStore;
    expect((render(Off, { enabled: false }) as CheckoutStore).getState().phase).toBe('loading');
    render(Off, { enabled: false });
    expect(api.view).not.toHaveBeenCalled();
    render(Off, { enabled: true });
    const store = render(Off, { enabled: true }) as CheckoutStore;
    await vi.waitFor(() => expect(store.getState().phase).toBe('selectMethod'));
    expect(api.view).toHaveBeenCalledOnce();
  });

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

  // Pins a page reads after its first render (from its URL) must reach the store that checks the quotes: a store made
  // before them would check every price without them
  it('makes the store again when the pinned payout addresses change, and not for a new verifier', () => {
    const api = apiFor('t1');
    const Pinned = (props: { addresses?: string[]; verify: () => Promise<boolean> }) =>
      useCheckoutStore({
        token: 't1',
        api,
        EventSource: null,
        pollMs: 60_000,
        payee: { verify: props.verify, addresses: props.addresses },
      }) as CheckoutStore;
    render(Pinned, { verify: async () => true });
    const unpinned = render(Pinned, { verify: async () => true }) as CheckoutStore;
    const destroy = vi.spyOn(unpinned.getState(), 'destroy');
    render(Pinned, { addresses: ['0xA'], verify: async () => true });
    const pinned = render(Pinned, { addresses: ['0xA'], verify: async () => true }) as CheckoutStore;
    expect(destroy).toHaveBeenCalled();
    expect(pinned).not.toBe(unpinned);
    // The same pins in a new array, with a new verifier: the same store
    expect(render(Pinned, { addresses: ['0xA'], verify: async () => false })).toBe(pinned);
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
