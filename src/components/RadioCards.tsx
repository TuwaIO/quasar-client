import { cn } from '@tuwaio/nova-core';
import { type KeyboardEvent, type ReactNode, useRef } from 'react';

import { focusRing } from './classes';

/** Props of {@link RadioCards}. @internal */
export interface RadioCardsProps<T> {
  /** Accessible name of the group. */
  label: string;
  /** The options. */
  items: T[];
  /** Key of the selected option. */
  value: string | null;
  /** Key of an option. */
  getKey: (item: T) => string;
  /** Selects an option. */
  onChange: (key: string) => void;
  /** Content of an option. */
  children: (item: T, selected: boolean) => ReactNode;
  /** Classes of the group (its layout). */
  className?: string;
  /** Classes of an option, from whether it is selected and the option. */
  itemClassName?: (selected: boolean, item: T) => string;
}

/**
 * A group of options shown as cards, with the keyboard of radio buttons: the group is one tab stop, the arrow keys
 * (and Home, End) move and select (WCAG 2.1.1, 4.1.2).
 *
 * @internal
 */
export function RadioCards<T>({
  label,
  items,
  value,
  getKey,
  onChange,
  children,
  className,
  itemClassName,
}: RadioCardsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => getKey(item) === value),
  );
  const move = (event: KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const next = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = next < 0 ? last : next > last ? 0 : next;
    onChange(getKey(items[target]));
    refs.current[target]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={className}>
      {items.map((item, index) => {
        const key = getKey(item);
        const selected = key === value;
        return (
          <button
            key={key}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => onChange(key)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              'novapay:cursor-pointer novapay:rounded-[var(--tuwa-rounded-corners)] novapay:text-left novapay:text-[var(--tuwa-text-primary)] novapay:transition-colors',
              selected
                ? 'novapay:border-2 novapay:border-[var(--tuwa-text-accent)] novapay:bg-[var(--tuwa-bg-primary)]'
                : 'novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-secondary)] novapay:hover:border-[var(--tuwa-text-secondary)]',
              focusRing,
              itemClassName?.(selected, item),
            )}
          >
            {children(item, selected)}
          </button>
        );
      })}
    </div>
  );
}
