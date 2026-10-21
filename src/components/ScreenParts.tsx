import { ArrowPathIcon, CheckIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { cn } from '@tuwaio/nova-core';
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { focusRing, iconButton, mono, primaryAction, screenHeading, secondaryAction } from './classes';
import { checkoutClassName, type CheckoutPrimaryButtonProps } from './customization';

/** The scrolling content of a screen, with its heading. @internal */
export function ScreenContent({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const context = useCheckoutContext();
  return (
    <section
      className={cn(
        'novapay:flex novapay:flex-1 novapay:flex-col novapay:gap-2.5 novapay:px-5 novapay:py-4',
        checkoutClassName(context, 'screen'),
      )}
    >
      <div>
        <h2
          {...screenHeading}
          className={cn(mono, 'novapay:m-0 novapay:text-base novapay:font-bold novapay:outline-none')}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="novapay:m-0 novapay:mt-1 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * The bottom of a screen: its main button, a second action under it and centered notes. It stays at the bottom of the
 * checkout while the screen scrolls; the scrolling area keeps a focused field clear of it (WCAG 2.4.11).
 *
 * @internal
 */
export function ScreenFooter({ children }: { children: ReactNode }) {
  const context = useCheckoutContext();
  const ref = useRef<HTMLElement>(null);
  // The scrolling area keeps its bottom padding at the footer's height, so the browser scrolls a focused field above
  // the footer instead of under it, and not further
  useEffect(() => {
    const footer = ref.current;
    const area = footer?.closest<HTMLElement>('[data-novapay-scroll]');
    if (!footer || !area || typeof ResizeObserver === 'undefined') return;
    const update = () => (area.style.scrollPaddingBottom = `${footer.offsetHeight + 8}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(footer);
    return () => {
      observer.disconnect();
      area.style.scrollPaddingBottom = '';
    };
  }, []);
  return (
    <footer
      ref={ref}
      className={cn(
        'novapay:sticky novapay:bottom-0 novapay:z-10 novapay:flex novapay:flex-col novapay:gap-2 novapay:border-t novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:px-5 novapay:pb-3.5 novapay:pt-3 novapay:text-center',
        checkoutClassName(context, 'footer'),
      )}
    >
      {children}
    </footer>
  );
}

/** A small heading of a group of options. @internal */
export function GroupLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span id={id} className={cn(mono, 'novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]')}>
      {children}
    </span>
  );
}

/**
 * The main button of a screen, in the solid accent of the checkout; `busy` shows a spinner with its text. A
 * `customization.components.PrimaryButton` replaces it with the same props.
 *
 * @internal
 */
export function PrimaryButton({ busy, children, className, ...props }: CheckoutPrimaryButtonProps) {
  const context = useCheckoutContext();
  const extra = checkoutClassName(context, 'primaryButton');
  const Custom = context.customization.components?.PrimaryButton;
  if (Custom) {
    return (
      <Custom busy={busy} className={cn(className, extra)} {...props}>
        {children}
      </Custom>
    );
  }
  return (
    <button
      type="button"
      aria-busy={busy || undefined}
      {...props}
      disabled={props.disabled || busy}
      className={cn(primaryAction, className, extra)}
    >
      {busy && (
        <ArrowPathIcon
          aria-hidden
          className="novapay:h-4 novapay:w-4 novapay:animate-spin novapay:motion-reduce:animate-none"
        />
      )}
      {children}
    </button>
  );
}

/** A second action under the main button (back, close, not now): the same size, with a border. @internal */
export function SecondaryButton({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = useCheckoutContext();
  return (
    <button
      type="button"
      {...props}
      className={cn(secondaryAction, className, checkoutClassName(context, 'secondaryButton'))}
    >
      {children}
    </button>
  );
}

/** A centered note of a screen footer (what the payment means, how the wallet asks). @internal */
export function FooterNote({ children }: { children: ReactNode }) {
  return (
    <p className="novapay:m-0 novapay:text-center novapay:text-[11px] novapay:leading-snug novapay:text-[var(--tuwa-text-secondary)]">
      {children}
    </p>
  );
}

/**
 * Rows of facts grouped in a bordered card with a line between rows, as the transaction details of Nova Transactions
 * show them. Its children are {@link DetailRow}s.
 *
 * @internal
 */
export function DetailsCard({ children, className }: { children: ReactNode; className?: string }) {
  const context = useCheckoutContext();
  return (
    <dl
      className={cn(
        'novapay:m-0 novapay:flex novapay:w-full novapay:flex-col novapay:divide-y novapay:divide-[var(--tuwa-border-primary)] novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:px-3 novapay:text-left',
        className,
        checkoutClassName(context, 'detailsCard'),
      )}
    >
      {children}
    </dl>
  );
}

/** A refusal of the engine, announced to screen readers. @internal */
export function ScreenError({ children }: { children: ReactNode }) {
  const context = useCheckoutContext();
  return (
    <p
      role="alert"
      className={cn(
        'novapay:m-0 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:bg-[var(--tuwa-error-bg)] novapay:px-3 novapay:py-2 novapay:text-xs novapay:text-[var(--tuwa-error-text)]',
        checkoutClassName(context, 'error'),
      )}
    >
      {children}
    </p>
  );
}

/** A button that copies a text; "Copied" is announced to screen readers (WCAG 4.1.3). @internal */
export function CopyButton({
  text,
  label,
  copiedLabel,
  children,
}: {
  text: string;
  label: string;
  copiedLabel: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const Icon = copied ? CheckIcon : DocumentDuplicateIcon;
  return (
    <>
      <button
        type="button"
        aria-label={children ? undefined : label}
        onClick={() => {
          // Clipboard access can be refused (no permission, insecure page): then nothing is copied and nothing said
          navigator.clipboard?.writeText(text).then(
            () => setCopied(true),
            () => undefined,
          );
        }}
        className={cn(iconButton, 'novapay:min-h-6 novapay:min-w-6 novapay:text-xs')}
      >
        <Icon aria-hidden className="novapay:h-3.5 novapay:w-3.5" />
        {children}
      </button>
      <span role="status" className="novapay:sr-only">
        {copied ? copiedLabel : ''}
      </span>
    </>
  );
}

/** A row of a {@link DetailsCard}: its name and its value. @internal */
export function DetailRow({ name, children }: { name: ReactNode; children: ReactNode }) {
  const context = useCheckoutContext();
  return (
    <div
      className={cn(
        'novapay:flex novapay:items-baseline novapay:justify-between novapay:gap-3 novapay:py-2 novapay:text-xs',
        checkoutClassName(context, 'detailRow'),
      )}
    >
      <dt className="novapay:shrink-0 novapay:text-[var(--tuwa-text-secondary)]">{name}</dt>
      <dd className={cn(mono, 'novapay:m-0 novapay:min-w-0 novapay:text-right novapay:break-words')}>{children}</dd>
    </div>
  );
}

/** A link styled as a small secondary action in a screen footer. @internal */
export function FooterAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'novapay:min-h-6 novapay:cursor-pointer novapay:border-0 novapay:bg-transparent novapay:p-0 novapay:text-xs novapay:text-[var(--tuwa-text-accent)] novapay:underline novapay:hover:no-underline',
        focusRing,
      )}
    >
      {children}
    </button>
  );
}
