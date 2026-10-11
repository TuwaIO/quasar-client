import { ArrowPathIcon, CheckIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { cn } from '@tuwaio/nova-core';
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useState } from 'react';

import { focusRing, iconButton, mono } from './classes';

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
  return (
    <section className="novapay:flex novapay:flex-1 novapay:flex-col novapay:gap-2.5 novapay:px-5 novapay:py-4">
      <div>
        <h2 className={cn(mono, 'novapay:m-0 novapay:text-base novapay:font-bold')}>{title}</h2>
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

/** The bottom of a screen: its main button and the text under it. @internal */
export function ScreenFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="novapay:flex novapay:flex-col novapay:gap-1.5 novapay:border-t novapay:border-[var(--tuwa-border-primary)] novapay:px-5 novapay:pb-3.5 novapay:pt-3">
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

/** The main button of a screen, in the solid accent of the checkout; `busy` shows a spinner with its text. @internal */
export function PrimaryButton({
  busy,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      type="button"
      aria-busy={busy || undefined}
      {...props}
      disabled={props.disabled || busy}
      className={cn(
        mono,
        'novapay:inline-flex novapay:h-11 novapay:w-full novapay:cursor-pointer novapay:items-center novapay:justify-center novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border-0 novapay:bg-[var(--tuwa-button-primary-bg)] novapay:text-sm novapay:font-bold novapay:text-[var(--tuwa-text-on-accent)] novapay:transition-colors novapay:hover:bg-[var(--tuwa-button-primary-bg-hover)] novapay:disabled:cursor-not-allowed novapay:disabled:opacity-70',
        focusRing,
        className,
      )}
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

/** A refusal of the engine, announced to screen readers. @internal */
export function ScreenError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="novapay:m-0 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:bg-[var(--tuwa-error-bg)] novapay:px-3 novapay:py-2 novapay:text-xs novapay:text-[var(--tuwa-error-text)]"
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

/** A row of a details list: its name and its value. @internal */
export function DetailRow({ name, children }: { name: ReactNode; children: ReactNode }) {
  return (
    <div className="novapay:flex novapay:items-baseline novapay:justify-between novapay:gap-3 novapay:text-xs">
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
