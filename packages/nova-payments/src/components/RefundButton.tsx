import { CloseIcon, cn, Dialog, DialogContent, DialogTitle } from '@tuwaio/nova-core';
import type { RefundPreview } from '@tuwaio/quasar-sdk';
import type { RefundState, RefundStore } from '@tuwaio/quasar-sdk/checkout';
import { type ReactNode, useEffect, useEffectEvent, useId, useRef, useState } from 'react';

import { usePaymentsLabels } from '../hooks/usePaymentsLabels';
import { type RefundFlow, type RefundRequest, useRefund } from '../hooks/useRefund';
import { formatLabel, type NovaPaymentsLabels } from '../i18n';
import { formatFeeAmount, formatTokenAmount, shortAddress } from '../utils/format';
import type { PaymentFamily } from '../utils/methods';
import { refundRateMoved } from '../utils/outcome';
import { capsLabel } from './capsLabel';
import { iconButton, mono, primaryAction } from './classes';
import { RadioCards } from './RadioCards';
import {
  ChainLink,
  DetailRow,
  DetailsCard,
  FooterNote,
  PrimaryButton,
  ScreenContent,
  ScreenError,
  ScreenFooter,
  SecondaryButton,
  WalletWait,
} from './ScreenParts';

/** A refund of the store (`Refund` of `@tuwaio/quasar-sdk`). */
type Refund = NonNullable<RefundState['refund']>;

/** Props of {@link RefundDialog}. */
export interface RefundDialogProps {
  /** Whether the window is open. */
  open: boolean;
  /**
   * Opens or closes the window.
   *
   * @param open - Whether it is open.
   */
  onOpenChange: (open: boolean) => void;
  /**
   * The refund store (`createRefundStore` of `@tuwaio/quasar-sdk/checkout`), whose calls the app runs on its server
   * with the secret key. One store per invoice: it keeps the refund while the window is closed.
   */
  store: RefundStore;
  /** The paid invoice to refund. */
  invoiceId: string;
  /** Its number, shown in the title and in the transaction of Pulsar. */
  invoice?: string;
  /** The refund the app worked out (amount, mode, reason): asked for at once, without the amount step. */
  params?: RefundRequest;
  /** The invoice currency, for the amount step. Defaults to `USD`. */
  currency?: string;
  /** What is left to refund, with its currency, shown under the amount (`20.00 USD`). */
  refundable?: string;
  /** The language (a BCP 47 tag). Defaults to `en`. */
  locale?: string;
  /** Rows the app adds: to the confirm step (what the refund takes back) and to the refunded step. */
  details?: { confirm?: ReactNode; done?: ReactNode };
  /** "Record refund": the app's form for a refund sent another way; offered when the wallet does not send it. */
  onRecord?: () => void;
  /**
   * Connects a wallet of the payment's chain family, for apps without Nova Connect; overrides the `onConnectWallet` of
   * `NovaPaymentsProvider`. Inside `NovaConnectProvider` (the app's, or Nova's own connection) the window opens its
   * connect modal instead.
   *
   * @param family - The chain family of the payment.
   */
  onConnectWallet?: (family: PaymentFamily) => void;
  /**
   * Called once Quasar confirmed the refund and issued its credit note.
   *
   * @param refund - The confirmed refund (`Refund` of `@tuwaio/quasar-sdk`).
   */
  onRefunded?: (refund: NonNullable<RefundState['refund']>) => void;
}

/** Props of {@link RefundButton}. */
export interface RefundButtonProps extends Omit<RefundDialogProps, 'open' | 'onOpenChange'> {
  /** The button's text. Defaults to the `refund.button` label. */
  label?: ReactNode;
  /** Classes of the button. */
  className?: string;
  /** Whether the button is disabled. */
  disabled?: boolean;
}

/**
 * A button that refunds a paid invoice from the merchant's connected wallet: it opens {@link RefundDialog}. Put it
 * inside {@link NovaPaymentsProvider}: it uses the provider's wallet connection (the app's Satellite store and Nova
 * Connect when the app has them, else Nova's own `ownConnection`) and its adapters. In an app whose wallets connect
 * without Nova Connect, pass `onConnectWallet` here or to the provider.
 *
 * @param props - See {@link RefundButtonProps}.
 * @returns The button and its window.
 *
 * @example
 * ```tsx
 * import { createRefundStore } from '@tuwaio/quasar-sdk/checkout';
 * import { RefundButton } from '@tuwaio/nova-payments';
 *
 * // refundInvoice, submitRefund and getRefund are Server Actions calling quasar.payments
 * const refunds = createRefundStore({ request: refundInvoice, submit: submitRefund, get: getRefund });
 *
 * <RefundButton store={refunds} invoiceId={invoice.id} invoice={invoice.number} currency="USD" />;
 * ```
 */
