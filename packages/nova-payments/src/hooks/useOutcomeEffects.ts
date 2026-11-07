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
  openedPaid = false,
): void {
  // Per invoice: one window can show another invoice later, and it is paid in its own time
  const notified = useRef<string | null>(null);
  const invoiceId = invoice?.id ?? null;
  // The event comes before the read of the invoice: the status is the one the event gave, not the one last read
  const notify = useEffectEvent(() => {
    if (invoice) onPaid?.({ ...invoice, status: 'paid' });
  });
  useEffect(() => {
    if (phase !== 'paid' || !invoiceId || notified.current === invoiceId) return;
    notified.current = invoiceId;
    // A link opened on an invoice already paid is a receipt being read, not a payment
    if (!openedPaid) notify();
  }, [phase, invoiceId, openedPaid]);
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
  const [started, setStarted] = useState<number | null>(seconds > 0 ? now : null);
  // A reason to stay that ended starts the countdown now: from the mount it could already be over, and the page would leave
  // with no "Stay here"
  if (seconds > 0 !== (started !== null)) setStarted(seconds > 0 ? now : null);
  const startedAt = seconds > 0 ? (started ?? now) : now;
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
