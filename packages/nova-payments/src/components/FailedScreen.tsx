import { cn } from '@tuwaio/nova-core';
import { HashLink } from '@tuwaio/nova-transactions';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { usePaymentFacts } from '../hooks/usePaymentFacts';
import { formatLabel } from '../i18n';
import { failedPaymentTx, paymentFailedText } from '../utils/outcome';
import { instructionsChainId } from '../utils/pay';
import { ContactLink } from './OutcomeScreen';
import { DetailRow, DetailsCard, PrimaryButton, ScreenFooter } from './ScreenParts';
import { ACTION_ARRIVES, useStatusAction } from './statusAction';
import { StatusHead } from './StatusHead';
import { StatusReveal } from './StatusReveal';
import { StatusSteps } from './StatusSteps';
import { TxLabels } from './TxLabels';

/**
 * The failed step: a payment this page showed on its way failed for good (the network reverted it, the wallet
 * cancelled it, a Solana transaction expired), and the invoice still takes a payment. It stays where the confirm step
 * was, with the same head, so the buyer sees what became of the payment they were watching: the mark and the chip turn
 * to a failure, the last step says "Failed", and under the network, the transaction with its explorer link and the
 * sender stands why, in the words of the reason. "Pay again" goes on to the step the checkout store went back to (the
 * locked price while it holds, else the methods); "Contact" reaches the seller.
 *
 * @returns The failed step, or nothing without the failure of a payment.
 */
export function FailedScreen() {
  const context = useCheckoutContext();
  const { checkout, state, labels, adapterFor, payAfterFailure, customization, display } = context;
  const facts = usePaymentFacts();
  // "Close" of the confirm step turns into this action
  const action = useStatusAction('primary', labels.pay.payAgain);
  if (!checkout || !state.error) return null;
  const page = display === 'page';
  const child = customization.childCustomizations;
  // The transaction that failed, by the key Quasar names; the one the page handed over otherwise
  const txKey = failedPaymentTx(state.error) ?? facts.txKey;
  const locked = state.quote ?? checkout.quote;
  const chainId = locked ? instructionsChainId(locked.instructions) : null;
  const explorerUrl =
    txKey === facts.txKey
      ? facts.explorerUrl
      : locked && chainId && txKey
        ? adapterFor(locked.instructions.family)?.explorerUrl?.({ chainId, txKey })
        : undefined;
  return (
    <TxLabels>
      <section
        className={cn(
          'novapay:flex novapay:flex-1 novapay:flex-col novapay:items-center novapay:gap-3 novapay:px-5 novapay:py-5 novapay:text-center',
          page && 'novapay-page-status',
        )}
      >
        <StatusHead
          mark="failed"
          tone="error"
          chip={labels.status.failed}
          title={labels.failed.title}
          amount={facts.amount}
          note={facts.network ? formatLabel(labels.failed.summary, { network: facts.network }) : null}
        />
        <StatusSteps state="failed" />
        {(facts.network || txKey || facts.fromAddress) && (
          <DetailsCard className="novapay:max-w-sm">
            {facts.network && <DetailRow name={labels.confirm.network}>{facts.network}</DetailRow>}
            {txKey && (
              <DetailRow name={labels.confirm.transaction}>
                <HashLink hash={txKey} explorerUrl={explorerUrl} variant="compact" {...child?.hashLink} />
              </DetailRow>
            )}
            {facts.fromAddress && (
              <DetailRow name={labels.confirm.from}>
                <HashLink hash={facts.fromAddress} explorerUrl={facts.fromUrl} variant="compact" {...child?.hashLink} />
              </DetailRow>
            )}
          </DetailsCard>
        )}
        <StatusReveal className="novapay:max-w-sm">
          <p role="status" className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-primary)]">
            {paymentFailedText(state.error, labels, facts.network ?? undefined)}
          </p>
        </StatusReveal>
      </section>
      <ScreenFooter>
        <PrimaryButton onClick={payAfterFailure} className={action.arrives ? ACTION_ARRIVES : undefined}>
          {action.label}
        </PrimaryButton>
        <StatusReveal>
          <ContactLink />
        </StatusReveal>
      </ScreenFooter>
    </TxLabels>
  );
}
