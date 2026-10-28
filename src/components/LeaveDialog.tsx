import { useEffect, useId, useRef } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel } from '../i18n';
import { screenTitle } from './classes';
import { PrimaryButton, SecondaryButton } from './ScreenParts';

/**
 * The question when the buyer closes the checkout before anything is sent: the invoice stays open until its deadline,
 * reopened from the email or the seller's site, and the locked price is released. "Stay and pay" (or Escape) keeps
 * the checkout and gives the focus back where it was, "Leave" closes it. The heading takes the focus.
 *
 * @param props - The answers.
 * @param props.onStay - Keeps the checkout open.
 * @param props.onLeave - Closes it.
 * @returns The question, over the checkout.
 */
export function LeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const { checkout, labels, locale } = useCheckoutContext();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  // The heading takes the focus; "Stay" and Escape give it back where it was
  useEffect(() => {
    const previous = heading.current?.ownerDocument.activeElement as HTMLElement | null;
    heading.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const due = checkout?.invoice.dueAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        Date.parse(checkout.invoice.dueAt),
      )
    : null;
  return (
    <section
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onStay();
      }}
      // A card over the dimmed checkout, as a Nova dialog over a page
      className="novapay:absolute novapay:inset-0 novapay:z-20 novapay:flex novapay:items-center novapay:justify-center novapay:bg-black/55 novapay:p-4 novapay:backdrop-blur-sm"
    >
      <div className="novapay:flex novapay:w-full novapay:max-w-sm novapay:flex-col novapay:gap-3 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:p-5 novapay:text-center novapay:shadow-xl">
        <h2 id={headingId} ref={heading} tabIndex={-1} className={screenTitle}>
          {labels.leave.title}
        </h2>
        <p className="novapay:m-0 novapay:text-xs">
          {due ? formatLabel(labels.leave.text, { date: due }) : labels.leave.textNoDate}
        </p>
        <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">{labels.leave.price}</p>
        <PrimaryButton onClick={onStay}>{labels.leave.stay}</PrimaryButton>
        <SecondaryButton onClick={onLeave}>{labels.leave.leave}</SecondaryButton>
      </div>
    </section>
  );
}
