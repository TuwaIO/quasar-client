import { ChevronDownIcon, ClockIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { cn } from '@tuwaio/nova-core';
import type { CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { type ReactNode, useId, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatCountLabel, formatLabel, type NovaPaymentsLabels } from '../i18n';
import { deadlineState } from '../utils/checkout';
import { formatCountdown, formatFiat, minorToDecimal } from '../utils/format';
import { invoiceTotals } from '../utils/totals';
import { focusRing, heroAmountClass, mono } from './classes';
import { checkoutClassName } from './customization';

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
  const { checkout, state, labels, display } = useCheckoutContext();
  // A logo that does not load falls back to the letter, as with no logo at all
  const [logoFailed, setLogoFailed] = useState(false);
  if (!checkout) return null;
  const { merchant, invoice } = checkout;
  const size = compact ? 'novapay:h-8 novapay:w-8' : 'novapay:h-9 novapay:w-9';
  return (
    <div className="novapay:flex novapay:min-w-0 novapay:items-center novapay:gap-2.5">
      {state.logoUrl && !logoFailed ? (
        <img
          src={state.logoUrl}
          alt=""
          onError={() => setLogoFailed(true)}
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
        <span
          className={cn(
            'novapay:text-sm novapay:font-semibold',
            // Its own page has the room for the whole name, in two lines at most
            display === 'page' && !compact ? 'novapay:line-clamp-2 novapay:break-words' : 'novapay:truncate',
          )}
        >
          {merchant.name}
        </span>
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

/**
 * The countdown to the invoice deadline, through every step of the payment until it succeeded (`deadlineState`); it
 * stays at 00:00 when the deadline passes while the payment confirms. @internal
 */
export function DeadlineTimer() {
  const { checkout, labels, locale, now, screen, display } = useCheckoutContext();
  const dueAt = checkout?.invoice.dueAt;
  const state = checkout && deadlineState(checkout.invoice.status, screen, checkout.invoice.restPayable);
  if (!checkout || !dueAt || !state) return null;
  const date = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dueAt));
  return (
    <div
      className={cn(
        'novapay:flex novapay:items-center novapay:justify-between novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:px-3 novapay:py-2.5',
        display === 'page' && 'novapay-page-deadline',
      )}
    >
      <div className="novapay:flex novapay:min-w-0 novapay:flex-col novapay:gap-0.5">
        <span className={cn(mono, 'novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]')}>
          {state === 'closed' ? labels.summary.refundAfter : labels.summary.payWithin}
        </span>
        <span className="novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">
          {state === 'closed' ? date : formatLabel(labels.summary.until, { date })}
        </span>
      </div>
      {/* role="timer": not announced every second, the checkout announces 10, 5 and 1 minutes left (WCAG 2.2.1) */}
      <span
        role="timer"
        className={cn(mono, 'novapay:shrink-0 novapay:whitespace-nowrap novapay:text-lg novapay:font-bold')}
      >
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
function Disclosure({
  label,
  children,
  className,
  buttonClassName,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  buttonClassName?: string;
}) {
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
          buttonClassName,
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

/** The lines the order card of a page shows in full before it folds the rest, so that the panel keeps its height. */
const PAGE_LINES = 5;

/** The total as the largest fact of the order on a page; it carries `classNames.total`. */
function HeroTotal() {
  const context = useCheckoutContext();
  const { checkout, labels, locale } = context;
  if (!checkout) return null;
  const amount = formatFiat(invoiceTotals(checkout.invoice).total, locale);
  return (
    <div className={cn('novapay:flex novapay:flex-col novapay:gap-1.5', checkoutClassName(context, 'total'))}>
      <span className={cn(mono, 'novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]')}>
        {labels.summary.total}
      </span>
      <span
        className={cn(
          mono,
          'novapay:flex novapay:flex-wrap novapay:items-baseline novapay:gap-x-2 novapay:gap-y-1 novapay:font-bold',
          heroAmountClass(amount),
        )}
      >
        <span>{amount}</span>
        <span className="novapay:text-[15px] novapay:font-normal novapay:text-[var(--tuwa-text-secondary)]">
          {checkout.invoice.currency}
        </span>
      </span>
    </div>
  );
}

const pageRow = 'novapay:flex novapay:justify-between novapay:gap-3 novapay:px-3 novapay:py-2';

/** One line of the order card of a page; quantity and price only when they say more than its amount does. */
function PageOrderLine({ line }: { line: CheckoutView['invoice']['lineItems'][number] }) {
  const { labels, locale } = useCheckoutContext();
  const amount = formatFiat(minorToDecimal(line.netMinor), locale);
  const unit = formatFiat(line.unitPrice, locale);
  return (
    <li className={cn(pageRow, 'novapay:text-[13px]')}>
      <span className="novapay:flex novapay:min-w-0 novapay:flex-col">
        <span className="novapay:break-words">{line.name}</span>
        {line.description && (
          <span className="novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">{line.description}</span>
        )}
        {(Number(line.quantity) !== 1 || unit !== amount) && (
          <span className={cn(mono, 'novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]')}>
            {formatLabel(labels.summary.quantity, { quantity: line.quantity, price: unit })}
          </span>
        )}
      </span>
      <span className={cn(mono, 'novapay:shrink-0')}>{amount}</span>
    </li>
  );
}

/**
 * The order on a page, as one card with a line between its rows: the invoice, its lines, and the subtotal and tax when it
 * has them. Nothing scrolls inside it: past what fits, the rest of the lines folds under a button that stays in place.
 */
function PageOrderCard() {
  const { checkout, labels, locale } = useCheckoutContext();
  if (!checkout) return null;
  const { invoice } = checkout;
  const totals = invoiceTotals(invoice);
  const cap = totals.tax ? PAGE_LINES - 1 : PAGE_LINES;
  const lines = invoice.lineItems;
  const shown = lines.length > cap ? lines.slice(0, cap - 1) : lines;
  const rest = lines.slice(shown.length);
  if (!invoice.number && lines.length === 0) return null;
  return (
    <div className="novapay:flex novapay:flex-col novapay:divide-y novapay:divide-[var(--tuwa-border-primary)] novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)]">
      {invoice.number && (
        <div className={cn(mono, pageRow, 'novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]')}>
          <span>{labels.summary.invoice}</span>
          <span className="novapay:min-w-0 novapay:break-all novapay:text-right">{invoice.number}</span>
        </div>
      )}
      {shown.length > 0 && (
        <ul className="novapay:m-0 novapay:flex novapay:list-none novapay:flex-col novapay:divide-y novapay:divide-[var(--tuwa-border-primary)] novapay:p-0">
          {shown.map((line, i) => (
            <PageOrderLine key={i} line={line} />
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <Disclosure
          label={`+${rest.length} · ${labels.summary.showOrder}`}
          className="novapay:px-3 novapay:py-2"
          buttonClassName="novapay:min-h-6"
        >
          <ul className="novapay:-mx-3 novapay:m-0 novapay:flex novapay:list-none novapay:flex-col novapay:divide-y novapay:divide-[var(--tuwa-border-primary)] novapay:p-0">
            {rest.map((line, i) => (
              <PageOrderLine key={i} line={line} />
            ))}
          </ul>
        </Disclosure>
      )}
      {totals.tax && (
        <dl className="novapay:m-0 novapay:flex novapay:flex-col novapay:gap-1.5 novapay:px-3 novapay:py-2 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
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

/**
 * The order panel of a page. At the top who asks, how much and for what; at the bottom, level with the main button, by when
 * and who is behind it: the deadline leaving when the invoice is paid and the seller details opening move nothing above.
 */
function PageSummary() {
  const { checkout, labels } = useCheckoutContext();
  if (!checkout) return null;
  return (
    <div className="novapay:flex novapay:min-w-0 novapay:flex-1 novapay:flex-col">
      <MerchantBadge />
      <div className="novapay:mt-6">
        <HeroTotal />
      </div>
      <div className="novapay:mt-5">
        <PageOrderCard />
      </div>
      <div className="novapay:mt-auto novapay:flex novapay:flex-col novapay:gap-3 novapay:pt-5">
        <DeadlineTimer />
        <Disclosure label={labels.summary.sellerDetails} buttonClassName="novapay:min-h-6">
          <SellerDetailsContent checkout={checkout} labels={labels} />
        </Disclosure>
        <SummaryFooter />
      </div>
    </div>
  );
}

/**
 * The order panel on the left of the checkout (from 640 px): the merchant, the seller details (unfolded in place, the
 * lines scroll while the deadline and the total stay), the countdown to the deadline (through every step of the
 * payment, also while it confirms, until it succeeded), the lines and the total, and the help.
 *
 * @returns The order panel.
 */
export function CheckoutSummary() {
  const { checkout, labels, display } = useCheckoutContext();
  if (!checkout) return null;
  if (display === 'page') return <PageSummary />;
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
 * The order on a phone, above the steps: the total and the countdown to the deadline (until the payment succeeded), with
 * the lines and the seller details behind a "Details" button.
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
  const dueAt = invoice.dueAt && deadlineState(invoice.status, screen) ? Date.parse(invoice.dueAt) : null;
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
            className={cn(
              mono,
              'novapay:flex novapay:items-center novapay:gap-1 novapay:whitespace-nowrap novapay:text-xs novapay:font-bold',
            )}
          >
            <ClockIcon aria-hidden className="novapay:h-3.5 novapay:w-3.5 novapay:text-[var(--tuwa-text-secondary)]" />
            {formatCountdown(dueAt - now)}
          </span>
        )}
      </div>
      <Disclosure
        label={`${formatCountLabel(
          totals.tax
            ? { one: labels.summary.compactOne, other: labels.summary.compact }
            : { one: labels.summary.compactNoTaxOne, other: labels.summary.compactNoTax },
          invoice.lineItems.length,
          locale,
          totals.tax ? { tax: formatFiat(totals.tax, locale) } : {},
        )} · ${labels.summary.showOrder}`}
      >
        <div className="novapay:flex novapay:flex-col novapay:gap-3 novapay:pt-1">
          <OrderLines />
          <SellerDetailsContent checkout={checkout} labels={labels} />
        </div>
      </Disclosure>
    </div>
  );
}
