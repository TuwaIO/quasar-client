import { cn } from '@tuwaio/nova-core';
import { HashLink, TxProgressIndicator, TxStatusVisual } from '@tuwaio/nova-transactions';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { usePaymentFacts } from '../hooks/usePaymentFacts';
import { formatLabel } from '../i18n';
import { mono } from './classes';
import { DetailRow, DetailsCard, ScreenFooter, SecondaryButton } from './ScreenParts';
import { TxLabels } from './TxLabels';

/**
 * The confirm step: the transaction is on its way and Quasar follows it until it is final. It reuses the status and
 * progress of Nova Transactions (Sent → Confirming → Paid, in the language of the checkout) and shows the network, the
 * amount, the transaction with its explorer link and the sender. The buyer may close the window: the payment keeps
 * going.
 *
 * @returns The confirm step.
 */
export function ConfirmScreen() {
  const { labels, close } = useCheckoutContext();
  const facts = usePaymentFacts();
  return (
    <TxLabels>
      <section className="novapay:flex novapay:flex-1 novapay:flex-col novapay:items-center novapay:gap-3 novapay:px-5 novapay:py-5 novapay:text-center">
        <TxStatusVisual isProcessing />
        <div>
          <h2 className={cn(mono, 'novapay:m-0 novapay:text-base novapay:font-bold')}>{labels.confirm.title}</h2>
          {facts.network && (
            <p className="novapay:m-0 novapay:mt-1 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
              {formatLabel(labels.confirm.hint, { network: facts.network })}
            </p>
          )}
        </div>
        <TxProgressIndicator isProcessing className="novapay:max-w-sm" />
        <DetailsCard className="novapay:max-w-sm">
          {facts.network && <DetailRow name={labels.confirm.network}>{facts.network}</DetailRow>}
          {facts.amount && <DetailRow name={labels.confirm.amount}>{facts.amount}</DetailRow>}
          {facts.txKey && (
            <DetailRow name={labels.confirm.transaction}>
              <HashLink hash={facts.txKey} explorerUrl={facts.explorerUrl} variant="compact" />
            </DetailRow>
          )}
          {facts.from && <DetailRow name={labels.confirm.from}>{facts.from}</DetailRow>}
        </DetailsCard>
        <p
          role="status"
          className="novapay:m-0 novapay:max-w-sm novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]"
        >
          {labels.confirm.canClose}
        </p>
      </section>
      {close && (
        <ScreenFooter>
          <SecondaryButton onClick={close}>{labels.common.close}</SecondaryButton>
        </ScreenFooter>
      )}
    </TxLabels>
  );
}
