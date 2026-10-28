import {
  ArrowPathRoundedSquareIcon,
  ArrowUturnLeftIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@tuwaio/nova-core';
import { parseCaip10AccountId } from '@tuwaio/orbit-core';
import type { ComponentType, ReactNode, SVGProps } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel } from '../i18n';
import {
  type CheckoutScreen,
  isInvoicePaymentOnTheWay,
  isInvoicePaymentUnresolved,
  isMovedMoneyFailure,
  isPaymentOnTheWay,
} from '../utils/checkout';
import { formatFiat, formatTokenAmount, minorToDecimal, shortAddress } from '../utils/format';
import { networkName, payerFor } from '../utils/methods';
import { contactHref, receivedAmount, underpaidRest } from '../utils/outcome';
import { instructionsChainId } from '../utils/pay';
import { mono, screenHeading, screenTitle, secondaryAction } from './classes';
import { checkoutClassName } from './customization';
import { PrimaryButton, ScreenFooter, SecondaryButton } from './ScreenParts';

/** The outcomes this screen shows. */
export type OutcomeKind = Extract<
  CheckoutScreen,
  'unconfirmed' | 'underpaid' | 'held' | 'refunded' | 'expired' | 'cancelled' | 'replaced' | 'blocked'
>;

/** Whether the last error says that Quasar could not confirm a payment, which may still arrive. */
// `payment_unconfirmed` is newer than some `@tuwaio/quasar-sdk` alphas: compare it as a string
const isUnconfirmed = (error: { code: string } | null | undefined) => error?.code === 'payment_unconfirmed';

/** The icon and tone of each outcome. */
const LOOK: Record<OutcomeKind, { Icon: ComponentType<SVGProps<SVGSVGElement>>; tone: string }> = {
  unconfirmed: { Icon: ExclamationTriangleIcon, tone: 'novapay:text-[var(--tuwa-pending-icon)]' },
  underpaid: { Icon: ExclamationTriangleIcon, tone: 'novapay:text-[var(--tuwa-pending-icon)]' },
  held: { Icon: MagnifyingGlassIcon, tone: 'novapay:text-[var(--tuwa-info-icon)]' },
  refunded: { Icon: ArrowUturnLeftIcon, tone: 'novapay:text-[var(--tuwa-info-icon)]' },
  expired: { Icon: ClockIcon, tone: 'novapay:text-[var(--tuwa-text-secondary)]' },
  cancelled: { Icon: XCircleIcon, tone: 'novapay:text-[var(--tuwa-text-secondary)]' },
  replaced: { Icon: ArrowPathRoundedSquareIcon, tone: 'novapay:text-[var(--tuwa-info-icon)]' },
  blocked: { Icon: NoSymbolIcon, tone: 'novapay:text-[var(--tuwa-error-icon)]' },
};

/** A paragraph of an outcome. */
const Text = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
  <p
    className={cn(
      'novapay:m-0 novapay:max-w-sm novapay:text-xs',
      muted ? 'novapay:text-[var(--tuwa-text-secondary)]' : 'novapay:text-[var(--tuwa-text-primary)]',
    )}
  >
    {children}
  </p>
);

/** "Contact <seller>": the seller's support email about the invoice, its site, or the app's handler. */
function ContactLink() {
  const context = useCheckoutContext();
  const { checkout, labels, onContact } = context;
  if (!checkout) return null;
  const text = formatLabel(labels.outcome.contact, { merchant: checkout.merchant.name });
  // The second action of the footer, the same as "Close" or "Back" on the other screens
  const className = cn(secondaryAction, checkoutClassName(context, 'secondaryButton'));
  if (onContact) {
    return (
      <button type="button" onClick={onContact} className={className}>
        {text}
      </button>
    );
  }
  const href = contactHref(
    checkout.merchant,
    formatLabel(labels.outcome.contactSubject, { number: checkout.invoice.number ?? checkout.invoice.id }),
  );
  if (!href) return null;
  return (
    <a
      href={href}
      target={href.startsWith('mailto:') ? undefined : '_blank'}
      rel="noopener noreferrer"
      className={className}
    >
      {text}
    </a>
  );
}

