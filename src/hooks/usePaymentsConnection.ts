import { useDetectedPaymentsConnection } from '../providers/detectConnection';
import type { PaymentsConnectionMode } from '../providers/novaPaymentsContext';
import { useNovaPayments } from './useNovaPayments';

/**
 * Whose wallet connection the checkouts and refunds use: the choice of the nearest {@link NovaPaymentsProvider}
 * (made on its first render), or, without one, what the app's providers above give (`app`, `appStore` or `none`). See
 * {@link PaymentsConnectionMode}.
 *
 * @returns The mode.
 *
 * @example
 * ```tsx
 * import { usePaymentsConnection } from '@tuwaio/nova-payments';
 *
 * export function WalletNote() {
 *   const connection = usePaymentsConnection();
 *   return connection === 'own' ? <p>The checkout connects its own wallet.</p> : null;
 * }
 * ```
 */
export function usePaymentsConnection(): PaymentsConnectionMode {
  const settings = useNovaPayments();
  const detected = useDetectedPaymentsConnection(false);
  return settings.connection ?? detected;
}