export function RefundButton({ label, className, disabled, ...props }: RefundButtonProps) {
  const [open, setOpen] = useState(false);
  const labels = usePaymentsLabels(props.locale ?? 'en');
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(primaryAction, 'novapay:w-auto novapay:px-4', className)}
      >
        {label ?? labels.refund.button}
      </button>
      <RefundDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * The window of a refund from the merchant's wallet: what to refund (skipped
 * with `params`), a wallet of the payment's network, the confirmation (what goes where, from which wallet with its
 * balance, the network fee, and the app's rows), the wallet's prompt, the transaction on its way, and the credit note.
 * A refund the wallet did not send says why, offers to send it again and the app's "Record refund". The refund
 * goes on while the window is closed: the store follows it.
 *
 * Side effects: those of `useRefund` (the store's calls, wallet prompts, balance and fee reads, the Pulsar store).
 *
 * @param props - See {@link RefundDialogProps}.
 * @returns The window.
 */
export function RefundDialog({ open, onOpenChange, locale = 'en', onRefunded, ...props }: RefundDialogProps) {
  const labels = usePaymentsLabels(locale);
  const flow = useRefund({
    store: props.store,
    invoiceId: props.invoiceId,
    invoice: props.invoice,
    params: open ? props.params : undefined,
    open,
    labels,
    locale,
    onConnectWallet: props.onConnectWallet,
  });
  const refunded = useEffectEvent((refund: Refund) => onRefunded?.(refund));
  // The store stops following a confirmed refund: this object changes once
  const confirmed = flow.phase === 'confirmed' ? flow.refund : null;
  useEffect(() => {
    if (confirmed) refunded(confirmed);
  }, [confirmed]);

  const title = props.invoice ? formatLabel(labels.refund.title, { invoice: props.invoice }) : labels.refund.button;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="novapay:w-full novapay:sm:w-[440px]">
        <div className="novapay:flex novapay:items-center novapay:justify-between novapay:gap-3 novapay:border-b novapay:border-[var(--tuwa-border-primary)] novapay:px-5 novapay:py-3">
          <DialogTitle className={cn(mono, 'novapay:m-0 novapay:truncate novapay:text-sm novapay:font-bold')}>
            {title}
          </DialogTitle>
          <button
            type="button"
            aria-label={labels.refund.close}
            onClick={() => onOpenChange(false)}
            className={iconButton}
          >
            <CloseIcon aria-hidden className="novapay:h-4 novapay:w-4" />
          </button>
        </div>
        <RefundSteps flow={flow} labels={labels} locale={locale} close={() => onOpenChange(false)} {...props} />
      </DialogContent>
    </Dialog>
  );
}