/**
 * An outcome other than paid: a payment Quasar could not confirm (`unconfirmed`: it may still arrive, so the buyer
 * checks the wallet before paying again; Quasar reads it again for 24 hours and records it for the seller if it
 * arrives, or, while the checkout store hands a transaction the wallet sent over again, the buyer keeps the page open;
 * no payment is offered, only, on a payable invoice, "The payment did not leave my wallet", which goes back to it with
 * `payAgain` of the checkout store), an underpaid invoice ("Pay the rest"), a payment the seller reviews (screening,
 * late, overpaid, after the price lock ran out), a refunded invoice, an expired one (with what arrived before the
 * deadline, which the seller can refund; never "nothing was charged" while a payment may still arrive: one this page
 * handed over or saw on its way, also after the checkout stopped following it, which Quasar records and shows to the
 * seller if it arrives, one Quasar could not confirm or reports as unresolved, to check in the wallet, one that does not
 * pay the invoice and may have moved money, and after a QR code showed, a payment made with it, as this page does not
 * see it), a cancelled one (the same: never "nothing was charged" while a payment may still arrive), a corrected one
 * ("Open <new invoice>" opens it here) and a payer the wallet check refused ("Use another wallet"). Each offers to
 * contact the seller.
 *
 * @param props - The outcome.
 * @param props.kind - Which outcome.
 * @returns The outcome step.
 */
