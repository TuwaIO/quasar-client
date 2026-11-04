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
import { HashLink } from '@tuwaio/nova-transactions';
import { parseCaip10AccountId } from '@tuwaio/orbit-core';
import type { ComponentType, ReactNode, SVGProps } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel, type NovaPaymentsLabels } from '../i18n';
import {
  type CheckoutScreen,
  isInvoicePaymentOnTheWay,
  isInvoicePaymentUnresolved,
  isMovedMoneyFailure,
  isPaymentOnTheWay,
  type UnconfirmedFollowUp,
  unconfirmedFollowUp,
  unconfirmedTxKey,
} from '../utils/checkout';
import { formatFiat, formatTokenAmount, minorToDecimal, shortAddress } from '../utils/format';
import { networkName, payerFor } from '../utils/methods';
import {
  addressOfWallet,
  contactHref,
  isSameWallet,
  leftTheWalletText,
  methodErrorText,
  receivedAmount,
  restRateText,
  underpaidRest,
} from '../utils/outcome';
import { instructionsChainId } from '../utils/pay';
import { AutoPayNote } from './AutoPayNote';
import { mono, screenHeading, screenTitle, secondaryAction } from './classes';
import { checkoutClassName } from './customization';
import { DetailRow, DetailsCard, PrimaryButton, ScreenError, ScreenFooter, SecondaryButton } from './ScreenParts';
import { TxLabels } from './TxLabels';

/** The outcomes this screen shows. */
export type OutcomeKind = Extract<
  CheckoutScreen,
  'unconfirmed' | 'underpaid' | 'held' | 'refunded' | 'expired' | 'cancelled' | 'replaced' | 'blocked'
>;

/** Whether the last error says that Quasar could not confirm a payment, which may still arrive. */
// `payment_unconfirmed` is newer than some `@tuwaio/quasar-sdk` alphas: compare it as a string
const isUnconfirmed = (error: { code: string } | null | undefined) => error?.code === 'payment_unconfirmed';

/** The note about a payment Quasar did not confirm, by what Quasar does with it. */
const FOLLOW_UP_NOTE: Record<UnconfirmedFollowUp, keyof NovaPaymentsLabels['outcome']> = {
  rechecked: 'unconfirmedNote',
  retrying: 'unconfirmedRetrying',
  notReceived: 'unconfirmedNotReceived',
  contact: 'unconfirmedContact',
  closed: 'unconfirmedClosed',
  takenElsewhere: 'unconfirmedTakenElsewhere',
  settlementRetrying: 'unconfirmedSettlementRetrying',
  settlementFailed: 'unconfirmedSettlementFailed',
};

/**
 * Follow-ups after which the buyer names the transaction to the seller: Quasar does not record the payment, decides
 * which invoice it pays, or has not recorded it yet.
 */
const FOR_THE_SELLER: ReadonlySet<UnconfirmedFollowUp> = new Set([
  'notReceived',
  'contact',
  'closed',
  'takenElsewhere',
  'settlementRetrying',
  'settlementFailed',
]);

/**
 * Follow-ups of a payment that left the wallet and may still pay the invoice: the screen offers no payment ("The
 * payment did not leave my wallet" would not be true, and `payAgain` of the checkout store does nothing for them).
 */
const LEFT_THE_WALLET: ReadonlySet<UnconfirmedFollowUp> = new Set([
  'takenElsewhere',
  'settlementRetrying',
  'settlementFailed',
]);

