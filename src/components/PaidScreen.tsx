import { ArrowDownTrayIcon, CheckCircleIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { cn } from '@tuwaio/nova-core';
import { HashLink, TxProgressIndicator, TxStatusVisual } from '@tuwaio/nova-transactions';
import { useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { useAutoReturn } from '../hooks/useOutcomeEffects';
import { usePaymentFacts } from '../hooks/usePaymentFacts';
import { formatLabel } from '../i18n';
import { formatFiat, minorToDecimal } from '../utils/format';
import { methodFamily } from '../utils/methods';
import { focusRing, mono, primaryAction, screenHeading, screenTitle, secondaryAction } from './classes';
import { checkoutClassName } from './customization';
import {
  DetailRow,
  DetailsCard,
  FooterAction,
  FooterNote,
  PrimaryButton,
  ScreenFooter,
  SecondaryButton,
} from './ScreenParts';
import { TxLabels } from './TxLabels';

/**
 * The paid outcome: the amount, network, time and transaction, the steps done, a refund made later, the receipt to
 * download, the automatic payments offer of a subscription, and the way back to the seller (`successUrl`) with a
 * visible countdown and "Stay here" (WCAG 2.2.1). In a modal it offers Close instead: the page under it is the
 * seller's, and loading it again would close everything at once.
 *
 * Side effects: navigates to the seller's `successUrl` when the countdown ends.
 *
 * @returns The paid outcome.
 */
export function PaidScreen() {
  const context = useCheckoutContext();
  const { checkout, state, labels, locale, now, close, wallet, adapterFor, setAutoPay, autoReturnSeconds, display } =
    context;
  const child = context.customization.childCustomizations;
  const facts = usePaymentFacts();
  // The time the checkout saw the payment settle: the view carries no payment time
  const [paidAt] = useState(now);
  const merchant = checkout?.merchant.name ?? '';
  // A modal belongs to the page under it, the seller's: it closes rather than loads that page again, unless the app
  // asks for the return (autoReturnSeconds)
  const successUrl = display === 'modal' && autoReturnSeconds === 0 ? null : (checkout?.invoice.successUrl ?? null);
  const offer = checkout?.autoCharge ?? null;
  const offerMethod =
    offer?.status === 'available' ? checkout?.methods.find((item) => item.id === offer.methodId) : undefined;
  const offerFamily = offerMethod ? methodFamily(offerMethod) : null;
  const canAutoPay = Boolean(wallet && offerFamily && adapterFor(offerFamily)?.requestPermission);
  // No automatic return while the automatic payments offer waits for an answer
  const countdown = useAutoReturn({ url: successUrl, seconds: canAutoPay ? 0 : autoReturnSeconds, now });
  if (!checkout) return null;

  const total = checkout.invoice.totalMinor ? formatFiat(minorToDecimal(checkout.invoice.totalMinor), locale) : null;
  const refunded =
    checkout.invoice.refundedTotalMinor && BigInt(checkout.invoice.refundedTotalMinor) > 0n
      ? formatFiat(minorToDecimal(checkout.invoice.refundedTotalMinor), locale)
      : null;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(paidAt);

  return (
    <TxLabels>
      <section className="novapay:flex novapay:flex-1 novapay:flex-col novapay:items-center novapay:gap-3 novapay:px-5 novapay:py-5 novapay:text-center">
        <TxStatusVisual isSucceed {...child?.statusVisual} />
        <h2 {...screenHeading} className={screenTitle}>
          {labels.paid.title}
        </h2>
        <div>
          <p className={cn(mono, 'novapay:m-0 novapay:text-2xl novapay:font-bold')}>
            {facts.amount ?? (total && `${total} ${checkout.invoice.currency}`)}
          </p>
          <p className="novapay:m-0 novapay:mt-1 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
            {facts.network ? formatLabel(labels.paid.summary, { network: facts.network, date }) : date}
          </p>
        </div>
        <TxProgressIndicator
          isSucceed
          isConfirmed
          {...child?.progressIndicator}
          className={cn('novapay:max-w-sm', child?.progressIndicator?.className)}
        />
        {(facts.network || facts.txKey || facts.from) && (
          <DetailsCard className="novapay:max-w-sm">
            {facts.network && <DetailRow name={labels.confirm.network}>{facts.network}</DetailRow>}
            {facts.txKey && (
              <DetailRow name={labels.confirm.transaction}>
                <HashLink hash={facts.txKey} explorerUrl={facts.explorerUrl} variant="compact" {...child?.hashLink} />
              </DetailRow>
            )}
            {facts.from && <DetailRow name={labels.confirm.from}>{facts.from}</DetailRow>}
          </DetailsCard>
        )}
        {refunded && (
          <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
            {formatLabel(labels.paid.refunded, { amount: refunded, currency: checkout.invoice.currency })}
          </p>
        )}
        {state.receiptUrl && (
          <div className="novapay:flex novapay:w-full novapay:max-w-sm novapay:items-center novapay:gap-3 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:px-3 novapay:py-2 novapay:text-left">
            <DocumentTextIcon
              aria-hidden
              className="novapay:h-6 novapay:w-6 novapay:shrink-0 novapay:text-[var(--tuwa-text-secondary)]"
            />
            <span className="novapay:flex novapay:min-w-0 novapay:flex-1 novapay:flex-col">
              <span className="novapay:text-[13px] novapay:font-semibold">{labels.paid.receipt}</span>
              <span className="novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">
                {labels.paid.receiptHint}
              </span>
            </span>
            <a
              href={state.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'novapay:inline-flex novapay:min-h-6 novapay:items-center novapay:gap-1 novapay:text-xs novapay:font-semibold novapay:text-[var(--tuwa-text-accent)]',
                focusRing,
              )}
            >
              <ArrowDownTrayIcon aria-hidden className="novapay:h-4 novapay:w-4" />
              {labels.paid.download}
            </a>
          </div>
        )}
        {offer?.status === 'active' && (
          <p className="novapay:m-0 novapay:flex novapay:items-center novapay:gap-1.5 novapay:text-xs novapay:text-[var(--tuwa-success-text)]">
            <CheckCircleIcon aria-hidden className="novapay:h-4 novapay:w-4" />
            {labels.paid.autoPayActive}
          </p>
        )}
      </section>
      <ScreenFooter>
        {canAutoPay && <PrimaryButton onClick={() => setAutoPay(true)}>{labels.paid.autoPayOffer}</PrimaryButton>}
        {successUrl ? (
          <>
            <a
              href={successUrl}
              className={
                canAutoPay
                  ? cn(secondaryAction, checkoutClassName(context, 'secondaryButton'))
                  : cn(primaryAction, checkoutClassName(context, 'primaryButton'))
              }
            >
              {formatLabel(labels.paid.back, { merchant })}
            </a>
            {countdown.left !== null && (
              <FooterNote>
                <span role="timer" aria-live="off">
                  {formatLabel(labels.paid.returning, { merchant, seconds: countdown.left })}
                </span>{' '}
                · <FooterAction onClick={countdown.stay}>{labels.paid.stay}</FooterAction>
              </FooterNote>
            )}
          </>
        ) : (
          close &&
          (canAutoPay ? (
            <SecondaryButton onClick={close}>{labels.common.close}</SecondaryButton>
          ) : (
            <PrimaryButton onClick={close}>{labels.common.close}</PrimaryButton>
          ))
        )}
      </ScreenFooter>
    </TxLabels>
  );
}
