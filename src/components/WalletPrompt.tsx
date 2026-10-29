import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { cn } from '@tuwaio/nova-core';
import { type CSSProperties, useEffect, useId, useRef, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel } from '../i18n';
import { screenTitle } from './classes';
import { CheckoutWalletIcon, DetailRow, DetailsCard, FooterAction, SecondaryButton } from './ScreenParts';

/**
 * What the wallet asks for: a gasless signature, a transaction, a network switch, the permission of automatic
 * payments, or Quasar takes the payment.
 */
export type WalletPromptKind = 'sign' | 'confirm' | 'switch' | 'permission' | 'submitting';

/** Props of {@link WalletPrompt}. */
export interface WalletPromptProps {
  /** What the wallet asks for. */
  kind: WalletPromptKind;
  /** The wallet's name, as it calls itself (`name` of the connected wallet). */
  walletName: string;
  /** The wallet's id, for the icon Nova has of it when the wallet gives none. */
  walletId: string;
  /** The icon the wallet gives itself (`icon` of the connected wallet), usually a `data:` URI. */
  walletIcon?: string;
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
  /**
   * The height in px of the step the window stands for, measured while the step showed and capped at the room of the
   * checkout pane. Below 640 px, where the checkout has no fixed height, the window keeps it as its minimum height, so
   * the sheet does not shrink while the wallet asks and grow back after. Wider screens have the fixed height of the
   * checkout and ignore it.
   */
  stepHeight?: number | null;
}

/**
 * The window that stands for the pay step while the wallet asks the buyer: what to sign or confirm, and what to check
 * in the wallet before — the amount, the recipient, the network and the time left of the price (WCAG 3.3.4). It sits
 * in the flow of the screen, in place of the step: a screen that shows it (a custom screen of
 * `customization.components.screens` too) hides its step while it shows, with `display: none` and `inert` (the step
 * keeps its state), so the window fills the checkout pane, centered, without the scrollbar of a taller step, and
 * passes the step's height as `stepHeight`, so a phone keeps the height of the sheet. The heading takes the focus, so screen readers say what happens; when the
 * window closes and the step comes back, the focus returns to the button that opened it ("Pay", "Switch to …")
 * from the page or the dialog frame it fell back to, unless the buyer moved it elsewhere. "Try again" re-asks only
 * for a signature; for a transaction the buyer is sent to the wallet, where the request still waits, so it cannot be
 * paid twice.
 *
 * @param props - See {@link WalletPromptProps}.
 * @returns The window.
 */
export function WalletPrompt({
  kind,
  walletName,
  walletId,
  walletIcon,
  amount,
  merchant,
  network,
  to,
  priceTime,
  onRetry,
  onCancel,
  stepHeight,
}: WalletPromptProps) {
  const { labels } = useCheckoutContext();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [kind]);
  // The button that opened the window, read before the step under it leaves the layout and loses the focus
  const [opener] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement)));
  useEffect(
    () => () => {
      // The window went and the focus with it, to the page or to a frame around the step (a dialog focuses its
      // content): back to the button, if its step is still on screen
      const page = opener?.ownerDocument;
      if (!opener || !page || opener === page.body || !opener.isConnected) return;
      const active = page.activeElement;
      if (active && active !== page.body && !active.contains(opener)) return;
      opener.focus();
    },
    [opener],
  );
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
      // Below 640 px the checkout takes its content's height: the window keeps the height of the step
      style={stepHeight ? ({ '--novapay-step-height': `${stepHeight}px` } as CSSProperties) : undefined}
      className={cn(
        'novapay:flex novapay:flex-1 novapay:flex-col novapay:items-center novapay:justify-center-safe novapay:gap-3 novapay:bg-[var(--tuwa-bg-primary)] novapay:px-6 novapay:py-5 novapay:text-center',
        stepHeight && 'novapay:max-sm:min-h-[var(--novapay-step-height)]',
      )}
    >
      <span className="novapay:relative novapay:h-12 novapay:w-12">
        {(walletId || walletIcon) && <CheckoutWalletIcon walletId={walletId} icon={walletIcon} />}
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