/** The step of a refund the window shows. @internal */
export function RefundSteps({
  flow,
  labels,
  locale,
  close,
  currency = 'USD',
  refundable,
  details,
  onRecord,
}: Pick<RefundDialogProps, 'currency' | 'refundable' | 'details' | 'onRecord'> & {
  flow: RefundFlow;
  labels: NovaPaymentsLabels;
  locale: string;
  close: () => void;
}) {
  const text = labels.refund;
  const values = {
    network: flow.network,
    symbol: flow.transfer?.symbol ?? flow.refund?.assetId ?? '',
    amount: flow.amount,
    wallet: flow.wallet?.name ?? '',
  };
  // The hash Quasar follows now: after a speed-up it is not the one this window sent
  const sentHash = flow.refund?.txHash ?? flow.txKey;
  const recordAction = onRecord && (
    <>
      <SecondaryButton onClick={onRecord}>{text.record}</SecondaryButton>
      <FooterNote>{text.recordHint}</FooterNote>
    </>
  );

  switch (flow.step) {
    case 'amount':
      return <AmountStep flow={flow} labels={labels} locale={locale} currency={currency} refundable={refundable} />;
    case 'requesting':
    case 'submitting':
      return <Waiting>{flow.step === 'requesting' ? text.requesting : text.submitting}</Waiting>;
    case 'switching':
    case 'wallet':
      return (
        <>
          <Waiting walletId={flow.wallet?.walletId} walletIcon={flow.wallet?.icon}>
            <strong className={cn(mono, 'novapay:text-sm')}>
              {formatLabel(flow.step === 'switching' ? text.switchTitle : text.walletTitle, values)}
            </strong>
            {flow.step === 'wallet' && <span>{formatLabel(text.walletText, values)}</span>}
          </Waiting>
          {/* A wallet can lose the request and never answer: the merchant must not be trapped here */}
          <ScreenFooter>
            <SecondaryButton onClick={flow.dismiss}>{labels.walletPrompt.cancel}</SecondaryButton>
          </ScreenFooter>
        </>
      );
    case 'connect':
      return (
        <>
          <ScreenContent title={text.connectTitle} subtitle={formatLabel(text.connectText, values)}>
            {flow.problem === 'noRecipient' && <ScreenError>{text.noRecipient}</ScreenError>}
            {!flow.canConnect && <ScreenError>{text.connectUnavailable}</ScreenError>}
          </ScreenContent>
          <ScreenFooter>
            {flow.canConnect && flow.problem !== 'noRecipient' && (
              <PrimaryButton busy={flow.connecting} onClick={flow.connect}>
                {text.connect}
              </PrimaryButton>
            )}
            {recordAction}
          </ScreenFooter>
        </>
      );
    case 'confirm':
      return (
        <ConfirmStep
          flow={flow}
          labels={labels}
          locale={locale}
          values={values}
          details={details?.confirm}
          recordAction={recordAction}
        />
      );
    case 'confirming':
      return (
        <>
          <ScreenContent title={text.onItsWay}>
            <DetailsCard>
              <DetailRow name={text.status}>{text.pending}</DetailRow>
              {sentHash && (
                <DetailRow name={text.transaction}>
                  <ChainLink hash={sentHash} explorerUrl={flow.transactionUrl(sentHash)} labels={labels} />
                </DetailRow>
              )}
              <DetailRow name={text.network}>{formatLabel(text.waiting, values)}</DetailRow>
            </DetailsCard>
            {/* Nobody knows it landed: a replacement in the wallet has another hash, and the merchant can see which */}
            {isSlow(flow.refund) && <FooterNote>{text.slowNote}</FooterNote>}
          </ScreenContent>
          <ScreenFooter>
            <SecondaryButton onClick={close}>{text.close}</SecondaryButton>
            {isSlow(flow.refund) ? recordAction : <FooterNote>{text.canClose}</FooterNote>}
          </ScreenFooter>
        </>
      );
    case 'confirmed':
      return (
        <>
          <ScreenContent title={text.refunded}>
            <DetailsCard>
              {flow.refund?.creditNoteNumber && (
                <DetailRow name={text.creditNote}>{flow.refund.creditNoteNumber}</DetailRow>
              )}
              {sentHash && (
                <DetailRow name={text.transaction}>
                  <ChainLink hash={sentHash} explorerUrl={flow.transactionUrl(sentHash)} labels={labels} />
                </DetailRow>
              )}
              {details?.done}
            </DetailsCard>
          </ScreenContent>
          <ScreenFooter>
            <PrimaryButton onClick={close}>{text.done}</PrimaryButton>
          </ScreenFooter>
        </>
      );
    case 'failed':
      return (
        <FailedStep
          flow={flow}
          labels={labels}
          locale={locale}
          values={values}
          recordAction={recordAction}
          close={close}
        />
      );
  }
}

// The reasons Quasar names in words: a code on the screen tells nobody what to do
const FAILURE_LABELS: Readonly<Record<string, keyof NovaPaymentsLabels['refund']>> = {
  amount_short: 'failedShort',
  over_limit: 'failedByHand',
  tx_of_another_refund: 'failedByHand',
  refund_from_buyer: 'failedFromBuyer',
  transaction_failed: 'failedNotFound',
  dropped: 'failedDropped',
  too_early: 'failedTooEarly',
  no_matching_transfer: 'failedNoTransfer',
  withdrawn: 'failedWithdrawn',
  cancelled: 'failedCancelling',
  cancelled_final: 'failedCancelled',
  resend_confirmed: 'failedResendConfirmed',
};

