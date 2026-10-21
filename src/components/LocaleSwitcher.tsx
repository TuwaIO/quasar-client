import { CheckIcon, ChevronDownIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { cn } from '@tuwaio/nova-core';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

import { CHECKOUT_LOCALES, type CheckoutLocale, formatLabel, type NovaPaymentsLabels } from '../i18n';
import { focusRing, iconButton, mono } from './classes';

/** Props of {@link LocaleSwitcher}. */
export interface LocaleSwitcherProps {
  /** The language of the checkout. */
  locale: string;
  /** The labels of that language. */
  labels: NovaPaymentsLabels;
  /** Whether the receipt is issued: then the language changes the page only. */
  receiptIssued?: boolean;
  /**
   * Called with the language the buyer picks.
   *
   * @param locale - The picked language.
   */
  onSelect: (locale: CheckoutLocale) => void;
  /** Classes added to the wrapper. */
  className?: string;
}

/**
 * The language menu of the checkout: a button with a globe and the language code, always next to the close button,
 * that opens the six languages under their own names (each with its `lang`). Arrow keys move, Enter or Space picks,
 * Escape closes and gives the focus back to the button; a click outside closes it. Before payment the note says the
 * documents follow the language.
 *
 * Side effect: while open, a `pointerdown` listener on the document closes it on a click outside.
 *
 * @param props - See {@link LocaleSwitcherProps}.
 * @returns The language menu.
 */
export function LocaleSwitcher({ locale, labels, receiptIssued, onSelect, className }: LocaleSwitcherProps) {
  const [open, setOpen] = useState(false);
  const current = CHECKOUT_LOCALES.find((item) => item.code === locale) ?? CHECKOUT_LOCALES[0];
  const [active, setActive] = useState(0);
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const openMenu = () => {
    setActive(Math.max(0, CHECKOUT_LOCALES.indexOf(current)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const pick = (code: CheckoutLocale) => {
    close();
    if (code !== current.code) onSelect(code);
  };
  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = CHECKOUT_LOCALES.length - 1;
    const moves: Record<string, () => number> = {
      ArrowDown: () => Math.min(last, active + 1),
      ArrowUp: () => Math.max(0, active - 1),
      Home: () => 0,
      End: () => last,
    };
    if (moves[event.key]) {
      event.preventDefault();
      setActive(moves[event.key]());
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(CHECKOUT_LOCALES[active].code);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div ref={wrapper} className={cn('novapay:relative', className)}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        className={cn(iconButton, mono, 'novapay:text-[11px] novapay:font-semibold')}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        <GlobeAltIcon aria-hidden className="novapay:h-3.5 novapay:w-3.5" />
        {/* The visible code starts the accessible name, the language follows for screen readers (WCAG 2.5.3) */}
        <span>{current.short}</span>
        <span className="novapay:sr-only">, {formatLabel(labels.language.button, { language: current.name })}</span>
        <ChevronDownIcon aria-hidden className="novapay:h-3 novapay:w-3" />
      </button>
      {open && (
        <div className="novapay:absolute novapay:right-0 novapay:top-full novapay:z-20 novapay:mt-1.5 novapay:w-60 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:p-1.5 novapay:shadow-xl">
          <span
            id={`${id}-title`}
            className={cn(
              mono,
              'novapay:block novapay:px-2.5 novapay:py-1 novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]',
            )}
          >
            {labels.language.title}
          </span>
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={`${id}-title`}
            aria-activedescendant={`${id}-${CHECKOUT_LOCALES[active].code}`}
            onKeyDown={onListKeyDown}
            className={cn(
              'novapay:m-0 novapay:flex novapay:list-none novapay:flex-col novapay:gap-0.5 novapay:p-0',
              focusRing,
            )}
          >
            {CHECKOUT_LOCALES.map((item, i) => {
              const selected = item.code === current.code;
              return (
                <li
                  key={item.code}
                  id={`${id}-${item.code}`}
                  role="option"
                  aria-selected={selected}
                  lang={item.code}
                  onClick={() => pick(item.code)}
                  onPointerMove={() => setActive(i)}
                  className={cn(
                    'novapay:flex novapay:h-8 novapay:cursor-pointer novapay:items-center novapay:gap-2.5 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:px-2.5 novapay:text-[13px]',
                    i === active && 'novapay:bg-[var(--tuwa-bg-muted)]',
                    // The text stays primary on the hover background (the accent is too light on it in dark mode)
                    'novapay:text-[var(--tuwa-text-primary)]',
                    selected && 'novapay:font-semibold',
                  )}
                >
                  <span aria-hidden className={cn(mono, 'novapay:w-5 novapay:text-[11px]')}>
                    {item.short}
                  </span>
                  <span>{item.name}</span>
                  {selected && (
                    <CheckIcon
                      aria-hidden
                      className="novapay:ml-auto novapay:h-3.5 novapay:w-3.5 novapay:text-[var(--tuwa-text-accent)]"
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <p className="novapay:m-0 novapay:mt-1 novapay:border-t novapay:border-[var(--tuwa-border-primary)] novapay:px-2.5 novapay:pb-1 novapay:pt-2 novapay:text-[11px] novapay:leading-snug novapay:text-[var(--tuwa-text-secondary)]">
            {receiptIssued ? labels.language.noteAfterPaid : labels.language.note}
          </p>
        </div>
      )}
    </div>
  );
}
