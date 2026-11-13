import { cn, DrawnCheck } from '@tuwaio/nova-core';
import { HashLink } from '@tuwaio/nova-transactions';
import { useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { useAutoReturn } from '../hooks/useOutcomeEffects';
import { usePaymentFacts } from '../hooks/usePaymentFacts';
import { formatLabel } from '../i18n';
import { formatFiat, minorToDecimal } from '../utils/format';
import { methodFamily } from '../utils/methods';
import { CapsLabel } from './CapsLabel';
import { primaryAction, secondaryAction, smallAction, textButton } from './classes';
import { checkoutClassName } from './customization';
import { ArrowDownTrayIcon, DocumentTextIcon } from './icons';
import {
  DetailRow,
  DetailsCard,
  FooterAction,
  FooterNote,
  PrimaryButton,
  ScreenFooter,
  SecondaryButton,
} from './ScreenParts';
import { ACTION_ARRIVES, useStatusAction } from './statusAction';
import { StatusHead } from './StatusHead';
import { StatusReveal } from './StatusReveal';
import { StatusSteps } from './StatusSteps';
import { TxLabels } from './TxLabels';

/**
 * The paid outcome: the amount, network, time and transaction (every transfer of an invoice paid in parts, each with
 * its time, amount and explorer link), the steps done, a refund made later, the receipt to
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
  const {
    checkout,
    state,
    labels,
    locale,
    now,
    close,
    wallet,
    adapterFor,
    setAutoPay,
    autoPayOff,
    setAutoPayOff,
    autoReturnSeconds,
    openedPaid,
    display,
  } = context;
  const child = context.customization.childCustomizations;
  const facts = usePaymentFacts();
  // The clock of the page only for an engine that does not send the time yet: a receipt opened from its link days later
  // once said the payment came just now
  const [seenAt] = useState(now);
  const merchant = checkout?.merchant.name ?? '';
  // A modal belongs to the page under it, the seller's: it closes rather than loads that page again, unless the app
  // asks for the return (autoReturnSeconds)
  const successUrl = display === 'modal' && autoReturnSeconds === 0 ? null : (checkout?.invoice.successUrl ?? null);
  const offer = checkout?.autoCharge ?? null;
  const offerMethod =
    offer?.status === 'available' ? checkout?.methods.find((item) => item.id === offer.methodId) : undefined;
  const offerFamily = offerMethod ? methodFamily(offerMethod) : null;
  // Just turned off: the same page does not ask for them again
  const canAutoPay =
    autoPayOff !== 'done' && Boolean(wallet && offerFamily && adapterFor(offerFamily)?.requestPermission);
  // The return belongs to the moment of payment: not while the offer waits for an answer, not over the control that turns
  // automatic payments off, and not on a receipt opened from its link long after
  const stays = canAutoPay || openedPaid || offer?.status === 'active';
  const countdown = useAutoReturn({ url: successUrl, seconds: stays ? 0 : autoReturnSeconds, now });
  // The first action of the footer goes on from "Close" of the confirm step
  const mainLabel = canAutoPay
    ? labels.paid.autoPayOffer
    : successUrl
      ? labels.paid.back
      : close
        ? labels.common.close
        : null;
  const action = useStatusAction(mainLabel === null ? null : 'primary', mainLabel ?? '');
  const arrives = action.arrives ? ACTION_ARRIVES : undefined;
  if (!checkout) return null;

  const total = checkout.invoice.totalMinor ? formatFiat(minorToDecimal(checkout.invoice.totalMinor), locale) : null;
  const refunded =
    checkout.invoice.refundedTotalMinor && BigInt(checkout.invoice.refundedTotalMinor) > 0n
      ? formatFiat(minorToDecimal(checkout.invoice.refundedTotalMinor), locale)
      : null;
  const paidAt = checkout.invoice.paidAt ? Date.parse(checkout.invoice.paidAt) : seenAt;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(paidAt);
  // An invoice paid in parts lists every transfer Quasar credited: the page itself knows only the one it handed over
  // last, and a receipt opened from its link knows none
  const { transfers } = facts;
  const parts = transfers.length > 1 ? transfers : null;
  const only = transfers.length === 1 ? transfers[0] : null;
  const txKey = facts.txKey ?? only?.txKey ?? null;
  const explorerUrl = facts.txKey ? facts.explorerUrl : only?.explorerUrl;
  const transferTime = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <TxLabels>
      <section
        className={cn(
          'novapay:flex novapay:flex-1 novapay:flex-col novapay:items-center novapay:gap-3 novapay:px-5 novapay:py-5 novapay:text-center',
          context.display === 'page' && 'novapay-page-status',
        )}
      >
        <StatusHead
          mark="paid"
          tone="success"
          chip={labels.status.paid}
          title={labels.paid.title}
          amount={facts.paidAmount ?? (total && `${total} ${checkout.invoice.currency}`)}
          note={facts.network ? formatLabel(labels.paid.summary, { network: facts.network, date }) : date}
        />
        <StatusSteps state="succeed" />
        {(facts.network || txKey || parts || facts.from) && (
          <DetailsCard className="novapay:max-w-sm">
            {facts.network && <DetailRow name={labels.confirm.network}>{facts.network}</DetailRow>}
            {parts
              ? parts.map((transfer, index) => (
                  <DetailRow
                    key={`${transfer.txKey}:${index}`}
                    name={
                      <>
                        <span className="novapay:block">
                          {formatLabel(labels.confirm.transferOf, { index: index + 1, count: parts.length })}
                        </span>
                        <time
                          dateTime={new Date(transfer.at).toISOString()}
                          className="novapay:block novapay:text-[11px] novapay:leading-4"
                        >
                          {transferTime.format(transfer.at)}
                        </time>
                      </>
                    }
                  >
                    {transfer.amount && <span className="novapay:block">{transfer.amount}</span>}
                    <HashLink
                      hash={transfer.txKey}
                      explorerUrl={transfer.explorerUrl}
                      variant="compact"
                      {...child?.hashLink}
                    />
                  </DetailRow>
                ))
              : txKey && (
                  <DetailRow name={facts.lastOfParts ? labels.confirm.lastTransfer : labels.confirm.transaction}>
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
        {refunded && (
          <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
            {formatLabel(labels.paid.refunded, { amount: refunded, currency: checkout.invoice.currency })}
          </p>
        )}
        {state.receiptUrl && (
          <StatusReveal className="novapay:max-w-sm">
            <div className="novapay:flex novapay:w-full novapay:items-center novapay:gap-3 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:px-3 novapay:py-2 novapay:text-left">
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
                className={cn(smallAction, 'novapay:gap-1.5 novapay:no-underline')}
              >
                <ArrowDownTrayIcon aria-hidden className="novapay:h-3.5 novapay:w-3.5" />
                {labels.paid.download}
              </a>
            </div>
          </StatusReveal>
        )}
        {offer?.status === 'active' && (
          <p className="novapay:m-0 novapay:flex novapay:items-center novapay:gap-1.5 novapay:text-xs novapay:text-[var(--tuwa-success-text)]">
            <DrawnCheck variant="disc" className="novapay:h-4 novapay:w-4" />
            {labels.paid.autoPayActive}
            {offer.revocation && (
              <button type="button" onClick={() => setAutoPayOff('open')} className={textButton}>
                {labels.paid.autoPayOff}
              </button>
            )}
          </p>
        )}
        {autoPayOff === 'done' && (
          <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
            {formatLabel(labels.paid.autoPayTurnedOff, { merchant })}
          </p>
        )}
      </section>
      <ScreenFooter>
        {canAutoPay && (
          <PrimaryButton onClick={() => setAutoPay(true)} className={arrives}>
            {action.label}
          </PrimaryButton>
        )}
        {successUrl ? (
          <>
            <a
              href={successUrl}
              className={
                canAutoPay
                  ? cn(secondaryAction, checkoutClassName(context, 'secondaryButton'))
                  : cn(primaryAction, arrives, checkoutClassName(context, 'primaryButton'))
              }
            >
              <CapsLabel label={canAutoPay ? labels.paid.back : action.label} values={{ merchant }} />
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
            <PrimaryButton onClick={close} className={arrives}>
              {action.label}
            </PrimaryButton>
          ))
        )}
      </ScreenFooter>
    </TxLabels>
  );
}