// Why it failed, in words for what the merchant can act on: part of it arrived, so asking again sends only the rest. A
// reason this package does not know reads as a failed transaction, never as its code
const failureText = (
  refund: Refund | null | undefined,
  text: NovaPaymentsLabels['refund'],
  values: Record<string, string>,
) => {
  const label = refund?.failureReason ? FAILURE_LABELS[refund.failureReason] : undefined;
  return label ? text[label] : formatLabel(text.failedText, values);
};

// A refund the merchant closed is no failure: under "The refund failed" it read as if something had gone wrong with the money
const FAILURE_TITLES: Readonly<Record<string, keyof NovaPaymentsLabels['refund']>> = {
  withdrawn: 'failedWithdrawnTitle',
  cancelled: 'failedCancelledTitle',
  cancelled_final: 'failedCancelledTitle',
};

const failureTitle = (refund: Refund | null | undefined, text: NovaPaymentsLabels['refund']) =>
  text[(refund?.failureReason && FAILURE_TITLES[refund.failureReason]) || 'failedTitle'];

// What Quasar answers in English goes to the logs of an app: a merchant reads a refusal in the language of the window, in words
// for what can be done. A code this package does not know says that Quasar refused, never the code itself.
const REFUSAL_LABELS: Readonly<Record<string, keyof NovaPaymentsLabels['refund']>> = {
  refund_repriced: 'movedTitle',
  request_failed: 'unreachable',
  amount_exceeds_refundable: 'refusedAmount',
  invoice_not_refundable: 'refusedNotRefundable',
  payment_unknown: 'refusedNotRefundable',
  held_transfer_not_refundable: 'refusedNotRefundable',
  held_refund_must_be_whole: 'refusedWhole',
  sender_blocked: 'refusedBlocked',
  refund_not_waiting: 'refusedNotWaiting',
  refund_may_have_landed: 'refusedMayHaveLanded',
  refund_from_buyer: 'failedFromBuyer',
  method_not_priced: 'refusedPrice',
  price_no_rpc: 'refusedPrice',
  price_unavailable: 'refusedPrice',
  mainnet_disabled_on_node: 'refusedTestOnly',
};

// How long a refund on its way looks normal. After that the window says what it knows: Quasar has not seen it land, and a
// replacement in the wallet has another hash than the one sent
const SLOW_REFUND_MS = 10 * 60 * 1000;
// Since it last changed, as Quasar counts before it takes the hash a merchant names: a refund asked for long before it was
// sent is not slow yet
/** Whether a refund has been on its way for long, from when it last changed. @internal */
export const isSlow = (refund: Pick<Refund, 'createdAt' | 'updatedAt'> | null | undefined) => {
  const since = refund?.updatedAt ?? refund?.createdAt;
  return Boolean(since) && Date.now() - Date.parse(since as string) > SLOW_REFUND_MS;
};

/** A refusal of Quasar in the words of the window, or of the app when it said it in the reader's language. @internal */
export const refusalText = (error: { code: string; text?: string }, text: NovaPaymentsLabels['refund']): string =>
  error.text ?? text[REFUSAL_LABELS[error.code] ?? 'refusedOther'];

// Its own transaction cannot settle it: Quasar refuses another refund until a person checks it
const byHand = (refund: Refund | null | undefined) =>
  refund?.failureReason === 'over_limit' || refund?.failureReason === 'tx_of_another_refund';

// The same refund asked for again, after its transaction failed on-chain
const requestOf = (refund: Refund): RefundRequest => {
  // The rest of a refund that arrived short is asked for by its amount, whatever it asked for first
  const byAmount = refund.mode === 'fiat_value' || refund.failureReason === 'amount_short';
  return {
    mode: byAmount ? 'fiat_value' : refund.mode,
    ...(byAmount && { amount: refund.amount }),
    ...(refund.reason && { reason: refund.reason }),
  };
};

/**
 * Asks for a refund after looking at what it would send: once asked for, it holds its amount and nothing cancels it. A
 * refund that would send a noticeably different number of tokens than its amount took at the payment waits on a screen
 * of its own, and going on looks again, so the merchant never sends another number than the one read. Nothing is asked
 * for once the step is gone.
 */
