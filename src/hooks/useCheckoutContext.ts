import { useContext } from 'react';

import { CheckoutContext, type CheckoutContextValue } from '../components/checkoutContext';

/**
 * What the parts of the surrounding `PaymentCheckout` share, for components that replace its parts.
 *
 * @returns The checkout context.
 * @throws When called outside a `PaymentCheckout`.
 */
export function useCheckoutContext(): CheckoutContextValue {
  const value = useContext(CheckoutContext);
  if (!value) throw new Error('useCheckoutContext must be used inside PaymentCheckout');
  return value;
}
