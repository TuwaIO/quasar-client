import type { CheckoutState } from '@tuwaio/quasar-sdk/checkout';
import { useEffect, useEffectEvent, useRef } from 'react';

import type { PaymentCheckoutHandlers } from '../components/customization';
import type { CheckoutScreen } from '../utils/checkout';

/** Parameters of {@link useCheckoutEvents}. */
export interface UseCheckoutEventsParams {
  /** The state of the checkout store. */
  state: CheckoutState;
  /** The screen shown. */
  screen: CheckoutScreen;
  /** `Date.now()` of the latest second tick of the checkout. */
  now: number;
  /** The handlers of `customization.handlers` of `PaymentCheckout`. */
  handlers?: PaymentCheckoutHandlers;
}

/**
 * Tells the app what happened in a checkout through its handlers: `onStatusChange` with the first phase and invoice
 * status and on every change, `onError` once per new error, and `onExpire` when the locked price runs out (at the
 * tick that crosses its end) and when the invoice expires. Handlers that change between renders are called in their
 * latest version.
 *
 * @param params - See {@link UseCheckoutEventsParams}.
 */
export function useCheckoutEvents({ state, screen, now, handlers }: UseCheckoutEventsParams): void {
  const status = state.checkout?.invoice.status ?? null;
  const { phase, error } = state;
  const expiresAt = state.quote?.expiresAt ? Date.parse(state.quote.expiresAt) : null;
  const quoteExpired = expiresAt !== null && now >= expiresAt;

  const statusChanged = useEffectEvent(() => handlers?.onStatusChange?.({ phase, status, screen }));
  useEffect(() => statusChanged(), [phase, status]);

  const errorRaised = useEffectEvent(() => {
    if (error) handlers?.onError?.({ error, screen });
  });
  useEffect(() => errorRaised(), [error]);

  // Edges only: an expiry already passed when the checkout opened is not told again on every tick
  const expired = useRef({ quote: false, invoice: false });
  const expire = useEffectEvent((kind: 'quote' | 'invoice') => handlers?.onExpire?.({ kind }));
  useEffect(() => {
    if (quoteExpired && !expired.current.quote) expire('quote');
    expired.current.quote = quoteExpired;
  }, [quoteExpired]);
  useEffect(() => {
    const invoiceExpired = status === 'expired';
    if (invoiceExpired && !expired.current.invoice) expire('invoice');
    expired.current.invoice = invoiceExpired;
  }, [status]);
}
