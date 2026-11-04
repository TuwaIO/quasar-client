import type { CheckoutPhase, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

/**
 * Tells the app once that the invoice is paid, when the checkout reaches the paid outcome.
 *
 * @param phase - Where the payment stands.
 * @param invoice - The invoice of the checkout.
 * @param onPaid - The app's callback, if any.
 */
export function usePaidCallback(
  phase: CheckoutPhase,
  invoice: CheckoutView['invoice'] | undefined,
  onPaid: ((invoice: CheckoutView['invoice']) => void) | undefined,
): void {
  const notified = useRef(false);
  const notify = useEffectEvent(() => {
    if (invoice) onPaid?.(invoice);
  });
  useEffect(() => {
    if (phase !== 'paid' || notified.current) return;
    notified.current = true;
    notify();
  }, [phase]);
}

/** What {@link useAutoReturn} needs. */
export interface UseAutoReturnParams {
  /** Where to send the buyer (the invoice's `successUrl`); `null` for no return. */
  url: string | null;
  /** Seconds before the return; `0` for no automatic return. */
  seconds: number;
  /** `Date.now()` of the latest second tick of the checkout. */
  now: number;
  /**
   * Sends the buyer to the link (default: `window.location.assign`).
   *
   * @param url - The link.
   */
  navigate?: (url: string) => void;
}

/**
 * The visible countdown before the paid outcome sends the buyer back to the seller, with "Stay here" (WCAG 2.2.1).
 *
 * Side effects: navigates the page when the countdown ends.
 *
 * @param params - See {@link UseAutoReturnParams}.
 * @returns `left`: seconds before the return (`null` when there is none); `stay`: stops it.
 */
export function useAutoReturn({
  url,
  seconds,
  now,
  navigate = (target) => window.location.assign(target),
}: UseAutoReturnParams): { left: number | null; stay: () => void } {
  const [startedAt] = useState(now);
  const [stayed, setStayed] = useState(false);
  const left = url && seconds > 0 && !stayed ? Math.max(0, seconds - Math.floor((now - startedAt) / 1000)) : null;
  const leave = useEffectEvent(() => {
    if (url) navigate(url);
  });
  useEffect(() => {
    if (left === 0) leave();
  }, [left]);
  return { left, stay: () => setStayed(true) };
}