/** Whether two account addresses are one: EVM ones in any case, Solana (base58) ones exactly. */

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
 * checks the wallet before paying again; only while Quasar still reads it again, `error.rechecked` of the checkout
 * store, the screen says that Quasar checks it for 24 hours and records it for the seller if it arrives; while the
 * store hands a transaction the wallet sent over again, the buyer keeps the page open; otherwise (a reason Quasar never
 * reads again, a hand-over the store gave up) the buyer contacts the seller with the transaction hash, which the screen
 * shows; a transfer that moved money without paying the invoice says so, and one Quasar credited to another invoice
 * says that it pays that one; a transaction the page of another invoice handed over first, which Quasar credits to the
 * invoice whose quoted wallet sent it, and a payment the network confirmed that Quasar has not recorded yet are named
 * with their hash for the seller, and the buyer is asked not to pay again; no payment is offered, only, on a payable
 * invoice and for a payment that may not have left the wallet, "The payment did not leave my wallet", which goes back
 * to it with `payAgain` of the checkout store), an
 * underpaid invoice ("Pay the rest"), a payment the seller reviews (screening,
 * late, overpaid, after the price lock ran out), a refunded invoice, an expired one (with what arrived before the
 * deadline, which the seller can refund; never "nothing was charged" while a payment may still arrive: one this page
 * handed over or saw on its way, or that the wallet sent, also after the checkout stopped following it, which Quasar
 * records and shows to the seller if it arrives, one Quasar could not confirm or reports as unresolved, to check in the
 * wallet, one Quasar does not read again or closed after 24 hours without a result, for the seller with its transaction
 * hash, one that does not pay the invoice and may have moved money, and after a QR code showed, a payment made with it,
 * as this page does not see it; while this page follows a payment on its way, until when it does, `followingUntil` of
 * the checkout store), a cancelled one (the same: never "nothing was charged" while a payment may still
 * arrive, also after a QR code showed, and "recorded if it arrives" only for a payment Quasar records), a corrected one
 * ("Open <new invoice>" opens it here) and a payer the wallet check refused ("Use another wallet"). Each offers to
 * contact the seller.
 *
 * @param props - The outcome.
 * @param props.kind - Which outcome.
 * @returns The outcome step.
 */
