import { NovaTransactionsLabelsProvider, useLabels } from '@tuwaio/nova-transactions/providers';
import { type ReactNode, useMemo } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';

/**
 * Gives the parts of Nova Transactions the checkout reuses (progress, status, transaction link) the texts of the
 * checkout language: Sent, Confirming or Confirmed, Paid.
 *
 * @internal
 */
export function TxLabels({ children }: { children: ReactNode }) {
  const { labels } = useCheckoutContext();
  const base = useLabels();
  const merged = useMemo(
    () => ({
      ...base,
      trackingModal: {
        ...base.trackingModal,
        progressIndicator: {
          created: labels.confirm.sent,
          processing: labels.confirm.confirming,
          succeed: labels.confirm.paid,
        },
      },
      statuses: { ...base.statuses, confirmed: labels.confirm.confirmed, failed: labels.confirm.failed },
      actions: { ...base.actions, viewOnExplorer: labels.confirm.viewOnExplorer, copy: labels.confirm.copyHash },
      txError: { ...base.txError, copied: labels.pay.copied },
    }),
    [base, labels],
  );
  return <NovaTransactionsLabelsProvider labels={merged}>{children}</NovaTransactionsLabelsProvider>;
}
