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

/**
 * The context of the surrounding `PaymentCheckout`, or `null` outside one: for parts the checkout shares with
 * `RefundButton`, which take the checkout's customization only inside it.
 *
 * @returns The checkout context, or `null`.
 * @internal
 */
export function useOptionalCheckoutContext(): CheckoutContextValue | null {
  return useContext(CheckoutContext);
}
