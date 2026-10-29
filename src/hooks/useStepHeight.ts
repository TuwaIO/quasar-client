import { useEffect, useState } from 'react';

/** What the step height reads of an element: its box and, for a step, the scrolling area of the checkout around it. */
type Measured = { getBoundingClientRect: () => { height: number }; closest: (selector: string) => unknown };

/**
 * The height the wallet prompt takes for a step: the step's height, capped at the scrolling area of the checkout pane
 * around it (`[data-novapay-scroll]`), whose height is the room the sheet has on a phone. A step taller than that
 * scrolls in the area; the prompt fills it and no more, so no scrollbar comes back.
 *
 * @param step - The step element.
 * @returns The height in px, or `null` while the step has no height (hidden).
 * @internal
 */
export function stepHeightOf(step: Measured): number | null {
  const height = step.getBoundingClientRect().height;
  if (!(height > 0)) return null;
  const area = step.closest('[data-novapay-scroll]') as Measured | null;
  const room = area?.getBoundingClientRect().height;
  return room && room > 0 ? Math.min(height, room) : height;
}

/**
 * The height of a step that a wallet prompt stands for while it shows, for a checkout on a phone, where the sheet has
 * no fixed height and would take the height of the shorter prompt. While the step shows, its height (see
 * {@link stepHeightOf}) is measured and followed with a `ResizeObserver` of the step and the scrolling area; while the
 * prompt shows, the step is hidden and the last height is kept. Without a prompt there is no height, so it is released
 * when the prompt closes.
 *
 * Side effects: a `ResizeObserver` while the step shows.
 *
 * @param prompting - Whether the prompt shows, and the step is hidden.
 * @returns The callback ref of the step element, and the step's height in px while the prompt shows, else `null`.
 * @internal
 */
export function useStepHeight(prompting: boolean): [ref: (element: HTMLElement | null) => void, height: number | null] {
  const [step, setStep] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!step || prompting) return;
    const measure = () => {
      const next = stepHeightOf(step);
      if (next !== null) setHeight(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(step);
    const area = step.closest('[data-novapay-scroll]');
    if (area) observer.observe(area);
    return () => observer.disconnect();
  }, [step, prompting]);

  return [setStep, prompting ? height : null];
}
