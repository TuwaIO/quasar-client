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
import type { CheckoutScreen } from '../utils/checkout';
import { formatFiat, formatTokenAmount, minorToDecimal, shortAddress } from '../utils/format';
import { networkName, payerFor } from '../utils/methods';
import { contactHref, underpaidRest } from '../utils/outcome';
import { instructionsChainId } from '../utils/pay';
import { focusRing, mono } from './classes';
import { checkoutClassName } from './customization';
import { PrimaryButton, ScreenFooter } from './ScreenParts';

/** The outcomes this screen shows. */
export type OutcomeKind = Extract<
  CheckoutScreen,
  'underpaid' | 'held' | 'refunded' | 'expired' | 'cancelled' | 'replaced' | 'blocked'
>;

/** The icon and tone of each outcome. */
const LOOK: Record<OutcomeKind, { Icon: ComponentType<SVGProps<SVGSVGElement>>; tone: string }> = {
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
  const { checkout, labels, onContact } = useCheckoutContext();
  if (!checkout) return null;
  const text = formatLabel(labels.outcome.contact, { merchant: checkout.merchant.name });
  const className = cn(
    'novapay:inline-flex novapay:min-h-6 novapay:items-center novapay:justify-center novapay:text-xs novapay:font-semibold novapay:text-[var(--tuwa-text-accent)] novapay:underline novapay:hover:no-underline',
    focusRing,
  );
  if (onContact) {
    return (
      <button
        type="button"
        onClick={onContact}
        className={cn(className, 'novapay:cursor-pointer novapay:border-0 novapay:bg-transparent')}
      >
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
 * An outcome other than paid: an underpaid invoice ("Pay the rest"), a payment the seller reviews (screening, late,
 * overpaid), a refunded, expired or cancelled invoice, a corrected one ("Open <new invoice>" opens it here) and a payer
 * the wallet check refused ("Use another wallet"). Each offers to contact the seller.
 *
 * @param props - The outcome.
 * @param props.kind - Which outcome.
 * @returns The outcome step.
 */
export function OutcomeScreen({ kind }: { kind: OutcomeKind }) {
  const context = useCheckoutContext();
  const { checkout, state, store, labels, locale, wallet, connectWallet, openInvoice } = context;
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
  const token = (amount: string) =>
    quote ? `${formatTokenAmount(amount, quote.decimals, locale)} ${quote.instructions.symbol}` : amount;

  let title: string;
  let body: ReactNode = null;
  let action: ReactNode = null;

  switch (kind) {
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
      const reason = checkout.invoice.review?.reason;
      const text =
        reason === 'late'
          ? labels.outcome.heldLate
          : reason === 'overpaid'
            ? labels.outcome.heldOverpaid
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
    case 'expired':
      title = labels.outcome.expiredTitle;
      body = (
        <>
          {due && <Text>{formatLabel(labels.outcome.expiredText, { date: due, merchant })}</Text>}
          <Text muted>{labels.outcome.expiredNote}</Text>
        </>
      );
      break;
    case 'cancelled':
      title = labels.outcome.cancelledTitle;
      body = <Text>{formatLabel(labels.outcome.cancelledText, { merchant })}</Text>;
      break;
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
        <h2 className={cn(mono, 'novapay:m-0 novapay:max-w-sm novapay:text-base novapay:font-bold')}>{title}</h2>
        {body}
      </section>
      <ScreenFooter>
        {action}
        <ContactLink />
      </ScreenFooter>
    </>
  );
}