function useAskRefund(flow: RefundFlow) {
  const [checking, setChecking] = useState(false);
  const [moved, setMoved] = useState<{ preview: RefundPreview; request: RefundRequest } | null>(null);
  const gone = useRef(false);
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
    };
  }, []);
  const ask = async (request: RefundRequest, read?: RefundPreview) => {
    if (request?.mode === 'fiat_value') {
      setChecking(true);
      const preview = await flow.preview(request);
      if (gone.current) return;
      setChecking(false);
      // Refused as the refund would be: the error shows
      if (preview === 'refused') return;
      // Against what the screen showed once it showed something, else against the rate of the payment
      if (
        preview &&
        refundRateMoved(read ? { cryptoAmount: preview.cryptoAmount, atPaymentRate: read.cryptoAmount } : preview)
      ) {
        return setMoved({ preview, request });
      }
    }
    setMoved(null);
    void flow.start(request);
  };
  return { ask, checking, moved, back: () => setMoved(null) };
}

/** The screen of a refund whose price moved: what goes out against what came in, and going on or back. */
function movedScreen(
  { preview, request }: { preview: RefundPreview; request: RefundRequest },
  ask: ReturnType<typeof useAskRefund>,
  flow: RefundFlow,
  labels: NovaPaymentsLabels,
  locale: string,
  /** The amount step is what "back" returns to: its choice of the exact mode can be offered. */
  exactBehind: boolean,
) {
  const text = labels.refund;
  const tokens = (units: string) => `${formatTokenAmount(units, preview.decimals, locale)} ${preview.symbol}`;
  return (
    <>
      <ScreenContent title={text.movedTitle}>
        <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
          {formatLabel(text.movedText, { symbol: preview.symbol })}
        </p>
        <DetailsCard>
          <DetailRow name={text.movedSend}>{tokens(preview.cryptoAmount)}</DetailRow>
          {preview.atPaymentRate && <DetailRow name={text.movedAtPayment}>{tokens(preview.atPaymentRate)}</DetailRow>}
          {preview.received && <DetailRow name={text.movedReceived}>{tokens(preview.received)}</DetailRow>}
        </DetailsCard>
        {exactBehind && preview.exactPossible && (
          <FooterNote>{formatLabel(text.movedExact, { exact: text.modeExact })}</FooterNote>
        )}
        {flow.error && <ScreenError>{refusalText(flow.error, text)}</ScreenError>}
      </ScreenContent>
      <ScreenFooter>
        <PrimaryButton busy={ask.checking} onClick={() => void ask.ask(request, preview)}>
          {text.movedContinue}
        </PrimaryButton>
        <SecondaryButton disabled={ask.checking} onClick={ask.back}>
          {text.movedBack}
        </SecondaryButton>
      </ScreenFooter>
    </>
  );
}

/**
 * A refund whose transaction failed on-chain: why, then the same refund asked for again, priced now, or recorded.
 *
 * @internal
 */
export function FailedStep({
  flow,
  labels,
  locale,
  values,
  recordAction,
  close,
}: {
  flow: RefundFlow;
  labels: NovaPaymentsLabels;
  locale: string;
  values: Record<string, string>;
  recordAction: ReactNode;
  close: () => void;
}) {
  const text = labels.refund;
  const ask = useAskRefund(flow);
  // A held transfer's refund is settled on the transfer's row: asked again from here it would refund the whole invoice
  if (flow.refund?.heldTransfer) {
    return (
      <>
        <ScreenContent title={failureTitle(flow.refund, text)}>
          <ScreenError>{failureText(flow.refund, text, values)}</ScreenError>
          <FooterNote>{text.failedHeldNote}</FooterNote>
        </ScreenContent>
        <ScreenFooter>
          <PrimaryButton onClick={close}>{text.close}</PrimaryButton>
        </ScreenFooter>
      </>
    );
  }
  if (ask.moved) return movedScreen(ask.moved, ask, flow, labels, locale, false);
  return (
    <>
      <ScreenContent title={failureTitle(flow.refund, text)}>
        <ScreenError>{failureText(flow.refund, text, values)}</ScreenError>
        {flow.error && <ScreenError>{refusalText(flow.error, text)}</ScreenError>}
      </ScreenContent>
      <ScreenFooter>
        {byHand(flow.refund) ? (
          <PrimaryButton onClick={close}>{text.close}</PrimaryButton>
        ) : (
          <PrimaryButton busy={ask.checking} onClick={() => flow.refund && void ask.ask(requestOf(flow.refund))}>
            {text.sendRefund}
          </PrimaryButton>
        )}
        {recordAction}
      </ScreenFooter>
    </>
  );
}

