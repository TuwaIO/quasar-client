import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cn, Dialog, DialogContent, DialogTitle, WalletIcon } from '@tuwaio/nova-core';
import type { RefundState, RefundStore } from '@tuwaio/quasar-sdk/checkout';
import { type ReactNode, useEffect, useEffectEvent, useId, useState } from 'react';

import { usePaymentsLabels } from '../hooks/usePaymentsLabels';
import { type RefundFlow, type RefundRequest, useRefund } from '../hooks/useRefund';
import { formatLabel, type NovaPaymentsLabels } from '../i18n';
import { formatTokenAmount, shortAddress } from '../utils/format';
import type { PaymentFamily } from '../utils/methods';
import { iconButton, mono, primaryAction } from './classes';
import { RadioCards } from './RadioCards';
import {
  DetailRow,
  DetailsCard,
  FooterNote,
  PrimaryButton,
  ScreenContent,
  ScreenError,
  ScreenFooter,
  SecondaryButton,
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
 * The window of a refund from the merchant's wallet (spec §7.5, board RefundSendStates): what to refund (skipped
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
            <XMarkIcon aria-hidden className="novapay:h-4 novapay:w-4" />
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
  const recordAction = onRecord && (
    <>
      <SecondaryButton onClick={onRecord}>{text.record}</SecondaryButton>
      <FooterNote>{text.recordHint}</FooterNote>
    </>
  );

  switch (flow.step) {
    case 'amount':
      return <AmountStep flow={flow} labels={labels} currency={currency} refundable={refundable} />;
    case 'requesting':
    case 'submitting':
      return <Waiting>{flow.step === 'requesting' ? text.requesting : text.submitting}</Waiting>;
    case 'switching':
    case 'wallet':
      return (
        <Waiting walletId={flow.wallet?.walletId}>
          <strong className={cn(mono, 'novapay:text-sm')}>
            {formatLabel(flow.step === 'switching' ? text.switchTitle : text.walletTitle, values)}
          </strong>
          {flow.step === 'wallet' && <span>{formatLabel(text.walletText, values)}</span>}
        </Waiting>
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
              {flow.txKey && <DetailRow name={text.transaction}>{shortAddress(flow.txKey)}</DetailRow>}
              <DetailRow name={text.network}>{formatLabel(text.waiting, values)}</DetailRow>
            </DetailsCard>
          </ScreenContent>
          <ScreenFooter>
            <SecondaryButton onClick={close}>{text.close}</SecondaryButton>
            <FooterNote>{text.canClose}</FooterNote>
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
              {(flow.refund?.txHash ?? flow.txKey) && (
                <DetailRow name={text.transaction}>{shortAddress((flow.refund?.txHash ?? flow.txKey)!)}</DetailRow>
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
        <>
          <ScreenContent title={text.failedTitle}>
            <ScreenError>{flow.refund?.failureReason ?? formatLabel(text.failedText, values)}</ScreenError>
          </ScreenContent>
          <ScreenFooter>
            <PrimaryButton onClick={() => flow.refund && void flow.start(requestOf(flow.refund))}>
              {text.sendRefund}
            </PrimaryButton>
            {recordAction}
          </ScreenFooter>
        </>
      );
  }
}

// The same refund asked for again, after its transaction failed on-chain
const requestOf = (refund: Refund): RefundRequest => ({
  mode: refund.mode,
  ...(refund.mode === 'fiat_value' && { amount: refund.amount }),
  ...(refund.reason && { reason: refund.reason }),
});

/** A step that waits: the wallet's prompt (with its icon) or Quasar. */
function Waiting({ walletId, children }: { walletId?: string; children: ReactNode }) {
  return (
    <section
      role="status"
      className="novapay:flex novapay:min-h-56 novapay:flex-col novapay:items-center novapay:justify-center novapay:gap-3 novapay:px-6 novapay:py-8 novapay:text-center novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]"
    >
      <span className="novapay:relative novapay:h-12 novapay:w-12">
        {walletId && <WalletIcon walletName={walletId} />}
        <ArrowPathIcon
          aria-hidden
          className={cn(
            'novapay:animate-spin novapay:text-[var(--tuwa-text-accent)] novapay:motion-reduce:animate-none',
            walletId
              ? 'novapay:absolute novapay:-bottom-1 novapay:-right-1 novapay:h-5 novapay:w-5 novapay:rounded-full novapay:bg-[var(--tuwa-bg-primary)]'
              : 'novapay:h-12 novapay:w-12',
          )}
        />
      </span>
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
  currency,
  refundable,
}: {
  flow: RefundFlow;
  labels: NovaPaymentsLabels;
  currency: string;
  refundable?: string;
}) {
  const text = labels.refund;
  const amountId = useId();
  const reasonId = useId();
  const [mode, setMode] = useState<'fiat_value' | 'exact_received'>('fiat_value');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const valid = mode === 'exact_received' || amount.trim() === '' || /^\d{1,12}(\.\d{1,2})?$/.test(amount.trim());
  const modes = [
    { key: 'fiat_value', title: text.modeFiat, hint: formatLabel(text.modeFiatText, { currency }) },
    { key: 'exact_received', title: text.modeExact, hint: text.modeExactText },
  ] as const;
  const field =
    'novapay:h-10 novapay:w-full novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:px-3 novapay:text-sm novapay:text-[var(--tuwa-text-primary)]';
  return (
    <>
      <ScreenContent title={text.amountTitle}>
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
            <span>{formatLabel(text.amount, { currency })}</span>
            <input
              id={amountId}
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
        {flow.error && <ScreenError>{flow.error.message}</ScreenError>}
      </ScreenContent>
      <ScreenFooter>
        <PrimaryButton
          disabled={!valid}
          onClick={() =>
            void flow.start({
              mode,
              ...(mode === 'fiat_value' && amount.trim() && { amount: amount.trim() }),
              ...(reason.trim() && { reason: reason.trim() }),
            })
          }
        >
          {text.continue}
        </PrimaryButton>
      </ScreenFooter>
    </>
  );
}

/** What goes where: the confirmation before the wallet asks, or why it was not sent. @internal */
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
  const fee = flow.fee
    ? `${formatTokenAmount(flow.fee.amount.toString(), flow.fee.decimals, locale)} ${flow.fee.symbol}`
    : null;
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
  };
  const notSent = Boolean(flow.problem);
  // The wallet sent it and Quasar has not taken it yet: hand the same transaction over again
  const handOver = Boolean(flow.txKey);
  return (
    <>
      <ScreenContent title={notSent ? text.notSent : text.confirmTitle}>
        <DetailsCard>
          <DetailRow name={text.send}>{formatLabel(text.sendValue, values)}</DetailRow>
          {transfer && (
            <DetailRow name={text.to}>
              {shortAddress(transfer.to)} · {text.thePayer}
            </DetailRow>
          )}
          {flow.wallet && (
            <DetailRow name={text.from}>
              <span className="novapay:block">{shortAddress(flow.wallet.address)}</span>
              {balance && (
                <span className="novapay:mt-1 novapay:block novapay:text-[var(--tuwa-text-secondary)]">
                  {formatLabel(text.balance, { amount: balance })}
                </span>
              )}
            </DetailRow>
          )}
          {fee && <DetailRow name={text.networkFee}>{formatLabel(text.feeEstimate, { amount: fee })}</DetailRow>}
          {details}
        </DetailsCard>
        {flow.problem && <ScreenError>{problems[flow.problem]}</ScreenError>}
        {flow.problem && flow.problem !== 'noRecipient' && <FooterNote>{text.nothingSent}</FooterNote>}
        {handOver && flow.error && <ScreenError>{text.notHandedOver}</ScreenError>}
      </ScreenContent>
      <ScreenFooter>
        {flow.problem !== 'noRecipient' &&
          (flow.wrongNetwork && !handOver ? (
            <PrimaryButton onClick={() => void flow.switchNetwork()}>
              {formatLabel(text.switchTo, values)}
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={() => void flow.send()}>{handOver ? text.handOver : text.sendRefund}</PrimaryButton>
          ))}
        {(notSent || handOver) && recordAction}
        {!notSent && !handOver && flow.wallet && (
          <SecondaryButton onClick={flow.connect}>{labels.pay.changeWallet}</SecondaryButton>
        )}
      </ScreenFooter>
    </>
  );
}
