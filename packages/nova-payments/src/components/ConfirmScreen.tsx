import { cn, MorphText } from '@tuwaio/nova-core';
import { HashLink, TxProgressIndicator, TxStatusVisual } from '@tuwaio/nova-transactions';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { usePaymentFacts } from '../hooks/usePaymentFacts';
import { formatLabel } from '../i18n';
import {
  isInvoicePaymentOnTheWay,
  isPaymentOnTheWay,
  sentBeforeDeadline,
  unconfirmedFollowUp,
} from '../utils/checkout';
import { mono } from './classes';
import { DetailRow, DetailsCard, ScreenFooter, SecondaryButton } from './ScreenParts';
import { StatusTitle } from './StatusTitle';
import { TxLabels } from './TxLabels';

/** Invoice states in which Quasar waits for a payment sent before the deadline (not `processing`: it has arrived). */
const WAITING_STATUSES: ReadonlySet<string> = new Set(['open', 'underpaid']);

/**
 * The confirm step: the transaction is on its way and Quasar follows it until it is final. It reuses the status and
 * progress of Nova Transactions (Sent → Confirming → Paid, in the language of the checkout) and shows the network, the
 * amount, the transaction with its explorer link and the sender. The buyer may close the window: the payment keeps
 * going. It also shows a payment of the invoice that this page did not hand over while Quasar reports it on its way
 * (the page was reopened or reloaded, another tab paid, Quasar found a Solana Pay transfer), instead of offering to pay
 * again: its note asks the buyer to wait for it. When the invoice deadline passes while a payment is on its way (the
 * countdown of the order stays at 00:00), and the invoice is still `open` or `underpaid`, the note follows the payment:
 * sent before the deadline, it says that the payment was sent in time and is being confirmed (Quasar keeps the invoice
 * open for a payment it learned of before the deadline while it confirms: for this page's payment Quasar's word on it
 * decides, `paymentSentInTime` of the checkout store, whatever the clock of the page says; else `paymentCountsUntil`;
 * with a Quasar that reports neither, a payment this page handed over before the deadline by its clock); otherwise it
 * says that the seller accepts or returns a payment that arrives after the invoice closes. A payment that failed or settled is no
 * longer on its way, and the usual note comes back. While the store hands the transaction over again, as Quasar is out of
 * reach for a moment, the note asks to keep the page open: closing it is what could lose the hand-over.
 *
 * @returns The confirm step.
 */
export function ConfirmScreen() {
  const { checkout, state, labels, close, customization, now, handedOverAt, display } = useCheckoutContext();
  const page = display === 'page';
  const child = customization.childCustomizations;
  const facts = usePaymentFacts();
  const dueAt = checkout?.invoice.dueAt ? Date.parse(checkout.invoice.dueAt) : null;
  // The newest status the store heard of; the loaded invoice is not reloaded while the events stream runs
  const status = state.invoiceStatus ?? checkout?.invoice.status;
  const own = isPaymentOnTheWay(state);
  // A payment of the invoice this page did not hand over (a reopened page, another tab): the buyer waits for it
  const found = !own && isInvoicePaymentOnTheWay(state, checkout);
  // Past the deadline with a payment on its way; Quasar counts it only if it learned of it before then
  const pastDeadline =
    checkout !== null && (own || found) && WAITING_STATUSES.has(status ?? '') && dueAt !== null && now >= dueAt;
  const sentInTime = pastDeadline && sentBeforeDeadline({ state, checkout, handedOverAt, dueAt });
  const handingOver = unconfirmedFollowUp(state.error) === 'retrying';
  return (
    <TxLabels>
      <section
        className={cn(
          'novapay:flex novapay:flex-1 novapay:flex-col novapay:items-center novapay:gap-3 novapay:px-5 novapay:py-5 novapay:text-center',
          page && 'novapay-page-status',
        )}
      >
        <TxStatusVisual
          isProcessing
          {...child?.statusVisual}
          className={page ? cn('novapay-page-visual', child?.statusVisual?.className) : child?.statusVisual?.className}
        />
        <div>
          <StatusTitle>{labels.confirm.title}</StatusTitle>
          {/* On a page the amount stands where the paid screen shows it, so nothing moves when the payment confirms */}
          {page && facts.amount && (
            <p className={cn(mono, 'novapay-page-amount novapay:m-0 novapay:mt-2 novapay:text-2xl novapay:font-bold')}>
              {facts.amount}
            </p>
          )}
          {facts.network && (
            <p className="novapay:m-0 novapay:mt-1 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
              {formatLabel(labels.confirm.hint, { network: facts.network })}
            </p>
          )}
        </div>
        <TxProgressIndicator
          isProcessing
          {...child?.progressIndicator}
          className={cn('novapay:max-w-sm', child?.progressIndicator?.className)}
        />
        <DetailsCard className="novapay:max-w-sm">
          {facts.network && <DetailRow name={labels.confirm.network}>{facts.network}</DetailRow>}
          {!page && facts.amount && <DetailRow name={labels.confirm.amount}>{facts.amount}</DetailRow>}
          {facts.txKey && (
            <DetailRow name={labels.confirm.transaction}>
              <HashLink hash={facts.txKey} explorerUrl={facts.explorerUrl} variant="compact" {...child?.hashLink} />
            </DetailRow>
          )}
          {facts.fromAddress && (
            <DetailRow name={labels.confirm.from}>
              <HashLink hash={facts.fromAddress} explorerUrl={facts.fromUrl} variant="compact" {...child?.hashLink} />
            </DetailRow>
          )}
        </DetailsCard>
        <p
          role="status"
          className={cn(
            'novapay:m-0 novapay:max-w-sm novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]',
            page && 'novapay:mt-auto',
          )}
        >
          <MorphText wrap>
            {handingOver
              ? labels.outcome.unconfirmedRetrying
              : pastDeadline
                ? formatLabel(sentInTime ? labels.confirm.afterDeadline : labels.confirm.pastDeadline, {
                    merchant: checkout.merchant.name,
                  })
                : found
                  ? labels.confirm.invoicePayment
                  : labels.confirm.canClose}
          </MorphText>
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
