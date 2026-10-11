import { type ReactNode, useMemo } from 'react';

import type { CheckoutLocale, NovaPaymentsLabelOverrides, NovaPaymentsLabels } from '../i18n';
import { NovaPaymentsContext } from './novaPaymentsContext';

/** What the labels customization of {@link NovaPaymentsProvider} gets with the labels it transforms. */
export interface NovaPaymentsLabelsContext {
  /** The language of the checkout. */
  locale: CheckoutLocale | string;
}

/** Customization of {@link NovaPaymentsProvider}. */
export type NovaPaymentsProviderCustomization = {
  /** Labels. */
  labels?: {
    /**
     * Changes the labels of a language after the built-in ones and `labels` are applied, for example to translate a
     * language the package does not have.
     *
     * @param labels - The labels of the language with `labels` applied.
     * @param context - The language.
     * @returns The labels to use.
     */
    transform?: (labels: NovaPaymentsLabels, context: NovaPaymentsLabelsContext) => NovaPaymentsLabels;
  };
};

/** Props of {@link NovaPaymentsProvider}. */
export interface NovaPaymentsProviderProps {
  /** The Quasar API (Quasar Cloud by default, the address of your node for the Community Edition). */
  baseUrl?: string;
  /** Texts to replace in every language. */
  labels?: NovaPaymentsLabelOverrides;
  /** Customization of the labels. */
  customization?: NovaPaymentsProviderCustomization;
  /** The app. */
  children: ReactNode;
}

/**
 * Gives the checkouts below it the Quasar API and the labels. A checkout works without it, with Quasar Cloud and the
 * built-in labels.
 *
 * @param props - See {@link NovaPaymentsProviderProps}.
 * @returns The provider.
 *
 * @example
 * ```tsx
 * import { NovaPaymentsProvider, PaymentCheckout } from '@tuwaio/nova-payments';
 *
 * export function Checkout({ token }: { token: string }) {
 *   return (
 *     <NovaPaymentsProvider baseUrl="https://quasar.example.com" labels={{ steps: { pay: 'Payment' } }}>
 *       <PaymentCheckout token={token} display="inline" />
 *     </NovaPaymentsProvider>
 *   );
 * }
 * ```
 */
export function NovaPaymentsProvider({ baseUrl, labels, customization, children }: NovaPaymentsProviderProps) {
  const value = useMemo(() => ({ baseUrl, labels, customization }), [baseUrl, labels, customization]);
  return <NovaPaymentsContext.Provider value={value}>{children}</NovaPaymentsContext.Provider>;
}
