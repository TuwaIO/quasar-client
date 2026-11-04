import type { CheckoutStore } from '@tuwaio/quasar-sdk/checkout';
import { useEffect, useState } from 'react';

/**
 * When this page handed its current payment over to Quasar: the moment the phase of the checkout store went from
 * `submitting` to `confirming`, by the clock of the page. The store does not tell it, and the confirm step needs it to
 * say "sent before the deadline" only for a payment handed over before the deadline (with a Quasar that does not report
 * `paymentCountsUntil`), and never for one handed over after it. A payment the store found on its way (when it loaded
 * the checkout, or while the page offered to pay) was not handed over here: no time. It is forgotten when the phase
 * leaves `confirming` (the payment failed, settled, or the invoice closed).
 *
 * Side effect: a subscription to the store while mounted.
 *
 * @param store - The checkout store of the invoice.
 * @returns `Date.now()` of the hand-over, or `null` when the payment is not confirming, was already confirming when
 * the checkout opened (a reload) or was found on its way.
 */
export function useHandOverTime(store: CheckoutStore): number | null {
  const [handedOver, setHandedOver] = useState<{ store: CheckoutStore; at: number | null }>({ store, at: null });
  useEffect(
    () =>
      store.subscribe((next, previous) => {
        if (next.phase === previous.phase) return;
        if (next.phase === 'confirming')
          setHandedOver({ store, at: previous.phase === 'submitting' ? Date.now() : null });
        else if (previous.phase === 'confirming') setHandedOver({ store, at: null });
      }),
    [store],
  );
  // Another invoice opened: its payment has not been handed over by this page yet
  return handedOver.store === store ? handedOver.at : null;
}
