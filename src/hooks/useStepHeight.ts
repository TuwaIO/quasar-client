import { useEffect, useState } from 'react';

/** What the step height reads of an element: its layout height and, for a step, the scrolling area around it. */
type Measured = { offsetHeight: number; closest: (selector: string) => unknown };

/** The scrolling area of the checkout pane around a step (`[data-novapay-scroll]`), if any. */
function scrollAreaOf(step: Measured): Measured | null {
  return (step.closest('[data-novapay-scroll]') as Measured | null) ?? null;
}

/** A height capped at the room of the scrolling area; the height itself without an area or room. */
function capped(height: number, area: Measured | null): number {
  const room = area?.offsetHeight;
  return room && room > 0 ? Math.min(height, room) : height;
}

/**
 * The height the wallet prompt takes for a step: the step's height, capped at the scrolling area of the checkout pane
 * around it (`[data-novapay-scroll]`), whose height is the room the sheet has on a phone. A step taller than that
 * scrolls in the area; the prompt fills it and no more, so no scrollbar comes back. Layout heights (`offsetHeight`),
 * never the box on screen, which a transform scales: the opening animation of the modal, a host's scaled preview.
 *
 * @param step - The step element.
 * @returns The height in px, or `null` while the step has no height (hidden).
 * @internal
 */
export function stepHeightOf(step: Measured): number | null {
  const height = step.offsetHeight;
  if (!(height > 0)) return null;
  return capped(height, scrollAreaOf(step));
}

/**
 * The height of a step that a wallet prompt stands for while it shows, for a checkout on a phone, where the sheet has
 * no fixed height and would take the height of the shorter prompt. While the step shows, its height (see
 * {@link stepHeightOf}) is measured and followed with a `ResizeObserver` of the step and the scrolling area; while the
 * prompt shows, the step is hidden and its last height is kept, capped again whenever the scrolling area changes (a
 * turned phone has less room). Without a prompt there is no height, so it is released when the prompt closes.
 *
 * Side effects: a `ResizeObserver` of the step and its scrolling area while the step shows, of the area while the
 * prompt shows.
 *
 * @param prompting - Whether the prompt shows, and the step is hidden.
 * @returns The callback ref of the step element, and the step's height in px while the prompt shows, else `null`.
 * @internal
 */
export function useStepHeight(prompting: boolean): [ref: (element: HTMLElement | null) => void, height: number | null] {
  const [step, setStep] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [room, setRoom] = useState<number | null>(null);

  useEffect(() => {
    if (!step) return;
    const area = scrollAreaOf(step);
    const measure = () => {
      if (!prompting) {
        const next = stepHeightOf(step);
        if (next !== null) setHeight(next);
      }
      const nextRoom = area?.offsetHeight;
      setRoom(nextRoom && nextRoom > 0 ? nextRoom : null);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    // Hidden, the step measures 0: while the prompt shows only the room of the area is followed
    if (!prompting) observer.observe(step);
    if (area) observer.observe(area as unknown as Element);
    return () => observer.disconnect();
  }, [step, prompting]);

  if (!prompting || height === null) return [setStep, null];
  return [setStep, room ? Math.min(height, room) : height];
}
