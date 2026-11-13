import { cn, MorphText } from '@tuwaio/nova-core';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { chip, chipTone } from './classes';
import { checkoutClassName } from './customization';
import { useContinued } from './statusMemory';

/** The state a {@link StatusChip} shows: a wait, a success, a failure, or a result that is neither. */
export type StatusChipTone = 'pending' | 'success' | 'error' | 'neutral';

/**
 * The chip over the heading of a status screen: one or two words for the state of the payment (Pending, Paid, Failed),
 * in the color of the strip along the top. Like the heading, it goes on from the chip of the status screen before it:
 * its color changes and its letters morph, so "Pending" turns into "Paid" on the same spot.
 *
 * @param props - The tone and the word.
 * @returns The chip.
 * @internal
 */
export function StatusChip({ tone, children: label }: { tone: StatusChipTone; children: string }) {
  const context = useCheckoutContext();
  const shownTone = useContinued('chipTone', tone);
  const shownLabel = useContinued('chipLabel', label);
  return (
    <span
      className={cn(
        chip,
        'novapay:transition-colors novapay:duration-300 novapay:motion-reduce:transition-none',
        chipTone[shownTone],
        checkoutClassName(context, 'statusChip', { tone }),
      )}
    >
      <MorphText>{shownLabel}</MorphText>
    </span>
  );
}
