import { useEffect } from 'react';

import { useNovaPayments } from './useNovaPayments';

/**
 * Tells Nova's own connection the language of the checkout shown, so that its connect modal speaks it
 * (`setCheckoutLocale` of `NovaPaymentsProvider`). Nothing happens on the app's connection.
 *
 * @param locale - The language of the checkout while it shows and its language is known; `null` otherwise.
 * @internal
 */
export function useConnectionLocale(locale: string | null): void {
  const { setCheckoutLocale } = useNovaPayments();
  useEffect(() => {
    if (locale && setCheckoutLocale) setCheckoutLocale(locale);
  }, [locale, setCheckoutLocale]);
}
