import { CheckIcon } from '@heroicons/react/24/solid';
import { cn } from '@tuwaio/nova-core';
import { useEffect, useRef, useState } from 'react';

import { formatLabel, type NovaPaymentsLabels } from '../i18n';
import type { CheckoutStep } from '../utils/checkout';
import { mono } from './classes';

/** Props of {@link CheckoutStepper}. */
export interface CheckoutStepperProps {
  /** The steps, from `checkoutSteps`. */
  steps: CheckoutStep[];
  /** The labels of the checkout language. */
  labels: NovaPaymentsLabels;
  /** Classes added to the list. */
  className?: string;
  /**
   * Classes added to a step (`customization.classNames.step` of `PaymentCheckout`).
   *
   * @param step - The step.
   * @param index - Its position, from 0.
   * @returns The classes, or nothing.
   */
  stepClassName?: (step: CheckoutStep, index: number) => string | undefined;
}

/**
 * The steps of the payment, as an ordered list: done steps show a check, the current one is marked
 * `aria-current="step"` and named "Step 2 of 3: Pay" to screen readers (WCAG 1.3.1). When the names of all steps do not
 * fit (a phone, a long language), only the current step shows its name; screen readers still read every name.
 *
 * @param props - See {@link CheckoutStepperProps}.
 * @returns The stepper.
 */
export function CheckoutStepper({ steps, labels, className, stepClassName }: CheckoutStepperProps) {
  const currentIndex = steps.findIndex((step) => step.state === 'current');
  const names = steps.map((step) => labels.steps[step.key]).join('');
  const nav = useRef<HTMLElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);
  // Every name in one line, plus a circle, two gaps and the shortest line that still reads as one per step
  useEffect(() => {
    const box = nav.current;
    const text = measure.current;
    if (!box || !text || typeof ResizeObserver === 'undefined') return;
    const update = () => setCompact(text.offsetWidth + steps.length * 32 + (steps.length - 1) * 24 > box.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [names, steps.length]);
  return (
    <nav
      ref={nav}
      aria-label={labels.steps.label}
      className={cn('novapay:relative novapay:min-w-0 novapay:flex-1', className)}
    >
      <span aria-hidden className="novapay:invisible novapay:absolute novapay:h-0 novapay:w-0 novapay:overflow-hidden">
        <span ref={measure} className={cn(mono, 'novapay:whitespace-nowrap novapay:text-[11px] novapay:font-bold')}>
          {names}
        </span>
      </span>
      <ol className="novapay:m-0 novapay:flex novapay:list-none novapay:items-center novapay:gap-1.5 novapay:p-0">
        {steps.map((step, i) => {
          const name = labels.steps[step.key];
          return (
            <li
              key={step.key}
              aria-current={step.state === 'current' ? 'step' : undefined}
              className={cn(
                'novapay:flex novapay:min-w-0 novapay:items-center novapay:gap-1.5',
                i > 0 && 'novapay:flex-auto',
                stepClassName?.(step, i),
              )}
            >
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    'novapay:h-0.5 novapay:min-w-2 novapay:flex-1 novapay:rounded-full',
                    step.state === 'upcoming'
                      ? 'novapay:bg-[var(--tuwa-border-primary)]'
                      : 'novapay:bg-[var(--tuwa-success-icon)]',
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  mono,
                  'novapay:flex novapay:h-5 novapay:w-5 novapay:shrink-0 novapay:items-center novapay:justify-center novapay:rounded-full novapay:text-[10px] novapay:font-bold',
                  step.state === 'done' && 'novapay:bg-[var(--tuwa-success-icon)] novapay:text-white',
                  step.state === 'current' &&
                    'novapay:border-2 novapay:border-[var(--tuwa-text-accent)] novapay:text-[var(--tuwa-text-accent)]',
                  step.state === 'upcoming' &&
                    'novapay:border-2 novapay:border-[var(--tuwa-border-primary)] novapay:text-[var(--tuwa-text-secondary)]',
                )}
              >
                {step.state === 'done' ? <CheckIcon className="novapay:h-3 novapay:w-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  mono,
                  'novapay:truncate novapay:text-[11px]',
                  step.state === 'current'
                    ? 'novapay:font-bold novapay:text-[var(--tuwa-text-primary)]'
                    : 'novapay:text-[var(--tuwa-text-secondary)]',
                  compact && step.state !== 'current' && 'novapay:sr-only',
                )}
              >
                {step.state === 'current' ? (
                  <>
                    <span className="novapay:sr-only">
                      {formatLabel(labels.steps.progress, { current: currentIndex + 1, total: steps.length, name })}
                    </span>
                    <span aria-hidden>{name}</span>
                  </>
                ) : (
                  name
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