export function OutcomeScreen({ kind }: { kind: OutcomeKind }) {
  const context = useCheckoutContext();
  const {
    checkout,
    state,
    store,
    labels,
    locale,
    now,
    wallet,
    connectWallet,
    openInvoice,
    qrShown,
    paymentSent,
    adapterFor,
    lockPrice,
  } = context;
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
  // What Quasar does with a payment it did not confirm, the note that says it, and the transaction to name to the seller
  const followUp = unconfirmedFollowUp(state.error);
  const followUpNote = (next: UnconfirmedFollowUp) => formatLabel(labels.outcome[FOLLOW_UP_NOTE[next]], { merchant });
  // Until when this page follows a payment on its way to an expired or cancelled invoice: past it, it shows nothing more
  // without a reload. `followingUntil` is newer than some `@tuwaio/quasar-sdk` alphas
  const followingUntil = (state as { followingUntil?: string | null }).followingUntil ?? null;
  const followNote = followingUntil ? (
    <Text muted>
      {formatLabel(labels.outcome.followingUntil, {
        time: new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(Date.parse(followingUntil)),
      })}
    </Text>
  ) : null;
  const unconfirmedKey = unconfirmedTxKey(state, checkout);
  const transaction = (next: UnconfirmedFollowUp | 'mismatch' | null) => {
    if (!unconfirmedKey || (next !== 'mismatch' && (!next || !FOR_THE_SELLER.has(next)))) return null;
    const locked = quote ?? checkout.quote;
    const chainId = locked ? instructionsChainId(locked.instructions) : null;
    const explorerUrl =
      locked && chainId
        ? adapterFor(locked.instructions.family)?.explorerUrl?.({ chainId, txKey: unconfirmedKey })
        : undefined;
    return (
      <TxLabels>
        <DetailsCard className="novapay:w-full novapay:max-w-sm">
          <DetailRow name={labels.confirm.transaction}>
            <HashLink
              hash={unconfirmedKey}
              explorerUrl={explorerUrl}
              variant="compact"
              {...context.customization.childCustomizations?.hashLink}
            />
          </DetailRow>
        </DetailsCard>
      </TxLabels>
    );
  };

  let title: string;
  let body: ReactNode = null;
  let action: ReactNode = null;

  switch (kind) {
    case 'unconfirmed': {
      title = labels.outcome.unconfirmedTitle;
      if (isMovedMoneyFailure(state.error)) {
        // A transfer that moved money without paying the invoice (or that pays another one), which Quasar has not
        // called final: no re-check, the seller looks at it
        body = (
          <>
            <Text>{leftTheWalletText(state.error, labels, merchant)}</Text>
            {transaction('mismatch')}
          </>
        );
      } else if (followUp && LEFT_THE_WALLET.has(followUp)) {
        // It left the wallet: another invoice handed it over first (Quasar decides which one it pays), or the network
        // confirmed it and Quasar has not recorded it yet. Not "check your wallet before paying again"
        body = (
          <>
            <Text>{followUpNote(followUp)}</Text>
            {transaction(followUp)}
          </>
        );
      } else {
        // Only a payment Quasar still reads again gets the 24-hour promise; while the store hands a transaction over
        // again Quasar does not have it yet, so the page asks to stay open; any other is for the seller, with its hash
        const next = followUp ?? 'contact';
        body = (
          <>
            <Text>{labels.outcome.unconfirmedText}</Text>
            <Text muted>{followUpNote(next)}</Text>
            {transaction(next)}
          </>
        );
      }
      // `payAgain` is newer than some `@tuwaio/quasar-sdk` alphas, whose stores never reach this phase
      const { payAgain } = store.getState() as { payAgain?: () => void };
      const status = state.invoiceStatus ?? checkout.invoice.status;
      // Not the main button: the buyer pays again only after checking that the payment did not leave the wallet, and
      // only while the invoice can be paid
      if (payAgain && (status === 'open' || status === 'underpaid') && !(followUp && LEFT_THE_WALLET.has(followUp))) {
        action = <SecondaryButton onClick={() => payAgain()}>{labels.outcome.unconfirmedPayAgain}</SecondaryButton>;
      }
      break;
    }
    case 'underpaid': {
      const locked = quote ?? checkout.quote;
      const paid = checkout.invoice.amountPaid;
      const rest = underpaidRest(locked, paid);
      title = labels.outcome.underpaidTitle;
      const received = locked && paid && (
        <Text>
          {formatLabel(labels.outcome.underpaidText, {
            received: token(paid, locked),
            total: token(locked.cryptoAmountExpected, locked),
          })}
        </Text>
      );
      // Its method is off or nothing is left, as read or as Quasar refused it since. A first part that just arrived leaves
      // the earlier read of the open invoice here until the next read, which says nothing of a rest
      const restClosed =
        (checkout.invoice.status === 'underpaid' && checkout.invoice.restPayable === false) ||
        state.error?.code === 'method_not_found';
      if (restClosed) {
        body = (
          <>
            {received}
            <Text>{labels.outcome.underpaidClosed}</Text>
            {due && <Text>{formatLabel(labels.outcome.underpaidClosedRefund, { merchant, date: due })}</Text>}
          </>
        );
        break;
      }
      const rateNote = restRateText(locked, now, labels, merchant, locale, labels.outcome.underpaidRateEnded);
      // The rest of an underpaid invoice has one method, whatever the page chose before the part arrived
      const restMethod = method ?? checkout.methods[0];
      // Why the last attempt did nothing, or what happens to a transfer that moved money without counting. A refused
      // wallet has its own sentence below
      const problem =
        state.error?.code === 'payer_blocked'
          ? formatLabel(labels.outcome.underpaidBlocked, { merchant })
          : state.error && state.error.code !== 'payer_mismatch'
            ? methodErrorText(state.error, labels, merchant)
            : null;
      body = (
        <>
          {received}
          {locked && rest && (
            <Text>
              {formatLabel(labels.outcome.underpaidRest, {
                rest: token(rest, locked),
                network: networkName(instructionsChainId(locked.instructions)),
              })}
            </Text>
          )}
          {due && <Text muted>{formatLabel(labels.outcome.underpaidNote, { merchant, date: due })}</Text>}
          {rateNote && <Text muted>{rateNote}</Text>}
          {problem && <ScreenError>{problem}</ScreenError>}
        </>
      );
      // Only the wallet that paid first pays the rest; Quasar refuses another one (`payer_mismatch`)
      const connected = restMethod && wallet ? payerFor(wallet, restMethod) : null;
      const refusedFrom =
        (state.error as { code?: string; originWallet?: string } | null)?.code === 'payer_mismatch'
          ? ((state.error as { originWallet?: string }).originWallet ?? null)
          : null;
      const first = refusedFrom ?? checkout.invoice.originWallet ?? locked?.payer ?? null;
      const firstAddress = first ? addressOfWallet(first) : undefined;
      // The connected wallet decides once it is known (the buyer may have switched to the first one since a refusal)
      const connectedAddress = connected ? parseCaip10AccountId(connected)?.address : undefined;
      // A quote bound to no wallet is a Solana Pay QR: its first wallet is on a phone, and the QR of the rest names it
      const otherWallet =
        locked?.payer !== null &&
        Boolean(firstAddress && (connectedAddress ? !isSameWallet(connectedAddress, firstAddress) : refusedFrom));
      const payRest = () => {
        if (!restMethod) return;
        // Another wallet is connected: the buyer connects the one that paid first
        if (otherWallet) return void connectWallet(restMethod);
        // The same wallet pays the rest: Quasar quotes what is left for it
        const payer = locked?.payer === null ? null : connected;
        if (locked?.payer !== null && !payer) return void connectWallet(restMethod);
        if (state.methodId !== restMethod.id) store.getState().selectMethod(restMethod.id);
        store.getState().setPayer(payer);
        // Another wallet confirms the invoice first; the wallet that paid confirmed it already
        void lockPrice();
      };
      if (otherWallet && firstAddress) {
        body = (
          <>
            {body}
            <Text>{formatLabel(labels.outcome.payRestFirstWallet, { wallet: shortAddress(firstAddress) })}</Text>
          </>
        );
      }
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
      // Quasar could not confirm a payment (or has not recorded a confirmed one yet: an older store calls it a
      // mismatch), or reports one it reads again (unresolved), with none on its way: check the wallet
      const ownUnconfirmed =
        isUnconfirmed(state.error) || followUp === 'settlementFailed' || followUp === 'settlementRetrying';
      const unconfirmed = ownUnconfirmed || (!onItsWay && isInvoicePaymentUnresolved(state, checkout));
      // Quasar closed a payment after 24 hours without a result on chain: it may have left the wallet
      const closed = !unconfirmed && followUp === 'closed';
      const sent = !unconfirmed && !closed && (onItsWay || paymentSent);
      // The last transaction does not pay the invoice and may have moved money: never "nothing was charged"
      const mismatch = !unconfirmed && !closed && !sent && isMovedMoneyFailure(state.error);
      // A QR code may have been paid from a phone, which this page does not see: never "nothing was charged" either
      const maybePaid = sent || unconfirmed || closed || mismatch || qrShown;
      // What Quasar does with the payment it did not confirm: reads it again (also one it reports as unresolved without
      // an error), waits for the store's hand-over, or nothing (the seller looks at it)
      const unconfirmedNext: UnconfirmedFollowUp = ownUnconfirmed ? (followUp ?? 'contact') : 'rechecked';
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
            <>
              <Text>
                {unconfirmedNext === 'rechecked'
                  ? formatLabel(labels.outcome.expiredUnconfirmed, { merchant })
                  : followUpNote(unconfirmedNext)}
              </Text>
              {transaction(unconfirmedNext)}
            </>
          ) : closed ? (
            <>
              <Text>{followUpNote('closed')}</Text>
              {transaction('closed')}
            </>
          ) : sent ? (
            <>
              <Text>{formatLabel(labels.outcome.expiredWhileConfirming, { merchant })}</Text>
              {followNote}
            </>
          ) : mismatch ? (
            <>
              <Text>{leftTheWalletText(state.error, labels, merchant)}</Text>
              {transaction('mismatch')}
            </>
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
      // A payment Quasar does not record (one it never reads again, a hand-over the store gave up, one it closed after
      // 24 hours without a result) is for the seller to look at, with its transaction
      if (followUp && FOR_THE_SELLER.has(followUp)) {
        body = (
          <>
            <Text>{followUpNote(followUp)}</Text>
            {transaction(followUp)}
          </>
        );
        break;
      }
      const maybePaid =
        isUnconfirmed(state.error) ||
        isPaymentOnTheWay(state) ||
        isInvoicePaymentOnTheWay(state, checkout) ||
        isInvoicePaymentUnresolved(state, checkout) ||
        paymentSent;
      const mismatch = !maybePaid && isMovedMoneyFailure(state.error);
      // A QR code may have been paid from a phone, which this page does not see: never "nothing was charged" either
      const text = maybePaid
        ? formatLabel(labels.outcome.cancelledWhilePaying, { merchant })
        : mismatch
          ? leftTheWalletText(state.error, labels, merchant)
          : formatLabel(qrShown ? labels.outcome.cancelledAfterQr : labels.outcome.cancelledText, { merchant });
      body = (
        <>
          <Text>{text}</Text>
          {mismatch && transaction('mismatch')}
          {/* Quasar records it once it has it: the store keeps handing it over meanwhile */}
          {followUp === 'retrying' && <Text muted>{labels.outcome.unconfirmedRetrying}</Text>}
          {maybePaid && followNote}
        </>
      );
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
        <AutoPayNote />
      </ScreenFooter>
    </>
  );
}
