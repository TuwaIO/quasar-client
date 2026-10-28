import { ChevronDownIcon, ClockIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { cn } from '@tuwaio/nova-core';
import type { CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { type ReactNode, useId, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel, type NovaPaymentsLabels } from '../i18n';
import { formatCountdown, formatFiat, minorToDecimal } from '../utils/format';
import { invoiceTotals } from '../utils/totals';
import { focusRing, mono } from './classes';
import { checkoutClassName } from './customization';

/** States in which the invoice can still be paid, so its deadline counts down. */
const PAYABLE = new Set(['open', 'processing', 'underpaid']);
/** Steps at which the buyer can still pay; once the payment is sent (confirm) or settled, the deadline is past concern. */
const PAYING_SCREENS = new Set(['loading', 'error', 'buyer', 'method', 'pay', 'qr', 'underpaid']);

/** Whether the deadline counts: the invoice can be paid and the buyer has not sent the payment yet. */
const countsDown = (status: string, screen: string) => PAYABLE.has(status) && PAYING_SCREENS.has(screen);

/** The host name of a website link, for display. */
const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** The merchant's logo (or the first letter of its name), name and website, and the test badge. @internal */
export function MerchantBadge({ compact = false }: { compact?: boolean }) {
  const { checkout, state, labels } = useCheckoutContext();
  if (!checkout) return null;
  const { merchant, invoice } = checkout;
  const size = compact ? 'novapay:h-8 novapay:w-8' : 'novapay:h-9 novapay:w-9';
  return (
    <div className="novapay:flex novapay:min-w-0 novapay:items-center novapay:gap-2.5">
      {state.logoUrl ? (
        <img
          src={state.logoUrl}
          alt=""
          className={cn(size, 'novapay:shrink-0 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:object-contain')}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            size,
            mono,
            'novapay:flex novapay:shrink-0 novapay:items-center novapay:justify-center novapay:rounded-[var(--tuwa-rounded-corners)] novapay:bg-[var(--tuwa-text-primary)] novapay:text-[15px] novapay:font-bold novapay:text-[var(--tuwa-bg-primary)]',
          )}
        >
          {merchant.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="novapay:flex novapay:min-w-0 novapay:flex-col">
        <span className="novapay:truncate novapay:text-sm novapay:font-semibold">{merchant.name}</span>
        {compact
          ? invoice.number && (
              <span className={cn(mono, 'novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]')}>
                {invoice.number}
              </span>
            )
          : merchant.website && (
              <a
                href={merchant.website}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'novapay:truncate novapay:text-xs novapay:text-[var(--tuwa-text-secondary)] novapay:hover:underline',
                  focusRing,
                )}
              >
                {hostOf(merchant.website)}
              </a>
            )}
      </div>
      {invoice.environment === 'test' && (
        <span
          title={labels.summary.testHint}
          className={cn(
            mono,
            'novapay:ml-auto novapay:shrink-0 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:bg-[var(--tuwa-pending-bg)] novapay:px-1.5 novapay:py-0.5 novapay:text-[10px] novapay:font-bold novapay:uppercase novapay:tracking-wider novapay:text-[var(--tuwa-pending-text)]',
          )}
        >
          {labels.summary.test}
          <span className="novapay:sr-only">: {labels.summary.testHint}</span>
        </span>
      )}
    </div>
  );
}

/** The seller as the invoice document names them, the merchant's policies and what Quasar is. @internal */
export function SellerDetailsContent({ checkout, labels }: { checkout: CheckoutView; labels: NovaPaymentsLabels }) {
  const { merchant } = checkout;
  const seller = merchant.seller;
  const links = [
    [labels.summary.terms, merchant.links.terms],
    [labels.summary.refundPolicy, merchant.links.refundPolicy],
    [labels.summary.privacy, merchant.links.privacy],
  ].filter((link): link is [string, string] => Boolean(link[1]));
  return (
    <div className="novapay:flex novapay:flex-col novapay:gap-1 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:px-3 novapay:py-2.5 novapay:text-[11px] novapay:leading-snug novapay:text-[var(--tuwa-text-secondary)]">
      {seller?.legalName && (
        <span className="novapay:text-xs novapay:font-semibold novapay:text-[var(--tuwa-text-primary)]">
          {seller.legalName}
        </span>
      )}
      {(seller?.address || seller?.country) && (
        <span>{[seller.address, seller.country].filter(Boolean).join(', ')}</span>
      )}
      {seller?.registrationNumber && (
        <span>
          {labels.summary.registration} {seller.registrationNumber}
        </span>
      )}
      {seller?.taxId && (
        <span>
          {labels.summary.taxId} {seller.taxId}
        </span>
      )}
      {merchant.supportEmail && (
        <a
          href={`mailto:${merchant.supportEmail}`}
          className={cn('novapay:text-[var(--tuwa-text-accent)] novapay:underline', focusRing)}
        >
          {merchant.supportEmail}
        </a>
      )}
      {links.length > 0 && (
        <span className="novapay:flex novapay:flex-wrap novapay:gap-x-3">
          {links.map(([label, href]) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('novapay:text-[var(--tuwa-text-accent)] novapay:underline', focusRing)}
            >
              {label}
            </a>
          ))}
        </span>
      )}
      <span>{formatLabel(labels.summary.sellerRole, { seller: seller?.legalName || merchant.name })}</span>
    </div>
  );
}

