import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { cn } from '@tuwaio/nova-core';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { focusRing, mono } from './classes';

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
