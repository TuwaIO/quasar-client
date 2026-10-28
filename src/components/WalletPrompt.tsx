import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { WalletIcon } from '@tuwaio/nova-core';
import { useEffect, useId, useRef } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel } from '../i18n';
import { screenTitle } from './classes';
import { DetailRow, DetailsCard, FooterAction, SecondaryButton } from './ScreenParts';

/**
 * What the wallet asks for: a gasless signature, a transaction, a network switch, the permission of automatic
 * payments, or Quasar takes the payment.
 */
export type WalletPromptKind = 'sign' | 'confirm' | 'switch' | 'permission' | 'submitting';

/** Props of {@link WalletPrompt}. */
export interface WalletPromptProps {
  /** What the wallet asks for. */
  kind: WalletPromptKind;
  /** The wallet's name. */
  walletName: string;
  /** The wallet's id, for its icon. */
  walletId: string;
  /** The amount with its symbol. */
  amount: string;
  /** The seller. */
  merchant: string;
  /** The network of the payment. */
  network: string;
  /** The recipient, shortened (not copyable: it is checked, never typed). */
  to: string;
  /** The countdown of the price lock; `null` once it ended. */
  priceTime: string | null;
  /** Asks the wallet again; only where a second request cannot pay twice (a signature). */
  onRetry?: () => void;
  /** Closes the window. */
  onCancel: () => void;
}

/**
 * The window over the pay step while the wallet asks the buyer: what to sign or confirm, and what to check in the
 * wallet before — the amount, the recipient, the network and the time left of the price (WCAG 3.3.4). The heading
 * takes the focus, so screen readers say what happens. "Try again" re-asks only for a signature; for a transaction
 * the buyer is sent to the wallet, where the request still waits, so it cannot be paid twice.
 *
 * @param props - See {@link WalletPromptProps}.
 * @returns The window.
 */
export function WalletPrompt({
  kind,
  walletName,
  walletId,
  amount,
  merchant,
  network,
  to,
  priceTime,
  onRetry,
  onCancel,
}: WalletPromptProps) {
  const { labels } = useCheckoutContext();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [kind]);
  const values = { wallet: walletName, amount, merchant, network };
  const title =
    kind === 'sign'
      ? labels.walletPrompt.signIn
      : kind === 'switch'
        ? labels.walletPrompt.switchIn
        : kind === 'submitting'
          ? labels.walletPrompt.submitting
          : kind === 'permission'
            ? labels.autoPay.approveIn
            : labels.walletPrompt.confirmIn;

  return (
    <section
      aria-labelledby={headingId}
      className="novapay:absolute novapay:inset-0 novapay:z-10 novapay:flex novapay:flex-col novapay:items-center novapay:justify-center novapay:gap-3 novapay:bg-[var(--tuwa-bg-primary)] novapay:px-6 novapay:py-5 novapay:text-center"
    >
      <span className="novapay:relative novapay:h-12 novapay:w-12">
        {walletId && <WalletIcon walletName={walletId} />}
        <ArrowPathIcon
          aria-hidden
          className="novapay:absolute novapay:-bottom-1 novapay:-right-1 novapay:h-5 novapay:w-5 novapay:animate-spin novapay:rounded-full novapay:bg-[var(--tuwa-bg-primary)] novapay:text-[var(--tuwa-text-accent)] novapay:motion-reduce:animate-none"
        />
      </span>
      <h2 id={headingId} ref={heading} tabIndex={-1} className={screenTitle}>
        {formatLabel(title, values)}
      </h2>
      {(kind === 'sign' || kind === 'confirm') && (
        <>
          <p className="novapay:m-0 novapay:max-w-sm novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
            {formatLabel(kind === 'sign' ? labels.walletPrompt.signText : labels.walletPrompt.confirmText, values)}
          </p>
          <div className="novapay:flex novapay:w-full novapay:max-w-xs novapay:flex-col novapay:gap-1.5 novapay:text-left">
            <span className="novapay:text-[11px] novapay:font-semibold">
              {formatLabel(labels.walletPrompt.check, values)}
            </span>
            <DetailsCard>
              <DetailRow name={labels.walletPrompt.amount}>{amount}</DetailRow>
              <DetailRow name={labels.walletPrompt.to}>{to}</DetailRow>
              <DetailRow name={labels.walletPrompt.network}>{network}</DetailRow>
              {priceTime && <DetailRow name={labels.walletPrompt.priceLocked}>{priceTime}</DetailRow>}
            </DetailsCard>
          </div>
          {onRetry ? (
            <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
              {labels.walletPrompt.notOpened}{' '}
              <FooterAction onClick={onRetry}>{labels.walletPrompt.tryAgain}</FooterAction>
            </p>
          ) : (
            <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
              {formatLabel(labels.walletPrompt.stillWaiting, values)}
            </p>
          )}
        </>
      )}
      {kind === 'permission' && (
        <p className="novapay:m-0 novapay:max-w-sm novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
          {labels.autoPay.walletNote}
        </p>
      )}
      {kind !== 'submitting' && (
        <SecondaryButton onClick={onCancel} className="novapay:max-w-xs">
          {labels.walletPrompt.cancel}
        </SecondaryButton>
      )}
    </section>
  );
}
