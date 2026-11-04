import type { CheckoutStore } from '@tuwaio/quasar-sdk/checkout';
import { useState } from 'react';

import type { CheckoutScreen } from '../utils/checkout';

/**
 * Whether the checkout showed a QR code for the invoice (a Solana Pay transfer request, or the payment page for a
 * phone): the buyer may have paid with it from a phone, which this page does not see, so an invoice that expires
 * afterwards never says that nothing was charged. It stays `true` for the invoice of the store.
 *
 * @param params - The checkout.
 * @param params.store - The checkout store of the invoice.
 * @param params.screen - The screen shown.
 * @returns Whether a QR code showed for this invoice.
 */
export function useQrShown({ store, screen }: { store: CheckoutStore; screen: CheckoutScreen }): boolean {
  const [shown, setShown] = useState<CheckoutStore | null>(null);
  const qr = screen === 'qr';
  if (qr && shown !== store) setShown(store);
  return qr || shown === store;
}