/** The countdown to the invoice deadline, while the buyer can still pay the invoice. @internal */
export function DeadlineTimer() {
  const { checkout, labels, locale, now, screen } = useCheckoutContext();
  const dueAt = checkout?.invoice.dueAt;
  if (!checkout || !dueAt || !countsDown(checkout.invoice.status, screen)) return null;
  const date = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dueAt));
  return (
    <div className="novapay:flex novapay:items-center novapay:justify-between novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:px-3 novapay:py-2.5">
      <div className="novapay:flex novapay:flex-col novapay:gap-0.5">
        <span className={cn(mono, 'novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]')}>
          {labels.summary.payWithin}
        </span>
        <span className="novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">
          {formatLabel(labels.summary.until, { date })}
        </span>
      </div>
      {/* role="timer": not announced every second, the checkout announces 10, 5 and 1 minutes left (WCAG 2.2.1) */}
      <span role="timer" className={cn(mono, 'novapay:text-lg novapay:font-bold')}>
        {formatCountdown(Date.parse(dueAt) - now)}
      </span>
    </div>
  );
}

/** The lines, subtotal and tax of the invoice. @internal */
export function OrderLines() {
  const { checkout, labels, locale } = useCheckoutContext();
  if (!checkout) return null;
  const { invoice } = checkout;
  const totals = invoiceTotals(invoice);
  return (
    <div className="novapay:flex novapay:flex-col novapay:gap-3.5">
      <div className="novapay:flex novapay:flex-col novapay:gap-2.5">
        {invoice.number && (
          <div
            className={cn(
              mono,
              'novapay:flex novapay:justify-between novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]',
            )}
          >
            <span>{labels.summary.invoice}</span>
            <span>{invoice.number}</span>
          </div>
        )}
        <ul className="novapay:m-0 novapay:flex novapay:list-none novapay:flex-col novapay:gap-2.5 novapay:p-0">
          {invoice.lineItems.map((line, i) => (
            <li key={i} className="novapay:flex novapay:justify-between novapay:gap-2 novapay:text-[13px]">
              <span className="novapay:flex novapay:min-w-0 novapay:flex-col">
                <span className="novapay:break-words">{line.name}</span>
                {line.description && (
                  <span className="novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">
                    {line.description}
                  </span>
                )}
                <span className={cn(mono, 'novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]')}>
                  {formatLabel(labels.summary.quantity, {
                    quantity: line.quantity,
                    price: formatFiat(line.unitPrice, locale),
                  })}
                </span>
              </span>
              <span className={mono}>{formatFiat(minorToDecimal(line.netMinor), locale)}</span>
            </li>
          ))}
        </ul>
      </div>
      {totals.tax && (
        <dl className="novapay:m-0 novapay:flex novapay:flex-col novapay:gap-1.5 novapay:border-t novapay:border-dashed novapay:border-[var(--tuwa-border-primary)] novapay:pt-2.5 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
          <div className="novapay:flex novapay:justify-between">
            <dt>{labels.summary.subtotal}</dt>
            <dd className={cn(mono, 'novapay:m-0')}>{formatFiat(totals.subtotal, locale)}</dd>
          </div>
          <div className="novapay:flex novapay:justify-between">
            <dt>{totals.rate ? formatLabel(labels.summary.taxRate, { rate: totals.rate }) : labels.summary.tax}</dt>
            <dd className={cn(mono, 'novapay:m-0')}>{formatFiat(totals.tax, locale)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/** The total of the invoice, which stays in place while the lines scroll. @internal */
export function OrderTotal() {
  const context = useCheckoutContext();
  const { checkout, labels, locale } = context;
  if (!checkout) return null;
  return (
    <div
      className={cn('novapay:flex novapay:items-baseline novapay:justify-between', checkoutClassName(context, 'total'))}
    >
      <span className={cn(mono, 'novapay:text-xs novapay:font-bold')}>{labels.summary.total}</span>
      <span className={cn(mono, 'novapay:text-[22px] novapay:font-bold')}>
        {formatFiat(invoiceTotals(checkout.invoice).total, locale)}{' '}
        <span className="novapay:text-[13px] novapay:font-normal novapay:text-[var(--tuwa-text-secondary)]">
          {checkout.invoice.currency}
        </span>
      </span>
    </div>
  );
}

/** "Secured by Quasar" and the seller's support email, at the same place on every step (WCAG 3.2.6). @internal */
export function SummaryFooter() {
  const { checkout, labels } = useCheckoutContext();
  return (
    <div className="novapay:flex novapay:flex-col novapay:gap-1 novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">
      <span className="novapay:flex novapay:items-center novapay:gap-1.5">
        <LockClosedIcon aria-hidden className="novapay:h-3 novapay:w-3" />
        {labels.summary.secured}
      </span>
      {checkout?.merchant.supportEmail && (
        <span>
          {labels.summary.help}:{' '}
          <a
            href={`mailto:${checkout.merchant.supportEmail}`}
            className={cn('novapay:text-[var(--tuwa-text-accent)] novapay:underline', focusRing)}
          >
            {checkout.merchant.supportEmail}
          </a>
        </span>
      )}
    </div>
  );
}

/** A button that shows or hides a part, with `aria-expanded` and `aria-controls`. @internal */
function Disclosure({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={cn('novapay:flex novapay:flex-col novapay:gap-2', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'novapay:inline-flex novapay:cursor-pointer novapay:items-center novapay:gap-1 novapay:self-start novapay:border-0 novapay:bg-transparent novapay:p-0 novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)] novapay:hover:text-[var(--tuwa-text-primary)]',
          focusRing,
        )}
      >
        {label}
        <ChevronDownIcon
          aria-hidden
          className={cn(
            'novapay:h-3 novapay:w-3 novapay:transition-transform novapay:motion-reduce:transition-none',
            open && 'novapay:rotate-180',
          )}
        />
      </button>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/**
 * The order panel on the left of the checkout (from 640 px): the merchant, the seller details (unfolded in place, the
 * lines scroll while the deadline and the total stay), the countdown, the lines and the total, and the help.
 *
 * @returns The order panel.
 */
export function CheckoutSummary() {
  const { checkout, labels } = useCheckoutContext();
  if (!checkout) return null;
  return (
    <div className="novapay:flex novapay:h-full novapay:flex-col novapay:gap-3.5">
      <div className="novapay:flex novapay:flex-col novapay:gap-1.5">
        <MerchantBadge />
        <Disclosure label={labels.summary.sellerDetails}>
          <SellerDetailsContent checkout={checkout} labels={labels} />
        </Disclosure>
      </div>
      <DeadlineTimer />
      <div className="novapay:-mr-2.5 novapay:min-h-0 novapay:flex-1 novapay:overflow-y-auto novapay:pr-2.5">
        <OrderLines />
      </div>
      <OrderTotal />
      <SummaryFooter />
    </div>
  );
}

/**
 * The order on a phone, above the steps: the total and the countdown, with the lines and the seller details behind a
 * "Details" button.
 *
 * @param props - The classes.
 * @param props.className - Classes added to the order (`customization.classNames.compactSummary`).
 * @returns The compact order.
 */
export function CompactSummary({ className }: { className?: string } = {}) {
  const { checkout, labels, locale, now, screen } = useCheckoutContext();
  if (!checkout) return null;
  const { invoice } = checkout;
  const totals = invoiceTotals(invoice);
  const dueAt = invoice.dueAt && countsDown(invoice.status, screen) ? Date.parse(invoice.dueAt) : null;
  return (
    <div
      className={cn(
        'novapay:mx-4 novapay:flex novapay:flex-col novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-secondary)] novapay:p-3',
        className,
      )}
    >
      <div className="novapay:flex novapay:items-baseline novapay:justify-between">
        <span className={cn(mono, 'novapay:text-[22px] novapay:font-bold')}>
          {formatFiat(totals.total, locale)}{' '}
          <span className="novapay:text-xs novapay:font-normal novapay:text-[var(--tuwa-text-secondary)]">
            {invoice.currency}
          </span>
        </span>
        {dueAt && (
          <span
            role="timer"
            className={cn(mono, 'novapay:flex novapay:items-center novapay:gap-1 novapay:text-xs novapay:font-bold')}
          >
            <ClockIcon aria-hidden className="novapay:h-3.5 novapay:w-3.5 novapay:text-[var(--tuwa-text-secondary)]" />
            {formatCountdown(dueAt - now)}
          </span>
        )}
      </div>
      <Disclosure
        label={`${formatLabel(labels.summary.compact, {
          count: invoice.lineItems.length,
          tax: totals.tax ? formatFiat(totals.tax, locale) : formatFiat('0', locale),
        })} · ${labels.summary.showOrder}`}
      >
        <div className="novapay:flex novapay:flex-col novapay:gap-3 novapay:pt-1">
          <OrderLines />
          <SellerDetailsContent checkout={checkout} labels={labels} />
        </div>
      </Disclosure>
    </div>
  );
}