/** A step that waits: the wallet's prompt (with its icon) or Quasar. */
function Waiting({ walletId, walletIcon, children }: { walletId?: string; walletIcon?: string; children: ReactNode }) {
  return (
    <section
      role="status"
      className="novapay:flex novapay:min-h-56 novapay:flex-col novapay:items-center novapay:justify-center novapay:gap-3 novapay:px-5 novapay:py-6 novapay:text-center"
    >
      <WalletWait walletId={walletId} walletIcon={walletIcon} />
      {children}
    </section>
  );
}

/**
 * What to refund: an amount of the invoice currency (everything left when empty) or everything received.
 *
 * @internal
 */
export function AmountStep({
  flow,
  labels,
  locale,
  currency,
  refundable,
}: {
  flow: RefundFlow;
  labels: NovaPaymentsLabels;
  locale: string;
  currency: string;
  refundable?: string;
}) {
  const text = labels.refund;
  const amountId = useId();
  const reasonId = useId();
  const [mode, setMode] = useState<'fiat_value' | 'exact_received'>('fiat_value');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const ask = useAskRefund(flow);
  const valid = mode === 'exact_received' || amount.trim() === '' || /^\d{1,12}(\.\d{1,2})?$/.test(amount.trim());
  const modes = [
    { key: 'fiat_value', title: text.modeFiat, hint: formatLabel(text.modeFiatText, { currency }) },
    { key: 'exact_received', title: text.modeExact, hint: text.modeExactText },
  ] as const;
  const field =
    'novapay:h-10 novapay:w-full novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:px-3 novapay:text-sm novapay:text-[var(--tuwa-text-primary)]';
  const request = {
    mode,
    ...(mode === 'fiat_value' && amount.trim() && { amount: amount.trim() }),
    ...(reason.trim() && { reason: reason.trim() }),
  };
  if (ask.moved) return movedScreen(ask.moved, ask, flow, labels, locale, true);
  return (
    <>
      <ScreenContent title={text.amountTitle}>
        {/* Held while it looks: what is asked for is what was typed */}
        <fieldset disabled={ask.checking} className="novapay:contents">
          <RadioCards
            label={text.amountTitle}
            items={[...modes]}
            value={mode}
            getKey={(item) => item.key}
            onChange={(key) => setMode(key as typeof mode)}
            className="novapay:flex novapay:flex-col novapay:gap-2"
            itemClassName={() => 'novapay:flex novapay:flex-col novapay:gap-0.5 novapay:px-3 novapay:py-2.5'}
          >
            {(item) => (
              <>
                <span className="novapay:text-sm novapay:font-semibold">{item.title}</span>
                <span className="novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">{item.hint}</span>
              </>
            )}
          </RadioCards>
          {mode === 'fiat_value' && (
            <label htmlFor={amountId} className="novapay:flex novapay:flex-col novapay:gap-1 novapay:text-xs">
              <span>
                {formatLabel(text.amount, { currency })}
                <span aria-hidden="true" className="novapay:text-[var(--tuwa-error-text)]">
                  {' '}
                  *
                </span>
              </span>
              <input
                id={amountId}
                required
                inputMode="decimal"
                value={amount}
                placeholder="0.00"
                aria-invalid={!valid || undefined}
                onChange={(event) => setAmount(event.target.value.replace(',', '.'))}
                className={cn(mono, field)}
              />
              {refundable && (
                <span className="novapay:text-[var(--tuwa-text-secondary)]">
                  {formatLabel(text.amountHint, { amount: refundable })}
                </span>
              )}
            </label>
          )}
          <label htmlFor={reasonId} className="novapay:flex novapay:flex-col novapay:gap-1 novapay:text-xs">
            <span>{text.reason}</span>
            <input
              id={reasonId}
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              className={field}
            />
          </label>
        </fieldset>
        {flow.error && <ScreenError>{refusalText(flow.error, text)}</ScreenError>}
      </ScreenContent>
      <ScreenFooter>
        <PrimaryButton busy={ask.checking} disabled={!valid} onClick={() => void ask.ask(request)}>
          {text.continue}
        </PrimaryButton>
      </ScreenFooter>
    </>
  );
}

/** What goes where: the confirmation before the wallet asks, or why it was not sent. @internal */
/**
 * A value with a note under it, both to the right edge of the row. An address link takes the whole width it is given, which left
 * it out of line with the note and with the rows above: the owner saw the step as smeared.
 */
