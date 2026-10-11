import { useContext } from 'react';

import { NovaPaymentsContext, type NovaPaymentsSettings } from '../providers/novaPaymentsContext';

/**
 * The settings of the nearest `NovaPaymentsProvider`; empty without one.
 *
 * @returns The settings.
 */
export function useNovaPayments(): NovaPaymentsSettings {
  return useContext(NovaPaymentsContext);
}
