import { Dialog, DialogContent, DialogTitle } from '@tuwaio/nova-core';
import { useId, useRef } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel } from '../i18n';
import { screenTitle } from './classes';
import { PrimaryButton, SecondaryButton } from './ScreenParts';

/**
 * The question when the buyer closes the checkout before anything is sent: the invoice stays open until its deadline,
 * reopened from the email or the seller's site, and the locked price is released. It is a Nova dialog of its own, over
 * the checkout: one backdrop dims the whole screen, the checkout and its frame included (a layer inside the checkout
 * left its frame sharp around the dimmed content); on a phone it slides up from the bottom like the other Nova dialogs.
 * "Stay and pay", Escape or a click outside keep the checkout and give the focus back where it was, "Leave" closes it.
 * The heading takes the focus.
 *
 * @param props - The answers.
 * @param props.onStay - Keeps the checkout open.
 * @param props.onLeave - Closes it.
 * @returns The question, over the checkout.
 */
export function LeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const { checkout, labels, locale } = useCheckoutContext();
  const headingId = useId();
  const textId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const due = checkout?.invoice.dueAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        Date.parse(checkout.invoice.dueAt),
      )
    : null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onStay();
      }}
    >
      <DialogContent
        role="alertdialog"
        aria-labelledby={headingId}
        aria-describedby={textId}
        // The heading takes the focus; DialogContent gives it back where it was when the question closes
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          heading.current?.focus();
        }}
        className="novapay:w-full novapay:sm:w-[24rem]"
      >
        {/* Radix asks for a title of its own; the visible heading below names the dialog (aria-labelledby), so this one
            stays out of the accessibility tree */}
        <DialogTitle aria-hidden className="novapay:sr-only">
          {labels.leave.title}
        </DialogTitle>
        <div className="novapay:flex novapay:flex-col novapay:gap-3 novapay:p-5 novapay:text-center">
          <h2 id={headingId} ref={heading} tabIndex={-1} className={screenTitle}>
            {labels.leave.title}
          </h2>
          <p id={textId} className="novapay:m-0 novapay:text-xs">
            {due ? formatLabel(labels.leave.text, { date: due }) : labels.leave.textNoDate}
          </p>
          <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">{labels.leave.price}</p>
          <PrimaryButton onClick={onStay}>{labels.leave.stay}</PrimaryButton>
          <SecondaryButton onClick={onLeave}>{labels.leave.leave}</SecondaryButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