function stackedValue(value: ReactNode, note?: string | null) {
  return (
    <span className="novapay:flex novapay:flex-col novapay:items-end novapay:gap-1">
      {value}
      {note && <span className="novapay:text-[var(--tuwa-text-secondary)]">{note}</span>}
    </span>
  );
}

export function ConfirmStep({
  flow,
  labels,
  locale,
  values,
  details,
  recordAction,
}: {
  flow: RefundFlow;
  labels: NovaPaymentsLabels;
  locale: string;
  values: Record<string, string>;
  details?: ReactNode;
  recordAction: ReactNode;
}) {
  const text = labels.refund;
  const transfer = flow.transfer;
  const balance =
    typeof flow.balance === 'bigint' && transfer
      ? `${formatTokenAmount(flow.balance.toString(), transfer.decimals, locale)} ${transfer.symbol}`
      : null;
  const feeAmount = flow.fee ? formatFeeAmount(flow.fee.amount.toString(), flow.fee.decimals, locale) : null;
  const fee = flow.fee && feeAmount ? `${feeAmount} ${flow.fee.symbol}` : null;
  const problems: Record<string, string> = {
    notEnough: formatLabel(text.notEnough, {
      ...values,
      address: flow.wallet ? shortAddress(flow.wallet.address) : '',
      balance: balance ?? '',
    }),
    declined: formatLabel(text.declined, values),
    unsupported: formatLabel(text.unsupported, values),
    wrongNetwork: formatLabel(text.wrongNetwork, values),
    failed: text.failed,
    noRecipient: text.noRecipient,
    fromBuyer: text.failedFromBuyer,
    stillInWallet: formatLabel(labels.walletPrompt.stillWaiting, values),
    unreachable: text.unreachable,
  };
  const notSent = Boolean(flow.problem);
  // The wallet sent it and Quasar has not taken it yet: hand the same transaction over again
  const handOver = Boolean(flow.txKey);
  return (
    <>
      <ScreenContent title={notSent ? text.notSent : text.confirmTitle}>
        <DetailsCard>
          <DetailRow name={text.send}>{values.amount}</DetailRow>
          <DetailRow name={text.network}>{values.network}</DetailRow>
          {transfer && (
            <DetailRow name={text.to}>
              {stackedValue(
                <ChainLink hash={transfer.to} explorerUrl={flow.addressUrl(transfer.to)} labels={labels} />,
                flow.refund?.heldTransfer ? text.theSender : text.thePayer,
              )}
            </DetailRow>
          )}
          {flow.wallet && (
            <DetailRow name={text.from}>
              {stackedValue(
                <ChainLink
                  hash={flow.wallet.address}
                  explorerUrl={flow.addressUrl(flow.wallet.address)}
                  labels={labels}
                />,
                balance && formatLabel(text.balance, { amount: balance }),
              )}
            </DetailRow>
          )}
          {fee && <DetailRow name={text.networkFee}>{formatLabel(text.feeEstimate, { amount: fee })}</DetailRow>}
          {details}
        </DetailsCard>
        {flow.problem && <ScreenError>{problems[flow.problem]}</ScreenError>}
        {flow.problem && !['noRecipient', 'unreachable', 'stillInWallet'].includes(flow.problem) && (
          <FooterNote>{text.nothingSent}</FooterNote>
        )}
        {handOver && flow.error && <ScreenError>{text.notHandedOver}</ScreenError>}
        {/* Quasar refused the transaction for good: it is forgotten, and the page says why instead of offering it again */}
        {!handOver && flow.error && flow.problem !== 'unreachable' && (
          <ScreenError>{refusalText(flow.error, text)}</ScreenError>
        )}
      </ScreenContent>
      <ScreenFooter>
        {flow.problem !== 'noRecipient' &&
          (flow.wrongNetwork && !handOver ? (
            <PrimaryButton onClick={() => void flow.switchNetwork()}>{capsLabel(text.switchTo, values)}</PrimaryButton>
          ) : (
            <PrimaryButton busy={flow.sending} onClick={() => void flow.send()}>
              {handOver ? text.handOver : text.sendRefund}
            </PrimaryButton>
          ))}
        {(notSent || handOver) && recordAction}
        {!notSent && !handOver && flow.wallet && (
          <SecondaryButton onClick={flow.connect}>{labels.pay.changeWallet}</SecondaryButton>
        )}
      </ScreenFooter>
    </>
  );
}