export function OutcomeScreen({ kind }: { kind: OutcomeKind }) {
  const context = useCheckoutContext();
  const { checkout, state, store, labels, locale, wallet, connectWallet, openInvoice, qrShown, paymentSent } = context;
  if (!checkout) return null;
  const merchant = checkout.merchant.name;
  const { Icon, tone } = LOOK[kind];
  const StatusIcon = context.customization.components?.StatusIcon;
  const iconClassName = checkoutClassName(context, 'statusIcon', { kind });
  const quote = state.quote;
  const method = checkout.methods.find((item) => item.id === (state.methodId ?? quote?.methodId));
  const due = checkout.invoice.dueAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        Date.parse(checkout.invoice.dueAt),
      )
    : null;
  const token = (amount: string, locked = quote) =>
    locked ? `${formatTokenAmount(amount, locked.decimals, locale)} ${locked.instructions.symbol}` : amount;

  let title: string;
  let body: ReactNode = null;
  let action: ReactNode = null;

  switch (kind) {
    case 'unconfirmed': {
      title = labels.outcome.unconfirmedTitle;
      // The store hands over again a transaction the wallet sent, which Quasar has not received yet: Quasar cannot read
      // it again before it has it, so the page asks to stay open instead
      const retrying = (state.error as { reason?: string } | null)?.reason === 'submit_retrying';
      body = (
        <>
          <Text>{labels.outcome.unconfirmedText}</Text>
          <Text muted>
            {retrying ? labels.outcome.unconfirmedRetrying : formatLabel(labels.outcome.unconfirmedNote, { merchant })}
          </Text>
        </>
      );
      // `payAgain` is newer than some `@tuwaio/quasar-sdk` alphas, whose stores never reach this phase
      const { payAgain } = store.getState() as { payAgain?: () => void };
      const status = state.invoiceStatus ?? checkout.invoice.status;
      // Not the main button: the buyer pays again only after checking that the payment did not leave the wallet, and
      // only while the invoice can be paid
      if (payAgain && (status === 'open' || status === 'underpaid')) {
        action = <SecondaryButton onClick={() => payAgain()}>{labels.outcome.unconfirmedPayAgain}</SecondaryButton>;
      }
      break;
    }
    case 'underpaid': {
      const paid = checkout.invoice.amountPaid;
      const rest = underpaidRest(quote, paid);
      title = labels.outcome.underpaidTitle;
      body = (
        <>
          {quote && paid && (
            <Text>
              {formatLabel(labels.outcome.underpaidText, {
                received: token(paid),
                total: token(quote.cryptoAmountExpected),
              })}
            </Text>
          )}
          {quote && rest && (
            <Text>
              {formatLabel(labels.outcome.underpaidRest, {
                rest: token(rest),
                network: networkName(instructionsChainId(quote.instructions)),
              })}
            </Text>
          )}
          {due && <Text muted>{formatLabel(labels.outcome.underpaidNote, { merchant, date: due })}</Text>}
        </>
      );
      const payRest = () => {
        if (!method) return;
        // The same wallet pays the rest: Quasar quotes what is left for it
        const payer = quote?.payer === null ? null : wallet ? payerFor(wallet, method) : null;
        if (quote?.payer !== null && !payer) return void connectWallet(method);
        store.getState().setPayer(payer);
        void store.getState().requestQuote();
      };
      action = (
        <PrimaryButton busy={state.phase === 'quoting'} onClick={payRest}>
          {labels.outcome.payRest}
        </PrimaryButton>
      );
      break;
    }
    case 'held': {
      title = formatLabel(labels.outcome.heldTitle, { merchant });
      // `quote_expired` is newer than some `@tuwaio/quasar-sdk` alphas; an unknown reason reads as a check
      const reason: string | undefined = checkout.invoice.review?.reason;
      const text =
        reason === 'late'
          ? labels.outcome.heldLate
          : reason === 'overpaid'
            ? labels.outcome.heldOverpaid
            : reason === 'quote_expired'
              ? labels.outcome.heldQuoteExpired
              : labels.outcome.heldScreening;
      body = (
        <>
          <Text>{formatLabel(text, { merchant })}</Text>
          <Text muted>{labels.outcome.heldNote}</Text>
        </>
      );
      break;
    }
    case 'refunded': {
      title = labels.outcome.refundedTitle;
      const amount = checkout.invoice.refundedTotalMinor ?? checkout.invoice.totalMinor;
      body = amount && (
        <Text>
          {formatLabel(labels.outcome.refundedText, {
            merchant,
            amount: formatFiat(minorToDecimal(amount), locale),
            currency: checkout.invoice.currency,
          })}
        </Text>
      );
      break;
    }
    case 'expired': {
      title = labels.outcome.expiredTitle;
      // What arrived before the deadline stays with the seller, who can refund it: never "nothing was charged"
      const received = receivedAmount(checkout.invoice.amountPaid);
      // It is in base units of the invoice's locked quote: the buyer's, else the one the checkout reports
      const locked = quote ?? checkout.quote;
      // A payment of the invoice may still arrive: on its way (this page's, or one Quasar reports, as on a reopened
      // page), or one this page handed over that the store no longer follows (its time ran out) and that Quasar did not
      // reject for good. Quasar records it and the seller accepts or returns it, so never "nothing was charged". A
      // `held` or `paid` invoice the store hears of later replaces this outcome
      const onItsWay = isPaymentOnTheWay(state) || isInvoicePaymentOnTheWay(state, checkout);
      // Quasar could not confirm a payment, or reports one it reads again (unresolved), with none on its way: check
      // the wallet
      const unconfirmed = isUnconfirmed(state.error) || (!onItsWay && isInvoicePaymentUnresolved(state, checkout));
      const sent = !unconfirmed && (onItsWay || paymentSent);
      // The last transaction does not pay the invoice and may have moved money: never "nothing was charged"
      const mismatch = !unconfirmed && !sent && isMovedMoneyFailure(state.error);
      // A QR code may have been paid from a phone, which this page does not see: never "nothing was charged" either
      const maybePaid = sent || unconfirmed || mismatch || qrShown;
      body = (
        <>
          {received ? (
            <>
              {due && (
                <Text>
                  {locked
                    ? formatLabel(labels.outcome.expiredPartText, { date: due, amount: token(received, locked) })
                    : formatLabel(labels.outcome.expiredPartNoAmount, { date: due })}
                </Text>
              )}
              <Text>{formatLabel(labels.outcome.expiredPartRefund, { merchant })}</Text>
            </>
          ) : (
            !maybePaid && due && <Text>{formatLabel(labels.outcome.expiredText, { date: due, merchant })}</Text>
          )}
          {unconfirmed ? (
            <Text>{formatLabel(labels.outcome.expiredUnconfirmed, { merchant })}</Text>
          ) : sent ? (
            <Text>{formatLabel(labels.outcome.expiredWhileConfirming, { merchant })}</Text>
          ) : mismatch ? (
            <Text>{formatLabel(labels.pay.mismatch, { merchant })}</Text>
          ) : qrShown ? (
            <Text>{formatLabel(labels.outcome.expiredAfterQr, { merchant })}</Text>
          ) : (
            <Text muted>{labels.outcome.expiredNote}</Text>
          )}
        </>
      );
      break;
    }
    case 'cancelled': {
      title = labels.outcome.cancelledTitle;
      // As for an expired invoice: a payment that may still arrive is recorded and held for the seller, and a
      // transaction that does not pay the invoice may have moved money, so never "nothing was charged"
      const maybePaid =
        isUnconfirmed(state.error) ||
        isPaymentOnTheWay(state) ||
        isInvoicePaymentOnTheWay(state, checkout) ||
        isInvoicePaymentUnresolved(state, checkout) ||
        paymentSent;
      const text = maybePaid
        ? labels.outcome.cancelledWhilePaying
        : isMovedMoneyFailure(state.error)
          ? labels.pay.mismatch
          : labels.outcome.cancelledText;
      body = <Text>{formatLabel(text, { merchant })}</Text>;
      break;
    }
    case 'replaced': {
      const replacement = checkout.invoice.replacedBy;
      const number = replacement?.number ?? '';
      title = formatLabel(labels.outcome.replacedTitle, { merchant });
      body = (
        <>
          <Text>{formatLabel(labels.outcome.replacedText, { number })}</Text>
          <Text muted>{labels.outcome.replacedPaid}</Text>
        </>
      );
      if (replacement?.checkoutToken) {
        const next = replacement.checkoutToken;
        action = (
          <PrimaryButton onClick={() => openInvoice(next)}>
            {formatLabel(labels.outcome.openReplacement, { number })}
          </PrimaryButton>
        );
      }
      break;
    }
    case 'blocked': {
      title = labels.outcome.blockedTitle;
      const payer = state.payer ? parseCaip10AccountId(state.payer)?.address : undefined;
      body = (
        <>
          <Text>{formatLabel(labels.outcome.blockedText, { merchant })}</Text>
          {payer && (
            <p className={cn(mono, 'novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]')}>
              {shortAddress(payer)}
            </p>
          )}
        </>
      );
      if (method) {
        action = (
          <PrimaryButton onClick={() => void connectWallet(method)}>{labels.outcome.useAnotherWallet}</PrimaryButton>
        );
      }
      break;
    }
  }

  return (
    <>
      <section
        role={kind === 'blocked' ? 'alert' : undefined}
        className="novapay:flex novapay:flex-1 novapay:flex-col novapay:items-center novapay:justify-center novapay:gap-3 novapay:px-5 novapay:py-6 novapay:text-center"
      >
        {StatusIcon ? (
          <StatusIcon kind={kind} className={iconClassName} />
        ) : (
          <Icon aria-hidden className={cn('novapay:h-12 novapay:w-12', tone, iconClassName)} />
        )}
        <h2 {...screenHeading} className={cn(screenTitle, 'novapay:max-w-sm')}>
          {title}
        </h2>
        {body}
      </section>
      <ScreenFooter>
        {action}
        <ContactLink />
      </ScreenFooter>
    </>
  );
}
