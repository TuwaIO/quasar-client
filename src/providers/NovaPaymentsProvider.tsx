import { type ReactNode, useMemo } from 'react';

import type { PaymentsAdapter } from '../adapters/types';
import type { CheckoutLocale, NovaPaymentsLabelOverrides, NovaPaymentsLabels } from '../i18n';
import type { PaymentsPulsar } from '../utils/handOver';
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
  /**
   * The chain families the checkouts pay from a connected wallet on: `paymentsEVMAdapter` of
   * `@tuwaio/nova-payments/evm`, `paymentsSolanaAdapter` of `@tuwaio/nova-payments/solana`. Without the adapter of a
   * method's family, the buyer pays that method with a QR code.
   */
  adapters?: PaymentsAdapter[];
  /**
   * The app's Pulsar store (`injectExternalPendingTxs` of `createPulsarStore` from `@tuwaio/pulsar-core`). While a
   * checkout is open it tracks the payment itself; when it closes before Quasar settled a payment the wallet sent, the
   * payment goes to this store, which tracks it and keeps it in the history, and Nova Transactions shows its toast.
   */
  pulsar?: PaymentsPulsar;
  /** The app. */
  children: ReactNode;
}

/**
 * Gives the checkouts below it the Quasar API, the labels and the chain adapters. A checkout works without it, with
 * Quasar Cloud, the built-in labels and QR payments only.
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
export function NovaPaymentsProvider({
  baseUrl,
  labels,
  customization,
  adapters,
  pulsar,
  children,
}: NovaPaymentsProviderProps) {
  const value = useMemo(
    () => ({ baseUrl, labels, customization, adapters, pulsar }),
    [baseUrl, labels, customization, adapters, pulsar],
  );
  return <NovaPaymentsContext.Provider value={value}>{children}</NovaPaymentsContext.Provider>;
}
