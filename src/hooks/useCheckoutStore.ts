import {
  type CheckoutApi,
  type CheckoutState,
  type CheckoutStore,
  createCheckoutStore,
  type EventSourceConstructor,
} from '@tuwaio/quasar-sdk/checkout';
import { useEffect, useEffectEvent, useState } from 'react';
import { useStore } from 'zustand';

const pending = <T>() => new Promise<T>(() => undefined);

/** Calls that never answer: the store shown before the real one exists never reaches the network. */
const IDLE_API: CheckoutApi = {
  view: pending,
  quote: pending,
  buyer: pending,
  locale: pending,
  submit: pending,
  relay: pending,
  permission: pending,
  url: () => '',
};

/** A store in the `loading` phase that is never loaded. */
const IDLE_STORE = createCheckoutStore({ token: 'idle', api: IDLE_API, EventSource: null });

/** What {@link useCheckoutStore} takes. */
export interface UseCheckoutStoreOptions {
  /** The checkout token of the invoice. */
  token: string;
  /** The Quasar API. */
  baseUrl?: string;
  /** Calls to make instead of the HTTP ones, for tests and simulations; read when the store is created. */
  api?: CheckoutApi;
  /** The `EventSource` to follow the invoice with (`null`: read it every `pollMs`); read when the store is created. */
  EventSource?: EventSourceConstructor | null;
  /** How often to read the invoice without an event stream, in milliseconds. */
  pollMs?: number;
}

/**
 * The checkout store of an invoice (`createCheckoutStore` from `@tuwaio/quasar-sdk/checkout`): created and loaded
 * after mount, destroyed on unmount or when `token` or `baseUrl` change. Until then it is a store in the `loading`
 * phase that makes no requests.
 *
 * Side effects: the store reads the checkout and follows the invoice (an `EventSource` on its `events` route, or a
 * request every `pollMs`) until the invoice is final.
 *
 * @param options - See {@link UseCheckoutStoreOptions}.
 * @returns The store.
 */
export function useCheckoutStore(options: UseCheckoutStoreOptions): CheckoutStore {
  const { token, baseUrl, api, EventSource, pollMs } = options;
  const [store, setStore] = useState<CheckoutStore>(IDLE_STORE);
  // The other options are read when the store is created, so a new object in every render recreates nothing
  const create = useEffectEvent(() => createCheckoutStore({ token, baseUrl, api, EventSource, pollMs }));

  useEffect(() => {
    // A new store per mount: a destroyed one no longer follows the invoice (React runs effects twice in StrictMode)
    const created = create();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStore(created);
    void created.getState().load();
    return () => created.getState().destroy();
  }, [token, baseUrl]);

  return store;
}

/**
 * Reads a checkout store and re-renders when the selected part changes (`useStore` of `zustand`).
 *
 * @param store - The store, from {@link useCheckoutStore}.
 * @param selector - What to read.
 * @returns The selected part of the state.
 */
export function useCheckoutState<T>(store: CheckoutStore, selector: (state: CheckoutState) => T): T {
  return useStore(store, selector);
}
